import { afterEach, describe, expect, it, vi } from 'vitest'

// The theme module imports the API client, which needs a real browser; it is not under test here.
vi.mock('../lib/api', () => ({ api: {} }))

/** Loading the theme module is what clears the retired preview flag, so it needs a fresh import. */
describe('loading the theme module', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    delete (globalThis as { document?: unknown }).document
    delete (globalThis as { localStorage?: unknown }).localStorage
    vi.resetModules()
  })

  it('removes the retired hx-style-preview flag from localStorage and leaves the rest', async () => {
    const items = new Map([['hx-style-preview', 'light'], ['loyalty-auth', '{}']])
    const localStorage = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => { items.set(k, v) },
      removeItem: (k: string) => { items.delete(k) },
    }
    const attrs = new Map<string, string>()
    const root = {
      style: { setProperty: () => {} },
      setAttribute: (k: string, v: string) => { attrs.set(k, v) },
      removeAttribute: (k: string) => { attrs.delete(k) },
      getAttribute: (k: string) => attrs.get(k) ?? null,
    }
    Object.assign(globalThis, {
      localStorage,
      window: { localStorage },
      document: { documentElement: root, body: { style: {} } },
    })
    vi.resetModules()
    await import('./useTheme')
    expect(items.has('hx-style-preview')).toBe(false)
    expect(items.has('loyalty-auth')).toBe(true)
    expect(attrs.get('data-style')).toBe('glass')
  })
})
