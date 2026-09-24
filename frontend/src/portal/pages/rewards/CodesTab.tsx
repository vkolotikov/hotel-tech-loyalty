import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ticket } from 'lucide-react'
import { portalApi } from '../../lib/portalApi'
import { formatDay, resolveLocale } from '../../lib/dates'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { PageSkeleton } from '../../ui/Skeleton'

/** The codes a member redeemed — kept, not flashed once in a toast. */
export function CodesTab() {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['portal-redemptions'], queryFn: portalApi.redemptions })
  if (isLoading) return <PageSkeleton />
  if (isError) return <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>
  const rows = data?.redemptions ?? []
  if (rows.length === 0) return <EmptyState icon={<Ticket size={18} aria-hidden />} title={t('portal.rewards.codes_empty', 'Codes you redeem will be kept here.')} />

  const tone = (s: string) => (s === 'pending' ? 'accent' : s === 'fulfilled' ? 'success' : 'neutral')
  const label = (s: string) => s === 'pending' ? t('portal.rewards.code_pending', 'Show at the desk') : s === 'fulfilled' ? t('portal.rewards.code_fulfilled', 'Used') : t('portal.rewards.code_cancelled', 'Cancelled')

  return (
    <div className="space-y-3">
      <p className="text-xs text-p-text-2">{t('portal.rewards.codes_hint', 'Each code works once. The venue marks it used when you present it.')}</p>
      {rows.map(r => (
        <Card key={r.id} className={`p-4 flex items-center justify-between gap-3 ${r.status !== 'pending' ? 'opacity-70' : ''}`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{r.reward?.name}</p>
            <p className="text-[11px] text-p-text-2">{formatDay(r.created_at, i18n.language)} · {r.points_spent.toLocaleString(resolveLocale(i18n.language))} {t('portal.common.points', 'points')}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-sm font-semibold tracking-wider">{r.code}</p>
            <div className="mt-1"><Chip tone={tone(r.status)}>{label(r.status)}</Chip></div>
          </div>
        </Card>
      ))}
    </div>
  )
}
