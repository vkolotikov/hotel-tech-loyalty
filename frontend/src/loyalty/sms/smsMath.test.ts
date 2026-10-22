import { describe, expect, it } from 'vitest'
import cases from './smsLength.cases.json'
import {
  bodyOf, canCount, canTest, confirmationOf, draftProblems, fillTags, formOf, isDirty, outcomesOf, progressOf, sendBlockers, sendRefusalRefreshes,
  serverProblems, smsActions, smsFrom, smsLength, smsSearch, statusTone, twilioCode, twilioSteps, unknownSmsTags, viewOf, withTagAt,
} from './smsMath'
import type { Sms, SmsAudience, TwilioReadiness } from './types'

const ready: TwilioReadiness = { ready: true, missing: [], wrong: [], from: '+15005550006' }
const none = { sent: 0, failed: 0, skipped: 0, pending: 0 }
const length = { encoding: 'gsm7' as const, units: 0, segments: 0, per_segment: 160, unicode: [] }
const draft = (more: Partial<Sms> = {}): Sms => ({
  id: 7, name: 'Autumn', excerpt: 'Hi', status: 'draft', segment: { id: 3, name: 'Gold' }, recipient_count: 0, results: none, segments_sent: 0,
  scheduled_at: null, scheduled_for: null, sent_at: null, created_at: null, updated_at: null, body: 'Hi {{first_name}}', segment_id: 3, missing: [],
  length, preview: 'Hi Ada', preview_length: length, unknown_tags: [], problem: null, failures: [], last_progress_at: null, created_by: 'Ada', sent_by: null,
  revision: '2026-10-20T09:00:00+00:00', ...more,
})

describe('an SMS is measured as the networks count it, the server\'s own cases', () => {
  it('has the cases the server is held to', () => {
    expect(cases.length).toBeGreaterThanOrEqual(15)
  })
  for (const c of cases) {
    it(c.name, () => {
      expect(smsLength(c.text)).toEqual({ encoding: c.encoding, units: c.units, segments: c.segments, per_segment: c.per_segment, unicode: c.unicode })
    })
  }
})

describe('tags are filled as the server fills them', () => {
  it('fills known tags as one line each, keeps the text\'s lines, and leaves an unknown tag as written', () => {
    const values = { '{{first_name}}': 'Ada\nEvil', '{{hotel_name}}': 'Lumière', '{{member_name}}': 'Ada Lovelace' }
    expect(fillTags('Hi {{first_name}},\r\ndouble points at {{hotel_name}}. {{unknown}}', values)).toBe('Hi Ada Evil,\ndouble points at Lumière. {{unknown}}')
    expect(fillTags('Tab\there', {})).toBe('Tab here')
    expect(unknownSmsTags('Hi {{first_name}} {{nope}} {{nope}}', ['{{first_name}}'])).toEqual(['{{nope}}'])
  })

  it('puts a tag where the cursor was, unless it would pass the limit', () => {
    expect(withTagAt('Hi !', 3, 3, '{{first_name}}', 100)).toEqual({ text: 'Hi {{first_name}}!', caret: 17 })
    expect(withTagAt('Hi NAME!', 3, 7, '{{first_name}}', 100)).toEqual({ text: 'Hi {{first_name}}!', caret: 17 })
    expect(withTagAt('x'.repeat(10), 10, 10, '{{first_name}}', 20)).toBeNull()
  })
})

describe('addresses and states', () => {
  it('keeps the tab and the campaign in the address', () => {
    expect(smsSearch(null)).toBe('?tab=sms')
    expect(smsSearch(12)).toBe('?tab=sms&message=12')
    expect(smsFrom('?tab=sms&message=12')).toBe(12)
    expect(smsFrom('?tab=sms&message=0')).toBeNull()
    expect(smsFrom('?tab=sms&message=x')).toBeNull()
  })

  it('opens a draft in the editor and anything else in its results, with only the buttons the server would honour', () => {
    expect(viewOf({ status: 'draft' })).toBe('editor')
    for (const status of ['scheduled', 'sending', 'sent', 'failed', 'cancelled']) expect(viewOf({ status })).toBe('results')
    expect(smsActions({ status: 'draft' })).toEqual({ edit: true, send: true, cancel: false, duplicate: true, remove: true })
    expect(smsActions({ status: 'sending' })).toEqual({ edit: false, send: false, cancel: true, duplicate: true, remove: false })
    expect(smsActions({ status: 'scheduled' })).toEqual({ edit: false, send: false, cancel: false, duplicate: true, remove: false })
    expect(['draft', 'scheduled', 'sending', 'sent', 'failed'].map(statusTone)).toEqual(['pending', 'approved', 'approved', 'fulfilled', 'declined'])
  })

  it('counts progress from the delivery rows and lists the outcomes that hold someone', () => {
    expect(progressOf({ status: 'sending', recipient_count: 200, results: { ...none, sent: 50, failed: 10 } })).toEqual({ done: 60, total: 200, percent: 30, gone: 0 })
    expect(progressOf({ status: 'sent', recipient_count: 10, results: { ...none, sent: 8 } })).toEqual({ done: 8, total: 10, percent: 100, gone: 2 })
    expect(outcomesOf({ sent: 3, failed: 0, skipped: 1, pending: 0 })).toEqual([{ code: 'sent', count: 3 }, { code: 'skipped', count: 1 }])
  })
})

