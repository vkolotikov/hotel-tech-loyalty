import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, CreditCard, PackageCheck, PlayCircle, Settings2, Trophy } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, dayLabel, money } from '../lib/format'
import { leadPath } from '../lib/links'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Select, TextInput } from '../ui/inputs'
import { Pager } from '../ui/Pager'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { useLeadChanged } from '../leads/leadData'
import { amount, dayOf } from '../leads/leadLogic'
import type { LeadRow, Paginated } from '../leads/leadTypes'
import { DEAL_FILTERS, dealsQuery, FULFILMENT, fulfilmentProgress, isFulfilment, PAYMENTS, paymentBody, stillOwed, type DealFilter } from './board'
import { dealFilterLabel, fulfilmentLabel, paymentLabel, paymentTone } from './pipelineWords'

interface DealRow extends LeadRow {
  fulfillment_stage: string | null
  payment_status: string | null
  paid_amount: string | number | null
}

interface StageFigure { count: number; value: number }

/** `GET deals/kpis` (DealController::kpis). */
interface DealKpis {
  awaiting_payment: StageFigure
  design_needed: StageFigure
  in_production: StageFigure
  ready_to_ship: StageFigure
  completed_month: StageFigure
}

const read = (sp: URLSearchParams, key: string): string => sp.get(key) ?? ''
const SORTS = ['due_date', 'amount', 'created'] as const

/**
 * Won deals (the full admin's Deals & fulfilment): each won lead walked through its steps — awaiting payment,
 * preparation, review, in progress, ready, completed (`PATCH deals/{id}/stage`) — and its payment (`PATCH
 * deals/{id}/payment`), with the figures per step.
 */
export function WonDeals() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const [sp, setSp] = useSearchParams()
  const filter = (DEAL_FILTERS as readonly string[]).includes(read(sp, 'deal')) ? (read(sp, 'deal') as DealFilter) : 'all'
  const sort = (SORTS as readonly string[]).includes(read(sp, 'dsort')) ? (read(sp, 'dsort') as (typeof SORTS)[number]) : 'due_date'
  const page = Math.max(1, Number(read(sp, 'dpage')) || 1)
  const set = (patch: Record<string, string>) => {
    const q = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k) }
    setSp(q, { replace: true })
  }
  const query = dealsQuery(filter, page, sort)
  const deals = useQuery({ queryKey: ['crm', 'pipeline', 'deals', query], queryFn: () => get<Paginated<DealRow>>(`deals${params(query)}`), placeholderData: p => p })
  const kpis = useQuery({ queryKey: ['crm', 'pipeline', 'deal-kpis'], queryFn: () => get<DealKpis>('deals/kpis'), staleTime: 60_000, refetchInterval: 60_000 })
  const [paying, setPaying] = useState<DealRow | null>(null)
  const cur = boot.venue.currency
  const rows = deals.data?.data ?? []
  const fig = (f: StageFigure | undefined) => (f ? money(f.value, cur, lang) : undefined)

  return (
    <div className="space-y-5">
      {kpis.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile icon={CreditCard} tone="pending" label={t('crm.pipeline.kpi_awaiting', 'Awaiting payment')} value={count(kpis.data.awaiting_payment.count, lang)} hint={fig(kpis.data.awaiting_payment)} />
          <StatTile icon={Settings2} tone="progress" label={fulfilmentLabel(t, 'design_needed')} value={count(kpis.data.design_needed.count, lang)} hint={fig(kpis.data.design_needed)} />
          <StatTile icon={PlayCircle} tone="progress" label={fulfilmentLabel(t, 'in_production')} value={count(kpis.data.in_production.count, lang)} hint={fig(kpis.data.in_production)} />
          <StatTile icon={PackageCheck} tone="accent" label={fulfilmentLabel(t, 'ready_to_ship')} value={count(kpis.data.ready_to_ship.count, lang)} hint={fig(kpis.data.ready_to_ship)} />
          <StatTile icon={CheckCircle2} tone="success" label={t('crm.pipeline.kpi_completed', 'Completed this month')} value={count(kpis.data.completed_month.count, lang)} hint={fig(kpis.data.completed_month)} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs label={t('crm.pipeline.deals_filter', 'Which deals')} value={filter} onChange={next => set({ deal: next === 'all' ? '' : next, dpage: '' })}
          items={DEAL_FILTERS.map(key => ({ key, label: dealFilterLabel(t, key) }))} />
        <label className="ml-auto flex items-center gap-2 text-sm text-a-text-2">
          {t('crm.pipeline.sort', 'Sort')}
          <Select className="w-auto" value={sort} onChange={e => set({ dsort: e.target.value === 'due_date' ? '' : e.target.value, dpage: '' })}>
            <option value="due_date">{t('crm.pipeline.sort_due', 'Next step soonest')}</option>
            <option value="amount">{t('crm.pipeline.sort_amount', 'Largest first')}</option>
            <option value="created">{t('crm.pipeline.sort_created', 'Newest first')}</option>
          </Select>
        </label>
      </div>

      <Card padded={false}>
        <QueryState loading={deals.isLoading} error={deals.error} onRetry={() => { void deals.refetch() }}>
          {rows.length === 0 ? (
            <EmptyState icon={Trophy} title={filter === 'all' ? t('crm.pipeline.deals_empty', 'No won deals yet') : t('crm.pipeline.deals_none', 'No deal here')}
              line={t('crm.pipeline.deals_empty_line', 'A lead marked won shows here, to follow through to payment.')} />
          ) : (
            <ul className="divide-y divide-a-border">
              {rows.map(deal => <DealItem key={deal.id} deal={deal} onPay={() => setPaying(deal)} />)}
            </ul>
          )}
        </QueryState>
      </Card>
      {deals.data && <Pager page={deals.data.current_page} last={deals.data.last_page} total={deals.data.total} onPage={p => set({ dpage: p > 1 ? String(p) : '' })} />}
      {paying && <PaymentDialog deal={paying} onClose={() => setPaying(null)} />}
    </div>
  )
}

