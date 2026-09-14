#include <ceres/ceres.h>
#include <cassert>
#include <iomanip>
#include <iostream>
#include <vector>

#include "reconstruction.h"

namespace {
    /**
     * Helper to print a separator header for test sections.
     */
    void print_test_header(const std::string &title) {
        std::cout << "\n======================================================================\n";
        std::cout << " TEST: " << title << "\n";
        std::cout << "======================================================================\n";
    }

    /**
     * Test setup 1: Synthetic 3D points with ground truth camera parameters and NO directions.
     * Verifies that the Ceres optimization converges to near-zero reprojection error.
     */
    bool test_synthetic_points_no_directions() {
        print_test_header("Synthetic Scene (8 points, zero directions, ground truth)");

        constexpr double imageSize[2] = {1280.0, 960.0};

        // Ground truth camera intrinsics: fx=1200, fy=1200, cx=640, cy=480, k1=0
        constexpr double gt_intrinsics_arr[5] = {1200.0, 1200.0, 640.0, 480.0, 0.0};
        Intrinsics gt_intrinsics(gt_intrinsics_arr);

        // Ground truth camera extrinsics: looking at scene centered around origin
        // Angle-axis rotation and translation
        constexpr double gt_extrinsics_arr[6] = {0.15, -0.20, 0.05, 10.0, -15.0, 250.0};
        Extrinsics gt_extrinsics(gt_extrinsics_arr);

        std::cout << "Ground Truth Intrinsics: " << gt_intrinsics << "\n";
        std::cout << "Ground Truth Extrinsics: " << gt_extrinsics << "\n";
        std::cout << "Ground Truth Camera JSON: " << gt_extrinsics.to_camera_json() << "\n\n";

        // Define 8 non-coplanar 3D points in world space (corners of a 3D volume)
        const std::vector<std::array<double, 3> > world_points = {
            {-50.0, -40.0, -30.0},
            {50.0, -40.0, -30.0},
            {50.0, 40.0, -30.0},
            {-50.0, 40.0, -30.0},
            {-50.0, -40.0, 30.0},
            {50.0, -40.0, 30.0},
            {50.0, 40.0, 30.0},
            {-50.0, 40.0, 30.0}
        };

        // Generate 2D observations using ground truth projection (no directions)
        std::vector<Point5D> synthetic_points;
        synthetic_points.reserve(world_points.size());

        std::cout << "Generated Point Observations (3D -> 2D image coords):\n";
        for (size_t i = 0; i < world_points.size(); ++i) {
            const double pt3d[3] = {world_points[i][0], world_points[i][1], world_points[i][2]};
            double cam_pt[3];
            gt_extrinsics.imagePoint(pt3d, cam_pt);
            double img_pt[2];
            const bool in_front = gt_intrinsics.imagePoint(cam_pt, img_pt);
            assert(in_front && "Point must be in front of the ground truth camera");

            Point5D p5d{.X = pt3d[0], .Y = pt3d[1], .Z = pt3d[2], .u = img_pt[0], .v = img_pt[1]};
            synthetic_points.push_back(p5d);
            std::cout << "  Point " << i << ": 3D(" << pt3d[0] << ", " << pt3d[1] << ", " << pt3d[2]
                    << ") -> 2D(" << std::fixed << std::setprecision(3) << img_pt[0] << ", " << img_pt[1] << ")\n";
        }

        // Initial problem params with realistic prior settings
        ReconstructionProblem recProblem;
        InitialProblemParams initParams;
        initParams.imageSizeX = imageSize[0];
        initParams.imageSizeY = imageSize[1];
        initParams.initialFx = 1200.0;
        initParams.initialFy = 1200.0;
        initParams.initialCx = imageSize[0] / 2.0;
        initParams.initialCy = imageSize[1] / 2.0;
        initParams.initialK1 = 0.0;
        initParams.aspectRatioPriorScale = 1000.0;
        initParams.focalPriorScale = 0.01;
        initParams.principalPointCauchyRadius = 5.0;

        initParams.toReconstructionProblem(recProblem);

        // Initial perturbed extrinsics (~2-3 degrees and slight position shift)
        constexpr double init_extrinsics_arr[6] = {
            gt_extrinsics_arr[0] + 0.02,
            gt_extrinsics_arr[1] - 0.02,
            gt_extrinsics_arr[2] + 0.01,
            gt_extrinsics_arr[3] - 2.0,
            gt_extrinsics_arr[4] + 3.0,
            gt_extrinsics_arr[5] + 5.0
        };
        recProblem.extrinsics = Extrinsics(init_extrinsics_arr);

        std::vector<ConstraintRecord> allConstraints = recProblem.priorConstraints;
        std::vector<ConstraintRecord> pointConstraints;

        // Add point reprojection and positive depth constraints for each point (NO directions)
        constexpr double outlierThreshold = imageSize[0] / 100.0;
        for (const auto &pt: synthetic_points) {
            auto reprojRecord = ReprojectionError::add(
                recProblem.problem, recProblem.intrinsics, recProblem.extrinsics, pt, outlierThreshold);
            auto depthRecord = PositiveDepthConstraint::add(
                recProblem.problem, recProblem.intrinsics, recProblem.extrinsics, pt.get3d());

            allConstraints.push_back(reprojRecord);
            allConstraints.push_back(depthRecord);
            pointConstraints.push_back(reprojRecord);
        }

        // Configure solver options
        recProblem.options.linear_solver_type = ceres::DENSE_QR;
        recProblem.options.use_nonmonotonic_steps = true;
        recProblem.options.jacobi_scaling = true;
        recProblem.options.function_tolerance = 1e-12;
        recProblem.options.gradient_tolerance = 1e-14;
        recProblem.options.parameter_tolerance = 1e-12;
        recProblem.options.max_num_iterations = 100;
        recProblem.options.logging_type = ceres::SILENT;

        // Evaluate initial residuals before solve
        EvaluationMap preEvalMap = evaluate_residuals(allConstraints, recProblem.problem);
        std::cout << "\n--- Pre-Solve Residuals ---\n";
        for (const auto &c: allConstraints) {
            auto it = preEvalMap.find(c.blockId);
            if (it != preEvalMap.end()) {
                std::cout << "  " << c.label << " (" << c.parameters << ") -> Cost: " << it->second.costLoss << "\n";
            }
        }

        // Stage 1: Optimize extrinsics with fixed intrinsics
        recProblem.problem.SetParameterBlockConstant(recProblem.intrinsics.arr);
        ceres::Solve(recProblem.options, &recProblem.problem, &recProblem.summary);
        std::cout << "\nStage 1 (Extrinsics only) - Final Cost: " << recProblem.summary.final_cost
                << ", Iterations: " << recProblem.summary.iterations.size() << "\n";

        // Stage 2: Joint optimization of intrinsics and extrinsics
        recProblem.problem.SetParameterBlockVariable(recProblem.intrinsics.arr);
        ceres::Solve(recProblem.options, &recProblem.problem, &recProblem.summary);
        std::cout << "Stage 2 (Joint solve)     - Final Cost: " << recProblem.summary.final_cost
                << ", Iterations: " << recProblem.summary.iterations.size()
                << ", Termination: " << recProblem.summary.message << "\n";

        std::cout << "\nOptimized Intrinsics: " << recProblem.intrinsics << "\n";
        std::cout << "Optimized Extrinsics: " << recProblem.extrinsics << "\n";
        std::cout << "Optimized Camera: " << recProblem.extrinsics.to_camera_json() << "\n";

        // Evaluate residuals
        EvaluationMap evalMap = evaluate_residuals(allConstraints, recProblem.problem);
        std::cout << "\n--- Point Residuals Evaluation ---\n";
        log_points_residuals(evalMap, pointConstraints);

        // Verify solver converged and final cost is small
        const bool converged = (recProblem.summary.termination_type == ceres::CONVERGENCE);
        const bool low_cost = (recProblem.summary.final_cost < 1e-3);

        std::cout << "\nTest Result: " << (converged && low_cost ? "PASSED" : "FAILED")
                << " (Converged: " << (converged ? "true" : "false")
                << ", Final Cost: " << recProblem.summary.final_cost << ")\n";

        return converged && low_cost;
    }

