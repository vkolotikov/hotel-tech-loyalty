import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5819'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_PORT !== '55459' || process.env.DB_HOST !== '127.0.0.1' || process.env.MAIL_MAILER !== 'log') throw Error('Isolated launch environment required')
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const out = path.resolve(process.env.LAUNCH_OUTPUT, '../open-details')
await fs.mkdir(out, { recursive: true })
const report = { checks: [], errors: [], phase: 'start', localOnly: true, deletedRequests: [] }
const secrets = Object.values(fixture.roles).map(r => r.password)
const scrub = value => secrets.reduce((s, secret) => s.replaceAll(secret, '[redacted]'), String(value))
const check = (ok, name) => { if (!ok) throw Error(name); report.checks.push(name); console.log('PASS ' + name) }
const exec = promisify(execFile)
const repo = fileURLToPath(new URL('../../', import.meta.url))
const resetCounters = () => exec(process.env.PHP, [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), 'cache:clear', '--no-interaction'], { cwd: repo, env: process.env, windowsHide: true, timeout: 60000 })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const sessions = []
async function session(role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  await ctx.addInitScript(() => { if (location.protocol === 'http:' || location.protocol === 'https:') { if (!localStorage.getItem('admin_lang')) localStorage.setItem('admin_lang', 'en'); if (!localStorage.getItem('loyalty:look')) localStorage.setItem('loyalty:look', JSON.stringify({ theme: 'dark', rail: 'full' })) } })
  const page = await ctx.newPage()
  page.on('pageerror', e => report.errors.push(scrub(e.message)))
  page.on('dialog', dialog => dialog.accept())
  page.on('request', request => { if (request.method() === 'DELETE') report.deletedRequests.push(new URL(request.url()).pathname) })
  await page.goto(base + '/loyalty/login')
  await page.getByLabel('Email', { exact: true }).fill(fixture.roles[role].email)
  await page.getByLabel('Password', { exact: true }).fill(fixture.roles[role].password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(url => !url.pathname.endsWith('/login'))
  const token = await page.evaluate(() => localStorage.getItem('auth_token'))
  secrets.push(token)
  const result = { ctx, page, token, role }
  sessions.push(result)
  return result
}
async function api(s, endpoint, method = 'GET', data, allowed = false) {
  const response = await s.ctx.request.fetch(`${base}/api/v1/admin/loyalty/${endpoint}${endpoint.includes('?') ? '&' : '?'}brand_id=all`, { method, data, headers: { Accept: 'application/json', Authorization: 'Bearer ' + s.token } })
  const body = await response.json()
  if (response.status() >= 400 && !allowed) throw Error(`${method} ${endpoint}: ${response.status()} ${body.error || JSON.stringify(body.errors || {})}`)
  return { status: response.status(), body }
}
async function go(page, url) {
  await page.goto(base + url)
  await page.locator('main h1').waitFor()
  await page.waitForFunction(() => !document.querySelector('main .animate-pulse'))
  await page.evaluate(() => document.fonts.ready)
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true })
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' fits viewport')
}
async function openInfo(page, title, label) {
  const detail = page.locator('#management-detail'), info = detail.locator('.l-ad-info')
  await info.getByRole('heading', { name: title, exact: true }).waitFor()
  check(await info.isVisible() && await detail.locator('details').count() === 0 && await info.locator('summary').count() === 0, label + ' shows named details without a disclosure')
  return { detail, info }
}
const textOf = async locator => (await locator.innerText()).replace(/\s+/g, ' ')
let activePage
try {
  await resetCounters()
  const manager = await session('manager'), page = manager.page
  activePage = page
  const boot = (await api(manager, 'bootstrap')).body
  let program = (await api(manager, 'program')).body
  if (program.tiers.length < 2) {
    for (const [i, name] of ['Saved Silver', 'Saved Gold'].entries()) await api(manager, 'program/tiers', 'POST', { name, min_points: i * 1000, min_visits: null, min_spend: null, earn_rate: 1 + i * .5, description: null, color: null, is_active: true })
    program = (await api(manager, 'program')).body
  }
  const first = program.tiers.find(t => t.is_active), top = program.tiers.filter(t => t.is_active).at(-1), run = Date.now().toString(36)
  const perkDescription = 'A garden table and a welcome drink for members of the assigned levels.'
  const perk = (await api(manager, 'program/benefits', 'POST', { name: 'Garden dining perk ' + run, code: 'OD_' + run.toUpperCase(), description: perkDescription, category: 'dining', fulfillment_mode: 'automatic', is_active: true })).body.benefit
  for (const [tier, value] of [[first, 5], [top, 15]]) await api(manager, `program/tiers/${tier.id}/benefits`, 'POST', { benefit_id: perk.id, value: `${value}% garden discount`, value_type: 'percent_discount', value_amount: value, applies_to: 'services' })
  // Restore a legacy category on exactly the new fake row; API responses and UI continue through their real writers/readers.
  const legacy = await exec('C:/Program Files/PostgreSQL/18/bin/psql.exe', ['-h', '127.0.0.1', '-p', '55459', '-U', 'loyalty_launch_owner', '-d', 'loyalty_launch_demo', '-t', '-A', '-c', `UPDATE benefit_definitions SET category='food_beverage' WHERE id=${Number(perk.id)} AND organization_id=${Number(fixture.org_id)} RETURNING id;`], { windowsHide: true, timeout: 10000 })
  check(legacy.stdout.trim().split(/\r?\n/)[0] === String(perk.id), 'Legacy category fixture changes only the new disposable perk')
  const rewardTerms = 'Show your code at the garden desk.\nOne claim per visit.'
  const rewardDescription = 'A saved garden reward description for the member.'
  const reward = (await api(manager, 'rewards', 'POST', { name: 'Garden reward ' + run, description: rewardDescription, terms: rewardTerms, category: 'seasonal_weekend', points_cost: 500, stock: 9, per_member_limit: 2, discount_type: null, discount_value: null, applies_to: 'all', expires_at: '2027-12-31T23:59', is_active: true })).body.reward
  const day = boot.venue.today, plus = n => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
  const offerTerms = 'Book a treatment before 11:00.\nShow the offer to our team.'
  const offer = (await api(manager, 'offers', 'POST', { title: 'Garden offer ' + run, description: offerTerms, type: 'discount', value: 20, code: 'OD' + run.toUpperCase(), applies_to: 'services', tier_ids: [first.id], start_date: day, end_date: plus(7), usage_limit: 50, per_member_limit: 2, is_featured: false })).body.offer
  const boost = (await api(manager, 'program/boosts', 'POST', { name: 'Garden boost ' + run, description: 'An automatic two-day garden promotion.', multiplier: 2, starts_at: plus(1) + 'T09:00', ends_at: plus(2) + 'T18:00', days_of_week: null, tier_ids: [first.id], is_active: true })).body.boost
  await api(manager, 'options', 'PUT', { options: { spend_points_enabled: true, points_per_currency: 2.25, checkin_enabled: true, checkin_points: 20 } })
  const urls = { earning: '/loyalty/options?tab=earn&selected=earn_rate', perk: `/loyalty/rewards?tab=benefits&selected=${perk.id}`, offer: `/loyalty/rewards?tab=offers&selected=${offer.id}`, reward: `/loyalty/rewards?selected=${reward.id}`, boost: `/loyalty/options?tab=bonus&boost=${boost.id}`, purchase: '/loyalty/options?tab=earn&way=earn_rate' }

  report.phase = 'manager layouts'
  for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
    await resetCounters()
    const tag = theme + '-' + width
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(theme => localStorage.setItem('loyalty:look', JSON.stringify({ theme, rail: 'full' })), theme)
    await go(page, urls.earning)
    let { detail, info } = await openInfo(page, 'How it works', tag + ' earning')
    const actions = info.locator('.l-ad-info-actions'), links = actions.locator('a')
    const geometry = await actions.evaluate(element => { const s = getComputedStyle(element); return { columnGap: parseFloat(s.columnGap), rowGap: parseFloat(s.rowGap), boxes: [...element.querySelectorAll('a')].map(a => { const r = a.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }) } })
    const [a, b] = geometry.boxes
    check(await links.count() === 2 && geometry.columnGap >= 16 && geometry.rowGap >= 8 && (b.left - a.right >= 8 || b.top - a.bottom >= 8), tag + ' earning links remain distinct and spaced')
    check((await textOf(info)).includes('2.25'), tag + ' earning explanation uses the saved server rate')
    await screenshot(page, 'earning-' + tag)
    await go(page, urls.perk)
    ;({ detail, info } = await openInfo(page, 'Perk details', tag + ' perk'))
    check((await textOf(info)).includes(perkDescription) && (await textOf(info)).includes(first.name) && (await textOf(info)).includes(top.name) && (await textOf(info)).includes('Food & drink') && !(await textOf(info)).includes('food_beverage'), tag + ' perk description, assignments and legacy category are readable')
    await detail.locator('.l-ad-assignment select').selectOption(String(first.id))
    check((await detail.locator('.l-ad-visual').innerText()).includes('5% off'), tag + ' perk preview follows first assignment')
    await detail.locator('.l-ad-assignment select').selectOption(String(top.id))
    check((await detail.locator('.l-ad-visual').innerText()).includes('15% off'), tag + ' perk preview follows top assignment')
    if (width === 390) {
      const selectedLabel = await detail.locator('.l-ad-assignment select').evaluate(select => { const style = getComputedStyle(select), canvas = document.createElement('canvas'), context = canvas.getContext('2d'); context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; return { width: select.getBoundingClientRect().width, needed: context.measureText(select.selectedOptions[0].textContent).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 24 } })
      check(selectedLabel.width >= selectedLabel.needed, tag + ' full selected level label fits beside the native dropdown arrow')
    }
    await screenshot(page, 'perk-' + tag)
    await go(page, urls.offer)
    ;({ detail, info } = await openInfo(page, 'Offer details', tag + ' offer'))
    check((await textOf(info)).includes('Every brand') && (await textOf(info)).includes('50') && (await textOf(info)).includes('2') && (await textOf(info)).includes(offerTerms.replace(/\n/g, ' ')) && await info.getByRole('heading', { name: 'Terms & conditions', exact: true }).isVisible(), tag + ' offer brand, limits and terms stay visible')
    await screenshot(page, 'offer-' + tag)
    await go(page, urls.reward)
    ;({ detail, info } = await openInfo(page, 'Reward details', tag + ' reward'))
    check((await textOf(info)).includes(rewardTerms.replace(/\n/g, ' ')) && (await textOf(info)).includes(rewardDescription) && (await textOf(info)).includes('seasonal weekend') && !(await textOf(info)).includes('seasonal_weekend') && (await textOf(info)).includes('Redeemed: 0') && (await textOf(info)).includes('Fulfilled: 0'), tag + ' reward terms, description, readable custom category and counts stay visible')
    check(await detail.getByRole('heading', { name: 'Key conditions', exact: true }).isVisible() && (await textOf(detail)).includes('How to claim'), tag + ' reward claim conditions remain prominent')
    await screenshot(page, 'reward-' + tag)
    await go(page, urls.boost)
    const removeBoost = page.locator('#management-detail .l-ad-detail-actions').getByRole('button', { name: 'Remove', exact: true })
    await removeBoost.waitFor()
    check(await removeBoost.isVisible() && await page.locator('#management-detail details').count() === 0, tag + ' boost removal has a visible action without Advanced disclosure')
    await screenshot(page, 'boost-' + tag)
    await go(page, urls.purchase)
    const dialog = page.getByRole('dialog'), calculation = dialog.locator('.l-ad-info')
    await calculation.getByRole('heading', { name: 'Calculation', exact: true }).waitFor()
    check(await calculation.isVisible() && (await textOf(calculation)).includes('rounded down to whole points') && await calculation.locator('summary').count() === 0, tag + ' purchase calculation guidance is open')
    await screenshot(page, 'purchase-editor-' + tag)
  }

  report.phase = 'keyboard and retained actions'
  await page.setViewportSize({ width: 1440, height: 1000 })
  await go(page, urls.earning)
  const earningLinks = page.locator('#management-detail .l-ad-info-actions a')
  await earningLinks.nth(0).focus()
  await page.keyboard.press('Tab')
  check(await earningLinks.nth(1).evaluate(el => document.activeElement === el), 'Keyboard Tab moves between the spaced earning links')
  await page.keyboard.press('Enter')
  await page.waitForURL(url => url.pathname === '/loyalty/program' && url.searchParams.get('settings') === 'qualification')
  await page.getByRole('dialog').waitFor()
  check(await page.getByRole('dialog').count() === 1, 'Keyboard activation opens the existing qualification editor')
  await go(page, urls.perk)
  await page.locator('#management-detail .l-ad-assignment select').selectOption(String(top.id))
  await page.locator('#management-detail').getByRole('button', { name: 'Manage assignment', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Discount (%)', { exact: true }).fill('17')
  const attached = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`/program/tiers/${top.id}/benefits`))
  await dialog.getByRole('button', { name: 'Save benefit', exact: true }).click()
  check((await attached).ok(), 'Visible Manage assignment saves through the canonical tier-benefit writer')
  await dialog.waitFor({ state: 'hidden' })
  program = (await api(manager, 'program')).body
  check(program.tiers.find(t => t.id === top.id).benefits.find(b => b.benefit_id === perk.id).value_amount === 17, 'Saved assignment keeps its typed value and target tier')
  await page.locator('#management-detail').getByRole('button', { name: 'Manage assignment', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Take it off', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Keep it', exact: true }).click()
  check(await page.getByRole('dialog').getByLabel('Discount (%)', { exact: true }).inputValue() === '17', 'Cancelling assignment removal returns to the preserved assignment form')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('#management-detail').getByRole('button', { name: 'Assign to a level', exact: true }).click()
  dialog = page.getByRole('dialog')
  check(await dialog.getByLabel('Choose a tier', { exact: true }).isVisible(), 'Visible assign action opens the existing tier chooser')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('#management-detail').getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  check(await page.getByRole('dialog').count() === 1, 'The visible More action retains the rename dialog')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await go(page, urls.boost)
  await page.locator('#management-detail').getByRole('button', { name: 'Remove', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Remove boost', exact: true }).waitFor()
  check(await dialog.getByRole('button', { name: 'Remove boost', exact: true }).isVisible(), 'Visible boost Remove action opens its existing confirmation')
  await dialog.getByRole('button', { name: 'Keep it', exact: true }).click()
  check((await api(manager, 'program')).body.boosts.some(b => b.id === boost.id) && report.deletedRequests.length === 0, 'Cancelling removal preserves boost and assignments without DELETE requests')

  report.phase = 'custom category safety'
  for (const [category, label] of [['constructor', 'constructor'], ['toString', 'toString'], ['__proto__', 'proto']]) {
    const custom = (await api(manager, 'rewards', 'POST', { name: 'Custom category ' + category + ' ' + run, category, points_cost: 250, stock: null, per_member_limit: 1, discount_type: null, discount_value: null, applies_to: 'all', expires_at: null, is_active: true })).body.reward
    await go(page, `/loyalty/rewards?selected=${custom.id}`)
    const { info } = await openInfo(page, 'Reward details', category + ' custom reward')
    const metadata = await textOf(info.locator('.l-rb-advanced-meta'))
    check(metadata.includes('Category: ' + label) && !metadata.includes('[object Object]') && !metadata.includes('function '), category + ' remains readable plain category text')
  }

  report.phase = 'five locales'
  for (const lang of ['en', 'ru', 'de', 'fr', 'es']) for (const theme of ['dark', 'light']) {
    await resetCounters()
    await page.setViewportSize({ width: 390, height: 1000 })
    await page.evaluate(({ lang, theme }) => { localStorage.setItem('admin_lang', lang); localStorage.setItem('loyalty:look', JSON.stringify({ theme, rail: 'full' })) }, { lang, theme })
    const words = JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/adminux.${lang}.json`, import.meta.url), 'utf8'))
    for (const [name, heading] of [['earning', words.howItWorks], ['perk', words.perkDetails], ['offer', words.offerDetails], ['reward', words.rewardDetails]]) {
      await go(page, urls[name])
      const { info } = await openInfo(page, heading, `${lang} ${theme} ${name}`)
      check(!(await textOf(info)).includes('loyalty.'), `${lang} ${theme} ${name} has registered words`)
      if (name === 'perk') check((await textOf(info)).includes(words.foodAndDrink) && !(await textOf(info)).includes('food_beverage'), `${lang} ${theme} translates the legacy food category`)
      await screenshot(page, `${name}-${lang}-${theme}-390`)
    }
  }

  report.phase = 'staff read access'
  await resetCounters()
  const staff = await session('desk')
  activePage = staff.page
  const staffBoot = (await api(staff, 'bootstrap')).body
  check(!staffBoot.staff.can.manage_program && !staffBoot.staff.can.manage_rewards, 'Staff permission fixture has real read-only programme and reward rights')
  for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
    await resetCounters()
    await staff.page.setViewportSize({ width, height: 1000 })
    await staff.page.evaluate(theme => localStorage.setItem('loyalty:look', JSON.stringify({ theme, rail: 'full' })), theme)
    for (const [name, heading] of [['earning', 'How it works'], ['perk', 'Perk details'], ['offer', 'Offer details'], ['reward', 'Reward details']]) {
      await go(staff.page, urls[name])
      const { detail, info } = await openInfo(staff.page, heading, `staff ${theme} ${width} ${name}`)
      check(await detail.getByRole('button', { name: /^Edit/ }).count() === 0 && await detail.getByRole('link', { name: 'Edit', exact: true }).count() === 0 && await info.getByRole('button').count() === 0, `staff ${theme} ${width} ${name} reads details without management actions`)
      await screenshot(staff.page, `staff-${name}-${theme}-${width}`)
    }
    await go(staff.page, urls.boost)
    await staff.page.locator('#management-detail').waitFor()
    check(await staff.page.locator('#management-detail').getByRole('button', { name: 'Remove', exact: true }).count() === 0, `staff ${theme} ${width} has no boost removal action`)
  }
  const refused = await api(staff, `rewards/${reward.id}/state`, 'PUT', { is_active: false }, true)
  check(refused.status === 403 && (await api(manager, 'rewards')).body.rewards.find(r => r.id === reward.id).is_active, 'The server still refuses read-only staff reward changes')
  check(report.errors.length === 0, 'Open details browser matrix has no runtime errors')
  report.phase = 'complete'
} catch (error) {
  report.error = scrub(error.stack || error)
  await activePage?.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {})
  process.exitCode = 1
  console.error(report.error)
} finally {
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2))
  for (const s of sessions) await s.ctx.close()
  await browser.close()
  console.log(JSON.stringify({ phase: report.phase, checks: report.checks.length, runtimeErrors: report.errors.length }))
}
