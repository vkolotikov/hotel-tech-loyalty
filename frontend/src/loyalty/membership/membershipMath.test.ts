import { describe, expect, it } from 'vitest'
import { serverProblems } from '../lib/forms'
import type { Can, MemberRow, TierRef } from '../lib/types'
import {
  DETAILS_FIELDS, ENROL_FIELDS, NEW_MEMBER, batchFrom, detailsBody, detailsFormOf, detailsProblems, enrolBody, enrolProblems, eraseReady, exportFileName,
  exportParams, firstKeepDay, importNext, importSearch, importShare, importStep, importTone, isCsv, keptOf, languageChoices, languageName, listActions,
  looksLikeEmail, mergeProblems, mergeSides, moreItems, pageActions, pairKey, pointsAfterMerge, tierBody, tierChoices, tierFormOf, tierNote, tierProblems,
  tooBig, waitMinutes,
} from './membershipMath'
import type { DuplicatePair, ImportBatch, MemberProfile } from './types'
import { wordOf } from './words'

const can = (more: Partial<Can> = {}): Can => ({ award: false, redeem: false, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const row = (more: Partial<MemberRow> = {}): MemberRow => ({
  id: 1, name: 'Ada Lovelace', email: 'ada@example.test', phone: null, member_number: 'HL-1', tier_id: 2, points: 1500, lifetime_points: 1800,
  is_active: true, joined_at: '2026-01-01T10:00:00+00:00', last_activity_at: null, ...more,
})
const profile = (more: Partial<MemberProfile> = {}): MemberProfile => ({
  ...row(), qualifying_points: 1500, referral_code: 'ADA1', language: 'de', nationality: 'British', date_of_birth: '1815-12-10',
  marketing_consent: true, tier_override_until: null, is_erased: false, ...more,
})
const tiers: TierRef[] = [
  { id: 1, name: 'Silver', color: null, min_points: 0, is_active: true },
  { id: 2, name: 'Gold', color: null, min_points: 1000, is_active: true },
  { id: 3, name: 'Old', color: null, min_points: 500, is_active: false },
]
const batch = (more: Partial<ImportBatch> = {}): ImportBatch => ({
  id: 7, filename: 'guests.csv', state: 'pending', finished: false, rows: 130, file_rows: 131, processed: 0, progress: 0, created: 0, skipped: 0, refused: 0,
  points: 0, columns_used: ['name', 'email'], columns_ignored: [], failure: null, by: 'Ada', created_at: null, started_at: null, completed_at: null, ...more,
})

describe('who is offered what (release 2 §3, §4.1)', () => {
  it('lets everyone add a member and gives a manager the toolbar', () => {
    expect(listActions(can())).toEqual({ add: true, tools: false })
    expect(listActions(can({ manage_members: true }))).toEqual({ add: true, tools: true })
  })

  it('gives staff the welcome email, and a manager the tier, the account switch and Delete', () => {
    expect(moreItems(can({ award: true }), profile())).toEqual(['welcome'])
    expect(moreItems(can({ manage_members: true }), profile())).toEqual(['welcome', 'tier', 'deactivate', 'erase'])
    expect(moreItems(can({ manage_members: true }), profile({ is_active: false }))).toEqual(['welcome', 'tier', 'reactivate', 'erase'])
    expect(moreItems(can(), profile({ email: null }))).toEqual([])
  })

  it('offers nothing for a deleted member, whose history is all that is left', () => {
    expect(moreItems(can({ manage_members: true }), profile({ is_erased: true }))).toEqual([])
    expect(pageActions(profile({ is_erased: true }))).toEqual({ edit: false, card: false })
    expect(pageActions(profile())).toEqual({ edit: true, card: true })
  })
})

describe('Add member', () => {
  it('starts empty with the welcome email on', () => {
    expect(NEW_MEMBER).toEqual({ name: '', email: '', phone: '', send_welcome: true })
  })

  it('says what is wrong before sending', () => {
    expect(enrolProblems({ ...NEW_MEMBER, name: 'Alan', email: 'alan@example.test' })).toEqual({})
    expect(enrolProblems(NEW_MEMBER)).toEqual({ name: 'name', email: 'email' })
    expect(enrolProblems({ ...NEW_MEMBER, name: 'A', email: 'a@b', phone: '1'.repeat(21) })).toEqual({ email: 'email', phone: 'phone' })
    expect(looksLikeEmail(' alan@example.test ')).toBe(true)
    expect(looksLikeEmail('alan @example.test')).toBe(false)
  })

  it('sends trimmed words and no empty phone', () => {
    expect(enrolBody({ name: ' Alan ', email: ' alan@example.test ', phone: ' ', send_welcome: false }))
      .toEqual({ name: 'Alan', email: 'alan@example.test', phone: null, send_welcome: false })
  })

  it('reads the server refusing an email as one already in use, never naming where', () => {
    expect(serverProblems({ email: ['The email has already been taken.'] }, ENROL_FIELDS)).toEqual({ email: 'email_taken' })
  })
})

describe('Edit details', () => {
  it('starts from the member as they are', () => {
    expect(detailsFormOf(profile({ phone: null }))).toEqual({
      name: 'Ada Lovelace', email: 'ada@example.test', phone: '', language: 'de', nationality: 'British', date_of_birth: '1815-12-10', marketing_consent: true,
    })
  })

  it('refuses a date of birth after the venue’s today, and the rest of what the server would', () => {
    const form = detailsFormOf(profile())
    expect(detailsProblems(form, '2026-10-21')).toEqual({})
    expect(detailsProblems({ ...form, date_of_birth: '2026-10-22' }, '2026-10-21')).toEqual({ date_of_birth: 'date_of_birth' })
    expect(detailsProblems({ ...form, date_of_birth: '2026-10-21' }, '2026-10-21')).toEqual({})
    expect(detailsProblems({ ...form, name: ' ', email: 'x', nationality: 'n'.repeat(101) }, '2026-10-21')).toEqual({ name: 'name', email: 'email', nationality: 'nationality' })
  })

  it('sends null for what is empty', () => {
    expect(detailsBody({ name: ' Ada ', email: 'ada@example.test', phone: '', language: '', nationality: ' ', date_of_birth: '', marketing_consent: false }))
      .toEqual({ name: 'Ada', email: 'ada@example.test', phone: null, language: null, nationality: null, date_of_birth: null, marketing_consent: false })
    expect(serverProblems({ email: ['taken'], date_of_birth: ['x'] }, DETAILS_FIELDS)).toEqual({ email: 'email_taken', date_of_birth: 'date_of_birth' })
  })

  it('offers the server’s languages and keeps the member’s own when it is another', () => {
    expect(languageChoices(['en', 'de'], 'de')).toEqual(['en', 'de'])
    expect(languageChoices(['en', 'de'], 'lv')).toEqual(['en', 'de', 'lv'])
    expect(languageChoices(['en'], null)).toEqual(['en'])
    expect(languageName('de', 'en')).toBe('German')
    expect(languageName('de', 'de')).toBe('Deutsch')
  })
})

describe('Change tier', () => {
  it('offers the tiers in use and the member’s own', () => {
    expect(tierChoices(tiers, 2).map(t => t.id)).toEqual([1, 2])
    expect(tierChoices(tiers, 3).map(t => t.id)).toEqual([1, 2, 3])
  })

  it('needs a tier, and a day to keep it until after today or none', () => {
    const form = tierFormOf(profile())
    expect(form).toEqual({ tier_id: '2', keep_until: '' })
    expect(tierProblems(form, tiers, '2026-10-21')).toEqual({})
    expect(tierProblems({ tier_id: '', keep_until: '' }, tiers, '2026-10-21')).toEqual({ tier_id: 'tier_id' })
    expect(tierProblems({ ...form, keep_until: '2026-10-21' }, tiers, '2026-10-21')).toEqual({ keep_until: 'keep_until' })
    expect(tierProblems({ ...form, keep_until: '2026-10-22' }, tiers, '2026-10-21')).toEqual({})
    expect(firstKeepDay('2026-12-31')).toBe('2027-01-01')
  })

  it('says the tier is kept, or that the next review may move the member', () => {
    expect(tierNote({ tier_id: '2', keep_until: '2026-12-31' })).toBe('kept')
    expect(tierNote({ tier_id: '2', keep_until: '' })).toBe('review')
    expect(tierBody({ tier_id: '2', keep_until: '' })).toEqual({ tier_id: 2, keep_until: null })
    expect(tierBody({ tier_id: '3', keep_until: '2026-12-31' })).toEqual({ tier_id: 3, keep_until: '2026-12-31' })
  })
})

describe('Delete, the welcome email', () => {
  it('waits for the member’s name, trimmed and in any case', () => {
    expect(eraseReady(' ada LOVELACE ', 'Ada Lovelace')).toBe(true)
    expect(eraseReady('Ada', 'Ada Lovelace')).toBe(false)
    expect(eraseReady('', '')).toBe(false)
  })

  it('turns the seconds to wait into whole minutes, one at least', () => {
    expect(waitMinutes(360)).toBe(6)
    expect(waitMinutes(61)).toBe(2)
    expect(waitMinutes(5)).toBe(1)
    expect(waitMinutes(undefined)).toBe(1)
  })
})

describe('Duplicates and merge', () => {
  const pair: DuplicatePair = { a: row({ id: 4 }), b: row({ id: 9, name: 'Ada L.', points: 120, lifetime_points: 200 }), reasons: ['same_email'], keep: 4 }

  it('keeps the oldest unless the manager chose the other', () => {
    expect(pairKey(pair)).toBe('4-9')
    expect(pairKey({ a: pair.b, b: pair.a })).toBe('4-9')
    expect(keptOf(pair, {})).toBe(4)
    expect(keptOf(pair, { '4-9': 9 })).toBe(9)
    expect(keptOf(pair, { '4-9': 55 })).toBe(4)
  })

  it('names the sides and the points the kept member will have', () => {
    expect(mergeSides(pair, 9)).toEqual({ keep: pair.b, merge: pair.a })
    expect(mergeSides(pair, 4)).toEqual({ keep: pair.a, merge: pair.b })
    expect(pointsAfterMerge(pair.a, pair.b)).toEqual({ points: 1620, lifetime: 2000 })
    expect(mergeProblems(' ')).toEqual({ reason: 'reason' })
    expect(mergeProblems('Same guest')).toEqual({})
  })
})

describe('Import', () => {
  it('keeps the batch in the address', () => {
    expect(batchFrom('?batch=12')).toBe(12)
    expect(batchFrom('?batch=x')).toBeNull()
    expect(batchFrom('')).toBeNull()
    expect(importSearch(12)).toBe('?batch=12')
    expect(importSearch(null)).toBe('')
  })

  it('knows where the page is', () => {
    expect(importStep(null)).toBe('choose')
    expect(importStep(batch())).toBe('ready')
    expect(importStep(batch({ state: 'running', processed: 100 }))).toBe('running')
    expect(importStep(batch({ state: 'completed', finished: true }))).toBe('done')
    expect(importStep(batch({ state: 'cancelled', finished: true }))).toBe('done')
  })

  it('sends the next chunk only while driving and none is on its way, and stops when finished', () => {
    expect(importNext(batch(), true, false)).toBe('run')
    expect(importNext(batch(), true, true)).toBe('wait')
    expect(importNext(batch(), false, false)).toBe('wait')
    expect(importNext(batch({ finished: true }), true, false)).toBe('finished')
    expect(importNext(null, true, false)).toBe('wait')
  })

  it('shows the progress within the total and the state’s tone', () => {
    expect(importShare(batch({ processed: 100 }))).toEqual({ done: 100, of: 130 })
    expect(importShare(batch({ processed: 200 }))).toEqual({ done: 130, of: 130 })
    expect(['pending', 'running', 'completed', 'cancelled', 'failed'].map(importTone)).toEqual(['pending', 'approved', 'fulfilled', 'cancelled', 'declined'])
  })

  it('takes a CSV of 20 MB at most', () => {
    expect(isCsv({ name: 'guests.CSV', type: '' })).toBe(true)
    expect(isCsv({ name: 'guests', type: 'text/csv' })).toBe(true)
    expect(isCsv({ name: 'guests.xlsx', type: 'application/vnd.ms-excel' })).toBe(false)
    expect(tooBig({ size: 20 * 1024 * 1024 })).toBe(false)
    expect(tooBig({ size: 20 * 1024 * 1024 + 1 })).toBe(true)
  })

  it('names a code the bundle knows, and reads one it does not as the family’s other', () => {
    expect(wordOf('import.problem', 'already_member')).toEqual(['loyalty.membership.import.problem.already_member', 'Already a member.'])
    expect(wordOf('import.problem', 'brand_new')).toEqual(['loyalty.membership.import.problem.other', 'This row was not imported.'])
    expect(wordOf('import.column', 'shoe_size')).toEqual(['loyalty.membership.import.column.shoe_size', 'shoe_size'])
  })
})

describe('Export', () => {
  it('takes the list’s filters without the page, and names the file by the venue’s day', () => {
    expect(exportParams({ q: ' ada ', tier_id: 2, state: 'all', sort: 'points', page: 3 })).toEqual({ q: 'ada', tier_id: 2, state: 'all', sort: 'points' })
    expect(exportParams({ q: '', tier_id: null, state: 'active', sort: 'recent', page: 1 })).toEqual({})
    expect(exportFileName('2026-10-21')).toBe('members-2026-10-21.csv')
  })
})
