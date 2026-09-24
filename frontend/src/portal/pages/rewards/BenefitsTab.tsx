import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Clock, Crown } from 'lucide-react'
import toast from 'react-hot-toast'
import { portalApi, apiMessage } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { PageSkeleton } from '../../ui/Skeleton'
import { Notice } from '../../ui/Notice'

export function BenefitsTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['portal-benefits'], queryFn: portalApi.benefits })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['portal-benefits'] })

  const request = useMutation({
    mutationFn: portalApi.requestBenefit,
    onSuccess: () => { toast.success(t('portal.rewards.request_sent', 'Requested')); void invalidate() },
    onError: e => toast.error(apiMessage(e, t('portal.rewards.request_failed', 'Could not send that request'))),
  })
  const cancel = useMutation({
    mutationFn: portalApi.cancelBenefitRequest,
    onSuccess: () => { toast.success(t('portal.rewards.request_cancelled', 'Request cancelled')); void invalidate() },
    onError: e => toast.error(apiMessage(e, t('portal.rewards.request_failed', 'Could not send that request'))),
  })

  if (isLoading) return <PageSkeleton />
  if (isError) return <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>

  const benefits = data?.benefits ?? []
  if (benefits.length === 0) {
    return <EmptyState icon={<Crown size={18} aria-hidden />} title={t('portal.rewards.benefits_empty', 'No benefits on your level yet. Keep earning points to unlock them.')} />
  }

  return (
    <div className="space-y-3">
      {data?.tier && <p className="text-xs text-p-text-2">{t('portal.rewards.tier_level', '{{tier}} level', { tier: data.tier })}</p>}
      {benefits.map(b => {
        const open = b.request
        return (
          <Card key={b.tier_benefit_id} className={`p-4 ${open ? 'border-p-accent/40' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{b.name}</h2>
                {b.description && <p className="text-xs text-p-text-2 mt-0.5">{b.description}</p>}
              </div>
              {b.display && <span className="shrink-0 text-xs font-semibold text-p-accent-deep">{b.display}</span>}
            </div>
            <div className="mt-3">
              {open ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-[11px] text-p-accent-deep"><Clock size={13} aria-hidden />
                    {open.status === 'approved' ? t('portal.rewards.approved', 'Approved — ready when you are') : t('portal.rewards.requested', 'Requested — the venue will confirm')}
                  </p>
                  {(open.status === 'pending' || open.status === 'eligible') && (
                    <Button variant="ghost" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate(open.id)}>{t('portal.rewards.cancel_request', 'Cancel request')}</Button>
                  )}
                </div>
              ) : b.requestable ? (
                <Button full loading={request.isPending} onClick={() => request.mutate(b.tier_benefit_id)}>{t('portal.rewards.request', 'Request this')}</Button>
              ) : (
                <p className="flex items-center gap-1.5 text-[11px] text-p-text-2"><BadgeCheck size={13} className="text-p-success" aria-hidden />
                  {b.fulfillment_mode === 'voucher' ? t('portal.rewards.voucher', 'Issued as a voucher — ask at the desk') : t('portal.rewards.automatic', 'Applied automatically')}
                </p>
              )}
              {b.last_fulfilled_at && !open && <p className="text-[10px] text-p-text-2 mt-1.5">{t('portal.rewards.last_used', 'Last used {{date}}', { date: formatDay(b.last_fulfilled_at, i18n.language) })}</p>}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
