import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { resolveImage } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, Pencil, Image as ImageIcon, Upload, RefreshCw,
  Users, BedDouble, Maximize, X, Save, Tag,
} from 'lucide-react'

/* ── Types ───────────────────────────────────────────────────────── */
interface Room {
  id: number
  pms_id: string | null
  name: string
  slug: string
  description: string | null
  short_description: string | null
  max_guests: number
  bedrooms: number
  bed_type: string | null
  base_price: number
  currency: string
  image: string | null
  gallery: string[]
  amenities: string[]
  tags: string[]
  size: string | null
  sort_order: number
  is_active: boolean
}

const AMENITY_OPTIONS = [
  { value: 'wifi', label: 'WiFi', icon: '📶' },
  { value: 'kitchen', label: 'Kitchen', icon: '🍳' },
  { value: 'sauna', label: 'Sauna', icon: '🧖' },
  { value: 'jacuzzi', label: 'Jacuzzi', icon: '🛁' },
  { value: 'bbq', label: 'BBQ / Grill', icon: '🔥' },
  { value: 'parking', label: 'Parking', icon: '🅿️' },
  { value: 'terrace', label: 'Terrace / Balcony', icon: '🌿' },
  { value: 'nature', label: 'Nature / Garden', icon: '🌲' },
  { value: 'fireplace', label: 'Fireplace', icon: '🔥' },
  { value: 'ac', label: 'Air Conditioning', icon: '❄️' },
  { value: 'tv', label: 'Smart TV', icon: '📺' },
  { value: 'washer', label: 'Washer', icon: '🧺' },
  { value: 'pool', label: 'Pool', icon: '🏊' },
  { value: 'gym', label: 'Gym', icon: '💪' },
  { value: 'pets', label: 'Pet Friendly', icon: '🐕' },
  { value: 'breakfast', label: 'Breakfast', icon: '🥐' },
]

const BED_TYPES = ['Single', 'Double', 'Twin', 'King', 'Queen', 'Suite', 'Bunk']

/* ── Styles ──────────────────────────────────────────────────────── */
const card = 'rounded-2xl border border-white/[0.06] p-5'
const cardBg = { background: 'linear-gradient(135deg, rgba(15,28,24,0.5), rgba(10,18,16,0.6))', backdropFilter: 'blur(20px)' }
const btnPrimary = 'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all'
const btnPrimaryStyle = { background: 'linear-gradient(135deg, var(--color-primary, #74c895), color-mix(in srgb, var(--color-primary, #74c895) 80%, #000))', color: '#fff' }

