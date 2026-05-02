#pragma once
#include <ceres/ceres.h>
#include <ceres/rotation.h>

// templated because autodiff uses dual number for its computations
template<typename NUM_T>
struct Intrinsics {
    static constexpr size_t kSize = 5;
    static constexpr std::array<const char *, kSize> kNames = {"fx", "fy", "cx", "cy", "k1"};
    static constexpr size_t k1Index = 4;

    explicit Intrinsics(const NUM_T arr[kSize]) : arr{arr[0], arr[1], arr[2], arr[3], arr[4]} {}

    [[nodiscard]] NUM_T fx() const { return arr[0]; }
    [[nodiscard]] NUM_T fy() const { return arr[1]; }
    [[nodiscard]] NUM_T cx() const { return arr[2]; }
    [[nodiscard]] NUM_T cy() const { return arr[3]; }
    [[nodiscard]] NUM_T k1() const { return arr[k1Index]; }

    void fx(const NUM_T &v) { arr[0] = v; }
    void fy(const NUM_T &v) { arr[1] = v; }
    void cx(const NUM_T &v) { arr[2] = v; }
    void cy(const NUM_T &v) { arr[3] = v; }
    void k1(const NUM_T &v) { arr[k1Index] = v; }

    /** sets destination to the image of the point through the intrinsics of the camera.
     * @return true if the point is in front of the camera, false otherwise
     */
    bool imagePoint(const NUM_T point[3], NUM_T destination[2]) const {
        NUM_T z = point[2];
        if (ceres::abs(z) < NUM_T(1e-8)) z = NUM_T(1e-8);
        NUM_T x = point[0] / z;
        NUM_T y = point[1] / z;
        NUM_T distortion = NUM_T(1.0) + k1() * (x * x + y * y);
        destination[0] = fx() * (x * distortion) + cx();
        destination[1] = fy() * (y * distortion) + cy();
        return z >= NUM_T(0.0);
    }

    void registerLimits(ceres::Problem &problem, const double (&imageSize)[2]) {
        // r_max = 1.5 (diagonal FOV ≈ 112.6°)
        // let say a mon FOV of 10° => r_min = 5.72
        const double imageDiagonal = hypot(imageSize[0], imageSize[1]);
        const double minF = imageDiagonal / 3;
        const double maxF = imageDiagonal * 5.72;
        problem.SetParameterLowerBound(arr, 0, minF);
        problem.SetParameterUpperBound(arr, 0, maxF);
        problem.SetParameterLowerBound(arr, 1, minF);
        problem.SetParameterUpperBound(arr, 1, maxF);
        problem.SetParameterLowerBound(arr, 2, 0.0);
        problem.SetParameterUpperBound(arr, 2, imageSize[0]);
        problem.SetParameterLowerBound(arr, 3, 0.0);
        problem.SetParameterUpperBound(arr, 3, imageSize[1]);
        // k1 is bounded assuming a maximum normalized image radius r_max = 1.5 (diagonal FOV ≈ 112.6°),
        // very wide but non-fisheye perspective camera.
        // To avoid radial foldover in r_d = r * (1 + k1*r^2), require
        // d(r_d)/dr = 1 + 3*k1*r^2 > 0, giving k1 > -1/(3*r_max^2) ≈ -0.148.
        // The upper bound uses the practical limit k1 <= 1/r_max^2 ≈ 0.444.
        // Rounded final range: -0.14 <= k1 <= 0.44.
        problem.SetParameterLowerBound(arr, k1Index, -0.14);
        problem.SetParameterUpperBound(arr, k1Index, 0.44);
    }

    NUM_T arr[kSize];
};

template<typename NUM_T>
std::ostream &operator<<(std::ostream &lhs, const Intrinsics<NUM_T> &i) {
    lhs << "fx:" << i.fx() << " fy:" << i.fy() << " cx:" << i.cx() << " cy:" << i.cy() << " k1:" << i.k1();
    return lhs;
}


template<typename NUM_T>
struct Extrinsics {
    static constexpr size_t kSize = 6;
    static constexpr std::array<const char *, kSize> kNames = {"rx", "ry", "rz", "tx", "ty", "tz"};

    explicit Extrinsics(const NUM_T arr[kSize]) : arr{arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]} {}

    [[nodiscard]] NUM_T rx() const { return arr[0]; }
    [[nodiscard]] NUM_T ry() const { return arr[1]; }
    [[nodiscard]] NUM_T rz() const { return arr[2]; }
    [[nodiscard]] NUM_T tx() const { return arr[3]; }
    [[nodiscard]] NUM_T ty() const { return arr[4]; }
    [[nodiscard]] NUM_T tz() const { return arr[5]; }
    std::array<NUM_T, 3> rotation() const { return {arr[0], arr[1], arr[2]}; }
    std::array<NUM_T, 3> translation() const { return {arr[3], arr[4], arr[5]}; }

    void rx(const NUM_T &v) { arr[0] = v; }
    void ry(const NUM_T &v) { arr[1] = v; }
    void rz(const NUM_T &v) { arr[2] = v; }
    void tx(const NUM_T &v) { arr[3] = v; }
    void ty(const NUM_T &v) { arr[4] = v; }
    void tz(const NUM_T &v) { arr[5] = v; }

    /** image the point3d by the extrinsics */
    bool imagePoint(const NUM_T (&point3d)[3], NUM_T (&dest)[3]) const {
        ceres::AngleAxisRotatePoint(rotation().data(), point3d, dest);
        dest[0] += tx();
        dest[1] += ty();
        dest[2] += tz();
        return true;
    }

    /** vectors only get rotated, translation would be a scaling */
    bool imageVector(const NUM_T (&vector3d)[3], NUM_T (&dest)[3]) const {
        ceres::AngleAxisRotatePoint(rotation().data(), vector3d, dest);
        return true;
    }

    NUM_T arr[kSize];
};

template<typename NUM_T>
std::ostream &operator<<(std::ostream &lhs, const Extrinsics<NUM_T> &e) {
    lhs << "rx:" << e.rx() << " ry:" << e.ry() << " rz:" << e.rz() << " tx:" << e.tx() << " ty:" << e.ty() << " tz:" <<
            e.tz();
    return lhs;
}


struct Point5D {
    double X, Y, Z; // known 3D
    double u, v; // observed 2D

    [[nodiscard]] std::array<double, 3> get3d() const {
        return {X, Y, Z};
    }

    static Point5D fromArray(const double *array) {
        return Point5D{array[0], array[1], array[2], array[3], array[4]};
    }
};

inline std::ostream &operator<<(std::ostream &lhs, const Point5D &p) {
    lhs << p.X << " " << p.Y << " " << p.Z << " " << p.u << " " << p.v;
    return lhs;
}

struct ConstraintRecord {
    std::string label;
    std::string parameters;
    ceres::ResidualBlockId blockId;
    int intrinsicsBlockIndex = -1;
    int extrinsicsBlockIndex = -1;
};

struct ResidualEvaluationRecord {
    ceres::ResidualBlockId blockId{};
    const ConstraintRecord *constraint = nullptr;
    size_t residualSize = 0;
    double costLoss = 0.0;
    double costNonLoss = 0.0;
    std::vector<double> residualsLoss;
    std::vector<double> residualsNonLoss;
    std::vector<double> intrinsicsJacobian;
    std::vector<double> extrinsicsJacobian;
    bool hasIntrinsicsJacobian = false;
    bool hasExtrinsicsJacobian = false;


};