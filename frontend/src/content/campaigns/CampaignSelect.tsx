import { useTranslation } from 'react-i18next'
import type { Campaign } from './types'

export function CampaignSelect({ value, onChange, campaigns, all = false, disabled = false, invalid = false }: {
  value: string; onChange: (value: string) => void; campaigns: Campaign[]; all?: boolean; disabled?: boolean; invalid?: boolean
}) {
  const { t } = useTranslation()
  return <label className="block min-w-0 text-xs text-a-text-2">{t('content.campaigns.campaign', 'Campaign')}
    <select aria-label={t('content.campaigns.campaign', 'Campaign')} aria-invalid={invalid || undefined} className="c-launch-input mt-1" value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      <option value="">{all ? t('content.campaigns.all', 'All campaigns') : t('content.campaigns.none', 'No campaign')}</option>
      {campaigns.map(c => <option value={c.id} key={c.id}>{c.name}{c.status === 'archived' ? ` (${t('content.campaigns.archived', 'Archived')})` : ''}</option>)}
      {value && !campaigns.some(c => String(c.id) === value) && <option value={value}>{t('content.campaigns.unavailable', 'Saved campaign')}</option>}
    </select>
    {invalid && <span className="text-a-danger">{t('content.panel.field_invalid', 'Check this field.')}</span>}
  </label>
}