export default function BookingRooms() {
  const qc = useQueryClient()
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: rooms = [], isLoading } = useQuery<Room[]>({
    queryKey: ['booking-rooms'],
    queryFn: () => api.get('/v1/admin/booking-rooms').then(r => r.data),
  })

  const syncMut = useMutation({
    mutationFn: () => api.post('/v1/admin/booking-rooms/sync'),
    onSuccess: (r) => { toast.success(r.data.message); qc.invalidateQueries({ queryKey: ['booking-rooms'] }) },
    onError: () => toast.error('Sync failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/booking-rooms/${id}`),
    onSuccess: () => { toast.success('Room deleted'); qc.invalidateQueries({ queryKey: ['booking-rooms'] }) },
  })

  const saveMut = useMutation({
    mutationFn: async (fd: FormData) => {
      const id = fd.get('_id')
      if (id) {
        fd.append('_method', 'PUT')
        return api.post(`/v1/admin/booking-rooms/${id}`, fd)
      }
      return api.post('/v1/admin/booking-rooms', fd)
    },
    onSuccess: () => { toast.success('Room saved'); qc.invalidateQueries({ queryKey: ['booking-rooms'] }); setShowForm(false); setEditingRoom(null) },
    onError: () => toast.error('Failed to save room'),
  })

  const openEdit = (room: Room) => { setEditingRoom(room); setShowForm(true) }
  const openNew = () => { setEditingRoom(null); setShowForm(true) }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Rooms & Units</h1>
          <p className="text-xs text-gray-500 mt-1">Manage your property rooms. Sync from PMS, then customize images, amenities and tags.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
            className={btnPrimary + ' bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.08]'}>
            <RefreshCw size={14} className={syncMut.isPending ? 'animate-spin' : ''} /> Sync from PMS
          </button>
          <button onClick={openNew} className={btnPrimary} style={btnPrimaryStyle}>
            <Plus size={14} /> Add Room
          </button>
        </div>
      </div>

      {/* Room Cards Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className={card + ' h-64 animate-pulse'} style={cardBg} />)}
        </div>
      ) : rooms.length === 0 ? (
        <div className={card + ' text-center py-16'} style={cardBg}>
          <BedDouble size={40} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 font-medium">No rooms yet</p>
          <p className="text-xs text-gray-600 mt-1 mb-4">Sync from your PMS or add rooms manually</p>
          <button onClick={() => syncMut.mutate()} className={btnPrimary + ' mx-auto'} style={btnPrimaryStyle}>
            <RefreshCw size={14} /> Sync from PMS
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rooms.map(room => (
            <div key={room.id} className={card + ' group relative overflow-hidden transition-all hover:border-white/[0.12]'} style={cardBg}>
              {/* Image */}
              <div className="relative h-40 -mx-5 -mt-5 mb-4 bg-black/30 overflow-hidden rounded-t-2xl">
                {room.image ? (
                  <img src={resolveImage(room.image) || ''} alt={room.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon size={32} className="text-gray-700" />
                  </div>
                )}
                {!room.is_active && (
                  <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider border border-red-500/20">
                    Inactive
                  </div>
                )}
                {room.pms_id && (
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider border border-blue-500/20">
                    PMS #{room.pms_id}
                  </div>
                )}
              </div>

              {/* Info */}
              <h3 className="text-sm font-bold text-white mb-1">{room.name}</h3>
              {room.short_description && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{room.short_description}</p>}

              <div className="flex flex-wrap gap-2 text-[11px] text-gray-400 mb-3">
                <span className="flex items-center gap-1"><Users size={12} /> {room.max_guests} guests</span>
                <span className="flex items-center gap-1"><BedDouble size={12} /> {room.bedrooms} bed{room.bedrooms !== 1 ? 's' : ''}</span>
                {room.size && <span className="flex items-center gap-1"><Maximize size={12} /> {room.size}</span>}
              </div>

              {/* Amenities */}
              {room.amenities && room.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {room.amenities.slice(0, 5).map(a => {
                    const opt = AMENITY_OPTIONS.find(o => o.value === a)
                    return <span key={a} className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10px] text-gray-400">
                      {opt?.icon} {opt?.label || a}
                    </span>
                  })}
                  {room.amenities.length > 5 && <span className="px-2 py-0.5 text-[10px] text-gray-600">+{room.amenities.length - 5}</span>}
                </div>
              )}

              {/* Tags */}
              {room.tags && room.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {room.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(var(--color-primary-rgb, 116,200,149), 0.1)', color: 'var(--color-primary, #74c895)', border: '1px solid rgba(var(--color-primary-rgb, 116,200,149), 0.2)' }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Price + Actions */}
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/[0.04]">
                <div>
                  <span className="text-lg font-bold text-white">€{Number(room.base_price).toFixed(0)}</span>
                  <span className="text-xs text-gray-500 ml-1">/ night</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(room)} className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white transition-all">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => { if (confirm('Delete this room?')) deleteMut.mutate(room.id) }}
                    className="p-2 rounded-lg bg-white/[0.04] hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create Modal */}
      {showForm && <RoomForm
        room={editingRoom}
        onClose={() => { setShowForm(false); setEditingRoom(null) }}
        onSave={(fd) => saveMut.mutate(fd)}
        saving={saveMut.isPending}
      />}
    </div>
  )
}

