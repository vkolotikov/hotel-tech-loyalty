import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
const root = process.env.LAUNCH_FIXTURE
if (!root || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_HOST !== '127.0.0.1') throw Error('Isolated launch environment required')
const fixture = JSON.parse(await fs.readFile(root, 'utf8'))
const base = 'http://127.0.0.1:5819'
const out = path.resolve(process.env.LAUNCH_OUTPUT, 'portal-design')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'] })
await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
const page = await context.newPage()
const errors = []; const checks = []
page.on('pageerror', e => errors.push(e.message))
const check = (condition, message) => { if (!condition) throw Error(message); checks.push(message); console.log('PASS ' + message) }
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.p-main [aria-busy="true"], .p-sheet [aria-busy="true"], .p-main .animate-pulse'))
  await page.waitForTimeout(250)
}
async function capture(name) {
  await settled()
  await page.screenshot({ path: path.join(out, name), animations: 'disabled' })
}
async function api(token, endpoint, method = 'GET', data) {
  const url = new URL('/api/v1/' + endpoint, base)
  if (endpoint.startsWith('admin/loyalty/')) url.searchParams.set('brand_id', 'all')
  const r = await context.request.fetch(url.href, { method, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }, ...(data === undefined ? {} : { data }) })
  const body = await r.json()
  if (!r.ok()) throw Error('API ' + endpoint + ': ' + r.status())
  return body
}
const statePath = path.join(out, 'private-state.json')
let state
try { state = JSON.parse(await fs.readFile(statePath, 'utf8')) } catch {
  const run = Date.now().toString(36)
  const password = fixture.member.password
  const register = await context.request.post(base + '/api/v1/auth/register', { data: { name: 'Alex Reed', email: 'portal.' + run + '@example.test', password, password_confirmation: password, org_token: fixture.org_token }, headers: { Accept: 'application/json' } })
  if (!register.ok()) throw Error('Member registration failed: ' + register.status())
  state = await register.json()
  await fs.writeFile(statePath, JSON.stringify(state))
}
await context.addInitScript(({ token, user }) => {
  localStorage.setItem('auth_token', token)
  localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token, user, staff: null }, version: 1 }))
  localStorage.setItem('admin_lang', 'en')
}, state)
try {
  const managerResponse = await context.request.post(base + '/api/v1/auth/login', { data: { ...fixture.roles.manager, user_type: 'staff' }, headers: { Accept: 'application/json' } })
  const manager = await managerResponse.json()
  if (!manager.token) throw Error('Manager authentication failed')
  const boot = await api(state.token, 'member/portal')
  check(boot.venue.name === 'Launch Test Hotel', 'real member reaches their own venue')
  const programme = await api(state.token, 'member/portal/programme')
  check(programme.earning.base_rate > 0, 'earning panel receives actual programme facts')
  if (boot.member.current_points < 200) {
    const members = await api(manager.token, 'admin/loyalty/members?q=' + encodeURIComponent(state.user.email))
    const enrolled = members.members.find(m => m.name === 'Alex Reed')
    await api(manager.token, 'admin/loyalty/members/' + enrolled.id + '/award', 'POST', { points: 1000, reason: 'Isolated portal design rehearsal', idempotency_key: 'portal-qa-' + Date.now() })
    boot.member = (await api(state.token, 'member/portal')).member
  }
  let rewards = await api(state.token, 'member/rewards')
  if (!rewards.rewards.some(r => r.name === 'Priority appointment')) await api(manager.token, 'admin/loyalty/rewards', 'POST', { name: 'Priority appointment', description: 'A little extra for your next visit.', points_cost: 200, stock: 30, per_member_limit: 10, is_active: true, discount_type: 'fixed_amount', discount_value: 4, applies_to: 'all' })
  const availableBenefits = await api(state.token, 'member/benefits')
  if (!availableBenefits.benefits.some(b => b.name === 'Welcome drink')) {
    const definition = await api(manager.token, 'admin/loyalty/program/benefits', 'POST', { name: 'Welcome drink', code: 'portal_drink_' + Date.now().toString(36), category: 'dining', fulfillment_mode: 'on_request', is_active: true })
    await api(manager.token, 'admin/loyalty/program/tiers/' + boot.member.tier.id + '/benefits', 'POST', { benefit_id: definition.benefit.id, value_type: 'text', value: 'A warm welcome on your next visit', applies_to: 'all', is_active: true })
  }
  const allOffers = await api(manager.token, 'admin/loyalty/offers')
  if (!allOffers.offers.some(o => o.title === 'Member wellness offer')) await api(manager.token, 'admin/loyalty/offers', 'POST', { title: 'Member wellness offer', description: 'Enjoy a little more on your next visit.', type: 'discount', value: 15, start_date: '2026-11-01', end_date: '2027-03-31', is_active: true, applies_to: 'all' })
  const wellness = (await api(manager.token, 'admin/loyalty/offers')).offers.find(o => o.title === 'Member wellness offer')
  await api(manager.token, 'admin/loyalty/offers/' + wellness.id, 'PUT', { is_active: true, tier_ids: [boot.member.tier.id] })
  await page.goto(base + '/portal')
  await page.getByRole('heading', { name: 'Hi, Alex' }).waitFor()
  await page.locator('.p-member-qr svg').waitFor()
  await capture('home-desktop.png')
  await page.getByRole('button', { name: 'My card', exact: true }).click()
  await page.getByRole('dialog').locator('.p-qr svg').waitFor()
  check(await page.locator('dialog[open]').count() === 1, 'member card opens a native modal with the real QR')
  check(await page.getByRole('dialog').evaluate(el => getComputedStyle(el).getPropertyValue('--p-surface').trim().length > 0 && getComputedStyle(el).borderTopWidth === '1px'), 'global panels inherit the portal palette and frame')
  await capture('card-panel.png')
  await page.keyboard.press('Escape')
  check(await page.locator('dialog[open]').count() === 0, 'Escape closes the card panel')
  check(await page.evaluate(() => document.activeElement?.textContent.trim() === 'My card'), 'closing a panel restores focus to its opener')
  await page.getByRole('button', { name: 'My card', exact: true }).click()
  for (let step = 0; step < 6; step++) { await page.keyboard.press('Tab'); check(await page.evaluate(() => document.querySelector('dialog[open]')?.contains(document.activeElement)), 'modal contains keyboard focus ' + step) }
  await page.mouse.click(4, 4)
  check(await page.locator('dialog[open]').count() === 0, 'clicking the backdrop closes the panel')
  await page.getByRole('button', { name: 'Earn points', exact: true }).click()
  await page.getByRole('dialog').getByText('Eligible spend', { exact: true }).waitFor()
  await capture('earn-panel.png')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Invite a friend', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Copy link' }).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Copy link' }).click()
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor()
  check((await page.evaluate(() => navigator.clipboard.readText())).includes('/portal/join?org='), 'invite copies a genuine venue join link')
  await page.keyboard.press('Escape')
  await page.goto(base + '/portal/rewards')
  await page.getByRole('heading', { name: 'Priority appointment', exact: true }).waitFor()
  await capture('rewards-desktop.png')
  const welcome = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Welcome drink', exact: true }) })
  await welcome.getByRole('button', { name: 'Request this', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel request', exact: true }).waitFor()
  check((await api(state.token, 'member/benefits')).benefits.some(b => b.name === 'Welcome drink' && b.request), 'benefit request reaches the real member writer')
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click()
  await page.getByRole('button', { name: 'Request this', exact: true }).waitFor()
  check(!(await api(state.token, 'member/benefits')).benefits.find(b => b.name === 'Welcome drink').request, 'benefit cancellation persists')
  const offerButton = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Member wellness offer', exact: true }) }).getByRole('button', { name: 'Claim offer', exact: true })
  if (await offerButton.count()) {
    const claimed = page.waitForResponse(r => r.url().includes('/offers/' + wellness.id + '/claim') && r.request().method() === 'POST')
    await offerButton.click()
    check((await claimed).ok(), 'offer claims use the canonical writer')
  }
  const reward = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Priority appointment', exact: true }) })
  await reward.getByRole('button', { name: 'Redeem', exact: true }).click()
  const response = page.waitForResponse(r => r.url().includes('/redeem') && r.request().method() === 'POST')
  let redeemRequests = 0
  await page.route('**/api/v1/member/rewards/*/redeem', async route => { redeemRequests++; await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue() })
  await page.getByRole('dialog').getByRole('button', { name: 'Redeem', exact: true }).evaluate(el => { el.click(); el.click() })
  await page.waitForFunction(() => document.querySelector('dialog[open]')?.getAttribute('aria-busy') === 'true')
  await page.keyboard.press('Escape')
  check(await page.locator('dialog[open]').count() === 1, 'redemption confirmation stays open while its request is pending')
  check((await response).status() === 201, 'redemption uses the canonical server action')
  check(redeemRequests === 1, 'rapid confirmation cannot send duplicate redemption requests')
  await page.getByRole('heading', { name: 'Code ready', exact: true }).waitFor()
  await capture('code-panel.png')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'My codes', exact: true }).click()
  await page.getByRole('dialog').getByText('Priority appointment', { exact: true }).first().waitFor()
  check(await page.getByRole('dialog').getByText('Show at the desk', { exact: true }).count() > 0, 'redeemed code remains available in My codes')
  await page.keyboard.press('Escape')
  await page.goto(base + '/portal/profile')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Phone', { exact: true }).fill('+37120001111')
  await page.getByLabel('Date of birth', { exact: true }).fill('1990-05-12')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('dialog[open]'))
  const saved = await api(state.token, 'member/portal')
  check(saved.member.user.phone === '+37120001111' && saved.member.user.date_of_birth.startsWith('1990-05-12'), 'profile popup persists phone and birthday')
  await capture('profile-desktop.png')
  await page.getByRole('button', { name: /^Notifications/ }).click()
  const offerSwitch = page.getByRole('switch', { name: 'Offers', exact: true })
  const before = await offerSwitch.getAttribute('aria-checked')
  await offerSwitch.click()
  await page.waitForFunction(({ before }) => document.querySelector('[role=switch][aria-label=Offers]')?.getAttribute('aria-checked') !== before, { before })
  check((await api(state.token, 'member/portal')).member.notification_preferences.offers === (before !== 'true'), 'notification preferences persist through the existing member writer')
  await capture('notifications-panel.png')
  await page.keyboard.press('Escape')
  for (const name of ['home','rewards','bookings','profile']) {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto(base + '/portal' + (name === 'home' ? '' : '/' + name))
    await page.locator('h1').waitFor()
    await settled()
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' has no mobile horizontal overflow')
    await capture(name + '-mobile.png')
    if (name === 'home') {
      await page.getByRole('button', { name: 'My card', exact: true }).click()
      await settled()
      const box = await page.getByRole('dialog').boundingBox()
      check(box.x >= 0 && box.y >= 0 && box.x + box.width <= 393 && box.y + box.height <= 852, 'mobile card panel stays inside the viewport')
      await capture('card-panel-mobile.png')
      await page.keyboard.press('Escape')
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(base + '/portal')
  await page.locator('.p-member-qr svg').waitFor()
  await capture('home-light.png')
  check(errors.length === 0, 'no browser runtime errors')
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ checks, errors }, null, 2))
} finally { await browser.close() }
