import type { Hue } from '../ui/sections'

/**
 * "Start here" (release 10, owner 2026-10-26: "go inside the app without any knowledge … understand all the
 * configuration"): the steps are the server's (SetupProgress, in its order, each done or not); here only where each
 * step is done in the workspace and the colour it wears. A step the workspace does not know is left out
 * (startMath.test.ts fails until a new server step is placed).
 */

export interface StartStep {
  key: string
  done: boolean
  count: number
}

export interface StartAnswer {
  steps: StartStep[]
  done: number
  total: number
}

export const START_KEY = ['loyalty', 'start'] as const

/** The page that does each step. */
export const STEP_TO: Record<string, string> = {
  programme: '/loyalty/options/setup',
  tiers: '/loyalty/program',
  ways: '/loyalty/options',
  rewards: '/loyalty/rewards',
  logo: '/loyalty/app?tab=app',
  member: '/loyalty',
  scan: '/loyalty/scan',
}

/** Each step in the colour of the page it opens. */
export const STEP_HUE: Record<string, Hue> = {
  programme: 'tier', tiers: 'tier', ways: 'earn', rewards: 'gift', logo: 'bonus', member: 'rule', scan: 'place',
}

/** The steps the workspace can show, in the server's order. */
export const knownSteps = (answer: StartAnswer): StartStep[] => answer.steps.filter(step => step.key in STEP_TO)

/** The first step not done yet: the one the page and the Members card lead to. */
export const nextStep = (answer: StartAnswer): StartStep | null => knownSteps(answer).find(step => !step.done) ?? null

/** Whether the list still has something to do (the Members card shows until it does not). */
export const stillToDo = (answer: StartAnswer | undefined): boolean => answer !== undefined && nextStep(answer) !== null
