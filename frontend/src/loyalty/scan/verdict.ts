import { formatDate, isDateKey, timeOf } from '../../workspace/lib/wallClock'
import type { ApiFailure } from '../lib/api'
import { ERRORS } from '../lib/errors'
import { points } from '../lib/format'
import type { MemberRow } from '../lib/types'
import { entryWords } from '../places/placesMath'
import { deskSentences } from '../visits/visitsMath'
import { FACT_WORDS, HEADLINE_WORDS, REASON_WORDS, VALIDITY_WORDS, WARNING_WORDS } from './doorWords'
import { VALUE_PHRASE_WORDS } from '../program/words'
import type { BenefitBadge, EntryRow, EventPerson, EventRow, PlaceRow, ScanAnswer, TierBadge } from './scanApi'
import { opensAt, type ScanContext } from './scanContext'

/**
 * The scan screen's decisions (release 8, spec 2026-10-25 §2), pure so the tests read them by value: the band's tone
 * and mark, its headline and reason in words with their values already written in the reader's language, the member's
 * facts beneath, when door mode clears, which repeated code it ignores, which key it takes to the reader field, and
 * the sound. The server decides who gets in (AccessDecision); these only say what it answered.
 */

/** Green (let in), amber (let in, the membership ends soon), red (not let in, or a code that names nobody), grey (no answer). */
export type Tone = 'granted' | 'warning' | 'denied' | 'trouble'

/** The band's icon; with the words, never the colour alone. */
export type Mark = 'check' | 'alert' | 'cross' | 'retry'

/** A sentence the screen says: its key and English, and the values already written in the reader's language. */
export interface Sentence {
  key: string
  fallback: string
  vars?: Record<string, string>
}

export interface VerdictView {
  tone: Tone
  mark: Mark
  headline: Sentence
  /** Why not, or the warning; null for a plain welcome. */
  reason: Sentence | null
  /** Who the code named; null for a code that named nobody or a scan that did not go through. */
  member: MemberRow | null
  tier: TierBadge | null
  /** "Valid until 3 Oct 2027"; null without an end date (and when the band already says it expired). */
  validity: Sentence | null
  /** The tier's benefits, as chips ("Spa access", "Late check-out · 14:00"). */
  benefits: string[]
  /** At an event: "Checked in", "Signed up" or "Walk-in", "Already checked in at 19:02", "+50 points". */
  facts: Sentence[]
}

/** What the verdict's words need besides the answer: the reader's language, the venue's day and now, and the context's row. */
export interface VerdictFacts {
  locale: string
  /** The venue's today (`YYYY-MM-DD`). */
  today: string
  /** The venue's now as its wall clock (`YYYY-MM-DDTHH:mm`). */
  nowWall: string
  /** The venue's zone, for a time the server sends as an instant. */
  timeZone: string
  place?: PlaceRow | null
  event?: EventRow | null
  /** A typed benefit value in the reader's words ("15% off", "€5.00 off"); the English pattern when not given. */
  typedPhrase?: (type: string, amount: number) => string | null
}

/** What a benefit gives beside its name: its wording, or its typed value in words ("15% off"), or nothing. */
export function benefitDetail(b: Pick<BenefitBadge, 'value' | 'value_type' | 'value_amount'>, typedPhrase?: VerdictFacts['typedPhrase']): string | null {
  if (b.value) return b.value
  if (b.value_type && b.value_type !== 'text' && b.value_amount !== null && b.value_amount !== undefined) {
    const phrase = typedPhrase ? typedPhrase(b.value_type, b.value_amount) : (VALUE_PHRASE_WORDS[b.value_type] ?? '').replace('{{amount}}', String(b.value_amount))
    return phrase || null
  }
  return null
}

/** A benefit as a chip: "Member price · 15% off", or the name alone. */
export function benefitChip(b: BenefitBadge, typedPhrase?: VerdictFacts['typedPhrase']): string {
  const detail = benefitDetail(b, typedPhrase)
  return detail ? `${b.name} · ${detail}` : b.name
}

const MARK: Record<Tone, Mark> = { granted: 'check', warning: 'alert', denied: 'cross', trouble: 'retry' }

const word = <F extends Record<string, string>>(family: string, words: F, key: keyof F & string, vars?: Record<string, string>): Sentence =>
  ({ key: `loyalty.door.${family}.${key}`, fallback: words[key], ...(vars ? { vars } : {}) })
