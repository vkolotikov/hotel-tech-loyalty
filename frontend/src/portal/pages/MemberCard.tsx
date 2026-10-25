import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi } from '../lib/portalApi'
import { formatDay, resolveLocale } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { counted } from '../lib/plural'
import type { PortalMember } from '../lib/types'
import { Card } from '../ui/Card'
import { WalletButtons } from './WalletButtons'

/** A phrase as a translation call takes it: the key, the English, and what it fills in. */
export interface CardPhrase {
  key: string
  fallback: string
  options: Record<string, unknown>
}

/** Release 8's count phrases, each agreeing with its number (four plural forms in every bundle, as lib/plural.ts). */
export const CARD_COUNTED = {
  visits_to_go: ['{{count}} more visit to go', '{{count}} more visits to go'],
} as const satisfies Record<string, readonly [string, string]>

/** The member summary's progress as release 8 sends it: the measure and what is still needed on it, beside the old keys. */
export type CardProgress = PortalMember['progress'] & { by?: 'points' | 'visits' | 'spend'; needed?: number }

/**
 * What the progress line's right side says, in the programme's terms (release 8, spec 2026-10-25 §3): "1,250 points to
 * go", "3 more visits to go", "€120 to go". The measure and the numbers are the server's; a summary without `by` is
 * points, as before.
 */
export function toGoPhrase(progress: CardProgress, currency: string, locale: string): CardPhrase | null {
  if (progress.by === 'visits') {
    const n = progress.needed ?? progress.points_needed
    return { key: 'portal.home.visits_to_go', fallback: CARD_COUNTED.visits_to_go[1], options: { count: n, defaultValue_one: CARD_COUNTED.visits_to_go[0] } }
  }
  if (progress.by === 'spend') {
    return { key: 'portal.home.spend_to_go', fallback: '{{amount}} to go', options: { amount: formatMoney(progress.needed ?? progress.points_needed, currency, locale) } }
  }
  return null
}

/**
 * The membership's line (release 8, spec 2026-10-25 §3, R8-2): "Member until 3 Oct 2027", or "Your membership ended on
 * 3 Oct 2026 — ask the team to renew". Nothing for a membership without an end date, or an account that is switched
 * off. The date and the state are the server's (MembershipValidity), the day written in the member's language.
 */
export function membershipPhrase(membership: PortalMember['membership'], locale: string): CardPhrase | null {
  if (!membership?.valid_until || membership.state === 'off') return null
  const day = formatDay(membership.valid_until, locale)
  return membership.state === 'expired'
    ? { key: 'portal.home.membership_ended', fallback: 'Your membership ended on {{day}} — ask the team to renew', options: { day } }
    : { key: 'portal.home.membership_until', fallback: 'Member until {{day}}', options: { day } }
}

/**
 * The portal's signature element and the thing shown at the desk. Dark in
 * both modes (Card tone="spotlight"), the tier colour on the chip and the
 * progress bar and nowhere else, the QR on white because scanners need it
 * that way. Release 8: until when the membership holds, and the progress in
 * the programme's terms.
 */
export function MemberCard({ member, loyalty, currency = 'EUR' }: { member: PortalMember; loyalty: boolean; currency?: string }) {
  const { t, i18n } = useTranslation()
  const say = (p: CardPhrase) => t(p.key, p.fallback, p.options) as string
  const membership = membershipPhrase(member.membership, i18n.language)
  const toGo = member.progress ? toGoPhrase(member.progress as CardProgress, currency, i18n.language) : null
  const { data: card } = useQuery({ queryKey: ['portal-card'], queryFn: portalApi.card, staleTime: Infinity })
  const tierColor = member.tier?.color_hex || undefined
  // Explicit locale, never the host's default (dates.ts explains why): the
  // OS running the server or a dev's machine must never change a member's
  // number formatting.
  const locale = resolveLocale(i18n.language)

  return (
    <Card tone="spotlight" className="p-5 p-rise">
      <div className="flex items-start justify-between gap-4">
        <div>
          {loyalty ? (
            <>
              <p className="text-[11px] uppercase tracking-widest text-p-text-2">{t('portal.home.balance', 'Points balance')}</p>
              <p className="font-p-display text-5xl leading-tight tabular-nums text-p-text">{member.current_points.toLocaleString(locale)}</p>
              <p className="text-[11px] text-p-text-2 mt-1">{counted(t, 'home.lifetime', member.lifetime_points)}</p>
            </>
          ) : (
            <p className="font-p-display text-2xl leading-tight text-p-text">{member.name}</p>
          )}
          {membership && (
            <p data-membership={member.membership?.state} className={`text-[11px] mt-1 ${member.membership?.state === 'expired' ? 'text-p-danger font-semibold' : 'text-p-text-2'}`}>
              {say(membership)}
            </p>
          )}
        </div>
        {loyalty && member.tier && (
          <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border border-p-border text-p-text" style={tierColor ? { color: tierColor, borderColor: `${tierColor}66`, background: `${tierColor}1f` } : undefined}>
            {member.tier.name}
          </span>
        )}
      </div>

      {loyalty && member.progress?.next_tier && (
        <div className="mt-5">
          <div className="flex justify-between text-[11px] text-p-text-2 mb-1.5">
            <span>{t('portal.home.progress_to', 'Progress to {{tier}}', { tier: member.progress.next_tier.name })}</span>
            <span className="tabular-nums">{toGo ? say(toGo) : counted(t, 'home.points_to_go', member.progress.points_needed)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-p-surface-2 overflow-hidden" role="progressbar" aria-valuenow={member.progress.percentage} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(member.progress.percentage, 2)}%`, background: tierColor || 'rgb(var(--p-accent))' }} />
          </div>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-p-border flex items-center gap-4">
        {(card?.qr_svg || card?.qr_image) && (
          // White in both modes because scanners need it so — a literal, not a token, on purpose.
          <div className="rounded-lg p-1.5 shrink-0" style={{ background: '#ffffff' }}>
            {card.qr_svg
              // Generated server-side by our own QR library from the member number; no user input reaches it.
              ? <div className="w-20 h-20 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: card.qr_svg }} />
              : <img src={card.qr_image!} alt="" className="w-20 h-20" />}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-p-text-2">{t('portal.home.member_number', 'Member number')}</p>
          <p className="font-mono text-sm font-semibold truncate text-p-text">{member.member_number}</p>
          <p className="text-[11px] text-p-text-2 mt-1">{t('portal.home.show_at_counter', 'Show this at the counter to earn or redeem.')}</p>
        </div>
      </div>

      {loyalty && <WalletButtons />}
    </Card>
  )
}
