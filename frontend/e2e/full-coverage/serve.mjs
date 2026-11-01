import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs/promises'

// Serves one SPA build the way Laravel does (routes at /, assets under /spa/) and passes /api/*, /storage/* and
// any other file the build does not hold (Laravel's public/: /landing/fonts, /assets/images) to a local Laravel
// server (`php8.5 artisan serve`), so the build runs against a real backend and real data.
//
//   node e2e/full-coverage/serve.mjs <build dir> [port] [laravel url]
//
// Defaults: port 5180, Laravel at http://127.0.0.1:8090. It listens on 127.0.0.1 only and refuses a Laravel URL
// that is not on this machine.
const [buildArg, portArg, apiArg] = process.argv.slice(2)
if (!buildArg) {
  console.error('usage: node e2e/full-coverage/serve.mjs <build dir> [port] [laravel url]')
  process.exit(2)
}
const root = path.resolve(buildArg)
const port = Number(portArg || 5180)
const api = new URL(apiArg || 'http://127.0.0.1:8090')
if (!['127.0.0.1', 'localhost', '::1'].includes(api.hostname)) {
  console.error(`serve.mjs: refusing a backend that is not local (${api.hostname})`)
  process.exit(2)
}
await fs.access(path.join(root, 'index.html'))

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
}

function proxy(request, response) {
  const upstream = http.request({
    host: api.hostname, port: api.port || 80, method: request.method, path: request.url,
    headers: { ...request.headers, host: api.host },
  }, answer => {
    response.writeHead(answer.statusCode || 502, answer.headers)
    answer.pipe(response)
  })
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('Laravel is not answering') })
  request.pipe(upstream)
}

http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (pathname.startsWith('/api/') || pathname.startsWith('/storage/')) return proxy(request, response)
    const asset = pathname === '/' ? 'index.html' : pathname.startsWith('/spa/') ? pathname.slice(5) : pathname.slice(1)
    const file = path.resolve(root, asset)
    if (!file.startsWith(root + path.sep)) { response.writeHead(404); response.end(); return }
    let body, ext = path.extname(file)
    try { body = await fs.readFile(file) }
    catch {
      // A file the build does not have is one of Laravel's public files (/landing/fonts, /assets/images).
      if (ext) return proxy(request, response)
      body = await fs.readFile(path.join(root, 'index.html')); ext = '.html'
    }
    // Hashed assets are cached as in production, so a context loads each font once and every screen after the
    // first renders with it from the start (a chart measures its labels in whatever face it has at that moment).
    const cache = pathname.startsWith('/spa/assets/') ? 'public, max-age=31536000, immutable' : 'no-store'
    response.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': cache })
    response.end(body)
  } catch { response.writeHead(400); response.end() }
}).listen(port, '127.0.0.1', () => console.log(`${root} on http://127.0.0.1:${port}, API ${api.origin}`))
