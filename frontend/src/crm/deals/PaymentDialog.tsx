import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BadgeCheck } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { money } from '../lib/format'
import { Select, TextInput } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { useLeadChanged } from '../leads/leadData'
import { amount } from '../leads/leadLogic'
import { paidInFullBody, paymentBody, PAYMENTS, stillOwed, type DealRow } from './dealLogic'
import { paymentLabel } from './dealWords'

/**
 * A deal's payment (`PATCH deals/{id}/payment`): its state and what was paid so far, with what is still owed as it is
 * typed; "Paid in full" in one press.
 */
export function PaymentDialog({ deal, onClose }: { deal: DealRow; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const [status, setStatus] = useState<string>(deal.payment_status ?? 'pending')
  const [paid, setPaid] = useState(amount(deal.paid_amount) === null ? '' : String(amount(deal.paid_amount)))
  const body = paymentBody(status, paid)
  const total = amount(deal.total_value)
  const owed = stillOwed(deal.total_value, paid.replace(',', '.'))
  const cur = boot.venue.currency
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => send('patch', `deals/${deal.id}/payment`, payload),
    onSuccess: () => { changed(); toast(t('crm.common.saved', 'Saved')); onClose() },
  })
  const name = deal.guest?.full_name || deal.guest?.email || t('crm.common.no_name', 'No name')
  return (
    <Dialog title={t('crm.deals.pay_title_named', 'Payment for {{name}}', { name })} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (body) save.mutate(body) }}>
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-a-border bg-a-surface-2/50 p-3">
          <div><dt className="text-xs text-a-text-2">{t('crm.deals.total', 'Deal value')}</dt><dd className="font-a-display text-xl text-a-text">{money(total, cur, i18n.language)}</dd></div>
          <div><dt className="text-xs text-a-text-2">{t('crm.deals.balance', 'Still to pay')}</dt><dd className={`font-a-display text-xl ${owed ? 'text-a-st-pending' : 'text-a-st-confirmed'}`}>{owed === null ? '—' : money(owed, cur, i18n.language)}</dd></div>
        </dl>
        <Field label={t('crm.deals.pay_status', 'State')}>
          <Select value={status} onChange={e => setStatus(e.target.value)}>
            {PAYMENTS.map(p => <option key={p} value={p}>{paymentLabel(t, p)}</option>)}
          </Select>
        </Field>
        <Field label={t('crm.deals.pay_amount', 'Paid so far ({{currency}})', { currency: cur })}>
          <TextInput type="number" inputMode="decimal" min={0} step="0.01" value={paid} onChange={e => setPaid(e.target.value)} aria-invalid={!body ? true : undefined} />
          {!body && <span className="mt-1 block text-xs text-a-danger">{t('crm.deals.pay_invalid', 'Enter an amount of zero or more.')}</span>}
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {total !== null && deal.payment_status !== 'paid' && (
            <Button variant="ghost" type="button" className="mr-auto" onClick={() => save.mutate(paidInFullBody(deal.total_value))} disabled={save.isPending}>
              <BadgeCheck size={15} aria-hidden />{t('crm.deals.pay_full', 'Paid in full')}
            </Button>
          )}
          <Button variant="secondary" type="button" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={save.isPending} disabled={!body}>{t('crm.common.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
