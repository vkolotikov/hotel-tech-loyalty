import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { ActionMenu, type MenuItem } from '../ui/Menu'
import { Pill } from '../ui/Pill'
import { TONE_CHIP } from '../ui/tones'
import { useToast } from '../ui/Toast'
import { useLeadChanged } from '../leads/leadData'
import { FULFILMENT, fulfilmentProgress, isFulfilment, nextFulfilment, type DealRow } from './dealLogic'
import { fulfilmentLabel, fulfilmentTone, paymentLabel, paymentTone } from './dealWords'

/** Change a deal's fulfilment step (`PATCH deals/{id}/stage`). */
export function useStep() {
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

export type Step = ReturnType<typeof useStep>

/**
 * A deal's step in one compact control (round 5, owner 2026-11-12: "takes much less room"): its step as a pill that
 * opens the steps — "Move on to …" first, then every step, the current one ticked — over a slim bar of how far it is.
 */
export function DealStep({ deal, name, step, wide = false }: { deal: DealRow; name: string; step: Step; wide?: boolean }) {
  const { t } = useTranslation()
  const current = isFulfilment(deal.fulfillment_stage) ? deal.fulfillment_stage : null
  const next = nextFulfilment(deal.fulfillment_stage)
  const progress = fulfilmentProgress(deal.fulfillment_stage)
  const items: (MenuItem | 'divider' | { heading: string })[] = [
    ...(next ? [{ key: 'next', label: t('crm.deals.step_next', 'Move on to {{step}}', { step: fulfilmentLabel(t, next) }), icon: ArrowRight, onSelect: () => step.set(deal.id, next) }, 'divider' as const] : []),
    ...FULFILMENT.map(s => ({ key: s, label: fulfilmentLabel(t, s), checked: s === current, onSelect: () => { if (s !== current) step.set(deal.id, s) } })),
  ]
  const tone = fulfilmentTone(current)
  return (
    <div className={`min-w-0 ${wide ? 'w-full' : 'w-36 max-w-full'}`}>
      <ActionMenu label={t('crm.deals.step_named', 'The step of {{name}}: {{step}}', { name, step: fulfilmentLabel(t, current) })} items={items} align="left"
        className={`inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-2 pr-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-50 ${TONE_CHIP[tone]}`}
        button={<>{current === 'completed' && <Check size={12} aria-hidden />}<span className="truncate">{fulfilmentLabel(t, current)}</span><ChevronDown size={12} aria-hidden className="shrink-0" /></>} />
      <span role="img" aria-label={t('crm.deals.progress', '{{done}} of {{total}} steps done', { done: progress.done, total: progress.total })}
        className={`mt-1.5 block h-1 overflow-hidden rounded-full bg-a-surface-2 ${step.busy(deal.id) ? 'animate-pulse' : ''}`}>
        <span className={`block h-full rounded-full ${progress.done >= progress.total ? 'bg-a-st-confirmed' : 'bg-a-accent'}`} style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
      </span>
    </div>
  )
}

/** A deal's payment as a pill; a press opens the payment. */
export function PayPill({ deal, name, onPay }: { deal: DealRow; name: string; onPay: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onPay} className="inline-flex min-h-8 items-center gap-1 rounded-full focus-visible:outline-2 focus-visible:outline-a-accent"
      aria-label={t('crm.deals.pay_change', 'Change the payment for {{name}}', { name })} title={t('crm.deals.pay_change', 'Change the payment for {{name}}', { name })}>
      <Pill tone={paymentTone(deal.payment_status)}>{paymentLabel(t, deal.payment_status)}</Pill>
      <ChevronDown size={13} aria-hidden className="text-a-text-2" />
    </button>
  )
}
