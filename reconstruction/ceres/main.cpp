#pragma GCC diagnostic push
// eigen uses the deprecated std::result_of<>, silencing warning
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
#include <ceres/ceres.h>
#pragma GCC diagnostic pop
#include <ceres/rotation.h>
#include <vector>

#include "priors.h"
#include "types.h"

double norm(const double x, const double y) {
    return ceres::sqrt(x * x + y * y);
}

/** this convoluted system checks at compile-time the size of the intrinsics and the residuals */
template<size_t RES_SIZE, typename DERIVED>
struct CompleteConstraint {
    static constexpr size_t kResSize = RES_SIZE;
    using Created = std::pair<DERIVED *, ceres::LossFunction *>;

    template<typename T>
    bool operator()(const T intrinsics[Intrinsics<T>::kSize], const T extrinsics[Extrinsics<T>::kSize],
                    T residual[kResSize]) const {
        Intrinsics<T> i(intrinsics);
        Extrinsics<T> e(extrinsics);
        auto &residualArray = *reinterpret_cast<T (*)[kResSize]>(residual);
        return static_cast<const DERIVED *>(this)->template compute<T>(i, e, residualArray);
    }

    template<typename... ARGS>
    static ceres::ResidualBlockId add(ceres::Problem &problem, Intrinsics<double> &intrinsics,
                                      Extrinsics<double> &extrinsics, ARGS &&... args) {
        auto [constraint, loss] = DERIVED::Create(std::forward<ARGS>(args)...);
        return problem.AddResidualBlock(
            new ceres::AutoDiffCostFunction<DERIVED, kResSize, Intrinsics<double>::kSize, Extrinsics<
                double>::kSize>(constraint), loss, intrinsics.arr, extrinsics.arr);
    }
};

struct ReprojectionError : CompleteConstraint<2, ReprojectionError> {
    explicit ReprojectionError(const Point5D &p)
        : p_(p) {}

    template<typename T>
    bool compute(const Intrinsics<T> &intrinsics, const Extrinsics<T> &extrinsics, T (&residuals)[kResSize]) const {
        T p[3];
        T point3d[] = {T(p_.X), T(p_.Y), T(p_.Z)};
        extrinsics.imagePoint(point3d, p);
        T imaged[2];
        const bool nonInverting = intrinsics.imagePoint(p, imaged);
        if (!nonInverting) return false;
        residuals[0] = imaged[0] - T(p_.u);
        residuals[1] = imaged[1] - T(p_.v);
        return true;
    }

    static Created Create(const Point5D &p, const double huberLoss) {
        return {new ReprojectionError(p), new ceres::HuberLoss(huberLoss)};
    }

    Point5D p_;
};

/** Ensure points are in front of the camera */
struct PositiveDepthConstraint : CompleteConstraint<1, PositiveDepthConstraint> {
    explicit PositiveDepthConstraint(const std::array<double, 3> &X) : X_{X[0], X[1], X[2]} {}

    template<typename T>
    bool compute(const Intrinsics<T> &_intrinsics, const Extrinsics<T> &extrinsics, T (&residuals)[kResSize]) const {
        T p[3] = {T(X_[0]), T(X_[1]), T(X_[2])};
        T imaged[3];
        extrinsics.imagePoint(p, imaged);
        residuals[0] = ceres::fmax(T(0), -imaged[2]);
        return true;
    }

    static Created Create(const std::array<double, 3> &point3d) {
        return {new PositiveDepthConstraint(point3d), new ceres::ScaledLoss(nullptr, 1e-1, ceres::TAKE_OWNERSHIP)};
    }

    double X_[3];
};

struct DirectionConstraint : CompleteConstraint<1, DirectionConstraint> {
    explicit DirectionConstraint(double x1, double y1,
                                 double x2, double y2,
                                 const std::array<double, 3> &d_world)
        : d_world_(d_world) {
        // 2D line in homogeneous coordinates: l = (x1, y1, 1) x (x2, y2, 1)
        // This vector is the normal to the plane in camera space
        A_ = y1 - y2;
        B_ = x2 - x1;
        C_ = x1 * y2 - x2 * y1;
    }

