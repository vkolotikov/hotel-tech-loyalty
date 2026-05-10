import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings, triggerExport } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import { Plus, Search, ChevronLeft, ChevronRight, CheckCircle2, Download, Filter, AlertCircle, Sparkles, Loader2, List as ListIcon, LayoutGrid, MoreHorizontal, ChevronDown, Trophy, XCircle, Eye, Clock, Calendar as CalendarIcon, X as XIcon } from 'lucide-react'
import { ContactActions } from '../components/ContactActions'
import { DailyOpsBar } from '../components/DailyOpsBar'
import { PipelineInsights } from '../components/PipelineInsights'
import { InquiryQuickActions, InquiryTouchSummary } from '../components/InquiryQuickActions'
import { BrandBadge } from '../components/BrandBadge'
import { SavedViews } from '../components/SavedViews'
import { CustomFieldsForm } from '../components/CustomFields'

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-blue-500/20 text-blue-400',
  Responded: 'bg-indigo-500/20 text-indigo-400',
  'Site Visit': 'bg-purple-500/20 text-purple-400',
  'Proposal Sent': 'bg-yellow-500/20 text-yellow-400',
  Negotiating: 'bg-amber-500/20 text-amber-400',
  Tentative: 'bg-orange-500/20 text-orange-400',
  Confirmed: 'bg-green-500/20 text-green-400',
  Lost: 'bg-red-500/20 text-red-400',
}
const PRIORITY_COLORS: Record<string, string> = {
  Low: 'text-t-secondary', Medium: 'text-blue-400', High: 'text-red-400',
}

// System-generated sources (written by the chatbot widget and the
// booking widget failure handler) get coloured pills so staff can spot
// them at a glance against the manual-entry sources.
const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  chatbot:                 { label: 'Chatbot',         cls: 'bg-purple-500/15 text-purple-300' },
  booking_widget:          { label: 'Booking Widget',  cls: 'bg-cyan-500/15 text-cyan-300' },
  booking_widget_failed:   { label: 'Failed Booking',  cls: 'bg-red-500/15 text-red-300' },
}
const SYSTEM_SOURCES = Object.keys(SOURCE_BADGES)

const MICE_TYPES = ['Event/MICE', 'Conference', 'Wedding']

const EMPTY_FORM = {
  guest_id: '', property_id: '', inquiry_type: '', check_in: '', check_out: '',
  num_rooms: '', num_adults: '', num_children: '', room_type_requested: '',
  rate_offered: '', total_value: '', status: 'New', priority: 'Medium',
  assigned_to: '', source: '', special_requests: '', notes: '',
  event_name: '', event_pax: '', function_space: '', catering_required: false, av_required: false,
  // CRM Phase 7 — admin-defined custom fields, posted as a sub-object.
  custom_data: {} as Record<string, any>,
}

