import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { portalApi, apiMessage } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { PageSkeleton } from '../../ui/Skeleton'
import { offerValueLabel } from './offerLabel'

export function OffersTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['portal-offers'], queryFn: portalApi.offers })
  const claim = useMutation({
    mutationFn: portalApi.claimOffer,
    onSuccess: () => { toast.success(t('portal.rewards.claimed', 'Offer claimed — show it at the desk')); void qc.invalidateQueries({ queryKey: ['portal-offers'] }) },
    onError: e => toast.error(apiMessage(e, t('portal.rewards.claim_failed', 'Could not claim that offer'))),
  })

  if (isLoading) return <PageSkeleton />
  if (isError) return <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>

  const claimed = (data?.personalized ?? []).filter(c => c.offer)
  const claimedIds = new Set(claimed.map(c => c.offer?.id))
  const available = (data?.general ?? []).filter(o => !claimedIds.has(o.id))
  const lang = i18n.language

  return (
    <div className="space-y-6">
      {claimed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-p-text-2 uppercase tracking-wider">{t('portal.rewards.offers_yours', 'Yours to use')}</h2>
          {claimed.map(c => {
            const used = !!c.used_at
            const label = c.offer ? offerValueLabel(c.offer, t) : null
            return (
              <Card key={c.id} className={`p-4 ${used ? 'opacity-60' : 'border-p-accent/40'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">{c.offer?.title}</h3>
                    {c.offer?.description && <p className="text-xs text-p-text-2 mt-0.5 line-clamp-2">{c.offer.description}</p>}
                  </div>
                  {label && <span className="shrink-0 text-sm font-bold text-p-accent-deep">{label}</span>}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-p-text-2">
                  <BadgeCheck size={13} className={used ? '' : 'text-p-success'} aria-hidden />
                  {used ? t('portal.rewards.used_on', 'Used {{date}}', { date: formatDay(c.used_at!, lang) })
                    : c.offer?.end_date ? t('portal.rewards.valid_until', 'Valid until {{date}}', { date: formatDay(c.offer.end_date, lang) })
                    : t('portal.rewards.ready_to_use', 'Ready to use — show this at the desk')}
                </p>
              </Card>
            )
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-p-text-2 uppercase tracking-wider">{t('portal.rewards.offers_available', 'Available to you')}</h2>
        {available.length === 0 ? (
          <EmptyState icon={<Sparkles size={18} aria-hidden />} title={t('portal.rewards.offers_empty', "No offers right now. We'll let you know when something arrives.")} />
        ) : available.map(o => {
          const label = offerValueLabel(o, t)
          const full = o.usage_limit != null && (o.times_used ?? 0) >= o.usage_limit
          return (
            <Card key={o.id} className="overflow-hidden">
              {o.image_url && <img src={o.image_url} alt="" className="w-full h-28 object-cover" loading="lazy" />}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">{o.title}</h3>
                    {o.description && <p className="text-xs text-p-text-2 mt-0.5">{o.description}</p>}
                  </div>
                  {label && <span className="shrink-0 text-sm font-bold text-p-accent-deep">{label}</span>}
                </div>
                {o.end_date && <p className="text-[11px] text-p-text-2 mt-2">{t('portal.rewards.ends', 'Ends {{date}}', { date: formatDay(o.end_date, lang) })}</p>}
                <div className="mt-3">
                  {full ? <p className="text-xs text-p-text-2">{t('portal.rewards.fully_claimed', 'Fully claimed')}</p>
                    : <Button full loading={claim.isPending} onClick={() => claim.mutate(o.id)}>{t('portal.rewards.claim', 'Claim offer')}</Button>}
                </div>
                {o.terms_conditions && <p className="text-[10px] text-p-text-2 mt-2 leading-relaxed">{o.terms_conditions}</p>}
              </div>
            </Card>
          )
        })}
      </section>
    </div>
  )
}
