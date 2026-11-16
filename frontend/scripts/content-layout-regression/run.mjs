import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import tailwind from '@tailwindcss/vite'

const root = path.dirname(fileURLToPath(import.meta.url)).replaceAll('\\', '/')
const frontend = path.resolve(root, '../..').replaceAll('\\', '/')
const output = process.env.CONTENT_LAYOUT_EVIDENCE ?? root + '/artifacts'
await fs.mkdir(output, { recursive: true })
const server = await createServer({
  configFile: false, root, esbuild: { jsx: 'automatic' },
  plugins: [tailwind(), { name: 'layout-api-only', enforce: 'pre', resolveId(source, importer) {
    if (importer && /\/content\/lib\/api\.ts$/.test(importer.replaceAll('\\', '/')) && source === '../../lib/api') return root + '/api.ts'
  } }],
  server: { host: '127.0.0.1', port: 5197, strictPort: true, fs: { allow: [frontend] } }, cacheDir: root + '/.vite',
})
await server.listen()
const browser = await chromium.launch({ headless: true })
const evidence = { createdAt: new Date().toISOString(), scope: 'Actual ContentProvider, ContentShell, PlanPage and complete app styles/fonts; only wire API replaced; no production network or data', checks: [], runs: [], errors: [] }
const check = (name, passed, detail = {}) => { evidence.checks.push({ name, passed, ...detail }) }
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const geometry = page => page.evaluate(() => {
  const rect = el => { const r = el?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } : null }
  const filter = document.querySelector('[data-filter-row]')
  const calendar = document.querySelector('[data-slot]')?.closest('.overflow-auto') ?? document.querySelector('.min-h-96')
  return {
    filter: rect(filter), toolbar: rect(filter?.nextElementSibling), goals: rect(document.querySelector('.c-plan-goals')),
    header: rect(document.querySelector('[data-numbers]')?.parentElement?.parentElement), pulse: rect(document.querySelector('.c-plan-pulse')),
    controls: [...(filter?.querySelectorAll('[aria-haspopup="menu"], [data-drop="tray"], [role="switch"]') ?? [])].map(el => ({ text: el.textContent, ...rect(el) })),
    calendar: rect(calendar), rail: rect(document.querySelector('[data-rail]')), footer: rect(document.querySelector('[data-frame-footer]')),
    documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight,
    slots: document.querySelectorAll('[data-slot]').length, fonts: document.fonts.status, shifts: window.__shifts ?? [],
  }
})
try {
  const cases = process.env.CONTENT_LAYOUT_QUICK ? [[process.env.CONTENT_LAYOUT_LOCALE ?? 'en', 'dark', Number(process.env.CONTENT_LAYOUT_WIDTH ?? 1024), 'dense']] :
    ['en', 'ru', 'de', 'fr', 'es'].flatMap(locale => ['dark', 'light'].flatMap(theme => [390, 1024, 1440].map(width => [locale, theme, width, 'dense'])))
  for (const [locale, theme, width, density] of cases) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, hasTouch: width === 390 })
    await page.clock.setFixedTime(new Date('2026-11-16T09:00:00Z'))
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
    await page.addInitScript(({ theme }) => { localStorage.setItem('content:look', JSON.stringify({ theme, rail: 'full' })) }, { theme })
    await page.goto(`http://127.0.0.1:5197/?locale=${locale}&density=${density}`)
    await page.waitForFunction(() => window.__layout?.pending().includes('bootstrap'))
    await page.evaluate(() => document.fonts.ready)
    const bootstrapLoading = await geometry(page)
    await page.evaluate(() => window.__layout.release('bootstrap'))
    await page.waitForFunction(() => window.__layout.pending().includes('plan') && document.querySelector('[data-filter-row]'))
    await page.evaluate(() => document.fonts.ready)
    await settle(page)
    await page.waitForTimeout(600)
    await page.evaluate(() => {
      window.__shifts = []
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push({ value: entry.value, at: entry.startTime, sources: entry.sources.map(s => ({ node: s.node?.outerHTML?.slice(0, 200), before: s.previousRect.toJSON(), after: s.currentRect.toJSON() })) }) }).observe({ type: 'layout-shift' })
    })
    const before = await geometry(page)
    await page.evaluate(() => window.__layout.release('brand', 'goals', 'pulse', 'plan'))
    await page.locator('[data-slot]').first().waitFor()
    await settle(page)
    await page.waitForTimeout(150)
    const after = await geometry(page)
    const cls = after.shifts.reduce((total, shift) => total + shift.value, 0)
    const id = `${locale}-${theme}-${width}-${density}`
    check(`${id}: same-data loaded filter keeps its reserved geometry`, Math.abs(after.filter.height - before.filter.height) <= 1 && Math.abs(after.calendar.y - before.calendar.y) <= 1 && before.controls.every((r, i) => Math.abs(r.x - after.controls[i].x) <= 1 && Math.abs(r.y - after.controls[i].y) <= 1), { before: before.filter, after: after.filter, calendarBefore: before.calendar.y, calendarAfter: after.calendar.y, controlsBefore: before.controls, controlsAfter: after.controls })
    check(`${id}: all14 dense slots are reachable without document overflow`, after.slots === 14 && after.documentWidth <= width + 1, { slots: after.slots, documentWidth: after.documentWidth })
    check(`${id}: delayed-data CLS stays below0.05`, cls < 0.05, { cls })
    if (width >= 1024) check(`${id}: sidebar footer stays inside900px viewport`, after.rail.height <= 901 && after.footer.y >= 0 && after.footer.bottom <= 901 && Math.abs(after.footer.y - before.footer.y) <= 1, { before: before.footer, after: after.footer, rail: after.rail })
    if (width >= 1024) {
      const settings = page.locator('[data-frame-footer] > div').first().locator('button').first()
      await settings.click()
      const panelId = await settings.getAttribute('aria-controls')
      const panel = page.locator(`[id="${panelId}"]`)
      const hit = await panel.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.right - 4, r.top + 20)) })
      check(`${id}: footer Settings menu is not clipped by the rail`, hit)
      await page.keyboard.press('Escape')
    }
    const platforms = page.locator('[data-filter-row] [role="group"]').first()
    const buttons = platforms.locator('button')
    const reached = []
    await buttons.first().focus()
    for (let i = 0; i < await buttons.count(); i++) {
      await page.waitForFunction(index => { const el = document.querySelectorAll('[data-filter-row] [role="group"] button')[index], r = el.getBoundingClientRect(), parent = el.parentElement.getBoundingClientRect(); return document.activeElement === el && r.x >= parent.x - 1 && r.right <= parent.right + 1 }, i, { timeout: 1000 }).catch(() => undefined)
      reached.push(await buttons.nth(i).evaluate(el => { const r = el.getBoundingClientRect(), parent = el.parentElement.getBoundingClientRect(); return { focused: document.activeElement === el, x: r.x, right: r.right, parentX: parent.x, parentRight: parent.right, visible: r.x >= parent.x - 1 && r.right <= parent.right + 1 } }))
      if (i + 1 < await buttons.count()) await page.keyboard.press('Tab')
    }
    check(`${id}: all five platform chips are reachable by keyboard through the scroll strip`, reached.length === 5 && reached.every(r => r.focused && r.visible), { reached })
    const scrolls = await platforms.evaluate(el => el.scrollWidth > el.clientWidth)
    if (scrolls) {
      await platforms.evaluate(el => { el.scrollLeft = 0 })
      if (width === 390) {
        const box = await platforms.boundingBox()
        const touch = await page.context().newCDPSession(page)
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width - 12, y: box.y + 18 }] })
        for (let step = 1; step <= 4; step++) {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width - 12 - step * 45, y: box.y + 18 }] })
          await settle(page)
        }
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await touch.detach()
      } else {
        await platforms.hover()
        await page.mouse.wheel(300, 0)
      }
      await page.waitForFunction(() => document.querySelector('[data-filter-row] [role="group"]').scrollLeft > 0, undefined, { timeout: 1000 }).catch(() => undefined)
      const scrollLeft = await platforms.evaluate(el => el.scrollLeft)
      check(`${id}: platform strip responds to ${width === 390 ? 'touch swipe' : 'horizontal wheel'}`, scrollLeft > 0, { scrollLeft })
    }
    check(`${id}: document language matches selected locale`, await page.locator('html').getAttribute('lang') === locale)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await settle(page)
    const scrolled = await geometry(page)
    if (width >= 1024) check(`${id}: footer stays reachable while the dense page scrolls`, scrolled.footer.y >= 0 && scrolled.footer.bottom <= 901, { footer: scrolled.footer })
    await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); document.querySelector('[data-filter-row] [role="group"]').scrollLeft = 0 })
    check(`${id}: no runtime errors`, errors.length === 0, { errors })
    await page.screenshot({ path: `${output}/${id}.png`, fullPage: true })
    evidence.runs.push({ id, bootstrapLoading, before, after, cls })
    if (locale === 'en' && width === 1024) {
      await page.setViewportSize({ width, height: 600 })
      const lastNav = page.locator('[data-rail] > nav a').last()
      await lastNav.focus()
      await lastNav.scrollIntoViewIfNeeded()
      const short = await geometry(page)
      const navHit = await lastNav.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) })
      check(`${id}: short viewport scrolls navigation and retains the footer`, navHit && short.footer.y >= 0 && short.footer.bottom <= 601, { footer: short.footer })
      await page.locator('[data-frame-footer] > div').first().locator('button').first().click()
      const shortMenu = page.locator('[data-frame-footer] [role="group"]').first()
      check(`${id}: short rail retains the full Settings menu`, await shortMenu.evaluate(el => { const r = el.getBoundingClientRect(); return r.y >= 0 && el.contains(document.elementFromPoint(r.right - 4, r.top + 20)) }))
      await page.keyboard.press('Escape')
      await page.screenshot({ path: `${output}/${id}-short.png`, fullPage: false })
      await page.setViewportSize({ width, height: 900 })
      await page.locator('[data-frame-footer] > div').last().locator('button').first().click()
      await page.locator('[data-frame-footer] [role="menu"] [role="menuitem"]').first().click()
      await page.waitForFunction(() => document.querySelector('[data-rail]')?.getAttribute('data-rail-size') === 'slim')
      await page.waitForTimeout(350)
      await page.locator('[data-frame-footer] > div').first().locator('button').first().click()
      const slimMenu = page.locator('[data-frame-footer] [role="group"]').first()
      const slim = await geometry(page)
      check(`${id}: slim rail preserves its beside Settings menu`, slim.rail.width === 76 && await slimMenu.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.right - 4, r.top + 20)) }), { rail: slim.rail })
      await page.keyboard.press('Escape')
      await page.screenshot({ path: `${output}/${id}-slim.png`, fullPage: false })
      await page.setViewportSize({ width, height: 600 })
      await page.locator('[data-rail] > nav a').last().focus()
      await page.locator('[data-rail] > nav a').last().scrollIntoViewIfNeeded()
      const shortSlim = await geometry(page)
      check(`${id}: short slim rail retains a reachable footer`, shortSlim.footer.y >= 0 && shortSlim.footer.bottom <= 601, { footer: shortSlim.footer })
      const slimLabels = await page.locator('[data-rail] > nav a').evaluateAll(links => links.map(el => ({ label: el.textContent.trim(), title: el.getAttribute('title') })))
      check(`${id}: scrolling slim navigation keeps native hover labels`, slimLabels.every(item => item.title === item.label && item.title.length > 0), { labels: slimLabels })
      await page.locator('[data-rail] > nav a').last().hover()
      await page.screenshot({ path: `${output}/${id}-slim-short-tooltip.png`, fullPage: false })
    }
    evidence.errors.push(...errors)
    await page.close()
  }
} finally {
  await fs.writeFile(output + '/results.json', JSON.stringify(evidence, null, 2))
  await browser.close()
  await server.close()
}
const failures = evidence.checks.filter(check => !check.passed)
console.log(JSON.stringify({ checks: evidence.checks.length, failures, runs: evidence.runs.map(({ id, cls, before, after }) => ({ id, cls, filterHeight: [before.filter.height, after.filter.height], calendarY: [before.calendar.y, after.calendar.y], railHeight: [before.rail.height, after.rail.height], footerY: [before.footer.y, after.footer.y] })), errors: evidence.errors, output }, null, 2))
if (failures.length) process.exitCode = 1
