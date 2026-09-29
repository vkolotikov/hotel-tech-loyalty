import { describe, expect, it } from 'vitest'
import type { CancelReply, PortalBooking } from '../lib/types'
import { afterCancelError, cancelledWhileAway, cancelOffer, moneyPromise, type CancelMutationSnapshot } from './cancelBooking'

const now = new Date('2026-10-01T09:00:00Z')
const booking: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'confirmed', payment_status: 'paid', total: 60, currency: 'EUR', discount: null, can_cancel: true, cancel_deadline: '2026-10-02T07:30:00Z',
  notes: null, party_size: 1, guests: null, nights: null, paid_online: true,
}

describe('cancelOffer', () => {
  it('offers cancellation exactly when the server says the booking can be cancelled', () => {
    expect(cancelOffer(booking, now)).toBe('offer')
    expect(cancelOffer({ ...booking, status: 'pending' }, now)).toBe('offer')
  })

  it('says free cancellation has ended once the deadline the server named has passed', () => {
    expect(cancelOffer({ ...booking, can_cancel: false, cancel_deadline: '2026-09-30T07:30:00Z' }, now)).toBe('ended')
  })

  it('points to the venue for a live booking that cannot be cancelled here at all', () => {
    expect(cancelOffer({ ...booking, can_cancel: false, cancel_deadline: null }, now)).toBe('contact')
    expect(cancelOffer({ ...booking, can_cancel: false, cancel_deadline: null, status: 'in_progress' }, now)).toBe('contact')
  })

  it('says nothing for a booking that is over or already cancelled', () => {
    expect(cancelOffer({ ...booking, can_cancel: false, status: 'cancelled' }, now)).toBe('none')
    expect(cancelOffer({ ...booking, can_cancel: false, status: 'completed' }, now)).toBe('none')
  })

  it('trusts the server over the clock: a deadline still ahead with can_cancel false is not an offer', () => {
    expect(cancelOffer({ ...booking, can_cancel: false, cancel_deadline: '2026-10-02T07:30:00Z' }, now)).toBe('contact')
  })

  it('treats a passed deadline as ended even when a stale DTO still says can_cancel: true', () => {
    expect(cancelOffer({ ...booking, can_cancel: true, cancel_deadline: '2026-09-30T07:30:00Z' }, now)).toBe('ended')
  })

  // Ordinary clock skew (up to five minutes, either direction) must not read a
  // can_cancel: true deadline as already "ended" — the server is trusted over a clock that close. Boundary
  // tested at exactly five minutes (still trusted) and one second past it (the ordinary rule takes back over).
  describe('clock skew — can_cancel: true and the deadline within five minutes either way', () => {
    it('a deadline that just passed, within the margin, still offers cancellation', () => {
      expect(cancelOffer({ ...booking, can_cancel: true, cancel_deadline: '2026-10-01T08:57:00Z' }, now)).toBe('offer') // 3 min ago
      expect(cancelOffer({ ...booking, can_cancel: true, cancel_deadline: '2026-10-01T08:55:00Z' }, now)).toBe('offer') // exactly 5 min ago
    })

    it('a deadline one second past the five-minute margin reads as ended', () => {
      expect(cancelOffer({ ...booking, can_cancel: true, cancel_deadline: '2026-10-01T08:54:59Z' }, now)).toBe('ended')
    })

    it('a deadline still ahead, within the margin, is an ordinary offer regardless of skew', () => {
      expect(cancelOffer({ ...booking, can_cancel: true, cancel_deadline: '2026-10-01T09:03:00Z' }, now)).toBe('offer')
    })

    it('the margin only forgives can_cancel: true — a server that already refuses is untouched by it', () => {
      expect(cancelOffer({ ...booking, can_cancel: false, cancel_deadline: '2026-10-01T08:57:00Z' }, now)).toBe('ended')
    })
  })
})

describe('moneyPromise', () => {
  it('promises a refund for a payment taken online, and a release for a card held online', () => {
    expect(moneyPromise({ ...booking, payment_status: 'paid', paid_online: true })).toBe('refund')
    expect(moneyPromise({ ...booking, payment_status: 'authorized', paid_online: true })).toBe('release')
  })

  // Staff can mark a booking "paid" for cash or a bank transfer with no PaymentIntent behind
  // it at all — payment_status alone must never promise a card refund.
  it('sends a booking paid but not online to the venue instead of promising a card refund', () => {
    expect(moneyPromise({ ...booking, payment_status: 'paid', paid_online: false })).toBe('venue')
  })

  // Every payment status the server can send (App\Enums\PaymentStatus' fourteen cases,
  // minus paid/authorized which have their own dedicated tests above), so a status added to that enum
  // without a matching branch here fails loudly instead of just falling through untested.
  it('promises nothing for a held card with no real intent behind it, or any other payment state', () => {
    expect(moneyPromise({ ...booking, payment_status: 'authorized', paid_online: false })).toBe('nothing')
    for (const status of ['unpaid', 'open', 'pending', 'capture_expired', 'refunded', 'partially_refunded', 'disputed', 'cancelled', 'channel_managed', 'invoice_waiting', 'mock', null, 'something_new']) {
      expect(moneyPromise({ ...booking, payment_status: status, paid_online: true })).toBe('nothing')
      expect(moneyPromise({ ...booking, payment_status: status, paid_online: false })).toBe('nothing')
    }
  })

  it('promises nothing for a booking that cost nothing, even one paid online', () => {
    expect(moneyPromise({ ...booking, payment_status: 'paid', paid_online: true, total: 0 })).toBe('nothing')
  })
})

