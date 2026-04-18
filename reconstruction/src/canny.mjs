import WabtModule from '../lib/libwabt.js'

export default class Canny {
  static wasmMemory = null

  static sobelModule = null

  static initPromise = null

  static async initWasm (pagesNeeded = 1) {
    if (this.wasmModule && this.wasmMemory.buffer.byteLength >= pagesNeeded * 65536) return
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      const wabt = await WabtModule({
        locateFile: (url) => {
          if (url.endsWith('.wasm')) {
            return new URL('../lib/' + url, import.meta.url).href
          }
          return url
        }
      })
      const [convolveWat, sobelWat] = await Promise.all([
        fetch(new URL('./convolve.wat', import.meta.url).href).then(r => r.text()),
        fetch(new URL('./sobel.wat', import.meta.url).href).then(r => r.text())
      ])

      this.wasmMemory = new WebAssembly.Memory({initial: pagesNeeded})
      let importObject = {env: {memory: this.wasmMemory}}
      const compile = async (filename, text) => {
        try {
          const module = wabt.parseWat(filename, text, {relaxed_simd: true})
          const binary = module.toBinary({})
          const instancePromise = WebAssembly.instantiate(binary.buffer, importObject)
          module.destroy()
          const {instance} = await instancePromise
          return instance
        } catch (e) {
          console.error(`Error compiling ${filename}:`, e)
          throw e
        }
      }
      this.wasmModule = await compile('convolve.wat', convolveWat)
      this.sobelModule = await compile('sobel.wat', sobelWat)
    })()

    try {
      await this.initPromise
    } finally {
      this.initPromise = null
    }
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
    this.toGrayscale(imageData, stride, new Float32Array(this.wasmMemory.buffer, bufferAddresses[0]))
    this.gaussianBlur(null, width, height, blurSigma, stride, {
      srcAddr: bufferAddresses[0],
      dstAddr: bufferAddresses[1],
      kernelAddr,
      kernelMemSize
    })
    this.sobel(width, height, stride, {
      srcAddr: bufferAddresses[0],
      magAddr: bufferAddresses[1],
      neighborAddr: bufferAddresses[2]
    })
    const suppressedAddr = bufferAddresses[0] // Re-use buffer 0 for suppressed magnitude
    this.nonMaximumSuppression(width, height, stride, {
      magAddr: bufferAddresses[1],
      neighborAddr: bufferAddresses[2],
      dstAddr: suppressedAddr
    })
    const suppressed = new Float32Array(this.wasmMemory.buffer, suppressedAddr, stride * height)
    const edges = this.hysteresis(suppressed, width, height, stride, lowThreshold, highThreshold)
    const result = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      const val = edges[i]
      const idx = i * 4
      result[idx] = result[idx + 1] = result[idx + 2] = val
      result[idx + 3] = 255
    }
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
    const neighborBufferSize = stride * height // Uint8
    const totalSize = bufferSize * 2 + neighborBufferSize + kernelMemSize // Sobel needs 2 Float32 buffers + 1 Uint8 buffer, Gaussian needs 2 + kernel
    const pagesNeeded = Math.ceil(totalSize / 65536) + 1
    const bufferAddresses = [0, 1].map(i => i * bufferSize)
    bufferAddresses.push(2 * bufferSize) // Neighbor number buffer at the end of the 2 Float32 buffers
    const kernelAddr = bufferAddresses[bufferAddresses.length - 1] + neighborBufferSize
    return {stride, kernelMemSize, bufferAddresses, kernelAddr, pagesNeeded}
  }

  static computeKernelParams (blurSigma) {
    const bytesPerElement = Float32Array.BYTES_PER_ELEMENT
    const radius = Math.ceil(blurSigma * 3)
    const kernelElements = 2 * radius + 1
    return kernelElements * bytesPerElement
  }

  /**
   * Applies Canny edge detection in a Web Worker.
   * @param {ImageData|string} source - The source image data or an image URL.
   * @param {Object} [options] - Options for processing.
   * @param {string} [workerScript='canny-worker.mjs'] - Path to the worker script.
   * @returns {Promise<Blob>} - A promise that resolves with the new Blob.
   */
  static async processAsync (source, options = {}, workerScript = './src/canny.mjs') {
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
    const {data, width, height, format} = imageData

    const isBGR = format === 'BGRX' || format === 'BGRA'
    const isRGB = format === 'RGBA' || format === 'RGBX' || !format

    if (!isBGR && !isRGB) {
      throw new Error(`Unsupported image format: ${format}`)
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const idx = i * 4
        const wasmIdx = y * dstStride + x
        let r, g, b
        if (isBGR) {
          b = data[idx]
          g = data[idx + 1]
          r = data[idx + 2]
        }
        else {
          r = data[idx]
          g = data[idx + 1]
          b = data[idx + 2]
        }
        // Standard luminance weights: 0.299R + 0.587G + 0.114B
        destinationBuffer[wasmIdx] = 0.299 * r + 0.587 * g + 0.114 * b
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

  static sobel (width, height, stride, {srcAddr, magAddr, neighborAddr}) {
    this.sobelModule.exports.sobel(srcAddr, magAddr, neighborAddr, width, height, stride)
    return {magAddr, neighborAddr}
  }

  static nonMaximumSuppression (width, height, stride, {magAddr, neighborAddr, dstAddr}) {
    this.sobelModule.exports.non_maximum_suppression(magAddr, neighborAddr, dstAddr, width, height, stride)
  }

  static hysteresis (data, width, stride, height, low, high) {
    const edges = new Uint8Array(data.length)
    const strong = 255, weak = 50
    const stack = []
    const weakEdges = []

    for (let i = 0; i < data.length; i++) {
      if (i % stride < width)
        if (data[i] >= high) {
          edges[i] = strong
          stack.push(i)
        }
        else if (data[i] >= low) {
          edges[i] = weak
          weakEdges.push(i)
        }
        else {
          edges[i] = 0
        }
    }

    while (stack.length > 0) {
      const idx = stack.pop()
      const x = idx % stride, y = (idx / stride) | 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * stride + nx
            if (edges[nidx] === weak) {
              edges[nidx] = strong
              stack.push(nidx)
            }
          }
        }
      }
    }
    // Final pass to remove weak edges that were not connected to strong ones
    for (let i = 0; i < weakEdges.length; i++) {
      if (edges[weakEdges[i]] === weak) edges[weakEdges[i]] = 0
    }
    return edges
  }
}
// in worker
// https://stackoverflow.com/a/18002694
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = async (e) => {
    let {source, options} = e.data
    try {
      if (typeof source === 'string') {
        const resp = await fetch(source)
        const contentType = resp.headers.get('content-type') || 'image/png'
        const type = contentType.split(';')[0]
        const decoder = new ImageDecoder({
          data: resp.body,
          type: type,
        })
        const {image} = await decoder.decode()
        const {displayWidth: width, displayHeight: height} = image
        const data = new Uint8ClampedArray(width * height * 4)
        await image.copyTo(data)
        source = {data, width, height, format: image.format}
        image.close()
        decoder.close()
      }
      const result = await Canny.process(source, options)
      const canvas = new OffscreenCanvas(result.width, result.height)
      const ctx = canvas.getContext('2d', {alpha: false})
      ctx.putImageData(result, 0, 0)
      const blob = await canvas.convertToBlob()
      self.postMessage({result: blob})
    } catch (error) {
      console.log(error)
      self.postMessage({error: error.message})
    }
  }
}
