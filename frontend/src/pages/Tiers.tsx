import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Crown, Plus, Pencil, X, Users, Award, Star, Gem, ShieldCheck, Layers, Sparkles, Calculator } from 'lucide-react'
import toast from 'react-hot-toast'

interface Tier {
  id: number
  name: string
  min_points: number
  max_points: number | null
  earn_rate: number
  color_hex: string
  icon: string | null
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

const TIER_ICON_OPTIONS = [
  { value: 'star',    label: 'Star',   Icon: Star },
  { value: 'award',   label: 'Award',  Icon: Award },
  { value: 'crown',   label: 'Crown',  Icon: Crown },
  { value: 'gem',     label: 'Gem',    Icon: Gem },
  { value: 'diamond', label: 'Diamond', Icon: Gem },
  { value: 'shield',  label: 'Shield', Icon: ShieldCheck },
  { value: 'layers',  label: 'Layers', Icon: Layers },
]

const tierIconFor = (icon?: string | null) => {
  const entry = TIER_ICON_OPTIONS.find(o => o.value === (icon || '').toLowerCase())
  return entry?.Icon ?? Crown
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
  color_hex: '#C0C0C0', icon: 'star', description: '', min_nights: '', min_stays: '',
  min_spend: '', qualification_window: 'rolling_12', grace_period_days: '90',
  soft_landing: true, invitation_only: false, sort_order: '0',
}

export function Tiers() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [expandedTier, setExpandedTier] = useState<number | null>(null)
  const [assignForm, setAssignForm] = useState({ benefit_id: '', value: '' })

  // Preview calculator state
  const [previewModel, setPreviewModel] = useState<'points' | 'nights' | 'stays' | 'spend' | 'hybrid'>('points')
  const [previewVals, setPreviewVals] = useState({ points: '5000', nights: '', stays: '', spend: '' })
  const [previewResult, setPreviewResult] = useState<any>(undefined)
  const [previewLoading, setPreviewLoading] = useState(false)

