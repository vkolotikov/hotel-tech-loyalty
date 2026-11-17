import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5819'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_PORT !== '55459' || process.env.MAIL_MAILER !== 'log') throw Error('Isolated launch environment required')
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const out = path.resolve(process.env.LAUNCH_OUTPUT, '../setup-activation')
const report = { checks: [], errors: [], phase: 'start', localOnly: true }
await fs.mkdir(out, { recursive: true })
const scrub = x => Object.values(fixture.roles).reduce((s, r) => s.replaceAll(r.password, '[redacted]'), String(x))
const check = (ok, name) => { if (!ok) throw Error(name); report.checks.push(name); console.log('PASS ' + name) }
const exec = promisify(execFile)
const resetCounters = () => exec(process.env.PHP, [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), 'cache:clear', '--no-interaction'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, windowsHide: true, timeout: 60000 })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
await ctx.addInitScript(() => { if (!localStorage.getItem('admin_lang')) localStorage.setItem('admin_lang', 'en'); if (!localStorage.getItem('loyalty:look')) localStorage.setItem('loyalty:look', JSON.stringify({ theme: 'dark', rail: 'full' })) })
const page = await ctx.newPage()
page.on('pageerror', e => report.errors.push(scrub(e.message)))
page.on('dialog', dialog => dialog.accept())
let token
async function call(endpoint, method = 'GET', data) {
  const response = await ctx.request.fetch(`${base}/api/v1/admin/loyalty/${endpoint}${endpoint.includes('?') ? '&' : '?'}brand_id=all`, { method, data, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } })
  const body = await response.json()
  if (response.status() >= 400) throw Error(`${method} ${endpoint}: ${response.status()} ${body.error || JSON.stringify(body.errors || {})}`)
  return body
}
async function go(url) {
  await page.goto(base + url)
  await page.locator('main h1').waitFor()
  await page.waitForFunction(() => !document.querySelector('main .animate-pulse'))
  await page.evaluate(() => document.fonts.ready)
}
async function image(name) {
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true })
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' fits viewport')
}
const rewardBody = (name, points, extra = {}) => ({ name, points_cost: points, description: 'A saved member reward.', terms: 'Show your code at reception.\nOne reward per visit.', category: 'test', stock: null, per_member_limit: 1, discount_type: null, discount_value: null, applies_to: 'all', expires_at: null, is_active: true, ...extra })
async function choosePreset(key) { await page.locator(`[data-choice="${key}"]`).click(); await page.locator(`[data-preview-template="${key}"]`).waitFor() }
async function templates(answer, tag) {
  await go('/loyalty/program/setup')
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click()
  const hotel = answer.presets.find(p => p.key === 'hotel_classic')
  const restaurant = answer.presets.find(p => p.key === 'restaurant')
  const other = answer.presets.find(p => !p.key.startsWith('hotel') && p.key !== 'restaurant' && p.stamp_rewards?.length)
  for (const preset of [hotel, restaurant, other]) {
    check(!!preset, 'Server supplies requested template')
    await choosePreset(preset.key)
    const suggestions = page.locator(`[data-template-rewards="${preset.key}"]`)
    const text = await suggestions.innerText()
    check(preset.stamp_rewards.every(r => text.includes(r.name)), tag + ' ' + preset.key + ' updates suggested rewards')
    check((await page.locator('[data-catalogue="preserved"]').innerText()).includes(answer.catalogue.rewards[0].name), tag + ' preserves the current hotel catalogue separately')
  }
  await choosePreset(restaurant.key)
  await image('setup-restaurant-' + tag)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.locator('[data-tick="stamp_card"] input').check()
  await page.locator('[data-tick="earn_rate"] input').uncheck()
  check(!(await page.locator('[data-tick="earn_rate"] input').isChecked()), tag + ' lets setup leave purchase points off')
  await image('setup-choose-' + tag)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const stamps = page.locator('[data-configure="stamp_card"]')
  await stamps.locator('[data-field="stamp_reward_kind"] label').filter({ hasText: 'A reward' }).click()
  const dessert = restaurant.stamp_rewards.find(r => r.name === 'Free Dessert')
  const select = stamps.locator('[data-field="stamp_reward_id"] select')
  await select.selectOption(String(-(dessert.index + 1)))
  check(await select.locator('optgroup').count() === 2, tag + ' separates suggested and saved stamp rewards')
  check(await page.locator('[data-configure="earn_rate"]').count() === 0, tag + ' does not require a rate when purchase points are off')
  await image('setup-stamp-reward-' + tag)
  return { dessert, restaurant }
}
try {
  await resetCounters()
  await page.goto(base + '/loyalty/login')
  await page.getByLabel('Email', { exact: true }).fill(fixture.roles.manager.email)
  await page.getByLabel('Password', { exact: true }).fill(fixture.roles.manager.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(u => !u.pathname.endsWith('/login'))
  token = await page.evaluate(() => localStorage.getItem('auth_token'))
  report.phase = 'seed'
  let program = await call('program')
  if (!program.tiers.length) {
    for (const [i, name] of ['Saved Silver', 'Saved Gold'].entries()) await call('program/tiers', 'POST', { name, min_points: i * 1000, min_visits: null, min_spend: null, earn_rate: 1 + i * .5, description: null, color: null, is_active: true })
    program = await call('program')
  }
  const catalogue = await call('rewards')
  for (const [name, cost] of [['Late Checkout', 600], ['Breakfast for Two', 1200]]) if (!catalogue.rewards.some(r => r.name === name)) await call('rewards', 'POST', rewardBody(name, cost))
  const exhausted = (await call('rewards', 'POST', rewardBody('Free Dessert', 200, { stock: 0 }))).reward
  const reward = (await call('rewards', 'POST', rewardBody('Garden breakfast reward', 500, { stock: 7, per_member_limit: 2, expires_at: '2027-12-31T23:59' }))).reward
  await call('options', 'PUT', { options: { spend_points_enabled: true, points_per_currency: 2.25, stamps_enabled: true, stamps_per_card: 5, stamp_reward_kind: 'points', stamp_reward_points: 50, checkin_enabled: true, checkin_points: 20 } })

  report.phase = 'earn toggle'
  await go('/loyalty/options?tab=earn&way=earn_rate')
  let dialog = page.getByRole('dialog')
  const purchase = dialog.getByRole('switch', { name: 'Purchase points', exact: true })
  check(await purchase.getAttribute('aria-checked') === 'true', 'Purchase points starts on')
  await purchase.click()
  check((await dialog.locator('[data-member-preview]').innerText()).includes('0 points'), 'Turning purchase points off immediately shows zero points in preview')
  await image('purchase-points-off-draft-dark-1440')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.getByText('Saved. Your program settings are up to date.', { exact: true }).waitFor()
  let options = (await call('options')).options
  check(options.spend_points_enabled === false && options.points_per_currency === 2.25 && options.stamps_enabled === true && options.checkin_enabled === true, 'Saving purchase points off retains its rate, stamps and check-in')
  await page.reload()
  await page.getByRole('dialog').waitFor()
  check(await page.getByRole('switch', { name: 'Purchase points', exact: true }).getAttribute('aria-checked') === 'false', 'Purchase points stays off after reload')
  check((await page.getByRole('dialog').getByLabel('Points for each €1 spent', { exact: true }).inputValue()) === '2.25', 'Saved purchase rate remains editable after reload')

  report.phase = 'themes and responsive'
  const answer = await call('options')
  for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
    const tag = theme + '-' + width
    await resetCounters()
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(v => localStorage.setItem('loyalty:look', JSON.stringify({ theme: v, rail: 'full' })), theme)
    await go('/loyalty/options?tab=earn&way=earn_rate')
    await page.locator(`[data-loyalty][data-theme="${theme}"]`).first().waitFor()
    check(await page.getByRole('switch', { name: 'Purchase points', exact: true }).getAttribute('aria-checked') === 'false', tag + ' purchase switch reads saved off state')
    await image('purchase-points-off-' + tag)
    await templates(answer, tag)
    await go(`/loyalty/rewards?selected=${reward.id}`)
    const detail = page.locator('#management-detail'), advanced = detail.locator('details.l-rb-advanced')
    check(await detail.locator('details').count() === 1 && await advanced.getAttribute('open') !== null, tag + ' reward has one initially open advanced section')
    check(await detail.getByRole('heading', { name: 'Key conditions', exact: true }).isVisible() && await detail.getByRole('heading', { name: 'Terms & conditions', exact: true }).isVisible(), tag + ' shows key conditions and guest-facing terms')
    await advanced.locator('summary').click()
    check(await detail.locator('.l-rb-key-conditions').isVisible() && !(await detail.locator('.l-rb-terms-view').isVisible()), tag + ' collapsing advanced keeps claim conditions visible')
    await advanced.locator('summary').focus()
    await page.keyboard.press('Enter')
    check(await detail.locator('.l-rb-terms-view').isVisible(), tag + ' keyboard opens advanced settings')
    await image('reward-details-' + tag)
    await go(`/loyalty/rewards?reward=${reward.id}`)
    dialog = page.getByRole('dialog')
    const editorAdvanced = dialog.locator('details.l-rb-advanced-editor')
    await editorAdvanced.locator('summary').click()
    check(await dialog.locator('details').count() === 1 && await dialog.getByLabel('Terms & conditions', { exact: true }).isVisible(), tag + ' editor places terms in its single advanced section')
    await image('reward-editor-' + tag)
  }

  report.phase = 'reward validation and save'
  await page.setViewportSize({ width: 1440, height: 1000 })
  await go(`/loyalty/rewards?reward=${reward.id}`)
  dialog = page.getByRole('dialog')
  let advanced = dialog.locator('details.l-rb-advanced-editor')
  await advanced.locator('summary').click()
  await dialog.getByLabel('Stock', { exact: true }).fill('')
  await advanced.locator('summary').click()
  await dialog.getByRole('button', { name: 'Save reward', exact: true }).click()
  const stock = dialog.getByLabel('Stock', { exact: true })
  await stock.waitFor({ state: 'visible' })
  check(await advanced.getAttribute('open') !== null && await stock.getAttribute('aria-invalid') === 'true' && await stock.evaluate(el => el === document.activeElement), 'An invalid hidden stock field reopens advanced settings and receives focus')
  await image('reward-validation-light-1440')
  await stock.fill('7')
  check(await advanced.getAttribute('open') !== null, 'Correcting validation keeps advanced settings open for continued editing')
  const editedTerms = 'Show your code at reception.\nOne reward per visit. Valid for garden breakfast.'
  await dialog.getByLabel('Terms & conditions', { exact: true }).fill(editedTerms)
  await dialog.getByRole('button', { name: 'Save reward', exact: true }).click()
  await page.getByText('Saved. Your catalogue is up to date.', { exact: true }).waitFor()
  const savedReward = (await call('rewards')).rewards.find(r => r.id === reward.id)
  check(savedReward.terms === editedTerms && savedReward.stock === 7 && savedReward.per_member_limit === 2 && savedReward.category === 'test' && savedReward.points_cost === 500 && savedReward.applies_to === 'all', 'Reward save preserves terms, claim limits, category, cost and scope through the real API')

  report.phase = 'apply selected template reward'
  await resetCounters()
  const beforeTiers = (await call('program')).tiers
  const beforeRewards = (await call('rewards')).rewards
  const { dessert } = await templates(await call('options'), 'apply')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  check((await page.locator('[data-review-way="stamp_card"]').innerText()).includes(dessert.name), 'Review names the selected suggested stamp reward')
  await image('setup-review-light-1440')
  const setupResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/loyalty/options/setup'))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  const applied = await setupResponse, payload = applied.request().postDataJSON(), outcome = await applied.json()
  check(applied.ok(), 'Wizard Apply succeeds with a suggested stamp reward')
  await page.locator('[data-setup-done]').waitFor()
  const afterTiers = (await call('program')).tiers, afterRewards = (await call('rewards')).rewards
  check(JSON.stringify(afterTiers) === JSON.stringify(beforeTiers), 'Applying a template keeps all saved tiers unchanged')
  const additions = afterRewards.filter(r => !beforeRewards.some(old => old.id === r.id))
  check(additions.length === 1 && additions[0].name === dessert.name && additions[0].points_cost === dessert.points_cost, 'Apply creates only the selected suggested reward')
  check(additions[0].stock !== 0 && afterRewards.some(r => r.id === exhausted.id && r.stock === 0), 'An exhausted matching reward is retained while Apply adds an obtainable suggestion')
  options = (await call('options')).options
  check(options.stamp_reward_id === additions[0].id && options.spend_points_enabled === false && options.points_per_currency === 2.25 && outcome.setup.stamp_reward_id === additions[0].id, 'Applied stamp card resolves the saved reward id while preserving the switched-off purchase rate')
  await call('options/setup', 'POST', payload)
  check((await call('rewards')).rewards.length === afterRewards.length, 'Replaying Apply with its original key adds no duplicate reward')

  report.phase = 'languages'
  for (const lang of ['en', 'ru', 'de', 'fr', 'es']) for (const theme of ['dark', 'light']) {
    await resetCounters()
    await page.evaluate(({ lang, theme }) => { localStorage.setItem('admin_lang', lang); localStorage.setItem('loyalty:look', JSON.stringify({ theme, rail: 'full' })) }, { lang, theme })
    await page.setViewportSize({ width: 390, height: 1000 })
    await go(`/loyalty/rewards?selected=${reward.id}`)
    const words = JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/rewarddesign.${lang}.json`, import.meta.url), 'utf8'))
    check(await page.locator('#management-detail').getByRole('heading', { name: words.terms, exact: true }).isVisible(), lang + ' ' + theme + ' translates reward terms')
    await image('reward-localized-' + lang + '-' + theme + '-390')
    await go('/loyalty/program/setup')
    check(!(await page.locator('main').innerText()).includes('loyalty.options.'), lang + ' ' + theme + ' setup has no untranslated keys')
    await image('setup-localized-' + lang + '-' + theme + '-390')
  }
  check(report.errors.length === 0, 'Compiled real-backend browser journeys have no runtime errors')
  report.phase = 'complete'
} catch (error) {
  report.error = scrub(error.stack || error)
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {})
  process.exitCode = 1
  console.error(report.error)
} finally {
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2))
  await browser.close()
  console.log(JSON.stringify({ phase: report.phase, checks: report.checks.length, runtimeErrors: report.errors.length }))
}
