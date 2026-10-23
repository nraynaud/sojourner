import { DirectionShape, VertexShape } from './shapes.mjs'
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

  /** this is checked before making a transition, used to remove transitions to the currently selected object*/
  allowTransition (nextModeClass, nextModeArg) {
    return true
  }

  /** The current mode dispatches the transition to the next mode so that it can refuse to do it*/
  dispatchModeTransition (newModeClass, newModeArg) {
    if (this.allowTransition(newModeClass, newModeArg)) {
      dispatchCustom(this, 'modeTransition', {newMode: newModeClass, arg: newModeArg})
    }
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
    this.listen(window, 'mousemove', e => this.onMouseMove(e))
    this.listen(window, 'mouseup', e => this.onMouseUp(e))
  }

  onMouseMove (e) { this.updateShape(getMousePos(e, this.$zoomGroup)) }

  onMouseUp (_e) {
    this.doc.saveShapeGeometry(this.currentElement)
    this.holder.transitionToSelect(this.currentElement)
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
      this.dispatchModeTransition(SelectionVertexMode, newElement)
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

  allowTransition (nextModeClass, nextModeArg) {
    // refuse to change from idle to idle
    return nextModeClass !== SelectionIdleMode
  }
}

export class SelectionDirectionMode extends Mode {
  constructor (doc, svg, $zoomGroup, selectedElement) {
    super(doc, 'select', svg, $zoomGroup, selectedElement)
    Object.assign(this, {
      selectedElement,
      isDraggingVertex: false,
      startPoint: {x: 0, y: 0},
      handles: $('direction-handles-group'),
      activationSelector: 'select-btn'
    })
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

  deactivate () {
    this.handles.style.visibility = 'hidden'
    this.doc.updateSelection(null)
    super.deactivate()
  }

  updateVertex (pos) {
    const s = this.selectedElement
    const dx = pos.x - this.startPoint.x,
      dy = pos.y - this.startPoint.y
    s.updateVertex(this.initialRect, dx, dy, this.resizeDir)
  }

  updateHandles () {
    this.selectedElement.updateHandles(this.handles, this)
  }

  getDefaultActions () {
    return 'Drag handles to move endpoints. Press Del or Backspace to delete.'
  }

  allowTransition (nextModeClass, nextModeArg) {
    // refuse to change to the same selected ellipse
    return nextModeClass !== SelectionDirectionMode || nextModeArg !== this.selectedElement
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
        }
        else {
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

  allowTransition (nextModeClass, nextModeArg) {
    // refuse to change to the same selected vertex
    return nextModeClass !== SelectionVertexMode || nextModeArg !== this.selectedElement
  }
}

