import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Gift, Check } from 'lucide-react'
import { api } from '../../lib/api'
import toast from 'react-hot-toast'

/**
 * Rewards catalogue and redemption.
 *
 * The API already returns affordability and the member's own consumed
 * count per row, so each card can say exactly why it can or can't be
 * redeemed without a second round-trip or any guessing on the client.
 */

interface Reward {
  id: number
  name: string
  description?: string | null
  category?: string | null
  image_url?: string | null
  points_cost: number
  stock?: number | null
  per_member_limit?: number | null
  can_redeem?: boolean
  consumed?: number
  points_short?: number
}

interface Payload { data?: Reward[]; rewards?: Reward[]; balance?: number }

export function PortalRewards() {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState<Reward | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<Payload>({
    queryKey: ['portal-rewards'],
    queryFn: () => api.get('/v1/member/rewards').then(r => r.data),
  })

  const { data: profile } = useQuery<{ member: { current_points: number } }>({
    queryKey: ['portal-profile'],
    queryFn: () => api.get('/v1/member/profile').then(r => r.data),
  })

  const redeem = useMutation({
    mutationFn: (id: number) => api.post(`/v1/member/rewards/${id}/redeem`).then(r => r.data),
    onSuccess: (res) => {
      setConfirming(null)
      // The code is the whole point of redeeming — surface it immediately,
      // and keep it on the Activity screen too.
      toast.success(res?.redemption?.code ? `Redeemed. Show code ${res.redemption.code}` : 'Reward redeemed')
      qc.invalidateQueries({ queryKey: ['portal-rewards'] })
      qc.invalidateQueries({ queryKey: ['portal-profile'] })
      qc.invalidateQueries({ queryKey: ['portal-activity'] })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Could not redeem that reward')
    },
  })

  const rewards = data?.data ?? data?.rewards ?? []
  const balance = profile?.member?.current_points ?? data?.balance ?? 0

  if (isLoading) {
    return <div className="flex justify-center py-20 text-t-secondary"><Loader2 className="animate-spin" size={22} /></div>
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-6 text-center">
        <p className="text-sm text-t-secondary mb-3">Couldn't load the rewards catalogue.</p>
        <button onClick={() => refetch()} className="text-sm font-semibold text-primary-400">Try again</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Rewards</h1>
        <span className="text-sm text-t-secondary">
          You have <span className="text-white font-semibold tabular-nums">{balance.toLocaleString()}</span> points
        </span>
      </div>

      {rewards.length === 0 && (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-8 text-center">
          <Gift size={22} className="mx-auto mb-2 text-t-secondary" />
          <p className="text-sm text-t-secondary">No rewards are available right now. Check back soon.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {rewards.map(r => {
          const short = Math.max(0, r.points_cost - balance)
          const limitReached = r.per_member_limit != null && (r.consumed ?? 0) >= r.per_member_limit
          const outOfStock = r.stock != null && r.stock <= 0
          const canRedeem = !limitReached && !outOfStock && short === 0

          return (
            <article key={r.id} className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden flex flex-col">
              {r.image_url && (
                <img src={r.image_url} alt="" className="w-full h-28 object-cover" loading="lazy" />
              )}
              <div className="p-4 flex flex-col gap-2 grow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold truncate">{r.name}</h2>
                    {r.category && <p className="text-[11px] text-t-secondary">{r.category}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-primary-400 tabular-nums">
                    {r.points_cost.toLocaleString()}
                  </span>
                </div>

                {r.description && (
                  <p className="text-xs text-t-secondary line-clamp-2">{r.description}</p>
                )}

                <div className="mt-auto pt-2">
                  {limitReached ? (
                    <p className="flex items-center gap-1.5 text-xs text-t-secondary">
                      <Check size={13} /> Already claimed
                    </p>
                  ) : outOfStock ? (
                    <p className="text-xs text-t-secondary">Out of stock</p>
                  ) : short > 0 ? (
                    <p className="text-xs text-t-secondary tabular-nums">
                      {short.toLocaleString()} more points needed
                    </p>
                  ) : (
                    <button
                      onClick={() => setConfirming(r)}
                      disabled={!canRedeem || redeem.isPending}
                      className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-40
                                 text-white text-sm font-semibold py-2 rounded-lg"
                    >
                      Redeem
                    </button>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {/* Spending points is irreversible from the member's side, so it
          asks first and names the cost. */}
      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-sm p-5">
            <h2 className="text-base font-bold mb-1">Redeem {confirming.name}?</h2>
            <p className="text-sm text-t-secondary mb-4">
              This spends <span className="text-white font-semibold">{confirming.points_cost.toLocaleString()}</span> points.
              You'll get a code to show at the counter.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="px-3 py-1.5 text-sm text-t-secondary hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => redeem.mutate(confirming.id)}
                disabled={redeem.isPending}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50
                           text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
              >
                {redeem.isPending && <Loader2 size={14} className="animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
