import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const base = process.env.E2E_BASE || 'http://127.0.0.1:5175'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw Error('Local fixture host required')
const out = process.env.E2E_OUT || '/workspace/scratch/promotions-browser'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = [], writes = []
page.on('pageerror', e => errors.push(e.message))
const fixture = { enabled: false, timezone: 'Europe/Riga', currency: 'EUR', rooms: [{ id: 1, name: 'Forest lodge' }], promotions: [] }
const user = { id: 1, name: 'Test Manager', email: 'manager@example.test', user_type: 'staff', language: 'en', industry: 'hotel' }
await context.addInitScript(user => {
  localStorage.setItem('auth_token', 'local-promotion-fixture')
  localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token: 'local-promotion-fixture', user, staff: { role: 'manager' } }, version: 1 }))
}, user)
await context.route('**/*', route => {
  const url = new URL(route.request().url())
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
  return route.continue()
})
await page.route('**/api/**', async route => {
  const request = route.request(), p = new URL(request.url()).pathname
  let body = {}
  if (p.endsWith('/auth/subscription')) body = { active: true, status: 'ACTIVE', plan: { name: 'Growth', slug: 'growth' }, features: {}, products: ['booking'] }
  else if (p.endsWith('/auth/me')) body = user
  else if (p.endsWith('/setup/status')) body = { setup_complete: true }
  else if (p.endsWith('/branding/theme') || p.endsWith('/theme')) body = { theme: { primary_color: '#74c895', dark_mode_enabled: 'true', theme_style: 'glass' } }
  else if (p.endsWith('/brands')) body = { data: [{ id: 1, name: 'Forest venue', is_default: true }] }
  else if (p.includes('/booking-promotions')) {
    if (request.method() === 'GET') body = fixture
    else {
      const data = request.postDataJSON(); writes.push({ p, data })
      if (p.endsWith('/settings')) { fixture.enabled = data.enabled; body = { enabled: data.enabled } }
      else if (request.method() === 'POST') { body = { ...data, id: fixture.promotions.length + 1, revision: 1, state: data.status === 'published' ? 'scheduled' : 'draft' }; fixture.promotions.push(body) }
      else {
        const id = Number(p.split('/').pop()), current = fixture.promotions.find(x => x.id === id)
        if (current && current.revision !== data.revision) return route.fulfill({ status: 409, json: { message: 'This promotion changed. Refresh before saving.', code: 'stale' } })
        body = { ...data, id, revision: data.revision + 1, state: data.status === 'published' ? 'scheduled' : data.status }; fixture.promotions = fixture.promotions.map(x => x.id === id ? body : x)
      }
    }
  }
  else if (p.endsWith('/settings')) body = {}
  else if (p.endsWith('/stats')) body = { unread: 0 }
  else if (p.endsWith('/events')) body = { events: [] }
  await route.fulfill({ json: body })
})
const check = (value, label) => { if (!value) throw Error(label) }
try {
  await page.goto(base + '/booking-promotions')
  await page.getByRole('heading', { name: 'Stay promotions', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Second night free', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Promo code', { exact: true }).fill('VIPFORREST')
  await dialog.getByLabel('Booking opens', { exact: true }).fill('2026-11-27T00:00')
  await dialog.getByLabel('Booking closes', { exact: true }).fill('2026-11-28T00:00')
  await dialog.getByLabel('Status', { exact: true }).selectOption('published')
  await dialog.getByRole('button', { name: 'Exclude dates', exact: true }).click()
  await dialog.getByLabel('Excluded first night 1', { exact: true }).fill('2026-12-31')
  await dialog.getByLabel('Excluded last night 1', { exact: true }).fill('2026-12-31')
  await dialog.getByLabel('Forest lodge', { exact: true }).check()
  await page.screenshot({ path: path.join(out, 'admin-campaign-desktop.png') })
  await dialog.getByRole('button', { name: 'Save promotion', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  check(writes.at(-1).data.min_nights === 2, 'minimum two nights sent')
  check(writes.at(-1).data.type === 'second_night_free', 'free night type sent')
  check(writes.at(-1).data.excluded_dates[0].from === '2026-12-31', 'excluded night sent')
  check(writes.at(-1).data.room_ids[0] === 1, 'eligible room sent')
  check(writes.at(-1).data.booking_until === '2026-11-28T00:00', 'venue calendar input preserved')
  await page.getByLabel('Enabled', { exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[type=checkbox]')?.checked)
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  dialog = page.getByRole('dialog')
  check(await dialog.getByLabel('Status', { exact: true }).inputValue() === 'draft', 'duplicate stays draft')
  check(await dialog.getByLabel('Promo code', { exact: true }).inputValue() === '', 'duplicate needs new code')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  dialog = page.getByRole('dialog')
  await page.screenshot({ path: path.join(out, 'admin-campaign-mobile.png') })
  await fs.writeFile(path.join(out, 'mobile-layout.json'), JSON.stringify(await dialog.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, elements: [...el.querySelectorAll('*')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => ({ tag: n.tagName, class: n.className, width: n.clientWidth, scroll: n.scrollWidth, text: n.textContent?.slice(0, 80) })) })), null, 2))
  check(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'no mobile dialog overflow')
  await page.keyboard.press('Escape')
  await page.getByLabel('Find a campaign', { exact: true }).fill('missing')
  await page.getByText('No campaigns match your search.', { exact: true }).waitFor()
  await page.getByLabel('Find a campaign', { exact: true }).fill('VIPFORREST')
  await page.getByLabel('Filter campaign status', { exact: true }).selectOption('draft')
  await page.getByText('No campaigns match your search.', { exact: true }).waitFor()
  await page.getByLabel('Filter campaign status', { exact: true }).selectOption('all')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.locator('article').getByText('paused', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Campaign name', { exact: true }).fill('Unsaved local name')
  fixture.promotions[0].revision += 1
  fixture.promotions[0].name = 'Saved by another manager'
  await dialog.getByRole('button', { name: 'Save promotion', exact: true }).click()
  await dialog.getByRole('alert').waitFor()
  check((await dialog.getByRole('alert').innerText()).includes('This promotion changed. Refresh before saving.'), 'stale save explains the recovery')
  await dialog.getByRole('button', { name: 'Reload saved version', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(e => e.value === 'Saved by another manager'))
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await page.locator('article').getByText('archived', { exact: true }).waitFor()
  await page.screenshot({ path: path.join(out, 'admin-campaign-list-mobile.png') })
  check(errors.length === 0, 'no JavaScript errors: ' + errors.join('; '))
  await fs.writeFile(path.join(out, 'admin-result.json'), JSON.stringify({ passed: true, writes, errors }, null, 2))
  console.log('Admin creation, dates, exclusions, room scope, duplication, enable switch, search/filter, pause/archive, stale-editor recovery and mobile layout passed.')
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true })
  await fs.writeFile(path.join(out, 'failure.html'), await page.content())
  throw error
} finally { await browser.close() }
