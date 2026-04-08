import Canny from './canny.mjs'

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
