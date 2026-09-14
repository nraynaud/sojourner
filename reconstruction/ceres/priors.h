#pragma once
#include <ceres/ceres.h>
#include <utility>
#include "types.h"

/** this convoluted system checks at compile-time the size of the intrinsics and the residuals */
template<size_t RES_SIZE, typename DERIVED>
struct IntrinsicsPrior {
    static constexpr size_t kResSize = RES_SIZE;
    using Created = std::tuple<DERIVED *, ceres::LossFunction *, std::string>;

    template<typename T>
    bool operator()(const T intrinsics[Intrinsics<T>::kSize], T residual[kResSize]) const {
        Intrinsics<T> i(intrinsics);
        auto &residualArray = *reinterpret_cast<T (*)[kResSize]>(residual);
        return static_cast<const DERIVED *>(this)->template compute<T>(i, residualArray);
    }

    template<typename... ARGS>
    static ConstraintRecord add(ceres::Problem &problem, Intrinsics<double> &intrinsics, ARGS &&... args) {
        auto [prior, loss, paramStr] = DERIVED::Create(std::forward<ARGS>(args)...);
        const auto blockId = problem.AddResidualBlock(
            new ceres::AutoDiffCostFunction<DERIVED, kResSize, Intrinsics<double>::kSize>(prior), loss, intrinsics.arr);
        return ConstraintRecord{DERIVED::kDescription, paramStr, DERIVED::kResidualDesc, blockId, 0, -1, kResSize};
    }
};

/** prejudge that the pixels initial aspect ratio will be kept */
struct AspectRatioPrior : IntrinsicsPrior<1, AspectRatioPrior> {
    static constexpr auto kDescription = "Prior AspectRatio=1";
    static constexpr auto kResidualDesc = "ratio0-(fy/fx)";
    explicit AspectRatioPrior(const double initialRatio) : initialRatio(initialRatio) {}

    template<typename T>
    [[nodiscard]] bool compute(const Intrinsics<T> &intrinsics, T (&residual)[kResSize]) const {
        residual[0] = initialRatio - (intrinsics.fy() / intrinsics.fx());
        return ceres::abs(intrinsics.fx()) >= 0.0001;
    }

    static Created Create(const double initialRatio, const double scale) {
        std::ostringstream label;
        label << "fx-fy, scale=" << scale;
        return {
            new AspectRatioPrior(initialRatio), new ceres::ScaledLoss(nullptr, scale, ceres::TAKE_OWNERSHIP),
            label.str()
        };
    }

    double initialRatio;
};

/** prejudge the focal length will stay close to the initial solution */
struct FocalPrior : IntrinsicsPrior<2, FocalPrior> {
    static constexpr auto kDescription = "Prior Focal resolution stays constant";
    static constexpr auto kResidualDesc = "fx-fx0, fy-fy0";


    explicit FocalPrior(const double fx0, const double fy0) : fx0(fx0), fy0(fy0) {}

    template<typename T>
    [[nodiscard]] bool compute(const Intrinsics<T> &intrinsics, T (&residual)[kResSize]) const {
        residual[0] = intrinsics.fx() - T(fx0);
        residual[1] = intrinsics.fy() - T(fy0);
        return true;
    }

    static Created Create(const double fx0, const double fy0, const double scale = 100.0) {
        std::ostringstream label;
        label << "fx-f0, f0=" << fx0 << ", scale=" << scale;
        return {
            new FocalPrior(fx0, fy0), new ceres::ScaledLoss(nullptr, scale, ceres::TAKE_OWNERSHIP), label.str()
        };
    }

    double fx0, fy0;
};

/** prejudge the distortion will stay constant */
struct DistortionPrior : IntrinsicsPrior<1, DistortionPrior> {
    static constexpr auto kDescription = "Prior Distortion is constant";
    static constexpr auto kResidualDesc = "k0-k1";

    explicit DistortionPrior(const double k0) : k0(k0) {}

    template<typename T>
    [[nodiscard]] bool compute(const Intrinsics<T> &intrinsics, T (&residual)[kResSize]) const {
        residual[0] = k0 - intrinsics.k1();
        return true;
    }

    static Created Create(const double k0 = 0.0) {
        return {
            new DistortionPrior(k0), new ceres::ScaledLoss(nullptr, 10000.0, ceres::TAKE_OWNERSHIP), "k1 (no loss)"
        };
    }

    double k0;
};

/** prejudge the principal point is very close to the center */
struct PrincipalPointPrior : IntrinsicsPrior<2, PrincipalPointPrior> {
    static constexpr auto kDescription = "Prior PrincipalPoint close to image center";
    static constexpr auto kResidualDesc = "position of principal point - image center";

    PrincipalPointPrior(const double cx, const double cy) : cx_(cx), cy_(cy) {}

    template<typename T>
    [[nodiscard]] bool compute(const Intrinsics<T> &intrinsics, T (&residual)[kResSize]) const {
        residual[0] = intrinsics.cx() - T(cx_);
        residual[1] = intrinsics.cy() - T(cy_);
        return true;
    }

    static Created Create(const double cx, const double cy, const double principalPointCauchyRadius) {
        std::ostringstream label;
        label << "[cx-cx0, cy-cy0], target=[" << cx << ", " << cy << "], cauchy=" << principalPointCauchyRadius;
        return {
            new PrincipalPointPrior(cx, cy), new ceres::CauchyLoss(principalPointCauchyRadius), label.str()
        };
    }

    double cx_, cy_;
};
