import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTime } from '../TimeProvider'
import { timeApi } from './api'
import { plannerApi } from './tasks'
import type { Person, Recognition, Template } from './types'

/** The team as the planner knows it (time/people), shared by every page and form. */
export function usePeople() {
  return useQuery({ queryKey: ['time', 'people'], queryFn: () => timeApi.people(), staleTime: 60_000 })
}

export function useTemplates() {
  return useQuery<Template[]>({ queryKey: ['time', 'templates'], queryFn: () => plannerApi.templates(), staleTime: 60_000 })
}

/** A person's name by their key, for sentences and chips; the team list first, then whatever names a page knows. */
export function usePersonName(extra: { key: string; name: string }[] = []): (key: string | null | undefined) => string | undefined {
  const people = usePeople().data?.people
  const names = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of people ?? []) map.set(p.key, p.name)
    for (const p of extra) if (!map.has(p.key)) map.set(p.key, p.name)
    return map
  }, [people, extra])
  return useCallback((key: string | null | undefined) => (key ? names.get(key) : undefined), [names])
}

/**
 * Recognition (2026-11-28): my points, daily goal, streak and badges, and the week's ranking as far as I may see it.
 * It is asked again after every write (it lives under ['time']) and every few minutes, because a colleague's finished
 * task moves the ranking; and not at all once the organisation switched recognition off (`data` is then nothing, even
 * if an earlier answer is still remembered).
 */
export function useRecognition(): { data: Recognition | undefined; off: boolean; isLoading: boolean; error: unknown; refetch: () => void } {
  const boot = useTime().data
  const off = boot?.settings.recognition === 'off'
  const query = useQuery<Recognition>({
    queryKey: ['time', 'recognition'],
    queryFn: () => timeApi.recognition(),
    enabled: Boolean(boot) && !off,
    staleTime: 30_000,
    refetchInterval: 3 * 60_000,
    retry: false,
  })
  const data = off || query.data?.mode === 'off' ? undefined : query.data
  return { data, off, isLoading: !off && query.isLoading, error: off ? null : query.error, refetch: () => { void query.refetch() } }
}

/** After any write: every Time Planner read is asked again (the boards, Today, the counts beside the areas). */
export function useRefresh(): () => void {
  const client = useQueryClient()
  return useCallback(() => { void client.invalidateQueries({ queryKey: ['time'] }) }, [client])
}

/** The people a task can be given to, accounts first then names without one. */
export function assignable(people: Person[] | undefined): Person[] {
  return [...(people ?? [])].sort((a, b) => Number(b.has_account) - Number(a.has_account) || a.name.localeCompare(b.name))
}
