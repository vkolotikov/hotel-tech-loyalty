import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, BadgeCheck, Clock, Crown } from 'lucide-react'
import { api } from '../../lib/api'
import toast from 'react-hot-toast'

/**
 * What the member's tier actually gets them, and the ability to ask for
 * the parts that need a person.
 *
 * `fulfillment_mode` decides the affordance:
 *   - `automatic` — applies itself, so it's information, not a button.
 *   - `staff_approved` / `on_request` — a late checkout depends on
 *     tomorrow's arrivals; someone has to say yes. Requesting creates the
 *     entitlement staff action at the desk.
 *   - `voucher` — issued rather than requested.
 *
 * Nothing previously created an entitlement, so the queue staff review was
 * permanently empty and this half of the feature simply didn't exist.
 */

interface Benefit {
  tier_benefit_id: number
  benefit_id: number
  name: string
  category?: string | null
  description?: string | null
  display?: string | null
  fulfillment_mode?: string | null
  requestable: boolean
  request?: { id: number; status: string; requested_at?: string } | null
  last_fulfilled_at?: string | null
}

const STATUS_COPY: Record<string, string> = {
  pending: 'Requested — reception will confirm',
  eligible: 'Requested — reception will confirm',
  approved: 'Approved — ready when you are',
}

export function PortalBenefits() {
  const qc = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<{ tier: string | null; benefits: Benefit[] }>({
    queryKey: ['portal-benefits'],
    queryFn: () => api.get('/v1/member/benefits').then(r => r.data),
  })

  const request = useMutation({
    mutationFn: (id: number) => api.post(`/v1/member/benefits/${id}/request`).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res?.message || 'Requested')
      qc.invalidateQueries({ queryKey: ['portal-benefits'] })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Could not send that request')
    },
  })

  const cancel = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/member/benefits/requests/${id}`).then(r => r.data),
    onSuccess: () => {
      toast.success('Request cancelled')
      qc.invalidateQueries({ queryKey: ['portal-benefits'] })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Could not cancel that request')
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-20 text-t-secondary"><Loader2 className="animate-spin" size={22} /></div>
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-6 text-center">
        <p className="text-sm text-t-secondary mb-3">Couldn't load your benefits.</p>
        <button onClick={() => refetch()} className="text-sm font-semibold text-primary-400">Try again</button>
      </div>
    )
  }

  const benefits = data?.benefits ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Your benefits</h1>
        {data?.tier && <span className="text-sm text-t-secondary">{data.tier} tier</span>}
      </div>

      {benefits.length === 0 ? (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-8 text-center">
          <Crown size={22} className="mx-auto mb-2 text-t-secondary" />
          <p className="text-sm text-t-secondary">
            No benefits on your tier yet. Keep earning points to unlock them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {benefits.map(b => {
            const open = b.request
            return (
              <article
                key={b.tier_benefit_id}
                className={`rounded-xl border p-4 ${
                  open ? 'border-primary-500/40 bg-primary-500/5' : 'border-dark-border bg-dark-surface'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{b.name}</h2>
                    {b.description && (
                      <p className="text-xs text-t-secondary mt-0.5">{b.description}</p>
                    )}
                  </div>
                  {b.display && (
                    <span className="shrink-0 text-xs font-semibold text-primary-400">{b.display}</span>
                  )}
                </div>

                <div className="mt-3">
                  {open ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex items-center gap-1.5 text-[11px] text-primary-400">
                        <Clock size={13} />
                        {STATUS_COPY[open.status] ?? 'Requested'}
                      </p>
                      {(open.status === 'pending' || open.status === 'eligible') && (
                        <button
                          onClick={() => cancel.mutate(open.id)}
                          disabled={cancel.isPending}
                          className="text-[11px] text-t-secondary hover:text-white disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ) : b.requestable ? (
                    <button
                      onClick={() => request.mutate(b.tier_benefit_id)}
                      disabled={request.isPending}
                      className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-40
                                 text-white text-sm font-semibold py-2 rounded-lg"
                    >
                      Request this
                    </button>
                  ) : (
                    <p className="flex items-center gap-1.5 text-[11px] text-t-secondary">
                      <BadgeCheck size={13} className="text-accent" />
                      {b.fulfillment_mode === 'voucher'
                        ? 'Issued as a voucher — ask at reception'
                        : 'Applied automatically'}
                    </p>
                  )}

                  {b.last_fulfilled_at && !open && (
                    <p className="text-[10px] text-t-secondary mt-1.5">
                      Last used {new Date(b.last_fulfilled_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
