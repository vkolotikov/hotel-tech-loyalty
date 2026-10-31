import type { Language } from './i18n'
import type { Key } from './i18n/en'

/** A whole number in the reader's language (12 500, 12,500, 12.500). */
export function number(value: number, language: Language): string {
  try {
    return new Intl.NumberFormat(language).format(Math.round(value))
  } catch {
    return String(Math.round(value))
  }
}

/** An amount of money in the venue's currency, with its decimals. */
export function money(value: number | string, currency: string, language: Language): string {
  const amount = typeof value === 'string' ? Number(value) : value
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** A venue day (`YYYY-MM-DD`) as a short date in the reader's language; the day is never shifted by a zone. */
export function day(value: string, language: Language): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  try {
    return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
  } catch {
    return value.slice(0, 10)
  }
}

/** An instant as a date and time on the venue's clock. */
export function moment(value: string, language: Language, timeZone: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  try {
    return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }).format(date)
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ')
  }
}

/** How long ago an instant was, as one of the `time.*` sentences with its number. */
export function ago(value: string | null, now: number): { key: Key; n: number } | null {
  if (!value) return null
  const at = new Date(value).getTime()
  if (Number.isNaN(at)) return null
  const minutes = Math.max(0, Math.floor((now - at) / 60_000))
  if (minutes < 1) return { key: 'time.now', n: 0 }
  if (minutes < 60) return { key: 'time.minutes', n: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { key: 'time.hours', n: hours }
  return { key: 'time.days', n: Math.floor(hours / 24) }
}

/** "Good morning", "Good afternoon" or "Good evening" by the hour of the phone's own clock. */
export function greeting(hour: number): Key {
  if (hour < 12) return 'home.morning'
  if (hour < 18) return 'home.afternoon'
  return 'home.evening'
}

/** A member's initials for their avatar ("Ada Lovelace" → "AL"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '·'
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

/** A member number spaced for reading aloud at the desk ("LS-000123" stays; "12345678" → "1234 5678"). */
export function spacedNumber(value: string | null): string {
  if (!value) return '—'
  return /^\d{8,}$/.test(value) ? value.replace(/(\d{4})(?=\d)/g, '$1 ') : value
}
