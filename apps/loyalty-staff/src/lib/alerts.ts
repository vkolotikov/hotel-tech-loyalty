/** Where request alerts stand on this phone: hearing them, switched off here, refused in the phone's settings, or impossible here. */
export type AlertsState = 'on' | 'off' | 'blocked' | 'unavailable'

/** The server's mark on a request alert's data (`StaffAlerts::TYPE`); anything else a push carries is not ours to open. */
export const REQUEST_ALERT = 'staff_request'

/** Whether a push's data is a request alert, which opens Requests when tapped. */
export function isRequestAlert(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === REQUEST_ALERT
}
