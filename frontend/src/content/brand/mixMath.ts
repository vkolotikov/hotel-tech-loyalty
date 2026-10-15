import { DEFAULT_MIX } from '../lib/options'

export const mixTotal = (mix: Record<string, number>): number => Object.values(mix).reduce((sum, pct) => sum + (pct > 0 ? pct : 0), 0)

/**
 * The mix scaled to exactly 100 %, in proportion; the rounding goes to the
 * largest remainders. Nothing set: the usual mix.
 */
export function balanceMix(mix: Record<string, number>): Record<string, number> {
  const total = mixTotal(mix)
  if (total === 0) return { ...DEFAULT_MIX }
  const exact = Object.entries(mix).map(([key, pct]) => [key, pct > 0 ? (pct / total) * 100 : 0] as const)
  const out: Record<string, number> = Object.fromEntries(exact.map(([key, value]) => [key, Math.floor(value)]))
  let left = 100 - mixTotal(out)
  for (const [key] of [...exact].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (left <= 0) break
    if (mix[key] > 0) {
      out[key] += 1
      left -= 1
    }
  }
  return out
}
