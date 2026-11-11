// Loopback-only server for an Expo export. API fixtures are installed separately in Playwright.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 5837);
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Provide an Expo web export directory');
const mime = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ttf':'font/ttf', '.woff':'font/woff', '.ico':'image/x-icon' };
http.createServer((req,res) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)); }
  catch { res.writeHead(400); return res.end(); }
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(file)) { res.writeHead(404); return res.end(); }
    file = path.join(root, 'index.html');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  const stream = fs.createReadStream(file);
  stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
  stream.pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Member fixture preview listening on 127.0.0.1:${port}`));
