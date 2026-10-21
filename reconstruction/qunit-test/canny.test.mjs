import Canny from '../src/canny.mjs'

async function showInCanvas (canvasElement, imageData) {
  canvasElement.style.backgroundColor = '#000'
  canvasElement.width = imageData.width
  canvasElement.height = imageData.height
  // avoid using "bitmaprenderer", because transferFromImageBitmap() detach the bitmap when drawing.
  // detached bitmaps can't be drawn again.
  const ctx = canvasElement.getContext('2d')
  if (imageData instanceof ImageData) {
    ctx.putImageData(imageData, 0, 0)
  }
  if (imageData instanceof ImageBitmap) {
    ctx.drawImage(imageData, 0, 0)
  }
}

async function addImageToTest (container, imageData, label) {
  if (imageData instanceof ImageData || imageData instanceof ImageBitmap) {
    const canvasElement = document.createElement('canvas')
    canvasElement.width = imageData.width
    canvasElement.height = imageData.height
    await showInCanvas(canvasElement, imageData)

    const img = canvasElement
    img.className = 'playwright-test-image'

    const imgContainer = document.createElement('div')
    imgContainer.style.marginTop = '10px'

    const imgLabel = document.createElement('div')
    imgLabel.textContent = label
    imgLabel.style.fontWeight = 'bold'

    imgContainer.appendChild(imgLabel)
    imgContainer.appendChild(img)
    container.appendChild(imgContainer)
  }
}

QUnit.assert.imagesTest = async function (images, captions, message, result = true) {
  const assertionList = document.getElementById('qunit-test-output-' + QUnit.config.current.testId)
    .querySelector('.qunit-assert-list')
  const imageContainer = document.createElement('div')
  imageContainer.className = 'test-images'
  imageContainer.style.display = 'flex'
  imageContainer.style.marginTop = '10px'
  imageContainer.style.gap = '10px'

  for (let i = 0; i < images.length; i++) {
    await addImageToTest(imageContainer, images[i], captions[i])
  }
  assertionList.appendChild(imageContainer)
  this.pushResult({
    result: result,
    actual: result,
    expected: true,
    message: message
  })
}

