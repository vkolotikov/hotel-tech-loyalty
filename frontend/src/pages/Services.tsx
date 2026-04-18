import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Plus, Pencil, Trash2, X, Save, RefreshCw, Upload, Sparkles,
  Clock, Tag, FolderTree, Search,
} from 'lucide-react'
import { PairTabs, CATALOG_TABS } from '../components/PairTabs'

interface ServiceCategory {
  id: number
  name: string
  description: string | null
  icon: string | null
  color: string | null
  image: string | null
  sort_order: number
  is_active: boolean
  services_count?: number
}

interface ServiceMasterLite {
  id: number
  name: string
  avatar?: string | null
}

interface Service {
  id: number
  category_id: number | null
  name: string
  description: string | null
  short_description: string | null
  duration_minutes: number
  buffer_after_minutes: number
  price: number
  currency: string
  image: string | null
  gallery: string[] | null
  tags: string[] | null
  sort_order: number
  is_active: boolean
  category?: { id: number; name: string; color?: string | null; icon?: string | null }
  masters?: ServiceMasterLite[]
}

const card = 'rounded-2xl border border-white/[0.06] p-5'
const cardBg = { background: 'linear-gradient(135deg, rgba(15,28,24,0.5), rgba(10,18,16,0.6))', backdropFilter: 'blur(20px)' }
const inputCls = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all'
const btnPrimaryStyle = { background: 'linear-gradient(135deg, var(--color-primary, #74c895), color-mix(in srgb, var(--color-primary, #74c895) 80%, #000))', color: '#fff' }
const tabBtn = (active: boolean) => `px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${active ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-white'}`

export default function Services() {
  const [tab, setTab] = useState<'services' | 'categories'>('services')

  return (
    <div className="space-y-6">
      <PairTabs tabs={CATALOG_TABS} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Services</h1>
          <p className="text-xs text-gray-500 mt-1">Spa, beauty, and bookable services. Define duration, price, and which masters perform each one.</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-white/[0.06]">
        <button onClick={() => setTab('services')} className={tabBtn(tab === 'services')}>
          <Sparkles size={12} className="inline mr-1.5" /> Services
        </button>
        <button onClick={() => setTab('categories')} className={tabBtn(tab === 'categories')}>
          <FolderTree size={12} className="inline mr-1.5" /> Categories
        </button>
      </div>

      {tab === 'services' ? <ServicesList /> : <CategoriesList />}
    </div>
  )
}

