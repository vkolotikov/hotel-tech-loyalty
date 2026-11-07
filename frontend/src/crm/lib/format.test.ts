import { describe, expect, it } from 'vitest'
import { count, dayLabel, initials, money, percent, timeAgo } from './format'

describe('how HexaTech CRM writes times, days and money', () => {
  const now = new Date('2026-11-04T10:00:00Z')

  it('says how long ago an instant was', () => {
    expect(timeAgo('2026-11-04T09:59:40Z', 'en', now)).toBe('now')
    expect(timeAgo('2026-11-04T09:55:00Z', 'en', now)).toBe('5 min. ago')
    expect(timeAgo('2026-11-04T07:00:00Z', 'en', now)).toBe('3 hr. ago')
    expect(timeAgo('2026-11-03T08:00:00Z', 'en', now)).toBe('yesterday')
    expect(timeAgo(null, 'en', now)).toBe('')
    expect(timeAgo('not a date', 'en', now)).toBe('')
  })

  it('reads a calendar day as a date, never as an instant', () => {
    expect(dayLabel('2026-11-04', 'en')).toBe('Wed, Nov 4')
    expect(dayLabel('2026-11-04T23:30:00-05:00', 'en')).toBe('Wed, Nov 4')
    expect(dayLabel(null, 'en')).toBe('')
  })

  it('writes money in the venue\'s currency, whole units unless there are cents', () => {
    expect(money(1250, 'EUR', 'en')).toBe('€1,250')
    expect(money('200.5', 'EUR', 'en')).toBe('€200.50')
    expect(money(null, 'EUR', 'en')).toBe('—')
    expect(count(12500, 'en')).toBe('12,500')
  })

  it('shares and initials', () => {
    expect(percent(1, 3)).toBe(33)
    expect(percent(0, 0)).toBeNull()
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('maria@example.test')).toBe('M')
    expect(initials('Ūna')).toBe('Ū')
    expect(initials(null)).toBe('?')
  })
})
