import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle, Clock, Calendar as CalendarIcon, Sparkles, CheckCircle2,
} from 'lucide-react'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'
import { DailyOpsBar } from '../components/DailyOpsBar'
import { PipelineInsights } from '../components/PipelineInsights'
import { ContactActions } from '../components/ContactActions'
import toast from 'react-hot-toast'

/**
 * Pipeline → Insights tab. Concentrates the analytics that used to
 * sit above the leads table (TODAY snapshot + PIPELINE INSIGHTS) onto
 * a dedicated tab so the Leads & Inquiries tab can stay focused on
 * managing the actual list.
 *
 * Each card click expands an inline focus pane underneath; the items
 * in that pane link straight to the corresponding lead, so this tab
 * is also a fast triage surface.
 */
export function InquiryInsights() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const settings = useSettings()
  const [dailyFocus, setDailyFocus] = useState<'' | 'overdue' | 'today' | 'soon' | 'new_leads'>('')

  const { data: today } = useQuery<any>({
    queryKey: ['inquiries-today'],
    queryFn: () => api.get('/v1/admin/inquiries/today').then(r => r.data),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })

  const completeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/inquiries/${id}/complete-task`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries-today'] })
      qc.invalidateQueries({ queryKey: ['admin-inquiries'] })
      toast.success(t('inquiries.toasts.task_completed', 'Task marked complete'))
    },
    onError: () => toast.error(t('inquiries.toasts.task_failed', 'Could not mark complete')),
  })

  // No data yet — quiet placeholder.
  if (!today) {
    return (
      <div className="text-center text-[#636366] py-12 text-sm">
        {t('inquiries.insights.loading', 'Loading insights…')}
      </div>
    )
  }

  const totalToday = (today.overdue?.count ?? 0)
    + (today.today?.count ?? 0)
    + (today.soon?.count ?? 0)
    + (today.new_leads?.count ?? 0)

  return (
    <div className="space-y-4">
      {/* TODAY ops snapshot. When everything is zero we collapse to a
          quiet status line — no point eating viewport when nothing is on
          fire. */}
      {totalToday === 0 ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2.5 flex items-center gap-3 text-xs">
          <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
          <span className="text-emerald-300 font-bold uppercase tracking-wider text-[10px]">{t('inquiries.today.label', 'Today')}</span>
          <span className="text-gray-300">{t('inquiries.today.all_caught_up', 'All caught up — no overdue, no tasks due today, no new leads in the last 24h.')}</span>
          <span className="ml-auto text-[10px] text-gray-600">{today.date}</span>
        </div>
      ) : (
        <DailyOpsBar
          title={t('inquiries.today.label', 'Today')}
          hint={today.date}
          tiles={[
            { key: 'overdue',   label: t('inquiries.today.tiles.overdue',   'Overdue'),   value: today.overdue?.count ?? 0,   sub: today.overdue?.count ? t('inquiries.today.tile_subs.click_to_view', 'Click to view') : t('inquiries.today.tile_subs.all_caught_up', 'All caught up'),         tone: (today.overdue?.count ?? 0) > 0 ? 'red' : 'gray', icon: <AlertCircle size={12} />, active: dailyFocus === 'overdue',   onClick: () => setDailyFocus(dailyFocus === 'overdue' ? '' : 'overdue') },
            { key: 'today',     label: t('inquiries.today.tiles.due_today', 'Due Today'), value: today.today?.count ?? 0,     sub: today.today?.count ? t('inquiries.today.tile_subs.tasks_scheduled', 'Tasks scheduled') : t('inquiries.today.tile_subs.nothing_today', 'Nothing due today'),     tone: 'amber',  icon: <Clock size={12} />,         active: dailyFocus === 'today',     onClick: () => setDailyFocus(dailyFocus === 'today' ? '' : 'today') },
            { key: 'soon',      label: t('inquiries.today.tiles.due_soon',  'Due Soon'),  value: today.soon?.count ?? 0,      sub: t('inquiries.today.tile_subs.next_3_days', 'Next 3 days'),                                                    tone: 'blue',   icon: <CalendarIcon size={12} />,  active: dailyFocus === 'soon',      onClick: () => setDailyFocus(dailyFocus === 'soon' ? '' : 'soon') },
            { key: 'new_leads', label: t('inquiries.today.tiles.new_leads', 'New Leads'), value: today.new_leads?.count ?? 0, sub: t('inquiries.today.tile_subs.last_24h',   'Last 24 h'),                                                      tone: 'emerald', icon: <Sparkles size={12} />,     active: dailyFocus === 'new_leads', onClick: () => setDailyFocus(dailyFocus === 'new_leads' ? '' : 'new_leads') },
          ]}
        />
      )}

      {/* Inline focus pane when a TODAY tile is active. */}
      {dailyFocus && (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(18,24,22,0.96)' }}>
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {dailyFocus === 'overdue' ? t('inquiries.today.focus.overdue', 'Overdue Tasks')
                : dailyFocus === 'today' ? t('inquiries.today.focus.today', "Today's Tasks")
                : dailyFocus === 'soon' ? t('inquiries.today.focus.soon', 'Due Soon (3 days)')
                : t('inquiries.today.focus.new_leads', 'New Leads (24 h)')}
            </span>
            <button onClick={() => setDailyFocus('')} className="text-[10px] text-gray-500 hover:text-white">{t('inquiries.today.focus.close', 'Close')}</button>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {(() => {
              const items = dailyFocus === 'new_leads'
                ? (today.new_leads?.leads ?? [])
                : (today[dailyFocus]?.tasks ?? [])
              if (items.length === 0) {
                return <div className="px-4 py-6 text-center text-xs text-gray-600">{t('inquiries.today.focus.empty', 'Nothing here right now.')}</div>
              }
              return items.map((inq: any) => (
                <div key={inq.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-sm">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      onClick={() => navigate(`/inquiries/${inq.id}`)}
                      className="text-white font-semibold truncate hover:text-primary-300 transition-colors text-left"
                    >
                      {inq.guest?.full_name ?? '—'}
                    </button>
                    {inq.guest?.company && <span className="text-gray-500 text-xs truncate">· {inq.guest.company}</span>}
                    {dailyFocus !== 'new_leads' && inq.next_task_type && (
                      <span className="text-amber-400 text-xs truncate">· {inq.next_task_type}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {inq.next_task_due && dailyFocus !== 'new_leads' && (
                      <span className={dailyFocus === 'overdue' ? 'text-red-400' : 'text-gray-400'}>{inq.next_task_due}</span>
                    )}
                    <ContactActions email={inq.guest?.email} phone={inq.guest?.phone} compact />
                    {inq.next_task_type && !inq.next_task_completed && dailyFocus !== 'new_leads' && (
                      <button onClick={() => completeMutation.mutate(inq.id)} title={t('inquiries.table.mark_task_done', 'Mark task done')}
                        className="p-1 rounded-lg hover:bg-green-500/10 text-[#636366] hover:text-green-400 transition-colors">
                        <CheckCircle2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* PIPELINE INSIGHTS — Going Cold / High Value / Unassigned / Stuck. */}
      <PipelineInsights currencySymbol={settings.currency_symbol} />

      {/* Quick-link back to the leads list. */}
      <div className="text-center pt-2">
        <Link
          to="/pipeline?tab=inquiries"
          className="inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 underline-offset-4 hover:underline"
        >
          {t('inquiries.insights.go_to_leads', 'Manage leads →')}
        </Link>
      </div>
    </div>
  )
}
