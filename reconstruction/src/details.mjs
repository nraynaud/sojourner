
export class DetailsPanel {
  constructor (panel, content) {
    this.panel = panel
    this.content = content
    this.currentShape = null
  }

  setShape (shape) {
    this.currentShape = shape
    if (!shape || !shape.attributes || Object.keys(shape.attributes).length === 0) {
      this.panel.style.display = 'none'
      return
    }

    this.panel.style.display = 'block'
    this.render()
  }

  render () {
    this.content.innerHTML = ''
    for (const [key, value] of Object.entries(this.currentShape.attributes)) {
      const row = document.createElement('div')
      row.className = 'detail-row'

      const label = document.createElement('label')
      label.textContent = key

      const input = document.createElement('input')
      input.type = 'number'
      input.step = '0.1'
      input.value = value
      input.addEventListener('change', () => {
        this.currentShape.attributes[key] = parseFloat(input.value)
      })

      row.appendChild(label)
      row.appendChild(input)
      this.content.appendChild(row)
    }
  }
}
