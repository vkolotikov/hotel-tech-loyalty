import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi, useBrandId } from '../ContentProvider'
import type { ContentApi } from '../lib/api'
import { refreshLists } from '../lib/planCache'
import type { PromotionRun, SitePayload } from '../lib/types'
import { IDLE_POLL_MS, POLL_MS, isPromoting, isScanning, promotionEnded, scanEnded } from './promoteMath'

/**
 * The brand's website and its pages (spec 2026-10-20 §6.2), shared by the Brand page and Promote: read every 4 s while a
 * scan runs, once a minute otherwise, and again when the tab comes back — so another tab's scan shows up (final review).
 */
export function siteQueryOptions(api: ContentApi, brand: number | null) {
  return {
    queryKey: ['content', brand, 'site'] as const,
    queryFn: api.site,
    refetchOnWindowFocus: 'always' as const,
    refetchInterval: (query: { state: { data: unknown } }) => (isScanning(query.state.data as SitePayload | undefined) ? POLL_MS : IDLE_POLL_MS),
  }
}

/** The brand's latest promotion (spec §4.5), shared by Promote, the dialog and the Plan: as the website, every 4 s while it runs. */
export function promotionQueryOptions(api: ContentApi, brand: number | null) {
  return {
    queryKey: ['content', brand, 'promotion'] as const,
    queryFn: api.promotion,
    refetchOnWindowFocus: 'always' as const,
    refetchInterval: (query: { state: { data: unknown } }) => (isPromoting(query.state.data as PromotionRun | undefined) ? POLL_MS : IDLE_POLL_MS),
  }
}

/** The website, watched: when a scan seen running ends, the brand is read again (the scan may have filled its summary, USP and mission). */
export function useSite() {
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const query = useQuery(siteQueryOptions(api, brand))
  const seen = useRef<SitePayload | undefined>(query.data)
  useEffect(() => {
    if (scanEnded(seen.current, query.data)) {
      void queryClient.invalidateQueries({ queryKey: ['content', brand, 'brand'] })
      void queryClient.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
    }
    seen.current = query.data
  }, [query.data, queryClient, brand])
  return query
}

export function usePromotionRun() {
  const api = useApi()
  const brand = useBrandId()
  return useQuery(promotionQueryOptions(api, brand))
}

/** The promotion, watched: when a run seen running finishes, the plan, the pages' numbers and their posts are read again. */
export function usePromotionWatch(onEnd?: (run: PromotionRun) => void) {
  const run = usePromotionRun()
  const queryClient = useQueryClient()
  const brand = useBrandId()
  const seen = useRef<PromotionRun | undefined>(run.data)
  useEffect(() => {
    if (promotionEnded(seen.current, run.data) && run.data) {
      // refreshLists reads the plan, the website's numbers and the pages' post lists again.
      void refreshLists(queryClient, brand)
      onEnd?.(run.data)
    }
    seen.current = run.data
  }, [run.data, queryClient, brand, onEnd])
  return run
}
