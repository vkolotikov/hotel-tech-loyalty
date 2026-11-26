import { useTranslation } from 'react-i18next'
import { currencyLabel } from '../lib/format'
import { Select } from '../ui/inputs'

export function LeadCurrency({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const { t, i18n } = useTranslation()
  const codes = Array.from(new Set([value, 'EUR', 'GBP', 'USD', 'CAD', 'AUD', 'CHF']))
  return <Select aria-label={t('crm.leads.currency', 'Currency')} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
    {codes.map(code => <option key={code} value={code}>{currencyLabel(code, i18n.language)}</option>)}
  </Select>
}
