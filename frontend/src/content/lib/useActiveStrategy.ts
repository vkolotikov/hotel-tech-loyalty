import { useQuery } from '@tanstack/react-query'
import { useApi, useBrandId } from '../ContentProvider'
import type { StrategyDetail } from './types'

/**
 * The brand's active strategy (its pillars name posts); the same reads the post panel makes, so they share the cache.
 * `known`: the pillars are known (read, or there is no active strategy), so a pillar not among them is truly another one.
 */
export function useActiveStrategy(): { activeId: number | null; strategy: StrategyDetail | null; known: boolean } {
  const api = useApi()
  const brand = useBrandId()
  const list = useQuery({ queryKey: ['content', brand, 'strategies'], queryFn: api.strategies, staleTime: 300_000 })
  const activeId = list.data?.strategies.find(s => s.status === 'active')?.id ?? null
  const detail = useQuery({
    queryKey: ['content', brand, 'strategy', activeId], queryFn: () => api.strategy(activeId as number), enabled: activeId !== null, staleTime: 300_000,
  })
  return { activeId, strategy: detail.data?.strategy ?? null, known: list.isSuccess && (activeId === null || detail.isSuccess) }
}
