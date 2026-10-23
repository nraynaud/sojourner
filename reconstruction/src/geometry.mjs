/**
 *
 * @param vertices
 * @return {{cx: number, cy: number, cz: number, radius: number}|null}
 */
function computeCentroidRadius (vertices) {
  if (vertices.length === 0) return null
  let cx = 0, cy = 0, cz = 0
  for (const item of vertices) {
    cx += item[0]
    cy += item[1]
    cz += item[2]
  }
  cx /= vertices.length
  cy /= vertices.length
  cz /= vertices.length

  let max_r_sq = 0
  for (const item of vertices) {
    const dx = item[0] - cx
    const dy = item[1] - cy
    const dz = item[2] - cz
    max_r_sq = Math.max(max_r_sq, dx * dx + dy * dy + dz * dz)
  }
  return {cx, cy, cz, radius: Math.sqrt(max_r_sq)}
}

/**
 * same as the Ceres C++ function of the same name
 * @param angleAxis {number[]} vec3 of angles
 * @param pt {number[]} vec3 input point
 * @return {number[]|*[]} vec3 point
 */
export function angleAxisRotatePoint (angleAxis, pt) {
  const theta2 = angleAxis[0] * angleAxis[0] + angleAxis[1] * angleAxis[1] + angleAxis[2] * angleAxis[2]
  if (theta2 <= Number.EPSILON)
    return [pt[0], pt[1], pt[2]]

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
