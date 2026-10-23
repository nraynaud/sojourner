import { test, expect } from '@playwright/test'

test.describe('Direction Shape', () => {
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

  test('Draw and Select Direction', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const shapesGroup = page.locator('#shapes-group')
    const entityList = page.locator('#entity-list')

    // Select Direction mode
    await page.click('#direction-btn')

    // Click and drag to draw a direction line
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.up()

    // Verify direction line added
    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(1)
    const line = shapesGroup.locator('line.direction-shape')
    const x1 = await line.getAttribute('x1')
    const y1 = await line.getAttribute('y1')
    const x2 = await line.getAttribute('x2')
    const y2 = await line.getAttribute('y2')
    expect(Math.round(parseFloat(x1))).toBe(100)
    expect(Math.round(parseFloat(y1))).toBe(100)
    expect(Math.round(parseFloat(x2))).toBe(200)
    expect(Math.round(parseFloat(y2))).toBe(200)

    // Check entity list
    await expect(entityList.locator('.entity-item')).toHaveCount(1)

    // Switch to Select mode and select direction
    await page.click('#select-btn')
    await line.click()

    // Verify it's selected in entity list
    const dirItem = entityList.locator('.entity-item').filter({ hasText: 'Direction 1' })
    await expect(dirItem).toHaveClass(/selected/)
  })

  test('Undo/Redo Direction', async ({page}) => {
    const shapesGroup = page.locator('#shapes-group')
    const canvas = page.locator('#svg-canvas')

    await page.click('#direction-btn')
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.up()

    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(1)

    await page.click('#undo-btn')
    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(0)

    await page.click('#redo-btn')
    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(1)
  })
})