  const runPreview = async () => {
    setPreviewLoading(true)
    try {
      const payload: Record<string, any> = { model: previewModel }
      for (const k of ['points', 'nights', 'stays', 'spend'] as const) {
        const v = previewVals[k]
        if (v !== '' && v != null) payload[k] = Number(v)
      }
      const res = await api.post('/v1/admin/tiers/preview', payload).then(r => r.data)
      setPreviewResult(res.tier ?? null)
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('tiers.toasts.preview_failed', 'Could not run preview'))
    } finally {
      setPreviewLoading(false)
    }
  }

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
      toast.success(editId ? t('tiers.toasts.updated', 'Tier updated') : t('tiers.toasts.created', 'Tier created'))
    },
    onError: () => toast.error(t('tiers.toasts.save_failed', 'Failed to save tier')),
  })

  const assignBenefitMutation = useMutation({
    mutationFn: (data: any) => api.post('/v1/admin/tier-benefits', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tier-benefits', expandedTier] })
      setAssignForm({ benefit_id: '', value: '' })
      toast.success(t('tiers.toasts.benefit_assigned', 'Benefit assigned'))
    },
    onError: () => toast.error(t('tiers.toasts.benefit_assign_failed', 'Failed to assign benefit')),
  })

  const removeBenefitMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/tier-benefits/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tier-benefits', expandedTier] })
      toast.success(t('tiers.toasts.benefit_removed', 'Benefit removed'))
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
      icon: t.icon || 'star',
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
        <h1 className="text-2xl font-bold text-white">{t('tiers.title', 'Tiers')}</h1>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm">
          <Plus size={16} /> {t('tiers.add', 'Add Tier')}
        </button>
      </div>

      {/* Tier preview calculator — sanity-check what a hypothetical
          member would land on without creating a synthetic record. */}
      <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calculator size={16} className="text-primary-400" />
          <h2 className="text-sm font-semibold text-white">{t('tiers.preview.title', 'Tier preview calculator')}</h2>
          <span className="text-[11px] text-[#636366]">{t('tiers.preview.subtitle', '— what tier would a member qualify for?')}</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-medium text-t-secondary mb-1">{t('tiers.preview.model', 'Model')}</label>
            <select
              value={previewModel}
              onChange={e => setPreviewModel(e.target.value as any)}
              className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-white text-sm"
            >
              <option value="points">{t('tiers.preview.points', 'Points')}</option>
              <option value="nights">{t('tiers.preview.nights', 'Nights')}</option>
              <option value="stays">{t('tiers.preview.stays', 'Stays')}</option>
              <option value="spend">{t('tiers.preview.spend', 'Spend ($)')}</option>
              <option value="hybrid">{t('tiers.preview.hybrid', 'Hybrid (any threshold)')}</option>
            </select>
          </div>
          {(previewModel === 'points' || previewModel === 'hybrid') && (
            <div>
              <label className="block text-[11px] font-medium text-t-secondary mb-1">{t('tiers.preview.points', 'Points')}</label>
              <input
                type="number" min={0}
                value={previewVals.points}
                onChange={e => setPreviewVals(v => ({ ...v, points: e.target.value }))}
                className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-white text-sm w-28"
              />
            </div>
          )}
          {(previewModel === 'nights' || previewModel === 'hybrid') && (
            <div>
              <label className="block text-[11px] font-medium text-t-secondary mb-1">{t('tiers.preview.nights', 'Nights')}</label>
              <input
                type="number" min={0}
                value={previewVals.nights}
                onChange={e => setPreviewVals(v => ({ ...v, nights: e.target.value }))}
                className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-white text-sm w-24"
              />
            </div>
          )}
          {(previewModel === 'stays' || previewModel === 'hybrid') && (
            <div>
              <label className="block text-[11px] font-medium text-t-secondary mb-1">{t('tiers.preview.stays', 'Stays')}</label>
              <input
                type="number" min={0}
                value={previewVals.stays}
                onChange={e => setPreviewVals(v => ({ ...v, stays: e.target.value }))}
                className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-white text-sm w-24"
              />
            </div>
          )}
          {(previewModel === 'spend' || previewModel === 'hybrid') && (
            <div>
              <label className="block text-[11px] font-medium text-t-secondary mb-1">{t('tiers.preview.spend', 'Spend ($)')}</label>
              <input
                type="number" min={0} step="0.01"
                value={previewVals.spend}
                onChange={e => setPreviewVals(v => ({ ...v, spend: e.target.value }))}
                className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-white text-sm w-28"
              />
            </div>
          )}
          <button
            onClick={runPreview}
            disabled={previewLoading}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg flex items-center gap-1.5"
          >
            <Sparkles size={14} />
            {previewLoading ? t('tiers.preview.calculating', 'Calculating…') : t('tiers.preview.calculate', 'Calculate')}
          </button>
          {previewResult !== undefined && (
            <div className="ml-auto flex items-center gap-2 text-sm">
              {previewResult === null ? (
                <span className="text-amber-400">{t('tiers.preview.no_qualifying', 'No qualifying tier')}</span>
              ) : (
                <>
                  <span className="text-[#a0a0a0]">{t('tiers.preview.would_qualify', 'Would qualify for:')}</span>
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-xs"
                    style={{ backgroundColor: (previewResult.color || '#666') + '22', color: previewResult.color || '#fff', border: `1px solid ${(previewResult.color || '#666') + '55'}` }}
                  >
                    {previewResult.name}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{editId ? t('tiers.form.edit_title', 'Edit Tier') : t('tiers.form.new_title', 'New Tier')}</h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-t-secondary hover:text-white"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('tiers.form.name', 'Tier Name')} required
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.color_hex} onChange={e => setForm({ ...form, color_hex: e.target.value })} type="color"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 h-[38px]" />
            <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm">
              {TIER_ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(`tiers.icons.${o.value}`, o.label)}</option>)}
            </select>
            <input value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} placeholder={t('tiers.form.sort_order', 'Sort order')} type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <input value={form.min_points} onChange={e => setForm({ ...form, min_points: e.target.value })} placeholder={t('tiers.form.min_points', 'Min Points')} type="number" required
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.max_points} onChange={e => setForm({ ...form, max_points: e.target.value })} placeholder={t('tiers.form.max_points', 'Max Points')} type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.earn_rate} onChange={e => setForm({ ...form, earn_rate: e.target.value })} placeholder={t('tiers.form.earn_rate', 'Earn Rate')} type="number" step="0.01" required
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.grace_period_days} onChange={e => setForm({ ...form, grace_period_days: e.target.value })} placeholder={t('tiers.form.grace_days', 'Grace days')} type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <input value={form.min_nights} onChange={e => setForm({ ...form, min_nights: e.target.value })} placeholder={t('tiers.form.min_nights', 'Min Nights')} type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.min_stays} onChange={e => setForm({ ...form, min_stays: e.target.value })} placeholder={t('tiers.form.min_stays', 'Min Stays')} type="number"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.min_spend} onChange={e => setForm({ ...form, min_spend: e.target.value })} placeholder={t('tiers.form.min_spend', 'Min Spend ($)')} type="number" step="0.01"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="flex items-center gap-6">
            <select value={form.qualification_window} onChange={e => setForm({ ...form, qualification_window: e.target.value })}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm">
              <option value="rolling_12">{t('tiers.form.qualification.rolling_12', 'Rolling 12 Months')}</option>
              <option value="calendar_year">{t('tiers.form.qualification.calendar_year', 'Calendar Year')}</option>
              <option value="anniversary_year">{t('tiers.form.qualification.anniversary_year', 'Anniversary Year')}</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-t-secondary">
              <input type="checkbox" checked={form.soft_landing} onChange={e => setForm({ ...form, soft_landing: e.target.checked })} className="rounded" />
              {t('tiers.form.soft_landing', 'Soft Landing')}
            </label>
            <label className="flex items-center gap-2 text-sm text-t-secondary">
              <input type="checkbox" checked={form.invitation_only} onChange={e => setForm({ ...form, invitation_only: e.target.checked })} className="rounded" />
              {t('tiers.form.invitation_only', 'Invitation Only')}
            </label>
          </div>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t('tiers.form.description', 'Description')}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" rows={2} />
          <button type="submit" disabled={saveMutation.isPending}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">
            {saveMutation.isPending ? t('tiers.form.saving', 'Saving...') : t('tiers.form.save', 'Save')}
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="text-center text-t-secondary py-12">{t('tiers.loading', 'Loading...')}</div>
      ) : (
        <div className="space-y-4">
          {tiers.map(tier => {
            const TierIcon = tierIconFor(tier.icon)
            const rangeLabel = tier.max_points
              ? t('tiers.summary.range_closed', { min: tier.min_points.toLocaleString(), max: tier.max_points.toLocaleString(), defaultValue: '{{min}} pts - {{max}} pts' })
              : t('tiers.summary.range_open', { min: tier.min_points.toLocaleString(), defaultValue: '{{min}} pts+' })
            return (
            <div key={tier.id} className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-dark-surface2 transition-colors"
                onClick={() => setExpandedTier(expandedTier === tier.id ? null : tier.id)}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: tier.color_hex + '20' }}>
                    <TierIcon size={20} style={{ color: tier.color_hex }} />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">{tier.name}</h3>
                    <p className="text-xs text-t-secondary">
                      {rangeLabel}
                      {' · '}{t('tiers.summary.earn_x', { rate: tier.earn_rate, defaultValue: '{{rate}}x earn' })}
                      {tier.invitation_only && ' · ' + t('tiers.summary.invite_only', 'Invite only')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-t-secondary">
                    <Users size={14} />
                    <span className="text-sm">{tier.member_count}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); startEdit(tier) }} className="text-t-secondary hover:text-white p-1"><Pencil size={14} /></button>
                </div>
              </div>

              {expandedTier === tier.id && (
                <div className="border-t border-dark-border px-6 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-t-secondary">{t('tiers.expanded.title', 'Tier Benefits')}</h4>
                  </div>

                  {tierBenefits.map(tb => (
                    <div key={tb.id} className="flex items-center justify-between bg-dark-bg rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Award size={14} className="text-primary-400" />
                        <span className="text-white text-sm">{tb.benefit.name}</span>
                        {tb.value && <span className="text-xs text-primary-400">({tb.value})</span>}
                      </div>
                      <button onClick={() => removeBenefitMutation.mutate(tb.id)} className="text-t-secondary hover:text-red-400 text-xs">{t('tiers.expanded.remove', 'Remove')}</button>
                    </div>
                  ))}

                  <div className="flex items-center gap-3 bg-dark-bg p-3 rounded-lg">
                    <select value={assignForm.benefit_id} onChange={e => setAssignForm({ ...assignForm, benefit_id: e.target.value })}
                      className="flex-1 bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-sm">
                      <option value="">{t('tiers.expanded.select_benefit', 'Select benefit...')}</option>
                      {allBenefits.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input value={assignForm.value} onChange={e => setAssignForm({ ...assignForm, value: e.target.value })}
                      placeholder={t('tiers.expanded.value_placeholder', 'Value (optional)')} className="w-32 bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-sm" />
                    <button disabled={!assignForm.benefit_id}
                      onClick={() => assignBenefitMutation.mutate({ tier_id: tier.id, benefit_id: Number(assignForm.benefit_id), value: assignForm.value || null })}
                      className="bg-primary-600 text-white px-3 py-1.5 rounded text-sm hover:bg-primary-700 disabled:opacity-50">{t('tiers.expanded.assign', 'Assign')}</button>
                  </div>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
