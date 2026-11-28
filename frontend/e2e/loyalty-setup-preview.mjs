import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5820'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)
  || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_HOST !== '127.0.0.1'
  || process.env.DB_PORT !== '55459' || process.env.MAIL_MAILER !== 'log') throw Error('Isolated local rehearsal required')
await promisify(execFile)(process.env.PHP, [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), 'cache:clear', '--no-interaction'], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, windowsHide: true, timeout: 60000,
})
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const output = path.resolve(process.env.LAUNCH_OUTPUT, '../setup-preview')
await fs.mkdir(output, { recursive: true })
const result = { checks: [], errors: [], writes: [] }
const check = (ok, text) => { if (!ok) throw Error(text); result.checks.push(text); console.log('PASS ' + text) }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let page
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
  await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('admin_lang')) localStorage.setItem('admin_lang', 'en')
    if (!localStorage.getItem('loyalty:look')) localStorage.setItem('loyalty:look', JSON.stringify({ theme: 'dark', rail: 'full' }))
  })
  page = await ctx.newPage()
  page.on('pageerror', error => result.errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  page.on('request', request => {
    if (request.url().includes('/admin/loyalty/options') && !['GET', 'HEAD'].includes(request.method())) result.writes.push(request.method())
  })
  await page.goto(base + '/loyalty/login')
  await page.getByLabel('Email', { exact: true }).fill(fixture.roles.manager.email)
  await page.getByLabel('Password', { exact: true }).fill(fixture.roles.manager.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(url => !url.pathname.endsWith('/login'))
  const token = await page.evaluate(() => localStorage.getItem('auth_token'))
  const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token }
  const read = async () => {
    const response = await ctx.request.get(base + '/api/v1/admin/loyalty/options?brand_id=all', { headers })
    if (!response.ok()) throw Error('Options read failed')
    return response.json()
  }
  const before = await read()
  await page.goto(base + '/loyalty/options/setup')
  await page.locator('[data-setup-preview]').waitFor()
  const outcomes = new Set()
  for (const preset of before.presets) {
    if (!/^[a-z0-9_]+$/.test(preset.key)) throw Error('Unexpected preset key')
    await page.locator(`[data-choice="${preset.key}"]`).click()
    await page.locator(`[data-preview-template="${preset.key}"]`).waitFor()
    outcomes.add(await page.locator('[data-preview-group=earn]').innerText())
    check(await page.locator('[data-preview-group=membership]').getAttribute('data-catalogue') === (before.catalogue.tiers > 0 ? 'preserved' : 'suggested'), preset.key + ': catalogue preview respects existing membership')
  }
  check(outcomes.size > 1, 'Industries show different live earning recommendations')
  const noNestedScroll = () => page.locator('[data-setup-preview]').evaluate(el => [el, ...el.querySelectorAll('*')].filter(node => node instanceof HTMLElement).every(node => {
    const style = getComputedStyle(node)
    return !['auto', 'scroll'].includes(style.overflowY) || node.scrollHeight <= node.clientHeight + 1
  }))
  check(await noNestedScroll(), 'Every preview section expands without a nested scrollbar')
  check(await page.locator('[data-setup-preview] details').count() === 0, 'Preview has no collapsed content')
  check(await page.locator('[data-preview-group]').count() >= 4, 'Membership, earning, bonuses and rules are distinct sections')
  check(await page.locator('[data-member-journey] li').count() === 3, 'Member journey is visible in three simple stages')
  const colours = await page.locator('.l-gs-presets label > .l-hue-tile').evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).color))])
  check(colours.length >= 3, 'Industry icons use distinct accessible colour families')
  await page.screenshot({ path: path.join(output, 'business-desktop.png'), fullPage: true })

  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.locator('[data-tick=welcome_bonus]').click()
  const checked = await page.locator('[data-tick=welcome_bonus]').getAttribute('data-checked') !== null
  const activeBonus = page.locator('[data-preview-group=bonus] .l-gs-preview-rules')
  check((await activeBonus.innerText()).includes('Welcome bonus') === checked, 'Choosing a bonus immediately updates the explanation')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const rate = page.locator('[data-configure=earn_rate] input').first()
  await rate.fill('7')
  check((await page.locator('[data-preview-group=earn]').innerText()).includes('7 points'), 'Changing the earn rate updates the member outcome')
  await page.screenshot({ path: path.join(output, 'configure-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  check(await page.locator('[data-setup-preview]').count() === 0, 'Review uses one complete summary without a duplicate sidebar')
  check(await page.getByRole('button', { name: 'Apply', exact: true }).count() === 1, 'Saving remains an explicit Apply action')
  check((await page.locator('form').innerText()).includes('7 points'), 'Review retains the edited draft')
  check(result.writes.length === 0, 'Exploring industries and preview settings never saves automatically')
  check(JSON.stringify((await read()).options) === JSON.stringify(before.options), 'Server settings remain unchanged before Apply')

  for (const locale of ['en', 'ru', 'de', 'fr', 'es']) for (const theme of ['dark', 'light']) {
    const words = JSON.parse(await fs.readFile(new URL('../src/loyalty/i18n/options.' + locale + '.json', import.meta.url), 'utf8'))
    await page.evaluate(({ locale, theme }) => {
      localStorage.setItem('admin_lang', locale)
      localStorage.setItem('loyalty:look', JSON.stringify({ theme, rail: 'full' }))
    }, { locale, theme })
    await page.setViewportSize({ width: 1440, height: 1050 })
    await page.goto(base + '/loyalty/options/setup')
    await page.locator('[data-setup-preview]').waitFor()
    check(await page.locator('[data-setup-preview]').getByRole('heading', { name: words.preview.title, exact: true }).count() === 1, locale + '/' + theme + ': actual translated heading')
    check(await page.locator('[data-loyalty]').getAttribute('data-theme') === theme, locale + '/' + theme + ': actual theme applied')
    check(!(await page.locator('[data-setup-preview]').innerText()).includes('loyalty.'), locale + '/' + theme + ': translated preview copy')
    check(await noNestedScroll(), locale + '/' + theme + ': desktop preview fully expanded')
    await page.setViewportSize({ width: 390, height: 844 })
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), locale + '/' + theme + ': mobile has no horizontal overflow')
    check(await noNestedScroll(), locale + '/' + theme + ': mobile preview fully expanded')
    if (locale === 'en' || locale === 'de') await page.screenshot({ path: path.join(output, 'mobile-' + locale + '-' + theme + '.png'), fullPage: true })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const first = before.presets[0].key
  await page.locator(`[data-choice="${first}"]`).click()
  check(await page.locator('[data-preview-template]').evaluate(el => el.getAnimations().length === 0), 'Reduced-motion preference disables preview animation')
  check(result.errors.length === 0, 'No browser runtime errors')
} catch (error) {
  result.failure = String(error.message).split('\n')[0]
  throw Error(result.failure)
} finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
  await browser.close()
}
