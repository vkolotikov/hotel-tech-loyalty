import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppointmentDetail, DeskMethod } from '../lib/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { DESK_METHODS, METHOD_FALLBACK } from './moneyLines'
import type { PanelError } from './panelState'

const control = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/** Money taken at the desk: the amount starts at what is owed; "other" needs a note. */
export function TakePaymentForm({ booking, saving, error, onSave, onBack }: {
  booking: AppointmentDetail; saving: boolean; error: PanelError | null
  onSave: (body: { amount: number; method: DeskMethod; note?: string }) => void; onBack: () => void
}) {
  const { t } = useTranslation()
  const owed = booking.money?.owed ?? 0
  const [amount, setAmount] = useState(String(owed))
  const [method, setMethod] = useState<DeskMethod>('cash')
  const [note, setNote] = useState('')
  const value = Number(amount)
  const ready = value > 0 && value <= owed + 0.004 && (method !== 'other' || note.trim() !== '')

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready && !saving) onSave({ amount: value, method, ...(note.trim() ? { note: note.trim() } : {}) }) }}>
      <div className="text-base font-semibold text-a-text">{t('appointments.money.take', 'Take payment')}</div>
      <Field label={t('appointments.money.amount', 'Amount')}>
        <input type="number" inputMode="decimal" step="0.01" min="0.01" max={owed} className={control} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t('appointments.money.how', 'How')}>
        <select className={control} value={method} onChange={(e) => setMethod(e.target.value as DeskMethod)}>
          {DESK_METHODS.map(m => <option key={m} value={m}>{t(`appointments.money.method.${m}`, METHOD_FALLBACK[m])}</option>)}
        </select>
      </Field>
      <Field label={t('appointments.money.note', 'Note')}>
        <input className={control} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <Notice tone="danger">{t(`appointments.error.${error.code}`, error.message)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ready} loading={saving}>{t('appointments.money.save_payment', 'Record payment')}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onBack}>{t('appointments.common.back', 'Back')}</Button>
      </div>
    </form>
  )
}
