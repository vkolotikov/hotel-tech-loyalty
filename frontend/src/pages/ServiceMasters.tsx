import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Plus, Pencil, Trash2, X, Save, RefreshCw, Upload, UserCircle2,
  Calendar as CalendarIcon, Clock,
} from 'lucide-react'

interface Schedule {
  id?: number
  day_of_week: number
  start_time: string
  end_time: string
  is_active?: boolean
}

interface TimeOff {
  id: number
  date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
}

interface Master {
  id: number
  name: string
  title: string | null
  bio: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  specialties: string[] | null
  is_active: boolean
  services?: { id: number; name: string }[]
  schedules?: Schedule[]
  time_off?: TimeOff[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const card = 'rounded-2xl border border-white/[0.06] p-5'
const cardBg = { background: 'linear-gradient(135deg, rgba(15,28,24,0.5), rgba(10,18,16,0.6))', backdropFilter: 'blur(20px)' }
const inputCls = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all'
const btnPrimaryStyle = { background: 'linear-gradient(135deg, var(--color-primary, #74c895), color-mix(in srgb, var(--color-primary, #74c895) 80%, #000))', color: '#fff' }

export default function ServiceMasters() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Master | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showSchedule, setShowSchedule] = useState<Master | null>(null)

  const { data: masters = [], isLoading } = useQuery<Master[]>({
    queryKey: ['service-masters'],
    queryFn: () => api.get('/v1/admin/service-masters').then(r => r.data),
  })

  const { data: services = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['services-list'],
    queryFn: () => api.get('/v1/admin/services').then(r => r.data.map((s: any) => ({ id: s.id, name: s.name }))),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/service-masters/${id}`),
    onSuccess: () => { toast.success('Master deleted'); qc.invalidateQueries({ queryKey: ['service-masters'] }) },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Service Masters</h1>
          <p className="text-xs text-gray-500 mt-1">Therapists, stylists, and providers. Set their working hours and which services they perform.</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
          <Plus size={14} /> Add Master
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className={card + ' h-44 animate-pulse'} style={cardBg} />)}
        </div>
      ) : masters.length === 0 ? (
        <div className={card + ' text-center py-16'} style={cardBg}>
          <UserCircle2 size={40} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 font-medium">No masters yet</p>
          <p className="text-xs text-gray-600 mt-1">Add the people who perform your services.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {masters.map(m => (
            <MasterCard key={m.id} master={m}
              onEdit={() => { setEditing(m); setShowForm(true) }}
              onSchedule={() => setShowSchedule(m)}
              onDelete={() => { if (confirm('Delete this master?')) deleteMut.mutate(m.id) }} />
          ))}
        </div>
      )}

      {showForm && (
        <MasterForm
          master={editing}
          services={services}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['service-masters'] }); setShowForm(false); setEditing(null) }}
        />
      )}

      {showSchedule && (
        <ScheduleEditor master={showSchedule} onClose={() => setShowSchedule(null)} />
      )}
    </div>
  )
}

function MasterCard({ master, onEdit, onDelete, onSchedule }: {
  master: Master; onEdit: () => void; onDelete: () => void; onSchedule: () => void
}) {
  const scheduleDays = master.schedules?.map(s => s.day_of_week) || []
  return (
    <div className={card + ' transition-all hover:border-white/[0.12]'} style={cardBg}>
      <div className="flex gap-4">
        {master.avatar ? (
          <img src={resolveImage(master.avatar) || ''} className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
            <UserCircle2 size={28} className="text-gray-600" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">{master.name}</h3>
              {master.title && <p className="text-xs text-gray-500 truncate">{master.title}</p>}
            </div>
            {!master.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold uppercase">Off</span>}
          </div>
          {master.services && master.services.length > 0 && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-1">
              {master.services.map(s => s.name).join(', ')}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 mt-4">
        {DAYS.map((d, i) => (
          <span key={d} className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
            scheduleDays.includes(i) ? 'bg-primary-500/15 text-primary-400' : 'bg-white/[0.03] text-gray-600'
          }`}>{d}</span>
        ))}
      </div>

      <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-white/[0.04]">
        <button onClick={onSchedule} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-all" title="Schedule"><CalendarIcon size={14} /></button>
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-all"><Pencil size={14} /></button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all"><Trash2 size={14} /></button>
      </div>
    </div>
  )
}

