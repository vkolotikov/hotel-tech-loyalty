import { ChevronDown, Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { money, reportingValue } from '../lib/format'
import type { OpenLeadValue } from '../lib/types'
import { StatTile } from './StatTile'
import { TONE_CHIP } from './tones'

/** The headline is in one currency. Staff can inspect the original amounts or open the leads still to value. */
export function OpenValueTile({ label, valuation, fallback, to, hint }: {
  label: string
  valuation?: OpenLeadValue
  fallback: string
  to?: string
  hint?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const amount = valuation ? reportingValue(valuation, lang) : fallback
  if (!valuation || (!valuation.converted && !valuation.missing_currency && !valuation.missing_rate)) {
    return <div data-open-value="" className="min-w-0"><StatTile icon={Coins} tone="success" label={label} value={amount} hint={hint} to={to} /></div>
  }
  const known = valuation.groups.filter(group => group.currency !== 'XXX')
  const rateDate = valuation.rate_date && new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(valuation.rate_date + 'T00:00:00Z'))

  return (
    <section data-open-value="" aria-label={label} className="@container min-w-0 rounded-2xl border border-a-border bg-a-surface px-3.5 py-3 shadow-a-sm">
      <div className="flex items-center gap-2 sm:gap-3">
        <span aria-hidden className={`hidden h-9 w-9 shrink-0 place-items-center rounded-xl @[14rem]:grid ${TONE_CHIP.success}`}><Coins size={17} /></span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-a-text-2">{to ? <Link to={to} className="hover:underline">{label}</Link> : label}</p>
          <p className="break-words font-a-display text-xl leading-tight text-a-text @[14rem]:text-2xl">{amount}</p>
          {hint && <p className="text-xs text-a-text-2">{hint}</p>}
        </div>
      </div>
      {valuation.missing_currency > 0 && (
        <Link to="/crm/leads?missing_currency=1" className="mt-2 block w-fit text-xs font-medium text-a-accent-text underline underline-offset-2">
          {t('crm.leads.currency_to_review', 'Missing currency ({{count}} excluded)', { count: valuation.missing_currency })}
        </Link>
      )}
      {valuation.missing_rate > 0 && <p className="mt-1 text-xs text-a-text-2">{t('crm.leads.rate_missing', 'No exchange rate ({{count}} excluded)', { count: valuation.missing_rate })}</p>}
      {known.length > 0 && (
        <details className="group mt-2 border-t border-a-border pt-1">
          <summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-1 text-xs font-medium text-a-text-2 hover:text-a-text [&::-webkit-details-marker]:hidden">
            {t('crm.leads.currency_breakdown', 'Currency breakdown')} <ChevronDown aria-hidden size={14} className="shrink-0 group-open:rotate-180" />
          </summary>
          <dl className="space-y-1 pb-1 text-xs">
            {known.map(group => (
              <div key={group.currency} className="flex flex-wrap items-baseline justify-between gap-x-2">
                <dt className="text-a-text-2">{group.currency}{!group.included && ` · ${t('crm.leads.rate_unavailable', 'Rate unavailable')}`}</dt>
                <dd className="tabular-nums text-a-text">{money(group.amount, group.currency, lang)}</dd>
              </div>
            ))}
          </dl>
          {valuation.converted && rateDate && <p className="mt-1 text-xs text-a-text-2">{t('crm.leads.rate_date', 'ECB rates · {{date}}', { date: rateDate })}</p>}
        </details>
      )}
    </section>
  )
}
