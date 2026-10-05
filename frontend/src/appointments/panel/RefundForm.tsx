import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { money as fmt } from '../../lib/money'
import type { AppointmentDetail, RefundVia } from '../lib/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { METHOD_FALLBACK, refundMax, refundWays } from './moneyLines'
import type { PanelError } from './panelState'

const control = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Managers: money back one way at a time, with a reason. A desk refund can
 * instead correct a wrong entry: the money is then owed again (a goodwill
 * refund never re-opens it).
 */
export function RefundForm({ booking, saving, error, onSave, onBack }: {
  booking: AppointmentDetail; saving: boolean; error: PanelError | null
  onSave: (body: { amount: number; via: RefundVia; reason: string; corrects?: boolean }) => void; onBack: () => void
}) {
  const { t } = useTranslation()
  const m = booking.money!
  const ways = refundWays(m)
  const [via, setVia] = useState<RefundVia>(ways[0] ?? 'cash')
  const [corrects, setCorrects] = useState(false)
  const correctable = via !== 'online_card' && (m.correctable_desk ?? 0) > 0
  const limit = (v: RefundVia, c: boolean) => (c && v !== 'online_card' ? Math.min(refundMax(m, v), m.correctable_desk ?? 0) : refundMax(m, v))
  const max = limit(via, corrects && correctable)
  const [amount, setAmount] = useState(String(max))
  const [reason, setReason] = useState('')
  const value = Number(amount)
  const ready = ways.includes(via) && value > 0 && value <= max + 0.004 && reason.trim() !== ''

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready && !saving) onSave({ amount: value, via, reason: reason.trim(), ...(corrects && correctable ? { corrects: true } : {}) }) }}>
      <div className="text-base font-semibold text-a-text">{t('appointments.money.refund', 'Refund')}</div>
      <Field label={t('appointments.money.how', 'How')}>
        <select className={control} value={via} onChange={(e) => { const v = e.target.value as RefundVia; setVia(v); setAmount(String(limit(v, corrects))) }}>
          {ways.map(w => <option key={w} value={w}>{t(`appointments.money.method.${w}`, METHOD_FALLBACK[w])}</option>)}
        </select>
      </Field>
      {correctable && (
        <label className="flex items-center gap-2 text-sm text-a-text">
          <input type="checkbox" checked={corrects} onChange={(e) => { setCorrects(e.target.checked); setAmount(String(limit(via, e.target.checked))) }} />
          {t('appointments.money.corrects', 'Entered by mistake — the client still owes this')}
        </label>
      )}
      <Field label={t('appointments.money.amount', 'Amount')} hint={t('appointments.money.max', 'At most {{amount}}', { amount: fmt(max, m.currency) })}>
        <input type="number" inputMode="decimal" step="0.01" min="0.01" max={max} className={control} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t('appointments.money.reason', 'Reason')}>
        <input className={control} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <Notice tone="danger">{t(`appointments.error.${error.code}`, error.message)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={!ready} loading={saving}>{t('appointments.money.save_refund', 'Refund {{amount}}', { amount: fmt(value > 0 ? value : 0, m.currency) })}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onBack}>{t('appointments.common.back', 'Back')}</Button>
      </div>
    </form>
  )
}
