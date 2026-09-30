import { useTranslation } from 'react-i18next'
import type { AppointmentSummary, DateKey } from '../lib/types'
import { dateOf, formatDate, timeOf } from '../lib/wallClock'
import { useVocab } from '../lib/vocab'
import { StatusMark } from '../ui/StatusMark'

interface Props {
  from: DateKey
  to: DateKey
  appointments: AppointmentSummary[]
  locale: string
  selectedId: number | null
  onOpen: (id: number) => void
}

/**
 * The period as a plain table — every appointment reachable by Tab, every
 * status and payment state in words. This is the alternative to the grid
 * for keyboard and screen-reader use, and the only view on a narrow screen.
 */
export function ListView({ from, to, appointments, locale, selectedId, onOpen }: Props) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const rows = appointments
    .filter(a => dateOf(a.start) >= from && dateOf(a.start) <= to)
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)
  const days = [...new Set(rows.map(a => dateOf(a.start)))]

  if (rows.length === 0) {
    return <p className="p-8 text-sm text-a-text-2">{t('appointments.list.empty', 'No appointments in this period.')}</p>
  }

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{t('appointments.list.caption', 'Appointments')}</caption>
      <thead className="sticky top-0 bg-a-surface text-left text-xs text-a-text-2">
        <tr className="border-b border-a-border">
          <th scope="col" className="px-4 py-2 font-medium">{t('appointments.list.time', 'Time')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{vocab('client')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{vocab('service')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{vocab('team_member')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{t('appointments.list.status', 'Status')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{t('appointments.list.payment', 'Payment')}</th>
        </tr>
      </thead>
      {days.map(day => (
        <tbody key={day}>
          <tr className="bg-a-surface-2">
            <th scope="colgroup" colSpan={6} className="px-4 py-1.5 text-left text-xs font-semibold text-a-text">{formatDate(day, locale)}</th>
          </tr>
          {rows.filter(a => dateOf(a.start) === day).map(a => (
            <tr key={a.id} className={`border-b border-a-border bg-a-surface ${a.id === selectedId ? 'outline outline-2 -outline-offset-2 outline-a-accent' : ''}`}>
              <td className="px-4 py-2 whitespace-nowrap">
                <button type="button" onClick={() => onOpen(a.id)} aria-current={a.id === selectedId ? 'true' : undefined}
                  className="font-semibold text-a-accent-deep underline-offset-2 hover:underline">
                  {timeOf(a.start)} – {timeOf(a.end)}
                  <span className="sr-only"> {a.client.name}</span>
                </button>
              </td>
              <td className={`px-4 py-2 font-medium text-a-text ${a.status === 'cancelled' ? 'line-through' : ''}`}>{a.client.name}</td>
              <td className="px-4 py-2 text-a-text-2">{a.service?.name ?? '—'}</td>
              <td className="px-4 py-2 text-a-text-2">{a.master?.name ?? '—'}</td>
              <td className="px-4 py-2"><StatusMark status={a.status} /></td>
              <td className="px-4 py-2 text-a-text-2">{t(`appointments.payment.${a.payment.state}`)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  )
}
