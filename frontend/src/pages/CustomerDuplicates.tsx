import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  ArrowLeftRight, Users, AlertCircle, Mail, Phone, ExternalLink,
  Briefcase, Crown, MapPin, ChevronLeft,
} from 'lucide-react'

/**
 * CRM customer duplicate detection + merge.
 *
 * Mirror of MemberDuplicates but for Guest rows. The backend
 * (GuestMergeService::findDuplicates) emits pairs matched on:
 *   - shared email_key (strongest)
 *   - shared phone_key
 *   - shared full_name + (matching city OR matching company) — the
 *     contextual fallback. Bare-name matches are NOT suggested
 *     because "John Smith" duplicates are too common to be useful.
 *
 * Merging is permanent. The "loser" guest's inquiries / reservations /
 * activities / tags / custom values / venue bookings / submissions /
 * visitors / review records / service reservations / tasks all get
 * their guest_id re-pointed to the winner; the loser row is deleted.
 *
 * If BOTH guests have a linked loyalty member, the merge is refused
 * with a hint to merge the members first — the points ledger should
 * always reconcile through the canonical member-merge path.
 */

type GuestRow = {
  id: number
  organization_id: number
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  email_key: string | null
  phone_key: string | null
  company: string | null
  city: string | null
  country: string | null
  vip_level: string | null
  lifecycle_status: string | null
  total_stays: number | null
  total_revenue: string | number | null
  last_activity_at: string | null
  created_at: string
  member_id: number | null
}

type Pair = {
  reason: 'shared_email' | 'shared_phone' | 'shared_name_context'
  winner: GuestRow
  loser: GuestRow
}

const REASON_LABELS: Record<string, { label: string; color: string; hint: string }> = {
  shared_email:        { label: 'Shared email',      color: 'bg-blue-500/20 text-blue-300',     hint: 'Same email address' },
  shared_phone:        { label: 'Shared phone',      color: 'bg-purple-500/20 text-purple-300', hint: 'Same phone number' },
  shared_name_context: { label: 'Name + context',    color: 'bg-amber-500/20 text-amber-300',   hint: 'Same name + company or city' },
}

