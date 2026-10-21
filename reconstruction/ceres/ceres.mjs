console.time('wasm init')
import moduleCreator from './build/ceres_app.mjs'

const Module = await moduleCreator()
console.timeEnd('wasm init')

const TYPE_TO_LLVM_TYPE = {
  'int8': 'i8',
  'int16': 'i16',
  'int32': 'i8',
  'unsigned int8': 'i8',
  'unsigned int16': 'i16',
  'unsigned int32': 'i32',
  'float32': 'float',
  'double64': 'double'
}

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
  }
  else {
    return [pt[0], pt[1], pt[2]]
  }
}

function compute_initial_state (fixedPoints, imageSize, target_fov_deg = 60.0) {
  const count = fixedPoints.length
  const initIntrinsics = {
    imageSizeX: imageSize[0],
    imageSizeY: imageSize[1],
    initialFx: imageSize[0],
    initialFy: imageSize[0],
    initialCx: imageSize[0] / 2.0,
    initialCy: imageSize[1] / 2.0,
    initialK1: 0.0,
    aspectRatioPriorScale: 1.0,
    focalPriorScale: 1.0,
    principalPointCauchyRadius: 1.0
  }
  const initExtrinsics = [1.047, 0.01, 0.01, -200.0, 200.0, 4500]

  if (count === 0) return {intrinsics: initIntrinsics, extrinsics: initExtrinsics}

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

  initIntrinsics.initialFx = f
  initIntrinsics.initialFy = f

  return {intrinsics: initIntrinsics, extrinsics: initExtrinsics}
}

function runStr (fName) {
  let func = Module[fName]
  if (typeof func !== 'function') {
    throw new Error(`Function ${fName} not found`)
  }
  const charPtr = func()
  if (charPtr === 0) return ''
  try {
    return Module.UTF8ToString(charPtr)
  } finally {
    Module._free(charPtr)
  }
}

function runJson (fName) {
  return JSON.parse(runStr(fName))
}

function setLayoutValues (strLayout, valueObj) {
  for (const [key, value] of Object.entries(valueObj)) {
    const layout = strLayout.fields[key]
    const type = TYPE_TO_LLVM_TYPE[layout.type + (layout.len * 8)]
    let addr = strLayout.addr + layout.offset
    console.log('setting', key, value, addr)
    Module.setValue(addr, value, type)
  }
}

export default function runCeres (imgSize, fixedPoints, directions) {
  let optionLayout = runJson('_get_config_layout')
  let summaryLayout = runJson('_get_summary_layout')
  let initialIntrinsicsLayout = runJson('_get_InitialProblemParams_layout')
  console.log('optionLayout', optionLayout)
  console.log('summaryLayout', summaryLayout)
  console.log('initialIntrinsicsLayout', initialIntrinsicsLayout)
  console.time('ceres')
  const options = {}
  options.linear_solver_type = optionLayout.fields.linear_solver_type.enumValues.DENSE_NORMAL_CHOLESKY
  options.use_nonmonotonic_steps = true
  options.jacobi_scaling = true
  options.function_tolerance = 1e-8
  options.gradient_tolerance = 1e-12
  options.parameter_tolerance = 1e-10
  options.max_num_iterations = 200
  options.logging_type = optionLayout.fields.logging_type.enumValues.SILENT
  setLayoutValues(optionLayout, options)
  const directionCount = Object.keys(directions).length
  const directionFloats = [directionCount]
  console.log('directionFloats', directionFloats)
  const intrinsicsPtr = Module._malloc(5 * 8)
  const extrinsicsPtr = Module._malloc(6 * 8)
  console.log('fixedPoints.length', fixedPoints.length)
  const {intrinsics, extrinsics} = compute_initial_state(fixedPoints, imgSize)
  console.log('intrinsics', intrinsics)
  console.log('initialIntrinsicsLayout', initialIntrinsicsLayout)
  setLayoutValues(initialIntrinsicsLayout, intrinsics)
  Module._prepare_intrinsics(initialIntrinsicsLayout.addr)
  Module.HEAPF64.set(extrinsics, extrinsicsPtr / 8)
  Module._prepare_extrinsics(extrinsicsPtr)
  for (let i = 0; i < fixedPoints.length; i++) {
    const id = Module._add_point_reprojection_constraint(...fixedPoints[i])
    console.log('added point', fixedPoints[i])
    const id2 = Module._add_point_positive_depth_constraint(...fixedPoints[i].slice(0, 3))
  }

  for (const dir in directions) {
    const direction = directions[dir]
    console.log('JS adding direction', dir, direction)
    for (const observation of direction) {
      console.log('JS adding obs', observation)
      let jsDir = Object.values(JSON.parse(dir))
      Module._add_direction(...jsDir, ...Object.values(observation), 1.0)
    }
  }


  Module._free(intrinsicsPtr)
  Module._free(extrinsicsPtr)
  Module._fix_intrinsics()
  console.log('about to solve')
  Module._solve()
  console.log('report of extrinsics', runStr('_get_summary_full_report'))
  const termination = Module.getValue(summaryLayout.addr + summaryLayout.fields.termination_type.offset, 'i32')
  if (termination === summaryLayout.fields.termination_type.enumValues.CONVERGENCE) {
    Module._release_intrinsics()
    Module._solve()
    console.log('report of full solve', runStr('_get_summary_full_report'))
  }
  const finalCost = Module.getValue(summaryLayout.addr + summaryLayout.fields.final_cost.offset, 'double')
  let finalIntrinsics = runJson('_get_intrinsics_json')
  console.log('finalIntrinsics', finalIntrinsics)
  const camera = runJson('_get_camera_json')
  console.log('camera', camera)
  console.log('get_points_residuals_json', runJson('_get_points_residuals_json'))
  console.timeEnd('ceres')
  return {intrinsics: finalIntrinsics, camera, points: fixedPoints, finalCost}
}
