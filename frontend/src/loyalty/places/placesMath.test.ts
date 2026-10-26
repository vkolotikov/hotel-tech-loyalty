import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { ApiFailure } from '../lib/api'
import type { Entry, Place } from './placesApi'
import {
  countsWords, entryTime, entryWords, pickedDay, placeBody, placeFormOf, placeProblems, removedWords, serverPlaceProblems, shiftDay, tierPlaces,
  tierPlacesWords, todayWords, whoMayEnter, type Words,
} from './placesMath'

const place = (more: Partial<Place> = {}): Place => ({
  id: 1, name: 'Main entrance', description: null, admits: 'all', tiers: [], is_active: true, sort_order: 1, today: { granted: 0, denied: 0 }, ...more,
})
const gold = { id: 2, name: 'Gold', color: '#c9a227' }
const platinum = { id: 3, name: 'Platinum', color: '#e5e4e2' }
const failure = (code: string, fields?: Record<string, string[]>): ApiFailure => ({ status: 422, code, extra: {}, ...(fields ? { fields } : {}) })

describe('the place dialog (release 8 §1)', () => {
  it('starts a new place as every member, switched on, and reads a saved one back', () => {
    expect(placeFormOf(null)).toEqual({ name: '', admits: 'all', tier_ids: [], description: '', is_active: true })
    expect(placeFormOf(place({ name: 'Spa', admits: 'tiers', tiers: [gold, platinum], description: 'Pool', is_active: false })))
      .toEqual({ name: 'Spa', admits: 'tiers', tier_ids: [2, 3], description: 'Pool', is_active: false })
  })

  it('refuses an empty or long name, another place’s name in any case, no tier ticked and a long description', () => {
    const places = [place(), place({ id: 4, name: 'Spa' })]
    const form = placeFormOf(null)
    expect(placeProblems({ ...form, name: '  ' }, places, null)).toEqual({ name: 'name' })
    expect(placeProblems({ ...form, name: 'a'.repeat(81) }, places, null)).toEqual({ name: 'name_long' })
    expect(placeProblems({ ...form, name: ' spa ' }, places, null)).toEqual({ name: 'name_taken' })
    // Its own name is free, in any case.
    expect(placeProblems({ ...form, name: 'SPA' }, places, 4)).toEqual({})
    expect(placeProblems({ ...form, name: 'Lounge', admits: 'tiers' }, places, null)).toEqual({ tier_ids: 'tiers' })
    expect(placeProblems({ ...form, name: 'Lounge', admits: 'tiers', tier_ids: [2] }, places, null)).toEqual({})
    expect(placeProblems({ ...form, name: 'Lounge', description: 'a'.repeat(301) }, places, null)).toEqual({ description: 'description' })
  })

  it('sends the trimmed fields with its key, and no tiers for every member', () => {
    const form = { name: ' VIP lounge ', admits: 'tiers' as const, tier_ids: [3, 2], description: '  ', is_active: true }
    expect(placeBody(form, 'k1')).toEqual({ name: 'VIP lounge', description: null, admits: 'tiers', tier_ids: [2, 3], is_active: true, idempotency_key: 'k1' })
    expect(placeBody({ ...form, admits: 'all', description: ' Bar ' }, 'k2')).toEqual({ name: 'VIP lounge', description: 'Bar', admits: 'all', tier_ids: [], is_active: true, idempotency_key: 'k2' })
  })

  it('marks the server’s fields and a taken name in the dialog’s words', () => {
    expect(serverPlaceProblems(null)).toEqual({})
    expect(serverPlaceProblems(failure('invalid', { name: ['x'], 'tier_ids.0': ['x'], description: ['x'] }))).toEqual({ name: 'name', tier_ids: 'tiers', description: 'description' })
    expect(serverPlaceProblems(failure('name_taken'))).toEqual({ name: 'name_taken' })
  })
})

describe('a place as its card shows it', () => {
  it('says who may enter: every member, or the tiers in the order the server sent', () => {
    expect(whoMayEnter(place())).toEqual({ kind: 'every' })
    expect(whoMayEnter(place({ admits: 'tiers', tiers: [gold, platinum] }))).toEqual({ kind: 'tiers', tiers: [gold, platinum] })
  })

  it('counts today’s scans, and says so when there were none', () => {
    expect(todayWords({ granted: 0, denied: 0 })).toEqual(['loyalty.places.today_none', 'No entries today'])
    expect(todayWords({ granted: 12, denied: 1 })).toEqual(['loyalty.places.today', 'Today: {{granted}} in · {{denied}} refused', { granted: '12', denied: '1' }])
    expect(countsWords({ granted: 0, denied: 2 })[2]).toEqual({ granted: '0', denied: '2' })
    // Counts are grouped as the language groups numbers.
    expect(todayWords({ granted: 1234, denied: 5 }, 'en')[2]).toEqual({ granted: '1,234', denied: '5' })
    expect(countsWords({ granted: 12345, denied: 0 }, 'de')[2]).toEqual({ granted: '12.345', denied: '0' })
    expect(countsWords({ granted: 0, denied: 0 })[0]).toBe('loyalty.places.entries.none')
  })
})

