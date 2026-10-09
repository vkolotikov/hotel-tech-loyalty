import { onColor } from '../theme/glass'

/** First gradient stop of each payment bar on the room timeline, opaque. */
export const BAR_BASE: Record<string, string> = {
  paid: '#22c55e',
  open: '#ef4444',
  pending: '#ef4444',
  invoice_waiting: '#f59e0b',
  channel_managed: '#14b8a6',
}
export const DEFAULT_BAR_BASE = '#6b7280'

/** Bar text by the owner's rule: white while it reads at 3:1 on the bar, dark ink below. */
export function barTextFor(status: string): string {
  return onColor(BAR_BASE[status] ?? DEFAULT_BAR_BASE)
}
