import { useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { usePortal } from '../PortalProvider'
import { portalApi, apiMessage, apiErrorCode } from '../lib/portalApi'
import type { Reward } from '../lib/types'
import { counted } from '../lib/plural'
import { formatDay } from '../lib/dates'
import { PortalIcon } from '../design/PortalIcon'
import { usePortalPanels } from '../design/panels'
import { Button } from '../ui/Button'
import { Sheet } from '../ui/Sheet'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { CodesTab } from './rewards/CodesTab'
import { EventsLink } from './events/EventsLink'
import { claimedMessage, offerPerkNote, offerValueLabel, paysPointsOnClaim } from './rewards/offerLabel'
import benefitArt from '../design/assets/227e3.svg'
import rewardArt from '../design/assets/668a2.svg'
import offerArt from '../design/assets/e7911.svg'

type Item = { key: string; kind: 'benefit' | 'reward' | 'offer'; title: string; body: string | null | undefined; figure: string; image?: string | null; ready: boolean; action: ReactNode; note?: string | null; terms?: string | null }
const ART = { benefit: benefitArt, reward: rewardArt, offer: offerArt }

export function Rewards() {
  const { t, i18n } = useTranslation()
  const { data: boot } = usePortal()
  const panels = usePortalPanels()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [confirming, setConfirming] = useState<Reward | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const redemptionInFlight = useRef(false)
  const benefits = useQuery({ queryKey: ['portal-benefits'], queryFn: portalApi.benefits, staleTime: 10_000, refetchOnWindowFocus: true })
  const rewards = useQuery({ queryKey: ['portal-rewards'], queryFn: portalApi.rewards, staleTime: 10_000, refetchOnWindowFocus: true })
  const offers = useQuery({ queryKey: ['portal-offers'], queryFn: portalApi.offers, staleTime: 10_000, refetchOnWindowFocus: true })
  const errorMessage = (error: unknown, fallback: string) => {
    const c = apiErrorCode(error)
    return c === 'membership_not_started' || c === 'membership_expired' ? t(`portal.rewards.${c}`) : apiMessage(error, fallback)
  }
  const request = useMutation({
    mutationFn: portalApi.requestBenefit,
    onSuccess: () => { toast.success(t('portal.rewards.request_sent', 'Requested')); void qc.invalidateQueries({ queryKey: ['portal-benefits'] }) },
    onError: e => toast.error(errorMessage(e, t('portal.rewards.request_failed', 'Could not send that request'))),
  })
  const cancel = useMutation({
    mutationFn: portalApi.cancelBenefitRequest,
    onSuccess: () => { toast.success(t('portal.rewards.request_cancelled', 'Request cancelled')); void qc.invalidateQueries({ queryKey: ['portal-benefits'] }) },
    onError: e => toast.error(errorMessage(e, t('portal.rewards.request_failed', 'Could not send that request'))),
  })
  const redeem = useMutation({
    mutationFn: portalApi.redeem,
    onSuccess: res => {
      setConfirming(null); setCode(res.redemption.code)
      for (const key of ['portal-rewards', 'portal-bootstrap', 'portal-redemptions', 'portal-activity']) void qc.invalidateQueries({ queryKey: [key] })
    },
    onError: () => { void qc.invalidateQueries({ queryKey: ['portal-rewards'] }) },
    onSettled: () => { redemptionInFlight.current = false },
  })
  const claim = useMutation({
    mutationFn: portalApi.claimOffer,
    onSuccess: reply => {
      toast.success(claimedMessage(reply, t, i18n.language))
      void qc.invalidateQueries({ queryKey: ['portal-offers'] })
      if (Number(reply?.points_awarded ?? 0) > 0) for (const key of ['portal-bootstrap', 'portal-rewards', 'portal-activity']) void qc.invalidateQueries({ queryKey: [key] })
    },
    onError: e => toast.error(errorMessage(e, t('portal.rewards.claim_failed', 'Could not claim that offer'))),
  })
  const balance = rewards.data?.current_points ?? boot?.member?.current_points ?? 0
  const items: Item[] = []
  for (const b of benefits.data?.benefits ?? []) {
    const open = b.request
    items.push({
      key: `benefit-${b.tier_benefit_id}`, kind: 'benefit', title: b.name, body: b.description ?? b.display,
      figure: t('portal.design.included', 'Included'), ready: !open, note: b.display,
      action: open ? <div className="text-xs text-p-text-2"><p>{open.status === 'approved' ? t('portal.rewards.approved', 'Approved — ready when you are') : t('portal.rewards.requested', 'Requested — the venue will confirm')}</p>{(open.status === 'pending' || open.status === 'eligible') && <Button variant="ghost" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate(open.id)}>{t('portal.rewards.cancel_request', 'Cancel request')}</Button>}</div>
        : b.requestable ? <Button size="sm" loading={request.isPending} onClick={() => request.mutate(b.tier_benefit_id)}>{t('portal.rewards.request', 'Request this')}</Button>
          : <Button variant="secondary" size="sm" onClick={() => panels.open('card')}><PortalIcon name="qr" />{t('portal.design.show_card', 'Show card')}</Button>,
      terms: !b.requestable && !open ? b.fulfillment_mode === 'voucher' ? t('portal.rewards.voucher', 'Issued as a voucher — ask at the desk') : t('portal.rewards.automatic', 'Applied automatically') : null,
    })
  }
  for (const r of rewards.data?.rewards ?? []) {
    const ready = r.can_afford && r.remaining_for_me !== 0 && r.in_stock !== false
    const note = r.remaining_for_me === 0 ? t('portal.rewards.already_claimed', 'Already claimed') : r.in_stock === false ? t('portal.rewards.out_of_stock', 'Out of stock') : !r.can_afford ? counted(t, 'rewards.points_needed', Math.max(1, r.points_cost - balance), i18n.language) : null
    items.push({ key: `reward-${r.id}`, kind: 'reward', title: r.name, body: r.description, image: r.image_url, ready, figure: `${r.points_cost.toLocaleString(i18n.language)} ${t('portal.design.pts', 'pts')}`, note,
      action: ready ? <Button size="sm" onClick={() => { redeem.reset(); setConfirming(r) }}>{t('portal.rewards.redeem', 'Redeem')} <PortalIcon name="arrow" /></Button> : <span className="text-xs text-p-text-2">{note}</span> })
  }
  const claimedIds = new Set(offers.data?.personalized.map(c => c.offer?.id))
  for (const o of (offers.data?.general ?? []).filter(o => !claimedIds.has(o.id))) {
    const full = o.usage_limit != null && (o.times_used ?? 0) >= o.usage_limit
    items.push({ key: `offer-${o.id}`, kind: 'offer', title: o.title, body: o.description, image: o.image_url, ready: !full,
      figure: offerValueLabel(o, t, { currency: boot?.venue.currency, locale: i18n.language }) ?? t('portal.design.member_offer', 'Member offer'), terms: o.terms_conditions,
      note: o.end_date ? t('portal.rewards.ends', 'Ends {{date}}', { date: formatDay(o.end_date, i18n.language) }) : offerPerkNote(o, t),
      action: full ? <span className="text-xs text-p-text-2">{t('portal.rewards.fully_claimed', 'Fully claimed')}</span> : <Button size="sm" variant="secondary" loading={claim.isPending} onClick={() => claim.mutate(o.id)}>{t('portal.rewards.claim', 'Claim offer')}</Button>,
    })
  }
  for (const c of offers.data?.personalized ?? []) if (c.offer) items.push({
    key: `claim-${c.id}`, kind: 'offer', title: c.offer.title, body: c.offer.description, ready: false,
    figure: offerValueLabel(c.offer, t, { currency: boot?.venue.currency, locale: i18n.language }) ?? t('portal.design.member_offer', 'Member offer'),
    note: c.used_at ? paysPointsOnClaim(c.offer) ? t('portal.rewards.points_added_on', 'Points added {{date}}', { date: formatDay(c.used_at, i18n.language) }) : t('portal.rewards.used_on', 'Used {{date}}', { date: formatDay(c.used_at, i18n.language) }) : c.usable_now === false ? t('portal.rewards.offer_membership_unavailable', 'This offer needs an active membership at its required level.') : t('portal.rewards.ready_to_use', 'Ready to use — show this at the desk'),
    action: !c.used_at && c.usable_now !== false ? <Button variant="secondary" size="sm" onClick={() => panels.open('card')}>{t('portal.design.show_card', 'Show card')}</Button> : null,
  })
  const order = params.get('tab') === 'catalogue' ? ['reward', 'benefit', 'offer'] : params.get('tab') === 'offers' ? ['offer', 'benefit', 'reward'] : ['benefit', 'reward', 'offer']
  const featured = order.flatMap(kind => { const first = items.find(i => i.kind === kind && i.ready); return first ? [first] : [] })
  const featuredIds = new Set(featured.map(i => i.key))
  const more = items.filter(i => !featuredIds.has(i.key))
  const queryError = benefits.isError || rewards.isError || offers.isError
  const loading = benefits.isPending || rewards.isPending || offers.isPending
  return <div>
    <div className="p-page-heading"><h1>{t('portal.rewards.title', 'Rewards')}</h1><div className="p-reward-header-actions"><span className="p-count-badge"><PortalIcon name="coin" />{counted(t, 'rewards.you_have', balance, i18n.language)}</span><Button variant="secondary" size="sm" onClick={() => panels.open('codes')}><PortalIcon name="ticket" />{t('portal.rewards.tab_codes', 'My codes')}</Button></div></div>
    {queryError && <div className="space-y-2 mb-4"><Notice tone="warning">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" size="sm" onClick={() => { void benefits.refetch(); void rewards.refetch(); void offers.refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>}
    {loading && items.length === 0 && <PageSkeleton />}
    {featured.length > 0 && <section><h2 className="p-section-heading">{t('portal.design.available_now', 'Available now')}</h2><div className="p-reward-grid">{featured.map(item => <RewardCard key={item.key} item={item} />)}</div></section>}
    {more.length > 0 && <section className="mt-6"><h2 className="p-section-heading">{t('portal.design.more_rewards', 'More rewards')}</h2><div className="p-more-rewards">{more.map(item => <RewardCard key={item.key} item={item} compact />)}</div></section>}
    {!loading && !queryError && items.length === 0 && <EmptyState title={t('portal.rewards.catalogue_empty', 'No rewards are available right now. Check back soon.')} />}
    <div className="mt-4"><EventsLink /></div>
    <Sheet open={!!confirming} busy={redeem.isPending} onClose={() => setConfirming(null)} title={t('portal.design.use_points', 'Use {{points}} points?', { points: confirming?.points_cost.toLocaleString(i18n.language) ?? '' })} icon={<PortalIcon name="ticket" tile />} footer={<><Button variant="ghost" disabled={redeem.isPending} onClick={() => setConfirming(null)}>{t('portal.common.cancel', 'Cancel')}</Button><Button loading={redeem.isPending} onClick={() => { if (confirming && !redemptionInFlight.current) { redemptionInFlight.current = true; redeem.mutate(confirming.id) } }}>{t('portal.rewards.redeem', 'Redeem')}</Button></>}>
      <strong>{confirming?.name}</strong>{confirming?.description && <p className="text-p-text-2 text-xs mt-1">{confirming.description}</p>}
      <p className="p-fact mt-3">{counted(t, 'rewards.redeem_body', confirming?.points_cost ?? 0, i18n.language)}</p>
      {redeem.isError && <Notice tone="danger">{apiMessage(redeem.error, t('portal.rewards.redeem_failed', 'Could not redeem that reward'))}</Notice>}
    </Sheet>
    <Sheet open={!!code} onClose={() => setCode(null)} title={t('portal.design.code_ready', 'Code ready')} icon={<PortalIcon name="ticket" tile />} footer={<Button size="sm" onClick={() => setCode(null)}>{t('portal.design.done', 'Done')}</Button>}>
      <div className="p-code-ready"><p className="font-semibold mb-3">{redeem.data?.redemption.reward?.name ?? rewards.data?.rewards.find(r => r.id === redeem.variables)?.name}</p><strong className="font-mono tracking-widest text-2xl">{code}</strong><p className="text-xs mt-3">{t('portal.rewards.codes_hint', 'Each code works once. The venue marks it used when you present it.')}</p></div>
      <p className="text-xs text-p-text-2 mt-3">{t('portal.design.code_saved', 'Saved in My codes. You can find it there anytime.')}</p>
    </Sheet>
    <Sheet open={params.get('tab') === 'codes'} onClose={() => { const next = new URLSearchParams(params); next.delete('tab'); setParams(next, { replace: true }) }} title={t('portal.rewards.tab_codes', 'My codes')} icon={<PortalIcon name="ticket" tile />}><CodesTab /></Sheet>
  </div>
}

function RewardCard({ item: i, compact = false }: { item: Item; compact?: boolean }) {
  const { t } = useTranslation()
  const category = i.kind === 'benefit' ? t('portal.design.tier_perk', 'Tier perk') : i.kind === 'reward' ? t('portal.design.points_reward', 'Points reward') : t('portal.design.member_offer', 'Member offer')
  return <article className={`p-reward-card p-reward-${i.kind} ${compact ? 'p-reward-compact' : ''}`}>
    <div className="p-reward-art">{i.image ? <img className="p-reward-dynamic-image" src={i.image} alt="" loading="lazy" onError={e => { e.currentTarget.hidden = true }} /> : <img className="p-reward-illustration" src={ART[i.kind]} alt="" />}<div><small>{category}</small><strong>{i.figure}</strong></div></div>
    <div className="p-reward-copy"><PortalIcon name={i.kind === 'benefit' ? 'rewards' : 'ticket'} tile /><div className="p-reward-text"><h3>{i.title}</h3>{i.body && <p>{i.body}</p>}{i.note && i.note !== i.body && <p className="p-reward-note">{i.note}</p>}{i.terms && <details className="p-reward-terms"><summary>{t('portal.design.details', 'Details')}</summary><p>{i.terms}</p></details>}</div><div className="p-reward-action">{i.action}</div></div>
  </article>
}

