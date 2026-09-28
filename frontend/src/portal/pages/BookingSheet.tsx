import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { portalApi } from '../lib/portalApi'
import { buildIcs, downloadIcs } from '../lib/ics'
import type { BookingKind } from '../lib/types'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { DateTime } from '../ui/DateTime'
import { Money } from '../ui/Money'
import { Notice } from '../ui/Notice'
import { Skeleton } from '../ui/Skeleton'
import { paymentLabel, statusLabel, statusTone } from './BookingRow'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-p-border last:border-0">
      <span className="text-p-text-2">{label}</span>
      <span className="text-right text-p-text">{children}</span>
    </div>
  )
}

export function BookingSheet({ kind, id, onClose }: { kind: BookingKind; id: number; onClose: () => void }) {
  const { t } = useTranslation()
  const { data: portal } = usePortal()
  const { data: b, isLoading, isError } = useQuery({ queryKey: ['portal-booking', kind, id], queryFn: () => portalApi.booking(kind, id), retry: false })

  const venue = portal?.venue
  const contact = venue?.contact.phone || venue?.contact.email
  const payment = b ? paymentLabel(b.payment_status, t) : null

  return (
    <Sheet open onClose={onClose} title={b?.title ?? t('portal.bookings.title', 'Bookings')}>
      {isLoading && <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div>}
      {isError && <Notice tone="danger">{t('portal.bookings.not_found', 'We could not find that booking.')}</Notice>}
      {b && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Chip tone={statusTone(b.status)}>{t(`portal.bookings.status.${b.status}`, statusLabel(b.status))}</Chip>
            <span className="font-mono text-xs text-p-text-2">{b.reference}</span>
          </div>
          <div className="text-sm">
            <Row label={t('portal.bookings.when', 'When')}>
              {b.starts_at && <DateTime iso={b.starts_at} mode={b.kind === 'stay' ? 'day' : 'datetime'} />}
              {b.kind === 'stay' && b.ends_at && <> – <DateTime iso={b.ends_at} mode="day" /></>}
            </Row>
            {b.kind === 'service' && b.subtitle && <Row label={t('portal.bookings.with', 'With')}>{b.subtitle}</Row>}
            {b.kind === 'stay' && b.nights != null && b.guests != null && (
              <Row label={t('portal.bookings.guests', 'Guests')}>{t('portal.bookings.nights_guests', '{{nights}} nights · {{guests}} guests', { nights: b.nights, guests: b.guests })}</Row>
            )}
            {b.kind === 'service' && b.party_size != null && b.party_size > 1 && <Row label={t('portal.bookings.guests', 'Guests')}>{t('portal.bookings.party', 'For {{count}} people', { count: b.party_size })}</Row>}
            {b.discount && <Row label={t('portal.bookings.discount', 'Member discount')}>−<Money amount={b.discount.amount} currency={b.currency} /> · {b.discount.label}</Row>}
            <Row label={t('portal.bookings.total', 'Total')}><Money amount={b.total} currency={b.currency} className="font-semibold" /></Row>
            {payment && <Row label={t('portal.bookings.payment', 'Payment')}>{payment}</Row>}
            {b.notes && <Row label={t('portal.bookings.notes', 'Your notes')}>{b.notes}</Row>}
          </div>
          {venue && b.status !== 'cancelled' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => downloadIcs(buildIcs(b, { name: venue.name, timezone: venue.timezone }), `${b.reference}.ics`)}
            >
              {t('portal.book.add_to_calendar', 'Add to calendar')}
            </Button>
          )}
          {b.kind === 'service' && portal?.policies.services_cancellation_policy && (
            <div>
              <p className="text-xs font-semibold text-p-text-2 mb-1">{t('portal.bookings.policy', 'Cancellation policy')}</p>
              <p className="text-xs text-p-text-2 whitespace-pre-line">{portal.policies.services_cancellation_policy}</p>
            </div>
          )}
          {b.status !== 'cancelled' && b.status !== 'completed' && venue && (
            <Notice tone="info">
              {t('portal.bookings.contact_to_change', 'To change or cancel, contact {{venue}}.', { venue: venue.name })}
              {contact && <> <a className="text-p-accent-deep underline" href={venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`}>{contact}</a></>}
            </Notice>
          )}
        </div>
      )}
    </Sheet>
  )
}
