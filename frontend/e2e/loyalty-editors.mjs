import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5819'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_PORT !== '55459' || process.env.MAIL_MAILER !== 'log') throw Error('Isolated launch environment required')
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const out = path.resolve(process.env.LAUNCH_OUTPUT, '../editors'), report = { checks: [], errors: [], phase: 'start', localOnly: true }
await fs.mkdir(out, { recursive: true })
const check = (ok, name) => { if (!ok) throw Error(name); report.checks.push(name); console.log('PASS ' + name) }
const exec = promisify(execFile)
const reset = () => exec(process.env.PHP, [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), 'cache:clear', '--no-interaction'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, windowsHide: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
await ctx.addInitScript(() => { if (!localStorage.getItem('admin_lang')) localStorage.setItem('admin_lang', 'en'); if (!localStorage.getItem('loyalty:look')) localStorage.setItem('loyalty:look', JSON.stringify({ theme: 'dark', rail: 'full' })) })
const page = await ctx.newPage()
page.on('pageerror', e => report.errors.push(e.message))
page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss())
let token
async function call(endpoint, method = 'GET', data) {
  const response = await ctx.request.fetch(`${base}/api/v1/admin/loyalty/${endpoint}?brand_id=all`, { method, data, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } })
  if (!response.ok()) throw Error(`Local ${method} ${endpoint}: ${response.status()}`)
  return response.json()
}
async function go(url) { await page.goto(base + url); await page.locator('main h1').waitFor(); await page.waitForFunction(() => !document.querySelector('main .animate-pulse')); await page.evaluate(() => document.fonts.ready) }
const popup = () => page.locator('dialog.l-editor-dialog[open]').last()
async function submit() { await popup().locator('.l-editor-footer button[type="submit"]').click() }
async function closed() { await page.locator('dialog.l-editor-dialog[open]').waitFor({ state: 'detached' }) }
async function savedOptions() { await popup().getByText('Saved. Your program settings are up to date.', { exact: true }).waitFor() }

