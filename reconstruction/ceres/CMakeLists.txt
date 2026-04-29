cmake_minimum_required(VERSION 3.16)
project(ceres_wasm_entry)
enable_language(CXX)

if (NOT CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
    message(WARNING "Use: emcmake cmake -S . -B build")
endif ()

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_FLAGS_RELEASE "-flto -O3 -DNDEBUG -msse2 -msimd128 -mrelaxed-simd")
set(CMAKE_CXX_FLAGS_DEBUG "-gsource-map -g1 -O0")

include(FetchContent)
# eigen 3.3 is so old that cmake errors otherwise
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

FetchContent_Declare(
        Eigen3
        GIT_REPOSITORY https://gitlab.com/libeigen/eigen.git
        GIT_TAG 0fd6b4f71dd85b2009ee4d1aeb296e2c11fc9d68 # Tag 3.3.9
        GIT_SHALLOW TRUE
        OVERRIDE_FIND_PACKAGE
)
# Eigen stuff
set(BUILD_SHARED_LIBS OFF)
set(BUILD_BENCHMARKS OFF)
set(BUILD_EXAMPLES OFF)
set(BUILD_TESTING OFF)
set(EIGEN_BUILD_BLAS OFF)
set(EIGEN_BUILD_LAPACK OFF)
set(EIGEN_BUILD_DOC OFF)
set(EIGEN_BUILD_DEMOS OFF)
set(EIGEN_BUILD_PKGCONFIG OFF)
set(EIGEN_BUILD_CMAKE_PACKAGE ON)
FetchContent_MakeAvailable(Eigen3)

# ceres can't find Eigen3 without this alias
add_library(Eigen3::Eigen ALIAS eigen)

set(CERES_THREADING_MODEL NO_THREADS)
set(CERES_USE_CXX_THREADS OFF)
set(GFLAGS OFF)
set(GLOG OFF)
set(MINIGLOG ON)
set(SUITESPARSE OFF)
set(CXSPARSE OFF)
set(LAPACK OFF)
set(USE_CUDA OFF)
set(EIGENSPARSE OFF)
# avoid eigen going into the x86 intrinsics code path
add_definitions(-DEIGEN_DONT_VECTORIZE=1)
# eigen and Ceres uninstall targets clash names
set(PROVIDE_UNINSTALL_TARGET OFF)
#  -DCMAKE_EXE_LINKER_FLAGS="\n    -O3\n    -s ALLOW_MEMORY_GROWTH=1\n    -s ENVIRONMENT=web\n    -s MODULARIZE=1\n    -s EXPORT_ES6=1\n    -s SINGLE_FILE=1\n    -s FILESYSTEM=0\n    -s ASSERTIONS=0\n    -s DISABLE_EXCEPTION_CATCHING=1\n

FetchContent_Declare(
        Ceres
        GIT_REPOSITORY https://github.com/ceres-solver/ceres-solver.git
        GIT_TAG 85331393dc0dff09f6fb9903ab0c4bfa3e134b01 # release-2.2.0
        GIT_SHALLOW TRUE
        OVERRIDE_FIND_PACKAGE
)
FetchContent_MakeAvailable(Ceres)

# eigen uses the deprecated std::result_of<>, silencing warning
target_compile_options(ceres PRIVATE -Wno-deprecated)
target_compile_options(ceres_internal PRIVATE -Wno-deprecated)

set(CMAKE_EXECUTABLE_SUFFIX ".mjs")
add_executable(ceres_app main.cpp priors.h types.h)
target_link_libraries(ceres_app PRIVATE Ceres::ceres)
target_compile_options(ceres_app PRIVATE -Wall)
# ---- Emscripten flags ----
target_link_options(ceres_app PRIVATE
        "SHELL:-s MODULARIZE=1 -s EXPORT_ES6=1 -s WASM=1 -s ENVIRONMENT=web,worker,node -s INVOKE_RUN=0"
        "SHELL:-s ALLOW_UNIMPLEMENTED_SYSCALLS=0"
        "SHELL:-s EXPORTED_FUNCTIONS=_malloc,_free,_solve_camera"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPF64"
        "SHELL:$<$<CONFIG:DEBUG>:-g1>")
