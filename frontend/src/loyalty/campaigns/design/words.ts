import { useTranslation } from 'react-i18next'
import en from '../../i18n/campaigndesign.en.json'
export function useCampaignWords() {
  const { t } = useTranslation()
  return (key: keyof typeof en, values?: Record<string, string | number>) => t(`loyalty.campaigndesign.${key}`, en[key], values)
}
