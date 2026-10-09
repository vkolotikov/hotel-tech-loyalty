import { describe, expect, it } from 'vitest'
import { STYLE_PREVIEW_KEY, effectiveStyle, readStylePreview, setStylePreview } from './stylePreview'

function fakeStorage(role: string | null, preview: string | null) {
  const map = new Map<string, string>()
  if (role) map.set('loyalty-auth', JSON.stringify({ state: { staff: { role } }, version: 1 }))
  if (preview) map.set(STYLE_PREVIEW_KEY, preview)
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    map,
  }
}

describe('style preview on this device', () => {
  it('is off for everyone, even a super admin with the flag set', () => {
    const s = fakeStorage('super_admin', 'light')
    expect(readStylePreview(s)).toBeNull()
    expect(effectiveStyle('glass', s)).toBe('glass')
  })

  it('reads nothing when the flag is off or broken, and never throws', () => {
    expect(readStylePreview(fakeStorage('super_admin', null))).toBeNull()
    expect(readStylePreview(fakeStorage('super_admin', 'neon'))).toBeNull()
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => {}, removeItem: () => {} }
    expect(readStylePreview(broken)).toBeNull()
  })

  it('switches on and off', () => {
    const s = fakeStorage('super_admin', null)
    setStylePreview('light', s)
    expect(s.map.get(STYLE_PREVIEW_KEY)).toBe('light')
    setStylePreview(null, s)
    expect(s.map.has(STYLE_PREVIEW_KEY)).toBe(false)
  })
})
