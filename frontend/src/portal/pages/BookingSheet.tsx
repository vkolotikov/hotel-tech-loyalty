import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { apiErrorBooking, apiErrorCode, portalApi } from '../lib/portalApi'
import { buildIcs, downloadIcs } from '../lib/ics'
import type { BookingKind, CancelReply } from '../lib/types'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { DateTime } from '../ui/DateTime'
import { Money } from '../ui/Money'
import { Notice } from '../ui/Notice'
import { Skeleton } from '../ui/Skeleton'
import { bookingPaymentLabel, statusLabel, statusTone } from './BookingRow'
import { afterCancelError, cancelOffer } from './cancelBooking'
import { CancelPanel } from './CancelPanel'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-p-border last:border-0">
      <span className="text-p-text-2">{label}</span>
      <span className="text-right text-p-text">{children}</span>
    </div>
  )
}

function policyText(kind: BookingKind, policies: { services_cancellation_policy: string; booking_cancellation_policy: string } | undefined): string | null {
  const text = kind === 'stay' ? policies?.booking_cancellation_policy : policies?.services_cancellation_policy
  return text ? text : null
}

export function BookingSheet({ kind, id, onClose, onCancelSettled }: { kind: BookingKind; id: number; onClose: () => void; onCancelSettled?: (kind: BookingKind, id: number) => void }) {
  const { t } = useTranslation()
  const { data: portal } = usePortal()
  const { data: b, isLoading, isError } = useQuery({ queryKey: ['portal-booking', kind, id], queryFn: () => portalApi.booking(kind, id), retry: false })

  const venue = portal?.venue
  const payment = b ? bookingPaymentLabel(b, t) : null

  const qc = useQueryClient()
  const [stage, setStage] = useState<'idle' | 'asking' | 'done'>('idle')
  const [result, setResult] = useState<CancelReply['refund'] | null>(null)
  // `onSuccess`/`onError` below run even after this component unmounts (react-query
  // ties them to the mutation, not the component — see `cancelledWhileAway`'s own doc comment), but
  // `onCancelSettled` must fire ONLY while this sheet is actually here to show its own result — otherwise
  // browser Back (unmount before settle) would still mark the cancellation "shown" and the list would never
  // get to announce it. A plain boolean ref, flipped in the unmount cleanup, is the only way to tell "still
  // mounted" apart from "the callback merely still runs" inside those handlers.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  const cancel = useMutation({
    // Keyed so `Bookings.tsx` can still find this mutation's own outcome via
    // `useMutationState` after browser Back has unmounted this sheet mid-flight — see `cancelledWhileAway`
    // in `cancelBooking.ts` for why that is the only way the list can learn of it at all.
    mutationKey: ['portal-cancel', kind, id],
    mutationFn: () => portalApi.cancelBooking(kind, id),
    onSuccess: r => {
      setResult(r.refund)
      setStage('done')
      // The sheet shows the booking as it is now; the list, the upcoming count and the coupons follow.
      qc.setQueryData(['portal-booking', kind, id], r.booking)
      qc.invalidateQueries({ queryKey: ['portal-bookings'] })
      qc.invalidateQueries({ queryKey: ['portal-bootstrap'] })
      qc.invalidateQueries({ queryKey: ['portal-offers'] })
      qc.invalidateQueries({ queryKey: ['portal-redemptions'] })
      qc.invalidateQueries({ queryKey: ['portal-slots'] })
      qc.invalidateQueries({ queryKey: ['portal-calendar'] })
      qc.invalidateQueries({ queryKey: ['portal-stay-availability'] })
      if (mountedRef.current) onCancelSettled?.(kind, id)
    },
    onError: e => {
      const code = apiErrorCode(e)
      // cancel_failed's 500 body can carry the booking's true state (a refund may already have gone
      // through before the failure) — that is truer than anything a refetch could bring back, so it is
      // written into the cache directly, independent of afterCancelError()'s own closes/refetch decision.
      // When cancel_failed answers with no booking at all (the failure handler's own re-read came up
      // empty), the sheet still cannot trust what it already has cached — that is the one code whose
      // failure can hide a completed money movement — so it refetches this booking and the list instead
      // of assuming nothing changed.
      const failedBooking = apiErrorBooking(e)
      if (failedBooking) {
        qc.setQueryData(['portal-booking', kind, id], failedBooking)
      } else if (code === 'cancel_failed') {
        qc.invalidateQueries({ queryKey: ['portal-booking', kind, id] })
        qc.invalidateQueries({ queryKey: ['portal-bookings'] })
      }
      // The decision is `afterCancelError()`, a pure function with its own tests.
      const decision = afterCancelError(code)
      if (decision.refetch) qc.invalidateQueries({ queryKey: ['portal-booking', kind, id] })
      if (decision.closes) setStage('idle')
      if (mountedRef.current) onCancelSettled?.(kind, id)
    },
  })
  const cancelError = cancel.isError ? apiErrorCode(cancel.error) ?? 'unknown' : null
  // The sheet's own X button, the backdrop and Escape all funnel through this one onClose — a member
  // cannot dismiss the sheet mid-cancel and lose track of whether the money moved.
  const guardedClose = () => { if (!cancel.isPending) onClose() }

  return (
    <Sheet open onClose={guardedClose} title={b?.title ?? t('portal.bookings.title', 'Bookings')}>
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
          {policyText(b.kind, portal?.policies) && (
            <div>
              <p className="text-xs font-semibold text-p-text-2 mb-1">{t('portal.bookings.policy', 'Cancellation policy')}</p>
              <p className="text-xs text-p-text-2 whitespace-pre-line">{policyText(b.kind, portal?.policies)}</p>
            </div>
          )}
          {venue && (
            <CancelPanel
              booking={b}
              venue={venue}
              offer={cancelOffer(b, new Date())}
              stage={cancel.isPending ? 'cancelling' : stage}
              error={stage === 'asking' ? cancelError : null}
              result={result}
              onAsk={() => { cancel.reset(); setStage('asking') }}
              onKeep={() => { cancel.reset(); setStage('idle') }}
              onConfirm={() => cancel.mutate()}
            />
          )}
        </div>
      )}
    </Sheet>
  )
}
