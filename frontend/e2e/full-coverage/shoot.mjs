import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ADMIN, WORKSPACES, PORTAL, PUBLIC, SKIPPED } from './routes.mjs'

// Screenshots of every screen of one SPA build served by serve.mjs against a seeded local Laravel (README.md).
//
//   FC_BASE=http://127.0.0.1:5180 FC_OUT=<dir> FC_STAFF_EMAIL=… FC_STAFF_PASSWORD=… FC_MEMBER_EMAIL=… \
//     FC_MEMBER_PASSWORD=… node e2e/full-coverage/shoot.mjs
//
// Signs in through the real POST /api/v1/auth/login (once per role), stores the session the way the SPA does, and
// visits every route of routes.mjs:
//   admin    in each admin style (FC_STYLES, default glass,classic,light), chosen the way Settings → Branding does:
//            PUT /api/v1/admin/settings theme_style; the run sets the style back to Glass at the end
//   work     each workspace in its light and dark theme (the device's choice, kept in localStorage)
//   portal   as a member, with the device in light and in dark mode
//   public   signed out
// at each width (FC_WIDTHS, default 1440x900,390x844). A screen is captured from the top and, when its main
// scroller holds more, again after each scroll by most of a viewport (FC_PAGES, default 3 captures at most), so a
// capture never changes the layout (no full-page resize). Files: <FC_OUT>/<group>/<variant>/<width>/<name>-<n>.png,
// plus run.json (every screen, its final URL, console errors, failed requests, skipped routes).
//
// Determinism: a fixed clock (FC_CLOCK, default today 12:00 UTC: Date only, timers run; give the API the same instant,
// api.sh with FC_SERVER_NOW), animations disabled, the en locale and Europe/London, network quiet for 700 ms, fonts
// loaded, no spinner left, a screenshot kept only when the next one repeats it. Copy the template database before
// each run (reset-db.sh reset): sign-ins and visits write rows.
//
// Other: FC_ONLY (regular expression on <group>/<variant>/<width>/<name>), FC_GROUPS (admin,work,portal,public),
// FC_PARALLEL (pages at once, default 6), FC_BROWSER (chromium, firefox or webkit), FC_PLAYWRIGHT (the playwright
// module to load, e.g. a global install's path), E2E_EXECUTABLE (a Chromium binary).

const env = process.env
const base = new URL(env.FC_BASE || 'http://127.0.0.1:5180')
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error(`FC_BASE must be local, not ${base.hostname}`)
const out = path.resolve(env.FC_OUT || 'test-results/full-coverage')
const styles = (env.FC_STYLES || 'glass,classic,light').split(',').filter(Boolean)
const widths = (env.FC_WIDTHS || '1440x900,390x844').split(',').map(w => { const [width, height] = w.split('x').map(Number); return { width, height } })
const groups = new Set((env.FC_GROUPS || 'admin,work,portal,public').split(','))
const only = env.FC_ONLY ? new RegExp(env.FC_ONLY) : null
const parallel = Number(env.FC_PARALLEL || 6)
const maxPages = Number(env.FC_PAGES || 3)
const clock = new Date(env.FC_CLOCK || `${new Date().toISOString().slice(0, 10)}T12:00:00Z`)
const browserName = env.FC_BROWSER || 'chromium'

const pwPath = env.FC_PLAYWRIGHT
const pw = await import(pwPath ? pathToFileURL(path.resolve(pwPath, 'index.mjs')).href : 'playwright')
const browserType = pw[browserName] ?? pw.default?.[browserName]

for (const name of ['FC_STAFF_EMAIL', 'FC_STAFF_PASSWORD', 'FC_MEMBER_EMAIL', 'FC_MEMBER_PASSWORD']) {
  if (!env[name]) throw new Error(`${name} is not set (README.md: the demo seeders' users)`)
}

