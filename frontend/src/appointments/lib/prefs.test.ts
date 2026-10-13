import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFS, loadPrefs, parsePrefs, savePrefs, type Prefs } from './prefs'

describe('savePrefs and loadPrefs', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('read back exactly what was written, the people hidden on the day view included', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } })
    const chosen: Prefs = { view: 'week', masterId: 4, showCancelled: true, hiddenMasters: [2, 5] }
    savePrefs(chosen)
    expect(store.size).toBe(1)
    expect(loadPrefs()).toEqual(chosen)
  })

  it('fall back to the defaults when the store cannot be read or written', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } } })
    expect(() => savePrefs(DEFAULT_PREFS)).not.toThrow()
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })
})

describe('parsePrefs', () => {
  it('reads what it wrote', () => {
    expect(parsePrefs(JSON.stringify({ view: 'week', masterId: 4, showCancelled: true }))).toEqual({ view: 'week', masterId: 4, showCancelled: true, hiddenMasters: [] })
  })

  it('falls back field by field on anything it does not recognise', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('[]')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ view: 'month', masterId: '4', showCancelled: 'yes' }))).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ view: 'list' }))).toEqual({ ...DEFAULT_PREFS, view: 'list' })
  })

  it('keeps the people hidden on the day view, as whole ids, once each', () => {
    expect(parsePrefs('{"hiddenMasters":[3,3,7]}').hiddenMasters).toEqual([3, 7])
    expect(parsePrefs('{"hiddenMasters":[1.5,"2",null,4]}').hiddenMasters).toEqual([4])
    expect(parsePrefs('{"hiddenMasters":"3"}').hiddenMasters).toEqual([])
    expect(parsePrefs(null).hiddenMasters).toEqual([])
  })
})
