import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'fresh-key' }))

import { balanceAfter, cleanCode, errorKey, keyFor, looksLikeCode, membershipState, pointsFrom, pointsProblem, REPLAY_MS, verdictKey } from './desk'
import { ago, day, greeting, initials, spacedNumber } from './format'
import { failureFrom } from './failure'
import { BUNDLES, LANGUAGES, languageOf, say } from './i18n'
import { en } from './i18n/en'
import type { MemberRow, Verdict } from './types'

const member = (more: Partial<MemberRow> = {}): MemberRow => ({
  id: 1, name: 'Ada Lovelace', email: null, phone: null, member_number: 'LS-000001', tier_id: 2, points: 120, lifetime_points: 400,
  is_active: true, joined_at: null, last_activity_at: null, ...more,
})

describe('the desk', () => {
  it('reads a code as typed or scanned, and tells a code from a search', () => {
    expect(cleanCode('﻿ 04A2B3C4 ​')).toBe('04A2B3C4')
    expect(looksLikeCode('LS-000123')).toBe(true)
    expect(looksLikeCode('04:a2:b3:c4')).toBe(true)
    expect(looksLikeCode('Ada Lovelace')).toBe(false)
    expect(looksLikeCode('ada@example.test')).toBe(false)
    expect(looksLikeCode('Ada')).toBe(false)
  })

  it('sends an unanswered scan again with its own key, never a fresh one, for a while', () => {
    const last = { code: 'LS-1', where: 'desk', key: 'k1', at: 1000 }
    const fresh = () => 'k2'
    expect(keyFor('LS-1', 'desk', last, 1000 + 5_000, fresh)).toBe('k1')
    expect(keyFor('LS-1', 'place:3', last, 1000 + 5_000, fresh)).toBe('k2')
    expect(keyFor('LS-2', 'desk', last, 1000 + 5_000, fresh)).toBe('k2')
    expect(keyFor('LS-1', 'desk', last, 1000 + REPLAY_MS, fresh)).toBe('k2')
    expect(keyFor('LS-1', 'desk', null, 0, fresh)).toBe('k2')
  })

  it('checks a points form as the server does', () => {
    expect(pointsProblem('award', 50, 'Visit', 0)).toBeNull()
    expect(pointsProblem('award', 0, 'Visit', 0)).toBe('points.tooMany')
    expect(pointsProblem('award', 100_001, 'Visit', 0)).toBe('points.tooMany')
    expect(pointsProblem('award', 50, ' x ', 0)).toBe('points.reasonShort')
    expect(pointsProblem('redeem', 50, 'Reward', 40)).toBe('points.tooFew')
    expect(pointsProblem('redeem', 40, 'Reward', 40)).toBeNull()
    expect(balanceAfter('award', 50, 120)).toBe(170)
    expect(balanceAfter('redeem', 50, 120)).toBe(70)
    expect(pointsFrom('1 500')).toBe(1500)
    expect(pointsFrom('1,500 pts')).toBe(1500)
    expect(pointsFrom('')).toBe(0)
  })

  it('tells a door verdict by its reason, an unknown reason as a plain refusal', () => {
    const verdict = (more: Partial<Verdict>): Verdict => ({ granted: false, reason: 'expired', valid_until: null, expires_in_days: null, tier: null, allowed_tiers: [], ...more })
    expect(verdictKey(verdict({ granted: true, reason: 'welcome' }))).toBe('verdict.welcome')
    expect(verdictKey(verdict({ reason: 'tier_not_allowed' }))).toBe('verdict.tier_not_allowed')
    expect(verdictKey(verdict({ reason: 'something_new' }))).toBe('verdict.refused')
  })

  it('words every failure, a missing right the same way whatever the server called it', () => {
    expect(errorKey('not_enough_points')).toBe('error.not_enough_points')
    expect(errorKey('manager_only')).toBe('error.not_allowed')
    expect(errorKey('no_capability')).toBe('error.not_allowed')
    expect(errorKey('a_code_from_tomorrow')).toBe('error.unknown')
  })

  it('shows the membership state the server gives, else on or off', () => {
    expect(membershipState(member({ membership_state: 'expiring' }))).toBe('expiring')
    expect(membershipState(member())).toBe('active')
    expect(membershipState(member({ is_active: false }))).toBe('off')
  })
})

