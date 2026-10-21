import { makeWall, venueNow } from '../../workspace/lib/wallClock'

/**
 * What Program's and Rewards' forms share (spec 2026-10-21 §4.5, §4.6, §7), kept out of the components so it can be
 * tested: reading what a field holds, the server's field errors in the workspace's words, the word for a value the
 * server sent, a decimal in the language, and the venue's clock for a datetime-local input.
 */

/** A form's problems: a field and the code of the sentence that says what is wrong with it. */
export type Problems = Record<string, string>

/** The tone a state badge borrows from theme/loyalty.css (`[data-state]`): waiting, approved, done, declined, off. */
export type Tone = 'pending' | 'approved' | 'fulfilled' | 'declined' | 'cancelled'

/** A whole number written in `text`, within the bounds. */
export function wholeIn(text: string, min: number, max: number): boolean {
  const v = text.trim()
  if (!/^\d+$/.test(v)) return false
  const n = Number(v)
  return n >= min && n <= max
}

/** A number written in `text` (a decimal point or comma), within the bounds. */
export function numberIn(text: string, min: number, max: number): boolean {
  const n = decimalOf(text)
  return n !== null && n >= min && n <= max
}

/** The number written in `text`, or null; a decimal comma reads as a point. */
export function decimalOf(text: string): number | null {
  const v = text.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(v)) return null
  return Number(v)
}

/**
 * The server's field errors as this form's problems, in the workspace's words: each field Laravel names (`tier_ids.0`
 * is `tier_ids`) becomes the code `codes` gives it. The server's own sentence is never shown (§7).
 */
export function serverProblems(fields: Record<string, string[]> | undefined, codes: Record<string, string>): Problems {
  const out: Problems = {}
  for (const name of Object.keys(fields ?? {})) {
    const base = name.split('.')[0]
    if (base in codes && !(base in out)) out[base] = codes[base]
  }
  return out
}

/**
 * The key and English of the word for a value the server sent (a category, a way of giving a benefit), or null for a
 * value the workspace has no word for, which is then shown as sent.
 */
export function named(prefix: string, words: Record<string, string>, value: string | null | undefined): [string, string] | null {
  if (!value || !(value in words)) return null
  return [`${prefix}.${value}`, words[value]]
}

/** A rate or multiplier as the language writes decimals ("1.5", "1,5"), at most two places. */
export function decimal(n: number, locale: string): string {
  return new Intl.NumberFormat(locale || 'en', { maximumFractionDigits: 2 }).format(n)
}

export const isWall = (text: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)

/** What a datetime-local input gave, without seconds a browser may add. */
export const wallInput = (text: string): string => text.slice(0, 16)

/**
 * An instant the server answered, as the venue's wall clock (`YYYY-MM-DDTHH:mm`) for a datetime-local input — on the
 * venue's clock, never the browser's (§6.6): a manager abroad sees the times the venue sees. Empty for none.
 */
export function wallOf(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const at = venueNow(timeZone, new Date(ms))
  return makeWall(at.date, at.minutes)
}

/** A chosen list with one more or one fewer (a weekday, a tier), in order. */
export function toggled(list: number[], id: number): number[] {
  return (list.includes(id) ? list.filter(x => x !== id) : [...list, id]).sort((a, b) => a - b)
}

/** The tiers a boost or an offer names, in the ladder’s order; the ids of tiers no longer there are left out. */
export function chosenTiers<T extends { id: number }>(ids: number[] | null, tiers: T[]): T[] {
  return ids && ids.length > 0 ? tiers.filter(tier => ids.includes(tier.id)) : []
}
