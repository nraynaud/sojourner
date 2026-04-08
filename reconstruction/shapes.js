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

  getRotation () {
    const t = this.el.getAttribute('transform')
    return t && t.match(/rotate\(([^, ]+)/) ? parseFloat(t.match(/rotate\(([^, ]+)/)[1]) : 0
  }

  setTransform (rot, cx, cy) { this.setAttributes({transform: `rotate(${rot}, ${cx}, ${cy})`}) }

  updateHandles (_handlesGroup, _zoom, _context = {}) { throw 'updateHandles must be implemented' }

  getAttributes () { throw 'getAttributes must be implemented' }

  getInitialRect () { throw 'getInitialRect must be implemented' }

  updateResize (rect, lDx, lDy, dir) { throw 'updateResize must be implemented' }

  toJSON () {
    return {
      type: this instanceof RectangleShape ? 'rect' : 'ellipse',
      id: this.id, name: this.name, transform: this.el.getAttribute('transform'), attributes: this.getAttributes()
    }
  }
}

export class RectangleShape extends Shape {
  constructor (id, start, label) {
    const el = createNS('rect')
    Object.assign(el, {id})
    setAttributes(el, {
      x: start ? start.x : 0,
      y: start ? start.y : 0,
      width: 0,
      height: 0,
      'data-name': `Rectangle ${label}`,
      class: 'shape'
    })
    super(el)
  }

  getAttributes () {
    return {
      x: this.el.getAttribute('x'),
      y: this.el.getAttribute('y'),
      width: this.el.getAttribute('width'),
      height: this.el.getAttribute('height')
    }
  }

  getInitialRect () {
    return mapObject(this.getAttributes(), (key, value) => [key, parseFloat(value)])
  }

  updateResize (r, lDx, lDy, dir) {
    let x = r.x, y = r.y, w = r.width, h = r.height
    if (dir.includes('e')) w += lDx
    if (dir.includes('s')) h += lDy
    if (dir.includes('w')) {
      x += lDx
      w -= lDx
    }
    if (dir.includes('n')) {
      y += lDy
      h -= lDy
    }
    if (w < 0) {
      x += w
      w = Math.abs(w)
    }
    if (h < 0) {
      y += h
      h = Math.abs(h)
    }
    this.setAttributes({x, y, width: w, height: h})
  }

  updateHandles (handlesGroup, zoom) {
    const b = this.getLocalBBox(), x = b.x * zoom, y = b.y * zoom, w = b.width * zoom, h = b.height * zoom
    const p = {
      nw: {x: x, y: y}, n: {x: x + w / 2, y: y}, ne: {x: x + w, y: y}, e: {x: x + w, y: y + h / 2},
      se: {x: x + w, y: y + h}, s: {x: x + w / 2, y: y + h}, sw: {x: x, y: y + h}, w: {x: x, y: y + h / 2}
    }
    handlesGroup.querySelectorAll('.handle').forEach(h => {
      h.style.display = ''
      const p_ = p[h.getAttribute('data-dir')]
      setAttributes(h, {x: p_.x, y: p_.y})
    })
    const rh = handlesGroup.querySelector('.rotate-handle'), rl = $('rotate-line')
    rh.style.display = ''
    rl.style.display = ''
    const gap = 20
    setAttributes(rh, {x: x + w / 2, y: y - gap})
    setAttributes(rl, {x1: x + w / 2, y1: y, x2: x + w / 2, y2: y - gap, 'stroke-width': 1})
    handlesGroup.querySelectorAll('.ellipse-handle').forEach(h => {
      h.style.display = 'none'
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

  updateHandles (handlesGroup, zoom, context = {}) {
    handlesGroup.querySelectorAll('.handle').forEach(h => {
      h.style.display = 'none'
    })
    const rh = handlesGroup.querySelector('.rotate-handle'), rl = $('rotate-line')
    rh.style.display = 'none'
    rl.style.display = 'none'
    handlesGroup.querySelectorAll('.ellipse-handle').forEach(h => {
      h.style.display = ''
    })
    const b = this.getLocalBBox(), x = b.x * zoom, y = b.y * zoom, w = b.width * zoom, h = b.height * zoom
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, angles = context.ellipseHandleAngles || {}
    handlesGroup.querySelectorAll('.ellipse-handle').forEach(h => {
      const dir = h.getAttribute('data-ellipse-dir')
      const angleRad = (angles[dir] || 0) * Math.PI / 180
      setAttributes(h, {x: cx + rx * Math.cos(angleRad), y: cy + ry * Math.sin(angleRad)})
    })
  }
}



window.Shape = Shape;
window.RectangleShape = RectangleShape;
window.EllipseShape = EllipseShape;
