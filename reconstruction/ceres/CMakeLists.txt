cmake_minimum_required(VERSION 3.16)
project(ceres_wasm_entry)

if(NOT CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
    message(WARNING "Use: emcmake cmake -S . -B build")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_FLAGS "-msse2 -msimd128")

# uncompress the dependencies
file(ARCHIVE_EXTRACT INPUT "${CMAKE_SOURCE_DIR}/ceres-install.zip" DESTINATION "${CMAKE_BINARY_DIR}")
file(ARCHIVE_EXTRACT INPUT "${CMAKE_SOURCE_DIR}/eigen-install.zip" DESTINATION "${CMAKE_BINARY_DIR}")

set(Ceres_DIR "${CMAKE_BINARY_DIR}/ceres-install/lib/cmake/Ceres")
set(Eigen3_DIR "${CMAKE_BINARY_DIR}/eigen-install/share/eigen3/cmake")

find_package(Ceres REQUIRED CONFIG)

set(CMAKE_EXECUTABLE_SUFFIX ".mjs")
add_executable(ceres_app main.cpp)
target_link_libraries(ceres_app PRIVATE Ceres::ceres)

# ---- Emscripten flags ----
set_target_properties(ceres_app PROPERTIES LINK_FLAGS "-O0 -s MODULARIZE=1 -s EXPORT_ES6=1 -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT=web,worker -s EXPORTED_FUNCTIONS=_malloc,_free,_solve_camera -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF64']")
