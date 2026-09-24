import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi } from '../lib/portalApi'
import { formatDay, resolveLocale } from '../lib/dates'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'

// The en bundle's own text for each activity type, passed as i18next's
// default value — matching statusLabel/paymentLabel in BookingRow.tsx — so a
// locale that hasn't shipped the key yet, and a unit test with no resource
// bundle loaded, both still show a real word instead of raw `earn`/`redeem`.
const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  earn: 'Earned',
  bonus: 'Bonus',
  redeem: 'Redeemed',
  adjust: 'Adjustment',
  expire: 'Expired',
  reverse: 'Reversed',
}

// activityTypeLabel lives beside the row that is its main consumer (Home
// shows the same word for the same reason); a shared lib file for one small
// helper would scatter it for no gain.
// eslint-disable-next-line react-refresh/only-export-components
export function activityTypeLabel(
  // Loosely typed on purpose, matching paymentLabel's convention: i18next's
  // TFunction has a large overload set a hand-written signature can't
  // satisfy, and this helper only ever uses the (key, defaultValue) form.
  t: (key: string, defaultValue: string) => string,
  type: string,
): string {
  return t(`portal.activity.type.${type}`, ACTIVITY_TYPE_LABEL[type] ?? type)
}

export function Activity() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['portal-activity', page], queryFn: () => portalApi.pointsHistory(page), placeholderData: keepPreviousData,
  })
  const typeLabel = (type: string) => activityTypeLabel(t, type)
  const locale = resolveLocale(i18n.language)

  if (isLoading) return <PageSkeleton />
  if (isError) return <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>

  const rows = data?.data ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-p-display text-2xl">{t('portal.activity.title', 'Activity')}</h1>
        {!!data?.total && <span className="text-xs text-p-text-2 tabular-nums">{t('portal.activity.entries', '{{count}} entries', { count: data.total })}</span>}
      </div>
      {rows.length === 0 ? <EmptyState title={t('portal.activity.empty', 'No points activity yet. Your first visit will show up here.')} /> : (
        <Card className="overflow-hidden divide-y divide-p-border">
          {rows.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={`text-sm truncate ${a.is_reversed ? 'line-through text-p-text-2' : ''}`}>{a.description || typeLabel(a.type)}</p>
                <p className="text-[11px] text-p-text-2">{typeLabel(a.type)} · {formatDay(a.created_at, i18n.language)}{a.is_reversed && ` · ${t('portal.activity.reversed', 'reversed')}`}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`text-sm font-semibold tabular-nums ${a.points >= 0 ? 'text-p-success' : 'text-p-text-2'}`}>{a.points >= 0 ? '+' : ''}{a.points.toLocaleString(locale)}</span>
                {a.balance_after != null && <p className="text-[10px] text-p-text-2 tabular-nums">{t('portal.activity.balance', 'balance {{count}}', { count: a.balance_after })}</p>}
              </div>
            </div>
          ))}
        </Card>
      )}
      {(data?.last_page ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage(p => Math.max(1, p - 1))}>{t('portal.common.previous', 'Previous')}</Button>
          <span className="text-xs text-p-text-2 tabular-nums">{t('portal.common.page_of', 'Page {{page}} of {{total}}', { page: data?.current_page, total: data?.last_page })}</span>
          <Button variant="secondary" size="sm" disabled={page >= (data?.last_page ?? 1) || isFetching} onClick={() => setPage(p => p + 1)}>{t('portal.common.next', 'Next')}</Button>
        </div>
      )}
    </div>
  )
}
