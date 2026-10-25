import { resolveLocale } from '../../lib/dates'
import type { MemberStamps } from './stampsApi'

/**
 * The portal's stamp card, decided here and tested by value (the portal's tests render to a string): whether there is
 * a card to show, its circles, and its sentences. The server says everything; this only draws it.
 */

/** What the card shows: a circle per stamp the card needs, filled for each it has, and what a full card gives. */
export interface StampFace {
  filled: boolean[]
  count: number
  needed: number
  left: number
  reward: NonNullable<MemberStamps['reward']>
  completed: number
}

/**
 * The face of the member's card, or null when there is none to show (the venue does not use the stamp card). Before
 * the first stamp of a card, an empty card of the venue's size.
 */
export function stampFace(data: MemberStamps | undefined): StampFace | null {
  if (!data || !data.enabled || !data.reward) return null
  const count = data.card?.stamps_count ?? 0
  const needed = data.card?.stamps_needed ?? data.stamps_per_card ?? 0
  if (needed <= 0) return null
  return {
    filled: Array.from({ length: needed }, (_, i) => i < count),
    count,
    needed,
    left: Math.max(0, needed - count),
    reward: data.reward,
    completed: data.completed_cards ?? 0,
  }
}

/** A phrase for t(): its key, the English, and the options (a plural family's `count` and its one-form fallback). */
export interface Phrase {
  key: string
  fallback: string
  options: Record<string, unknown>
}

/** The English of the card's words: the plain ones, and the plural families as [one, other]. */
export const STAMP_WORDS = {
  title: 'Stamp card',
  count: '{{have}} of {{needed}}',
  label: '{{have}} of {{needed}} stamps',
  full: 'Your card is full: your reward is on its way.',
  reward_free: 'Your reward: a free {{reward}}',
  completed: 'Cards completed: {{cards}}',
} as const

export const STAMP_COUNTED = {
  to_go: ['{{count}} more visit to your reward', '{{count}} more visits to your reward'],
  reward_points: ['Your reward: {{points}} point', 'Your reward: {{points}} points'],
} as const satisfies Record<string, readonly [string, string]>

const counted = (key: keyof typeof STAMP_COUNTED, count: number, vars: Record<string, unknown> = {}): Phrase => ({
  key: `portal.stamps.${key}`,
  fallback: STAMP_COUNTED[key][1],
  options: { count, defaultValue_one: STAMP_COUNTED[key][0], ...vars },
})

/** "3 more visits to your reward" — or, should a card ever show full, that the reward is on its way. */
export function toGoPhrase(face: StampFace): Phrase {
  return face.left > 0 ? counted('to_go', face.left) : { key: 'portal.stamps.full', fallback: STAMP_WORDS.full, options: {} }
}

/** What a full card gives: "Your reward: 100 points", "Your reward: a free Coffee". */
export function rewardPhrase(face: StampFace, locale: string): Phrase {
  return face.reward.kind === 'reward'
    ? { key: 'portal.stamps.reward_free', fallback: STAMP_WORDS.reward_free, options: { reward: face.reward.reward_name } }
    : counted('reward_points', face.reward.points, { points: face.reward.points.toLocaleString(resolveLocale(locale)) })
}