const headline = (key: keyof typeof HEADLINE_WORDS, vars?: Record<string, string>) => word('headline', HEADLINE_WORDS, key, vars)
const reasonWord = (key: keyof typeof REASON_WORDS, vars?: Record<string, string>) => word('reason', REASON_WORDS, key, vars)

/** "AL" for Ada Lovelace: the first letters of the first two words, or of the number for a member with no name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words.slice(0, 2).map(w => w.charAt(0).toLocaleUpperCase()).join('') || '?'
}

/** The name a welcome uses: the first word of the member's name ("Ada" of "Ada Lovelace"), or nothing. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

/** A day as the reader's language writes it: "3 Oct", with the year when it is not this year's ("3 Oct 2027"). */
export function dayWords(key: string, today: string, locale: string): string {
  if (!isDateKey(key)) return key
  const sameYear = key.slice(0, 4) === today.slice(0, 4)
  return formatDate(key, locale || 'en', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Whole days from one venue day to another (`YYYY-MM-DD`), counted in UTC where no clock change exists. */
export function daysBetween(from: string, to: string): number {
  const ms = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((ms(to) - ms(from)) / 86_400_000)
}

/** Names joined as the language joins them: "Gold and Platinum", "Gold, Silver и Platinum". */
export function listWords(names: readonly string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale || 'en', { style: 'long', type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}

/**
 * A scan's answer at a place or an event, as the band and the member beneath it. An answer without a verdict (a
 * server that did not decide) reads as a scan that did not go through, never as a welcome.
 */
export function answerVerdict(answer: ScanAnswer, facts: VerdictFacts): VerdictView {
  const verdict = answer.verdict
  const member = answer.member
  if (!verdict) return troubleView({ status: 0, code: 'unknown', extra: {} }, member)

  const validUntil = verdict.valid_until ?? member.valid_until ?? null
  const base = {
    member,
    tier: verdict.tier,
    validity: validUntil && verdict.reason !== 'expired' ? word('validity', VALIDITY_WORDS, 'until', { date: dayWords(validUntil, facts.today, facts.locale) }) : null,
  }

  // The band says "Welcome" and the member's name is written once, beneath it (release 9: no fact twice on a screen).
  if (verdict.granted) {
    const warning = warningSentence(verdict.expires_in_days)
    const tone: Tone = warning ? 'warning' : 'granted'
    return {
      ...base,
      tone,
      mark: MARK[tone],
      headline: headline('welcome'),
      reason: warning,
      benefits: (answer.benefits ?? []).map(b => benefitChip(b, facts.typedPhrase)),
      facts: eventFacts(answer, facts.locale, facts.timeZone, facts.event?.sign_up, facts.today),
    }
  }

  // A refusal shows why, and who; what the tier would give is beside the point at a closed door.
  return {
    ...base,
    tone: 'denied',
    mark: 'cross',
    headline: headline('no_access'),
    reason: refusalReason(answer, facts),
    benefits: [],
    facts: [],
  }
}

/**
 * A refusal a manager can undo on the spot: the membership has run out. The scan screen offers "Renew for 1 year" and
 * scans the member again by number (the QR code the member showed may be single-use).
 */
export function renewable(answer: ScanAnswer | null): boolean {
  return answer?.verdict?.granted === false && answer.verdict.reason === 'expired'
}

/** "Membership ends in 5 days." when the end is two weeks away or nearer (the server sends the days only then). */
export function warningSentence(days: number | null | undefined): Sentence | null {
  if (days === null || days === undefined || days < 0 || days > 14) return null
  if (days === 0) return word('warning', WARNING_WORDS, 'ends_today')
  if (days === 1) return word('warning', WARNING_WORDS, 'ends_tomorrow')
  return word('warning', WARNING_WORDS, 'ends_in', { days: String(days) })
}

/** Why the member was not let in, in the scan's words; an event's closed check-in says when it opens, or why it will not. */
export function refusalReason(answer: ScanAnswer, facts: VerdictFacts): Sentence {
  const verdict = answer.verdict!
  const name = firstName(answer.member.name) || answer.member.member_number || ''
  switch (verdict.reason) {
    case 'member_erased': return reasonWord('member_erased')
    case 'member_off': return reasonWord('member_off')
    case 'expired': {
      const until = verdict.valid_until ?? answer.member.valid_until ?? null
      return until ? reasonWord('expired', { date: dayWords(until, facts.today, facts.locale) }) : reasonWord('expired_plain')
    }
    case 'place_off': {
      const place = verdict.place?.name ?? facts.place?.name ?? ''
      return place ? reasonWord('place_off', { place }) : reasonWord('place_off_plain')
    }
    case 'tier_not_allowed': {
      if (verdict.allowed_tiers.length === 0) return reasonWord('tier_not_allowed_none')
      const tiers = listWords(verdict.allowed_tiers, facts.locale)
      return verdict.tier
        ? reasonWord('tier_not_allowed', { tiers, name, tier: verdict.tier.name })
        : reasonWord('tier_not_allowed_no_tier', { tiers, name })
    }
    case 'event_not_open': return eventClosed(facts.event ?? null, facts.nowWall)
    case 'event_full': return reasonWord('event_full')
    case 'not_signed_up': return reasonWord('not_signed_up')
    default: return reasonWord('other')
  }
}

/** An event whose check-in is closed: cancelled, not published, over, or not open yet ("Check-in opens at 18:00."). */
export function eventClosed(event: Pick<EventRow, 'starts_at' | 'ends_at' | 'status'> | null, nowWall: string): Sentence {
  if (!event) return reasonWord('event_not_open')
  if (event.status === 'cancelled') return reasonWord('event_cancelled')
  if (event.status === 'draft') return reasonWord('event_draft')
  if (nowWall >= event.ends_at) return reasonWord('event_ended')
  const opens = opensAt(event.starts_at)
  if (nowWall < opens) return reasonWord('event_opens', { time: timeOf(opens) })
  return reasonWord('event_not_open')
}

/** An event's check-in beside the welcome, in this order: checked in or already in, signed up or walk-in, the points, the stamp. */
export function eventFacts(answer: ScanAnswer, locale: string, timeZone: string, signUp: boolean = true, today?: string): Sentence[] {
  if (!answer.verdict?.event) return []
  const out: Sentence[] = []
  const already = clockOf(answer.already_in, timeZone)
  // At an event of several days, a check-in of another day says its day too.
  const day = answer.already_in_at && today ? answer.already_in_at.slice(0, 10) : null
  if (already && day && day !== today) out.push(word('fact', FACT_WORDS, 'already_in_on', { date: dayWords(day, today!, locale), time: already }))
  else if (already) out.push(word('fact', FACT_WORDS, 'already_in', { time: already }))
  else if (answer.checked_in) out.push(word('fact', FACT_WORDS, 'checked_in'))
  // An event without sign-up stores everyone as a walk-in: the screen says neither.
  if (signUp && answer.signed_up === true) out.push(word('fact', FACT_WORDS, 'signed_up'))
  else if (signUp && answer.signed_up === false) out.push(word('fact', FACT_WORDS, 'walk_in'))
  if (answer.points === 1) out.push(word('fact', FACT_WORDS, 'points_one'))
  else if (answer.points && answer.points > 0) out.push(word('fact', FACT_WORDS, 'points', { points: points(answer.points, locale) }))
  return [...out, ...stampFacts(answer, locale)]
}

/**
 * The stamp an event's visit gave, in the desk's own words ("+1 stamp — 7 of 10", "Card complete! …"): visitsMath's
 * `deskSentences` read with nothing but the stamp, so the two screens say a stamp alike.
 */
export function stampFacts(answer: ScanAnswer, locale: string): Sentence[] {
  if (!answer.stamp) return []
  return deskSentences({ already_today: false, points: { checkin: 0, purchase: 0, balance: 0 }, stamp: answer.stamp, credit: null, member: answer.member }, 'purchase', locale)
}

/** Codes a scan refuses for the code itself (CardLookup): the card or number names nobody here. */
export const CARD_REFUSALS: readonly string[] = ['not_found', 'expired', 'revoked', 'used_up', 'inactive']

/**
 * A refused scan at a place or an event. A code that names nobody is a red "Card not recognised" with the scan's own
 * sentence (`loyalty.scan.error.*`); anything else (no connection, the server's trouble) is a grey "Try again" — never
 * "No access", which would turn a member away for a dropped connection.
 */
export function failureVerdict(failure: ApiFailure): VerdictView {
  const gone = goneContext(failure)
  if (gone) {
    return {
      tone: 'trouble', mark: 'retry', headline: headline('choose_again'), reason: reasonWord(gone === 'place' ? 'gone_place' : 'gone_event'),
      member: null, tier: null, validity: null, benefits: [], facts: [],
    }
  }
  if (CARD_REFUSALS.includes(failure.code)) {
    return {
      tone: 'denied', mark: 'cross', headline: headline('card_unknown'),
      reason: failure.code === 'inactive' && failure.extra.card === 'off' ? reasonWord('card_off') : scanError(failure),
      member: null, tier: null, validity: null, benefits: [], facts: [],
    }
  }
  return troubleView(failure, null)
}

/**
 * The place or the event scanned for is no longer this organisation's (404 `not_found` with `gone`, ScanController):
 * not the member's card at all — the screen asks for a new choice and reloads its lists.
 */
export function goneContext(failure: ApiFailure): 'place' | 'event' | null {
  const gone = failure.extra.gone
  return failure.code === 'not_found' && (gone === 'place' || gone === 'event') ? gone : null
}

function troubleView(failure: ApiFailure, member: MemberRow | null): VerdictView {
  return { tone: 'trouble', mark: 'retry', headline: headline('trouble'), reason: scanError(failure), member, tier: null, validity: null, benefits: [], facts: [] }
}

function scanError(failure: ApiFailure): Sentence {
  const list: Record<string, string> = ERRORS.scan
  const code = failure.code in list ? failure.code : 'unknown'
  return { key: `loyalty.scan.error.${code}`, fallback: list[code] }
}

// ─── The desk's card ──────────────────────────────────────────────────────

export interface ValidityLine {
  tone: 'neutral' | 'warning' | 'danger'
  sentence: Sentence
}

/**
 * The membership's end on the desk's card, when the member row carries one (part M's `valid_until` and
 * `membership_state`): "Valid until 3 Oct 2027", amber within 30 days ("— ends in 12 days"), red once it ended. The
 * server's state wins; without one the dates decide. No end date: nothing.
 */
export function deskValidity(member: Pick<MemberRow, 'valid_until' | 'membership_state'>, today: string, locale: string): ValidityLine | null {
  const until = member.valid_until
  if (!until || !isDateKey(until)) return null
  const days = daysBetween(today, until)
  const state = member.membership_state && member.membership_state !== 'off'
    ? member.membership_state
    : days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'active'
  const date = dayWords(until, today, locale)
  if (state === 'expired') return { tone: 'danger', sentence: word('validity', VALIDITY_WORDS, 'ended', { date }) }
  if (state === 'expiring') {
    if (days <= 0) return { tone: 'warning', sentence: word('validity', VALIDITY_WORDS, 'ending_today') }
    if (days === 1) return { tone: 'warning', sentence: word('validity', VALIDITY_WORDS, 'ending_tomorrow', { date }) }
    return { tone: 'warning', sentence: word('validity', VALIDITY_WORDS, 'ending', { date, days: String(days) }) }
  }
  return { tone: 'neutral', sentence: word('validity', VALIDITY_WORDS, 'until', { date }) }
}

// ─── Today here ───────────────────────────────────────────────────────────

/** "Today here" sits under the scanner at a place or an event; the desk has none. */
export function showsToday(context: ScanContext): boolean {
  return context.kind !== 'desk'
}

/** How many lines "Today here" shows (the newest). */
export const TODAY_LINES = 8

/**
 * A time as the venue's clock reads it: `HH:mm` as sent, a wall-clock `YYYY-MM-DDTHH:mm` by its digits, an instant
 * (with its offset) in the venue's zone.
 */
export function clockOf(value: string | null | undefined, timeZone: string): string {
  if (!value) return ''
  if (/^\d{2}:\d{2}$/.test(value)) return value
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(11, 16)
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return ''
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(new Date(ms))
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(ms))
  }
}

export interface TodayLine {
  id: string
  time: string
  name: string
  number: string | null
  granted: boolean
  label: Sentence
}

/**
 * A place's entry as a line: let in, or the short reason — in the places' own words (part A's `entryWords`, the one
 * copy an entries list reads), so "Today here" and Program's entries say each scan alike.
 */
export function entryLine(entry: EntryRow, timeZone: string): TodayLine {
  const [key, fallback, vars] = entryWords(entry)
  return {
    id: `entry-${entry.id}`,
    time: clockOf(entry.at, timeZone),
    name: entry.member?.name || entry.member?.member_number || '',
    number: entry.member?.member_number ?? null,
    granted: entry.granted,
    label: { key, fallback, ...(vars ? { vars: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, String(v)])) } : {}) },
  }
}

