import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js'

let scene, renderer, viewerCamera, controls, viewHelper, helperRenderer
let reconstructionGroup = new THREE.Group()
const clock = new THREE.Clock()
let reconCameraRef = null

export function initThreeView(container) {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x222222)

  viewerCamera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100000)
  viewerCamera.position.set(0, 0, 1000)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(viewerCamera, renderer.domElement)

  container.style.position = 'relative'

  const helperContainer = document.createElement('div')
  helperContainer.className = 'view-helper-container'
  container.appendChild(helperContainer)

  helperRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
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

  function animate() {
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

export function updateThreeView(reconstruction, image) {
  reconstructionGroup.clear()

  const { intrinsics, camera, points } = reconstruction

  const width = image ? image.width : (intrinsics.cx * 2)
  const height = image ? image.height : (intrinsics.cy * 2)

  const fov = 2 * Math.atan(height / (2 * intrinsics.fy)) * (180 / Math.PI)
  const aspect = width / height

  const reconCamera = new THREE.PerspectiveCamera(fov, aspect, 10, 5000)
  reconCamera.position.set(camera.position[0], camera.position[1], camera.position[2])
  reconCamera.up.set(camera.up[0], camera.up[1], camera.up[2])
  reconCamera.lookAt(camera.lookAt[0], camera.lookAt[1], camera.lookAt[2])
  reconCamera.updateMatrixWorld()

  reconCameraRef = reconCamera

  const helper = new THREE.CameraHelper(reconCamera)
  reconstructionGroup.add(helper)

  if (image && image.url) {
    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(image.url, (texture) => {
      const D = 1000
      const planeHeight = 2 * D * Math.tan(THREE.MathUtils.degToRad(fov / 2))
      const planeWidth = planeHeight * aspect

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
      reconstructionGroup.add(reconCamera)
    })
  } else {
    reconstructionGroup.add(reconCamera)
  }

  if (points) {
    const geometry = new THREE.BufferGeometry()
    const vertices = []
    for (const p of points) {
      vertices.push(p[0], p[1], p[2])
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    const material = new THREE.PointsMaterial({ color: 0xff0000, size: 50, sizeAttenuation: true })
    const pointCloud = new THREE.Points(geometry, material)
    reconstructionGroup.add(pointCloud)
  }

  viewerCamera.position.copy(reconCamera.position).add(new THREE.Vector3(0, 500, 1000))
  controls.target.copy(reconCamera.position)
  controls.update()
}
