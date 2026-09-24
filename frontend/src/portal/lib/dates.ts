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

export function formatDay(value: string, locale: string): string {
  const [datePart] = value.split(/[T ]/)
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Intl.DateTimeFormat(resolveLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d))
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
