import { describe, expect, it } from 'vitest'
import { copyToWeekdays, dayDate, dayProblem, toRows, toWeek } from './hours'

describe('a week of working hours', () => {
  const rows = [
    { day_of_week: 0, start_time: '10:00', end_time: '14:00' },
    { day_of_week: 1, start_time: '14:00', end_time: '18:00' },
    { day_of_week: 1, start_time: '09:00', end_time: '13:00' },
    { day_of_week: 2, start_time: '09:00', end_time: '17:00', is_active: false },
  ]

  it('reads rows into days, earliest first, and leaves out a switched-off row', () => {
    const week = toWeek(rows)
    expect(week[1]).toEqual([{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }])
    expect(week[2]).toEqual([])
    expect(week[0]).toEqual([{ start: '10:00', end: '14:00' }])
  })

  it('writes days back as rows, Monday first and Sunday last', () => {
    expect(toRows(toWeek(rows)).map(r => `${r.day_of_week} ${r.start_time}`)).toEqual(['1 09:00', '1 14:00', '0 10:00'])
  })

  it('copies one day to Monday–Friday and leaves the weekend', () => {
    const week = copyToWeekdays(toWeek(rows), 0)
    for (const day of [1, 2, 3, 4, 5]) expect(week[day]).toEqual([{ start: '10:00', end: '14:00' }])
    expect(week[6]).toEqual([])
  })

  it('names the problem the server would refuse', () => {
    expect(dayProblem([{ start: '09:00', end: '17:00' }])).toBeNull()
    expect(dayProblem([{ start: '20:00', end: '24:00' }])).toBeNull()
    expect(dayProblem([{ start: '17:00', end: '09:00' }])).toBe('order')
    expect(dayProblem([{ start: '09:00', end: '13:00' }, { start: '12:00', end: '15:00' }])).toBe('overlap')
    expect(dayProblem(Array.from({ length: 7 }, (_, i) => ({ start: `0${i}:00`, end: `0${i}:30` })))).toBe('too_many')
    expect(dayProblem([{ start: '9:00', end: '17:00' }])).toBe('format')
    expect(dayProblem([{ start: '09:00', end: '25:00' }])).toBe('format')
  })

  it('names a weekday with a date in the week of 5 October 2026 (a Monday)', () => {
    expect(dayDate(1)).toBe('2026-10-05')
    expect(dayDate(0)).toBe('2026-10-11')
  })
})