export function CustomerDuplicates() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Pair | null>(null)
  const [swapped, setSwapped] = useState(false)
  const [reason,  setReason]  = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['customer-duplicates'],
    queryFn: () => api.get('/v1/admin/guests/duplicates').then(r => r.data),
  })

  const mergeMutation = useMutation({
    mutationFn: (body: { winner_id: number; loser_id: number; reason: string }) =>
      api.post('/v1/admin/guests/merge', body).then(r => r.data),
    onSuccess: () => {
      toast.success('Customers merged')
      queryClient.invalidateQueries({ queryKey: ['customer-duplicates'] })
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      setPending(null)
      setSwapped(false)
      setReason('')
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Merge failed')
    },
  })

  const pairs: Pair[] = data?.pairs ?? []

  const confirm = () => {
    if (!pending) return
    const winner = swapped ? pending.loser  : pending.winner
    const loser  = swapped ? pending.winner : pending.loser
    mergeMutation.mutate({ winner_id: winner.id, loser_id: loser.id, reason })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/customers" className="inline-flex items-center gap-1 text-xs text-t-secondary hover:text-white mb-1">
            <ChevronLeft size={12} /> Back to customers
          </Link>
          <h1 className="text-2xl font-bold text-white">Duplicate Customers</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            Suggested matches based on shared email, phone, or name + context. Review each pair before merging.
          </p>
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200/90 leading-relaxed">
          <strong className="text-amber-300">Merging is permanent.</strong> The "loser" guest's inquiries,
          reservations, activities, tags, custom-field values, venue bookings, submissions, visitor sessions,
          reviews, service reservations and tasks all reassign to the "winner". The winner's profile keeps
          its existing values — the loser only fills blanks. Notes are concatenated. Stays / revenue counters
          sum. Use the swap button before merging to flip which one survives.
        </div>
      </div>

      {isLoading || isFetching ? (
        <div className="text-center text-t-secondary py-12">Searching for duplicates…</div>
      ) : pairs.length === 0 ? (
        <div className="text-center py-16 bg-dark-surface border border-dark-border rounded-xl">
          <Users size={32} className="mx-auto mb-3 opacity-30 text-t-secondary" />
          <p className="text-sm text-t-secondary">No duplicate customers found.</p>
          <p className="text-[11px] text-gray-600 mt-1">We compare email, phone, and name + company/city. New duplicates will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pairs.map((pair, i) => {
            const tag = REASON_LABELS[pair.reason] ?? { label: pair.reason, color: 'bg-gray-500/20 text-gray-300', hint: '' }
            return (
              <div key={i} className="bg-dark-surface border border-dark-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tag.color}`}>{tag.label}</span>
                  <span className="text-xs text-t-secondary">
                    {pair.reason === 'shared_email'        && (pair.winner.email || pair.loser.email)}
                    {pair.reason === 'shared_phone'        && (pair.winner.phone || pair.loser.phone)}
                    {pair.reason === 'shared_name_context' && `${pair.winner.full_name ?? '?'} · ${pair.winner.company || pair.winner.city || ''}`}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <GuestCard guest={pair.winner} role="Winner (kept)" />
                  <GuestCard guest={pair.loser}  role="Loser (removed)" />
                </div>
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => { setPending(pair); setSwapped(false); setReason('') }}
                    className="flex items-center gap-2 bg-primary-500 hover:bg-primary-400 text-black text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <ArrowLeftRight size={12} /> Review & merge
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm modal */}
      {pending && (() => {
        const winner = swapped ? pending.loser  : pending.winner
        const loser  = swapped ? pending.winner : pending.loser
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-white mb-1">Confirm merge</h2>
              <p className="text-xs text-t-secondary mb-4">
                <span className="text-white font-medium">{loser.full_name}</span>
                <span className="mx-2">→</span>
                <span className="text-white font-medium">{winner.full_name}</span>. This cannot be undone.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <GuestCard guest={winner} role="Winner (kept)" />
                <GuestCard guest={loser}  role="Loser (removed)" />
              </div>

              <button
                onClick={() => setSwapped(s => !s)}
                className="text-xs text-primary-400 hover:text-primary-300 mb-4 flex items-center gap-1"
              >
                <ArrowLeftRight size={12} /> Swap winner / loser
              </button>

              <label className="block text-[10px] uppercase tracking-wider font-medium text-t-secondary mb-1">Reason (optional, for audit)</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. Same person — used different email at front desk"
                className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 mb-4"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPending(null)}
                  className="px-4 py-2 text-sm text-t-secondary hover:text-white"
                  disabled={mergeMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={confirm}
                  disabled={mergeMutation.isPending}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-lg disabled:opacity-50"
                >
                  {mergeMutation.isPending ? 'Merging…' : 'Merge permanently'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function GuestCard({ guest, role }: { guest: GuestRow; role: string }) {
  const isVip = !!guest.vip_level && guest.vip_level !== 'Standard'
  const revenue = guest.total_revenue != null ? Number(guest.total_revenue) : null
  return (
    <div className="bg-dark-surface2 border border-dark-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-t-secondary">{role}</span>
        <Link
          to={`/guests/${guest.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-t-secondary hover:text-primary-400"
          title="Open in new tab"
        >
          <ExternalLink size={12} />
        </Link>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-white truncate">{guest.full_name ?? '—'}</span>
        {isVip && <Crown size={10} className="text-amber-400 flex-shrink-0" />}
      </div>
      <div className="text-[11px] text-t-secondary truncate mb-2">
        {guest.lifecycle_status && <span className="mr-2">{guest.lifecycle_status}</span>}
        {guest.member_id && <span className="text-blue-400">· loyalty member</span>}
      </div>
      {guest.email && <div className="text-xs text-gray-300 flex items-center gap-1.5 truncate"><Mail size={10} className="flex-shrink-0" /> {guest.email}</div>}
      {(guest.phone || guest.mobile) && <div className="text-xs text-gray-300 flex items-center gap-1.5 truncate"><Phone size={10} className="flex-shrink-0" /> {guest.phone || guest.mobile}</div>}
      {guest.company && <div className="text-xs text-gray-300 flex items-center gap-1.5 truncate"><Briefcase size={10} className="flex-shrink-0" /> {guest.company}</div>}
      {(guest.city || guest.country) && <div className="text-xs text-gray-300 flex items-center gap-1.5 truncate"><MapPin size={10} className="flex-shrink-0" /> {[guest.city, guest.country].filter(Boolean).join(', ')}</div>}

      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-dark-border text-[11px]">
        <div><span className="text-t-secondary">Stays</span> <span className="text-white font-medium ml-1">{guest.total_stays ?? 0}</span></div>
        <div><span className="text-t-secondary">Revenue</span> <span className="text-white font-medium ml-1">{revenue != null ? `$${revenue.toLocaleString()}` : '—'}</span></div>
      </div>
      <div className="text-[10px] text-gray-600 mt-1.5">
        Created {new Date(guest.created_at).toLocaleDateString()}
        {guest.last_activity_at && ` · active ${new Date(guest.last_activity_at).toLocaleDateString()}`}
      </div>
    </div>
  )
}
