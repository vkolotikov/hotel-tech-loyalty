import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Pencil, Trash2, Zap, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { QueryError } from '../components/QueryError'
import { Card } from '../components/ui/Card'

/**
 * Earn-rate boost events — "Double points weekend", "Triple points
 * for Diamond members at Spa". Time-bounded multiplier applied on
 * top of the tier earn_rate. Highest-matching multiplier wins (no
 * stacking) so an admin can't accidentally create a 6x event by
 * overlapping two 3x campaigns.
 */

const DAYS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
]

const emptyForm = {
  name: '', description: '', multiplier: '2.0',
  starts_at: '', ends_at: '',
  days_of_week: [] as number[],
  tier_ids: [] as number[],
  property_id: '' as string | number,
  is_active: true,
}

export function EarnRateEvents() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<typeof emptyForm>(emptyForm)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['earn-rate-events'],
    queryFn: () => api.get('/v1/admin/earn-rate-events').then(r => r.data),
  })

  const { data: tiersData } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })
  const tiers: { id: number; name: string; color_hex: string }[] = tiersData?.tiers ?? []

  const { data: propertiesData } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => api.get('/v1/admin/properties').then(r => r.data),
  })
  const properties: { id: number; name: string }[] = propertiesData?.properties ?? []

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        description: form.description || null,
        multiplier: Number(form.multiplier),
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        days_of_week: form.days_of_week.length ? form.days_of_week : null,
        tier_ids: form.tier_ids.length ? form.tier_ids : null,
        property_id: form.property_id ? Number(form.property_id) : null,
        is_active: form.is_active,
      }
      return editId
        ? api.put(`/v1/admin/earn-rate-events/${editId}`, payload).then(r => r.data)
        : api.post('/v1/admin/earn-rate-events', payload).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['earn-rate-events'] })
      toast.success(editId ? t('boostEvents.toasts.updated', 'Event updated') : t('boostEvents.toasts.created', 'Event created'))
      resetForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || t('boostEvents.toasts.save_failed', 'Save failed')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/earn-rate-events/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['earn-rate-events'] }); toast.success(t('boostEvents.toasts.deleted', 'Event deleted')) },
    onError: (e: any) => toast.error(e.response?.data?.message || t('boostEvents.toasts.delete_failed', 'Delete failed')),
  })

  const resetForm = () => { setShowForm(false); setEditId(null); setForm(emptyForm) }

  const startEdit = (e: any) => {
    setEditId(e.id)
    setForm({
      name: e.name,
      description: e.description ?? '',
      multiplier: String(e.multiplier ?? '2.0'),
      starts_at: e.starts_at ? e.starts_at.slice(0, 16) : '',
      ends_at: e.ends_at ? e.ends_at.slice(0, 16) : '',
      days_of_week: Array.isArray(e.days_of_week) ? e.days_of_week : [],
      tier_ids: Array.isArray(e.tier_ids) ? e.tier_ids : [],
      property_id: e.property_id ?? '',
      is_active: !!e.is_active,
    })
    setShowForm(true)
  }

  const toggleDay = (d: number) => {
    setForm(f => ({
      ...f,
      days_of_week: f.days_of_week.includes(d)
        ? f.days_of_week.filter(x => x !== d)
        : [...f.days_of_week, d].sort(),
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('boostEvents.title', 'Earn-rate events')}</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            {t('boostEvents.subtitle', 'Time-bounded point multipliers. Apply on top of the tier earn rate. Highest matching multiplier wins — no stacking.')}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm font-semibold">
          <Plus size={16} /> {t('boostEvents.new_event', 'New event')}
        </button>
      </div>

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">{editId ? t('boostEvents.edit_event', 'Edit event') : t('boostEvents.new_event', 'New event')}</h2>
            <button onClick={resetForm} aria-label={t('common.close', 'Close')} className="text-t-secondary hover:text-white"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-t-secondary mb-1">{t('boostEvents.form.name', 'Name *')}</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('boostEvents.form.name_placeholder', 'e.g. Double points weekend')}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-t-secondary mb-1">{t('boostEvents.form.multiplier', 'Multiplier *')}</label>
              <input type="number" step="0.1" min={1} max={10}
                value={form.multiplier} onChange={e => setForm(f => ({ ...f, multiplier: e.target.value }))}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
              <p className="text-[10px] text-[#636366] mt-1">{t('boostEvents.form.multiplier_hint', '2.0 = double, 1.5 = +50%, etc.')}</p>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-t-secondary mb-1">{t('boostEvents.form.description', 'Description')}</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={t('boostEvents.form.description_placeholder', 'Optional context for staff')}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-t-secondary mb-1">{t('boostEvents.form.starts', 'Starts *')}</label>
              <input type="datetime-local" value={form.starts_at}
                onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-t-secondary mb-1">{t('boostEvents.form.ends', 'Ends *')}</label>
              <input type="datetime-local" value={form.ends_at}
                onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-t-secondary mb-1">{t('boostEvents.form.days', 'Days of week')} <span className="text-[#636366]">{t('boostEvents.form.days_hint', '(optional — empty = every day)')}</span></label>
            <div className="flex gap-1">
              {DAYS.map(d => (
                <button key={d.value} type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    form.days_of_week.includes(d.value)
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-dark-bg text-[#a0a0a0] border-dark-border hover:text-white'
                  }`}>{d.label}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-t-secondary mb-1">{t('boostEvents.form.limit_tiers', 'Limit to tiers')} <span className="text-[#636366]">{t('boostEvents.form.optional', '(optional)')}</span></label>
              <select multiple
                value={form.tier_ids.map(String)}
                onChange={e => setForm(f => ({ ...f, tier_ids: Array.from(e.target.selectedOptions).map(o => Number(o.value)) }))}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white h-24">
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p className="text-[10px] text-[#636366] mt-1">{t('boostEvents.form.tiers_hint', 'Hold ctrl/cmd to select multiple. Empty = all tiers.')}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-t-secondary mb-1">{t('boostEvents.form.limit_property', 'Limit to property')} <span className="text-[#636366]">{t('boostEvents.form.optional', '(optional)')}</span></label>
              <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">{t('boostEvents.form.all_properties', 'All properties')}</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#a0a0a0] mb-4">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            {t('boostEvents.form.active', 'Active (event will apply during its window)')}
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-dark-border">
            <button onClick={resetForm} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">{t('common.cancel', 'Cancel')}</button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name.trim() || !form.starts_at || !form.ends_at}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {saveMutation.isPending ? t('common.saving', 'Saving…') : (editId ? t('common.update', 'Update') : t('common.create', 'Create'))}
            </button>
          </div>
        </Card>
      )}

      {(['active', 'upcoming', 'past'] as const).map(bucket => {
        const rows: any[] = data?.[bucket] ?? []
        return (
          <Card key={bucket}>
            <h2 className="text-base font-semibold text-white mb-3 capitalize flex items-center gap-2">
              {bucket === 'active' ? <Zap size={16} className="text-emerald-400" /> : <Calendar size={16} className="text-t-secondary" />}
              {t(`boostEvents.buckets.${bucket}`, bucket)}
              <span className="text-xs text-[#636366] font-normal">({rows.length})</span>
            </h2>
            {isError ? (
              <QueryError onRetry={() => refetch()} />
            ) : isLoading ? (
              <p className="text-center text-[#636366] py-6 text-sm">{t('common.loading', 'Loading…')}</p>
            ) : rows.length === 0 ? (
              <p className="text-center text-[#636366] py-6 text-sm">
                {bucket === 'active' ? t('boostEvents.empty.active', 'No active boosts right now.') :
                 bucket === 'upcoming' ? t('boostEvents.empty.upcoming', 'Nothing scheduled.') :
                 t('boostEvents.empty.past', 'No past events yet.')}
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-3 bg-[#1a1a1a] border border-dark-border rounded-lg">
                    <div className="text-2xl font-bold text-primary-400 min-w-[60px]">{Number(e.multiplier).toFixed(1)}x</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">{e.name}</div>
                      <div className="text-[11px] text-[#a0a0a0]">
                        {format(new Date(e.starts_at), 'MMM d, HH:mm')} → {format(new Date(e.ends_at), 'MMM d, HH:mm')}
                        {Array.isArray(e.days_of_week) && e.days_of_week.length > 0 && (
                          <> · {(e.days_of_week as number[]).map(d => DAYS[d]?.label).join(' / ')}</>
                        )}
                        {Array.isArray(e.tier_ids) && e.tier_ids.length > 0 && (
                          <> · {(e.tier_ids as number[]).map(id => tiers.find(t => t.id === id)?.name).filter(Boolean).join(' / ')}</>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(e)} className="p-1.5 rounded hover:bg-dark-surface3 text-[#a0a0a0]" title={t('common.edit', 'Edit')} aria-label={t('common.edit', 'Edit')}><Pencil size={13} /></button>
                      <button onClick={() => confirm(t('boostEvents.delete_confirm', { name: e.name, defaultValue: 'Delete "{{name}}"?' })) && deleteMutation.mutate(e.id)}
                        className="p-1.5 rounded hover:bg-dark-surface3 text-red-400" title={t('common.delete', 'Delete')} aria-label={t('common.delete', 'Delete')}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
