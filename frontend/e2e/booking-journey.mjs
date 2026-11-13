import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const base = process.env.E2E_BASE || 'http://127.0.0.1:5175'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw Error('Local fixtures only')
const html = await fs.readFile(process.env.WIDGET_HTML || '/workspace/scratch/promotion-widget.html', 'utf8')
const out = process.env.E2E_OUT || '/workspace/scratch/booking-journey/browser'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
const check = (value, message) => { if (!value) throw Error(message) }

async function scenario(name, run, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.mobile ? 390 : 1440, height: 950 }, reducedMotion: 'reduce' })
  const page = await context.newPage(), calls = [], errors = []
  const fixture = { paid: false, lost: options.lost || false, availabilityError: false, payment: options.payment !== false, code: '', ...options }
  page.on('pageerror', e => errors.push(e.message))
  await context.addInitScript(({ loadError, unknownPayment }) => {
    window.__stripeCalls = 0
    window.Stripe = () => ({
      elements: () => ({ create: () => {
        const handlers = {}
        return {
          mount: selector => { document.querySelector(selector).innerHTML = '<div data-fixture-card>Test card · no real payment</div>'; setTimeout(() => handlers[loadError ? 'loaderror' : 'ready']?.(loadError ? { error: { message: 'Fixture card failed to load' } } : {}), 50) },
          unmount: () => {}, on: (event, handler) => { handlers[event] = handler },
        }
      } }),
      confirmPayment: () => { window.__stripeCalls++; return unknownPayment ? Promise.reject(new Error('Simulated lost bank response')) : new Promise(resolve => setTimeout(() => resolve({ paymentIntent: { id: 'pi_journey_fixture', status: 'requires_capture' } }), 100)) },
    })
  }, { loadError: !!options.loadError, unknownPayment: !!options.unknownPayment })
  const room = { id: '101', name: 'Forest lodge', max_guests: 4, bedrooms: 1, price_per_night: 150, total_price: 300, currency: 'EUR', image: base + '/room.svg', amenities: [], tags: [] }
  const extra = { id: '1', name: 'Breakfast', price: 10, price_type: 'per_person_per_night', category: 'food' }
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url())
    if (!['127.0.0.1', 'localhost'].includes(u.hostname)) return route.abort()
    if (u.pathname === '/fixture-journey') return route.fulfill({ contentType: 'text/html', body: html })
    if (u.pathname === '/room.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 350"><rect fill="#315e43" width="600" height="350"/></svg>' })
    if (!u.pathname.includes('/api/')) return route.continue()
    const endpoint = u.pathname.split('/').pop(), body = req.method() === 'POST' ? req.postDataJSON() : null
    calls.push({ endpoint, body })
    let data = {}, status = 200
    if (endpoint === 'config') data = { units: [room], extras: [extra], promotions_enabled: true, today: '2026-11-13', currency: fixture.currency || 'EUR', min_nights: 1, max_nights: 30, payment_enabled: fixture.payment, stripe_publishable_key: 'pk_test_fixture', policies: {}, style: { property_name: 'Forrest booking fixture', show_name: true } }
    if (endpoint === 'availability') {
      if (fixture.availabilityError) { status = 503; data = { error: 'Availability is temporarily unavailable. Please retry.' } }
      else data = fixture.combo ? { available: [], combinations: [{ rooms: [{ ...room, total_price: 300 }, { ...room, id: '102', name: 'Garden lodge', total_price: 300 }], total_price: 600, currency: 'EUR', total_capacity: 4 }] } : { available: [room], combinations: [] }
    }
    if (endpoint === 'calendar-prices') data = { prices: {}, availability: fixture.soldOut ? { [fixture.soldOut]: false } : {} }
    if (endpoint === 'quote') {
      const extras = body.extras?.length ? 40 : 0
      const stayTotal = body.unit_ids ? 600 : 300
      const discount = body.promo_code === 'FREE' ? stayTotal : body.promo_code === 'EARLYFOR20' ? stayTotal * 0.2 : 0
      data = { hold_token: 'fixture_hold', expires_at: new Date(Date.now() + (fixture.expired ? -1000 : 600000)).toISOString(), unit_id: room.id, unit_name: room.name, check_in: body.check_in, check_out: body.check_out, nights: 2, adults: body.adults, children: 0, room_total: stayTotal, extras_total: extras, gross_total: stayTotal - discount + extras, currency: 'EUR', discount, discount_label: body.promo_code, extras: extras ? [{ ...extra, unit_price: 10, quantity: 1, line_total: 40 }] : [] }
    }
    if (endpoint === 'payment-intent') data = fixture.paid ? { payment_received: true, payment_intent_id: 'pi_journey_fixture' } : { client_secret: 'local_fixture_secret', payment_intent_id: 'pi_journey_fixture' }
    if (endpoint === 'confirm') {
      fixture.paid = !!body.payment_intent_id
      if (fixture.lost) { fixture.lost = false; return route.abort() }
      data = { success: true, booking_reference: 'FORREST-FIXTURE', unit_name: room.name, check_in: '2027-01-10', check_out: '2027-01-12', gross_total: 280, currency: 'EUR' }
    }
    return route.fulfill({ status, json: data })
  })
  const enter = async () => {
    await page.goto(base + '/fixture-journey?check_in=2027-01-10&check_out=2027-01-12')
    await page.locator('#w-search').click()
    await page.locator('[data-unit="101"]').press('Enter')
    await page.locator('#w-next2').click()
  }
  const details = async () => {
    await page.locator('#w-fname').fill('Test')
    await page.locator('#w-lname').fill('Guest')
    await page.locator('#w-email').fill('guest@example.test')
    await page.locator('#w-requests').fill('Late arrival please')
  }
  try {
    await run({ page, fixture, calls, enter, details })
    check(errors.length === 0, 'JavaScript errors: ' + errors.join('; '))
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow')
    check(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.length === new Set(ids).size }), 'Duplicate control IDs')
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true, animations: 'disabled' })
    results.push({ name, passed: true, requests: calls.length })
  } catch (error) {
    await page.screenshot({ path: path.join(out, name + '-failed.png'), fullPage: true, animations: 'disabled' })
    throw new Error(name + ': ' + error.message)
  } finally { await context.close() }
}

