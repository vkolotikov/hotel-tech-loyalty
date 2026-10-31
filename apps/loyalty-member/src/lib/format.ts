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

/** "Good morning", "Good afternoon" or "Good evening" by the hour of the phone's own clock. */
export function greeting(hour: number): Key {
  if (hour < 12) return 'home.morning'
  if (hour < 18) return 'home.afternoon'
  return 'home.evening'
}

/** A name's initials for an avatar ("Ada Lovelace" → "AL"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '·'
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

/** A member number spaced for reading aloud at the desk ("LS-000123" stays; "12345678" → "1234 5678"). */
export function spacedNumber(value: string | null | undefined): string {
  if (!value) return '—'
  return /^\d{8,}$/.test(value) ? value.replace(/(\d{4})(?=\d)/g, '$1 ') : value
}

/**
 * The venue's sign-up token from what a member scanned or pasted: a join link (`…/portal/join?org=<token>&ref=<code>`),
 * the app's own link (`hotel-loyalty://join?org=…`), or the bare token. Null for anything else.
 */
export function joinTokenFrom(text: string): { org: string; ref: string | null } | null {
  const value = text.trim()
  if (value === '') return null
  const query = /[?&]org=([^&#\s]+)/i.exec(value)
  if (query) {
    const ref = /[?&]ref=([^&#\s]+)/i.exec(value)
    try {
      return { org: decodeURIComponent(query[1]), ref: ref ? decodeURIComponent(ref[1]) : null }
    } catch {
      return null
    }
  }
  return /^[A-Za-z0-9_-]{16,128}$/.test(value) ? { org: value, ref: null } : null
}

/**
 * Where a portal page's link (the help answers' `to`) opens in the app: its tab or screen, or null where the app has no
 * such page yet (the member reads the answer in words).
 */
export function appRoute(portalPath: string | undefined): string | null {
  if (!portalPath) return null
  const path = portalPath.split(/[?#]/)[0]
  const map: Record<string, string> = {
    '/portal': '/',
    '/portal/activity': '/activity',
    '/portal/rewards': '/rewards',
    '/portal/profile': '/profile',
    '/portal/events': '/events',
    '/portal/inbox': '/inbox',
    '/portal/help': '/help',
  }
  return map[path] ?? null
}

/**
 * A stored picture's address for the phone. MediaService answers `/storage/…` on the public disk, which lives beside
 * the API (the full admin's `resolveImage` rule); an address elsewhere (the bucket) is kept as it is.
 */
export function mediaAddress(url: string | null | undefined, origin: string): string | null {
  if (!url) return null
  const stored = url.match(/(\/storage\/.*)/)
  if (stored) return origin + stored[1]
  if (url.startsWith('/')) return origin + url
  return url
}
