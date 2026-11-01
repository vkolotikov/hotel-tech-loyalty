// WebKit screenshots (WebKitGTK's MiniBrowser through WebKitWebDriver, the engine family Safari uses) of the screens
// a Chromium run of shoot.mjs took (its run.json), against the same seeded backend (README.md, "WebKit"). W3C WebDriver
// over HTTP, no client library. Serve a copy made by webkit-build.sh, not the build itself.
//
//   WK_BASE=http://127.0.0.1:5180 WK_OUT=<dir> WK_LIST=<a Chromium run's run.json> FC_STAFF_EMAIL=… \
//     FC_STAFF_PASSWORD=… FC_MEMBER_EMAIL=… FC_MEMBER_PASSWORD=… DISPLAY=<an X display> node e2e/full-coverage/shoot-webkit.mjs
//
// Options: WK_WORKERS (browsers at once, default 4; one WebKitWebDriver each, ports 4444 up), WK_PAGES (captures per
// screen, default 3), WK_ONLY (regular expression on <group>/<variant>/<width>/<name>). Output as shoot.mjs's:
// <WK_OUT>/<group>/<variant>/<width>/<name>-<n>.png and run.json (final URL, page errors, what did not settle).
// What differs from shoot.mjs: the phone width is a 390×844 frame on fc-frame.html (MiniBrowser's window cannot be
// that narrow); the portal's dark pass starts MiniBrowser with --dark-mode; requests to other hosts go to a proxy
// that is not there (--proxy=http://127.0.0.1:9), so they fail at once; no reduced-motion setting (the injected
// script stops animations instead).
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const env = process.env
const base = new URL(env.WK_BASE || 'http://127.0.0.1:5180')
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error(`WK_BASE must be local, not ${base.hostname}`)
for (const name of ['WK_OUT', 'WK_LIST', 'FC_STAFF_EMAIL', 'FC_STAFF_PASSWORD', 'FC_MEMBER_EMAIL', 'FC_MEMBER_PASSWORD', 'DISPLAY']) {
  if (!env[name]) throw new Error(`${name} is not set (README.md, "WebKit")`)
}
const out = path.resolve(env.WK_OUT)
const workers = Number(env.WK_WORKERS || 4)
const maxPages = Number(env.WK_PAGES || 3)
const only = env.WK_ONLY ? new RegExp(env.WK_ONLY) : null
const list = JSON.parse(await fs.readFile(env.WK_LIST, 'utf8')).screens.filter(s => !s.error && (!only || only.test(s.key)))
const MINI = '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser'

