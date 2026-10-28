import { useTranslation } from 'react-i18next'
import en from '../i18n/insightdesign.en.json'
export function useReportWords() { const { t } = useTranslation(); return (key: keyof typeof en, values?: Record<string, string | number>) => t(`loyalty.insightdesign.${key}`, { defaultValue: en[key], ...values }) }
