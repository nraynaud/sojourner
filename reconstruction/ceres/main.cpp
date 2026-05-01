#pragma GCC diagnostic push
// eigen uses the deprecated std::result_of<>, silencing warning
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
#include <ceres/ceres.h>
#include <ceres/covariance.h>
#include <ceres/rotation.h>
#pragma GCC diagnostic pop
#include <limits>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "priors.h"
#include "types.h"

using namespace ceres;
using std::cout;
using std::vector;
using std::string;

constexpr size_t kiSize = Intrinsics<double>::kSize;
constexpr size_t keSize = Extrinsics<double>::kSize;

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

/** this convoluted system checks at compile-time the size of the intrinsics and the residuals */
template<size_t RES_SIZE, typename DERIVED>
struct CompleteConstraint {
    static constexpr size_t kResSize = RES_SIZE;
    using Created = std::tuple<DERIVED &, LossFunction *, string>;

    struct TheFunctor {
        explicit TheFunctor(DERIVED computer) : computer(std::move(computer)) {}

        template<typename T>
        bool operator()(const T intrinsics[Intrinsics<T>::kSize], const T extrinsics[Extrinsics<T>::kSize],
                        T residual[kResSize]) const {
            Intrinsics<T> i(intrinsics);
            Extrinsics<T> e(extrinsics);
            auto &residualArray = *reinterpret_cast<T (*)[kResSize]>(residual);
            return computer.template compute<T>(i, e, residualArray);
        }

        const DERIVED computer;
    };

    template<typename... ARGS>
    static ConstraintRecord add(Problem &problem, Intrinsics<double> &intrinsics,
                                Extrinsics<double> &extrinsics, ARGS &&... args) {
        auto [constraint, loss, paramStr] = DERIVED::Create(std::forward<ARGS>(args)...);
        auto *functor = new TheFunctor(constraint);
        const auto blockId = problem.AddResidualBlock(
            new AutoDiffCostFunction<TheFunctor, kResSize, kiSize, Extrinsics<
                double>::kSize>(functor), loss, intrinsics.arr, extrinsics.arr);
        return ConstraintRecord{DERIVED::kDescription, paramStr, blockId, 0, 1};
    }
};

struct ReprojectionError : CompleteConstraint<2, ReprojectionError> {
    static constexpr const char *kDescription = "Reprojection";

    explicit ReprojectionError(const Point5D &p) : p_(p) {}

    template<typename T>
    bool compute(const Intrinsics<T> &intrinsics, const Extrinsics<T> &extrinsics, T (&residuals)[kResSize]) const {
        T p[3];
        T point3d[] = {T(p_.X), T(p_.Y), T(p_.Z)};
        extrinsics.imagePoint(point3d, p);
        T imaged[2];
        const bool notTooClose = intrinsics.imagePoint(p, imaged);
        if (!notTooClose) return false;
        residuals[0] = imaged[0] - T(p_.u);
        residuals[1] = imaged[1] - T(p_.v);
        return true;
    }

    static Created Create(const Point5D &p, const double huberLoss) {
        std::ostringstream label;
        label << " Point " << p << ", huber=" << huberLoss;
        ReprojectionError reprojection_error(p);
        return {reprojection_error, new HuberLoss(huberLoss), label.str()};
    }

    Point5D p_;
};

/** Ensure points are in front of the camera */
struct PositiveDepthConstraint : CompleteConstraint<1, PositiveDepthConstraint> {
    static constexpr const char *kDescription = "PositiveDepth point";

    explicit PositiveDepthConstraint(const std::array<double, 3> &X) : X_{X[0], X[1], X[2]} {}

    template<typename T>
    bool compute([[maybe_unused]] const Intrinsics<T> &_intrinsics, const Extrinsics<T> &extrinsics,
                 T (&residuals)[kResSize]) const {
        T p[3] = {T(X_[0]), T(X_[1]), T(X_[2])};
        T imaged[3];
        extrinsics.imagePoint(p, imaged);
        residuals[0] = ceres::fmax(T(0), -imaged[2]);
        return true;
    }

