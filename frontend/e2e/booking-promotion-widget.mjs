import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const base = process.env.E2E_BASE || 'http://127.0.0.1:5175'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw Error('Local fixture host required')
const out = process.env.E2E_OUT || '/workspace/scratch/promotions-browser'
const widgetPath = process.env.WIDGET_HTML || '/workspace/scratch/promotion-widget.html'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage(), errors = [], quotes = []
page.on('pageerror', e => errors.push(e.message))
const room = { id: '101', name: 'Forest lodge', max_guests: 2, bedrooms: 1, price_per_night: 150, total_price: 300, currency: 'EUR', image: base + '/fixture-room.svg', amenities: [], tags: [] }
const extras = [{ id: '1', name: 'Sauna', price: 80, price_type: 'per_stay', category: 'wellness' }]
await context.route('**/*', async route => {
  const u = new URL(route.request().url())
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) return route.abort()
  if (u.pathname === '/fixture-room.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 350"><rect fill="#315e43" width="600" height="350"/><path fill="#e5cda1" d="M170 260V130l130-90 130 90v130z"/></svg>' })
  if (u.pathname === '/promotion-widget-fixture') return route.fulfill({ contentType: 'text/html', body: await fs.readFile(widgetPath, 'utf8') })
  if (!u.pathname.includes('/api/')) return route.continue()
  const endpoint = u.pathname.split('/').pop()
  let body = {}
  if (endpoint === 'config') body = { units: [room], extras, promotions_enabled: true, currency: 'EUR', min_nights: 1, max_nights: 30, payment_enabled: false, policies: {}, style: {} }
  else if (endpoint === 'availability') body = { available: [room], combinations: [] }
  else if (endpoint === 'calendar-prices') body = { prices: {}, availability: {} }
  else if (endpoint === 'quote') {
    const q = route.request().postDataJSON(); quotes.push(q)
    body = q.promo_code === 'WRONG' ? { error: 'We do not recognise that promo code.', code: 'promotion_invalid' } : {
      hold_token: 'local-only-promotion-hold', unit_id: '101', unit_name: room.name, check_in: q.check_in, check_out: q.check_out, nights: 2, adults: 2, children: 0,
      room_total: 300, extras_total: 80, gross_total: q.promo_code ? 320 : 380, currency: 'EUR', discount: q.promo_code ? 60 : 0, discount_label: q.promo_code || null,
      extras: [{ id: '1', name: 'Sauna', unit_price: 80, quantity: 1, line_total: 80 }],
    }
  }
  return route.fulfill({ json: body })
})
const check = (condition, label) => { if (!condition) throw Error(label) }
try {
  await page.goto(base + '/promotion-widget-fixture?check_in=2027-01-10&check_out=2027-01-12')
  await page.locator('#w-promo').fill('WRONG')
  await page.locator('#w-search').click()
  await page.locator('[data-unit="101"]').click()
  await page.locator('#w-next2').click()
  await page.locator('[data-extra-card="1"]').click()
  await page.locator('#w-next3').click()
  await page.getByText('We do not recognise that promo code.', { exact: true }).waitFor()
  await page.locator('#w-promo').fill('EARLYFOR20')
  await page.locator('#w-next3').click()
  await page.locator('#w-fname').waitFor()
  const summary = await page.locator('.summary-sidebar').innerText()
  check(summary.includes('EARLYFOR20'), 'applied code is visible')
  check(/Sauna\s+€80(?:[.,]00)?\b/.test(summary), 'extras remain 80')
  check(/Total\s+€320(?:[.,]00)?\b/i.test(summary), 'payable total is 320')
  check(quotes.at(-1).promo_code === 'EARLYFOR20', 'code reaches quote API')
  check(quotes.at(-1).extras[0].id === '1', 'extras reach quote API')
  await page.screenshot({ path: path.join(out, 'widget-discount-desktop.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(out, 'widget-discount-mobile.png'), fullPage: true, animations: 'disabled' })
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no mobile checkout overflow')
  check(errors.length === 0, 'no widget JavaScript errors: ' + errors.join('; '))
  await fs.writeFile(path.join(out, 'widget-result.json'), JSON.stringify({ passed: true, quotes, errors }, null, 2))
  console.log('Widget code validation, correction, full-price extras, displayed discount and mobile layout passed.')
} catch (error) {
  await page.screenshot({ path: path.join(out, 'widget-failure.png'), fullPage: true })
  throw error
} finally { await browser.close() }
