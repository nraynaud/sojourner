import { test, expect } from '@playwright/test'

test.describe('Rectangle Editing', () => {
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

  async function createRectangle(page) {
    const canvas = page.locator('#svg-canvas')
    const box = await canvas.boundingBox()
    await page.click('#rect-btn')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.up()
    return page.locator('#shapes-group rect')
  }

  test('can create a rectangle', async ({ page }) => {
    const rect = await createRectangle(page)
    await expect(rect).toHaveCount(1)
    await expect(rect).toHaveAttribute('width', '100')
    await expect(rect).toHaveAttribute('height', '100')
  })

  test('can rename a rectangle via sidebar', async ({ page }) => {
    await createRectangle(page)
    let entityItem = page.locator('.entity-item').filter({ hasText: 'Rectangle 1' })
    await expect(entityItem).toBeVisible()

    await entityItem.dblclick()
    const input = entityItem.locator('input')
    await expect(input).toBeVisible()
    await input.fill('Renamed Rect')
    await input.press('Enter')

    entityItem = page.locator('.entity-item').filter({ hasText: 'Renamed Rect' })
    await expect(entityItem).toBeVisible()
    const rect = page.locator('#shapes-group rect')
    await expect(rect).toHaveAttribute('data-name', 'Renamed Rect')
  })

  test('can resize using handles', async ({ page }) => {
    const rect = await createRectangle(page)
    await rect.click()
    await expect(page.locator('#rect-handles-group')).toBeVisible()

    const seHandle = page.locator('#rect-handles-group .handle[data-dir="se"]')
    const handleBox = await seHandle.boundingBox()

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 50, handleBox.y + handleBox.height / 2 + 30)
    await page.mouse.up()

    await expect(rect).toHaveAttribute('width', '150')
    await expect(rect).toHaveAttribute('height', '130')
  })

  test('can rotate using rotation handle', async ({ page }) => {
    const rect = await createRectangle(page)
    await rect.click()

    const rotateHandle = page.locator('#rect-handles-group .rotate-handle')
    const rotateBox = await rotateHandle.boundingBox()

    await page.mouse.move(rotateBox.x + rotateBox.width / 2, rotateBox.y + rotateBox.height / 2)
    await page.mouse.down()
    // Move to the right to rotate ~90 degrees clockwise
    await page.mouse.move(rotateBox.x + rotateBox.width / 2 + 100, rotateBox.y + rotateBox.height / 2 + 100)
    await page.mouse.up()

    const rotation = await rect.evaluate(el => el.style.rotate)
    expect(rotation).toBeTruthy()
    expect(parseFloat(rotation)).not.toBe(0)
  })

  test('can delete using Delete key', async ({ page }) => {
    const rect = await createRectangle(page)
    await rect.click()
    await page.keyboard.press('Delete')
    await expect(rect).toHaveCount(0)
    await expect(page.locator('.entity-item').filter({ hasText: 'Rectangle 1' })).toHaveCount(0)
  })

  test('can delete via sidebar "×"', async ({ page }) => {
    const rect = await createRectangle(page)
    await expect(rect).toHaveCount(1)
    await page.locator('.entity-item').filter({ hasText: 'Rectangle 1' }).locator('.delete-btn').click()
    await expect(rect).toHaveCount(0)
  })
})
