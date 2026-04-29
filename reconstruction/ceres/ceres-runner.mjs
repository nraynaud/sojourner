import fs from 'fs'
import JSZip from 'jszip'
import runCeres from './ceres.mjs'

async function runTestProject () {
  const data = fs.readFileSync('../test_project.zip')
  const zip = await JSZip.loadAsync(data)
  const docFile = zip.file('document.json')
  if (!docFile) return
  const doc = JSON.parse(await docFile.async('string'))

  const imgId = doc.currentImageId
  // Image size 8688x5792 confirmed via file command on img-4rt6nfe0s
  const imgSize = [8688, 5792]

  const vertices = doc.entities.filter(e => e.type === 'vertex' && e.geometries[imgId])
  const collectedVertices = vertices.map(v => [
    v.attributes.x, v.attributes.y, v.attributes.z,
    v.geometries[imgId].attributes.x, v.geometries[imgId].attributes.y
  ])

  const directions = doc.entities.filter(e => e.type === 'direction' && e.geometries[imgId])
  const byDirection = {}
  for (const d of directions) {
    const key = JSON.stringify(d.attributes)
    if (!byDirection[key]) byDirection[key] = []
    const g = d.geometries[imgId].attributes
    byDirection[key].push([g.x1, g.y1, g.x2, g.y2])
  }

  runCeres(imgSize, collectedVertices, byDirection)
}

runTestProject().catch(console.error)
