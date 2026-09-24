import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'
import { portalApi } from '../lib/portalApi'
import { useVocab } from '../lib/vocab'
import type { BookingKind } from '../lib/types'
import { Tabs } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'
import { BookingRow } from './BookingRow'
import { BookingSheet } from './BookingSheet'

/**
 * Upcoming and past, across appointments and stays. The detail is a sheet
 * addressed by URL (/portal/bookings/:kind/:id) so Home's "next booking"
 * card and a confirmation email can both land on it.
 */
export function Bookings() {
  const { t } = useTranslation()
  const vocab = useVocab()
  const navigate = useNavigate()
  const { kind, id } = useParams<{ kind: BookingKind; id: string }>()
  const [params, setParams] = useSearchParams()
  const scope = params.get('scope') === 'past' ? 'past' : 'upcoming'
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['portal-bookings', scope, page],
    queryFn: () => portalApi.bookings(scope, page),
    placeholderData: keepPreviousData,
  })

  const rows = data?.data ?? []
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.per_page)) : 1

  return (
    <div className="space-y-4">
      <h1 className="font-p-display text-2xl">{t('portal.bookings.title', 'Bookings')}</h1>
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
        <BookingSheet kind={kind} id={Number(id)} onClose={() => navigate(`/portal/bookings?scope=${scope}`, { replace: true })} />
      )}
    </div>
  )
}
