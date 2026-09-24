import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'
import { formatDay, formatDateTime, formatTime } from './dates'

describe('formatMoney', () => {
  it('formats in the venue currency for the member locale', () => {
    expect(formatMoney(1234.5, 'EUR', 'de')).toBe('1.234,50 €')
    expect(formatMoney(80, 'GBP', 'en')).toBe('£80.00')
  })
  it('survives an unknown currency code', () => {
    expect(formatMoney(12, 'XXX?', 'en')).toBe('12.00 XXX?')
  })
})

describe('dates', () => {
  it('renders a calendar date without letting the timezone move it', () => {
    expect(formatDay('2026-10-03', 'en')).toBe('3 Oct 2026')
    expect(formatDay('2026-10-03T23:59:59+03:00', 'en')).toBe('3 Oct 2026')
  })
  it('renders an instant in the venue timezone', () => {
    expect(formatDateTime('2026-10-03T07:30:00Z', 'en', 'Europe/Riga')).toBe('3 Oct 2026, 10:30')
    expect(formatTime('2026-10-03T07:30:00Z', 'en', 'Europe/Riga')).toBe('10:30')
  })
  it('gives the raw value back rather than "Invalid Date"', () => {
    expect(formatDateTime('not-a-date', 'en')).toBe('not-a-date')
  })
})
