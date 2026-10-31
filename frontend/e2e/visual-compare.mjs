import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Compares two screenshot folders from the browser runner (`E2E_OUTPUT=<dir> npm run test:browser`), pixel by pixel,
// so a change that should not alter the design (a Tailwind or icon-library upgrade) can be checked screen by screen.
//
//   node e2e/visual-compare.mjs <before dir> <after dir> [report dir]
//
// Every PNG present in either folder is matched by its relative path. A pixel counts as changed when any channel
// differs by more than VISUAL_TOLERANCE (default 8 of 255, which absorbs anti-aliasing noise). An image fails when
// more than VISUAL_MAX_RATIO of its pixels changed (default 0.001 = 0.1 %), when its size changed, or when it exists
// on one side only. The report directory gets a diff PNG per failing image (changed pixels in red over a faded copy
// of the "after" image) and report.json. Exit status 1 when any image fails.
const [before, after, reportArg] = process.argv.slice(2)
if (!before || !after) {
  console.error('usage: node e2e/visual-compare.mjs <before dir> <after dir> [report dir]')
  process.exit(2)
}
const tolerance = Number(process.env.VISUAL_TOLERANCE ?? 8)
const maxRatio = Number(process.env.VISUAL_MAX_RATIO ?? 0.001)
const report = path.resolve(reportArg || 'test-results/visual-compare')
await fs.mkdir(report, { recursive: true })

async function pngs(root) {
  const found = new Map()
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name.toLowerCase().endsWith('.png')) found.set(path.relative(root, full).replaceAll('\\', '/'), full)
    }
  }
  await walk(path.resolve(root))
  return found
}

const left = await pngs(before), right = await pngs(after)
const names = [...new Set([...left.keys(), ...right.keys()])].sort()
const browser = await chromium.launch({ headless: true, ...(process.env.E2E_EXECUTABLE ? { executablePath: process.env.E2E_EXECUTABLE } : {}) })
const page = await browser.newPage()
await page.setContent('<!doctype html><title>compare</title>')
const results = []
try {
  for (const name of names) {
    if (!left.has(name) || !right.has(name)) {
      results.push({ name, status: left.has(name) ? 'missing after' : 'new after' })
      continue
    }
    const [a, b] = await Promise.all([fs.readFile(left.get(name)), fs.readFile(right.get(name))])
    if (a.equals(b)) { results.push({ name, status: 'identical', ratio: 0 }); continue }
    const outcome = await page.evaluate(async ({ a, b, tolerance }) => {
      const load = async data => createImageBitmap(await (await fetch('data:image/png;base64,' + data)).blob())
      const [ia, ib] = await Promise.all([load(a), load(b)])
      if (ia.width !== ib.width || ia.height !== ib.height) return { sizeChanged: `${ia.width}x${ia.height} -> ${ib.width}x${ib.height}` }
      const read = image => { const c = new OffscreenCanvas(image.width, image.height), x = c.getContext('2d'); x.drawImage(image, 0, 0); return x.getImageData(0, 0, image.width, image.height) }
      const da = read(ia).data, db = read(ib), out = new ImageData(ib.width, ib.height)
      let changed = 0
      for (let i = 0; i < da.length; i += 4) {
        const differs = Math.abs(da[i] - db.data[i]) > tolerance || Math.abs(da[i + 1] - db.data[i + 1]) > tolerance
          || Math.abs(da[i + 2] - db.data[i + 2]) > tolerance || Math.abs(da[i + 3] - db.data[i + 3]) > tolerance
        if (differs) { changed++; out.data.set([255, 0, 0, 255], i) }
        else { const grey = (db.data[i] + db.data[i + 1] + db.data[i + 2]) / 3; out.data.set([grey, grey, grey, 60], i) }
      }
      const canvas = new OffscreenCanvas(ib.width, ib.height)
      canvas.getContext('2d').putImageData(out, 0, 0)
      const diff = await canvas.convertToBlob({ type: 'image/png' })
      const bytes = new Uint8Array(await diff.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return { changed, total: da.length / 4, diff: btoa(binary) }
    }, { a: a.toString('base64'), b: b.toString('base64'), tolerance })
    if (outcome.sizeChanged) { results.push({ name, status: 'size changed', detail: outcome.sizeChanged }); continue }
    const ratio = outcome.changed / outcome.total
    const status = ratio > maxRatio ? 'changed' : 'within tolerance'
    if (status === 'changed') {
      const file = path.join(report, name.replace(/\.png$/i, '.diff.png'))
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, Buffer.from(outcome.diff, 'base64'))
    }
    results.push({ name, status, ratio: Number(ratio.toFixed(6)), changedPixels: outcome.changed })
  }
} finally {
  await browser.close()
}
await fs.writeFile(path.join(report, 'report.json'), JSON.stringify({ before: path.resolve(before), after: path.resolve(after), tolerance, maxRatio, results }, null, 2) + '\n')
const failing = results.filter(r => !['identical', 'within tolerance'].includes(r.status))
const count = status => results.filter(r => r.status === status).length
console.log(`${results.length} screenshots: ${count('identical')} identical, ${count('within tolerance')} within tolerance, ${failing.length} different.`)
for (const r of failing) console.log(`  ${r.status.padEnd(16)} ${r.name}${r.ratio !== undefined ? `  (${(r.ratio * 100).toFixed(3)} % of pixels)` : r.detail ? `  (${r.detail})` : ''}`)
console.log(`Report: ${path.join(report, 'report.json')}`)
process.exitCode = failing.length ? 1 : 0
