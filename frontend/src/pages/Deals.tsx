import React, { useState, useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useSettings, triggerExport, type DealFieldConfig } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import {
  Download, Upload, Plus, ChevronLeft, ChevronRight, ChevronDown,
  CreditCard, Settings2, PlayCircle, Eye, PackageCheck, CheckCircle2, MoreHorizontal,
  Mail, Phone, AlertTriangle, Users, Sparkles, TrendingUp, CheckSquare, FileText,
  Inbox, Star, Flame,
} from 'lucide-react'
import FreshnessBadge from '../components/FreshnessBadge'

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
  // Per-org column visibility — admin toggles in Settings → Pipelines → Fields → Deals.
  // Deal/Customer column + Actions are always shown.
  const dealFields: DealFieldConfig = settings.deal_fields
  const visibleCols = Object.values(dealFields.list).filter(Boolean).length + 2 // +2 for deal/customer + actions
  // The Deals hub deep-links into specific filtered views via ?view=
  // (e.g. /deals?view=overdue). Read once on mount so the hub tile a
  // user just clicked lands on the right pill. Subsequent pill clicks
  // don't write back to the URL — keeping the URL clean and avoiding
  // a re-init loop.
  const [searchParamsDeals] = useSearchParams()
  const initialFilter = ((): FilterKey => {
    const v = searchParamsDeals.get('view')
    const allowed: FilterKey[] = ['all', 'payment_pending', 'design_needed', 'in_production', 'overdue', 'high_value']
    return (v && (allowed as string[]).includes(v)) ? (v as FilterKey) : 'all'
  })()
  const [filter, setFilter] = useState<FilterKey>(initialFilter)
  // Re-sync when the URL view param changes (e.g. user clicks another
  // hub tile while already on /deals).
  useEffect(() => {
    const v = searchParamsDeals.get('view')
    const allowed: FilterKey[] = ['all', 'payment_pending', 'design_needed', 'in_production', 'overdue', 'high_value']
    if (v && (allowed as string[]).includes(v)) setFilter(v as FilterKey)
  }, [searchParamsDeals])
  const [sort, setSort] = useState<'due_date' | 'amount' | 'created'>('due_date')
  const [page, setPage] = useState(1)
  // Dropdown anchors carry the button's bounding rect so we can render
  // the menu as `position: fixed` outside the horizontally-scrolling
  // table wrapper. Without this, dropdowns get clipped at the right
  // edge of the scroller.
  const [openStageMenu, setOpenStageMenu]   = useState<{ id: number; rect: DOMRect } | null>(null)
  const [openPaymentMenu, setOpenPaymentMenu] = useState<{ id: number; rect: DOMRect } | null>(null)
  const [exporting, setExporting] = useState(false)
  // Single-row expansion — same UX as the Leads v2 table. Click the
  // chevron to surface customer details + payment breakdown + notes
  // without leaving the page.
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

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
  // (Previous avatarTint() helper retired in the v2 row -- avatars now
  // tint from the deal's fulfillment stage colour for consistent
  // visual scanning down a column.)

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

      {/* KPI cards moved to /analytics → Deals tab so this page stays a
          focused workflow view. Filter pills below still surface live
          counts where they matter for filtering. */}

      {/* Filter pills + sort — gold-accent segmented control matching
        * the Leads v2 tab bar so the two pages share visual language. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1 bg-dark-surface border border-dark-border rounded-xl p-1 flex-wrap">
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
              <button
                key={p.key}
                onClick={() => { setFilter(p.key); setPage(1) }}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all active:scale-[0.98]',
                  active
                    ? 'bg-primary-500 text-dark-bg shadow-md shadow-primary-500/25'
                    : 'text-gray-300 hover:text-white hover:bg-white/[0.04]',
                ].join(' ')}
              >
                {p.label}
                {p.count != null && (
                  <span
                    className={[
                      'text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums',
                      active
                        ? 'bg-dark-bg/30 text-dark-bg'
                        : (p.tone === 'red' ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                          : p.tone === 'emerald' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-white/[0.06] text-gray-400 border border-white/10'),
                    ].join(' ')}
                  >
                    {p.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 bg-dark-surface border border-dark-border rounded-lg px-3 h-9 text-xs">
            <span className="text-gray-500 text-[11px] uppercase tracking-wider font-semibold">{t('deals.sort.label_short', 'Sort')}</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as any)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
            >
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
              <tr className="border-b border-dark-border bg-dark-bg/40 sticky top-0 z-10 backdrop-blur-sm">
                <th className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider font-bold text-gray-500 whitespace-nowrap">
                  {t('deals.table.deal_customer', 'Deal · Customer')}
                </th>
                {dealFields.list.product_details && <th className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider font-bold text-gray-500 whitespace-nowrap">{t('deals.table.product_details', 'Product · Details')}</th>}
                {dealFields.list.amount && <th className="text-right px-3 py-2.5 text-[10.5px] uppercase tracking-wider font-bold text-gray-500 whitespace-nowrap">{t('deals.table.amount', 'Amount')}</th>}
                {dealFields.list.payment && <th className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider font-bold text-gray-500 whitespace-nowrap">{t('deals.table.payment', 'Payment')}</th>}
                {dealFields.list.fulfillment && <th className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider font-bold text-gray-500 whitespace-nowrap">{t('deals.table.fulfillment', 'Fulfillment')}</th>}
                {dealFields.list.next_action && <th className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider font-bold text-gray-500 whitespace-nowrap">{t('deals.table.next_action', 'Next action')}</th>}
                {dealFields.list.due_date && <th className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider font-bold text-gray-500 whitespace-nowrap">{t('deals.table.due_date', 'Due')}</th>}
                {dealFields.list.owner && <th className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider font-bold text-gray-500 whitespace-nowrap">{t('deals.table.owner', 'Owner')}</th>}
                <th className="px-2 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={visibleCols} className="px-4 py-16 text-center">
                    <div className="mx-auto inline-flex items-center gap-2 text-gray-600 text-[12px]">
                      <span className="w-3 h-3 rounded-full border-2 border-gray-600 border-t-primary-500 animate-spin" />
                      {t('deals.table.loading', 'Loading…')}
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && deals.length === 0 && (
                <tr>
                  <td colSpan={visibleCols} className="px-4 py-16 text-center">
                    <div className="mx-auto max-w-[420px] flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
                        <Inbox size={26} className="text-gray-600" />
                      </div>
                      <div className="text-[15px] font-semibold text-white">
                        {filter === 'all'
                          ? t('deals.empty.title', 'No deals yet')
                          : t('deals.empty.filtered_title', 'No deals match this filter')}
                      </div>
                      <div className="text-[12.5px] text-gray-500 leading-relaxed">
                        {filter === 'all'
                          ? t('deals.empty.body', 'Confirm an inquiry as won to start tracking it here. Stages, payments and fulfillment all flow through this page.')
                          : t('deals.empty.filtered_body', 'Try a different filter — or click All to see every deal.')}
                      </div>
                      {filter !== 'all' && (
                        <button
                          onClick={() => setFilter('all')}
                          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-primary-500 hover:bg-primary-400 text-dark-bg transition-colors"
                        >
                          {t('deals.empty.show_all', 'Show all deals')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {deals.map(d => {
                const payment = d.payment_status ? PAYMENT_META[d.payment_status] : null
                const stage = d.fulfillment_stage ? STAGE_META[d.fulfillment_stage] : null
                const progress = stageProgress(d.fulfillment_stage)
                const rel = relDue(d.next_task_due)
                const isOverdue = rel?.tone === 'text-red-400'
                const isExpanded = expandedRow === d.id

                // Avatar tinted by fulfillment stage color so a column of
                // rows reads as a quick color-coded summary. Mirrors the
                // LeadRow avatar pattern, but driven by fulfillment stage
                // rather than pipeline stage.
                const avatarColor = stage?.color ?? '#74c895'
                const avatarStyle: React.CSSProperties = {
                  background: `linear-gradient(135deg, ${avatarColor}55, ${avatarColor}15)`,
                  border: `1px solid ${avatarColor}40`,
                  color: '#fff',
                }

                return (
                  <React.Fragment key={d.id}>
                  <tr className={[
                    'group border-b border-dark-border/40 hover:bg-white/[0.025] transition-colors cursor-pointer',
                    isOverdue ? 'bg-red-500/[0.025]' : '',
                    isExpanded ? 'bg-white/[0.02]' : '',
                  ].join(' ')}>
                    {/* Deal / Customer */}
                    <td className="px-3 py-3 min-w-[260px]">
                      <div className="flex items-start gap-3">
                        <div
                          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[12.5px] font-bold tracking-tight shadow-inner"
                          style={avatarStyle}
                          aria-hidden
                        >
                          {avatarInitials(d.guest?.full_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              to={`/inquiries/${d.id}`}
                              className="font-semibold text-[14px] text-white hover:text-primary-300 transition-colors truncate"
                              onClick={e => e.stopPropagation()}
                            >
                              {d.guest?.full_name ?? '—'}
                            </Link>
                            <FreshnessBadge
                              createdAt={d.created_at}
                              lastContactedAt={d.last_contacted_at}
                              t={t as any}
                            />
                            {d.guest?.vip_level && d.guest.vip_level !== 'Standard' && (
                              <span
                                className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-300 bg-amber-500/10"
                                title={t('deals.row.vip_tooltip', 'VIP level on the guest profile')}
                              >
                                <Star size={9} className="fill-amber-300" />{d.guest.vip_level}
                              </span>
                            )}
                          </div>
                          {(d.guest?.company || d.property?.name) && (
                            <div className="text-[11.5px] text-gray-400 mt-0.5 flex items-center gap-1 truncate">
                              {d.guest?.company && <span className="truncate">{d.guest.company}</span>}
                              {d.guest?.company && d.property?.name && <span className="text-gray-600">·</span>}
                              {d.property?.name && <span className="text-gray-500 truncate">{d.property.name}</span>}
                            </div>
                          )}
                          {(d.guest?.email || d.guest?.phone || d.guest?.mobile) && (
                            <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 truncate">
                              {d.guest?.email && (
                                <span className="inline-flex items-center gap-1 truncate" title={d.guest.email}>
                                  <Mail size={10} className="opacity-60 flex-shrink-0" />
                                  <span className="truncate max-w-[180px]">{d.guest.email}</span>
                                </span>
                              )}
                              {(d.guest?.phone || d.guest?.mobile) && (
                                <>
                                  {d.guest?.email && <span className="text-gray-600">·</span>}
                                  <span className="inline-flex items-center gap-1" title={d.guest?.phone || d.guest?.mobile}>
                                    <Phone size={10} className="opacity-60 flex-shrink-0" />
                                    <span className="tabular-nums">{d.guest?.phone ?? d.guest?.mobile}</span>
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Product · Details */}
                    {dealFields.list.product_details && (
                      <td className="px-3 py-3 max-w-[220px]">
                        <div className="text-[12.5px] text-white font-medium truncate">{d.room_type_requested || d.inquiry_type || t('deals.row.no_product', '—')}</div>
                        {(d.num_rooms || d.event_pax) && (
                          <div className="text-[10.5px] text-gray-500 mt-0.5 truncate">
                            {d.num_rooms ? `${d.num_rooms} ${t('deals.row.rooms', 'rooms')}` : `${d.event_pax} ${t('deals.row.pax', 'pax')}`}
                          </div>
                        )}
                        {d.event_name && <div className="text-[10px] text-gray-600 truncate mt-0.5">{d.event_name}</div>}
                      </td>
                    )}

                    {/* Amount (right-aligned, emerald pill matches LeadRow) */}
                    {dealFields.list.amount && (
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-300 text-[13px] font-bold tabular-nums">
                          {currency(d.total_value)}
                        </div>
                        {d.paid_amount != null && d.payment_status === 'partial' && (
                          <div className="text-[10px] mt-0.5 text-purple-300 tabular-nums">{currency(d.paid_amount)} {t('deals.row.paid_lower', 'paid')}</div>
                        )}
                      </td>
                    )}

                    {/* Payment */}
                    {dealFields.list.payment && (
                      <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setOpenPaymentMenu(openPaymentMenu?.id === d.id ? null : { id: d.id, rect })
                          }}
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold border hover:brightness-110 transition ${payment?.bg ?? 'bg-white/[0.04]'} ${payment?.text ?? 'text-gray-400'}`}
                          style={payment ? { borderColor: 'currentColor', borderOpacity: 0.35 } as any : { borderColor: 'rgba(255,255,255,0.1)' }}
                        >
                          {payment?.label ?? t('deals.row.no_payment', 'Set status')}
                          <ChevronDown size={9} className="opacity-70" />
                        </button>
                      </td>
                    )}

                    {/* Fulfillment stage + progress bar */}
                    {dealFields.list.fulfillment && (
                      <td className="px-3 py-3 max-w-[220px]" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setOpenStageMenu(openStageMenu?.id === d.id ? null : { id: d.id, rect })
                          }}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold border hover:brightness-110 transition"
                          style={{ background: (stage?.color ?? '#666') + '20', color: stage?.color ?? '#a0a0a0', borderColor: (stage?.color ?? '#666') + '50' }}
                        >
                          {stage ? <><stage.icon size={9} /> {t(`deals.stages.${stage.key}`, stage.label)}</> : t('deals.row.set_stage', 'Set stage')}
                          <ChevronDown size={9} className="opacity-70" />
                        </button>
                        {/* Progress bar — taller and clearer than before so the
                          * pipeline position reads at a glance. */}
                        <div className="flex gap-0.5 mt-1.5 max-w-[160px]">
                          {progress.map((p, i) => (
                            <div
                              key={i}
                              className="h-1.5 flex-1 rounded-full transition-all"
                              style={{
                                background: p.filled ? p.stage.color : 'rgba(255,255,255,0.06)',
                                opacity: p.isCurrent ? 1 : (p.filled ? 0.7 : 1),
                                boxShadow: p.isCurrent ? `0 0 6px ${p.stage.color}80` : undefined,
                              }}
                              title={t(`deals.stages.${p.stage.key}`, p.stage.label)}
                            />
                          ))}
                        </div>
                      </td>
                    )}

                    {/* Next action */}
                    {dealFields.list.next_action && (
                      <td className="px-3 py-3 max-w-[200px]">
                        {d.next_task_type && !d.next_task_completed ? (
                          <div className="flex items-start gap-1.5">
                            {isOverdue
                              ? <AlertTriangle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                              : <CheckSquare size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />}
                            <div className="min-w-0">
                              <div className="text-[12px] text-gray-200 font-semibold truncate">{d.next_task_type}</div>
                              {d.next_task_due && rel && (
                                <div className={`text-[10.5px] font-semibold ${rel.tone}`}>{rel.text}</div>
                              )}
                            </div>
                          </div>
                        ) : d.next_task_completed ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/80">
                            <CheckCircle2 size={11} /> {t('deals.row.task_done', 'Task complete')}
                          </span>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>
                    )}

                    {/* Due date + relative */}
                    {dealFields.list.due_date && (
                      <td className="px-3 py-3 whitespace-nowrap">
                        {d.next_task_due ? (
                          <>
                            <div className="text-[12px] text-gray-200 font-medium tabular-nums">{fmtDate(d.next_task_due)}</div>
                            {rel && <div className={`text-[10.5px] ${rel.tone} font-semibold mt-0.5`}>{rel.text}</div>}
                          </>
                        ) : <span className="text-xs text-gray-700">—</span>}
                      </td>
                    )}

                    {/* Owner */}
                    {dealFields.list.owner && (
                      <td className="px-3 py-3 whitespace-nowrap">
                        {d.assigned_to ? (
                          <div className="flex items-center gap-2 max-w-[180px]">
                            <div
                              className="flex-shrink-0 w-7 h-7 rounded-full bg-white/[0.06] border border-white/15 text-gray-200 flex items-center justify-center text-[10.5px] font-bold"
                              aria-hidden
                            >
                              {avatarInitials(d.assigned_to)}
                            </div>
                            <span className="text-[12px] text-gray-200 font-semibold truncate">{d.assigned_to}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 max-w-[180px]">
                            <div className="flex-shrink-0 w-7 h-7 rounded-full border border-dashed border-amber-500/30 text-amber-400 bg-amber-500/[0.06] flex items-center justify-center text-[10.5px] font-bold">?</div>
                            <span className="text-[12px] text-amber-400 font-semibold">{t('deals.row.unassigned', 'Unassigned')}</span>
                          </div>
                        )}
                      </td>
                    )}

                    {/* Trailing actions — expand chevron + Open link + kebab */}
                    <td className="px-2 py-3 w-16">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedRow(isExpanded ? null : d.id) }}
                          title={isExpanded ? t('deals.row.collapse', 'Collapse') : t('deals.row.expand', 'Expand')}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-colors"
                        >
                          <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        <Link
                          to={`/inquiries/${d.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity bg-primary-500 hover:bg-primary-400 text-dark-bg text-[11px] font-bold px-2.5 py-1 rounded-md"
                        >
                          {t('deals.row.open', 'Open')}
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-colors opacity-70 group-hover:opacity-100"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* ─── Expanded panel ──────────────────────────────────
                    * Same 3-card section pattern as the Leads expanded
                    * row, but the middle card is "Deal & Fulfillment"
                    * instead of "Opportunity" -- driven by the
                    * post-sale data this page surfaces (amount, paid,
                    * stage, started/completed). */}
                  {isExpanded && (
                    <tr className="bg-dark-bg/50 border-b border-dark-border/50">
                      <td colSpan={visibleCols} className="px-5 py-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                          {/* CUSTOMER */}
                          <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.03] p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="inline-flex items-center gap-2">
                                <div className="w-6 h-6 rounded-md bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
                                  <Users size={11} className="text-sky-400" strokeWidth={2.5} />
                                </div>
                                <div className="text-[10.5px] uppercase tracking-wider text-sky-300/80 font-bold">
                                  {t('deals.expanded.customer', 'Customer')}
                                </div>
                              </div>
                              {d.guest?.id && (
                                <Link
                                  to={`/guests/${d.guest.id}`}
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary-300 hover:text-primary-200 bg-primary-500/[0.08] hover:bg-primary-500/[0.15] border border-primary-500/25 rounded-md px-2 py-1 transition-colors"
                                >
                                  {t('deals.expanded.view_full_customer', 'View full customer')}
                                </Link>
                              )}
                            </div>
                            {d.guest?.id ? (
                              <>
                                {/* Lifetime stat chips */}
                                {(d.guest.stays_count > 0 || d.guest.total_spent > 0 || d.guest.vip_level) && (
                                  <div className="flex items-center flex-wrap gap-1.5 mb-3">
                                    {d.guest.vip_level && d.guest.vip_level !== 'Standard' && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                        <Star size={9} className="fill-amber-300" /> {d.guest.vip_level}
                                      </span>
                                    )}
                                    {d.guest.stays_count > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-1 rounded-md bg-white/[0.04] border border-white/10 text-gray-200">
                                        {d.guest.stays_count} {d.guest.stays_count === 1 ? t('deals.expanded.stay', 'stay') : t('deals.expanded.stays', 'stays')}
                                      </span>
                                    )}
                                    {d.guest.total_spent > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-1 rounded-md bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-300 tabular-nums">
                                        {currency(d.guest.total_spent)} {t('deals.expanded.ltv', 'LTV')}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="space-y-2.5 text-[12px]">
                                  {d.guest.email && (
                                    <div>
                                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">
                                        <span className="w-1 h-1 rounded-full bg-sky-400/60" />
                                        {t('deals.expanded.email', 'Email')}
                                      </div>
                                      <div className="text-gray-200 truncate">{d.guest.email}</div>
                                    </div>
                                  )}
                                  {(d.guest.phone || d.guest.mobile) && (
                                    <div>
                                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">
                                        <span className="w-1 h-1 rounded-full bg-sky-400/60" />
                                        {t('deals.expanded.phone', 'Phone')}
                                      </div>
                                      <div className="text-gray-200 tabular-nums">{d.guest.phone ?? d.guest.mobile}</div>
                                    </div>
                                  )}
                                  {d.guest.company && (
                                    <div>
                                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">
                                        <span className="w-1 h-1 rounded-full bg-sky-400/60" />
                                        {t('deals.expanded.company', 'Company')}
                                      </div>
                                      <div className="text-gray-200 truncate">{d.guest.company}</div>
                                    </div>
                                  )}
                                  {d.guest.nationality && (
                                    <div>
                                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">
                                        <span className="w-1 h-1 rounded-full bg-sky-400/60" />
                                        {t('deals.expanded.nationality', 'Nationality')}
                                      </div>
                                      <div className="text-gray-200">{d.guest.nationality}</div>
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="text-gray-600 italic text-[12px]">{t('deals.expanded.no_guest_linked', 'No guest linked')}</div>
                            )}
                          </div>

                          {/* DEAL & FULFILLMENT */}
                          <div className="rounded-xl border border-primary-500/15 bg-primary-500/[0.025] p-4">
                            <div className="inline-flex items-center gap-2 mb-3">
                              <div className="w-6 h-6 rounded-md bg-primary-500/15 border border-primary-500/25 flex items-center justify-center">
                                <TrendingUp size={11} className="text-primary-300" strokeWidth={2.5} />
                              </div>
                              <div className="text-[10.5px] uppercase tracking-wider text-primary-300/80 font-bold">
                                {t('deals.expanded.deal_fulfillment', 'Deal & Fulfillment')}
                              </div>
                            </div>

                            {/* AI Brief — surfaces ai_brief / ai_suggested_action
                              * when present, identical surface to the Leads
                              * expanded card. Hide entirely on legacy rows. */}
                            {(d.ai_brief || d.ai_suggested_action) && (
                              <div className="rounded-lg border border-primary-500/25 bg-gradient-to-br from-primary-500/[0.08] to-transparent p-3 mb-3">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-300">
                                    <Sparkles size={11} />
                                    {t('deals.expanded.ai_brief', 'AI Brief')}
                                  </div>
                                  {(d.ai_going_cold_risk ?? '').toLowerCase() === 'high' && (
                                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-300">
                                      <Flame size={9} /> {t('deals.expanded.going_cold', 'Going cold')}
                                    </span>
                                  )}
                                </div>
                                {d.ai_suggested_action && (
                                  <div className="text-[12px] italic text-primary-200/95 mb-2 leading-snug">
                                    {d.ai_suggested_action}
                                  </div>
                                )}
                                {d.ai_brief && (
                                  <div className="text-[11.5px] text-gray-300 leading-relaxed line-clamp-3">
                                    {d.ai_brief}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Money breakdown — top of the column because it's
                              * the post-sale information that matters most. */}
                            <div className="grid grid-cols-3 gap-2 mb-3">
                              <div className="rounded-md bg-white/[0.03] border border-white/[0.06] p-2">
                                <div className="text-[9.5px] uppercase tracking-wider text-gray-500 font-bold">{t('deals.expanded.total', 'Total')}</div>
                                <div className="text-[13px] text-white font-bold tabular-nums mt-1">{currency(d.total_value)}</div>
                              </div>
                              <div className="rounded-md bg-emerald-500/[0.06] border border-emerald-500/20 p-2">
                                <div className="text-[9.5px] uppercase tracking-wider text-emerald-400/80 font-bold">{t('deals.expanded.paid', 'Paid')}</div>
                                <div className="text-[13px] text-emerald-300 font-bold tabular-nums mt-1">{currency(d.paid_amount ?? 0)}</div>
                              </div>
                              <div className="rounded-md bg-amber-500/[0.06] border border-amber-500/20 p-2">
                                <div className="text-[9.5px] uppercase tracking-wider text-amber-400/80 font-bold">{t('deals.expanded.balance', 'Balance')}</div>
                                <div className="text-[13px] text-amber-300 font-bold tabular-nums mt-1">
                                  {currency(Math.max(0, Number(d.total_value || 0) - Number(d.paid_amount || 0)))}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2.5 text-[12px]">
                              {(d.room_type_requested || d.inquiry_type) && (
                                <div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">
                                    <span className="w-1 h-1 rounded-full bg-primary-400/60" />
                                    {t('deals.expanded.item', 'Item')}
                                  </div>
                                  <div className="text-gray-200">{d.room_type_requested ?? d.inquiry_type}</div>
                                </div>
                              )}
                              {(d.num_rooms || d.event_pax) && (
                                <div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">
                                    <span className="w-1 h-1 rounded-full bg-primary-400/60" />
                                    {t('deals.expanded.quantity', 'Quantity')}
                                  </div>
                                  <div className="text-gray-200">
                                    {d.num_rooms ? `${d.num_rooms} ${t('deals.row.rooms', 'rooms')}` : `${d.event_pax} ${t('deals.row.pax', 'pax')}`}
                                  </div>
                                </div>
                              )}
                              {d.property?.name && (
                                <div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">
                                    <span className="w-1 h-1 rounded-full bg-primary-400/60" />
                                    {t('deals.expanded.property', 'Property')}
                                  </div>
                                  <div className="text-gray-200">{d.property.name}</div>
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">
                                  <span className="w-1 h-1 rounded-full bg-primary-400/60" />
                                  {t('deals.expanded.fulfillment_stage', 'Stage')}
                                </div>
                                <div
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold border"
                                  style={{ background: (stage?.color ?? '#666') + '20', color: stage?.color ?? '#a0a0a0', borderColor: (stage?.color ?? '#666') + '50' }}
                                >
                                  {stage ? <><stage.icon size={9} /> {t(`deals.stages.${stage.key}`, stage.label)}</> : t('deals.row.set_stage', 'Set stage')}
                                </div>
                              </div>
                              {d.source && (
                                <div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">
                                    <span className="w-1 h-1 rounded-full bg-primary-400/60" />
                                    {t('deals.expanded.source', 'Source')}
                                  </div>
                                  <div className="text-gray-200 truncate">{d.source}</div>
                                </div>
                              )}
                              {d.fulfillment_started_at && (
                                <div className="pt-1 text-[11px] text-gray-500">
                                  {t('deals.expanded.started', 'Started')}:{' '}
                                  <span className="text-gray-300">{fmtDate(d.fulfillment_started_at)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* NEXT ACTION + NOTES */}
                          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.025] p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="inline-flex items-center gap-2">
                                <div className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                                  <CheckSquare size={11} className="text-emerald-400" strokeWidth={2.5} />
                                </div>
                                <div className="text-[10.5px] uppercase tracking-wider text-emerald-300/80 font-bold">
                                  {t('deals.expanded.next_action', 'Next action')}
                                </div>
                              </div>
                              <Link
                                to={`/inquiries/${d.id}`}
                                onClick={e => e.stopPropagation()}
                                className="text-[10.5px] font-semibold text-emerald-300 hover:text-emerald-200 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.15] border border-emerald-500/25 rounded-md px-2 py-1 transition-colors inline-flex items-center gap-1"
                              >
                                <Eye size={11} /> {t('deals.expanded.open_detail', 'Open full detail')}
                              </Link>
                            </div>

                            {d.next_task_type && !d.next_task_completed ? (
                              <div className={`rounded-lg border p-3 ${isOverdue ? 'border-red-500/40 bg-red-500/5' : 'border-emerald-500/25 bg-dark-surface2/60'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <CheckSquare size={12} className={isOverdue ? 'text-red-400' : 'text-emerald-400'} />
                                  <span className="text-[12.5px] text-white font-semibold truncate">{d.next_task_type}</span>
                                </div>
                                {d.next_task_due && (
                                  <div className={`text-[11px] font-semibold ${isOverdue ? 'text-red-400' : 'text-gray-400'}`}>
                                    {t('deals.expanded.due', 'Due')} {fmtDate(d.next_task_due)} {rel && `· ${rel.text}`}
                                  </div>
                                )}
                                {d.next_task_notes && (
                                  <div className="text-[11px] text-gray-500 mt-1 italic line-clamp-2 leading-snug">
                                    {d.next_task_notes}
                                  </div>
                                )}
                              </div>
                            ) : d.next_task_completed ? (
                              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 inline-flex items-center gap-2 text-[12px] text-emerald-300 font-semibold">
                                <CheckCircle2 size={13} /> {t('deals.expanded.task_done', 'Task complete')}
                              </div>
                            ) : (
                              <div className="text-[11.5px] text-gray-600 italic">
                                {t('deals.expanded.no_task', 'No task scheduled. Open the deal to add one.')}
                              </div>
                            )}

                            {d.notes && (
                              <div className="mt-4 pt-4 border-t border-white/[0.05]">
                                <div className="flex items-center gap-1.5 mb-2">
                                  <FileText size={11} className="text-emerald-400/70" />
                                  <div className="text-[10.5px] uppercase tracking-wider text-emerald-300/80 font-bold">
                                    {t('deals.expanded.notes', 'Notes')}
                                  </div>
                                </div>
                                <div className="text-[12px] text-gray-300 leading-relaxed whitespace-pre-wrap line-clamp-6">
                                  {d.notes}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
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
