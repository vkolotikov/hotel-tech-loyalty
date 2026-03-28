import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import { TierBadge } from '../components/ui/TierBadge'
import { DatePicker, normalizeDate } from '../components/ui/DatePicker'
import toast from 'react-hot-toast'
import { ArrowLeft, Sparkles, Pencil, Save, X, Camera, Hotel, FileText, Crown } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export function MemberDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [awardForm, setAwardForm] = useState({ points: '', description: '' })
  const [redeemForm, setRedeemForm] = useState({ points: '', description: '' })
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', nationality: '', language: '', date_of_birth: '', tier_id: '', is_active: true })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const { staff } = useAuthStore()
  const isAdmin = staff?.role === 'super_admin' || staff?.role === 'manager'

  const { data, isLoading } = useQuery({
    queryKey: ['member', id],
    queryFn: () => api.get(`/v1/admin/members/${id}`).then(r => r.data),
  })

  const { data: aiData, refetch: refetchAi, isFetching: aiLoading } = useQuery({
    queryKey: ['member-ai', id],
    queryFn: () => api.get(`/v1/admin/members/${id}/ai-insights`).then(r => r.data),
    enabled: false,
  })

  const { data: tiersData } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => {
      if (payload._hasFile) {
        const formData = new FormData()
        formData.append('_method', 'PUT')
        Object.entries(payload).forEach(([key, value]) => {
          if (key === '_hasFile') return
          if (value instanceof File) {
            formData.append(key, value)
          } else if (value !== null && value !== undefined) {
            formData.append(key, String(value))
          }
        })
        return api.post(`/v1/admin/members/${id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      return api.put(`/v1/admin/members/${id}`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] })
      toast.success('Member updated')
      setEditing(false)
      setAvatarFile(null)
      setAvatarPreview(null)
    },
    onError: (e: any) => {
      const errors = e.response?.data?.errors
      if (errors) {
        const first = Object.values(errors)[0] as string[]
        toast.error(first[0])
      } else {
        toast.error(e.response?.data?.message || 'Update failed')
      }
    },
  })

  const startEditing = () => {
    setEditForm({
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      nationality: user?.nationality ?? '',
      language: user?.language ?? '',
      date_of_birth: normalizeDate(user?.date_of_birth ?? ''),
      tier_id: String(member?.tier_id ?? ''),
      is_active: member?.is_active ?? true,
    })
    setAvatarFile(null)
    setAvatarPreview(null)
    setEditing(true)
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSaveEdit = () => {
    const payload: Record<string, any> = {
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone || null,
      nationality: editForm.nationality || null,
      language: editForm.language || null,
      date_of_birth: editForm.date_of_birth || null,
      tier_id: editForm.tier_id ? Number(editForm.tier_id) : undefined,
      is_active: editForm.is_active ? '1' : '0',
    }
    if (avatarFile) {
      payload.avatar = avatarFile
      payload._hasFile = true
    }
    updateMutation.mutate(payload)
  }

  const awardMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/points/award', {
      member_id: Number(id),
      points: Number(awardForm.points),
      description: awardForm.description,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] })
      toast.success(`${awardForm.points} points awarded!`)
      setAwardForm({ points: '', description: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const redeemMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/points/redeem', {
      member_id: Number(id),
      points: Number(redeemForm.points),
      description: redeemForm.description,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] })
      toast.success(`${redeemForm.points} points redeemed!`)
      setRedeemForm({ points: '', description: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Insufficient points'),
  })

  if (isLoading) return <div className="flex items-center justify-center h-64 text-[#636366]">Loading...</div>

  const member = data?.member
  const user = member?.user
  const tier = member?.tier

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/members')} className="p-2 hover:bg-dark-surface2 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-[#a0a0a0]" />
        </button>
        {user?.avatar_url ? (
          <img
            src={resolveImage(user.avatar_url)!}
            alt={user.name}
            className="w-14 h-14 rounded-full object-cover border-2 border-dark-border flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-primary-400">{user?.name?.charAt(0)}</span>
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{user?.name}</h1>
            {tier && <TierBadge tier={tier.name} color={tier.color_hex} />}
          </div>
          <p className="text-sm text-[#8e8e93] mt-0.5">{user?.email} · {member?.member_number}</p>
        </div>
        {(isAdmin || staff?.can_view_analytics) && (
          <button
            onClick={() => refetchAi()}
            disabled={aiLoading}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <Sparkles size={15} />
            {aiLoading ? 'Analyzing...' : 'AI Analysis'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Current Points', value: (member?.current_points ?? 0).toLocaleString(), color: 'text-blue-400' },
              { label: 'Lifetime Points', value: (member?.lifetime_points ?? 0).toLocaleString(), color: 'text-[#32d74b]' },
              { label: 'Total Stays', value: data?.stats?.total_bookings ?? 0, color: 'text-purple-400' },
              { label: 'Total Spent', value: `$${(data?.stats?.total_spent ?? 0).toLocaleString()}`, color: 'text-orange-400' },
            ].map(stat => (
              <div key={stat.label} className="bg-dark-surface rounded-xl p-4 border border-dark-border">
                <p className="text-xs text-[#8e8e93]">{stat.label}</p>
                <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Recent Transactions */}
          <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
            <div className="px-6 py-4 border-b border-dark-border">
              <h2 className="font-semibold text-white">Recent Transactions</h2>
            </div>
            <div className="divide-y divide-dark-border">
              {(data?.recent_transactions ?? []).length === 0 ? (
                <p className="text-center text-[#636366] py-8 text-sm">No transactions yet</p>
              ) : (data?.recent_transactions ?? []).map((tx: any) => (
                <div key={tx.id} className="flex items-center gap-4 px-6 py-3">
                  <div className={`text-sm font-bold ${tx.points > 0 ? 'text-[#32d74b]' : 'text-[#ff375f]'}`}>
                    {tx.points > 0 ? '+' : ''}{tx.points.toLocaleString()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{tx.description}</p>
                    <p className="text-xs text-[#636366]">{new Date(tx.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-xs text-[#636366] text-right">
                    <p>{tx.balance_after?.toLocaleString()} pts</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Linked CRM Guest Profile */}
          {data?.linked_guest && (
            <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
              <div className="px-6 py-4 border-b border-dark-border flex items-center gap-2">
                <Crown size={16} className="text-primary-400" />
                <h2 className="font-semibold text-white">Linked CRM Guest</h2>
                {data.linked_guest.vip_level && data.linked_guest.vip_level !== 'Standard' && (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-400">
                    VIP: {data.linked_guest.vip_level}
                  </span>
                )}
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Stays', value: data.linked_guest.total_stays ?? 0, color: 'text-blue-400' },
                    { label: 'Total Nights', value: data.linked_guest.total_nights ?? 0, color: 'text-purple-400' },
                    { label: 'CRM Revenue', value: `$${Number(data.linked_guest.total_revenue ?? 0).toLocaleString()}`, color: 'text-[#32d74b]' },
                    { label: 'Last Stay', value: data.linked_guest.last_stay_date ? new Date(data.linked_guest.last_stay_date).toLocaleDateString() : '—', color: 'text-[#a0a0a0]' },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className="text-xs text-[#8e8e93]">{s.label}</p>
                      <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Reservations */}
                {(data.linked_guest.reservations?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-[#a0a0a0] mb-2 flex items-center gap-1.5">
                      <Hotel size={13} /> Reservations
                    </h3>
                    <div className="space-y-1.5">
                      {data.linked_guest.reservations.slice(0, 5).map((r: any) => (
                        <div key={r.id} className="flex items-center justify-between text-xs bg-dark-surface2 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-white font-medium">{r.property?.name ?? 'Property'}</span>
                            <span className="text-[#636366] ml-2">{r.room_type}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[#a0a0a0]">{r.check_in} → {r.check_out}</span>
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              r.status === 'confirmed' ? 'bg-green-500/20 text-green-400' :
                              r.status === 'checked_in' ? 'bg-blue-500/20 text-blue-400' :
                              r.status === 'checked_out' ? 'bg-gray-500/20 text-gray-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }`}>{r.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inquiries */}
                {(data.linked_guest.inquiries?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-[#a0a0a0] mb-2 flex items-center gap-1.5">
                      <FileText size={13} /> Inquiries
                    </h3>
                    <div className="space-y-1.5">
                      {data.linked_guest.inquiries.slice(0, 5).map((inq: any) => (
                        <div key={inq.id} className="flex items-center justify-between text-xs bg-dark-surface2 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-white font-medium truncate block">{inq.subject || inq.inquiry_type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {inq.estimated_value && <span className="text-[#32d74b]">${Number(inq.estimated_value).toLocaleString()}</span>}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              inq.status === 'won' ? 'bg-green-500/20 text-green-400' :
                              inq.status === 'lost' ? 'bg-red-500/20 text-red-400' :
                              inq.status === 'proposal' ? 'bg-purple-500/20 text-purple-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>{inq.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Award Points */}
          {(isAdmin || staff?.can_award_points) && <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
            <h3 className="font-semibold text-white mb-4">Award Points</h3>
            <input
              type="number"
              placeholder="Points"
              value={awardForm.points}
              onChange={e => setAwardForm(f => ({ ...f, points: e.target.value }))}
              className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] mb-2 focus:outline-none focus:ring-2 focus:ring-[#32d74b]"
            />
            <input
              type="text"
              placeholder="Reason (e.g. Staff courtesy)"
              value={awardForm.description}
              onChange={e => setAwardForm(f => ({ ...f, description: e.target.value }))}
              className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] mb-3 focus:outline-none focus:ring-2 focus:ring-[#32d74b]"
            />
            <button
              onClick={() => awardMutation.mutate()}
              disabled={!awardForm.points || awardMutation.isPending}
              className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {awardMutation.isPending ? 'Awarding...' : 'Award Points'}
            </button>
          </div>}

          {/* Redeem Points */}
          {(isAdmin || staff?.can_redeem_points) && <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
            <h3 className="font-semibold text-white mb-4">Redeem Points</h3>
            <input
              type="number"
              placeholder="Points to redeem"
              value={redeemForm.points}
              onChange={e => setRedeemForm(f => ({ ...f, points: e.target.value }))}
              className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] mb-2 focus:outline-none focus:ring-2 focus:ring-[#ff375f]"
            />
            <input
              type="text"
              placeholder="Reason (e.g. Room upgrade)"
              value={redeemForm.description}
              onChange={e => setRedeemForm(f => ({ ...f, description: e.target.value }))}
              className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] mb-3 focus:outline-none focus:ring-2 focus:ring-[#ff375f]"
            />
            <button
              onClick={() => redeemMutation.mutate()}
              disabled={!redeemForm.points || redeemMutation.isPending}
              className="w-full bg-red-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {redeemMutation.isPending ? 'Redeeming...' : 'Redeem Points'}
            </button>
          </div>}

          {/* Member Info / Edit */}
          <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">Member Info</h3>
              {!editing && (
                <button onClick={startEditing} className="p-1.5 text-[#636366] hover:text-primary-400 hover:bg-primary-500/10 rounded transition-colors">
                  <Pencil size={14} />
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-3">
                {/* Avatar Upload */}
                <div className="flex flex-col items-center gap-2">
                  <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                  <div className="relative cursor-pointer group" onClick={() => avatarInputRef.current?.click()}>
                    {avatarPreview || user?.avatar_url ? (
                      <img
                        src={avatarPreview || (resolveImage(user.avatar_url)!)}
                        alt="Avatar"
                        className="w-20 h-20 rounded-full object-cover border-2 border-dark-border group-hover:opacity-75 transition-opacity"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-primary-500/20 flex items-center justify-center group-hover:bg-primary-500/30 transition-colors">
                        <span className="text-2xl font-bold text-primary-400">{user?.name?.charAt(0)}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera size={20} className="text-white" />
                    </div>
                  </div>
                  <span className="text-xs text-[#636366]">Click to change photo</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8e8e93] mb-1">Name</label>
                  <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8e8e93] mb-1">Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8e8e93] mb-1">Phone</label>
                  <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="+1 234 567 8900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8e8e93] mb-1">Nationality</label>
                  <input type="text" value={editForm.nationality} onChange={e => setEditForm(f => ({ ...f, nationality: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8e8e93] mb-1">Language</label>
                  <input type="text" value={editForm.language} onChange={e => setEditForm(f => ({ ...f, language: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="en" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8e8e93] mb-1">Date of Birth</label>
                  <DatePicker value={editForm.date_of_birth} onChange={v => setEditForm(f => ({ ...f, date_of_birth: v }))} placeholder="Select date of birth" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8e8e93] mb-1">Tier</label>
                  <select value={editForm.tier_id} onChange={e => setEditForm(f => ({ ...f, tier_id: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    {(tiersData?.tiers ?? []).map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm text-[#a0a0a0] cursor-pointer">
                    <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                    Active Member
                  </label>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditing(false)} className="flex-1 flex items-center justify-center gap-1.5 border border-dark-border text-[#a0a0a0] py-2 rounded-lg text-sm font-medium hover:bg-dark-surface2 transition-colors">
                    <X size={14} /> Cancel
                  </button>
                  <button onClick={handleSaveEdit} disabled={!editForm.name || !editForm.email || updateMutation.isPending} className="flex-1 flex items-center justify-center gap-1.5 bg-primary-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors">
                    <Save size={14} /> {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#8e8e93]">Phone</dt>
                  <dd className="text-white">{user?.phone || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8e8e93]">Nationality</dt>
                  <dd className="text-white">{user?.nationality || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8e8e93]">Language</dt>
                  <dd className="text-white">{user?.language || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8e8e93]">Date of Birth</dt>
                  <dd className="text-white">{user?.date_of_birth ? new Date(user.date_of_birth).toLocaleDateString() : '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8e8e93]">Joined</dt>
                  <dd className="text-white">{member?.joined_at ? new Date(member.joined_at).toLocaleDateString() : '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8e8e93]">Status</dt>
                  <dd className={member?.is_active ? 'text-[#32d74b] font-medium' : 'text-[#ff375f] font-medium'}>{member?.is_active ? 'Active' : 'Inactive'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8e8e93]">NFC Card</dt>
                  <dd className={member?.nfc_uid ? 'text-[#32d74b] font-medium' : 'text-[#636366]'}>{member?.nfc_uid ? 'Active' : 'None'}</dd>
                </div>
              </dl>
            )}
          </div>

          {/* AI Analysis Panel */}
          {aiData && (
            <div className="bg-primary-500/10 rounded-xl border border-primary-500/20 p-5">
              <h3 className="font-semibold text-primary-400 mb-3 flex items-center gap-2">
                <Sparkles size={15} /> AI Insights
              </h3>
              {aiData.churn_risk !== undefined && (
                <div className="mb-3">
                  <p className="text-xs text-primary-400 font-semibold mb-1">Churn Risk</p>
                  <div className="w-full bg-dark-surface3 rounded-full h-2">
                    <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${(aiData.churn_risk ?? 0) * 100}%` }} />
                  </div>
                  <p className="text-xs text-primary-400 mt-1">{Math.round((aiData.churn_risk ?? 0) * 100)}%</p>
                </div>
              )}
              {aiData.personalized_offer && (
                <div className="mb-3">
                  <p className="text-xs text-primary-400 font-semibold mb-1">Suggested Offer</p>
                  <p className="text-sm text-white">{typeof aiData.personalized_offer === 'string' ? aiData.personalized_offer : aiData.personalized_offer?.title}</p>
                </div>
              )}
              {aiData.upsell_suggestion && (
                <div>
                  <p className="text-xs text-primary-400 font-semibold mb-1">Upsell Script</p>
                  <p className="text-sm text-[#a0a0a0] italic">"{aiData.upsell_suggestion}"</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
