import { afterEach, describe, expect, it } from 'vitest'
import {
  addDaysToKey, addMonthsToKey, dayNumber, formatDayKey, formatWallDateTime, formatWallTime,
  monthGridKeys, mondayOfKey, todayKey, wallDay, wallHour, weekKeys,
} from './venueTime'

/**
 * The full admin reads a service booking's time as the venue's clock: the
 * server stores and sends the venue's wall clock (labelled +00:00), so the
 * browser's own zone must never move it. Every case runs with this
 * computer's clock set east of UTC, west of UTC, and on UTC.
 */
const ZONES = ['Europe/Riga', 'America/New_York', 'UTC']
const original = process.env.TZ
afterEach(() => { process.env.TZ = original })

describe.each(ZONES)('with the computer in %s', (zone) => {
  const inZone = () => { process.env.TZ = zone }

  it('reads a booking time as the venue\'s clock, whatever the label on it', () => {
    inZone()
    for (const iso of ['2026-10-21T15:00:00.000000Z', '2026-10-21T15:00:00+00:00', '2026-10-21T15:00:00', '2026-10-21 15:00:00']) {
      expect(formatWallTime(iso, 'en-GB')).toBe('15:00')
      expect(wallHour(iso)).toBe(15)
      expect(wallDay(iso)).toBe('2026-10-21')
    }
    expect(formatWallTime('2026-10-21T00:30:00Z', 'en-GB')).toBe('00:30')
    expect(wallDay('2026-10-21T23:30:00Z')).toBe('2026-10-21')
    expect(formatWallDateTime('2026-10-21T15:00:00.000000Z', 'en-GB')).toBe('21/10/2026, 15:00:00')
  })

  it('answers nothing for nothing', () => {
    inZone()
    expect(formatWallTime(null)).toBe('')
    expect(formatWallTime('not a time')).toBe('')
    expect(formatWallDateTime(undefined)).toBe('')
    expect(wallHour('')).toBeNull()
  })

  it('builds a Monday-first month of 42 days that starts on the right day', () => {
    inZone()
    const october = monthGridKeys(2026, 10) // 1 October 2026 is a Thursday
    expect(october).toHaveLength(42)
    expect(october.slice(0, 7)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(october[41]).toBe('2026-11-08')
    const march = monthGridKeys(2026, 3) // the clocks change in March in Europe and the US
    expect(march[0]).toBe('2026-02-23')
    expect(new Set(march).size).toBe(42)
  })

  it('moves by days, weeks and months on the calendar, not on a clock', () => {
    inZone()
    expect(addDaysToKey('2026-10-21', 1)).toBe('2026-10-22')
    expect(addDaysToKey('2026-03-28', 2)).toBe('2026-03-30') // across the spring change
    expect(addDaysToKey('2026-10-24', 2)).toBe('2026-10-26') // across the autumn change
    expect(addDaysToKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(addMonthsToKey('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsToKey('2026-12-15', 1)).toBe('2027-01-15')
    expect(mondayOfKey('2026-10-21')).toBe('2026-10-19')
    expect(mondayOfKey('2026-10-25')).toBe('2026-10-19') // a Sunday belongs to the week before
    expect(weekKeys('2026-10-21')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
    expect(dayNumber('2026-10-01')).toBe(1)
  })

  it('names a day without moving it', () => {
    inZone()
    expect(formatDayKey('2026-10-01', 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })).toBe('Thursday 1 October')
  })

  it('takes today from this computer\'s own calendar date', () => {
    inZone()
    const now = new Date(2026, 9, 21, 0, 30) // 00:30 local time on 21 October
    expect(todayKey(now)).toBe('2026-10-21')
  })
})
