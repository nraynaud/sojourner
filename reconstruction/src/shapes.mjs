import * as modes from './modes.mjs'
import { createNS, mapObject, setAttributes } from './util.mjs'

export const SHAPE_INSTALLERS = []

export class Shape {
  constructor (el) {
    this.el = el
    this.id = el.id
    this.geometries = {} // imageId -> geometry
    this.attributes = {} // constant attributes
  }

  get name () { return this.el.getAttribute('data-name') }

  set name (val) { this.el.setAttribute('data-name', val) }

  set2DAttributes (attrs) {
    for (let k in attrs) this.el.setAttribute(k, attrs[k])
  }

  getCenter () {
    const x = parseFloat(this.el.getAttribute('x')), y = parseFloat(this.el.getAttribute('y')),
      w = parseFloat(this.el.getAttribute('width')), h = parseFloat(this.el.getAttribute('height'))
    return {x: x + w / 2, y: y + h / 2}
  }

  getLocalBBox () { return this.getInitialRect() }

  get2DAttributes () { throw 'getAttributes must be implemented' }

  getInitialRect () { throw 'getInitialRect must be implemented' }

  updateResize (rect, lDx, lDy, dir) {}

  applyGeometry (geometry) {
    if (geometry.rotate) this.el.style.rotate = geometry.rotate
    this.set2DAttributes(geometry.attributes)
  }

  recordGeometry (imageId) {
    this.geometries[imageId] = {
      attributes: this.get2DAttributes(),
      rotate: this.el.style.rotate
    }
  }

  createDefaultGeometry (pos) {
    return {
      attributes: {
        x: pos.x - 50,
        y: pos.y - 50,
        width: 100,
        height: 100
      },
      rotate: '0deg'
    }
  }

  toJSON () {throw 'toJSON must be implemented'}
}

export class VertexShape extends Shape {
  constructor (id, start, label) {
    const el = createNS('use')
    setAttributes(el, {
      id,
      href: '#vertex-icon',
      'data-name': `Vertex ${label}`,
      'data-x': start ? start.x : 0,
      'data-y': start ? start.y : 0,
      class: 'shape vertex-shape'
    })
    super(el)
    this.attributes = {x: 0, y: 0, z: 0}
  }

  applyGeometry (geometry) {
    this.set2DAttributes(geometry.attributes)
  }

  recordGeometry (imageId) {
    this.geometries[imageId] = {
      attributes: this.get2DAttributes()
    }
  }

  set2DAttributes (attrs) {
    const localAttrs = {...attrs}
    if (localAttrs.x !== undefined) {
      this.el.setAttribute('data-x', localAttrs.x)
      delete localAttrs.x
    }
    if (localAttrs.y !== undefined) {
      this.el.setAttribute('data-y', localAttrs.y)
      delete localAttrs.y
    }
    super.set2DAttributes(localAttrs)
  }

  get2DAttributes () {
    return {
      x: parseFloat(this.el.getAttribute('data-x')),
      y: parseFloat(this.el.getAttribute('data-y'))
    }
  }

  getCenter () {
    return {x: parseFloat(this.el.getAttribute('data-x')) || 0, y: parseFloat(this.el.getAttribute('data-y')) || 0}
  }

  getLocalBBox () {
    const r = this.getInitialRect()
    const size = 3 // radius 3
    return {x: r.x - size, y: r.y - size, width: 2 * size, height: 2 * size}
  }

  getInitialRect () {
    return mapObject(this.get2DAttributes(), (key, value) => [key, parseFloat(value)])
  }

  toJSON () {
    return {
      type: 'vertex',
      id: this.id,
      name: this.name,
      geometries: this.geometries,
      attributes: this.attributes
    }
  }

  createDefaultGeometry (pos) {
    return {
      attributes: {
        x: pos.x, y: pos.y
      }
    }
  }
}

export class DirectionShape extends Shape {
  constructor (id, start, label) {
    const el = createNS('line')
    const x = start ? start.x : 0, y = start ? start.y : 0
    setAttributes(el, {
      id,
      x1: x, y1: y, x2: x, y2: y,
      'data-name': `Direction ${label}`,
      class: 'shape direction-shape'
    })
    super(el)
    this.attributes = {vx: 0, vy: 0, vz: 1}
  }

