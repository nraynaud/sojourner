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
    img.className = 'test-image'

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
  imageContainer.style.gap= '10px'

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

QUnit.module('Canny Edge Detector', function() {

  function createTestImageData(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    return new ImageData(data, width, height);
  }

  QUnit.test('toGrayscale should convert RGB to luminance', function(assert) {
    const width = 2, height = 1;
    const imageData = {
      width: width,
      height: height,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, // Red
        255, 255, 255, 255 // White
      ])
    };

    const gray = Canny.toGrayscale(imageData);

    assert.equal(gray.length, 2, 'Gray array should have correct length');
    // 0.299 * 255 + 0.587 * 0 + 0.114 * 0 = 76.245
    assert.close(gray[0], 76.245, 0.001, 'Red pixel luminance should be correct');
    assert.close(gray[1], 255, 0.001, 'White pixel luminance should be correct');
  });

  QUnit.test('gaussianBlur should reduce noise', function(assert) {
    const width = 51, height = 51;
    const data = new Float32Array(width * height).fill(0);
    const centerIdx = Math.floor(height / 2) * width + Math.floor(width / 2);
    data[centerIdx] = 255; // Center pixel is white, others black

    const blurred = Canny.gaussianBlur(data, width, height, 1.0);

    assert.equal(blurred.length, 51 * 51, 'Blurred array should have correct length');
    assert.ok(blurred[centerIdx] < 255, 'Center pixel should be blurred');
    assert.ok(blurred[centerIdx - 1] > 0, 'Neighboring pixels should have some value');

    let sum = 0;
    for (let i = 0; i < blurred.length; i++) sum += blurred[i];
    assert.close(sum, 255, 0.001, 'Total energy should be preserved');
  });

  QUnit.test('sobel should detect gradients', function(assert) {
    const width = 3, height = 3;
    const data = new Float32Array([
      0, 0, 255,
      0, 0, 255,
      0, 0, 255
    ]);

    const {magnitude, direction} = Canny.sobel(data, width, height);

    // Vertical edge at x=1.5
    // Gx for center (1,1) should be positive
    // gy for center (1,1) should be 0
    assert.ok(magnitude[4] > 0, 'Magnitude at center should be positive');
    assert.equal(direction[4], 0, 'Direction at vertical edge should be 0 (horizontal gradient)');
  });

  QUnit.test('process should return ImageData with edges', async function(assert) {
    // We'll use a mock since we can't easily create a real ImageData in some environments without a DOM
    // In many browser-based environments, ImageData is available, but if we're in a pure Node environment it might not be.
    // However, the test runner tests.html is designed for a browser environment.

    // Check if ImageData is available
    if (typeof ImageData === 'undefined') {
      assert.ok(true, 'Skipping ImageData test (ImageData not defined in this environment)');
      return;
    }

    const width = 10, height = 10;
    const imageData = createTestImageData(width, height);

    // Create a white square in the middle
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        const idx = (y * width + x) * 4;
        imageData.data[idx] = imageData.data[idx+1] = imageData.data[idx+2] = 255;
        imageData.data[idx+3] = 255;
      }
    }

    const result = Canny.process(imageData, {lowThreshold: 20, highThreshold: 50});

    await assert.imagesTest([imageData, result], ['Original Image', 'Canny Result'], 'Should have detected some edges');

    assert.ok(result instanceof ImageData, 'Result should be ImageData');
    assert.equal(result.width, width);
    assert.equal(result.height, height);

    // Check if we have some white pixels (edges)
    let edgeFound = false;
    for (let i = 0; i < result.data.length; i += 4) {
      if (result.data[i] === 255) {
        edgeFound = true;
        break;
      }
    }
    assert.ok(edgeFound, 'Edge pixels should be present in the result');
  });

  QUnit.test('processAsync should detect edges using a Web Worker (ImageData)', async function(assert) {
    const width = 10, height = 10;
    const imageData = createTestImageData(width, height);

    // Create a white square in the middle
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        const idx = (y * width + x) * 4;
        imageData.data[idx] = imageData.data[idx+1] = imageData.data[idx+2] = 255;
        imageData.data[idx+3] = 255;
      }
    }

    // Create a copy to avoid detachment issues during test visualization
    const imageDataCopy = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
    const blob = await Canny.processAsync(imageData, {lowThreshold: 20, highThreshold: 50});
    const result = await createImageBitmap(blob);

    await assert.imagesTest([imageDataCopy, result], ['Original Image', 'Async Canny Result (ImageData)'], 'Should have detected edges asynchronously');

    assert.ok(blob instanceof Blob, 'Result should be Blob');
    assert.equal(result.width, width);
    assert.equal(result.height, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(result, 0, 0);
    const resultData = ctx.getImageData(0, 0, width, height).data;

    let edgeFound = false;
    for (let i = 0; i < resultData.length; i += 4) {
      if (resultData[i] === 255) {
        edgeFound = true;
        break;
      }
    }
    assert.ok(edgeFound, 'Edge pixels should be present in the async result');
  });

  QUnit.test('processAsync should detect edges using a Web Worker (URL string)', async function(assert) {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, 10, 10);
    ctx.fillStyle = 'white';
    ctx.fillRect(3, 3, 4, 4);
    const dataUrl = canvas.toDataURL();

    const blob = await Canny.processAsync(dataUrl, {lowThreshold: 20, highThreshold: 50});
    const result = await createImageBitmap(blob);

    await assert.imagesTest([canvas.getContext('2d').getImageData(0, 0, 10, 10), result], ['Original Canvas (URL)', 'Async Canny Result (URL string)'], 'Should have detected edges asynchronously from URL');

    assert.ok(blob instanceof Blob, 'Result should be Blob');
    assert.equal(result.width, 10);
    assert.equal(result.height, 10);

    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = 10;
    resultCanvas.height = 10;
    resultCanvas.getContext('2d').drawImage(result, 0, 0);
    const resultData = resultCanvas.getContext('2d').getImageData(0, 0, 10, 10).data;

    let edgeFound = false;
    for (let i = 0; i < resultData.length; i += 4) {
      if (resultData[i] === 255) {
        edgeFound = true;
        break;
      }
    }
    assert.ok(edgeFound, 'Edge pixels should be present in the async result from URL');
  });

});

// Helper for approximate equality
QUnit.assert.close = function(actual, expected, maxDifference, message) {
  const actualDiff = Math.abs(actual - expected);
  const result = actualDiff <= maxDifference;
  this.pushResult({
    result: result,
    actual: actual,
    expected: expected,
    message: message || `Expected ${expected} but was ${actual} (diff: ${actualDiff}, max: ${maxDifference})`
  });
};
