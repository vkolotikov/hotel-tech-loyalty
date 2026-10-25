import { describe, expect, it } from 'vitest'
import type { Can, Ways } from '../lib/types'
import {
  creditActions, creditAfter, creditProblem, currencyDecimals, doneMessage, lineKind, parseAmount, showsCredit, showsNote, signedMoney, toCents,
} from './creditMath'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const ways = (cashback: boolean): Ways => ({ stamps: false, stamps_per_card: 10, checkin: false, checkin_points: 0, desk_earn: false, cashback, cashback_percent: 5, setup_done: true })

describe('when credit shows', () => {
  it('shows while the venue uses cashback, or while the member still holds some', () => {
    expect(showsCredit(ways(true), 0)).toBe(true)
    expect(showsCredit(ways(false), 12.4)).toBe(true)
    expect(showsCredit(ways(false), 0)).toBe(false)
    expect(showsCredit(undefined, undefined)).toBe(false)
    expect(showsCredit(undefined, 0.01)).toBe(true)
  })

  it('offers Use credit to whoever may redeem on a balance, Adjust to a manager, and neither on a deleted member', () => {
    expect(creditActions(can(), { credit_balance: 5 })).toEqual({ use: true, adjust: false })
    expect(creditActions(can(), { credit_balance: 0 })).toEqual({ use: false, adjust: false })
    expect(creditActions(can({ redeem: false, reverse: true }), { credit_balance: 5 })).toEqual({ use: false, adjust: true })
    expect(creditActions(can({ reverse: true }), {})).toEqual({ use: false, adjust: true })
    expect(creditActions(can({ reverse: true }), { credit_balance: 5, is_erased: true })).toEqual({ use: false, adjust: false })
  })
})

describe('amounts', () => {
  it('reads a typed amount with a point or a comma, signed', () => {
    expect([parseAmount('12.40'), parseAmount(' 12,4 '), parseAmount('-5'), parseAmount('−2.5'), parseAmount('.5')]).toEqual([12.4, 12.4, -5, -2.5, 0.5])
    expect([parseAmount(''), parseAmount('abc'), parseAmount('1.2.3'), parseAmount('1e3'), parseAmount('--1')]).toEqual([null, null, null, null, null])
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it('knows a zero-decimal currency the way the browser does', () => {
    expect([currencyDecimals('EUR'), currencyDecimals('JPY'), currencyDecimals('KRW'), currencyDecimals('??')]).toEqual([2, 0, 0, 2])
  })

  it('stops Use credit on nothing, too many decimals, too much, or more than the balance', () => {
    expect(creditProblem('use', '', '', 12.4, 2)).toBe('amount')
    expect(creditProblem('use', '0', '', 12.4, 2)).toBe('amount')
    expect(creditProblem('use', '-3', '', 12.4, 2)).toBe('amount')
    expect(creditProblem('use', '1.234', '', 12.4, 2)).toBe('decimals')
    expect(creditProblem('use', '1.5', '', 100, 0)).toBe('decimals')
    expect(creditProblem('use', '12.41', '', 12.4, 2)).toBe('over_balance')
    expect(creditProblem('use', '10000001', '', 2e7, 2)).toBe('too_large')
    expect(creditProblem('use', '12.40', '', 12.4, 2)).toBeNull()
    expect(creditProblem('use', '0.3', '', 0.1 + 0.2, 2)).toBeNull()
  })

  it('stops Adjust on zero, below zero, or without a reason; a minus takes credit off', () => {
    expect(creditProblem('adjust', '0', 'Goodwill', 5, 2)).toBe('amount')
    expect(creditProblem('adjust', '-5.01', 'Too far', 5, 2)).toBe('below_zero')
    expect(creditProblem('adjust', '-5', ' x ', 5, 2)).toBe('reason')
    expect(creditProblem('adjust', '-5', 'Typed too much', 5, 2)).toBeNull()
    expect(creditProblem('adjust', '20', 'Goodwill', 0, 2)).toBeNull()
  })

  it('says the credit after the step, in cents, or nothing while it cannot be sent', () => {
    expect(creditAfter('use', 12.4, '4.9', 2)).toBe(7.5)
    expect(creditAfter('use', 0.3, '0.1', 2)).toBe(0.2)
    expect(creditAfter('use', 12.4, '13', 2)).toBeNull()
    expect(creditAfter('adjust', 10, '-2.4', 2)).toBe(7.6)
    expect(creditAfter('adjust', 10, '', 2)).toBeNull()
  })
})

describe('lines', () => {
  const line = (type: string, reference_type: string | null, note: string | null = null) => ({ type, reference_type, note })

  it('names each kind of line from its type and what it was for', () => {
    expect([
      lineKind(line('earn', 'service_booking')), lineKind(line('earn', 'booking_mirror')), lineKind(line('earn', 'scan_event')), lineKind(line('earn', null)),
      lineKind(line('spend', null)), lineKind(line('reverse', 'service_booking')), lineKind(line('adjust', 'member_merge')), lineKind(line('adjust', 'member_erasure')),
      lineKind(line('adjust', null)), lineKind(line('bonus', null)),
    ]).toEqual(['earn_appointment', 'earn_stay', 'earn_purchase', 'earn', 'spend', 'reverse', 'merge', 'forfeit', 'adjust', 'other'])
  })

  it('shows only the notes a person wrote', () => {
    expect(showsNote(line('spend', null, 'Lunch for two'))).toBe(true)
    expect(showsNote(line('adjust', null, 'Goodwill'))).toBe(true)
    expect(showsNote(line('spend', null, '  '))).toBe(false)
    expect(showsNote(line('earn', 'service_booking', '5% cashback on 45.00 EUR'))).toBe(false)
    expect(showsNote(line('adjust', 'member_merge', 'Merged from member #LS-000001'))).toBe(false)
    expect(showsNote(line('adjust', 'member_erasure', 'Forfeited at erasure'))).toBe(false)
  })

  it('writes signed money with a true minus sign', () => {
    expect([signedMoney(2.25, 'EUR', 'en'), signedMoney(-5, 'EUR', 'en'), signedMoney(0, 'EUR', 'en'), signedMoney(61, 'JPY', 'en')]).toEqual(['+€2.25', '−€5', '€0', '+¥61'])
  })

  it('says what a finished step did', () => {
    const after = (amount: number, balance: number) => ({ line: { amount }, balance, currency: 'EUR' })
    expect(doneMessage('use', after(-4.9, 7.5), 'en')).toEqual(['loyalty.credit.done.use', 'Took {{amount}} off. Credit now: {{balance}}.', { amount: '€4.90', balance: '€7.50' }])
    expect(doneMessage('adjust', after(-2.4, 10), 'en')).toEqual(['loyalty.credit.done.adjust', 'Corrected by {{amount}}. Credit now: {{balance}}.', { amount: '−€2.40', balance: '€10' }])
  })
})