QUnit.module('Canny Edge Detector', function () {

  function createTestImageData (width, height) {
    const data = new Uint8ClampedArray(width * height * 4)
    return new ImageData(data, width, height)
  }

  QUnit.test('toGrayscale should convert RGB to luminance in WASM memory', async function (assert) {
    const width = 2, height = 1
    const imageData = {
      width: width,
      height: height,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, // Red
        255, 255, 255, 255 // White
      ])
    }
    let destination = new Float32Array(width * height)
    Canny.toGrayscale(imageData, width, destination)
    assert.close(destination[0], 0.299 * 255, 0.001, 'Red pixel luminance should be correct')
    assert.close(destination[1], 255, 0.001, 'White pixel luminance should be correct')
  })

  QUnit.test('toGrayscale should handle BGRX format', async function (assert) {
    const width = 2, height = 1
    const imageData = {
      width: width,
      height: height,
      format: 'BGRX',
      data: new Uint8ClampedArray([
        0, 0, 255, 255, // Blue in BGR is actually Red if we misinterpret it as RGB
        // Wait: in BGR, [B, G, R, X]
        // [0, 0, 255, 255] -> B=0, G=0, R=255 -> Red
        255, 0, 0, 255 // B=255, G=0, R=0 -> Blue
      ])
    }
    let destination = new Float32Array(width * height)
    Canny.toGrayscale(imageData, width, destination)
    // Red: 0.299*255 + 0.587*0 + 0.114*0 = 76.245
    // Blue: 0.299*0 + 0.587*0 + 0.114*255 = 29.07
    assert.close(destination[0], 76.245, 0.001, 'Red pixel luminance (from BGRX) should be correct')
    assert.close(destination[1], 29.07, 0.001, 'Blue pixel luminance (from BGRX) should be correct')
  })

  QUnit.test('toGrayscale should throw on unknown format', async function (assert) {
    const imageData = {
      width: 1,
      height: 1,
      format: 'UNKNOWN',
      data: new Uint8ClampedArray([0, 0, 0, 255])
    }
    let destination = new Float32Array(1)
    assert.throws(() => {
      Canny.toGrayscale(imageData, 1, destination)
    }, /Unsupported image format: UNKNOWN/, 'Should throw on unknown format')
  })

  QUnit.test('gaussianBlur should reduce noise', async function (assert) {
    const width = 200, height = 300
    const data = new Float32Array(width * height).fill(0)
    const centerIdx = Math.floor(height / 2) * width + Math.floor(width / 2)
    data[centerIdx] = 255 // Center pixel is white, others black
    const blurSigma = 1.0
    const {
      stride,
      kernelMemSize,
      bufferAddresses,
      kernelAddr,
      pagesNeeded
    } = Canny.computeMemoryNeeds(width, height, Canny.computeKernelParams(blurSigma))
    await Canny.initWasm(pagesNeeded)
    Canny.copyToMem(data, Canny.wasmMemory, bufferAddresses[0], height, width, stride)
    await Canny.gaussianBlur(null, width, height, blurSigma, stride, {
      srcAddr: bufferAddresses[0],
      dstAddr: bufferAddresses[1],
      kernelAddr, kernelMemSize
    })
    const blurred = new Float32Array(Canny.wasmMemory.buffer, 0)
    console.log(blurred)
    assert.ok(blurred[centerIdx] < 255, 'Center pixel should be blurred')
    assert.ok(blurred[centerIdx - 1] > 0, 'Neighboring pixels should have some value')

    let sum = 0
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        sum += blurred[y * stride + x]
      }
    }
    assert.close(sum, 255, 0.001, 'Total energy should be preserved')
  })

  QUnit.test('sobel should detect gradients', async function (assert) {
    const width = 10, height = 10
    const data = new Float32Array(width * height).fill(0)
    for (let y = 0; y < height; y++) {
      for (let x = 5; x < width; x++) {
        data[y * width + x] = 255
      }
    }
    const blurSigma = 1.0
    const {
      stride,
      bufferAddresses,
      pagesNeeded
    } = Canny.computeMemoryNeeds(width, height, Canny.computeKernelParams(blurSigma))
    await Canny.initWasm(pagesNeeded)

    Canny.copyToMem(data, Canny.wasmMemory, bufferAddresses[0], height, width, stride)
    const {magAddr} = await Canny.sobel(width, height, stride, {
      srcAddr: bufferAddresses[0],
      magAddr: bufferAddresses[1],
      neighborAddr: bufferAddresses[2]
    })
    const wasmMemory = new Float32Array(Canny.wasmMemory.buffer)

    // Vertical edge at x=4.5
    // Gx for (1,4) should be positive
    // gy for (1,4) should be 0
    // gx = (255 - 0) + 2*(255 - 0) + (255 - 0) = 4 * 255 = 1020
    const centerIdx = 1 * stride + 4
    assert.close(wasmMemory[magAddr / 4 + centerIdx], 1020, 0.001, 'Magnitude at center should be correct')
    // Direction was tested via atan2(gy, gx), but now we precompute neighbor index.
    // We'll rely on the 'sobel should compute correct neighbor numbers' playwright-test for direction accuracy.
  })

  QUnit.test('sobel should compute correct neighbor numbers', async function (assert) {
    const width = 10, height = 10
    const blurSigma = 1.0
    const {
      stride,
      bufferAddresses,
      pagesNeeded
    } = Canny.computeMemoryNeeds(width, height, Canny.computeKernelParams(blurSigma))
    await Canny.initWasm(pagesNeeded)

    const testCases = [
      {
        name: 'Horizontal gradient (Vertical edge)',
        pattern: (x, y) => x >= 5 ? 255 : 0,
        expectedNeighbor: 0 // Horizontal
      },
      {
        name: 'Vertical gradient (Horizontal edge)',
        pattern: (x, y) => y >= 5 ? 255 : 0,
        expectedNeighbor: 2 // Vertical
      },
      {
        name: 'Diagonal gradient (Positive slope, /)',
        // Edge is y = -x + c, gradient is (1, 1) or (-1, -1)
        // gy/gx = 1 > 0, diagonal = 0, neighbor = 1 + 0 = 1
        pattern: (x, y) => (x + y) >= 10 ? 255 : 0,
        expectedNeighbor: 1
      },
      {
        name: 'Diagonal gradient (Negative slope, \\)',
        // Edge is y = x + c, gradient is (1, -1) or (-1, 1)
        // gy/gx = -1 < 0, diagonal = 2, neighbor = 1 + 2 = 3
        pattern: (x, y) => (y - x) >= 0 ? 255 : 0,
        expectedNeighbor: 3
      }
    ]

    for (const tc of testCases) {
      const data = new Float32Array(width * height)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          data[y * width + x] = tc.pattern(x, y)
        }
      }

      Canny.copyToMem(data, Canny.wasmMemory, bufferAddresses[0], height, width, stride)
      const {neighborAddr} = await Canny.sobel(width, height, stride, {
        srcAddr: bufferAddresses[0],
        magAddr: bufferAddresses[1],
        neighborAddr: bufferAddresses[2]
      })

      const neighbors = new Uint8Array(Canny.wasmMemory.buffer, neighborAddr, stride * height)
      // Check center pixels (avoiding margins)
      const centerX = 5
      const centerY = 5
      const actualNeighbor = neighbors[centerY * stride + centerX]
      assert.equal(actualNeighbor, tc.expectedNeighbor, `${tc.name} should have neighbor index ${tc.expectedNeighbor}`)
    }
  })

  QUnit.test('process should return ImageData with edges', async function (assert) {
    // We'll use a mock since we can't easily create a real ImageData in some environments without a DOM
    // In many browser-based environments, ImageData is available, but if we're in a pure Node environment it might not be.
    // However, the playwright-test runner playwright-test.html is designed for a browser environment.

    // Check if ImageData is available
    if (typeof ImageData === 'undefined') {
      assert.ok(true, 'Skipping ImageData playwright-test (ImageData not defined in this environment)')
      return
    }

    const width = 10, height = 10
    const imageData = createTestImageData(width, height)

    // Create a white square in the middle
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        const idx = (y * width + x) * 4
        imageData.data[idx] = imageData.data[idx + 1] = imageData.data[idx + 2] = 255
        imageData.data[idx + 3] = 255
      }
    }

    const result = await Canny.process(imageData, {lowThreshold: 20, highThreshold: 50})

    await assert.imagesTest([imageData, result], ['Original Image', 'Canny Result'], 'Should have detected some edges')

    assert.ok(result instanceof ImageData, 'Result should be ImageData')
    assert.equal(result.width, width)
    assert.equal(result.height, height)

    // Check if we have some white pixels (edges)
    let edgeFound = false
    for (let i = 0; i < result.data.length; i += 4) {
      if (result.data[i] === 255) {
        edgeFound = true
        break
      }
    }
    assert.ok(edgeFound, 'Edge pixels should be present in the result')
  })

  QUnit.test('processAsync should detect edges using a Web Worker (ImageData)', async function (assert) {
    const width = 10, height = 10
    const imageData = createTestImageData(width, height)

    // Create a white square in the middle
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        const idx = (y * width + x) * 4
        imageData.data[idx] = imageData.data[idx + 1] = imageData.data[idx + 2] = 255
        imageData.data[idx + 3] = 255
      }
    }

    // Create a copy to avoid detachment issues during playwright-test visualization
    const imageDataCopy = new ImageData(new Uint8ClampedArray(imageData.data), width, height)
    const blob = await Canny.processAsync(imageData, {lowThreshold: 20, highThreshold: 50})
    const result = await createImageBitmap(blob)

    await assert.imagesTest([imageDataCopy, result], ['Original Image', 'Async Canny Result (ImageData)'], 'Should have detected edges asynchronously')

    assert.ok(blob instanceof Blob, 'Result should be Blob')
    assert.equal(result.width, width)
    assert.equal(result.height, height)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(result, 0, 0)
    const resultData = ctx.getImageData(0, 0, width, height).data

    let edgeFound = false
    for (let i = 0; i < resultData.length; i += 4) {
      if (resultData[i] === 255) {
        edgeFound = true
        break
      }
    }
    assert.ok(edgeFound, 'Edge pixels should be present in the async result')
  })

  QUnit.test('processAsync should detect edges using a Web Worker (URL string)', async function (assert) {
    const canvas = document.createElement('canvas')
    canvas.width = 10
    canvas.height = 10
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, 10, 10)
    ctx.fillStyle = 'white'
    ctx.fillRect(3, 3, 4, 4)
    const dataUrl = canvas.toDataURL()

    const blob = await Canny.processAsync(dataUrl, {lowThreshold: 20, highThreshold: 50})
    const result = await createImageBitmap(blob)

    await assert.imagesTest([canvas.getContext('2d').getImageData(0, 0, 10, 10), result], ['Original Canvas (URL)', 'Async Canny Result (URL string)'], 'Should have detected edges asynchronously from URL')

    assert.ok(blob instanceof Blob, 'Result should be Blob')
    assert.equal(result.width, 10)
    assert.equal(result.height, 10)

    const resultCanvas = document.createElement('canvas')
    resultCanvas.width = 10
    resultCanvas.height = 10
    resultCanvas.getContext('2d').drawImage(result, 0, 0)
    const resultData = resultCanvas.getContext('2d').getImageData(0, 0, 10, 10).data

    let edgeFound = false
    for (let i = 0; i < resultData.length; i += 4) {
      if (resultData[i] === 255) {
        edgeFound = true
        break
      }
    }
    assert.ok(edgeFound, 'Edge pixels should be present in the async result from URL')
  })

  QUnit.module('WebAssembly Convolution', function () {
    QUnit.test('copy_rect_transposed should copy and transpose a rectangle', async function (assert) {
      await Canny.initWasm()
      const {copy_rect_transposed} = Canny.wasmModule.exports
      const mem = new Float32Array(Canny.wasmMemory.buffer)

      const srcWidth = 10, srcHeight = 10
      const srcStride = 10
      const dstStride = 10
      const srcAddr = 0
      const dstAddr = 1024 // safely away from src

      // Fill src with pattern (y * 100 + x)
      for (let y = 0; y < srcHeight; y++) {
        for (let x = 0; x < srcWidth; x++) {
          mem[srcAddr / 4 + y * srcStride + x] = y * 100 + x
        }
      }

      // Copy 3x2 rectangle starting at (2, 1)
      const rectX = 2, rectY = 1, rectW = 3, rectH = 2
      copy_rect_transposed(srcAddr, dstAddr, rectX, rectY, rectW, rectH, srcStride, dstStride)

      // Verify: (src_x, src_y) -> (dst_y, dst_x)
      // Destination base is (rectX, rectY) in transposed space?
      // Actually the function is:
      // dst addr = dst + (x + col_idx) * dst_stride * 4 + (y + row_idx) * 4
      // where col_idx in [0, rectW) and row_idx in [0, rectH)
      // So it copies src[rectY + row_idx][rectX + col_idx] to dst[rectX + col_idx][rectY + row_idx]

      for (let row = 0; row < rectH; row++) {
        for (let col = 0; col < rectW; col++) {
          const expected = (rectY + row) * 100 + (rectX + col)
          const actual = mem[dstAddr / 4 + (rectX + col) * dstStride + (rectY + row)]
          assert.equal(actual, expected, `Transposed value at (${rectX + col}, ${rectY + row}) should be ${expected}`)
        }
      }
    })

    QUnit.test('convolve_1d should convolve and transpose row-wise', async function (assert) {
      const width = 16, height = 4
      const {
        stride,
        bufferAddresses,
        kernelAddr,
        pagesNeeded
      } = Canny.computeMemoryNeeds(width, height, 3)
      await Canny.initWasm(pagesNeeded)
      const {convolve_1d} = Canny.wasmModule.exports
      const memory = Canny.wasmMemory.buffer
      const srcAddr = bufferAddresses[0]
      const dstAddr = bufferAddresses[1]

      // Identity-like kernel: [0, 1, 0]
      const kernel = new Float32Array([0, 1, 0])
      new Float32Array(memory, kernelAddr).set(kernel)

      const inputView = new Float32Array(memory, srcAddr)
      // Fill src with data
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          inputView[y * stride + x] = y * 10 + x
        }
      }

      // Convolve rows 0 to 4
      convolve_1d(srcAddr, dstAddr, 0, height, width, stride, height, kernelAddr, 3)

      const outputView = new Float32Array(memory, dstAddr)
      // Verify results in transposed destination: dst[x][y]
      // center = 1. SIMD loop processes x from 1 to 16 - 1 - 4 = 11.
      // x = 1, 5, 9.
      // Total convolved: 12 pixels per row.
      for (let y = 0; y < height; y++) {
        for (let x = 1; x <= 12; x++) {
          const expected = y * 10 + x
          const actual = outputView[x * height + y]
          assert.equal(actual, expected, `Convolved value at transposed (${x}, ${y}) should be ${expected}`)
        }
      }
    })
  })

})

// Helper for approximate equality
QUnit.assert.close = function (actual, expected, maxDifference, message) {
  const actualDiff = Math.abs(actual - expected)
  const result = actualDiff <= maxDifference
  this.pushResult({
    result: result,
    actual: actual,
    expected: expected,
    message: message || `Expected ${expected} but was ${actual} (diff: ${actualDiff}, max: ${maxDifference})`
  })
}
