import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import type { AppointmentSummary, ClientProfile } from '../lib/types'
import { dateOf, formatDate, timeOf } from '../lib/wallClock'
import { LoyaltyCard } from '../panel/LoyaltyCard'
import { StatusMark } from '../ui/StatusMark'

/**
 * "Book again" carries who, what and with whom — never a time or a price.
 * The calendar's create panel asks the server for today's free times and
 * today's price, so nothing about the old booking is copied blindly.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function bookAgainPath(profile: ClientProfile): string {
  const params = new URLSearchParams({ new: '1', client: String(profile.client.id) })
  if (profile.last) {
    params.set('service', String(profile.last.service_id))
    if (profile.last.master_id !== null) params.set('master', String(profile.last.master_id))
  }
  return `/appointments?${params.toString()}`
}

// eslint-disable-next-line react-refresh/only-export-components
export function openPath(a: AppointmentSummary): string {
  return `/appointments?open=${a.id}&date=${dateOf(a.start)}`
}

function Rows({ rows, locale, empty }: { rows: AppointmentSummary[]; locale: string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-a-text-2">{empty}</p>
  return (
    <ul className="divide-y divide-a-border rounded-lg border border-a-border bg-a-surface">
      {rows.map(a => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
          <Link to={openPath(a)} className="font-semibold text-a-accent-deep underline-offset-2 hover:underline">
            {formatDate(dateOf(a.start), locale)} · {timeOf(a.start)} – {timeOf(a.end)}
          </Link>
          <span className="text-a-text-2">{a.service?.name ?? '—'} · {a.master?.name ?? '—'}</span>
          <StatusMark status={a.status} />
        </li>
      ))}
    </ul>
  )
}

export function ClientProfileView({ profile, locale }: { profile: ClientProfile; locale: string }) {
  const { t } = useTranslation()
  const { client } = profile

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-a-text">{client.name}</h1>
          <p className="text-sm text-a-text-2">{[client.phone, client.email].filter(Boolean).join(' · ') || t('appointments.client.no_contact', 'No contact details')}</p>
        </div>
        <Link to={bookAgainPath(profile)} className="inline-flex items-center gap-2 rounded-lg bg-a-accent text-a-accent-ink hover:bg-a-accent-deep px-4 py-2.5 text-sm font-semibold">
          <CalendarPlus size={16} aria-hidden />
          {profile.last ? t('appointments.client.book_again', 'Book again') : t('appointments.client.book_first', 'Book an appointment')}
        </Link>
      </header>

      <LoyaltyCard card={profile.loyalty} preview={null} />

      <section>
        <h2 className="text-sm font-semibold text-a-text mb-2">{t('appointments.client.upcoming', 'Upcoming')}</h2>
        <Rows rows={profile.upcoming} locale={locale} empty={t('appointments.client.no_upcoming', 'No upcoming appointments.')} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-a-text mb-2">{t('appointments.client.past', 'Past')}</h2>
        <Rows rows={profile.past} locale={locale} empty={t('appointments.client.no_past', 'No past appointments.')} />
      </section>

      {profile.matched_by_email.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-a-text">{t('appointments.client.matched_by_email', 'Matched by email')}</h2>
          <p className="text-xs text-a-text-2 mb-2">{t('appointments.client.matched_hint', 'Older bookings made with this email address. They are not linked to this client record.')}</p>
          <Rows rows={profile.matched_by_email} locale={locale} empty="" />
        </section>
      )}
    </div>
  )
}
