import { DirectionShape, EllipseShape, QuadrilateralShape, VertexShape } from './shapes.mjs'
import { $, dispatchCustom } from './util.mjs'

export function getMousePos (evt, svg) {
  const c = svg.getScreenCTM()
  return {x: (evt.clientX - c.e) / c.a, y: (evt.clientY - c.f) / c.d}
}

/**
 * Represents the UI Mode of operation.
 * @see https://interactions.acm.org/archive/view/july-august-2012/a-personal-history-of-modeless-text-editing-and-cut-copy-paste
 * @event modeTransition CustomEvent emitted by this object when it wants to transition the UI to another mode
 */

class Mode extends EventTarget {
  constructor (doc, name, svg, $zoomGroup) {
    super()
    Object.assign(this, {doc, name, svg, listeners: [], activationSelector: null, $zoomGroup})
  }

  listen (target, type, fn, opts) {
    target.addEventListener(type, fn, opts)
    this.listeners.push({target, type, fn, opts})
  }

  activate (holder) {
    this.holder = holder
    if (this.activationSelector) $(this.activationSelector).classList.toggle('active', true)
    this.updateStatus()
    this.svg.classList.add(this.name)
    this.listen(this.doc, 'sidebarShapeClick', (e) => holder.transitionToSelect(e.detail.shape))
    this.listen(this.doc, 'requestDefaultStatus', () => this.updateStatus())
    this.listen(window, 'mouseover', (e) => {
      const status = e.target.closest('[data-status]')
      if (status) {
        this.updateStatus(status.getAttribute('data-status'))
      }
    }, true)
    this.listen(window, 'mouseout', (e) => {
      if (e.target.closest('[data-status]')) {
        this.updateStatus()
      }
    }, true)
  }

  updateStatus (actions = '') {
    const $mode = $('status-mode')
    const $actions = $('status-actions')
    if ($mode) $mode.textContent = `Mode: ${this.name[0].toUpperCase() + this.name.slice(1)}`
    if ($actions) $actions.textContent = actions || this.getDefaultActions()
  }

  getDefaultActions () {
    return ''
  }

  deactivate () {
    this.listeners.forEach(({target, type, fn, opts}) => target.removeEventListener(type, fn, opts))
    this.listeners = []
    this.svg.classList.remove(this.name)
    if (this.activationSelector) $(this.activationSelector).classList.toggle('active', false)
  }
}

class BaseDrawingMode extends Mode {
  constructor (doc, name, svg, $zoomGroup) {
    super(doc, name, svg, $zoomGroup)
    Object.assign(this, {startPoint: {x: 0, y: 0}, currentElement: null})
  }

  activate (holder) {
    super.activate(holder)
    this.listen(this.$zoomGroup, 'mousedown', e => this.onMouseDown(e))
  }

  onMouseDown (e) {
    if (e.button !== 0) return
    const pos = getMousePos(e, this.$zoomGroup)
    this.startPoint = pos
    const shapeId = this.doc.nextEntityId()
    this.currentElement = this.createShape(`entity-${shapeId}`, pos, shapeId)
    this.doc.addShape(this.currentElement)
    this.listen(window, 'mousemove', this._move = e => this.onMouseMove(e))
    this.listen(window, 'mouseup', this._up = e => this.onMouseUp(e))
  }

  onMouseMove (e) { this.updateShape(getMousePos(e, this.$zoomGroup)) }

  onMouseUp (_e) {
    const el = this.currentElement
    this.doc.saveShapeGeometry(el)
    let ModeClass = SelectionQuadrilateralMode
    if (el instanceof EllipseShape) ModeClass = SelectionEllipseMode
    if (el instanceof DirectionShape) ModeClass = SelectionDirectionMode
    dispatchCustom(this, 'modeTransition', {newMode: ModeClass, arg: el})
  }
}

export class DrawQuadrilateralMode extends BaseDrawingMode {
  constructor (doc, svg, $zoomGroup) {
    super(doc, 'quad', svg, $zoomGroup)
    this.activationSelector = 'rect-btn'
  }

  createShape (id, pos, label) {
    return new QuadrilateralShape(id, pos, label)
  }