    /**
     * Test setup 2: Benchmark point dataset with 5 correspondence points and NO directions.
     * Exercises initial state estimation, multi-stage Ceres optimization, and covariance analysis.
     */
    bool test_benchmark_points_no_directions() {
        print_test_header("Benchmark Dataset (5 points, zero directions)");

        constexpr double imageSize[2] = {8688.0, 5792.0};

        // 5 measured points from reconstruction dataset (X, Y, Z, u, v)
        const std::vector benchmark_points = {
            Point5D{.X = 0.0, .Y = 0.0, .Z = 0.0, .u = 2297.4199062700004, .v = 800.6862412343181},
            Point5D{.X = 389.0, .Y = 0.0, .Z = 0.0, .u = 5093.7669349934290, .v = 1630.4145506201153},
            Point5D{.X = 0.0, .Y = 416.0, .Z = 0.0, .u = 4834.2042755344420, .v = 158.14621272103457},
            Point5D{.X = 389.0, .Y = 416.0, .Z = 0.0, .u = 7507.7103785108720, .v = 673.9849274612603},
            Point5D{.X = 389.0, .Y = 0.0, .Z = -20.0, .u = 5091.1836268815550, .v = 1784.3797140878141}
        };

        std::cout << "Benchmark Points Setup (" << benchmark_points.size() << " points, 0 directions):\n";
        for (size_t i = 0; i < benchmark_points.size(); ++i) {
            std::cout << "  Point " << i << ": " << benchmark_points[i] << "\n";
        }

        // Compute initial state from points and image size
        auto [initParams, initExtrinsics] = compute_initial_state(benchmark_points, imageSize, 60.0);

        ReconstructionProblem recProblem;
        initParams.toReconstructionProblem(recProblem);
        recProblem.extrinsics = Extrinsics(initExtrinsics.data());

        std::cout << "\nInitial Intrinsics: " << recProblem.intrinsics << "\n";
        std::cout << "Initial Extrinsics: " << recProblem.extrinsics << "\n";

        std::vector<ConstraintRecord> allConstraints = recProblem.priorConstraints;
        std::vector<ConstraintRecord> pointConstraints;

        constexpr double outlierThreshold = imageSize[0] / 100.0;
        for (const auto &pt: benchmark_points) {
            auto reprojRecord = ReprojectionError::add(
                recProblem.problem, recProblem.intrinsics, recProblem.extrinsics, pt, outlierThreshold);
            auto depthRecord = PositiveDepthConstraint::add(
                recProblem.problem, recProblem.intrinsics, recProblem.extrinsics, pt.get3d());

            allConstraints.push_back(reprojRecord);
            allConstraints.push_back(depthRecord);
            pointConstraints.push_back(reprojRecord);
        }

        // Configure solver
        recProblem.options.linear_solver_type = ceres::DENSE_NORMAL_CHOLESKY;
        recProblem.options.use_nonmonotonic_steps = true;
        recProblem.options.jacobi_scaling = true;
        recProblem.options.function_tolerance = 1e-8;
        recProblem.options.gradient_tolerance = 1e-12;
        recProblem.options.parameter_tolerance = 1e-10;
        recProblem.options.max_num_iterations = 200;
        recProblem.options.logging_type = ceres::SILENT;

        // Stage 1: Solve extrinsics only
        recProblem.problem.SetParameterBlockConstant(recProblem.intrinsics.arr);
        ceres::Solve(recProblem.options, &recProblem.problem, &recProblem.summary);
        std::cout << "\nStage 1 (Extrinsics only) - Termination: " << recProblem.summary.message
                << ", Final Cost: " << recProblem.summary.final_cost << "\n";

        // Stage 2: Joint solve if Stage 1 converged
        if (recProblem.summary.termination_type == ceres::CONVERGENCE) {
            recProblem.problem.SetParameterBlockVariable(recProblem.intrinsics.arr);
            ceres::Solve(recProblem.options, &recProblem.problem, &recProblem.summary);
            std::cout << "Stage 2 (Joint solve)     - Termination: " << recProblem.summary.message
                    << ", Final Cost: " << recProblem.summary.final_cost << "\n";
        }

        std::cout << "\nFinal Intrinsics: " << recProblem.intrinsics << "\n";
        std::cout << "Final Extrinsics: " << recProblem.extrinsics << "\n";
        std::cout << "Final Camera: " << recProblem.extrinsics.to_camera_json() << "\n";

        // Residuals and covariance analysis
        EvaluationMap evalMap = evaluate_residuals(allConstraints, recProblem.problem);
        std::cout << "\n--- Residuals Summary ---\n";
        log_points_residuals(evalMap, pointConstraints);

        analyse_covariance(allConstraints, recProblem.intrinsics, recProblem.extrinsics, recProblem.problem, evalMap);

        const bool executed = (!recProblem.summary.iterations.empty());
        std::cout << "\nBenchmark Setup Execution: " << (executed ? "COMPLETED" : "FAILED") << "\n";
        return executed;
    }
} // namespace

int main() {
    std::cout << "======================================================================\n";
    std::cout << " RUNNING CERES RECONSTRUCTION TEST SUITE (POINTS ONLY, NO DIRECTIONS)\n";
    std::cout << "======================================================================\n";

    bool all_passed = true;

    all_passed &= test_synthetic_points_no_directions();
    all_passed &= test_benchmark_points_no_directions();

    std::cout << "\n======================================================================\n";
    if (all_passed) {
        std::cout << " ALL TESTS PASSED SUCCESSFULLY!\n";
    } else {
        std::cout << " SOME TESTS FAILED!\n";
    }
    std::cout << "======================================================================\n";

    return all_passed ? 0 : 1;
}