  applyGeometry (geometry) {
    this.set2DAttributes(geometry.attributes)
  }

  recordGeometry (imageId) {
    this.geometries[imageId] = {
      attributes: this.get2DAttributes()
    }
  }

  get2DAttributes () {
    return {
      x1: parseFloat(this.el.getAttribute('x1')),
      y1: parseFloat(this.el.getAttribute('y1')),
      x2: parseFloat(this.el.getAttribute('x2')),
      y2: parseFloat(this.el.getAttribute('y2'))
    }
  }

  getCenter () {
    const attrs = this.get2DAttributes()
    return {x: (attrs.x1 + attrs.x2) / 2, y: (attrs.y1 + attrs.y2) / 2}
  }

  getLocalBBox () {
    const a = this.get2DAttributes()
    const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2)
    const width = Math.abs(a.x1 - a.x2), height = Math.abs(a.y1 - a.y2)
    return {x, y, width, height}
  }

  getInitialRect () {
    return this.get2DAttributes()
  }

  updateVertex (initial, lDx, lDy, dir) {
    const attrs = {...initial}
    if (dir === 'start') {
      attrs.x1 += lDx
      attrs.y1 += lDy
    }
    else if (dir === 'end') {
      attrs.x2 += lDx
      attrs.y2 += lDy
    }
    this.set2DAttributes(attrs)
  }

  updateHandles (handlesGroup) {
    const attrs = this.get2DAttributes()
    const hStart = handlesGroup.querySelector('.handle[data-dir="start"]')
    const hEnd = handlesGroup.querySelector('.handle[data-dir="end"]')
    if (hStart) setAttributes(hStart, {x: attrs.x1, y: attrs.y1})
    if (hEnd) setAttributes(hEnd, {x: attrs.x2, y: attrs.y2})
  }

  toJSON () {
    return {
      type: 'direction',
      id: this.id,
      name: this.name,
      geometries: this.geometries,
      attributes: this.attributes
    }
  }

  createDefaultGeometry (pos) {
    return {
      attributes: {
        x1: pos.x - 50, y1: pos.y,
        x2: pos.x + 50, y2: pos.y
      }
    }
  }
}

/**
 *  @abstract
 */
class UIInstaller {
  /**
   * called so that the module can install stuff in the SVG document.
   * @param $svg {SVGElement}
   * @param $svgDefs {SVGDefsElement} the definitions to add templates
   * @param $zoomGroup {SVGGElement} the zoom group, contains everything that will move with the zoom/pan system
   * @abstract
   */
  installSVGStuff ($svg, $svgDefs, $zoomGroup) {}

  /**
   * @param $topBar {HTMLElement} the top button bar
   * @abstract
   */
  installTopBarStuff ($topBar) {}

  /**
   * Shape selection functions, the UI system record all those functions.
   * When a click on a shape is handled, they are tried one after the other, the first one to return a non-null Mode, gets this mode installed.
   *  @return {(function(Shape): Mode|undefined)[]} an array of functions, they will be passed Shapes, the first one to return a Mode
   *  @abstract
   */
  selectionModes () {}

  /**
   * Document parsing handler. The document is a big JSON array containing tagged objects.
   * @return {Object.<string, function(*): [Shape]>} a dictionary of tag to parser.
   * The parser is given the matching document object and returns a (possibly empty) array of parsed Shapes
   * @abstract
   */
  documentShapeReaders () {}

  /**
   * @param doc {ReconstructionDocument}
   * @param scratchPad {Object} is an object that will be passed for all stages of ceres calls, the callee can store its transient data in it own namespace
   * @param CeresModule
   * @abstract
   */
  prepareCeres (doc, scratchPad, CeresModule) {}
}

