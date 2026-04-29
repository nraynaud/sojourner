import moduleCreator from './build/ceres_app.mjs'

const Module = await moduleCreator()

export default function runCeres (imgSize, fixedPoints, directions) {
  console.time('ceres')
  const directionCount = Object.keys(directions).length
  const directionFloats = [directionCount]
  for (const dir in directions) {
    const direction = directions[dir]
    directionFloats.push(...Object.values(JSON.parse(dir)))
    directionFloats.push(direction.length)
    for (const observation of direction) {
      directionFloats.push(...Object.values(observation))
    }
  }
  console.log('directionFloats', directionFloats)
  const pointsPtr = Module._malloc((1 + fixedPoints.length * 5) * 8)
  const imgSizePtr = Module._malloc(2 * 8)
  const directionsPtr = directionCount ? Module._malloc(directionFloats.length * 8) : 0
  const pointsPtr64 = pointsPtr / 8
  console.log('fixedPoints.length', fixedPoints.length)
  console.log('pointsPtr', pointsPtr.toString(16))
  Module.HEAPF64[pointsPtr64] = fixedPoints.length
  for (let i = 0; i < fixedPoints.length; i++) {
    Module.HEAPF64.set(fixedPoints[i], (1 + pointsPtr / 8) + i * 5)
  }
  Module.HEAPF64.set(imgSize, imgSizePtr / 8)
  console.log('points[0]', Module.HEAPF64[pointsPtr64])
  Module.HEAPF64.set(directionFloats, directionsPtr / 8)
  Module._solve_camera(imgSizePtr, pointsPtr, directionsPtr)
  console.timeEnd('ceres')
}