  updateShape (pos) {
    this.currentElement.setPoints([
      this.startPoint, {x: pos.x, y: this.startPoint.y},
      pos, {x: this.startPoint.x, y: pos.y}
    ])
  }

  getDefaultActions () {
    return 'Click and drag to draw a quadrilateral.'
  }
}

export class DrawEllipseMode extends BaseDrawingMode {
  constructor (doc, svg, $zoomGroup) {
    super(doc, 'ellipse', svg, $zoomGroup)
    this.activationSelector = 'ellipse-btn'
  }

  createShape (id, pos, label) {
    return new EllipseShape(id, pos, label)
  }

  updateShape (pos) {
    const rx = Math.abs(pos.x - this.startPoint.x) / 2
    const ry = Math.abs(pos.y - this.startPoint.y) / 2
    const cx = (pos.x + this.startPoint.x) / 2
    const cy = (pos.y + this.startPoint.y) / 2
    this.currentElement.set2DAttributes({cx, cy, rx, ry})
  }

  getDefaultActions () {
    return 'Click and drag to draw an ellipse.'
  }
}

export class DrawDirectionMode extends BaseDrawingMode {
  constructor (doc, svg, $zoomGroup) {
    super(doc, 'direction', svg, $zoomGroup)
    this.activationSelector = 'direction-btn'
  }

  createShape (id, pos, label) {
    return new DirectionShape(id, pos, label)
  }

  updateShape (pos) {
    this.currentElement.set2DAttributes({
      x1: this.startPoint.x, y1: this.startPoint.y,
      x2: pos.x, y2: pos.y
    })
  }

  getDefaultActions () {
    return 'Click and drag to draw a direction segment.'
  }
}

export class DrawVertexMode extends Mode {
  constructor (doc, svg, $zoomGroup) {
    super(doc, 'vertex', svg, $zoomGroup)
    this.activationSelector = 'vertex-btn'
  }

  activate (holder) {
    super.activate(holder)
    this.listen(this.$zoomGroup, 'click', e => {
      if (e.button !== 0) return
      const shapeId = this.doc.nextEntityId()
      const newElement = new VertexShape(`entity-${shapeId}`, getMousePos(e, this.$zoomGroup), shapeId)
      this.doc.addShape(newElement)
      this.doc.saveShapeGeometry(newElement)
      dispatchCustom(this, 'modeTransition', {newMode: SelectionVertexMode, arg: newElement})
    })
  }

  getDefaultActions () {
    return 'Click anywhere to place a vertex.'
  }
}

export class SelectionIdleMode extends Mode {
  constructor (doc, svg, $zoomGroup) {
    super(doc, 'select', svg, $zoomGroup)
    this.activationSelector = 'select-btn'
  }

  activate (holder) {
    super.activate(holder)
    this.doc.updateSelection(null)
    this.listen(this.svg, 'mousedown', (e) => {
      if (e.target === this.svg || e.target === this.doc.shapesGroup || e.target.closest('#background-group')) {
        holder.transitionToSelect()
      }
    })
    this.listen(this.doc, 'canvasShapeClick', (e) => holder.transitionToSelect(e.detail.shape))
    if (this.doc.bgListItem) {
      this.listen(this.doc.bgListItem, 'mousedown', (e) => e.stopPropagation())
    }

    const updateActions = (e) => {
      const shapeEl = e.target.closest('.shape')
      if (shapeEl) {
        const shapeId = shapeEl.id
        const shape = this.doc.entities.find(s => s.id === shapeId)
        if (shape) {
          this.updateStatus(`Click to select ${shape.name || shape.id}.`)
          return
        }
      }
      this.updateStatus()
    }
    this.listen(this.svg, 'mouseover', updateActions)
    this.listen(this.svg, 'mouseout', () => this.updateStatus())
  }

  getDefaultActions () {
    return 'Click a shape to select it, or drag entities from the panel.'
  }
}

export class SelectionQuadrilateralMode extends Mode {
  constructor (doc, svg, $zoomGroup, selectedElement, handles = $('quad-handles-group')) {
    super(doc, 'select', svg, $zoomGroup)
    Object.assign(this, {
      selectedElement,
      isDraggingVertex: false,
      startPoint: {x: 0, y: 0},
      handles,
      activationSelector: 'select-btn'
    })
  }

