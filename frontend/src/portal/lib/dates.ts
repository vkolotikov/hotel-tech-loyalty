/**
 * Dates for members. Two shapes arrive from the API: calendar dates
 * (`2026-10-03`, a stay's arrival) that must never shift with the clock, and
 * instants (`2026-10-03T07:30:00Z`, an appointment) that are shown in the
 * venue's timezone because that is where the member will stand.
 */

/**
 * i18next hands over bare language codes, and to Intl a bare `en` is en-US:
 * month first, 12-hour clock. The platform's English is UK English
 * (BeautyTech.uk, day-first dates), so `en` resolves to en-GB; every other
 * code passes through.
 */
export function resolveLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : locale
}

/**
 * The venue's own calendar day, never the client's or the raw UTC day — a
 * member in one time zone booking a venue in another must see the venue's
 * "today", since that is where the appointment happens. Falls back to the
 * UTC day if `timezone` is not a valid IANA zone name.
 */
export function venueToday(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export function formatDay(value: string, locale: string, options?: Intl.DateTimeFormatOptions): string {
  const [datePart] = value.split(/[T ]/)
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Intl.DateTimeFormat(resolveLocale(locale), options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d))
}

export function formatDateTime(iso: string, locale: string, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(resolveLocale(locale), {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
    }).format(date)
  } catch {
    return date.toLocaleString(resolveLocale(locale))
  }
}

export function formatTime(iso: string, locale: string, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(resolveLocale(locale), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date)
  } catch {
    return date.toLocaleTimeString(resolveLocale(locale))
  }
}
