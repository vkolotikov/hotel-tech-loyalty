import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5819'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_PORT !== '55459' || process.env.MAIL_MAILER !== 'log') throw Error('Isolated rehearsal required')
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const out = path.resolve(process.env.LAUNCH_OUTPUT, '../events'), report = { checks: [], errors: [], localOnly: true }
await fs.mkdir(out, { recursive: true })
const exec = promisify(execFile), probe = process.argv.includes('--probe'), functional = process.argv.includes('--functional')
let run = Date.now().toString(36)
const reset = () => exec(process.env.PHP, [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), 'cache:clear', '--no-interaction'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, windowsHide: true })
const check = (ok, name) => { if (!ok) throw Error(name); report.checks.push(name); console.log('PASS ' + name) }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
await ctx.addInitScript(() => { if (!localStorage.getItem('admin_lang')) localStorage.setItem('admin_lang', 'en'); if (!localStorage.getItem('loyalty:look')) localStorage.setItem('loyalty:look', JSON.stringify({ theme: 'dark', rail: 'full' })) })
await ctx.addInitScript(instant => { const NativeDate = Date; window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [instant])) } static now() { return instant } } }, Date.parse((await fs.readFile(process.env.LAUNCH_CLOCK_FILE, 'utf8')).trim()))
const page = await ctx.newPage()
page.on('pageerror', e => report.errors.push(e.message))
let token
async function call(endpoint, method = 'GET', data) {
  const r = await ctx.request.fetch(`${base}/api/v1/admin/loyalty/${endpoint}${endpoint.includes('?') ? '&' : '?'}brand_id=all`, { method, data, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } })
  if (!r.ok()) throw Error(`Local ${method} ${endpoint}: ${r.status()}`)
  return r.json()
}
async function go(url) { await page.goto(base + url); await page.locator('main h1').waitFor(); await page.waitForFunction(() => !document.querySelector('main .animate-pulse, main .l-ov-skeleton')); await page.evaluate(() => document.fonts.ready) }
const popup = () => page.locator('dialog.l-editor-dialog[open]')
async function closeDraft() {
  await page.keyboard.press('Escape')
  const discard = page.getByRole('button', { name: 'Discard changes', exact: true })
  if (await discard.count()) await discard.click()
  await popup().waitFor({ state: 'detached' })
}
async function geometry(name) {
  const result = await page.evaluate(() => {
    const modal = document.querySelector('dialog.l-editor-dialog[open]'), target = modal || document.querySelector('main')
    const controls = [...target.querySelectorAll('input,select,textarea,button')].filter(el => el.getClientRects().length)
    const imgs = [...target.querySelectorAll('.l-ec-icon img')]
    const heading = !modal && target.querySelector('.l-ad-heading h1'), actions = !modal && target.querySelector('.l-ad-heading .l-ad-actions')
    let headingClear = true
    if (heading && actions && actions.children.length) {
      const range = document.createRange(); range.selectNodeContents(heading)
      const a = range.getBoundingClientRect(), b = actions.getBoundingClientRect()
      headingClear = !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
    }
    return {
      headingClear,
      overflow: document.documentElement.scrollWidth <= innerWidth + 1 && target.scrollWidth <= target.clientWidth + 1,
      controls: controls.every(el => el.getBoundingClientRect().width >= (el.matches('input[type="checkbox"],input[type="radio"]') ? 14 : 20)),
      artwork: imgs.every(el => el.complete && el.naturalWidth > 0 && Math.abs(el.getBoundingClientRect().width - el.naturalWidth) < 1 && Math.abs(el.getBoundingClientRect().height - el.naturalHeight) < 1),
      modal: !modal || modal.matches(':modal') && modal.contains(document.activeElement) && document.body.style.overflow === 'hidden',
    }
  })
  check(Object.values(result).every(Boolean), name + ': no overflow, native artwork and usable controls/focus ' + JSON.stringify(result))
}
try {
  await reset()
  await page.goto(base + '/loyalty/login')
  await page.getByLabel('Email', { exact: true }).fill(fixture.roles.manager.email)
  await page.getByLabel('Password', { exact: true }).fill(fixture.roles.manager.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(u => !u.pathname.endsWith('/login'))
  token = await page.evaluate(() => localStorage.getItem('auth_token'))
  const boot = await call('bootstrap'), day = boot.venue.today
  const future = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)
  let event, next, draft, member
  if (probe) {
    const ids = JSON.parse(await fs.readFile(path.join(out, 'ids.json'), 'utf8'))
    run = ids.run
    event = (await call(`events/${ids.event}`)).event
    draft = (await call(`events/${ids.draft}`)).event
  } else {
  const payload = { title: `Members evening ${run}`, description: 'Meet other members over coffee and conversation.', starts_at: day + 'T09:00', ends_at: day + 'T23:59', place_id: null, location: 'Northstar Lounge', admits: 'all', tier_ids: [], points: 100, counts_as_visit: true, sign_up: true, walk_ins: true, capacity: 40, publish: true, idempotency_key: 'event-' + run }
  event = (await call('events', 'POST', payload)).event
  next = (await call('events', 'POST', { ...payload, title: `Coffee masterclass ${run}`, starts_at: future + 'T10:00', ends_at: future + 'T12:00', capacity: 1, idempotency_key: 'next-' + run })).event
  draft = (await call('events', 'POST', { ...payload, title: `Winter idea ${run}`, starts_at: future + 'T18:00', ends_at: future + 'T20:00', publish: false, idempotency_key: 'draft-' + run })).event
  member = (await call('members', 'POST', { name: 'Jamie Taylor ' + run, email: `event.${run}@example.test`, send_welcome: false })).member
  await call(`events/${event.id}/sign-ups`, 'POST', { member_id: member.id, idempotency_key: 'signup-' + run })
  await call(`events/${next.id}/sign-ups`, 'POST', { member_id: member.id, idempotency_key: 'next-signup-' + run })
  await fs.writeFile(path.join(out, 'ids.json'), JSON.stringify({ event: event.id, next: next.id, draft: draft.id, member: member.id, run }))

  await go(`/loyalty/events?q=${run}&selected=${event.id}`)
  check(await page.locator('.l-ov-nav a[href="/loyalty/events"]').count() === 1 && await page.locator('.l-ov-nav a[href*="events?tab="]').count() === 0, 'one sidebar Events destination with no submenus')
  check(await page.getByRole('link', { name: 'Create event', exact: true }).count() === 1 && await page.locator('.l-ev-hero').count() === 0, 'one primary create action and compact directory')
  check(await page.locator('.l-ec-state').filter({ hasText: 'Full' }).count() >= 1, 'capacity status reads the real server room count')
  await geometry('desktop directory')
  await page.screenshot({ path: path.join(out, 'directory-dark-1440.png'), fullPage: true })
  await page.getByLabel('Search events', { exact: true }).fill('')
  await page.getByLabel('Search events', { exact: true }).pressSequentially('Coffee', { delay: 90 })
  check(await page.getByLabel('Search events', { exact: true }).evaluate(el => el.value === 'Coffee' && document.activeElement === el), 'event search retains every typed character and keyboard focus while results load')
  await page.getByLabel('Search events', { exact: true }).fill('Coffee masterclass ' + run)
  await page.waitForFunction(() => document.querySelectorAll('.l-ec-row').length === 1 && document.querySelector('.l-ec-row')?.textContent.includes('Coffee masterclass'))
  check(await page.locator('.l-ec-row').count() === 1, 'server search narrows rows before pagination')
  await page.getByRole('button', { name: /^Drafts/ }).click()
  await page.getByText('No results match these filters.', { exact: true }).waitFor()
  check(await page.getByLabel('Search events', { exact: true }).inputValue() === 'Coffee masterclass ' + run, 'status filters preserve active search')
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.locator('.l-ec-row').filter({ hasText: 'Winter idea ' + run }).waitFor()
  check(true, 'drafts remain discoverable in the unified directory')

  await go('/loyalty/events/new')
  await popup().waitFor()
  await popup().locator('.l-editor-footer button[type="submit"]').click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-invalid') === 'true')
  check(true, 'invalid new event focuses its first field error')
  await popup().getByLabel('Event name', { exact: true }).fill('New community evening ' + run)
  await popup().getByLabel('Member description', { exact: true }).fill('A new members gathering.')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
  check((await popup().getByLabel('Event name', { exact: true }).inputValue()).includes(run), 'Escape and Keep editing preserve changed event fields')
  await geometry('desktop editor')
  await page.screenshot({ path: path.join(out, 'editor-dark-1440.png'), fullPage: false })
  await popup().getByRole('button', { name: 'Save draft', exact: true }).click()
  await popup().waitFor({ state: 'detached' })
  const created = (await call('events?when=drafts&q=' + encodeURIComponent('New community evening ' + run))).events[0]
  check(created?.status === 'draft', 'Save draft persists through the canonical event API')
  await go(`/loyalty/events/${created.id}/edit`)
  await popup().waitFor()
  await popup().locator('.l-editor-footer button[type="submit"]').click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Publish', exact: true }).click()
  await popup().waitFor({ state: 'detached' })
  check((await call(`events/${created.id}`)).event.status === 'published', 'review and publish persist the saved draft')

  await go(`/loyalty/events/${event.id}`)
  await page.getByLabel('Find an attendee', { exact: true }).pressSequentially('Jamie', { delay: 90 })
  check(await page.getByLabel('Find an attendee', { exact: true }).evaluate(el => el.value === 'Jamie' && document.activeElement === el), 'attendee search retains every typed character and keyboard focus while results load')
  await page.locator('.l-ec-person').getByRole('button', { name: 'Confirm check-in', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Confirm check-in', exact: true }).click()
  await page.locator('.l-ec-person').getByText('100 points awarded', { exact: true }).waitFor()
  const people = await call(`events/${event.id}/people`)
  check(people.counts.checked_in === 1 && people.people[0].points_awarded === 100, 'attendance records the original 100-point ledger award')
  check(await page.getByRole('button', { name: 'Confirm check-in', exact: true }).count() === 0, 'checked-in member has no duplicate check-in action')
  check((await page.locator('main').getByRole('link', { name: 'Scan a member', exact: true }).getAttribute('href')).includes('event=' + event.id), 'scanner retains this event context')
  await geometry('desktop attendance')
  await page.screenshot({ path: path.join(out, 'attendance-dark-1440.png'), fullPage: true })

  }
  if (!functional) {
  for (const theme of ['dark', 'light']) {
    await reset()
    await page.evaluate(theme => localStorage.setItem('loyalty:look', JSON.stringify({ theme, rail: 'full' })), theme)
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      for (const [name, url] of [['directory', `/loyalty/events?q=${run}&selected=${event.id}`], ['attendance', `/loyalty/events/${event.id}`], ['editor', `/loyalty/events/${draft.id}/edit`]]) {
        await go(url)
        if (name === 'editor') await popup().waitFor()
        await geometry(`${name} ${theme} ${width}px`)
        if (width === 1440 || width === 390) await page.screenshot({ path: path.join(out, `${name}-${theme}-${width}.png`), fullPage: name !== 'editor' })
        if (name === 'editor') {
          await closeDraft()
          check(new URL(page.url()).searchParams.get('selected') === String(draft.id) && new URL(page.url()).searchParams.get('tab') === 'drafts', `${theme} ${width}px: closing the editor returns to the same draft`)
        }
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 900 })
  for (const lang of ['de', 'es', 'fr', 'ru']) {
    await reset()
    await page.evaluate(lang => localStorage.setItem('admin_lang', lang), lang)
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await go('/loyalty/events')
      check(!(await page.locator('main').innerText()).includes('loyalty.'), `${lang} ${width}px: translated directory renders without missing keys`)
      await geometry(`directory ${lang} ${width}px`)
      await go(`/loyalty/events/${draft.id}/edit`)
      await popup().waitFor()
      await geometry(`editor ${lang} ${width}px`)
      await page.keyboard.press('Escape')
      await popup().waitFor({ state: 'detached' })
    }
  }
  }
  check(report.errors.length === 0, 'no browser runtime errors')
} catch (error) {
  report.failure = error.message
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: false }).catch(() => {})
  process.exitCode = 1
  console.error('FAIL ' + error.message)
} finally {
  await fs.writeFile(path.join(out, functional ? 'functional-report.json' : probe ? 'probe-report.json' : 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
