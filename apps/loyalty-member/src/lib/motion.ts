export interface Rect { x: number; y: number; width: number; height: number }
export type PopupKind = 'popup' | 'sheet'

/** Placement uses the measured content and current keyboard-visible window, never a device model. */
export function popupPlacement(window: { width: number; height: number }, insets: { top: number; bottom: number }, measuredHeight: number, kind: PopupKind, origin?: Rect): Rect {
  const margin = Math.min(24, window.width / 10)
  const width = Math.max(1, Math.min(kind === 'sheet' ? 640 : 480, window.width - (kind === 'sheet' ? 0 : margin * 2)))
  const top = insets.top + 12
  const bottom = window.height - insets.bottom - (kind === 'sheet' ? 0 : 12)
  const height = Math.max(1, Math.min(measuredHeight, bottom - top))
  const desired = kind === 'sheet' ? bottom - height : origin ? origin.y + origin.height + 12 : top + (bottom - top - height) / 2
  return { x: (window.width - width) / 2, y: Math.max(top, Math.min(desired, bottom - height)), width, height }
}

let pressed: { rect: Rect; at: number } | undefined

export function rememberOrigin(rect: Rect, at = Date.now()): void {
  if (Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0) pressed = { rect, at }
}

/** A trigger belongs to one immediate presentation, including activation through an accessible button. */
export function takeOrigin(now = Date.now()): Rect | undefined {
  const value = peekOrigin(now)
  pressed = undefined
  return value
}

export function peekOrigin(now = Date.now()): Rect | undefined {
  return pressed && now >= pressed.at && now - pressed.at <= 1500 ? pressed.rect : undefined
}