describe('the draft', () => {
  const options = { max_name: 120, max_body: 918 }

  it('reads and writes the form, trimmed, with one kind of line break', () => {
    const f = formOf(draft())
    expect(f).toEqual({ name: 'Autumn', body: 'Hi {{first_name}}', segment_id: '3' })
    expect(bodyOf({ name: ' A ', body: ' a\r\nb ', segment_id: '' })).toEqual({ name: 'A', body: 'a\nb', segment_id: null })
    expect(isDirty(f, draft())).toBe(false)
    expect(isDirty({ ...f, body: 'Hi {{first_name}} ' }, draft())).toBe(false)
    expect(isDirty({ ...f, body: 'Hello' }, draft())).toBe(true)
  })

  it('says what stops a save, its own and the server\'s', () => {
    expect(draftProblems({ name: '', body: 'x'.repeat(919), segment_id: '' }, options)).toEqual({ name: 'name', body: 'body_long' })
    expect(draftProblems({ name: 'A', body: '🎉'.repeat(918), segment_id: '' }, options)).toEqual({})
    expect(serverProblems({ segment_id: ['x'], body: ['y'] })).toEqual({ body: 'body_long', segment_id: 'segment_gone' })
  })

  it('says why Send waits: Twilio first, then the draft, then its segment', () => {
    const segs = [{ id: 3, name: 'Gold', members: 40, problem: null }, { id: 9, name: 'Lapsed', members: 4, problem: { index: 0, reason: 'unknown_op' } }]
    expect(sendBlockers(draft(), false, segs, ready)).toEqual([])
    expect(sendBlockers(draft({ missing: ['body'], segment_id: null }), true, segs, { ...ready, ready: false })).toEqual(['twilio', 'unsaved', 'body', 'no_segment'])
    expect(sendBlockers(draft({ segment_id: 9 }), false, segs, ready)).toEqual(['segment_problem'])
    expect(sendBlockers(draft({ segment_id: 4 }), false, segs, ready)).toEqual(['segment_gone'])
    expect(sendBlockers(draft({ segment_id: 4 }), false, undefined, ready)).toEqual([])
    expect(canCount(draft(), false)).toBe(true)
    expect(canCount(draft({ segment_id: null }), false)).toBe(false)
    expect(canTest(draft(), false, ready)).toBe(true)
    expect(canTest(draft(), false, { ...ready, ready: false })).toBe(false)
    expect(canTest(draft({ missing: ['body'] }), false, ready)).toBe(false)
  })
})

describe('the confirmation and the cost hint', () => {
  const a = (more: Partial<SmsAudience> = {}): SmsAudience => ({
    segment: { id: 3, name: 'Gold' }, members: 100, reached: 60, no_consent: 30, no_phone: 5, bad_phone: 5, same_phone: 0, segments: 60, limit: 5000, ...more,
  })

  it('says who it reaches, who not and why, and how many SMS parts that comes to', () => {
    expect(confirmationOf(a())).toEqual({
      state: 'ok', reached: 60, left_out: 40, segments: 60, long: false,
      reasons: [{ code: 'no_consent', count: 30 }, { code: 'no_phone', count: 5 }, { code: 'bad_phone', count: 5 }],
    })
    expect(confirmationOf(a({ segments: 130 })).long).toBe(true)
    expect(confirmationOf(a({ reached: 0 })).state).toBe('nobody')
    expect(confirmationOf(a({ reached: 6000, members: 6000 })).state).toBe('over')
  })

  it('reads again what a refused Send makes untrue', () => {
    expect(sendRefusalRefreshes('audience_changed')).toEqual({ audience: true, message: false })
    expect(sendRefusalRefreshes('not_ready')).toEqual({ audience: false, message: true })
  })
})

describe('the venue\'s Twilio account', () => {
  it('lists what to set, in the settings page\'s order', () => {
    expect(twilioSteps({ ready: false, missing: ['phone_number', 'auth_token'], wrong: ['account_sid'], from: null })).toEqual([
      { field: 'account_sid', state: 'wrong' }, { field: 'auth_token', state: 'missing' }, { field: 'phone_number', state: 'missing' },
    ])
    expect(twilioSteps(ready)).toEqual([])
  })

  it('reads Twilio\'s error codes', () => {
    expect(twilioCode('twilio_21211')).toBe('21211')
    expect(twilioCode('http_500')).toBeNull()
    expect(twilioCode(null)).toBeNull()
  })
})
