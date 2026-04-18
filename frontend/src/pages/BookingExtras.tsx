import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import toast from 'react-hot-toast'
import { Plus, Trash2, Pencil, X, Save, RefreshCw, Upload, Sparkles } from 'lucide-react'
import { PairTabs, EXTRAS_TABS } from '../components/PairTabs'
import { money } from '../lib/money'

interface Extra {
  id: number
  name: string
  description: string | null
  price: number
  price_type: string
  currency: string
  image: string | null
  icon: string | null
  category: string | null
  sort_order: number
  is_active: boolean
}

const CATEGORIES = [
  { value: 'food', label: 'Food & Drink', icon: '🍽️' },
  { value: 'wellness', label: 'Wellness & Spa', icon: '🧖' },
  { value: 'transport', label: 'Transport', icon: '🚗' },
  { value: 'activity', label: 'Activity', icon: '🎯' },
  { value: 'service', label: 'Service', icon: '✨' },
  { value: 'equipment', label: 'Equipment', icon: '🔧' },
]

const PRICE_TYPES = [
  { value: 'per_stay', label: 'Per stay' },
  { value: 'per_night', label: 'Per night' },
  { value: 'per_person', label: 'Per person' },
  { value: 'per_person_night', label: 'Per person / night' },
]

const card = 'rounded-2xl border border-white/[0.06] p-5'
const cardBg = { background: 'linear-gradient(135deg, rgba(15,28,24,0.5), rgba(10,18,16,0.6))', backdropFilter: 'blur(20px)' }
const inputCls = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all'
const btnPrimaryStyle = { background: 'linear-gradient(135deg, var(--color-primary, #74c895), color-mix(in srgb, var(--color-primary, #74c895) 80%, #000))', color: '#fff' }

export default function BookingExtras() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Extra | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: extras = [], isLoading } = useQuery<Extra[]>({
    queryKey: ['booking-extras'],
    queryFn: () => api.get('/v1/admin/booking-extras').then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/booking-extras/${id}`),
    onSuccess: () => { toast.success('Extra deleted'); qc.invalidateQueries({ queryKey: ['booking-extras'] }) },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to delete'),
  })

  const saveMut = useMutation({
    mutationFn: async (fd: FormData) => {
      const id = fd.get('_id')
      if (id) { fd.append('_method', 'PUT'); return api.post(`/v1/admin/booking-extras/${id}`, fd) }
      return api.post('/v1/admin/booking-extras', fd)
    },
    onSuccess: () => { toast.success('Extra saved'); qc.invalidateQueries({ queryKey: ['booking-extras'] }); setShowForm(false); setEditing(null) },
    onError: () => toast.error('Failed to save'),
  })

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: extras.filter(e => e.category === cat.value),
  })).filter(g => g.items.length > 0)
  const uncategorized = extras.filter(e => !e.category || !CATEGORIES.find(c => c.value === e.category))

  return (
    <div className="space-y-6">
      <PairTabs tabs={EXTRAS_TABS} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Extra Services</h1>
          <p className="text-xs text-gray-500 mt-1">Add-on services guests can book with their stay. These appear in the booking widget extras step.</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
          <Plus size={14} /> Add Extra
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className={card + ' h-32 animate-pulse'} style={cardBg} />)}
        </div>
      ) : extras.length === 0 ? (
        <div className={card + ' text-center py-16'} style={cardBg}>
          <Sparkles size={40} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 font-medium">No extras yet</p>
          <p className="text-xs text-gray-600 mt-1">Add services like breakfast, sauna access, late checkout, etc.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Grouped by category */}
          {grouped.map(group => (
            <div key={group.value}>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{group.icon} {group.label}</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map(extra => <ExtraCard key={extra.id} extra={extra} onEdit={() => { setEditing(extra); setShowForm(true) }} onDelete={() => { if (confirm('Delete?')) deleteMut.mutate(extra.id) }} />)}
              </div>
            </div>
          ))}
          {uncategorized.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Other</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {uncategorized.map(extra => <ExtraCard key={extra.id} extra={extra} onEdit={() => { setEditing(extra); setShowForm(true) }} onDelete={() => { if (confirm('Delete?')) deleteMut.mutate(extra.id) }} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && <ExtraForm extra={editing} onClose={() => { setShowForm(false); setEditing(null) }} onSave={fd => saveMut.mutate(fd)} saving={saveMut.isPending} />}
    </div>
  )
}

function ExtraCard({ extra, onEdit, onDelete }: { extra: Extra; onEdit: () => void; onDelete: () => void }) {
  const card = 'rounded-2xl border border-white/[0.06] p-4 transition-all hover:border-white/[0.12]'
  const cardBg = { background: 'linear-gradient(135deg, rgba(15,28,24,0.5), rgba(10,18,16,0.6))' }

  return (
    <div className={card} style={cardBg}>
      <div className="flex gap-3">
        {extra.image ? (
          <img src={resolveImage(extra.image) || ''} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-2xl flex-shrink-0">
            {CATEGORIES.find(c => c.value === extra.category)?.icon || '✨'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <h4 className="text-sm font-bold text-white">{extra.name}</h4>
            {!extra.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold uppercase">Off</span>}
          </div>
          {extra.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{extra.description}</p>}
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-bold text-white">{money(extra.price)} <span className="text-xs font-normal text-gray-500">/ {PRICE_TYPES.find(p => p.value === extra.price_type)?.label || extra.price_type}</span></span>
            <div className="flex gap-1">
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-all"><Pencil size={12} /></button>
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all"><Trash2 size={12} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExtraForm({ extra, onClose, onSave, saving }: { extra: Extra | null; onClose: () => void; onSave: (fd: FormData) => void; saving: boolean }) {
  const [name, setName] = useState(extra?.name || '')
  const [description, setDescription] = useState(extra?.description || '')
  const [price, setPrice] = useState<string>(extra?.price != null ? String(extra.price) : '')
  const [priceType, setPriceType] = useState(extra?.price_type || 'per_stay')
  const [category, setCategory] = useState(extra?.category || '')
  const [icon] = useState(extra?.icon || '')
  const [isActive, setIsActive] = useState(extra?.is_active ?? true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(extra?.image ? (resolveImage(extra.image) || null) : null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    const fd = new FormData()
    if (extra?.id) fd.append('_id', String(extra.id))
    fd.append('name', name)
    fd.append('description', description)
    fd.append('price', String(Number(price) || 0))
    fd.append('price_type', priceType)
    fd.append('category', category)
    fd.append('icon', icon)
    fd.append('is_active', isActive ? '1' : '0')
    if (imageFile) fd.append('image', imageFile)
    onSave(fd)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh] overflow-y-auto pb-10">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] p-6" style={{ background: 'linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98))' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">{extra ? 'Edit Extra' : 'Add Extra Service'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          {/* Image */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex items-center justify-center cursor-pointer"
              onClick={() => fileRef.current?.click()}>
              {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <Upload size={20} className="text-gray-600" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)) }
            }} />
            <div className="text-xs text-gray-600">Optional image for the extra service</div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Breakfast Basket" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Fresh local products delivered to your door..." className={inputCls + ' resize-none'} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Price (€)</label>
              <input type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} min={0} step={0.5} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Price Type</label>
              <select value={priceType} onChange={e => setPriceType(e.target.value)} className={inputCls}>
                {PRICE_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat.value} onClick={() => setCategory(category === cat.value ? '' : cat.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                    category === cat.value
                      ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
                      : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                  }`}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-white font-medium">Active</span>
            <button onClick={() => setIsActive(!isActive)}
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