function MasterForm({
  master, services, onClose, onSaved,
}: {
  master: Master | null
  services: { id: number; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(master?.name || '')
  const [title, setTitle] = useState(master?.title || '')
  const [bio, setBio] = useState(master?.bio || '')
  const [email, setEmail] = useState(master?.email || '')
  const [phone, setPhone] = useState(master?.phone || '')
  const [specialties, setSpecialties] = useState((master?.specialties || []).join(', '))
  const [isActive, setIsActive] = useState(master?.is_active ?? true)
  const [serviceIds, setServiceIds] = useState<number[]>(master?.services?.map(s => s.id) || [])
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(master?.avatar ? (resolveImage(master.avatar) || null) : null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const fd = new FormData()
    fd.append('name', name)
    fd.append('title', title)
    fd.append('bio', bio)
    fd.append('email', email)
    fd.append('phone', phone)
    fd.append('is_active', isActive ? '1' : '0')
    const sp = specialties.split(',').map(s => s.trim()).filter(Boolean)
    fd.append('specialties', JSON.stringify(sp))
    fd.append('service_ids', JSON.stringify(serviceIds))
    if (avatarFile) fd.append('avatar', avatarFile)

    try {
      if (master?.id) {
        fd.append('_method', 'PUT')
        await api.post(`/v1/admin/service-masters/${master.id}`, fd)
      } else {
        await api.post('/v1/admin/service-masters', fd)
      }
      toast.success('Master saved')
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[5vh] overflow-y-auto pb-10">
      <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] p-6" style={{ background: 'linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98))' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">{master ? 'Edit Master' : 'Add Master'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full border border-white/[0.08] bg-white/[0.02] overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0"
              onClick={() => fileRef.current?.click()}>
              {avatarPreview ? <img src={avatarPreview} className="w-full h-full object-cover" /> : <Upload size={20} className="text-gray-600" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setAvatarFile(f); setAvatarPreview(URL.createObjectURL(f)) }
            }} />
            <div className="text-xs text-gray-600 flex-1">Avatar shown on the booking widget</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Anna Müller" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Senior Therapist" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Short biography shown on the public widget" className={inputCls + ' resize-none'} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Specialties (comma separated)</label>
            <input value={specialties} onChange={e => setSpecialties(e.target.value)} placeholder="Deep tissue, Aromatherapy, Hot stone" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Services performed</label>
            {services.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No services yet — create services first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {services.map(s => {
                  const active = serviceIds.includes(s.id)
                  return (
                    <button key={s.id} type="button"
                      onClick={() => setServiceIds(active ? serviceIds.filter(x => x !== s.id) : [...serviceIds, s.id])}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                        active
                          ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
                          : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                      }`}>
                      {s.name}
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
            {master ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleEditor({ master, onClose }: { master: Master; onClose: () => void }) {
  const qc = useQueryClient()

  const { data: detail } = useQuery<Master>({
    queryKey: ['service-master', master.id],
    queryFn: () => api.get(`/v1/admin/service-masters/${master.id}`).then(r => r.data),
  })

  const [schedules, setSchedules] = useState<Schedule[]>(master.schedules || [])
  const [savingSched, setSavingSched] = useState(false)

  // Sync from detail when it loads
  if (detail && detail.schedules && schedules.length === 0 && (master.schedules || []).length === 0) {
    setSchedules(detail.schedules)
  }

  const toggleDay = (dow: number) => {
    const exists = schedules.find(s => s.day_of_week === dow)
    if (exists) {
      setSchedules(schedules.filter(s => s.day_of_week !== dow))
    } else {
      setSchedules([...schedules, { day_of_week: dow, start_time: '09:00', end_time: '17:00' }].sort((a, b) => a.day_of_week - b.day_of_week))
    }
  }

  const updateSchedule = (dow: number, field: 'start_time' | 'end_time', value: string) => {
    setSchedules(schedules.map(s => s.day_of_week === dow ? { ...s, [field]: value } : s))
  }

  const saveSchedules = async () => {
    setSavingSched(true)
    const fd = new FormData()
    fd.append('_method', 'PUT')
    fd.append('schedules', JSON.stringify(schedules.map(s => ({
      day_of_week: s.day_of_week,
      start_time: s.start_time.length === 5 ? s.start_time + ':00' : s.start_time,
      end_time: s.end_time.length === 5 ? s.end_time + ':00' : s.end_time,
    }))))
    try {
      await api.post(`/v1/admin/service-masters/${master.id}`, fd)
      toast.success('Schedule saved')
      qc.invalidateQueries({ queryKey: ['service-masters'] })
      qc.invalidateQueries({ queryKey: ['service-master', master.id] })
    } catch {
      toast.error('Failed to save schedule')
    } finally {
      setSavingSched(false)
    }
  }

  // Time-off
  const [offDate, setOffDate] = useState('')
  const [offReason, setOffReason] = useState('')

  const addTimeOffMut = useMutation({
    mutationFn: () => api.post(`/v1/admin/service-masters/${master.id}/time-off`, {
      date: offDate, reason: offReason || null,
    }),
    onSuccess: () => {
      toast.success('Time-off added')
      setOffDate(''); setOffReason('')
      qc.invalidateQueries({ queryKey: ['service-master', master.id] })
    },
  })

  const removeTimeOffMut = useMutation({
    mutationFn: (entryId: number) => api.delete(`/v1/admin/service-masters/${master.id}/time-off/${entryId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-master', master.id] })
    },
  })

  const timeOff = detail?.time_off || []

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[5vh] overflow-y-auto pb-10">
      <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] p-6" style={{ background: 'linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98))' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">{master.name} — Schedule & Time-off</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500"><X size={18} /></button>
        </div>

        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Weekly Hours</h3>
        <div className="space-y-2">
          {DAYS.map((day, dow) => {
            const sch = schedules.find(s => s.day_of_week === dow)
            return (
              <div key={dow} className="flex items-center gap-3">
                <button onClick={() => toggleDay(dow)}
                  className={`w-16 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    sch ? 'bg-primary-500/15 text-primary-400 border border-primary-500/30' : 'bg-white/[0.03] text-gray-500 border border-white/[0.06]'
                  }`}>
                  {day}
                </button>
                {sch ? (
                  <>
                    <input type="time" value={sch.start_time.substring(0, 5)} onChange={e => updateSchedule(dow, 'start_time', e.target.value)} className={inputCls + ' max-w-[120px]'} />
                    <span className="text-gray-500">–</span>
                    <input type="time" value={sch.end_time.substring(0, 5)} onChange={e => updateSchedule(dow, 'end_time', e.target.value)} className={inputCls + ' max-w-[120px]'} />
                  </>
                ) : (
                  <span className="text-xs text-gray-600 italic">Off</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={saveSchedules} disabled={savingSched}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
            {savingSched ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Save Hours
          </button>
        </div>

        <hr className="my-6 border-white/[0.06]" />

        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Time Off</h3>
        <div className="flex items-end gap-2 mb-4">
          <div className="flex-1">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Date</label>
            <input type="date" value={offDate} onChange={e => setOffDate(e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Reason</label>
            <input value={offReason} onChange={e => setOffReason(e.target.value)} placeholder="Vacation, sick…" className={inputCls} />
          </div>
          <button onClick={() => offDate && addTimeOffMut.mutate()} disabled={!offDate || addTimeOffMut.isPending}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
            <Plus size={12} /> Add
          </button>
        </div>

        {timeOff.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No time-off scheduled.</p>
        ) : (
          <div className="space-y-1">
            {timeOff.map(off => (
              <div key={off.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <Clock size={14} className="text-gray-500" />
                <span className="text-sm text-white font-medium">{off.date}</span>
                <span className="text-xs text-gray-500 flex-1">{off.reason || 'Time off'}</span>
                <button onClick={() => removeTimeOffMut.mutate(off.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
