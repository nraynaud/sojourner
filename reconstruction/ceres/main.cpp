#include "reconstruction.h"
#include <emscripten.h>

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wexit-time-destructors"
#pragma clang diagnostic ignored "-Wglobal-constructors"
// global options that JS functions can edit before running the solver
static ReconstructionProblem rProblem;
#pragma clang diagnostic pop

extern "C" {
[[nodiscard("caller free()"), clang::ownership_returns(malloc), gnu::used]]
char *get_config_layout() {
    return getStructLayout(rProblem.options);
}

[[nodiscard("caller free()"), clang::ownership_returns(malloc), gnu::used]]
char *get_summary_layout() {
    return getStructLayout(rProblem.summary);
}

[[nodiscard("caller free()"), clang::ownership_returns(malloc), gnu::used]]
char *get_InitialProblemParams_layout() {
    const auto params = new InitialProblemParams;
    return getStructLayout(*params);
}

[[nodiscard("caller free()"), clang::ownership_returns(malloc), gnu::used]]
char *get_summary_full_report() {
    return strdup(rProblem.summary.FullReport().c_str());
}

[[gnu::used]]
void fix_intrinsics() {
    rProblem.problem.SetParameterBlockConstant(rProblem.intrinsics.arr);
}

[[gnu::used]]
void release_intrinsics() {
    rProblem.problem.SetParameterBlockVariable(rProblem.intrinsics.arr);
}

[[gnu::used]]
void solve() {
    Solve(rProblem.options, &rProblem.problem, &rProblem.summary);
}

[[gnu::used]]
const double *get_extrinsics() {
    return rProblem.extrinsics.arr;
}

[[nodiscard("caller free()"), clang::ownership_returns(malloc), gnu::used]]
const char *get_intrinsics_json() {
    return strdup(rProblem.intrinsics.to_json().c_str());
}

[[nodiscard("caller free()"), clang::ownership_returns(malloc), gnu::used]]
const char *get_extrinsics_json() {
    return strdup(rProblem.extrinsics.to_json().c_str());
}

[[nodiscard("caller free()"), clang::ownership_returns(malloc), gnu::used]]
const char *get_camera_json() {
    return strdup(rProblem.extrinsics.to_camera_json().c_str());
}

[[nodiscard("caller free()"), clang::ownership_returns(malloc), gnu::used]]
const char *get_points_residuals_json() {
    EvaluationMap evalMap = evaluate_residuals(rProblem.pointConstraints, rProblem.problem);
    return strdup(get_points_residuals_json(evalMap, rProblem.pointConstraints).c_str());
}

[[gnu::used]]
void reset_problem() {
    rProblem.reset();
}

[[gnu::used]]
void prepare_intrinsics(InitialProblemParams *params) {
    params->toReconstructionProblem(rProblem);
}

[[gnu::used]]
void prepare_extrinsics(const double initial_extrinsics[6]) {
    rProblem.extrinsics = Extrinsics(initial_extrinsics);
}

[[gnu::used]]
ResidualBlockId add_point(double x, double y, double z, double u, double v) {
    if (isnan(rProblem.pointReprojectionOutlierThreshold)) {
        std::cerr << "please call prepare_intrinsics() before adding constraints\n";
        abort();
    }
    const Point5D p = Point5D(x, y, z, u, v);
    auto pointRecord = ReprojectionError::add(rProblem.problem, rProblem.intrinsics, rProblem.extrinsics, p,
                                              rProblem.pointReprojectionOutlierThreshold);
    auto record = PositiveDepthConstraint::add(rProblem.problem, rProblem.intrinsics, rProblem.extrinsics, p.get3d());
    rProblem.pointConstraints.push_back(pointRecord);
    rProblem.pointConstraints.push_back(record);
    return pointRecord.blockId;
}

[[gnu::used]]
ResidualBlockId add_point_reprojection_constraint(const double x, const double y, const double z, const double u,
                                                  const double v) {
    if (isnan(rProblem.pointReprojectionOutlierThreshold)) {
        std::cerr << "please call prepare_intrinsics() before adding constraints\n";
        abort();
    }
    const Point5D p = Point5D(x, y, z, u, v);
    const auto pointRecord = ReprojectionError::add(rProblem.problem, rProblem.intrinsics, rProblem.extrinsics, p,
                                                    rProblem.pointReprojectionOutlierThreshold);
    rProblem.pointConstraints.push_back(pointRecord);
    return pointRecord.blockId;
}

[[gnu::used]]
ResidualBlockId add_point_positive_depth_constraint(const double x, const double y, const double z) {
    const auto record = PositiveDepthConstraint::add(rProblem.problem, rProblem.intrinsics, rProblem.extrinsics,
                                                     std::array{x, y, z});
    rProblem.pointConstraints.push_back(record);
    return record.blockId;
}

[[gnu::used]]
ResidualBlockId add_direction(const double dx, const double dy, const double dz, const double u1, const double v1,
                              const double u2, const double v2, const double sigma) {
    if (isnan(rProblem.pointReprojectionOutlierThreshold)) {
        std::cerr << "please call prepare_intrinsics() before adding constraints\n";
        abort();
    }
    std::array currentDirArray = {dx, dy, dz};
    std::array obs = {u1, v1, u2, v2};
    const auto directionRecord = DirectionConstraint::add(rProblem.problem, rProblem.intrinsics, rProblem.extrinsics,
                                                          obs,
                                                          currentDirArray, sigma,
                                                          rProblem.pointReprojectionOutlierThreshold);
    rProblem.directionConstraints.push_back(directionRecord);
    return directionRecord.blockId;
}
}
