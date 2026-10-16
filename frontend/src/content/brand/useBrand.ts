import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi, useBrandId } from '../ContentProvider'
import type { BrandPayload, ProfileFields } from '../lib/types'

/**
 * The brand as `GET brand` reads it (the same cache the post panel and
 * Generate read), and the two ways a section writes: `adopt` puts an answer
 * (every brand endpoint answers with the whole brand) in the cache and reads
 * the bootstrap again (readiness, "set up"); `saveProfile` sends only what it
 * is given, and nothing at all when that is nothing.
 */
/** What the brand cache keeps of an answer: the whole brand (some answers carry one item more), its snippets included. */
export function brandCache(payload: BrandPayload): BrandPayload {
  const { profile, audiences, channels, voice, readiness, snippets } = payload
  return { profile, audiences, channels, voice, readiness, snippets: snippets ?? [] }
}

export function useBrand() {
  const api = useApi()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['content', brandId, 'brand'], queryFn: api.brand, staleTime: 300_000 })

  const adopt = useCallback((payload: BrandPayload) => {
    queryClient.setQueryData<BrandPayload>(['content', brandId, 'brand'], brandCache(payload))
    void queryClient.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
  }, [queryClient, brandId])

  const saveProfile = useCallback(async (fields: ProfileFields) => {
    const sent = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as ProfileFields
    if (Object.keys(sent).length === 0) return
    adopt(await api.saveProfile(sent))
  }, [api, adopt])

  return { query, brand: query.data ?? null, adopt, saveProfile }
}
