import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { vocabKey, type VocabNoun } from './industry'

export { vocabIndustry, vocabKey, type VocabIndustry, type VocabNoun } from './industry'

/**
 * Industry nouns, translated. The admin's lib/vocabulary.ts is English-only;
 * a member reading the portal in Russian must not meet "Treatment" in the
 * middle of a Russian sentence, so the nouns live in the portal bundle under
 * vocab.<industry>.<noun> and resolve through i18next like everything else.
 */
export function useVocab(): (noun: VocabNoun) => string {
  const { t } = useTranslation()
  const { data } = usePortal()
  return (noun) => t(vocabKey(data?.venue.industry, noun))
}
