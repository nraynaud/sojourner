import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js'
import { $, createNS, setAttributes } from './util.mjs'

let scene, renderer, viewerCamera, controls, viewHelper, helperRenderer
let reconstructionGroup = new THREE.Group()
const clock = new THREE.Clock()
let reconCameraRef = null
let projectionPointsMaterial = null

function getProjectionPointsMaterial () {
  if (!projectionPointsMaterial) {
    let texture = null
    const newDoc = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null)
    const newRoot = newDoc.documentElement
    const icon = $('vertex-icon')
    const viewBox = icon.getAttribute('viewBox')
    setAttributes(newRoot, {xmlns: 'http://www.w3.org/2000/svg', viewBox, width: '64', height: '64'})
    const svgStyle = createNS('style', newDoc)
    let allRules = []
    for (const sheet of document.styleSheets) {
      allRules.push(...Array.from(sheet.cssRules).map(rule => rule.cssText))
    }
    svgStyle.textContent = allRules.join('\n')
    newRoot.appendChild(svgStyle)
    const newDefs = createNS('defs', newDoc)
    newRoot.appendChild(newDefs)
    const importedIcon = newDoc.importNode(icon, true)
    newDefs.appendChild(importedIcon)
    newRoot.insertAdjacentHTML('beforeend', '<g id="shapes-group"><use href="#vertex-icon" class="shape vertex-shape"/></g>')
    const svgString = new XMLSerializer().serializeToString(newDoc)
    const textureUrl = URL.createObjectURL(new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'}))
    const textureLoader = new THREE.TextureLoader()
    texture = textureLoader.load(
      textureUrl,
      () => {
        URL.revokeObjectURL(textureUrl)
      }
    )
    texture.colorSpace = THREE.SRGBColorSpace
    projectionPointsMaterial = new THREE.PointsMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      size: 10,
      sizeAttenuation: false
    })
  }
  return projectionPointsMaterial
}

export function initThreeView (container) {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x222222)

  viewerCamera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100000)
  viewerCamera.position.set(0, 0, 1000)

  renderer = new THREE.WebGLRenderer({antialias: true})
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(viewerCamera, renderer.domElement)

  container.style.position = 'relative'

  const helperContainer = document.createElement('div')
  helperContainer.className = 'view-helper-container'
  container.appendChild(helperContainer)

  helperRenderer = new THREE.WebGLRenderer({alpha: true, antialias: true})
  helperRenderer.setSize(128, 128)
  helperContainer.appendChild(helperRenderer.domElement)

  viewHelper = new ViewHelper(viewerCamera, helperContainer)
  viewHelper.center = controls.target

  const camBtn = document.createElement('button')
  camBtn.textContent = '📷'
  camBtn.className = 'recon-cam-btn'
  camBtn.title = 'View from Reconstructed Camera'
  camBtn.addEventListener('pointerdown', e => e.stopPropagation())
  camBtn.addEventListener('pointerup', e => e.stopPropagation())
  camBtn.addEventListener('click', e => {
    e.stopPropagation()
    if (reconCameraRef) {
      viewerCamera.position.copy(reconCameraRef.position)
      viewerCamera.quaternion.copy(reconCameraRef.quaternion)
      viewerCamera.up.copy(reconCameraRef.up)
      viewerCamera.fov = reconCameraRef.fov
      viewerCamera.updateProjectionMatrix()
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(reconCameraRef.quaternion)
      controls.target.copy(reconCameraRef.position).add(forward.multiplyScalar(1000))
      controls.update()
    }
  })
  helperContainer.appendChild(camBtn)

  helperContainer.addEventListener('pointerup', (event) => {
    event.stopPropagation()
    viewHelper.handleClick(event)
  })

  helperContainer.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
  })

  const light = new THREE.AmbientLight(0xffffff)
  scene.add(light)

  scene.add(reconstructionGroup)

  window.addEventListener('resize', () => {
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      viewerCamera.aspect = container.clientWidth / container.clientHeight
      viewerCamera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
  })

  function animate () {
    requestAnimationFrame(animate)
    const delta = clock.getDelta()
    if (viewHelper.animating) {
      viewHelper.update(delta)
    }
    controls.update()
    renderer.render(scene, viewerCamera)
    viewHelper.render(helperRenderer)
  }

  animate()
}

