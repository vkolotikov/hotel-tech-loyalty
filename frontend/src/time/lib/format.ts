/**
 * How HexaTech Time Planner writes lengths, days and times in the person's language. Pure: the tests render to a string.
 * A task's day and start (`YYYY-MM-DD`, `HH:MM`) are the venue's wall clock and are never converted; an instant (a
 * clock started) is shown in the venue's zone.
 */

/** A length in minutes as "45 min", "2 h", "1 h 30 min" ("—" for none), in the words the caller passes. */
export function duration(minutes: number | null | undefined, words: { h: string; min: string } = { h: 'h', min: 'min' }): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return '—'
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} ${words.min}`
  return m === 0 ? `${h} ${words.h}` : `${h} ${words.h} ${m} ${words.min}`
}

/**
 * Planned (or done) time, where none is a real figure: 0 reads "0 h", not the dash `duration` keeps for an unknown
 * length (a capacity of a name without an account stays "—").
 */
export function planned(minutes: number | null | undefined, words: { h: string; min: string } = { h: 'h', min: 'min' }): string {
  return minutes !== null && minutes !== undefined && Number.isFinite(minutes) && minutes > 0 ? duration(minutes, words) : `0 ${words.h}`
}

/** Hours with one decimal where it matters: 90 → "1.5", 120 → "2", in the person's number style. */
export function hours(minutes: number, lang: string): string {
  const value = Math.round((minutes / 60) * 10) / 10
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value)
}

/** A calendar day (`YYYY-MM-DD`) as "Wed 4 Nov": read as a date, never as an instant. */
export function dayLabel(ymd: string | null | undefined, lang: string, style: 'short' | 'long' = 'short'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '')
  if (!m) return ''
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return new Intl.DateTimeFormat(lang, style === 'long'
    ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
    : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(day)
}

/** A weekday's short name (1 = Monday … 7 = Sunday) in the person's language. */
export function weekdayName(isoWeekday: number, lang: string, style: 'short' | 'long' = 'short'): string {
  // 2026-11-02 is a Monday.
  const day = new Date(Date.UTC(2026, 10, 1 + isoWeekday))
  return new Intl.DateTimeFormat(lang, { weekday: style, timeZone: 'UTC' }).format(day)
}

/** An instant as the venue's wall clock: "12:30". */
export function clockOf(iso: string | null | undefined, lang: string, zone: string): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(at)
  } catch {
    return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(at)
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

/** Up to two initials of a name ("Ada Lovelace" → "AL"); "?" for nobody. */
export function initials(name: string | null | undefined): string {
  const raw = (name ?? '').trim()
  const words = (raw.includes('@') ? raw.slice(0, 1) : raw).split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? [...words[0]].slice(0, 1) : [[...words[0]][0], [...words[words.length - 1]][0]]
  return letters.join('').toUpperCase()
}

/** The first name, for a greeting. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}
