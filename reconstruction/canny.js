class Canny {
  /**
   * Applies Canny edge detection to ImageData.
   * @param {ImageData} imageData - The source image data.
   * @param {Object} [options] - Options for processing.
   * @param {number} [options.lowThreshold=20] - Lower bound for hysteresis.
   * @param {number} [options.highThreshold=50] - Upper bound for hysteresis.
   * @param {number} [options.blurSigma=1.4] - Gaussian blur sigma.
   * @returns {ImageData} - A new ImageData containing the edges.
   */
  static process (imageData, {lowThreshold = 20, highThreshold = 50, blurSigma = 1.4} = {}) {
    const {width, height} = imageData
    const gray = this.toGrayscale(imageData)
    const blurred = this.gaussianBlur(gray, width, height, blurSigma)
    const {magnitude, direction} = this.sobel(blurred, width, height)
    const suppressed = this.nonMaximumSuppression(magnitude, direction, width, height)
    const edges = this.hysteresis(suppressed, width, height, lowThreshold, highThreshold)

    const result = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      const val = edges[i]
      const idx = i * 4
      result[idx] = result[idx + 1] = result[idx + 2] = val
      result[idx + 3] = 255
    }
    return new ImageData(result, width, height)
  }

  /**
   * Applies Canny edge detection in a Web Worker.
   * @param {ImageData|string} source - The source image data or an image URL.
   * @param {Object} [options] - Options for processing.
   * @param {string} [workerScript='canny-worker.js'] - Path to the worker script.
   * @returns {Promise<Blob>} - A promise that resolves with the new Blob.
   */
  static async processAsync (source, options = {}, workerScript = 'canny-worker.js') {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerScript)
      worker.onmessage = e => {
        if (e.data.error) reject(new Error(e.data.error))
        else resolve(e.data.result)
        worker.terminate()
      }
      worker.onerror = e => {
        reject(new Error('Worker error: ' + e.message))
        worker.terminate()
      }
      // Use transferable objects for performance if source is ImageData
      const transferables = (source instanceof ImageData) ? [source.data.buffer] : []
      worker.postMessage({source, options}, transferables)
    })
  }

  static toGrayscale (imageData) {
    const {data} = imageData, len = data.length / 4
    const gray = new Float32Array(len)
    for (let i = 0; i < len; i++) {
      const idx = i * 4
      // Standard luminance weights: 0.299R + 0.587G + 0.114B
      gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
    }
    return gray
  }

  static gaussianBlur (data, width, height, sigma) {
    const size = Math.ceil(sigma * 3) * 2 + 1
    const kernel = new Float32Array(size)
    const center = Math.floor(size / 2)
    let sum = 0
    for (let i = 0; i < size; i++) {
      const x = i - center
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
      sum += kernel[i]
    }
    for (let i = 0; i < size; i++) kernel[i] /= sum

    const temp = new Float32Array(data.length)
    const result = new Float32Array(data.length)

    const convolve = (src, dst, w, h, horizontal) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let val = 0, weight = 0
          for (let i = 0; i < size; i++) {
            const offset = i - center
            const ix = x + (horizontal ? offset : 0)
            const iy = y + (horizontal ? 0 : offset)
            if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
              val += src[iy * w + ix] * kernel[i]
              weight += kernel[i]
            }
          }
          dst[y * w + x] = val / weight
        }
      }
    }

    convolve(data, temp, width, height, true)
    convolve(temp, result, width, height, false)

    return result
  }

  static sobel (data, width, height) {
    const magnitude = new Float32Array(data.length)
    const direction = new Float32Array(data.length)

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const gx = (
          -1 * data[idx - width - 1] + 1 * data[idx - width + 1] +
          -2 * data[idx - 1] + 2 * data[idx + 1] +
          -1 * data[idx + width - 1] + 1 * data[idx + width + 1]
        )
        const gy = (
          -1 * data[idx - width - 1] - 2 * data[idx - width] - 1 * data[idx - width + 1] +
          1 * data[idx + width - 1] + 2 * data[idx + width] + 1 * data[idx + width + 1]
        )
        magnitude[idx] = Math.sqrt(gx * gx + gy * gy)
        direction[idx] = Math.atan2(gy, gx)
      }
    }
    return {magnitude, direction}
  }

  static nonMaximumSuppression (magnitude, direction, width, height) {
    const suppressed = new Float32Array(magnitude.length)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        let angle = direction[idx] * 180 / Math.PI
        if (angle < 0) angle += 180

        let q = 255, r = 255
        if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle <= 180)) {
          q = magnitude[idx + 1]
          r = magnitude[idx - 1]
        } else if (angle >= 22.5 && angle < 67.5) {
          q = magnitude[idx + width + 1]
          r = magnitude[idx - width - 1]
        } else if (angle >= 67.5 && angle < 112.5) {
          q = magnitude[idx + width]
          r = magnitude[idx - width]
        } else if (angle >= 112.5 && angle < 157.5) {
          q = magnitude[idx + width - 1]
          r = magnitude[idx - width + 1]
        }

        if (magnitude[idx] >= q && magnitude[idx] >= r) {
          suppressed[idx] = magnitude[idx]
        } else {
          suppressed[idx] = 0
        }
      }
    }
    return suppressed
  }

  static hysteresis (data, width, height, low, high) {
    const edges = new Uint8Array(data.length)
    const strong = 255, weak = 50
    const stack = []

    for (let i = 0; i < data.length; i++) {
      if (data[i] >= high) {
        edges[i] = strong
        stack.push(i)
      } else if (data[i] >= low) {
        edges[i] = weak
      } else {
        edges[i] = 0
      }
    }

    while (stack.length > 0) {
      const idx = stack.pop()
      const x = idx % width, y = (idx / width) | 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx
            if (edges[nidx] === weak) {
              edges[nidx] = strong
              stack.push(nidx)
            }
          }
        }
      }
    }

    // Final pass to remove weak edges that were not connected to strong ones
    for (let i = 0; i < edges.length; i++) {
      if (edges[i] === weak) edges[i] = 0
    }

    return edges
  }
}
