import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Copy, X, Tag, CalendarDays, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { money } from '../lib/money'
import { duplicatePromotion, newPromotion, promotionBody, type BookingPromotion } from './bookingPromotions'

interface Catalogue { enabled: boolean; timezone: string; currency: string; rooms: { id: number; name: string }[]; promotions: BookingPromotion[] }
const input = 'min-w-0 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-hidden focus:ring-2 focus:ring-primary-500'
const card = 'rounded-2xl border border-white/10 bg-white/3 p-5'
const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm hover:bg-white/10 disabled:opacity-50'
const errorText = (e: unknown) => {
  const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data
  return Object.values(data?.errors ?? {}).flat().join(' ') || data?.message || 'Could not save. Please try again.'
}

export default function BookingPromotions() {
  const cache = useQueryClient()
  const [editing, setEditing] = useState<BookingPromotion | null>(null)
  const query = useQuery<Catalogue>({ queryKey: ['booking-promotions'], queryFn: () => api.get('/v1/admin/booking-promotions').then(r => r.data) })
  const save = useMutation({
    mutationFn: (p: BookingPromotion) => p.id ? api.put(`/v1/admin/booking-promotions/${p.id}`, promotionBody(p)) : api.post('/v1/admin/booking-promotions', promotionBody(p)),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ['booking-promotions'] }); setEditing(null); toast.success('Promotion saved') },
    onError: (e: unknown) => toast.error(errorText(e)),
  })
  const settings = useMutation({ mutationFn: (enabled: boolean) => api.put('/v1/admin/booking-promotions/settings', { enabled }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ['booking-promotions'] }) }, onError: (e: unknown) => toast.error(errorText(e)) })
  const data = query.data

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-xl font-bold text-white flex items-center gap-2"><Tag size={22} /> Stay promotions</h1><p className="text-sm text-gray-400 mt-1">Accommodation discounts. Additional services stay at full price.</p></div>
      <button className={button} disabled={!data} onClick={() => setEditing(newPromotion())}><Plus size={16} /> New promotion</button>
    </div>
    {query.isError && <div role="alert" className={card}>Could not load promotions. <button className={button} onClick={() => { void query.refetch() }}>Try again</button></div>}
    {query.isPending && <p role="status">Loading promotions…</p>}
    {data && <>
      <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div><strong>Promo codes at checkout</strong><p className="text-sm text-gray-400">New quotes follow this switch. Accepted quotes keep their price until expiry.</p></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={data.enabled} disabled={settings.isPending} onChange={e => settings.mutate(e.target.checked)} /> Enabled</label>
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-2"><CalendarDays size={14} /> Campaign booking times use {data.timezone}. Stay dates are independent.</p>
      {data.promotions.length === 0 && <div className={`${card} space-y-4`}><p>No promotions yet. Start with a draft and choose the campaign dates.</p><div className="flex flex-wrap gap-2">
        <button className={button} onClick={() => setEditing({ ...newPromotion('', 'second_night_free'), name: 'Second night free' })}>Second night free</button>
        <button className={button} onClick={() => setEditing({ ...newPromotion(), name: 'Percentage discount' })}>Percentage discount</button>
        <button className={button} onClick={() => setEditing({ ...newPromotion('', 'fixed_amount', 25), name: 'Fixed stay discount' })}>Fixed stay discount</button>
      </div></div>}
      <div className="grid gap-4 lg:grid-cols-2">{data.promotions.map(p => <article className={card} key={p.id}>
        <div className="flex items-start justify-between gap-3"><div><strong className="text-white">{p.name}</strong><p className="font-mono text-sm mt-1">{p.code}</p></div><span className="rounded-full bg-white/8 px-3 py-1 text-xs capitalize">{p.state}</span></div>
        <p className="mt-4 text-sm">{p.type === 'second_night_free' ? 'Second night free' : p.type === 'percentage' ? `${p.value}% off accommodation` : `${money(p.value, data.currency)} off accommodation`} · minimum {p.min_nights} night{p.min_nights === 1 ? '' : 's'}</p>
        <p className="text-xs text-gray-400 mt-2">{p.booking_from?.replace('T', ' ') || 'Start not set'} → {p.booking_until?.replace('T', ' ') || 'End not set'}</p>
        <div className="grid grid-cols-3 gap-2 my-4 text-xs text-gray-400"><span>{Number(p.stats?.bookings ?? 0)} bookings</span><span>{money(Number(p.stats?.discounts ?? 0), p.currency || data.currency)} discounts</span><span>{money(Number(p.stats?.accommodation_revenue ?? 0), p.currency || data.currency)} stay revenue</span></div>
        <div className="flex gap-2"><button className={button} onClick={() => setEditing({ ...p, room_ids: p.room_ids || [], excluded_dates: p.excluded_dates || [] })}><Pencil size={14} /> Edit</button><button className={button} onClick={() => setEditing(duplicatePromotion(p))}><Copy size={14} /> Duplicate</button></div>
      </article>)}</div>
    </>}
    {editing && data && <PromotionEditor key={`${editing.id ?? 'new'}-${editing.code}`} initial={editing} catalogue={data} pending={save.isPending} onClose={() => setEditing(null)} onSave={p => save.mutate(p)} />}
  </div>
}

