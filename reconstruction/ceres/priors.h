#pragma once
#include <ceres/ceres.h>
#include <utility>
#include "types.h"

/** this convoluted system checks at compile-time the size of the intrinsics and the residuals */
template<size_t RES_SIZE, typename DERIVED>
struct IntrinsicsPrior {
    static constexpr size_t kResSize = RES_SIZE;
    using Created = std::pair<DERIVED *, ceres::LossFunction *>;

    template<typename T>
    bool operator()(const T intrinsics[Intrinsics<T>::kSize], T residual[kResSize]) const {
        Intrinsics<T> i(intrinsics);
        auto &residualArray = *reinterpret_cast<T (*)[kResSize]>(residual);
        return static_cast<const DERIVED *>(this)->template compute<T>(i, residualArray);
    }

    template<typename... ARGS>
    static ceres::ResidualBlockId add(ceres::Problem &problem, Intrinsics<double> &intrinsics, ARGS &&... args) {
        auto [prior, loss] = DERIVED::Create(std::forward<ARGS>(args)...);
        return problem.AddResidualBlock(
            new ceres::AutoDiffCostFunction<DERIVED, kResSize, Intrinsics<double>::kSize>(prior), loss, intrinsics.arr);
    }
};

/** prejudge that the pixels are square */
struct AspectRatioPrior : IntrinsicsPrior<1, AspectRatioPrior> {
    template<typename T>
    [[nodiscard]] static bool compute(const Intrinsics<T> &intrinsics, T (&residual)[kResSize]) {
        residual[0] = intrinsics.fx() - intrinsics.fy();
        return true;
    }

    static Created Create(const double scale) {
        return {
            new AspectRatioPrior(), new ceres::ScaledLoss(nullptr, scale, ceres::TAKE_OWNERSHIP)
        };
    }
};

/** prejudge the focal length will stay close to the initial solution */
struct FocalPrior : IntrinsicsPrior<1, FocalPrior> {
    explicit FocalPrior(const double f0) : f0(f0) {}

    template<typename T>
    [[nodiscard]] bool compute(const Intrinsics<T> &intrinsics, T (&residual)[kResSize]) const {
        residual[0] = intrinsics.fx() - T(f0);
        return true;
    }

    static Created Create(const double f0, const double scale = 100.0) {
        return {
            new FocalPrior(f0), new ceres::ScaledLoss(nullptr, scale, ceres::TAKE_OWNERSHIP)
        };
    }

    double f0;
};

/** prejudge the distortion is low */
struct DistortionPrior : IntrinsicsPrior<1, DistortionPrior> {
    template<typename T>
    [[nodiscard]] static bool compute(const Intrinsics<T> &intrinsics, T (&residual)[kResSize]) {
        // Penalize k1 moving too far from 0 (weakly)
        residual[0] = intrinsics.k1();
        return true;
    }

    static Created Create() {
        return {new DistortionPrior(), nullptr};
    }
};

/** prejudge the principal point is very close to the center */
struct PrincipalPointPrior : IntrinsicsPrior<2, PrincipalPointPrior> {
    PrincipalPointPrior(const double cx, const double cy) : cx_(cx), cy_(cy) {}

    template<typename T>
    [[nodiscard]] bool compute(const Intrinsics<T> &intrinsics, T (&residual)[kResSize]) const {
        residual[0] = intrinsics.cx() - T(cx_);
        residual[1] = intrinsics.cy() - T(cy_);
        return true;
    }

    static Created Create(const double cx, const double cy, const double principalPointCauchyRadius) {
        return {
            new PrincipalPointPrior(cx, cy), new ceres::CauchyLoss(principalPointCauchyRadius)
        };
    }

    double cx_, cy_;
};
