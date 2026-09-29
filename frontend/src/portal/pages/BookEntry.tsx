import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BedDouble, CalendarPlus, CalendarX, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePortal } from '../PortalProvider'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { PageSkeleton } from '../ui/Skeleton'
import { Book } from './book/Book'
import { StayBook } from './stay/StayBook'

/**
 * Where "Book" leads: straight into the one flow a venue has, or to a choice when it has both. A link that
 * already names a service (`?service=`) is an appointment link and skips the choice.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function bookDestination(capabilities: { services: boolean; stays: boolean }, hasServiceParam: boolean): 'appointment' | 'stay' | 'choose' | 'none' {
  const { services, stays } = capabilities
  if (services && stays) return hasServiceParam ? 'appointment' : 'choose'
  if (services) return 'appointment'
  if (stays) return 'stay'
  return 'none'
}

function Choice({ to, icon, title, hint }: { to: string; icon: ReactNode; title: string; hint: string }) {
  return (
    <Link to={to} className="block h-full">
      <Card className="p-4 p-lift flex items-center gap-3 min-h-[72px] h-full">
        <div className="w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="font-p-display text-lg leading-tight">{title}</p>
          <p className="text-sm text-p-text-2">{hint}</p>
        </div>
        <ChevronRight size={18} className="text-p-text-2 shrink-0" aria-hidden />
      </Card>
    </Link>
  )
}

export function BookEntry() {
  const { t } = useTranslation()
  const { data } = usePortal()
  const [params] = useSearchParams()
  if (!data) return <PageSkeleton />

  const destination = bookDestination(data.capabilities, params.has('service'))
  if (destination === 'appointment') return <Book />
  if (destination === 'stay') return <StayBook />
  if (destination === 'none') return <EmptyState icon={<CalendarX size={22} aria-hidden />} title={t('portal.book.not_bookable', 'Online booking is not available for this venue yet.')} />

  return (
    <div className="space-y-4">
      <h1 className="font-p-display text-2xl">{t('portal.stay.chooser_title', 'What would you like to book?')}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice to="/portal/book/appointment" icon={<CalendarPlus size={20} aria-hidden />} title={t('portal.stay.chooser_appointment', 'An appointment')} hint={t('portal.stay.chooser_appointment_hint', 'A time with one of our team')} />
        <Choice to="/portal/book/stay" icon={<BedDouble size={20} aria-hidden />} title={t('portal.stay.chooser_stay', 'A stay')} hint={t('portal.stay.chooser_stay_hint', 'A room for one night or more')} />
      </div>
    </div>
  )
}
