import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { get } from '../lib/api'

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
