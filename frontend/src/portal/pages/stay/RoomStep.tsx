import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BedDouble } from 'lucide-react'
import { usePortal } from '../../PortalProvider'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import type { AvailableRoom } from '../../lib/types'
import { perNightShown, type StayState } from './staySteps'

interface Props { state: StayState; onPick: (roomId: string) => void; onChangeDates: () => void }

/** The rooms free for the chosen dates and party, cheapest first, each with the member's own total. */
export function RoomStep({ state, onPick, onChangeDates }: Props) {
  const { t, i18n } = useTranslation()
  const { data } = usePortal()
  const { checkIn, checkOut, adults, children } = state
  // `retryOnMount: false`: a failed search stays failed, with its own way out, instead of refetching
  // silently every time the member steps back onto it.
  const free = useQuery({
    queryKey: ['portal-stay-availability', checkIn, checkOut, adults, children],
    queryFn: () => portalApi.stayAvailability(checkIn as string, checkOut as string, adults, children),
    enabled: !!checkIn && !!checkOut,
    retryOnMount: false,
  })
  const code = free.isError ? apiErrorCode(free.error) : null
  const venue = data?.venue
  // Only read once `free.data` exists (the room cards below only render then too) — `nights` still needs a
  // value to satisfy the type even in the branches that never use it.
  const nights = free.data?.nights ?? 0
  const contact = venue?.contact.phone || venue?.contact.email

  return (
    <div className="space-y-4">
      <h2 tabIndex={-1} data-step-heading="room" className="sr-only">{t('portal.stay.heading_room', 'Choose a room')}</h2>
      <Card className="p-4 flex items-start justify-between gap-4">
        <div className="min-w-0 text-sm">
          <p className="font-medium">{checkIn && formatDay(checkIn, i18n.language)} – {checkOut && formatDay(checkOut, i18n.language)}</p>
          <p className="text-p-text-2">{t('portal.stay.guests_line', 'Adults: {{adults}} · children: {{children}}', { adults, children })}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChangeDates}>{t('portal.book.change', 'Change')}</Button>
      </Card>

      {free.isPending && <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}

      {free.isError && (
        <div className="space-y-3">
          <Notice tone={code === 'invalid_stay' ? 'warning' : 'danger'}>{t(bookErrorKey(code), bookErrorFallback(code))}</Notice>
          {code === 'invalid_stay'
            ? <Button variant="secondary" size="sm" onClick={onChangeDates}>{t('portal.stay.change_dates', 'Change dates')}</Button>
            : <Button variant="secondary" size="sm" onClick={() => { void free.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>}
        </div>
      )}

      {free.data && free.data.rooms.length === 0 && free.data.party_too_large && venue && (
        <Notice tone="info">
          {t('portal.stay.party_too_large', 'No single room fits your party. Please contact {{venue}} and we will arrange it.', { venue: venue.name })}
          {contact && <> <a className="text-p-accent-deep underline" href={venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`}>{contact}</a></>}
        </Notice>
      )}

      {free.data && free.data.rooms.length === 0 && !free.data.party_too_large && (
        <EmptyState
          icon={<BedDouble size={18} aria-hidden />}
          title={t('portal.stay.no_rooms', 'No rooms are free for these dates.')}
          action={<Button variant="secondary" size="sm" onClick={onChangeDates}>{t('portal.stay.change_dates', 'Change dates')}</Button>}
        />
      )}

      {free.data?.rooms.map(room => <RoomCard key={room.id} room={room} nights={nights} onPick={onPick} />)}
    </div>
  )
}

function RoomCard({ room, nights, onPick }: { room: AvailableRoom; nights: number; onPick: (id: string) => void }) {
  const { t, i18n } = useTranslation()
  const discounted = room.member_total < room.total_price
  // `AvailableRoom` carries only one per-night figure from the server (`price_per_night`, the list rate —
  // `PortalStayBookingController::availability()` never discounts it, only the stay's own total via
  // `member_total`). The line must never contradict the big total shown just above it, so when that total
  // IS the discounted one, this is the member's own total spread over the nights, not the separate (higher)
  // list rate — see `perNightShown`. `null` (no rate, no discount) shows no line rather than "0".
  const perNight = perNightShown(room, nights)
  return (
    <Card className="overflow-hidden">
      {room.image && <img src={room.image} alt="" loading="lazy" className="w-full h-40 object-cover" />}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-p-display text-xl leading-tight">{room.name}</p>
            {room.short_description && <p className="text-sm text-p-text-2 mt-0.5">{room.short_description}</p>}
            <p className="text-xs text-p-text-2 mt-1">
              {t('portal.stay.sleeps', 'Sleeps {{count}}', { count: room.max_guests })}
              {room.bed_type && ` · ${room.bed_type}`}
              {room.size && ` · ${room.size}`}
            </p>
          </div>
          {/* One text column, right-aligned, so a long price never widens the card at 390 px — everything
             here wraps rather than push the "Choose" button's row. */}
          <div className="text-right shrink-0">
            {discounted && <span className="block text-xs text-p-text-2 line-through"><span className="sr-only">{t('portal.book.list_price', 'List price')}</span><Money amount={room.total_price} currency={room.currency} /></span>}
            <span className="block font-p-display text-lg">{discounted && <span className="sr-only">{t('portal.book.your_price', 'Your price')}</span>}<Money amount={room.member_total} currency={room.currency} /></span>
            {/* The caption sits directly under the total it labels; the per-night line
               (a different figure, computed a different way — see perNightShown) comes after it. */}
            <span className="block text-[11px] text-p-text-2">{t('portal.stay.total_for_stay', 'Total for your stay')}</span>
            {!!perNight && <span className="block text-[11px] text-p-text-2">{t('portal.stay.per_night', '{{price}} a night', { price: formatMoney(perNight, room.currency, i18n.language) })}</span>}
          </div>
        </div>
        <Button type="button" full onClick={() => onPick(room.id)}>{t('portal.stay.choose', 'Choose')}</Button>
      </div>
    </Card>
  )
}