    template<typename T>
    bool compute(const Intrinsics<T> &intrinsics, const Extrinsics<T> &extrinsics, T (&residual)[kResSize]) const {
        T d_cam[3];
        T d_world[3] = {T(d_world_[0]), T(d_world_[1]), T(d_world_[2])};
        extrinsics.imageVector(d_world, d_cam);

        // Plane normal in camera space: n = K^T * l
        T nx = T(A_) * intrinsics.fx();
        T ny = T(B_) * intrinsics.fy();
        T nz = T(A_) * intrinsics.cx() + T(B_) * intrinsics.cy() + T(C_);
        T n_norm = ceres::sqrt(nx * nx + ny * ny + nz * nz);
        // The sine of the angle between d_cam and the plane
        T sin_theta = (nx * d_cam[0] + ny * d_cam[1] + nz * d_cam[2]) / n_norm;
        // Convert to pixel error
        residual[0] = sin_theta * intrinsics.fx();
        return true;
    }

    static Created Create(const std::array<double, 4> &observation, const std::array<double, 3> &d_world,
                          const double weight) {
        return {
            new DirectionConstraint(observation[0], observation[1], observation[2], observation[3], d_world),
            new ceres::ScaledLoss(new ceres::TukeyLoss(10.0), weight, ceres::TAKE_OWNERSHIP)
        };
    }

    double A_, B_, C_;
    const std::array<double, 3> d_world_;
};

void compute_initial_state(const double *points_array, const double imageSize[2],
                           Intrinsics<double> &intrinsics, Extrinsics<double> &extrinsics,
                           const double target_fov_deg = 60.0) {
    const int count = points_array[0]; // NOLINT(*-narrowing-conversions)
    const double *data = points_array + 1;

    // 1. Calculate Centroid of the point cloud
    double cx = 0, cy = 0, cz = 0;
    for (int i = 0; i < count; ++i) {
        cx += data[i * 5 + 0];
        cy += data[i * 5 + 1];
        cz += data[i * 5 + 2];
    }
    cx /= count;
    cy /= count;
    cz /= count;

    // 2. Calculate "Radius" (max distance from centroid to any point)
    double max_r_sq = 0;
    for (int i = 0; i < count; ++i) {
        const double dx = data[i * 5 + 0] - cx;
        const double dy = data[i * 5 + 1] - cy;
        const double dz = data[i * 5 + 2] - cz;
        max_r_sq = std::max(max_r_sq, dx * dx + dy * dy + dz * dz);
    }
    const double radius = std::sqrt(max_r_sq);

    // 3. Calculate Focal Length for a 60-degree FOV webcam
    const double fov_rad = target_fov_deg * (M_PI / 180.0);
    const double f = (imageSize[0] / 2.0) / std::tan(fov_rad / 2.0);

    // 4. Calculate Distance (Z) so the radius spans the FOV
    // Adding a small buffer (1.2x) so it's not touching the very edges
    const double distance = (radius * 1.2) / std::tan(fov_rad / 2.0);

    // We set translation to move the centroid to (0, 0, distance) in camera space
    // T = Camera_Point - R * World_Point
    const double centroid[3] = {cx, cy, cz};
    double rotated_centroid[3];
    extrinsics.imageVector(centroid, rotated_centroid);
    extrinsics.tx(-rotated_centroid[0]);
    extrinsics.ty(-rotated_centroid[1]);
    extrinsics.tz(distance - rotated_centroid[2]);
    intrinsics.fx(f);
    intrinsics.fy(f);
}

template<typename T, size_t LEN>
std::ostream &operator<<(std::ostream &lhs, const std::array<T, LEN> &rhs) {
    lhs << "[";
    for (auto it = rhs.cbegin(); it != rhs.cend(); ++it) {
        lhs << *it;
        if (std::next(it) != rhs.cend()) lhs << ", ";
    }
    lhs << "]";;
    return lhs;
}

