import { describe, expect, it } from 'vitest'
import { dayLabel, dayName, type Words } from './dayNames'

// A stand-in for i18next: the bundle's words where it has them, the English otherwise, {{names}} filled.
const bundle: Record<string, string> = { 'content.keydates.day.christmas': 'Рождество' }
const t: Words = (key, english, vars) => (bundle[key] ?? english).replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? ''))

// Spec 2026-10-16 §9.3: a built-in day's name comes from the bundles under its id; the server's English is the fallback.
describe('dayName and dayLabel', () => {
  it('names a day from the bundle, else in the server’s English', () => {
    expect(dayName(t, { id: 'christmas', name_en: 'Christmas Day' })).toBe('Рождество')
    expect(dayName(t, { id: 'gb.early_may', name_en: 'Early May bank holiday' })).toBe('Early May bank holiday')
  })

  it('says a substitute day is the day off in lieu, or observed in the United States', () => {
    const boxing = { id: 'gb.boxing_day', kind: 'holiday' as const, date: '2026-12-28', substitute: true, name_en: 'Boxing Day' }
    expect(dayLabel(t, boxing, false)).toBe('Boxing Day (day off in lieu)')
    expect(dayLabel(t, { ...boxing, id: 'us.independence', name_en: 'Independence Day' }, true)).toBe('Independence Day (observed)')
    expect(dayLabel(t, { ...boxing, substitute: false }, false)).toBe('Boxing Day')
  })
})
