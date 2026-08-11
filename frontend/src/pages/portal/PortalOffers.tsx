import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Sparkles, BadgeCheck } from 'lucide-react'
import { api } from '../../lib/api'
import toast from 'react-hot-toast'

/**
 * Offers available to this member, and the ones they've already claimed.
 *
 * A claimed offer now genuinely has a lifecycle — claimed, then used at
 * the counter — because `used_at` is finally written by the staff-side
 * "use offer" endpoint. Before that a claim was valid forever.
 */

interface Offer {
  id: number
  title: string
  description?: string | null
  type?: string | null
  value?: number | string | null
  image_url?: string | null
  end_date?: string | null
  terms_conditions?: string | null
  usage_limit?: number | null
  times_used?: number | null
}

interface Claim {
  id: number
  status: string
  claimed_at?: string | null
  used_at?: string | null
  expires_at?: string | null
  offer?: Offer | null
}

interface Payload { general: Offer[]; personalized: Claim[] }

/**
 * Render a date without letting the clock move it.
 *
 * These values arrive as calendar dates (sometimes stamped 23:59:59), and
 * `new Date(...).toLocaleDateString()` shifts them by a day in any timezone
 * east of UTC — which is how one deadline showed as both 11/09 and 12/09 on
 * the same screen.
 */
function formatDay(value: string): string {
  const [datePart] = value.split(/[T ]/)
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Date(y, m - 1, d).toLocaleDateString()
}

/** "15% off" / "€25 off" — the offer's own words where we can't be sure. */
function offerValueLabel(offer: Offer): string | null {
  const value = Number(offer.value ?? 0)
  if (!value) return null
  const type = String(offer.type ?? '').toLowerCase()
  if (type.includes('percent') || type === 'discount') return `${value}% off`
  if (type.includes('amount') || type.includes('fixed')) return `${value} off`
  if (type.includes('point')) return `${value}x points`
  return null
}

export function PortalOffers() {
  const qc = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<Payload>({
    queryKey: ['portal-offers'],
    queryFn: () => api.get('/v1/member/offers').then(r => r.data),
  })

  const claim = useMutation({
    mutationFn: (id: number) => api.post(`/v1/member/offers/${id}/claim`).then(r => r.data),
    onSuccess: () => {
      toast.success('Offer claimed — show it at the counter')
      qc.invalidateQueries({ queryKey: ['portal-offers'] })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Could not claim that offer')
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-20 text-t-secondary"><Loader2 className="animate-spin" size={22} /></div>
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-6 text-center">
        <p className="text-sm text-t-secondary mb-3">Couldn't load your offers.</p>
        <button onClick={() => refetch()} className="text-sm font-semibold text-primary-400">Try again</button>
      </div>
    )
  }

  const claimed = (data?.personalized ?? []).filter(c => c.offer)
  const claimedOfferIds = new Set(claimed.map(c => c.offer?.id))
  // An offer the member already holds is shown above under "Yours to use";
  // repeating it below as a dead card with "already claimed" is just noise.
  const available = (data?.general ?? []).filter(o => !claimedOfferIds.has(o.id))

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold">Offers</h1>

      {claimed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-t-secondary uppercase tracking-wider">Yours to use</h2>
          {claimed.map(c => {
            const label = c.offer ? offerValueLabel(c.offer) : null
            const used = !!c.used_at
            return (
              <article
                key={c.id}
                className={`rounded-xl border p-4 ${
                  used ? 'border-dark-border bg-dark-surface opacity-60' : 'border-primary-500/40 bg-primary-500/5'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">{c.offer?.title}</h3>
                    {c.offer?.description && (
                      <p className="text-xs text-t-secondary mt-0.5 line-clamp-2">{c.offer.description}</p>
                    )}
                  </div>
                  {label && (
                    <span className="shrink-0 text-sm font-bold text-primary-400">{label}</span>
                  )}
                </div>

                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-t-secondary">
                  <BadgeCheck size={13} className={used ? '' : 'text-accent'} />
                  {used
                    ? `Used ${formatDay(c.used_at!)}`
                    : c.offer?.end_date
                      ? `Valid until ${formatDay(c.offer.end_date)}`
                      : 'Ready to use — show this at the counter'}
                </p>
              </article>
            )
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-t-secondary uppercase tracking-wider">Available to you</h2>

        {available.length === 0 ? (
          <div className="rounded-xl border border-dark-border bg-dark-surface p-8 text-center">
            <Sparkles size={22} className="mx-auto mb-2 text-t-secondary" />
            <p className="text-sm text-t-secondary">
              No offers right now. We'll let you know when something arrives.
            </p>
          </div>
        ) : (
          available.map(o => {
            const label = offerValueLabel(o)
            const already = claimedOfferIds.has(o.id)
            const full = o.usage_limit != null && (o.times_used ?? 0) >= o.usage_limit

            return (
              <article key={o.id} className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
                {o.image_url && <img src={o.image_url} alt="" className="w-full h-28 object-cover" loading="lazy" />}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold truncate">{o.title}</h3>
                      {o.description && <p className="text-xs text-t-secondary mt-0.5">{o.description}</p>}
                    </div>
                    {label && <span className="shrink-0 text-sm font-bold text-primary-400">{label}</span>}
                  </div>

                  {o.end_date && (
                    <p className="text-[11px] text-t-secondary mt-2">
                      Ends {formatDay(o.end_date)}
                    </p>
                  )}

                  <div className="mt-3">
                    {already ? (
                      <p className="text-xs text-t-secondary">Already claimed — see above</p>
                    ) : full ? (
                      <p className="text-xs text-t-secondary">Fully claimed</p>
                    ) : (
                      <button
                        onClick={() => claim.mutate(o.id)}
                        disabled={claim.isPending}
                        className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-40
                                   text-white text-sm font-semibold py-2 rounded-lg"
                      >
                        Claim offer
                      </button>
                    )}
                  </div>

                  {o.terms_conditions && (
                    <p className="text-[10px] text-t-secondary mt-2 leading-relaxed">{o.terms_conditions}</p>
                  )}
                </div>
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
