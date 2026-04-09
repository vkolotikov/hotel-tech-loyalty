import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { ArrowLeftRight, Users, AlertCircle, Mail, Phone, ExternalLink } from 'lucide-react'

interface MemberRow {
  id: number
  member_number: string
  name: string
  email: string | null
  phone: string | null
  lifetime_points: number
  current_points: number
  created_at: string
  last_activity_at: string | null
}

interface Pair {
  reason: 'shared_email' | 'shared_phone'
  winner: MemberRow
  loser: MemberRow
}

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  shared_email: { label: 'Shared email', color: 'bg-blue-500/20 text-blue-300' },
  shared_phone: { label: 'Shared phone', color: 'bg-purple-500/20 text-purple-300' },
}

export function MemberDuplicates() {
  const qc = useQueryClient()
  const [pendingPair, setPendingPair] = useState<Pair | null>(null)
  const [reason, setReason] = useState('')
  const [swapped, setSwapped] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['member-duplicates'],
    queryFn: () => api.get('/v1/admin/members/duplicates').then(r => r.data),
  })

  const mergeMutation = useMutation({
    mutationFn: (body: { winner_id: number; loser_id: number; reason: string }) =>
      api.post('/v1/admin/members/merge', body),
    onSuccess: () => {
      toast.success('Members merged')
      qc.invalidateQueries({ queryKey: ['member-duplicates'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      setPendingPair(null)
      setReason('')
      setSwapped(false)
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || 'Merge failed')
    },
  })

  const pairs: Pair[] = data?.pairs ?? []

  const confirmMerge = () => {
    if (!pendingPair) return
    const winner = swapped ? pendingPair.loser : pendingPair.winner
    const loser  = swapped ? pendingPair.winner : pendingPair.loser
    mergeMutation.mutate({ winner_id: winner.id, loser_id: loser.id, reason })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Duplicate Members</h1>
        <p className="text-sm text-t-secondary mt-0.5">
          Suggested matches based on shared email or phone. Review each pair before merging.
        </p>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200/90 leading-relaxed">
          Merging is permanent. The "loser" member's points, transactions, bookings,
          NFC cards, inquiries, and CRM guest record are reassigned to the "winner",
          and the loser account is deleted. Use the swap button to flip which one survives.
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-[#636366] py-12">Searching for duplicates...</div>
      ) : pairs.length === 0 ? (
        <div className="text-center text-[#636366] py-16 bg-dark-surface border border-dark-border rounded-xl">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No duplicate members found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pairs.map((pair, i) => {
            const tag = REASON_LABELS[pair.reason] ?? { label: pair.reason, color: 'bg-gray-500/20 text-gray-300' }
            return (
              <div key={i} className="bg-dark-surface border border-dark-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tag.color}`}>{tag.label}</span>
                  <span className="text-xs text-[#636366]">
                    {pair.reason === 'shared_email' && pair.winner.email}
                    {pair.reason === 'shared_phone' && pair.winner.phone}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <MemberCard member={pair.winner} role="Winner (kept)" />
                  <MemberCard member={pair.loser}  role="Loser (removed)" />
                </div>
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => { setPendingPair(pair); setSwapped(false); setReason('') }}
                    className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <ArrowLeftRight size={12} /> Review & Merge
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm modal */}
      {pendingPair && (() => {
        const winner = swapped ? pendingPair.loser : pendingPair.winner
        const loser  = swapped ? pendingPair.winner : pendingPair.loser
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-1">Confirm merge</h2>
              <p className="text-xs text-t-secondary mb-4">
                {loser.name} → {winner.name}. This cannot be undone.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <MemberCard member={winner} role="Winner (kept)" />
                <MemberCard member={loser}  role="Loser (removed)" />
              </div>

              <button
                onClick={() => setSwapped(s => !s)}
                className="text-xs text-primary-400 hover:text-primary-300 mb-4 flex items-center gap-1"
              >
                <ArrowLeftRight size={12} /> Swap winner / loser
              </button>

              <label className="block text-xs font-medium text-t-secondary mb-1">Reason (optional)</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. Same person — used different email at front desk"
                className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPendingPair(null)}
                  className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white"
                  disabled={mergeMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmMerge}
                  disabled={mergeMutation.isPending}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50"
                >
                  {mergeMutation.isPending ? 'Merging...' : 'Merge permanently'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function MemberCard({ member, role }: { member: MemberRow; role: string }) {
  return (
    <div className="bg-dark-surface2 border border-dark-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[#636366]">{role}</span>
        <Link to={`/members/${member.id}`} target="_blank" rel="noreferrer" className="text-[#636366] hover:text-primary-400">
          <ExternalLink size={12} />
        </Link>
      </div>
      <div className="text-sm font-semibold text-white">{member.name}</div>
      <div className="text-[11px] text-[#636366] mb-2">{member.member_number}</div>
      {member.email && <div className="text-xs text-[#a0a0a0] flex items-center gap-1.5"><Mail size={10}/> {member.email}</div>}
      {member.phone && <div className="text-xs text-[#a0a0a0] flex items-center gap-1.5"><Phone size={10}/> {member.phone}</div>}
      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-dark-border text-[11px]">
        <div><span className="text-[#636366]">Lifetime</span> <span className="text-white font-medium">{member.lifetime_points.toLocaleString()}</span></div>
        <div><span className="text-[#636366]">Current</span> <span className="text-white font-medium">{member.current_points.toLocaleString()}</span></div>
      </div>
      <div className="text-[10px] text-[#636366] mt-1">
        Joined {new Date(member.created_at).toLocaleDateString()}
        {member.last_activity_at && ` · last active ${new Date(member.last_activity_at).toLocaleDateString()}`}
      </div>
    </div>
  )
}
