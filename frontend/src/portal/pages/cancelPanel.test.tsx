import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CancelPanel, type CancelPanelProps } from './CancelPanel'
import type { PortalBooking } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : k
      for (const [key, v] of Object.entries(vars ?? {})) text = text.replace(`{{${key}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))

const booking: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'confirmed', payment_status: 'paid', total: 60, currency: 'EUR', discount: { amount: 6, label: 'Autumn code' }, can_cancel: true, cancel_deadline: '2026-10-02T07:30:00Z',
  notes: null, party_size: 1, guests: null, nights: null, paid_online: true,
}
const venue = { name: 'Numa', timezone: 'Europe/Riga', contact: { email: 'hi@numa.test', phone: null } }
const noop = () => {}
const panel = (over: Partial<CancelPanelProps> = {}) => renderToStaticMarkup(
  <CancelPanel booking={booking} venue={venue} offer="offer" stage="idle" error={null} result={null} onAsk={noop} onKeep={noop} onConfirm={noop} {...over} />,
)

describe('CancelPanel', () => {
  it('offers to cancel and says until when it is free', () => {
    const html = panel()
    expect(html).toContain('Cancel booking')
    expect(html).toContain('Free cancellation until')
    expect(html).toContain('<time')
    expect(html).not.toContain('Yes, cancel it')
  })

  it('asks before it cancels, and says what happens to the money and the coupon first', () => {
    const html = panel({ stage: 'asking' })
    expect(html).toContain('Cancel this booking?')
    expect(html).toContain('We will refund')
    expect(html).toContain('60')
    expect(html).toContain('to the card you paid with.')
    expect(html).toContain('Keep it')
    expect(html).toContain('Yes, cancel it')
    expect(html.indexOf('Keep it')).toBeLessThan(html.indexOf('Yes, cancel it'))
  })

  it('promises a release for a held card and nothing for an unpaid booking', () => {
    expect(panel({ stage: 'asking', booking: { ...booking, payment_status: 'authorized' } })).toContain('The hold on your card will be released. Nothing is charged.')
    const unpaid = panel({ stage: 'asking', booking: { ...booking, payment_status: 'unpaid', discount: null } })
    expect(unpaid).toContain('Nothing has been charged for this booking.')
    expect(unpaid).not.toContain('refund')
  })

  // payment_status alone must never promise a card refund — staff can mark a booking "paid"
  // for cash or a bank transfer with no PaymentIntent behind it at all.
  it('sends a booking paid but not online to the venue instead of promising a card refund', () => {
    const html = panel({ stage: 'asking', booking: { ...booking, paid_online: false } })
    expect(html).toContain('This booking was paid at Numa. They will arrange any refund with you.')
    expect(html).not.toContain('to the card you paid with.')
    expect(html).not.toContain('60')
  })

  it('is busy, and cannot be pressed twice, while it cancels', () => {
    const html = panel({ stage: 'cancelling' })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"[^>]*>.*Cancelling…/s)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Keep it/)
  })

  it('says why it could not cancel, in the question itself, and lets the member try again', () => {
    const html = panel({ stage: 'asking', error: 'refund_failed' })
    expect(html).toContain('We could not return the payment just now, so the booking was not cancelled.')
    expect(html).toContain('Yes, cancel it')
  })

  it('says what was done once it is done', () => {
    const refunded = panel({ offer: 'none', stage: 'done', result: { outcome: 'refunded', amount: 54, currency: 'EUR', coupon_released: true, points_reversed: 0 } })
    expect(refunded).toContain('Your booking is cancelled.')
    expect(refunded).toContain('We have refunded')
    expect(refunded).toContain('54')
    expect(refunded).toContain('5–10 business days')
    expect(refunded).toContain('Your coupon is back with your coupons.')
    expect(refunded).not.toContain('Cancel booking')

    const released = panel({ offer: 'none', stage: 'done', result: { outcome: 'released', amount: 54, currency: 'EUR', coupon_released: false, points_reversed: 0 } })
    expect(released).toContain('The hold on your card has been released.')
    expect(released).not.toContain('coupon')
  })

  // refund.outcome stays the server's own truth, but 'none' would otherwise leave silence
  // for money that was recorded paid and never went through us at all.
  it('shows the same venue sentence in the result when the outcome is none for a paid-off-the-books booking', () => {
    const html = panel({ offer: 'none', stage: 'done', booking: { ...booking, paid_online: false }, result: { outcome: 'none', amount: 0, currency: 'EUR', coupon_released: false, points_reversed: 0 } })
    expect(html).toContain('Your booking is cancelled.')
    expect(html).toContain('This booking was paid at Numa. They will arrange any refund with you.')
  })

  it('says nothing extra when the outcome is none and there was no off-book payment either', () => {
    const html = panel({ offer: 'none', stage: 'done', booking: { ...booking, payment_status: 'unpaid', paid_online: false }, result: { outcome: 'none', amount: 0, currency: 'EUR', coupon_released: false, points_reversed: 0 } })
    expect(html).toContain('Your booking is cancelled.')
    expect(html).not.toContain('paid at')
  })

  it('says when points are taken back, and says nothing about points when none were', () => {
    const withPoints = panel({ offer: 'none', stage: 'done', result: { outcome: 'refunded', amount: 54, currency: 'EUR', coupon_released: false, points_reversed: 120 } })
    expect(withPoints).toContain('We have taken back 120 points.')

    const withoutPoints = panel({ offer: 'none', stage: 'done', result: { outcome: 'refunded', amount: 54, currency: 'EUR', coupon_released: false, points_reversed: 0 } })
    expect(withoutPoints).not.toContain('taken back')
  })

  it('says when free cancellation ended and how to reach the venue', () => {
    const html = panel({ offer: 'ended', booking: { ...booking, can_cancel: false, cancel_deadline: '2026-09-30T07:30:00Z' } })
    expect(html).toContain('Free cancellation ended')
    expect(html).toContain('To change or cancel, contact Numa.')
    expect(html).toContain('href="mailto:hi@numa.test"')
    expect(html).not.toContain('Cancel booking')
  })

  it('points to the venue for a booking that cannot be cancelled here', () => {
    const html = panel({ offer: 'contact', booking: { ...booking, can_cancel: false, cancel_deadline: null } })
    expect(html).toContain('To change or cancel, contact Numa.')
    expect(html).not.toContain('Free cancellation')
  })

  it('says nothing for a booking that is over', () => {
    expect(panel({ offer: 'none', booking: { ...booking, can_cancel: false, status: 'completed' } })).toBe('')
  })
})