export function updateThreeView (reconstruction, image) {
  reconstructionGroup.clear()

  const {intrinsics, camera, points} = reconstruction

  const width = image ? image.width : (intrinsics.cx * 2)
  const height = image ? image.height : (intrinsics.cy * 2)

  const fov = 2 * Math.atan(height / (2 * intrinsics.fy)) * (180 / Math.PI)
  const aspect = width / height

  const reconCamera = new THREE.PerspectiveCamera(fov, aspect, 10, 5000)
  reconCamera.position.set(camera.position[0], camera.position[1], camera.position[2])
  reconCamera.up.set(camera.up[0], camera.up[1], camera.up[2])
  reconCamera.lookAt(camera.lookAt[0], camera.lookAt[1], camera.lookAt[2])
  reconCamera.updateMatrixWorld()
  reconCamera.projectionMatrix.makePerspective(
    -intrinsics.cx * (reconCamera.near / intrinsics.fx),
    (width - intrinsics.cx) * (reconCamera.near / intrinsics.fx),
    (height - intrinsics.cy) * (reconCamera.near / intrinsics.fy),
    -intrinsics.cy * (reconCamera.near / intrinsics.fy),
    reconCamera.near,
    reconCamera.far
  )
  reconCameraRef = reconCamera

  const helper = new THREE.CameraHelper(reconCamera)
  reconstructionGroup.add(helper)

  const D = 1000

  if (image && image.url) {
    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(image.url, (texture) => {
      const planeWidth = (width / intrinsics.fx) * D
      const planeHeight = (height / intrinsics.fy) * D

      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight)
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthWrite: false
      })
      const plane = new THREE.Mesh(geometry, material)
      plane.renderOrder = -1

      const unitsPerPixel = planeHeight / height
      const dx = (width / 2 - intrinsics.cx) * unitsPerPixel
      const dy = (intrinsics.cy - height / 2) * unitsPerPixel

      plane.position.set(dx, dy, -D)
      reconCamera.add(plane)
    })
  }
  reconstructionGroup.add(reconCamera)

  const projectionMaterial = getProjectionPointsMaterial()
  if (points) {
    const geometry = new THREE.BufferGeometry()
    const vertices = []
    for (const p of points) {
      vertices.push(p[0], p[1], p[2])
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    const pointCloud = new THREE.Points(geometry, projectionMaterial)
    reconstructionGroup.add(pointCloud)

    const lineVertices = []
    const projectionVertices = []
    for (const p of points) {
      const pWorld = new THREE.Vector3(p[0], p[1], p[2])
      const pLocal = pWorld.clone().applyMatrix4(reconCamera.matrixWorldInverse)
      if (pLocal.z < -1e-6) {
        const scale = -D / pLocal.z
        const pPlaneLocal = new THREE.Vector3(pLocal.x * scale, pLocal.y * scale, -D)
        const pPlaneWorld = pPlaneLocal.applyMatrix4(reconCamera.matrixWorld)
        lineVertices.push(pWorld.x, pWorld.y, pWorld.z)
        lineVertices.push(pPlaneWorld.x, pPlaneWorld.y, pPlaneWorld.z)
        projectionVertices.push(pPlaneWorld.x, pPlaneWorld.y, pPlaneWorld.z)
      }
    }

    if (projectionVertices.length > 0) {
      const projGeometry = new THREE.BufferGeometry()
      projGeometry.setAttribute('position', new THREE.Float32BufferAttribute(projectionVertices, 3))
      let projectedMaterial = projectionMaterial.clone()
      projectedMaterial.opacity = 0.6
      projectedMaterial.color.setHex(0x444444)
      const projPoints = new THREE.Points(projGeometry, projectedMaterial)
      reconstructionGroup.add(projPoints)
    }

    if (lineVertices.length > 0) {
      const lineGeometry = new THREE.BufferGeometry()
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lineVertices, 3))
      const lineMaterial = new THREE.LineBasicMaterial({color: 0xff0000, transparent: true, opacity: 0.6})
      const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
      reconstructionGroup.add(lines)
    }
  }

  viewerCamera.position.copy(reconCamera.position).add(new THREE.Vector3(0, 500, 1000))
  controls.target.copy(reconCamera.position)
  controls.update()
}
