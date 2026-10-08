import { useTranslation } from 'react-i18next'

// Order matches `DiscountService::VALUE_TYPES`'s own family — text is the
// default an existing free-text benefit already carries (see
// `BenefitAdminController::assignTierBenefit`'s `$tb->value_type ??= 'text'`
// on a new row), so it leads the list rather than sitting last.
//
// These constants and `benefitDisplay()` below live beside the component
// that is their only real consumer (Tiers.tsx imports all three from here)
// rather than in a separate lib file for a handful of small exports — same
// trade-off `BookingRow.tsx` already makes in this codebase.
// eslint-disable-next-line react-refresh/only-export-components
export const VALUE_TYPES = ['text', 'percent_discount', 'fixed_amount', 'points_multiplier', 'free_item'] as const
export type ValueType = typeof VALUE_TYPES[number]
// eslint-disable-next-line react-refresh/only-export-components
export const SCOPES = ['all', 'services', 'stays'] as const
export type Scope = typeof SCOPES[number]
export interface BenefitValue { value: string; value_type: ValueType; value_amount: string; applies_to: Scope }

/** The typed part of the Tiers assign/edit form — value type, amount (numeric types only) and booking scope. */
export function BenefitValueFields({ value, onChange }: { value: BenefitValue; onChange: (v: BenefitValue) => void }) {
  const { t } = useTranslation()
  const numeric = value.value_type === 'percent_discount' || value.value_type === 'fixed_amount' || value.value_type === 'points_multiplier'
  const cls = 'w-full bg-panel border border-dark-border rounded-lg px-3 py-2 text-sm text-white'
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label className="block text-sm text-t-soft">{t('tiers.value_type', 'Value type')}
        <select className={cls} value={value.value_type} onChange={e => onChange({ ...value, value_type: e.target.value as ValueType })}>
          {VALUE_TYPES.map(v => <option key={v} value={v}>{t(`tiers.types.${v}`, v)}</option>)}
        </select>
      </label>
      {numeric && <label className="block text-sm text-t-soft">{t('tiers.value_amount', 'Amount')}
        <input className={cls} type="number" min={0} step="0.01" value={value.value_amount} onChange={e => onChange({ ...value, value_amount: e.target.value })} />
      </label>}
      <label className="block text-sm text-t-soft">{t('tiers.applies_to', 'Applies to')}
        <select className={cls} value={value.applies_to} onChange={e => onChange({ ...value, applies_to: e.target.value as Scope })}>
          {SCOPES.map(s => <option key={s} value={s}>{t(`tiers.applies.${s}`, s)}</option>)}
        </select>
      </label>
    </div>
  )
}

/** "10% off · services" — the line the Tiers list prints for an assigned benefit. */
// eslint-disable-next-line react-refresh/only-export-components
export function benefitDisplay(
  tb: { value: string | null; value_type: string; value_amount: number | string | null; applies_to?: string | null },
  t: (k: string, f: string, options?: Record<string, unknown>) => string,
): string {
  const amount = Number(tb.value_amount ?? 0)
  const typed = tb.value_type === 'percent_discount'
    ? t('tiers.format.percent_off', '{{amount}}% off', { amount })
    : tb.value_type === 'fixed_amount'
    ? t('tiers.format.amount_off', '{{amount}} off', { amount: amount.toFixed(2) })
    : tb.value_type === 'points_multiplier'
    ? t('tiers.format.points_multiplier', '{{amount}}× points', { amount })
    : (tb.value ?? '')
  const scope = tb.applies_to && tb.applies_to !== 'all' ? ` · ${t(`tiers.applies.${tb.applies_to}`, tb.applies_to)}` : ''
  return typed + scope
}