extern "C" {
/**
 *
 * @param imageSize
 * @param points array of array[5] of doubles
 * @param directions
 */
void solve_camera(const double imageSize[2], const double *points = nullptr,
                  double *directions = nullptr) {
    struct PointResidualRecord {
        int index;
        Point5D point;
        ceres::ResidualBlockId blockId;
    };
    struct DirectionResidualRecord {
        int directionIndex;
        int observationIndex;
        ceres::ResidualBlockId blockId;
    };

    std::vector<PointResidualRecord> pointResiduals;
    std::vector<DirectionResidualRecord> directionResiduals;

    double init[] = {imageSize[0], imageSize[0], imageSize[0] / 2.0, imageSize[1] / 2.0, 0.0};
    Intrinsics intrinsics(init);
    double exInit[] = {1.047, 0.01, 0.01, -200.0, 200.0, 4500};
    Extrinsics<double> extrinsics{exInit};

    const double pointReprojectionOutlierThreshold = imageSize[0] / 100.0;
    // A radius of 0.005 * focal_length corresponds to roughly 0.3 degrees of tilt
    double principalPointCauchyRadius = intrinsics.fx() * 0.05;
    if (points) {
        compute_initial_state(points, imageSize, intrinsics, extrinsics, 60.0);
    }
    std::cout << "imageSize: "
            << imageSize[0] << " "
            << imageSize[1] << "\n";

    std::cout << "initial Extrinsics " << extrinsics << "\n";
    std::cout << "initial Intrinsics " << intrinsics << "\n";
    std::cout << "Huber Loss Threshold for points: " << pointReprojectionOutlierThreshold << "px\n";
    std::cout << "Cauchy Radius for principal point prior : " << principalPointCauchyRadius << "px\n";
    ceres::Problem problem;
    if (points) {
        const double pointCount = points[0];
        std::cout << "pointCount: " << pointCount << "\n";
        std::cout << "points: " << points << "\n";
        const double *data = points + 1;
        for (int i = 0; i < pointCount; ++i) {
            Point5D p = Point5D::fromArray(data + i * 5);
            std::cout << "point" << i << ": " << p << "\n";
            const auto blockId = ReprojectionError::add(problem, intrinsics, extrinsics, p,
                                                        pointReprojectionOutlierThreshold);
            pointResiduals.push_back({i, p, blockId});
            PositiveDepthConstraint::add(problem, intrinsics, extrinsics, p.get3d());
        }
    }
    if (directions) {
        const double directionsCount = directions[0];
        std::cout << "directionsCount: " << directionsCount << "\n";
        double *currentDir = directions + 1;
        for (int i = 0; i < directionsCount; ++i) {
            std::array<double, 3> currentDirArray = {currentDir[0], currentDir[1], currentDir[2]};
            std::cout << "direction" << i << ": " << currentDirArray << "\n";
            const double observationCount = currentDir[3];
            std::cout << "    observationCount: " << observationCount << "\n";
            double *currentObs = currentDir + 4;
            for (int j = 0; j < observationCount; ++j) {
                std::array<double, 4> currentObsArray = {currentObs[0], currentObs[1], currentObs[2], currentObs[3]};
                // Calculate pixel length of the observed segment
                const double length = norm(currentObsArray[2] - currentObsArray[0],
                                           currentObsArray[3] - currentObsArray[1]);
                const double weight = length / 100.0;
                std::cout << "    observation: " << currentObsArray << "\n";
                std::cout << "    length: " << length << " weight: " << weight << "\n";
                const auto blockId = DirectionConstraint::add(problem, intrinsics, extrinsics, currentObsArray,
                                                              currentDirArray, weight);
                directionResiduals.push_back({i, j, blockId});
                currentObs += 4;
            }
            currentDir = currentObs;
        }
    }


    problem.SetParameterLowerBound(intrinsics.arr, 2, 0.0);
    problem.SetParameterUpperBound(intrinsics.arr, 2, imageSize[0]);
    problem.SetParameterLowerBound(intrinsics.arr, 3, 0.0);
    problem.SetParameterUpperBound(intrinsics.arr, 3, imageSize[1]);

    AspectRatioPrior::add(problem, intrinsics, 10.0);
    FocalPrior::add(problem, intrinsics, intrinsics.fx(), 10.0);
    PrincipalPointPrior::add(problem, intrinsics, imageSize[0] / 2.0, imageSize[1] / 2.0, principalPointCauchyRadius);
    DistortionPrior::add(problem, intrinsics);

    ceres::Solver::Options options;
    options.linear_solver_type = ceres::DENSE_QR;
    options.minimizer_progress_to_stdout = true;
    options.logging_type = ceres::SILENT;
    options.max_num_iterations = 2000;

    ceres::Solver::Summary summary;
    std::cout << "Intrinsics right before solve: " << intrinsics << "\n";

    // Stage 1: Optimize Extrinsics only
    problem.SetParameterBlockConstant(intrinsics.arr);
    ceres::Solve(options, &problem, &summary);
    std::cout << "Stage 1 Solver Summary:\n" << summary.FullReport() << "\n";

    // Stage 2: Optimize Intrinsics and Extrinsics together
    problem.SetParameterBlockVariable(intrinsics.arr);
    ceres::Solve(options, &problem, &summary);
    std::cout << "Stage 2 Solver Summary:\n" << summary.FullReport() << "\n";

    std::cout << "Intrinsics: " << intrinsics << "\n";
    std::cout << "Extrinsics: " << extrinsics << "\n";
    std::cout << "--- Post-Solve Residual Analysis ---\n";

    // 1. Check Reprojection Residuals (Points)
    if (!pointResiduals.empty()) {
        for (const auto &record: pointResiduals) {
            double costLoss = 0.0;
            double costNonLoss = 0.0;
            double residualsLoss[2];
            double residualsNoLoss[2];
            problem.EvaluateResidualBlock(record.blockId, true, &costLoss, residualsLoss, nullptr);
            problem.EvaluateResidualBlock(record.blockId, false, &costNonLoss, residualsNoLoss, nullptr);
            const double pixelErrorLoss = norm(residualsLoss[0], residualsLoss[1]);
            const double pixelErrorNoLoss = norm(residualsNoLoss[0], residualsNoLoss[1]);
            std::cout << "Point " << record.index << " Input: " << record.point << "\n";
            std::cout << "    Lossy Residual (px): " << pixelErrorLoss << " [du: " << residualsLoss[0] << ", dv: " <<
                    residualsLoss[1] << "] Cost: " << costLoss << "\n";
            std::cout << "    Non Lossy Residual (px): " << pixelErrorNoLoss << " [du: " << residualsNoLoss[0] <<
                    ", dv: " << residualsNoLoss[1] << "] Cost: " << costNonLoss << "\n";
        }
    }

    // 2. Check Direction Residuals
    if (!directionResiduals.empty()) {
        for (const auto &record: directionResiduals) {
            double costLoss = 0.0;
            double costNonLoss = 0.0;
            double residualsLoss[1];
            double residualsNoLoss[1];
            problem.EvaluateResidualBlock(record.blockId, true, &costLoss, residualsLoss, nullptr);
            problem.EvaluateResidualBlock(record.blockId, false, &costNonLoss, residualsNoLoss, nullptr);
            std::cout << "Direction " << record.directionIndex << " Obs " << record.observationIndex << "\n";
            std::cout << "    Lossy Residual (distance to VP): " << residualsLoss[0] << " Cost: " << costLoss << "\n";
            std::cout << "    Non Lossy Residual (distance to VP): " << residualsNoLoss[0] << " Cost: " << costNonLoss
                    << "\n";
        }
    }
    const double move_dist = std::sqrt(std::pow(intrinsics.cx() - (imageSize[0] / 2.0), 2) +
                                       std::pow(intrinsics.cy() - (imageSize[1] / 2.0), 2));
    if (move_dist > (imageSize[0] * 0.05)) {
        std::cout << "WARNING: Significant Principal Point shift detected (" << move_dist
                << "px). Image may be cropped or sensor is misaligned.\n";
    }
    // ReSharper disable CppDFAMemoryLeak
}
}
