import { useTranslation } from 'react-i18next'
import { useAppointments } from '../AppointmentsProvider'

/**
 * Industry nouns, translated. Beauty and the generic set ship in this
 * milestone; every other industry reads the generic words until its own set
 * is added to the five bundles (`appointments.vocab.<industry>.<noun>`).
 */
export type VocabIndustry = 'beauty' | 'other'
export type Noun = 'client' | 'clients' | 'team_member' | 'service'

export function vocabIndustry(industry: string | undefined): VocabIndustry {
  return industry === 'beauty' ? 'beauty' : 'other'
}

export function useVocab(): (noun: Noun) => string {
  const { t } = useTranslation()
  const { data } = useAppointments()
  const industry = vocabIndustry(data?.organization.industry)
  return (noun) => t(`appointments.vocab.${industry}.${noun}`)
}
