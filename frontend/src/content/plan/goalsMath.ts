import type { DateKey, GoalPlatform, Goals } from '../lib/types'

/** The goals are always the venue's current week's: the line shows on the week that holds today, once a target exists. */
export const showGoals = (goals: Goals | undefined, range: { from: DateKey; to: DateKey }, today: DateKey): goals is Goals =>
  goals !== undefined && goals.platforms.length > 0 && today >= range.from && today <= range.to

/** A goal is met once the posts marked published reach the target. */
export const goalMet = (g: GoalPlatform): boolean => g.published >= g.target
