import * as shapes from './shapes.mjs'
import Canny from './canny.mjs'

// Utils
export const $ = id => document.getElementById(id)
export const createNS = tag => document.createElementNS('http://www.w3.org/2000/svg', tag)
export const setAttributes = (element, attributes) => Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value))
export const mapObject = (obj, mapper) => Object.fromEntries(Object.entries(obj).map(([key, value]) => mapper(key, value)))
export const invokeLater = work => setTimeout(work, 0)
export const dispatchCustom = (target, evtName, det) => target.dispatchEvent(new CustomEvent(evtName, {detail: det}))

export function getMousePos (evt, svg) {
  const c = svg.getScreenCTM()
  return {x: (evt.clientX - c.e) / c.a, y: (evt.clientY - c.f) / c.d}
}

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
  constructor (window, ui) {
    super()
    Object.assign(this, {
      entities: [],
      entityCount: 0,
      entityItemsMap: new Map(),
      backgroundGroup: $('background-group'),
      shapesGroup: $('shapes-group'),
      entityList: $('entity-list'),
      svg: $('svg-canvas'),
      undoStack: [],
      redoStack: [],
      window, ui
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
      backgroundImage: this.backgroundImage,
      backgroundName: this.backgroundName
    }
  }

  undo () {
    if (this.undoStack.length === 0) return
    this.redoStack.push(this.getState())
    this._applyData(this.undoStack.pop())
    this.dispatchEvent(new CustomEvent('stateChanged'))
  }

  redo () {
    if (this.redoStack.length === 0) return
    this.undoStack.push(this.getState())
    this._applyData(this.redoStack.pop())
    this.dispatchEvent(new CustomEvent('stateChanged'))
  }

  setBackground (blob, name, skipSave = false) {
    if (!skipSave) this.pushState()
    if (this.bgObjectURL) URL.revokeObjectURL(this.bgObjectURL)
    if (this.cannyObjectURL) URL.revokeObjectURL(this.cannyObjectURL)
    Object.assign(this, {backgroundImage: blob, backgroundName: name, cannyEnabled: false})
    this.cannyObjectURL = null
    this.backgroundGroup.innerHTML = ''
    if (blob) {
      this.bgObjectURL = URL.createObjectURL(blob)
      this._updateBackgroundImage()
    }
    this.updateBgListItem()
    if (!skipSave) this.save()
  }

  getBackgroundSize () {
    const el = $('backgroundImage')
    if (!el) return {w: 1000, h: 1000} // Default size if no background is set
    return {w: el.width.baseVal.value, h: el.height.baseVal.value}
  }

  async toggleCanny () {
    if (!this.backgroundImage) return
    this.cannyEnabled = !this.cannyEnabled
    let $canny = $('canny-btn')
    if (this.cannyEnabled && !this.cannyObjectURL) {
      if (this.cannyProcessing) return
      this.cannyProcessing = true
      $canny.textContent = 'Canny (Processing...)'
      try {
        console.time('canny processing including worker overhead')
        const cannyBlob = await (window.Canny || Canny).processAsync(this.bgObjectURL)
        this.cannyObjectURL = URL.createObjectURL(cannyBlob)
        console.timeEnd('canny processing including worker overhead')
      } catch (e) {
        console.error('Canny processing failed:', e)
        this.cannyEnabled = false
      } finally {
        this.cannyProcessing = false
        $canny.textContent = 'Canny'
      }
    }
    this._updateBackgroundImage()
    $canny.classList.toggle('active', this.cannyEnabled)
  }

  _updateBackgroundImage () {
    this.backgroundGroup.innerHTML = ''
    const img = createNS('image'), tempImg = new Image()
    const url = this.cannyEnabled ? this.cannyObjectURL : this.bgObjectURL
    setAttributes(img, {href: url, id: 'backgroundImage'})
    tempImg.onload = () => {
      setAttributes(img, {width: tempImg.naturalWidth, height: tempImg.naturalHeight})
      this.svg.style.setProperty('--background-width', tempImg.naturalWidth + 'px')
      this.svg.style.setProperty('--background-height', tempImg.naturalHeight + 'px')
    }
    tempImg.src = url
    this.backgroundGroup.appendChild(img)
  }

  nextEntityId () {
    this.entityCount++
    return this.entityCount
  }

  getCurrentZoom () {
    return this.ui.getCurrentZoom()
  }

  updateBgListItem () {
    if (!this.backgroundName) {
      if (this.bgListItem) {
        this.bgListItem.remove()
        this.bgListItem = null
      }
      return
    }
    if (!this.bgListItem) {
      this.bgListItem = document.createElement('div')
      this.bgListItem.className = 'entity-item'
      this.bgListItem.style.cssText = 'background:#f0f0f0; border-style:dashed'
      this.bgListItem.innerHTML = '<div class="name-label"></div><div class="delete-btn">×</div>'
      this.bgListItem.querySelector('.delete-btn').onclick = (e) => {
        e.stopPropagation()
        this.setBackground(null, null)
      }
      this.entityList.prepend(this.bgListItem)
    }
    this.bgListItem.querySelector('.name-label').textContent = `Background: ${this.backgroundName}`
  }

  addShape (shape, skipSave = false) {
    if (!skipSave) this.pushState()
    if (!this.shapesGroup.contains(shape.el))
      this.shapesGroup.appendChild(shape.el)
    this.entities.push(shape)
    this.addEntityItem(shape)
    shape.el.addEventListener('click', (e) => {
      e.stopPropagation()
      this.dispatchEvent(new CustomEvent('canvasShapeClick', {detail: {shape}}))
    })
    if (!skipSave) this.save()
  }

  addEntityItem (shape) {
    const id = shape.id, item = document.createElement('div')
    item.className = 'entity-item'
    item.setAttribute('data-id', id)
    item.innerHTML = `<div class="name-label">${shape.name || id}</div><input id="entity-name-${id}" type="text" value="${shape.name || id}"><div class="delete-btn">×</div>`
    item.onclick = (e) => {
      e.stopPropagation()
      this.dispatchEvent(new CustomEvent('sidebarShapeClick', {detail: {shape}}))
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
      backgroundImage: this.backgroundImage,
      backgroundName: this.backgroundName
    }
    try {
      await dbSet('svg-editor-doc', data)
    } catch (e) { console.error('Save to IndexedDB failed:', e) }
  }

  async saveToFile () {
    const z = new JSZip(), d = {
      entities: this.entities.map(s => s.toJSON()),
      entityCount: this.entityCount,
      backgroundName: this.backgroundName
    }
    z.file('document.json', JSON.stringify(d))
    if (this.backgroundImage instanceof Blob) {
      z.file(this.backgroundName || 'background', this.backgroundImage)
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
    if (d.backgroundName) {
      const bf = z.file(d.backgroundName)
      if (bf) d.backgroundImage = await bf.async('blob')
    }
    this._applyData(d)
    // activeMode is expected to be global or provided
    if (typeof activeMode !== 'undefined') activeMode.transitionToSelect()
  }

  async loadFromDB () {
    const d = await dbGet('svg-editor-doc')
    if (d) this._applyData(d)
  }

  _applyData (d) {
    Object.assign(this, {
      entities: [],
      entityCount: d.entityCount || 0,
      bgListItem: null
    })
    this.shapesGroup.innerHTML = this.entityList.innerHTML = ''
    this.entityItemsMap.clear()
    if (d.backgroundImage) this.setBackground(d.backgroundImage, d.backgroundName, true)
    else {
      this.backgroundImage = null
      this.backgroundName = null
      this.backgroundGroup.innerHTML = ''
    }
    if (d.entities) d.entities.forEach(ent => {
      let s
      if (ent.type === 'rect') {
        s = new shapes.QuadrilateralShape(ent.id, null, 0)
        const x = parseFloat(ent.attributes.x) || 0, y = parseFloat(ent.attributes.y) || 0
        const w = parseFloat(ent.attributes.width) || 0, h = parseFloat(ent.attributes.height) || 0
        s.setPoints([{x, y}, {x: x + w, y}, {x: x + w, y: y + h}, {x, y: y + h}])
      }
      else if (ent.type === 'quad') {
        s = new shapes.QuadrilateralShape(ent.id, null, 0)
        s.el.setAttribute('points', ent.attributes.points)
      }
      else if (ent.type === 'ellipse') s = new shapes.EllipseShape(ent.id, null, 0)
      else if (ent.type === 'vertex') s = new shapes.VertexShape(ent.id, null, 0, this.getCurrentZoom())
      else return
      s.name = ent.name
      if (ent.rotate && ent.type !== 'rect' && ent.type !== 'quad') s.el.style.rotate = ent.rotate
      if (ent.type !== 'rect' && ent.type !== 'quad') s.setAttributes(ent.attributes)
      this.addShape(s, true)
    })
    this.save()
  }
}
