import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { usePortalPanels } from './panels'
import { PortalIcon } from './PortalIcon'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { DateTime } from '../ui/DateTime'
import { Money } from '../ui/Money'
import { statusLabel, statusTone } from '../pages/BookingRow'
import { counted, nightsAndGuests } from '../lib/plural'
import type { PortalBooking } from '../lib/types'

export function UpcomingBooking({ booking: b, onOpen }: { booking: PortalBooking; onOpen: () => void }) {
  const { t } = useTranslation()
  const { data } = usePortal()
  const panels = usePortalPanels()
  const stay = b.kind === 'stay'
  return <article className="p-booking-card">
    <header><PortalIcon name={stay ? 'bed' : 'calendar'} tile /><div><h3>{b.title}</h3>{b.subtitle && <p>{b.subtitle}</p>}</div><Chip tone={statusTone(b.status)}>{t(`portal.bookings.status.${b.status}`, statusLabel(b.status))}</Chip></header>
    <div className="p-booking-dates">
      <div><small><PortalIcon name="door" />{stay ? t('portal.design.check_in', 'Check-in') : t('portal.design.starts', 'Starts')}</small>{b.starts_at && <strong><DateTime iso={b.starts_at} mode={stay ? 'day' : 'datetime'} /></strong>}{stay && data && <p>{t('portal.design.from_time', 'From {{time}}', { time: data.policies.check_in_time })}</p>}</div>
      <div><small><PortalIcon name="clock" />{stay ? t('portal.design.check_out', 'Check-out') : t('portal.design.ends', 'Ends')}</small>{b.ends_at && <strong><DateTime iso={b.ends_at} mode={stay ? 'day' : 'datetime'} /></strong>}{stay && data && <p>{t('portal.design.by_time', 'By {{time}}', { time: data.policies.check_out_time })}</p>}</div>
    </div>
    <div className="p-booking-meta"><span className="inline-flex items-center gap-1"><PortalIcon name="users" />{stay && b.nights != null && b.guests != null ? nightsAndGuests(t, b.nights, b.guests) : b.party_size != null ? counted(t, 'bookings.guest_count', b.party_size) : ''}</span><span>{b.reference}</span></div>
    <footer><Money amount={b.total} currency={b.currency} className="font-semibold text-sm" /><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={onOpen}>{t('portal.design.details', 'Details')}</Button>{data?.member && <Button variant="secondary" size="sm" onClick={() => panels.open('card')}><PortalIcon name="qr" />{t('portal.design.show_card', 'Show card')}</Button>}</div></footer>
  </article>
}
