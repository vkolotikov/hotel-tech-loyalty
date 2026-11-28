import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5819'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_PORT !== '55459' || process.env.MAIL_MAILER !== 'log') throw Error('Isolated launch environment required')
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const out = path.resolve(process.env.LAUNCH_OUTPUT, '../layout-polish')
await fs.mkdir(out, { recursive: true })
const report = { checks: [], errors: [] }
const check = (ok, name) => { if (!ok) throw Error(name); report.checks.push(name); console.log('PASS ' + name) }
const exec = promisify(execFile)
const reset = () => exec(process.env.PHP, [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), 'cache:clear', '--no-interaction'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, windowsHide: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
await ctx.addInitScript(() => { if (!localStorage.getItem('admin_lang')) localStorage.setItem('admin_lang', 'en'); if (!localStorage.getItem('loyalty:look')) localStorage.setItem('loyalty:look', JSON.stringify({ theme: 'dark', rail: 'full' })) })
const page = await ctx.newPage()
page.on('pageerror', e => report.errors.push(e.message))
async function go(url) {
  await page.goto(base + url)
  await page.locator('main h1').waitFor()
  await page.waitForFunction(() => !document.querySelector('main .animate-pulse'))
  await page.evaluate(() => document.fonts.ready)
}
try {
  await reset()
  await page.goto(base + '/loyalty/login')
  await page.getByLabel('Email', { exact: true }).fill(fixture.roles.manager.email)
  await page.getByLabel('Password', { exact: true }).fill(fixture.roles.manager.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(u => !u.pathname.endsWith('/login'))
  const screens = { levels: '/loyalty/program?tab=tiers', places: '/loyalty/program?tab=places', earning: '/loyalty/options?tab=earn', bonuses: '/loyalty/options?tab=bonus', rewards: '/loyalty/rewards', perks: '/loyalty/rewards?tab=benefits', offers: '/loyalty/rewards?tab=offers' }
  for (const theme of ['dark', 'light']) for (const width of [1440, 1280, 1024, 768, 390]) {
    await reset()
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(theme => localStorage.setItem('loyalty:look', JSON.stringify({ theme, rail: 'full' })), theme)
    for (const [name, url] of Object.entries(screens)) {
      await go(url)
      await page.locator('#management-detail').waitFor()
      const geometry = await page.evaluate(() => {
        const art = [...document.querySelectorAll('.l-ad-art img')]
        const goodArt = art.length > 0 && art.every(img => { const r = img.getBoundingClientRect(); return img.complete && img.naturalWidth > 0 && Math.abs(r.width / r.height - img.naturalWidth / img.naturalHeight) < .02 && r.width > 130 })
        const row = document.querySelector('.l-ad-row > button')
        const header = document.querySelector('.l-ad-labels, .l-rc-columns')
        const aligned = !header || !header.getClientRects().length || !row || [...header.children].every((cell, i) => !row.children[i] || Math.abs(cell.getBoundingClientRect().left - row.children[i].getBoundingClientRect().left) < 3)
        const search = document.querySelector('.l-rb-list input[type="search"], .l-ad-filters input[type="search"]')
        const panel = search?.closest('.l-rb-list, .l-ad-panel')
        const controls = innerWidth > 600 || !search || search.getBoundingClientRect().width > panel.getBoundingClientRect().width * .7
        return { fits: document.documentElement.scrollWidth <= innerWidth + 1, goodArt, aligned, controls }
      })
      check(geometry.fits && geometry.goodArt && geometry.aligned && geometry.controls, `${name}: fits, aligned columns, usable search and original artwork at ${width}px in ${theme}`)
      if ([1440, 390].includes(width)) await page.screenshot({ path: path.join(out, `${name}-${theme}-${width}.png`), fullPage: true })
    }
    if (width >= 768) {
      await go('/loyalty')
      const search = page.getByRole('searchbox', { name: 'Search members', exact: true })
      const spacing = await search.evaluate(input => { const icon = input.parentElement.querySelector('img').getBoundingClientRect(), rect = input.getBoundingClientRect(), style = getComputedStyle(input); return rect.left + parseFloat(style.paddingLeft) - icon.right })
      check(spacing >= 8, `Member search reserves icon clearance at ${width}px in ${theme}`)
      await search.fill('Layout search check')
      await page.waitForURL(u => u.searchParams.get('q') === 'Layout search check')
      check(await search.inputValue() === 'Layout search check', `Member search keeps typed text at ${width}px in ${theme}`)
      await search.fill('')
      await page.waitForURL(u => !u.searchParams.has('q'))
      await page.screenshot({ path: path.join(out, `members-${theme}-${width}.png`), fullPage: true })
    }
  }
  await page.setViewportSize({ width: 390, height: 900 })
  await go('/loyalty/program?tab=tiers')
  await page.locator('.l-ad-row > button').last().click()
  check(await page.locator('#management-detail').evaluate(el => el === document.activeElement), 'Selecting a tier brings keyboard focus to the stacked detail')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await go('/loyalty/options?tab=earn')
  check(await page.locator('.l-ad-row > button').first().evaluate(el => getComputedStyle(el).transitionDuration === '0s'), 'Reduced motion is respected')
  await reset()
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const lang of ['ru', 'de', 'fr', 'es', 'en']) {
    await page.evaluate(lang => localStorage.setItem('admin_lang', lang), lang)
    await go('/loyalty/options?tab=earn')
    const words = JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/adminux.${lang}.json`, import.meta.url), 'utf8'))
    const content = await page.locator('main').innerText()
    check(['earningMethods', 'pointsExpiry', 'whoEarn', 'eligibleSpend', 'completedBookings'].every(key => !words[key].includes('?') && content.includes(words[key])), `${lang}: compact labels render with intact translated characters`)
    if (lang === 'ru') await page.screenshot({ path: path.join(out, 'earning-ru-1440.png'), fullPage: true })
  }
  await reset()
  const token = await page.evaluate(() => localStorage.getItem('auth_token'))
  async function programCall(endpoint, method = 'GET', data) {
    const response = await ctx.request.fetch(`${base}/api/v1/admin/loyalty/${endpoint}?brand_id=all`, { method, data, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } })
    if (!response.ok()) throw Error(`Local program action failed: ${response.status()}`)
    return response.json()
  }
  const program = await programCall('program')
  const assigned = program.benefits.find(b => program.tiers.some(t => t.benefits.some(tb => tb.benefit_id === b.id)))
  if (!assigned) throw Error('Run the admin UX fixture journey first to create an assigned perk')
  try {
    await programCall(`program/benefits/${assigned.id}`, 'PUT', { is_active: false })
    await go(`/loyalty/rewards?tab=benefits&selected=${assigned.id}`)
    const action = page.getByRole('button', { name: 'Manage assignment', exact: true })
    check(await action.isEnabled(), 'An existing switched-off perk assignment remains editable')
    await action.click()
    await page.getByRole('dialog').waitFor()
    check(await page.getByRole('dialog').count() === 1, 'Inactive perk opens the canonical assignment editor')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  } finally {
    await programCall(`program/benefits/${assigned.id}`, 'PUT', { is_active: assigned.is_active })
  }
  check(report.errors.length === 0, 'No browser runtime errors')
} catch (error) {
  const scrub = value => Object.values(fixture.roles).reduce((s, r) => s.replaceAll(r.password, '[redacted]'), String(value))
  report.error = scrub(error.stack || error)
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {})
  console.error(report.error)
  process.exitCode = 1
} finally {
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2))
  await browser.close()
  console.log(JSON.stringify({ checks: report.checks.length, runtimeErrors: report.errors.length }))
}
