import { describe, expect, it } from 'vitest'
import { STYLE_PREVIEW_KEY, clearStylePreview } from './stylePreview'

function fakeStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => { map.delete(k) },
    map,
  }
}

describe('clearStylePreview', () => {
  it('removes the retired preview flag', () => {
    const storage = fakeStorage({ [STYLE_PREVIEW_KEY]: 'light' })
    clearStylePreview(storage)
    expect(storage.map.has(STYLE_PREVIEW_KEY)).toBe(false)
  })

  it('leaves other keys alone', () => {
    const storage = fakeStorage({ [STYLE_PREVIEW_KEY]: 'light', 'loyalty-auth': '{}', 'loyalty-admin-theme-v1': '{}' })
    clearStylePreview(storage)
    expect([...storage.map.keys()].sort()).toEqual(['loyalty-admin-theme-v1', 'loyalty-auth'])
  })

  it('tolerates no storage and storage that throws', () => {
    expect(() => clearStylePreview(null)).not.toThrow()
    expect(() => clearStylePreview({ removeItem: () => { throw new Error('blocked') } })).not.toThrow()
  })

  it('without an argument uses the browser storage, and copes with there being none', () => {
    const storage = fakeStorage({ [STYLE_PREVIEW_KEY]: 'light' })
    ;(globalThis as { window?: unknown }).window = { localStorage: storage }
    try {
      clearStylePreview()
      expect(storage.map.has(STYLE_PREVIEW_KEY)).toBe(false)
    } finally {
      delete (globalThis as { window?: unknown }).window
    }
    expect(() => clearStylePreview()).not.toThrow()
  })
})
