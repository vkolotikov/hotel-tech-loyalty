import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Plus, X } from 'lucide-react'
import { api, resolveImageUrl } from '../lib/api'
import { Card } from '../components/ui/Card'
import { TierBadge } from '../components/ui/TierBadge'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const TIERS = [
  { id: 1, name: 'Bronze' },
  { id: 2, name: 'Silver' },
  { id: 3, name: 'Gold' },
  { id: 4, name: 'Platinum' },
  { id: 5, name: 'Diamond' },
]

export function Members() {
  const [search, setSearch] = useState('')
  const [tierId, setTierId] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', tier_id: '' })
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-members', search, tierId, page],
    queryFn: () => api.get('/v1/admin/members', { params: { search, tier_id: tierId || undefined, page } }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/members', {
      name: form.name,
      email: form.email,
      password: form.password,
      phone: form.phone || undefined,
      tier_id: form.tier_id || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-members'] })
      toast.success('Member created successfully!')
      setShowCreate(false)
      setForm({ name: '', email: '', password: '', phone: '', tier_id: '' })
    },
    onError: (e: any) => {
      const errors = e.response?.data?.errors
      if (errors) {
        const first = Object.values(errors)[0] as string[]
        toast.error(first[0])
      } else {
        toast.error(e.response?.data?.message || 'Failed to create member')
      }
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Members</h1>
          <p className="text-sm text-[#8e8e93] mt-0.5">{(data as any)?.meta?.total ?? 0} total members</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} />
          Add Member
        </button>
      </div>

      <Card>
        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input
              type="text"
              placeholder="Search by name, email, or member number..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-4 py-2 bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={tierId}
            onChange={(e) => { setTierId(e.target.value); setPage(1) }}
            className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Tiers</option>
            {TIERS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#8e8e93] border-b border-dark-border">
                <th className="pb-3 font-medium">Member</th>
                <th className="pb-3 font-medium">Number</th>
                <th className="pb-3 font-medium">Tier</th>
                <th className="pb-3 font-medium">Points</th>
                <th className="pb-3 font-medium">Lifetime</th>
                <th className="pb-3 font-medium">Joined</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {isLoading ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j} className="py-3"><div className="h-4 bg-dark-surface2 rounded animate-pulse w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : (data as any)?.data?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#636366]">
                    No members found. {search && 'Try a different search term.'}
                  </td>
                </tr>
              ) : (
                ((data as any)?.data ?? []).map((m: any) => (
                  <tr key={m.id} className="hover:bg-dark-surface2 cursor-pointer transition-colors" onClick={() => navigate(`/members/${m.id}`)}>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        {m.user?.avatar_url ? (
                          <img
                            src={resolveImageUrl(m.user.avatar_url)!}
                            alt={m.user.name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary-400">{m.user?.name?.charAt(0)}</span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-white">{m.user?.name}</p>
                          <p className="text-xs text-[#636366]">{m.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 font-mono text-xs text-[#a0a0a0]">{m.member_number}</td>
                    <td className="py-3"><TierBadge tier={m.tier?.name} color={m.tier?.color_hex} /></td>
                    <td className="py-3 font-semibold text-white">{m.current_points?.toLocaleString()}</td>
                    <td className="py-3 text-[#a0a0a0]">{m.lifetime_points?.toLocaleString()}</td>
                    <td className="py-3 text-[#8e8e93] text-xs">{m.joined_at ? format(new Date(m.joined_at), 'MMM d, yyyy') : '—'}</td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m.is_active ? 'bg-[#32d74b]/15 text-[#32d74b]' : 'bg-dark-surface3 text-[#636366]'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 text-[#636366]"><ChevronRight size={16} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(data as any)?.meta && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-border">
            <p className="text-sm text-[#8e8e93]">
              Showing {(data as any).meta.from ?? 0}–{(data as any).meta.to ?? 0} of {(data as any).meta.total} members
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-dark-border text-[#a0a0a0] rounded-lg disabled:opacity-50 hover:bg-dark-surface2 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= ((data as any).meta.last_page ?? 1)}
                className="px-3 py-1.5 text-sm border border-dark-border text-[#a0a0a0] rounded-lg disabled:opacity-50 hover:bg-dark-surface2 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Member Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-dark-border">
              <h2 className="text-lg font-bold text-white">Add New Member</h2>
              <button onClick={() => setShowCreate(false)} className="text-[#636366] hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="John Smith"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Email Address *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="john@example.com"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Password *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 characters"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Phone <span className="font-normal text-[#636366]">(optional)</span></label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+1 234 567 8900"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Starting Tier <span className="font-normal text-[#636366]">(optional, default Bronze)</span></label>
                  <select
                    value={form.tier_id}
                    onChange={e => setForm(f => ({ ...f, tier_id: e.target.value }))}
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Bronze (default)</option>
                    {TIERS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-[#636366]">Member will receive 500 welcome bonus points automatically.</p>
            </div>
            <div className="flex gap-3 p-6 border-t border-dark-border">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 border border-dark-border text-[#a0a0a0] py-2.5 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!form.name || !form.email || !form.password || createMutation.isPending}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
