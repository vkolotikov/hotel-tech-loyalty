import { describe, expect, it } from 'vitest'
import { NEEDS_CONFIRM, consequenceLines, pointsLine } from './consequences'
import type { ActionInfo, ActionKey } from '../lib/types'

const action = (key: ActionKey, c: Partial<ActionInfo['consequences']> = {}): ActionInfo => ({
  key, allowed: true, consequences: { payment: 'none', points: null, coupon: 'none', message: 'none', ...c },
})
const keys = (a: ActionInfo) => consequenceLines(a).map(l => l.key)

describe('consequenceLines', () => {
  it('a cancellation with a held card says the hold is released and that nobody is told', () => {
    expect(keys(action('cancel', { payment: 'hold_will_be_released' }))).toEqual([
      'appointments.consequence.payment.hold_will_be_released',
      'appointments.consequence.no_message',
    ])
  })

  it('a cancellation of a paid booking warns that nothing is refunded', () => {
    const lines = consequenceLines(action('cancel', { payment: 'captured_not_refunded', coupon: 'not_returned' }))
    expect(lines.map(l => [l.key, l.tone])).toEqual([
      ['appointments.consequence.payment.captured_not_refunded', 'warning'],
      ['appointments.consequence.coupon_not_returned', 'warning'],
      ['appointments.consequence.no_message', 'plain'],
    ])
  })

  it('promises no refund flag — nothing raises one for a payment already taken; it says where the refund is made', () => {
    const [line] = consequenceLines(action('cancel', { payment: 'captured_not_refunded' }))
    expect(line.fallback).toContain('NOT refunded automatically')
    expect(line.fallback).toContain('in Stripe')
    expect(line.fallback).not.toMatch(/flag/i)
  })

  it('a hold too old for the capture job is said to have lapsed — on confirm, cancel and no-show alike', () => {
    for (const key of ['confirm', 'cancel', 'no_show'] as const) {
      const [line] = consequenceLines(action(key, { payment: 'hold_expired' }))
      expect(line.key).toBe('appointments.consequence.payment.hold_expired')
      expect(line.fallback).toMatch(/nothing will be charged/i)
      expect(line.tone).toBe('warning')
    }
  })

  it('a cancellation with no online payment says so plainly', () => {
    expect(keys(action('cancel'))).toEqual(['appointments.consequence.payment.none', 'appointments.consequence.no_message'])
  })

  it('confirming a request with a held card warns that the card will be charged', () => {
    const lines = consequenceLines(action('confirm', { payment: 'hold_will_be_charged' }))
    expect(lines[0]).toMatchObject({ key: 'appointments.consequence.payment.hold_will_be_charged', tone: 'warning' })
  })

  it('completing states the points, or the reason there are none', () => {
    expect(consequenceLines(action('complete', { points: { points: 900, reason: null } }))[0])
      .toMatchObject({ key: 'appointments.consequence.points_will_award', vars: { points: 900 } })
    expect(keys(action('complete', { points: { points: 0, reason: 'not_a_member' } }))).toEqual(['appointments.points_reason.not_a_member'])
  })

  it('marking paid at the venue says no money is moved', () => {
    expect(keys(action('mark_paid_at_venue', { payment: 'marked_only' }))).toEqual(['appointments.consequence.payment.marked_only'])
  })

  it('asks for confirmation exactly where money, points or a final status are involved', () => {
    expect([...NEEDS_CONFIRM].sort()).toEqual(['cancel', 'complete', 'confirm', 'mark_paid_at_venue', 'no_show'])
  })
})

describe('pointsLine', () => {
  it('is null without a preview', () => {
    expect(pointsLine(null)).toBeNull()
  })
})
