import { EllipseShape, RectangleShape, VertexShape } from './shapes.mjs'

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
    let $status = $('status')
    if ($status) $status.textContent = `Mode: ${this.name[0].toUpperCase() + this.name.slice(1)}`
    this.svg.classList.add(this.name)
    this.listen(this.doc, 'sidebarShapeClick', (e) => holder.transitionToSelect(e.detail.shape))
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
    this.listen(this.doc.window, 'mousemove', this._move = e => this.onMouseMove(e))
    this.listen(this.doc.window, 'mouseup', this._up = e => this.onMouseUp(e))
  }

  onMouseMove (e) { this.updateShape(getMousePos(e, this.$zoomGroup)) }

  onMouseUp (_e) {
    const el = this.currentElement
    this.doc.save()
    dispatchCustom(this, 'modeTransition', {newMode: SelectionActiveMode, arg: el})
  }
}

export class DrawRectangleMode extends BaseDrawingMode {
  constructor (doc, svg, $zoomGroup) {
    super(doc, 'rect', svg, $zoomGroup)
    this.activationSelector = 'rect-btn'
  }

  createShape (id, start, label) { return new RectangleShape(id, start, label) }

  updateShape (pos) {
    const w = pos.x - this.startPoint.x, h = pos.y - this.startPoint.y
    this.currentElement.setAttributes({
      x: w < 0 ? pos.x : this.startPoint.x,
      width: Math.abs(w),
      y: h < 0 ? pos.y : this.startPoint.y,
      height: Math.abs(h)
    })
  }
}

export class DrawEllipseMode extends BaseDrawingMode {
  constructor (doc, svg, $zoomGroup) {
    super(doc, 'ellipse', svg, $zoomGroup)
    this.activationSelector = 'ellipse-btn'
  }

  createShape (id, start, count) { return new EllipseShape(id, start, count) }

  updateShape (pos) {
    const w = pos.x - this.startPoint.x, h = pos.y - this.startPoint.y
    this.currentElement.setAttributes({
      cx: this.startPoint.x + w / 2, cy: this.startPoint.y + h / 2, rx: Math.abs(w) / 2, ry: Math.abs(h) / 2
    })
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
      dispatchCustom(this, 'modeTransition', {newMode: SelectionActiveMode, arg: newElement})
    })
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
    $('handles-group').style.visibility = 'hidden'
    this.listen(this.svg, 'mousedown', (e) => {
      if (e.target === this.svg || e.target === this.doc.shapesGroup || e.target.closest('#background-group')) {
        holder.transitionToSelect()
      }
    })
    this.listen(this.doc, 'canvasShapeClick', (e) => holder.transitionToSelect(e.detail.shape))
    if (this.doc.bgListItem) {
      this.listen(this.doc.bgListItem, 'mousedown', (e) => e.stopPropagation())
    }
  }
}

