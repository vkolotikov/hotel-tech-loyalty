import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Check, CreditCard } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, money } from '../lib/format'
import { Card } from '../ui/Card'
import { useToast } from '../ui/Toast'
import { FULFILMENT, fulfilmentProgress, isFulfilment, nextFulfilment, paidInFullBody, stillOwed } from '../deals/dealLogic'
import { fulfilmentLabel } from '../deals/dealWords'
import { PayPill } from '../deals/DealStep'
import { useStep } from '../deals/useStep'
import { PaymentDialog } from '../deals/PaymentDialog'
import { useLeadChanged } from './leadData'
import { amount } from './leadLogic'
import { dealOf } from './recordLogic'
import type { LeadDetail } from './leadTypes'

/**
 * The Deal tab of a won lead (round 5; what Deals' row and its "Show more" held): its fulfilment steps — a press sets
 * one (`PATCH deals/{id}/stage`), "Move on" takes the next — and its payment: the value, what was paid and what is
 * still owed, the payment's state (`PATCH deals/{id}/payment`) and "Paid in full" in one press.
 */
export function DealTab({ lead }: { lead: LeadDetail }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const toast = useToast()
  const changed = useLeadChanged()
  const step = useStep()
  const [paying, setPaying] = useState(false)
  const deal = dealOf(lead)
  const name = lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
  const current = isFulfilment(deal.fulfillment_stage) ? deal.fulfillment_stage : null
  const at = current ? FULFILMENT.indexOf(current) : -1
  const next = nextFulfilment(deal.fulfillment_stage)
  const progress = fulfilmentProgress(deal.fulfillment_stage)
  const cur = boot.venue.currency
  const value = amount(deal.total_value)
  const paid = amount(deal.paid_amount) ?? 0
  const owed = stillOwed(deal.total_value, deal.paid_amount)
  const full = useMutation({
    mutationFn: () => send('patch', `deals/${deal.id}/payment`, paidInFullBody(deal.total_value)),
    onSuccess: () => { changed(); toast(t('crm.common.saved', 'Saved')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const busy = step.busy(deal.id)

  return (
    <div className="space-y-4">
      <Card title={t('crm.deals.col_step', 'Step')} icon={BriefcaseBusiness} tone="progress"
        hint={t('crm.deals.progress', '{{done}} of {{total}} steps done', { done: progress.done, total: progress.total })}
        action={next ? (
          <Button size="sm" onClick={() => step.set(deal.id, next)} loading={busy}
            aria-label={t('crm.deals.step_next_named', 'Move {{name}} on to {{step}}', { name, step: fulfilmentLabel(t, next) })}>
            <ArrowRight size={14} aria-hidden />{fulfilmentLabel(t, next)}
          </Button>
        ) : undefined}>
        <ol aria-label={t('crm.deals.steps', 'Steps')} className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {FULFILMENT.map((s, i) => {
            const state = i < at || current === 'completed' ? 'done' : i === at ? 'current' : 'next'
            return (
              <li key={s} className="min-w-0">
                <button type="button" disabled={busy || s === current} onClick={() => step.set(deal.id, s)} aria-current={state === 'current' ? 'step' : undefined}
                  aria-label={state === 'current' ? t('crm.deals.step_here', '{{step}}, where the deal is', { step: fulfilmentLabel(t, s) }) : t('crm.deals.step_set', 'Set the step: {{step}}', { step: fulfilmentLabel(t, s) })}
                  className="group block w-full min-w-0 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-default">
                  <span aria-hidden className={`block h-1.5 rounded-full transition-colors ${state === 'next' ? 'bg-a-surface-2 group-hover:bg-a-accent/30' : state === 'done' && current === 'completed' ? 'bg-a-st-confirmed' : 'bg-a-accent'}`} />
                  <span aria-hidden className={`mt-1 flex items-center gap-1 truncate text-xs ${state === 'current' ? 'font-semibold text-a-text' : 'text-a-text-2'}`}>
                    {state === 'done' && <Check size={11} className="shrink-0" />}
                    <span className="truncate">{fulfilmentLabel(t, s)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        {(deal.fulfillment_started_at || deal.fulfillment_completed_at) && (
          <p className="mt-3 text-xs text-a-text-2">
            {[
              deal.fulfillment_started_at ? t('crm.deals.started', 'Started {{when}}', { when: dateTime(deal.fulfillment_started_at, lang, boot.venue.timezone) }) : null,
              deal.fulfillment_completed_at ? t('crm.deals.completed_at', 'Completed {{when}}', { when: dateTime(deal.fulfillment_completed_at, lang, boot.venue.timezone) }) : null,
            ].filter(Boolean).join(' · ')}
          </p>
        )}
      </Card>

      <Card title={t('crm.deals.col_payment', 'Payment')} icon={CreditCard} tone={owed ? 'pending' : 'success'}
        action={<PayPill deal={deal} name={name} onPay={() => setPaying(true)} />}>
        <dl className="grid grid-cols-3 gap-2">
          <Money label={t('crm.deals.total', 'Deal value')} value={money(value, cur, lang)} />
          <Money label={t('crm.deals.paid', 'Paid')} value={money(paid, cur, lang)} tone="success" />
          <Money label={t('crm.deals.balance', 'Still to pay')} value={owed === null ? '—' : money(owed, cur, lang)} tone={owed ? 'pending' : undefined} />
        </dl>
        {value !== null && deal.payment_status !== 'paid' && (
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => full.mutate()} loading={full.isPending}><BadgeCheck size={14} aria-hidden />{t('crm.deals.pay_full', 'Paid in full')}</Button>
          </div>
        )}
      </Card>

      <Link to="/crm/deals" className="inline-flex items-center gap-1 text-sm font-medium text-a-accent-text hover:underline">
        {t('crm.deals.all', 'All deals')}<ArrowRight size={13} aria-hidden />
      </Link>
      {paying && <PaymentDialog deal={deal} onClose={() => setPaying(false)} />}
    </div>
  )
}

function Money({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'pending' }) {
  return (
    <div className="min-w-0 rounded-xl border border-a-border bg-a-surface-2/50 p-2.5">
      <dt className="truncate text-xs text-a-text-2">{label}</dt>
      <dd className={`mt-0.5 truncate font-a-display text-lg tabular-nums ${tone === 'success' ? 'text-a-st-confirmed' : tone === 'pending' ? 'text-a-st-pending' : 'text-a-text'}`}>{value}</dd>
    </div>
  )
}
