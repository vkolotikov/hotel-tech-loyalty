import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Crown, Plus, Pencil, X, Users, Award } from 'lucide-react'
import toast from 'react-hot-toast'

interface Tier {
  id: number
  name: string
  min_points: number
  max_points: number | null
  earn_rate: number
  color_hex: string
  description: string | null
  min_nights: number | null
  min_stays: number | null
  min_spend: number | null
  qualification_window: string | null
  grace_period_days: number | null
  soft_landing: boolean
  invitation_only: boolean
  is_active: boolean
  sort_order: number
  member_count: number
}

interface TierBenefit {
  id: number
  tier_id: number
  benefit_id: number
  value: string | null
  custom_description: string | null
  is_active: boolean
  benefit: { id: number; name: string; code: string; category: string }
}

const emptyForm = {
  name: '', min_points: '0', max_points: '', earn_rate: '1',
  color_hex: '#C0C0C0', description: '', min_nights: '', min_stays: '',
  min_spend: '', qualification_window: 'rolling_12', grace_period_days: '90',
  soft_landing: true, invitation_only: false, sort_order: '0',
}

export function Tiers() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [expandedTier, setExpandedTier] = useState<number | null>(null)
  const [assignForm, setAssignForm] = useState({ benefit_id: '', value: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })

  const { data: benefitsData } = useQuery({
    queryKey: ['admin-benefits'],
    queryFn: () => api.get('/v1/admin/benefits').then(r => r.data),
  })

  const { data: tierBenefitsData } = useQuery({
    queryKey: ['admin-tier-benefits', expandedTier],
    queryFn: () => api.get(`/v1/admin/tiers/${expandedTier}/benefits`).then(r => r.data),
    enabled: !!expandedTier,
  })

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editId ? api.put(`/v1/admin/tiers/${editId}`, data) : api.post('/v1/admin/tiers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tiers'] })
      setShowForm(false); setEditId(null); setForm(emptyForm)
      toast.success(editId ? 'Tier updated' : 'Tier created')
    },
    onError: () => toast.error('Failed to save tier'),
  })

  const assignBenefitMutation = useMutation({
    mutationFn: (data: any) => api.post('/v1/admin/tier-benefits', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tier-benefits', expandedTier] })
      setAssignForm({ benefit_id: '', value: '' })
      toast.success('Benefit assigned')
    },
    onError: () => toast.error('Failed to assign benefit'),
  })

  const removeBenefitMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/tier-benefits/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tier-benefits', expandedTier] })
      toast.success('Benefit removed')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate({
      ...form,
      min_points: Number(form.min_points),
      max_points: form.max_points ? Number(form.max_points) : null,
      earn_rate: Number(form.earn_rate),
      min_nights: form.min_nights ? Number(form.min_nights) : null,
      min_stays: form.min_stays ? Number(form.min_stays) : null,
      min_spend: form.min_spend ? Number(form.min_spend) : null,
      grace_period_days: form.grace_period_days ? Number(form.grace_period_days) : null,
      sort_order: Number(form.sort_order),
    })
  }

  const startEdit = (t: Tier) => {
    setEditId(t.id)
    setForm({
      name: t.name, min_points: t.min_points.toString(), max_points: t.max_points?.toString() || '',
      earn_rate: t.earn_rate.toString(), color_hex: t.color_hex || '#C0C0C0',
      description: t.description || '', min_nights: t.min_nights?.toString() || '',
      min_stays: t.min_stays?.toString() || '', min_spend: t.min_spend?.toString() || '',
      qualification_window: t.qualification_window || 'rolling_12',
      grace_period_days: t.grace_period_days?.toString() || '90',
      soft_landing: t.soft_landing, invitation_only: t.invitation_only,
      sort_order: t.sort_order.toString(),
    })
    setShowForm(true)
  }

  const tiers: Tier[] = data?.tiers || []
  const allBenefits = benefitsData?.benefits || []
  const tierBenefits: TierBenefit[] = tierBenefitsData?.tier_benefits || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tiers</h1>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm">
          <Plus size={16} /> Add Tier
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{editId ? 'Edit' : 'New'} Tier</h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-[#8e8e93] hover:text-white"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tier Name" required
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.color_hex} onChange={e => setForm({ ...form, color_hex: e.target.value })} type="color"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 h-[38px]" />
            <input value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} placeholder="Sort order" type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <input value={form.min_points} onChange={e => setForm({ ...form, min_points: e.target.value })} placeholder="Min Points" type="number" required
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.max_points} onChange={e => setForm({ ...form, max_points: e.target.value })} placeholder="Max Points" type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.earn_rate} onChange={e => setForm({ ...form, earn_rate: e.target.value })} placeholder="Earn Rate" type="number" step="0.01" required
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.grace_period_days} onChange={e => setForm({ ...form, grace_period_days: e.target.value })} placeholder="Grace days" type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <input value={form.min_nights} onChange={e => setForm({ ...form, min_nights: e.target.value })} placeholder="Min Nights" type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.min_stays} onChange={e => setForm({ ...form, min_stays: e.target.value })} placeholder="Min Stays" type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.min_spend} onChange={e => setForm({ ...form, min_spend: e.target.value })} placeholder="Min Spend ($)" type="number" step="0.01"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="flex items-center gap-6">
            <select value={form.qualification_window} onChange={e => setForm({ ...form, qualification_window: e.target.value })}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm">
              <option value="rolling_12">Rolling 12 Months</option>
              <option value="calendar_year">Calendar Year</option>
              <option value="anniversary_year">Anniversary Year</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-[#8e8e93]">
              <input type="checkbox" checked={form.soft_landing} onChange={e => setForm({ ...form, soft_landing: e.target.checked })} className="rounded" />
              Soft Landing
            </label>
            <label className="flex items-center gap-2 text-sm text-[#8e8e93]">
              <input type="checkbox" checked={form.invitation_only} onChange={e => setForm({ ...form, invitation_only: e.target.checked })} className="rounded" />
              Invitation Only
            </label>
          </div>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description"
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" rows={2} />
          <button type="submit" disabled={saveMutation.isPending}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="text-center text-[#8e8e93] py-12">Loading...</div>
      ) : (
        <div className="space-y-4">
          {tiers.map(t => (
            <div key={t.id} className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-dark-surface2 transition-colors"
                onClick={() => setExpandedTier(expandedTier === t.id ? null : t.id)}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: t.color_hex + '20' }}>
                    <Crown size={20} style={{ color: t.color_hex }} />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">{t.name}</h3>
                    <p className="text-xs text-[#8e8e93]">
                      {t.min_points.toLocaleString()} pts
                      {t.max_points ? ` - ${t.max_points.toLocaleString()} pts` : '+'}
                      {' · '}{t.earn_rate}x earn
                      {t.invitation_only && ' · Invite only'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-[#8e8e93]">
                    <Users size={14} />
                    <span className="text-sm">{t.member_count}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); startEdit(t) }} className="text-[#8e8e93] hover:text-white p-1"><Pencil size={14} /></button>
                </div>
              </div>

              {expandedTier === t.id && (
                <div className="border-t border-dark-border px-6 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-[#8e8e93]">Tier Benefits</h4>
                  </div>

                  {tierBenefits.map(tb => (
                    <div key={tb.id} className="flex items-center justify-between bg-dark-bg rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Award size={14} className="text-primary-400" />
                        <span className="text-white text-sm">{tb.benefit.name}</span>
                        {tb.value && <span className="text-xs text-primary-400">({tb.value})</span>}
                      </div>
                      <button onClick={() => removeBenefitMutation.mutate(tb.id)} className="text-[#8e8e93] hover:text-red-400 text-xs">Remove</button>
                    </div>
                  ))}

                  <div className="flex items-center gap-3 bg-dark-bg p-3 rounded-lg">
                    <select value={assignForm.benefit_id} onChange={e => setAssignForm({ ...assignForm, benefit_id: e.target.value })}
                      className="flex-1 bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-sm">
                      <option value="">Select benefit...</option>
                      {allBenefits.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input value={assignForm.value} onChange={e => setAssignForm({ ...assignForm, value: e.target.value })}
                      placeholder="Value (optional)" className="w-32 bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-sm" />
                    <button disabled={!assignForm.benefit_id}
                      onClick={() => assignBenefitMutation.mutate({ tier_id: t.id, benefit_id: Number(assignForm.benefit_id), value: assignForm.value || null })}
                      className="bg-primary-600 text-white px-3 py-1.5 rounded text-sm hover:bg-primary-700 disabled:opacity-50">Assign</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
