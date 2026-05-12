import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, X, Image as ImageIcon, Pencil, Trash2, Eye, EyeOff, Search, CheckCircle, XCircle, Gift } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { api, resolveImage } from '../lib/api'
import { Card } from '../components/ui/Card'

type Tab = 'catalog' | 'redemptions'

interface RewardRow {
  id: number
  name: string
  description: string | null
  category: string | null
  image_url: string | null
  points_cost: number
  stock: number | null
  per_member_limit: number | null
  expires_at: string | null
  is_active: boolean
  sort_order: number
  redemption_count: number
  fulfilled_count: number
}

const emptyForm = {
  name: '', description: '', terms: '', category: '',
  points_cost: '500', stock: '', per_member_limit: '',
  expires_at: '', is_active: true, sort_order: '0',
}

export function Rewards() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('catalog')

  // Catalog state
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Redemptions tab state
  const [redStatus, setRedStatus] = useState('')
  const [redSearch, setRedSearch] = useState('')
  const [debouncedRedSearch, setDebouncedRedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRedSearch(redSearch), 300)
    return () => clearTimeout(t)
  }, [redSearch])

  const { data: rewardsData, isLoading } = useQuery({
    queryKey: ['admin-rewards', search],
    queryFn: () => api.get('/v1/admin/rewards', { params: { q: search || undefined } }).then(r => r.data),
  })
  const rewards: RewardRow[] = rewardsData?.rewards ?? []

  const { data: redemptionsData } = useQuery({
    queryKey: ['admin-reward-redemptions', redStatus, debouncedRedSearch],
    queryFn: () => api.get('/v1/admin/rewards/redemptions', { params: { status: redStatus || undefined, q: debouncedRedSearch || undefined } }).then(r => r.data),
    enabled: tab === 'redemptions',
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      const numericFields = ['points_cost', 'stock', 'per_member_limit', 'sort_order']
      Object.entries(form).forEach(([k, v]) => {
        if (v === '' || v == null) return
        if (typeof v === 'boolean') fd.append(k, v ? '1' : '0')
        else if (numericFields.includes(k)) fd.append(k, String(v))
        else fd.append(k, String(v))
      })
      if (imageFile) fd.append('image', imageFile)
      if (editId) fd.append('_method', 'PUT')
      return editId
        ? api.post(`/v1/admin/rewards/${editId}`, fd).then(r => r.data)
        : api.post('/v1/admin/rewards', fd).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-rewards'] })
      toast.success(editId ? 'Reward updated' : 'Reward created')
      resetForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/v1/admin/rewards/${id}/toggle`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-rewards'] }),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Toggle failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/rewards/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-rewards'] }); toast.success('Reward deleted') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Delete failed'),
  })

  const fulfillMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/rewards/redemptions/${id}/fulfill`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-reward-redemptions'] }); toast.success('Marked fulfilled') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Fulfill failed'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/rewards/redemptions/${id}/cancel`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-reward-redemptions'] }); toast.success('Cancelled (points refunded if pending)') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Cancel failed'),
  })

  const resetForm = () => {
    setShowForm(false); setEditId(null); setForm(emptyForm)
    setImageFile(null); setImagePreview(null)
  }

  const startEdit = (r: RewardRow) => {
    setEditId(r.id)
    setForm({
      name: r.name, description: r.description ?? '', terms: '',
      category: r.category ?? '',
      points_cost: String(r.points_cost),
      stock: r.stock === null ? '' : String(r.stock),
      per_member_limit: r.per_member_limit === null ? '' : String(r.per_member_limit),
      expires_at: r.expires_at ? r.expires_at.slice(0, 10) : '',
      is_active: r.is_active,
      sort_order: String(r.sort_order),
    })
    setImageFile(null)
    setImagePreview(r.image_url ? resolveImage(r.image_url)! : null)
    setShowForm(true)
  }

  const onImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rewards</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            Self-serve catalog members can spend their points on. Stock and per-member limits enforced atomically.
          </p>
        </div>
        {tab === 'catalog' && (
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm font-semibold">
            <Plus size={16} /> Add Reward
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-dark-border">
        {(['catalog', 'redemptions'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${tab === t ? 'text-primary-400 border-primary-400' : 'text-t-secondary border-transparent hover:text-white'}`}>
            {t === 'catalog' ? 'Catalog' : 'Redemptions'}
          </button>
        ))}
      </div>

      {tab === 'catalog' && (
        <>
          {showForm && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-white">{editId ? 'Edit reward' : 'New reward'}</h2>
                <button onClick={resetForm} className="text-t-secondary hover:text-white"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Name *</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-t-secondary mb-1">Category</label>
                      <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        placeholder="Stay / Dining / Spa…"
                        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-t-secondary mb-1">Points cost *</label>
                      <input type="number" value={form.points_cost} onChange={e => setForm(f => ({ ...f, points_cost: e.target.value }))}
                        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Description</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Terms <span className="text-[#636366]">(optional)</span></label>
                    <textarea value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} rows={2}
                      placeholder="Subject to availability. Cannot be combined with other offers…"
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs text-white" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-t-secondary mb-1">Stock</label>
                      <input type="number" min={0} value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                        placeholder="∞"
                        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
                      <p className="text-[10px] text-[#636366] mt-1">Empty = unlimited</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-t-secondary mb-1">Per-member limit</label>
                      <input type="number" min={1} value={form.per_member_limit} onChange={e => setForm(f => ({ ...f, per_member_limit: e.target.value }))}
                        placeholder="∞"
                        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
                      <p className="text-[10px] text-[#636366] mt-1">Empty = unlimited</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-t-secondary mb-1">Expires</label>
                      <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[#a0a0a0]">
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                    Active (visible to members)
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-t-secondary mb-1">Image</label>
                  <div className="aspect-square rounded-xl border border-dashed border-dark-border bg-dark-bg flex items-center justify-center overflow-hidden">
                    {imagePreview ? (
                      <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={36} className="text-[#636366]" />
                    )}
                  </div>
                  <input type="file" accept="image/*" onChange={onImage} className="mt-2 text-xs text-[#a0a0a0]" />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-dark-border">
                <button onClick={resetForm} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !form.name.trim() || !form.points_cost}
                  className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                  {saveMutation.isPending ? 'Saving…' : (editId ? 'Update' : 'Create')}
                </button>
              </div>
            </Card>
          )}

          <Card>
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search rewards by name or category…"
                className="w-full pl-9 pr-4 py-2 bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white placeholder-[#636366]" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {isLoading ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-48 bg-dark-surface2 rounded-xl animate-pulse" />
                ))
              ) : rewards.length === 0 ? (
                <div className="col-span-full py-12 text-center text-[#636366] text-sm">
                  No rewards yet. Click "Add Reward" to seed the catalog.
                </div>
              ) : rewards.map(r => (
                <div key={r.id} className={`bg-[#1a1a1a] border rounded-xl overflow-hidden ${r.is_active ? 'border-dark-border' : 'border-dark-border opacity-60'}`}>
                  <div className="aspect-[16/10] bg-[#0f0f0f] flex items-center justify-center">
                    {r.image_url ? (
                      <img src={resolveImage(r.image_url)!} alt={r.name} className="w-full h-full object-cover" />
                    ) : (
                      <Gift size={36} className="text-[#636366]" />
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{r.name}</div>
                        {r.category && <div className="text-[11px] text-[#636366]">{r.category}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-primary-400">{r.points_cost.toLocaleString()}</div>
                        <div className="text-[10px] text-[#636366]">pts</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#636366]">
                      <span>Stock: {r.stock === null ? '∞' : r.stock}</span>
                      <span>·</span>
                      <span>{r.fulfilled_count}/{r.redemption_count} claimed</span>
                      {r.expires_at && (
                        <>
                          <span>·</span>
                          <span>exp {format(new Date(r.expires_at), 'MMM d')}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <button onClick={() => toggleMutation.mutate(r.id)}
                        className="text-[11px] text-[#a0a0a0] hover:text-white flex items-center gap-1">
                        {r.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
                        {r.is_active ? 'Active' : 'Hidden'}
                      </button>
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(r)} className="p-1.5 rounded hover:bg-dark-surface2 text-[#a0a0a0]" title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => confirm(`Delete "${r.name}"?`) && deleteMutation.mutate(r.id)}
                          className="p-1.5 rounded hover:bg-dark-surface2 text-red-400" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'redemptions' && (
        <Card>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
              <input value={redSearch} onChange={e => setRedSearch(e.target.value)}
                placeholder="Search by code, member name or email…"
                className="w-full pl-9 pr-4 py-2 bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white placeholder-[#636366]" />
            </div>
            <select value={redStatus} onChange={e => setRedStatus(e.target.value)}
              className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white">
              <option value="">All status</option>
              <option value="pending">Pending</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-t-secondary border-b border-dark-border">
                  <th className="pb-3 font-medium">Code</th>
                  <th className="pb-3 font-medium">Member</th>
                  <th className="pb-3 font-medium">Reward</th>
                  <th className="pb-3 font-medium text-right">Points</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">When</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {(redemptionsData?.data ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-[#636366]">No redemptions yet.</td></tr>
                ) : (redemptionsData.data as any[]).map(r => (
                  <tr key={r.id} className="hover:bg-dark-surface2">
                    <td className="py-2 font-mono text-xs text-primary-300">{r.code}</td>
                    <td className="py-2">
                      {r.member ? (
                        <Link to={`/members/${r.member.id}`} className="hover:text-primary-300">
                          <div className="text-white text-sm">{r.member.user?.name}</div>
                          <div className="text-[11px] text-[#636366]">{r.member.user?.email}</div>
                        </Link>
                      ) : <span className="text-[#636366]">—</span>}
                    </td>
                    <td className="py-2">
                      <div className="text-white text-sm">{r.reward?.name ?? '—'}</div>
                      {r.reward?.category && <div className="text-[11px] text-[#636366]">{r.reward.category}</div>}
                    </td>
                    <td className="py-2 text-right text-white font-semibold">{r.points_spent.toLocaleString()}</td>
                    <td className="py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'fulfilled' ? 'bg-[#32d74b]/15 text-[#32d74b]' :
                        r.status === 'pending'   ? 'bg-[#f59e0b]/15 text-[#f59e0b]' :
                                                   'bg-dark-surface3 text-[#636366]'
                      }`}>{r.status}</span>
                    </td>
                    <td className="py-2 text-xs text-t-secondary">{format(new Date(r.created_at), 'MMM d, HH:mm')}</td>
                    <td className="py-2">
                      {r.status === 'pending' && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => fulfillMutation.mutate(r.id)}
                            className="p-1.5 rounded hover:bg-dark-surface2 text-emerald-400" title="Mark fulfilled">
                            <CheckCircle size={14} />
                          </button>
                          <button onClick={() => confirm('Cancel this redemption? Points will be refunded.') && cancelMutation.mutate(r.id)}
                            className="p-1.5 rounded hover:bg-dark-surface2 text-red-400" title="Cancel + refund">
                            <XCircle size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
