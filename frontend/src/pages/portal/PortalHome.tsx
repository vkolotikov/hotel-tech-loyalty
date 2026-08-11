import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Loader2, TicketPercent, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'

/**
 * The member's own view of their membership.
 *
 * First screenful answers the three questions a member actually opens the
 * app for: how many points do I have, what tier am I, and what do I show
 * at the counter. Everything else is one tap away.
 */

interface Tier { id: number; name: string; color_hex?: string | null }

interface Summary {
  member_number: string
  current_points: number
  lifetime_points: number
  tier: Tier | null
  member_since: string
  referral_code?: string | null
  progress: { percentage: number; points_needed: number; next_tier: Tier | null }
  recent_activity: Array<{
    id: number
    points: number
    description: string
    created_at: string
    type: string
  }>
}

interface CardPayload {
  member_number: string
  qr_svg?: string | null
  qr_image?: string | null
}

export function PortalHome() {
  const { data, isLoading, isError, refetch } = useQuery<{ member: Summary }>({
    queryKey: ['portal-profile'],
    queryFn: () => api.get('/v1/member/profile').then(r => r.data),
  })

  const { data: card } = useQuery<CardPayload>({
    queryKey: ['portal-card'],
    queryFn: () => api.get('/v1/member/card').then(r => r.data),
    // The QR encodes a permanent member number — no reason to refetch it.
    staleTime: Infinity,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-t-secondary">
        <Loader2 className="animate-spin" size={22} />
      </div>
    )
  }

  if (isError || !data?.member) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-6 text-center">
        <p className="text-sm text-t-secondary mb-3">We couldn't load your membership just now.</p>
        <button
          onClick={() => refetch()}
          className="text-sm font-semibold text-primary-400 hover:text-primary-300"
        >
          Try again
        </button>
      </div>
    )
  }

  const m = data.member
  const tierColor = m.tier?.color_hex || undefined

  return (
    <div className="space-y-5">
      {/* The card. Signature element of the whole portal — this is the
          thing a member holds up at the counter. */}
      <section
        className="relative overflow-hidden rounded-2xl border border-dark-border2 p-5
                   bg-gradient-to-br from-dark-surface2 to-dark-surface"
        style={tierColor ? { borderColor: `${tierColor}55` } : undefined}
      >
        <div
          aria-hidden
          className="absolute -top-24 -right-16 w-56 h-56 rounded-full blur-3xl opacity-20"
          style={{ background: tierColor || 'rgb(var(--color-primary-500))' }}
        />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-t-secondary">Points balance</p>
            <p className="text-5xl font-bold tabular-nums leading-tight">
              {m.current_points.toLocaleString()}
            </p>
            <p className="text-[11px] text-t-secondary mt-1">
              {m.lifetime_points.toLocaleString()} earned all time
            </p>
          </div>

          {m.tier && (
            <span
              className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border"
              style={{
                color: tierColor || undefined,
                borderColor: tierColor ? `${tierColor}66` : undefined,
                background: tierColor ? `${tierColor}1f` : undefined,
              }}
            >
              {m.tier.name}
            </span>
          )}
        </div>

        {m.progress?.next_tier && (
          <div className="relative mt-5">
            <div className="flex justify-between text-[11px] text-t-secondary mb-1.5">
              <span>Progress to {m.progress.next_tier.name}</span>
              <span className="tabular-nums">
                {m.progress.points_needed.toLocaleString()} points to go
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-dark-surface3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.max(m.progress.percentage, 2)}%`,
                  background: tierColor || 'rgb(var(--color-primary-500))',
                }}
              />
            </div>
          </div>
        )}

        <div className="relative mt-5 pt-4 border-t border-dark-border flex items-center gap-4">
          {(card?.qr_svg || card?.qr_image) && (
            <div className="bg-white rounded-lg p-1.5 shrink-0">
              {card.qr_svg ? (
                <div
                  className="w-20 h-20 [&>svg]:w-full [&>svg]:h-full"
                  // The SVG is generated server-side by our own QR library
                  // from the member number; no user input reaches it.
                  dangerouslySetInnerHTML={{ __html: card.qr_svg }}
                />
              ) : (
                <img src={card.qr_image!} alt="Your membership QR code" className="w-20 h-20" />
              )}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-t-secondary">Member number</p>
            <p className="font-mono text-sm font-semibold truncate">{m.member_number}</p>
            <p className="text-[11px] text-t-secondary mt-1">
              Show this at the counter to earn or redeem.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/portal/rewards"
          className="rounded-xl border border-dark-border bg-dark-surface p-4 hover:border-primary-500/50 transition-colors"
        >
          <TicketPercent size={18} className="text-primary-400 mb-2" />
          <p className="text-sm font-semibold">Spend points</p>
          <p className="text-[11px] text-t-secondary">Browse the rewards catalogue</p>
        </Link>
        <Link
          to="/portal/offers"
          className="rounded-xl border border-dark-border bg-dark-surface p-4 hover:border-primary-500/50 transition-colors"
        >
          <Sparkles size={18} className="text-primary-400 mb-2" />
          <p className="text-sm font-semibold">Your offers</p>
          <p className="text-[11px] text-t-secondary">Discounts available to you</p>
        </Link>
      </div>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <Link
            to="/portal/activity"
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
          >
            See all <ArrowRight size={12} />
          </Link>
        </div>

        {m.recent_activity?.length ? (
          <ul className="rounded-xl border border-dark-border overflow-hidden divide-y divide-dark-border">
            {m.recent_activity.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-dark-surface">
                <div className="min-w-0">
                  <p className="text-sm truncate">{t.description}</p>
                  <p className="text-[11px] text-t-secondary">
                    {new Date(t.created_at).toLocaleDateString(undefined, {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    t.points >= 0 ? 'text-accent' : 'text-t-secondary'
                  }`}
                >
                  {t.points >= 0 ? '+' : ''}{t.points.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dark-border bg-dark-surface p-6 text-center">
            <p className="text-sm text-t-secondary">
              Nothing yet — your points will appear here after your first visit.
            </p>
          </div>
        )}
      </section>

      <p className="text-center text-[11px] text-t-secondary">
        Member since {new Date(m.member_since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </p>
    </div>
  )
}
