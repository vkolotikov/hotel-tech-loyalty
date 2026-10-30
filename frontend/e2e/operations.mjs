import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Use a local fixture host')
const out = process.env.E2E_OUTPUT || '../docs/audits/2026-10-29-launch-operations-evidence'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = [], results = []
const snapshot = { checked_at: '2026-10-29T13:00:00Z', checks: [
  { key: 'wallet_updates', status: 'attention', count: 1 }, { key: 'media_versioning', status: 'unobserved' },
  { key: 'email_failures', status: 'attention', count: 2 }, { key: 'email_delays', status: 'ok', count: 0 },
  { key: 'loyalty_delays', status: 'ok', count: 0 }, { key: 'scheduler', status: 'attention', last_seen_at: '2026-10-29T12:50:00Z' },
  { key: 'scheduled_failures', status: 'ok', count: 0 }, { key: 'queue_failures', status: 'attention', count: 1 },
  { key: 'queue_delays', status: 'unobserved', count: 0 },
] }
const titles = { en: 'System status', de: 'Systemstatus', fr: 'État du système', es: 'Estado del sistema', ru: 'Состояние системы' }
try {
  for (const [lang, width] of [['en', 1440], ['en', 320], ['de', 390], ['fr', 390], ['es', 390], ['ru', 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await context.addInitScript(({ lang }) => {
      localStorage.setItem('loyalty-auth', JSON.stringify({ version: 1, state: { token: 'local-status-fixture', user: { id: 1, user_type: 'staff', name: 'Alex Morgan', email: 'test@example.test' }, staff: { role: 'manager' } } }))
      localStorage.setItem('admin_lang', lang)
    }, { lang })
    let fail = false, calls = 0
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
      if (!url.pathname.startsWith('/api/')) return route.continue()
      if (route.request().method() !== 'GET') throw Error('Unexpected mutation: ' + url.pathname)
      let body = {}
      if (url.pathname.endsWith('/operations-status')) {
        calls++
        return route.fulfill({ status: fail ? 503 : 200, json: fail ? { message: 'Fixture outage' } : snapshot })
      }
      if (url.pathname.endsWith('/setup/status')) body = { setup_complete: true }
      if (url.pathname.endsWith('/auth/subscription')) body = { active: true, status: 'ACTIVE', features: { admin_ai: 'false' }, products: ['crm', 'loyalty', 'admin'] }
      if (url.pathname.endsWith('/brands')) body = { data: [] }
      if (url.pathname.endsWith('/theme')) body = { theme: {} }
      if (url.pathname.endsWith('/realtime')) body = { events: [] }
      return route.fulfill({ json: body })
    })
    await page.goto(base + '/system-status')
    await page.getByRole('heading', { name: titles[lang], exact: true }).waitFor()
    await page.locator('time').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) throw Error('Overflow: ' + lang + width)
    await page.screenshot({ path: `${out}/${lang}-${width}.png`, fullPage: false })
    results.push(`${lang}-${width}: render and no horizontal overflow`)
    if (lang === 'en' && width === 1440) {
      if (await page.getByRole('heading', { level: 2 }).count() !== 9) throw Error('Missing status cards')
      const before = calls
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('button:disabled'))
      if (calls <= before) throw Error('Refresh did not request fresh data')
      fail = true
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'Status could not be refreshed' }).waitFor()
      if (await page.getByRole('heading', { level: 2 }).count()) throw Error('Stale status still displayed after failure')
      fail = false
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await page.locator('time').first().waitFor()
      if (await page.getByRole('link', { name: 'Review campaigns', exact: true }).getAttribute('href') !== '/campaigns?tab=email') throw Error('Campaign destination')
      if (await page.getByRole('link', { name: 'Open audit log', exact: true }).getAttribute('href') !== '/audit-log') throw Error('Audit destination')
      results.push('Nine checks; refresh; failure hides stale data; retry; campaign and audit destinations')
    }
    await context.close()
  }
  if (errors.length) throw Error(JSON.stringify(errors))
  await fs.writeFile(`${out}/browser-results.json`, JSON.stringify({ results, errors, fixture: true, base }, null, 2))
  console.log(JSON.stringify({ results, errors }))
} finally { await browser.close() }
