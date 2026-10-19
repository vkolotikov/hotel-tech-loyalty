import { describe, expect, it } from 'vitest'
import type { PostDetail } from '../lib/types'
import { addMonthsKept, asksAi, pollsWhileRewording, repeatDates, repeatProblem, untilFor } from './repeatMath'

// The server's ContentRepeat::dates and RepeatController::store, mirrored (Review Focus 4). Today is Monday 5 October 2026.
const today = '2026-10-05'

describe('repeatDates', () => {
  it('keeps the weekday every week or two, includes the last day, and leaves out days already gone', () => {
    expect(repeatDates('2026-10-07', 'week', '2026-10-28', today)).toEqual(['2026-10-14', '2026-10-21', '2026-10-28'])
    expect(repeatDates('2026-10-07', '2weeks', '2026-11-10', today)).toEqual(['2026-10-21', '2026-11-04'])
    expect(repeatDates('2026-09-23', 'week', '2026-10-07', today)).toEqual(['2026-10-07'])
  })

  it('keeps the day of the month, or takes the month\'s last day when it is shorter', () => {
    expect(repeatDates('2028-01-31', 'month', '2028-04-30', '2028-01-01')).toEqual(['2028-02-29', '2028-03-31', '2028-04-30'])
    expect(addMonthsKept('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsKept('2026-12-15', 1)).toBe('2027-01-15')
  })
})

describe('repeatProblem', () => {
  const ask = (from: string | null, every: 'week' | '2weeks' | 'month', until: string, aiRewrite = false) => repeatProblem({ from, every, until, aiRewrite, today })

  it('allows an end exactly 12 months after the post\'s day, not one day more', () => {
    expect(ask('2026-10-08', 'month', '2027-10-08')).toBeNull()
    expect(ask('2026-10-08', 'month', '2027-10-09')).toBe('until_too_far')
  })

  it('allows 26 copies and 12 AI copies, not 27 or 13', () => {
    expect(ask('2026-10-08', 'week', '2027-04-08')).toBeNull()
    expect(ask('2026-10-08', 'week', '2027-04-15')).toBe('too_many_copies')
    expect(ask('2026-10-08', 'week', '2026-12-31', true)).toBeNull()
    expect(ask('2026-10-08', 'week', '2027-01-07', true)).toBe('too_many_ai')
  })

  it('needs a day, and a day to repeat on before the end', () => {
    expect(ask(null, 'week', '2026-10-28')).toBe('no_day')
    expect(ask('2026-10-08', 'week', '2026-10-10')).toBe('no_dates')
  })
})

describe('pollsWhileRewording', () => {
  it('reads the post again only while the AI rewords its series', () => {
    const series = { id: 5, every: 'week' as const, until: '2026-10-28', more: 3, removable: 3, rewriting: true }
    expect(pollsWhileRewording({ series } as unknown as PostDetail)).toBe(true)
    expect(pollsWhileRewording({ series: { ...series, rewriting: false } } as unknown as PostDetail)).toBe(false)
    expect(pollsWhileRewording(undefined)).toBe(false)
  })
})

// Final review (Plan 3B): the end date was fixed when the section first drew, so a post moved weeks later opened
// Repeat on "no day to repeat on"; a ticked AI box stayed ticked once the budget ran out, and every Repeat was refused.
describe('untilFor', () => {
  it('follows the post\'s day, four weeks on, until the person picks a date', () => {
    expect(untilFor(null, '2026-10-07', today)).toBe('2026-11-04')
    expect(untilFor(null, '2026-12-20', today)).toBe('2027-01-17')
    expect(untilFor(null, '2026-09-30', today)).toBe('2026-11-02')
    expect(untilFor('2026-11-01', '2026-12-20', today)).toBe('2026-11-01')
  })
})

describe('asksAi', () => {
  it('asks the AI only while the box is ticked and the budget is not used up', () => {
    expect(asksAi(true, 'under')).toBe(true)
    expect(asksAi(true, 'warn')).toBe(true)
    expect(asksAi(true, 'unlimited')).toBe(true)
    expect(asksAi(true, 'over')).toBe(false)
    expect(asksAi(false, 'under')).toBe(false)
  })
})

describe('pollsWhileRewording and versions (spec 2026-10-19 §3.3)', () => {
  it('reads the post again while the AI adapts any version of its group, and not once it is done', () => {
    const group = { id: 5, posts: [], adapting: [6], kept_original: [], kept_reason: null }
    expect(pollsWhileRewording({ group } as unknown as PostDetail)).toBe(true)
    expect(pollsWhileRewording({ group: { ...group, adapting: [] } } as unknown as PostDetail)).toBe(false)
    expect(pollsWhileRewording({ group: null } as unknown as PostDetail)).toBe(false)
  })
})
