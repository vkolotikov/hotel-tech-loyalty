import { useEffect, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, loyaltyUrl, watched } from '../lib/api'
import { canRetain, denied, overviewKey, overviewScope } from './overviewMath'
import type { ActivityFilter, Envelope, Module, ModuleData, Period } from './types'

const subscribeOnline = (notify: () => void) => {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify) }
}
export function useOnline() { return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true) }

const phoneMedia = () => window.matchMedia('(max-width: 767px)')
const subscribePhone = (notify: () => void) => { const media = phoneMedia(); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify) }
export function usePhone() { return useSyncExternalStore(subscribePhone, () => phoneMedia().matches, () => false) }

/** No placeholder data across periods/scopes. Refused reads are purged, never presented as cached authorization. */
export function useOverviewModule<M extends Module>(module: M, period: Period, filter: ActivityFilter = 'all') {
  const boot = useBoot()
  const client = useQueryClient()
  const scope = overviewScope(boot)
  const enabled = !['metrics', 'activity'].includes(module) || boot.staff.can.view_insights
  const key = overviewKey(scope, module, period, filter)
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => watched<Envelope<ModuleData[M]>>(api.get(loyaltyUrl(`overview/${module}`), { params: { period, filter }, signal })),
    enabled, staleTime: 30_000, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always',
    refetchInterval: 60_000, retry: (count, error) => !denied(error) && failureOf(error).status !== 422 && count < 1,
  })
  const forbidden = !enabled || denied(query.error)
  useEffect(() => {
    if (!forbidden) return
    client.removeQueries({ queryKey: ['loyalty', 'overview', scope, module], exact: false })
  }, [forbidden, client, scope, module])
  const data = enabled && canRetain(query.error, query.data?.scope, boot.organization.id) ? query.data : undefined
  return { ...query, data, forbidden }
}