describe('failures', () => {
  it('reads the server code, field errors, a missing token and no answer', () => {
    expect(failureFrom(422, { error: 'not_enough_points', message: 'x', balance: 3 })).toEqual({ status: 422, code: 'not_enough_points', extra: { balance: 3 } })
    expect(failureFrom(422, { message: 'x', errors: { reason: ['short'] } }).code).toBe('invalid')
    expect(failureFrom(401, { message: 'Unauthenticated.' }).code).toBe('unauthenticated')
    expect(failureFrom(404, null).code).toBe('not_found')
    expect(failureFrom(500, '<html>').code).toBe('unknown')
    expect(failureFrom(0, null).code).toBe('network')
    // A server sentence is never taken for a code.
    expect(failureFrom(403, { error: 'Access denied' }).code).toBe('unknown')
  })
})

describe('formatting', () => {
  it('says how long ago, greets by the hour, and names a member by initials', () => {
    const now = Date.parse('2026-10-31T12:00:00Z')
    expect(ago('2026-10-31T11:59:40Z', now)).toEqual({ key: 'time.now', n: 0 })
    expect(ago('2026-10-31T11:15:00Z', now)).toEqual({ key: 'time.minutes', n: 45 })
    expect(ago('2026-10-31T07:00:00Z', now)).toEqual({ key: 'time.hours', n: 5 })
    expect(ago('2026-10-28T12:00:00Z', now)).toEqual({ key: 'time.days', n: 3 })
    expect(ago(null, now)).toBeNull()
    expect(greeting(8)).toBe('home.morning')
    expect(greeting(13)).toBe('home.afternoon')
    expect(greeting(20)).toBe('home.evening')
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('  grace  ')).toBe('G')
    expect(spacedNumber('12345678')).toBe('1234 5678')
    expect(spacedNumber('LS-000123')).toBe('LS-000123')
    expect(spacedNumber(null)).toBe('—')
  })

  it('shows a venue day as the day it is, whatever the phone’s zone', () => {
    expect(day('2026-12-31', 'en')).toContain('31')
    expect(day('2026-12-31', 'en')).toContain('2026')
  })
})

describe('the five languages', () => {
  const keys = Object.keys(en).sort()

  it('have every key of the English and keep every placeholder', () => {
    for (const language of LANGUAGES) {
      expect(Object.keys(BUNDLES[language]).sort(), language).toEqual(keys)
      for (const key of keys) {
        const want = (en[key as keyof typeof en].match(/\{\{\w+\}\}/g) ?? []).sort()
        const have = (BUNDLES[language][key as keyof typeof en].match(/\{\{\w+\}\}/g) ?? []).sort()
        expect(have, `${language} ${key}`).toEqual(want)
        expect(BUNDLES[language][key as keyof typeof en].trim(), `${language} ${key}`).not.toBe('')
      }
    }
  })

  it('address staff as usted in Spanish', () => {
    const spanish = Object.values(BUNDLES.es).join(' ')
    expect(spanish).not.toMatch(/\b(tú|tu|tus|puedes|tienes|quieres|elige|escribe)\b/i)
  })

  it('pick the phone’s language when it is one of the five, and fill placeholders', () => {
    expect(languageOf('ru-LV')).toBe('ru')
    expect(languageOf('pt-BR')).toBe('en')
    expect(languageOf(null)).toBe('en')
    expect(say('en', 'points.confirmAward', { n: 50 })).toBe('Give 50 points')
    expect(say('de', 'home.waiting', { n: 3 })).toBe('3 offen')
  })
})
