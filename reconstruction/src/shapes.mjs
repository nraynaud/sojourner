import {  createNS, setAttributes, mapObject } from './util.mjs'

export class Shape {
  constructor (el) {
    this.el = el
    this.id = el.id
  }

  get name () { return this.el.getAttribute('data-name') }

  set name (val) { this.el.setAttribute('data-name', val) }

  setAttributes (attrs) {
    for (let k in attrs) this.el.setAttribute(k, attrs[k])
  }

  getCenter () {
    const x = parseFloat(this.el.getAttribute('x')), y = parseFloat(this.el.getAttribute('y')),
      w = parseFloat(this.el.getAttribute('width')), h = parseFloat(this.el.getAttribute('height'))
    return {x: x + w / 2, y: y + h / 2}
  }

  getLocalBBox () { return this.getInitialRect() }

  getAttributes () { throw 'getAttributes must be implemented' }

  getInitialRect () { throw 'getInitialRect must be implemented' }

  updateResize (rect, lDx, lDy, dir) {}

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

  getPoints () {
    const pts = this.el.getAttribute('points').split(/\s+/).filter(p => p)
    return pts.map(p => {
      const [x, y] = p.split(',').map(parseFloat)
      return {x, y}
    })
  }

  setPoints (points) {
    this.el.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '))
  }

  getCenter () {
    const pts = this.getPoints()
    return pts.reduce((acc, p) => ({x: acc.x + p.x / 4, y: acc.y + p.y / 4}), {x: 0, y: 0})
  }

  toJSON () {
    return {type: 'quad', id: this.id, name: this.name, attributes: this.getAttributes()}
  }

  getAttributes () {
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

  getAttributes () {
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
    return mapObject(this.getAttributes(), (key, value) => [key, parseFloat(value)])
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
    this.setAttributes({cx, cy, rx: Math.abs(rx), ry: Math.abs(ry)})
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
      rotate: this.el.style.rotate,
      attributes: this.getAttributes()
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
  }

  setAttributes (attrs) {
    if (attrs.x !== undefined) {
      this.el.setAttribute('data-x', attrs.x)
      delete attrs.x
    }
    if (attrs.y !== undefined) {
      this.el.setAttribute('data-y', attrs.y)
      delete attrs.y
    }
    super.setAttributes(attrs)
  }

  getAttributes () {
    return {
      x: this.el.getAttribute('data-x'),
      y: this.el.getAttribute('data-y')
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
    return mapObject(this.getAttributes(), (key, value) => [key, parseFloat(value)])
  }

  toJSON () {
    return {
      type: 'vertex', id: this.id, name: this.name, attributes: this.getAttributes()
    }
  }
}


