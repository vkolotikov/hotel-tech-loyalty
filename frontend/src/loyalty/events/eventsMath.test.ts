import { describe, expect, it } from 'vitest'
import {
  bodyOf, checkInSentence, counted, listOf, moreItems, outsideLine, dateBlock, durationMinutes, eventActions, formOf, formProblems, newForm, numbersLine, peopleGroups, personLine,
  phaseTone, scanContextFor, scanPathFor, doorPathFor, tabAfter, tabFrom, timeRange, wallNow, whenLine, whereOf, type Say,
} from './eventsMath'
import type { CheckInAnswer, EventPerson, LoyaltyEventRow } from './types'

/** The `t` of the tests: the English fallback, the one-form for a count of 1, the {{names}} filled. */
const say: Say = (_key, fallback, vars = {}) => {
  const text = vars.count === 1 && typeof vars.defaultValue_one === 'string' ? vars.defaultValue_one : fallback
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ''))
}

const event = (more: Partial<LoyaltyEventRow> = {}): LoyaltyEventRow => ({
  id: 7, title: 'Wine tasting', description: null, starts_at: '2026-10-09T18:00', ends_at: '2026-10-09T21:00', place: null, location: 'The terrace',
  admits: 'all', tiers: [], points: 50, counts_as_visit: true, sign_up: true, walk_ins: true, capacity: 40, status: 'published', phase: 'upcoming',
  counts: { signed_up: 12, checked_in: 0, walk_ins: 0, room_left: 28 }, ...more,
})

describe('the tabs', () => {
  it('reads the tab from the address and moves with the keys', () => {
    expect(tabFrom('')).toBe('upcoming')
    expect(tabFrom('?tab=drafts')).toBe('drafts')
    expect(tabFrom('?tab=nonsense')).toBe('upcoming')
    expect(tabAfter('upcoming', 'ArrowRight')).toBe('past')
    expect(tabAfter('upcoming', 'ArrowLeft')).toBe('drafts')
    expect(tabAfter('past', 'End')).toBe('drafts')
    expect(tabAfter('past', 'a')).toBeNull()
  })
})

describe('times as words, from the wall-clock strings', () => {
  it('writes the date block, the times and the whole when without moving the day', () => {
    expect(dateBlock('2026-10-09T18:00', 'en')).toEqual({ weekday: 'Fri', day: '9', month: 'Oct' })
    expect(timeRange('2026-10-09T18:00', '2026-10-09T21:00', 'en')).toBe('18:00–21:00')
    expect(timeRange('2026-10-09T22:00', '2026-10-10T02:00', 'en')).toBe('Fri, Oct 9, 22:00 – Sat, Oct 10, 02:00')
    expect(whenLine('2026-10-09T18:00', '2026-10-09T21:00', 'en')).toBe('Friday, October 9, 2026 · 18:00–21:00')
    expect(whenLine('2026-10-09T23:30', '2026-10-09T23:59', 'de')).toBe('Freitag, 9. Oktober 2026 · 23:30–23:59')
  })

  it('says where: the place, else the location', () => {
    expect(whereOf({ place: { id: 1, name: 'Main hall' }, location: null })).toBe('Main hall')
    expect(whereOf({ place: null, location: 'The terrace' })).toBe('The terrace')
    expect(whereOf({ place: null, location: null })).toBeNull()
  })

  it('writes the venue’s now as the server writes times', () => {
    expect(wallNow({ date: '2026-10-05', minutes: 9 * 60 + 5 })).toBe('2026-10-05T09:05')
  })
})