function DealItem({ deal, onPay }: { deal: DealRow; onPay: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const toast = useToast()
  const changed = useLeadChanged()
  const stage = useMutation({
    mutationFn: (next: string) => send('patch', `deals/${deal.id}/stage`, { stage: next }),
    onSuccess: (_r, next) => { changed(); toast(t('crm.pipeline.deal_moved', 'Now: {{step}}', { step: fulfilmentLabel(t, next) })) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const name = deal.guest?.full_name || deal.guest?.email || t('crm.common.no_name', 'No name')
  const value = amount(deal.total_value)
  const owed = stillOwed(deal.total_value, deal.paid_amount)
  const progress = fulfilmentProgress(deal.fulfillment_stage)
  const due = dayOf(deal.next_task_due)
  return (
    <li className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <Link to={leadPath(deal.id)} className="block truncate text-sm font-medium text-a-text hover:underline">{name}</Link>
        <p className="truncate text-xs text-a-text-2">
          {[deal.guest?.company, value !== null ? money(value, boot.venue.currency, lang) : null, due && !deal.next_task_completed ? t('crm.pipeline.next_on', 'Next step {{day}}', { day: dayLabel(due, lang) }) : null].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-1.5 flex gap-1" aria-hidden>
          {Array.from({ length: progress.total }, (_, i) => <span key={i} className={`h-1.5 w-6 rounded-full ${i < progress.done ? 'bg-a-st-confirmed' : 'bg-a-border'}`} />)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <label className="flex items-center gap-2">
          <span className="sr-only">{t('crm.pipeline.deal_step', 'Step')}</span>
          <Select className="w-auto min-h-9 py-1.5" value={isFulfilment(deal.fulfillment_stage) ? deal.fulfillment_stage : ''} disabled={stage.isPending}
            onChange={e => { if (e.target.value) stage.mutate(e.target.value) }}>
            {!isFulfilment(deal.fulfillment_stage) && <option value="" disabled>{fulfilmentLabel(t, null)}</option>}
            {FULFILMENT.map(s => <option key={s} value={s}>{fulfilmentLabel(t, s)}</option>)}
          </Select>
        </label>
        <button type="button" onClick={onPay} className="rounded-full focus-visible:outline-2 focus-visible:outline-a-accent" aria-label={t('crm.pipeline.pay_change', 'Change the payment for {{name}}', { name })}>
          <Pill tone={paymentTone(deal.payment_status)}>{paymentLabel(t, deal.payment_status)}</Pill>
        </button>
        {owed !== null && deal.payment_status !== 'paid' && amount(deal.paid_amount) !== null && (
          <span className="text-xs text-a-text-2">{t('crm.pipeline.owed', '{{amount}} still to pay', { amount: money(owed, boot.venue.currency, lang) })}</span>
        )}
      </div>
    </li>
  )
}

/** The payment's state and what was paid (`PATCH deals/{id}/payment`). */
function PaymentDialog({ deal, onClose }: { deal: DealRow; onClose: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const [status, setStatus] = useState<string>(deal.payment_status ?? 'pending')
  const [paid, setPaid] = useState(amount(deal.paid_amount) === null ? '' : String(amount(deal.paid_amount)))
  const body = paymentBody(status, paid)
  const save = useMutation({
    mutationFn: () => {
      if (!body) throw new Error('invalid')
      return send('patch', `deals/${deal.id}/payment`, body)
    },
    onSuccess: () => { changed(); toast(t('crm.common.saved', 'Saved')); onClose() },
  })
  return (
    <Dialog title={t('crm.pipeline.pay_title', 'Payment')} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (body) save.mutate() }}>
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
        <Field label={t('crm.pipeline.pay_status', 'State')}>
          <Select value={status} onChange={e => setStatus(e.target.value)}>
            {PAYMENTS.map(p => <option key={p} value={p}>{paymentLabel(t, p)}</option>)}
          </Select>
        </Field>
        <Field label={t('crm.pipeline.pay_amount', 'Paid so far ({{currency}})', { currency: boot.venue.currency })}>
          <TextInput type="number" inputMode="decimal" min={0} step="0.01" value={paid} onChange={e => setPaid(e.target.value)} aria-invalid={!body ? true : undefined} />
          {!body && <span className="mt-1 block text-xs text-a-danger">{t('crm.pipeline.pay_invalid', 'Enter an amount of zero or more.')}</span>}
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={save.isPending} disabled={!body}>{t('crm.common.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
