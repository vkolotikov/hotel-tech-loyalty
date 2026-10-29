import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { overviewScope } from '../overview/overviewMath'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { FormField } from '../ui/formParts'
import { CURRENCY_KEY, appApi } from './api'
import { currencyChanged, currencyLabel, currencyWarnings, type CurrencyWarning } from './appMath'
import { ERRORS } from './errors'
import { INPUT, LoadFailed, Loading, Part } from './parts'
import type { CurrencyAnswer, CurrencyPreview } from './types'

/**
 * The venue's currency (release 4, R4-5): one field that writes the setting the appointments Setup writes, so the
 * member portal, offers, Insights and Setup all show the one currency. The list is the server's. Save asks the server
 * first what the change would mean (a dry run); when it says anything — online payments set up in another currency,
 * bookings kept in theirs, stays priced apart, prices relabelled — the manager reads it and confirms, or keeps the
 * currency they have. A manager's, as the rest of Card & app.
 */
export function CurrencyTab() {
  const boot = useBoot(), queryKey = [...CURRENCY_KEY, overviewScope(boot)]
  const query = useQuery({ queryKey, queryFn: appApi.currency })
  const data = query.data

  if (query.isError) return <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />
  if (!data) return <Loading />
  return <CurrencyEditor key={overviewScope(boot)} answer={data} queryKey={queryKey} />
}

export function CurrencyEditor({ answer, initialPreview = null, queryKey = CURRENCY_KEY }: { answer: CurrencyAnswer; initialPreview?: CurrencyPreview | null; queryKey?: readonly unknown[] }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const [chosen, setChosen] = useState(answer.currency)
  const [preview, setPreview] = useState<CurrencyPreview | null>(initialPreview)

  const save = useMutation({
    mutationFn: () => appApi.saveCurrency(chosen),
    onSuccess: (saved) => {
      client.setQueryData<CurrencyAnswer>(queryKey, saved)
      // The bootstrap's venue.currency is what every page writes money in.
      void client.invalidateQueries({ queryKey: ['loyalty', 'bootstrap'] })
      setPreview(null)
    },
  })
  const check = useMutation({
    mutationFn: () => appApi.previewCurrency(chosen),
    onSuccess: (answered) => {
      if (currencyWarnings(answered).length === 0) save.mutate()
      else setPreview(answered)
    },
  })
  const failure = save.isError ? failureOf(save.error) : check.isError ? failureOf(check.error) : null
  const changed = currencyChanged(answer.currency, chosen, answer.options)
  const warnings = preview ? currencyWarnings(preview) : []

  return (
    <div className="max-w-2xl space-y-5">
      <Part title={t('loyalty.app.currency.title', 'Currency')}
        line={t('loyalty.app.currency.line', 'The currency your prices and the amounts members see are in. The member portal, offers, Insights and the appointments Setup read this one setting. Changing it relabels prices; it never converts them.')}>
        <FormField label={t('loyalty.app.currency.field', 'Currency')}>
          <select data-currency="" value={chosen} disabled={save.isPending || check.isPending}
            onChange={(e) => { setChosen(e.target.value); setPreview(null); save.reset(); check.reset() }} className={`${INPUT} sm:w-80`}>
            {answer.options.map(code => <option key={code} value={code}>{currencyLabel(code, locale)}</option>)}
          </select>
        </FormField>

        {preview && warnings.length > 0 && (
          <div data-currency-warnings="" className="space-y-3">
            <Notice tone="warning">
              <p className="font-medium">{t('loyalty.app.currency.before', 'Before you change {{from}} to {{to}}:', { from: preview.from, to: preview.to })}</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                {warnings.map(w => <li key={w.key} data-warning={w.key}>{warningText(t, w, preview.to, locale)}</li>)}
              </ul>
            </Notice>
            <div className="flex flex-wrap gap-2">
              <Button type="button" loading={save.isPending} onClick={() => save.mutate()}>{t('loyalty.app.currency.confirm', 'Change to {{to}}', { to: preview.to })}</Button>
              <Button type="button" variant="secondary" disabled={save.isPending} onClick={() => { setPreview(null); setChosen(answer.currency) }}>
                {t('loyalty.app.currency.keep', 'Keep {{from}}', { from: preview.from })}
              </Button>
            </div>
          </div>
        )}

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.app', ERRORS, 'currency', failure))}</Notice>}
        {save.isSuccess && !preview && (
          <Notice tone="success">{t('loyalty.app.currency.saved', 'Saved. Prices and amounts now show in {{currency}}.', { currency: answer.currency })}</Notice>
        )}

        {!preview && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {changed && <p className="text-sm text-a-text-2">{t('loyalty.app.currency.unsaved', 'Not saved yet.')}</p>}
            <Button type="button" disabled={!changed} loading={check.isPending || save.isPending} onClick={() => check.mutate()}>
              {t('loyalty.app.currency.save', 'Save currency')}
            </Button>
          </div>
        )}
      </Part>
    </div>
  )
}

type T = ReturnType<typeof useTranslation>['t']

/** One thing the dry run said, in the workspace's words. */
// Shared with the full Settings page; it has no component state.
// eslint-disable-next-line react-refresh/only-export-components
export function warningText(t: T, w: CurrencyWarning, to: string, locale: string): string {
  switch (w.key) {
    case 'payments':
      return t('loyalty.app.currency.warn.payments', 'Online payments are set up in {{currency}}. Bookings priced in {{to}} would be paid at the venue until Stripe takes {{to}} (full admin: Settings → Integrations).', { currency: w.currency, to })
    case 'bookings':
      return t('loyalty.app.currency.warn.bookings', '{{total}} appointments were booked in another currency ({{upcoming}} still to come). They keep the currency they were booked in.', { total: points(w.total, locale), upcoming: points(w.upcoming, locale) })
    case 'stays':
      return t('loyalty.app.currency.warn.stays', 'Stays are priced in {{currency}}, set in the full admin’s booking settings. This field does not change them.', { currency: w.currency })
    default:
      return t('loyalty.app.currency.warn.relabel', '{{services}} services and {{extras}} extras get the {{to}} label. Their prices stay the same numbers.', { services: points(w.services, locale), extras: points(w.extras, locale), to })
  }
}
