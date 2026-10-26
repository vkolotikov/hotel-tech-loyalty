import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import { tierPlaces, tierPlacesWords } from './placesMath'
import { PLACES_KEY, placesApi } from './placesApi'

/**
 * Release 8 (spec 2026-10-25 §1): on a tier's card, the places it can enter — "Can enter: Main entrance, Spa", "every
 * place", or "no place yet" — read from the places list Program's Places section reads (one source, one query). Nothing
 * while the list loads, could not be read, or the venue has no place switched on.
 */
export function TierPlaces({ tierId }: { tierId: number }) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: PLACES_KEY, queryFn: placesApi.list })
  const line = tierPlaces(query.data?.places, tierId)
  if (!line) return null
  return (
    <p data-tier-places={tierId} className="inline-flex min-w-0 items-start gap-1.5 text-sm text-a-text-2">
      <MapPin size={14} aria-hidden className="mt-[3px] shrink-0" />
      <span>{t(...tierPlacesWords(line))}</span>
    </p>
  )
}