/** The people who came in to an event, newest first: their time, and whether they had signed up or walked in. */
export function peopleLines(
  people: readonly EventPerson[], timeZone: string, { signUp = true, sorted = false, limit = TODAY_LINES }: { signUp?: boolean; sorted?: boolean; limit?: number } = {},
): TodayLine[] {
  const checkedIn = people.filter(p => p.checked_in_at)
  // The server's `latest` comes newest first by real time; a page of people only has 'HH:mm', sorted as well as it can be.
  const ordered = sorted ? checkedIn : checkedIn.slice().sort((a, b) => (a.checked_in_at! < b.checked_in_at! ? 1 : a.checked_in_at! > b.checked_in_at! ? -1 : 0))
  return ordered
    .slice(0, limit)
    .map(p => ({
      id: `person-${p.member.id}`,
      time: clockOf(p.checked_in_at, timeZone),
      name: p.member.name || p.member.member_number || '',
      number: p.member.member_number,
      granted: true,
      // Without sign-up everyone is a walk-in, so the line just says they are in.
      label: word('fact', FACT_WORDS, !signUp ? 'checked_in' : p.walk_in ? 'walk_in' : 'signed_up'),
    }))
}

// ─── Door mode ────────────────────────────────────────────────────────────

/** Door mode's verdict clears itself after this long ("Ready — scan the next member"). */
export const CLEAR_AFTER_MS = 4000

