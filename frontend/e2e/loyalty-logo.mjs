import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5820'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)
  || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_PORT !== '55459'
  || process.env.DB_HOST !== '127.0.0.1' || process.env.QUEUE_CONNECTION !== 'database'
  || process.env.MAIL_MAILER !== 'log') throw Error('Isolated loopback rehearsal required')
await promisify(execFile)(process.env.PHP, [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), 'cache:clear', '--no-interaction'], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, windowsHide: true, timeout: 60000,
})
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const output = path.resolve(process.env.LAUNCH_OUTPUT, '../logo')
await fs.mkdir(output, { recursive: true })
const logoFile = path.join(output, 'fixture-logo.png')
await promisify(execFile)(process.env.PHP, ['-r', '$im=imagecreatetruecolor(160,80); imagefill($im,0,0,imagecolorallocate($im,35,55,85)); imagestring($im,5,20,30,"TEST LOGO",imagecolorallocate($im,255,255,255)); imagepng($im,$argv[1]);', logoFile], { windowsHide: true, timeout: 10000 })
const result = { checks: [], errors: [] }
const check = (value, label) => { if (!value) throw Error(label); result.checks.push(label); console.log('PASS ' + label) }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  await ctx.addInitScript(() => {
    localStorage.setItem('admin_lang', 'en')
    localStorage.setItem('loyalty:look', JSON.stringify({ theme: 'dark', rail: 'full' }))
  })
  const page = await ctx.newPage()
  page.on('pageerror', error => result.errors.push(error.message))
  await page.goto(base + '/loyalty/login')
  await page.getByLabel('Email', { exact: true }).fill(fixture.roles.manager.email)
  await page.getByLabel('Password', { exact: true }).fill(fixture.roles.manager.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(url => !url.pathname.endsWith('/login'))
  const token = await page.evaluate(() => localStorage.getItem('auth_token'))
  const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token }
  const read = async endpoint => {
    const response = await ctx.request.get(base + '/api/v1/admin/loyalty/' + endpoint + '?brand_id=all', { headers })
    check(response.ok(), 'Read ' + endpoint)
    return response.json()
  }

  // Enter through the same checklist link as the blocked setup journey.
  await page.goto(base + '/loyalty/start')
  await page.locator('[data-step=logo] a').click()
  const panel = page.locator('[data-logo-editor]')
  await panel.waitFor()
  check(await panel.getByRole('button', { name: /^(Upload|Replace) logo$/ }).count() === 1, 'Setup opens a usable logo uploader')
  check(await page.getByText('Member app designer', { exact: true }).count() === 1, 'App designer stays on hold beside the working logo control')
  const before = await read('app-look')
  await panel.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('Not an image') })
  await panel.getByRole('alert').waitFor()
  check((await read('app-look')).look.logo_url === before.look.logo_url, 'Invalid upload leaves the saved logo unchanged')
  const saved = page.waitForResponse(response => response.url().includes('/app-look/logo') && response.request().method() === 'POST')
  await panel.locator('input[type=file]').setInputFiles(logoFile)
  const upload = await saved
  check(upload.ok(), 'Logo upload persists through the real multipart API')
  const { logo_url } = await upload.json()
  await panel.getByText('Logo saved. Your setup checklist has been updated.').waitFor()
  const logo = panel.getByRole('img', { name: 'The venue’s logo' })
  await logo.waitFor()
  check(await logo.getAttribute('src') === logo_url, 'Preview shows the saved logo immediately')
  const imageResponse = await ctx.request.get(new URL(logo_url, base).href)
  result.imageResponse = { status: imageResponse.status(), type: imageResponse.headers()['content-type'] || null }
  check(imageResponse.ok() && imageResponse.headers()['content-type']?.startsWith('image/'), 'Saved logo is served as an image')
  await logo.evaluate(image => image.decode())
  check(await logo.evaluate(image => image.naturalWidth === 160), 'Browser decodes the uploaded logo')
  check((await read('app-look')).look.logo_url === logo_url, 'Saved branding uses the canonical logo setting')
  check((await read('start')).steps.find(step => step.key === 'logo')?.done === true, 'Server marks the logo setup step complete')
  await page.screenshot({ path: path.join(output, 'logo-desktop.png') })
  await panel.getByRole('link', { name: /Back to setup/ }).click()
  await page.locator('[data-step=logo][data-done]').waitFor()
  check(true, 'Returning to setup displays Done without a browser reload')
  await page.goto(base + '/loyalty/overview')
  const checklist = page.locator('.l-setup-checklist')
  if (await checklist.count()) check(await checklist.locator('li[data-done] a[href="/loyalty/app?tab=app"]').count() === 1, 'Overview refreshes its logo setup status')

  // Saved branding remains accessible from the main Card & app page on mobile.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(base + '/loyalty/app')
  await page.locator('[data-logo-editor] img').waitFor()
  await page.locator('[data-logo-editor] img').evaluate(image => image.decode())
  check(await page.locator('[data-logo-editor] img').getAttribute('src') === logo_url, 'Logo persists on the mobile Card & app page')
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile logo page has no horizontal overflow')
  await page.screenshot({ path: path.join(output, 'logo-mobile.png') })
  check(result.errors.length === 0, 'No browser runtime errors')
} catch (error) {
  result.failure = String(error.message).split('\n')[0]
  throw Error(result.failure)
} finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
  await browser.close()
}
