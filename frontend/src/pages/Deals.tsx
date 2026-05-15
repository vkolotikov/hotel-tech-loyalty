import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useSettings, triggerExport } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import {
  Package, Download, Upload, Plus, ChevronLeft, ChevronRight, ChevronDown,
  CreditCard, Settings2, PlayCircle, Eye, PackageCheck, CheckCircle2, MoreHorizontal,
  Mail, Phone, AlertTriangle,
} from 'lucide-react'

// 5 active stages + completed terminal. Order matters: drives the
// progress-bar segmentation on each row.
//
// Backend keys are kept stable for historical rows; the user-facing
// labels are intentionally generic so the same pipeline can fit
// hotels, agencies, manufacturing, services, etc. A future Settings
// → Deals tab will let admins rename each label per-org.
const STAGES = [
  { key: 'payment_pending', label: 'Awaiting Payment', color: '#f59e0b', icon: CreditCard },
  { key: 'design_needed',   label: 'Preparation',      color: '#a855f7', icon: Settings2 },
  { key: 'design_sent',     label: 'Review',           color: '#3b82f6', icon: Eye },
  { key: 'in_production',   label: 'In Progress',      color: '#0ea5e9', icon: PlayCircle },
  { key: 'ready_to_ship',   label: 'Ready',            color: '#10b981', icon: PackageCheck },
  { key: 'completed',       label: 'Completed',        color: '#22c55e', icon: CheckCircle2 },
] as const

// Map stage key → color/label/icon for cell rendering.
const STAGE_META = STAGES.reduce((m, s) => ({ ...m, [s.key]: s }), {} as Record<string, typeof STAGES[number]>)

