import { describe, expect, it } from 'vitest'
import { restartPath, returnConfirmOutcome, returnHasSecret, returnIntentId, returnStayNotice, returnView } from './payReturn'
import { canTryOnlineAgain, payAtVenueGrantOf, portalReturnUrl, retryOnlineVisit } from './steps'
import type { PaymentReturn } from '../../lib/types'

const stay: PaymentReturn = {
  kind: 'stay', state: 'authorised', payment_intent_id: 'pi_1', amount: 200, currency: 'EUR', booking: null, service: null,
  stay: { hold_token: 'HOLD', hold_active: true, room: { id: '101', name: 'Sea view' }, check_in: '2026-10-10', check_out: '2026-10-12', nights: 2, adults: 2, children: 0 },
}
const service: PaymentReturn = {
  kind: 'service', state: 'authorised', payment_intent_id: 'pi_2', amount: 60, currency: 'EUR', booking: null, stay: null,
  service: { body: { service_id: 11, master_id: 5, start_at: '2026-10-05T10:00:00+03:00', party_size: 1, extras: [], coupon: null }, name: 'Deep Tissue', master: 'Mara', start_at: '2026-10-05T10:00:00+03:00' },
}

describe('returnIntentId', () => {
  it('reads the payment intent id Stripe puts on the return address', () => {
    expect(returnIntentId('?payment_intent=pi_3Abc_9&payment_intent_client_secret=pi_3Abc_9_secret_x&redirect_status=succeeded')).toBe('pi_3Abc_9')
  })

  it('refuses anything that is not shaped like an intent id', () => {
    expect(returnIntentId('')).toBeNull()
    expect(returnIntentId('?payment_intent=')).toBeNull()
    expect(returnIntentId('?payment_intent=../admin')).toBeNull()
    expect(returnIntentId('?payment_intent=seti_123')).toBeNull()
  })

  it('knows whether the client secret is still on the address, to take it off', () => {
    expect(returnHasSecret('?payment_intent=pi_1&payment_intent_client_secret=s')).toBe(true)
    expect(returnHasSecret('?payment_intent=pi_1')).toBe(false)
  })
})

describe('returnView', () => {
  it('confirms an authorised payment the server could rebuild, of either kind', () => {
    expect(returnView(stay)).toBe('confirm')
    expect(returnView(service)).toBe('confirm')
    // An expired hold is still confirmed: the server refuses it and releases the card under its own rules.
    expect(returnView({ ...stay, stay: { ...stay.stay!, hold_active: false } })).toBe('confirm')
  })

  it('goes to the booking, waits for the bank, or starts again — and never confirms what it cannot rebuild', () => {
    expect(returnView({ ...stay, state: 'booked' })).toBe('booked')
    expect(returnView({ ...stay, state: 'processing' })).toBe('processing')
    expect(returnView({ ...service, state: 'failed' })).toBe('failed')
    expect(returnView({ ...stay, stay: null })).toBe('lapsed')
    expect(returnView({ ...service, service: null })).toBe('lapsed')
  })
})

describe('returnConfirmOutcome', () => {
  it('a stay: only the codes the server is known to release start again', () => {
    for (const code of ['room_unavailable', 'invalid_stay', 'hold_expired', 'price_changed', 'pms_unavailable', 'not_bookable', 'payment_mismatch', 'coupon_used']) {
      expect(returnConfirmOutcome('stay', code), code).toBe('restart')
    }
    expect(returnConfirmOutcome('stay', 'payment_check_failed')).toBe('retry')
    expect(returnConfirmOutcome('stay', null)).toBe('retry')
    for (const code of ['confirm_failed', 'hold_not_found', 'no_membership', 'something_new']) {
      expect(returnConfirmOutcome('stay', code), code).toBe('contact')
    }
  })

  it('an appointment: the flow\'s own rule — stay-on-Pay codes retry, everything else starts again', () => {
    for (const code of [null, 'idempotency_conflict', 'payment_check_failed', 'no_membership']) {
      expect(returnConfirmOutcome('service', code), String(code)).toBe('retry')
    }
    for (const code of ['slot_taken', 'too_soon', 'payment_mismatch', 'confirm_failed', 'coupon_expired']) {
      expect(returnConfirmOutcome('service', code), code).toBe('restart')
    }
  })

  it('a stay retry or contact uses the paid sentences (the card is authorised on a return)', () => {
    expect(returnStayNotice('retry', 'payment_check_failed')).toBe('retry_payment_check_failed')
    expect(returnStayNotice('retry', null)).toBe('retry')
    expect(returnStayNotice('contact', 'confirm_failed')).toBe('contact')
    expect(returnStayNotice('restart', 'hold_expired')).toBeNull()
  })
})

describe('restartPath', () => {
  it('goes back to the flow the payment was for', () => {
    expect(restartPath(stay)).toBe('/portal/book/stay')
    expect(restartPath(service)).toBe('/portal/book/appointment?service=11')
    expect(restartPath({ kind: 'service', service: null })).toBe('/portal/book/appointment')
  })
})

describe('payAtVenueGrantOf', () => {
  it('reads the grant only off a pay_at_venue answer given because online payment is unavailable', () => {
    const grant = { response: { status: 409, data: { error: 'pay_at_venue', reason: 'payment_unavailable', pay_at_venue_grant: 'g-1' } } }
    expect(payAtVenueGrantOf(grant)).toBe('g-1')
    // A venue that takes no cards at all needs no grant; a plain error has none.
    expect(payAtVenueGrantOf({ response: { status: 409, data: { error: 'pay_at_venue' } } })).toBeNull()
    expect(payAtVenueGrantOf({ response: { status: 503, data: { error: 'payment_unavailable' } } })).toBeNull()
    expect(payAtVenueGrantOf({ response: { status: 409, data: { error: 'pay_at_venue', reason: 'payment_unavailable', pay_at_venue_grant: '' } } })).toBeNull()
    expect(payAtVenueGrantOf(new Error('network'))).toBeNull()
    expect(payAtVenueGrantOf(null)).toBeNull()
  })
})

describe('portalReturnUrl / retryOnlineVisit', () => {
  it('returns to the portal\'s own return page, absolute', () => {
    expect(portalReturnUrl('https://app.example.test')).toBe('https://app.example.test/portal/book/return')
    expect(portalReturnUrl('http://localhost:5173/')).toBe('http://localhost:5173/portal/book/return')
  })

  it('trying online again asks for one fresh intent under a fresh key, and forgets the grant', () => {
    let n = 0
    // Review finding 6: the old key belonged to the at-venue booking; a card booking under it could only answer
    // `idempotency_conflict` with its new intent left authorised.
    expect(retryOnlineVisit(() => `fresh-${n++}`)).toEqual({ nonce: 'fresh-0', idempotencyKey: 'fresh-1', noCard: false, atVenueGrant: null })
  })

  it('offers trying online again only before any confirm was sent on this visit', () => {
    expect(canTryOnlineAgain('grant', 'idle')).toBe(true)
    // Sent: its answer may have been lost while the at-venue booking was made — only that same confirm may be resent.
    for (const state of ['pending', 'error', 'success'] as const) expect(canTryOnlineAgain('grant', state), state).toBe(false)
    expect(canTryOnlineAgain(null, 'idle')).toBe(false)
  })
})
