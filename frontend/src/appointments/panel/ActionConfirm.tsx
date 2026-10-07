import { useTranslation } from 'react-i18next'
import type { ActionInfo, ActionKey, AppointmentDetail } from '../lib/types'
import { timeOf } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { money as fmt } from '../../lib/money'
import { consequenceLines } from './consequences'
import { DESK_METHODS, METHOD_FALLBACK } from './moneyLines'
import type { CancelRefunds, PanelError } from './panelState'
import { TellClient } from './TellClient'

interface Props {
  booking: AppointmentDetail
  action: ActionInfo
  reason: string
  saving: boolean
  error: PanelError | null
  /** "Tell the client by email" — asked on confirm and cancel only (Part D). */
  tell: boolean
  onTell: (tell: boolean) => void
  /** Part E: the refund lines a manager fills while cancelling; staff are told a manager can refund. */
  canManage?: boolean
  refunds?: CancelRefunds
  onRefunds?: (r: CancelRefunds) => void
  onReason: (reason: string) => void
  onConfirm: () => void
  onBack: () => void
}

const TITLE: Partial<Record<ActionKey, [string, string]>> = {
  confirm:            ['appointments.action.confirm', 'Confirm'],
  complete:           ['appointments.action.complete', 'Complete'],
  no_show:            ['appointments.action.no_show', 'No-show'],
  cancel:             ['appointments.action.cancel', 'Cancel appointment'],
  reopen:             ['appointments.action.reopen', 'Reopen'],
}

/** What this action will really do, stated before the button that does it. */
export function ActionConfirm({ booking, action, reason, saving, error, tell, onTell, canManage = false, refunds, onRefunds, onReason, onConfirm, onBack }: Props) {
  const { t } = useTranslation()
  const [key, fallback] = TITLE[action.key] ?? ['appointments.action.confirm', 'Confirm']
  const label = t(key, fallback)
  const destructive = action.key === 'cancel' || action.key === 'no_show'
  // Part H: a booking-page deposit follows its own rule (the line above); staff are told only of the rest a manager can refund.
  const staffDue = booking.money ? (action.consequences.deposit ? 0 : booking.money.refundable_online) + booking.money.refundable_desk : 0

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-semibold text-a-text">{label}</div>
        <div className="text-sm text-a-text-2">{booking.client.name} · {timeOf(booking.start)} – {timeOf(booking.end)}</div>
      </div>

      <ul className="space-y-2">
        {consequenceLines(action).map(line => (
          <li key={line.key}>
            {line.tone === 'warning'
              ? <Notice tone="warning">{t(line.key, line.fallback, line.vars)}</Notice>
              : <p className="text-sm text-a-text">{t(line.key, line.fallback, line.vars)}</p>}
          </li>
        ))}
      </ul>

      {action.key === 'cancel' && (
        <Field label={t('appointments.panel.reason', 'Reason')}>
          <textarea className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" rows={2} maxLength={255} value={reason} onChange={(e) => onReason(e.target.value)} />
        </Field>
      )}

      {action.key === 'cancel' && booking.money && (booking.money.refundable_online > 0 || booking.money.refundable_desk > 0) && (
        canManage && refunds && onRefunds ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-a-text">{t('appointments.money.cancel_title', 'Money back')}</legend>
            {booking.money.refundable_online > 0 && (
              <Field label={t('appointments.money.cancel_online', 'Refund the card (through Stripe)')}>
                <input type="number" step="0.01" min="0" max={booking.money.refundable_online} className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text"
                  value={refunds.online} onChange={(e) => onRefunds({ ...refunds, online: e.target.value })} />
              </Field>
            )}
            {booking.money.refundable_desk > 0 && (
              <Field label={t('appointments.money.cancel_desk', 'Give back at the desk')}>
                <div className="flex gap-2">
                  <input type="number" step="0.01" min="0" max={booking.money.refundable_desk} className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text"
                    value={refunds.desk} onChange={(e) => onRefunds({ ...refunds, desk: e.target.value })} />
                  <select className="rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" value={refunds.deskMethod} onChange={(e) => onRefunds({ ...refunds, deskMethod: e.target.value as CancelRefunds['deskMethod'] })}>
                    {DESK_METHODS.map(m => <option key={m} value={m}>{t(`appointments.money.method.${m}`, METHOD_FALLBACK[m])}</option>)}
                  </select>
                </div>
              </Field>
            )}
          </fieldset>
        ) : (
          staffDue > 0 && <p className="text-sm text-a-text">{t('appointments.money.cancel_staff', '{{amount}} was paid — a manager can refund it.', { amount: fmt(staffDue, booking.money.currency) })}</p>
        )
      )}

      {/* The server says which actions may tell the client (R8): confirm, cancel, and reopening a cancellation. */}
      {action.consequences.message === 'ask' && <TellClient email={booking.client_email ?? null} checked={tell} onChange={onTell} />}

      {/* Reopen has no time to choose: a taken time means booking the client again (polish F4). */}
      {error && <Notice tone="danger">{action.key === 'reopen' && error.code === 'slot_taken'
        ? t('appointments.error.reopen_slot_taken', 'That time is taken now — book the client again at another time.')
        : t(`appointments.error.${error.code}`, error.message)}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={destructive ? 'danger' : 'primary'} loading={saving} onClick={onConfirm}>{label}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onBack}>{t('appointments.common.back', 'Back')}</Button>
      </div>
    </div>
  )
}
