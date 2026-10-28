import { useTranslation } from 'react-i18next'
import en from '../../i18n/scandesign.en.json'
export function useScanWords() { const { t } = useTranslation(); return (key: keyof typeof en, values?: Record<string, string | number>) => t(`loyalty.scandesign.${key}`, { defaultValue: en[key], ...values }) }
