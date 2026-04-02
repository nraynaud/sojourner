import WabtModule from './lib/libwabt.js'

export default class Canny {
  static wasmMemory = null

  static sobelModule = null

  static async initWasm (pagesNeeded = 1) {
    if (this.wasmModule) return
    console.time('initWasm')
    const wabt = await WabtModule({
      locateFile: (url) => {
        if (url.endsWith('.wasm')) {
          return new URL('./lib/' + url, import.meta.url).href
        }
        return url
      }
    })
    const [convolveWat, sobelWat] = await Promise.all([
      fetch('./convolve.wat').then(r => r.text()),
      fetch('./sobel.wat').then(r => r.text())
    ])

    this.wasmMemory = new WebAssembly.Memory({initial: pagesNeeded})
    let importObject = {env: {memory: this.wasmMemory}}
    const compile = async (filname, text) => {
      const module = wabt.parseWat(filname, text, {relaxed_simd: true})
      return (await WebAssembly.instantiate(module.toBinary().buffer, importObject)).instance
    }
    this.wasmModule = await compile('convolve.wat', convolveWat)
    this.sobelModule = await compile('sobel.wat', sobelWat)
    console.timeEnd('initWasm')
  }

  /**
   * Applies Canny edge detection to ImageData.
   * @param {ImageData} imageData - The source image data.
   * @param {Object} [options] - Options for processing.
   * @param {number} [options.lowThreshold=20] - Lower bound for hysteresis.
   * @param {number} [options.highThreshold=50] - Upper bound for hysteresis.
   * @param {number} [options.blurSigma=1.4] - Gaussian blur sigma.
   * @returns {ImageData} - A new ImageData containing the edges.
   */
  static async process (imageData, {lowThreshold = 20, highThreshold = 50, blurSigma = 1.4} = {}) {
    console.time('Canny Total')
    const {width, height} = imageData
    const {
      stride,
      kernelMemSize,
      bufferAddresses,
      kernelAddr,
      pagesNeeded
    } = this.computeMemoryNeeds(width, height, this.computeKernelParams(blurSigma))

    await this.initWasm(pagesNeeded)

    console.time('toGrayscale')
    this.toGrayscale(imageData, stride, new Float32Array(this.wasmMemory.buffer, bufferAddresses[0]))
    console.timeEnd('toGrayscale')
    console.time('gaussianBlur')
    this.gaussianBlur(null, width, height, blurSigma, stride, {
      srcAddr: bufferAddresses[0],
      dstAddr: bufferAddresses[1],
      kernelAddr,
      kernelMemSize
    })
    console.timeEnd('gaussianBlur')
    console.time('sobel')
    const {magAddr, gxAddr, gyAddr} = this.sobel(width, height, stride, {
      srcAddr: bufferAddresses[0],
      magAddr: bufferAddresses[1],
      gxAddr: bufferAddresses[2],
      gyAddr: bufferAddresses[3]
    })
    console.timeEnd('sobel')
    console.time('nonMaximumSuppression')
    const magnitude = new Float32Array(this.wasmMemory.buffer, magAddr, stride * height)
    const gx = new Float32Array(this.wasmMemory.buffer, gxAddr, stride * height)
    const gy = new Float32Array(this.wasmMemory.buffer, gyAddr, stride * height)

    const suppressed = this.nonMaximumSuppression(magnitude, gx, gy, width, height, stride)
    console.timeEnd('nonMaximumSuppression')
    console.time('hysteresis')
    const edges = this.hysteresis(suppressed, width, height, lowThreshold, highThreshold)
    console.timeEnd('hysteresis')

    const result = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      const val = edges[i]
      const idx = i * 4
      result[idx] = result[idx + 1] = result[idx + 2] = val
      result[idx + 3] = 255
    }
    console.timeEnd('Canny Total')
    if (typeof ImageData !== 'undefined') {
      return new ImageData(result, width, height)
    }
    else {
      return {data: result, width, height}
    }
  }

  static computeMemoryNeeds (width, height, kernelMemSize) {
    // Pre-allocate all WASM memory needed for the pipeline
    const stride = (width + 3) & ~3
    const bytesPerElement = Float32Array.BYTES_PER_ELEMENT
    const bufferSize = stride * height * bytesPerElement
    const totalSize = bufferSize * 4 + kernelMemSize // Sobel needs 4 buffers, Gaussian needs 2 + kernel
    const pagesNeeded = Math.ceil(totalSize / 65536) + 1
    const bufferAddresses = [0, 1, 2, 3].map(i => i * bufferSize)
    const kernelAddr = bufferAddresses[bufferAddresses.length - 1] + bufferSize
    return {stride, kernelMemSize, bufferAddresses, kernelAddr, pagesNeeded}
  }

  static computeKernelParams (blurSigma) {
    const bytesPerElement = Float32Array.BYTES_PER_ELEMENT
    const kernelSize = Math.ceil(blurSigma * 3) * 2 + 1
    return (kernelSize + 3 & ~3) * bytesPerElement
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
      const worker = new Worker(workerScript, {type: 'module'})
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

  static toGrayscale (imageData, dstStride, destinationBuffer) {
    const {data, width, height} = imageData

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const idx = i * 4
        const wasmIdx = y * dstStride + x
        // Standard luminance weights: 0.299R + 0.587G + 0.114B
        destinationBuffer[wasmIdx] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
      }
    }
  }

  static copyToMem (src, memory, dstAddr, height, srcWidth, dstStride) {
    const dstView = new Float32Array(memory.buffer, dstAddr)
    for (let y = 0; y < height; y++) {
      dstView.set(src.subarray(y * srcWidth, (y + 1) * srcWidth), y * dstStride)
    }
  }

  static gaussianBlur (data, width, height, sigma, stride, {srcAddr, dstAddr, kernelAddr, kernelMemSize}) {
    const kernelElements = kernelMemSize / 4
    const center = Math.floor(kernelElements / 2)
    const kernelView = new Float32Array(this.wasmMemory.buffer, kernelAddr, kernelElements)
    let sum = 0
    for (let i = 0; i < kernelElements; i++) {
      const x = i - center
      kernelView[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
      sum += kernelView[i]
    }
    for (let i = 0; i < kernelElements; i++) kernelView[i] /= sum
    const {convolve_1d, copy_rect_transposed} = this.wasmModule.exports
    console.time('convolve')
    // Horizontal pass
    // The horizontal pass transposes: (x, y) in src -> (y, x) in dst
    // Copy left margin
    copy_rect_transposed(srcAddr, dstAddr, 0, 0, center, height, stride, height)
    // Copy right margin and tail
    const end_simd = (width - center) - ((width - center - center) % 4)
    const start_tail = center + end_simd
    copy_rect_transposed(srcAddr, dstAddr, start_tail, 0, width - start_tail, height, stride, height)
    convolve_1d(srcAddr, dstAddr, 0, height, width, stride, height, kernelAddr, kernelElements)
    // Vertical pass
    // Transpose back: (y, x) in dst -> (x, y) in src
    // Copy top margin
    copy_rect_transposed(dstAddr, srcAddr, 0, 0, width, center, height, stride)
    // Copy bottom margin and tail
    const end_simd_v = (height - center) - ((height - center - center) % 4)
    const start_tail_v = center + end_simd_v
    copy_rect_transposed(dstAddr, srcAddr, 0, start_tail_v, width, height - start_tail_v, height, stride)
    convolve_1d(dstAddr, srcAddr, 0, width, height, height, stride, kernelAddr, kernelElements)
    console.timeEnd('convolve')
    return srcAddr
  }

  static sobel (width, height, stride, {srcAddr, magAddr, gxAddr, gyAddr}) {
    this.sobelModule.exports.sobel(srcAddr, magAddr, gxAddr, gyAddr, width, height, stride)
    return {magAddr, gxAddr, gyAddr}
  }

  static nonMaximumSuppression (magnitude, gx, gy, width, height, stride) {
    const suppressed = new Float32Array(width * height)
    const getNeighborOffset = (gxVal, gyVal) => {
      const absGx = Math.abs(gxVal)
      const absGy = Math.abs(gyVal)
      if (absGy < 0.4142 * absGx) {
        return 1
      }
      if (absGy > 2.4142 * absGx) {
        return stride
      }
      if ((gxVal > 0 && gyVal > 0) || (gxVal < 0 && gyVal < 0)) {
        return stride + 1
      }
      if (absGx > 0 || absGy > 0) {
        return stride - 1
      }
      return 0
    }
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const wasmIdx = y * stride + x
        const gxVal = gx[wasmIdx]
        const gyVal = gy[wasmIdx]

        const m = magnitude[wasmIdx]
        const offset = getNeighborOffset(gxVal, gyVal)
        const q = offset === 0 ? 255 : magnitude[wasmIdx + offset]
        const r = offset === 0 ? 255 : magnitude[wasmIdx - offset]

        if (m >= q && m >= r) {
          suppressed[idx] = m
        }
        else {
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
      }
      else if (data[i] >= low) {
        edges[i] = weak
      }
      else {
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
