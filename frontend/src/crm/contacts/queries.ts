import { useQuery, type QueryClient } from '@tanstack/react-query'
import { get, params } from '../lib/api'
import { DEFAULT_IMPORTANCE, DEFAULT_LIFECYCLE, listOr } from './contactsLogic'
import type { DuplicatePair, Facets, GuestTag } from './types'

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

/** The lifecycle and importance words this venue uses: its own lists, else the seeded defaults. */
export function useContactLists(): { lifecycle: string[]; importance: string[] } {
  const settings = useCrmSettings()
  return {
    lifecycle: listOr(settings.data, 'lifecycle_statuses', DEFAULT_LIFECYCLE),
    importance: listOr(settings.data, 'importance_levels', DEFAULT_IMPORTANCE),
  }
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