describe('the places a tier can enter (one source: the places list)', () => {
  const places = [
    place({ id: 1, name: 'Main entrance' }),
    place({ id: 2, name: 'VIP lounge', admits: 'tiers', tiers: [gold, platinum] }),
    place({ id: 3, name: 'Spa', admits: 'tiers', tiers: [platinum] }),
    place({ id: 4, name: 'Old bar', is_active: false }),
  ]

  it('names the places switched on that let every member or this tier in', () => {
    expect(tierPlaces(places, 2)).toEqual({ kind: 'some', names: ['Main entrance', 'VIP lounge'] })
    expect(tierPlaces(places, 3)).toEqual({ kind: 'every' })
    expect(tierPlaces([places[1], places[2]], 1)).toEqual({ kind: 'nowhere' })
  })

  it('says nothing while there is no place switched on', () => {
    expect(tierPlaces(undefined, 2)).toBeNull()
    expect(tierPlaces([], 2)).toBeNull()
    expect(tierPlaces([places[3]], 2)).toBeNull()
  })

  it('reads as a line', () => {
    expect(tierPlacesWords({ kind: 'some', names: ['Main entrance', 'Spa'] })).toEqual(['loyalty.places.tier.some', 'Can enter: {{places}}', { places: 'Main entrance, Spa' }])
    expect(tierPlacesWords({ kind: 'every' })[1]).toBe('Can enter: every place')
    expect(tierPlacesWords({ kind: 'nowhere' })[1]).toBe('Can enter: no place yet')
  })
})

describe('an entry', () => {
  const entry = (more: Partial<Entry>): Entry => ({ id: 1, at: '2026-10-05T19:02', member: { id: 7, name: 'Ada', member_number: 'LS-1' }, granted: true, reason: 'welcome', by: 'Sam', ...more })

  it('says why in words: the verdict for a member, the code’s refusal without one', () => {
    expect(entryWords(entry({}))).toEqual(['loyalty.places.reason.welcome', 'Let in'])
    expect(entryWords(entry({ granted: false, reason: 'expired' }))).toEqual(['loyalty.places.reason.expired', 'Membership expired'])
    expect(entryWords(entry({ granted: false, reason: 'tier_not_allowed' }))[1]).toBe('Tier not let in here')
    expect(entryWords(entry({ granted: false, reason: 'something_new' }))).toEqual(['loyalty.places.reason.unknown', 'Not let in'])
    // The same code, without a member, is the QR code's, not the membership's.
    expect(entryWords(entry({ member: null, granted: false, reason: 'expired' }))).toEqual(['loyalty.places.refusal.expired', 'QR code had expired'])
    expect(entryWords(entry({ member: null, granted: false, reason: 'not_found' }))[1]).toBe('No member has this card or number')
    expect(entryWords(entry({ member: null, granted: false, reason: 'odd' }))[0]).toBe('loyalty.places.refusal.unknown')
  })

  it('shows its time from the venue’s wall clock as written', () => {
    expect(entryTime('2026-10-05T19:02')).toBe('19:02')
    expect(entryTime('2026-10-05T00:00')).toBe('00:00')
  })
})

describe('the entries’ day', () => {
  it('moves a day at a time, never past the venue’s today', () => {
    expect(shiftDay('2026-10-05', -1, '2026-10-05')).toBe('2026-10-04')
    expect(shiftDay('2026-10-01', -1, '2026-10-05')).toBe('2026-09-30')
    expect(shiftDay('2026-10-05', 1, '2026-10-05')).toBe('2026-10-05')
    expect(shiftDay('2026-10-04', 1, '2026-10-05')).toBe('2026-10-05')
  })

  it('takes a picked day, or today for an empty or later one', () => {
    expect(pickedDay('2026-09-12', '2026-10-05')).toBe('2026-09-12')
    expect(pickedDay('', '2026-10-05')).toBe('2026-10-05')
    expect(pickedDay('2026-12-01', '2026-10-05')).toBe('2026-10-05')
  })

  it('says what a removal did', () => {
    expect(removedWords('deleted', 'Spa')).toEqual(['loyalty.places.removed', '{{name}} was removed.', { name: 'Spa' }])
    expect(removedWords('switched_off', 'Spa')[0]).toBe('loyalty.places.removed_off')
  })
})

describe('the lines built here are in the five bundles, the English equal to the code', () => {
  const words: Words[] = [
    todayWords({ granted: 0, denied: 0 }), todayWords({ granted: 1, denied: 1 }), countsWords({ granted: 0, denied: 0 }), countsWords({ granted: 1, denied: 0 }),
    tierPlacesWords({ kind: 'every' }), tierPlacesWords({ kind: 'nowhere' }), tierPlacesWords({ kind: 'some', names: [] }),
    removedWords('deleted', ''), removedWords('switched_off', ''),
  ]
  const at = (json: unknown, key: string): unknown => key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
  const bundle = (lang: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', `places.${lang}.json`), 'utf8'))

  it('holds each key in every language', () => {
    for (const lang of ['en', 'ru', 'de', 'fr', 'es']) {
      const json = bundle(lang)
      expect(words.filter(([key]) => typeof at(json, key.replace(/^loyalty\.places\./, '')) !== 'string').map(([key]) => key), lang).toEqual([])
    }
    const en = bundle('en')
    for (const [key, english] of words) expect(at(en, key.replace(/^loyalty\.places\./, '')), key).toBe(english)
  })
})