    static Created Create(const std::array<double, 3> &point3d) {
        double scale = 1e-1;
        std::ostringstream label;
        label << " Point " << point3d << ", scale=" << scale;
        PositiveDepthConstraint positive_depth_constraint(point3d);
        return {positive_depth_constraint, new ScaledLoss(nullptr, scale, TAKE_OWNERSHIP), label.str()};
    }

    std::array<double, 3> X_;
};

struct DirectionConstraint : CompleteConstraint<1, DirectionConstraint> {
    static constexpr const char *kDescription = "Direction";

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
        T n_norm = ceres::hypot(nx, ny, nz);
        // The sine of the angle between d_cam and the plane
        T sin_theta = (nx * d_cam[0] + ny * d_cam[1] + nz * d_cam[2]) / n_norm;
        // Convert to pixel error
        residual[0] = sin_theta * intrinsics.fx();
        return true;
    }

    static Created Create(const std::array<double, 4> &obs, const std::array<double, 3> &d_world,
                          const double weight, const double threshold) {
        std::ostringstream label;
        label << " World Direction " << d_world << ", scale=" << weight << ", TukeyLoss=" << threshold;
        DirectionConstraint constraint(obs[0], obs[1], obs[2], obs[3], d_world);
        return {constraint, new ScaledLoss(new TukeyLoss(threshold), weight, TAKE_OWNERSHIP), label.str()};
    }

    double A_, B_, C_;
    const std::array<double, 3> d_world_;
};

using EvaluationMap = std::unordered_map<ResidualBlockId, ResidualEvaluationRecord>;

EvaluationMap evaluate_residuals(const vector<ConstraintRecord> &allConstraints, const Problem &problem) {
    EvaluationMap residualEvaluationMap;
    residualEvaluationMap.reserve(allConstraints.size());
    for (const auto &constraint: allConstraints) {
        const auto *costFunction = problem.GetCostFunctionForResidualBlock(constraint.blockId);
        if (costFunction == nullptr) {
            continue;
        }
        const int residualSize = costFunction->num_residuals();
        if (residualSize <= 0) {
            continue;
        }
        ResidualEvaluationRecord record{
            .blockId = constraint.blockId,
            .constraint = &constraint,
            .residualSize = residualSize,
            .residualsLoss = vector<double>(residualSize, 0.0),
            .residualsNonLoss = vector<double>(residualSize, 0.0)
        };

        const auto &parameterBlockSizes = costFunction->parameter_block_sizes();
        const int blockSize = static_cast<int>(parameterBlockSizes.size());
        vector<double *> jacobians(blockSize, nullptr);
        if (constraint.intrinsicsBlockIndex >= 0 &&
            constraint.intrinsicsBlockIndex < blockSize &&
            parameterBlockSizes[constraint.intrinsicsBlockIndex] == kiSize) {
            record.hasIntrinsicsJacobian = true;
            record.intrinsicsJacobian.resize(residualSize * kiSize, 0.0);
            jacobians[constraint.intrinsicsBlockIndex] = record.intrinsicsJacobian.data();
        }
        if (constraint.extrinsicsBlockIndex >= 0 &&
            constraint.extrinsicsBlockIndex < blockSize &&
            parameterBlockSizes[constraint.extrinsicsBlockIndex] == keSize) {
            record.hasExtrinsicsJacobian = true;
            record.extrinsicsJacobian.resize(residualSize * keSize, 0.0);
            jacobians[constraint.extrinsicsBlockIndex] = record.extrinsicsJacobian.data();
        }
        if (record.hasIntrinsicsJacobian || record.hasExtrinsicsJacobian) {
            problem.EvaluateResidualBlock(record.blockId, false, &record.costNonLoss, record.residualsNonLoss.data(),
                                          jacobians.data());
        }
        problem.EvaluateResidualBlock(record.blockId, true, &record.costLoss, record.residualsLoss.data(), nullptr);
        residualEvaluationMap.emplace(record.blockId, std::move(record));
    }
    return residualEvaluationMap;
}

