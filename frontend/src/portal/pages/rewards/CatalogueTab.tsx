import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Gift } from 'lucide-react'
import { portalApi, apiMessage } from '../../lib/portalApi'
import type { Reward } from '../../lib/types'
import { resolveLocale } from '../../lib/dates'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { PageSkeleton } from '../../ui/Skeleton'

export function CatalogueTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState<Reward | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['portal-rewards'], queryFn: portalApi.rewards })

  const redeem = useMutation({
    mutationFn: portalApi.redeem,
    onSuccess: res => {
      setConfirming(null)
      setCode(res.redemption?.code ?? null)
      void qc.invalidateQueries({ queryKey: ['portal-rewards'] })
      void qc.invalidateQueries({ queryKey: ['portal-bootstrap'] })
      void qc.invalidateQueries({ queryKey: ['portal-redemptions'] })
    },
    onError: e => { setConfirming(null); setCode(null); setError(apiMessage(e, t('portal.rewards.redeem_failed', 'Could not redeem that reward'))) },
  })

  if (isLoading) return <PageSkeleton />
  if (isError) return <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>

  const rewards = data?.rewards ?? []
  const balance = data?.current_points ?? 0
  const locale = resolveLocale(i18n.language)

  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      {code && <Notice tone="success">{t('portal.rewards.redeemed_prefix', 'Redeemed — your code is')} <span className="font-mono">{code}</span></Notice>}
      {rewards.length === 0 && <EmptyState icon={<Gift size={18} aria-hidden />} title={t('portal.rewards.catalogue_empty', 'No rewards are available right now. Check back soon.')} />}
      <div className="grid sm:grid-cols-2 gap-3">
        {rewards.map(r => {
          const short = Math.max(0, r.points_cost - balance)
          const limitReached = r.per_member_limit != null && r.claimed_by_me >= r.per_member_limit
          const outOfStock = r.in_stock === false
          return (
            <Card key={r.id} className="overflow-hidden flex flex-col">
              {r.image_url && <img src={r.image_url} alt="" className="w-full h-28 object-cover" loading="lazy" />}
              <div className="p-4 flex flex-col gap-2 grow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold truncate">{r.name}</h2>
                    {r.category && <p className="text-[11px] text-p-text-2">{r.category}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-p-accent-deep tabular-nums">{r.points_cost.toLocaleString(locale)}</span>
                </div>
                {r.description && <p className="text-xs text-p-text-2 line-clamp-2">{r.description}</p>}
                <div className="mt-auto pt-2">
                  {limitReached ? <p className="flex items-center gap-1.5 text-xs text-p-text-2"><Check size={13} aria-hidden /> {t('portal.rewards.already_claimed', 'Already claimed')}</p>
                  : outOfStock ? <p className="text-xs text-p-text-2">{t('portal.rewards.out_of_stock', 'Out of stock')}</p>
                  : short > 0 ? <p className="text-xs text-p-text-2 tabular-nums">{t('portal.rewards.points_needed', '{{count}} more points needed', { count: short })}</p>
                  : <Button full onClick={() => { setError(null); setConfirming(r) }}>{t('portal.rewards.redeem', 'Redeem')}</Button>}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Sheet
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={t('portal.rewards.redeem_title', 'Redeem {{name}}?', { name: confirming?.name ?? '' })}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirming(null)}>{t('portal.common.cancel', 'Cancel')}</Button>
          <Button loading={redeem.isPending} onClick={() => confirming && redeem.mutate(confirming.id)}>{t('portal.common.confirm', 'Confirm')}</Button>
        </>}
      >
        <p className="text-p-text-2">{t('portal.rewards.redeem_body', "This spends {{count}} points. You'll get a code to show at the desk.", { count: confirming?.points_cost ?? 0 })}</p>
      </Sheet>
    </div>
  )
}
