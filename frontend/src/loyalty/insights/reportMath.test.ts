import { describe, expect, it } from 'vitest'
import { comparison, csvCell, reportFilters, shiftDay, validReportRange } from './reportMath'
import { LOYALTY_LOCALE_FILES } from '../i18n'

describe('completed-day report', () => {
  it('uses venue date, preserves URL scope and handles leap days without local timezone conversion', () => {
    expect(reportFilters('', '2026-10-28')).toEqual({ from: '2026-09-30', to: '2026-10-27', compare: 'previous', tier_id: '' })
    expect(shiftDay('2024-03-01', -1)).toBe('2024-02-29')
    expect(reportFilters('?from=2026-02-30&to=2026-10-27&compare=none&tier_id=9', '2026-10-28')).toEqual({ from: '2026-09-30', to: '2026-10-27', compare: 'none', tier_id: '9' })
  })
  it('rejects future, reversed and excessive periods', () => {
    const f = reportFilters('', '2026-10-28')
    expect(validReportRange(f, '2026-10-28')).toBe(true)
    expect(validReportRange({ ...f, to: '2026-10-28' }, '2026-10-28')).toBe(false)
    expect(validReportRange({ ...f, from: '2026-10-28' }, '2026-10-28')).toBe(false)
    expect(validReportRange({ ...f, from: '2024-01-01' }, '2026-10-28')).toBe(false)
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
