#pragma once
#include <ceres/ceres.h>
#include <ceres/covariance.h>
#include <ceres/rotation.h>
#include <cmath>
#include <iostream>
#include <limits>
#include <sstream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>
#include <array>

#include "priors.h"
#include "types.h"
#include "utils.h"

using ceres::ResidualBlockId;

constexpr size_t kiSize = Intrinsics<double>::kSize;
constexpr size_t keSize = Extrinsics<double>::kSize;

template<typename T, size_t LEN>
std::ostream &operator<<(std::ostream &lhs, const std::array<T, LEN> &rhs) {
    lhs << "[";
    for (auto it = rhs.cbegin(); it != rhs.cend(); ++it) {
        lhs << *it;
        if (std::next(it) != rhs.cend()) lhs << ", ";
    }
    lhs << "]";
    return lhs;
}

/** this convoluted system checks at compile-time the size of the intrinsics and the residuals */
template<size_t RES_SIZE, typename DERIVED>
struct CompleteConstraint {
    static constexpr size_t kResSize = RES_SIZE;
    using Created = std::tuple<DERIVED, ceres::LossFunction *, std::string>;

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
    static ConstraintRecord add(ceres::Problem &problem, Intrinsics<double> &intrinsics, Extrinsics<double> &extrinsics,
                                ARGS &&... args) {
        auto [constraint, loss, paramStr] = DERIVED::Create(std::forward<ARGS>(args)...);
        auto *functor = new TheFunctor(constraint);
        const auto blockId = problem.AddResidualBlock(
            new ceres::AutoDiffCostFunction<TheFunctor, kResSize, kiSize, keSize>(functor), loss, intrinsics.arr,
            extrinsics.arr);
        return ConstraintRecord{DERIVED::kDescription, paramStr, DERIVED::kResidualDesc, blockId, 0, 1, kResSize};
    }
};

template<size_t RES_SIZE, typename DERIVED, typename... PARAMS>
struct SpecializedConstraint {};

struct ReprojectionError : CompleteConstraint<2, ReprojectionError> {
    static constexpr auto kDescription = "Reprojection";
    static constexpr auto kResidualDesc = "reprojection position";

    explicit ReprojectionError(const Point5D &p) : p_(p) {}

    Point5D p_;

    static Created Create(const Point5D &p, const double huberLoss) {
        std::ostringstream label;
        label << " Point " << p << ", huber=" << huberLoss;
        ReprojectionError reprojection_error(p);
        return {reprojection_error, new ceres::HuberLoss(huberLoss), label.str()};
    }

    template<typename T>
    bool compute(const Intrinsics<T> &intrinsics, const Extrinsics<T> &extrinsics, T (&residuals)[kResSize]) const {
        T point3d[] = {T(p_.X), T(p_.Y), T(p_.Z)};
        T p[3];
        extrinsics.imagePoint(point3d, p);
        T imaged[2];
        const bool notTooClose = intrinsics.imagePoint(p, imaged);
        if (!notTooClose) return false;
        residuals[0] = imaged[0] - p_.u;
        residuals[1] = imaged[1] - p_.v;
        return true;
    }
};

/** Ensure points are in front of the camera */
struct PositiveDepthConstraint : CompleteConstraint<1, PositiveDepthConstraint> {
    static constexpr auto kDescription = "PositiveDepth point";
    static constexpr auto kResidualDesc = "distance from front plane if negative";

    explicit PositiveDepthConstraint(const std::array<double, 3> &X) : X_{X[0], X[1], X[2]} {}

    std::array<double, 3> X_;

    static Created Create(const std::array<double, 3> &point3d, const double sigma = 1.0) {
        std::ostringstream label;
        label << " Point " << point3d << ", sigma=" << sigma;
        PositiveDepthConstraint positive_depth_constraint(point3d);
        return {positive_depth_constraint, scaledLossSigma(sigma), label.str()};
    }

    template<typename T>
    bool compute([[maybe_unused]] const Intrinsics<T> &_intrinsics, const Extrinsics<T> &extrinsics,
                 T (&residuals)[kResSize]) const {
        T p[3] = {T(X_[0]), T(X_[1]), T(X_[2])};
        T imaged[3];
        extrinsics.imagePoint(p, imaged);
        residuals[0] = ceres::fmax(T(0), -imaged[2]);
        return true;
    }
};

struct DirectionConstraint : CompleteConstraint<1, DirectionConstraint> {
    static constexpr const char *kDescription = "Direction";
    static constexpr auto kResidualDesc = "distance from vanishing point to camera-centered plane in px";

