# WASM32 compilation of Ceres Solver

This directory contains the WASM32 compilation of Ceres Solver, the setup of Cmake with Emscripten is extremely fiddly, so I decided to commit the binaries.

To try to reduce the pain, I got CMake to download the dependencies itself and build them in wasm, since we cross-compile, there is no real point in trying to get the local dependency management to work with cmake.

The code interfacing with JS is in main.cpp, I decided to export everything in C convention and use globals to simplify things up.

There are a few magic functions describing various struct memory layouts; I hope they are not too brittle.

You need to install [emscripten](https://emscripten.org/docs/getting_started/downloads.html) to compile, I personally use the homebrew version on an Intel mac.
## Configure the Cmake build

I personally use the command:
`/usr/local/Cellar/emscripten/6.0.9/bin/emcmake cmake -S . -B build -Wno-author`

## Build the project

I personally use the command:
`cmake --build build -j`

