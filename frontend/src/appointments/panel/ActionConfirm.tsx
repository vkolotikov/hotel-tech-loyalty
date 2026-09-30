import { useTranslation } from 'react-i18next'
import type { ActionInfo, ActionKey, AppointmentDetail } from '../lib/types'
import { timeOf } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { consequenceLines } from './consequences'
import type { PanelError } from './panelState'

interface Props {
  booking: AppointmentDetail
  action: ActionInfo
  reason: string
  saving: boolean
  error: PanelError | null
  onReason: (reason: string) => void
  onConfirm: () => void
  onBack: () => void
}

const TITLE: Partial<Record<ActionKey, [string, string]>> = {
  confirm:            ['appointments.action.confirm', 'Confirm'],
  complete:           ['appointments.action.complete', 'Complete'],
  no_show:            ['appointments.action.no_show', 'No-show'],
  cancel:             ['appointments.action.cancel', 'Cancel appointment'],
  mark_paid_at_venue: ['appointments.action.mark_paid_at_venue', 'Mark paid at venue'],
}

/** What this action will really do, stated before the button that does it. */
export function ActionConfirm({ booking, action, reason, saving, error, onReason, onConfirm, onBack }: Props) {
  const { t } = useTranslation()
  const [key, fallback] = TITLE[action.key] ?? ['appointments.action.confirm', 'Confirm']
  const label = t(key, fallback)
  const destructive = action.key === 'cancel' || action.key === 'no_show'

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

      {error && <Notice tone="danger">{t(`appointments.error.${error.code}`, error.message)}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={destructive ? 'danger' : 'primary'} loading={saving} onClick={onConfirm}>{label}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onBack}>{t('appointments.common.back', 'Back')}</Button>
      </div>
    </div>
  )
}
