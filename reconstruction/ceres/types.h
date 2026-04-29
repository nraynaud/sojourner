#pragma once
#include <ceres/ceres.h>

template<typename NUM_T>
struct Intrinsics {
    static constexpr int kSize = 5;

    explicit Intrinsics(const NUM_T arr[kSize]) : arr{arr[0], arr[1], arr[2], arr[3], arr[4]} {}

    [[nodiscard]] NUM_T fx() const { return arr[0]; }
    [[nodiscard]] NUM_T fy() const { return arr[1]; }
    [[nodiscard]] NUM_T cx() const { return arr[2]; }
    [[nodiscard]] NUM_T cy() const { return arr[3]; }
    [[nodiscard]] NUM_T k1() const { return arr[4]; }

    void fx(const NUM_T &v) { arr[0] = v; }
    void fy(const NUM_T &v) { arr[1] = v; }
    void cx(const NUM_T &v) { arr[2] = v; }
    void cy(const NUM_T &v) { arr[3] = v; }
    void k1(const NUM_T &v) { arr[4] = v; }

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

    NUM_T arr[kSize];
};

template<typename NUM_T>
std::ostream &operator<<(std::ostream &lhs, const Intrinsics<NUM_T> &i) {
    lhs << "fx:" << i.fx() << " fy:" << i.fy() << " cx:" << i.cx() << " cy:" << i.cy() << " k1:" << i.k1();
    return lhs;
}


template<typename NUM_T>
struct Extrinsics {
    static constexpr int kSize = 6;

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
