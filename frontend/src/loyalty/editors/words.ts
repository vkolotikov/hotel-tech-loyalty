import { useTranslation } from 'react-i18next'
import words from '../i18n/editors.en.json'
export function useEditorWords() {
  const { t } = useTranslation()
  return (key: keyof typeof words, vars?: Record<string, string | number>) => t(`loyalty.editors.${key}`, words[key], vars ?? {}) as string
}
