import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('File operations', () => {
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

  test('Save (Zip) functionality', async ({page}) => {
    // Draw a shape so the zip has content
    await page.click('#rect-btn')
    const canvas = page.locator('#svg-canvas')
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 50, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 150)
    await page.mouse.up()

    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download')
    await page.click('#save-btn')
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('project.zip')
    
    const downloadPath = path.join('test-results', 'project.zip')
    await download.saveAs(downloadPath)
    expect(fs.existsSync(downloadPath)).toBeTruthy()
    
    // Cleanup
    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath)
    }
  })

  test('Load (Zip) functionality', async ({page}) => {
    // To test load, we need a valid zip. 
    // We can either create one manually in the test or use the save-btn to get one.
    // Creating one manually ensures we know exactly what's inside.
    
    // We'll use page.evaluate to create a zip using JSZip (which is already loaded in index.html)
    // and then trigger the load-input.
    
    const zipData = await page.evaluate(async () => {
      const z = new JSZip()
      const docData = {
        entities: [
          {
            type: 'rect',
            id: 'Rect1',
            name: 'Loaded Rect',
            attributes: { x: 10, y: 10, width: 100, height: 50, fill: 'red' }
          }
        ],
        entityCount: 1,
        backgroundName: 'test-bg.jpg'
      }
      z.file('document.json', JSON.stringify(docData))
      // Create a tiny dummy image
      const canvas = document.createElement('canvas')
      canvas.width = 2
      canvas.height = 2
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'))
      z.file('test-bg.jpg', blob)
      
      const zipBlob = await z.generateAsync({type: 'blob'})
      return new Uint8Array(await zipBlob.arrayBuffer())
    })

    const tempZipPath = path.join('test-results', 'test-load.zip')
    if (!fs.existsSync('test-results')) {
        fs.mkdirSync('test-results')
    }
    fs.writeFileSync(tempZipPath, Buffer.from(zipData))

    // Trigger load-input
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('#load-btn')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(tempZipPath)

    // Verify it loaded
    const shapesGroup = page.locator('#shapes-group')
    await expect(shapesGroup.locator('rect')).toHaveCount(1)
    await expect(shapesGroup.locator('rect')).toHaveAttribute('x', '10')
    
    const entityList = page.locator('#entity-list')
    // Background + Rectangle = 2 items
    await expect(entityList.locator('.entity-item')).toHaveCount(2)
    await expect(entityList.locator('.entity-item', { hasText: 'Background: test-bg.jpg' })).toBeVisible()
    await expect(entityList.locator('.entity-item', { hasText: 'Loaded Rect' })).toBeVisible()

    // Also verify background in SVG
    const backgroundGroup = page.locator('#background-group')
    await expect(backgroundGroup.locator('image#backgroundImage')).toBeVisible()
    await expect(backgroundGroup.locator('image#backgroundImage')).toHaveAttribute('href', /^blob:/)

    // Cleanup
    if (fs.existsSync(tempZipPath)) {
      fs.unlinkSync(tempZipPath)
    }
  })
})
