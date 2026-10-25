import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, ChevronRight, CircleAlert, Crown, TrendingUp } from 'lucide-react'
import { portalApi } from '../lib/portalApi'
import { resolveLocale } from '../lib/dates'
import { counted } from '../lib/plural'
import type { PortalMember } from '../lib/types'
import { Card } from '../ui/Card'
import { WalletButtons } from './WalletButtons'
import { benefitChips, benefitIcon } from './rewards/benefitIcon'
import { membershipPhrase, tierTone, toGoPhrase, type CardPhrase, type CardProgress } from './memberCardMath'

/**
 * The portal's signature element and the thing shown at the desk. Dark in both modes (Card tone="spotlight"): the
 * balance, the level and what it gives, the progress to the next one, and the QR on white because scanners need it
 * that way. On a wide screen the QR stands in its own column. Release 8: until when the membership holds, and the
 * progress in the programme's terms.
 */
export function MemberCard({ member, loyalty, currency = 'EUR' }: { member: PortalMember; loyalty: boolean; currency?: string }) {
  const { t, i18n } = useTranslation()
  const say = (p: CardPhrase) => t(p.key, p.fallback, p.options) as string
  const lang = i18n.language
  const membership = membershipPhrase(member.membership, lang)
  const toGo = member.progress ? toGoPhrase(member.progress as CardProgress, currency, lang) : null
  const { data: card } = useQuery({ queryKey: ['portal-card'], queryFn: portalApi.card, staleTime: Infinity })
  const tone = tierTone(member.tier?.color_hex)
  // Explicit locale, never the host's default (dates.ts explains why): the OS running the server or a dev's machine
  // must never change a member's number formatting.
  const locale = resolveLocale(lang)
  const chips = loyalty ? benefitChips(member.benefits) : { shown: [], more: 0 }
  const MembershipIcon = membership?.tone === 'muted' ? CalendarCheck : CircleAlert

  return (
    <Card tone="spotlight" className="p-5 p-rise">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {loyalty ? (
                <>
                  <p className="text-[11px] uppercase tracking-widest text-p-text-2">{t('portal.home.balance', 'Points balance')}</p>
                  <p className="font-p-display text-5xl leading-tight tabular-nums text-p-text">{member.current_points.toLocaleString(locale)}</p>
                </>
              ) : (
                <p className="font-p-display text-2xl leading-tight text-p-text">{member.name}</p>
              )}
            </div>
            {loyalty && member.tier && (
              <span data-tier="" className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-p-border bg-p-surface-2 text-p-text"
                style={tone ? { borderColor: tone } : undefined}>
                <Crown size={12} aria-hidden style={tone ? { color: tone } : undefined} />
                {member.tier.name}
              </span>
            )}
          </div>

          {(loyalty || membership) && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              {loyalty && (
                <span className="inline-flex items-center gap-1 text-p-text-2 tabular-nums"><TrendingUp size={12} aria-hidden />{counted(t, 'home.lifetime', member.lifetime_points, lang)}</span>
              )}
              {membership && (
                <span data-membership={member.membership?.state}
                  className={`inline-flex items-center gap-1 ${membership.tone === 'danger' ? 'text-p-danger font-semibold' : membership.tone === 'warning' ? 'text-p-warning font-semibold' : 'text-p-text-2'}`}>
                  <MembershipIcon size={12} aria-hidden />{say(membership)}
                </span>
              )}
            </div>
          )}

          {loyalty && member.progress?.next_tier && (
            <div className="mt-5">
              <div className="flex justify-between gap-3 text-[11px] text-p-text-2 mb-1.5">
                <span>{t('portal.home.progress_to', 'Progress to {{tier}}', { tier: member.progress.next_tier.name })}</span>
                <span className="tabular-nums text-right">{toGo ? say(toGo) : counted(t, 'home.points_to_go', member.progress.points_needed, lang)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-p-surface-2 overflow-hidden" role="progressbar" aria-valuenow={member.progress.percentage} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(member.progress.percentage, 2)}%`, background: tone ?? 'rgb(var(--p-accent))' }} />
              </div>
            </div>
          )}

          {chips.shown.length > 0 && (
            <Link to="/portal/rewards?tab=benefits" data-benefits="" className="group mt-5 block rounded-p-control -mx-1 px-1 py-1 hover:bg-p-surface-2/60">
              <span className="flex items-center justify-between gap-3 text-[11px] text-p-text-2 mb-2">
                <span className="uppercase tracking-widest">
                  {member.tier ? t('portal.home.benefits', 'Your {{tier}} benefits', { tier: member.tier.name }) : t('portal.rewards.tab_benefits', 'Benefits')}
                </span>
                <span className="inline-flex items-center gap-0.5 text-p-accent-deep font-semibold">{t('portal.common.see_all', 'See all')}<ChevronRight size={12} aria-hidden /></span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {chips.shown.map(b => {
                  const Icon = benefitIcon(b.category)
                  return (
                    <span key={b.id} title={b.display ?? undefined} className="inline-flex items-center gap-1.5 max-w-full rounded-full bg-p-surface-2 border border-p-border px-2.5 py-1 text-xs text-p-text">
                      <Icon size={13} aria-hidden className="shrink-0 text-p-accent-deep" /><span className="truncate">{b.name}</span>
                    </span>
                  )
                })}
                {chips.more > 0 && <span className="inline-flex items-center rounded-full bg-p-surface-2 border border-p-border px-2.5 py-1 text-xs text-p-text-2 tabular-nums">+{chips.more.toLocaleString(locale)}</span>}
              </span>
            </Link>
          )}
        </div>

        <div className="pt-4 border-t border-p-border sm:pt-0 sm:border-t-0 sm:pl-5 sm:border-l flex flex-col justify-center">
          <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:text-center sm:gap-2">
            {(card?.qr_svg || card?.qr_image) && (
              // White in both modes because scanners need it so — a literal, not a token, on purpose.
              <div className="rounded-lg p-1.5 shrink-0" style={{ background: '#ffffff' }}>
                {card.qr_svg
                  // Generated server-side by our own QR library from the member number; no user input reaches it.
                  ? <div className="w-20 h-20 sm:w-24 sm:h-24 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: card.qr_svg }} />
                  : <img src={card.qr_image!} alt="" className="w-20 h-20 sm:w-24 sm:h-24" />}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-p-text-2">{t('portal.home.member_number', 'Member number')}</p>
              <p className="font-mono text-sm font-semibold truncate text-p-text">{member.member_number}</p>
            </div>
          </div>
          {loyalty && <WalletButtons />}
        </div>
      </div>
    </Card>
  )
}
