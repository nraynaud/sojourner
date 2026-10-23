import { test, expect } from '@playwright/test'

test.describe('Undo/Redo playwright-test', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/')
    // Ensure the page is ready
    await expect(page.locator('#svg-canvas')).toBeVisible()
    // Clear IndexedDB for a fresh playwright-test if possible
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

  test('Undo/Redo shape addition', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const shapesGroup = page.locator('#shapes-group')
    const entityList = page.locator('#entity-list')

    // Add Vertex
    await page.click('#vertex-btn')
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + 100, box.y + 100)

    // Verify vertex added
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(1)

    // Add Direction
    await page.click('#direction-btn')
    await page.mouse.move(box.x + 50, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 150)
    await page.mouse.up()

    // Verify direction added
    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(2)

    // Undo direction addition
    await page.click('#undo-btn')
    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(0)
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(1)

    // Undo vertex addition
    await page.click('#undo-btn')
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(0)
    await expect(entityList.locator('.entity-item')).toHaveCount(0)

    // Redo vertex addition
    await page.click('#redo-btn')
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(1)

    // Redo direction addition
    await page.click('#redo-btn')
    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(1)
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(2)
  })

  test('Undo/Redo shape deletion', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const shapesGroup = page.locator('#shapes-group')
    const entityList = page.locator('#entity-list')

    // Add Vertex
    await page.click('#vertex-btn')
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + 100, box.y + 100)
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)

    // Add Direction
    await page.click('#direction-btn')
    await page.mouse.move(box.x + 50, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 150)
    await page.mouse.up()
    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(2)

    // Delete Direction
    const dirItem = entityList.locator('.entity-item').filter({ hasText: 'Direction 2' })
    await dirItem.hover()
    await dirItem.locator('.delete-btn').click()

    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(0)
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(1)

    // Delete Vertex
    const vertexItem = entityList.locator('.entity-item').filter({ hasText: 'Vertex 1' })
    await vertexItem.hover()
    await vertexItem.locator('.delete-btn').click()

    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(0)
    await expect(entityList.locator('.entity-item')).toHaveCount(0)

    // Undo vertex deletion
    await page.click('#undo-btn')
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(1)

    // Undo direction deletion
    await page.click('#undo-btn')
    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(1)
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(2)

    // Redo direction deletion
    await page.click('#redo-btn')
    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(0)
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(1)
  })

  test('Undo/Redo vertex movement', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const shapesGroup = page.locator('#shapes-group')

    // Add Vertex
    await page.click('#vertex-btn')
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + 100, box.y + 100)

    const vertex = shapesGroup.locator('use[href="#vertex-icon"]')
    await expect.poll(async () => Math.round(parseFloat(await vertex.getAttribute('data-x')))).toBe(100)
    await expect.poll(async () => Math.round(parseFloat(await vertex.getAttribute('data-y')))).toBe(100)

    // Select vertex and move it
    await page.click('#select-btn')
    await vertex.click()

    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 150)
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.up()

    await expect.poll(async () => Math.round(parseFloat(await vertex.getAttribute('data-x')))).toBe(200)
    await expect.poll(async () => Math.round(parseFloat(await vertex.getAttribute('data-y')))).toBe(200)

    // Undo movement
    await page.click('#undo-btn')
    await expect.poll(async () => Math.round(parseFloat(await vertex.getAttribute('data-x')))).toBe(100)
    await expect.poll(async () => Math.round(parseFloat(await vertex.getAttribute('data-y')))).toBe(100)

    // Redo movement
    await page.click('#redo-btn')
    await expect.poll(async () => Math.round(parseFloat(await vertex.getAttribute('data-x')))).toBe(200)
    await expect.poll(async () => Math.round(parseFloat(await vertex.getAttribute('data-y')))).toBe(200)
  })

  test('Undo/Redo direction modification', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const shapesGroup = page.locator('#shapes-group')

    // Add Direction
    await page.click('#direction-btn')
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.up()

    const line = shapesGroup.locator('line.direction-shape')
    await expect.poll(async () => Math.round(parseFloat(await line.getAttribute('x2')))).toBe(200)
    await expect.poll(async () => Math.round(parseFloat(await line.getAttribute('y2')))).toBe(200)

    // Select Direction and drag 'end' handle
    await page.click('#select-btn')
    await line.click()

    const handleEnd = page.locator('#direction-handles-group .handle[data-dir="end"]')
    await expect(handleEnd).toBeVisible()

    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + 250, box.y + 250)
    await page.mouse.up()

    await expect.poll(async () => Math.round(parseFloat(await line.getAttribute('x2')))).toBe(250)
    await expect.poll(async () => Math.round(parseFloat(await line.getAttribute('y2')))).toBe(250)

    // Undo handle modification
    await page.click('#undo-btn')
    await expect.poll(async () => Math.round(parseFloat(await line.getAttribute('x2')))).toBe(200)
    await expect.poll(async () => Math.round(parseFloat(await line.getAttribute('y2')))).toBe(200)

    // Redo handle modification
    await page.click('#redo-btn')
    await expect.poll(async () => Math.round(parseFloat(await line.getAttribute('x2')))).toBe(250)
    await expect.poll(async () => Math.round(parseFloat(await line.getAttribute('y2')))).toBe(250)
  })

  test('Undo/Redo rename', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const entityList = page.locator('#entity-list')

    // Add Vertex
    await page.click('#vertex-btn')
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + 100, box.y + 100)

    const entityItem = entityList.locator('.entity-item').first()
    const label = entityItem.locator('.name-label')
    const initialName = await label.textContent()

    // Double-click to rename
    await entityItem.dblclick()
    const input = entityItem.locator('input')
    await input.fill('New Vertex Name')
    await input.press('Enter')

    await expect(label).toHaveText('New Vertex Name')

    // Undo rename
    await page.click('#undo-btn')
    await expect(label).toHaveText(initialName)

    // Redo rename
    await page.click('#redo-btn')
    await expect(label).toHaveText('New Vertex Name')
  })
})
