import { describe, expect, it } from 'vitest'
import type { Can } from '../lib/types'
import {
  EXTENSIONS, addMonthsTo, dateProblem, daysBetween, extendBody, extendedEnd, headlineOf, setBody, stateTone, timeLeft, validityActions,
} from './validityMath'

const can = (manager: boolean): Can => ({
  award: true, redeem: true, reverse: manager, manage_program: manager, manage_rewards: false, manage_members: manager,
  view_insights: false, manage_campaigns: false, manage_app: false,
})

describe('a membership’s end date (release 8 §3)', () => {
  it('is changed by a manager only, and never on a deleted member', () => {
    expect(validityActions(can(true), {})).toEqual({ change: true })
    expect(validityActions(can(false), {})).toEqual({ change: false })
    expect(validityActions(can(true), { is_erased: true })).toEqual({ change: false })
  })

  it('says each Extend choice’s new end from the later of today and the current end, as the server works it out', () => {
    const today = '2026-10-05'
    expect(EXTENSIONS.map(c => extendedEnd(null, today, c))).toEqual(['2026-11-05', '2027-01-05', '2027-04-05', '2027-10-05'])
    expect(extendedEnd('2027-10-03', today, '1y')).toBe('2028-10-03')
    expect(extendedEnd('2026-09-01', today, '1m')).toBe('2026-11-05')
    expect(extendedEnd(today, today, '1m')).toBe('2026-11-05')
    // A month without the day ends on its last day (the server's addMonthsNoOverflow).
    expect(addMonthsTo('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonthsTo('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsTo('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('counts days and the time left in whole calendar parts', () => {
    expect(daysBetween('2026-10-05', '2026-10-19')).toBe(14)
    expect(daysBetween('2026-10-05', '2026-10-04')).toBe(-1)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(timeLeft('2026-10-05', '2027-12-08')).toEqual({ years: 1, months: 2, days: 3 })
    expect(timeLeft('2026-10-05', '2026-11-05')).toEqual({ years: 0, months: 1, days: 0 })
    expect(timeLeft('2026-10-05', '2026-10-20')).toEqual({ years: 0, months: 0, days: 15 })
    expect(timeLeft('2026-10-05', '2026-10-01')).toEqual({ years: 0, months: 0, days: 0 })
  })

  it('reads the card’s first line from the server’s state', () => {
    const today = '2026-10-05'
    expect(headlineOf({ valid_until: null, membership_state: 'active', is_active: true }, today)).toEqual({ kind: 'none' })
    expect(headlineOf({ valid_until: '2027-12-08', membership_state: 'active', is_active: true }, today))
      .toEqual({ kind: 'active', until: '2027-12-08', left: { years: 1, months: 2, days: 3 } })
    expect(headlineOf({ valid_until: '2026-10-10', membership_state: 'expiring', is_active: true }, today)).toEqual({ kind: 'expiring', until: '2026-10-10', days: 5 })
    expect(headlineOf({ valid_until: '2026-10-05', membership_state: 'expiring', is_active: true }, today)).toEqual({ kind: 'expiring', until: '2026-10-05', days: 0 })
    expect(headlineOf({ valid_until: '2026-10-03', membership_state: 'expired', is_active: true }, today)).toEqual({ kind: 'expired', until: '2026-10-03' })
    expect(headlineOf({ valid_until: '2026-10-03', membership_state: 'off', is_active: false }, today)).toEqual({ kind: 'off', until: '2026-10-03' })
    // A row from before release 8 has no state: an active member without an end date.
    expect(headlineOf({ is_active: true }, today)).toEqual({ kind: 'none' })
  })

  it('wears the state’s tone: green, amber, red, grey', () => {
    expect([stateTone('active'), stateTone('expiring'), stateTone('expired'), stateTone('off')]).toEqual(['fulfilled', 'pending', 'declined', 'cancelled'])
  })

  it('stops Set a date on no day or a past one, and sends exactly one change with its key', () => {
    expect(dateProblem('', '2026-10-05')).toBe('date')
    expect(dateProblem('3 Oct', '2026-10-05')).toBe('date')
    expect(dateProblem('2026-10-04', '2026-10-05')).toBe('past')
    expect(dateProblem('2026-10-05', '2026-10-05')).toBeNull()
    expect(setBody('2027-10-03', 'k1')).toEqual({ valid_until: '2027-10-03', idempotency_key: 'k1' })
    expect(setBody(null, 'k2')).toEqual({ valid_until: null, idempotency_key: 'k2' })
    expect(extendBody('6m', 'k3')).toEqual({ extend: '6m', idempotency_key: 'k3' })
  })
})
