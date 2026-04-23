import moduleCreator from './build/ceres_app.mjs'

const Module = await moduleCreator()

export default function runCeres (inputPoints, imgSize) {
  const pointsPtr = Module._malloc(inputPoints.length * 5 * 8)
  for (let i = 1; i < inputPoints.length; i++) {
    Module.HEAPF64.set(inputPoints[i], pointsPtr / 8 + i * 5)
  }
  const imgSizePtr = Module._malloc(2 * 8)
  Module.HEAPF64.set(imgSize, imgSizePtr / 8)
  Module._solve_camera(inputPoints.length, pointsPtr, imgSizePtr)
}
