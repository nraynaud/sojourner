import moduleCreator from './build/ceres_app.mjs'

const Module = await moduleCreator()

function angleAxisRotatePoint (angleAxis, pt) {
  const theta2 = angleAxis[0] * angleAxis[0] + angleAxis[1] * angleAxis[1] + angleAxis[2] * angleAxis[2]
  if (theta2 > Number.EPSILON) {
    const theta = Math.sqrt(theta2)
    const wx = angleAxis[0] / theta
    const wy = angleAxis[1] / theta
    const wz = angleAxis[2] / theta
    const costheta = Math.cos(theta)
    const sintheta = Math.sin(theta)
    const dot_pt_w = pt[0] * wx + pt[1] * wy + pt[2] * wz
    const cross_pt_w = [
      wy * pt[2] - wz * pt[1],
      wz * pt[0] - wx * pt[2],
      wx * pt[1] - wy * pt[0]
    ]
    return [
      pt[0] * costheta + cross_pt_w[0] * sintheta + wx * dot_pt_w * (1.0 - costheta),
      pt[1] * costheta + cross_pt_w[1] * sintheta + wy * dot_pt_w * (1.0 - costheta),
      pt[2] * costheta + cross_pt_w[2] * sintheta + wz * dot_pt_w * (1.0 - costheta)
    ]
  } else {
    return [pt[0], pt[1], pt[2]]
  }
}

function compute_initial_state (fixedPoints, imageSize, target_fov_deg = 60.0) {
  const count = fixedPoints.length
  const initIntrinsics = [imageSize[0], imageSize[0], imageSize[0] / 2.0, imageSize[1] / 2.0, 0.0]
  const initExtrinsics = [1.047, 0.01, 0.01, -200.0, 200.0, 4500]

  if (count === 0) return { intrinsics: initIntrinsics, extrinsics: initExtrinsics }

  let cx = 0, cy = 0, cz = 0
  for (let i = 0; i < count; ++i) {
    cx += fixedPoints[i][0]
    cy += fixedPoints[i][1]
    cz += fixedPoints[i][2]
  }
  cx /= count
  cy /= count
  cz /= count

  let max_r_sq = 0
  for (let i = 0; i < count; ++i) {
    const dx = fixedPoints[i][0] - cx
    const dy = fixedPoints[i][1] - cy
    const dz = fixedPoints[i][2] - cz
    max_r_sq = Math.max(max_r_sq, dx * dx + dy * dy + dz * dz)
  }
  const radius = Math.sqrt(max_r_sq)

  const fov_rad = target_fov_deg * (Math.PI / 180.0)
  const f = (imageSize[0] / 2.0) / Math.tan(fov_rad / 2.0)
  const distance = (radius * 1.2) / Math.tan(fov_rad / 2.0)

  const centroid = [cx, cy, cz]
  const rotated_centroid = angleAxisRotatePoint([initExtrinsics[0], initExtrinsics[1], initExtrinsics[2]], centroid)

  initExtrinsics[3] = -rotated_centroid[0]
  initExtrinsics[4] = -rotated_centroid[1]
  initExtrinsics[5] = distance - rotated_centroid[2]

  initIntrinsics[0] = f
  initIntrinsics[1] = f

  return { intrinsics: initIntrinsics, extrinsics: initExtrinsics }
}

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
  const intrinsicsPtr = Module._malloc(5 * 8)
  const extrinsicsPtr = Module._malloc(6 * 8)
  const directionsPtr = directionCount ? Module._malloc(directionFloats.length * 8) : 0
  const pointsPtr64 = pointsPtr / 8
  console.log('fixedPoints.length', fixedPoints.length)
  console.log('pointsPtr', pointsPtr.toString(16))
  Module.HEAPF64[pointsPtr64] = fixedPoints.length
  for (let i = 0; i < fixedPoints.length; i++) {
    Module.HEAPF64.set(fixedPoints[i], (1 + pointsPtr / 8) + i * 5)
  }
  Module.HEAPF64.set(imgSize, imgSizePtr / 8)
  const { intrinsics, extrinsics } = compute_initial_state(fixedPoints, imgSize)
  Module.HEAPF64.set(intrinsics, intrinsicsPtr / 8)
  Module.HEAPF64.set(extrinsics, extrinsicsPtr / 8)
  console.log('points[0]', Module.HEAPF64[pointsPtr64])
  Module.HEAPF64.set(directionFloats, directionsPtr / 8)
  Module._solve_camera(imgSizePtr, intrinsicsPtr, extrinsicsPtr, pointsPtr, directionsPtr)
  Module._free(pointsPtr)
  Module._free(imgSizePtr)
  Module._free(intrinsicsPtr)
  Module._free(extrinsicsPtr)
  if (directionsPtr) Module._free(directionsPtr)
  console.timeEnd('ceres')
}
