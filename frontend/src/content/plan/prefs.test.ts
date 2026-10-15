import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, parsePrefs } from './prefs'

const PLATFORMS = ['instagram', 'linkedin']
const STATUSES = ['draft', 'published']

describe('parsePrefs', () => {
  it('reads a stored choice', () => {
    expect(parsePrefs(JSON.stringify({ view: 'month', filter: { platforms: ['linkedin'], status: 'draft' } }), PLATFORMS, STATUSES))
      .toEqual({ view: 'month', filter: { platforms: ['linkedin'], status: 'draft' } })
  })

  it('falls back one field at a time for anything unknown or broken', () => {
    expect(parsePrefs(null, PLATFORMS, STATUSES)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{not json', PLATFORMS, STATUSES)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ view: 'day', filter: { platforms: ['myspace', 'instagram', 3], status: 'gone' } }), PLATFORMS, STATUSES))
      .toEqual({ view: 'week', filter: { platforms: ['instagram'], status: 'all' } })
    expect(parsePrefs('"week"', PLATFORMS, STATUSES)).toEqual(DEFAULT_PREFS)
  })
})