describe('numbers', () => {
  it('agree with their number', () => {
    expect(counted(say, 'places_left', 1, 'en')).toBe('1 place left')
    expect(counted(say, 'places_left', 1500, 'en')).toBe('1,500 places left')
    expect(counted(say, 'points_plus', 1, 'en')).toBe('+1 point')
  })

  it('a card says the sign-ups and the places left, then who came', () => {
    expect(numbersLine(event(), say, 'en')).toEqual(['12 signed up', '28 places left'])
    expect(numbersLine(event({ counts: { signed_up: 12, checked_in: 9, walk_ins: 2, room_left: 26 }, phase: 'on_now' }), say, 'en')).toEqual(['12 signed up', '9 checked in', '26 places left'])
    expect(numbersLine(event({ sign_up: false, capacity: null, counts: { signed_up: 0, checked_in: 0, walk_ins: 0, room_left: null } }), say, 'en')).toEqual([])
    expect(numbersLine(event({ sign_up: false, capacity: 30, counts: { signed_up: 0, checked_in: 0, walk_ins: 0, room_left: 30 }, phase: 'ended' }), say, 'en')).toEqual(['30 places'])
  })

  it('gives each phase its tone', () => {
    expect(['draft', 'upcoming', 'on_now', 'ended', 'cancelled'].map(p => phaseTone(p as LoyaltyEventRow['phase']))).toEqual(['pending', 'approved', 'fulfilled', 'cancelled', 'declined'])
  })
})

describe('what the event’s page offers', () => {
  const now = '2026-10-05T09:00'
  it('changes for those who may change events; check-in and sign-ups for everyone while it is on', () => {
    expect(eventActions(event(), true, now)).toEqual({ edit: true, publish: false, cancel: true, remove: false, checkIn: true, addMember: true, cancelSignUp: true })
    expect(eventActions(event(), false, now)).toEqual({ edit: false, publish: false, cancel: false, remove: false, checkIn: true, addMember: true, cancelSignUp: true })
    expect(eventActions(event({ sign_up: false }), false, now).addMember).toBe(false)
  })

  it('a draft is published or deleted, never checked into; an ended draft is not offered Publish', () => {
    const draft = event({ status: 'draft', phase: 'draft' })
    expect(eventActions(draft, true, now)).toMatchObject({ publish: true, remove: true, cancel: false, checkIn: false, addMember: false })
    expect(eventActions({ ...draft, ends_at: '2026-10-04T21:00' }, true, now).publish).toBe(false)
  })

  it('an ended or cancelled event is history', () => {
    expect(eventActions(event({ phase: 'ended' }), true, now)).toMatchObject({ edit: true, cancel: false, checkIn: false, addMember: false })
    expect(eventActions(event({ status: 'cancelled', phase: 'cancelled' }), true, now)).toMatchObject({ edit: false, cancel: false, checkIn: false })
  })

  it('keeps the rest of the actions in the More menu, in order, and only those this person may take', () => {
    expect(moreItems(eventActions(event(), true, now))).toEqual(['add', 'edit', 'cancel'])
    expect(moreItems(eventActions(event(), false, now))).toEqual(['add'])
    expect(moreItems(eventActions(event({ sign_up: false }), false, now))).toEqual([])
    expect(moreItems(eventActions(event({ status: 'draft', phase: 'draft' }), true, now))).toEqual(['edit', 'delete'])
    expect(moreItems(eventActions(event({ status: 'cancelled', phase: 'cancelled' }), true, now))).toEqual([])
  })

  it('hands Scan this event as its choice', () => {
    expect(JSON.parse(scanContextFor(7))).toEqual({ kind: 'event', id: 7 })
    expect(scanPathFor(7)).toBe('/loyalty/scan?event=7')
    expect(doorPathFor(7)).toBe('/loyalty/scan/door?event=7')
  })
})

