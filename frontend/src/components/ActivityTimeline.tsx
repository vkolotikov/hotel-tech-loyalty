import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Phone, Mail, MessageSquare, MessageCircle, StickyNote, Plus, Activity as ActivityIcon, Hotel as HotelIcon } from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

interface Props {
  /** Guest id — activities are stored against `guest_id`. */
  guestId: number | null | undefined
  /** Initial list passed from a parent fetch (saves a round-trip on first render). */
  initialActivities?: any[]
}

/**
 * Customer interaction log: calls, emails, SMS, WhatsApp messages, notes,
 * stays. Backed by `/v1/admin/guests/{id}/activities` (existing endpoint).
 *
 * Quick-add row at the top lets staff log an interaction without leaving
 * the page — a click on the type pill flips the icon colour, and Submit
 * fires POST + invalidates so the list refreshes inline.
 *
 * Activity types are intentionally a fixed small list — staff care about
 * "what kind of touch was this" for reporting, and free-form types make
 * trend analysis useless.
 */
export function ActivityTimeline({ guestId, initialActivities }: Props) {
  const qc = useQueryClient()
  const [type, setType] = useState<string>('note')
  const [description, setDescription] = useState('')

  const { data: activities = initialActivities ?? [] } = useQuery<any[]>({
    queryKey: ['guest-activities', guestId],
    queryFn: () => api.get(`/v1/admin/guests/${guestId}/activities`).then(r => r.data),
    enabled: !!guestId,
    staleTime: 30_000,
    initialData: initialActivities,
  })

  const addMutation = useMutation({
    mutationFn: () => api.post(`/v1/admin/guests/${guestId}/activities`, { type, description }),
    onSuccess: () => {
      // Refresh the inline timeline + the parent guest/member detail
      // payloads. Guard against null/undefined guestId so we never write
      // a `['guest', 'undefined']` cache key (which would silently miss
      // the real guest cache and prevent invalidation).
      if (guestId) {
        qc.invalidateQueries({ queryKey: ['guest-activities', guestId] })
        qc.invalidateQueries({ queryKey: ['guest', String(guestId)] })
      }
      // Member detail uses the linked_guest payload; refetch any member
      // row whose linked_guest matches. We can't know the member id from
      // here, so a broad `predicate` invalidation is the right tool —
      // narrower than `['member']` which would invalidate every member-
      // shaped query in the app.
      qc.invalidateQueries({ predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === 'member' })
      setDescription('')
      toast.success('Activity logged')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to log activity'),
  })

  if (!guestId) return null

  const types = [
    { key: 'call',     label: 'Call',     icon: Phone,         tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
    { key: 'email',    label: 'Email',    icon: Mail,          tone: 'text-blue-300 bg-blue-500/10 border-blue-500/25' },
    { key: 'sms',      label: 'SMS',      icon: MessageSquare, tone: 'text-violet-300 bg-violet-500/10 border-violet-500/25' },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, tone: 'text-[#25D366] bg-[#25D366]/10 border-[#25D366]/25' },
    { key: 'note',     label: 'Note',     icon: StickyNote,    tone: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
  ]

  const iconFor = (t: string) => {
    const found = types.find(x => x.key === t)
    if (found) return { Icon: found.icon, tone: found.tone }
    if (t === 'stay' || t === 'reservation' || t === 'check_in') return { Icon: HotelIcon, tone: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/25' }
    return { Icon: ActivityIcon, tone: 'text-gray-300 bg-gray-500/10 border-gray-500/25' }
  }

  const submit = () => {
    if (!description.trim()) {
      toast.error('Add a short description')
      return
    }
    addMutation.mutate()
  }

  return (
    <div className="space-y-3">
      {/* Quick-add */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {types.map(t => {
            const Icon = t.icon
            const active = type === t.key
            return (
              <button key={t.key} type="button" onClick={() => setType(t.key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${active ? t.tone : 'text-gray-500 border-white/[0.06] hover:border-white/[0.15] hover:text-gray-300'}`}>
                <Icon size={11} />
                {t.label}
              </button>
            )
          })}
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What happened? (e.g. 'Discussed honeymoon package, will send proposal Tue')"
          rows={2}
          className="w-full bg-[#1e1e1e] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500/40"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-600">Cmd/Ctrl + Enter to submit</span>
          <button type="button" onClick={submit} disabled={addMutation.isPending || !description.trim()}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors">
            <Plus size={12} /> {addMutation.isPending ? 'Logging…' : 'Log'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <div className="text-center py-8 text-xs text-gray-600">No activity yet — log the first one above.</div>
      ) : (
        <div className="space-y-2">
          {activities.map((a: any) => {
            const t = a.type || a.activity_type || 'note'
            const { Icon, tone } = iconFor(t)
            return (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.015]">
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${tone}`}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white capitalize">{t.replace('_', ' ')}</span>
                    {a.performed_by && <span className="text-[10px] text-gray-500">by {a.performed_by}</span>}
                  </div>
                  {a.description && <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap">{a.description}</p>}
                </div>
                <span className="text-[10px] text-gray-600 whitespace-nowrap">
                  {new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
