import {
  loadLook as loadWith, loadPaint, rememberPaint, saveLook as saveWith, savePaint, useLook as useLookWith,
  type LiveLook, type Look, type LookKeys, type Paint,
} from '../../workspace/lib/look'

/**
 * The Appointments workspace's look on this device, on the shared core's
 * engine (src/workspace/lib/look.ts), under the keys it has always used —
 * `appointments:look` and `appointments:brand` — so nobody's choice is lost
 * when the code moved. Kept apart from `appointments:prefs`, which the
 * calendar writes whole.
 */
export type { Look, RailSize, ThemePref } from '../../workspace/lib/look'
export type Brand = Paint
export { DEFAULT_LOOK, parseLook, parsePaint as parseBrand, resolveTheme, subscribeSystemDark, systemDark } from '../../workspace/lib/look'

export const LOOK_KEYS: LookKeys = { look: 'appointments:look', paint: 'appointments:brand' }

export const loadLook = (): Look => loadWith(LOOK_KEYS)
export const saveLook = (look: Look): void => saveWith(LOOK_KEYS, look)
export const loadBrand = (): Brand | null => loadPaint(LOOK_KEYS)
export const saveBrand = (brand: Brand): void => savePaint(LOOK_KEYS, brand)
export const rememberBrand = (brand: Brand): void => rememberPaint(LOOK_KEYS, brand)
export const useLook = (): LiveLook => useLookWith(LOOK_KEYS)
