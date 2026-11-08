import type { SetupProgress } from '../lib/types'

/**
 * Get started's decisions, pure for the tests: which step is next (the first not done, in the server's order) and how
 * far along the setup is, as a whole percent of the server's own counts (CrmSetupProgress).
 */
export function nextStep(steps: SetupProgress['steps']): SetupProgress['steps'][number] | null {
  return steps.find(step => !step.done) ?? null
}

export function progressShare(done: number, total: number): number {
  if (!(total > 0)) return 0
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
}
