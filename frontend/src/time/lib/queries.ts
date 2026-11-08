import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { timeApi } from './api'
import { plannerApi } from './tasks'
import type { Person, Template } from './types'

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

/** After any write: every Time Planner read is asked again (the boards, Today, the counts beside the areas). */
export function useRefresh(): () => void {
  const client = useQueryClient()
  return useCallback(() => { void client.invalidateQueries({ queryKey: ['time'] }) }, [client])
}

/** The people a task can be given to, accounts first then names without one. */
export function assignable(people: Person[] | undefined): Person[] {
  return [...(people ?? [])].sort((a, b) => Number(b.has_account) - Number(a.has_account) || a.name.localeCompare(b.name))
}
