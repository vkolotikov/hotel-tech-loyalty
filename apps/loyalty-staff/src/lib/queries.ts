import { QueryClient, useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { api } from './api'
import { useSession } from './session'
import type { Bootstrap, ScanAnswer, TierRef } from './types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 0, refetchOnWindowFocus: false },
  },
})

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

/** Where the desk scans for: the desk itself, a place, or one of today's events. */
export type ScanWhere = { kind: 'desk' } | { kind: 'place'; id: number; name: string } | { kind: 'event'; id: number; name: string }

export function whereKey(where: ScanWhere): string {
  return where.kind === 'desk' ? 'desk' : `${where.kind}:${where.id}`
}

interface ScanState {
  where: ScanWhere
  answer: ScanAnswer | null
  setWhere: (where: ScanWhere) => void
  show: (answer: ScanAnswer) => void
}

/** The scan screen's place, and the last answer the result screen shows. */
export const useScan = create<ScanState>(set => ({
  where: { kind: 'desk' },
  answer: null,
  setWhere: where => set({ where }),
  show: answer => set({ answer }),
}))
