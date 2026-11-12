import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { get, params } from '../lib/api'
import type { CustomField, MetaList } from '../leads/leadTypes'
import { tasksQuery, type Task } from './taskLogic'

/** A person the team can give a task or a lead to (`GET chat-inbox-agents`: the organisation's staff accounts). */
export interface TeamMember { id: number; name: string; email?: string | null }

/** The team, for "Assigned to". Read once a few minutes; a refusal leaves the list empty (the person keeps "Me"). */
export function useTeam() {
  return useQuery({
    queryKey: ['crm', 'tasks', 'team'],
    queryFn: () => get<TeamMember[]>('chat-inbox-agents'),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** After a task changes: its lists, the lead it belongs to (its next step follows the task), Today and the counts. */
export function useTaskChanged(): () => void {
  const qc = useQueryClient()
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['crm', 'tasks'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'leads'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'pipeline'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'today'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
  }, [qc])
}

/**
 * The person's own open tasks (`GET tasks?status=open&assigned_to=<me>`), the read the Tasks page makes for Mine, so
 * the two share one cache. Today opens one of them in the task form from it.
 */
export function useMyOpenTasks(me: number, enabled = true) {
  const query = tasksQuery({ tab: 'today', who: 'mine', page: 1 }, me)
  return useQuery({
    queryKey: ['crm', 'tasks', 'list', query],
    queryFn: () => get<MetaList<Task>>(`tasks${params(query)}`),
    staleTime: 20_000,
    enabled,
  })
}

/** The organisation's own task fields (`GET custom-fields?entity=task&active_only=1`, as the full admin's drawer). */
export function useTaskFields() {
  return useQuery({
    queryKey: ['crm', 'tasks', 'custom-fields'],
    queryFn: () => get<CustomField[]>('custom-fields?entity=task&active_only=1'),
    staleTime: 5 * 60_000,
    retry: false,
  })
}