try {
  await scenario('paid-discount-extras', async ({ page, calls, enter, details }) => {
    await enter()
    await page.locator('[data-extra-card="1"]').press('Space')
    check(await page.locator('[data-extra-card="1"]').evaluate(e => e === document.activeElement), 'Keyboard selection retains focus')
    check((await page.locator('[data-extra-card="1"]').innerText()).includes('€40'), 'Extra shows full party/night total')
    await page.locator('#w-promo').fill('EARLYFOR20')
    await page.locator('#w-next3').click()
    await details()
    check((await page.locator('.summary-sidebar').innerText()).includes('€280'), 'Discounted stay plus full-price extras totals 280')
    await page.locator('#w-summary-payment').click()
    await page.locator('#w-pay').waitFor()
    await page.waitForFunction(() => !document.querySelector('#w-pay')?.disabled)
    await page.locator('#w-pay').click()
    await page.getByText('Booking Confirmed!', { exact: true }).waitFor()
    const intent = calls.find(c => c.endpoint === 'payment-intent').body
    check(intent.guest.email === 'guest@example.test' && intent.special_requests === 'Late arrival please', 'Guest saved before payment')
    check(calls.find(c => c.endpoint === 'confirm').body.special_requests === 'Late arrival please', 'Paid requests saved')
    check(await page.evaluate(() => window.__stripeCalls) === 1, 'Exactly one card confirmation')
  })
  await scenario('unpaid-details-validation', async ({ page, calls, enter, details }) => {
    await enter(); await page.locator('#w-next3').click(); await details()
    await page.locator('#w-email').fill('bad@')
    await page.locator('#w-confirm').click()
    check(!calls.some(c => c.endpoint === 'confirm'), 'Invalid email never reaches confirm')
    check(await page.locator('#w-email').evaluate(e => e === document.activeElement), 'Invalid field gets focus')
    await page.locator('#w-email').fill('guest@example.test'); await page.locator('#w-confirm').click()
    await page.getByText('Booking Confirmed!', { exact: true }).waitFor()
    check(calls.find(c => c.endpoint === 'confirm').body.special_requests === 'Late arrival please', 'Pay-at-venue requests saved')
  }, { payment: false, mobile: true })
  await scenario('lost-confirmation-retry', async ({ page, calls, enter, details }) => {
    await enter(); await page.locator('#w-next3').click(); await details(); await page.locator('#w-to-payment').click()
    await page.waitForFunction(() => !document.querySelector('#w-pay')?.disabled)
    await page.locator('#w-pay').click()
    await page.getByRole('button', { name: /Retry booking confirmation/ }).first().waitFor()
    await page.getByRole('button', { name: /Retry booking confirmation/ }).first().click()
    await page.getByText('Booking Confirmed!', { exact: true }).waitFor()
    check(await page.evaluate(() => window.__stripeCalls) === 1, 'Retry never confirms another card payment')
    check(calls.filter(c => c.endpoint === 'confirm').length === 2, 'Same booking retried')
  }, { lost: true })
  await scenario('redirect-without-proof', async ({ page, calls }) => {
    await page.goto(base + '/fixture-journey?payment_intent=pi_untrusted&redirect_status=succeeded&payment_intent_client_secret=not_proof')
    await page.getByText(/cannot confirm a reservation from the bank return alone/).waitFor()
    check(await page.getByText('Booking Confirmed!', { exact: true }).count() === 0, 'No false success')
    check(!calls.some(c => c.endpoint === 'confirm'), 'No booking from URL alone')
    check(!page.url().includes('client_secret'), 'Return secret removed from address')
  })
  await scenario('redirect-resumes-owned-booking', async ({ page, fixture, enter, details, calls }) => {
    await enter(); await page.locator('#w-next3').click(); await details(); await page.locator('#w-to-payment').click()
    await page.locator('#w-pay').waitFor()
    fixture.paid = true
    fixture.currency = 'USD'
    await page.goto(base + '/fixture-journey?payment_intent=pi_journey_fixture&redirect_status=succeeded')
    await page.getByText('Booking Confirmed!', { exact: true }).waitFor()
    check(calls.filter(c => c.endpoint === 'payment-intent').length === 2, 'Return checks server payment')
    check(calls.find(c => c.endpoint === 'confirm').body.guest.email === 'guest@example.test', 'Contact survives bank return')
    check(await page.evaluate(() => window.__stripeCalls) === 0, 'No second card authorisation after redirect')
    check((await page.locator('.summary-total').innerText()).includes('€280'), 'Confirmed booking keeps its original currency after a venue currency change')
  })
  await scenario('bounded-card-load-retry', async ({ page, calls, enter, details }) => {
    await enter(); await page.locator('#w-next3').click(); await details(); await page.locator('#w-to-payment').click()
    await page.getByRole('button', { name: 'Check payment / reload card form', exact: true }).waitFor()
    check(calls.filter(c => c.endpoint === 'payment-intent').length === 2, 'Only one automatic card retry')
    check(!calls.some(c => c.endpoint === 'confirm'), 'No reservation when card form fails')
  }, { loadError: true })
  await scenario('unknown-bank-response', async ({ page, calls, fixture, enter, details }) => {
    await enter(); await page.locator('#w-next3').click(); await details(); await page.locator('#w-to-payment').click()
    await page.waitForFunction(() => !document.querySelector('#w-pay')?.disabled)
    await page.locator('#w-pay').click()
    await page.getByRole('button', { name: 'Check payment status', exact: true }).first().waitFor()
    fixture.paid = true
    await page.getByRole('button', { name: 'Check payment status', exact: true }).first().click()
    await page.getByText('Booking Confirmed!', { exact: true }).waitFor()
    check(await page.evaluate(() => window.__stripeCalls) === 1, 'An uncertain bank response never authorises another card payment')
    check(calls.filter(c => c.endpoint === 'payment-intent').length === 2, 'Payment checked through the server')
  }, { unknownPayment: true })
  await scenario('zero-total-skips-card', async ({ page, calls, enter, details }) => {
    await enter(); await page.locator('#w-promo').fill('FREE'); await page.locator('#w-next3').click(); await details(); await page.locator('#w-confirm').click()
    await page.getByText('Booking Confirmed!', { exact: true }).waitFor()
    check(!calls.some(c => c.endpoint === 'payment-intent'), 'Free stay needs no card')
  }, { mobile: true })
  await scenario('availability-error-retry', async ({ page, fixture }) => {
    fixture.availabilityError = true
    await page.goto(base + '/fixture-journey?check_in=2027-01-10&check_out=2027-01-12')
    await page.locator('#w-search').click(); await page.getByText('Availability is temporarily unavailable. Please retry.').waitFor()
    fixture.availabilityError = false
    await page.locator('#w-search').click(); await page.locator('[data-unit="101"]').waitFor()
  })
  await scenario('expired-quote-before-payment', async ({ page, calls, fixture, enter, details }) => {
    fixture.expired = true
    await enter(); await page.locator('#w-next3').click(); await details()
    await page.locator('#w-to-payment').click()
    await page.getByRole('button', { name: 'Review stay again', exact: true }).waitFor()
    check(!calls.some(c => c.endpoint === 'payment-intent'), 'No card is authorised against an expired quote')
    await page.getByRole('button', { name: 'Review stay again', exact: true }).click()
    fixture.expired = false
    await page.locator('#w-next3').click(); await page.locator('#w-to-payment').click()
    await page.locator('#w-pay').waitFor()
  })
  await scenario('combination-checkout', async ({ page, calls, details }) => {
    await page.goto(base + '/fixture-journey?check_in=2027-01-10&check_out=2027-01-12&adults=4')
    await page.locator('#w-search').click(); await page.locator('[data-combo="0"]').press('Enter')
    await page.locator('#w-next2').click(); await page.locator('#w-next3').click(); await details()
    await page.locator('#w-confirm').click(); await page.getByText('Booking Confirmed!', { exact: true }).waitFor()
    check(calls.find(c => c.endpoint === 'quote').body.unit_ids.join(',') === '101,102', 'One quote contains the chosen rooms')
    check(calls.filter(c => c.endpoint === 'confirm').length === 1, 'One confirmation for the whole combination')
  }, { combo: true, payment: false, mobile: true })
  await scenario('keyboard-date-picker', async ({ page }) => {
    await page.goto(base + '/fixture-journey?check_in=2027-01-10&check_out=2027-01-12')
    await page.locator('#w-ci-trigger').click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    check(await page.locator('[data-date="2027-01-10"]').evaluate(e => e === document.activeElement), 'Picker starts on the selected month and date')
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
    await dialog.waitFor({ state: 'hidden' })
    check(await page.locator('#w-co-trigger').evaluate(e => e === document.activeElement), 'Closed calendar restores focus')
    await page.locator('#w-ci-trigger').click(); await page.locator('#cal-close').focus(); await page.keyboard.press('Shift+Tab')
    check(await page.locator('#cal-apply').evaluate(e => e === document.activeElement), 'Calendar traps keyboard focus')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
    await page.locator('#w-ci-trigger').click()
  }, { mobile: true })
  await scenario('sold-out-departure-remains-selectable', async ({ page }) => {
    await page.goto(base + '/fixture-journey?check_in=2027-01-10&check_out=2027-01-12')
    await page.locator('#w-co-trigger').click()
    await page.locator('[data-date="2027-01-11"].sold-out.checkout-eligible').waitFor()
    check(await page.locator('[data-date="2027-01-11"]').isEnabled(), 'Sold-out occupied night remains usable as departure')
    await page.locator('[data-date="2027-01-11"]').click()
    check((await page.locator('#w-co-trigger').innerText()).includes('11'), 'Earlier departure was applied')
    await page.locator('#w-ci-trigger').click()
    check(await page.locator('[data-date="2027-01-11"]').isDisabled(), 'Sold-out night is still blocked for arrival')
  }, { soldOut: '2027-01-11' })
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally { await browser.close() }
