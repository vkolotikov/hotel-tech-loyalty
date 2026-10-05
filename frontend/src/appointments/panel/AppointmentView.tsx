import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { money } from '../../lib/money'
import type { ActionKey, AppointmentDetail, ClientMessageInfo, PointsResult } from '../lib/types'
import { dateOf, formatDate, timeOf } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { StatusMark } from '../ui/StatusMark'
import { History } from './History'
import { LoyaltyCard } from './LoyaltyCard'
import { Messages } from './Messages'
import { MoneyBlock } from './MoneyBlock'
import { refundWays } from './moneyLines'
import { messageLine } from './messageLine'
import { pointsLine } from './consequences'
import type { PanelError } from './panelState'

interface Props {
  booking: AppointmentDetail
  zone: string
  locale: string
  saving: boolean
  error: PanelError | null
  /** What the last completion did with points, shown until the next action. */
  outcome: PointsResult | null
  /** What the last save told the client (Part D), shown until the next step. */
  told?: ClientMessageInfo | null
  onAction: (action: ActionKey) => void
  /** Part E: managers may refund; Take payment follows the server's `money.can_take`. */
  canManage?: boolean
  onPay?: () => void
  onRefund?: () => void
}

/**
 * One appointment: what it is, what was paid, what the membership gives —
 * three separate statements — and the actions the server allows. The
 * buttons are exactly `booking.actions` with `allowed: true`.
 */
export function AppointmentView({ booking: b, zone, locale, saving, error, outcome, told = null, onAction, canManage = false, onPay, onRefund }: Props) {
  const { t } = useTranslation()
  const allowed = (key: ActionKey) => b.actions.find(a => a.key === key)?.allowed === true
  const complete = b.actions.find(a => a.key === 'complete')
  // In the order an appointment moves through them. The first one allowed is
  // the next step and the only primary button; the rest are secondary.
  const labels: [ActionKey, string, 'step' | 'secondary' | 'danger'][] = [
    ['confirm', t('appointments.action.confirm', 'Confirm'), 'step'],
    ['start', t('appointments.action.start', 'Arrived'), 'step'],
    ['complete', t('appointments.action.complete', 'Complete'), 'step'],
    ['award_points', t('appointments.action.award_points', 'Award points'), 'step'],
    ['move', t('appointments.action.move', 'Move'), 'secondary'],
    ['no_show', t('appointments.action.no_show', 'No-show'), 'secondary'],
    ['cancel', t('appointments.action.cancel', 'Cancel appointment'), 'danger'],
  ]
  const offered = labels.filter(([key]) => allowed(key))
  const nextStep = offered.find(([, , kind]) => kind === 'step')?.[0] ?? null
  const outcomeLine = outcome
    ? (outcome.awarded > 0
        ? { text: t('appointments.loyalty.awarded', '{{points}} points awarded for this visit.', { points: outcome.awarded }), tone: 'success' as const }
        : (() => { const line = pointsLine({ points: 0, reason: outcome.reason }); return { text: line ? t(line.key, line.fallback) : '', tone: outcome.reason === 'failed' ? 'warning' as const : 'info' as const } })())
    : null
  const toldLine = told ? messageLine(told) : null

  return (
    <div className="space-y-4">
      {error && <Notice tone={error.code === 'stale' ? 'warning' : 'danger'}>{t(`appointments.error.${error.code}`, error.message)}</Notice>}
      {outcomeLine && outcomeLine.text && <Notice tone={outcomeLine.tone}>{outcomeLine.text}</Notice>}
      {toldLine && <Notice tone={toldLine.tone}>{t(toldLine.key, toldLine.fallback, toldLine.vars)}</Notice>}

      <section>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-a-text truncate">{b.client.name}</div>
            <div className="text-sm text-a-text-2">{b.service?.name ?? '—'} · {b.master?.name ?? '—'}</div>
          </div>
          <StatusMark status={b.status} />
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-a-text-2">{t('appointments.panel.when', 'When')}</dt><dd className="font-semibold text-a-text text-right">{formatDate(dateOf(b.start), locale)} · {timeOf(b.start)} – {timeOf(b.end)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-a-text-2">{t('appointments.panel.price', 'Price')}</dt><dd className="text-a-text text-right">
            <span className="font-semibold">{money(b.price.total, b.price.currency)}</span>
            {b.price.discount_label && <span className="text-a-text-2"> · {b.price.discount_label}</span>}
          </dd></div>
          <div className="flex justify-between gap-3"><dt className="text-a-text-2">{t('appointments.list.payment', 'Payment')}</dt><dd className="text-a-text text-right">
            {t(`appointments.payment.${b.payment.state}`)}
            {b.payment.refunded_amount !== null && <span className="text-a-text-2"> · {money(b.payment.refunded_amount, b.payment.currency)}</span>}
          </dd></div>
          <div className="flex justify-between gap-3"><dt className="text-a-text-2">{t('appointments.panel.reference', 'Reference')}</dt><dd className="text-a-text-2">{b.reference}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-a-border p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 break-words text-a-text">{[b.client.phone, b.client.email].filter(Boolean).join(' · ') || t('appointments.client.no_contact', 'No contact details')}</span>
          {b.client.id !== null && <Link to={`/appointments/clients/${b.client.id}`} className="shrink-0 text-a-accent-deep font-semibold underline-offset-2 hover:underline">{t('appointments.client.open_profile', 'Open profile')}</Link>}
        </div>
        {b.client.id === null && <p className="mt-1 text-xs text-a-text-2">{t('appointments.client.unlinked', 'This booking is not linked to a client record.')}</p>}
      </section>

      {b.money && <MoneyBlock money={b.money} locale={locale} zone={zone} />}

      <LoyaltyCard card={b.loyalty} preview={complete?.allowed ? complete.consequences.points : null} />

      {(b.notes.staff || b.notes.customer) && (
        <section className="text-sm">
          {b.notes.staff && <p><span className="font-semibold text-a-text">{t('appointments.panel.staff_note', 'Note for the team')}:</span> <span className="text-a-text-2">{b.notes.staff}</span></p>}
          {b.notes.customer && <p><span className="font-semibold text-a-text">{t('appointments.panel.client_note', 'Note from the client')}:</span> <span className="text-a-text-2">{b.notes.customer}</span></p>}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {offered.map(([key, label, kind]) => (
          <Button key={key} type="button" size="sm" variant={key === nextStep ? 'primary' : kind === 'danger' ? 'danger' : 'secondary'} disabled={saving} onClick={() => onAction(key)}>{label}</Button>
        ))}
        {b.money?.can_take && onPay && <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={onPay}>{t('appointments.money.take', 'Take payment')}</Button>}
        {canManage && onRefund && b.money && refundWays(b.money).length > 0 && <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={onRefund}>{t('appointments.money.refund', 'Refund')}</Button>}
      </div>

      <Messages messages={b.messages ?? []} zone={zone} locale={locale} />
      <History entries={b.history} zone={zone} locale={locale} />
    </div>
  )
}
