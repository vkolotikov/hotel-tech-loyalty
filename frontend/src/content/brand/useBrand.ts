import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi, useBrandId } from '../ContentProvider'
import type { BrandPayload, ProfileFields, Template } from '../lib/types'
import { withTemplates } from './templateActions'

/**
 * The brand as `GET brand` reads it (the same cache the post panel and
 * Generate read), and the two ways a section writes: `adopt` puts an answer
 * (every brand endpoint answers with the whole brand) in the cache and reads
 * the bootstrap again (readiness, "set up"); `saveProfile` sends only what it
 * is given, and nothing at all when that is nothing.
 */
/** What the brand cache keeps of an answer: the whole brand (some answers carry one item more), its snippets included. */
export function brandCache(payload: BrandPayload): BrandPayload {
  const { profile, audiences, channels, voice, readiness, snippets, templates, holiday_country_guess } = payload
  return { profile, audiences, channels, voice, readiness, snippets: snippets ?? [], templates: templates ?? [], holiday_country_guess: holiday_country_guess ?? null }
}

/** Whether a brand change alters the Plan's key dates (the holiday country, the marketing switch): the Plan is read again. */
export const profileTouchesPlan = (fields: ProfileFields): boolean => 'holiday_country' in fields || 'marketing_days' in fields

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
    // Final review: a new holiday country showed on the Plan only after its next refresh.
    if (profileTouchesPlan(sent)) void queryClient.invalidateQueries({ queryKey: ['content', brandId, 'plan'] })
  }, [api, adopt, queryClient, brandId])

  // The template endpoints answer the whole list, not the brand (spec 2026-10-16 §5.2): the cache keeps it.
  const setTemplates = useCallback((templates: Template[]) => {
    queryClient.setQueryData<BrandPayload>(['content', brandId, 'brand'], old => (old ? withTemplates(old, templates) : old))
  }, [queryClient, brandId])

  return { query, brand: query.data ?? null, adopt, saveProfile, setTemplates }
}
