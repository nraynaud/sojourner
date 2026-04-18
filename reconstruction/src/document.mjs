import * as shapes from './shapes.mjs'
import Canny from './canny.mjs'
import { $, createNS, setAttributes, dispatchCustom } from './util.mjs'

// indexedDB
const dbName = 'SvgEditorDB', dbStoreName = 'state'
let dbInstance = null

const dbRequest = async req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const dbGetObjStore = async (mode = 'readonly') => (await openDb()).transaction(dbStoreName, mode).objectStore(dbStoreName)
export const dbGet = async key => dbRequest((await dbGetObjStore()).get(key))
export const dbSet = async (key, val) => dbRequest((await dbGetObjStore('readwrite')).put(val, key))

async function openDb () {
  if (dbInstance) return dbInstance
  const req = indexedDB.open(dbName, 1)
  req.onupgradeneeded = (e) => e.target.result.createObjectStore(dbStoreName)
  return dbInstance = await dbRequest(req)
}

export class ReconstructionDocument extends EventTarget {
  constructor (ui) {
    super()
    Object.assign(this, {
      entities: [],
      entityCount: 0,
      entityItemsMap: new Map(),
      images: [],
      currentImageId: null,
      backgroundGroup: $('background-group'),
      shapesGroup: $('shapes-group'),
      entityList: $('entity-list'),
      imageList: $('image-list'),
      svg: $('svg-canvas'),
      undoStack: [],
      redoStack: [],
      ui
    })
  }

  pushState () {
    this.undoStack.push(this.getState())
    this.redoStack = []
    if (this.undoStack.length > 50) this.undoStack.shift()
  }

  getState () {
    return {
      entities: this.entities.map(s => s.toJSON()),
      entityCount: this.entityCount,
      images: this.images.map(img => ({
        id: img.id,
        name: img.name,
        blob: img.blob,
        cannyEnabled: img.cannyEnabled
      })),
      currentImageId: this.currentImageId
    }
  }

  undo () {
    if (this.undoStack.length === 0) return
    this.redoStack.push(this.getState())
    this._applyData(this.undoStack.pop())
  }

  redo () {
    if (this.redoStack.length === 0) return
    this.undoStack.push(this.getState())
    this._applyData(this.redoStack.pop())
  }

  async addImage (blob, name, skipSave = false) {
    if (!skipSave) this.pushState()
    const id = 'img-' + Math.random().toString(36).substr(2, 9)
    const img = {
      id,
      blob,
      name,
      url: URL.createObjectURL(blob),
      cannyEnabled: false,
      cannyURL: null
    }
    this.images.push(img)
    this.updateImageUI()
    if (this.images.length === 1) {
      await this.switchImage(id, true)
    }
    if (!skipSave) this.save()
    return id
  }

  async switchImage (imageId, skipSave = false) {
    if (this.currentImageId === imageId) return
    if (!skipSave) this.pushState()
    this.currentImageId = imageId
    await this._updateBackground()
    this._updateShapesVisibility()
    this.updateImageUI()
    if (!skipSave) this.save()
  }

  async removeImage (imageId, skipSave = false) {
    if (!skipSave) this.pushState()
    const idx = this.images.findIndex(img => img.id === imageId)
    if (idx === -1) return
    const [img] = this.images.splice(idx, 1)
    URL.revokeObjectURL(img.url)
    if (img.cannyURL) URL.revokeObjectURL(img.cannyURL)

    if (this.currentImageId === imageId) {
      this.currentImageId = this.images.length > 0 ? this.images[0].id : null
      await this._updateBackground()
      this._updateShapesVisibility()
    }
    this.updateImageUI()
    if (!skipSave) this.save()
  }

  get currentImage () {
    return this.images.find(img => img.id === this.currentImageId)
  }

  getBackgroundSize () {
    const el = $('backgroundImage')
    if (!el) return {w: 1000, h: 1000} // Default size if no background is set
    return {w: el.width.baseVal.value, h: el.height.baseVal.value}
  }

  async toggleCanny () {
    const img = this.currentImage
    if (!img) return
    img.cannyEnabled = !img.cannyEnabled
    let $canny = $('canny-btn')
    if (img.cannyEnabled && !img.cannyURL) {
      if (img.cannyProcessing) return
      img.cannyProcessing = true
      $canny.textContent = 'Canny (Processing...)'
      try {
        console.time('canny processing')
        const cannyBlob = await Canny.processAsync(img.url)
        img.cannyURL = URL.createObjectURL(cannyBlob)
        console.timeEnd('canny processing')
      } catch (e) {
        console.error('Canny processing failed:', e)
        img.cannyEnabled = false
      } finally {
        img.cannyProcessing = false
        $canny.textContent = 'Canny'
      }
    }
    await this._updateBackground()
    $canny.classList.toggle('active', img.cannyEnabled)
  }