export class SelectionActiveMode extends Mode {
  constructor (doc, svg, $zoomGroup, selectedElement, handles = $('handles-group')) {
    super(doc, 'select', svg, $zoomGroup)
    Object.assign(this, {
      selectedElement,
      isRotating: false,
      isResizing: false,
      startPoint: {x: 0, y: 0},
      initialRotation: 0,
      startAngle: 0,
      ellipseHandleAngles: {n: -90, e: 0, s: 90, w: 180},
      activeEllipseHandle: null,
      initialEllipseHandleAngle: 0,
      initialEllipseOppositePoint: null,
      frozenEllipseHandlePositions: null,
      handles,
      activationSelector: 'select-btn'
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
    this.selectedElement.setAttributes({cx, cy, rx, ry})

    if (this.frozenEllipseHandlePositions) {
      Object.entries(this.frozenEllipseHandlePositions).forEach(([handleKey, point]) => {
        if (handleKey === key) return
        const nxNext = (point.x - cx) / Math.max(rx, 1e-6)
        const nyNext = (point.y - cy) / Math.max(ry, 1e-6)
        this.ellipseHandleAngles[handleKey] = Math.atan2(nyNext, nxNext) * 180 / Math.PI
      })
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
  }

  resizeHandleMousedown (e) {
    e.stopPropagation()
    this.doc.pushState()
    this.isResizing = true
    this.resizeDir = e.currentTarget.getAttribute('data-dir') || e.currentTarget.getAttribute('data-ellipse-dir')
    document.body.style.cursor = window.getComputedStyle(e.currentTarget).cursor
    this.startPoint = getMousePos(e, this.$zoomGroup)
    this.initialRect = this.selectedElement.getInitialRect()
    this.activeEllipseHandle = null
    this.initialEllipseOppositePoint = null
    if (this.selectedElement instanceof EllipseShape) {
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
    }
  }

  _keyHandler (e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && !document.querySelector('.entity-item.editing')) {
      this.doc.removeShape(this.selectedElement)
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
      s.setTransform(rot, c.x, c.y)
      this.updateHandles()
    }
    else if (this.isResizing && s) {
      const rot = s.getRotation(), rad = -rot * Math.PI / 180, dx = pos.x - this.startPoint.x,
        dy = pos.y - this.startPoint.y
      if (s instanceof EllipseShape && this.activeEllipseHandle) {
        const c = this.initialRect
        const localPos = this.toLocalPoint(pos, {x: c.cx, y: c.cy}, rot)
        this.updateEllipseResizeFromPointer(localPos)
      }
      else if (s instanceof VertexShape) {
        s.setAttributes({x: pos.x, y: pos.y})
      }
      else {
        s.updateResize(this.initialRect, dx * Math.cos(rad) - dy * Math.sin(rad), dx * Math.sin(rad) + dy * Math.cos(rad), this.resizeDir)
      }
      const c = s.getCenter()
      s.setTransform(rot, c.x, c.y)
      this.updateHandles()
    }
  }

  _up (_e) {
    if (this.isRotating || this.isResizing) {
      if (this.selectedElement) {
        this.doc.save()
      }
      this.isRotating = this.isResizing = false
      this.activeEllipseHandle = null
      this.initialEllipseOppositePoint = null
      this.frozenEllipseHandlePositions = null
      document.body.style.cursor = ''
    }
  }

  activate (holder) {
    super.activate(holder)
    const s = this.selectedElement
    s.el.classList.add('selected')
    this.updateHandles()
    this.doc.updateSelection(s)
    this.listen(this.svg, 'mousedown', (e) => this._down(e))
    this.listen(window, 'mousemove', (e) => this._move(e))
    this.listen(window, 'mouseup', (e) => this._up(e))
    this.listen(window, 'keydown', (e) => this._keyHandler(e))
    this.listen(this.doc, 'deleteShape', (e) => {
      if (e.detail.shape === this.selectedElement) holder.transitionToSelect()
    })
    this.listen(this.doc, 'stateChanged', () => {
      const s_ = this.doc.entities.find(e => e.id === this.selectedElement.id)
      if (s_) {
        this.selectedElement = s_
        this.updateHandles()
      }
      else holder.transitionToSelect()
    })
    this.listen(this.handles.querySelector('.rotate-handle'), 'mousedown', (e) => this.rotateHandleMousedown(e))
    this.handles.querySelectorAll('.handle, .ellipse-handle').forEach(h => {
      this.listen(h, 'mousedown', (e) => this.resizeHandleMousedown(e))
    })
    if (this.selectedElement instanceof VertexShape) {
      this.listen(this.selectedElement.el, 'mousedown', (e) => this.resizeHandleMousedown(e))
    }
    this.listen(this.doc, 'canvasShapeClick', (e) => holder.transitionToSelect(e.detail.shape))
    if (this.doc.bgListItem) {
      this.listen(this.doc.bgListItem, 'mousedown', (e) => e.stopPropagation())
    }
  }

  deactivate () {
    if (this.selectedElement) this.selectedElement.el.classList.remove('selected')
    super.deactivate()
  }

  updateHandles () {
    const s = this.selectedElement, rot = s.getRotation(), c = s.getCenter(), hg = this.handles
    hg.style.visibility = 'visible'
    hg.setAttribute('transform', `rotate(${rot}, ${c.x}, ${c.y})`)
    s.updateHandles(hg, {ellipseHandleAngles: this.ellipseHandleAngles})
  }
}

