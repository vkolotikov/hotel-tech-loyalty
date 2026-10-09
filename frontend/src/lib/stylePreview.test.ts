import { describe, expect, it } from 'vitest'
import { STYLE_PREVIEW_KEY, canPreviewStyles, effectiveStyle, readStylePreview, setStylePreview } from './stylePreview'

/** localStorage holding the persisted auth store (`loyalty-auth`) and the preview flag. */
function fakeStorage(auth: { user?: Record<string, unknown>; staff?: Record<string, unknown> } | null, preview: string | null) {
  const map = new Map<string, string>()
  if (auth) map.set('loyalty-auth', JSON.stringify({ state: { token: 't', ...auth }, version: 1 }))
  if (preview) map.set(STYLE_PREVIEW_KEY, preview)
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    map,
  }
}

const platformAdmin = { user: { id: 1, is_platform_admin: true }, staff: { role: 'super_admin' } }
// Every organisation's owner has staff role super_admin; the server says they are not a platform admin.
const orgOwner = { user: { id: 2, is_platform_admin: false }, staff: { role: 'super_admin' } }
// A session from before the server sent the field.
const ownerWithoutField = { user: { id: 3 }, staff: { role: 'super_admin' } }

describe('style preview on this device', () => {
  it('offers the Settings button to platform admins only', () => {
    expect(canPreviewStyles(platformAdmin.user)).toBe(true)
    expect(canPreviewStyles(orgOwner.user)).toBe(false)
    expect(canPreviewStyles(ownerWithoutField.user)).toBe(false)
    expect(canPreviewStyles({ is_platform_admin: 'true' })).toBe(false)
    expect(canPreviewStyles(null)).toBe(false)
    expect(canPreviewStyles(undefined)).toBe(false)
  })

  it('previews Clean light for a platform admin who switched it on', () => {
    const s = fakeStorage(platformAdmin, 'light')
    expect(readStylePreview(s)).toBe('light')
    expect(effectiveStyle('glass', s)).toBe('light')
    expect(effectiveStyle('classic', s)).toBe('light')
  })

  it('is ignored for an organisation owner (super_admin), even with the flag set', () => {
    for (const owner of [orgOwner, ownerWithoutField]) {
      const s = fakeStorage(owner, 'light')
      expect(readStylePreview(s)).toBeNull()
      expect(effectiveStyle('glass', s)).toBe('glass')
      expect(effectiveStyle('classic', s)).toBe('classic')
    }
  })

  it('is ignored for anyone else, and with no one signed in', () => {
    expect(readStylePreview(fakeStorage({ user: { id: 4 }, staff: { role: 'manager' } }, 'light'))).toBeNull()
    expect(readStylePreview(fakeStorage({ user: { id: 5, is_platform_admin: 'true' } }, 'light'))).toBeNull()
    expect(readStylePreview(fakeStorage(null, 'light'))).toBeNull()
  })

  it('reads nothing when the flag is off or broken, and never throws', () => {
    expect(readStylePreview(fakeStorage(platformAdmin, null))).toBeNull()
    expect(readStylePreview(fakeStorage(platformAdmin, 'neon'))).toBeNull()
    expect(readStylePreview(null)).toBeNull()
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => {}, removeItem: () => {} }
    expect(readStylePreview(broken)).toBeNull()
    expect(effectiveStyle('classic', broken)).toBe('classic')
    const garbled = fakeStorage(null, 'light')
    garbled.map.set('loyalty-auth', '{not json')
    expect(readStylePreview(garbled)).toBeNull()
  })

  it('switches on and off', () => {
    const s = fakeStorage(platformAdmin, null)
    setStylePreview('light', s)
    expect(s.map.get(STYLE_PREVIEW_KEY)).toBe('light')
    setStylePreview(null, s)
    expect(s.map.has(STYLE_PREVIEW_KEY)).toBe(false)
  })
})
