import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5819'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_PORT !== '55459' || process.env.DB_HOST !== '127.0.0.1' || process.env.MAIL_MAILER !== 'log') throw Error('Isolated launch environment required')
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const out = path.resolve(process.env.LAUNCH_OUTPUT, '../activation-claim')
await fs.mkdir(out, { recursive: true })
const report = { checks: [], errors: [], phase: 'start', localOnly: true, route: '/portal/claim' }
const secrets = Object.values(fixture.roles).map(r => r.password)
const scrub = value => secrets.reduce((s, secret) => s.replaceAll(secret, '[redacted]'), String(value))
const check = (ok, name) => { if (!ok) throw Error(name); report.checks.push(name); console.log('PASS ' + name) }
const exec = promisify(execFile)
const artisan = args => exec(process.env.PHP, [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), ...args], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, windowsHide: true, timeout: 60000 })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const contexts = []
async function context(width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } })
  contexts.push(ctx)
  await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  await ctx.addInitScript(() => { if (location.protocol === 'http:' || location.protocol === 'https:') localStorage.setItem('admin_lang', 'en') })
  ctx.on('page', page => page.on('pageerror', error => report.errors.push(scrub(error.message))))
  return ctx
}
let page
try {
  await artisan(['cache:clear', '--no-interaction'])
  const staff = await context(1440)
  const login = await staff.request.post(base + '/api/v1/auth/login', { data: fixture.roles.manager, headers: { Accept: 'application/json' } })
  const manager = await login.json()
  check(login.ok() && !!manager.token, 'Disposable manager authenticates against the real local API')
  secrets.push(manager.token)
  const run = randomBytes(8).toString('hex'), email = `claim.${run}@example.test`, password = randomBytes(24).toString('base64url')
  secrets.push(password)
  const created = await staff.request.post(base + '/api/v1/admin/loyalty/members?brand_id=all', { data: { name: 'Local activation member', email, send_welcome: false }, headers: { Accept: 'application/json', Authorization: 'Bearer ' + manager.token } })
  const enrollment = await created.json()
  check(created.status() === 201 && !!enrollment.member.id && enrollment.email_sent === false, 'Staff creates one disposable member without sending an invitation')
  const capturePath = path.join(process.env.LARAVEL_STORAGE_PATH, 'logs', 'laravel.log')
  const previousCapture = await fs.readFile(capturePath, 'utf8').catch(() => '')
  const phone = await context()
  page = await phone.newPage()
  report.phase = 'request activation code'
  await page.goto(base + '/portal/claim')
  await page.getByLabel(/^Your email/).fill(email)
  const sent = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/send-code' && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Send me a code', exact: true }).click()
  const sentResponse = await sent
  check(sentResponse.ok() && sentResponse.request().postDataJSON().purpose === 'claim', 'Hosted activation requests an account claim code')
  await page.getByLabel('6-digit code', { exact: true }).waitFor()
  await artisan(['queue:work', '--stop-when-empty', '--tries=1', '--timeout=45', '--max-time=55', '--no-interaction'])
  const captured = (await fs.readFile(capturePath, 'utf8')).slice(previousCapture.length).replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  const code = captured.match(/class="code">\s*(\d{6})\s*<\/div>/)?.[1]
  check(!!code, 'The activation email reaches the isolated log mailer through the database queue')
  secrets.push(code)
  const accountQuery = await exec('C:/Program Files/PostgreSQL/18/bin/psql.exe', ['-h', '127.0.0.1', '-p', '55459', '-U', 'loyalty_launch_owner', '-d', 'loyalty_launch_demo', '-t', '-A', '-c', `SELECT u.id || ',' || lm.id FROM users u JOIN loyalty_members lm ON lm.user_id=u.id WHERE u.email='${email}';`], { windowsHide: true, timeout: 10000 })
  const [userId, memberId] = accountQuery.stdout.trim().split(',').map(Number)
  check(memberId === enrollment.member.id && Number.isInteger(userId), 'The invitation is bound to the staff-created account and membership')
  await page.getByLabel(/^Choose a password/).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByLabel('6-digit code', { exact: true }).fill(code === '000000' ? '111111' : '000000')
  report.phase = 'wrong activation code'
  const wrong = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/claim' && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
  check((await wrong).status() === 422, 'An incorrect activation code is refused without authenticating')
  await page.getByRole('alert').waitFor()
  check((await page.getByRole('alert').innerText()).includes('Invalid or expired code'), 'The activation form explains the incorrect code and keeps setup available')
  await page.getByLabel('6-digit code', { exact: true }).fill('')
  await page.screenshot({ path: path.join(out, 'claim-wrong-code-390.png'), fullPage: true })
  await page.getByLabel('6-digit code', { exact: true }).fill(code)
  report.phase = 'complete activation'
  const claimed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/claim' && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
  const claimResponse = await claimed, claim = await claimResponse.json()
  check(claimResponse.ok() && claim.user.id === userId && claim.member.id === memberId && !!claim.token, 'Correct code sets the password and authenticates the same saved account')
  secrets.push(claim.token)
  await page.waitForURL(url => url.pathname === '/portal')
  await page.locator('.p-page-heading h1').waitFor()
  await page.evaluate(() => document.fonts.ready)
  const portalResponse = await phone.request.get(base + '/api/v1/member/portal', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + claim.token } })
  const portal = await portalResponse.json()
  check(portalResponse.ok() && portal.member.member_number === enrollment.member.member_number && portal.venue.name === 'Launch Test Hotel', 'The activated session reaches its original membership and venue')
  await page.screenshot({ path: path.join(out, 'claim-member-home-390.png'), fullPage: true })
  const second = await context()
  const signin = await second.newPage()
  report.phase = 'subsequent sign in'
  await signin.goto(base + '/login')
  await signin.getByLabel('Email', { exact: true }).fill(email)
  await signin.getByLabel('Password', { exact: true }).fill(password)
  const signed = signin.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/login' && r.request().method() === 'POST')
  await signin.getByRole('button', { name: 'Sign in', exact: true }).click()
  const signedResponse = await signed, signedBody = await signedResponse.json()
  check(signedResponse.ok() && signedBody.user.id === userId, 'A new browser session signs in with the chosen password to the same account')
  await signin.waitForURL(url => url.pathname === '/portal')
  await signin.locator('.p-page-heading h1').waitFor()
  await signin.evaluate(() => document.fonts.ready)
  await signin.screenshot({ path: path.join(out, 'claim-returning-member-390.png'), fullPage: true })
  check(report.errors.length === 0, 'Hosted activation journey has no browser runtime errors')
  report.phase = 'complete'
} catch (error) {
  report.error = scrub(error.stack || error)
  // Do not capture the activation form here: it may contain a live code.
  process.exitCode = 1
  console.error(report.error)
} finally {
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2))
  for (const ctx of contexts) await ctx.close()
  await browser.close()
  console.log(JSON.stringify({ phase: report.phase, checks: report.checks.length, runtimeErrors: report.errors.length }))
}
