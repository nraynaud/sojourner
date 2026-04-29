import { createNS, mapObject, setAttributes } from './util.mjs'

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

export class QuadrilateralShape extends Shape {
  constructor (id, start, label) {
    const el = createNS('polygon')
    const x = start ? start.x : 0, y = start ? start.y : 0
    setAttributes(el, {
      id,
      points: `${x},${y} ${x},${y} ${x},${y} ${x},${y}`,
      'data-name': `Quadrilateral ${label}`,
      class: 'shape'
    })
    super(el)
  }

  applyGeometry (geometry) {
    this.setPoints(geometry.points)
  }

  recordGeometry (imageId) {
    this.geometries[imageId] = {
      points: this.getPoints()
    }
  }

  createDefaultGeometry (pos) {
    const x = pos.x, y = pos.y
    return {
      points: [
        {x: x - 50, y: y - 50}, {x: x + 50, y: y - 50},
        {x: x + 50, y: y + 50}, {x: x - 50, y: y + 50}
      ]
    }
  }

  getPoints () {
    const pts = this.el.getAttribute('points').split(/\s+/).filter(p => p)
    return pts.map(p => {
      const [x, y] = p.split(',').map(parseFloat)
      return {x, y}
    })
  }

  setPoints (points) {
    if (Array.isArray(points)) {
      this.el.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '))
    }
    else if (typeof points === 'string') {
      this.el.setAttribute('points', points)
    }
  }

  getCenter () {
    const pts = this.getPoints()
    return pts.reduce((acc, p) => ({x: acc.x + p.x / 4, y: acc.y + p.y / 4}), {x: 0, y: 0})
  }

  toJSON () {
    return {
      type: 'quad',
      id: this.id,
      name: this.name,
      geometries: this.geometries,
      attributes: this.attributes
    }
  }

  get2DAttributes () {
    return {
      points: this.el.getAttribute('points')
    }
  }

  getInitialRect () {
    return {points: this.getPoints()}
  }

  updateVertex (initial, lDx, lDy, dir) {
    const pts = [...initial.points]
    const idx = {nw: 0, ne: 1, se: 2, sw: 3}[dir]
    if (idx !== undefined) {
      pts[idx] = {x: pts[idx].x + lDx, y: pts[idx].y + lDy}
    }
    this.setPoints(pts)
  }

  updateHandles (handlesGroup, _ctx) {
    const pts = this.getPoints()
    handlesGroup.querySelectorAll('.handle').forEach((h, idx) => {
      setAttributes(h, {x: pts[idx].x, y: pts[idx].y})
    })
  }
}

export class EllipseShape extends Shape {
  constructor (id, start, count) {
    const el = createNS('ellipse')
    Object.assign(el, {id})
    setAttributes(el, {
      cx: start ? start.x : 0,
      cy: start ? start.y : 0,
      rx: 0,
      ry: 0,
      'data-name': `Ellipse ${count}`,
      class: 'shape'
    })
    super(el)
  }

  get2DAttributes () {
    return {
      cx: this.el.getAttribute('cx'),
      cy: this.el.getAttribute('cy'),
      rx: this.el.getAttribute('rx'),
      ry: this.el.getAttribute('ry')
    }
  }

  getCenter () { return {x: parseFloat(this.el.getAttribute('cx')), y: parseFloat(this.el.getAttribute('cy'))} }

  getLocalBBox () {
    const r = this.getInitialRect()
    return {x: r.cx - r.rx, y: r.cy - r.ry, width: 2 * r.rx, height: 2 * r.ry}
  }

  getInitialRect () {
    return mapObject(this.get2DAttributes(), (key, value) => [key, parseFloat(value)])
  }

  updateResize (r, lDx, lDy, dir) {
    let rx = r.rx, ry = r.ry, cx = r.cx, cy = r.cy
    if (dir.includes('e')) {
      rx += lDx / 2
      cx += lDx / 2
    }
    if (dir.includes('w')) {
      rx -= lDx / 2
      cx += lDx / 2
    }
    if (dir.includes('s')) {
      ry += lDy / 2
      cy += lDy / 2
    }
    if (dir.includes('n')) {
      ry -= lDy / 2
      cy += lDy / 2
    }
    this.set2DAttributes({cx, cy, rx: Math.abs(rx), ry: Math.abs(ry)})
  }

  updateHandles (_handlesGroup, _context = {}) {
    const b = this.getLocalBBox(), x = b.x, y = b.y, w = b.width, h = b.height
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, angles = _context.ellipseHandleAngles || {}
    _handlesGroup.querySelectorAll('.ellipse-handle').forEach(h => {
      const dir = h.getAttribute('data-ellipse-dir')
      const angleRad = (angles[dir] || 0) * Math.PI / 180
      setAttributes(h, {x: cx + rx * Math.cos(angleRad), y: cy + ry * Math.sin(angleRad)})
    })
  }

  getRotation () {
    const rot = this.el.style.rotate
    return rot ? parseFloat(rot) : 0
  }

  setRotation (rot) {
    this.el.style.rotate = `${rot}deg`
  }

  toJSON () {
    return {
      type: 'ellipse',
      id: this.id,
      name: this.name,
      geometries: this.geometries,
      attributes: this.attributes
    }
  }

  createDefaultGeometry (pos) {
    return {
      attributes: {
        cx: pos.x, cy: pos.y, rx: 50, ry: 50
      },
      rotate: '0deg'
    }
  }
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
    } else if (dir === 'end') {
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


