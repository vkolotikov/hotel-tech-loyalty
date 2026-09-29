import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'
import { apiErrorCode, cancelErrorFallback, cancelErrorKey, portalApi } from '../lib/portalApi'
import { useVocab } from '../lib/vocab'
import type { BookingKind, CancelReply, PortalBooking } from '../lib/types'
import { Tabs } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'
import { BookingRow } from './BookingRow'
import { BookingSheet } from './BookingSheet'
import { cancelledWhileAway, type CancelMutationSnapshot } from './cancelBooking'

/**
 * Upcoming and past, across appointments and stays. The detail is a sheet
 * addressed by URL (/portal/bookings/:kind/:id) so Home's "next booking"
 * card and a confirmation email can both land on it.
 */
export function Bookings() {
  const { t } = useTranslation()
  const vocab = useVocab()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { kind, id } = useParams<{ kind: BookingKind; id: string }>()
  const [params, setParams] = useSearchParams()
  const scope = params.get('scope') === 'past' ? 'past' : 'upcoming'
  const [page, setPage] = useState(1)
  // Captured once, at mount, from the URL — not read fresh from `params` on every render — so that once
  // the confirmation is shown it stays visible for the rest of this mount even after the effect below drops
  // `?confirmed=1` from the address bar; a reload or Back at that point lands on a URL with no `confirmed`
  // param at all, so the banner does not come back.
  const [showConfirmedBanner] = useState(() => params.get('confirmed') === '1')

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['portal-bookings', scope, page],
    queryFn: () => portalApi.bookings(scope, page),
    placeholderData: keepPreviousData,
  })

  const rows = data?.data ?? []
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.per_page)) : 1

  // The reference for the confirmation banner: the just-confirmed booking is usually already in this
  // scope's freshly-invalidated list (Book.tsx navigates here right after `confirm()` succeeds), but on a
  // cold load — a bookmark, a shared confirmation link, the "past" tab — it might not be. This query shares
  // its key with BookingSheet's own (the sheet is about to mount for the same kind/id anyway), so it costs
  // nothing extra beyond the one request that screen needed regardless.
  const confirmedInList = rows.find(b => !!kind && !!id && b.kind === kind && b.id === Number(id))
  const confirmedBooking = useQuery({
    queryKey: ['portal-booking', kind, id],
    queryFn: () => portalApi.booking(kind as BookingKind, Number(id)),
    enabled: showConfirmedBanner && !!kind && !!id && !confirmedInList,
    retry: false,
  })
  const confirmedReference = confirmedInList?.reference ?? confirmedBooking.data?.reference ?? null

  // Browser Back while a cancellation is in flight closes
  // BookingSheet before its own request settles — this app has no navigation blocker (a plain
  // `<BrowserRouter>`), so the notice CancelPanel would have shown has to be picked up here instead, from
  // the mutation cache itself (see `cancelledWhileAway` in `cancelBooking.ts`). `watchingSince` (a value
  // fixed at mount, so a plain ref is fine for it) scopes this to THIS mount of the list, so a stale
  // mutation from earlier in the session is never re-announced. `shown` is REACT STATE, not a ref: a re-
  // render caused by something unrelated (the mutation's own invalidations refetching `portal-bookings`,
  // say) must not make an announced notice vanish on its own — only `markShown` (the notice's own dismiss
  // button, or `BookingSheet` reporting it showed the result itself while mounted) removes it.
  const watchingSince = useRef(Date.now()).current
  const [shown, setShown] = useState<Set<string>>(() => new Set())
  const markShown = (k: BookingKind, i: number) => setShown(prev => new Set(prev).add(`${k}:${i}`))
  const cancelMutations = useMutationState({
    filters: { mutationKey: ['portal-cancel'] },
    select: (m): CancelMutationSnapshot => {
      const mutationKey = m.options.mutationKey as [string, BookingKind, number] | undefined
      return {
        kind: mutationKey?.[1] ?? 'service',
        id: mutationKey?.[2] ?? 0,
        status: m.state.status as 'pending' | 'success' | 'error',
        submittedAt: m.state.submittedAt,
        refund: m.state.status === 'success' ? (m.state.data as CancelReply).refund : null,
        errorCode: m.state.status === 'error' ? apiErrorCode(m.state.error) : null,
      }
    },
  })
  // Only the booking whose sheet is open right now is excluded — not "any sheet at all" — so a first
  // booking's cancellation that outlived its own (Back-closed) sheet is still announced while a second,
  // unrelated booking's sheet happens to be open.
  const openBooking = kind && id && (kind === 'service' || kind === 'stay') ? { kind, id: Number(id) } : null
  const awayNotice = cancelledWhileAway(cancelMutations, watchingSince, openBooking, shown)
  // The booking's own title, read from the cache BookingSheet.tsx's own mutation already wrote (or, for an
  // error with no booking in its body, whatever the list itself last had cached) — never a fresh fetch here.
  const awayNoticeBooking = awayNotice ? qc.getQueryData<PortalBooking>(['portal-booking', awayNotice.kind, awayNotice.id]) : undefined

  // Drop `?confirmed=1` the moment the banner has something to show — not merely once shown, so a slow
  // resolve of `confirmedReference` doesn't strip the param before it's known there's anything to display.
  useEffect(() => {
    if (showConfirmedBanner && confirmedReference && kind && id) {
      navigate(`/portal/bookings/${kind}/${id}?scope=${scope}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConfirmedBanner, confirmedReference])

  return (
    <div className="space-y-4">
      <h1 className="font-p-display text-2xl">{t('portal.bookings.title', 'Bookings')}</h1>
      {showConfirmedBanner && confirmedReference && (
        <Notice tone="success">
          <strong>{t('portal.book.confirmed_title', "You're booked")}</strong>{' '}
          {t('portal.book.confirmed_body', "Reference {{reference}}. We've emailed the details.", { reference: confirmedReference })}
        </Notice>
      )}
      {awayNotice && (
        <Notice tone={awayNotice.errorCode ? 'danger' : 'success'} onDismiss={() => markShown(awayNotice.kind, awayNotice.id)}>
          {(() => {
            const message = awayNotice.errorCode
              ? t(cancelErrorKey(awayNotice.errorCode), cancelErrorFallback(awayNotice.errorCode))
              : t('portal.bookings.cancelled_done', 'Your booking is cancelled.')
            return awayNoticeBooking ? t('portal.bookings.cancelled_elsewhere', '{{title}}: {{message}}', { title: awayNoticeBooking.title, message }) : message
          })()}
        </Notice>
      )}
      <Tabs
        value={scope}
        onChange={key => { setPage(1); setParams({ scope: key }, { replace: true }) }}
        items={[{ key: 'upcoming', label: t('portal.bookings.upcoming', 'Upcoming') }, { key: 'past', label: t('portal.bookings.past', 'Past') }]}
      />

      {isLoading && <PageSkeleton />}
      {isError && <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>}

      {data && rows.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={18} aria-hidden />}
          title={scope === 'upcoming'
            ? t('portal.bookings.empty_upcoming', 'No upcoming {{noun}}.', { noun: vocab('booking_plural') })
            : t('portal.bookings.empty_past', 'No past {{noun}} yet.', { noun: vocab('booking_plural') })}
        />
      )}

      <div className="space-y-3">
        {rows.map(b => <BookingRow key={`${b.kind}-${b.id}`} booking={b} onOpen={() => navigate(`/portal/bookings/${b.kind}/${b.id}?scope=${scope}`)} />)}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage(p => p - 1)}>{t('portal.common.previous', 'Previous')}</Button>
          <span className="text-xs text-p-text-2 tabular-nums">{t('portal.common.page_of', 'Page {{page}} of {{total}}', { page, total: lastPage })}</span>
          <Button variant="secondary" size="sm" disabled={page >= lastPage || isFetching} onClick={() => setPage(p => p + 1)}>{t('portal.common.next', 'Next')}</Button>
        </div>
      )}

      {kind && id && (kind === 'service' || kind === 'stay') && (
        <BookingSheet kind={kind} id={Number(id)} onClose={() => navigate(`/portal/bookings?scope=${scope}`, { replace: true })} onCancelSettled={markShown} />
      )}
    </div>
  )
}
