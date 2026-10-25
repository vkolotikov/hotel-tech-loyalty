import { formatDay, resolveLocale } from '../lib/dates'
import { formatMoney } from '../lib/money'
import type { PortalMember } from '../lib/types'

/**
 * The member card's decisions, tested by value (the portal's tests render to a string): its progress and membership
 * phrases, and the tier's colour as the dark card can show it.
 */

/** A phrase as a translation call takes it: the key, the English, and what it fills in. */
export interface CardPhrase {
  key: string
  fallback: string
  options: Record<string, unknown>
}

/** Release 8's count phrases, each agreeing with its number (four plural forms in every bundle, as lib/plural.ts). */
export const CARD_COUNTED = {
  visits_to_go: ['{{count}} more visit to go', '{{count}} more visits to go'],
} as const satisfies Record<string, readonly [string, string]>

/** The member summary's progress as release 8 sends it: the measure and what is still needed on it, beside the old keys. */
export type CardProgress = PortalMember['progress'] & { by?: 'points' | 'visits' | 'spend'; needed?: number }

/**
 * What the progress line's right side says, in the programme's terms (release 8, spec 2026-10-25 §3): "1,250 points to
 * go", "3 more visits to go", "€120 to go". The measure and the numbers are the server's; a summary without `by` is
 * points, as before. Every number is written the language's way.
 */
export function toGoPhrase(progress: CardProgress, currency: string, locale: string): CardPhrase | null {
  if (progress.by === 'visits') {
    const n = progress.needed ?? progress.points_needed
    return { key: 'portal.home.visits_to_go', fallback: CARD_COUNTED.visits_to_go[1], options: { count: n, defaultValue_one: CARD_COUNTED.visits_to_go[0], replace: { count: n.toLocaleString(resolveLocale(locale)) } } }
  }
  if (progress.by === 'spend') {
    return { key: 'portal.home.spend_to_go', fallback: '{{amount}} to go', options: { amount: formatMoney(progress.needed ?? progress.points_needed, currency, locale) } }
  }
  return null
}

/** The English of the membership's lines (release 8 R8-2; release 9: an ending membership says so too). */
export const MEMBERSHIP_WORDS = {
  membership_until: 'Member until {{day}}',
  membership_expiring: 'Ends {{day}} · ask the team to renew',
  membership_ended: 'Ended {{day}} · ask the team to renew',
} as const

/**
 * The membership's line (release 8, spec 2026-10-25 §3, R8-2): "Member until 3 Oct 2027"; one about to end says when
 * and to renew; one that ended says so. Nothing for a membership without an end date, or an account that is switched
 * off. The date and the state are the server's (MembershipValidity), the day written in the member's language.
 */
export function membershipPhrase(membership: PortalMember['membership'], locale: string): (CardPhrase & { tone: 'muted' | 'warning' | 'danger' }) | null {
  if (!membership?.valid_until || membership.state === 'off') return null
  const day = formatDay(membership.valid_until, locale)
  if (membership.state === 'expired') return { key: 'portal.home.membership_ended', fallback: MEMBERSHIP_WORDS.membership_ended, options: { day }, tone: 'danger' }
  if (membership.state === 'expiring') return { key: 'portal.home.membership_expiring', fallback: MEMBERSHIP_WORDS.membership_expiring, options: { day }, tone: 'warning' }
  return { key: 'portal.home.membership_until', fallback: MEMBERSHIP_WORDS.membership_until, options: { day }, tone: 'muted' }
}

/** The member card's own dark surface (portal.css, the dark `--p-surface-2` the bar runs on), as sRGB. */
const SPOTLIGHT_TRACK = [34, 38, 43] as const

const luminance = (rgb: readonly number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
}
export const contrast = (a: readonly number[], b: readonly number[]) => {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/**
 * The tier's colour as the dark card can show it: the venue's own when it stands out from the card (3:1, the measure
 * for a mark that is not text), else lightened towards white until it does — a dark purple tier becomes a lavender
 * one. Only the tier's dot, the pill's edge and the progress bar take it; words stay in the text colour. Null for a
 * colour that is not a hex.
 */
export function tierTone(hex: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex?.trim() ?? '')
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  const base = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  for (let mix = 0; mix <= 1.0001; mix += 0.05) {
    const rgb = base.map(v => Math.round(v + (255 - v) * mix))
    if (contrast(rgb, SPOTLIGHT_TRACK) >= 3) return `rgb(${rgb.join(' ')})`
  }
  return 'rgb(255 255 255)'
}