  updateVertex (pos) {
    const s = this.selectedElement
    const dx = pos.x - this.startPoint.x,
      dy = pos.y - this.startPoint.y
    s.updateVertex(this.initialRect, dx, dy, this.resizeDir)
  }

  activate (holder) {
    super.activate(holder)
    const s = this.selectedElement
    this.doc.updateSelection(s)
    this.handles.style.visibility = ''
    this.updateHandles()
    this.listen(this.svg, 'mousedown', (e) => {
      if (e.target.closest('#background-group')) {
        this.holder.transitionToSelect()
        return
      }
      if (e.target === this.svg || e.target === this.doc.shapesGroup) {
        this.holder.transitionToSelect()
      }
    })
    this.listen(window, 'mousemove', (e) => {
      const pos = getMousePos(e, this.$zoomGroup), s = this.selectedElement
      if (this.isDraggingVertex && s) {
        this.updateVertex(pos)
        this.updateHandles()
      }
    })
    this.listen(window, 'mouseup', (_e) => {
      if (this.isDraggingVertex) {
        if (this.selectedElement) {
          this.doc.saveShapeGeometry(this.selectedElement)
        }
        this.isDraggingVertex = false
        document.body.style.cursor = ''
        this.updateStatus()
      }
    })
    this.listen(window, 'keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace')) {
        this.doc.removeShapeGeometry(this.selectedElement)
      }
    })
    this.listen(this.doc, 'deleteShape', (e) => {
      if (e.detail.shape === this.selectedElement) holder.transitionToSelect()
    })
    this.listen(this.doc, 'stateChanged', () => {
      const s_ = this.doc.entities.find(e => e.id === this.selectedElement.id)
      if (s_ && s_.geometries[this.doc.currentImageId]) {
        this.selectedElement = s_
        this.updateHandles()
      }
      else holder.transitionToSelect()
    })
    this.handles.querySelectorAll('.handle').forEach(h => {
      this.listen(h, 'mousedown', (e) => {
        e.stopPropagation()
        this.doc.pushState()
        this.isDraggingVertex = true
        this.resizeDir = e.currentTarget.getAttribute('data-dir') || e.currentTarget.getAttribute('data-ellipse-dir')
        document.body.style.cursor = window.getComputedStyle(e.currentTarget).cursor
        this.startPoint = getMousePos(e, this.$zoomGroup)
        this.initialRect = this.selectedElement.getInitialRect()
        this.updateStatus(`Dragging vertex ${this.resizeDir}.`)
      })
    })
    this.listen(this.doc, 'canvasShapeClick', (e) => holder.transitionToSelect(e.detail.shape))
    if (this.doc.bgListItem) {
      this.listen(this.doc.bgListItem, 'mousedown', (e) => e.stopPropagation())
    }

    const updateActions = (e) => {
      if (this.isDraggingVertex) return
      const handle = e.target.closest('.handle')
      if (handle) {
        this.updateStatus(`Drag to move vertex ${handle.getAttribute('data-dir')}.`)
        return
      }
      const shapeEl = e.target.closest('.shape')
      if (shapeEl && shapeEl.id !== this.selectedElement.id) {
        const shape = this.doc.entities.find(s => s.id === shapeEl.id)
        this.updateStatus(`Click to select ${shape ? shape.name : shapeEl.id}.`)
        return
      }
      this.updateStatus()
    }
    this.listen(this.svg, 'mouseover', updateActions)
    this.listen(this.svg, 'mouseout', () => { if (!this.isDraggingVertex) this.updateStatus() })
  }

  getDefaultActions () {
    return 'Drag vertices to reshape. Press Del or Backspace to delete.'
  }

  deactivate () {
    this.handles.style.visibility = 'hidden'
    this.doc.updateSelection(null)
    super.deactivate()
  }

  updateHandles () {
    this.selectedElement.updateHandles(this.handles, this)
  }
}

export class SelectionDirectionMode extends SelectionQuadrilateralMode {
  constructor (doc, svg, $zoomGroup, selectedElement) {
    super(doc, svg, $zoomGroup, selectedElement, $('direction-handles-group'))
  }

  getDefaultActions () {
    return 'Drag handles to move endpoints. Press Del or Backspace to delete.'
  }
}

