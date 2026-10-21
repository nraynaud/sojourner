cmake_minimum_required(VERSION 3.16)
project(ceres_wasm_entry)
enable_language(CXX)

if (NOT CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
    message(WARNING "Use: emcmake cmake -S . -B build")
endif ()

set(CMAKE_CXX_STANDARD 20)
include(CTest)

option(SIMPLEGCOV "Use a minimal coverage." OFF)

# flags that have to be the same everywhere for precompiled headers to work
set(CMAKE_CXX_FLAGS "-mmutable-globals -mmultivalue -mextended-const -mnontrapping-fptoint -mtail-call -mbulk-memory -mbulk-memory-opt -fno-exceptions -msimd128 -msse2 -mrelaxed-simd -Wglobal-constructors -Wexit-time-destructors")
set(CMAKE_CXX_FLAGS_RELEASE "-flto -O3 -DNDEBUG")
set(CMAKE_CXX_FLAGS_DEBUG "-gsource-map -g3 -O0")
set(TARGET WASM128_GENERIC)
include(FetchContent)

FetchContent_Declare(
        Eigen3
        GIT_REPOSITORY https://gitlab.com/libeigen/eigen.git
        GIT_TAG 0fd6b4f71dd85b2009ee4d1aeb296e2c11fc9d68 # Tag 3.3.9
        GIT_SHALLOW TRUE
        OVERRIDE_FIND_PACKAGE
)
FetchContent_Declare(
        Ceres
        GIT_REPOSITORY https://github.com/ceres-solver/ceres-solver.git
        GIT_TAG 85331393dc0dff09f6fb9903ab0c4bfa3e134b01 # release-2.2.0
        GIT_SHALLOW TRUE
        OVERRIDE_FIND_PACKAGE
)
FetchContent_Declare(
        Boost_pfr
        GIT_REPOSITORY https://github.com/boostorg/pfr.git
        GIT_TAG eaa6c064b9051547c6e82d391f4690c43cae95f7 # boost-1.91.0
        GIT_SHALLOW TRUE
        OVERRIDE_FIND_PACKAGE
)

# us a block to avoid polluting the global scope (in particular BUILD_TESTING)
block(SCOPE_FOR VARIABLES POLICIES)
    # eigen 3.3 is so old that cmake errors otherwise
    set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

    set(BUILD_SHARED_LIBS OFF)
    set(BUILD_BENCHMARKS OFF)
    set(BUILD_EXAMPLES OFF)
    set(BUILD_TESTING OFF)
    set(EIGEN_BUILD_BLAS OFF)
    set(EIGEN_USE_BLAS OFF)
    set(EIGEN_BUILD_LAPACK OFF)
    set(EIGEN_BUILD_DOC OFF)
    set(EIGEN_BUILD_DEMOS OFF)
    set(EIGEN_BUILD_PKGCONFIG OFF)
    set(EIGEN_BUILD_CMAKE_PACKAGE ON)
    set(EIGEN_HAS_STD_RESULT_OF OFF)
    set(EIGEN_BUILD_BBLAS OFF)
    set(EIGEN_BUILD_BENCHMARKS OFF)

    set(BOOST_INCLUDE_LIBRARIES core pfr)
    set(CMAKE_POLICY_DEFAULT_CMP0077 NEW)
    # eigen and Ceres uninstall targets names clash
    set(PROVIDE_UNINSTALL_TARGET OFF)

    FetchContent_MakeAvailable(Eigen3 Boost_pfr)
endblock()

# let Ceres find the freshly generated Eigen3Config.cmake
FetchContent_GetProperties(Eigen3)
message(STATUS "eigen3_BINARY_DIR: ${eigen3_BINARY_DIR}")
list(APPEND CMAKE_PREFIX_PATH "${eigen3_BINARY_DIR}")

block(SCOPE_FOR VARIABLES POLICIES)
    # avoid eigen going into the native SIMD intrinsics code path
    target_compile_definitions(eigen INTERFACE EIGEN_DONT_VECTORIZE=1)
    # eigen uses the deprecated std::result_of<>
    target_compile_definitions(eigen INTERFACE EIGEN_HAS_STD_RESULT_OF=0)
    target_compile_definitions(eigen INTERFACE EIGEN_NO_IO=1)
    target_compile_definitions(eigen INTERFACE EIGEN_DONT_PARALLELIZE=1)
    # ceres can't find Eigen3 without this alias
    add_library(Eigen3::Eigen ALIAS eigen)
    add_library(Eigen3 ALIAS eigen)
    # eigen and Ceres uninstall targets names clash
    set(PROVIDE_UNINSTALL_TARGET OFF)

    set(BUILD_SHARED_LIBS OFF)
    set(BUILD_BENCHMARKS OFF)
    set(BUILD_EXAMPLES OFF)
    set(BUILD_TESTING OFF)
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
    set(SCHUR_SPECIALIZATIONS OFF)
    FetchContent_MakeAvailable(Ceres)
    # Ceres just floods the console with warnings otherwise
    target_compile_options(ceres PRIVATE -Wno-everything)
endblock()

set(PCH_INSTANTIATE_TEMPLATES=ON)

set(CMAKE_EXECUTABLE_SUFFIX ".mjs")
add_executable(ceres_app main.cpp reconstruction.h priors.h types.h
        utils.h
        vendor/enchantum_single_header.hpp)
set_target_properties(ceres_app PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_link_libraries(ceres_app PRIVATE Ceres::ceres boost_pfr)
target_compile_options(ceres_app PRIVATE -Wall -Wextra -Wconversion -Wdouble-promotion -relocatable-pch -fmodules-embed-all-files)
target_precompile_headers(ceres_app PRIVATE <ceres/ceres.h> <ceres/covariance.h> <ceres/rotation.h> <boost/pfr/core_name.hpp> "vendor/enchantum_single_header.hpp")
target_link_options(ceres_app PRIVATE
        "SHELL:--no-entry -sMODULARIZE=1 -sEXPORT_ES6=1 -sWASM=1 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,worker,node"
        "SHELL:-sEXPORTED_FUNCTIONS=_malloc,_free,_emscripten_force_exit"
        "SHELL:-sEXPORTED_RUNTIME_METHODS=getValue,setValue,ccall,UTF8ToString,HEAPF64 -Xclang -fdump-record-layouts"
        "SHELL:--emit-tsd ceres_app.d.ts"
        "SHELL:$<$<CONFIG:DEBUG>:-g3>"
)

if (BUILD_TESTING)
    add_executable(test_points_setup test_points_setup.cpp reconstruction.h priors.h types.h
            utils.h
            vendor/enchantum_single_header.hpp)
    set_target_properties(test_points_setup PROPERTIES POSITION_INDEPENDENT_CODE ON)
    target_link_libraries(test_points_setup PRIVATE Ceres::ceres boost_pfr)
    target_compile_options(test_points_setup PRIVATE -Wall -Wextra -Wconversion -Wdouble-promotion -relocatable-pch -fmodules-embed-all-files)
    target_precompile_headers(test_points_setup PRIVATE <ceres/ceres.h> <ceres/covariance.h> <ceres/rotation.h> <boost/pfr/core_name.hpp> "vendor/enchantum_single_header.hpp")
    target_link_options(test_points_setup PRIVATE
            "SHELL:-sWASM=1 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=node,shell"
            "SHELL:-sEXIT_RUNTIME=1 -sFORCE_FILESYSTEM=1"
            "SHELL:$<$<CONFIG:DEBUG>:-g3>"
    )
    add_test(NAME test_points_setup COMMAND test_points_setup)
endif ()

if (SIMPLEGCOV)
    include(GenerateExportHeader)
    generate_export_header(ceres_app)
    target_sources(ceres_app PRIVATE vendor/simplegcov.cpp vendor/simplegcov.h)
    target_link_options(ceres_app PRIVATE "SHELL: --coverage -g -sEXIT_RUNTIME=1 -sFORCE_FILESYSTEM=1 -lnodefs.js -lnoderawfs.js")
    add_compile_options(--coverage -g -fprofile-arcs -ftest-coverage)
    target_compile_definitions(ceres_app PRIVATE SIMPLEGCOV=1)
else ()
    target_link_options(ceres_app PRIVATE
            "SHELL:-sFILESYSTEM=0 -sEVAL_CTORS=2  -sINVOKE_RUN=0 --ignore-dynamic-linking"
            "SHELL:-sALLOW_UNIMPLEMENTED_SYSCALLS=0 -sSTRICT=1 -sDYNAMIC_EXECUTION=0"
            "SHELL:-sTEXTDECODER=2 -sSUPPORT_LONGJMP=0")
endif ()
