import { useTranslation } from 'react-i18next'
import type { AppointmentSummary, DateKey } from '../lib/types'
import { STATUSES, dayOverview } from '../lib/status'
import { StatusMark } from '../ui/StatusMark'

/**
 * Counts for the chosen day, from the appointments already on screen — no
 * second source of numbers, and no comparison with another period.
 * "Needs attention" is not a status: it is an appointment still awaiting
 * confirmation, or confirmed and more than 15 minutes past its start
 * without having been started.
 */
export function DayOverview({ date, now, appointments }: { date: DateKey; now: { date: DateKey; minutes: number }; appointments: AppointmentSummary[] }) {
  const { t } = useTranslation()
  const o = dayOverview(appointments, date, now)
  const rows: [keyof typeof o, string][] = [
    ['total', t('appointments.overview.total', 'Appointments')],
    ['upcoming', t('appointments.overview.upcoming', 'Upcoming')],
    ['in_progress', t('appointments.overview.in_progress', 'In progress')],
    ['completed', t('appointments.overview.completed', 'Completed')],
    ['attention', t('appointments.overview.attention', 'Needs attention')],
  ]

  return (
    <section className="p-4 border-t border-a-border">
      <h2 className="text-sm font-semibold text-a-text mb-2">{t('appointments.overview.title', 'Day overview')}</h2>
      <dl className="space-y-1.5">
        {rows.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <dt className="text-a-text-2">{label}</dt>
            <dd className="font-semibold text-a-text" data-count={key}>{o[key]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-a-text-2">{t('appointments.overview.attention_hint', 'Needs attention: awaiting confirmation, or confirmed and more than 15 minutes late without being started.')}</p>

      <h2 className="text-sm font-semibold text-a-text mt-5 mb-2">{t('appointments.overview.legend', 'Statuses')}</h2>
      <ul className="space-y-1.5">
        {STATUSES.map(s => <li key={s}><StatusMark status={s} /></li>)}
      </ul>
    </section>
  )
}
