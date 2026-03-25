import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2, Star, Sparkles, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'
import { DatePicker, normalizeDate } from '../components/ui/DatePicker'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export function Offers() {
  const [showForm, setShowForm] = useState(false)
  const [editOffer, setEditOffer] = useState<any>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-offers'],
    queryFn: () => api.get('/v1/admin/offers').then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/offers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-offers'] }); toast.success('Offer deleted') },
  })

  const typeColors: Record<string, string> = {
    discount: 'bg-blue-500/15 text-blue-400',
    points_multiplier: 'bg-amber-500/15 text-amber-400',
    free_night: 'bg-[#32d74b]/15 text-[#32d74b]',
    upgrade: 'bg-purple-500/15 text-purple-400',
    bonus_points: 'bg-pink-500/15 text-pink-400',
    cashback: 'bg-teal-500/15 text-teal-400',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Special Offers</h1>
        <button
          onClick={() => { setEditOffer(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} /> Create Offer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array(6).fill(0).map((_, i) => <div key={i} className="bg-dark-surface rounded-xl border border-dark-border p-6 animate-pulse"><div className="h-4 bg-dark-surface2 rounded w-3/4 mb-3" /><div className="h-3 bg-dark-surface2 rounded w-1/2" /></div>)
          : (data?.data ?? []).map((offer: any) => (
            <Card key={offer.id} className="relative overflow-hidden">
              {offer.image_url && (
                <div className="-mx-6 -mt-6 mb-4">
                  <img
                    src={offer.image_url.startsWith('http') ? offer.image_url : `${(import.meta.env.VITE_API_URL || 'http://localhost/hotel-loyalty/backend/public').replace('/api', '')}${offer.image_url}`}
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
                  <Sparkles size={12} /> AI Generated
                </div>
              )}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mb-1 ${typeColors[offer.type] ?? 'bg-dark-surface3 text-[#a0a0a0]'}`}>
                    {offer.type.replace(/_/g, ' ')}
                  </span>
                  <h4 className="font-semibold text-white">{offer.title}</h4>
                </div>
              </div>
              <p className="text-sm text-[#8e8e93] mb-3 line-clamp-2">{offer.description}</p>
              <div className="text-sm text-[#636366] mb-4">
                {format(new Date(offer.start_date), 'MMM d')} — {format(new Date(offer.end_date), 'MMM d, yyyy')}
                {offer.usage_limit && <span className="ml-2">· {offer.times_used}/{offer.usage_limit} used</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${offer.is_active ? 'bg-[#32d74b]/15 text-[#32d74b]' : 'bg-dark-surface3 text-[#636366]'}`}>
                  {offer.is_active ? 'Active' : 'Inactive'}
                </span>
                <div className="flex-1" />
                <button onClick={() => { setEditOffer(offer); setShowForm(true) }} className="p-1.5 text-[#636366] hover:text-primary-400 hover:bg-primary-500/10 rounded">
                  <Edit size={14} />
                </button>
                <button onClick={() => deleteMutation.mutate(offer.id)} className="p-1.5 text-[#636366] hover:text-[#ff375f] hover:bg-[#ff375f]/10 rounded">
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
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(offer?.image_url ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    title: offer?.title ?? '',
    description: offer?.description ?? '',
    type: offer?.type ?? 'discount',
    value: offer?.value ?? '',
    start_date: normalizeDate(offer?.start_date ?? '') || new Date().toISOString().slice(0, 10),
    end_date: normalizeDate(offer?.end_date ?? ''),
    usage_limit: offer?.usage_limit ?? '',
    is_featured: offer?.is_featured ?? false,
    is_active: offer?.is_active ?? true,
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

  const save = async () => {
    try {
      const formData = new FormData()
      formData.append('title', form.title)
      formData.append('description', form.description)
      formData.append('type', form.type)
      formData.append('value', String(form.value))
      formData.append('start_date', form.start_date)
      formData.append('end_date', form.end_date)
      if (form.usage_limit) formData.append('usage_limit', String(form.usage_limit))
      formData.append('is_featured', form.is_featured ? '1' : '0')
      formData.append('is_active', form.is_active ? '1' : '0')
      if (imageFile) formData.append('image', imageFile)

      if (offer) {
        formData.append('_method', 'PUT')
        await api.post(`/v1/admin/offers/${offer.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        toast.success('Offer updated')
      } else {
        await api.post('/v1/admin/offers', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        toast.success('Offer created')
      }
      qc.invalidateQueries({ queryKey: ['admin-offers'] })
      onClose()
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Save failed')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-dark-border flex items-center justify-between">
          <h3 className="font-bold text-white">{offer ? 'Edit Offer' : 'Create Offer'}</h3>
          <button onClick={onClose} className="text-[#636366] hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {(['title', 'description'] as const).map((f) => (
            <div key={f}>
              <label className="block text-sm font-medium text-[#a0a0a0] mb-1 capitalize">{f}</label>
              {f === 'description'
                ? <textarea value={(form as any)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" rows={3} />
                : <input type="text" value={(form as any)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
              }
            </div>
          ))}

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-[#a0a0a0] mb-1">Image</label>
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
                  className="absolute top-2 right-2 bg-dark-surface/80 text-[#ff375f] rounded-full p-1 hover:bg-dark-surface"
                >✕</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-[#1e1e1e] border border-dashed border-dark-border2 rounded-lg px-3 py-4 text-sm text-[#636366] hover:border-primary-500 hover:text-primary-400 transition-colors flex items-center justify-center gap-2"
              >
                <Upload size={16} /> Upload Image
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#a0a0a0] mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white">
                {['discount','points_multiplier','free_night','upgrade','bonus_points','cashback'].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#a0a0a0] mb-1">Value</label>
              <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#a0a0a0] mb-1">Start Date</label>
              <DatePicker value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} placeholder="Pick start date" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#a0a0a0] mb-1">End Date</label>
              <DatePicker value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} placeholder="Pick end date" />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-[#a0a0a0]"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} /> Featured</label>
            <label className="flex items-center gap-2 text-sm text-[#a0a0a0]"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
          </div>
        </div>
        <div className="p-6 border-t border-dark-border flex gap-3">
          <button onClick={onClose} className="flex-1 border border-dark-border text-[#a0a0a0] py-2.5 rounded-lg text-sm font-medium hover:bg-dark-surface2">Cancel</button>
          <button onClick={save} className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700">Save</button>
        </div>
      </div>
    </div>
  )
}
