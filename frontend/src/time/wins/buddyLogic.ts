import type { RankRow, Recognition, RecognitionMe } from '../lib/types'
import type { Cheer } from './winsLogic'

/**
 * Buddies' decisions (2026-11-28, the owner: "add some animated characters"), pure because the page tests render to a
 * string. Which character a person has is the server's (App\Services\Time\Buddies: their choice, or one by their
 * account; none when they chose none or the organisation switched characters off); these only say what mood a
 * character is in — read from the same answer as the points — and where one is drawn.
 */

/** The characters the workspace can draw (the server's Buddies::KINDS). */
export const BUDDY_KINDS = ['hexi', 'pip', 'miu', 'ember'] as const
export type BuddyKind = (typeof BUDDY_KINDS)[number]

/** A person's choice of no character. */
export const NO_BUDDY = 'none'
export type BuddyChoice = BuddyKind | typeof NO_BUDDY

/** The character an answer names, or none: a code this build cannot draw (a newer server's) is no character. */
export function buddyOf(value: unknown): BuddyKind | null {
  return (BUDDY_KINDS as readonly unknown[]).includes(value) ? (value as BuddyKind) : null
}

/** What the person chose themselves: a character, none, or nothing yet. */
export function choiceOf(value: unknown): BuddyChoice | null {
  return value === NO_BUDDY ? NO_BUDDY : buddyOf(value)
}

/**
 * Whether the organisation shows characters: only where the answer says so. An answer that does not say (an older
 * server, for the moment a release takes) shows none, so nothing is offered that could not be saved.
 */
export function buddiesOn(data: Pick<Recognition, 'buddies'> | undefined): boolean {
  return data?.buddies === true
}

/**
 * A character's mood, from the person's day: asleep with nothing planned, ready before the first task is done, busy
 * once work is under way, proud with the daily goal met, and a party when everything planned is done.
 */
export const MOODS = ['sleepy', 'ready', 'busy', 'proud', 'party'] as const
export type Mood = (typeof MOODS)[number]

export function moodOf(today: RecognitionMe['today']): Mood {
  if (today.planned === 0 && today.done === 0) return 'sleepy'
  if (today.sweep) return 'party'
  if (today.goal_met) return 'proud'
  return today.done > 0 ? 'busy' : 'ready'
}

/** The week's leader wears the crown: first place among more than one, where places are told. */
export function crowned(week: Pick<RecognitionMe['week'], 'rank' | 'of'>): boolean {
  return week.rank === 1 && (week.of ?? 0) > 1
}

/** The character beside a name in the ranking, where the organisation shows characters and the person has one. */
export function rowBuddy(data: Pick<Recognition, 'buddies'>, row: Pick<RankRow, 'buddy'>): BuddyKind | null {
  return buddiesOn(data) ? buddyOf(row.buddy) : null
}

/** On the podium the winner celebrates and wears the crown; the others are proud. */
export function podiumBuddy(data: Pick<Recognition, 'buddies'>, row: Pick<RankRow, 'buddy'>, step: 1 | 2 | 3): { kind: BuddyKind; mood: Mood; crown: boolean } | null {
  const kind = rowBuddy(data, row)
  return kind ? { kind, mood: step === 1 ? 'party' : 'proud', crown: step === 1 } : null
}

/** In a celebration the character parties for the big moments and is proud of the smaller ones. */
export function cheerMood(cheer: Pick<Cheer, 'big'>): Mood {
  return cheer.big ? 'party' : 'proud'
}
