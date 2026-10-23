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
    await page.click('#direction-btn')
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

    const downloadPath = path.join('playwright-test-results', 'project.zip')
    await download.saveAs(downloadPath)
    expect(fs.existsSync(downloadPath)).toBeTruthy()

    // Cleanup
    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath)
    }
  })

  test('Load (Zip) functionality', async ({page}) => {
    // To playwright-test load, we need a valid zip.
    // We can either create one manually in the playwright-test or use the save-btn to get one.
    // Creating one manually ensures we know exactly what's inside.

    // We'll use page.evaluate to create a zip using JSZip (which is already loaded in index.html)
    // and then trigger the load-input.

    const zipData = await page.evaluate(async () => {
      const z = new JSZip()
      const docData = {
        entities: [
          {
            type: 'vertex',
            id: 'vertex-1',
            name: 'Loaded Vertex',
            geometries: {
              'img-1': {
                attributes: {
                  x: 100,
                  y: 150
                }
              }
            },
            attributes: {x: 0, y: 0, z: 0}
          },
          {
            type: 'direction',
            id: 'direction-1',
            name: 'Loaded Direction',
            geometries: {
              'img-1': {
                attributes: {
                  x1: 10,
                  y1: 20,
                  x2: 110,
                  y2: 120
                }
              }
            },
            attributes: {vx: 0, vy: 0, vz: 1}
          }
        ],
        entityCount: 2,
        images: [
          {
            id: 'img-1',
            name: 'playwright-test-bg.jpg',
            cannyEnabled: false
          }
        ],
        currentImageId: 'img-1'
      }
      z.file('document.json', JSON.stringify(docData))
      const imgFolder = z.folder('images')
      // Create a tiny dummy image
      const canvas = document.createElement('canvas')
      canvas.width = 2
      canvas.height = 2
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'))
      imgFolder.file('img-1', blob)

      const zipBlob = await z.generateAsync({type: 'blob'})
      return new Uint8Array(await zipBlob.arrayBuffer())
    })

    const tempZipPath = path.join('playwright-test-results', 'playwright-test-load.zip')
    if (!fs.existsSync('playwright-test-results')) {
        fs.mkdirSync('playwright-test-results')
    }
    fs.writeFileSync(tempZipPath, Buffer.from(zipData))

    // Trigger load-input
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('#load-btn')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(tempZipPath)

    // Verify shapes loaded
    const shapesGroup = page.locator('#shapes-group')
    await expect(shapesGroup.locator('use[href="#vertex-icon"]')).toHaveCount(1)
    const vertex = shapesGroup.locator('use[href="#vertex-icon"]')
    await expect(vertex).toHaveAttribute('data-x', '100')
    await expect(vertex).toHaveAttribute('data-y', '150')

    await expect(shapesGroup.locator('line.direction-shape')).toHaveCount(1)
    const direction = shapesGroup.locator('line.direction-shape')
    await expect(direction).toHaveAttribute('x1', '10')
    await expect(direction).toHaveAttribute('y1', '20')
    await expect(direction).toHaveAttribute('x2', '110')
    await expect(direction).toHaveAttribute('y2', '120')

    const entityList = page.locator('#entity-list')
    await expect(entityList.locator('.entity-item')).toHaveCount(2)
    await expect(entityList.locator('.entity-item', { hasText: 'Loaded Vertex' })).toBeVisible()
    await expect(entityList.locator('.entity-item', { hasText: 'Loaded Direction' })).toBeVisible()

    const imageList = page.locator('#image-list')
    await expect(imageList.locator('.entity-item')).toHaveCount(1)
    await expect(imageList.locator('.entity-item', { hasText: 'playwright-test-bg.jpg' })).toBeVisible()

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
