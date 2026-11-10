import { useTranslation } from 'react-i18next'
import words from '../i18n/adminux.en.json'

export type AdminWord = keyof typeof words
export function useAdminWords() {
  const { t } = useTranslation()
  return (key: AdminWord, vars?: Record<string, string | number>) => t(`loyalty.adminux.${key}`, words[key], vars ?? {}) as string
}
