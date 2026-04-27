import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

interface Props {
  initialDate: string
  initialApartmentId: string
  initialApartmentName: string
  onClose: () => void
  onCreated: () => void
}

/**
 * Lightweight create-booking modal opened by clicking an empty cell on
 * the rooms × days timeline. The booking is tagged booking_type='manual'
 * server-side so the move endpoint can distinguish it from PMS-mirrored
 * rows (which must be edited in the source PMS).
 *
 * Defaults: 1 night (arrival → arrival+1), 1 adult, no price. The user can
 * edit them all but most direct walk-ins fit this shape and keystrokes saved
 * here pay back every shift.
 */
export function QuickCreateBookingModal({ initialDate, initialApartmentId, initialApartmentName, onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const nextDay = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    dt.setDate(dt.getDate() + 1)
    return dt.toISOString().slice(0, 10)
  }

  const [form, setForm] = useState({
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    arrival_date: initialDate,
    departure_date: nextDay(initialDate),
    adults: 1,
    children: 0,
    price_total: '',
    notice: '',
    force: false,
  })
  const [conflict, setConflict] = useState<string | null>(null)

  // If the parent re-opens with a different cell, reset the dates.
  useEffect(() => {
    setForm(f => ({ ...f, arrival_date: initialDate, departure_date: nextDay(initialDate) }))
    setConflict(null)
  }, [initialDate, initialApartmentId])

  const create = useMutation({
    mutationFn: (payload: any) => api.post('/v1/admin/bookings/manual', payload),
    onSuccess: () => {
      toast.success('Booking created')
      qc.invalidateQueries({ queryKey: ['booking-calendar'] })
      qc.invalidateQueries({ queryKey: ['bookings-engine'] })
      qc.invalidateQueries({ queryKey: ['bookings-today'] })
      qc.invalidateQueries({ queryKey: ['bookings-dashboard'] })
      onCreated()
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || 'Failed to create booking'
      // Conflict response is the only one we want to inline-render so the
      // user can decide to override; everything else is a toast error.
      if (e?.response?.status === 409) setConflict(msg)
      else toast.error(msg)
    },
  })

  const submit = (force: boolean) => {
    if (!form.guest_name.trim()) { toast.error('Guest name is required'); return }
    create.mutate({
      ...form,
      apartment_id:   initialApartmentId,
      apartment_name: initialApartmentName,
      adults:   Number(form.adults) || 1,
      children: Number(form.children) || 0,
      price_total: form.price_total === '' ? null : Number(form.price_total),
      force,
    })
  }

  const inputCls = 'w-full bg-[#0f1c18] border border-white/[0.08] rounded-xl text-sm text-white placeholder-gray-600 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500/40'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-white/[0.08] overflow-hidden"
        style={{ background: 'linear-gradient(180deg, rgba(15,28,24,0.98), rgba(10,18,16,0.99))' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-white">New Direct Booking</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">{initialApartmentName} · {form.arrival_date} → {form.departure_date}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06]"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Guest Name</label>
            <input value={form.guest_name} autoFocus onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
              placeholder="John Doe" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Email</label>
              <input value={form.guest_email} onChange={e => setForm(f => ({ ...f, guest_email: e.target.value }))} type="email"
                placeholder="optional" className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Phone</label>
              <input value={form.guest_phone} onChange={e => setForm(f => ({ ...f, guest_phone: e.target.value }))}
                placeholder="optional" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Arrival</label>
              <input value={form.arrival_date} onChange={e => setForm(f => ({ ...f, arrival_date: e.target.value }))} type="date"
                className={inputCls} style={{ colorScheme: 'dark' }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Departure</label>
              <input value={form.departure_date} onChange={e => setForm(f => ({ ...f, departure_date: e.target.value }))} type="date"
                className={inputCls} style={{ colorScheme: 'dark' }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Adults</label>
              <input value={form.adults} onChange={e => setForm(f => ({ ...f, adults: Number(e.target.value) }))} type="number" min={1}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Children</label>
              <input value={form.children} onChange={e => setForm(f => ({ ...f, children: Number(e.target.value) }))} type="number" min={0}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Total (€)</label>
              <input value={form.price_total} onChange={e => setForm(f => ({ ...f, price_total: e.target.value }))} type="number" min={0} step="0.01"
                placeholder="—" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Notes</label>
            <textarea value={form.notice} onChange={e => setForm(f => ({ ...f, notice: e.target.value }))} rows={2}
              placeholder="Special requests, internal notes…" className={inputCls + ' resize-none'} />
          </div>

          {conflict && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-200">
              <p className="font-semibold mb-2">{conflict}</p>
              <button onClick={() => submit(true)} disabled={create.isPending}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-200 text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50">
                Create anyway
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06] bg-black/20">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white">Cancel</button>
          <button onClick={() => submit(false)} disabled={create.isPending}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #74c895, #5ab4b2)', boxShadow: '0 6px 14px rgba(116,200,149,0.2)' }}>
            {create.isPending ? 'Creating…' : 'Create Booking'}
          </button>
        </div>
      </div>
    </div>
  )
}
