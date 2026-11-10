import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi } from '../lib/portalApi'
import { formatDay, resolveLocale } from '../lib/dates'
import { counted } from '../lib/plural'
import type { PortalMember } from '../lib/types'
import { PortalIcon } from '../design/PortalIcon'
import { usePortalPanels } from '../design/panels'
import linework from '../design/assets/3e0f5.svg'
import mobileLinework from '../design/assets/4f991.svg'
import { membershipPhrase, toGoPhrase, type CardPhrase, type CardProgress } from './memberCardMath'

export function MemberCard({ member, loyalty, currency = 'EUR' }: { member: PortalMember; loyalty: boolean; currency?: string }) {
  const { t, i18n } = useTranslation()
  const panels = usePortalPanels()
  const say = (p: CardPhrase) => t(p.key, p.fallback, p.options) as string
  const membership = membershipPhrase(member.membership, i18n.language)
  const toGo = member.progress ? toGoPhrase(member.progress as CardProgress, currency, i18n.language) : null
  const showMembership = loyalty || member.membership_mode === 'assigned'
  return (
    <div data-portal="" data-portal-theme="dark" className="p-member-card p-rise">
      <picture className="p-member-linework" aria-hidden><source media="(max-width: 767px)" srcSet={mobileLinework} /><img src={linework} alt="" /></picture>
      <div className="p-member-info">
        <div className="p-member-top">
          {showMembership && member.tier && <span data-tier="" className="p-tier-badge"><PortalIcon name="medal" />{member.tier.name}</span>}
          <span className="p-member-label">{t('portal.shell.membership', 'My membership')}</span>
        </div>
        {loyalty ? <>
          <p className="p-member-label">{t('portal.home.balance', 'Points balance')}</p>
          <p className="p-member-balance">{member.current_points.toLocaleString(resolveLocale(i18n.language))}<small>{t('portal.common.points', 'points')}</small></p>
          <span className="sr-only">{counted(t, 'home.lifetime', member.lifetime_points, i18n.language)}</span>
        </> : <p className="p-member-balance text-2xl">{member.name}</p>}
        {loyalty && member.progress?.next_tier && <div className="p-member-progress">
          <p>{t('portal.home.progress_to', 'Progress to {{tier}}', { tier: member.progress.next_tier.name })}<span className="block text-p-text-2 mt-1">{toGo ? say(toGo) : counted(t, 'home.points_to_go', member.progress.points_needed, i18n.language)}</span></p>
          <div role="progressbar" aria-label={t('portal.home.progress_to', 'Progress to {{tier}}', { tier: member.progress.next_tier.name })} aria-valuenow={member.progress.percentage} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.max(0, Math.min(100, member.progress.percentage))}%` }} /></div>
        </div>}
        {member.membership?.state === 'off' && <p className="p-member-state text-p-danger">{t('portal.design.membership_off', 'Membership inactive. Please contact the venue.')}</p>}
        {membership && <p data-membership={member.membership?.state} className={`p-member-state ${membership.tone === 'danger' ? 'text-p-danger' : membership.tone === 'warning' ? 'text-p-warning' : 'text-p-text-2'}`}>{say(membership)}</p>}
        {member.membership?.valid_from && member.membership.state !== 'scheduled' && <p className="p-member-state text-p-text-2">{t('portal.home.membership_from', 'Member from {{day}}', { day: formatDay(member.membership.valid_from, i18n.language) })}</p>}
      </div>
      <div className="p-member-qr">
        <MemberQr />
        <button type="button" className="p-qr-button" onClick={() => panels.open('card')}><PortalIcon name="expand" />{t('portal.design.enlarge', 'Enlarge')}</button>
        <p className="text-[10px] text-p-text-2 font-mono">{member.member_number}</p>
      </div>
    </div>
  )
}

/** A genuine server-issued QR, never the illustrative code from the mockup. */
export function MemberQr() {
  const { t } = useTranslation()
  const { data: card, isError, refetch } = useQuery({ queryKey: ['portal-card'], queryFn: portalApi.card, staleTime: 60_000, refetchOnWindowFocus: true })
  if (!card?.qr_svg && !card?.qr_image) return <div className="p-qr">{isError ? <button type="button" onClick={() => { void refetch() }} className="text-xs">{t('portal.common.retry', 'Try again')}</button> : <span className="text-xs">{t('portal.common.loading', 'Loading…')}</span>}</div>
  return <div className="p-qr" role="img" aria-label={t('portal.design.member_qr', 'Membership QR code')}>{card.qr_svg ? <div dangerouslySetInnerHTML={{ __html: card.qr_svg }} /> : <img src={card.qr_image!} alt="" />}</div>
}

