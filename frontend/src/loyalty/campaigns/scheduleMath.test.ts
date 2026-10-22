import { describe, expect, it } from 'vitest'
import { badTimeReason, defaultSendAt, isScheduled, isWall, laterProblem, scheduleActions, scheduledWhen, scheduleRefusalRefreshes, venueClockNow } from './scheduleMath'

/** Send later's decisions (spec 2026-10-22 release 4 §5), the same for email campaigns, push messages and SMS. */
describe('send later', () => {
  it('takes a time only as the server does: a real day, an hour and a minute, no offset', () => {
    expect(isWall('2026-10-06T10:00')).toBe(true)
    expect(isWall('2026-02-30T10:00')).toBe(false)
    expect(isWall('2026-10-06T24:00')).toBe(false)
    expect(isWall('2026-10-06T10:00:00')).toBe(false)
    expect(isWall('2026-10-06T10:00+03:00')).toBe(false)
    expect(isWall('')).toBe(false)
  })

  it('starts a new schedule tomorrow at 10:00 on the venue\'s clock, across a month\'s end too', () => {
    expect(defaultSendAt('2026-10-21')).toBe('2026-10-22T10:00')
    expect(defaultSendAt('2026-12-31')).toBe('2027-01-01T10:00')
  })

  it('refuses a time less than two minutes from the venue\'s now, before the server is asked', () => {
    const now = { date: '2026-10-21', minutes: 14 * 60 + 30 }
    expect(laterProblem('2026-10-21T14:31', now)).toBe('past')
    expect(laterProblem('2026-10-21T14:32', now)).toBeNull()
    expect(laterProblem('2026-10-20T23:59', now)).toBe('past')
    expect(laterProblem('2026-10-22T00:00', now)).toBeNull()
    expect(laterProblem('soon', now)).toBe('format')
  })

  it('reads the venue\'s now on its own zone, whatever the browser\'s', () => {
    expect(venueClockNow('Europe/Riga', new Date('2026-10-21T21:30:00Z'))).toEqual({ date: '2026-10-22', minutes: 30 })
    expect(venueClockNow('America/New_York', new Date('2026-10-21T02:00:00Z'))).toEqual({ date: '2026-10-20', minutes: 22 * 60 })
  })

  it('names the server\'s bad_time reasons, and only those', () => {
    const f = (code: string, reason?: unknown) => ({ status: 422, code, extra: reason === undefined ? {} : { reason } })
    expect(badTimeReason(f('bad_time', 'not_on_clock'))).toBe('not_on_clock')
    expect(badTimeReason(f('bad_time', 'too_far'))).toBe('too_far')
    expect(badTimeReason(f('bad_time', 'odd'))).toBe('format')
    expect(badTimeReason(f('changed'))).toBeNull()
    expect(badTimeReason(null)).toBeNull()
  })

  it('writes a scheduled time in the reader\'s language with the venue\'s digits unchanged', () => {
    expect(scheduledWhen('2026-10-06T10:05', 'en')).toBe('Tue, Oct 6, 10:05')
    expect(scheduledWhen('2026-10-06T10:05', 'de')).toContain('10:05')
    expect(scheduledWhen(null, 'en')).toBe('')
  })

  it('offers Change time and Take back only while it waits, and reads it again when the server says it moved on', () => {
    expect(isScheduled('scheduled')).toBe(true)
    expect(scheduleActions('scheduled')).toEqual({ move: true, takeBack: true })
    for (const status of ['draft', 'sending', 'sent', 'failed']) expect(scheduleActions(status)).toEqual({ move: false, takeBack: false })
    expect(scheduleRefusalRefreshes('not_scheduled')).toBe(true)
    expect(scheduleRefusalRefreshes('bad_time')).toBe(false)
  })
})
