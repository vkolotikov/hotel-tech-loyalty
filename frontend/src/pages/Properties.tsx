import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import { Building2, Plus, Pencil, X, Store, Upload, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Property {
  id: number
  name: string
  code: string
  address: string | null
  city: string | null
  country: string | null
  timezone: string | null
  currency: string | null
  phone: string | null
  email: string | null
  image_url: string | null
  is_active: boolean
  outlets_count: number
}

interface Outlet {
  id: number
  name: string
  type: string
  earn_rate_override: number | null
  is_active: boolean
}

const emptyPropertyForm = { name: '', code: '', address: '', city: '', country: '', timezone: '', currency: 'USD', phone: '', email: '' }
const OUTLET_TYPES = ['restaurant', 'bar', 'spa', 'gift_shop', 'room_service', 'minibar', 'parking', 'laundry', 'other']

export function Properties() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyPropertyForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [expandedProperty, setExpandedProperty] = useState<number | null>(null)
  const [outletForm, setOutletForm] = useState({ name: '', type: 'restaurant', earn_rate_override: '' })
  const [showOutletForm, setShowOutletForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => api.get('/v1/admin/properties').then(r => r.data),
  })

  const { data: outletsData } = useQuery({
    queryKey: ['admin-outlets', expandedProperty],
    queryFn: () => api.get(`/v1/admin/properties/${expandedProperty}/outlets`).then(r => r.data),
    enabled: !!expandedProperty,
  })

  const saveMutation = useMutation({
    mutationFn: ({ formData, isEdit, propertyId }: { formData: FormData | Record<string, any>; isEdit: boolean; propertyId: number | null }) => {
      if (formData instanceof FormData) {
        if (isEdit && propertyId) {
          formData.append('_method', 'PUT')
          return api.post(`/v1/admin/properties/${propertyId}`, formData)
        }
        return api.post('/v1/admin/properties', formData)
      }
      return isEdit && propertyId ? api.put(`/v1/admin/properties/${propertyId}`, formData) : api.post('/v1/admin/properties', formData)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-properties'] })
      setShowForm(false); setEditId(null); setForm(emptyPropertyForm)
      setImageFile(null); setImagePreview(null)
      toast.success(editId ? 'Property updated' : 'Property created')
    },
    onError: () => toast.error('Failed to save property'),
  })

  const outletMutation = useMutation({
    mutationFn: (data: any) => api.post(`/v1/admin/properties/${expandedProperty}/outlets`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-outlets', expandedProperty] })
      qc.invalidateQueries({ queryKey: ['admin-properties'] })
      setShowOutletForm(false)
      setOutletForm({ name: '', type: 'restaurant', earn_rate_override: '' })
      toast.success('Outlet created')
    },
    onError: () => toast.error('Failed to create outlet'),
  })

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const isEdit = !!editId
    if (imageFile) {
      const fd = new FormData()
      Object.entries(form).forEach(([key, value]) => {
        if (value !== undefined && value !== null) fd.append(key, value)
      })
      fd.append('image', imageFile)
      saveMutation.mutate({ formData: fd, isEdit, propertyId: editId })
    } else {
      saveMutation.mutate({ formData: form, isEdit, propertyId: editId })
    }
  }

  const startEdit = (p: Property) => {
    setEditId(p.id)
    setForm({ name: p.name, code: p.code, address: p.address || '', city: p.city || '', country: p.country || '', timezone: p.timezone || '', currency: p.currency || 'USD', phone: p.phone || '', email: p.email || '' })
    setImageFile(null)
    setImagePreview(resolveImage(p.image_url))
    setShowForm(true)
  }

  const resolveImageUrl = resolveImage

  const properties: Property[] = data?.properties || []
  const outlets: Outlet[] = outletsData?.outlets || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Properties</h1>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyPropertyForm); clearImage() }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm">
          <Plus size={16} /> Add Property
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{editId ? 'Edit' : 'New'} Property</h2>
            <button type="button" onClick={() => { setShowForm(false); clearImage() }} className="text-t-secondary hover:text-white"><X size={18} /></button>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-[#a0a0a0] mb-2">Property Image</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            {imagePreview ? (
              <div className="relative group">
                <img src={imagePreview} alt="Property" className="w-full h-40 object-cover rounded-xl border border-dark-border" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="bg-white/20 text-white px-3 py-1.5 rounded-lg text-sm backdrop-blur-sm hover:bg-white/30 transition-colors">
                    Change
                  </button>
                  <button type="button" onClick={clearImage}
                    className="bg-[#ff375f]/20 text-[#ff375f] px-3 py-1.5 rounded-lg text-sm backdrop-blur-sm hover:bg-[#ff375f]/30 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full bg-dark-bg border border-dashed border-dark-border2 rounded-xl px-4 py-8 text-sm text-[#636366] hover:border-primary-500 hover:text-primary-400 transition-colors flex flex-col items-center justify-center gap-2">
                <Upload size={24} />
                <span>Click to upload property image</span>
                <span className="text-xs">JPG, PNG up to 5MB</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Property Name" required
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Code (e.g. HQ01)" required disabled={!!editId}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50" />
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="City"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Country"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} placeholder="Currency" maxLength={3}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            <input value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} placeholder="Timezone (e.g. Asia/Dubai)"
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Full address"
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
          <button type="submit" disabled={saveMutation.isPending}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="text-center text-t-secondary py-12">Loading...</div>
      ) : (
        <div className="space-y-4">
          {properties.map(p => (
            <div key={p.id} className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-dark-surface2 transition-colors"
                onClick={() => setExpandedProperty(expandedProperty === p.id ? null : p.id)}>
                <div className="flex items-center gap-4">
                  {p.image_url ? (
                    <img
                      src={resolveImageUrl(p.image_url)!}
                      alt={p.name}
                      className="w-12 h-12 rounded-lg object-cover border border-dark-border flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-primary-500/15 flex items-center justify-center flex-shrink-0">
                      <Building2 size={20} className="text-primary-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-white font-medium">{p.name}</h3>
                    <p className="text-xs text-t-secondary">{p.code} · {p.city}{p.country ? `, ${p.country}` : ''} · {p.currency || 'USD'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-t-secondary">{p.outlets_count} outlets</span>
                  <button onClick={(e) => { e.stopPropagation(); startEdit(p) }} className="text-t-secondary hover:text-white p-1"><Pencil size={14} /></button>
                </div>
              </div>

              {expandedProperty === p.id && (
                <div className="border-t border-dark-border px-6 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-t-secondary">Outlets</h4>
                    <button onClick={() => setShowOutletForm(!showOutletForm)}
                      className="flex items-center gap-1 text-primary-400 hover:text-primary-300 text-xs">
                      <Plus size={14} /> Add Outlet
                    </button>
                  </div>

                  {showOutletForm && (
                    <div className="flex items-center gap-3 bg-dark-bg p-3 rounded-lg">
                      <input value={outletForm.name} onChange={e => setOutletForm({ ...outletForm, name: e.target.value })} placeholder="Outlet name" required
                        className="flex-1 bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-sm" />
                      <select value={outletForm.type} onChange={e => setOutletForm({ ...outletForm, type: e.target.value })}
                        className="bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-sm">
                        {OUTLET_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                      <input value={outletForm.earn_rate_override} onChange={e => setOutletForm({ ...outletForm, earn_rate_override: e.target.value })}
                        placeholder="Earn rate" type="number" step="0.01"
                        className="w-24 bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-sm" />
                      <button onClick={() => outletMutation.mutate({
                        ...outletForm,
                        earn_rate_override: outletForm.earn_rate_override ? Number(outletForm.earn_rate_override) : null,
                      })} className="bg-primary-600 text-white px-3 py-1.5 rounded text-sm hover:bg-primary-700">Add</button>
                    </div>
                  )}

                  {outlets.length > 0 ? outlets.map(o => (
                    <div key={o.id} className="flex items-center justify-between bg-dark-bg rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Store size={14} className="text-t-secondary" />
                        <span className="text-white text-sm">{o.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-dark-surface2 text-t-secondary">{o.type.replace('_', ' ')}</span>
                      </div>
                      {o.earn_rate_override && (
                        <span className="text-xs text-primary-400">{o.earn_rate_override}x earn rate</span>
                      )}
                    </div>
                  )) : (
                    <p className="text-sm text-t-secondary">No outlets yet</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {properties.length === 0 && (
            <div className="text-center text-t-secondary py-12 bg-dark-surface border border-dark-border rounded-xl">No properties configured</div>
          )}
        </div>
      )}
    </div>
  )
}
