/**
 * The key of the retired pre-release preview of Clean light (a platform
 * admin could switch it on for one device before every organisation could
 * pick the style). The preview is gone; the theme code clears this key once
 * on load so no browser keeps a stale preview.
 */
export const STYLE_PREVIEW_KEY = 'hx-style-preview'

type Store = Pick<Storage, 'removeItem'>

/** Remove the retired preview flag. Never throws: no window, no storage, or storage that refuses. */
export function clearStylePreview(storage?: Store | null): void {
  try {
    const store = storage === undefined ? (typeof window !== 'undefined' ? window.localStorage : null) : storage
    store?.removeItem(STYLE_PREVIEW_KEY)
  } catch { /* private mode or blocked storage: nothing to clear */ }
}