/** The same code read again this soon after it was last seen is the same member still at the reader. */
export const DUPLICATE_MS = 3000

/** When a verdict clears: after 4 seconds at the door; on the scan page it stays until the next scan. */
export function clearsAfter(where: 'door' | 'page'): number | null {
  return where === 'door' ? CLEAR_AFTER_MS : null
}

/** When each code was last seen (ms), the ones of the last few seconds only. */
export type Seen = Readonly<Record<string, number>>

/**
 * Whether a code is a repeat to ignore: the same code seen within 3 seconds of its last sighting. The window slides —
 * a phone held up to the camera keeps being seen, and counts once until it has been away for 3 seconds — and each
 * code keeps its own, so a second member read meanwhile (a reader beside the camera) does not let the first one in
 * twice.
 */
export function isDuplicate(seen: Seen, code: string, now: number): boolean {
  const at = seen[code]
  return at !== undefined && now - at < DUPLICATE_MS
}

/** The sightings to remember after this one (ignored or sent, it moves its code's window); older ones are dropped. */
export function nextSeen(seen: Seen, code: string, now: number): Seen {
  const kept = Object.entries(seen).filter(([c, at]) => c !== code && now - at < DUPLICATE_MS)
  return Object.fromEntries([...kept, [code, now]])
}

/** A key pressed outside any field, as door mode reads it: a reader's (or a person's) character goes to the reader field. */
export interface KeyPress {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

/** Whether a key pressed elsewhere is taken to the reader field: a character (not Space on a button), no shortcut, no dialog open. */
export function takesKeyToField(e: KeyPress, where: { typing: boolean; modal: boolean; onButton: boolean }): boolean {
  if (where.typing || where.modal || e.ctrlKey || e.metaKey || e.altKey) return false
  if (e.key.length !== 1) return false
  return !(where.onButton && e.key === ' ')
}

/** The two tones door mode plays (Hz), when the sound is on: rising for a welcome, falling for a refusal. */
export function soundOf(tone: Tone): readonly [number, number] {
  switch (tone) {
    case 'granted': return [660, 990]
    case 'warning': return [660, 880]
    case 'denied': return [440, 220]
    default: return [330, 330]
  }
}

export const SOUND_KEY = 'loyalty:door-sound'

/** The remembered sound setting: off unless this device switched it on. */
export function soundOn(raw: string | null | undefined): boolean {
  return raw === 'on'
}
