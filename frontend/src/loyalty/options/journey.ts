import { isOn } from './optionsMath'
import type { OptionsAnswer, Way } from './types'

/**
 * Ways to earn's Overview as a member's journey (owner 2026-10-26: "easier to navigate … build a logic"): the steps a
 * member goes through — joins, visits and spends, celebrates, brings a friend, moves up, spends points, stays active —
 * each with the ways that act at that step and the other parts of the programme it leads to (tiers, rewards, offers,
 * boosts). Presentation only: the ways stay the server's (ProgrammeOptions::WAYS); one the workspace does not know
 * joins "Visits and spends", where most ways act (journey.test.ts fails until a new server way is placed on purpose).
 */

export type StageId = 'join' | 'visit' | 'celebrate' | 'friends' | 'move_up' | 'spend' | 'keep'
export type PartId = 'tiers' | 'rewards' | 'offers' | 'boosts'

export const STAGES: readonly StageId[] = ['join', 'visit', 'celebrate', 'friends', 'move_up', 'spend', 'keep']

export const WAY_STAGES: Record<string, StageId> = {
  welcome_bonus: 'join',
  earn_rate: 'visit',
  points_on_spend: 'visit',
  desk_earn: 'visit',
  check_in: 'visit',
  stamp_card: 'visit',
  cashback: 'visit',
  birthday_bonus: 'celebrate',
  referrals: 'friends',
  tier_progress: 'move_up',
  points_expiry: 'keep',
}

/** Each step's colour family (loyalty.css). */
export const STAGE_HUE: Record<StageId, string> = {
  join: 'bonus', visit: 'earn', celebrate: 'bonus', friends: 'bonus', move_up: 'rule', spend: 'gift', keep: 'rule',
}

/** The other parts of the programme a step leads to, each opening its own page. */
export const STAGE_PARTS: Record<StageId, PartId[]> = {
  join: [], visit: ['boosts'], celebrate: [], friends: [], move_up: ['tiers'], spend: ['rewards', 'offers'], keep: [],
}

export const PART_TO: Record<PartId, string> = {
  tiers: '/loyalty/program', rewards: '/loyalty/rewards', offers: '/loyalty/rewards?tab=offers', boosts: '/loyalty/program',
}

export const stageOf = (way: string): StageId => WAY_STAGES[way] ?? 'visit'

/** How many of a part the programme has (the catalogue's counts). */
export function partCount(part: PartId, answer: OptionsAnswer): number {
  const c = answer.catalogue
  return part === 'rewards' ? c.rewards.length : c[part]
}

/** The steps in order, each with its ways (the server's order) and parts; a step with neither is left out. */
export function stepsOf(ways: readonly Way[]): { stage: StageId; ways: Way[]; parts: PartId[] }[] {
  return STAGES
    .map(stage => ({ stage, ways: ways.filter(w => stageOf(w.key) === stage), parts: STAGE_PARTS[stage] }))
    .filter(s => s.ways.length > 0 || s.parts.length > 0)
}

/**
 * Whether a step gives members something today: a way of it that is on and used at this venue, or a part it leads to
 * that the programme has (tiers to move up, rewards to spend on). Boosts and offers come and go, so they alone do not
 * make a step live.
 */
export function stepLive(step: { ways: Way[]; parts: PartId[] }, answer: OptionsAnswer): boolean {
  const unused = new Set(answer.not_used ?? [])
  if (step.ways.some(way => isOn(way, answer.options) && !unused.has(way.key))) return true
  return step.parts.some(part => (part === 'tiers' || part === 'rewards') && partCount(part, answer) > 0)
}
