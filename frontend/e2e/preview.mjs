import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs/promises'

// Serve the built SPA like Laravel: routes at /, immutable assets under /spa/.
// This local fixture host has no backend or production credentials.
const root = path.resolve(process.env.E2E_BUILD_DIR || 'dist')
const port = Number(process.env.E2E_PORT || 5175)
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
await fs.access(path.join(root, 'index.html'))
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (pathname.startsWith('/api/')) { response.writeHead(503); response.end('Fixture API is not installed'); return }
    const asset = pathname === '/' ? 'index.html' : pathname.startsWith('/spa/') ? pathname.slice(5) : pathname.slice(1)
    const file = path.resolve(root, asset)
    if (!file.startsWith(root + path.sep)) { response.writeHead(404); response.end(); return }
    let body, ext = path.extname(file)
    try { body = await fs.readFile(file) }
    catch {
      if (ext) { response.writeHead(404); response.end(); return }
      body = await fs.readFile(path.join(root, 'index.html')); ext = '.html'
    }
    response.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(body)
  } catch { response.writeHead(400); response.end() }
}).listen(port, '127.0.0.1', () => console.log(`Fixture preview: http://127.0.0.1:${port}`))
