import { describe, expect, it } from 'vitest'
import type { MemberRow } from '../lib/types'
import type { EntryRow, EventPerson, EventRow, ScanAnswer, Verdict } from './scanApi'
import {
  CLEAR_AFTER_MS, DUPLICATE_MS, answerVerdict, clearsAfter, clockOf, dayWords, daysBetween, deskValidity, entryLine, eventClosed, eventFacts,
  failureVerdict, firstName, goneContext, isDuplicate, listWords, nextSeen, peopleLines, renewable, showsToday, soundOf, soundOn, takesKeyToField, warningSentence,
  type Sentence, type VerdictFacts,
} from './verdict'

const member = (over: Partial<MemberRow> = {}): MemberRow => ({
  id: 7, name: 'Ada Lovelace', email: null, phone: null, member_number: 'LS-001007', tier_id: 2, points: 1200, lifetime_points: 3000,
  is_active: true, joined_at: null, last_activity_at: null, ...over,
})
const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  granted: true, reason: 'welcome', valid_until: null, expires_in_days: null, tier: { id: 2, name: 'Silver', color: '#9ca3af' }, allowed_tiers: [],
  place: { id: 3, name: 'VIP lounge' }, entry_id: 41, ...over,
})
const answer = (v: Partial<Verdict> = {}, over: Partial<ScanAnswer> = {}): ScanAnswer => ({ member: member(), verdict: verdict(v), benefits: [], ...over })
const facts: VerdictFacts = { locale: 'en', today: '2026-10-25', nowWall: '2026-10-25T15:00', timeZone: 'Europe/Riga' }
const event: EventRow = { id: 5, title: 'Wine tasting', starts_at: '2026-10-25T18:00', ends_at: '2026-10-25T23:00', place: null, location: null, status: 'published' }

/** A sentence as the English bundle would say it. */
const say = (s: Sentence | null) => (s ? s.fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => s.vars?.[k] ?? `{{${k}}}`) : null)

