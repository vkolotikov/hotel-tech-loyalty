import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Clock, Crown } from 'lucide-react'
import toast from 'react-hot-toast'
import { portalApi, apiMessage } from '../../lib/portalApi'
import { usePortal } from '../../PortalProvider'
import { instantDay } from '../homeMath'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { PageSkeleton } from '../../ui/Skeleton'
import { Notice } from '../../ui/Notice'
import { benefitIcon } from './benefitIcon'

export function BenefitsTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { data: boot } = usePortal()
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
    return <EmptyState icon={<Crown size={18} aria-hidden />} title={t('portal.rewards.benefits_empty', 'Your level has no benefits yet.')} />
  }

  return (
    <div className="space-y-3">
      {data?.tier && <p className="inline-flex items-center gap-1.5 rounded-full bg-p-accent/10 text-p-accent-deep px-3 py-1 text-xs font-semibold"><Crown size={13} aria-hidden />{t('portal.rewards.tier_level', '{{tier}} level', { tier: data.tier })}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
      {benefits.map(b => {
        const open = b.request
        const Icon = benefitIcon(b.category)
        return (
          <Card key={b.tier_benefit_id} className={`p-4 flex flex-col ${open ? 'border-p-accent/40' : ''}`}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><Icon size={17} aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">{b.name}</h2>
                {b.display && <p className="text-xs font-semibold text-p-accent-deep mt-0.5">{b.display}</p>}
                {b.description && <p className="text-xs text-p-text-2 mt-0.5">{b.description}</p>}
              </div>
            </div>
            <div className="mt-auto pt-3">
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
              {b.last_fulfilled_at && !open && <p className="text-[10px] text-p-text-2 mt-1.5">{t('portal.rewards.last_used', 'Last used {{date}}', { date: instantDay(b.last_fulfilled_at, i18n.language, boot?.venue.timezone) })}</p>}
            </div>
          </Card>
        )
      })}
      </div>
    </div>
  )
}
