#include <ceres/ceres.h>
#include <ceres/rotation.h>

struct Point5D {
    double X, Y, Z; // known 3D
    double u, v; // observed 2D
};

Point5D fromArray(const double *array) {
    return Point5D{array[0], array[1], array[2], array[3], array[4]};
}

struct ReprojectionError {
    explicit ReprojectionError(const Point5D &p)
        : observed_x(p.u), observed_y(p.v), X{p.X, p.Y, p.Z} {
    }

    template<typename T>
    bool operator()(const T *const rotation,
                    const T *const translation,
                    const T *const intrinsics,
                    T *residuals) const {
        T p[3];
        T X_t[3] = {T(X[0]), T(X[1]), T(X[2])};

        ceres::AngleAxisRotatePoint(rotation, X_t, p);

        p[0] += translation[0];
        p[1] += translation[1];
        p[2] += translation[2];

        T x = p[0] / p[2];
        T y = p[1] / p[2];

        const T &fx = intrinsics[0];
        const T &fy = intrinsics[1];
        const T &cx = intrinsics[2];
        const T &cy = intrinsics[3];

        T u = fx * x + cx;
        T v = fy * y + cy;

        residuals[0] = u - T(observed_x);
        residuals[1] = v - T(observed_y);

        return true;
    }

    static ceres::CostFunction *Create(const Point5D &p) {
        // ReSharper disable once CppDFAMemoryLeak
        return new ceres::AutoDiffCostFunction<
            ReprojectionError, 2, 3, 3, 4>(
            new ReprojectionError(p));
    }

    double observed_x, observed_y;
    double X[3];
};

struct AspectRatioConstraint {
    template<typename T>
    bool operator()(const T *const intrinsics, T *residual) const {
        const T &fx = intrinsics[0];
        const T &fy = intrinsics[1];

        residual[0] = fx - fy; // want 0
        return true;
    }

    static ceres::CostFunction *Create() {
        // ReSharper disable once CppDFAMemoryLeak
        return new ceres::AutoDiffCostFunction<
            AspectRatioConstraint, 1, 4>(
            new AspectRatioConstraint);
    }
};

struct FocalPrior {
    explicit FocalPrior(const double f0) : f0(f0) {
    }

    template<typename T>
    bool operator()(const T *const intrinsics, T *residual) const {
        residual[0] = intrinsics[0] - T(f0);
        return true;
    }

    double f0;
};

struct PositiveDepthConstraint {
    explicit PositiveDepthConstraint(const double *X) : X_{X[0], X[1], X[2]} {
    }

    template<typename T>
    bool operator()(const T *const rotation,
                    const T *const translation,
                    T *residual) const {
        T p[3];
        T X_t[3] = {T(X_[0]), T(X_[1]), T(X_[2])};

        ceres::AngleAxisRotatePoint(rotation, X_t, p);

        p[0] += translation[0];
        p[1] += translation[1];
        p[2] += translation[2];

        // penalize negative depth
        residual[0] = ceres::fmax(T(0), -p[2]);

        return true;
    }

    static ceres::CostFunction *Create(const double *X) {
        return new ceres::AutoDiffCostFunction<PositiveDepthConstraint, 1, 3, 3>(new PositiveDepthConstraint(X));
    }

    double X_[3];
};

struct DirectionConstraint {
    explicit DirectionConstraint(const double *d) : d_{d[0], d[1], d[2]} {
    }

    template<typename T>
    bool operator()(const T *const P1,
                    const T *const P2,
                    T *residuals) const {
        T v[3];
        v[0] = P2[0] - P1[0];
        v[1] = P2[1] - P1[1];
        v[2] = P2[2] - P1[2];
        T d[3] = {T(d_[0]), T(d_[1]), T(d_[2])};

        // cross product v x d
        residuals[0] = v[1] * d[2] - v[2] * d[1];
        residuals[1] = v[2] * d[0] - v[0] * d[2];
        residuals[2] = v[0] * d[1] - v[1] * d[0];
        return true;
    }

    static ceres::CostFunction *Create(const double *d) {
        return new ceres::AutoDiffCostFunction<DirectionConstraint, 3, 3, 3>(new DirectionConstraint(d));
    }

    double d_[3];
};

extern "C" {
void solve_camera(const int pointCount, const double *points, const double imageSize[2]) {
    double rotation[3] = {0, 0, 0};
    double translation[3] = {0, 0, 5};
    double intrinsics[4] = {800, 800, imageSize[0] / 2.0, imageSize[1] / 2.0};
    std::cout << "imageSize: "
            << imageSize[0] << " "
            << imageSize[1] << "\n";
    std::cout << "initial Rotation: "
            << rotation[0] << " "
            << rotation[1] << " "
            << rotation[2] << "\n";

    std::cout << "initial Translation: "
            << translation[0] << " "
            << translation[1] << " "
            << translation[2] << "\n";

    std::cout << "initial Intrinsics (fx, fy, cx, cy): "
            << intrinsics[0] << " "
            << intrinsics[1] << " "
            << intrinsics[2] << " "
            << intrinsics[3] << "\n";
    ceres::Problem problem;
    for (int i = 0; i < pointCount; ++i) {
        Point5D p = fromArray(points + i * 5);
        problem.AddResidualBlock(ReprojectionError::Create(p),
                                 nullptr,
                                 rotation, translation, intrinsics);
        problem.AddResidualBlock(PositiveDepthConstraint::Create(&p.X),
                                 new ceres::ScaledLoss(nullptr, 1e-2, ceres::TAKE_OWNERSHIP),
                                 rotation, translation);
    }
    problem.SetParameterLowerBound(intrinsics, 2, 0.0);
    problem.SetParameterUpperBound(intrinsics, 2, imageSize[0]);
    problem.SetParameterLowerBound(intrinsics, 3, 0.0);
    problem.SetParameterUpperBound(intrinsics, 3, imageSize[1]);
    problem.AddResidualBlock(AspectRatioConstraint::Create(),
                             new ceres::ScaledLoss(nullptr, 10, ceres::TAKE_OWNERSHIP),
                             intrinsics);
    problem.AddResidualBlock(new ceres::AutoDiffCostFunction<FocalPrior, 1, 4>(new FocalPrior(800.0)),
                             new ceres::ScaledLoss(nullptr, 1e-3, ceres::TAKE_OWNERSHIP),
                             intrinsics);
    ceres::Solver::Options options;
    options.linear_solver_type = ceres::DENSE_QR;
    options.minimizer_progress_to_stdout = true;

    ceres::Solver::Summary summary;
    ceres::Solve(options, &problem, &summary);

    std::cout << summary.BriefReport() << "\n";

    std::cout << "Rotation: "
            << rotation[0] << " "
            << rotation[1] << " "
            << rotation[2] << "\n";

    std::cout << "Translation: "
            << translation[0] << " "
            << translation[1] << " "
            << translation[2] << "\n";

    std::cout << "Intrinsics (fx, fy, cx, cy): "
            << intrinsics[0] << " "
            << intrinsics[1] << " "
            << intrinsics[2] << " "
            << intrinsics[3] << "\n";
    // ReSharper disable once CppDFAMemoryLeak
}
}
