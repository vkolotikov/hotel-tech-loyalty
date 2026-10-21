import { formatDate, formatInstant } from '../../workspace/lib/wallClock'

/** A count of points, grouped as the language groups numbers ("1 500" in French, "1,500" in English). */
export function points(n: number, locale: string): string {
  return new Intl.NumberFormat(locale || 'en').format(n)
}

/** A ledger line's points with their sign: "+300", "−500" (a true minus sign). */
export function signedPoints(n: number, locale: string): string {
  const abs = points(Math.abs(n), locale)
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : abs
}

/** An instant (a ledger line, a request) on the venue's clock: "5 Oct, 14:05". */
export function when(iso: string | null, locale: string, timeZone: string): string {
  return iso ? formatInstant(iso, locale || 'en', timeZone) : ''
}

/** The day of an instant on the venue's clock, as a date key, so the shared day formatter can write it. */
export function dayOf(iso: string, timeZone: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

/** An instant's day only ("5 Oct 2026"), on the venue's clock. */
export function day(iso: string | null, locale: string, timeZone: string): string {
  if (!iso) return ''
  const key = dayOf(iso, timeZone)
  return key ? formatDate(key, locale || 'en', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}
