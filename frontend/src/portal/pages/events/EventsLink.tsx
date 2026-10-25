import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'
import { usePortal } from '../../PortalProvider'
import { EVENT_WORDS } from './eventMath'

/**
 * The way to Events from the Rewards page's header (release 8): the phone bar holds five destinations, and a venue
 * that books and runs a programme already fills them, so Events is reached from here and from Home's card. Shown only
 * while the venue has an event coming up.
 */
export function EventsLink() {
  const { t } = useTranslation()
  const { data } = usePortal()
  if (!data?.capabilities.events) return null
  return (
    <Link to="/portal/events" className="inline-flex items-center gap-1.5 rounded-p-control px-2 min-h-11 text-sm font-semibold text-p-accent-deep hover:bg-p-accent/10">
      <CalendarDays size={15} aria-hidden />{t('portal.events.link', EVENT_WORDS.link)}
    </Link>
  )
}