describe('afterCancelError', () => {
  it('a booking that turns out to be cancelled, or no longer cancellable, reloads and leaves the question', () => {
    for (const code of ['already_cancelled', 'outside_policy', 'not_cancellable']) {
      expect(afterCancelError(code)).toEqual({ closes: true, refetch: true })
    }
  })

  it('a refund that failed, a cancellation in flight or no answer at all keeps the question open for another try', () => {
    for (const code of ['refund_failed', 'cancel_in_progress', 'refund_unavailable', null, 'never_seen']) {
      expect(afterCancelError(code)).toEqual({ closes: false, refetch: false })
    }
  })
})

describe('cancelledWhileAway', () => {
  const refund: CancelReply['refund'] = { outcome: 'refunded', amount: 54, currency: 'EUR', coupon_released: false, points_reversed: 0 }
  const success = (id: number, submittedAt: number): CancelMutationSnapshot => ({ kind: 'service', id, status: 'success', submittedAt, refund, errorCode: null })
  const failure = (id: number, submittedAt: number): CancelMutationSnapshot => ({ kind: 'service', id, status: 'error', submittedAt, refund: null, errorCode: 'refund_failed' })
  const pending = (id: number, submittedAt: number): CancelMutationSnapshot => ({ kind: 'service', id, status: 'pending', submittedAt, refund: null, errorCode: null })

  it('nothing to show with no mutations at all', () => {
    expect(cancelledWhileAway([], 0, null, new Set())).toBeNull()
  })

  it('ignores a still-pending attempt — nothing has settled to tell the member about yet', () => {
    expect(cancelledWhileAway([pending(7, 100)], 0, null, new Set())).toBeNull()
  })

  it('ignores anything that settled before this mount started watching (a stale mutation from earlier in the session)', () => {
    expect(cancelledWhileAway([success(7, 50)], 100, null, new Set())).toBeNull()
  })

  it('surfaces a settled attempt — success or failure — from within the watch window, when no sheet is open', () => {
    expect(cancelledWhileAway([success(7, 150)], 100, null, new Set())).toEqual(success(7, 150))
    expect(cancelledWhileAway([failure(7, 150)], 100, null, new Set())).toEqual(failure(7, 150))
  })

  it('never re-shows one already marked seen', () => {
    const shown = new Set(['service:7'])
    expect(cancelledWhileAway([success(7, 150)], 100, null, shown)).toBeNull()
  })

  it('picks only the most recent unseen attempt when several settled', () => {
    const snapshots = [success(7, 150), failure(9, 300), success(11, 200)]
    expect(cancelledWhileAway(snapshots, 100, null, new Set())).toEqual(failure(9, 300))
  })

  // "normal cancel in the sheet → nothing announced on the list": the ordinary,
  // no-Back path marks a settled cancellation shown the moment BookingSheet's own onSuccess/onError fires
  // while mounted (`onCancelSettled`, wired in Bookings.tsx) — from this function's own point of view that
  // is indistinguishable from any other already-shown mutation.
  it('a cancellation the sheet already showed its own result for (marked shown) is never announced here too', () => {
    expect(cancelledWhileAway([success(7, 150)], 100, null, new Set(['service:7']))).toBeNull()
  })

  // "Back mid-flight → announced once and still there after the list refetches": a refetch changes none of
  // this function's own inputs, so calling it again with the SAME (unchanged) `shown` returns the SAME
  // result — the notice does not disappear on its own the way it would if `shown` were mutated as a side
  // effect of merely being returned once.
  it('stays announced across a refetch — repeated calls with the same inputs keep returning it', () => {
    const shown = new Set<string>()
    expect(cancelledWhileAway([success(7, 150)], 100, null, shown)).toEqual(success(7, 150))
    expect(cancelledWhileAway([success(7, 150)], 100, null, shown)).toEqual(success(7, 150))
  })

  // The booking whose sheet is open is excluded — its own sheet either shows the result itself, or (Back
  // mid-flight, not yet settled) has nothing to show yet either way.
  it('excludes only the booking whose sheet is open right now', () => {
    expect(cancelledWhileAway([success(7, 150)], 100, { kind: 'service', id: 7 }, new Set())).toBeNull()
  })

  // "a second booking's sheet open when the first settles → the notice names the first booking's title":
  // this function only decides WHICH mutation is eligible — Bookings.tsx looks up the title separately — but
  // the eligibility itself must not be suppressed just because SOME OTHER sheet happens to be open.
  it('still announces a different booking while an unrelated one\'s sheet is open', () => {
    expect(cancelledWhileAway([success(7, 150)], 100, { kind: 'service', id: 9 }, new Set())).toEqual(success(7, 150))
    expect(cancelledWhileAway([success(7, 150)], 100, { kind: 'stay', id: 7 }, new Set())).toEqual(success(7, 150)) // same id, different kind
  })
})
