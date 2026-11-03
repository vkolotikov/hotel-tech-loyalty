import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { useSession } from './session'
import type { Bootstrap, TierRef } from './types'
import { queryClient } from './queryClient'
import { queueCounts } from './queue'
export { queryClient } from './queryClient'
export { useScan, whereKey, type ScanWhere } from './scanState'

export const KEYS = {
  boot: ['boot'] as const,
  metrics: ['metrics'] as const,
  activity: ['activity'] as const,
  members: (q: string, tierId: number | null) => ['members', q, tierId] as const,
  member: (id: number) => ['member', id] as const,
  history: (id: number) => ['history', id] as const,
  cards: (id: number) => ['cards', id] as const,
  requests: (state: string) => ['requests', state] as const,
  redemptions: ['redemptions'] as const,
  places: ['places'] as const,
  events: ['events'] as const,
}

/** Who is signed in, where, with which rights, the tiers and the venue's clock (`GET bootstrap`). */
export function useBoot() {
  const token = useSession(s => s.token)
  return useQuery({ queryKey: KEYS.boot, queryFn: api.bootstrap, enabled: !!token, staleTime: 5 * 60_000 })
}

export function useQueueCounts() {
  const token = useSession(s => s.token)
  return useQuery({
    queryKey: ['requests', 'counts'], enabled: !!token,
    queryFn: async () => {
      const [benefits, rewards] = await Promise.all([api.requests('waiting', 1), api.redemptions('pending', 1)])
      return queueCounts(benefits.counts, rewards.counts.pending)
    },
  })
}

/** A tier of the programme by its id. */
export function tierOf(boot: Bootstrap | undefined, id: number | null | undefined): TierRef | null {
  if (!boot || id === null || id === undefined) return null
  return boot.programme.tiers.find(tier => tier.id === id) ?? null
}

/** After a member changed (points, check-in, card), every list that shows them is read again. */
export function afterMemberChange(memberId: number): void {
  void queryClient.invalidateQueries({ queryKey: KEYS.member(memberId) })
  void queryClient.invalidateQueries({ queryKey: KEYS.history(memberId) })
  void queryClient.invalidateQueries({ queryKey: ['members'] })
  void queryClient.invalidateQueries({ queryKey: KEYS.metrics })
  void queryClient.invalidateQueries({ queryKey: KEYS.activity })
}

