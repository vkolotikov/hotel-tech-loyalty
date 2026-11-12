import { useQuery, type QueryClient } from '@tanstack/react-query'
import { get, params } from '../lib/api'
import {
  DEFAULT_GUEST_TYPES, DEFAULT_IMPORTANCE, DEFAULT_INDUSTRIES, DEFAULT_LIFECYCLE, DEFAULT_RATE_TYPES, DEFAULT_VIP_LEVELS, listOr, settingList, withVip,
} from './contactsLogic'
import { orderedFields, type CustomFieldDef } from './recordLogic'
import type { CompanyDetail, DuplicatePair, Facets, Guest, GuestActivity, GuestLead, GuestTag } from './types'

/** Every query of this area starts with this key, so one invalidation refreshes the lists after a write. */
export const CONTACTS = ['crm', 'contacts'] as const

/** The venue's CRM settings (their lifecycle and importance lists). */
export function useCrmSettings() {
  return useQuery({
    queryKey: [...CONTACTS, 'settings'],
    queryFn: () => get<Record<string, unknown>>('crm-settings'),
    staleTime: 5 * 60_000,
  })
}

export interface ContactLists {
  lifecycle: string[]
  importance: string[]
  guestTypes: string[]
  vipLevels: string[]
  industries: string[]
  managers: string[]
  rateTypes: string[]
}

/** The words this venue uses for a contact's and a company's fields: its own lists, else the seeded defaults. */
export function useContactLists(): ContactLists {
  const settings = useCrmSettings()
  return {
    lifecycle: listOr(settings.data, 'lifecycle_statuses', DEFAULT_LIFECYCLE),
    importance: listOr(settings.data, 'importance_levels', DEFAULT_IMPORTANCE),
    guestTypes: listOr(settings.data, 'guest_types', DEFAULT_GUEST_TYPES),
    vipLevels: withVip(listOr(settings.data, 'vip_levels', DEFAULT_VIP_LEVELS)),
    industries: listOr(settings.data, 'industries', DEFAULT_INDUSTRIES),
    managers: settingList(settings.data, 'account_managers'),
    rateTypes: listOr(settings.data, 'rate_types', DEFAULT_RATE_TYPES),
  }
}

/** One contact (GET guests/{id}). */
export function useContact(id: number, enabled = true) {
  return useQuery({ queryKey: [...CONTACTS, 'one', id], queryFn: () => get<Guest>(`guests/${id}`), enabled })
}

/** Their leads (GET guests/{id}/inquiries, newest first, up to 50). */
export function useContactLeads(id: number, enabled = true) {
  return useQuery({ queryKey: [...CONTACTS, 'leads', id], queryFn: () => get<{ data: GuestLead[] }>(`guests/${id}/inquiries`), enabled })
}

/** Their timeline (GET guests/{id}/activities, newest first, up to 100). */
export function useTimeline(id: number, enabled = true) {
  return useQuery({ queryKey: [...CONTACTS, 'timeline', id], queryFn: () => get<{ data: GuestActivity[] }>(`guests/${id}/activities`), enabled })
}

/** One company with its vitals and latest leads (GET corporate-accounts/{id}). */
export function useCompany(id: number) {
  return useQuery({ queryKey: [...CONTACTS, 'company', id], queryFn: () => get<CompanyDetail>(`corporate-accounts/${id}`) })
}

/** The organisation's own fields of contacts (`guest`) or companies (`corporate_account`), the active ones in order. */
export function useCustomFields(entity: 'guest' | 'corporate_account') {
  return useQuery({
    queryKey: [...CONTACTS, 'custom-fields', entity],
    queryFn: () => get<CustomFieldDef[]>(`custom-fields${params({ entity, active_only: 1 })}`).then(orderedFields),
    // Settings → Fields keeps its own list; a minute keeps a field made there from waiting long to show here.
    staleTime: 60_000,
  })
}

export function useFacets() {
  return useQuery({ queryKey: [...CONTACTS, 'facets'], queryFn: () => get<Facets>('guests/facets'), staleTime: 5 * 60_000 })
}

export function useTags() {
  return useQuery({ queryKey: [...CONTACTS, 'tags'], queryFn: () => get<GuestTag[]>('guests/tags'), staleTime: 60_000 })
}

/** The suggested pairs (GET guests/duplicates, up to 50): the server's own matching. */
export function useDuplicates() {
  return useQuery({
    queryKey: [...CONTACTS, 'duplicates'],
    queryFn: () => get<{ pairs: DuplicatePair[] }>(`guests/duplicates${params({ limit: 50 })}`),
    staleTime: 60_000,
  })
}

/**
 * After contacts were added, changed or removed: this area's lists, and — because a contact's leads go with it — the
 * leads, the frame's counts and Today.
 */
export function refreshAfterContactChange(qc: QueryClient, { leadsToo = false }: { leadsToo?: boolean } = {}): void {
  void qc.invalidateQueries({ queryKey: CONTACTS })
  if (leadsToo) {
    void qc.invalidateQueries({ queryKey: ['crm', 'leads'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'pipeline'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'today'] })
  }
}

/** Hand the browser a text file to save (the CSV export): a link to a blob, clicked once. */
export function saveTextFile(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