export class SelectionEllipseMode extends Mode {
  constructor (doc, svg, $zoomGroup, selectedElement, handles = $('ellipse-handles-group')) {
    super(doc, 'select', svg, $zoomGroup)
    Object.assign(this, {
      selectedElement,
      isRotating: false,
      isResizing: false,
      startPoint: {x: 0, y: 0},
      initialRotation: 0,
      startAngle: 0,
      handles,
      activationSelector: 'select-btn',
      ellipseHandleAngles: {n: -90, e: 0, s: 90, w: 180},
      activeEllipseHandle: null,
      initialEllipseHandleAngle: 0,
      initialEllipseOppositePoint: null,
      frozenEllipseHandlePositions: null
    })
  }

  toLocalPoint (point, center, rotDeg) {
    const rad = -rotDeg * Math.PI / 180
    const dx = point.x - center.x
    const dy = point.y - center.y
    return {
      x: center.x + dx * Math.cos(rad) - dy * Math.sin(rad), y: center.y + dx * Math.sin(rad) + dy * Math.cos(rad)
    }
  }

  rotateHandleMousedown (e) {
    e.stopPropagation()
    this.doc.pushState()
    this.isRotating = true
    document.body.style.cursor = 'grabbing'
    const pos = getMousePos(e, this.$zoomGroup), c = this.selectedElement.getCenter()
    this.initialRotation = this.selectedElement.getRotation()
    this.startAngle = Math.atan2(pos.y - c.y, pos.x - c.x) * 180 / Math.PI
    this.updateStatus('Rotating ellipse.')
  }

  resizeHandleMousedown (e) {
    e.stopPropagation()
    this.doc.pushState()
    this.isResizing = true
    this.resizeDir = e.currentTarget.getAttribute('data-dir') || e.currentTarget.getAttribute('data-ellipse-dir')
    document.body.style.cursor = window.getComputedStyle(e.currentTarget).cursor
    this.startPoint = getMousePos(e, this.$zoomGroup)
    this.initialRect = this.selectedElement.getInitialRect()

    const handleKey = e.currentTarget.getAttribute('data-ellipse-dir')
    if (handleKey) {
      const angleDeg = this.ellipseHandleAngles[handleKey]
      const angleRad = angleDeg * Math.PI / 180
      this.activeEllipseHandle = handleKey
      this.initialEllipseHandleAngle = angleDeg
      this.initialEllipseOppositePoint = {
        x: this.initialRect.cx - this.initialRect.rx * Math.cos(angleRad),
        y: this.initialRect.cy - this.initialRect.ry * Math.sin(angleRad)
      }
      this.frozenEllipseHandlePositions = {}
      Object.entries(this.ellipseHandleAngles).forEach(([k, deg]) => {
        if (k === handleKey) return
        const rad = deg * Math.PI / 180
        this.frozenEllipseHandlePositions[k] = {
          x: this.initialRect.cx + this.initialRect.rx * Math.cos(rad),
          y: this.initialRect.cy + this.initialRect.ry * Math.sin(rad)
        }
      })
    }
    this.updateStatus(`Resizing ellipse via ${this.resizeDir} handle.`)
  }

  _keyHandler (e) {
    if ((e.key === 'Delete' || e.key === 'Backspace')) {
      this.doc.removeShapeGeometry(this.selectedElement)
    }
  }

  _down (e) {
    if (e.target === this.svg || e.target === this.doc.shapesGroup || e.target.closest('#background-group')) {
      this.holder.transitionToSelect()
    }
  }

  _move (e) {
    const pos = getMousePos(e, this.$zoomGroup), s = this.selectedElement
    if (this.isRotating && s) {
      const c = s.getCenter(),
        rot = this.initialRotation + (Math.atan2(pos.y - c.y, pos.x - c.x) * 180 / Math.PI - this.startAngle)
      s.setRotation(rot)
      this.updateHandles()
    }
    else if (this.isResizing && s) {
      this.updateResize(pos)
      const rot = s.getRotation()
      s.setRotation(rot)
      this.updateHandles()
    }
  }

