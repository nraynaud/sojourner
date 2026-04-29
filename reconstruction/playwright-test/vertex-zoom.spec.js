import { test, expect } from '@playwright/test'

test.describe('Vertex Zoom persistence', () => {
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

  test('Vertex should NOT scale its visual radius when zooming', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const zoomInBtn = page.locator('#zoom-in-btn')

    // Click Vertex button
    await page.click('#vertex-btn')

    // Click on canvas to add a vertex
    const box = await canvas.boundingBox()
    const vertexX = box.x + 200
    const vertexY = box.y + 200
    await page.mouse.click(vertexX, vertexY)

    // Verify vertex is added
    const vertex = page.locator('#shapes-group use[href="#vertex-icon"]')
    await expect(vertex).toHaveCount(1)

    // Get initial bounding box of the vertex in screen space
    const initialBBox = await vertex.boundingBox()
    const initialWidth = initialBBox.width

    // Zoom in multiple times
    for (let i = 0; i < 5; i++) {
      await zoomInBtn.click()
    }

    // Get final bounding box of the vertex in screen space
    const finalBBox = await vertex.boundingBox()
    const finalWidth = finalBBox.width

    // Currently, it scales, so finalWidth should be much larger than initialWidth
    // We want them to be approximately equal
    // Playwright's boundingBox() returns values in screen pixels.
    // If it's scaling, finalWidth should be initialWidth * (1.1 ** 5) ≈ 1.61 * initialWidth
    expect(Math.abs(finalWidth - initialWidth)).toBeLessThan(1.1)
  })
})
