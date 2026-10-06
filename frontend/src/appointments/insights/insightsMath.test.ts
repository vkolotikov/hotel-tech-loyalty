import { describe, expect, it } from 'vitest'
import {
  average, canShow, countChange, formatPeriod, formatShare, moneyChange, needsDeskNote, onlineShare, pickOf, pointsChange,
  rangeFor, rangeFromSearch, share, toneOf,
} from './insightsMath'

describe('chosen dates', () => {
  it('can be shown only with both dates filled in (polish G2)', () => {
    expect(canShow({ from: '2026-09-20', to: '2026-10-10' })).toBe(true)
    expect(canShow({ from: '', to: '2026-10-10' })).toBe(false)
    expect(canShow({ from: '2026-09-20', to: '' })).toBe(false)
  })
})

describe('period picks on the venue calendar', () => {
  it('works out each pick from a Monday, a Sunday, the 31st and New Year’s Day', () => {
    expect(rangeFor('this_week', '2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeFor('this_week', '2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeFor('last_week', '2026-10-11')).toEqual({ from: '2026-09-28', to: '2026-10-04' })
    expect(rangeFor('this_month', '2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(rangeFor('last_month', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(rangeFor('last_month', '2026-01-01')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('names the pick a range is, or custom', () => {
    expect(pickOf({ from: '2026-10-05', to: '2026-10-11' }, '2026-10-07')).toBe('this_week')
    expect(pickOf({ from: '2026-09-01', to: '2026-09-30' }, '2026-10-07')).toBe('last_month')
    expect(pickOf({ from: '2026-09-03', to: '2026-09-30' }, '2026-10-07')).toBe('custom')
  })

  it('reads the address, and opens on This week when it is missing or garbled', () => {
    const today = '2026-10-07'
    expect(rangeFromSearch(new URLSearchParams('from=2026-09-01&to=2026-09-30'), today)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    for (const q of ['', 'from=abc&to=2026-09-30', 'from=2026-09-01', 'to=2026-09-30', 'from=2026-9-1&to=2026-09-30']) {
      expect(rangeFromSearch(new URLSearchParams(q), today)).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    }
    // From after To is passed on: the server answers with its own sentence.
    expect(rangeFromSearch(new URLSearchParams('from=2026-09-30&to=2026-09-01'), today)).toEqual({ from: '2026-09-30', to: '2026-09-01' })
  })
})

describe('rates out of bookings due', () => {
  it('has no rate when nothing is due', () => {
    expect(share(0, 0)).toBeNull()
    expect(formatShare(null, 'en')).toBe('—')
  })

  it('shows one decimal under 10% and none from 10%', () => {
    expect(formatShare(share(6, 108), 'en')).toBe('5.6%')
    expect(formatShare(share(84, 108), 'en')).toBe('78%')
    expect(formatShare(share(0, 12), 'en')).toBe('0%')
    expect(formatShare(share(12, 12), 'en')).toBe('100%')
  })
})

describe('changes from the period before', () => {
  it('compares counts, even from zero', () => {
    expect(countChange(84, 72)).toEqual({ direction: 'up', delta: 12 })
    expect(countChange(3, 5)).toEqual({ direction: 'down', delta: 2 })
    expect(countChange(4, 4)).toEqual({ direction: 'same', delta: 0 })
    expect(countChange(3, 0)).toEqual({ direction: 'up', delta: 3 })
  })

  it('compares rates in points, and not at all when either has nothing due', () => {
    expect(pointsChange(6 / 108, 0.068)).toEqual({ direction: 'down', delta: 1.2 })
    expect(pointsChange(null, 0.05)).toBeNull()
    expect(pointsChange(0.05, null)).toBeNull()
  })

  it('compares money only when both periods had that currency', () => {
    expect(moneyChange(4210, 3680)).toEqual({ direction: 'up', delta: 530 })
    expect(moneyChange(10.1, 10.1)).toEqual({ direction: 'same', delta: 0 })
    expect(moneyChange(4210, undefined)).toBeNull()
    expect(moneyChange(undefined, 10)).toBeNull()
  })

  it('colours a change by what it means for the venue', () => {
    expect(toneOf('done', 'up')).toBe('good')
    expect(toneOf('value_done', 'down')).toBe('bad')
    expect(toneOf('no_show', 'up')).toBe('bad')
    expect(toneOf('late_cancel', 'down')).toBe('good')
    expect(toneOf('taken', 'same')).toBe('plain')
  })
})

describe('money and sources', () => {
  it('averages over visits done in that currency, and has no average without any', () => {
    expect(average({ done: 84, value_done: 4210, taken: 3950, owed_done: 260 })).toBeCloseTo(50.119, 3)
    expect(average({ done: 0, value_done: 0, taken: 40, owed_done: 0 })).toBeNull()
  })

  it('gives the online share of every booking in the period', () => {
    expect(onlineShare({ online: 61, desk: 44, other: 3 })).toBeCloseTo(61 / 108, 6)
    expect(onlineShare({ online: 0, desk: 0, other: 0 })).toBeNull()
  })

  it('writes the period as dates', () => {
    const text = formatPeriod({ from: '2026-10-05', to: '2026-10-11' }, 'en-GB')
    expect(text).toContain('5')
    expect(text).toContain('11')
    expect(text).toContain('Oct')
    expect(text).toContain('2026')
  })

  it('warns about money before the desk ledger only for periods that start before it', () => {
    expect(needsDeskNote('2026-10-04', '2026-10-05')).toBe(true)
    expect(needsDeskNote('2026-10-05', '2026-10-05')).toBe(false)
  })
})
