import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, X, Save, RefreshCw, Upload, Sparkles } from 'lucide-react'
import { PairTabs, EXTRAS_TABS } from '../components/PairTabs'

interface Extra {
  id: number
  name: string
  description: string | null
  price: number
  price_type: string
  duration_minutes: number
  lead_time_hours?: number
  currency: string
  image: string | null
  icon: string | null
  category: string | null
  sort_order: number
  is_active: boolean
}

const PRICE_TYPES = [
  { value: 'per_booking', label: 'Per booking' },
  { value: 'per_person',  label: 'Per person' },
]

const card = 'rounded-2xl border border-white/[0.06] p-5'
const cardBg = { background: 'linear-gradient(135deg, rgba(15,28,24,0.5), rgba(10,18,16,0.6))', backdropFilter: 'blur(20px)' }
const inputCls = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all'
const btnPrimaryStyle = { background: 'linear-gradient(135deg, var(--color-primary, #74c895), color-mix(in srgb, var(--color-primary, #74c895) 80%, #000))', color: '#fff' }

export default function ServiceExtras() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Extra | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: extras = [], isLoading } = useQuery<Extra[]>({
    queryKey: ['service-extras'],
    queryFn: () => api.get('/v1/admin/service-extras').then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/service-extras/${id}`),
    onSuccess: () => { toast.success('Extra deleted'); qc.invalidateQueries({ queryKey: ['service-extras'] }) },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to delete'),
  })

  return (
    <div className="space-y-6">
      <PairTabs tabs={EXTRAS_TABS} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Service Extras</h1>
          <p className="text-xs text-gray-500 mt-1">Add-ons offered alongside service bookings — aromatherapy, refreshments, gift wrapping, etc.</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
          <Plus size={14} /> Add Extra
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className={card + ' h-32 animate-pulse'} style={cardBg} />)}
        </div>
      ) : extras.length === 0 ? (
        <div className={card + ' text-center py-16'} style={cardBg}>
          <Sparkles size={40} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 font-medium">No extras yet</p>
          <p className="text-xs text-gray-600 mt-1">Add-ons appear in the booking widget after the customer picks a slot.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {extras.map(extra => (
            <div key={extra.id} className={card + ' transition-all hover:border-white/[0.12]'} style={cardBg}>
              <div className="flex gap-3">
                {extra.image ? (
                  <img src={resolveImage(extra.image) || ''} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <Sparkles size={20} className="text-gray-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h4 className="text-sm font-bold text-white truncate">{extra.name}</h4>
                    {!extra.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold uppercase">Off</span>}
                  </div>
                  {extra.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{extra.description}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-white">
                      {extra.currency} {Number(extra.price).toFixed(0)}
                      <span className="text-xs font-normal text-gray-500"> / {PRICE_TYPES.find(p => p.value === extra.price_type)?.label || extra.price_type}</span>
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(extra); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-all"><Pencil size={12} /></button>
                      <button onClick={() => { if (confirm('Delete?')) deleteMut.mutate(extra.id) }} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all"><Trash2 size={12} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ExtraForm extra={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['service-extras'] }); setShowForm(false); setEditing(null) }} />
      )}
    </div>
  )
}

function ExtraForm({ extra, onClose, onSaved }: { extra: Extra | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(extra?.name || '')
  const [description, setDescription] = useState(extra?.description || '')
  const [price, setPrice] = useState<string>(extra?.price != null ? String(extra.price) : '')
  const [priceType, setPriceType] = useState(extra?.price_type || 'per_booking')
  const [currency, setCurrency] = useState(extra?.currency || 'EUR')
  const [duration, setDuration] = useState<string>(extra?.duration_minutes != null ? String(extra.duration_minutes) : '')
  const [leadTimeHours, setLeadTimeHours] = useState<string>(
    extra?.lead_time_hours != null ? String(extra.lead_time_hours) : '0'
  )
  const [category, setCategory] = useState(extra?.category || '')
  const [isActive, setIsActive] = useState(extra?.is_active ?? true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(extra?.image ? (resolveImage(extra.image) || null) : null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const fd = new FormData()
    fd.append('name', name)
    fd.append('description', description)
    fd.append('price', String(Number(price) || 0))
    fd.append('price_type', priceType)
    fd.append('currency', currency)
    fd.append('duration_minutes', String(Number(duration) || 0))
    fd.append('lead_time_hours', String(Math.max(0, Math.min(168, Number(leadTimeHours) || 0))))
    fd.append('category', category)
    fd.append('is_active', isActive ? '1' : '0')
    if (imageFile) fd.append('image', imageFile)

    try {
      if (extra?.id) {
        fd.append('_method', 'PUT')
        await api.post(`/v1/admin/service-extras/${extra.id}`, fd)
      } else {
        await api.post('/v1/admin/service-extras', fd)
      }
      toast.success('Extra saved')
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh] overflow-y-auto pb-10">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] p-6" style={{ background: 'linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98))' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">{extra ? 'Edit Extra' : 'Add Service Extra'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex items-center justify-center cursor-pointer"
              onClick={() => fileRef.current?.click()}>
              {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <Upload size={20} className="text-gray-600" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)) }
            }} />
            <div className="text-xs text-gray-600">Optional image</div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Aromatherapy upgrade" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Price</label>
              <input type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} min={0} step={0.5} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
                {['EUR','USD','GBP','CHF'].map(c => <option key={c} value={c} style={{ background: '#0f1c18', color: '#fff' }}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Charge</label>
              <select value={priceType} onChange={e => setPriceType(e.target.value)} className={inputCls}>
                {PRICE_TYPES.map(pt => <option key={pt.value} value={pt.value} style={{ background: '#0f1c18', color: '#fff' }}>{pt.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Adds time (min)</label>
              <input type="number" inputMode="numeric" value={duration} onChange={e => setDuration(e.target.value)} min={0} step={5} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Category (optional)</label>
              <input value={category} onChange={e => setCategory(e.target.value)} className={inputCls} placeholder="aromatherapy" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
              Min. advance booking (hours)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={leadTimeHours}
              onChange={e => setLeadTimeHours(e.target.value)}
              min={0}
              max={168}
              step={1}
              className={inputCls}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Hours of preparation needed before the service starts. Guests booking with less notice won't see this extra. <span className="text-gray-400">0 = always available</span>.
            </p>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-white font-medium">Active</span>
            <button type="button" onClick={() => setIsActive(!isActive)}
              className={`w-11 h-6 rounded-full transition-all ${isActive ? 'bg-primary-500' : 'bg-white/[0.08]'}`}>
              <div className="w-5 h-5 rounded-full bg-white shadow-sm transition-all" style={{ transform: `translateX(${isActive ? '22px' : '2px'})` }} />
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.04]">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/[0.04] border border-white/[0.06] text-gray-400">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {extra ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