class VertexShapeInstaller extends UIInstaller {
  /**
   * @param $svg
   * @param $svgDefs SVGDefsElement
   */
  installSVGStuff ($svg, $svgDefs, $zoomGroup) {
    // language=SVG
    const icon = `
        <symbol id="vertex-icon" class="ignoreZoom" viewBox="-6 -6 12 12" height="12" width="12" x="-6" y="-6">
            <circle cx="0" cy="0" r="4"/>
        </symbol>`
    $svgDefs.insertAdjacentHTML('beforeend', icon)
  }

  /**
   * @param $topBar HTMLElement
   */
  installTopBarStuff ($topBar) {
    const btn = $topBar.ownerDocument.createElement('button')
    btn.innerText = 'Vertex'
    btn.id = 'vertex-btn'
    btn.addEventListener('click', () => activeMode.setMode(modes.DrawVertexMode))
    $topBar.prepend(btn)
  }

  selectionModes () {
    return [el => el instanceof VertexShape ? modes.SelectionVertexMode : undefined]
  }

  documentShapeReaders () {
    return {
      'vertex': ent => {
        const s = new VertexShape(ent.id, null, 0)
        s.geometries = ent.geometries || {}
        s.attributes = ent.attributes || {x: 0, y: 0, z: 0}
        s.name = ent.name
        return [s]
      }
    }
  }

  /**
   * @param doc {ReconstructionDocument}
   * @param scratchPad {Object} is an object that will be passed for all stages of ceres calls, the callee can store its transient data in it own namespace
   * @param CeresModule
   */
  prepareCeres (doc, scratchPad, CeresModule) {
    const vertices = doc.shapes.filter(s => s instanceof VertexShape)
    const collectedVertices = []
    for (const vertex of vertices) {
      collectedVertices.push([...Object.values(vertex.attributes), ...Object.values(vertex.get2DAttributes())])
    }
    console.log('collectedVertices', collectedVertices)
    const centroidRadius = computeCentroidRadius(collectedVertices)
  }
}

SHAPE_INSTALLERS.push(new VertexShapeInstaller())

class DirectionShapeInstaller extends UIInstaller {
  /**
   * @param $svg
   * @param $svgDefs SVGDefsElement
   * @param $zoomGroup
   */
  installSVGStuff ($svg, $svgDefs, $zoomGroup) {
    // language=SVG
    const icon = `
        <symbol id="direction-handle-icon" class="ignoreZoom" viewBox="-6 -6 12 12" height="12" width="12" x="-6"
                y="-6">
            <circle cx="0" cy="0" r="5" fill="white" stroke="#007bff" stroke-width="1"/>
        </symbol>`
    $svgDefs.insertAdjacentHTML('beforeend', icon)
    // language=SVG
    let handles = `
        <g id="direction-handles-group" style="visibility: hidden;">
            <use class="handle" data-dir="start" x="0" y="0" href="#direction-handle-icon"/>
            <use class="handle" data-dir="end" x="0" y="0" href="#direction-handle-icon"/>
        </g>`
    $zoomGroup.insertAdjacentHTML('beforeend', handles)
  }

  /**
   * @param $topBar HTMLElement
   */
  installTopBarStuff ($topBar) {
    let btn = $topBar.querySelector('#direction-btn')
    if (!btn) {
      btn = $topBar.ownerDocument.createElement('button')
      btn.innerText = 'Direction'
      btn.id = 'direction-btn'
      btn.addEventListener('click', () => activeMode.setMode(modes.DrawDirectionMode))
      $topBar.prepend(btn)
    }
  }

  selectionModes () {
    return [el => el instanceof DirectionShape ? modes.SelectionDirectionMode : undefined]
  }

  documentShapeReaders () {
    return {
      'direction': ent => {
        const s = new DirectionShape(ent.id, null, 0)
        s.geometries = ent.geometries || {}
        s.attributes = ent.attributes || {vx: 0, vy: 0, vz: 1}
        s.name = ent.name
        return [s]
      }
    }
  }

  /**
   * @param doc {ReconstructionDocument}
   * @param scratchPad {Object} is an object that will be passed for all stages of ceres calls, the callee can store its transient data in it own namespace
   * @param CeresModule
   */
  prepareCeres (doc, scratchPad, CeresModule) {
  }
}

SHAPE_INSTALLERS.push(new DirectionShapeInstaller())




