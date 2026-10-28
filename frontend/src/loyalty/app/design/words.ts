import { useTranslation } from 'react-i18next'
import en from '../../i18n/carddesign.en.json'
export function useCardWords() { const { t } = useTranslation(); return (key: keyof typeof en, values?: Record<string, string | number>) => t(`loyalty.carddesign.${key}`, { defaultValue: en[key], ...values }) }