void log_points_residuals(const EvaluationMap &residualMap, const vector<ConstraintRecord> &pointResiduals) {
    for (const auto &record: pointResiduals) {
        const auto residualIt = residualMap.find(record.blockId);
        if (residualIt == residualMap.end() || residualIt->second.residualSize < 2) {
            continue;
        }
        const auto &data = residualIt->second;
        cout << record.label << "\n";
        cout << "    Params: " << record.parameters << "\n";
        cout << "    Lossy Residual (px): " << std::sqrt(data.costLoss * 2) << " [du: " << data.residualsLoss[0] <<
                ", dv: " << data.residualsLoss[1] << "] Cost: " << data.costLoss << "\n";
    }
}

void log_directions_residuals(const EvaluationMap &residualMap, const vector<ConstraintRecord> &directionResiduals) {
    for (const auto &record: directionResiduals) {
        const auto residualIt = residualMap.find(record.blockId);
        if (residualIt == residualMap.end() || residualIt->second.residualSize < 1) {
            continue;
        }
        const auto &data = residualIt->second;
        cout << record.label << "\n";
        cout << "    Params: " << record.parameters << "\n";
        cout << "    Lossy Residual (distance to VP): " << data.residualsLoss[0]
                << " Cost: " << data.costLoss << "\n";
        cout << "    Non Lossy Residual (distance to VP): " << data.residualsNonLoss[0]
                << " Cost: " << data.costNonLoss << "\n";
    }
}

