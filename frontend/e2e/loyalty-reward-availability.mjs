import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5819'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_PORT !== '55459' || process.env.MAIL_MAILER !== 'log') throw Error('Isolated launch environment required')
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const out = path.resolve(process.env.LAUNCH_OUTPUT, '../reward-availability')
await fs.mkdir(out, { recursive: true })
const report = { checks: [], errors: [], phase: 'start', localOnly: true }
const check = (ok, name) => { if (!ok) throw Error(name); report.checks.push(name); console.log('PASS ' + name) }
const exec = promisify(execFile)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
await ctx.addInitScript(() => { if (location.protocol === 'http:' || location.protocol === 'https:') localStorage.setItem('admin_lang', 'en') })
const page = await ctx.newPage()
page.on('pageerror', e => report.errors.push(e.message))
let token
async function api(endpoint, method = 'GET', data) {
  const response = await ctx.request.fetch(`${base}/api/v1/admin/loyalty/${endpoint}?brand_id=all`, { method, data, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } })
  return { status: response.status(), body: await response.json() }
}
try {
  await exec(process.env.PHP, [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), 'cache:clear', '--no-interaction'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, windowsHide: true, timeout: 60000 })
  await page.goto(base + '/loyalty/login')
  await page.evaluate(() => localStorage.setItem('admin_lang', 'en'))
  await page.getByLabel('Email', { exact: true }).fill(fixture.roles.manager.email)
  await page.getByLabel('Password', { exact: true }).fill(fixture.roles.manager.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(url => !url.pathname.endsWith('/login'))
  token = await page.evaluate(() => localStorage.getItem('auth_token'))
  const current = (await api('options')).body.options
  const catalogue = (await api('rewards')).body.rewards
  const exhausted = catalogue.find(r => r.is_active && r.stock === 0)
  check(!!exhausted, 'The real catalogue retains an exhausted reward for availability checks')
  const invalid = await api('options', 'PUT', { options: { stamps_enabled: true, stamp_reward_kind: 'reward', stamp_reward_id: exhausted.id } })
  check(invalid.status === 422 && (await api('options')).body.options.stamp_reward_id === current.stamp_reward_id, 'The real options API refuses an exhausted stamp reward without changing the saved selection')
  for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(theme => localStorage.setItem('loyalty:look', JSON.stringify({ theme, rail: 'full' })), theme)
    await page.goto(base + '/loyalty/options?tab=earn&way=stamp_card')
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    const select = dialog.locator('[data-field="stamp_reward_id"] select')
    const unavailable = select.locator(`option[value="${exhausted.id}"]`)
    const observed = await unavailable.evaluate(option => ({ disabled: option.disabled, text: option.textContent, markup: option.outerHTML }))
    check(observed.disabled && observed.text.includes('Unavailable'), `${theme} ${width} labels and disables exhausted stamp reward choices (${JSON.stringify(observed)})`)
    check(await select.inputValue() === String(current.stamp_reward_id), `${theme} ${width} retains the obtainable selected stamp reward`)
    await page.screenshot({ path: path.join(out, `stamp-reward-${theme}-${width}.png`), fullPage: true })
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme} ${width} stamp editor fits viewport`)
  }
  check(report.errors.length === 0, 'Final stamp reward availability checks have no browser runtime errors')
  report.phase = 'complete'
} catch (error) {
  report.error = Object.values(fixture.roles).reduce((s, r) => s.replaceAll(r.password, '[redacted]'), String(error.stack || error)).replaceAll(token || '[no token]', '[redacted]')
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {})
  process.exitCode = 1
  console.error(report.error)
} finally {
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2))
  await browser.close()
  console.log(JSON.stringify({ phase: report.phase, checks: report.checks.length, runtimeErrors: report.errors.length }))
}
