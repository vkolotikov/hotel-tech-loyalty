import { Fragment, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ChevronDown, ExternalLink, Sparkles } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel, money } from '../lib/format'
import { leadPath } from '../lib/links'
import { Avatar } from '../ui/Avatar'
import { Pill } from '../ui/Pill'
import { useToast } from '../ui/Toast'
import { InlineSelect } from '../leads/InlineSelect'
import { useLeadChanged } from '../leads/leadData'
import { amount, dayOf, followUp } from '../leads/leadLogic'
import { aiSignal, dueIn } from '../leads/listLogic'
import { ContactLinks } from '../leads/parts'
import { dueInLabel, dueInTone, sourceLabel } from '../leads/leadWords'
import { dealItem, FULFILMENT, fulfilmentProgress, isFulfilment, nextFulfilment, stillOwed, type DealColumn, type DealRow } from './dealLogic'
import { fulfilmentLabel, paymentLabel, paymentTone } from './dealWords'

/**
 * The deals as a list: on a wide screen a row per deal under a header row — who, what it is for, the amount (and what
 * was paid), the payment (a press opens it), the fulfilment step (changed in place, or moved on one step) with its
 * progress, the next step, its day and the owner — and a row that opens for the money and the notes; on a phone a card.
 */
export function DealList({ deals, columns, onPay }: { deals: DealRow[]; columns: Record<DealColumn, boolean>; onPay: (deal: DealRow) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const step = useStep()
  const span = 2 + (['product_details', 'amount', 'payment', 'fulfillment', 'next_action', 'due_date', 'owner'] as const).filter(c => columns[c]).length
  const name = (deal: DealRow) => deal.guest?.full_name || deal.guest?.email || t('crm.common.no_name', 'No name')
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-a-border text-left text-xs font-medium text-a-text-2">
              <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">{t('crm.deals.col_deal', 'Deal')}</th>
              {columns.product_details && <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">{t('crm.deals.col_item', 'What it is for')}</th>}
              {columns.amount && <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('crm.deals.col_amount', 'Amount')}</th>}
              {columns.payment && <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.deals.col_payment', 'Payment')}</th>}
              {columns.fulfillment && <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.deals.col_step', 'Step')}</th>}
              {columns.next_action && <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">{t('crm.deals.col_next', 'Next step')}</th>}
              {columns.due_date && <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">{t('crm.deals.col_due', 'Due')}</th>}
              {columns.owner && <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">{t('crm.deals.col_owner', 'Owner')}</th>}
              <th scope="col" className="w-12 py-2.5 pr-3"><span className="sr-only">{t('crm.deals.more', 'More')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-a-border">
            {deals.map(deal => {
              const isOpen = open === deal.id
              return (
                <Fragment key={deal.id}>
                  <WideRow deal={deal} name={name(deal)} columns={columns} onPay={() => onPay(deal)} step={step} expanded={isOpen} onExpand={() => setOpen(isOpen ? null : deal.id)} />
                  {isOpen && <tr className="bg-a-surface-2/40"><td colSpan={span} className="px-4 pb-4 pt-1"><DealPeek deal={deal} name={name(deal)} /></td></tr>}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-a-border md:hidden">
        {deals.map(deal => <PhoneCard key={deal.id} deal={deal} name={name(deal)} onPay={() => onPay(deal)} step={step} />)}
      </ul>
    </>
  )
}

/** Change a deal's fulfilment step (`PATCH deals/{id}/stage`). */
function useStep() {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const stage = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) => send('patch', `deals/${id}/stage`, { stage: next }),
    onSuccess: (_r, { next }) => { changed(); toast(t('crm.deals.deal_moved', 'Now: {{step}}', { step: fulfilmentLabel(t, next) })) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  return { set: (id: number, next: string) => stage.mutate({ id, next }), busy: (id: number) => stage.isPending && stage.variables?.id === id }
}

type Step = ReturnType<typeof useStep>

function Progress({ stage }: { stage: string | null }) {
  const { t } = useTranslation()
  const progress = fulfilmentProgress(stage)
  return (
    <span className="mt-1.5 flex gap-1" role="img" aria-label={t('crm.deals.progress', '{{done}} of {{total}} steps done', { done: progress.done, total: progress.total })}>
      {Array.from({ length: progress.total }, (_, i) => <span key={i} className={`h-1.5 w-6 rounded-full ${i < progress.done ? 'bg-a-st-confirmed' : 'bg-a-surface-2'}`} />)}
    </span>
  )
}

function StepControl({ deal, name, step }: { deal: DealRow; name: string; step: Step }) {
  const { t } = useTranslation()
  const next = nextFulfilment(deal.fulfillment_stage)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="flex items-center">
        <span className="sr-only">{t('crm.deals.step_of', 'The step of {{name}}', { name })}</span>
        <InlineSelect value={isFulfilment(deal.fulfillment_stage) ? deal.fulfillment_stage : ''} disabled={step.busy(deal.id)}
          onChange={e => { if (e.target.value) step.set(deal.id, e.target.value) }}>
          {!isFulfilment(deal.fulfillment_stage) && <option value="" disabled>{fulfilmentLabel(t, null)}</option>}
          {FULFILMENT.map(s => <option key={s} value={s}>{fulfilmentLabel(t, s)}</option>)}
        </InlineSelect>
      </label>
      {next && (
        <button type="button" onClick={() => step.set(deal.id, next)} disabled={step.busy(deal.id)}
          title={t('crm.deals.step_next', 'Move on to {{step}}', { step: fulfilmentLabel(t, next) })}
          aria-label={t('crm.deals.step_next_named', 'Move {{name}} on to {{step}}', { name, step: fulfilmentLabel(t, next) })}
          className="grid h-9 w-9 place-items-center rounded-full border border-a-border text-a-text-2 hover:border-a-accent/40 hover:text-a-accent-text disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-a-accent">
          <ArrowRight size={15} aria-hidden />
        </button>
      )}
    </div>
  )
}

function PayButton({ deal, name, onPay }: { deal: DealRow; name: string; onPay: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onPay} className="inline-flex min-h-8 items-center gap-1 rounded-full focus-visible:outline-2 focus-visible:outline-a-accent"
      aria-label={t('crm.deals.pay_change', 'Change the payment for {{name}}', { name })}>
      <Pill tone={paymentTone(deal.payment_status)}>{paymentLabel(t, deal.payment_status)}</Pill>
      <ChevronDown size={13} aria-hidden className="text-a-text-2" />
    </button>
  )
}

function NextStep({ deal, lang }: { deal: DealRow; lang: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const next = followUp(deal, boot.venue.today)
  if (!next) return <span className="text-xs text-a-text-2">{deal.next_task_completed && deal.next_task_type ? t('crm.deals.next_done', 'Done') : '—'}</span>
  const due = dueIn(next.day, boot.venue.today)
  const tone = dueInTone(due)
  return (
    <span className="block min-w-0">
      <span className="block truncate text-sm text-a-text">{next.type ?? t('crm.deals.next_untitled', 'Follow up')}</span>
      {due && <span className={`block text-xs ${tone === 'danger' ? 'font-medium text-a-danger' : tone === 'pending' ? 'font-medium text-a-st-pending' : 'text-a-text-2'}`}>{dueInLabel(t, due, lang)}</span>}
    </span>
  )
}

function WideRow({ deal, name, columns, onPay, step, expanded, onExpand }: {
  deal: DealRow
  name: string
  columns: Record<DealColumn, boolean>
  onPay: () => void
  step: Step
  expanded: boolean
  onExpand: () => void
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const value = amount(deal.total_value)
  const paid = amount(deal.paid_amount)
  const owed = stillOwed(deal.total_value, deal.paid_amount)
  const late = dueIn(deal.next_task_completed ? null : deal.next_task_due, boot.venue.today)?.state === 'late'
  const item = dealItem(deal)
  return (
    <tr className={`align-top transition-colors hover:bg-a-surface-2/60 ${step.busy(deal.id) ? 'opacity-60' : ''}`}>
      <td className="py-3 pl-4 pr-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={name} />
          <div className="min-w-0">
            <Link to={leadPath(deal.id)} className="block truncate font-medium text-a-text hover:underline">{name}</Link>
            {deal.guest?.company && <p className="truncate text-xs text-a-text-2">{deal.guest.company}</p>}
            <p className="truncate text-xs text-a-text-2">{[deal.guest?.email, deal.guest?.phone || deal.guest?.mobile].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      </td>
      {columns.product_details && (
        <td className="hidden max-w-48 px-3 py-3 xl:table-cell">
          <span className="block truncate text-sm text-a-text">{item ?? '—'}</span>
          {((deal.num_rooms ?? 0) > 1 || (deal.event_pax ?? 0) > 0) && (
            <span className="block text-xs text-a-text-2">{(deal.num_rooms ?? 0) > 1 ? t('crm.deals.rooms', '{{count}} rooms', { count: deal.num_rooms ?? 0 }) : t('crm.deals.people', '{{count}} people', { count: deal.event_pax ?? 0 })}</span>
          )}
        </td>
      )}
      {columns.amount && (
        <td className="px-3 py-3 text-right tabular-nums">
          <span className="block font-medium text-a-text">{money(value, boot.venue.currency, lang)}</span>
          {paid !== null && paid > 0 && deal.payment_status !== 'paid' && <span className="block text-xs text-a-text-2">{t('crm.deals.paid_short', '{{amount}} paid', { amount: money(paid, boot.venue.currency, lang) })}</span>}
          {owed !== null && owed > 0 && paid !== null && deal.payment_status !== 'paid' && <span className="block text-xs font-medium text-a-st-pending">{t('crm.deals.owed', '{{amount}} still to pay', { amount: money(owed, boot.venue.currency, lang) })}</span>}
        </td>
      )}
      {columns.payment && <td className="px-3 py-3"><PayButton deal={deal} name={name} onPay={onPay} /></td>}
      {columns.fulfillment && (
        <td className="px-3 py-3">
          <StepControl deal={deal} name={name} step={step} />
          <Progress stage={deal.fulfillment_stage} />
        </td>
      )}
      {columns.next_action && <td className="hidden max-w-44 px-3 py-3 lg:table-cell"><NextStep deal={deal} lang={lang} /></td>}
      {columns.due_date && (
        <td className={`hidden whitespace-nowrap px-3 py-3 text-xs xl:table-cell ${late ? 'font-medium text-a-danger' : 'text-a-text-2'}`}>
          {deal.next_task_due && !deal.next_task_completed ? dayLabel(dayOf(deal.next_task_due), lang) : '—'}
        </td>
      )}
      {columns.owner && (
        <td className="hidden max-w-36 px-3 py-3 lg:table-cell">
          <span className={`block truncate text-sm ${deal.assigned_to ? 'text-a-text' : 'font-medium text-a-st-pending'}`}>{deal.assigned_to || t('crm.deals.owner_none', 'Nobody yet')}</span>
        </td>
      )}
      <td className="py-2 pr-3">
        <button type="button" onClick={onExpand} aria-expanded={expanded}
          aria-label={expanded ? t('crm.deals.peek_close', 'Show less about {{name}}', { name }) : t('crm.deals.peek_open', 'Show more about {{name}}', { name })}
          className="grid h-9 w-9 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent">
          <ChevronDown size={16} aria-hidden className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </td>
    </tr>
  )
}

/** A deal opened: the money (value, paid, still to pay), what it is for, its step and source, the next step and notes. */
function DealPeek({ deal, name }: { deal: DealRow; name: string }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const cur = boot.venue.currency
  const owed = stillOwed(deal.total_value, deal.paid_amount)
  const ai = aiSignal(deal)
  return (
    <div className="grid gap-3 rounded-xl border border-a-border bg-a-surface p-3 animate-a-fade md:grid-cols-3">
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Money label={t('crm.deals.total', 'Deal value')} value={money(amount(deal.total_value), cur, lang)} />
          <Money label={t('crm.deals.paid', 'Paid')} value={money(amount(deal.paid_amount) ?? 0, cur, lang)} tone="success" />
          <Money label={t('crm.deals.balance', 'Still to pay')} value={owed === null ? '—' : money(owed, cur, lang)} tone={owed ? 'pending' : undefined} />
        </div>
        <p className="text-sm text-a-text-2">
          {[dealItem(deal), deal.property?.name, sourceLabel(t, deal.source)].filter(Boolean).join(' · ')}
        </p>
        {deal.fulfillment_started_at && <p className="text-xs text-a-text-2">{t('crm.deals.started', 'Started {{when}}', { when: dateTime(deal.fulfillment_started_at, lang, boot.venue.timezone) })}</p>}
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold text-a-text-2">{t('crm.deals.col_next', 'Next step')}</p>
        <p className="text-sm text-a-text">{deal.next_task_type && !deal.next_task_completed ? deal.next_task_type : t('crm.deals.no_next', 'Nothing planned. Open the deal to add a step.')}</p>
        {deal.next_task_notes && !deal.next_task_completed && <p className="mt-0.5 line-clamp-3 text-sm text-a-text-2">{deal.next_task_notes}</p>}
        {deal.notes && <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-a-text">{deal.notes}</p>}
        {ai?.action && <p className="mt-2 text-sm"><span className="crm-ai-text inline-flex items-center gap-1 font-medium"><Sparkles size={13} aria-hidden />{t('crm.deals.ai_next', 'AI:')}</span> <span className="text-a-text">{ai.action}</span></p>}
      </div>
      <div className="min-w-0 space-y-2 text-sm">
        <p className="text-xs font-semibold text-a-text-2">{t('crm.deals.customer', 'Customer')}</p>
        <ContactLinks guest={deal.guest} name={name} />
        <Link to={leadPath(deal.id)} className="inline-flex items-center gap-1 font-medium text-a-accent-text hover:underline">{t('crm.deals.open', 'Open the deal')}<ExternalLink size={13} aria-hidden /></Link>
      </div>
    </div>
  )
}

function Money({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'pending' }) {
  return (
    <div className="min-w-0 rounded-lg border border-a-border bg-a-surface-2/50 p-2">
      <p className="truncate text-xs text-a-text-2">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${tone === 'success' ? 'text-a-st-confirmed' : tone === 'pending' ? 'text-a-st-pending' : 'text-a-text'}`}>{value}</p>
    </div>
  )
}

function PhoneCard({ deal, name, onPay, step }: { deal: DealRow; name: string; onPay: () => void; step: Step }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const owed = stillOwed(deal.total_value, deal.paid_amount)
  return (
    <li className={`space-y-2 px-4 py-3 ${step.busy(deal.id) ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={leadPath(deal.id)} className="block truncate text-sm font-medium text-a-text hover:underline">{name}</Link>
          <p className="truncate text-xs text-a-text-2">{[deal.guest?.company, dealItem(deal)].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="shrink-0 text-right text-sm font-medium tabular-nums text-a-text">{money(amount(deal.total_value), boot.venue.currency, lang)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PayButton deal={deal} name={name} onPay={onPay} />
        {owed !== null && owed > 0 && amount(deal.paid_amount) !== null && deal.payment_status !== 'paid' && (
          <span className="text-xs font-medium text-a-st-pending">{t('crm.deals.owed', '{{amount}} still to pay', { amount: money(owed, boot.venue.currency, lang) })}</span>
        )}
      </div>
      <div>
        <StepControl deal={deal} name={name} step={step} />
        <Progress stage={deal.fulfillment_stage} />
      </div>
      <NextStep deal={deal} lang={lang} />
    </li>
  )
}