const PAYMENT_META: Record<string, { label: string; bg: string; text: string }> = {
  pending:      { label: 'Pending',      bg: 'bg-amber-500/15', text: 'text-amber-400' },
  invoice_sent: { label: 'Invoice sent', bg: 'bg-blue-500/15',  text: 'text-blue-400'  },
  partial:      { label: 'Partial',      bg: 'bg-purple-500/15', text: 'text-purple-400' },
  paid:         { label: 'Paid',         bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  refunded:     { label: 'Refunded',     bg: 'bg-red-500/15',   text: 'text-red-400'   },
}

// 6 filter pills + a sort dropdown. Counts come from the kpis query so
// the pills mirror the cards above. Order matches the screenshot.
type FilterKey = 'all' | 'payment_pending' | 'design_needed' | 'in_production' | 'overdue' | 'high_value'

export function Deals() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const settings = useSettings()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<'due_date' | 'amount' | 'created'>('due_date')
  const [page, setPage] = useState(1)
  // Dropdown anchors carry the button's bounding rect so we can render
  // the menu as `position: fixed` outside the horizontally-scrolling
  // table wrapper. Without this, dropdowns get clipped at the right
  // edge of the scroller.
  const [openStageMenu, setOpenStageMenu]   = useState<{ id: number; rect: DOMRect } | null>(null)
  const [openPaymentMenu, setOpenPaymentMenu] = useState<{ id: number; rect: DOMRect } | null>(null)
  const [exporting, setExporting] = useState(false)

  // Translate the active filter pill into the controller's query params.
  // `focus` overrides `stage`/`payment` for the overdue + high_value buckets.
  const params = useMemo(() => {
    const p: Record<string, any> = { page, per_page: 10, sort }
    if (filter === 'payment_pending') p.stage = 'payment_pending'
    else if (filter === 'design_needed') p.stage = 'design_needed'
    else if (filter === 'in_production') p.stage = 'in_production'
    else if (filter === 'overdue') p.focus = 'overdue'
    else if (filter === 'high_value') p.focus = 'high_value'
    return p
  }, [filter, sort, page])

  const { data, isLoading } = useQuery<any>({
    queryKey: ['deals', params],
    queryFn: () => api.get('/v1/admin/deals', { params }).then(r => r.data),
  })
  const deals: any[] = data?.data ?? []

  const { data: kpis } = useQuery<any>({
    queryKey: ['deals-kpis'],
    queryFn: () => api.get('/v1/admin/deals/kpis').then(r => r.data),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  // Stage advance mutation — single click moves a deal forward through
  // the pipeline. The kpis + list both invalidate so cards refresh in lockstep.
  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) =>
      api.patch(`/v1/admin/deals/${id}/stage`, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['deals-kpis'] })
      toast.success(t('deals.toasts.stage_updated', 'Stage updated'))
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('deals.toasts.stage_failed', 'Failed to update stage')),
  })

  const paymentMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/v1/admin/deals/${id}/payment`, { payment_status: status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['deals-kpis'] })
      toast.success(t('deals.toasts.payment_updated', 'Payment updated'))
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('deals.toasts.payment_failed', 'Failed to update payment')),
  })

  const handleExport = async () => {
    setExporting(true)
    try { await triggerExport('/v1/admin/inquiries/export', { status: 'Confirmed' }) }
    catch { toast.error(t('deals.toasts.export_failed', 'Export failed')) }
    finally { setExporting(false) }
  }

  const currency = (n?: number | string | null) => {
    if (n == null) return '—'
    return `${settings.currency_symbol}${Number(n).toLocaleString()}`
  }

  const fmtDate = (s?: string | null) => {
    if (!s) return null
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Relative-time caption next to due dates ("Tomorrow" / "Today" /
  // "Overdue" / "In N days" / "N days ago"). Mirrors the screenshot.
  const relDue = (s?: string | null): { text: string; tone: string } | null => {
    if (!s) return null
    const due = new Date(s); due.setHours(0, 0, 0, 0)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const days = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (days < 0) return { text: t('deals.due.overdue', 'Overdue'), tone: 'text-red-400' }
    if (days === 0) return { text: t('deals.due.today', 'Today'), tone: 'text-amber-400' }
    if (days === 1) return { text: t('deals.due.tomorrow', 'Tomorrow'), tone: 'text-amber-400' }
    return { text: t('deals.due.in_days', { count: days, defaultValue: 'In {{count}} days' }), tone: 'text-gray-400' }
  }

  // The progress bar under each stage pill — segmented so the user
  // sees how far through the pipeline the deal sits. Skipped stages
  // show as faded; current shows its own color; future = neutral.
  const stageProgress = (stageKey?: string | null) => {
    const activeStages = STAGES.slice(0, 5) // exclude completed
    const idx = stageKey ? activeStages.findIndex(s => s.key === stageKey) : -1
    const completedTerminal = stageKey === 'completed'
    return activeStages.map((s, i) => {
      const filled = completedTerminal || (idx >= 0 && i <= idx)
      const isCurrent = i === idx
      return { stage: s, filled, isCurrent }
    })
  }

  const avatarInitials = (name?: string | null) => {
    if (!name) return '?'
    return name.split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
  }
  const avatarTints = ['bg-blue-500/20 text-blue-300', 'bg-purple-500/20 text-purple-300', 'bg-emerald-500/20 text-emerald-300', 'bg-amber-500/20 text-amber-300', 'bg-pink-500/20 text-pink-300', 'bg-cyan-500/20 text-cyan-300']
  const avatarTint = (id: number) => avatarTints[id % avatarTints.length]

  return (
    <div className="space-y-5" onClick={() => { setOpenStageMenu(null); setOpenPaymentMenu(null) }}>
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('deals.title', 'Deals & Fulfillment')}</h1>
          <p className="text-sm text-t-secondary mt-0.5">{t('deals.subtitle', 'Track order status, payments and fulfillment in one place.')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 bg-dark-surface border border-dark-border hover:border-primary-500 text-t-secondary hover:text-white font-medium text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            <Download size={14} /> {t('deals.actions.export', 'Export')}
          </button>
          <button disabled
            className="flex items-center gap-1.5 bg-dark-surface border border-dark-border text-t-secondary font-medium text-sm px-3 py-2 rounded-lg opacity-50 cursor-not-allowed"
            title={t('deals.actions.import_soon', 'Coming soon')}>
            <Upload size={14} /> {t('deals.actions.import', 'Import')}
          </button>
          <Link to="/inquiries"
            className="flex items-center gap-1.5 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors">
            <Plus size={15} /> {t('deals.actions.new_deal', 'New deal')}
          </Link>
        </div>
      </div>

      {/* 6 KPI cards — Total / Awaiting Payment / Design Needed /
          In Production / Ready to Ship / Completed This Month.
          Top tile labels match the screenshot exactly. */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { key: 'total',  label: t('deals.kpis.total', 'Total Deals'),                value: kpis.total ?? 0, sub: t('deals.kpis.all_active', 'All active deals'), tint: 'text-blue-400',   bg: 'bg-blue-500/15',   icon: Package },
            { key: 'await',  label: t('deals.kpis.awaiting_payment', 'Awaiting Payment'), value: kpis.awaiting_payment?.count ?? 0, sub: currency(kpis.awaiting_payment?.value), tint: 'text-amber-400',  bg: 'bg-amber-500/15',  icon: CreditCard },
            { key: 'design', label: t('deals.kpis.preparation', 'Preparation'),          value: kpis.design_needed?.count ?? 0,    sub: currency(kpis.design_needed?.value),    tint: 'text-purple-400', bg: 'bg-purple-500/15', icon: Settings2 },
            { key: 'prod',   label: t('deals.kpis.in_progress', 'In Progress'),          value: kpis.in_production?.count ?? 0,    sub: currency(kpis.in_production?.value),    tint: 'text-sky-400',    bg: 'bg-sky-500/15',    icon: PlayCircle },
            { key: 'ship',   label: t('deals.kpis.ready', 'Ready'),                      value: kpis.ready_to_ship?.count ?? 0,    sub: currency(kpis.ready_to_ship?.value),    tint: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: PackageCheck },
            { key: 'done',   label: t('deals.kpis.completed_month', 'Completed This Month'), value: kpis.completed_month?.count ?? 0, sub: currency(kpis.completed_month?.value), tint: 'text-green-400',  bg: 'bg-green-500/15', icon: CheckCircle2 },
          ].map(card => {
            const Icon = card.icon
            return (
              <div key={card.key} className="bg-dark-surface rounded-xl border border-dark-border p-4">
                <div className="flex items-start gap-2 mb-2">
                  <div className={`p-2 rounded-lg ${card.bg} ${card.tint}`}><Icon size={16} /></div>
                  <span className="text-[11px] text-t-secondary leading-tight">{card.label}</span>
                </div>
                <p className="text-2xl font-bold text-white tabular-nums">{card.value}</p>
                <p className="text-[11px] text-t-secondary mt-1">{card.sub}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Filter pills + sort */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-dark-surface border border-dark-border rounded-lg p-1 flex-wrap">
          {([
            { key: 'all' as FilterKey,             label: t('deals.filters.all', 'All'),                     count: kpis?.total ?? 0 },
            { key: 'payment_pending' as FilterKey, label: t('deals.filters.awaiting_payment', 'Awaiting Payment'), count: kpis?.awaiting_payment?.count ?? 0 },
            { key: 'design_needed' as FilterKey,   label: t('deals.filters.preparation', 'Preparation'),     count: kpis?.design_needed?.count ?? 0 },
            { key: 'in_production' as FilterKey,   label: t('deals.filters.in_progress', 'In Progress'),     count: kpis?.in_production?.count ?? 0 },
            { key: 'overdue' as FilterKey,         label: t('deals.filters.overdue', 'Overdue'),             count: null, tone: 'red' },
            { key: 'high_value' as FilterKey,      label: t('deals.filters.high_value', 'High Value'),       count: null, tone: 'emerald' },
          ]).map(p => {
            const active = filter === p.key
            return (
              <button key={p.key} onClick={() => { setFilter(p.key); setPage(1) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  active ? 'bg-primary-600 text-white' : 'text-t-secondary hover:text-white hover:bg-dark-surface2'
                }`}>
                {p.label}
                {p.count != null && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    active ? 'bg-white/20 text-white' : (p.tone === 'red' ? 'bg-red-500/20 text-red-400' : p.tone === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-dark-surface2 text-t-secondary')
                  }`}>{p.count}</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-dark-surface border border-dark-border rounded-lg px-3 py-1.5 text-xs">
            <span className="text-t-secondary">{t('deals.sort.label', 'Sort:')}</span>
            <select value={sort} onChange={e => setSort(e.target.value as any)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer">
              <option value="due_date">{t('deals.sort.due_date', 'Due Date')}</option>
              <option value="amount">{t('deals.sort.amount', 'Amount')}</option>
              <option value="created">{t('deals.sort.created', 'Newest')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table — outer wrapper keeps the rounded border via clip-path
          rather than overflow-hidden, so the stage/payment dropdowns
          (absolute-positioned inside the table) don't get clipped on
          the right edge. Inner div handles horizontal scrolling on
          narrow viewports. */}
      <div className="bg-dark-surface border border-dark-border rounded-xl">
        <div className="overflow-x-auto rounded-xl">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-dark-border">
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-t-secondary">{t('deals.table.deal_customer', 'Deal / Customer')}</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-t-secondary">{t('deals.table.product_details', 'Product & Details')}</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-t-secondary">{t('deals.table.amount', 'Amount')}</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-t-secondary">{t('deals.table.payment', 'Payment')}</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-t-secondary">{t('deals.table.fulfillment', 'Fulfillment Stage')}</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-t-secondary">{t('deals.table.next_action', 'Next Action')}</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-t-secondary">{t('deals.table.due_date', 'Due Date')}</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-t-secondary">{t('deals.table.owner', 'Owner')}</th>
                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-t-secondary">{t('deals.table.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-[#636366]">{t('deals.table.loading', 'Loading…')}</td></tr>
              )}
              {!isLoading && deals.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-16 text-center">
                  <Package size={36} className="mx-auto mb-3 text-[#636366]" />
                  <p className="text-sm text-[#a0a0a0]">{t('deals.table.empty', 'No deals match the current filter.')}</p>
                  <p className="text-xs text-[#636366] mt-1">{t('deals.table.empty_hint', 'Confirm an inquiry to start tracking it here.')}</p>
                </td></tr>
              )}
              {deals.map(d => {
                const payment = d.payment_status ? PAYMENT_META[d.payment_status] : null
                const stage = d.fulfillment_stage ? STAGE_META[d.fulfillment_stage] : null
                const progress = stageProgress(d.fulfillment_stage)
                const rel = relDue(d.next_task_due)
                const isOverdue = rel?.tone === 'text-red-400'

                return (
                  <tr key={d.id} className={`border-b border-dark-border/40 hover:bg-dark-surface2/60 transition-colors ${isOverdue ? 'bg-red-500/[0.02]' : ''}`}>
                    {/* Deal / Customer */}
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="flex items-center gap-3">
                        <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${avatarTint(d.id)}`}>
                          {avatarInitials(d.guest?.full_name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link to={`/inquiries/${d.id}`} className="font-semibold text-white hover:text-accent truncate">
                              {d.guest?.full_name ?? '—'}
                            </Link>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-emerald-500/15 text-emerald-400">{t('deals.row.converted', 'Converted')}</span>
                          </div>
                          {d.guest?.email && <div className="text-[11px] text-gray-500 truncate flex items-center gap-1"><Mail size={9} />{d.guest.email}</div>}
                          {(d.guest?.phone || d.guest?.mobile) && <div className="text-[11px] text-gray-500 truncate flex items-center gap-1"><Phone size={9} />{d.guest.phone ?? d.guest.mobile}</div>}
                        </div>
                      </div>
                    </td>

                    {/* Product & Details */}
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="text-sm text-white truncate">{d.room_type_requested || d.inquiry_type || t('deals.row.no_product', '—')}</div>
                      {(d.num_rooms || d.event_pax) && (
                        <div className="text-[11px] text-gray-500 truncate">
                          {d.num_rooms ? `${d.num_rooms} ${t('deals.row.rooms', 'rooms')}` : `${d.event_pax} ${t('deals.row.pax', 'pax')}`}
                          {d.property?.name && ` · ${d.property.name}`}
                        </div>
                      )}
                      {d.event_name && <div className="text-[10px] text-gray-600 truncate">{d.event_name}</div>}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-bold text-white tabular-nums">{currency(d.total_value)}</div>
                      {d.paid_amount != null && d.payment_status === 'partial' && (
                        <div className="text-[10px] text-purple-400">{currency(d.paid_amount)} {t('deals.row.paid_lower', 'paid')}</div>
                      )}
                    </td>

                    {/* Payment */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setOpenPaymentMenu(openPaymentMenu?.id === d.id ? null : { id: d.id, rect })
                        }}
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${payment?.bg ?? 'bg-dark-surface3'} ${payment?.text ?? 'text-t-secondary'} hover:brightness-110 transition`}>
                        {payment?.label ?? t('deals.row.no_payment', 'Set status')}
                        <ChevronDown size={9} />
                      </button>
                      {d.payment_status === 'paid' && d.last_contacted_at && (
                        <div className="text-[10px] text-gray-500 mt-0.5">{fmtDate(d.last_contacted_at)}</div>
                      )}
                      {d.payment_status === 'invoice_sent' && d.next_task_due && (
                        <div className="text-[10px] text-gray-500 mt-0.5">{t('deals.row.due')} {fmtDate(d.next_task_due)}</div>
                      )}
                    </td>

                    {/* Fulfillment stage + progress bar */}
                    <td className="px-4 py-3 max-w-[220px]" onClick={e => e.stopPropagation()}>
                      <button onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setOpenStageMenu(openStageMenu?.id === d.id ? null : { id: d.id, rect })
                        }}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold border hover:brightness-110 transition"
                        style={{ background: (stage?.color ?? '#666') + '20', color: stage?.color ?? '#a0a0a0', borderColor: (stage?.color ?? '#666') + '50' }}>
                        {stage ? <><stage.icon size={9} /> {t(`deals.stages.${stage.key}`, stage.label)}</> : t('deals.row.set_stage', 'Set stage')}
                        <ChevronDown size={9} />
                      </button>
                      <div className="flex gap-0.5 mt-1.5 max-w-[160px]">
                        {progress.map((p, i) => (
                          <div key={i} className="h-1 flex-1 rounded-full"
                            style={{ background: p.filled ? p.stage.color : 'rgba(255,255,255,0.08)' }} />
                        ))}
                      </div>
                    </td>

                    {/* Next Action */}
                    <td className="px-4 py-3 max-w-[200px]">
                      {d.next_task_type && !d.next_task_completed ? (
                        <>
                          <div className="text-xs text-white truncate flex items-center gap-1">
                            {isOverdue && <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />}
                            {d.next_task_type}
                          </div>
                          {d.next_task_due && (
                            <div className="text-[10px] text-gray-500 truncate">{t('deals.row.due')} {fmtDate(d.next_task_due)}</div>
                          )}
                        </>
                      ) : d.next_task_completed ? (
                        <span className="text-xs text-emerald-400">{t('deals.row.task_done', 'Task complete')}</span>
                      ) : (
                        <span className="text-xs text-gray-700">—</span>
                      )}
                    </td>

                    {/* Due date + relative */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {d.next_task_due ? (
                        <>
                          <div className="text-xs text-gray-300">{fmtDate(d.next_task_due)}</div>
                          {rel && <div className={`text-[10px] ${rel.tone} font-semibold`}>{rel.text}</div>}
                        </>
                      ) : <span className="text-xs text-gray-700">—</span>}
                    </td>

                    {/* Owner */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {d.assigned_to ? (
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${avatarTint(d.id + 1)}`}>
                            {avatarInitials(d.assigned_to)}
                          </div>
                          <span className="text-xs text-gray-300 truncate max-w-[80px]">{d.assigned_to}</span>
                        </div>
                      ) : <span className="text-xs text-gray-700">—</span>}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/inquiries/${d.id}`}
                          className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md">
                          {t('deals.row.open', 'Open')}
                        </Link>
                        <button className="p-1.5 rounded-md hover:bg-white/[0.06] text-gray-500 hover:text-white">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border text-sm">
            <span className="text-t-secondary">
              {t('deals.pagination', { from: data.from ?? 0, to: data.to ?? 0, total: data.total ?? 0, defaultValue: 'Showing {{from}} to {{to}} of {{total}} deals' })}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-md border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40">
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(data.last_page, 5) }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  className={`w-8 h-8 rounded-md text-xs font-semibold ${n === page ? 'bg-primary-600 text-white' : 'text-[#a0a0a0] hover:text-white hover:bg-dark-surface2'}`}>
                  {n}
                </button>
              ))}
              {data.last_page > 5 && <span className="text-gray-600 px-1">…</span>}
              {data.last_page > 5 && (
                <button onClick={() => setPage(data.last_page)} className="w-8 h-8 rounded-md text-xs font-semibold text-[#a0a0a0] hover:text-white hover:bg-dark-surface2">
                  {data.last_page}
                </button>
              )}
              <button disabled={page >= (data.last_page ?? 1)} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded-md border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fixed-position dropdown menus — rendered outside the table so
          the horizontal-scroll wrapper can't clip them. Anchored to the
          trigger button's getBoundingClientRect() captured on click. */}
      {openStageMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: openStageMenu.rect.bottom + 4, left: openStageMenu.rect.left, zIndex: 60 }}
          className="bg-dark-surface border border-dark-border rounded-lg shadow-xl min-w-[180px] overflow-hidden"
        >
          {STAGES.map(s => {
            const Icon = s.icon
            return (
              <button key={s.key}
                onClick={() => { stageMutation.mutate({ id: openStageMenu.id, stage: s.key }); setOpenStageMenu(null) }}
                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-dark-surface2"
                style={{ color: s.color }}>
                <Icon size={11} /> {t(`deals.stages.${s.key}`, s.label)}
              </button>
            )
          })}
        </div>
      )}
      {openPaymentMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: openPaymentMenu.rect.bottom + 4, left: openPaymentMenu.rect.left, zIndex: 60 }}
          className="bg-dark-surface border border-dark-border rounded-lg shadow-xl min-w-[140px] overflow-hidden"
        >
          {Object.entries(PAYMENT_META).map(([key, meta]) => (
            <button key={key}
              onClick={() => { paymentMutation.mutate({ id: openPaymentMenu.id, status: key }); setOpenPaymentMenu(null) }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-dark-surface2 ${meta.text}`}>
              {meta.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
