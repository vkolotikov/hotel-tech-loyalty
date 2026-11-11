/** Where notifications stand on this phone: on, switched off here, refused in the phone's settings, or impossible here. */
export type AlertsState = 'on' | 'off' | 'blocked' | 'unavailable'

/**
 * Where a tapped notification opens. The venue's messages, offers, points and tier news are all kept in the inbox
 * (`NotificationService::keep()`), so the inbox is where every one of them opens.
 */
export function pushTarget(_data: unknown): '/inbox' {
  return '/inbox'
}
