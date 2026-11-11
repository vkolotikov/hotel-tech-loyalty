import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'

/** Native choices with the same quiet, aligned treatment as the offer editor. */
export function OfferAudience({ value, onChange }: { value: 'programme' | 'members'; onChange: (value: 'programme' | 'members') => void }) {
  const { t } = useTranslation(), name = useId()
  return <div className="l-offer-audience" role="radiogroup" aria-label={t('loyalty.personal.audience')}>
    {(['programme', 'members'] as const).map(mode => <label key={mode} className="l-offer-audience-option">
      <input type="radio" name={name} value={mode} checked={value === mode} onChange={() => onChange(mode)} />
      <span className="l-offer-radio-mark" aria-hidden />
      <span className="l-offer-choice-label">{t(mode === 'programme' ? 'loyalty.personal.programme' : 'loyalty.personal.individual')}</span>
    </label>)}
  </div>
}

export function OfferLevels({ tiers, selected, onToggle, onAll, label, allLabel }: {
  tiers: { id: number; name: string }[]; selected: number[]; onToggle: (id: number) => void; onAll: () => void; label: string; allLabel: string
}) {
  return <div className="l-offer-levels" role="group" aria-label={label}>
    <button type="button" className="l-offer-all" aria-pressed={selected.length === 0} onClick={onAll}>
      <span className="l-offer-check-mark" aria-hidden><Check size={12} /></span><span>{allLabel}</span>
    </button>
    <div className="l-offer-level-options">{tiers.map(tier => <label className="l-offer-level-option" key={tier.id}>
      <input type="checkbox" checked={selected.includes(tier.id)} onChange={() => onToggle(tier.id)} />
      <span className="l-offer-check-mark" aria-hidden><Check size={12} /></span><span className="l-offer-choice-label">{tier.name}</span>
    </label>)}</div>
  </div>
}
