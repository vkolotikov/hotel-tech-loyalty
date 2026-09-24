import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi } from '../lib/portalApi'
import { resolveLocale } from '../lib/dates'
import type { PortalMember } from '../lib/types'
import { Card } from '../ui/Card'
import { WalletButtons } from './WalletButtons'

/**
 * The portal's signature element and the thing shown at the desk. Dark in
 * both modes (Card tone="spotlight"), the tier colour on the chip and the
 * progress bar and nowhere else, the QR on white because scanners need it
 * that way.
 */
export function MemberCard({ member, loyalty }: { member: PortalMember; loyalty: boolean }) {
  const { t, i18n } = useTranslation()
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
              <p className="text-[11px] text-p-text-2 mt-1">{t('portal.home.lifetime', '{{count}} earned all time', { count: member.lifetime_points })}</p>
            </>
          ) : (
            <p className="font-p-display text-2xl leading-tight text-p-text">{member.name}</p>
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
            <span className="tabular-nums">{t('portal.home.points_to_go', '{{count}} points to go', { count: member.progress.points_needed })}</span>
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
