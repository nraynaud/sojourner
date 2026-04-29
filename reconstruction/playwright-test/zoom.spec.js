import { test, expect } from '@playwright/test'

test.describe('Zoom function tests', () => {

  let getComputedScale = el => window.getComputedStyle(el).getPropertyValue('scale')
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
    await expect(page.locator('#svg-canvas')).toBeVisible()
  })

  test('Zoom in and out using buttons', async ({page}) => {
    const zoomGroup = page.locator('#zoom-group')

    // Initial scale should be 1 or empty (defaulting to 1)
    let initialScale = await zoomGroup.evaluate(el => el.style.scale || '1')
    expect(parseFloat(initialScale)).toBe(1)

    // Zoom in
    await page.click('#zoom-in-btn')
    let zoomInScale = await zoomGroup.evaluate(getComputedScale)
    expect(parseFloat(zoomInScale)).toBeCloseTo(1.1)

    // Zoom out
    await page.click('#zoom-out-btn')
    let zoomOutScale = await zoomGroup.evaluate(getComputedScale)
    expect(parseFloat(zoomOutScale)).toBeCloseTo(1.1 * 0.9)
  })

  test('Reset zoom button', async ({page}) => {
    const zoomGroup = page.locator('#zoom-group')

    // Zoom in a few times
    await page.click('#zoom-in-btn')
    await page.click('#zoom-in-btn')

    let currentScale = await zoomGroup.evaluate(getComputedScale)
    expect(parseFloat(currentScale)).toBeGreaterThan(1.2)

    // Reset zoom
    await page.click('#zoom-reset-btn')
    let resetScale = await zoomGroup.evaluate(getComputedScale)
    expect(parseFloat(resetScale)).toBe(1)
  })

  test('Zoom using mouse wheel', async ({page}) => {
    const zoomGroup = page.locator('#zoom-group')
    const viewport = page.locator('#canvas-container')

    // Get initial scale
    let initialScale = await zoomGroup.evaluate(getComputedScale) | '1'
    expect(parseFloat(initialScale)).toBe(1)

    // Dispatch wheel event with Ctrl key
    // Playwright's mouse.wheel doesn't easily support modifiers in a single call in all versions,
    // so we use page.evaluate to dispatch a real WheelEvent if needed, or mouse.wheel if it works.
    await viewport.hover()
    await page.mouse.wheel(0, -100) // Scroll up

    // Check if zoom changed. Note: e.ctrlKey is required in the app's wheel listener.
    // page.mouse.wheel might not set ctrlKey.

    // Re-verify the listener in index.html:
    // $viewport.addEventListener('wheel', e => { if (e.ctrlKey) { ... } }, {passive: false})

    // Let's use page.evaluate to be sure
    await page.evaluate(() => {
      const viewport = document.getElementById('canvas-container')
      const event = new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
      viewport.dispatchEvent(event)
    })

    let wheelZoomInScale = await zoomGroup.evaluate(getComputedScale)
    expect(parseFloat(wheelZoomInScale)).toBeCloseTo(1.05)

    await page.evaluate(() => {
      const viewport = document.getElementById('canvas-container')
      const event = new WheelEvent('wheel', {
        deltaY: 100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
      viewport.dispatchEvent(event)
    })

    let wheelZoomOutScale = await zoomGroup.evaluate(getComputedScale)
    expect(parseFloat(wheelZoomOutScale)).toBeCloseTo(1.05 * 0.95)
  })

  test('Zoom with background size consideration', async ({page}) => {
    // This playwright-test verifies that the svg-canvas size changes with zoom
    // Since there's no background by default, doc.getBackgroundSize() might return default 100x100 or something.

    const svgCanvas = page.locator('#svg-canvas')

    const initialWidth = await svgCanvas.getAttribute('width')
    const initialHeight = await svgCanvas.getAttribute('height')

    await page.click('#zoom-in-btn')

    const zoomedWidth = await svgCanvas.getAttribute('width')
    const zoomedHeight = await svgCanvas.getAttribute('height')

    if (initialWidth && zoomedWidth) {
      expect(parseFloat(zoomedWidth)).toBeCloseTo(parseFloat(initialWidth) * 1.1)
    }
    if (initialHeight && zoomedHeight) {
      expect(parseFloat(zoomedHeight)).toBeCloseTo(parseFloat(initialHeight) * 1.1)
    }
  })
})
