import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Snowflake, DollarSign, UserMinus, AlarmClock, ChevronDown, Sparkles, Flame } from 'lucide-react'
import toast from 'react-hot-toast'
import { ContactActions } from './ContactActions'

interface SignalCard {
  key: 'cold' | 'high_value' | 'unassigned' | 'stuck'
  label: string
  blurb: string
  icon: any
  tone: string
  countText: string
  sample: any[]
}

/**
 * Sales-pipeline insights panel — four deterministic signals a sales
 * manager actually wants flagged daily, computed straight from SQL on
 * the server side. Cards are click-to-expand; opening one reveals the
 * sample list so reps can drill in without a separate page.
 *
 * Distinct from the DailyOpsBar (which is task-due-centric). This is
 * about deals that are quietly slipping through the cracks.
 */
export function PipelineInsights({ currencySymbol }: { currencySymbol: string }) {
  const qc = useQueryClient()
  const { data } = useQuery<any>({
    queryKey: ['inquiries-insights'],
    queryFn: () => api.get('/v1/admin/inquiries/insights').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const [open, setOpen] = useState<SignalCard['key'] | null>(null)

  // CRM Phase 4: bulk re-engagement on the Going Cold list. Queues a
  // follow-up task for tomorrow 9am on every cold inquiry shown and
  // logs an activity. Does not actually send email — that's a Phase
  // 4.5 add once the template-pick UX is in.
  const reengage = useMutation({
    mutationFn: (ids: number[]) => api.post('/v1/admin/inquiries/bulk', {
      ids,
      action: 'mark_for_reengagement',
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['inquiries-insights'] })
      qc.invalidateQueries({ queryKey: ['admin-inquiries'] })
      qc.invalidateQueries({ queryKey: ['tasks-list'] })
      toast.success(res.data?.message ?? 'Tasks queued')
    },
    onError: () => toast.error('Could not queue re-engagement'),
  })

  if (!data) return null

  const cards: SignalCard[] = [
    {
      key: 'cold',
      label: 'Going Cold',
      blurb: 'Open · no contact in 7+ days',
      icon: Snowflake,
      tone: 'border-blue-500/25 bg-blue-500/[0.04] hover:bg-blue-500/[0.08]',
      countText: String(data.cold?.count ?? 0),
      sample: data.cold?.sample ?? [],
    },
    {
      key: 'high_value',
      label: 'High Value',
      blurb: 'Top 5 active deals by value',
      icon: DollarSign,
      tone: 'border-emerald-500/25 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]',
      countText: `${currencySymbol}${Number(data.high_value?.total ?? 0).toLocaleString()}`,
      sample: data.high_value?.sample ?? [],
    },
    {
      key: 'unassigned',
      label: 'Unassigned',
      blurb: 'Open 3+ days · no owner',
      icon: UserMinus,
      tone: 'border-amber-500/25 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]',
      countText: String(data.unassigned?.count ?? 0),
      sample: data.unassigned?.sample ?? [],
    },
    {
      key: 'stuck',
      label: 'Stuck',
      blurb: 'Same status for 14+ days',
      icon: AlarmClock,
      tone: 'border-red-500/25 bg-red-500/[0.04] hover:bg-red-500/[0.08]',
      countText: String(data.stuck?.count ?? 0),
      sample: data.stuck?.sample ?? [],
    },
  ]

  // Hide the whole panel when every signal is zero — nothing to act
  // on means the panel is just visual noise.
  const allEmpty = (data.cold?.count ?? 0) + (data.unassigned?.count ?? 0) + (data.stuck?.count ?? 0) === 0
    && (data.high_value?.sample?.length ?? 0) === 0
  if (allEmpty) return null

  const activeCard = open ? cards.find(c => c.key === open) : null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Sparkles size={12} className="text-purple-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Pipeline Insights</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => {
          const Icon = c.icon
          const isOpen = open === c.key
          return (
            <button key={c.key} onClick={() => setOpen(isOpen ? null : c.key)}
              className={`text-left rounded-xl border p-3 transition-colors ${c.tone} ${isOpen ? 'ring-2 ring-white/20' : ''}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{c.label}</span>
                <Icon size={13} className="text-gray-400" />
              </div>
              <div className="text-xl font-bold text-white tabular-nums">{c.countText}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{c.blurb}</div>
            </button>
          )
        })}
      </div>

      {activeCard && (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(18,24,22,0.96)' }}>
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{activeCard.label}</span>
            <div className="flex items-center gap-2">
              {activeCard.key === 'cold' && activeCard.sample.length > 0 && (
                <button
                  onClick={() => {
                    const ids = activeCard.sample.map((i: any) => i.id)
                    if (window.confirm(`Queue re-engagement tasks for ${ids.length} cold lead${ids.length === 1 ? '' : 's'} (due tomorrow 9am)?`)) {
                      reengage.mutate(ids)
                    }
                  }}
                  disabled={reengage.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/25 hover:text-orange-200 disabled:opacity-50"
                >
                  <Flame size={11} />
                  {reengage.isPending ? 'Queuing…' : `Re-engage all (${activeCard.sample.length})`}
                </button>
              )}
              <button onClick={() => setOpen(null)} className="text-[10px] text-gray-500 hover:text-white">Close</button>
            </div>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {activeCard.sample.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-600">No items in this bucket.</div>
            ) : activeCard.sample.map((inq: any) => (
              <div key={inq.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-sm gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <ChevronDown size={12} className="text-gray-700 -rotate-90" />
                  <span className="text-white font-semibold truncate">{inq.guest?.full_name ?? '—'}</span>
                  {inq.guest?.company && <span className="text-gray-500 text-xs truncate">· {inq.guest.company}</span>}
                  <span className="text-gray-600 text-xs">· {inq.status}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {inq.total_value && <span className="text-emerald-400 font-semibold">{currencySymbol}{Number(inq.total_value).toLocaleString()}</span>}
                  {inq.last_contacted_at && <span className="text-gray-500">last: {new Date(inq.last_contacted_at).toLocaleDateString()}</span>}
                  <ContactActions email={inq.guest?.email} phone={inq.guest?.phone} compact />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
