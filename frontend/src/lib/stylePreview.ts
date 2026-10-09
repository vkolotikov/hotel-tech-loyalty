import type { ThemeStyle } from '../hooks/useTheme'

/**
 * Preview a style on this device only, before every organisation can pick
 * it (spec D5). A super admin switches it on from Settings → Branding →
 * Style; nothing is saved to the server and the organisation's own style is
 * untouched. Anyone else's flag is ignored.
 */
export const STYLE_PREVIEW_KEY = 'hx-style-preview'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const browser = (): Store | null => (typeof window !== 'undefined' ? window.localStorage : null)

/**
 * Disabled until the server reports a platform-admin flag: super_admin is
 * every organisation owner's role, so it cannot gate an owner-only preview.
 */
export function readStylePreview(storage: Store | null = browser()): ThemeStyle | null {
  void storage
  return null
}

export function setStylePreview(style: 'light' | null, storage: Store | null = browser()): void {
  try {
    if (!storage) return
    if (style) storage.setItem(STYLE_PREVIEW_KEY, style)
    else storage.removeItem(STYLE_PREVIEW_KEY)
  } catch { /* private mode: no preview */ }
}

/** The style to paint: this device's preview wins over the organisation's. */
export function effectiveStyle(style: ThemeStyle, storage: Store | null = browser()): ThemeStyle {
  return readStylePreview(storage) ?? style
}
