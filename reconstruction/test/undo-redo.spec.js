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
    // There should be 1 rectangle in the entity list (backgrounds are in #image-list)
    await expect(entityList.locator('.entity-item')).toHaveCount(1)

    // Undo addition
    await page.click('#undo-btn')
    await expect(shapesGroup.locator('polygon')).toHaveCount(0)
    // Entity list should be empty
    await expect(entityList.locator('.entity-item')).toHaveCount(0)

    // Redo addition
    await page.click('#redo-btn')
    await expect(shapesGroup.locator('polygon')).toHaveCount(1)
    await expect(entityList.locator('.entity-item')).toHaveCount(1)
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

    // Delete the rectangle.
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

  test.fixme('Undo/Redo shape transformation (resize)', async ({page}) => {
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
    // Capture initial points to avoid regex hell
    const initialPoints = await rect.getAttribute('points')
    
    // Switch to select mode explicitly
    await page.click('#select-btn')
    
    // Click to select the rectangle to show handles
    await rect.click()

    // Resize using the 'se' handle
    const handle = page.locator('.handle[data-dir="se"]')
    await expect(handle).toBeVisible()

    // Use evaluate to perform a drag.
    // Use dispatchEvent directly on the element found via document.querySelector
    const resizedPoints = await page.evaluate(async (dir) => {
      const handle = document.querySelector(`.handle[data-dir="${dir}"]`);
      const svg = document.querySelector('#svg-canvas');
      const zoomGroup = document.querySelector('#zoom-group');
      
      const getPt = (e) => {
        let p = svg.createSVGPoint();
        p.x = e.clientX; p.y = e.clientY;
        return p.matrixTransform(zoomGroup.getScreenCTM().inverse());
      };

      const rectH = handle.getBoundingClientRect();
      const startX = rectH.left + rectH.width / 2;
      const startY = rectH.top + rectH.height / 2;

      handle.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, clientX: startX, clientY: startY, button: 0
      }));

      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX: startX + 100, clientY: startY + 100, button: 0
      }));

      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, button: 0
      }));

      return document.querySelector('#shapes-group polygon').getAttribute('points');
    }, 'se')

    // Check it actually changed
    expect(resizedPoints).not.toBe(initialPoints)
    
    // Undo resize
    await page.click('#undo-btn')
    
    // Wait for the change to be reflected
    await expect(rect).not.toHaveAttribute('points', resizedPoints)
    const pointsAfterUndo = await rect.getAttribute('points')
    
    // Check if it's close to initial
    const parsePts = (s) => s.split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))
    const p1 = parsePts(initialPoints)
    const p2 = parsePts(pointsAfterUndo)
    expect(p1.length).toBe(p2.length)
    for(let i=0; i<p1.length; i++) {
        expect(p2[i]).toBeCloseTo(p1[i], 0)
    }

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

    const entityItem = entityList.locator('.entity-item').first()
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
