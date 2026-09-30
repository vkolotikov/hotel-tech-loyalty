import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, dateOf, formatDate, formatInstant, hhmm, isDateKey, makeWall, minutesOf, monthGrid, monthOf,
  timeOf, venueNow, wallMinutes, weekOf, weekdayOf,
} from './wallClock'

describe('wall clock strings', () => {
  it('reads the date and the time as they are written — no zone, no conversion', () => {
    expect(dateOf('2026-10-06T10:00')).toBe('2026-10-06')
    expect(timeOf('2026-10-06T10:00')).toBe('10:00')
    expect(wallMinutes('2026-10-06T10:45')).toBe(645)
    expect(minutesOf('00:00')).toBe(0)
    expect(minutesOf('23:59')).toBe(1439)
  })

  it('writes a wall clock from a date and minutes', () => {
    expect(makeWall('2026-10-06', 600)).toBe('2026-10-06T10:00')
    expect(hhmm(65)).toBe('01:05')
    expect(hhmm(1440)).toBe('24:00')
    expect(hhmm(-5)).toBe('00:00')
  })

  it('knows a date key from anything else', () => {
    expect(isDateKey('2026-10-06')).toBe(true)
    for (const bad of ['2026-10-6', '06/10/2026', '2026-10-06T10:00', '', 'today']) expect(isDateKey(bad)).toBe(false)
  })
})

describe('calendar arithmetic', () => {
  it('adds days across months, years and the nights the clocks change', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    // Europe: clocks go back on 25 October 2026 and forward on 29 March 2026.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
  })

  it('weeks start on Monday', () => {
    expect(weekdayOf('2026-10-05')).toBe(0) // Monday
    expect(weekdayOf('2026-10-11')).toBe(6) // Sunday
    expect(weekOf('2026-10-06')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
    expect(weekOf('2026-10-11')[0]).toBe('2026-10-05')
  })

  it('a month grid is six Monday-first weeks around the month', () => {
    const grid = monthGrid('2026-10') // 1 October 2026 is a Thursday
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-09-28')
    expect(grid[3]).toBe('2026-10-01')
    expect(grid[41]).toBe('2026-11-08')
    expect(monthOf('2026-10-06')).toBe('2026-10')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', -10)).toBe('2025-12')
  })
})

describe('venueNow', () => {
  it('is the venue\'s clock, whatever zone this machine is in', () => {
    // 00:30 UTC on 25 October 2026: Riga is still on summer time (UTC+3).
    expect(venueNow('Europe/Riga', new Date('2026-10-25T00:30:00Z'))).toEqual({ date: '2026-10-25', minutes: 3 * 60 + 30 })
    // One hour later the clocks have gone back (UTC+2): it is 03:30 again.
    expect(venueNow('Europe/Riga', new Date('2026-10-25T01:30:00Z'))).toEqual({ date: '2026-10-25', minutes: 3 * 60 + 30 })
    // Late evening UTC is already tomorrow in Riga.
    expect(venueNow('Europe/Riga', new Date('2026-10-05T22:30:00Z'))).toEqual({ date: '2026-10-06', minutes: 90 })
    expect(venueNow('America/New_York', new Date('2026-10-06T02:00:00Z'))).toEqual({ date: '2026-10-05', minutes: 22 * 60 })
    expect(venueNow('UTC', new Date('2026-10-06T00:00:00Z'))).toEqual({ date: '2026-10-06', minutes: 0 })
  })

  it('falls back to UTC for a zone the browser does not know', () => {
    expect(venueNow('Not/AZone', new Date('2026-10-06T09:15:00Z'))).toEqual({ date: '2026-10-06', minutes: 555 })
  })
})

describe('formatting', () => {
  it('a date key is formatted as that calendar day', () => {
    expect(formatDate('2026-10-06', 'en-US', { day: 'numeric' })).toBe('6')
    expect(formatDate('2026-10-06', 'en-US', { weekday: 'long' })).toBe('Tuesday')
    expect(formatDate('2026-01-01', 'en-US', { month: 'long', year: 'numeric' })).toBe('January 2026')
  })

  it('an audit instant is shown on the venue\'s clock', () => {
    expect(formatInstant('2026-10-05T09:15:00+00:00', 'en-GB', 'Europe/London')).toContain('10:15')
    expect(formatInstant('2026-10-05T09:15:00+00:00', 'en-GB', 'Europe/Riga')).toContain('12:15')
    expect(formatInstant('not a date', 'en-GB', 'Europe/London')).toBe('')
  })
})
