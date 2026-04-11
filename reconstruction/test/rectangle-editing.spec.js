import { test, expect } from '@playwright/test'

test.describe('Quadrilateral Editing', () => {
  test.beforeEach(async ({ page }) => {
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
    await expect(page.locator('#svg-canvas')).toBeVisible()
  })

  async function createQuadrilateral(page) {
    const canvas = page.locator('#svg-canvas')
    const box = await canvas.boundingBox()
    await page.click('#rect-btn')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.up()
    return page.locator('#shapes-group polygon')
  }

  test('can create a quadrilateral', async ({ page }) => {
    const quad = await createQuadrilateral(page)
    await expect(quad).toHaveCount(1)
    const points = await quad.getAttribute('points')
    const pts = points.split(/\s+/).map(p => p.split(',').map(parseFloat))
    expect(pts[0][0]).toBeCloseTo(100, 0)
    expect(pts[0][1]).toBeCloseTo(100, 0)
    expect(pts[2][0]).toBeCloseTo(200, 0)
    expect(pts[2][1]).toBeCloseTo(200, 0)
  })

  test('can rename a quadrilateral via sidebar', async ({ page }) => {
    await createQuadrilateral(page)
    let entityItem = page.locator('.entity-item').filter({ hasText: 'Quadrilateral 1' })
    await expect(entityItem).toBeVisible()

    await entityItem.dblclick()
    const input = entityItem.locator('input')
    await expect(input).toBeVisible()
    await input.fill('Renamed Quad')
    await input.press('Enter')

    entityItem = page.locator('.entity-item').filter({ hasText: 'Renamed Quad' })
    await expect(entityItem).toBeVisible()
    const quad = page.locator('#shapes-group polygon')
    await expect(quad).toHaveAttribute('data-name', 'Renamed Quad')
  })

  test('can move a corner using handles', async ({ page }) => {
    const quad = await createQuadrilateral(page)
    await quad.click()
    await expect(page.locator('#quad-handles-group')).toBeVisible()

    const seHandle = page.locator('#quad-handles-group .handle[data-dir="se"]')
    const handleBox = await seHandle.boundingBox()

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 50, handleBox.y + handleBox.height / 2 + 30)
    await page.mouse.up()

    const points = await quad.getAttribute('points')
    const pts = points.split(/\s+/).map(p => p.split(',').map(parseFloat))
    expect(pts[2][0]).toBeCloseTo(250, 0)
    expect(pts[2][1]).toBeCloseTo(230, 0)
  })

  test('can delete using Delete key', async ({ page }) => {
    const quad = await createQuadrilateral(page)
    await quad.click()
    await page.keyboard.press('Delete')
    await expect(quad).toHaveCount(0)
    await expect(page.locator('.entity-item').filter({ hasText: 'Quadrilateral 1' })).toHaveCount(0)
  })

  test('can delete via sidebar "×"', async ({ page }) => {
    const quad = await createQuadrilateral(page)
    await expect(quad).toHaveCount(1)
    await page.locator('.entity-item').filter({ hasText: 'Quadrilateral 1' }).locator('.delete-btn').click()
    await expect(quad).toHaveCount(0)
  })
})
