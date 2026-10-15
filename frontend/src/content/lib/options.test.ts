import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import { DEFAULT_MIX, DEFAULT_RHYTHM, MIX_CATEGORIES, OPTION_GROUPS, RHYTHM_DAYS, optionSlug, optionText } from './options'

describe('option lists', () => {
  it('are worded in the English bundle exactly as their fallbacks (by slug)', () => {
    for (const [group, map] of Object.entries(OPTION_GROUPS)) {
      const bySlug = Object.fromEntries(Object.entries(map).map(([value, label]) => [optionSlug(value), label]))
      expect((en.options as Record<string, unknown>)[group], `content.options.${group}`).toEqual(bySlug)
    }
  })

  it('turn a stored value into a key part ("real photos" → real_photos, "UI mockups" → ui_mockups)', () => {
    expect(optionSlug('real photos')).toBe('real_photos')
    expect(optionSlug('UI mockups')).toBe('ui_mockups')
    expect(optionSlug('trend_aware')).toBe('trend_aware')
  })

  it('name a known value in the reader\'s words, and show a value the list does not know as itself', () => {
    const t = (key: string, fallback: string) => `${key}|${fallback}`
    expect(optionText(t, 'tone', 'warm')).toBe('content.options.tone.warm|Warm')
    expect(optionText(t, 'tone', 'Cosy and calm')).toBe('Cosy and calm')
    expect(optionText(t, 'tone', '')).toBe('')
  })

  it('start a content mix at 100 % and a weekly rhythm on all seven days, from known values only', () => {
    expect(Object.values(DEFAULT_MIX).reduce((a, b) => a + b, 0)).toBe(100)
    for (const key of Object.keys(DEFAULT_MIX)) expect(MIX_CATEGORIES).toHaveProperty(key)
    expect(Object.keys(DEFAULT_RHYTHM)).toEqual([...RHYTHM_DAYS])
  })
})
