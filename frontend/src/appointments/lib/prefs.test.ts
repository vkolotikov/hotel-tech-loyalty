import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, parsePrefs } from './prefs'

describe('parsePrefs', () => {
  it('reads what it wrote', () => {
    expect(parsePrefs(JSON.stringify({ view: 'week', masterId: 4, showCancelled: true }))).toEqual({ view: 'week', masterId: 4, showCancelled: true })
  })

  it('falls back field by field on anything it does not recognise', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('[]')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ view: 'month', masterId: '4', showCancelled: 'yes' }))).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ view: 'list' }))).toEqual({ ...DEFAULT_PREFS, view: 'list' })
  })
})
