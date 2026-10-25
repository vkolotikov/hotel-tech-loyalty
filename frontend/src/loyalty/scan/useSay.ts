import { useTranslation } from 'react-i18next'
import type { Sentence } from './verdict'

/** A sentence of verdict.ts in the reader's language. */
export function useSay(): (s: Sentence) => string {
  const { t } = useTranslation()
  return (s) => t(s.key, s.fallback, s.vars)
}
