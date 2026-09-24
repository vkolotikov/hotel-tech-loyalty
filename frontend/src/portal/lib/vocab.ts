import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'

/**
 * Industry nouns, translated. The admin's lib/vocabulary.ts is English-only;
 * a member reading the portal in Russian must not meet "Treatment" in the
 * middle of a Russian sentence, so the nouns live in the portal bundle under
 * vocab.<industry>.<noun> and resolve through i18next like everything else.
 */
export type VocabIndustry = 'hotel' | 'beauty' | 'medical' | 'restaurant' | 'fitness' | 'other'
export type VocabNoun = 'booking' | 'booking_plural' | 'service' | 'service_plural' | 'staff' | 'venue' | 'visit'

const KNOWN: readonly VocabIndustry[] = ['hotel', 'beauty', 'medical', 'restaurant', 'fitness']

export function vocabIndustry(industry: string | null | undefined): VocabIndustry {
  return (KNOWN as readonly string[]).includes(industry ?? '') ? (industry as VocabIndustry) : 'other'
}

export function useVocab(): (noun: VocabNoun) => string {
  const { t } = useTranslation()
  const { data } = usePortal()
  const industry = vocabIndustry(data?.venue.industry)
  return (noun) => t(`portal.vocab.${industry}.${noun}`)
}