  async _updateBackground () {
    this.backgroundGroup.innerHTML = ''
    const img = this.currentImage
    if (!img) return

    const svgImg = createNS('image'), tempImg = new Image()
    const url = img.cannyEnabled ? img.cannyURL : img.url
    setAttributes(svgImg, {href: url, id: 'backgroundImage'})
    await new Promise(resolve => {
      tempImg.onload = () => {
        setAttributes(svgImg, {width: tempImg.naturalWidth, height: tempImg.naturalHeight})
        this.svg.style.setProperty('--background-width', tempImg.naturalWidth + 'px')
        this.svg.style.setProperty('--background-height', tempImg.naturalHeight + 'px')
        resolve()
      }
      tempImg.src = url
    })
    this.backgroundGroup.appendChild(svgImg)
  }

  _updateShapesVisibility () {
    this.entities.forEach(shape => {
      const geometry = shape.geometries[this.currentImageId]
      if (geometry) {
        shape.el.style.display = ''
        shape.applyGeometry(geometry)
      } else {
        shape.el.style.display = 'none'
      }
    })
  }

  updateImageUI () {
    this.imageList.innerHTML = ''
    this.images.forEach(img => {
      const item = document.createElement('div')
      item.className = 'entity-item' + (img.id === this.currentImageId ? ' selected' : '')
      item.innerHTML = `<div class="drag-handle">⋮</div><div class="name-label">${img.name}</div><div class="delete-btn">×</div>`
      item.onclick = () => this.switchImage(img.id)
      item.onmouseover = () => this.updateStatus(`Click to switch to image: ${img.name}`)
      item.onmouseout = () => this.updateStatus()
      item.querySelector('.delete-btn').onclick = (e) => {
        e.stopPropagation()
        this.removeImage(img.id)
      }
      this.imageList.appendChild(item)
    })
  }

  nextEntityId () {
    this.entityCount++
    return this.entityCount
  }

  getCurrentZoom () {
    return this.ui.getCurrentZoom()
  }

  addShape (shape, skipSave = false) {
    if (!skipSave) this.pushState()
    if (!this.shapesGroup.contains(shape.el))
      this.shapesGroup.appendChild(shape.el)

    // If it's a new shape being drawn, record its initial geometry for the current image
    if (this.currentImageId && !shape.geometries[this.currentImageId]) {
      shape.recordGeometry(this.currentImageId)
    }

    this.entities.push(shape)
    this.addEntityItem(shape)
    shape.el.addEventListener('click', (e) => {
      e.stopPropagation()
      this.dispatchEvent(new CustomEvent('canvasShapeClick', {detail: {shape}}))
    })
    if (!skipSave) this.save()
  }

  saveShapeGeometry (shape) {
    if (this.currentImageId) {
      shape.recordGeometry(this.currentImageId)
      this.save()
    }
  }

  addEntityItem (shape) {
    const id = shape.id, item = document.createElement('div')
    item.className = 'entity-item'
    item.setAttribute('data-id', id)
    item.setAttribute('draggable', 'true')
    item.innerHTML = `<div class="drag-handle">⋮</div><div class="name-label">${shape.name || id}</div><input id="entity-name-${id}" type="text" value="${shape.name || id}"><div class="delete-btn">×</div>`
    item.onclick = (e) => {
      e.stopPropagation()
      this.dispatchEvent(new CustomEvent('sidebarShapeClick', {detail: {shape}}))
    }
    item.ondragstart = (e) => {
      e.dataTransfer.setData('text/plain', id)
      e.dataTransfer.effectAllowed = 'copyMove'
    }
    item.onmouseover = () => {
      this.updateStatus(`Click to select. Drag to canvas to add to current image.`)
      if (shape.el) shape.el.classList.add('hovered')
    }
    item.onmouseout = () => {
      this.updateStatus()
      if (shape.el) shape.el.classList.remove('hovered')
    }
    const label = item.querySelector('.name-label'), input = item.querySelector('input'),
      del = item.querySelector('.delete-btn')
    del.onclick = (e) => {
      e.stopPropagation()
      this.deleteShape(shape)
    }
    const finish = () => {
      const newName = input.value.trim() || id
      if (newName !== (shape.name || id)) {
        this.pushState()
        shape.name = label.textContent = newName
        item.classList.remove('editing')
        this.save()
      }
      else {
        item.classList.remove('editing')
      }
    }
    input.onkeydown = (e) => {
      if (e.key === 'Enter') finish()
      if (e.key === 'Escape') {
        input.value = shape.name || id
        item.classList.remove('editing')
      }
      e.stopPropagation()
    }
    input.onblur = finish
    input.onmousedown = (e) => e.stopPropagation()
    item.ondblclick = (e) => {
      e.stopPropagation()
      item.classList.add('editing')
      input.focus()
      input.select()
    }
    this.entityList.appendChild(item)
    this.entityItemsMap.set(shape, item)
  }

  updateSelection (sel) {
    this.entityItemsMap.forEach((item, s) => {
      item.classList.toggle('selected', s === sel)
      if (s === sel) item.scrollIntoView({behavior: 'smooth', block: 'nearest'})
    })
    this.entities.forEach(s => {
      if (s.el) {
        s.el.classList.toggle('selected', s === sel)
      }
    })
  }

  updateStatus (actions = '') {
    const $actions = $('status-actions')
    if ($actions) $actions.textContent = actions
    if (!actions) {
      this.dispatchEvent(new CustomEvent('requestDefaultStatus'))
    }
  }

