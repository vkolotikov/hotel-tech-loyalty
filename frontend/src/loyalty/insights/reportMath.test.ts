import { describe, expect, it } from 'vitest'
import { comparison, csvCell, presetRange, reportFilters, reportPlaceholder, reportRequest, selectedPreset, shiftDay, validReportRange } from './reportMath'
import { LOYALTY_LOCALE_FILES } from '../i18n'

describe('completed-day report', () => {
  it('uses venue date, preserves URL scope and handles leap days without local timezone conversion', () => {
    expect(reportFilters('', '2026-10-28')).toEqual({ from: '2026-09-30', to: '2026-10-27', compare: 'previous', tier_id: '', state: 'all', consent: 'all' })
    expect(shiftDay('2024-03-01', -1)).toBe('2024-02-29')
    expect(reportFilters('?from=2026-02-30&to=2026-10-27&compare=none&tier_id=9', '2026-10-28')).toEqual({ from: '2026-09-30', to: '2026-10-27', compare: 'none', tier_id: '9', state: 'all', consent: 'all' })
  })
  it('keeps audience selections in bookmarks and maps no-level to a separate validated API filter', () => {
    const f = reportFilters('tier_id=none&state=inactive&consent=no', '2026-11-06')
    expect(f).toMatchObject({ tier_id: 'none', state: 'inactive', consent: 'no' })
    expect(reportRequest(f)).toMatchObject({ tier_id: undefined, without_tier: 1, state: 'inactive', consent: 'no' })
    expect(reportFilters('state=invalid&consent=invalid', '2026-11-06')).toMatchObject({ state: 'all', consent: 'all' })
  })
  it('presets count completed venue days across leap years and calendar boundaries', () => {
    expect(presetRange('7d', '2024-03-01')).toEqual({ from: '2024-02-23', to: '2024-02-29' })
    expect(presetRange('month', '2026-01-01')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(presetRange('month', '2024-03-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(selectedPreset(reportFilters('', '2026-11-06'), '2026-11-06')).toBe('28d')
    expect(selectedPreset(reportFilters('from=2026-10-01&to=2026-10-12', '2026-11-06'), '2026-11-06')).toBe('custom')
    for (const preset of ['7d', '28d', '90d', 'month', 'year'] as const) expect(validReportRange({ ...reportFilters('', '2024-03-01'), ...presetRange(preset, '2024-03-01') }, '2024-03-01')).toBe(true)
  })
  it('rejects future, reversed and excessive periods', () => {
    const f = reportFilters('', '2026-10-28')
    expect(validReportRange(f, '2026-10-28')).toBe(true)
    expect(validReportRange({ ...f, to: '2026-10-28' }, '2026-10-28')).toBe(false)
    expect(validReportRange({ ...f, from: '2026-10-28' }, '2026-10-28')).toBe(false)
    expect(validReportRange({ ...f, from: '2024-01-01' }, '2026-10-28')).toBe(false)
    expect(validReportRange({ ...f, from: '2026-02-30', to: '2026-03-05' }, '2026-10-28')).toBe(false)
    expect(validReportRange({ ...f, from: '2026-1' }, '2026-10-28')).toBe(false)
  })
  it('keeps charts during a filter refresh but never across organisations, staff or permissions', () => {
    const previous = { members: 42 }
    expect(reportPlaceholder(previous, '1:5:analytics', '1:5:analytics')).toBe(previous)
    for (const scope of ['2:5:analytics', '1:6:analytics', '1:5:restricted']) expect(reportPlaceholder(previous, '1:5:analytics', scope)).toBeUndefined()
    expect(reportPlaceholder(previous, undefined, '1:5:analytics')).toBeUndefined()
  })
  it('distinguishes relative count changes, percentage points and unavailable baselines', () => {
    expect(comparison(60, 50)).toBe(20)
    expect(comparison(60, 50, true)).toBe(10)
    expect(comparison(10, 0)).toBeNull()
    expect(comparison(null, 50)).toBeNull()
    expect(comparison(10, 0, true)).toBe(10)
  })
  it('escapes CSV cells and prevents spreadsheet formulas without losing numeric negatives', () => {
    expect(csvCell('="leak"')).toBe('"\'=""leak"""')
    expect(csvCell(' @SUM(A1)')).toBe('"\' @SUM(A1)"')
    expect(csvCell(-3)).toBe('"-3"')
    expect(csvCell('Coffee, "large"')).toBe('"Coffee, ""large"""')
  })
  it('keeps every locale and interpolation complete', () => {
    const en = LOYALTY_LOCALE_FILES.en.insightdesign
    for (const bundle of Object.values(LOYALTY_LOCALE_FILES)) {
      expect(Object.keys(bundle.insightdesign).sort()).toEqual(Object.keys(en).sort())
      for (const k of Object.keys(en) as (keyof typeof en)[]) expect(bundle.insightdesign[k].match(/{{\w+}}/g)?.sort() ?? []).toEqual(en[k].match(/{{\w+}}/g)?.sort() ?? [])
    }
  })
})