function PromotionEditor({ initial, catalogue, pending, onClose, onSave }: { initial: BookingPromotion; catalogue: Catalogue; pending: boolean; onClose: () => void; onSave: (p: BookingPromotion) => void }) {
  const [form, setForm] = useState(initial)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => { document.body.style.overflow = overflow; before?.focus() }
  }, [])
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !pending) onClose()
    if (event.key !== 'Tab') return
    const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')
    if (!nodes?.length) return
    const first = nodes[0], last = nodes[nodes.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  const patch = (p: Partial<BookingPromotion>) => setForm(f => ({ ...f, ...p }))
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(form) }
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => { if (!pending) onClose() }}>
    <section ref={panel} onKeyDown={keyboard} role="dialog" aria-modal="true" aria-labelledby="promotion-title" className="min-w-0 w-full max-w-2xl overflow-y-auto bg-gray-950 p-5 sm:p-7 shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-6"><h2 id="promotion-title" className="text-lg font-bold">{initial.id ? 'Edit promotion' : 'New promotion'}</h2><button type="button" className={button} aria-label="Close promotion" disabled={pending} onClick={onClose}><X size={18} /></button></div>
      <form onSubmit={submit}><fieldset disabled={pending} className="min-w-0 space-y-5">
        <label className="block text-sm">Campaign name<input required maxLength={120} className={`${input} mt-1`} value={form.name} onChange={e => patch({ name: e.target.value })} /></label>
        <label className="block text-sm">Promo code<input required minLength={2} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]+" className={`${input} mt-1 font-mono`} value={form.code} onChange={e => patch({ code: e.target.value.toUpperCase() })} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">Discount<select className={`${input} mt-1`} value={form.type} onChange={e => patch({ type: e.target.value as BookingPromotion['type'], min_nights: e.target.value === 'second_night_free' ? Math.max(2, form.min_nights) : form.min_nights })}><option value="percentage">Percentage</option><option value="fixed_amount">Fixed amount ({catalogue.currency})</option><option value="second_night_free">Second night free</option></select></label>
          {form.type !== 'second_night_free' && <label className="block text-sm">{form.type === 'percentage' ? 'Percentage' : `Amount (${catalogue.currency})`}<input required type="number" min="0.01" step="0.01" max={form.type === 'percentage' ? 100 : 9999999} className={`${input} mt-1`} value={form.value} onChange={e => patch({ value: Number(e.target.value) })} /></label>}
        </div>
        <p className="rounded-xl bg-white/5 p-3 text-sm">Applies to accommodation only. One discount per stay; the best eligible discount wins. {form.type === 'second_night_free' && 'The actual second night is free once per eligible room, including longer stays.'}</p>
        <label className="block text-sm">Minimum nights<input required type="number" min={form.type === 'second_night_free' ? 2 : 1} max={365} className={`${input} mt-1`} value={form.min_nights} onChange={e => patch({ min_nights: Number(e.target.value) })} /></label>
        <div><h3 className="font-semibold mb-3">When guests can book · {catalogue.timezone}</h3><div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">Booking opens<input type="datetime-local" required={form.status === 'published'} className={`${input} mt-1`} value={form.booking_from || ''} onChange={e => patch({ booking_from: e.target.value || null })} /></label>
          <label className="block text-sm">Booking closes<input type="datetime-local" required={form.status === 'published'} min={form.booking_from || undefined} className={`${input} mt-1`} value={form.booking_until || ''} onChange={e => patch({ booking_until: e.target.value || null })} /></label>
        </div></div>
        <div><h3 className="font-semibold mb-1">Eligible stay nights</h3><p className="text-xs text-gray-400 mb-3">Leave both empty to allow any available future stay.</p><div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">First eligible night<input type="date" className={`${input} mt-1`} value={form.stay_from || ''} onChange={e => patch({ stay_from: e.target.value || null })} /></label>
          <label className="block text-sm">Last eligible night<input type="date" min={form.stay_from || undefined} className={`${input} mt-1`} value={form.stay_until || ''} onChange={e => patch({ stay_until: e.target.value || null })} /></label>
        </div></div>
        <div><h3 className="font-semibold">Excluded nights</h3><p className="text-xs text-gray-400 mb-3">Both dates included. For one night, enter the same date twice. A stay containing an excluded night cannot use this code.</p>
          {form.excluded_dates.map((range, i) => <div key={i} className="flex gap-2 mb-2"><label className="min-w-0 flex-1 text-xs">From<input aria-label={`Excluded first night ${i + 1}`} required type="date" className={`${input} mt-1`} value={range.from} onChange={e => patch({ excluded_dates: form.excluded_dates.map((r, j) => i === j ? { ...r, from: e.target.value } : r) })} /></label><label className="min-w-0 flex-1 text-xs">Through<input aria-label={`Excluded last night ${i + 1}`} required type="date" min={range.from} className={`${input} mt-1`} value={range.until} onChange={e => patch({ excluded_dates: form.excluded_dates.map((r, j) => i === j ? { ...r, until: e.target.value } : r) })} /></label><button type="button" className={button} aria-label={`Remove excluded range ${i + 1}`} onClick={() => patch({ excluded_dates: form.excluded_dates.filter((_, j) => i !== j) })}><Trash2 size={16} /></button></div>)}
          <button type="button" className={button} onClick={() => patch({ excluded_dates: [...form.excluded_dates, { from: '', until: '' }] })}><Plus size={14} /> Exclude dates</button>
        </div>
        <div><h3 className="font-semibold mb-2">Eligible accommodation</h3><p className="text-xs text-gray-400 mb-3">No selection means all accommodation in this campaign’s brand scope.</p><div className="grid gap-2 sm:grid-cols-2">{catalogue.rooms.map(room => <label key={room.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.room_ids.includes(room.id)} onChange={e => patch({ room_ids: e.target.checked ? [...form.room_ids, room.id] : form.room_ids.filter(id => id !== room.id) })} />{room.name}</label>)}</div></div>
        <label className="block text-sm">Status<select aria-label="Status" className={`${input} mt-1`} value={form.status} onChange={e => patch({ status: e.target.value as BookingPromotion['status'] })}><option value="draft">Draft</option><option value="published">Published · follows campaign dates</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
        <div className="flex gap-3 pt-3"><button className={button} type="submit"><Save size={16} />{pending ? 'Saving…' : 'Save promotion'}</button><button className={button} type="button" onClick={onClose}>Cancel</button></div>
      </fieldset></form>
    </section>
  </div>
}