  updateResize (pos) {
    if (this.activeEllipseHandle) {
      const rot = this.selectedElement.getRotation()
      const c = this.initialRect
      const localPos = this.toLocalPoint(pos, {x: c.cx, y: c.cy}, rot)
      this.updateEllipseResizeFromPointer(localPos)
    }
    else {
      const s = this.selectedElement
      const rot = s.getRotation(), rad = -rot * Math.PI / 180, dx = pos.x - this.startPoint.x,
        dy = pos.y - this.startPoint.y
      s.updateResize(this.initialRect, dx * Math.cos(rad) - dy * Math.sin(rad), dx * Math.sin(rad) + dy * Math.cos(rad), this.resizeDir)
    }
  }

  updateEllipseResizeFromPointer (localPos) {
    const r = this.initialRect
    const key = this.activeEllipseHandle
    if (!(r && key && this.initialEllipseOppositePoint)) return
    const opp = this.initialEllipseOppositePoint
    const nx = (localPos.x - r.cx) / Math.max(r.rx, 1e-6)
    const ny = (localPos.y - r.cy) / Math.max(r.ry, 1e-6)
    const angleRad = Math.atan2(ny, nx)
    this.ellipseHandleAngles[key] = angleRad * 180 / Math.PI
    const cx = (localPos.x + opp.x) / 2
    const cy = (localPos.y + opp.y) / 2
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)
    const safeCos = Math.max(Math.abs(cosA), 1e-3)
    const safeSin = Math.max(Math.abs(sinA), 1e-3)
    const rx = Math.max(1, Math.abs((localPos.x - opp.x) / (2 * safeCos)))
    const ry = Math.max(1, Math.abs((localPos.y - opp.y) / (2 * safeSin)))
    this.selectedElement.set2DAttributes({cx, cy, rx, ry})

    if (this.frozenEllipseHandlePositions) {
      Object.entries(this.frozenEllipseHandlePositions).forEach(([handleKey, point]) => {
        if (handleKey === key) return
        const nxNext = (point.x - cx) / Math.max(rx, 1e-6)
        const nyNext = (point.y - cy) / Math.max(ry, 1e-6)
        this.ellipseHandleAngles[handleKey] = Math.atan2(nyNext, nxNext) * 180 / Math.PI
      })
    }
  }

  _up (_e) {
    if (this.isRotating || this.isResizing) {
      if (this.selectedElement) {
        this.doc.saveShapeGeometry(this.selectedElement)
      }
      this.isRotating = this.isResizing = false
      document.body.style.cursor = ''
      this.updateStatus()
    }
    if (!this.isRotating && !this.isResizing) {
      this.activeEllipseHandle = null
      this.initialEllipseOppositePoint = null
      this.frozenEllipseHandlePositions = null
    }
  }

  activate (holder) {
    super.activate(holder)
    const s = this.selectedElement
    this.doc.updateSelection(s)
    this.handles.style.visibility = ''
    this.updateHandles()
    this.listen(this.svg, 'mousedown', (e) => this._down(e))
    this.listen(window, 'mousemove', (e) => this._move(e))
    this.listen(window, 'mouseup', (e) => this._up(e))
    this.listen(window, 'keydown', (e) => this._keyHandler(e))
    this.listen(this.doc, 'deleteShape', (e) => {
      if (e.detail.shape === this.selectedElement) holder.transitionToSelect()
    })
    this.listen(this.doc, 'stateChanged', () => {
      const s_ = this.doc.entities.find(e => e.id === this.selectedElement.id)
      if (s_ && s_.geometries[this.doc.currentImageId]) {
        this.selectedElement = s_
        this.updateHandles()
      }
      else holder.transitionToSelect()
    })
    const rh = this.handles.querySelector('.rotate-handle')
    if (rh) this.listen(rh, 'mousedown', (e) => this.rotateHandleMousedown(e))
    this.handles.querySelectorAll('.handle, .ellipse-handle').forEach(h => {
      this.listen(h, 'mousedown', (e) => this.resizeHandleMousedown(e))
    })
    this.listen(this.doc, 'canvasShapeClick', (e) => holder.transitionToSelect(e.detail.shape))
    if (this.doc.bgListItem) {
      this.listen(this.doc.bgListItem, 'mousedown', (e) => e.stopPropagation())
    }

    const updateActions = (e) => {
      if (this.isRotating || this.isResizing) return
      const handle = e.target.closest('.handle, .ellipse-handle')
      if (handle) {
        this.updateStatus(`Drag to resize ellipse via ${handle.getAttribute('data-ellipse-dir') || handle.getAttribute('data-dir')} handle.`)
        return
      }
      const rotateHandle = e.target.closest('.rotate-handle')
      if (rotateHandle) {
        this.updateStatus('Drag to rotate ellipse.')
        return
      }
      const shapeEl = e.target.closest('.shape')
      if (shapeEl && shapeEl.id !== this.selectedElement.id) {
        const shape = this.doc.entities.find(s => s.id === shapeEl.id)
        this.updateStatus(`Click to select ${shape ? shape.name : shapeEl.id}.`)
        return
      }
      this.updateStatus()
    }
    this.listen(this.svg, 'mouseover', updateActions)
    this.listen(this.svg, 'mouseout', () => { if (!this.isRotating && !this.isResizing) this.updateStatus() })
  }

  getDefaultActions () {
    return 'Drag handles to resize or rotate. Press Del or Backspace to delete.'
  }

  deactivate () {
    this.handles.style.visibility = 'hidden'
    this.doc.updateSelection(null)
    super.deactivate()
  }

  updateHandles () {
    const s = this.selectedElement, rot = s.getRotation(), c = s.getCenter(), hg = this.handles
    hg.style.transformOrigin = `${c.x}px ${c.y}px`
    hg.style.rotate = `${rot}deg`
    s.updateHandles(hg, {ellipseHandleAngles: this.ellipseHandleAngles})
  }
}

