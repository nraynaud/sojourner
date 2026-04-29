import { test, expect } from '@playwright/test'

test.describe('Vertex Shape', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/')
    await expect(page.locator('#svg-canvas')).toBeVisible()
    await page.evaluate(async () => {
      return new Promise((resolve) => {
        const dbRequest = indexedDB.deleteDatabase('SvgEditorDB')
        dbRequest.onsuccess = () => resolve()
        dbRequest.onerror = () => resolve()
        dbRequest.onblocked = () => resolve()
      })
    })
    await page.reload()
  })

  test('Draw and Select Vertex', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const shapesGroup = page.locator('#shapes-group')
    const entityList = page.locator('#entity-list')

    // Select Vertex mode
    await page.click('#vertex-btn')

    // Click to place a vertex
    const box = await canvas.boundingBox()
    const vx = box.x + 100
    const vy = box.y + 100
    await page.mouse.click(vx, vy)

    // Verify vertex added (it's a use element)
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    const vertex = shapesGroup.locator('use[href="#vertex-icon"]')
    const x = await vertex.getAttribute('data-x')
    const y = await vertex.getAttribute('data-y')
    expect(Math.round(parseFloat(x))).toBe(100)
    expect(Math.round(parseFloat(y))).toBe(100)

    // Check entity list
    await expect(entityList.locator('.entity-item')).toHaveCount(1) // vertex only (background is in image-list)

    // Switch to Select mode and select vertex
    await page.click('#select-btn')
    await vertex.click()

    // Verify it's selected in entity list
    const vertexItem = entityList.locator('.entity-item').filter({ hasText: 'Vertex 1' })
    await expect(vertexItem).toHaveClass(/selected/)
  })

  test('Undo/Redo Vertex', async ({page}) => {
    const shapesGroup = page.locator('#shapes-group')

    await page.click('#vertex-btn')
    const box = await (page.locator('#svg-canvas')).boundingBox()
    await page.mouse.click(box.x + 100, box.y + 100)

    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)

    await page.click('#undo-btn')
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(0)

    await page.click('#redo-btn')
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
  })

  test('Move Vertex', async ({page}) => {
    const shapesGroup = page.locator('#shapes-group')
    const canvas = page.locator('#svg-canvas')

    await page.click('#vertex-btn')
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + 100, box.y + 100)

    const vertex = shapesGroup.locator('use[href="#vertex-icon"]')
    const x1 = await vertex.getAttribute('data-x')
    expect(Math.round(parseFloat(x1))).toBe(100)

    await page.click('#select-btn')
    await vertex.click()
    await expect(vertex).toHaveClass(/selected/)

    // Drag it.
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    // Small increments to ensure move events are triggered and processed
    await page.mouse.move(box.x + 150, box.y + 150)
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.up()

    const x2 = await vertex.getAttribute('data-x')
    const y2 = await vertex.getAttribute('data-y')

    expect(Math.round(parseFloat(x2))).toBe(200)
    expect(Math.round(parseFloat(y2))).toBe(200)
  })
})