describe('the one dialog', () => {
  it('starts tonight at 18:00–21:00 on the venue’s clock, tomorrow once 18:00 has passed', () => {
    const tonight = newForm({ date: '2026-10-05', minutes: 9 * 60 })
    expect([tonight.date, tonight.start, tonight.end, tonight.admits, tonight.points, tonight.counts_as_visit, tonight.sign_up, tonight.walk_ins]).toEqual(['2026-10-05', '18:00', '21:00', 'all', '50', true, false, true])
    expect(newForm({ date: '2026-10-05', minutes: 18 * 60 }).date).toBe('2026-10-06')
    expect(newForm({ date: '2026-12-31', minutes: 20 * 60 }).date).toBe('2027-01-01')
    expect(newForm({ date: '2026-10-05', minutes: 0 }, true)).toMatchObject({ where: 'none', place_id: null })
    expect(newForm({ date: '2026-10-05', minutes: 0 })).toMatchObject({ where: 'location', place_id: null })
  })

  it('sends what the server takes, and reads a saved event back', () => {
    const form = { ...newForm({ date: '2026-10-05', minutes: 0 }), title: ' Wine tasting ', location: ' The terrace ', sign_up: true, capacity: '40' }
    expect(bodyOf(form)).toEqual({
      title: 'Wine tasting', description: null, starts_at: '2026-10-05T18:00', ends_at: '2026-10-05T21:00', place_id: null, location: 'The terrace',
      admits: 'all', tier_ids: [], points: 50, counts_as_visit: true, sign_up: true, walk_ins: true, capacity: 40,
    })
    const saved = event({ starts_at: '2026-10-09T22:00', ends_at: '2026-10-10T02:00', place: { id: 3, name: 'Main hall' }, location: null, admits: 'tiers', tiers: [{ id: 5, name: 'Gold', color: null }, { id: 2, name: 'Silver', color: null }] })
    const back = formOf(saved)
    expect([back.date, back.start, back.later_day, back.end_date, back.end, back.where, back.place_id, back.tier_ids]).toEqual(['2026-10-09', '22:00', true, '2026-10-10', '02:00', 'place', 3, [2, 5]])
    expect(bodyOf(back)).toMatchObject({ starts_at: '2026-10-09T22:00', ends_at: '2026-10-10T02:00', place_id: 3, location: null, tier_ids: [2, 5] })
  })

  it('without sign-up, walk-ins must be welcome: the dialog stops before sending', () => {
    expect(bodyOf({ ...newForm({ date: '2026-10-05', minutes: 0 }), sign_up: false, walk_ins: false }).walk_ins).toBe(false)
    expect(formProblems({ ...newForm({ date: '2026-10-05', minutes: 0 }), title: 'x', sign_up: false, walk_ins: false })).toEqual({ walk_ins: 'walk_ins' })
  })

  it('says what is wrong before sending', () => {
    const ok = { ...newForm({ date: '2026-10-05', minutes: 0 }), title: 'Yoga' }
    expect(formProblems(ok)).toEqual({})
    expect(formProblems({ ...ok, title: ' ' })).toEqual({ title: 'title' })
    expect(formProblems({ ...ok, end: '17:00' })).toEqual({ end: 'ends_at' })
    expect(formProblems({ ...ok, end: '02:00', later_day: true, end_date: '2026-10-06' })).toEqual({})
    expect(formProblems({ ...ok, later_day: true, end_date: '2026-10-19', end: '18:00' })).toEqual({})
    expect(formProblems({ ...ok, later_day: true, end_date: '2026-10-19', end: '18:01' })).toEqual({ end: 'too_long' })
    expect(formProblems({ ...ok, start: '' })).toEqual({ start: 'start' })
    expect(formProblems({ ...ok, admits: 'tiers', tier_ids: [] })).toEqual({ tier_ids: 'tier_ids' })
    expect(formProblems({ ...ok, points: '100001' })).toEqual({ points: 'points' })
    expect(formProblems({ ...ok, points: '2.5' })).toEqual({ points: 'points' })
    expect(formProblems({ ...ok, capacity: '0' })).toEqual({ capacity: 'capacity' })
    expect(formProblems({ ...ok, capacity: '' })).toEqual({})
    expect(formProblems({ ...ok, where: 'place', place_id: null })).toEqual({ place_id: 'place_id' })
  })

  it('says how long it lasts', () => {
    const ok = newForm({ date: '2026-10-05', minutes: 0 })
    expect(durationMinutes(ok)).toBe(180)
    expect(durationMinutes({ ...ok, end: '02:00', later_day: true, end_date: '2026-10-06' })).toBe(8 * 60)
    expect(durationMinutes({ ...ok, end: '17:00' })).toBeNull()
  })
})

describe('a change that would leave members out', () => {
  it('names them, and how many more', () => {
    expect(outsideLine({ count: 1, members: ['Grace Hopper'] }, say, 'en')).toBe('Signed up and left out: Grace Hopper.')
    expect(outsideLine({ count: 6, members: ['A', 'B', 'C', 'D', 'E'] }, say, 'en')).toBe('Signed up and left out: A, B, C, D, E and 1 other.')
    expect(outsideLine({ count: 8, members: ['A', 'B', 'C', 'D', 'E'] }, say, 'en')).toBe('Signed up and left out: A, B, C, D, E and 3 others.')
    expect(outsideLine({}, say, 'en')).toBeNull()
  })
})

