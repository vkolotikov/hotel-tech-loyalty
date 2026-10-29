import { useTranslation } from 'react-i18next'
import en from '../i18n/settingsdesign.en.json'
export function useSettingsWords() { const { t } = useTranslation(); return (key: keyof typeof en, values?: Record<string, string | number>) => t(`loyalty.settingsdesign.${key}`, { defaultValue: en[key], ...values }) }
