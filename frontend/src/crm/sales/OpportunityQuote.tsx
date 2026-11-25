import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { assistantKey, SALES_FIELD, type Assistant, type Quote } from './assistantData'

function fields(quote?: Quote | null) {
  return {
    reference: quote?.reference ?? '', scope: quote?.scope ?? '', currency: quote?.currency ?? '',
    quantity: String(quote?.quantity ?? ''), unit_price: quote?.unit_price ?? '', charges: quote?.charges ?? '',
    valid_until: quote?.valid_until ?? '', tax_basis: quote?.tax_basis ?? 'unspecified',
  }
}

export function OpportunityQuote({ leadId, data }: { leadId: number; data: Assistant }) {
  const { t } = useTranslation()
  const cache = useQueryClient()
  const key = assistantKey(leadId)
  const [edit, setEdit] = useState<{ form: ReturnType<typeof fields>; revision: number } | null>(null)
  const form = edit?.form ?? fields(data.quote)
  const change = (field: keyof typeof form, value: string) => setEdit({ revision: edit?.revision ?? data.revision, form: {
    ...form, [field]: field === 'currency' ? value.toUpperCase() : value,
  } })
  const save = useMutation({
    mutationFn: (remove: boolean) => send<Assistant>('put', `crm/leads/${leadId}/assistant/quote`, {
      revision: edit?.revision ?? data.revision,
      quote: remove ? null : { ...form, quantity: Number(form.quantity), charges: form.charges || null },
    }),
    onSuccess: next => { cache.setQueryData(key, next); setEdit(null) },
  })
  const changed = failureOf(save.error).code === 'strategy_changed'
  return (
    <details className="rounded-xl border border-a-border bg-a-surface p-4 text-sm">
      <summary className="cursor-pointer font-semibold text-a-text">{t('crm.sales.quote.title')}
        {data.quote && <span className="ml-2 font-normal text-a-text-2">{data.quote.reference} · {data.quote.currency} {data.quote.total}</span>}
      </summary>
      <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); if (edit && !changed) save.mutate(false) }}>
        <fieldset disabled={!data.can_review || save.isPending} className="grid gap-3 sm:grid-cols-2">
          {(['reference', 'scope', 'quantity', 'unit_price', 'charges', 'currency', 'valid_until'] as const).map(field => (
            <label key={field} className="space-y-1 text-a-text">
              <span>{t(`crm.sales.quote.${field}`)}</span>
              <input className={SALES_FIELD} value={form[field]} onChange={event => change(field, event.target.value)}
                type={field === 'valid_until' ? 'date' : field === 'quantity' ? 'number' : 'text'}
                pattern={field === 'currency' ? '[A-Z]{3}' : ['unit_price', 'charges'].includes(field) ? '[0-9]{1,10}(\\.[0-9]{1,4})?' : undefined}
                inputMode={['unit_price', 'charges'].includes(field) ? 'decimal' : undefined}
                min={field === 'quantity' ? 1 : undefined} max={field === 'quantity' ? 10000000 : undefined}
                maxLength={field === 'scope' ? 600 : field === 'currency' ? 3 : 100} required={field !== 'charges'} />
            </label>
          ))}
          <label className="space-y-1 text-a-text"><span>{t('crm.sales.quote.tax_basis')}</span>
            <select className={SALES_FIELD} value={form.tax_basis} onChange={event => change('tax_basis', event.target.value)}>
              {(['unspecified', 'included', 'excluded'] as const).map(value => <option key={value} value={value}>{t(`crm.sales.quote.${value}`)}</option>)}
            </select>
          </label>
        </fieldset>
        {save.error && <Notice tone="danger">{changed
          ? <button type="button" className="underline" onClick={async () => { await cache.invalidateQueries({ queryKey: key }); setEdit(null); save.reset() }}>{t('crm.sales.reload')}</button>
          : errorText(t, save.error)}</Notice>}
        {data.can_review && <div className="flex flex-wrap justify-end gap-2">
          {data.quote && <Button type="button" variant="secondary" size="sm" disabled={save.isPending || changed} onClick={() => save.mutate(true)}>{t('crm.sales.quote.remove')}</Button>}
          <Button type="submit" size="sm" disabled={!edit || changed} loading={save.isPending}>{t('crm.sales.quote.save')}</Button>
        </div>}
      </form>
    </details>
  )
}