    explicit DirectionConstraint(const double x1, const double y1, const double x2, const double y2,
                                 const std::array<double, 3> &d_world)
        : d_world_(d_world) {
        // 2D line in homogeneous coordinates: l = (x1, y1, 1) x (x2, y2, 1)
        // This vector is the normal to the plane in camera space
        A_ = y1 - y2;
        B_ = x2 - x1;
        C_ = x1 * y2 - x2 * y1;
    }

    double A_, B_, C_;
    const std::array<double, 3> d_world_;

    static Created Create(const std::array<double, 4> &obs, const std::array<double, 3> &d_world, const double sigma,
                          const double threshold) {
        std::ostringstream label;
        label << " World Direction " << d_world << ", sigma=" << sigma << ", TukeyLoss=" << threshold;
        DirectionConstraint constraint(obs[0], obs[1], obs[2], obs[3], d_world);
        return {constraint, scaledLossSigma(sigma, new ceres::TukeyLoss(threshold)), label.str()};
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
};

using EvaluationMap = std::unordered_map<ceres::ResidualBlockId, ResidualEvaluationRecord>;

inline EvaluationMap evaluate_residuals(const std::vector<ConstraintRecord> &allConstraints, const ceres::Problem &problem) {
    EvaluationMap residualEvaluationMap;
    residualEvaluationMap.reserve(allConstraints.size());
    for (const auto &constraint: allConstraints) {
        const auto *costFunction = problem.GetCostFunctionForResidualBlock(constraint.blockId);
        if (costFunction == nullptr) {
            continue;
        }
        const auto residualSize = static_cast<size_t>(costFunction->num_residuals());
        if (residualSize <= 0) {
            continue;
        }
        ResidualEvaluationRecord record{
            .blockId = constraint.blockId,
            .constraint = &constraint,
            .residualSize = residualSize,
            .residualsLoss = std::vector(residualSize, 0.0),
            .residualsNonLoss = std::vector(residualSize, 0.0),
            .intrinsicsJacobian = std::vector(0, 0.0),
            .extrinsicsJacobian = std::vector(0, 0.0),
        };

        const auto &parameterBlockSizes = costFunction->parameter_block_sizes();
        const auto blockSize = parameterBlockSizes.size();
        std::vector<double *> jacobians(blockSize, nullptr);
        if (constraint.intrinsicsBlockIndex >= 0) {
            record.hasIntrinsicsJacobian = true;
            record.intrinsicsJacobian.resize(residualSize * kiSize, 0.0);
            jacobians[static_cast<size_t>(constraint.intrinsicsBlockIndex)] = record.intrinsicsJacobian.data();
        }
        if (constraint.extrinsicsBlockIndex >= 0) {
            record.hasExtrinsicsJacobian = true;
            record.extrinsicsJacobian.resize(residualSize * keSize, 0.0);
            jacobians[static_cast<size_t>(constraint.extrinsicsBlockIndex)] = record.extrinsicsJacobian.data();
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

inline void log_points_residuals(const EvaluationMap &residualMap, const std::vector<ConstraintRecord> &pointResiduals) {
    for (const auto &record: pointResiduals) {
        const auto residualIt = residualMap.find(record.blockId);
        if (residualIt == residualMap.end() || residualIt->second.residualSize < 2) {
            continue;
        }
        const auto &data = residualIt->second;
        std::cout << record.label << "\n";
        std::cout << "    Params: " << record.parameters << "\n";
        std::cout << "    Lossy Residual (px): " << std::sqrt(data.costLoss * 2) << " [du: " << data.residualsLoss[0] <<
                ", dv: " << data.residualsLoss[1] << "] Cost: " << data.costLoss << "\n";
    }
}

inline void log_directions_residuals(const EvaluationMap &residualMap, const std::vector<ConstraintRecord> &directionResiduals) {
    for (const auto &record: directionResiduals) {
        const auto residualIt = residualMap.find(record.blockId);
        if (residualIt == residualMap.end() || residualIt->second.residualSize < 1) {
            continue;
        }
        const auto &data = residualIt->second;
        std::cout << record.label << "\n";
        std::cout << "    Params: " << record.parameters << "\n";
        std::cout << "    Lossy Residual (distance to VP): " << data.residualsLoss[0]
                << " Cost: " << data.costLoss << "\n";
        std::cout << "    Non Lossy Residual (distance to VP): " << data.residualsNonLoss[0]
                << " Cost: " << data.costNonLoss << "\n";
    }
}

inline void analyse_covariance(std::vector<ConstraintRecord> &allConstraints, Intrinsics<double> &intrinsics,
                              Extrinsics<double> &extrinsics, ceres::Problem &problem, EvaluationMap &residualEvaluationMap) {
    ceres::Covariance::Options covarianceOptions;
    covarianceOptions.algorithm_type = ceres::DENSE_SVD;
    covarianceOptions.apply_loss_function = false;
    ceres::Covariance covariance(covarianceOptions);
    const std::vector<std::pair<const double *, const double *>> covarianceBlocks = {
        {intrinsics.arr, intrinsics.arr},
        {extrinsics.arr, extrinsics.arr},
        {intrinsics.arr, extrinsics.arr}
    };
    if (!covariance.Compute(covarianceBlocks, &problem)) {
        std::cout << "WARNING: Covariance computation failed for solved parameters.\n";
    } else {
        std::cout << "--- Covariance Interpretation ---\n";

        const auto printCovarianceInterpretation = [&covariance](
            const double *params, const size_t size, const auto &names, const char *title) {
            std::vector<double> cov(size * size);
            covariance.GetCovarianceBlock(params, params, cov.data());
            std::cout << title << "\n";

            for (size_t i = 0; i < size; ++i) {
                const double variance = cov[i * size + i];
                if (variance < 0.0) {
                    std::cout << "    " << names[i] << ": variance=" << variance
                            << " (invalid negative variance)\n";
                    continue;
                }
                const double sigma = std::sqrt(variance);
                std::cout << "    " << names[i] << ", sigma=" << sigma << "\n";
            }

            std::cout << "    Strong parameter correlations (|rho| > 0.8):\n";
            bool foundStrongCorrelation = false;
            for (size_t i = 0; i < size; ++i) {
                for (size_t j = i + 1; j < size; ++j) {
                    const double varI = cov[i * size + i];
                    const double varJ = cov[j * size + j];
                    if (varI <= 0.0 || varJ <= 0.0) continue;
                    const double rho = cov[i * size + j] / std::sqrt(varI * varJ);
                    if (std::abs(rho) > 0.8) {
                        foundStrongCorrelation = true;
                        std::cout << "      " << names[i] << " <-> " << names[j] << ": rho=" << rho << "\n";
                    }
                }
            }
            if (!foundStrongCorrelation) {
                std::cout << "      none\n";
            }
        };

        auto intNames = Intrinsics<double>::kNames;
        auto extNames = Extrinsics<double>::kNames;
        printCovarianceInterpretation(intrinsics.arr, kiSize, intNames, "  Intrinsics covariance:");
        printCovarianceInterpretation(extrinsics.arr, keSize, extNames, "  Extrinsics covariance:");
        std::vector<double> intrinsicsCov(kiSize * kiSize);
        std::vector<double> extrinsicsCov(keSize * keSize);
        std::vector<double> crossCov(kiSize * keSize);
        covariance.GetCovarianceBlock(intrinsics.arr, intrinsics.arr, intrinsicsCov.data());
        covariance.GetCovarianceBlock(extrinsics.arr, extrinsics.arr, extrinsicsCov.data());
        covariance.GetCovarianceBlock(intrinsics.arr, extrinsics.arr, crossCov.data());
        std::cout << "  Intrinsics vs Extrinsics covariance:\n";
        std::cout << "    Strong cross-correlations (|rho| > 0.8):\n";
        bool foundStrongCrossCorrelation = false;
        for (size_t i = 0; i < kiSize; ++i) {
            for (size_t j = 0; j < keSize; ++j) {
                const double varI = intrinsicsCov[i * kiSize + i];
                const double varJ = extrinsicsCov[j * keSize + j];
                if (varI <= 0.0 || varJ <= 0.0) continue;
                const double covIJ = crossCov[i * keSize + j];
                const double rho = covIJ / std::sqrt(varI * varJ);
                if (std::abs(rho) > 0.8) {
                    foundStrongCrossCorrelation = true;
                    std::cout << "      " << intNames[i] << " <-> " << extNames[j] << ": rho=" << rho << "\n";
                }
            }
        }
        if (!foundStrongCrossCorrelation) {
            std::cout << "      none\n";
        }
        struct ParameterDescriptor {
            std::string name;
            const std::vector<double> *covarianceBlock = nullptr;
            size_t blockSize = 0;
            size_t localIndex = 0;
            bool isIntrinsic = false;

            double operator[](const size_t columnIndex) const {
                return (*covarianceBlock)[localIndex * blockSize + columnIndex];
            }

            [[nodiscard]] double diagonal() const {
                return (*this)[localIndex];
            }

            [[nodiscard]] double getJacobian(const std::vector<double> &intrinsicsJacobian,
                                             const std::vector<double> &extrinsicsJacobian, const size_t row) const {
                const auto &jacobian = isIntrinsic ? intrinsicsJacobian : extrinsicsJacobian;
                if (jacobian.empty()) return 0.0;
                return jacobian[localIndex * blockSize + row];
            }
        };
        std::vector<ParameterDescriptor> parameterDescriptors;
        parameterDescriptors.reserve(kiSize + keSize);
        for (size_t i = 0; i < kiSize; ++i) {
            parameterDescriptors.push_back(ParameterDescriptor{intNames[i], &intrinsicsCov, kiSize, i, true});
        }
        for (size_t i = 0; i < keSize; ++i) {
            parameterDescriptors.push_back(ParameterDescriptor{extNames[i], &extrinsicsCov, keSize, i, false});
        }
        struct CouplingAttribution {
            std::string pairName;
            std::string strongestLinkConstraint;
            std::string strongestSeparationConstraint;
            double strongestLinkValue = -std::numeric_limits<double>::infinity();
            double strongestSeparationValue = std::numeric_limits<double>::infinity();
        };
        std::cout << "  Jacobian-based coupling attribution:\n";
        std::cout << "    (link=max positive sum(J_i*J_j), separation=min sum(J_i*J_j))\n";
        bool foundCoupledPairs = false;
        for (size_t i = 0; i < parameterDescriptors.size(); ++i) {
            for (size_t j = i + 1; j < parameterDescriptors.size(); ++j) {
                double rho = 0.0;
                const auto &pI = parameterDescriptors[i];
                const auto &pJ = parameterDescriptors[j];
                const double varI = pI.diagonal();
                const double varJ = pJ.diagonal();
                if (varI <= 0.0 || varJ <= 0.0) continue;
                if (pI.isIntrinsic == pJ.isIntrinsic) {
                    rho = pI[pJ.localIndex];
                } else {
                    const auto &[iParam, eParam] = pI.isIntrinsic ? std::pair{pI, pJ} : std::pair{pJ, pI};
                    rho = crossCov[iParam.localIndex * keSize + eParam.localIndex];
                }
                rho /= std::sqrt(varI * varJ);
                if (std::abs(rho) <= 0.8) continue;
                foundCoupledPairs = true;

                CouplingAttribution attribution;
                attribution.pairName = pI.name + " <-> " + pJ.name;
                for (const auto &constraint: allConstraints) {
                    const auto residualIt = residualEvaluationMap.find(constraint.blockId);
                    if (residualIt == residualEvaluationMap.end() || residualIt->second.residualSize <= 0) {
                        continue;
                    }
                    const auto &resRecord = residualIt->second;
                    double contribution = 0.0;
                    for (size_t r = 0; r < resRecord.residualSize; ++r) {
                        contribution +=
                                pI.getJacobian(resRecord.intrinsicsJacobian, resRecord.extrinsicsJacobian, r)
                                * pJ.getJacobian(resRecord.intrinsicsJacobian, resRecord.extrinsicsJacobian, r);
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
                std::cout << "    " << attribution.pairName << " (rho=" << rho << ")\n";
                if (attribution.strongestLinkConstraint.empty()) {
                    std::cout << "      strongest link: none\n";
                    std::cout << "      strongest separation: none\n";
                } else {
                    std::cout << "      strongest link: " << attribution.strongestLinkConstraint
                            << " (score=" << attribution.strongestLinkValue << ")\n";
                    std::cout << "      strongest separation: " << attribution.strongestSeparationConstraint
                            << " (score=" << attribution.strongestSeparationValue << ")\n";
                }
            }
        }
        if (!foundCoupledPairs) {
            std::cout << "    No strongly coupled pairs found (|rho| > 0.8).\n";
        }
    }
}

struct ReconstructionProblem {
    ceres::Solver::Options options;
    ceres::Solver::Summary summary;
    ceres::Problem problem;
    Intrinsics<double> intrinsics;
    Extrinsics<double> extrinsics;
    std::vector<ConstraintRecord> priorConstraints;
    std::vector<ConstraintRecord> pointConstraints;
    std::vector<ConstraintRecord> directionConstraints;
    double pointReprojectionOutlierThreshold = std::nan("0");

    ReconstructionProblem() = default;

    void reset() {
        summary = ceres::Solver::Summary();
        problem = ceres::Problem();
        priorConstraints.clear();
        pointConstraints.clear();
        directionConstraints.clear();
        pointReprojectionOutlierThreshold = std::nan("0");
    }
};

struct InitialProblemParams {
    double imageSizeX = 640;
    double imageSizeY = 480;
    double initialFx = 640;
    double initialFy = 640;
    double initialCx = 320;
    double initialCy = 240;
    double initialK1 = 0;
    double aspectRatioPriorScale = 10000.0;
    double focalPriorScale = 0.04;
    double principalPointCauchyRadius = std::nan("0");

    void toIntrinsics(Intrinsics<double> &intrinsics) const {
        double arr[] = {initialFx, initialFy, initialCx, initialCy, initialK1};
        intrinsics = Intrinsics(arr);
    }

    void toReconstructionProblem(ReconstructionProblem &problem) const {
        problem.reset();
        double ppRadius = principalPointCauchyRadius;
        if (std::isnan(ppRadius))
            ppRadius = initialFx * 0.005;
        problem.pointReprojectionOutlierThreshold = imageSizeX / 100.0;
        toIntrinsics(problem.intrinsics);
        auto &problem1 = problem.problem;
        problem.priorConstraints.push_back(
            AspectRatioPrior::add(problem1, problem.intrinsics, initialFy / initialFx, aspectRatioPriorScale));
        problem.priorConstraints.push_back(
            FocalPrior::add(problem1, problem.intrinsics, initialFx, initialFy, focalPriorScale));
        problem.priorConstraints.push_back(
            PrincipalPointPrior::add(problem1, problem.intrinsics, initialCx, initialCy, ppRadius));
        problem.priorConstraints.push_back(
            DistortionPrior::add(problem1, problem.intrinsics, initialK1));
        problem.intrinsics.registerLimits(problem1, {imageSizeX, imageSizeY});
    }
};

inline std::pair<InitialProblemParams, std::array<double, 6>> compute_initial_state(
    const std::vector<Point5D> &fixedPoints,
    const double imageSize[2],
    const double target_fov_deg = 60.0) {
    InitialProblemParams initIntrinsics;
    initIntrinsics.imageSizeX = imageSize[0];
    initIntrinsics.imageSizeY = imageSize[1];
    initIntrinsics.initialFx = imageSize[0];
    initIntrinsics.initialFy = imageSize[0];
    initIntrinsics.initialCx = imageSize[0] / 2.0;
    initIntrinsics.initialCy = imageSize[1] / 2.0;
    initIntrinsics.initialK1 = 0.0;
    initIntrinsics.aspectRatioPriorScale = 1.0;
    initIntrinsics.focalPriorScale = 1.0;
    initIntrinsics.principalPointCauchyRadius = 1.0;

    std::array<double, 6> initExtrinsics = {1.047, 0.01, 0.01, -200.0, 200.0, 4500.0};
    const size_t count = fixedPoints.size();
    if (count == 0) return {initIntrinsics, initExtrinsics};

    double cx = 0, cy = 0, cz = 0;
    for (const auto &p : fixedPoints) {
        cx += p.X;
        cy += p.Y;
        cz += p.Z;
    }
    cx /= static_cast<double>(count);
    cy /= static_cast<double>(count);
    cz /= static_cast<double>(count);

    double max_r_sq = 0;
    for (const auto &p : fixedPoints) {
        const double dx = p.X - cx;
        const double dy = p.Y - cy;
        const double dz = p.Z - cz;
        max_r_sq = std::max(max_r_sq, dx * dx + dy * dy + dz * dz);
    }
    const double radius = std::sqrt(max_r_sq);

    constexpr double kPi = 3.14159265358979323846;
    const double fov_rad = target_fov_deg * (kPi / 180.0);
    const double f = (imageSize[0] / 2.0) / std::tan(fov_rad / 2.0);
    const double distance = (radius * 1.2) / std::tan(fov_rad / 2.0);

    const double centroid[3] = {cx, cy, cz};
    double rotated_centroid[3];
    const double rot[3] = {initExtrinsics[0], initExtrinsics[1], initExtrinsics[2]};
    ceres::AngleAxisRotatePoint(rot, centroid, rotated_centroid);

    initExtrinsics[3] = -rotated_centroid[0];
    initExtrinsics[4] = -rotated_centroid[1];
    initExtrinsics[5] = distance - rotated_centroid[2];

    initIntrinsics.initialFx = f;
    initIntrinsics.initialFy = f;

    return {initIntrinsics, initExtrinsics};
}
