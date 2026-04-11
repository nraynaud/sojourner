import { test, expect } from '@playwright/test'

test.describe('Undo/Redo test', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/')
    // Ensure the page is ready
    await expect(page.locator('#svg-canvas')).toBeVisible()
    // Clear IndexedDB for a fresh test if possible
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

    // Select Rectangle mode
    await page.click('#rect-btn')

    // Draw a rectangle
    const box = await canvas.boundingBox()
    // Start at 50,50 relative to canvas
    await page.mouse.move(box.x + 50, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 150)
    await page.mouse.up()

    // Verify rectangle added
    await expect(shapesGroup.locator('polygon')).toHaveCount(1)
    // There should be 2 items: 1 background and 1 rectangle
    await expect(entityList.locator('.entity-item')).toHaveCount(2)

    // Undo addition
    await page.click('#undo-btn')
    await expect(shapesGroup.locator('polygon')).toHaveCount(0)
    // Only background should remain
    await expect(entityList.locator('.entity-item')).toHaveCount(1)

    // Redo addition
    await page.click('#redo-btn')
    await expect(shapesGroup.locator('polygon')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(2)
  })

  test('Undo/Redo shape deletion', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const shapesGroup = page.locator('#shapes-group')
    const entityList = page.locator('#entity-list')

    // Select Rectangle mode and draw a rectangle
    await page.click('#rect-btn')
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 50, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 150)
    await page.mouse.up()

    await expect(shapesGroup.locator('polygon')).toHaveCount(1)

    // Delete the rectangle. We need to be specific because of the background item.
    const rectItem = entityList.locator('.entity-item').filter({ hasText: 'Quadrilateral 1' })
    await rectItem.hover()
    await rectItem.locator('.delete-btn').click()

    await expect(shapesGroup.locator('polygon')).toHaveCount(0)

    // Undo deletion
    await page.click('#undo-btn')
    await expect(shapesGroup.locator('polygon')).toHaveCount(1)

    // Redo deletion
    await page.click('#redo-btn')
    await expect(shapesGroup.locator('polygon')).toHaveCount(0)
  })

  test('Undo/Redo shape transformation (resize)', async ({page}) => {
    const canvas = page.locator('#svg-canvas')
    const shapesGroup = page.locator('#shapes-group')

    // Select Rectangle mode and draw a rectangle (100x100)
    await page.click('#rect-btn')
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 50, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 150)
    await page.mouse.up()

    const rect = shapesGroup.locator('polygon')
    await expect(rect).toHaveAttribute('points', /150(\.[\d]+)?,1[45]\d/)

    // Click to select the rectangle to show handles
    await rect.click()

    // Resize using the 'se' handle
    const handle = page.locator('.handle[data-dir="se"]')
    await expect(handle).toBeVisible()

    // Use evaluate to perform a more direct drag because mouse.move/down/up can be tricky with non-standard coordinate systems or zoomed views
    const resizedPoints = await page.evaluate(async (dir) => {
      const handle = document.querySelector(`.handle[data-dir="${dir}"]`)
      const down = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: handle.getBoundingClientRect().left + 5,
        clientY: handle.getBoundingClientRect().top + 5,
        button: 0
      })
      handle.dispatchEvent(down)

      const move = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: handle.getBoundingClientRect().left + 105,
        clientY: handle.getBoundingClientRect().top + 105,
        button: 0
      })
      window.dispatchEvent(move)

      const up = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        button: 0
      })
      window.dispatchEvent(up)

      return document.querySelector('#shapes-group polygon').getAttribute('points')
    }, 'se')

    // se handle moved by 100,100. Original se was 150,150. New should be 250,250
    expect(resizedPoints).toContain('250')

    // Undo resize
    await page.click('#undo-btn')
    await expect(rect).toHaveAttribute('points', /150(\.[\d]+)?,1[45]\d/)

    // Redo resize
    await page.click('#redo-btn')
    await expect(rect).toHaveAttribute('points', resizedPoints)
  })

  test('Undo/Redo rename', async ({page}) => {
    const entityList = page.locator('#entity-list')

    // Draw rectangle
    await page.click('#rect-btn')
    const box = await (page.locator('#svg-canvas')).boundingBox()
    await page.mouse.move(box.x + 50, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 150)
    await page.mouse.up()

    const entityItem = entityList.locator('.entity-item').filter({ hasNotText: 'Background:' })
    const label = entityItem.locator('.name-label')
    const initialName = await label.textContent()

    // Double-click to rename
    await entityItem.dblclick()
    const input = entityItem.locator('input')
    await input.fill('New Name')
    await input.press('Enter')

    await expect(label).toHaveText('New Name')

    // Undo rename
    await page.click('#undo-btn')
    await expect(label).toHaveText(initialName)

    // Redo rename
    await page.click('#redo-btn')
    await expect(label).toHaveText('New Name')
  })
})