async function call(method, url, token, body) {
  const response = await fetch(new URL(url, base), {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { /* not JSON */ }
  if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${data?.message ?? text.slice(0, 120)}`)
  return data
}

async function signIn(email, password) {
  const data = await call('POST', '/api/v1/auth/login', null, { email, password })
  return { token: data.token, user: data.user, staff: data.staff ?? null }
}

// The first id a list endpoint answers, wherever the list sits in the answer.
function firstId(data) {
  const seen = new Set()
  const walk = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return null
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item === 'object' && (typeof item.id === 'number' || typeof item.id === 'string')) return item.id
      for (const item of value) { const found = walk(item); if (found != null) return found }
      return null
    }
    for (const key of ['data', 'items', 'rows', 'results', 'members', 'clients', 'posts', 'events', 'campaigns', 'forms', 'submissions', 'bookings', 'guests', 'inquiries']) {
      const found = walk(value[key]); if (found != null) return found
    }
    for (const v of Object.values(value)) { const found = walk(v); if (found != null) return found }
    return null
  }
  return walk(data)
}

const LOOKUPS = {
  member: ['/api/v1/admin/members?per_page=5'],
  guest: ['/api/v1/admin/guests?per_page=5'],
  inquiry: ['/api/v1/admin/inquiries?per_page=5'],
  booking: ['/api/v1/admin/bookings?per_page=5'],
  pushCampaign: ['/api/v1/admin/campaigns?per_page=5'],
  reviewForm: ['/api/v1/admin/reviews/forms'],
  reviewSubmission: ['/api/v1/admin/reviews/submissions'],
  appointmentsClient: ['/api/v1/admin/appointments/clients?search=al'],
  contentPost: ['/api/v1/admin/content/posts'],
  loyaltyEvent: ['/api/v1/admin/loyalty/events?brand_id=all', '/api/v1/admin/loyalty/events?brand_id=all&view=drafts'],
  loyaltyCampaign: ['/api/v1/admin/loyalty/campaigns?brand_id=all'],
}

async function resolveIds(token) {
  const ids = {}, misses = {}
  for (const [key, urls] of Object.entries(LOOKUPS)) {
    for (const url of urls) {
      try { const id = firstId(await call('GET', url, token)); if (id != null) { ids[key] = id; break } misses[key] = `${url}: empty` }
      catch (e) { misses[key] = e.message }
    }
  }
  return { ids, misses }
}

function sessionScript({ token, user, staff }, extra) {
  // What setAuth() writes (stores/authStore.ts), plus the device's choices for this pass.
  const items = { auth_token: token, 'loyalty-auth': JSON.stringify({ state: { token, user, staff }, version: 1 }), admin_lang: 'en', ...extra }
  return `(() => { try { const items = ${JSON.stringify(items)}; for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v) } catch {} })()`
}

const anonymousScript = `(() => { try { localStorage.setItem('admin_lang', 'en') } catch {} })()`

async function settle(page, pending) {
  // Network quiet (fetch/XHR/scripts/styles/fonts/images) for 700 ms, at most 20 s; then fonts, then no spinner
  // (at most 5 s). Answers what did not settle, so a slow or busy screen shows in run.json.
  const started = Date.now()
  let quietSince = Date.now(), quiet = false
  while (Date.now() - started < 20_000) {
    if (pending.size) quietSince = Date.now()
    else if (Date.now() - quietSince >= 700) { quiet = true; break }
    await page.waitForTimeout(100)
  }
  const spinning = await page.evaluate(async () => {
    await document.fonts.ready
    const busy = () => [...document.querySelectorAll('.animate-spin, [aria-busy="true"]')].some(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0
    })
    for (let i = 0; i < 50 && busy(); i++) await new Promise(r => setTimeout(r, 100))
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    return busy()
  }).catch(() => false)
  return [...(quiet ? [] : [`network busy: ${[...pending].slice(0, 3).map(r => r.url().replace(/^https?:\/\/[^/]+/, '')).join(', ')}`]), ...(spinning ? ['spinner still showing'] : [])]
}

function track(page) {
  const pending = new Set(), errors = [], failed = []
  const counts = r => !['websocket', 'eventsource', 'manifest', 'other'].includes(r.resourceType()) && !/\/stream|\/sse\b|realtime/.test(r.url())
  page.on('request', r => { if (counts(r)) pending.add(r) })
  page.on('requestfinished', r => pending.delete(r))
  page.on('requestfailed', r => { pending.delete(r); if (!/favicon|\/storage\//.test(r.url())) failed.push(`${r.method()} ${r.url().replace(base.origin, '')} ${r.failure()?.errorText ?? ''}`) })
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base.origin)) failed.push(`${r.request().method()} ${r.url().replace(base.origin, '')} ${r.status()}`) })
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', e => errors.push(`pageerror: ${String(e.message).slice(0, 300)}`))
  return { pending, errors, failed }
}

// A screenshot that the next one taken 150 ms later repeats exactly (at most 5 tries): a frame still being
// painted (a raster tile left from the previous screen under load, a late layout) is not kept.
async function stableShot(page, file) {
  let last = null
  for (let i = 0; i < 5; i++) {
    const shot = await page.screenshot({ animations: 'disabled', caret: 'hide' })
    if (last && shot.equals(last)) break
    last = shot
    await page.waitForTimeout(150)
  }
  await fs.writeFile(file, last)
}

async function capture(page, pending, file) {
  // The main scroller: the page, or the element that scrolls furthest (the admin scrolls inside <main>). It and
  // the page start at the top, wherever the screen's own focus or scrolling left them.
  const plan = await page.evaluate(() => {
    const candidates = [document.scrollingElement, ...document.querySelectorAll('*')].filter(el => {
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
    if (!best) return { steps: 0 }
    best.setAttribute('data-fc-scroller', '')
    best.scrollTop = 0
    return { steps: Math.ceil(room / Math.max(1, best.clientHeight * 0.9)) }
  })
  const shots = Math.min(maxPages, 1 + plan.steps)
  for (let n = 0; n < shots; n++) {
    if (n > 0) {
      await page.evaluate(n => {
        const el = document.querySelector('[data-fc-scroller]') || document.scrollingElement
        el.scrollTop = Math.round(el.clientHeight * 0.9 * n)
      }, n)
    }
    await settle(page, pending)
    await stableShot(page, file.replace(/\.png$/, `-${n + 1}.png`))
  }
  return shots
}

async function main() {
  await fs.mkdir(out, { recursive: true })
  const staff = await signIn(env.FC_STAFF_EMAIL, env.FC_STAFF_PASSWORD)
  const member = await signIn(env.FC_MEMBER_EMAIL, env.FC_MEMBER_PASSWORD)
  const { ids, misses } = await resolveIds(staff.token)
  const skipped = SKIPPED.map(([route, why]) => ({ route, why }))
  const fill = route => {
    const missing = [...route.path.matchAll(/:([A-Za-z]+)/g)].map(m => m[1]).filter(k => ids[k] == null)
    if (missing.length) {
      if (!skipped.some(s => s.route === route.path)) skipped.push({ route: route.path, why: `no ${missing.join(', ')} found (${missing.map(k => misses[k]).join('; ')})` })
      return null
    }
    return { ...route, url: route.path.replace(/:([A-Za-z]+)/g, (_, k) => String(ids[k])) }
  }

  // Passes: one browser context per (group, variant, width); each pass's routes run FC_PARALLEL at a time.
  const passes = []
  for (const size of widths) {
    if (groups.has('admin')) for (const style of styles) passes.push({ group: 'admin', variant: style, size, style, session: staff, routes: ADMIN })
    if (groups.has('work')) for (const theme of ['light', 'dark']) passes.push({ group: 'work', variant: theme, size, session: staff, routes: WORKSPACES,
      extra: Object.fromEntries(['appointments:look', 'content:look', 'loyalty:look'].map(k => [k, JSON.stringify({ theme, rail: 'full' })])) })
    if (groups.has('portal')) for (const scheme of ['light', 'dark']) passes.push({ group: 'portal', variant: scheme, size, session: member, routes: PORTAL, colorScheme: scheme })
    if (groups.has('public')) passes.push({ group: 'public', variant: 'signed-out', size, routes: PUBLIC })
  }
  // The style is the organisation's setting, so passes of one style run together.
  passes.sort((a, b) => (a.style ? styles.indexOf(a.style) : -1) - (b.style ? styles.indexOf(b.style) : -1))

  const browser = await browserType.launch({ headless: true, ...(env.E2E_EXECUTABLE && browserName === 'chromium' ? { executablePath: env.E2E_EXECUTABLE } : {}) })
  const report = { base: base.origin, browser: browserName, clock: clock.toISOString(), ids, skipped, screens: [] }
  let currentStyle = null
  try {
    for (const pass of passes) {
      const todo = pass.routes.map(fill).filter(Boolean).map(r => ({ ...r, key: `${pass.group}/${pass.variant}/${pass.size.width}/${r.name}` }))
        .filter(r => !only || only.test(r.key))
      if (!todo.length) continue
      if (pass.style && pass.style !== currentStyle) {
        await call('PUT', '/api/v1/admin/settings', staff.token, { settings: [{ key: 'theme_style', value: pass.style }] })
        currentStyle = pass.style
      }
      const context = await browser.newContext({
        viewport: pass.size, deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'Europe/London',
        colorScheme: pass.colorScheme || 'light', reducedMotion: 'reduce', serviceWorkers: 'block',
      })
      await context.addInitScript(pass.session ? sessionScript(pass.session, pass.extra) : anonymousScript)
      await context.clock.setFixedTime(clock)
      // Nothing leaves the machine. A page another host would fill (the landing preview's frame) gets an empty
      // document at once, so the frame looks the same in every run instead of mid-way through an error page.
      await context.route(url => !['127.0.0.1', 'localhost'].includes(new URL(url).hostname),
        r => r.request().resourceType() === 'document' ? r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>outside</title>' }) : r.abort())
      const queue = [...todo]
      await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
        const page = await context.newPage()
        const t = track(page)
        for (let route; (route = queue.shift());) {
          const file = path.join(out, `${route.key}.png`)
          await fs.mkdir(path.dirname(file), { recursive: true })
          t.errors.length = 0; t.failed.length = 0
          const entry = { key: route.key, path: route.url }
          try {
            await page.goto(new URL(route.url, base).href, { waitUntil: 'load', timeout: 30_000 })
            const started = Date.now()
            const unsettled = await settle(page, t.pending)
            if (unsettled.length) entry.unsettled = unsettled
            entry.final = page.url().replace(base.origin, '')
            entry.shots = await capture(page, t.pending, file)
            entry.ms = Date.now() - started
          } catch (e) {
            entry.error = String(e.message).split('\n')[0]
          }
          entry.consoleErrors = [...new Set(t.errors)]
          entry.failedRequests = [...new Set(t.failed)]
          report.screens.push(entry)
          // A 429 means the run outpaced the API's rate limit (README: CACHE_DRIVER=array): the screen is not comparable.
          if (entry.failedRequests.some(f => / 429$/.test(f))) entry.error ??= 'rate limited (429)'
          console.log(`${entry.error ? 'ERROR' : 'ok   '} ${route.key}${entry.final && entry.final !== route.url ? `  -> ${entry.final}` : ''}${entry.error ? `  ${entry.error}` : ''}`)
        }
        await page.close()
      }))
      await context.close()
    }
  } finally {
    await browser.close()
    if (currentStyle && currentStyle !== 'glass') await call('PUT', '/api/v1/admin/settings', staff.token, { settings: [{ key: 'theme_style', value: 'glass' }] }).catch(() => {})
    report.screens.sort((a, b) => a.key.localeCompare(b.key))
    await fs.writeFile(path.join(out, 'run.json'), JSON.stringify(report, null, 2) + '\n')
  }
  const errors = report.screens.filter(s => s.error)
  console.log(`${report.screens.length} screens, ${report.screens.reduce((n, s) => n + (s.shots || 0), 0)} captures, ${errors.length} errors, ${skipped.length} routes skipped. ${path.join(out, 'run.json')}`)
  process.exitCode = errors.length ? 1 : 0
}

await main()
