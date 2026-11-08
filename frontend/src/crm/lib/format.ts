/**
 * How HexaTech CRM writes times, days and money, in the person's language (i18n.language). Pure: the tests render to a
 * string. An instant (a chat's last message, a task's due time) is shown in the venue's zone; a day (a lead's
 * follow-up, `YYYY-MM-DD`) is a calendar day and never converted.
 */

/** "3 min ago", "2 h ago", "yesterday", or the date: how long ago an instant was, from `now`. */
export function timeAgo(iso: string | null | undefined, lang: string, now: Date = new Date()): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const seconds = Math.round((at.getTime() - now.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' })
  const abs = Math.abs(seconds)
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day')
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(at)
}

/** An instant as the venue's wall clock: "4 Nov, 12:30". */
export function dateTime(iso: string | null | undefined, lang: string, zone: string): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone }).format(at)
  } catch {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(at)
  }
}

/** A calendar day (`YYYY-MM-DD`) as "Wed 4 Nov": read as a date, never as an instant. */
export function dayLabel(ymd: string | null | undefined, lang: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '')
  if (!m) return ''
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(day)
}

/** An amount in the venue's currency: "1 250 €". Whole units unless the amount has cents. */
export function money(amount: number | string | null | undefined, currency: string, lang: string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const cents = Math.round(value * 100) % 100 !== 0
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency: currency || 'EUR', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }).format(value)
  } catch {
    return `${value.toFixed(cents ? 2 : 0)} ${currency}`
  }
}

/** A plain count in the person's language: "1 250". */
export function count(n: number, lang: string): string {
  return new Intl.NumberFormat(lang).format(n)
}

/** A share as a whole percent of a total, or null when there is nothing to share. */
export function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null
}

/** Up to two initials of a name ("Ada Lovelace" → "AL"), or the first letter of an email; "?" for nobody. */
export function initials(name: string | null | undefined): string {
  const raw = (name ?? '').trim()
  // An email address: its first letter only ("maria@example.test" → "M").
  const words = (raw.includes('@') ? raw.slice(0, 1) : raw).split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? [...words[0]].slice(0, 1) : [[...words[0]][0], [...words[words.length - 1]][0]]
  return letters.join('').toUpperCase()
}
