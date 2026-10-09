import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2, Star, Sparkles, Upload } from 'lucide-react'
import { api, resolveImage } from '../lib/api'
import { QueryError } from '../components/QueryError'
import { Card } from '../components/ui/Card'
import { DatePicker, normalizeDate } from '../components/ui/DatePicker'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { buildOfferFormData, offerTierIds } from '../components/admin/offerFormData'

export function Offers() {
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(false)
  const [editOffer, setEditOffer] = useState<any>(null)
  const qc = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-offers'],
    queryFn: () => api.get('/v1/admin/offers').then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/offers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-offers'] }); toast.success(t('offers.toasts.deleted', 'Offer deleted')) },
    onError: (e: any) => toast.error(e.response?.data?.message || t('offers.toasts.delete_failed', 'Delete failed')),
  })

  const typeColors: Record<string, string> = {
    discount: 'bg-blue-500/15 text-blue-400',
    points_multiplier: 'bg-amber-500/15 text-amber-400',
    free_night: 'bg-success/15 text-success',
    upgrade: 'bg-purple-500/15 text-purple-400',
    bonus_points: 'bg-pink-500/15 text-pink-400',
    cashback: 'bg-teal-500/15 text-teal-400',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('offers.title', 'Special Offers')}</h1>
        <button
          onClick={() => { setEditOffer(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary-600 text-on-primary px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} /> {t('offers.create', 'Create Offer')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isError
          ? <div className="col-span-full"><QueryError onRetry={() => refetch()} /></div>
          : isLoading
          ? Array(6).fill(0).map((_, i) => <div key={i} className="bg-dark-surface rounded-xl border border-dark-border p-6 animate-pulse"><div className="h-4 bg-dark-surface2 rounded w-3/4 mb-3" /><div className="h-3 bg-dark-surface2 rounded w-1/2" /></div>)
          : (data?.data ?? []).map((offer: any) => (
            <Card key={offer.id} className="relative overflow-hidden">
              {offer.image_url && (
                <div className="-mx-6 -mt-6 mb-4">
                  <img
                    src={resolveImage(offer.image_url)!}
                    alt={offer.title}
                    className="w-full h-36 object-cover"
                  />
                </div>
              )}
              {offer.is_featured && (
                <div className="absolute top-3 right-3">
                  <Star size={16} className="text-amber-400 fill-amber-400" />
                </div>
              )}
              {offer.ai_generated && (
                <div className="flex items-center gap-1 text-xs text-primary-400 mb-2">
                  <Sparkles size={12} /> {t('offers.ai_generated', 'AI Generated')}
                </div>
              )}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mb-1 ${typeColors[offer.type] ?? 'bg-dark-surface3 text-t-soft'}`}>
                    {t(`offers.types.${offer.type}`, { defaultValue: String(offer.type ?? '').replace(/_/g, ' ') })}
                  </span>
                  <h4 className="font-semibold text-white">{offer.title}</h4>
                  {offer.code && <div className="font-mono text-xs text-primary-300 mt-0.5">{offer.code}</div>}
                </div>
              </div>
              <p className="text-sm text-t-secondary mb-3 line-clamp-2">{offer.description}</p>
              <div className="text-sm text-t-muted mb-4">
                {format(new Date(offer.start_date), 'MMM d')} — {format(new Date(offer.end_date), 'MMM d, yyyy')}
                {offer.usage_limit && <span className="ml-2">· {t('offers.usage_used', { used: offer.times_used, limit: offer.usage_limit, defaultValue: '{{used}}/{{limit}} used' })}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${offer.is_active ? 'bg-success/15 text-success' : 'bg-dark-surface3 text-t-muted'}`}>
                  {offer.is_active ? t('offers.active', 'Active') : t('offers.inactive', 'Inactive')}
                </span>
                <div className="flex-1" />
                <button onClick={() => { setEditOffer(offer); setShowForm(true) }} className="p-1.5 text-t-muted hover:text-primary-400 hover:bg-primary-500/10 rounded">
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => {
                    // SpecialOffer has no SoftDeletes — this is permanent.
                    // Every other delete in this section confirms first.
                    if (confirm(t('offers.delete_confirm', { name: offer.title, defaultValue: 'Permanently delete "{{name}}"? This cannot be undone.' }))) {
                      deleteMutation.mutate(offer.id)
                    }
                  }}
                  aria-label={t('offers.delete_label', 'Delete offer')}
                  className="p-1.5 text-t-muted hover:text-danger hover:bg-danger/10 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))
        }
      </div>

      {showForm && <OfferForm offer={editOffer} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function OfferForm({ offer, onClose }: { offer: any, onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(offer?.image_url ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    title: offer?.title ?? '',
    description: offer?.description ?? '',
    type: offer?.type ?? 'discount',
    value: offer?.value ?? '',
    code: offer?.code ?? '',
    tier_ids: offerTierIds(offer?.tier_ids),
    per_member_limit: offer?.per_member_limit != null ? String(offer.per_member_limit) : '',
    applies_to: offer?.applies_to ?? 'all',
    start_date: normalizeDate(offer?.start_date ?? '') || new Date().toISOString().slice(0, 10),
    end_date: normalizeDate(offer?.end_date ?? ''),
    usage_limit: offer?.usage_limit ?? '',
    is_featured: offer?.is_featured ?? false,
    is_active: offer?.is_active ?? true,
  })

  // Tier targeting checkboxes — same list the Tiers page itself reads, so
  // there is one source of truth for "which tiers exist" rather than a
  // second, driftable copy in this form.
  const { data: tiersData } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })
  const tiers: { id: number; name: string }[] = tiersData?.tiers ?? []

  const toggleTier = (id: number) => setForm(f => ({
    ...f,
    tier_ids: f.tier_ids.includes(id) ? f.tier_ids.filter(tid => tid !== id) : [...f.tier_ids, id],
  }))

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const save = async () => {
    try {
      const formData = buildOfferFormData(form, { editing: !!offer, imageFile })

      if (offer) {
        formData.append('_method', 'PUT')
        await api.post(`/v1/admin/offers/${offer.id}`, formData)
        toast.success(t('offers.toasts.updated', 'Offer updated'))
      } else {
        await api.post('/v1/admin/offers', formData)
        toast.success(t('offers.toasts.created', 'Offer created'))
      }
      qc.invalidateQueries({ queryKey: ['admin-offers'] })
      onClose()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('offers.toasts.save_failed', 'Save failed'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-dark-border flex items-center justify-between">
          <h3 className="font-bold text-white">{offer ? t('offers.form.edit_title', 'Edit Offer') : t('offers.form.create_title', 'Create Offer')}</h3>
          <button onClick={onClose} className="text-t-muted hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {(['title', 'description'] as const).map((f) => (
            <div key={f}>
              <label className="block text-sm font-medium text-t-soft mb-1">{t(`offers.form.${f}`, f.charAt(0).toUpperCase() + f.slice(1))}</label>
              {f === 'description'
                ? <textarea value={(form as any)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="w-full bg-panel border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-muted focus:outline-none focus:ring-2 focus:ring-primary-500" rows={3} />
                : <input type="text" value={(form as any)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="w-full bg-panel border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-muted focus:outline-none focus:ring-2 focus:ring-primary-500" />
              }
            </div>
          ))}

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.image', 'Image')}</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg border border-dark-border" />
                <button
                  onClick={() => { setImagePreview(null); setImageFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="absolute top-2 right-2 bg-dark-surface/80 text-danger rounded-full p-1 hover:bg-dark-surface"
                >✕</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-panel border border-dashed border-dark-border2 rounded-lg px-3 py-4 text-sm text-t-muted hover:border-primary-500 hover:text-primary-400 transition-colors flex items-center justify-center gap-2"
              >
                <Upload size={16} /> {t('offers.form.upload_image', 'Upload Image')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.type', 'Type')}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full bg-panel border border-dark-border rounded-lg px-3 py-2 text-sm text-white">
                {['discount','points_multiplier','free_night','upgrade','bonus_points','cashback','fixed_amount'].map(typeKey => (
                  <option key={typeKey} value={typeKey}>{t(`offers.types.${typeKey}`, typeKey.replace(/_/g, ' '))}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.value', 'Value')}</label>
              <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-full bg-panel border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.code', 'Code')}</label>
              <input
                type="text"
                value={form.code}
                maxLength={24}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                onBlur={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full bg-panel border border-dark-border rounded-lg px-3 py-2 text-sm text-white font-mono uppercase placeholder-t-muted placeholder:normal-case"
                placeholder={t('offers.form.code_hint', 'Members type this in the portal')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.per_member_limit', 'Per-member limit')}</label>
              <input
                type="number"
                min={1}
                value={form.per_member_limit}
                onChange={(e) => setForm({ ...form, per_member_limit: e.target.value })}
                placeholder={t('offers.form.usage_limit_placeholder', 'Unlimited')}
                className="w-full bg-panel border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.applies_to', 'Applies to')}</label>
              <select value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })} className="w-full bg-panel border border-dark-border rounded-lg px-3 py-2 text-sm text-white">
                {['all','services','stays'].map(scope => (
                  <option key={scope} value={scope}>{t(`tiers.applies.${scope}`, scope)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.start_date', 'Start Date')}</label>
              <DatePicker value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} placeholder={t('offers.form.start_placeholder', 'Pick start date')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.end_date', 'End Date')}</label>
              <DatePicker value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} placeholder={t('offers.form.end_placeholder', 'Pick end date')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.usage_limit', 'Usage limit')}</label>
              <input
                type="number"
                min={1}
                value={form.usage_limit}
                onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
                placeholder={t('offers.form.usage_limit_placeholder', 'Unlimited')}
                className="w-full bg-panel border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-muted"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-t-soft mb-1">{t('offers.form.tiers', 'Tiers')}</label>
            <div className="flex flex-wrap gap-3">
              {tiers.map(tier => (
                <label key={tier.id} className="flex items-center gap-1.5 text-sm text-t-soft">
                  <input type="checkbox" checked={form.tier_ids.includes(tier.id)} onChange={() => toggleTier(tier.id)} />
                  {tier.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-t-soft"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} /> {t('offers.form.featured', 'Featured')}</label>
            <label className="flex items-center gap-2 text-sm text-t-soft"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> {t('offers.form.active', 'Active')}</label>
          </div>
        </div>
        <div className="p-6 border-t border-dark-border flex gap-3">
          <button onClick={onClose} className="flex-1 border border-dark-border text-t-soft py-2.5 rounded-lg text-sm font-medium hover:bg-dark-surface2">{t('offers.form.cancel', 'Cancel')}</button>
          <button onClick={save} className="flex-1 bg-primary-600 text-on-primary py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700">{t('offers.form.save', 'Save')}</button>
        </div>
      </div>
    </div>
  )
}