describe('the verdict band (release 8 §2)', () => {
  it('a welcome is green with a check and "Welcome" (the name is written once, beneath), the member and their benefits', () => {
    const view = answerVerdict(answer({}, { benefits: [{ name: 'Lounge access', value: null, category: 'access' }, { name: 'Late check-out', value: '14:00', category: 'stay' }] }), facts)
    expect(view.tone).toBe('granted')
    expect(view.mark).toBe('check')
    expect(say(view.headline)).toBe('Welcome')
    expect(view.headline.key).toBe('loyalty.door.headline.welcome')
    expect(view.reason).toBeNull()
    expect(view.member?.id).toBe(7)
    expect(view.tier).toEqual({ id: 2, name: 'Silver', color: '#9ca3af' })
    expect(view.benefits).toEqual(['Lounge access', 'Late check-out · 14:00'])
    expect(view.validity).toBeNull()
    expect(view.facts).toEqual([])
  })

  it('a benefit given no wording says its typed value', () => {
    const typed = answerVerdict(answer({}, { benefits: [{ name: 'Member price', value: null, category: 'discount', value_type: 'percent_discount', value_amount: 15 }, { name: 'Spa', value: null, category: null, value_type: 'text', value_amount: null }] }), facts)
    expect(typed.benefits).toEqual(['Member price · 15% off', 'Spa'])
    const said = answerVerdict(answer({}, { benefits: [{ name: 'Member price', value: null, category: 'discount', value_type: 'percent_discount', value_amount: 15 }] }), { ...facts, typedPhrase: (_t, n) => `−${n} %` })
    expect(said.benefits).toEqual(['Member price · −15 %'])
  })

  it('a member without a name is welcomed plainly', () => {
    expect(say(answerVerdict({ ...answer(), member: member({ name: '' }) }, facts).headline)).toBe('Welcome')
  })

  it('amber when let in and the membership ends within two weeks, with the end date beneath', () => {
    const view = answerVerdict(answer({ valid_until: '2026-10-30', expires_in_days: 5 }), facts)
    expect(view.tone).toBe('warning')
    expect(view.mark).toBe('alert')
    expect(say(view.headline)).toBe('Welcome')
    expect(say(view.reason)).toBe('Membership ends in 5 days.')
    expect(say(view.validity)).toBe(`Valid until ${dayWords('2026-10-30', facts.today, 'en')}`)
    expect(say(warningSentence(0))).toBe('Membership ends today.')
    expect(say(warningSentence(1))).toBe('Membership ends tomorrow.')
    expect(warningSentence(null)).toBeNull()
    expect(warningSentence(15)).toBeNull()
  })

  it('only a run-out membership offers renewal on the spot; a refusal carries no benefits', () => {
    expect(renewable(answer({ granted: false, reason: 'expired', valid_until: '2026-10-01' }))).toBe(true)
    expect(renewable(answer({ granted: false, reason: 'member_off' }))).toBe(false)
    expect(renewable(answer({ granted: false, reason: 'tier_not_allowed' }))).toBe(false)
    expect(renewable(answer())).toBe(false)
    expect(renewable(null)).toBe(false)
    const refused = answerVerdict(answer({ granted: false, reason: 'expired', valid_until: '2026-10-01' }, { benefits: [{ name: 'Lounge access', value: null, category: 'access' }] }), facts)
    expect(refused.benefits).toEqual([])
  })

  it('a refusal is red with a cross, "No access" and the reason in words', () => {
    const cases: [Partial<Verdict>, string][] = [
      [{ reason: 'member_erased' }, 'This member was deleted.'],
      [{ reason: 'member_off' }, 'This membership is switched off.'],
      [{ reason: 'expired', valid_until: '2026-10-03' }, `Membership expired on ${dayWords('2026-10-03', facts.today, 'en')}.`],
      [{ reason: 'expired', valid_until: null }, 'This membership has expired.'],
      [{ reason: 'place_off' }, 'VIP lounge is switched off.'],
      [{ reason: 'place_off', place: undefined }, 'This place is switched off.'],
      [{ reason: 'tier_not_allowed', allowed_tiers: ['Gold', 'Platinum'] }, 'Gold and Platinum only — Ada is Silver.'],
      [{ reason: 'tier_not_allowed', allowed_tiers: ['Gold'], tier: null }, 'Gold only — Ada has no tier.'],
      [{ reason: 'tier_not_allowed', allowed_tiers: [] }, 'No tier is let in here yet.'],
      [{ reason: 'event_full' }, 'The event is full.'],
      [{ reason: 'not_signed_up' }, 'Not signed up for this event.'],
      [{ reason: 'something_new' }, 'Not let in here.'],
    ]
    for (const [v, sentence] of cases) {
      const view = answerVerdict(answer({ granted: false, ...v }), facts)
      expect(view.tone, v.reason).toBe('denied')
      expect(view.mark).toBe('cross')
      expect(say(view.headline)).toBe('No access')
      expect(say(view.reason), v.reason).toBe(sentence)
      expect(view.member?.name).toBe('Ada Lovelace')
      expect(view.facts).toEqual([])
    }
    // The end date is in the band; it is not said twice.
    expect(answerVerdict(answer({ granted: false, reason: 'expired', valid_until: '2026-10-03' }), facts).validity).toBeNull()
  })

  it('writes the year of a date only when it is not this year’s, and joins tiers as the language does', () => {
    expect(dayWords('2026-10-03', '2026-10-25', 'en')).not.toMatch(/2026/)
    expect(dayWords('2027-10-03', '2026-10-25', 'en')).toMatch(/2027/)
    expect(listWords(['Gold', 'Silver', 'Platinum'], 'en')).toBe('Gold, Silver, and Platinum')
    expect(listWords(['Gold', 'Platinum'], 'ru')).toBe('Gold и Platinum')
    expect(firstName('  Ada   Lovelace ')).toBe('Ada')
    expect(firstName(null)).toBe('')
    expect(daysBetween('2026-10-25', '2026-11-01')).toBe(7)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('an event whose check-in is closed says why, or when it opens', () => {
    expect(say(eventClosed(event, '2026-10-25T15:00'))).toBe('Check-in opens at 16:00.')
    expect(say(eventClosed(event, '2026-10-25T23:10'))).toBe('This event has ended.')
    expect(say(eventClosed({ ...event, status: 'cancelled' }, '2026-10-25T19:00'))).toBe('This event was cancelled.')
    expect(say(eventClosed({ ...event, status: 'draft' }, '2026-10-25T19:00'))).toBe('This event is not published yet.')
    expect(say(eventClosed(null, '2026-10-25T19:00'))).toBe('Check-in is not open for this event now.')
    const view = answerVerdict(answer({ granted: false, reason: 'event_not_open', place: undefined, event: { id: 5, title: 'Wine tasting' } }), { ...facts, event })
    expect(say(view.reason)).toBe('Check-in opens at 16:00.')
  })

  it('at an event, the check-in’s facts: checked in or already in, signed up or walk-in, the points', () => {
    const at = { place: undefined, event: { id: 5, title: 'Wine tasting' } }
    const first = answerVerdict(answer(at, { checked_in: true, already_in: null, signed_up: true, points: 50 }), { ...facts, event })
    expect(first.facts.map(say)).toEqual(['Checked in', 'Signed up', '+50 points'])
    const again = answerVerdict(answer(at, { checked_in: false, already_in: '19:02', signed_up: false, points: 0 }), { ...facts, event })
    expect(again.tone).toBe('granted')
    expect(again.facts.map(say)).toEqual(['Already checked in at 19:02', 'Walk-in'])
    // An instant is read on the venue's clock.
    expect(eventFacts({ ...answer(at), already_in: '2026-10-25T17:02:00+00:00' }, 'en', 'Europe/Riga').map(say)).toEqual(['Already checked in at 19:02'])
    expect(eventFacts(answer({}, { checked_in: true, points: 50 }), 'en', 'UTC')).toEqual([])
    expect(say(eventFacts(answer(at, { points: 1500 }), 'en', 'UTC')[0])).toBe('+1,500 points')
    // The visit's stamp, in the desk's own words (visitsMath), after the points.
    const card = { id: 1, number: 1, stamps_count: 7, stamps_needed: 10, completed_at: null, reward: null } as never
    const stamped = eventFacts(answer(at, { checked_in: true, signed_up: true, points: 50, stamp: { added: true, card, completed: null } }), 'en', 'UTC')
    expect(stamped.map(say)).toEqual(['Checked in', 'Signed up', '+50 points', '+1 stamp — 7 of 10'])
    expect(stamped[3].key).toBe('loyalty.visits.said.stamp')
    expect(eventFacts(answer(at, { checked_in: true, stamp: null }), 'en', 'UTC').map(say)).toEqual(['Checked in'])
  })

  it('a code that names nobody is red "Card not recognised" with the scan’s own sentence; anything else is grey "Try again"', () => {
    for (const code of ['not_found', 'expired', 'revoked', 'used_up']) {
      const view = failureVerdict({ status: code === 'not_found' ? 404 : 410, code, extra: {} })
      expect(view.tone, code).toBe('denied')
      expect(say(view.headline)).toBe('Card not recognised')
      expect(view.reason?.key).toBe(`loyalty.scan.error.${code}`)
      expect(view.member).toBeNull()
    }
    expect(say(failureVerdict({ status: 404, code: 'not_found', extra: {} }).reason)).toBe('No member has this card or number.')
    expect(say(failureVerdict({ status: 404, code: 'inactive', extra: { card: 'off' } }).reason)).toBe('This card was switched off.')

    const offline = failureVerdict({ status: 0, code: 'network', extra: {} })
    expect(offline.tone).toBe('trouble')
    expect(offline.mark).toBe('retry')
    expect(say(offline.headline)).toBe('Try again')
    expect(say(offline.reason)).toBe('No connection. Try again.')
    expect(failureVerdict({ status: 500, code: 'unknown', extra: {} }).tone).toBe('trouble')
    expect(failureVerdict({ status: 403, code: 'no_capability', extra: {} }).reason?.key).toBe('loyalty.scan.error.unknown')
    // The same scan sent again while the first is still being handled: grey, with its own sentence, never "No access".
    const busy = failureVerdict({ status: 409, code: 'in_progress', extra: {} })
    expect([busy.tone, say(busy.headline), say(busy.reason)]).toEqual(['trouble', 'Try again', 'This scan is still being handled. Try again in a moment.'])
    // The place or the event itself is gone: not the card's fault — choose again.
    const gone = failureVerdict({ status: 404, code: 'not_found', extra: { gone: 'place' } })
    expect(gone.tone).toBe('trouble')
    expect(say(gone.headline)).toBe('Choose again')
    expect(say(gone.reason)).toBe('This place no longer exists. Choose another place, or the desk.')
    expect(say(failureVerdict({ status: 404, code: 'not_found', extra: { gone: 'event' } }).reason)).toBe('This event no longer exists. Choose another event, or the desk.')
    // An answer with no verdict is never a welcome.
    expect(answerVerdict({ member: member() }, facts).tone).toBe('trouble')
    expect(goneContext({ status: 404, code: 'not_found', extra: {} })).toBeNull()
    expect(goneContext({ status: 404, code: 'not_found', extra: { gone: 'event' } })).toBe('event')
  })
})

describe('the desk’s card: the membership’s end', () => {
  const today = '2026-10-25'
  it('says nothing without an end date', () => {
    expect(deskValidity({}, today, 'en')).toBeNull()
    expect(deskValidity({ valid_until: null, membership_state: 'active' }, today, 'en')).toBeNull()
  })
  it('plain far off, amber within 30 days, red once over — the server’s state first', () => {
    const until = (d: string) => `Valid until ${dayWords(d, today, 'en')}`
    expect(deskValidity({ valid_until: '2027-10-03' }, today, 'en')).toEqual({ tone: 'neutral', sentence: expect.objectContaining({ key: 'loyalty.door.validity.until' }) })
    expect(say(deskValidity({ valid_until: '2027-10-03' }, today, 'en')!.sentence)).toBe(until('2027-10-03'))
    const soon = deskValidity({ valid_until: '2026-11-06' }, today, 'en')!
    expect(soon.tone).toBe('warning')
    expect(say(soon.sentence)).toBe(`${until('2026-11-06')} — ends in 12 days`)
    expect(say(deskValidity({ valid_until: today, membership_state: 'expiring' }, today, 'en')!.sentence)).toBe('Valid until today')
    expect(say(deskValidity({ valid_until: '2026-10-26', membership_state: 'expiring' }, today, 'en')!.sentence)).toBe(`${until('2026-10-26')} — ends tomorrow`)
    const over = deskValidity({ valid_until: '2026-10-03', membership_state: 'expired' }, today, 'en')!
    expect(over.tone).toBe('danger')
    expect(say(over.sentence)).toBe(`Membership ended on ${dayWords('2026-10-03', today, 'en')}`)
    expect(deskValidity({ valid_until: '2026-10-03' }, today, 'en')!.tone).toBe('danger')
    // The server said active (its zone's today may differ by a day): its word wins.
    expect(deskValidity({ valid_until: '2026-11-06', membership_state: 'active' }, today, 'en')!.tone).toBe('neutral')
  })
})

describe('Today here', () => {
  it('shows under the scanner at a place or an event, never at the desk', () => {
    expect(showsToday({ kind: 'desk' })).toBe(false)
    expect(showsToday({ kind: 'place', id: 1 })).toBe(true)
    expect(showsToday({ kind: 'event', id: 1 })).toBe(true)
  })

  it('a place’s entries as lines: the venue’s time, who, let in or why not', () => {
    const entry = (over: Partial<EntryRow>): EntryRow => ({ id: 1, at: '2026-10-25T19:02', member: { id: 7, name: 'Ada Lovelace', member_number: 'LS-001007' }, granted: true, reason: 'welcome', ...over })
    const ok = entryLine(entry({}), 'UTC')
    expect(ok).toMatchObject({ id: 'entry-1', time: '19:02', name: 'Ada Lovelace', number: 'LS-001007', granted: true })
    // In the places' own words (part A's entryWords): one copy for every entries list.
    expect(ok.label.key).toBe('loyalty.places.reason.welcome')
    expect(say(ok.label)).toBe('Let in')
    expect(entryLine(entry({ granted: false, reason: 'expired' }), 'UTC').label.key).toBe('loyalty.places.reason.expired')
    expect(entryLine(entry({ granted: false, reason: 'tier_not_allowed' }), 'UTC').label.key).toBe('loyalty.places.reason.tier_not_allowed')
    expect(entryLine(entry({ granted: false, reason: 'odd' }), 'UTC').label.key).toBe('loyalty.places.reason.unknown')
    const nobody = entryLine(entry({ granted: false, reason: 'not_found', member: null }), 'UTC')
    expect(nobody.name).toBe('')
    expect(nobody.label.key).toBe('loyalty.places.refusal.not_found')
  })

  it('an event’s people who came in, newest first, signed up or walk-in', () => {
    const person = (id: number, at: string | null, walkIn = false): EventPerson => ({
      member: { id, name: `M${id}`, member_number: `N${id}` }, signed_up_at: walkIn ? null : '2026-10-20T10:00:00+00:00', checked_in_at: at, walk_in: walkIn,
    })
    const lines = peopleLines([person(1, '2026-10-25T16:05:00+00:00'), person(2, null), person(3, '2026-10-25T17:10:00+00:00', true)], 'Europe/Riga')
    expect(lines.map(l => [l.name, l.time, say(l.label)])).toEqual([['M3', '19:10', 'Walk-in'], ['M1', '18:05', 'Signed up']])
    expect(peopleLines(Array.from({ length: 12 }, (_, i) => person(i + 1, `2026-10-25T1${i % 10}:00`)), 'UTC')).toHaveLength(8)
    // The server's latest come newest first by real time: kept in that order across midnight.
    const latest = peopleLines([person(4, '00:10', true), person(5, '23:50')], 'UTC', { sorted: true })
    expect(latest.map(l => l.name)).toEqual(['M4', 'M5'])
    // An event without sign-up stores everyone as a walk-in: the line just says they are in.
    expect(peopleLines([person(6, '19:00', true)], 'UTC', { signUp: false }).map(l => say(l.label))).toEqual(['Checked in'])
  })

  it('a check-in of another day of a long event says its day', () => {
    const at = { event: { id: 5, title: 'Festival' } }
    expect(eventFacts(answer(at, { already_in: '19:02', already_in_at: '2026-10-23T19:02' }), 'en', 'UTC', true, '2026-10-25').map(say))
      .toEqual([`Already checked in on ${dayWords('2026-10-23', '2026-10-25', 'en')} at 19:02`])
    expect(eventFacts(answer(at, { already_in: '19:02', already_in_at: '2026-10-25T19:02' }), 'en', 'UTC', true, '2026-10-25').map(say)).toEqual(['Already checked in at 19:02'])
  })

  it('an event without sign-up says neither "Signed up" nor "Walk-in"; one point is singular', () => {
    const at = { event: { id: 5, title: 'Wine tasting' } }
    expect(eventFacts(answer(at, { checked_in: true, signed_up: false, points: 1 }), 'en', 'UTC', false).map(say)).toEqual(['Checked in', '+1 point'])
    expect(eventFacts(answer(at, { checked_in: true, signed_up: false }), 'en', 'UTC', true).map(say)).toEqual(['Checked in', 'Walk-in'])
  })

  it('reads a time sent as HH:mm, as a wall clock or as an instant', () => {
    expect(clockOf('19:02', 'UTC')).toBe('19:02')
    expect(clockOf('2026-10-25T19:02', 'Europe/Riga')).toBe('19:02')
    expect(clockOf('2026-10-25 19:02:33', 'Europe/Riga')).toBe('19:02')
    expect(clockOf('2026-10-25T17:02:00Z', 'Europe/Riga')).toBe('19:02')
    expect(clockOf(null, 'UTC')).toBe('')
    expect(clockOf('soon', 'UTC')).toBe('')
  })
})

describe('door mode', () => {
  it('clears after 4 seconds at the door; the page keeps its verdict', () => {
    expect(CLEAR_AFTER_MS).toBe(4000)
    expect(clearsAfter('door')).toBe(4000)
    expect(clearsAfter('page')).toBeNull()
  })

  it('ignores the same code within 3 seconds of its last sighting — a window that slides while it is held up', () => {
    expect(DUPLICATE_MS).toBe(3000)
    expect(isDuplicate({}, 'A', 0)).toBe(false)
    let seen = nextSeen({}, 'A', 1000)
    expect(isDuplicate(seen, 'A', 3999)).toBe(true)
    expect(isDuplicate(seen, 'B', 1500)).toBe(false)
    expect(isDuplicate(seen, 'A', 4000)).toBe(false)
    // Held in front of the camera: each sighting moves the window.
    seen = nextSeen(seen, 'A', 3500)
    expect(isDuplicate(seen, 'A', 6000)).toBe(true)
    expect(isDuplicate(seen, 'A', 6500)).toBe(false)
  })

  it('keeps each code’s own window: a second member read meanwhile does not let the first in twice', () => {
    let seen = nextSeen({}, 'A', 1000)
    seen = nextSeen(seen, 'B', 1200)
    expect(isDuplicate(seen, 'A', 1400)).toBe(true)
    expect(isDuplicate(seen, 'B', 1400)).toBe(true)
    // Old sightings are dropped as new ones come.
    seen = nextSeen(seen, 'C', 5000)
    expect(Object.keys(seen)).toEqual(['C'])
  })

  it('takes a reader’s character to the field from anywhere but a field, a dialog or a shortcut', () => {
    const away = { typing: false, modal: false, onButton: false }
    expect(takesKeyToField({ key: '4' }, away)).toBe(true)
    expect(takesKeyToField({ key: 'L' }, away)).toBe(true)
    expect(takesKeyToField({ key: '4' }, { ...away, typing: true })).toBe(false)
    expect(takesKeyToField({ key: '4' }, { ...away, modal: true })).toBe(false)
    expect(takesKeyToField({ key: 'k', ctrlKey: true }, away)).toBe(false)
    expect(takesKeyToField({ key: 'Enter' }, away)).toBe(false)
    expect(takesKeyToField({ key: 'Tab' }, away)).toBe(false)
    expect(takesKeyToField({ key: ' ' }, { ...away, onButton: true })).toBe(false)
    expect(takesKeyToField({ key: '7' }, { ...away, onButton: true })).toBe(true)
  })

  it('plays rising tones to let in, falling ones to refuse; the sound is off unless switched on', () => {
    const [a, b] = soundOf('granted')
    expect(b).toBeGreaterThan(a)
    const [c, d] = soundOf('denied')
    expect(d).toBeLessThan(c)
    expect(soundOf('warning')[1]).toBeGreaterThan(soundOf('warning')[0])
    expect(soundOn('on')).toBe(true)
    for (const raw of [null, undefined, '', 'off', 'true']) expect(soundOn(raw)).toBe(false)
  })
})
