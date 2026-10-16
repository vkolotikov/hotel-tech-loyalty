import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import { BRAND_KEY, firstBrand, forgetBrand, loadBootstrap, rememberBrand, storedBrand } from './brand'
import type { Bootstrap } from './types'

function store(entries: Record<string, string> = {}) {
  return {
    entries,
    getItem: (k: string) => (k in entries ? entries[k] : null),
    setItem: (k: string, v: string) => { entries[k] = v },
    removeItem: (k: string) => { delete entries[k] },
  }
}
const admin = (id: number | null) => JSON.stringify({ state: { currentBrandId: id }, version: 0 })

describe('storedBrand', () => {
  it('prefers the brand this device used here last, then the full admin\'s current choice, then none', () => {
    expect(storedBrand(store({ [BRAND_KEY]: '4', 'loyalty-brand': admin(9) }))).toBe(4)
    expect(storedBrand(store({ 'loyalty-brand': admin(9) }))).toBe(9)
    expect(storedBrand(store({ 'loyalty-brand': admin(null) }))).toBeNull() // "All brands" is not a brand
    expect(storedBrand(store())).toBeNull()
    expect(storedBrand(null)).toBeNull()
  })

  it('ignores anything that is not a positive whole id', () => {
    for (const bad of ['abc', '0', '-3', '1.5', '', 'null']) expect(storedBrand(store({ [BRAND_KEY]: bad }))).toBeNull()
    expect(storedBrand(store({ 'loyalty-brand': '{not json' }))).toBeNull()
  })

  it('remembers and forgets this device\'s brand', () => {
    const s = store()
    rememberBrand(s, 12)
    expect(s.entries[BRAND_KEY]).toBe('12')
    forgetBrand(s)
    expect(BRAND_KEY in s.entries).toBe(false)
  })
})

describe('loadBootstrap', () => {
  const boot = { brand: { id: 3, name: 'Main' } } as unknown as Bootstrap

  it('asks for the stored brand, and on brand_not_allowed forgets it and asks for the person\'s default', async () => {
    const s = store({ [BRAND_KEY]: '8' })
    const fetch = vi.fn((brand: number | null) => (brand === 8
      ? Promise.reject({ response: { status: 403, data: { code: 'brand_not_allowed', error: 'You do not have access to this brand.' } } })
      : Promise.resolve(boot)))
    await expect(loadBootstrap(8, s, fetch)).resolves.toBe(boot)
    expect(fetch.mock.calls.map(c => c[0])).toEqual([8, null])
    expect(BRAND_KEY in s.entries).toBe(false)
  })

  it('passes any other refusal through untouched, and never retries a request that named no brand', async () => {
    const off = { response: { status: 403, data: { error: 'workspace_disabled' } } }
    await expect(loadBootstrap(8, store(), () => Promise.reject(off))).rejects.toBe(off)
    const notAllowed = { response: { status: 403, data: { code: 'brand_not_allowed' } } }
    const fetch = vi.fn(() => Promise.reject(notAllowed))
    await expect(loadBootstrap(null, store(), fetch)).rejects.toBe(notAllowed)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('firstBrand', () => {
  const storage = (v: string | null) => ({ getItem: () => v, setItem: () => {}, removeItem: () => {} })
  it('asks for the brand a shared post link names, else the one this device chose', () => {
    expect(firstBrand('?brand_id=7', storage('3'))).toBe(7)
    expect(firstBrand('', storage('3'))).toBe(3)
    expect(firstBrand('?brand_id=x', storage('3'))).toBe(3)
    expect(firstBrand('?brand_id=0', null)).toBeNull()
  })
})