  deleteShape (shape) {
    this.pushState()
    this.entities = this.entities.filter(s => s !== shape)
    const item = this.entityItemsMap.get(shape)
    if (item) {
      item.remove()
      this.entityItemsMap.delete(shape)
    }
    if (shape.el && shape.el.parentNode) shape.el.remove()
    dispatchCustom(this, 'deleteShape', {shape})
    this.save()
  }

  async save () {
    const data = {
      entities: this.entities.map(s => s.toJSON()),
      entityCount: this.entityCount,
      images: this.images.map(img => ({
        id: img.id,
        name: img.name,
        blob: img.blob,
        cannyEnabled: img.cannyEnabled
      })),
      currentImageId: this.currentImageId
    }
    try {
      await dbSet('svg-editor-doc', data)
    } catch (e) { console.error('Save to IndexedDB failed:', e) }
  }

  async saveToFile () {
    const z = new JSZip(), d = {
      entities: this.entities.map(s => s.toJSON()),
      entityCount: this.entityCount,
      images: this.images.map(img => ({
        id: img.id,
        name: img.name,
        cannyEnabled: img.cannyEnabled
      })),
      currentImageId: this.currentImageId
    }
    z.file('document.json', JSON.stringify(d))
    const imgFolder = z.folder('images')
    for (const img of this.images) {
      if (img.blob instanceof Blob) {
        imgFolder.file(img.id, img.blob)
      }
    }
    const b = await z.generateAsync({type: 'blob'}), u = URL.createObjectURL(b), a = document.createElement('a')
    a.href = u
    a.download = 'project.zip'
    a.click()
    URL.revokeObjectURL(u)
  }

  async loadFromFile (f) {
    const z = await JSZip.loadAsync(f), jf = z.file('document.json')
    if (!jf) return
    const d = JSON.parse(await jf.async('string'))
    const imgFolder = z.folder('images')
    if (d.images) {
      for (const imgData of d.images) {
        const bf = imgFolder.file(imgData.id)
        if (bf) {
            imgData.blob = await bf.async('blob')
        }
      }
    }
    await this._applyData(d)
  }

  async loadFromDB () {
    const d = await dbGet('svg-editor-doc')
    if (d) await this._applyData(d)
  }

  async _applyData (d) {
    // Revoke old URLs
    this.images.forEach(img => {
      URL.revokeObjectURL(img.url)
      if (img.cannyURL) URL.revokeObjectURL(img.cannyURL)
    })

    Object.assign(this, {
      entities: [],
      entityCount: d.entityCount || 0,
      images: [],
      currentImageId: d.currentImageId || null
    })
    this.shapesGroup.innerHTML = this.entityList.innerHTML = this.imageList.innerHTML = ''
    this.entityItemsMap.clear()

    if (d.images) {
      for (const imgData of d.images) {
        const img = {
          id: imgData.id,
          name: imgData.name,
          blob: imgData.blob,
          url: URL.createObjectURL(imgData.blob),
          cannyEnabled: imgData.cannyEnabled || false,
          cannyURL: null
        }
        this.images.push(img)
      }
    }

    if (d.entities) d.entities.forEach(ent => {
      let s
      if (ent.type === 'rect') {
        s = new shapes.QuadrilateralShape(ent.id, null, 0)
        const x = parseFloat(ent.attributes.x) || 0, y = parseFloat(ent.attributes.y) || 0
        const w = parseFloat(ent.attributes.width) || 0, h = parseFloat(ent.attributes.height) || 0
        const pts = [{x, y}, {x: x + w, y}, {x: x + w, y: y + h}, {x, y: y + h}]
        s.setPoints(pts)
        if (this.currentImageId) s.geometries[this.currentImageId] = { points: pts }
      }
      else if (ent.type === 'quad') {
        s = new shapes.QuadrilateralShape(ent.id, null, 0)
        s.geometries = ent.geometries || {}
        if (ent.attributes && Object.keys(s.geometries).length === 0 && this.currentImageId) {
            s.geometries[this.currentImageId] = { points: ent.attributes.points }
        }
      }
      else if (ent.type === 'ellipse') {
        s = new shapes.EllipseShape(ent.id, null, 0)
        s.geometries = ent.geometries || {}
        if (ent.attributes && Object.keys(s.geometries).length === 0 && this.currentImageId) {
            s.geometries[this.currentImageId] = { attributes: ent.attributes, rotate: ent.rotate }
        }
      }
      else if (ent.type === 'vertex') {
        s = new shapes.VertexShape(ent.id, null, 0, this.getCurrentZoom())
        s.geometries = ent.geometries || {}
        if (ent.attributes && Object.keys(s.geometries).length === 0 && this.currentImageId) {
            s.geometries[this.currentImageId] = { attributes: ent.attributes }
        }
      }
      else return

      s.name = ent.name
      this.addShape(s, true)
    })

    this.updateImageUI()
    await this._updateBackground()
    this._updateShapesVisibility()

    this.dispatchEvent(new CustomEvent('stateChanged'))
    this.save()
  }
}
