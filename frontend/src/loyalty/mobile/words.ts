import { useTranslation } from 'react-i18next'
import en from '../i18n/mobile.en.json'
export function useMobileWords() {
  const { t } = useTranslation()
  return (key: keyof typeof en, values?: Record<string, string | number>) => t(`loyalty.mobile.${key}`, { defaultValue: en[key], ...values })
}
