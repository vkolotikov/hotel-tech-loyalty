import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { showsAppointmentsLink } from '../appointments/lib/landing'

/**
 * The service-booking pages' way into HexaTech Appointments — the same
 * bookings in the calendar-first workspace. Shown only where the
 * organisation has the workspace and something can be booked.
 */
export function OpenInAppointments() {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)
  if (!showsAppointmentsLink(user)) return null

  return (
    <Link to="/appointments"
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider bg-white/[0.04] border border-white/[0.06] text-gray-300 hover:bg-white/[0.06] transition-all">
      <CalendarDays size={14} aria-hidden /> {t('nav.items.appointments_workspace_open', 'Open in HexaTech Appointments')}
    </Link>
  )
}
