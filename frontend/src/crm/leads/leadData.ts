import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { DEFAULT_PRIORITIES, DEFAULT_SOURCES, settingList } from './leadLogic'
import { columnsBody, VIEW_PAGE, withColumn } from './listLogic'
import type { CustomField, GuestFacets, LeadKpis, LostReason, Pipeline, SavedView } from './leadTypes'

/** A hotel's enquiry types when it saved none (the full admin's `inquiry_types` default); other venues have none. */
export const HOTEL_TYPES = ['Room Reservation', 'Group Booking', 'Event/MICE', 'Wedding', 'Conference', 'Corporate Rate', 'Long Stay'] as const

const SETTINGS_KEY = ['crm', 'leads', 'settings'] as const

/** The organisation's pipelines with their stages (`GET pipelines`; the board, the stage pickers, the filters). */
export function usePipelines() {
  return useQuery({
    queryKey: ['crm', 'pipeline', 'pipelines'],
    queryFn: () => get<Pipeline[]>('pipelines'),
    staleTime: 5 * 60_000,
  })
}

/** `GET crm-settings` as it is: the lists below and the column switches. */
export function useCrmSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => get<Record<string, unknown>>('crm-settings'),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/**
 * The lead lists the organisation keeps in `crm-settings`: owners, sources, priorities and enquiry types (with the full
 * admin's fallbacks; a hotel's types by default, none elsewhere), and the settings themselves.
 */
export function useLeadSettings(): { owners: string[]; sources: string[]; priorities: string[]; types: string[]; raw: Record<string, unknown> | undefined } {
  const boot = useBoot()
  const query = useCrmSettings()
  return {
    owners: settingList(query.data, 'lead_owners', []),
    sources: settingList(query.data, 'lead_sources', DEFAULT_SOURCES),
    priorities: settingList(query.data, 'priorities', DEFAULT_PRIORITIES),
    types: settingList(query.data, 'inquiry_types', boot.organization.industry === 'hotel' ? HOTEL_TYPES : []),
    raw: query.data,
  }
}

/**
 * Switch one column of a list for the organisation (`PUT crm-settings/{key}`, the full admin's column popover): shown at
 * once, put back if the server refuses.
 */
export function useColumnSwitch(settingKey: 'inquiry_fields' | 'deal_fields', onError?: (error: unknown) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ column, on }: { column: string; on: boolean }) =>
      send('put', `crm-settings/${settingKey}`, columnsBody(qc.getQueryData<Record<string, unknown>>(SETTINGS_KEY), settingKey, column, on)),
    onMutate: async ({ column, on }) => {
      await qc.cancelQueries({ queryKey: SETTINGS_KEY })
      const before = qc.getQueryData<Record<string, unknown>>(SETTINGS_KEY)
      qc.setQueryData(SETTINGS_KEY, withColumn(before, settingKey, column, on))
      return { before }
    },
    onError: (error, _v, context) => {
      if (context) qc.setQueryData(SETTINGS_KEY, context.before)
      onError?.(error)
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: SETTINGS_KEY }) },
  })
}

/** The open pipeline's figures (`GET inquiries/kpis`): open leads, their value, follow-ups due, new this week. */
export function useLeadKpis() {
  return useQuery({
    queryKey: ['crm', 'leads', 'kpis'],
    queryFn: () => get<LeadKpis>('inquiries/kpis'),
    staleTime: 60_000,
  })
}

/** The person's own saved views of the leads list (shared with the full admin's Leads page). */
export function useSavedViews() {
  return useQuery({
    queryKey: ['crm', 'leads', 'views'],
    queryFn: () => get<SavedView[]>(`saved-views${params({ page: VIEW_PAGE })}`),
    staleTime: 60_000,
    retry: false,
  })
}

/** The countries the contacts hold (`GET guests/facets`), for the country filter. */
export function useGuestFacets(enabled = true) {
  return useQuery({
    queryKey: ['crm', 'leads', 'facets'],
    queryFn: () => get<GuestFacets>('guests/facets'),
    staleTime: 10 * 60_000,
    retry: false,
    enabled,
  })
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

/** After a lead changes: the lists, the board, its own page, the deals, Today and the counts beside Leads. */
export function useLeadChanged(): () => void {
  const qc = useQueryClient()
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['crm', 'leads'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'pipeline'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'deals'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'tasks'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'today'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
  }, [qc])
}
