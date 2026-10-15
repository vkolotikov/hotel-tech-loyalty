import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import { PRESET_TEXT, PROBLEM_TEXT, daysIn, presetRange, rangeProblem } from './generateMath'

describe('presetRange', () => {
  it('this week and next week run Monday to Sunday; this month runs from its first to its last day', () => {
    expect(presetRange('this_week', '2026-10-08')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(presetRange('next_week', '2026-10-08')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(presetRange('this_month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(presetRange('this_month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('rangeProblem', () => {
  it('needs both days, in order, at most 62 of them, and not all gone', () => {
    expect(daysIn('2026-10-01', '2026-12-01')).toBe(62)
    expect(rangeProblem('', '2026-10-11', '2026-10-08')).toBe('missing')
    expect(rangeProblem('2026-10-11', '2026-10-05', '2026-10-08')).toBe('order')
    expect(rangeProblem('2026-10-01', '2026-12-02', '2026-10-08')).toBe('too_long')
    expect(rangeProblem('2026-09-01', '2026-09-30', '2026-10-08')).toBe('past')
    expect(rangeProblem('2026-10-05', '2026-10-11', '2026-10-08')).toBeNull()
  })

  it('says each problem, and names each preset, in the English bundle\'s words', () => {
    expect(en.generate.problem).toEqual(PROBLEM_TEXT)
    expect(en.generate.preset).toEqual(PRESET_TEXT)
  })
})