async function call(method, url, token, body) {
  const r = await fetch(new URL(url, base), { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${text.slice(0, 120)}`)
  return JSON.parse(text)
}
async function signIn(email, password) {
  const d = await call('POST', '/api/v1/auth/login', null, { email, password })
  return { token: d.token, user: d.user, staff: d.staff ?? null }
}

import { execFileSync } from 'node:child_process'
// The phone width's capture is the window's, cut to the frame (an element screenshot of a frame leaves composited
// layers black in WebKitGTK). Python 3 with Pillow does the cut: the frontend has no PNG library.
async function crop(file, box) {
  execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]); im.crop(tuple(int(v) for v in sys.argv[2:6])).save(sys.argv[1])', file, String(box.x), String(box.y), String(box.x + box.width), String(box.y + box.height)])
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

class Driver {
  constructor(port) { this.port = port }
  async start() {
    this.proc = spawn('WebKitWebDriver', [`--port=${this.port}`], { stdio: ['ignore', 'ignore', 'pipe'] })
    this.proc.stderr.on('data', () => {})
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${this.port}/status`); return } catch { await sleep(100) } }
    throw new Error('driver did not start')
  }
  async req(method, p, body) {
    const r = await fetch(`http://127.0.0.1:${this.port}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const j = await r.json()
    if (!r.ok || (j.value && j.value.error)) throw new Error(`${method} ${p}: ${j.value?.error} ${String(j.value?.message).slice(0, 200)}`)
    return j.value
  }
  async open(dark) {
    const args = ['--automation', '--time-zone=Europe/London', '--proxy=http://127.0.0.1:9', '--ignore-host=127.0.0.1', '--ignore-host=localhost', ...(dark ? ['--dark-mode'] : [])]
    const v = await this.req('POST', '/session', { capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': { binary: MINI, args } } } })
    this.sid = v.sessionId
    await this.s('POST', '/timeouts', { script: 60000, pageLoad: 30000, implicit: 0 })
  }
  s(method, p, body) { return this.req(method, `/session/${this.sid}${p}`, body) }
  async close() { if (this.sid) await this.req('DELETE', `/session/${this.sid}`).catch(() => {}); this.sid = null }
  stop() { this.proc?.kill() }
  go(url) { return this.s('POST', '/url', { url }) }
  run(script, args = []) { return this.s('POST', '/execute/sync', { script, args }) }
  runAsync(script, args = []) { return this.s('POST', '/execute/async', { script, args }) }
  shot() { return this.s('GET', '/screenshot') }
  async viewport(width, height) {
    let w = width, h = height
    for (let i = 0; i < 4; i++) {
      await this.s('POST', '/window/rect', { width: w, height: h })
      await sleep(200)
      const [iw, ih] = await this.run('return [window.innerWidth, window.innerHeight]')
      if (iw === width && ih === height) return
      w += width - iw; h += height - ih
    }
    const [iw, ih] = await this.run('return [window.innerWidth, window.innerHeight]')
    throw new Error(`viewport ${iw}x${ih}, wanted ${width}x${height}`)
  }
}

const SETTLE = `const done = arguments[arguments.length - 1];
(async () => {
  const t0 = performance.now(); let quietSince = performance.now(), seen = -1, quiet = false;
  while (performance.now() - t0 < 20000) {
    const n = performance.getEntriesByType('resource').length;
    const imgs = [...document.images].some(i => !i.complete);
    if ((window.__fcPending || 0) > 0 || document.readyState !== 'complete' || n !== seen || imgs) { quietSince = performance.now(); seen = n }
    else if (performance.now() - quietSince >= 700) { quiet = true; break }
    await new Promise(r => setTimeout(r, 100));
  }
  await document.fonts.ready;
  const busy = () => [...document.querySelectorAll('.animate-spin, [aria-busy="true"]')].some(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 });
  for (let i = 0; i < 50 && busy(); i++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  done([quiet, busy()]);
})();`

const PLAN = `const candidates = [document.scrollingElement, ...document.querySelectorAll('*')].filter(el => {
  if (!el) return false
  if (el !== document.scrollingElement) {
    const style = getComputedStyle(el)
    if (!/(auto|scroll)/.test(style.overflowY)) return false
    if (el.clientHeight < 200 || el.clientWidth < 200) return false
  }
  return el.scrollHeight - el.clientHeight > 4
})
let best = null, room = 0
for (const el of candidates) { const r = el.scrollHeight - el.clientHeight; if (r > room) { room = r; best = el } }
window.scrollTo(0, 0)
if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
if (!best) return 0
best.setAttribute('data-fc-scroller', '')
best.scrollTop = 0
return Math.ceil(room / Math.max(1, best.clientHeight * 0.9))`

async function stableShot(d, file, framed) {
  let last = null
  if (framed) await d.s('POST', '/frame', { id: null })
  for (let i = 0; i < 5; i++) {
    const s = await d.shot()
    if (last && s === last) break
    last = s
    await sleep(150)
  }
  if (framed) await d.s('POST', '/frame', { id: d.frameEl })
  await fs.writeFile(file, Buffer.from(last, 'base64'))
  if (framed) await crop(file, d.frameBox)
}

function storageItems(session, extra) {
  if (!session) return { admin_lang: 'en' }
  return { auth_token: session.token, 'loyalty-auth': JSON.stringify({ state: { token: session.token, user: session.user, staff: session.staff }, version: 1 }), admin_lang: 'en', ...extra }
}

async function main() {
  await fs.mkdir(out, { recursive: true })
  const staff = await signIn(env.FC_STAFF_EMAIL, env.FC_STAFF_PASSWORD)
  const member = await signIn(env.FC_MEMBER_EMAIL, env.FC_MEMBER_PASSWORD)
  // Passes as in shoot.mjs: (group, variant, width).
  const passes = new Map()
  for (const s of list) {
    const [group, variant, width] = s.key.split('/')
    const id = `${group}/${variant}/${width}`
    if (!passes.has(id)) passes.set(id, { group, variant, width: Number(width), height: Number(width) === 1440 ? 900 : 844, screens: [] })
    passes.get(id).screens.push(s)
  }
  const styleOrder = ['glass', 'classic', 'light']
  const ordered = [...passes.values()].sort((a, b) => (a.group === 'admin' ? styleOrder.indexOf(a.variant) : -1) - (b.group === 'admin' ? styleOrder.indexOf(b.variant) : -1))
  const drivers = Array.from({ length: workers }, (_, i) => new Driver(4444 + i))
  await Promise.all(drivers.map(d => d.start()))
  const report = { base: base.origin, browser: 'webkitgtk', screens: [] }
  let currentStyle = null
  try {
    for (const pass of ordered) {
      if (pass.group === 'admin' && pass.variant !== currentStyle) {
        await call('PUT', '/api/v1/admin/settings', staff.token, { settings: [{ key: 'theme_style', value: pass.variant }] })
        currentStyle = pass.variant
      }
      const session = pass.group === 'admin' || pass.group === 'work' ? staff : pass.group === 'portal' ? member : null
      const extra = pass.group === 'work' ? Object.fromEntries(['appointments:look', 'content:look', 'loyalty:look'].map(k => [k, JSON.stringify({ theme: pass.variant, rail: 'full' })])) : {}
      const items = storageItems(session, extra)
      const dark = pass.group === 'portal' && pass.variant === 'dark'
      const queue = [...pass.screens]
      await Promise.all(drivers.map(async d => {
        if (!queue.length) return
        await d.open(dark)
        // A window cannot be narrower than MiniBrowser's toolbar, so the phone width is a frame of that size on an
        // empty page of the origin; the desktop width is the window itself.
        const framed = pass.width < 800
        try {
          if (framed) {
            await d.go(new URL('/spa/fc-frame.html', base).href)
            await d.viewport(1000, 1000)
            await d.run('const f = document.getElementById("f"); f.width = arguments[0]; f.height = arguments[1]', [pass.width, pass.height])
            d.frameEl = await d.s('POST', '/element', { using: 'css selector', value: '#f' })
            d.frameBox = await d.run('const r = document.getElementById("f").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }')
          } else {
            await d.go(new URL('/spa/fc-blank.html', base).href)
            await d.viewport(pass.width, pass.height)
          }
          for (let s; (s = queue.shift());) {
            const entry = { key: s.key, path: s.path }
            const file = path.join(out, `${s.key}.png`)
            await fs.mkdir(path.dirname(file), { recursive: true })
            try {
              const target = new URL(s.path, base).href
              if (framed) {
                await d.s('POST', '/frame', { id: null })
                await d.runAsync(`const done = arguments[arguments.length - 1]; const f = document.getElementById('f');
                  f.onload = () => { f.onload = null; done(1) }; f.src = '/spa/fc-blank.html'`)
                await d.run('localStorage.clear(); sessionStorage.clear(); for (const [k, v] of Object.entries(arguments[0])) localStorage.setItem(k, v)', [items])
                await d.runAsync(`const done = arguments[arguments.length - 1]; const f = document.getElementById('f');
                  f.onload = () => { f.onload = null; done(1) }; f.src = arguments[0]`, [target])
                await d.s('POST', '/frame', { id: d.frameEl })
              } else {
                await d.go(new URL('/spa/fc-blank.html', base).href)
                await d.run('localStorage.clear(); sessionStorage.clear(); for (const [k, v] of Object.entries(arguments[0])) localStorage.setItem(k, v)', [items])
                await d.go(target)
              }
              const [quiet, busy] = await d.runAsync(SETTLE)
              if (!quiet || busy) entry.unsettled = [quiet ? null : 'network busy', busy ? 'spinner' : null].filter(Boolean)
              entry.final = (await d.run('return location.pathname + location.search')).replace(base.origin, '')
              const steps = await d.run(PLAN)
              const shots = Math.min(maxPages, 1 + steps)
              for (let n = 0; n < shots; n++) {
                if (n > 0) {
                  await d.run(`const el = document.querySelector('[data-fc-scroller]') || document.scrollingElement; el.scrollTop = Math.round(el.clientHeight * 0.9 * arguments[0])`, [n])
                  await d.runAsync(SETTLE)
                }
                await stableShot(d, file.replace(/\.png$/, `-${n + 1}.png`), framed)
              }
              entry.shots = shots
              entry.pageErrors = await d.run('return window.__fcErrors || []')
            } catch (e) { entry.error = String(e.message).split('\n')[0] }
            report.screens.push(entry)
            console.log(`${entry.error ? 'ERROR' : 'ok   '} ${s.key}${entry.final && entry.final !== s.path ? `  -> ${entry.final}` : ''}${entry.error ? '  ' + entry.error : ''}${entry.pageErrors?.length ? '  pageErrors: ' + entry.pageErrors.join(' | ').slice(0, 200) : ''}`)
          }
        } finally { await d.close() }
      }))
    }
  } finally {
    drivers.forEach(d => d.stop())
    if (currentStyle && currentStyle !== 'glass') await call('PUT', '/api/v1/admin/settings', staff.token, { settings: [{ key: 'theme_style', value: 'glass' }] }).catch(() => {})
    report.screens.sort((a, b) => a.key.localeCompare(b.key))
    await fs.writeFile(path.join(out, 'run.json'), JSON.stringify(report, null, 2) + '\n')
  }
  const errors = report.screens.filter(s => s.error)
  console.log(`${report.screens.length} screens, ${report.screens.reduce((n, s) => n + (s.shots || 0), 0)} captures, ${errors.length} errors`)
}

await main()
