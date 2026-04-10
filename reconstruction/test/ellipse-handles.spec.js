import { test, expect } from '@playwright/test'

test.describe('Ellipse curve handles', () => {
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

  test('ellipse uses draggable curve handles without rotating and keeps other handles stable', async ({ page }) => {
    const canvas = page.locator('#svg-canvas')
    const box = await canvas.boundingBox()

    await page.click('#ellipse-btn')
    await page.mouse.move(box.x + 60, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 180, box.y + 140)
    await page.mouse.up()

    const ellipse = page.locator('#shapes-group ellipse')
    await expect(ellipse).toHaveCount(1)
    await ellipse.click()

    await expect(page.locator('#ellipse-handles-group')).toBeVisible()
    await expect(page.locator('.ellipse-handle[data-ellipse-dir="e"]')).toBeVisible()
    await expect(page.locator('.ellipse-rotate-handle')).toHaveCount(0)
    await expect(page.locator('.rotate-handle')).toBeHidden()

    const beforeResize = await ellipse.evaluate((el) => ({
      rx: parseFloat(el.getAttribute('rx')),
      transform: el.getAttribute('transform') || ''
    }))

    await page.evaluate(() => {
      const handle = document.querySelector('.ellipse-handle[data-ellipse-dir="e"]')
      const rect = handle.getBoundingClientRect()
      handle.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0
      }))
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2 + 50,
        clientY: rect.top + rect.height / 2,
        button: 0
      }))
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        button: 0
      }))
    })

    const afterResizeRx = await ellipse.evaluate(el => parseFloat(el.getAttribute('rx')))
    expect(afterResizeRx).toBeGreaterThan(beforeResize.rx)

    const beforeSlide = await page.evaluate(() => {
      const handle = document.querySelector('.ellipse-handle[data-ellipse-dir="e"]')
      const northHandle = document.querySelector('.ellipse-handle[data-ellipse-dir="n"]')
      const ellipse = document.querySelector('#shapes-group ellipse')
      const hb = handle.getBoundingClientRect()
      const nhb = northHandle.getBoundingClientRect()
      const eb = ellipse.getBoundingClientRect()
      return {
        hx: hb.left + hb.width / 2,
        hy: hb.top + hb.height / 2,
        nx: nhb.left + nhb.width / 2,
        ny: nhb.top + nhb.height / 2,
        cx: eb.left + eb.width / 2,
        cy: eb.top + eb.height / 2
      }
    })

    await page.evaluate((p) => {
      const handle = document.querySelector('.ellipse-handle[data-ellipse-dir="e"]')
      handle.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: p.hx,
        clientY: p.hy,
        button: 0
      }))
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: p.hx - 40,
        clientY: p.hy - 35,
        button: 0
      }))
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        button: 0
      }))
    }, beforeSlide)

    const slideResult = await page.evaluate((beforeSlidePos) => {
      const handle = document.querySelector('.ellipse-handle[data-ellipse-dir="e"]')
      const northHandle = document.querySelector('.ellipse-handle[data-ellipse-dir="n"]')
      const ellipse = document.querySelector('#shapes-group ellipse')
      const hb = handle.getBoundingClientRect()
      const nhb = northHandle.getBoundingClientRect()
      const eb = ellipse.getBoundingClientRect()
      const hx = hb.left + hb.width / 2
      const hy = hb.top + hb.height / 2
      const nx = nhb.left + nhb.width / 2
      const ny = nhb.top + nhb.height / 2
      const cx = eb.left + eb.width / 2
      const cy = eb.top + eb.height / 2
      return {
        movedY: Math.abs(hy - (cy)),
        movedXFromEastPole: Math.abs((hx - cx) - eb.width / 2),
        northMoved: Math.hypot(nx - beforeSlidePos.nx, ny - beforeSlidePos.ny)
      }
    }, beforeSlide)
    expect(slideResult.movedY).toBeGreaterThan(5)
    expect(slideResult.movedXFromEastPole).toBeGreaterThan(5)
    expect(slideResult.northMoved).toBeLessThan(2)

    const afterSlideRotation = await ellipse.evaluate((el) => {
      const transform = el.getAttribute('transform') || ''
      const m = transform.match(/rotate\(([-0-9.]+)/)
      return m ? parseFloat(m[1]) : 0
    })
    const beforeSlideRotation = await ellipse.evaluate((el) => {
      const transform = el.getAttribute('transform') || ''
      const m = transform.match(/rotate\(([-0-9.]+)/)
      return m ? parseFloat(m[1]) : 0
    })
    expect(afterSlideRotation).toBeCloseTo(beforeSlideRotation, 5)
  })
})
