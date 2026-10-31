import { useTranslation } from 'react-i18next'
import { CalendarDays, BedDouble } from 'lucide-react'
import type { PortalBooking } from '../lib/types'
import { statusLabel, statusTone } from './bookingLabels'
import { nightsAndGuests } from '../lib/plural'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { DateTime } from '../ui/DateTime'
import { Money } from '../ui/Money'

// The labels live in `bookingLabels.ts`, framework-free, so the members' app shares them; re-exported for the sheet.
// eslint-disable-next-line react-refresh/only-export-components
export { bookingPaymentLabel, paymentLabel, statusLabel, statusTone, type ChipTone } from './bookingLabels'

export function BookingRow({ booking: b, onOpen }: { booking: PortalBooking; onOpen: () => void }) {
  const { t } = useTranslation()
  const Icon = b.kind === 'stay' ? BedDouble : CalendarDays
  return (
    <button onClick={onOpen} className="block w-full text-left">
      <Card className="p-4 p-lift flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><Icon size={18} aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{b.title}</p>
          <p className="text-xs text-p-text-2 truncate">
            {b.starts_at && <DateTime iso={b.starts_at} mode={b.kind === 'stay' ? 'day' : 'datetime'} />}
            {b.kind === 'stay' && b.nights != null && b.guests != null && ` · ${nightsAndGuests(t, b.nights, b.guests)}`}
            {b.kind === 'service' && b.subtitle && ` · ${b.subtitle}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <Money amount={b.total} currency={b.currency} className="text-sm font-semibold" />
          <div className="mt-1"><Chip tone={statusTone(b.status)}>{t(`portal.bookings.status.${b.status}`, statusLabel(b.status))}</Chip></div>
        </div>
      </Card>
    </button>
  )
}
