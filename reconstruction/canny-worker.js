importScripts('canny.js')

self.onmessage = async (e) => {
  let {source, options} = e.data
  try {
    if (typeof source === 'string') {
      const resp = await fetch(source)
      const blob = await resp.blob()
      const bitmap = await createImageBitmap(blob)
      const {width, height} = bitmap
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, 0, 0)
      source = ctx.getImageData(0, 0, width, height)
      bitmap.close()
    }
    const result = Canny.process(source, options)
    const canvas = new OffscreenCanvas(result.width, result.height)
    const ctx = canvas.getContext('2d')
    ctx.putImageData(result, 0, 0)
    const blob = await canvas.convertToBlob()
    self.postMessage({result: blob})
  } catch (error) {
    self.postMessage({error: error.message})
  }
}