export class SelectionVertexMode extends Mode {
  constructor (doc, svg, $zoomGroup, selectedElement) {
    super(doc, 'select', svg, $zoomGroup)
    Object.assign(this, {
      selectedElement, isTranslating: false, activationSelector: 'select-btn'
    })
  }

  activate (holder) {
    super.activate(holder)
    let s = this.selectedElement
    s.el.style.cursor = 'move'
    this.doc.updateSelection(s)
    this.listen(s.el, 'mousedown', (e) => {
      if (e.button !== 0) return
      e.stopPropagation()
      this.doc.pushState()
      this.isTranslating = true
      this.updateStatus(`Translating vertex ${s.name || s.id}.`)
    })
    this.listen(window, 'mousemove', (e) => {
      const pos = getMousePos(e, this.$zoomGroup)
      if (this.isTranslating) s.set2DAttributes(pos)
    })
    this.listen(window, 'mouseup', (_e) => {
      if (this.isTranslating) {
        this.doc.saveShapeGeometry(this.selectedElement)
        this.doc.save()
        this.isTranslating = false
        this.updateStatus()
      }
    })
    this.listen(window, 'keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') this.doc.removeShapeGeometry(this.selectedElement)
      if (e.key === 'Escape') holder.transitionToSelect()
    })
    this.listen(this.doc, 'deleteShape', (e) => {
      if (e.detail.shape === s) holder.transitionToSelect()
    })
    this.listen(this.doc, 'stateChanged', () => {
      const s_ = this.doc.entities.find(e => e.id === s.id)
      if (s_ && s_.geometries[this.doc.currentImageId]) {s = this.selectedElement = s_}
      else holder.transitionToSelect()
    })
    this.listen(this.doc, 'canvasShapeClick', (e) => holder.transitionToSelect(e.detail.shape))

    const updateActions = (e) => {
      if (this.isTranslating) return
      const shapeEl = e.target.closest('.shape')
      if (shapeEl) {
        if (shapeEl.id === s.id) {
          this.updateStatus('Drag to move vertex.')
        } else {
          const shape = this.doc.entities.find(s => s.id === shapeEl.id)
          this.updateStatus(`Click to select ${shape ? shape.name : shapeEl.id}.`)
        }
        return
      }
      this.updateStatus()
    }
    this.listen(this.svg, 'mouseover', updateActions)
    this.listen(this.svg, 'mouseout', () => { if (!this.isTranslating) this.updateStatus() })
  }

  getDefaultActions () {
    return 'Drag the vertex to move it. Press Del or Backspace to delete.'
  }

  deactivate () {
    this.doc.updateSelection(null)
    this.selectedElement.el.style.cursor = ''
    super.deactivate()
  }
}