try {
  await reset()
  await page.goto(base + '/loyalty/login')
  await page.getByLabel('Email', { exact: true }).fill(fixture.roles.manager.email)
  await page.getByLabel('Password', { exact: true }).fill(fixture.roles.manager.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(u => !u.pathname.endsWith('/login'))
  token = await page.evaluate(() => localStorage.getItem('auth_token'))
  const program = await call('program'), boot = await call('bootstrap')
  const tier = program.tiers.filter(t => t.is_active && t.benefits.length).at(-1)
  const perk = program.benefits.find(b => tier.benefits.some(tb => tb.benefit_id === b.id))
  if (!tier || !perk) throw Error('Run loyalty-admin-ux.mjs first to create real assignment fixtures')
  const cases = [
    ['add-level', '/loyalty/program?tab=tiers&tier=new', null, true],
    ['edit-level', `/loyalty/program?tab=tiers&tier=${tier.id}`, null, true],
    ['qualification', '/loyalty/program?tab=tiers&settings=qualification', null, false],
    ['add-place', '/loyalty/program?tab=places', /Add (a )?place/, false],
    ['choose-rule', '/loyalty/options?tab=earn', /Add an earning rule/, false],
    ['purchase', '/loyalty/options?tab=earn&way=earn_rate', null, true],
    ['points', '/loyalty/options?tab=earn&settings=points', null, false],
    ['welcome', '/loyalty/options?tab=bonus&way=welcome_bonus', null, false],
    ['referral', '/loyalty/options?tab=bonus&way=referrals', null, false],
    ['boost', '/loyalty/options?tab=bonus&boost=new', null, true],
    ['reward', '/loyalty/rewards?reward=new', null, true],
    ['perk', '/loyalty/rewards?tab=benefits', /Add benefit/, false],
    ['assignment', `/loyalty/rewards?tab=benefits&selected=${perk.id}`, /Manage assignment/, true],
    ['offer', '/loyalty/rewards?tab=offers&offer=new', null, true],
  ]
  async function open(test) { await go(test[1]); if (test[2]) await page.getByRole('button', { name: test[2] }).click(); await popup().waitFor(); await page.evaluate(() => document.fonts.ready) }
  const probe = process.env.EDITORS_PROBE === '1', followup = process.env.EDITORS_FOLLOWUP === '1'
  const layouts = probe ? [cases[0], cases[5], cases[10], cases[13]] : followup ? [cases[5], cases[7], cases[10], cases[13]] : cases
  report.phase = 'layouts'
  for (const theme of probe ? ['dark'] : ['dark', 'light']) for (const width of probe ? [1440] : followup ? [768, 390] : [1440, 390]) {
    await reset()
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(theme => localStorage.setItem('loyalty:look', JSON.stringify({ theme, rail: 'full' })), theme)
    for (const test of layouts) {
      await open(test)
      const geometry = await popup().evaluate((dialog, wide) => {
        const r = dialog.getBoundingClientRect(), footer = dialog.querySelector('.l-editor-footer').getBoundingClientRect(), body = dialog.querySelector('.l-editor-body')
        const images = [...dialog.querySelectorAll('img')]
        const art = images.every(img => img.complete && img.naturalWidth > 0 && Math.abs(img.getBoundingClientRect().width / img.getBoundingClientRect().height - img.naturalWidth / img.naturalHeight) < .03)
        const focus = dialog.contains(document.activeElement)
        const background = document.querySelector('main h1')
        return { modal: dialog.matches(':modal'), focus, fits: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && body.scrollWidth <= body.clientWidth + 1, footer: footer.bottom <= r.bottom + 1 && footer.top >= r.top, art, width: innerWidth < 760 || Math.abs(r.width - (wide ? 984 : 558)) < 2, background: !!background && getComputedStyle(background).display !== 'none' }
      }, test[3])
      check(Object.values(geometry).every(Boolean), `${test[0]}: native popup, focus, catalogue, artwork and fixed footer at ${width}px in ${theme}`)
      if (theme === 'dark' || ['purchase', 'reward', 'offer', 'add-place'].includes(test[0])) await page.screenshot({ path: path.join(out, `${test[0]}-${theme}-${width}.png`), fullPage: false })
    }
  }
  if (!probe && !followup) {
  report.phase = 'draft-and-keyboard'
  await reset(); await page.setViewportSize({ width: 1440, height: 900 })
  await open(cases[0])
  const name = popup().getByLabel('Level name', { exact: true })
  await name.fill('Retained editor draft')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').last().getByRole('button', { name: 'Keep editing', exact: true }).click()
  check(await name.inputValue() === 'Retained editor draft', 'Escape and Keep editing preserve the changed level draft')
  await page.keyboard.press('Tab')
  check(await popup().evaluate(el => el.contains(document.activeElement)), 'Keyboard focus stays in the popup')
  await popup().getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Discard changes', exact: true }).click()
  await closed()
  check(await page.locator('main h1').innerText() === 'Levels & tiers', 'Discard returns to the level catalogue')

  report.phase = 'canonical-saves'
  const run = Date.now().toString(36), day = boot.venue.today, later = new Date(Date.parse(day + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10)
  await open(cases[0]); await submit()
  check(await popup().locator('[aria-invalid="true"]').count() > 0, 'Empty level shows field validation inside the popup')
  await popup().getByLabel('Level name', { exact: true }).fill('Editor level ' + run)
  await submit(); await closed()
  check((await call('program')).tiers.some(t => t.name === 'Editor level ' + run), 'Add level uses the canonical tier writer')
  await open(cases[3]); await popup().getByLabel('Name', { exact: true }).fill('Editor place ' + run); await submit(); await closed()
  check((await call('places')).places.some(p => p.name === 'Editor place ' + run), 'Add place saves real member access rules')
  await open(cases[5]); const rate = popup().locator('[data-field="points_per_currency"] input'); await rate.fill('3.25'); await submit(); await savedOptions()
  check((await call('options')).options.points_per_currency === 3.25, 'Purchase popup saves the shared purchase rate')
  await open(cases[6]); await popup().getByLabel('Points expiry', { exact: true }).selectOption('12'); await submit(); await savedOptions()
  check((await call('options')).options.points_expiry_months === 12, 'Points popup saves expiry through existing options')
  for (const [index, values] of [[7, { welcome_bonus_points: '111' }], [8, { referrer_bonus_points: '251', referee_bonus_points: '151' }]]) {
    await open(cases[index]); const enabled = popup().getByRole('switch'); if (await enabled.getAttribute('aria-checked') !== 'true') await enabled.click()
    for (const [field, value] of Object.entries(values)) await popup().locator(`[data-field="${field}"] input`).fill(value)
    await submit(); await savedOptions(); const actual = (await call('options')).options
    check(Object.entries(values).every(([key, value]) => actual[key] === Number(value)), `${cases[index][0]} popup saves the canonical bonus values`)
  }
  await open(cases[9]); await popup().getByLabel('Name', { exact: true }).fill('Editor boost ' + run)
  await popup().getByLabel('Starts', { exact: true }).fill(day + 'T09:00'); await popup().getByLabel('Ends', { exact: true }).fill(later + 'T18:00'); await submit(); await closed()
  check((await call('program')).boosts.some(b => b.name === 'Editor boost ' + run), 'Boost popup keeps venue wall times and the existing writer')
  await open(cases[10]); await popup().getByLabel('Reward name', { exact: true }).fill('Editor reward ' + run); await popup().getByLabel('Points per claim', { exact: true }).fill('550'); await submit(); await closed()
  check((await call('rewards')).rewards.some(r => r.name === 'Editor reward ' + run && r.points_cost === 550), 'Reward popup saves cost and availability through the reward writer')
  await open(cases[11]); await popup().getByLabel('Name', { exact: true }).fill('Editor perk ' + run); await popup().getByLabel('Code', { exact: true }).fill('ED_' + run.toUpperCase()); await popup().getByLabel('Category', { exact: true }).selectOption('other'); await popup().getByLabel('How it is given', { exact: true }).selectOption('on_request'); await submit(); await closed()
  check((await call('program')).benefits.some(b => b.name === 'Editor perk ' + run), 'Perk popup saves the catalogue definition')
  await open(cases[13]); await popup().getByLabel('Offer name', { exact: true }).fill('Editor offer ' + run); await popup().getByLabel('Kind', { exact: true }).selectOption('discount'); await popup().getByLabel('Description', { exact: true }).fill('Eligible member offer during this schedule.'); await popup().getByLabel('Value', { exact: true }).fill('15'); await popup().getByLabel('Starts', { exact: true }).fill(day); await popup().getByLabel('Ends', { exact: true }).fill(later); await submit(); await closed()
  check((await call('offers')).offers.some(o => o.title === 'Editor offer ' + run), 'Offer popup saves dates, value and eligibility through the offer writer')
  check(report.errors.length === 0, 'Editor journeys have no browser runtime errors')
  }
  if (followup) {
    report.phase = 'nested-drafts'
    await reset(); await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => localStorage.setItem('admin_lang', 'en'))
    await open(cases[1]); const parentName = popup().getByLabel('Level name', { exact: true }); await parentName.fill('Kept parent draft')
    await popup().getByText('Included benefits', { exact: true }).first().click()
    await popup().getByRole('button', { name: 'Edit', exact: true }).first().click()
    await popup().getByLabel('Discount', { exact: true }).fill('17')
    await popup().getByRole('button', { name: 'Take it off', exact: true }).click()
    await page.getByRole('dialog').last().getByRole('button', { name: 'Keep it', exact: true }).click()
    check(await popup().getByLabel('Discount', { exact: true }).inputValue() === '17', 'Keep removal restores the unsaved assignment draft above its parent popup')
    await popup().getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('dialog').last().getByRole('button', { name: 'Discard changes', exact: true }).click()
    check(await popup().getByLabel('Level name', { exact: true }).inputValue() === 'Kept parent draft', 'Closing a child assignment preserves the parent level draft')
    await popup().getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('dialog').last().getByRole('button', { name: 'Discard changes', exact: true }).click(); await closed()
    check(await page.evaluate(() => document.body.style.overflow !== 'hidden'), 'Closing nested drafts restores page scrolling')
    report.phase = 'remaining-saves'
    await open(cases[2]); const measure = popup().getByRole('button', { name: 'Visits', exact: true }); await measure.click(); await submit(); await savedOptions()
    check((await call('options')).options.tier_progress_by === 'visits', 'Qualification popup saves only the server-supported measure')
    await open(cases[12]); await popup().getByLabel('Discount', { exact: true }).fill('18'); await submit(); await closed()
    check((await call('program')).tiers.find(t => t.id === tier.id).benefits.some(tb => tb.benefit_id === perk.id && Number(tb.value_amount) === 18), 'Assignment popup saves the selected tier?s own typed value')
    await open(cases[13]); await popup().getByLabel('Offer name', { exact: true }).fill('Editor offer follow-up ' + Date.now()); await popup().getByLabel('Value', { exact: true }).fill('15'); await submit()
    check(await popup().getByLabel('Description', { exact: true }).evaluate(el => el === document.activeElement && el.getBoundingClientRect().bottom < document.querySelector('.l-editor-footer').getBoundingClientRect().top), 'Invalid offer submission focuses its required visible description')
    await popup().getByLabel('Description', { exact: true }).fill('Eligible member offer with clear conditions.'); await submit(); await closed()
    check((await call('offers')).offers.some(o => o.title.startsWith('Editor offer follow-up')), 'Offer popup saves the canonical offer including its required description')
    report.phase = 'translated-editors'
    await page.setViewportSize({ width: 390, height: 900 })
    for (const lang of ['ru', 'de', 'fr', 'es']) {
      await reset(); await page.evaluate(lang => localStorage.setItem('admin_lang', lang), lang)
      const words = JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/editors.${lang}.json`, import.meta.url), 'utf8'))
      for (const test of [cases[5], cases[8], cases[13]]) {
        await open(test)
        const geometry = await popup().evaluate(el => { const r = el.getBoundingClientRect(), header = el.querySelector('.l-ov-dialog-heading').getBoundingClientRect(), eyebrow = el.querySelector('.l-editor-heading > span:last-child').getBoundingClientRect(), body = el.querySelector('.l-editor-body'); return r.left >= 0 && r.right <= innerWidth + 1 && eyebrow.top >= header.top && body.scrollWidth <= body.clientWidth + 1 })
        check(geometry && (await popup().innerText()).includes(words.memberPreview), `${lang} ${test[0]}: translated controls and unclipped mobile header`)
      }
    }
    check(report.errors.length === 0, 'Final editor checks have no browser runtime errors')
  }
  report.phase = 'complete'
} catch (error) {
  report.error = String(error.stack || error)
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {})
  process.exitCode = 1; console.error(report.error)
} finally {
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2))
  await browser.close(); console.log(JSON.stringify({ phase: report.phase, checks: report.checks.length, runtimeErrors: report.errors.length }))
}
