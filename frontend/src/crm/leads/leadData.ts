import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { get } from '../lib/api'
import { DEFAULT_PRIORITIES, DEFAULT_SOURCES, settingList } from './leadLogic'
import type { CustomField, LostReason, Pipeline } from './leadTypes'

/** The organisation's pipelines with their stages (`GET pipelines`; the board, the stage pickers, the filters). */
export function usePipelines() {
  return useQuery({
    queryKey: ['crm', 'pipeline', 'pipelines'],
    queryFn: () => get<Pipeline[]>('pipelines'),
    staleTime: 5 * 60_000,
  })
}

/** The lead lists the organisation keeps in `crm-settings`: owners, sources, priorities (with the full admin's fallbacks). */
export function useLeadSettings(): { owners: string[]; sources: string[]; priorities: string[] } {
  const query = useQuery({
    queryKey: ['crm', 'leads', 'settings'],
    queryFn: () => get<Record<string, unknown>>('crm-settings'),
    staleTime: 5 * 60_000,
    retry: false,
  })
  return {
    owners: settingList(query.data, 'lead_owners', []),
    sources: settingList(query.data, 'lead_sources', DEFAULT_SOURCES),
    priorities: settingList(query.data, 'priorities', DEFAULT_PRIORITIES),
  }
}

/** The reasons a lead can be lost for (`GET inquiry-lost-reasons`, active ones in order). */
export function useLostReasons(enabled = true) {
  return useQuery({
    queryKey: ['crm', 'leads', 'lost-reasons'],
    queryFn: () => get<LostReason[]>('inquiry-lost-reasons'),
    staleTime: 10 * 60_000,
    enabled,
  })
}

/** The organisation's own lead fields (`GET custom-fields?entity=inquiry&active_only=1`). */
export function useLeadFields() {
  return useQuery({
    queryKey: ['crm', 'leads', 'custom-fields'],
    queryFn: () => get<CustomField[]>('custom-fields?entity=inquiry&active_only=1'),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** After a lead changes: the lists, the board, its own page, Today and the counts beside Leads. */
export function useLeadChanged(): () => void {
  const qc = useQueryClient()
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['crm', 'leads'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'pipeline'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'tasks'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'today'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
  }, [qc])
}