/* ── Room Form Modal ──────────────────────────────────────────────── */
function RoomForm({ room, onClose, onSave, saving }: {
  room: Room | null
  onClose: () => void
  onSave: (fd: FormData) => void
  saving: boolean
}) {
  const [name, setName] = useState(room?.name || '')
  const [description, setDescription] = useState(room?.description || '')
  const [shortDesc, setShortDesc] = useState(room?.short_description || '')
  const [maxGuests, setMaxGuests] = useState(room?.max_guests || 2)
  const [bedrooms, setBedrooms] = useState(room?.bedrooms || 1)
  const [bedType, setBedType] = useState(room?.bed_type || '')
  const [basePrice, setBasePrice] = useState(room?.base_price || 0)
  const [size, setSize] = useState(room?.size || '')
  const [amenities, setAmenities] = useState<string[]>(room?.amenities || [])
  const [tags, setTags] = useState<string[]>(room?.tags || [])
  const [isActive, setIsActive] = useState(room?.is_active ?? true)
  const [newTag, setNewTag] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(room?.image ? (resolveImage(room.image) || null) : null)
  const fileRef = useRef<HTMLInputElement>(null)

  const toggleAmenity = (val: string) => {
    setAmenities(prev => prev.includes(val) ? prev.filter(a => a !== val) : [...prev, val])
  }

  const addTag = () => {
    const t = newTag.trim()
    if (t && !tags.includes(t)) { setTags([...tags, t]); setNewTag('') }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = () => {
    if (!name.trim()) { toast.error('Room name is required'); return }
    const fd = new FormData()
    if (room?.id) fd.append('_id', String(room.id))
    fd.append('name', name)
    fd.append('description', description)
    fd.append('short_description', shortDesc)
    fd.append('max_guests', String(maxGuests))
    fd.append('bedrooms', String(bedrooms))
    fd.append('bed_type', bedType)
    fd.append('base_price', String(basePrice))
    fd.append('size', size)
    fd.append('amenities', JSON.stringify(amenities))
    fd.append('tags', JSON.stringify(tags))
    fd.append('is_active', isActive ? '1' : '0')
    if (imageFile) fd.append('image', imageFile)
    onSave(fd)
  }

  const inputCls = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[5vh] overflow-y-auto pb-10">
      <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] p-6" style={{ background: 'linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98))' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">{room ? 'Edit Room' : 'Add Room'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-all"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          {/* Image Upload */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Hero Image</label>
            <div className="flex items-center gap-4">
              <div className="w-32 h-24 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex items-center justify-center cursor-pointer"
                onClick={() => fileRef.current?.click()}>
                {imagePreview ? (
                  <img src={imagePreview} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center"><Upload size={20} className="mx-auto text-gray-600 mb-1" /><span className="text-[10px] text-gray-600">Upload</span></div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              <div className="text-xs text-gray-600">Recommended: 800×500px, JPG/PNG. This image appears in the booking widget.</div>
            </div>
          </div>

          {/* Name + Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Room Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="ForRest DeLuxe House" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Base Price (€ / night)</label>
              <input type="number" value={basePrice} onChange={e => setBasePrice(Number(e.target.value))} className={inputCls} />
            </div>
          </div>

          {/* Short Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Short Description</label>
            <input value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder="A luxurious private house with forest views..." className={inputCls} />
          </div>

          {/* Full Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Full Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Detailed room description shown in the booking widget..." className={inputCls + ' resize-none'} />
          </div>

          {/* Specs */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Max Guests</label>
              <input type="number" value={maxGuests} onChange={e => setMaxGuests(Number(e.target.value))} min={1} max={50} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Bedrooms</label>
              <input type="number" value={bedrooms} onChange={e => setBedrooms(Number(e.target.value))} min={0} max={20} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Bed Type</label>
              <select value={bedType} onChange={e => setBedType(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {BED_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Size</label>
              <input value={size} onChange={e => setSize(e.target.value)} placeholder="80m²" className={inputCls} />
            </div>
          </div>

          {/* Amenities */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Amenities</label>
            <div className="flex flex-wrap gap-2">
              {AMENITY_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => toggleAmenity(opt.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                    amenities.includes(opt.value)
                      ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
                      : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                  }`}>
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Display Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-500/10 border border-primary-500/20 text-primary-400">
                  {t} <button onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-red-400"><X size={10} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="e.g. Forest view, Deluxe, Private" className={inputCls + ' flex-1'} />
              <button onClick={addTag} className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-gray-400 hover:text-white transition-all">
                <Tag size={14} />
              </button>
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm text-white font-medium">Active</span>
              <p className="text-[11px] text-gray-600">Inactive rooms won't appear in the booking widget</p>
            </div>
            <button onClick={() => setIsActive(!isActive)}
              className={`w-11 h-6 rounded-full transition-all ${isActive ? 'bg-primary-500' : 'bg-white/[0.08]'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all ${isActive ? 'translate-x-5.5' : 'translate-x-0.5'}`} style={{ transform: `translateX(${isActive ? '22px' : '2px'})` }} />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.04]">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/[0.04] border border-white/[0.06] text-gray-400 hover:text-white transition-all">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className={'flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all'}
            style={btnPrimaryStyle}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {room ? 'Save Changes' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  )
}