function ServicesList() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Service | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<number | ''>('')

  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.get('/v1/admin/services').then(r => r.data),
  })

  const { data: categories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ['service-categories'],
    queryFn: () => api.get('/v1/admin/service-categories').then(r => r.data),
  })

  const { data: masters = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['service-masters-list'],
    queryFn: () => api.get('/v1/admin/service-masters').then(r => r.data.map((m: any) => ({ id: m.id, name: m.name }))),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/services/${id}`),
    onSuccess: () => { toast.success('Service deleted'); qc.invalidateQueries({ queryKey: ['services'] }) },
  })

  const filtered = services.filter(s => {
    if (filterCat && s.category_id !== filterCat) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services…" className={inputCls + ' pl-9'} />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value ? Number(e.target.value) : '')} className={inputCls + ' max-w-xs'}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="ml-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
          <Plus size={14} /> Add Service
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className={card + ' h-44 animate-pulse'} style={cardBg} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className={card + ' text-center py-16'} style={cardBg}>
          <Sparkles size={40} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 font-medium">No services yet</p>
          <p className="text-xs text-gray-600 mt-1">Add your first bookable service.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(s => (
            <ServiceCard key={s.id} service={s}
              onEdit={() => { setEditing(s); setShowForm(true) }}
              onDelete={() => { if (confirm('Delete this service?')) deleteMut.mutate(s.id) }} />
          ))}
        </div>
      )}

      {showForm && (
        <ServiceForm
          service={editing}
          categories={categories}
          masters={masters}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['services'] })
            setShowForm(false); setEditing(null)
          }}
        />
      )}
    </>
  )
}

function ServiceCard({ service, onEdit, onDelete }: { service: Service; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className={card + ' transition-all hover:border-white/[0.12]'} style={cardBg}>
      <div className="flex gap-4">
        {service.image ? (
          <img src={resolveImage(service.image) || ''} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
            <Sparkles size={24} className="text-gray-600" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">{service.name}</h3>
              {service.category && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 inline-block"
                  style={{ background: (service.category.color || '#374151') + '33', color: service.category.color || '#9ca3af' }}>
                  {service.category.name}
                </span>
              )}
            </div>
            {!service.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold uppercase">Off</span>}
          </div>
          {service.short_description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{service.short_description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><Clock size={12} />{service.duration_minutes}min</span>
        <span className="font-bold text-white">{service.currency} {Number(service.price).toFixed(0)}</span>
        {service.masters && service.masters.length > 0 && (
          <span className="text-gray-500">· {service.masters.length} master{service.masters.length === 1 ? '' : 's'}</span>
        )}
      </div>

      <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-white/[0.04]">
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-all"><Pencil size={14} /></button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all"><Trash2 size={14} /></button>
      </div>
    </div>
  )
}

function ServiceForm({
  service, categories, masters, onClose, onSaved,
}: {
  service: Service | null
  categories: ServiceCategory[]
  masters: { id: number; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(service?.name || '')
  const [categoryId, setCategoryId] = useState<number | ''>(service?.category_id ?? '')
  const [description, setDescription] = useState(service?.description || '')
  const [shortDescription, setShortDescription] = useState(service?.short_description || '')
  const [duration, setDuration] = useState(service?.duration_minutes || 60)
  const [buffer, setBuffer] = useState(service?.buffer_after_minutes || 0)
  const [price, setPrice] = useState(Number(service?.price ?? 0))
  const [currency, setCurrency] = useState(service?.currency || 'EUR')
  const [tagsStr, setTagsStr] = useState((service?.tags || []).join(', '))
  const [isActive, setIsActive] = useState(service?.is_active ?? true)
  const [selectedMasters, setSelectedMasters] = useState<number[]>(service?.masters?.map(m => m.id) || [])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(service?.image ? (resolveImage(service.image) || null) : null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (duration < 5) { toast.error('Duration must be at least 5 minutes'); return }
    setSaving(true)
    const fd = new FormData()
    fd.append('name', name)
    if (categoryId) fd.append('category_id', String(categoryId))
    fd.append('description', description)
    fd.append('short_description', shortDescription)
    fd.append('duration_minutes', String(duration))
    fd.append('buffer_after_minutes', String(buffer))
    fd.append('price', String(price))
    fd.append('currency', currency)
    fd.append('is_active', isActive ? '1' : '0')
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)
    fd.append('tags', JSON.stringify(tags))
    fd.append('master_ids', JSON.stringify(selectedMasters))
    if (imageFile) fd.append('image', imageFile)

    try {
      if (service?.id) {
        fd.append('_method', 'PUT')
        await api.post(`/v1/admin/services/${service.id}`, fd)
      } else {
        await api.post('/v1/admin/services', fd)
      }
      toast.success('Service saved')
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[5vh] overflow-y-auto pb-10">
      <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] p-6" style={{ background: 'linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98))' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">{service ? 'Edit Service' : 'Add Service'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0"
              onClick={() => fileRef.current?.click()}>
              {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <Upload size={20} className="text-gray-600" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)) }
            }} />
            <div className="text-xs text-gray-600 flex-1">Optional cover image. Recommended 800×600.</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Deep Tissue Massage" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')} className={inputCls}>
                <option value="">Uncategorized</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
                <option>EUR</option><option>USD</option><option>GBP</option><option>CHF</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Short description</label>
            <input value={shortDescription} onChange={e => setShortDescription(e.target.value)} placeholder="One-line tagline shown on cards" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Full description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Detailed description shown on the service detail page" className={inputCls + ' resize-none'} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Duration (min) *</label>
              <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={5} step={5} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Buffer after (min)</label>
              <input type="number" value={buffer} onChange={e => setBuffer(Number(e.target.value))} min={0} step={5} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Price</label>
              <input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} min={0} step={1} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5"><Tag size={11} className="inline mr-1" /> Tags (comma separated)</label>
            <input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="Signature, Popular, New" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Masters that perform this service</label>
            {masters.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No masters yet — add masters first to assign them.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {masters.map(m => {
                  const active = selectedMasters.includes(m.id)
                  return (
                    <button key={m.id} type="button"
                      onClick={() => setSelectedMasters(active ? selectedMasters.filter(x => x !== m.id) : [...selectedMasters, m.id])}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                        active
                          ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
                          : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                      }`}>
                      {m.name}
                    </button>
                  )
                })}
              </div>
            )}
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
            {service ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CategoriesList() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<ServiceCategory | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: categories = [], isLoading } = useQuery<ServiceCategory[]>({
    queryKey: ['service-categories'],
    queryFn: () => api.get('/v1/admin/service-categories').then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/service-categories/${id}`),
    onSuccess: () => { toast.success('Category deleted'); qc.invalidateQueries({ queryKey: ['service-categories'] }) },
  })

  return (
    <>
      <div className="flex items-center justify-end">
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
          <Plus size={14} /> Add Category
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className={card + ' h-24 animate-pulse'} style={cardBg} />)}
        </div>
      ) : categories.length === 0 ? (
        <div className={card + ' text-center py-16'} style={cardBg}>
          <FolderTree size={40} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 font-medium">No categories yet</p>
          <p className="text-xs text-gray-600 mt-1">Categories help guests browse your service menu.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categories.map(c => (
            <div key={c.id} className={card + ' transition-all hover:border-white/[0.12]'} style={cardBg}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: (c.color || '#374151') + '20' }}>
                    <FolderTree size={16} style={{ color: c.color || '#9ca3af' }} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{c.name}</h4>
                    <p className="text-xs text-gray-500">{c.services_count ?? 0} services</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(c); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-all"><Pencil size={12} /></button>
                  <button onClick={() => { if (confirm('Delete this category? Services will be moved to "Uncategorized".')) deleteMut.mutate(c.id) }} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all"><Trash2 size={12} /></button>
                </div>
              </div>
              {c.description && <p className="text-xs text-gray-500 mt-3 line-clamp-2">{c.description}</p>}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CategoryForm
          category={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['service-categories'] }); setShowForm(false); setEditing(null) }}
        />
      )}
    </>
  )
}

function CategoryForm({ category, onClose, onSaved }: { category: ServiceCategory | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name || '')
  const [description, setDescription] = useState(category?.description || '')
  const [color, setColor] = useState(category?.color || '#74c895')
  const [icon, setIcon] = useState(category?.icon || '')
  const [isActive, setIsActive] = useState(category?.is_active ?? true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(category?.image ? (resolveImage(category.image) || null) : null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const fd = new FormData()
    fd.append('name', name)
    fd.append('description', description)
    fd.append('color', color)
    fd.append('icon', icon)
    fd.append('is_active', isActive ? '1' : '0')
    if (imageFile) fd.append('image', imageFile)

    try {
      if (category?.id) {
        fd.append('_method', 'PUT')
        await api.post(`/v1/admin/service-categories/${category.id}`, fd)
      } else {
        await api.post('/v1/admin/service-categories', fd)
      }
      toast.success('Category saved')
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh] overflow-y-auto pb-10">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] p-6" style={{ background: 'linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98))' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">{category ? 'Edit Category' : 'Add Category'}</h2>
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
            <div className="text-xs text-gray-600">Optional category image</div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Spa & Massage" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Color</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-full rounded-xl border border-white/[0.08] bg-transparent cursor-pointer" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Icon (lucide name)</label>
              <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="sparkles" className={inputCls} />
            </div>
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
            {category ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
