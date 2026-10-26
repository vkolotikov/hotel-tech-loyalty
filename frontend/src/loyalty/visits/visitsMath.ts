import { money, points } from '../lib/format'
import type { Can, Ways } from '../lib/types'
import type { CardReward, DeskAnswer, GivenReward, StampsView } from './visitsApi'
import { GIVEN_WORDS, GIVES_WORDS, PROBLEM_WORDS, SAID_WORDS, SOURCE_WORDS, type SaidKey } from './words'

/**
 * The desk's and the stamp card's decisions (release 7, spec 2026-10-25 §2), pure so the tests can read them by value:
 * which buttons show, what Add a purchase stops on, the circles of a card, and the server's answer in sentences. The
 * server decides everything about points, stamps and credit; these only say what it answered.
 */

/** The largest purchase the desk takes (DeskVisit::MAX_AMOUNT). */
export const MAX_AMOUNT = 1_000_000

/** A sentence the screen says: its key and English, and the values already written in the member's language. */
export interface Sentence {
  key: string
  fallback: string
  vars?: Record<string, string>
}

export type DeskKind = 'check_in' | 'purchase'

/** Whether a member's page shows the visits panel: the venue uses the stamp card, check-in or earning at the desk. */
export function showVisits(ways: Ways | undefined): boolean {
  return !!ways && (ways.stamps || ways.checkin || ways.desk_earn)
}

/**
 * The desk's buttons for this person and member: Check in when the venue uses check-in, Add a purchase when it uses
 * earning at the desk — both award points, so both need the Award right; none for a switched-off or deleted member.
 */
export function deskButtons(ways: Ways | undefined, can: Can, member: { is_active: boolean; is_erased?: boolean }): { checkIn: boolean; purchase: boolean } {
  const may = can.award && member.is_active && !member.is_erased
  return { checkIn: may && !!ways?.checkin, purchase: may && !!ways?.desk_earn }
}

/** A card's circles, filled for each stamp it has: `[true, true, false, …]`, as many as it needs. */
export function circles(count: number, needed: number): boolean[] {
  return Array.from({ length: Math.max(0, needed) }, (_, i) => i < count)
}

/**
 * The card a screen draws: the open card, or — before the first stamp of a new card — an empty one of the venue's
 * size now. `left` is how many stamps it still needs.
 */
export function shownCard(view: Pick<StampsView, 'card' | 'stamps_per_card'>): { count: number; needed: number; left: number; number: number | null } {
  const count = view.card?.stamps_count ?? 0
  const needed = view.card?.stamps_needed ?? view.stamps_per_card
  return { count, needed, left: Math.max(0, needed - count), number: view.card?.number ?? null }
}

/** How many decimals the currency's amounts have (two for most, none for JPY, KRW and the like). */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** A typed amount as a number ("12,50" and "12.50" alike), or null when it is not a plain amount. */
export function parseAmount(typed: string): number | null {
  const plain = typed.trim().replace(/\s/g, '').replace(',', '.')
  return /^\d+(\.\d+)?$/.test(plain) ? Number(plain) : null
}

export type AmountProblem = keyof typeof PROBLEM_WORDS

/** What Add a purchase stops on before sending, or null when it may be sent (the server checks again). */
export function amountProblem(typed: string, currency: string): AmountProblem | null {
  const amount = parseAmount(typed)
  if (amount === null || amount <= 0) return 'amount'
  if (amount > MAX_AMOUNT) return 'too_much'
  const decimals = (typed.trim().replace(',', '.').split('.')[1] ?? '').length
  const digits = currencyDigits(currency)
  if (decimals > digits) return digits === 0 ? 'whole' : 'decimals'
  return null
}

export function problemSentence(problem: AmountProblem, currency: string, locale: string): Sentence {
  return { key: `loyalty.visits.problem.${problem}`, fallback: PROBLEM_WORDS[problem], vars: { currency, max: money(MAX_AMOUNT, currency, locale) } }
}

const said = (key: SaidKey, vars?: Record<string, string>): Sentence => ({ key: `loyalty.visits.said.${key}`, fallback: SAID_WORDS[key], ...(vars ? { vars } : {}) })

/**
 * The desk's answer, sentence by sentence, in this order: whether the member was already checked in today (or
 * "Checked in" for a check-in), the check-in points, the stamp ("+1 stamp — 7 of 10", or the full card and what it
 * gave), the purchase's points, the credit earned.
 */
export function deskSentences(answer: DeskAnswer, kind: DeskKind, locale: string): Sentence[] {
  const out: Sentence[] = []
  if (answer.already_today) out.push(said('already_today'))
  else if (kind === 'check_in') out.push(said('checked_in'))
  if (answer.points.checkin > 0) out.push(said('checkin_points', { points: points(answer.points.checkin, locale) }))

  const stamp = answer.stamp
  if (stamp?.added) {
    if (stamp.completed) out.push(cardSentence(stamp.completed.reward, locale))
    else out.push(said('stamp', { have: points(stamp.card.stamps_count, locale), needed: points(stamp.card.stamps_needed, locale) }))
  } else if (stamp && stamp.reason === 'already_today' && !answer.already_today) {
    // A booking of today already stamped the card.
    out.push(said('stamp_had'))
  }

  if (answer.points.purchase > 0) out.push(said('purchase_points', { points: points(answer.points.purchase, locale) }))
  if (answer.credit && Number(answer.credit.amount) > 0) {
    out.push(said('credit', { amount: money(Number(answer.credit.amount), answer.credit.currency, locale) }))
  }
  return out
}

function cardSentence(reward: CardReward, locale: string): Sentence {
  return reward.kind === 'reward'
    ? said('card_reward', { reward: reward.reward_name })
    : said('card_points', { points: points(reward.points, locale) })
}

/** A stamp's visit in words; a source the workspace does not name reads as "Visit" (never the server's raw code). */
export function sourceSentence(source: string): Sentence {
  const known = source !== 'other' && Object.prototype.hasOwnProperty.call(SOURCE_WORDS, source) ? source : 'other'
  return { key: `loyalty.visits.source.${known}`, fallback: SOURCE_WORDS[known] }
}

/** What a completed card gave: "+100 points", "Free reward: Coffee". */
export function givenSentence(reward: GivenReward, locale: string): Sentence {
  return reward.kind === 'reward'
    ? { key: 'loyalty.visits.given.reward', fallback: GIVEN_WORDS.reward, vars: { reward: reward.reward_name } }
    : { key: 'loyalty.visits.given.points', fallback: GIVEN_WORDS.points, vars: { points: points(reward.points, locale) } }
}

/** What a full card gives now: "A full card gives 100 points.", "A full card gives a free Coffee." */
export function rewardSentence(reward: StampsView['reward'], locale: string): Sentence {
  return reward.kind === 'reward'
    ? { key: 'loyalty.visits.gives.reward', fallback: GIVES_WORDS.reward, vars: { reward: reward.reward_name } }
    : { key: 'loyalty.visits.gives.points', fallback: GIVES_WORDS.points, vars: { points: points(reward.points, locale) } }
}
