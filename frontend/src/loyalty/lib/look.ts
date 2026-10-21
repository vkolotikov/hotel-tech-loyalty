import { loadPaint, rememberPaint, useLook as useLookWith, type LiveLook, type LookKeys, type Paint } from '../../workspace/lib/look'

/**
 * HexaTech Loyalty's look on this device, on the shared core's engine
 * (src/workspace/lib/look.ts), under its own keys: Light, Dark or Auto and the
 * side panel's size, and the accent and mark it last saw, which the frame
 * wears while the bootstrap loads.
 */
export const LOOK_KEYS: LookKeys = { look: 'loyalty:look', paint: 'loyalty:brand-paint' }

export const loadBrandPaint = (): Paint | null => loadPaint(LOOK_KEYS)
export const rememberBrandPaint = (paint: Paint): void => rememberPaint(LOOK_KEYS, paint)
export const useLook = (): LiveLook => useLookWith(LOOK_KEYS)