extern "C" {
/**
 *
 * @param imageSize
 * @param initial_intrinsics
 * @param initial_extrinsics
 * @param points array of array[5] of doubles
 * @param directions
 */
void solve_camera(const double (&imageSize)[2], const double initial_intrinsics[5], const double initial_extrinsics[6],
                  const double *points = nullptr,
                  double *directions = nullptr) {
    vector<ConstraintRecord> pointResiduals;
    vector<ConstraintRecord> directionResiduals;
    vector<ConstraintRecord> allConstraints;
    Intrinsics intrinsics(initial_intrinsics);
    Extrinsics extrinsics{initial_extrinsics};
    const double pointReprojectionOutlierThreshold = imageSize[0] / 100.0;
    // A radius of 0.005 * focal_length corresponds to roughly 0.3 degrees of tilt
    double principalPointCauchyRadius = intrinsics.fx() * 0.05;
    cout << "imageSize: " << imageSize[0] << " " << imageSize[1] << "\n";
    cout << "initial Extrinsics " << extrinsics << "\n";
    cout << "initial Intrinsics " << intrinsics << "\n";
    cout << "Huber Loss Threshold for points: " << pointReprojectionOutlierThreshold << "px\n";
    cout << "Cauchy Radius for principal point prior : " << principalPointCauchyRadius << "px\n";
    Problem problem;
    if (points) {
        const double pointCount = points[0];
        cout << "pointCount: " << pointCount << "\n";
        const double *data = points + 1;
        for (int i = 0; i < pointCount; ++i) {
            Point5D p = Point5D::fromArray(data + i * 5);
            cout << "- point" << i << ": " << p << "\n";
            auto pointRecord = ReprojectionError::add(problem, intrinsics, extrinsics, p,
                                                      pointReprojectionOutlierThreshold);
            pointResiduals.push_back(pointRecord);
            allConstraints.push_back(pointRecord);
            allConstraints.push_back(PositiveDepthConstraint::add(problem, intrinsics, extrinsics, p.get3d()));
        }
    }
    if (directions) {
        const double directionsCount = directions[0];
        cout << "directionsCount: " << directionsCount << "\n";
        double *currentDir = directions + 1;
        for (int i = 0; i < directionsCount; ++i) {
            std::array<double, 3> currentDirArray = {currentDir[0], currentDir[1], currentDir[2]};
            cout << "direction" << i << ": " << currentDirArray << "\n";
            const double observationCount = currentDir[3];
            cout << "    observationCount: " << observationCount << "\n";
            double *currentObs = currentDir + 4;
            for (int j = 0; j < observationCount; ++j) {
                std::array<double, 4> currentObsArray = {currentObs[0], currentObs[1], currentObs[2], currentObs[3]};
                // Calculate pixel length of the observed segment
                const double length = std::hypot(currentObsArray[2] - currentObsArray[0],
                                                 currentObsArray[3] - currentObsArray[1]);
                const double weight = std::sqrt(length / 1000.0);
                cout << "    observation: " << currentObsArray << " length: " << length << " weight: " << weight <<
                        "\n";
                auto directionRecord = DirectionConstraint::add(problem, intrinsics, extrinsics, currentObsArray,
                                                                currentDirArray, weight,
                                                                pointReprojectionOutlierThreshold);
                directionResiduals.push_back(directionRecord);
                allConstraints.push_back(directionRecord);
                currentObs += 4;
            }
            currentDir = currentObs;
        }
    }

    intrinsics.registerLimits(problem, imageSize);
    allConstraints.push_back(AspectRatioPrior::add(problem, intrinsics, 10.0));
    allConstraints.push_back(FocalPrior::add(problem, intrinsics, intrinsics.fx(), 10.0));
    allConstraints.push_back(PrincipalPointPrior::add(problem, intrinsics, imageSize[0] / 2.0, imageSize[1] / 2.0,
                                                      principalPointCauchyRadius));
    allConstraints.push_back(DistortionPrior::add(problem, intrinsics));

    Solver::Options options;
    options.linear_solver_type = DENSE_NORMAL_CHOLESKY;
    options.use_nonmonotonic_steps = true;
    options.jacobi_scaling = true;
    options.function_tolerance = 1e-8;
    options.gradient_tolerance = 1e-12;
    options.parameter_tolerance = 1e-10;
    options.max_num_iterations = 200;

    options.minimizer_progress_to_stdout = true;
    options.logging_type = SILENT;

    Solver::Summary summary;
    cout << "Intrinsics right before solve: " << intrinsics << "\n";

    // Stage 1: Optimize Extrinsics only
    problem.SetParameterBlockConstant(intrinsics.arr);
    Solve(options, &problem, &summary);
    cout << "Stage 1 Solver Summary:\n" << summary.FullReport() << "\n";

    // Stage 2: Optimize Intrinsics and Extrinsics together
    problem.SetParameterBlockVariable(intrinsics.arr);
    Solve(options, &problem, &summary);
    cout << "Stage 2 Solver Summary:\n" << summary.FullReport() << "\n";

    cout << "Intrinsics: " << intrinsics << "\n";
    cout << "Extrinsics: " << extrinsics << "\n";
    const double move_dist = std::hypot(intrinsics.cx() - imageSize[0] / 2.0, intrinsics.cy() - imageSize[1] / 2.0);
    if (move_dist > imageSize[0] * 0.05) {
        cout << "WARNING: Significant Principal Point shift detected (" << move_dist
                << "px). Image may be cropped or sensor is misaligned.\n";
    }

    cout << "--- Post-Solve Residual Analysis ---\n";

    EvaluationMap residualEvaluationMap = evaluate_residuals(allConstraints, problem);
    log_points_residuals(residualEvaluationMap, pointResiduals);
    log_directions_residuals(residualEvaluationMap, directionResiduals);

    Covariance::Options covarianceOptions;
    covarianceOptions.algorithm_type = DENSE_SVD;
    covarianceOptions.apply_loss_function = false;
    Covariance covariance(covarianceOptions);
    const vector<std::pair<const double *, const double *> > covarianceBlocks = {
        {intrinsics.arr, intrinsics.arr},
        {extrinsics.arr, extrinsics.arr},
        {intrinsics.arr, extrinsics.arr}
    };
    if (!covariance.Compute(covarianceBlocks, &problem)) {
        cout << "WARNING: Covariance computation failed for solved parameters.\n";
    } else {
        cout << "--- Covariance Interpretation ---\n";

        const auto printCovarianceInterpretation = [&covariance](
            const double *params, const int size, const auto &names, const char *title) {
            vector<double> cov(size * size);
            covariance.GetCovarianceBlock(params, params, cov.data());
            cout << title << "\n";

            for (int i = 0; i < size; ++i) {
                const double variance = cov[i * size + i];
                if (variance < 0.0) {
                    cout << "    " << names[i] << ": variance=" << variance
                            << " (invalid negative variance)\n";
                    continue;
                }
                const double sigma = std::sqrt(variance);
                cout << "    " << names[i] << ", sigma=" << sigma << "\n";
            }

            cout << "    Strong parameter correlations (|rho| > 0.8):\n";
            bool foundStrongCorrelation = false;
            for (int i = 0; i < size; ++i) {
                for (int j = i + 1; j < size; ++j) {
                    const double varI = cov[i * size + i];
                    const double varJ = cov[j * size + j];
                    if (varI <= 0.0 || varJ <= 0.0) continue;
                    const double rho = cov[i * size + j] / std::sqrt(varI * varJ);
                    if (std::abs(rho) > 0.8) {
                        foundStrongCorrelation = true;
                        cout << "      " << names[i] << " <-> " << names[j] << ": rho=" << rho << "\n";
                    }
                }
            }
            if (!foundStrongCorrelation) {
                cout << "      none\n";
            }
        };

        auto intNames = Intrinsics<double>::kNames;
        auto extNames = Extrinsics<double>::kNames;
        printCovarianceInterpretation(intrinsics.arr, kiSize, intNames, "  Intrinsics covariance:");
        printCovarianceInterpretation(extrinsics.arr, keSize, extNames, "  Extrinsics covariance:");
        vector<double> intrinsicsCov(kiSize * kiSize);
        vector<double> extrinsicsCov(keSize * keSize);
        vector<double> crossCov(kiSize * keSize);
        covariance.GetCovarianceBlock(intrinsics.arr, intrinsics.arr, intrinsicsCov.data());
        covariance.GetCovarianceBlock(extrinsics.arr, extrinsics.arr, extrinsicsCov.data());
        covariance.GetCovarianceBlock(intrinsics.arr, extrinsics.arr, crossCov.data());
        cout << "  Intrinsics vs Extrinsics covariance:\n";
        cout << "    Strong cross-correlations (|rho| > 0.8):\n";
        bool foundStrongCrossCorrelation = false;
        for (int i = 0; i < kiSize; ++i) {
            for (int j = 0; j < keSize; ++j) {
                const double varI = intrinsicsCov[i * kiSize + i];
                const double varJ = extrinsicsCov[j * keSize + j];
                if (varI <= 0.0 || varJ <= 0.0) continue;
                const double covIJ = crossCov[i * keSize + j];
                const double rho = covIJ / std::sqrt(varI * varJ);
                if (std::abs(rho) > 0.8) {
                    foundStrongCrossCorrelation = true;
                    cout << "      " << intNames[i] << " <-> " << extNames[j]
                            << ": rho=" << rho << "\n";
                }
            }
        }
        if (!foundStrongCrossCorrelation) {
            cout << "      none\n";
        }
        vector<string> parameterNames;
        parameterNames.insert(parameterNames.end(), intNames.begin(), intNames.end());
        parameterNames.insert(parameterNames.end(), extNames.begin(), extNames.end());
        struct CouplingAttribution {
            string pairName;
            string strongestLinkConstraint;
            string strongestSeparationConstraint;
            double strongestLinkValue = -std::numeric_limits<double>::infinity();
            double strongestSeparationValue = std::numeric_limits<double>::infinity();
        };
        cout << "  Jacobian-based coupling attribution:\n";
        cout << "    (link=max positive sum(J_i*J_j), separation=min sum(J_i*J_j))\n";
        bool foundCoupledPairs = false;
        for (size_t i = 0; i < parameterNames.size(); ++i) {
            for (size_t j = i + 1; j < parameterNames.size(); ++j) {
                double rho = 0.0;
                if (i < kiSize && j < kiSize) {
                    const double varI = intrinsicsCov[i * kiSize + i];
                    const double varJ = intrinsicsCov[j * kiSize + j];
                    if (varI <= 0.0 || varJ <= 0.0) continue;
                    rho = intrinsicsCov[i * kiSize + j] / std::sqrt(varI * varJ);
                } else if (i >= kiSize && j >= kiSize) {
                    const size_t ei = i - kiSize;
                    const size_t ej = j - kiSize;
                    const double varI = extrinsicsCov[ei * keSize + ei];
                    const double varJ = extrinsicsCov[ej * keSize + ej];
                    if (varI <= 0.0 || varJ <= 0.0) continue;
                    rho = extrinsicsCov[ei * keSize + ej] / std::sqrt(varI * varJ);
                } else {
                    const size_t ii = i;
                    const size_t ej = j - kiSize;
                    const double varI = intrinsicsCov[ii * kiSize + ii];
                    const double varJ = extrinsicsCov[ej * keSize + ej];
                    if (varI <= 0.0 || varJ <= 0.0) continue;
                    rho = crossCov[ii * keSize + ej] / std::sqrt(varI * varJ);
                }
                if (std::abs(rho) <= 0.8) continue;
                foundCoupledPairs = true;

                CouplingAttribution attribution;
                attribution.pairName = parameterNames[i] + " <-> " + parameterNames[j];
                for (const auto &constraint: allConstraints) {
                    const auto residualIt = residualEvaluationMap.find(constraint.blockId);
                    if (residualIt == residualEvaluationMap.end() || residualIt->second.residualSize <= 0) {
                        continue;
                    }
                    const auto &residualRecord = residualIt->second;
                    auto parameterJacobianAt = [&](const size_t parameterIndex, const size_t row) {
                        if (parameterIndex < kiSize) {
                            if (!residualRecord.hasIntrinsicsJacobian) {
                                return 0.0;
                            }
                            return residualRecord.intrinsicsJacobian[row * kiSize + parameterIndex];
                        }
                        if (!residualRecord.hasExtrinsicsJacobian) {
                            return 0.0;
                        }
                        const size_t e = parameterIndex - kiSize;
                        return residualRecord.extrinsicsJacobian[row * keSize + e];
                    };
                    double contribution = 0.0;
                    for (int r = 0; r < residualRecord.residualSize; ++r) {
                        contribution += parameterJacobianAt(i, r) * parameterJacobianAt(j, r);
                    }
                    if (contribution > attribution.strongestLinkValue) {
                        attribution.strongestLinkValue = contribution;
                        attribution.strongestLinkConstraint = constraint.label + " (" + constraint.parameters + ")";
                    }
                    if (contribution < attribution.strongestSeparationValue) {
                        attribution.strongestSeparationValue = contribution;
                        attribution.strongestSeparationConstraint =
                                constraint.label + " (" + constraint.parameters + ")";
                    }
                }
                cout << "    " << attribution.pairName << " (rho=" << rho << ")\n";
                if (attribution.strongestLinkConstraint.empty()) {
                    cout << "      strongest link: none\n";
                    cout << "      strongest separation: none\n";
                } else {
                    cout << "      strongest link: " << attribution.strongestLinkConstraint
                            << " (score=" << attribution.strongestLinkValue << ")\n";
                    cout << "      strongest separation: " << attribution.strongestSeparationConstraint
                            << " (score=" << attribution.strongestSeparationValue << ")\n";
                }
            }
        }
        if (!foundCoupledPairs) {
            cout << "    No strongly coupled pairs found (|rho| > 0.8).\n";
        }
    }
}
}
