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
  await dialog.getByRole('button', { name: 'Choose excluded last night 1', exact: true }).click()
  let calendar = dialog.getByRole('dialog', { name: 'Excluded last night 1 calendar' })
  check(await calendar.getByRole('button', { name: 'Wednesday, December 30, 2026', exact: true }).isDisabled(), 'calendar refuses dates before range start')
  await calendar.getByRole('button', { name: 'Thursday, December 31, 2026', exact: true }).click()
  check(await dialog.getByLabel('Excluded last night 1', { exact: true }).inputValue() === '2026-12-31', 'one-night exclusion remains inclusive')
  await dialog.getByRole('button', { name: 'Choose booking opens', exact: true }).click()
  calendar = dialog.getByRole('dialog', { name: 'Booking opens calendar' })
  await calendar.getByLabel('Booking opens time', { exact: true }).fill('14:30')
  await calendar.getByRole('button', { name: 'Friday, November 27, 2026', exact: true }).focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  check(await dialog.getByLabel('Booking opens', { exact: true }).inputValue() === '2026-11-26T14:30', 'keyboard selection preserves venue wall-clock time')
  await dialog.getByLabel('Booking opens', { exact: true }).fill('2026-11-27T00:00')
  await dialog.getByRole('button', { name: 'Choose first eligible night', exact: true }).click()
  calendar = dialog.getByRole('dialog', { name: 'First eligible night calendar' })
  await calendar.getByLabel('Calendar year', { exact: true }).selectOption('2028')
  await calendar.getByLabel('Calendar month', { exact: true }).selectOption('1')
  await calendar.getByRole('button', { name: 'Tuesday, February 29, 2028', exact: true }).click()
  check(await dialog.getByLabel('First eligible night', { exact: true }).inputValue() === '2028-02-29', 'month/year jump supports leap days')
  await dialog.getByRole('button', { name: 'Choose first eligible night', exact: true }).click()
  await dialog.getByRole('dialog', { name: 'First eligible night calendar' }).getByRole('button', { name: 'Clear', exact: true }).click()
  check(await dialog.getByLabel('First eligible night', { exact: true }).inputValue() === '', 'optional dates can be cleared')
  await dialog.getByRole('button', { name: 'Choose last eligible night', exact: true }).click()
  await page.keyboard.press('Escape')
  check(await dialog.getByRole('heading', { name: 'New promotion', exact: true }).isVisible(), 'calendar Escape keeps editor open')
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
  await page.getByText('Promotion saved', { exact: true }).waitFor({ state: 'hidden' })
  for (const style of ['glass', 'light']) {
    await page.evaluate(style => document.documentElement.dataset.style = style, style)
    for (const status of ['draft', 'published', 'paused', 'archived']) {
      const select = dialog.getByLabel('Status', { exact: true })
      await select.selectOption(status)
      const colours = await select.evaluate(el => {
        const rgb = text => text.match(/[\d.]+/g).slice(0, 3).map(Number)
        const luminance = colour => rgb(colour).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0)
        const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
        return [...el.options].map(option => { const css = getComputedStyle(option); return { label: option.text, contrast: contrast(css.color, css.backgroundColor) } })
      })
      check(colours.every(option => option.contrast >= 4.5), `${style} ${status}: every status option is readable`)
    }
    await dialog.getByLabel('Status', { exact: true }).selectOption('published')
    await dialog.getByRole('button', { name: 'Choose excluded last night 1', exact: true }).click()
    const picker = dialog.getByRole('dialog', { name: 'Excluded last night 1 calendar' })
    const bounds = await picker.boundingBox()
    check(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844, `${style} phone calendar fits viewport`)
    await page.screenshot({ path: path.join(out, `admin-calendar-mobile-${style}.png`) })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await dialog.getByRole('button', { name: 'Choose booking closes', exact: true }).click()
    await page.screenshot({ path: path.join(out, `admin-calendar-desktop-${style}.png`) })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
  }
  await page.evaluate(() => document.documentElement.dataset.style = 'glass')
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
