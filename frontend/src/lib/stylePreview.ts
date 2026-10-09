import type { ThemeStyle } from '../hooks/useTheme'

/**
 * Preview a style on this device only, before every organisation can pick
 * it (spec D5). A platform admin (HexaTech's own operators: the server's
 * platform_admin_emails allowlist, `user.is_platform_admin` from sign-in and
 * GET /v1/auth/me) switches it on from Settings → Branding → Style; nothing
 * is saved to the server and the organisation's own style is untouched.
 *
 * Not staff role super_admin: that is every organisation owner's role. The
 * read fails closed, so anyone else's flag (set by hand, or switched on while
 * the gate was the owner role) is ignored on the next paint.
 */
export const STYLE_PREVIEW_KEY = 'hx-style-preview'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const browser = (): Store | null => (typeof window !== 'undefined' ? window.localStorage : null)

/** Who may preview: a user the server marked as a platform admin. Anything else (missing, a string, an org owner) is no. */
export function canPreviewStyles(user: unknown): boolean {
  return typeof user === 'object' && user !== null && (user as { is_platform_admin?: unknown }).is_platform_admin === true
}

/** 'light' only for a platform admin who switched the preview on; null for anyone and anything else. */
export function readStylePreview(storage: Store | null = browser()): ThemeStyle | null {
  try {
    if (!storage || storage.getItem(STYLE_PREVIEW_KEY) !== 'light') return null
    const auth = JSON.parse(storage.getItem('loyalty-auth') ?? 'null')
    return canPreviewStyles(auth?.state?.user) ? 'light' : null
  } catch {
    return null
  }
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
