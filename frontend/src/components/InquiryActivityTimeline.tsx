import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Phone, Mail, Users, StickyNote, Plus, Activity as ActivityIcon, ArrowRightLeft } from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

interface Props {
  /** Inquiry id — activities are the lead's own timeline (Activity table). */
  inquiryId: number
}

/**
 * The lead's activity timeline — inquiry-scoped, mirroring the /inquiries/:id
 * detail page (ActivityController@index/@store on `/v1/admin/inquiries/{id}/
 * activities`). This is deliberately NOT the guest-scoped ActivityTimeline:
 * that one writes to the separate GuestActivity table, so logging there would
 * NOT appear on this lead's own detail timeline. Keeping the drawer on the
 * inquiry endpoint means a note/call logged from the card shows up on the
 * lead detail page too, and vice-versa.
 *
 * Quick-add composer at the top lets an agent log a touch without leaving the
 * card. Types match the backend whitelist (note / call / email / meeting).
 * Activities are append-only by design — no edit/delete (fix a typo with a
 * follow-up note), same as every serious CRM.
 */
export function InquiryActivityTimeline({ inquiryId }: Props) {
  const qc = useQueryClient()
  const [type, setType] = useState<string>('note')
  const [body, setBody] = useState('')

  const { data: activities = [] } = useQuery<any[]>({
    queryKey: ['inquiry-activities', inquiryId],
    queryFn: () => api.get(`/v1/admin/inquiries/${inquiryId}/activities`).then(r => r.data?.data ?? []),
    enabled: !!inquiryId,
    staleTime: 30_000,
  })

  const addMutation = useMutation({
    mutationFn: () => api.post(`/v1/admin/inquiries/${inquiryId}/activities`, { type, body: body.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiry-activities', inquiryId] })
      // The list surfaces "last contact" / touch freshness off the inquiry
      // row, and call/email/meeting bump last_contacted_at server-side — so
      // refresh the leads list too.
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      setBody('')
      toast.success('Activity logged')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to log activity'),
  })

  const types = [
    { key: 'note',    label: 'Note',    icon: StickyNote, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
    { key: 'call',    label: 'Call',    icon: Phone,      tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
    { key: 'email',   label: 'Email',   icon: Mail,       tone: 'text-blue-300 bg-blue-500/10 border-blue-500/25' },
    { key: 'meeting', label: 'Meeting', icon: Users,      tone: 'text-violet-300 bg-violet-500/10 border-violet-500/25' },
  ]

  const iconFor = (t: string) => {
    const found = types.find(x => x.key === t)
    if (found) return { Icon: found.icon, tone: found.tone }
    if (t === 'status_change' || t === 'stage_change') return { Icon: ArrowRightLeft, tone: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/25' }
    return { Icon: ActivityIcon, tone: 'text-gray-300 bg-gray-500/10 border-gray-500/25' }
  }

  const submit = () => {
    if (!body.trim()) {
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
          {types.map(tp => {
            const Icon = tp.icon
            const active = type === tp.key
            return (
              <button key={tp.key} type="button" onClick={() => setType(tp.key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${active ? tp.tone : 'text-gray-500 border-white/[0.06] hover:border-white/[0.15] hover:text-gray-300'}`}>
                <Icon size={11} />
                {tp.label}
              </button>
            )
          })}
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="What happened? (e.g. 'Called guest, will send proposal Tue')"
          rows={2}
          className="w-full bg-[#1e1e1e] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500/40"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-600">Cmd/Ctrl + Enter to submit</span>
          <button type="button" onClick={submit} disabled={addMutation.isPending || !body.trim()}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors">
            <Plus size={12} /> {addMutation.isPending ? 'Logging…' : 'Log'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-600">No activity yet — log the first one above.</div>
      ) : (
        <div className="space-y-2">
          {activities.map((a: any) => {
            const t = a.type || 'note'
            const { Icon, tone } = iconFor(t)
            const when = a.occurred_at || a.created_at
            return (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.015]">
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${tone}`}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white capitalize">{String(t).replace('_', ' ')}</span>
                    {a.creator?.name && <span className="text-[10px] text-gray-500">by {a.creator.name}</span>}
                  </div>
                  {a.subject && <p className="text-xs text-gray-300 mt-0.5">{a.subject}</p>}
                  {a.body && <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap">{a.body}</p>}
                </div>
                {when && (
                  <span className="text-[10px] text-gray-600 whitespace-nowrap">
                    {new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