export function Inquiries() {
  const qc = useQueryClient()
  const settings = useSettings()
  // Field-visibility config — admin toggles in Settings → Pipeline Layout
  // pick which Add Inquiry fields and which list columns are shown.
  // useSettings deep-merges with defaults so missing keys are safe.
  const fieldCfg = settings.inquiry_fields
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [inquiryType, setInquiryType] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [source, setSource] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [exporting, setExporting] = useState(false)
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState('desc')
  const [showCapture, setShowCapture] = useState(false)
  const [captureText, setCaptureText] = useState('')
  const [captureLoading, setCaptureLoading] = useState(false)
  const [captureResult, setCaptureResult] = useState<any>(null)
  const [captureCreating, setCaptureCreating] = useState(false)
  // List vs Pipeline view — pipeline is a status-column kanban with
  // drag-to-change-status, list is the sortable table.
  const [view, setView] = useState<'list' | 'pipeline'>('list')
  // Inline open menus (status / action) — keyed by inquiry id so only one
  // is open at a time on the page. The anchor rect is captured on click
  // so we can render the menu via position:fixed (escaping the table's
  // overflow:hidden, which was clipping the dropdown out of view).
  const [openMenu, setOpenMenu] = useState<{ id: number; type: 'status' | 'action' | 'priority'; anchor: DOMRect } | null>(null)
  // Simplified Add Inquiry form — advanced fields are collapsed by default.
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false)
  // Drag state for kanban — track the dragged inquiry id.
  const [dragging, setDragging] = useState<number | null>(null)
  // Inline task editor — open the modal for a specific inquiry id.
  const [taskFor, setTaskFor] = useState<{ id: number; type: string; due: string; notes: string } | null>(null)
  // Pipeline stage grouping — gives staff a quick way to think about the
  // pipeline as Leads (just-arrived) vs Active Deals (being worked) vs
  // Closed (won/lost). Pure client-side slice so we don't touch the API.
  const [stageGroup, setStageGroup] = useState<'all' | 'leads' | 'deals' | 'closed'>('all')
  // Daily-ops drilldown focus — clicking an ops tile opens a panel
  // with the matching task list inline.
  const [dailyFocus, setDailyFocus] = useState<'' | 'overdue' | 'today' | 'soon' | 'new_leads'>('')
  // Bulk selection — checkboxes on the list view.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  // Global Escape closes any open modal/menu. Handles all three modals
  // and both row dropdowns in one place so we don't miss any. Click-
  // away on dropdowns: when the user clicks anywhere outside a
  // .menu-container, the inline menu closes — fixes the audit's
  // "dropdown stays open on scroll/focus loss" issue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (taskFor)        setTaskFor(null)
      else if (showCreate) setShowCreate(false)
      else if (showCapture) setShowCapture(false)
      else if (openMenu)   setOpenMenu(null)
      else if (dailyFocus) setDailyFocus('')
    }
    const onClick = (e: MouseEvent) => {
      if (!openMenu) return
      const t = e.target as Element | null
      if (t && t.closest && !t.closest('[data-menu-root]')) setOpenMenu(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [taskFor, showCreate, showCapture, openMenu, dailyFocus])

  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => api.get('/v1/admin/properties', { params: { per_page: 200 } }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const properties: any[] = propertiesData?.properties ?? propertiesData?.data ?? (Array.isArray(propertiesData) ? propertiesData : [])

  const params: any = { page, per_page: 25, sort, dir }
  if (search) params.search = search
  if (status) params.status = status
  if (priority) params.priority = priority
  if (inquiryType) params.inquiry_type = inquiryType
  if (propertyId) params.property_id = propertyId
  if (assignedTo) params.assigned_to = assignedTo
  if (source) params.source = source
  if (taskDue) params.task_due = taskDue
  if (activeOnly) params.active_only = 1

  const { data, isLoading } = useQuery({
    queryKey: ['inquiries', params],
    queryFn: () => api.get('/v1/admin/inquiries', { params }).then(r => r.data),
  })

  // Daily ops snapshot — refreshes every 2 min so an overdue task
  // popping up doesn't require a manual reload.
  const { data: today } = useQuery<any>({
    queryKey: ['inquiries-today'],
    queryFn: () => api.get('/v1/admin/inquiries/today').then(r => r.data),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/inquiries', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inquiries'] }); setShowCreate(false); setForm({ ...EMPTY_FORM }); toast.success('Inquiry created') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const completeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/inquiries/${id}/complete-task`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inquiries'] }); toast.success('Task completed') },
  })

  // Quick status change — fires from the inline status-pill dropdown and
  // from the kanban drag-drop. Setting status=Confirmed auto-creates a
  // Reservation server-side (existing logic in InquiryController), so the
  // "Mark Won" action piggybacks on the same code path.
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.put(`/v1/admin/inquiries/${id}`, { status }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      qc.invalidateQueries({ queryKey: ['inquiries-today'] })
      qc.invalidateQueries({ queryKey: ['inquiries-insights'] })
      toast.success(
        vars.status === 'Confirmed' ? 'Marked as Won — reservation created'
        : vars.status === 'Lost'    ? 'Marked as Lost'
        : `Status → ${vars.status}`
      )
      setOpenMenu(null)
      setDragging(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Status change failed'),
  })

  // Phase 6 — inline priority edit, mirrors statusMutation. Used by the
  // priority chip popover on each row.
  const priorityMutation = useMutation({
    mutationFn: ({ id, priority }: { id: number; priority: string }) =>
      api.put(`/v1/admin/inquiries/${id}`, { priority }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      toast.success(`Priority → ${vars.priority}`)
      setOpenMenu(null)
    },
    onError: () => toast.error('Priority change failed'),
  })

  // Task save — sets/clears next_task_* on the inquiry. Submitting an
  // empty type clears the task (back-end accepts nullable).
  const taskMutation = useMutation({
    mutationFn: ({ id, type, due, notes }: { id: number; type: string | null; due: string | null; notes: string | null }) =>
      api.put(`/v1/admin/inquiries/${id}`, {
        next_task_type: type || null,
        next_task_due: due || null,
        next_task_notes: notes || null,
        next_task_completed: false,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      toast.success('Task saved')
      setTaskFor(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Task save failed'),
  })

  // Bulk action runner — same shape as the bookings bulk path so future
  // surfaces can copy it. Confirms destructive actions inline.
  const runBulk = async (action: string, value?: string, confirmMsg?: string) => {
    if (selected.size === 0) return
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBulkBusy(true)
    try {
      const { data: res } = await api.post('/v1/admin/inquiries/bulk', {
        ids: Array.from(selected), action, value,
      })
      toast.success(res.message || 'Updated')
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      qc.invalidateQueries({ queryKey: ['inquiries-today'] })
      qc.invalidateQueries({ queryKey: ['inquiries-insights'] })
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Bulk action failed')
    } finally { setBulkBusy(false) }
  }

  const handleExport = async () => {
    setExporting(true)
    try { await triggerExport('/v1/admin/inquiries/export', params) }
    catch { toast.error('Export failed') } finally { setExporting(false) }
  }

  const allInquiries = data?.data ?? []
  // Laravel paginate() returns total/last_page/current_page at the
  // TOP level of the response, not under a `meta` key. The previous
  // `data?.meta?.total` always returned undefined and the header
  // counted "0 total" even with rows present.
  const meta = {
    total: data?.total ?? 0,
    current_page: data?.current_page ?? 1,
    last_page: data?.last_page ?? 1,
  }

  // Stage-group classifier. The status names below match what the
  // backend ships in settings.inquiry_statuses; if a tenant has renamed
  // one of these it falls into the implicit "deals" middle bucket.
  const STAGE_GROUPS: Record<string, string[]> = {
    leads:  ['New', 'Responded'],
    deals:  ['Site Visit', 'Proposal Sent', 'Negotiating', 'Tentative'],
    closed: ['Confirmed', 'Lost'],
  }
  const inquiries = stageGroup === 'all'
    ? allInquiries
    : allInquiries.filter((i: any) => (STAGE_GROUPS[stageGroup] || []).includes(i.status))

  const stageCounts = {
    all:    allInquiries.length,
    leads:  allInquiries.filter((i: any) => STAGE_GROUPS.leads.includes(i.status)).length,
    deals:  allInquiries.filter((i: any) => STAGE_GROUPS.deals.includes(i.status)).length,
    closed: allInquiries.filter((i: any) => STAGE_GROUPS.closed.includes(i.status)).length,
  }

  const hasFilters = status || priority || inquiryType || propertyId || assignedTo || source || taskDue || activeOnly

  const toggleSort = (col: string) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setDir('desc') }
  }

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary cursor-pointer hover:text-gray-300 select-none whitespace-nowrap" onClick={() => toggleSort(col)}>
      {label} {sort === col ? (dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  const showMice = MICE_TYPES.includes(form.inquiry_type)
  const filterSel = 'bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const inp = 'w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Sales Pipeline</h1>
          <p className="text-xs md:text-sm text-t-secondary mt-0.5">
            {meta.total ?? 0} total · <span className="text-blue-400">{stageCounts.leads} leads</span> · <span className="text-amber-400">{stageCounts.deals} active deals</span> · <span className="text-emerald-400">{stageCounts.closed} closed</span>
          </p>
        </div>
        {/* Action buttons wrap on mobile, condense labels at narrow widths */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setShowCapture(true); setCaptureResult(null); setCaptureText('') }} className="flex items-center gap-1.5 bg-purple-500/15 border border-purple-500/30 hover:border-purple-400 text-purple-400 hover:text-purple-300 font-medium text-xs md:text-sm px-2.5 md:px-3 py-2 rounded-lg transition-colors">
            <Sparkles size={14} /> <span className="hidden sm:inline">AI Capture</span><span className="sm:hidden">AI</span>
          </button>
          <button onClick={handleExport} disabled={exporting} className="flex items-center gap-1.5 bg-dark-surface border border-dark-border hover:border-primary-500 text-t-secondary hover:text-white font-medium text-xs md:text-sm px-2.5 md:px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            <Download size={14} /> <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary-600 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold hover:bg-primary-700 transition-colors">
            <Plus size={15} /> <span className="hidden sm:inline">Add Inquiry</span><span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Today snapshot — the morning-of view: what's overdue, what's
          due today, what's coming up, and the freshest leads. Click a
          tile to expand the matching list inline.

          CRM Phase 6 polish: when every counter is zero, collapse the
          full bar to a single quiet status line. The four-tile grid
          eats vertical real estate when there's literally nothing on
          fire. */}
      {today && (() => {
        const totalToday = (today.overdue?.count ?? 0)
          + (today.today?.count ?? 0)
          + (today.soon?.count ?? 0)
          + (today.new_leads?.count ?? 0)
        if (totalToday === 0) {
          return (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2.5 flex items-center gap-3 text-xs">
              <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
              <span className="text-emerald-300 font-bold uppercase tracking-wider text-[10px]">Today</span>
              <span className="text-gray-300">All caught up — no overdue, no tasks due today, no new leads in the last 24h.</span>
              <span className="ml-auto text-[10px] text-gray-600">{today.date}</span>
            </div>
          )
        }
        return (
          <DailyOpsBar
            title="Today"
            hint={today.date}
            tiles={[
              { key: 'overdue',   label: 'Overdue',   value: today.overdue?.count ?? 0,   sub: today.overdue?.count ? 'Click to view' : 'All caught up',         tone: (today.overdue?.count ?? 0) > 0 ? 'red' : 'gray', icon: <AlertCircle size={12} />, active: dailyFocus === 'overdue',   onClick: () => setDailyFocus(dailyFocus === 'overdue' ? '' : 'overdue') },
              { key: 'today',     label: 'Due Today', value: today.today?.count ?? 0,     sub: today.today?.count ? 'Tasks scheduled' : 'Nothing due today',     tone: 'amber',  icon: <Clock size={12} />,         active: dailyFocus === 'today',     onClick: () => setDailyFocus(dailyFocus === 'today' ? '' : 'today') },
              { key: 'soon',      label: 'Due Soon',  value: today.soon?.count ?? 0,      sub: 'Next 3 days',                                                    tone: 'blue',   icon: <CalendarIcon size={12} />,  active: dailyFocus === 'soon',      onClick: () => setDailyFocus(dailyFocus === 'soon' ? '' : 'soon') },
              { key: 'new_leads', label: 'New Leads', value: today.new_leads?.count ?? 0, sub: 'Last 24 h',                                                      tone: 'emerald', icon: <Sparkles size={12} />,     active: dailyFocus === 'new_leads', onClick: () => setDailyFocus(dailyFocus === 'new_leads' ? '' : 'new_leads') },
            ]}
          />
        )
      })()}

      <PipelineInsights currencySymbol={settings.currency_symbol} />

      {today && dailyFocus && (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(18,24,22,0.96)' }}>
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {dailyFocus === 'overdue' ? 'Overdue Tasks' : dailyFocus === 'today' ? "Today's Tasks" : dailyFocus === 'soon' ? 'Due Soon (3 days)' : 'New Leads (24 h)'}
            </span>
            <button onClick={() => setDailyFocus('')} className="text-[10px] text-gray-500 hover:text-white">Close</button>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {(() => {
              const items = dailyFocus === 'new_leads'
                ? (today.new_leads?.leads ?? [])
                : (today[dailyFocus]?.tasks ?? [])
              if (items.length === 0) {
                return <div className="px-4 py-6 text-center text-xs text-gray-600">Nothing here right now.</div>
              }
              return items.map((inq: any) => (
                <div key={inq.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-sm">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-white font-semibold truncate">{inq.guest?.full_name ?? '—'}</span>
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
                      <button onClick={() => completeMutation.mutate(inq.id)} title="Mark task done"
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

      {/* Stage-group + view toggles. Stage groups slice the pipeline into
          Leads / Active Deals / Closed so staff can focus on one bucket
          without composing a multi-status filter manually. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex p-1 rounded-2xl gap-0.5" style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { v: 'all',    label: 'All',          tone: 'from-gray-500 to-gray-600' },
            { v: 'leads',  label: 'Leads',        tone: 'from-blue-500 to-indigo-500' },
            { v: 'deals',  label: 'Active Deals', tone: 'from-amber-500 to-orange-500' },
            { v: 'closed', label: 'Closed',       tone: 'from-emerald-500 to-teal-500' },
          ] as const).map(({ v, label, tone }) => (
            <button key={v} onClick={() => setStageGroup(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 ${stageGroup === v ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
              style={stageGroup === v ? { backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))`, boxShadow: '0 6px 14px rgba(0,0,0,0.2)' } : {}}>
              <span className={stageGroup === v ? `bg-gradient-to-r ${tone} bg-clip-text text-transparent` : ''}>{label}</span>
              <span className="text-[10px] tabular-nums opacity-70">{stageCounts[v]}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex p-1 rounded-2xl" style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { v: 'list', icon: ListIcon, label: 'List' },
            { v: 'pipeline', icon: LayoutGrid, label: 'Pipeline' },
          ] as const).map(({ v, icon: Icon, label }) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 ${view === v ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
              style={view === v ? { background: 'linear-gradient(135deg, #74c895, #5ab4b2)', boxShadow: '0 6px 14px rgba(116,200,149,0.2)' } : {}}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Saved views — pinned filter combos for the current user. */}
      <SavedViews
        page="inquiries"
        currentFilters={{ status, priority, inquiryType, propertyId, assignedTo, source, taskDue, activeOnly }}
        hasActiveFilters={!!hasFilters}
        onApply={(f: any) => {
          setStatus(f.status ?? '')
          setPriority(f.priority ?? '')
          setInquiryType(f.inquiryType ?? '')
          setPropertyId(f.propertyId ?? '')
          setAssignedTo(f.assignedTo ?? '')
          setSource(f.source ?? '')
          setTaskDue(f.taskDue ?? '')
          setActiveOnly(!!f.activeOnly)
          setPage(1)
        }}
      />

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search guest, company..." className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          {view === 'list' && (
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">All Statuses</option>
              {settings.inquiry_statuses.map(s => <option key={s}>{s}</option>)}
            </select>
          )}
          <button onClick={() => setShowFilters(f => !f)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${hasFilters ? 'border-primary-500 text-primary-400' : 'border-dark-border text-t-secondary hover:text-white'}`}>
            <Filter size={14} /> Filters {hasFilters ? '●' : ''}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 items-center">
            <select value={priority} onChange={e => { setPriority(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">All Priorities</option>
              {settings.priorities.map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={inquiryType} onChange={e => { setInquiryType(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">All Types</option>
              {settings.inquiry_types.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={propertyId} onChange={e => { setPropertyId(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">All Properties</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={assignedTo} onChange={e => { setAssignedTo(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">All Owners</option>
              {settings.lead_owners.map(o => <option key={o}>{o}</option>)}
            </select>
            <select value={source} onChange={e => { setSource(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">All Sources</option>
              {SYSTEM_SOURCES.map(s => <option key={s} value={s}>{SOURCE_BADGES[s].label}</option>)}
              {settings.lead_sources.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={taskDue} onChange={e => { setTaskDue(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">Any Task</option>
              <option value="today">Due Today</option>
              <option value="overdue">Overdue</option>
              <option value="soon">Due Soon (3d)</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-t-secondary cursor-pointer">
              <input type="checkbox" checked={activeOnly} onChange={e => { setActiveOnly(e.target.checked); setPage(1) }} className="accent-primary-500" />
              Active only
            </label>
            {hasFilters && <button onClick={() => { setStatus(''); setPriority(''); setInquiryType(''); setPropertyId(''); setAssignedTo(''); setSource(''); setTaskDue(''); setActiveOnly(false); setPage(1) }} className="text-xs text-[#636366] hover:text-white px-2">Clear</button>}
          </div>
        )}
      </div>

      {/* Table — list view */}
      {view === 'list' && (
      <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border">
                {fieldCfg.list.bulk_select && (
                  <th className="text-center px-3 py-3 w-8">
                    <input type="checkbox"
                      checked={inquiries.length > 0 && inquiries.every((i: any) => selected.has(i.id))}
                      onChange={() => setSelected(prev => {
                        const next = new Set(prev)
                        const allOn = inquiries.length > 0 && inquiries.every((i: any) => prev.has(i.id))
                        if (allOn) inquiries.forEach((i: any) => next.delete(i.id))
                        else       inquiries.forEach((i: any) => next.add(i.id))
                        return next
                      })}
                      className="rounded border-white/20 bg-white/[0.04] cursor-pointer" />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Guest</th>
                {fieldCfg.list.stay && <SortHeader col="check_in" label="Stay" />}
                {fieldCfg.list.value && <SortHeader col="total_value" label="Value" />}
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Status</th>
                {fieldCfg.list.owner && <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Owner</th>}
                {fieldCfg.list.touches && <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Touches</th>}
                {fieldCfg.list.next_task && <SortHeader col="next_task_due" label="Next Task" />}
                <th className="text-right px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Actions</th>
                <th className="px-2 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="px-4 py-8 text-center text-[#636366]">Loading...</td></tr>}
              {!isLoading && inquiries.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-[#636366]">No inquiries found</td></tr>}
              {inquiries.map((inq: any) => {
                const isOverdue = inq.next_task_due && !inq.next_task_completed && new Date(inq.next_task_due) < new Date()
                const nights = inq.check_in && inq.check_out
                  ? Math.max(0, Math.round((new Date(inq.check_out).getTime() - new Date(inq.check_in).getTime()) / 86400000))
                  : null
                const fmtShort = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                return (
                  <tr key={inq.id} className={`border-b border-dark-border/50 hover:bg-dark-surface2 transition-colors ${isOverdue ? 'bg-red-500/5' : ''} ${selected.has(inq.id) ? 'bg-primary-500/[0.04]' : ''}`}>
                    {fieldCfg.list.bulk_select && (
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" checked={selected.has(inq.id)}
                          onChange={() => setSelected(prev => {
                            const next = new Set(prev); next.has(inq.id) ? next.delete(inq.id) : next.add(inq.id); return next
                          })}
                          className="rounded border-white/20 bg-white/[0.04] cursor-pointer" />
                      </td>
                    )}

                    {/* Guest cell — name, company, property + source pills,
                        contact links. Heavy lifting in this cell so the
                        rest of the row stays narrow. CRM Phase 1: name
                        is a Link to the new lead detail page. */}
                    <td className="px-4 py-3 max-w-[260px]">
                      <Link
                        to={`/inquiries/${inq.id}`}
                        className="font-semibold text-white hover:text-accent truncate block transition-colors"
                      >
                        {inq.guest?.full_name ?? '—'}
                      </Link>
                      {inq.guest?.company && <div className="text-[11px] text-gray-500 truncate">{inq.guest.company}</div>}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {inq.property?.name && (
                          <span className="text-[10px] text-gray-500">{inq.property.name}</span>
                        )}
                        {inq.inquiry_type && (
                          <span className="text-[10px] text-gray-600">· {inq.inquiry_type}</span>
                        )}
                        {inq.source && SOURCE_BADGES[inq.source] && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${SOURCE_BADGES[inq.source].cls}`}>{SOURCE_BADGES[inq.source].label}</span>
                        )}
                        {inq.source && !SOURCE_BADGES[inq.source] && (
                          <span className="text-[10px] text-gray-600">· {inq.source}</span>
                        )}
                        <BrandBadge brandId={inq.brand_id} />
                      </div>
                      {(inq.guest?.email || inq.guest?.phone) && (
                        <div className="mt-1.5">
                          <ContactActions email={inq.guest?.email} phone={inq.guest?.phone || inq.guest?.mobile} compact />
                        </div>
                      )}
                    </td>

                    {fieldCfg.list.stay && (
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {inq.check_in || inq.check_out ? (
                          <>
                            <div className="text-gray-300">
                              {inq.check_in ? fmtShort(inq.check_in) : '—'} → {inq.check_out ? fmtShort(inq.check_out) : '—'}
                            </div>
                            <div className="text-[10px] text-gray-600">
                              {nights !== null && `${nights}n`}{nights !== null && inq.num_rooms ? ' · ' : ''}
                              {inq.num_rooms ? `${inq.num_rooms} room${inq.num_rooms === 1 ? '' : 's'}` : ''}
                              {inq.room_type_requested && (nights !== null || inq.num_rooms) ? ' · ' : ''}
                              {inq.room_type_requested ?? ''}
                            </div>
                          </>
                        ) : <span className="text-gray-700">—</span>}
                      </td>
                    )}

                    {fieldCfg.list.value && (
                      <td className="px-4 py-3 text-sm font-semibold tabular-nums whitespace-nowrap">
                        {inq.total_value
                          ? <span className="text-emerald-400">{settings.currency_symbol}{Number(inq.total_value).toLocaleString()}</span>
                          : <span className="text-gray-700 text-xs">—</span>}
                      </td>
                    )}

                    {/* Status pill — clickable to change inline. Phase 6
                        polish: prefer the live pipeline_stage's color
                        when available (custom pipelines, renamed stages),
                        falling back to STATUS_COLORS for legacy rows.
                        Priority chip below is now inline-editable too. */}
                    <td className="px-4 py-3" data-menu-root>
                      {(() => {
                        const stageColor = inq.pipeline_stage?.color
                        const stageStyle: React.CSSProperties = stageColor
                          ? { background: stageColor + '20', color: stageColor, border: `1px solid ${stageColor}40` }
                          : {}
                        const stageClass = stageColor
                          ? 'border'
                          : (STATUS_COLORS[inq.status] ?? 'bg-gray-500/20 text-t-secondary')
                        return (
                          <button onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setOpenMenu(openMenu !== null && openMenu.id === inq.id && openMenu.type === 'status'
                                ? null
                                : { id: inq.id, type: 'status', anchor: rect })
                            }}
                            title="Click to change status"
                            style={stageStyle}
                            className={`text-[11px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap inline-flex items-center gap-1 hover:brightness-110 transition-all ${stageClass}`}>
                            {inq.status} <ChevronDown size={9} />
                          </button>
                        )
                      })()}
                      <button
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setOpenMenu(openMenu !== null && openMenu.id === inq.id && openMenu.type === 'priority'
                            ? null
                            : { id: inq.id, type: 'priority', anchor: rect })
                        }}
                        title="Click to change priority"
                        className={`block text-[10px] mt-1 font-bold hover:underline ${PRIORITY_COLORS[inq.priority] ?? 'text-t-secondary'}`}
                      >
                        {inq.priority ?? '—'}
                      </button>
                    </td>

                    {fieldCfg.list.owner && (
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {inq.assigned_to || <span className="text-gray-700">unassigned</span>}
                      </td>
                    )}

                    {fieldCfg.list.touches && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <InquiryTouchSummary inquiry={inq} />
                      </td>
                    )}

                    {fieldCfg.list.next_task && (
                      <td className="px-4 py-3">
                        {inq.next_task_type && !inq.next_task_completed ? (
                          <div className="flex items-center gap-1">
                            {isOverdue && <AlertCircle size={11} className="text-red-400 flex-shrink-0" />}
                            <div>
                              <div className="text-xs text-gray-300 whitespace-nowrap">{inq.next_task_type}</div>
                              {inq.next_task_due && <div className={`text-[10px] ${isOverdue ? 'text-red-400' : 'text-[#636366]'}`}>{inq.next_task_due}</div>}
                            </div>
                          </div>
                        ) : inq.next_task_completed ? (
                          <span className="text-xs text-green-400">Done</span>
                        ) : <span className="text-xs text-gray-700">—</span>}
                      </td>
                    )}

                    {/* Inline quick actions — call, email, whatsapp, sms,
                        won, lost — all single-click and self-logging. */}
                    <td className="px-4 py-3 text-right">
                      <InquiryQuickActions inquiry={inq}
                        onStatus={(id, status) => statusMutation.mutate({ id, status })} />
                    </td>

                    {/* Overflow menu — task editor + view detail */}
                    <td className="px-2 py-3" data-menu-root>
                      <button onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setOpenMenu(openMenu !== null && openMenu.id === inq.id && openMenu.type === 'action'
                            ? null
                            : { id: inq.id, type: 'action', anchor: rect })
                        }}
                        title="More" className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#636366] hover:text-white transition-colors">
                        <MoreHorizontal size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Pipeline (kanban) view — group by status, drag a card between
          columns to move the inquiry. Confirmed / Lost are intentionally
          shown so staff can drag a card to "won" / "lost" for closure. */}
      {view === 'pipeline' && (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 400 }}>
          {(stageGroup === 'all'
            ? settings.inquiry_statuses
            : settings.inquiry_statuses.filter(s => (STAGE_GROUPS[stageGroup] || []).includes(s))
          ).map((col: string) => {
            const cards = inquiries.filter((i: any) => i.status === col)
            return (
              <div key={col}
                onDragOver={e => { if (dragging !== null) e.preventDefault() }}
                onDrop={e => {
                  e.preventDefault()
                  if (dragging !== null) statusMutation.mutate({ id: dragging, status: col })
                }}
                className="flex-shrink-0 w-[280px] rounded-2xl border border-white/[0.06] bg-dark-surface flex flex-col"
                style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))' }}>
                <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between sticky top-0 z-10"
                  style={{ background: 'rgba(14,20,18,0.98)' }}>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${STATUS_COLORS[col] ?? 'bg-gray-500/20 text-t-secondary'}`}>{col}</span>
                  <span className="text-[10px] text-gray-500 font-bold tabular-nums">{cards.length}</span>
                </div>
                <div className="flex-1 p-2 space-y-2 min-h-[120px]">
                  {cards.length === 0 && (
                    <div className="text-center text-[10px] text-gray-700 py-4">Drop cards here</div>
                  )}
                  {cards.map((inq: any) => {
                    const isDragging = dragging === inq.id
                    return (
                      <div key={inq.id}
                        draggable
                        onDragStart={() => setDragging(inq.id)}
                        onDragEnd={() => setDragging(null)}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 cursor-grab active:cursor-grabbing hover:border-white/15 hover:bg-white/[0.04] transition-all"
                        style={{ opacity: isDragging ? 0.4 : 1 }}>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="text-sm font-semibold text-white truncate">{inq.guest?.full_name ?? '—'}</div>
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${PRIORITY_COLORS[inq.priority] ?? 'text-gray-500'}`}>
                            {inq.priority}
                          </span>
                        </div>
                        {inq.guest?.company && <div className="text-[11px] text-gray-500 truncate mb-1.5">{inq.guest.company}</div>}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400">
                          {inq.check_in && <span>{inq.check_in}{inq.check_out ? ` → ${inq.check_out}` : ''}</span>}
                          {inq.num_rooms && <span>{inq.num_rooms} room{inq.num_rooms === 1 ? '' : 's'}</span>}
                          {inq.total_value && <span className="text-emerald-400 font-semibold">{settings.currency_symbol}{Number(inq.total_value).toLocaleString()}</span>}
                        </div>
                        {(inq.guest?.email || inq.guest?.phone) && (
                          <div className="mt-2">
                            <ContactActions email={inq.guest?.email} phone={inq.guest?.phone || inq.guest?.mobile} compact />
                          </div>
                        )}
                        {inq.next_task_type && !inq.next_task_completed && (
                          <div className="mt-2 flex items-center gap-1 text-[10px]">
                            <AlertCircle size={10} className={new Date(inq.next_task_due) < new Date() ? 'text-red-400' : 'text-amber-400'} />
                            <span className="text-gray-400">{inq.next_task_type}</span>
                            {inq.next_task_due && <span className="text-gray-600">· {inq.next_task_due}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination — only meaningful in list view */}
      {view === 'list' && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-t-secondary">Page {meta.current_page} of {meta.last_page}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}

      {/* Create Modal — split Required vs Advanced. Most inquiries are
          captured with just guest + property + dates + rooms; everything
          else (rate negotiation, ownership, source, etc.) is collapsible. */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-1">Add Inquiry</h2>
            <p className="text-xs text-t-secondary mb-4">Just the essentials below — open Advanced for rate, ownership, status, etc.</p>
            <form onSubmit={e => {
              e.preventDefault()
              const body: any = {
                ...form,
                guest_id: form.guest_id ? parseInt(form.guest_id) : undefined,
                property_id: form.property_id ? parseInt(form.property_id) : undefined,
                num_rooms: form.num_rooms ? parseInt(form.num_rooms) : undefined,
                num_adults: form.num_adults ? parseInt(form.num_adults) : undefined,
                num_children: form.num_children ? parseInt(form.num_children) : undefined,
                rate_offered: form.rate_offered ? parseFloat(form.rate_offered) : undefined,
                total_value: form.total_value ? parseFloat(form.total_value) : undefined,
                event_pax: form.event_pax ? parseInt(form.event_pax) : undefined,
              }
              if (!showMice) {
                delete body.event_name; delete body.event_pax; delete body.function_space
                delete body.catering_required; delete body.av_required
              }
              createMutation.mutate(body)
            }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <GuestPicker value={form.guest_id} onChange={v => setForm(f => ({ ...f, guest_id: v }))} className={inp} />
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Property *</label>
                  <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))} className={inp} required>
                    <option value="">-- Select --</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                {fieldCfg.form.check_in && (
                  <div>
                    <label className="block text-xs text-[#a0a0a0] mb-1">Check-in</label>
                    <input type="date" value={form.check_in} onChange={e => setForm(f => ({ ...f, check_in: e.target.value }))} className={inp} />
                  </div>
                )}
                {fieldCfg.form.check_out && (
                  <div>
                    <label className="block text-xs text-[#a0a0a0] mb-1">Check-out</label>
                    <input type="date" value={form.check_out} onChange={e => setForm(f => ({ ...f, check_out: e.target.value }))} className={inp} />
                  </div>
                )}
                {fieldCfg.form.num_rooms && (
                  <div>
                    <label className="block text-xs text-[#a0a0a0] mb-1">Rooms</label>
                    <input type="number" min={1} value={form.num_rooms} onChange={e => setForm(f => ({ ...f, num_rooms: e.target.value }))} className={inp} />
                  </div>
                )}
                {fieldCfg.form.inquiry_type && (
                  <div>
                    <label className="block text-xs text-[#a0a0a0] mb-1">Inquiry Type</label>
                    <select value={form.inquiry_type} onChange={e => setForm(f => ({ ...f, inquiry_type: e.target.value }))} className={inp}>
                      <option value="">-- Select --</option>
                      {settings.inquiry_types.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Advanced — collapsed by default. Each field below is
                  individually toggleable from Settings → Pipeline Layout
                  so an org that doesn't quote rates inline can hide
                  Rate / Total Value entirely. The whole Advanced block
                  hides itself when every field inside is disabled. */}
              {(fieldCfg.form.source || fieldCfg.form.room_type
                || fieldCfg.form.rate_offered || fieldCfg.form.total_value
                || fieldCfg.form.status || fieldCfg.form.priority
                || fieldCfg.form.assigned_to) && (
                <div className="border-t border-dark-border pt-3">
                  <button type="button" onClick={() => setShowAdvancedCreate(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-t-secondary hover:text-white transition-colors">
                    <ChevronDown size={12} className={`transition-transform ${showAdvancedCreate ? 'rotate-180' : ''}`} />
                    Advanced ({showAdvancedCreate ? 'hide' : 'rate, ownership, status…'})
                  </button>
                  {showAdvancedCreate && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      {fieldCfg.form.source && (
                        <div>
                          <label className="block text-xs text-[#a0a0a0] mb-1">Source</label>
                          <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} className={inp}>
                            <option value="">-- None --</option>
                            {settings.lead_sources.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                      {fieldCfg.form.room_type && (
                        <div>
                          <label className="block text-xs text-[#a0a0a0] mb-1">Room Type</label>
                          <select value={form.room_type_requested} onChange={e => setForm(f => ({ ...f, room_type_requested: e.target.value }))} className={inp}>
                            <option value="">-- Select --</option>
                            {settings.room_types.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                      )}
                      {fieldCfg.form.rate_offered && (
                        <div>
                          <label className="block text-xs text-[#a0a0a0] mb-1">Rate ({settings.currency_symbol})</label>
                          <input type="number" step="0.01" value={form.rate_offered} onChange={e => setForm(f => ({ ...f, rate_offered: e.target.value }))} className={inp} />
                        </div>
                      )}
                      {fieldCfg.form.total_value && (
                        <div>
                          <label className="block text-xs text-[#a0a0a0] mb-1">Total Value ({settings.currency_symbol})</label>
                          <input type="number" step="0.01" value={form.total_value} onChange={e => setForm(f => ({ ...f, total_value: e.target.value }))} className={inp} />
                        </div>
                      )}
                      {fieldCfg.form.status && (
                        <div>
                          <label className="block text-xs text-[#a0a0a0] mb-1">Status</label>
                          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inp}>
                            {settings.inquiry_statuses.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                      {fieldCfg.form.priority && (
                        <div>
                          <label className="block text-xs text-[#a0a0a0] mb-1">Priority</label>
                          <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inp}>
                            {settings.priorities.map(p => <option key={p}>{p}</option>)}
                          </select>
                        </div>
                      )}
                      {fieldCfg.form.assigned_to && (
                        <div>
                          <label className="block text-xs text-[#a0a0a0] mb-1">Assigned To</label>
                          <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className={inp}>
                            <option value="">-- None --</option>
                            {settings.lead_owners.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {showMice && (
                <div className="border border-purple-500/20 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-medium text-purple-400">Event / MICE Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#a0a0a0] mb-1">Event Name</label>
                      <input value={form.event_name} onChange={e => setForm(f => ({ ...f, event_name: e.target.value }))} className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#a0a0a0] mb-1">Expected Pax</label>
                      <input type="number" value={form.event_pax} onChange={e => setForm(f => ({ ...f, event_pax: e.target.value }))} className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#a0a0a0] mb-1">Function Space</label>
                      <select value={form.function_space} onChange={e => setForm(f => ({ ...f, function_space: e.target.value }))} className={inp}>
                        <option value="">-- Select --</option>
                        {settings.function_spaces.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end gap-4 pb-2">
                      <label className="flex items-center gap-2 text-sm text-[#a0a0a0] cursor-pointer">
                        <input type="checkbox" checked={form.catering_required as boolean} onChange={e => setForm(f => ({ ...f, catering_required: e.target.checked }))} className="accent-primary-500" />
                        Catering
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#a0a0a0] cursor-pointer">
                        <input type="checkbox" checked={form.av_required as boolean} onChange={e => setForm(f => ({ ...f, av_required: e.target.checked }))} className="accent-primary-500" />
                        AV Equipment
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {fieldCfg.form.special_requests && (
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Special Requests</label>
                  <textarea value={form.special_requests} onChange={e => setForm(f => ({ ...f, special_requests: e.target.value }))} rows={2} className={`${inp} resize-none`} />
                </div>
              )}
              {fieldCfg.form.notes && (
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={`${inp} resize-none`} />
                </div>
              )}

              {/* CRM Phase 7 — admin-defined custom fields. Renders nothing
                  if no fields are configured for the inquiry entity. */}
              <CustomFieldsForm
                entity="inquiry"
                values={form.custom_data}
                onChange={(next) => setForm(f => ({ ...f, custom_data: next }))}
                inputClassName={inp}
              />

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50">
                  {createMutation.isPending ? 'Saving...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task editor — triggered from the row action menu. Saves
          next_task_* via PUT /inquiries/{id}; "Clear" wipes them so a
          stale follow-up doesn't keep flagging the row as overdue. */}
      {taskFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setTaskFor(null)}>
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">{taskFor.type ? 'Edit Task' : 'Set Task'}</h2>
            <p className="text-xs text-t-secondary mb-4">Track the next thing to do on this inquiry — call, follow-up email, send proposal, etc.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#a0a0a0] mb-1">Task Type</label>
                <select value={taskFor.type} onChange={e => setTaskFor(t => t && { ...t, type: e.target.value })} className={inp}>
                  <option value="">-- None --</option>
                  <option value="Call">Call</option>
                  <option value="Email">Email</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Send Proposal">Send Proposal</option>
                  <option value="Site Visit">Site Visit</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Contract">Contract</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a0a0a0] mb-1">Due Date</label>
                <input type="date" value={taskFor.due} onChange={e => setTaskFor(t => t && { ...t, due: e.target.value })} className={inp} style={{ colorScheme: 'dark' }} />
              </div>
              <div>
                <label className="block text-xs text-[#a0a0a0] mb-1">Notes</label>
                <textarea rows={3} value={taskFor.notes} onChange={e => setTaskFor(t => t && { ...t, notes: e.target.value })}
                  placeholder="What needs to happen, any context staff should know"
                  className={`${inp} resize-none`} />
              </div>
            </div>
            <div className="flex justify-between items-center mt-4">
              <button onClick={() => taskMutation.mutate({ id: taskFor.id, type: null, due: null, notes: null })}
                disabled={taskMutation.isPending}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40">
                Clear task
              </button>
              <div className="flex gap-2">
                <button onClick={() => setTaskFor(null)} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                <button onClick={() => taskFor && taskMutation.mutate({ id: taskFor.id, type: taskFor.type || null, due: taskFor.due || null, notes: taskFor.notes || null })}
                  disabled={taskMutation.isPending || !taskFor.type}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50">
                  {taskMutation.isPending ? 'Saving…' : 'Save Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global inline menus rendered with position:fixed so they escape
          the table's overflow:hidden / overflow-x-auto containers. The
          anchor rect is captured at click time and used to position
          relative to the viewport. */}
      {openMenu && (() => {
        const inq = inquiries.find((i: any) => i.id === openMenu.id)
        if (!inq) return null
        // Default below the trigger, flipped above when there's no
        // room (within 240px of the bottom of the viewport).
        const flipUp = openMenu.anchor.bottom + 240 > window.innerHeight
        const top = flipUp
          ? Math.max(8, openMenu.anchor.top - 8 - 240)
          : openMenu.anchor.bottom + 4
        const right = openMenu.type === 'action' ? window.innerWidth - openMenu.anchor.right : undefined
        const left  = openMenu.type === 'status' || openMenu.type === 'priority' ? openMenu.anchor.left : undefined
        return (
          <div data-menu-root
            style={{ position: 'fixed', top, left, right, zIndex: 60 }}
            className="bg-[#0f1c18] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[180px]">
            {openMenu.type === 'status' && settings.inquiry_statuses.map(s => (
              <button key={s} onClick={() => statusMutation.mutate({ id: openMenu.id, status: s })}
                disabled={statusMutation.isPending || s === inq.status}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05] disabled:opacity-40 ${s === inq.status ? 'text-emerald-400 font-semibold' : 'text-gray-300'}`}>
                {s === inq.status && '✓ '}{s}
              </button>
            ))}
            {openMenu.type === 'priority' && settings.priorities.map(p => {
              const cls = PRIORITY_COLORS[p] ?? 'text-gray-300'
              return (
                <button key={p} onClick={() => priorityMutation.mutate({ id: openMenu.id, priority: p })}
                  disabled={priorityMutation.isPending || p === inq.priority}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05] disabled:opacity-40 font-bold ${cls}`}>
                  {p === inq.priority && '✓ '}{p}
                </button>
              )
            })}
            {openMenu.type === 'action' && (
              <>
                {inq.next_task_type && !inq.next_task_completed && (
                  <button onClick={() => { completeMutation.mutate(openMenu.id); setOpenMenu(null) }}
                    className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-gray-300 hover:bg-white/[0.06]">
                    <CheckCircle2 size={12} /> Complete Task
                  </button>
                )}
                <button onClick={() => {
                    setTaskFor({
                      id: openMenu.id,
                      type: inq.next_task_type || '',
                      due: inq.next_task_due || '',
                      notes: inq.next_task_notes || '',
                    })
                    setOpenMenu(null)
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-gray-300 hover:bg-white/[0.06]">
                  <AlertCircle size={12} /> {inq.next_task_type ? 'Edit Task' : 'Set Task'}
                </button>
                <button onClick={() => { setOpenMenu(null); window.location.href = `/inquiries/${openMenu.id}` }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-gray-300 hover:bg-white/[0.06]">
                  <Eye size={12} /> View Detail
                </button>
              </>
            )}
          </div>
        )
      })()}

      {/* Bulk action floating bar — appears once any row is selected.
          Owner reassignment uses the per-org lead_owners list from
          settings; status changes go through the same hook that
          auto-creates a reservation when status flips to Confirmed. */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 border border-white/10 rounded-2xl shadow-2xl p-3 flex items-center gap-2 backdrop-blur flex-wrap"
          style={{ background: 'rgba(18,24,22,0.96)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <span className="px-3 py-1.5 text-xs font-bold text-white tabular-nums">{selected.size} selected</span>
          <div className="h-5 w-px bg-white/10" />
          <button onClick={() => runBulk('mark_won')} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors">
            <Trophy size={13} /> Mark Won
          </button>
          <button onClick={() => runBulk('mark_lost', undefined, `Mark ${selected.size} inquir${selected.size === 1 ? 'y' : 'ies'} as Lost?`)} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50 transition-colors">
            <XCircle size={13} /> Mark Lost
          </button>
          {/* Owner reassignment via select — submitting fires the bulk
              call. The select intentionally has an empty option so
              "Unassign" is one click away. */}
          <select onChange={e => {
              const v = e.target.value
              if (v === '') return
              if (v === '__clear__') runBulk('set_assigned_to', '')
              else runBulk('set_assigned_to', v)
              e.currentTarget.value = ''
            }} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 disabled:opacity-50 transition-colors cursor-pointer"
            style={{ colorScheme: 'dark' }}
            defaultValue="">
            <option value="" disabled>Assign to…</option>
            <option value="__clear__" style={{ background: '#0f1c18', color: '#fff' }}>Unassign</option>
            {settings.lead_owners.map(o => <option key={o} value={o} style={{ background: '#0f1c18', color: '#fff' }}>{o}</option>)}
          </select>
          <select onChange={e => {
              if (!e.target.value) return
              runBulk('set_priority', e.target.value)
              e.currentTarget.value = ''
            }} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition-colors cursor-pointer"
            style={{ colorScheme: 'dark' }}
            defaultValue="">
            <option value="" disabled>Priority…</option>
            {settings.priorities.map(p => <option key={p} value={p} style={{ background: '#0f1c18', color: '#fff' }}>{p}</option>)}
          </select>
          <div className="h-5 w-px bg-white/10" />
          <button onClick={() => setSelected(new Set())} title="Clear selection"
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06]">
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* AI Capture Modal */}
      {showCapture && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
                <Sparkles size={14} className="text-purple-400" />
              </div>
              <h2 className="text-lg font-bold text-white">AI Inquiry Capture</h2>
            </div>

            {!captureResult ? (
              <div className="space-y-3">
                <p className="text-xs text-t-secondary">Paste an email, booking request, or hotel inquiry. AI will extract guest and inquiry details automatically.</p>
                <textarea
                  value={captureText}
                  onChange={e => setCaptureText(e.target.value)}
                  rows={8}
                  placeholder="Paste the email or message here..."
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setShowCapture(false)} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                  <button
                    onClick={async () => {
                      if (!captureText.trim()) return
                      setCaptureLoading(true)
                      try {
                        const res = await api.post('/v1/admin/crm-ai/capture-lead', { text: captureText })
                        if (res.data.success) setCaptureResult(res.data.data)
                        else toast.error(res.data.error || 'Failed to extract data')
                      } catch (e: any) {
                        toast.error(e.response?.data?.message || 'AI extraction failed')
                      } finally { setCaptureLoading(false) }
                    }}
                    disabled={captureLoading || !captureText.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {captureLoading ? <><Loader2 size={14} className="animate-spin" /> Extracting...</> : <><Sparkles size={14} /> Extract</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-xs text-purple-300">
                  AI extracted the following. Review and edit before creating the guest and inquiry.
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-300 mb-2">Guest Information</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'customer_name', label: 'Guest Name', type: 'text' },
                      { key: 'email', label: 'Email', type: 'email' },
                      { key: 'phone', label: 'Phone', type: 'text' },
                      { key: 'company', label: 'Company', type: 'text' },
                      { key: 'country', label: 'Country', type: 'text' },
                    ].map(({ key, label, type }) => (
                      <div key={key}>
                        <label className="block text-xs text-[#a0a0a0] mb-1">{label}</label>
                        <input type={type} value={captureResult[key] ?? ''} onChange={e => setCaptureResult((r: any) => ({ ...r, [key]: e.target.value }))} className={inp} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-300 mb-2">Inquiry Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'inquiry_type', label: 'Inquiry Type', type: 'text' },
                      { key: 'check_in', label: 'Check-in', type: 'date' },
                      { key: 'check_out', label: 'Check-out', type: 'date' },
                      { key: 'num_rooms', label: 'Rooms', type: 'number' },
                      { key: 'total_value', label: 'Estimated Value', type: 'number' },
                      { key: 'source', label: 'Source', type: 'text' },
                    ].map(({ key, label, type }) => (
                      <div key={key}>
                        <label className="block text-xs text-[#a0a0a0] mb-1">{label}</label>
                        <input type={type} value={captureResult[key] ?? ''} onChange={e => setCaptureResult((r: any) => ({ ...r, [key]: e.target.value }))} className={inp} />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs text-[#a0a0a0] mb-1">Property</label>
                      <select value={captureResult.property_id ?? ''} onChange={e => setCaptureResult((r: any) => ({ ...r, property_id: e.target.value }))} className={inp}>
                        <option value="">-- Select --</option>
                        {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Special Requests / Notes</label>
                  <textarea value={captureResult.notes ?? ''} onChange={e => setCaptureResult((r: any) => ({ ...r, notes: e.target.value }))} rows={3} className={`${inp} resize-none`} />
                </div>
                <div className="flex justify-between pt-1">
                  <button onClick={() => setCaptureResult(null)} className="text-sm text-[#636366] hover:text-white">Back</button>
                  <div className="flex gap-3">
                    <button onClick={() => setShowCapture(false)} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                    <button
                      disabled={captureCreating}
                      onClick={async () => {
                        const r = captureResult
                        setCaptureCreating(true)
                        try {
                          const guestRes = await api.post('/v1/admin/guests', {
                            full_name: r.customer_name,
                            email: r.email || undefined,
                            phone: r.phone || undefined,
                            company: r.company || undefined,
                            country: r.country || undefined,
                            lead_source: r.source || undefined,
                          })
                          const guestId = guestRes.data.id
                          await api.post('/v1/admin/inquiries', {
                            guest_id: guestId,
                            property_id: r.property_id ? parseInt(r.property_id) : undefined,
                            inquiry_type: r.inquiry_type || undefined,
                            check_in: r.check_in || undefined,
                            check_out: r.check_out || undefined,
                            num_rooms: r.num_rooms ? Number(r.num_rooms) : undefined,
                            total_value: r.total_value ? Number(r.total_value) : undefined,
                            priority: r.priority || 'Medium',
                            source: r.source || undefined,
                            special_requests: r.notes || undefined,
                            status: 'New',
                          })
                          qc.invalidateQueries({ queryKey: ['inquiries'] })
                          qc.invalidateQueries({ queryKey: ['guests'] })
                          toast.success(`Guest & inquiry created for ${r.customer_name}`)
                          setShowCapture(false)
                          setCaptureResult(null)
                        } catch (e: any) {
                          toast.error(e.response?.data?.message || 'Failed to create records')
                        } finally { setCaptureCreating(false) }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
                    >
                      {captureCreating ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : 'Create Guest & Inquiry'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Guest picker for the Add Inquiry modal. Phase 6.5: when no existing
 * guest matches the search term, an inline "Create new guest" form
 * lets the user create the contact + auto-select it without leaving
 * the inquiry form. Splits the search input into name vs email
 * detection — anything with an "@" pre-fills the email field.
 */
function GuestPicker({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newGuest, setNewGuest] = useState({ full_name: '', email: '', phone: '' })

  const { data } = useQuery({
    queryKey: ['guest-picker', search],
    queryFn: () => api.get('/v1/admin/guests', { params: { search, per_page: 8 } }).then(r => r.data),
    enabled: search.length >= 2,
  })
  const guests: any[] = data?.data ?? []

  const { data: selected } = useQuery({
    queryKey: ['guest-selected', value],
    queryFn: () => api.get(`/v1/admin/guests/${value}`).then(r => r.data),
    enabled: !!value,
  })

  const create = useMutation({
    mutationFn: () => api.post('/v1/admin/guests', {
      full_name: newGuest.full_name.trim(),
      email: newGuest.email.trim() || null,
      phone: newGuest.phone.trim() || null,
    }),
    onSuccess: (res) => {
      const g = res.data
      qc.invalidateQueries({ queryKey: ['guest-picker'] })
      onChange(String(g.id))
      toast.success(`Created ${g.full_name}`)
      setCreating(false)
      setNewGuest({ full_name: '', email: '', phone: '' })
      setSearch('')
      setOpen(false)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Could not create guest'
      toast.error(msg)
    },
  })

  const startCreate = () => {
    // Pre-fill from the search term — email if it looks like one,
    // otherwise treat as name. Avoids re-typing what the agent
    // already typed.
    const term = search.trim()
    const isEmail = term.includes('@')
    setNewGuest({
      full_name: isEmail ? '' : term,
      email: isEmail ? term : '',
      phone: '',
    })
    setCreating(true)
  }

  return (
    <div className="relative">
      <label className="block text-xs text-[#a0a0a0] mb-1">Guest *</label>
      {value && selected ? (
        <div className="flex items-center gap-2">
          <span className={`${className} flex-1 truncate`}>{selected.full_name}{selected.email ? ` (${selected.email})` : ''}</span>
          <button type="button" onClick={() => { onChange(''); setSearch('') }} className="text-xs text-[#636366] hover:text-white px-2 py-1">Clear</button>
        </div>
      ) : (
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => search.length >= 2 && setOpen(true)}
          placeholder="Search guest name or email..."
          className={className}
        />
      )}
      {open && !value && search.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-dark-surface border border-dark-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {guests.map((g: any) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { onChange(String(g.id)); setOpen(false); setSearch('') }}
              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-dark-surface2 transition-colors"
            >
              <span className="font-medium">{g.full_name}</span>
              {g.email && <span className="text-xs text-[#636366] ml-2">{g.email}</span>}
            </button>
          ))}
          {/* Always offer the "create new" option at the bottom of the
              dropdown, even when there are matches — sometimes the
              search term partial-matches an existing guest the agent
              didn't mean. */}
          <button
            type="button"
            onClick={startCreate}
            className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-accent/10 border-t border-dark-border flex items-center gap-2"
          >
            <Plus size={12} />
            {guests.length === 0
              ? <>Create <span className="font-bold">"{search}"</span> as new guest</>
              : <>Create new guest…</>
            }
          </button>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setCreating(false)}>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Plus size={14} className="text-accent" /> New guest
            </h3>
            <div className="space-y-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1">Full name *</label>
                <input
                  autoFocus
                  value={newGuest.full_name}
                  onChange={e => setNewGuest(g => ({ ...g, full_name: e.target.value }))}
                  className={className}
                  placeholder="e.g. Jane Doe"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1">Email</label>
                <input
                  type="email"
                  value={newGuest.email}
                  onChange={e => setNewGuest(g => ({ ...g, email: e.target.value }))}
                  className={className}
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1">Phone</label>
                <input
                  type="tel"
                  value={newGuest.phone}
                  onChange={e => setNewGuest(g => ({ ...g, phone: e.target.value }))}
                  className={className}
                  placeholder="+49 …"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-3 py-1.5 text-xs text-t-secondary hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => create.mutate()}
                disabled={!newGuest.full_name.trim() || create.isPending}
                className="bg-accent text-black font-bold rounded-md px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-accent/90"
              >
                {create.isPending ? 'Creating…' : 'Create + select'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