describe('check-in by name', () => {
  const answer = (more: Partial<CheckInAnswer> = {}, verdict: Partial<CheckInAnswer['verdict']> = {}): CheckInAnswer => ({
    verdict: { granted: true, reason: 'welcome', valid_until: null, expires_in_days: null, tier: { id: 1, name: 'Silver', color: null }, allowed_tiers: [], ...verdict },
    checked_in: true, already_in: null, signed_up: true, points: 50, attendance_id: 3, scan_event_id: 9, ...more,
  })

  it('says checked in with the points, or when they came in', () => {
    expect(checkInSentence(answer(), 'Ada', say, 'en')).toEqual({ tone: 'success', text: 'Checked in: Ada', points: '+50 points' })
    expect(checkInSentence(answer({ points: 0 }), 'Ada', say, 'en').points).toBeNull()
    expect(checkInSentence(answer({ checked_in: false, already_in: '19:02', points: 0 }), 'Ada', say, 'en')).toEqual({ tone: 'info', text: 'Ada was checked in at 19:02', points: null })
  })

  it('says why not, in words', () => {
    expect(checkInSentence(answer({ checked_in: false }, { granted: false, reason: 'tier_not_allowed', allowed_tiers: ['Gold', 'Platinum'] }), 'Ada', say, 'en').text)
      .toBe('No access: for Gold and Platinum only — Ada is Silver.')
    // A member without a tier is told so, not "Ada is ."; an event that lets no tier in says that.
    expect(checkInSentence(answer({ checked_in: false }, { granted: false, reason: 'tier_not_allowed', allowed_tiers: ['Gold'], tier: null }), 'Ada', say, 'en').text)
      .toBe('No access: for Gold only — Ada has no tier.')
    expect(checkInSentence(answer({ checked_in: false }, { granted: false, reason: 'tier_not_allowed', allowed_tiers: [] }), 'Ada', say, 'en').text)
      .toBe('No access: no tier is let in to this event.')
    expect(listOf(['Gold', 'Silver', 'Platinum'], 'ru')).toBe('Gold, Silver и Platinum')
    expect(checkInSentence(answer({ checked_in: false }, { granted: false, reason: 'expired', valid_until: '2026-10-03' }), 'Ada', say, 'en').text)
      .toBe('No access: the membership expired on Oct 3, 2026.')
    expect(checkInSentence(answer({ checked_in: false }, { granted: false, reason: 'something_new' }), 'Ada', say, 'en')).toEqual({ tone: 'danger', text: 'No access.', points: null })
  })
})

describe('the people', () => {
  const person = (more: Partial<EventPerson>): EventPerson => ({
    member: { id: 1, name: 'Ada', member_number: 'LS-1', tier: null }, signed_up_at: '2026-10-01T10:00:00+00:00', cancelled_at: null,
    checked_in_at: null, walk_in: false, source: 'portal', ...more,
  })

  it('groups and says each person’s state', () => {
    const list = [person({}), person({ checked_in_at: '19:02' }), person({ signed_up_at: null, checked_in_at: '19:05', walk_in: true, source: null }), person({ cancelled_at: '2026-10-02T10:00:00+00:00' })]
    const groups = peopleGroups(list)
    expect([groups.signedUp.length, groups.walkIns.length, groups.cancelled.length]).toEqual([2, 1, 1])
    expect(list.map(p => personLine(p, say))).toEqual(['Signed up', 'Checked in 19:02', 'Walk-in · 19:05', 'Cancelled'])
  })

  it('at an event without sign-up, everyone who came is checked in, nobody a walk-in', () => {
    const came = person({ signed_up_at: null, checked_in_at: '19:05', walk_in: true, source: null })
    expect(personLine(came, say, false)).toBe('Checked in 19:05')
    expect(peopleGroups([came], false)).toEqual({ signedUp: [], walkIns: [came], cancelled: [] })
  })
})
