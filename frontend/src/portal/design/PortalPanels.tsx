import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { usePortal } from '../PortalProvider'
import { PortalPanelsContext, type PortalPanel } from './panels'
import { useProgramme } from './programme'
import { PortalIcon, type PortalIconName } from './PortalIcon'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'
import { formatMoney } from '../lib/money'
import { MemberQr } from '../pages/MemberCard'
import { WalletButtons } from '../pages/WalletButtons'
import { Activity } from '../pages/Activity'
import { Inbox } from '../pages/Inbox'
import { CodesTab } from '../pages/rewards/CodesTab'
import { portalApi } from '../lib/portalApi'
import { counted } from '../lib/plural'
import { membershipPhrase } from '../pages/memberCardMath'

export function PortalPanels({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [panel, setPanel] = useState<PortalPanel>(null)
  const portal = usePortal()
  const failure = (portal.error as { response?: { status?: number; data?: { error?: string } } })?.response
  const portalOff = failure?.status === 403 && failure.data?.error === 'portal_disabled'
  const titles = {
    card: t('portal.design.my_card', 'My card'), earn: t('portal.design.earn_points', 'Earn points'),
    invite: t('portal.profile.invite_title', 'Invite a friend'), activity: t('portal.activity.title', 'Points activity'),
    codes: t('portal.rewards.tab_codes', 'My codes'), updates: t('portal.design.updates', 'Updates'),
  }
  const icons: Record<NonNullable<PortalPanel>, PortalIconName> = { card: 'qr', earn: 'earn', invite: 'invite', activity: 'history', codes: 'ticket', updates: 'bell' }
  return <PortalPanelsContext.Provider value={{ open: setPanel }}>
    {children}
    <div data-portal="" className="contents"><Sheet open={panel !== null && !portalOff} title={panel ? titles[panel] : ''} onClose={() => setPanel(null)} icon={panel && <PortalIcon name={icons[panel]} tile />}>
      <div onClick={e => { if ((e.target as Element).closest('a[href^="/portal/"]')) setPanel(null) }}>
        {panel === 'card' && <CardPanel />}
        {panel === 'earn' && <EarnPanel />}
        {panel === 'invite' && <InvitePanel />}
        {panel === 'activity' && <Activity />}
        {panel === 'codes' && <CodesTab />}
        {panel === 'updates' && <Inbox />}
      </div>
    </Sheet></div>
  </PortalPanelsContext.Provider>
}

function ProgrammeState({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) {
  const { t } = useTranslation()
  if (loading) return <PageSkeleton />
  return error ? <div className="space-y-2"><Notice tone="warning">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" size="sm" onClick={retry}>{t('portal.common.retry', 'Try again')}</Button></div> : null
}

function CardPanel() {
  const { t, i18n } = useTranslation()
  const { data } = usePortal()
  const programme = useProgramme()
  const member = data?.member
  if (!member) return null
  const phrase = membershipPhrase(member.membership, i18n.language)
  return <>
    <div className="p-card-detail">
      <div className="flex items-center justify-between gap-2 text-left"><strong className="text-sm">{member.name}</strong>{member.tier && <span className="p-tier-badge"><PortalIcon name="medal" />{member.tier.name}</span>}</div>
      <MemberQr />
      <p className="font-mono text-sm tracking-widest">{member.member_number}</p>
      <p className="text-xs mt-2">{t('portal.design.show_qr', 'Show your QR code at the venue.')}</p>
      {phrase && <p className={`text-xs mt-2 ${phrase.tone === 'danger' ? 'text-p-danger' : phrase.tone === 'warning' ? 'text-p-warning' : ''}`}>{t(phrase.key, phrase.fallback, phrase.options) as string}</p>}
      {member.membership?.state === 'off' && <p className="text-p-danger text-xs mt-2">{t('portal.design.membership_off', 'Membership inactive. Please contact the venue.')}</p>}
    </div>
    <WalletButtons />
    <ProgrammeState loading={programme.isPending} error={programme.isError} retry={() => { void programme.refetch() }} />
    {!!programme.data?.places.length && <section className="mt-4"><h3 className="font-semibold text-sm">{t('portal.design.your_access', 'Your access')}</h3><div className="p-fact-list">{programme.data.places.map(p => <div className="p-fact" key={p.id}>
      <PortalIcon name={p.granted ? 'door' : 'lock'} tile /><div><p>{p.name}</p><small>{p.granted ? p.description || t('portal.design.access_included', 'Included with your membership') : p.reason === 'tier_not_allowed' && p.allowed_tiers.length > 0 ? t('portal.design.tier_access', '{{tiers}} members', { tiers: p.allowed_tiers.join(' · ') }) : t('portal.design.access_unavailable', 'Access currently unavailable')}</small></div><span className={p.granted ? 'text-p-success' : 'text-p-text-2'}>{p.granted ? <PortalIcon name="check" /> : <PortalIcon name="lock" />}</span>
    </div>)}</div></section>}
    {data?.capabilities.loyalty && <Link to="/portal/rewards?tab=benefits" className="block text-center text-xs text-p-accent-deep mt-4 py-2">{t('portal.rewards.tab_benefits', 'Benefits')} →</Link>}
  </>
}

function EarnPanel() {
  const { t, i18n } = useTranslation()
  const { data: boot } = usePortal()
  const q = useProgramme()
  const e = q.data?.earning
  return <>
    <ProgrammeState loading={q.isPending} error={q.isError} retry={() => { void q.refetch() }} />
    {e && <><div className="p-fact-list mt-0">
      {(e.bookings || e.desk) && <div className="p-fact"><PortalIcon name="coin" tile /><div><p>{t('portal.design.eligible_spend', 'Eligible spend')}</p><small>{t('portal.design.base_rate', '{{points}} points per {{amount}} before level and promotion multipliers', { points: e.base_rate.toLocaleString(i18n.language), amount: formatMoney(1, boot?.venue.currency ?? 'EUR', i18n.language) })}</small></div></div>}
      {e.checkin && <div className="p-fact"><PortalIcon name="door" tile /><div><p>{t('portal.design.checkin', 'Check-in')}</p><small>{t('portal.design.recorded_visit', 'A qualifying visit recorded by the team')}</small></div><span className="text-p-success text-xs">+{e.checkin_points.toLocaleString(i18n.language)} {t('portal.design.pts', 'pts')}</span></div>}
      {e.birthday_points > 0 && <div className="p-fact"><PortalIcon name="birthday" tile /><div><p>{t('portal.profile.birthday', 'Date of birth')}</p><small>{t('portal.design.birthday_hint', 'Add your birthday in Profile to receive your birthday reward.')}</small></div><span className="text-p-success text-xs">+{e.birthday_points.toLocaleString(i18n.language)} {t('portal.design.pts', 'pts')}</span></div>}
    </div><p className="text-xs text-p-text-2 mt-3">{e.expiry_months > 0 ? t('portal.design.expiry', 'Points expire {{months}} months after they are earned.', { months: e.expiry_months }) : t('portal.design.no_expiry', 'Your points do not expire.')}</p></>}
  </>
}

type ReferralReply = Awaited<ReturnType<typeof portalApi.referral>> & { enabled?: boolean; reward_on?: 'first_visit' | 'signup'; referrer_bonus_points?: number; referee_bonus_points?: number }

function InvitePanel() {
  const { t, i18n } = useTranslation()
  const [copied, setCopied] = useState(false)
  const q = useQuery<ReferralReply>({ queryKey: ['portal-referral'], queryFn: portalApi.referral, staleTime: 10_000, refetchOnWindowFocus: true })
  const data = q.data
  const copy = async () => {
    if (!data?.referral_link) return
    try { await navigator.clipboard.writeText(data.referral_link); setCopied(true) }
    catch { toast.error(t('portal.common.error', 'Something went wrong. Please try again.')) }
  }
  return <>
    <ProgrammeState loading={q.isPending} error={q.isError} retry={() => { void q.refetch() }} />
    {data && data.enabled !== false && <>
      <div className="grid grid-cols-2 gap-2">
        {([['portal.design.you', 'You', data.referrer_bonus_points], ['portal.design.friend', 'Your friend', data.referee_bonus_points]] as const).map(([key, fallback, points]) => points != null && <div key={key} className="rounded-p-control p-3 bg-p-success/10 border border-p-success/20"><p className="text-xs">{t(key, fallback)}</p><strong className="text-xl text-p-success">+{points.toLocaleString(i18n.language)} {t('portal.design.pts', 'pts')}</strong></div>)}
      </div>
      <p className="text-xs text-p-text-2 my-3">{data.reward_on === 'signup' ? t('portal.profile.invite_body', "Share your link — you'll both be rewarded when they join.") : t('portal.profile.invite_body_first_visit', "Share your link — you'll both be rewarded after your friend's first visit.")}</p>
      {data.referral_link ? <><label className="p-fact block"><span className="text-xs text-p-text-2">{t('portal.design.invite_link', 'Invite link')}</span><input readOnly value={data.referral_link} onFocus={e => e.currentTarget.select()} className="w-full bg-transparent text-xs mt-1 min-h-8" /></label><div className="flex justify-end mt-3"><Button size="sm" onClick={() => { void copy() }}><PortalIcon name={copied ? 'check' : 'copy'} />{copied ? t('portal.common.copied', 'Copied') : t('portal.design.copy_link', 'Copy link')}</Button></div></> : <Notice>{t('portal.profile.invite_unavailable', 'Referral links are not available yet.')}</Notice>}
      {data.total_referrals > 0 && <p className="text-xs text-p-text-2 mt-2">{counted(t, 'profile.invite_stats', data.total_referrals)}</p>}
    </>}
    {data?.enabled === false && <p>{t('portal.profile.invite_unavailable', 'Referral links are not available yet.')}</p>}
  </>
}
