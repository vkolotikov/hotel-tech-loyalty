import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Award, Plus, Pencil, Trash2, X, Filter, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

interface Benefit {
  id: number
  name: string
  code: string
  description: string | null
  category: string
  fulfillment_mode: string
  usage_limit_per_stay: number | null
  usage_limit_per_year: number | null
  requires_active_stay: boolean
  is_active: boolean
  sort_order: number
}

const CATEGORIES = ['accommodation', 'dining', 'wellness', 'transport', 'recognition', 'points', 'access', 'other']
const FULFILLMENT_MODES = ['automatic', 'staff_approved', 'pms_linked', 'voucher', 'on_request']

const emptyForm = {
  name: '', code: '', description: '', category: 'other',
  fulfillment_mode: 'on_request', usage_limit_per_stay: '', usage_limit_per_year: '',
  requires_active_stay: true, sort_order: '0',
}

export function Benefits() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showInactive, setShowInactive] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-benefits'],
    queryFn: () => api.get('/v1/admin/benefits').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editId ? api.put(`/v1/admin/benefits/${editId}`, data) : api.post('/v1/admin/benefits', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-benefits'] })
      setShowForm(false)
      setEditId(null)
      setForm(emptyForm)
      toast.success(editId ? 'Benefit updated' : 'Benefit created')
    },
    onError: () => toast.error('Failed to save benefit'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/benefits/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-benefits'] })
      toast.success('Benefit deactivated')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/benefits/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-benefits'] })
      toast.success('Benefit status updated')
    },
    onError: () => toast.error('Failed to toggle benefit'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate({
      ...form,
      usage_limit_per_stay: form.usage_limit_per_stay ? Number(form.usage_limit_per_stay) : null,
      usage_limit_per_year: form.usage_limit_per_year ? Number(form.usage_limit_per_year) : null,
      sort_order: Number(form.sort_order),
    })
  }

  const startEdit = (b: Benefit) => {
    setEditId(b.id)
    setForm({
      name: b.name, code: b.code, description: b.description || '',
      category: b.category, fulfillment_mode: b.fulfillment_mode,
      usage_limit_per_stay: b.usage_limit_per_stay?.toString() || '',
      usage_limit_per_year: b.usage_limit_per_year?.toString() || '',
      requires_active_stay: b.requires_active_stay,
      sort_order: b.sort_order.toString(),
    })
    setShowForm(true)
  }

  const allBenefits: Benefit[] = data?.benefits || []

  const filteredBenefits = allBenefits.filter(b => {
    if (!showInactive && !b.is_active) return false
    if (categoryFilter !== 'all' && b.category !== categoryFilter) return false
    return true
  })

  const activeCount = allBenefits.filter(b => b.is_active).length
  const inactiveCount = allBenefits.filter(b => !b.is_active).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Benefits</h1>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm"
        >
          <Plus size={16} /> Add Benefit
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Show inactive toggle */}
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
            showInactive
              ? 'border-primary-500/50 bg-primary-500/10 text-primary-400'
              : 'border-dark-border bg-dark-surface text-[#8e8e93] hover:text-white'
          }`}
        >
          {showInactive ? <Eye size={14} /> : <EyeOff size={14} />}
          Show inactive
          {inactiveCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-dark-surface2 text-[#8e8e93]">{inactiveCount}</span>
          )}
        </button>

        {/* Category filter dropdown */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[#8e8e93]" />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {/* Summary counts */}
        <div className="ml-auto text-xs text-[#8e8e93]">
          {activeCount} active · {inactiveCount} inactive · {filteredBenefits.length} shown
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{editId ? 'Edit' : 'New'} Benefit</h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-[#8e8e93] hover:text-white"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name" required
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Code (e.g. early_checkin)" required disabled={!!editId}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm">
              {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
            <select value={form.fulfillment_mode} onChange={e => setForm({ ...form, fulfillment_mode: e.target.value })}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm">
              {FULFILLMENT_MODES.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
            <input value={form.usage_limit_per_stay} onChange={e => setForm({ ...form, usage_limit_per_stay: e.target.value })} placeholder="Limit per stay" type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.usage_limit_per_year} onChange={e => setForm({ ...form, usage_limit_per_year: e.target.value })} placeholder="Limit per year" type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} placeholder="Sort order" type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description"
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" rows={2} />
          <label className="flex items-center gap-2 text-sm text-[#8e8e93]">
            <input type="checkbox" checked={form.requires_active_stay} onChange={e => setForm({ ...form, requires_active_stay: e.target.checked })}
              className="rounded border-dark-border" />
            Requires active stay
          </label>
          <button type="submit" disabled={saveMutation.isPending}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="text-center text-[#8e8e93] py-12">Loading...</div>
      ) : (
        <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-border text-[#8e8e93] text-xs uppercase">
                <th className="text-left px-4 py-3">Benefit</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Fulfillment</th>
                <th className="text-left px-4 py-3">Limits</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBenefits.map(b => (
                <tr key={b.id} className={`border-b border-dark-border hover:bg-dark-surface2 transition-colors ${!b.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Award size={16} className="text-primary-400" />
                      <div>
                        <span className="text-white text-sm font-medium">{b.name}</span>
                        {!b.is_active && (
                          <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 uppercase">
                            Disabled
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#8e8e93] font-mono">{b.code}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-dark-surface2 text-[#8e8e93]">{b.category}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#8e8e93]">{b.fulfillment_mode.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-sm text-[#8e8e93]">
                    {b.usage_limit_per_stay && `${b.usage_limit_per_stay}/stay`}
                    {b.usage_limit_per_stay && b.usage_limit_per_year && ' · '}
                    {b.usage_limit_per_year && `${b.usage_limit_per_year}/yr`}
                    {!b.usage_limit_per_stay && !b.usage_limit_per_year && 'Unlimited'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <button
                        onClick={() => toggleMutation.mutate(b.id)}
                        disabled={toggleMutation.isPending}
                        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-surface disabled:opacity-50"
                        style={{ backgroundColor: b.is_active ? '#32d74b' : '#48484a' }}
                        title={b.is_active ? 'Click to disable' : 'Click to enable'}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            b.is_active ? 'translate-x-[18px]' : 'translate-x-[3px]'
                          }`}
                        />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(b)} className="text-[#8e8e93] hover:text-white p-1"><Pencil size={14} /></button>
                    <button onClick={() => deleteMutation.mutate(b.id)} className="text-[#8e8e93] hover:text-red-400 p-1 ml-1"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {filteredBenefits.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[#8e8e93]">
                  {allBenefits.length === 0 ? 'No benefits defined yet' : 'No benefits match the current filters'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
