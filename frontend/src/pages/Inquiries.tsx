import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useSettings, triggerExport, INQUIRY_LIST_FIELD_META } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import { Plus, Search, ChevronLeft, ChevronRight, CheckCircle2, Download, Filter, AlertCircle, Sparkles, Loader2, List as ListIcon, LayoutGrid, MoreHorizontal, ChevronDown, Trophy, XCircle, Eye, EyeOff, X as XIcon, ListChecks, Pencil, Trash2, UserCircle2 } from 'lucide-react'
import { ContactActions } from '../components/ContactActions'
// DailyOpsBar + PipelineInsights moved to /pipeline?tab=insights so this
// page stays focused on managing leads. See InquiryInsights.tsx.
import { InquiryQuickActions, InquiryTouchSummary } from '../components/InquiryQuickActions'
import { BrandBadge } from '../components/BrandBadge'
import { SavedViews } from '../components/SavedViews'
import { CustomFieldsForm, useCustomFields, extractCustomFieldErrors } from '../components/CustomFields'
import { TaskDrawer } from '../components/TaskDrawer'
import EditableField from '../components/EditableField'
import ColumnTogglePopover from '../components/ColumnTogglePopover'
import DeleteConfirmModal from '../components/DeleteConfirmModal'
import { CustomerDrawer } from '../components/CustomerDrawer'
import { InquiryDrawer } from '../components/InquiryDrawer'
import { AddInquiryDrawer } from '../components/AddInquiryDrawer'

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

/**
 * Renders a custom-field value as a leads-list table cell. Type-aware
 * so the cell looks right whether it's a date / number / select tag
 * etc. Used by `listColumns` rendering on the Inquiries page.
 */
function renderCustomListValue(type: string, v: any): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-gray-700">—</span>
  if (type === 'checkbox') return v ? <span className="text-emerald-400">Yes</span> : <span className="text-gray-500">No</span>
  if (type === 'date') {
    const d = new Date(v)
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  }
  if (type === 'multiselect' && Array.isArray(v)) {
    if (v.length === 0) return <span className="text-gray-700">—</span>
    return (
      <div className="flex flex-wrap gap-1 max-w-[200px]">
        {v.slice(0, 3).map((item, i) => (
          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border">{item}</span>
        ))}
        {v.length > 3 && <span className="text-[10px] text-t-secondary">+{v.length - 3}</span>}
      </div>
    )
  }
  if (type === 'url') return <span className="text-accent truncate block max-w-[180px]">{String(v)}</span>
  if (type === 'textarea') return <span className="truncate block max-w-[200px]" title={String(v)}>{String(v)}</span>
  return String(v)
}

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
  const { t } = useTranslation()
  // Field-visibility config — admin toggles in Settings → Pipeline Layout
  // pick which Add Inquiry fields and which list columns are shown.
  // useSettings deep-merges with defaults so missing keys are safe.
  const fieldCfg = settings.inquiry_fields
  // Custom fields flagged show_in_list become extra columns in the
  // leads table. Filtered to active fields only — toggling a field off
  // hides it from the list without losing the column config.
  const { data: customFieldDefs } = useCustomFields('inquiry')
  const listColumns = (customFieldDefs ?? []).filter(f => f.show_in_list)
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
  // Focus mode — hides the filter / saved-views / advanced-filter rows
  // so the table gets the full viewport. Persisted to localStorage so
  // the preference survives page navigation + reloads. Stage-group +
  // view toggle stay visible because they're navigation, not filters.
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('inquiries:focus_mode') === '1'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('inquiries:focus_mode', focusMode ? '1' : '0')
  }, [focusMode])
  // Daily-ops drilldown focus — clicking an ops tile opens a panel
  // with the matching task list inline.
  // dailyFocus state moved to InquiryInsights.tsx along with the cards.
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
      else if (selected.size > 0) setSelected(new Set())
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
  }, [taskFor, showCreate, showCapture, openMenu, selected.size])

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

  // Daily ops snapshot — counts that power the slim filter-pill bar
  // above the table (Overdue / Due Today / Due Soon). The expanded
  // card strip + focus pane live on the sibling /pipeline?tab=insights
  // page; this page only needs the totals for the pills.
  const { data: today } = useQuery<any>({
    queryKey: ['inquiries-today'],
    queryFn: () => api.get('/v1/admin/inquiries/today').then(r => r.data),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })

  // KPI data has moved to /analytics → Leads tab. Same /v1/admin/
  // inquiries/kpis endpoint powers it there.

  // Per-row expand state — controlled by chevron click on each list row.
  // Single inquiry expanded at a time keeps vertical footprint bounded.
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  // Customer drawer — opened from the expanded-row "View full customer"
  // button OR from inside the InquiryDrawer kebab. Slides from the right.
  const [customerDrawerGuestId, setCustomerDrawerGuestId] = useState<number | null>(null)

  // Inquiry drawer — opened by clicking a row. Slides from the LEFT so
  // it can coexist with the right-side CustomerDrawer (e.g. lead detail
  // open on the left, customer profile open on the right at the same
  // time). Replaces the broken "Open full detail" link.
  const [inquiryDrawerId, setInquiryDrawerId] = useState<number | null>(null)

  // Single-row delete confirmation — opened from the per-row kebab
  // "Delete lead" item. Impact pre-fetched from the new
  // /v1/admin/inquiries/{id}/delete-impact endpoint.
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; impact?: any } | null>(null)

  // Bulk delete confirmation — opened from the floating-bar Delete
  // button. Simple count-based warning; no impact pre-fetch.
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // TaskDrawer state — opens with a target inquiry id (for adds) and
  // optionally an existing task to edit. Drawer takes over the right
  // pane regardless of which row is expanded.
  const [taskDrawer, setTaskDrawer] = useState<{ inquiryId: number; task?: any } | null>(null)

  // Cancel-task helper — clears the legacy next_task_* columns on
  // the inquiry via the existing update endpoint. The CRM v2 tasks
  // table (one-to-many tasks per inquiry) handles cancel via the
  // TaskDrawer; this one is for the inline `next_task` field that
  // older flows still write to.
  const cancelNextTaskMutation = useMutation({
    mutationFn: (id: number) => api.put(`/v1/admin/inquiries/${id}`, {
      next_task_type: null, next_task_due: null, next_task_notes: null, next_task_completed: false,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      qc.invalidateQueries({ queryKey: ['inquiries-today'] })
      qc.invalidateQueries({ queryKey: ['inquiries-kpis'] })
      toast.success(t('inquiries.toasts.task_cancelled', 'Task cancelled'))
    },
    onError: () => toast.error(t('inquiries.toasts.task_cancel_failed', 'Failed to cancel task')),
  })

  // Per-custom-field validation errors from the backend, surfaced
  // inline beneath the relevant input. Cleared on next submit.
  const [cfErrors, setCfErrors] = useState<Record<string, string[]>>({})

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/inquiries', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      setShowCreate(false)
      setForm({ ...EMPTY_FORM })
      setCfErrors({})
      toast.success('Inquiry created')
    },
    onError: (e: any) => {
      const fieldErrors = extractCustomFieldErrors(e)
      setCfErrors(fieldErrors)
      // If only custom-field errors, the inline messages explain it.
      // Otherwise show the top-level message in a toast.
      if (Object.keys(fieldErrors).length === 0) {
        toast.error(e.response?.data?.message || 'Error')
      } else {
        toast.error('Please fix the highlighted custom fields.')
      }
    },
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
      qc.invalidateQueries({ queryKey: ['inquiries-kpis'] })
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
      qc.invalidateQueries({ queryKey: ['inquiries-kpis'] })
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
    <div className="space-y-3">
      {/* Compact action bar. Stats line removed — same numbers live on
          the tab pills below ([All 25] [Leads 16] …). Focus / AI Capture /
          Export folded into a ⋯ overflow menu so new users see one clear
          primary action (Add inquiry) instead of four competing buttons. */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary-600 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold hover:bg-primary-700 transition-colors shadow-sm">
          <Plus size={15} /> <span className="hidden sm:inline">{t('inquiries.actions.add', 'Add inquiry')}</span><span className="sm:hidden">{t('inquiries.actions.add_short', 'Add')}</span>
        </button>
        <HeaderMenu
          focusMode={focusMode}
          onToggleFocus={() => setFocusMode(f => !f)}
          onCapture={() => { setShowCapture(true); setCaptureResult(null); setCaptureText('') }}
          onExport={handleExport}
          exporting={exporting}
          t={t}
        />
      </div>

      {/* Analytics moved to the sibling Insights tab so this page stays
          focused on managing the leads themselves. TODAY snapshot,
          Pipeline Insights and the focus pane all live under
          /pipeline?tab=insights now. The slim filter-pill bar below
          surfaces just the counts that drive table filters. */}

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

      {/* Quick-filter pills row removed — pills now render INLINE inside
          the filter row below (after Columns), so the header stays a
          two-row affair instead of four. Pills only appear when their
          count > 0 — when nothing's on fire, the row is silent. */}

      {/* Saved views — pinned filter combos for the current user. Hidden
          in focus mode along with the rest of the filter chrome. */}
      {!focusMode && <SavedViews
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
      />}

      {/* Filters — wrapped with the focus-mode gate. In focus mode the
          whole search/status/filters cluster collapses to nothing; the
          stage-group + view toggle above and the table below stay so
          basic navigation still works. */}
      {!focusMode && (
      <div className="space-y-2">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder={t('inquiries.filters.search_placeholder', 'Search guest, company…')} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          {view === 'list' && (
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('inquiries.filters.all_statuses', 'All Statuses')}</option>
              {settings.inquiry_statuses.map(s => <option key={s}>{s}</option>)}
            </select>
          )}
          <button onClick={() => setShowFilters(f => !f)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${hasFilters ? 'border-primary-500 text-primary-400' : 'border-dark-border text-t-secondary hover:text-white'}`}>
            <Filter size={14} /> {t('inquiries.filters.filters_label', 'Filters')} {hasFilters ? '●' : ''}
          </button>
          {view === 'list' && (
            <ColumnTogglePopover
              settingKey="inquiry_fields"
              section="list"
              fields={[
                { key: 'status', label: 'Status', description: 'Stage pill — required for workflow', alwaysOn: true },
                ...INQUIRY_LIST_FIELD_META.map(m => ({
                  key: m.key as string,
                  label: m.label,
                  description: m.description,
                })),
              ]}
            />
          )}
          {/* Inline quick-filter chips — only the ones with count > 0
              render, so the row stays silent when nothing is on fire.
              Used to live as a separate row above; consolidated here to
              save vertical space and reduce header noise. */}
          {today && (() => {
            type Pill = { value: 'overdue' | 'today' | 'soon'; label: string; count: number; tone: 'red' | 'amber' | 'blue' }
            const pills: Pill[] = ([
              { value: 'overdue' as const, label: t('inquiries.today.tiles.overdue',   'Overdue'),   count: today.overdue?.count ?? 0, tone: 'red'   as const },
              { value: 'today'   as const, label: t('inquiries.today.tiles.due_today', 'Due today'), count: today.today?.count   ?? 0, tone: 'amber' as const },
              { value: 'soon'    as const, label: t('inquiries.today.tiles.due_soon',  'Due soon'),  count: today.soon?.count    ?? 0, tone: 'blue'  as const },
            ] satisfies Pill[]).filter(p => p.count > 0 || taskDue === p.value)
            const toneCls = (tone: 'red' | 'amber' | 'blue', active: boolean) => {
              if (active) {
                return tone === 'red'   ? 'bg-red-500/20 text-red-300 border-red-500/40'
                     : tone === 'amber' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                     :                    'bg-blue-500/20 text-blue-300 border-blue-500/40'
              }
              return tone === 'red'   ? 'text-red-300/85 border-red-500/30 hover:bg-red-500/10'
                   : tone === 'amber' ? 'text-amber-300/85 border-amber-500/30 hover:bg-amber-500/10'
                   :                    'text-blue-300/85 border-blue-500/30 hover:bg-blue-500/10'
            }
            return pills.map(p => {
              const active = taskDue === p.value
              return (
                <button
                  key={p.value}
                  onClick={() => { setTaskDue(active ? '' : p.value); setPage(1) }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors ${toneCls(p.tone, active)}`}
                  title={active ? t('inquiries.quick_stats.clear', 'Click to clear this filter') : t('inquiries.quick_stats.apply', 'Click to filter')}
                >
                  <AlertCircle size={12} />
                  <span>{p.label}</span>
                  <span className="tabular-nums font-bold">{p.count}</span>
                </button>
              )
            })
          })()}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 items-center">
            <select value={priority} onChange={e => { setPriority(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('inquiries.filters.all_priorities', 'All Priorities')}</option>
              {settings.priorities.map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={inquiryType} onChange={e => { setInquiryType(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('inquiries.filters.all_types', 'All Types')}</option>
              {settings.inquiry_types.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={propertyId} onChange={e => { setPropertyId(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('inquiries.filters.all_properties', 'All Properties')}</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={assignedTo} onChange={e => { setAssignedTo(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('inquiries.filters.all_owners', 'All Owners')}</option>
              {settings.lead_owners.map(o => <option key={o}>{o}</option>)}
            </select>
            <select value={source} onChange={e => { setSource(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('inquiries.filters.all_sources', 'All Sources')}</option>
              {SYSTEM_SOURCES.map(s => <option key={s} value={s}>{SOURCE_BADGES[s].label}</option>)}
              {settings.lead_sources.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={taskDue} onChange={e => { setTaskDue(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('inquiries.filters.any_task', 'Any Task')}</option>
              <option value="today">{t('inquiries.filters.due_today', 'Due Today')}</option>
              <option value="overdue">{t('inquiries.filters.overdue', 'Overdue')}</option>
              <option value="soon">{t('inquiries.filters.due_soon_3d', 'Due Soon (3d)')}</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-t-secondary cursor-pointer">
              <input type="checkbox" checked={activeOnly} onChange={e => { setActiveOnly(e.target.checked); setPage(1) }} className="accent-primary-500" />
              {t('inquiries.filters.active_only', 'Active only')}
            </label>
            {hasFilters && <button onClick={() => { setStatus(''); setPriority(''); setInquiryType(''); setPropertyId(''); setAssignedTo(''); setSource(''); setTaskDue(''); setActiveOnly(false); setPage(1) }} className="text-xs text-[#636366] hover:text-white px-2">{t('inquiries.filters.clear', 'Clear')}</button>}
          </div>
        )}
      </div>
      )}

      {/* Table — list view */}
      {view === 'list' && (
      <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border">
                {/* Bulk-select column is always rendered now so the
                    feature is discoverable without admin opt-in. The
                    fieldCfg.list.bulk_select flag now controls
                    visibility-at-rest: when ON, checkboxes are always
                    visible (sticky-column-like behaviour for power
                    users); when OFF (the default), checkboxes are
                    invisible until you hover a row or until ANY row is
                    selected — at which point all checkboxes pop so
                    multi-select stays one click away. */}
                <th className={`text-center px-3 py-3 w-8 transition-opacity ${fieldCfg.list.bulk_select || selected.size > 0 ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
                    title={t('inquiries.bulk.header_tooltip', 'Select all on this page')}>
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
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">{t('inquiries.table.guest', 'Guest')}</th>
                {fieldCfg.list.stay && <SortHeader col="check_in" label={t('inquiries.table.stay', 'Stay')} />}
                {fieldCfg.list.value && <SortHeader col="total_value" label={t('inquiries.table.value', 'Value')} />}
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">{t('inquiries.table.status', 'Status')}</th>
                {fieldCfg.list.owner && <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">{t('inquiries.table.owner', 'Owner')}</th>}
                {fieldCfg.list.touches && <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">{t('inquiries.table.touches', 'Touches')}</th>}
                {fieldCfg.list.next_task && <SortHeader col="next_task_due" label={t('inquiries.table.next_task', 'Next Task')} />}
                {listColumns.map(col => (
                  <th key={col.id} className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap" title={col.help_text ?? undefined}>
                    {col.label}
                  </th>
                ))}
                <th className="text-right px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">{t('inquiries.table.actions', 'Actions')}</th>
                <th className="px-2 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={20} className="px-4 py-8 text-center text-[#636366]">{t('inquiries.table.loading', 'Loading…')}</td></tr>}
              {!isLoading && inquiries.length === 0 && <tr><td colSpan={20} className="px-4 py-8 text-center text-[#636366]">{t('inquiries.table.no_results', 'No inquiries found')}</td></tr>}
              {inquiries.map((inq: any) => {
                const isOverdue = inq.next_task_due && !inq.next_task_completed && new Date(inq.next_task_due) < new Date()
                const nights = inq.check_in && inq.check_out
                  ? Math.max(0, Math.round((new Date(inq.check_out).getTime() - new Date(inq.check_in).getTime()) / 86400000))
                  : null
                const fmtShort = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                // Lead-score chip — sourced from InquiryAiService's
                // ai_win_probability (0-100). Color thresholds matched to
                // typical sales-pipeline conventions: green = solid, amber
                // = needs nurture, red = at risk.
                const score: number | null = (typeof inq.ai_win_probability === 'number') ? inq.ai_win_probability : null
                const scoreColor = score == null
                  ? null
                  : score >= 70 ? { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' }
                    : score >= 40 ? { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' }
                    : { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
                // Age/freshness chip — "Fresh" for <24h, "Nd old" for normal
                // ageing, "Cold Nd" when there's been no contact for a week+.
                // Gives staff a glanceable sense of how this lead is doing
                // without opening the detail page.
                const createdAt = inq.created_at ? new Date(inq.created_at) : null
                const lastContact = inq.last_contacted_at ? new Date(inq.last_contacted_at) : null
                const ageDays = createdAt ? Math.floor((Date.now() - createdAt.getTime()) / 86_400_000) : null
                const daysSinceContact = lastContact ? Math.floor((Date.now() - lastContact.getTime()) / 86_400_000) : null
                const isClosedKind = inq.pipeline_stage?.kind === 'won' || inq.pipeline_stage?.kind === 'lost'
                const ageChip = (ageDays === null || isClosedKind)
                  ? null
                  : ageDays < 1
                    ? { label: t('inquiries.row.age_fresh', 'Fresh'), cls: 'text-emerald-300/90 bg-emerald-500/10 border-emerald-500/20' }
                    : ((daysSinceContact === null && ageDays >= 7) || (daysSinceContact !== null && daysSinceContact >= 7))
                      ? { label: t('inquiries.row.age_cold', { d: daysSinceContact ?? ageDays, defaultValue: 'Cold {{d}}d' }), cls: 'text-amber-300/90 bg-amber-500/10 border-amber-500/20' }
                      : { label: t('inquiries.row.age_days', { d: ageDays, defaultValue: '{{d}}d old' }), cls: 'text-gray-500 bg-white/[0.02] border-white/10' }
                const isExpanded = expandedRow === inq.id
                // Total column span for the expanded row, derived live from the
                // visible-column toggles so the colspan stays correct when admins
                // reshape the table via Settings → Pipeline Layout.
                const expandColSpan = 3 // bulk-select (always rendered now) + Guest + Actions trailing
                  + (fieldCfg.list.stay ? 1 : 0)
                  + (fieldCfg.list.value ? 1 : 0)
                  + 1 // Status
                  + (fieldCfg.list.owner ? 1 : 0)
                  + (fieldCfg.list.touches ? 1 : 0)
                  + (fieldCfg.list.next_task ? 1 : 0)
                  + listColumns.length
                // Priority left-edge stripe — inset box-shadow on the
                // <tr> so the 3px color hint sits flush against the left
                // edge of the row without disturbing the table layout.
                // Low / no priority stays unstriped; Medium gets a quiet
                // blue, High a clear red.
                const priorityStripe = inq.priority === 'High'
                  ? 'inset 3px 0 0 #ef4444'   // red
                  : inq.priority === 'Medium'
                    ? 'inset 3px 0 0 #3b82f6' // blue
                    : null
                return (
                <React.Fragment key={inq.id}>
                  <tr
                    className={`group border-b border-dark-border/50 hover:bg-dark-surface2 transition-colors cursor-pointer ${isOverdue ? 'bg-red-500/5' : ''} ${selected.has(inq.id) ? 'bg-primary-500/[0.04]' : ''} ${isExpanded ? 'bg-white/[0.02]' : ''}`}
                    style={priorityStripe ? { boxShadow: priorityStripe } : undefined}
                    onClick={(e) => {
                      // Open the lead drawer on row click. Skip if the click
                      // bubbled from an interactive element (button, link,
                      // input, select) or anything inside a dropdown menu —
                      // those handle their own action.
                      const tgt = e.target as HTMLElement | null
                      if (!tgt) return
                      if (tgt.closest('button, a, input, select, textarea, label, [data-menu-root], [data-row-noopen]')) return
                      // Don't fire if user is selecting text in a cell.
                      if (window.getSelection()?.toString()) return
                      setInquiryDrawerId(inq.id)
                    }}
                  >
                    {/* Bulk-select cell — always rendered (see <thead>
                        comment). Visible when selected, when admin opted
                        into always-on via fieldCfg, or on row hover via
                        the parent <tr>'s group class. */}
                    <td className={`px-3 py-3 text-center transition-opacity ${fieldCfg.list.bulk_select || selected.has(inq.id) || selected.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <input type="checkbox" checked={selected.has(inq.id)}
                        onChange={() => setSelected(prev => {
                          const next = new Set(prev); next.has(inq.id) ? next.delete(inq.id) : next.add(inq.id); return next
                        })}
                        className="rounded border-white/20 bg-white/[0.04] cursor-pointer" />
                    </td>

                    {/* Guest cell — name, company, property + source pills,
                        contact links. Heavy lifting in this cell so the
                        rest of the row stays narrow. CRM Phase 1: name
                        is a Link to the new lead detail page. */}
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="flex items-center gap-2">
                        {scoreColor && (
                          <span
                            className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-7 rounded-md text-[11px] font-bold tabular-nums border ${scoreColor.bg} ${scoreColor.text} ${scoreColor.border}`}
                            title={t('inquiries.score.tooltip', 'AI win probability')}
                          >
                            {score}
                          </span>
                        )}
                        {inq.guest?.id ? (
                          <Link
                            to={`/guests/${inq.guest.id}`}
                            className="font-semibold text-white hover:text-primary-300 truncate transition-colors"
                            title={t('inquiries.row.open_customer', 'Open customer')}
                          >
                            {inq.guest?.full_name ?? '—'}
                          </Link>
                        ) : (
                          <span className="font-semibold text-white truncate">{inq.guest?.full_name ?? '—'}</span>
                        )}
                        {ageChip && (
                          <span
                            className={`flex-shrink-0 inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${ageChip.cls}`}
                            title={t('inquiries.row.age_tooltip', 'Days since the lead was created — turns amber when there\'s been no contact in 7+ days')}
                          >
                            {ageChip.label}
                          </span>
                        )}
                      </div>
                      {inq.guest?.company && <div className="text-[11px] text-gray-500 truncate">{inq.guest.company}</div>}
                      {/* Email + phone shown as text so staff can scan
                          contact info without clicking the action pills. */}
                      {(inq.guest?.email || inq.guest?.phone || inq.guest?.mobile) && (
                        <div className="text-[11px] text-gray-400 mt-0.5 truncate space-x-2">
                          {inq.guest?.email && <span className="truncate">{inq.guest.email}</span>}
                          {(inq.guest?.phone || inq.guest?.mobile) && <span className="text-gray-500">· {inq.guest.phone || inq.guest.mobile}</span>}
                        </div>
                      )}
                      {/* Compressed metadata line — property and the typed
                          source pill only. Inquiry type lives in the
                          expanded row; raw source strings without a
                          system-source badge (e.g. "fds_card_builder")
                          are dropped here to cut clutter and surfaced in
                          the expand panel instead. */}
                      {(inq.property?.name || (inq.source && SOURCE_BADGES[inq.source]) || inq.brand_id || (fieldCfg.list.country && inq.guest?.country)) && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {inq.property?.name && (
                            <span className="text-[10px] text-gray-500">{inq.property.name}</span>
                          )}
                          {fieldCfg.list.country && inq.guest?.country && (
                            <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5">
                              <span aria-hidden>·</span>
                              <span>{inq.guest.country}</span>
                            </span>
                          )}
                          {inq.source && SOURCE_BADGES[inq.source] && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${SOURCE_BADGES[inq.source].cls}`}>{SOURCE_BADGES[inq.source].label}</span>
                          )}
                          <BrandBadge brandId={inq.brand_id} />
                        </div>
                      )}
                      {/* Always-visible quick-contact pills. ContactActions
                          renders Email / Call / SMS / WhatsApp depending on
                          which channels are populated; chat-captured leads
                          typically have phone (so WhatsApp lights up) and
                          email-form leads have email. Empty state surfaces
                          explicitly so staff can spot rows that need
                          enrichment from the chat dialog. */}
                      {(inq.guest?.email || inq.guest?.phone || inq.guest?.mobile) ? (
                        <div className="mt-1.5">
                          <ContactActions email={inq.guest?.email} phone={inq.guest?.phone || inq.guest?.mobile} compact />
                        </div>
                      ) : (
                        <div className="mt-1.5 text-[10px] text-gray-700 italic">
                          {t('inquiries.row.no_contacts', 'No contact info yet')}
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

                    {/* Value cell — soft-pill emerald chip with the
                        amount tabular-aligned so a column of values
                        reads cleanly. Empty rows collapse to a quiet
                        em-dash so the column doesn't pull the eye. */}
                    {fieldCfg.list.value && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        {inq.total_value ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-300 text-sm font-bold tabular-nums">
                            {settings.currency_symbol}{Number(inq.total_value).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
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
                            title={t('inquiries.table.click_to_change_status', 'Click to change status')}
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
                        title={t('inquiries.table.click_to_change_priority', 'Click to change priority')}
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
                        <NextTaskCard
                          inquiry={inq}
                          isOverdue={isOverdue}
                          onAdd={() => setTaskDrawer({ inquiryId: inq.id })}
                          onEdit={() => setTaskDrawer({ inquiryId: inq.id, task: {
                            id: 0,
                            inquiry_id: inq.id,
                            title: inq.next_task_type,
                            due_at: inq.next_task_due,
                            notes: inq.next_task_notes,
                          } })}
                          onComplete={() => completeMutation.mutate(inq.id)}
                          onCancel={() => cancelNextTaskMutation.mutate(inq.id)}
                          t={t}
                        />
                      </td>
                    )}

                    {/* Custom-field columns — only the ones flagged
                        show_in_list. Cell renderer is type-aware so
                        booleans show as Yes/No, dates as locale, multi-
                        selects as comma-joined chips. */}
                    {listColumns.map(col => {
                      const v = inq.custom_data?.[col.key]
                      return (
                        <td key={col.id} className="px-4 py-3 text-xs whitespace-nowrap text-gray-300">
                          {renderCustomListValue(col.type, v)}
                        </td>
                      )
                    })}

                    {/* Inline quick actions — Won / Lost shortcuts.
                        Hidden by default, fade in on row hover or when
                        any button inside has keyboard focus, so the row
                        reads cleaner at rest while staying one tap
                        away. focus-within keeps it accessible when
                        tabbing through. */}
                    <td className="px-4 py-3 text-right opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <InquiryQuickActions inquiry={inq}
                        onStatus={(id, status) => statusMutation.mutate({ id, status })} />
                    </td>

                    {/* Trailing column — expand toggle + overflow menu.
                        Chevron drives the row's expanded state; the
                        kebab keeps access to the Task editor + view
                        detail menu. */}
                    <td className="px-2 py-3" data-menu-root>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => setExpandedRow(isExpanded ? null : inq.id)}
                          title={isExpanded ? t('inquiries.row.collapse', 'Collapse') : t('inquiries.row.expand', 'Expand')}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#636366] hover:text-white transition-colors"
                        >
                          <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        <button onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setOpenMenu(openMenu !== null && openMenu.id === inq.id && openMenu.type === 'action'
                              ? null
                              : { id: inq.id, type: 'action', anchor: rect })
                          }}
                          title={t('inquiries.table.more', 'More')} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#636366] hover:text-white transition-colors">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail row — full-width drawer showing
                      contact details, AI brief, notes, and next-task
                      summary. Collapses by default; one row expanded at
                      a time keeps page height bounded. Phase 2: each
                      field is inline-editable via EditableField; CRM
                      fields hit /v1/admin/guests/:id (partial PUT), lead
                      fields hit /v1/admin/inquiries/:id. */}
                  {isExpanded && (
                    <tr className="bg-dark-bg/40 border-b border-dark-border/50">
                      <td colSpan={expandColSpan} className="px-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] uppercase tracking-wider text-t-secondary font-bold">{t('inquiries.row.expanded.customer', 'Customer')}</div>
                              {inq.guest?.id && (
                                <button
                                  type="button"
                                  onClick={() => setCustomerDrawerGuestId(inq.guest.id)}
                                  className="inline-flex items-center gap-1 text-[10px] text-primary-400 hover:text-primary-300 normal-case tracking-normal"
                                >
                                  <UserCircle2 size={11} /> {t('inquiries.row.expanded.view_full_customer', 'View full customer')}
                                </button>
                              )}
                            </div>
                            {inq.guest?.id ? (
                              <>
                                <div>
                                  <div className="text-[10px] text-t-secondary mb-0.5">{t('inquiries.row.expanded.company', 'Company')}</div>
                                  <EditableField
                                    value={inq.guest.company ?? ''}
                                    onSave={async (v) => {
                                      await api.put(`/v1/admin/guests/${inq.guest.id}`, { company: v })
                                      qc.invalidateQueries({ queryKey: ['inquiries'] })
                                    }}
                                  />
                                </div>
                                <div>
                                  <div className="text-[10px] text-t-secondary mb-0.5">VIP</div>
                                  <EditableField
                                    variant="select"
                                    value={inq.guest.vip_level ?? ''}
                                    options={[
                                      { value: 'Standard', label: 'Standard' },
                                      { value: 'Silver', label: 'Silver' },
                                      { value: 'Gold', label: 'Gold' },
                                      { value: 'Diamond', label: 'Diamond' },
                                    ]}
                                    onSave={async (v) => {
                                      await api.put(`/v1/admin/guests/${inq.guest.id}`, { vip_level: v })
                                      qc.invalidateQueries({ queryKey: ['inquiries'] })
                                    }}
                                  />
                                </div>
                                <div>
                                  <div className="text-[10px] text-t-secondary mb-0.5">{t('inquiries.row.expanded.nationality', 'Nationality')}</div>
                                  <EditableField
                                    value={inq.guest.nationality ?? ''}
                                    onSave={async (v) => {
                                      await api.put(`/v1/admin/guests/${inq.guest.id}`, { nationality: v })
                                      qc.invalidateQueries({ queryKey: ['inquiries'] })
                                    }}
                                  />
                                </div>
                              </>
                            ) : (
                              <div className="text-gray-700 italic text-[11px]">{t('inquiries.row.expanded.no_guest_linked', 'No guest linked')}</div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="text-[10px] uppercase tracking-wider text-t-secondary font-bold">{t('inquiries.row.expanded.opportunity', 'Opportunity')}</div>
                            {inq.property?.name && <div className="text-gray-300 px-2.5"><span className="text-t-secondary">{t('inquiries.row.expanded.property', 'Property')}: </span>{inq.property.name}</div>}
                            <div>
                              <div className="text-[10px] text-t-secondary mb-0.5">{t('inquiries.row.expanded.owner', 'Owner')}</div>
                              <EditableField
                                variant="select"
                                value={inq.assigned_to ?? ''}
                                options={settings.lead_owners.map(o => ({ value: o, label: o }))}
                                onSave={async (v) => {
                                  await api.put(`/v1/admin/inquiries/${inq.id}`, { assigned_to: v })
                                  qc.invalidateQueries({ queryKey: ['inquiries'] })
                                }}
                              />
                            </div>
                            <div>
                              <div className="text-[10px] text-t-secondary mb-0.5">{t('inquiries.row.expanded.source', 'Source')}</div>
                              <EditableField
                                value={inq.source ?? ''}
                                onSave={async (v) => {
                                  await api.put(`/v1/admin/inquiries/${inq.id}`, { source: v })
                                  qc.invalidateQueries({ queryKey: ['inquiries'] })
                                }}
                              />
                            </div>
                            <div>
                              <div className="text-[10px] text-t-secondary mb-0.5">{t('inquiries.row.expanded.type', 'Type')}</div>
                              <EditableField
                                variant="select"
                                value={inq.inquiry_type ?? ''}
                                options={settings.inquiry_types.map(it => ({ value: it, label: it }))}
                                onSave={async (v) => {
                                  await api.put(`/v1/admin/inquiries/${inq.id}`, { inquiry_type: v })
                                  qc.invalidateQueries({ queryKey: ['inquiries'] })
                                }}
                              />
                            </div>
                            {inq.last_contacted_at && <div className="text-gray-300 px-2.5"><span className="text-t-secondary">{t('inquiries.row.expanded.last_contact', 'Last contact')}: </span>{new Date(inq.last_contacted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                          </div>
                          <div className="space-y-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-t-secondary font-bold flex items-center justify-between">
                              <span>{t('inquiries.row.expanded.next_task', 'Next task')}</span>
                              <button
                                onClick={() => setTaskDrawer({ inquiryId: inq.id })}
                                className="text-[10px] text-primary-400 hover:text-primary-300 inline-flex items-center gap-1 normal-case tracking-normal"
                              >
                                <Plus size={10} /> {t('inquiries.row.expanded.add_task', 'Add task')}
                              </button>
                            </div>
                            {inq.next_task_type && !inq.next_task_completed ? (
                              <div className={`rounded-lg border p-3 ${isOverdue ? 'border-red-500/40 bg-red-500/5' : 'border-dark-border bg-dark-surface2'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <ListChecks size={12} className={isOverdue ? 'text-red-400' : 'text-amber-400'} />
                                  <span className="text-white font-semibold">{inq.next_task_type}</span>
                                </div>
                                {inq.next_task_due && <div className={isOverdue ? 'text-red-400' : 'text-t-secondary'}>{t('inquiries.row.expanded.due', 'Due')} {inq.next_task_due}</div>}
                                {inq.next_task_notes && <div className="text-t-secondary mt-1 italic line-clamp-2">{inq.next_task_notes}</div>}
                                <div className="flex items-center gap-3 mt-2">
                                  <button
                                    onClick={() => completeMutation.mutate(inq.id)}
                                    className="text-[11px] text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                                  >
                                    <CheckCircle2 size={11} /> {t('inquiries.row.expanded.mark_done', 'Mark done')}
                                  </button>
                                  <button
                                    onClick={() => setTaskDrawer({ inquiryId: inq.id, task: {
                                      id: 0,
                                      inquiry_id: inq.id,
                                      title: inq.next_task_type,
                                      due_at: inq.next_task_due,
                                      notes: inq.next_task_notes,
                                    } })}
                                    className="text-[11px] text-primary-400 hover:text-primary-300 inline-flex items-center gap-1"
                                  >
                                    {t('inquiries.row.expanded.edit', 'Edit')}
                                  </button>
                                  <button
                                    onClick={() => cancelNextTaskMutation.mutate(inq.id)}
                                    className="text-[11px] text-red-400 hover:text-red-300 inline-flex items-center gap-1 ml-auto"
                                  >
                                    <XIcon size={10} /> {t('inquiries.row.expanded.cancel_task', 'Cancel')}
                                  </button>
                                </div>
                              </div>
                            ) : inq.next_task_completed ? (
                              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2">
                                <CheckCircle2 size={12} className="text-emerald-400" />
                                <span className="text-emerald-400">{t('inquiries.row.expanded.task_done', 'Task complete')}</span>
                              </div>
                            ) : (
                              <div className="text-gray-700 italic">{t('inquiries.row.expanded.no_task', 'No task scheduled. Click Add task to create one.')}</div>
                            )}
                            <div className="pt-2">
                              <div className="text-[10px] uppercase tracking-wider text-t-secondary font-bold mb-1">{t('inquiries.row.expanded.notes', 'Notes')}</div>
                              <EditableField
                                variant="textarea"
                                value={inq.notes ?? ''}
                                placeholder={t('inquiries.row.expanded.notes_placeholder', 'Add notes…')}
                                onSave={async (v) => {
                                  await api.put(`/v1/admin/inquiries/${inq.id}`, { notes: v })
                                  qc.invalidateQueries({ queryKey: ['inquiries'] })
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setInquiryDrawerId(inq.id)}
                              className="inline-flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300 pt-1"
                            >
                              <Eye size={11} /> {t('inquiries.row.expanded.open_detail', 'Open in panel')}
                            </button>
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
            // Borrow the column tint from the first card's
            // pipeline_stage.color when one is set — gives custom
            // pipelines (renamed stages, recolored stages) a column
            // header that matches the row pill on the list view. Falls
            // back to STATUS_COLORS for orgs without custom stages.
            const stageColor: string | null = cards.find((c: any) => c.pipeline_stage?.color)?.pipeline_stage?.color ?? null
            const columnTotal = cards.reduce((sum: number, c: any) => sum + (Number(c.total_value) || 0), 0)
            const isDropTarget = dragging !== null
            return (
              <div key={col}
                onDragOver={e => { if (dragging !== null) e.preventDefault() }}
                onDrop={e => {
                  e.preventDefault()
                  if (dragging !== null) statusMutation.mutate({ id: dragging, status: col })
                }}
                className={`flex-shrink-0 w-[280px] rounded-2xl border flex flex-col transition-all ${isDropTarget ? 'border-primary-400/40 ring-1 ring-primary-400/20' : 'border-white/[0.06]'}`}
                style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))' }}>
                <div className="px-3 py-2.5 border-b border-white/[0.06] sticky top-0 z-10"
                  style={{ background: 'rgba(14,20,18,0.98)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider truncate ${stageColor ? 'border' : (STATUS_COLORS[col] ?? 'bg-gray-500/20 text-t-secondary')}`}
                      style={stageColor ? { background: stageColor + '20', color: stageColor, border: `1px solid ${stageColor}40` } : undefined}
                    >
                      {col}
                    </span>
                    <span className="text-[10px] text-gray-500 font-bold tabular-nums flex-shrink-0">{cards.length}</span>
                  </div>
                  {columnTotal > 0 && (
                    <div className="mt-1 text-[10px] text-gray-500 tabular-nums">
                      {settings.currency_symbol}{columnTotal.toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="flex-1 p-2 space-y-2 min-h-[120px]">
                  {cards.length === 0 && (
                    <div className={`text-center text-[10px] py-4 transition-colors ${isDropTarget ? 'text-primary-400/70' : 'text-gray-700'}`}>
                      {isDropTarget ? t('inquiries.table.drop_here', 'Drop here →') : t('inquiries.table.drop_cards_here', 'Drop cards here')}
                    </div>
                  )}
                  {cards.map((inq: any) => {
                    const isDragging = dragging === inq.id
                    // Mirror the list-row visual language: AI score chip,
                    // age/freshness chip, priority left-edge stripe, value
                    // pill. Computations duplicate the list-view block by
                    // design — the row-level logic is small and inlining
                    // it keeps the kanban + list code paths independently
                    // tunable.
                    const score: number | null = (typeof inq.ai_win_probability === 'number') ? inq.ai_win_probability : null
                    const scoreColor = score == null
                      ? null
                      : score >= 70 ? { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' }
                        : score >= 40 ? { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' }
                        : { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
                    const createdAt = inq.created_at ? new Date(inq.created_at) : null
                    const lastContact = inq.last_contacted_at ? new Date(inq.last_contacted_at) : null
                    const ageDays = createdAt ? Math.floor((Date.now() - createdAt.getTime()) / 86_400_000) : null
                    const daysSinceContact = lastContact ? Math.floor((Date.now() - lastContact.getTime()) / 86_400_000) : null
                    const isClosedKind = inq.pipeline_stage?.kind === 'won' || inq.pipeline_stage?.kind === 'lost'
                    const ageChip = (ageDays === null || isClosedKind)
                      ? null
                      : ageDays < 1
                        ? { label: t('inquiries.row.age_fresh', 'Fresh'), cls: 'text-emerald-300/90 bg-emerald-500/10 border-emerald-500/20' }
                        : ((daysSinceContact === null && ageDays >= 7) || (daysSinceContact !== null && daysSinceContact >= 7))
                          ? { label: t('inquiries.row.age_cold', { d: daysSinceContact ?? ageDays, defaultValue: 'Cold {{d}}d' }), cls: 'text-amber-300/90 bg-amber-500/10 border-amber-500/20' }
                          : { label: t('inquiries.row.age_days', { d: ageDays, defaultValue: '{{d}}d old' }), cls: 'text-gray-500 bg-white/[0.02] border-white/10' }
                    const priorityStripe = inq.priority === 'High'
                      ? 'inset 3px 0 0 #ef4444'
                      : inq.priority === 'Medium'
                        ? 'inset 3px 0 0 #3b82f6'
                        : null
                    const isTaskOverdue = inq.next_task_due && !inq.next_task_completed && new Date(inq.next_task_due) < new Date()
                    return (
                      <div key={inq.id}
                        draggable
                        onDragStart={() => setDragging(inq.id)}
                        onDragEnd={() => setDragging(null)}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 cursor-grab active:cursor-grabbing hover:border-white/15 hover:bg-white/[0.04] transition-all"
                        style={{
                          opacity: isDragging ? 0.4 : 1,
                          boxShadow: priorityStripe ?? undefined,
                        }}>
                        <div className="flex items-start gap-2 mb-1.5">
                          {scoreColor && (
                            <span
                              className={`flex-shrink-0 inline-flex items-center justify-center w-7 h-6 rounded-md text-[10px] font-bold tabular-nums border ${scoreColor.bg} ${scoreColor.text} ${scoreColor.border}`}
                              title={t('inquiries.score.tooltip', 'AI win probability')}
                            >
                              {score}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {inq.guest?.id ? (
                                <Link
                                  to={`/guests/${inq.guest.id}`}
                                  className="text-sm font-semibold text-white hover:text-primary-300 truncate transition-colors"
                                  onClick={e => e.stopPropagation()}
                                  draggable={false}
                                >
                                  {inq.guest?.full_name ?? '—'}
                                </Link>
                              ) : (
                                <div className="text-sm font-semibold text-white truncate">{inq.guest?.full_name ?? '—'}</div>
                              )}
                              {ageChip && (
                                <span
                                  className={`flex-shrink-0 inline-flex items-center text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${ageChip.cls}`}
                                >
                                  {ageChip.label}
                                </span>
                              )}
                            </div>
                            {inq.guest?.company && <div className="text-[11px] text-gray-500 truncate">{inq.guest.company}</div>}
                          </div>
                        </div>
                        {/* Contact text on the kanban card so staff can scan
                            without opening detail. Click pills below still
                            handle the action side. */}
                        {(inq.guest?.email || inq.guest?.phone || inq.guest?.mobile) && (
                          <div className="text-[10px] text-gray-500 truncate mb-1.5 space-x-1.5">
                            {inq.guest?.email && <span>{inq.guest.email}</span>}
                            {(inq.guest?.phone || inq.guest?.mobile) && <span>· {inq.guest.phone || inq.guest.mobile}</span>}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-400">
                          {inq.check_in && <span>{inq.check_in}{inq.check_out ? ` → ${inq.check_out}` : ''}</span>}
                          {inq.num_rooms && <span>{inq.num_rooms} room{inq.num_rooms === 1 ? '' : 's'}</span>}
                          {inq.source && SOURCE_BADGES[inq.source] && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${SOURCE_BADGES[inq.source].cls}`}>{SOURCE_BADGES[inq.source].label}</span>
                          )}
                          {inq.total_value && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-300 text-[11px] font-bold tabular-nums ml-auto">
                              {settings.currency_symbol}{Number(inq.total_value).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {(inq.guest?.email || inq.guest?.phone) && (
                          <div className="mt-2">
                            <ContactActions email={inq.guest?.email} phone={inq.guest?.phone || inq.guest?.mobile} compact />
                          </div>
                        )}
                        {inq.next_task_type && !inq.next_task_completed && (
                          <div className="mt-2 flex items-center gap-1 text-[10px]">
                            <AlertCircle size={10} className={isTaskOverdue ? 'text-red-400' : 'text-amber-400'} />
                            <span className={isTaskOverdue ? 'text-red-400 font-semibold' : 'text-gray-400'}>{inq.next_task_type}</span>
                            {inq.next_task_due && <span className={isTaskOverdue ? 'text-red-400/70' : 'text-gray-600'}>· {inq.next_task_due}</span>}
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
      <AddInquiryDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { /* invalidation happens inside the drawer */ }}
        properties={properties}
        settings={settings as any}
        fieldCfg={fieldCfg as any}
        customerFormCfg={settings.customer_fields.form}
      />

      {/* Legacy centered Add Inquiry modal — kept compiled but no longer
          rendered. The new AddInquiryDrawer above replaces it: left-side
          slide, sectioned design with icon tiles, inline new-customer
          path, and collapsible Deal/Notes sections. Hidden behind a
          permanent `false &&` so we can delete the block in a follow-up
          once the drawer settles. */}
      {false && showCreate && (
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
                errors={cfErrors}
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
                {/* Open the lead in the new left-side drawer instead of
                    navigating to /inquiries/:id (the standalone page is
                    being phased out — the drawer carries the same edits). */}
                <button onClick={() => { const id = openMenu.id; setOpenMenu(null); setInquiryDrawerId(id) }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-gray-300 hover:bg-white/[0.06]">
                  <Eye size={12} /> {t('inquiries.menu.open_lead', 'Open lead details')}
                </button>
                {inq.guest?.id && (
                  <button onClick={() => { const gid = inq.guest!.id; setOpenMenu(null); setCustomerDrawerGuestId(gid) }}
                    className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-gray-300 hover:bg-white/[0.06]">
                    <UserCircle2 size={12} /> {t('inquiries.menu.edit_customer', 'Edit customer details')}
                  </button>
                )}
                <div className="my-1 h-px bg-white/10" />
                <button
                  onClick={async () => {
                    const id = openMenu.id
                    const name = inq.guest?.full_name || `Lead #${id}`
                    setOpenMenu(null)
                    let impact: any = undefined
                    try {
                      const res = await api.get(`/v1/admin/inquiries/${id}/delete-impact`)
                      impact = res.data
                    } catch { /* fall through with no impact */ }
                    setDeleteTarget({ id, name, impact })
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-red-400 hover:bg-red-500/10">
                  <Trash2 size={12} /> {t('inquiries.actions.delete_lead', 'Delete lead')}
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
          {/* Set stage — full status taxonomy beyond Won/Lost. The
              picker reads inquiry_statuses from settings so the list
              tracks whatever pipeline preset the org applied. */}
          <select onChange={e => {
              if (!e.target.value) return
              runBulk('set_status', e.target.value)
              e.currentTarget.value = ''
            }} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 disabled:opacity-50 transition-colors cursor-pointer"
            style={{ colorScheme: 'dark' }}
            defaultValue="">
            <option value="" disabled>{t('inquiries.bulk.set_stage', 'Set stage…')}</option>
            {settings.inquiry_statuses.map(s => <option key={s} value={s} style={{ background: '#0f1c18', color: '#fff' }}>{s}</option>)}
          </select>
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
          <button onClick={() => setBulkDeleteOpen(true)} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50 transition-colors">
            <Trash2 size={13} /> {t('inquiries.bulk.delete', 'Delete')}
          </button>
          <div className="h-5 w-px bg-white/10" />
          <button onClick={() => setSelected(new Set())} title={t('inquiries.bulk.clear_tooltip', 'Clear selection (Esc)')}
            className="flex items-center gap-1.5 p-1.5 px-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06]">
            <XIcon size={14} />
            <span className="hidden md:inline text-[10px] font-mono uppercase opacity-60">Esc</span>
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

      {taskDrawer && (
        <TaskDrawer
          task={taskDrawer.task}
          defaultInquiryId={taskDrawer.inquiryId}
          onClose={() => setTaskDrawer(null)}
          onSaved={() => {
            setTaskDrawer(null)
            qc.invalidateQueries({ queryKey: ['inquiries'] })
            qc.invalidateQueries({ queryKey: ['inquiries-today'] })
            qc.invalidateQueries({ queryKey: ['inquiries-kpis'] })
          }}
        />
      )}

      {/* Left-side lead drawer — opened by clicking a row or via the
          kebab "Open lead details". Replaces the broken
          "Open full detail" link that pointed at /inquiries/:id
          (that route 404'd because the standalone show endpoint isn't
          wired). We pass the inquiry from the already-loaded list
          instead of re-fetching — fresh data flows through when the
          list refetches after edits. */}
      <InquiryDrawer
        open={inquiryDrawerId !== null}
        inquiry={inquiryDrawerId !== null ? allInquiries.find((i: any) => i.id === inquiryDrawerId) : null}
        onClose={() => setInquiryDrawerId(null)}
        onInquiryUpdated={() => qc.invalidateQueries({ queryKey: ['inquiries'] })}
        onInquiryDeleted={() => {
          setInquiryDrawerId(null)
          qc.invalidateQueries({ queryKey: ['inquiries'] })
        }}
        onRequestCustomerDrawer={(gid) => setCustomerDrawerGuestId(gid)}
      />

      {/* Right-side drawer mounted from the expanded-row "View full
          customer" link, the row kebab "Edit customer", or the
          InquiryDrawer's "Open in customer drawer". Diff-PUTs against
          /v1/admin/guests/:id. */}
      <CustomerDrawer
        open={customerDrawerGuestId !== null}
        guestId={customerDrawerGuestId}
        onClose={() => setCustomerDrawerGuestId(null)}
        onGuestUpdated={() => qc.invalidateQueries({ queryKey: ['inquiries'] })}
        onGuestDeleted={() => {
          setCustomerDrawerGuestId(null)
          qc.invalidateQueries({ queryKey: ['inquiries'] })
        }}
      />

      {/* Single-lead delete confirmation. Impact pre-fetched from
          /v1/admin/inquiries/{id}/delete-impact and shown as a
          blast-radius list inside the modal. */}
      <DeleteConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('inquiries.delete_lead.title', 'Delete lead?')}
        entityName={deleteTarget?.name || ''}
        impacts={deleteTarget?.impact
          ? Object.entries(deleteTarget.impact)
              .filter(([k, v]) => k !== 'warnings' && Number(v) > 0)
              .map(([k, v]) => `${v} ${k}`)
          : []}
        onConfirm={async () => {
          if (!deleteTarget) return
          await api.delete(`/v1/admin/inquiries/${deleteTarget.id}`)
          toast.success(t('inquiries.toasts.deleted', 'Lead deleted'))
          qc.invalidateQueries({ queryKey: ['inquiries'] })
          setDeleteTarget(null)
        }}
        mode="simple"
      />

      {/* Bulk delete — count-based warning, no per-row impact fetch
          (would be N round trips). Hits the bulk endpoint with
          action='delete' (backend phase 1 accepts this verb). */}
      <DeleteConfirmModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title={t('inquiries.bulk_delete.title', 'Delete leads?')}
        entityName={t('inquiries.bulk_delete.entity', '{{n}} leads', { n: selected.size, defaultValue: '{{n}} leads' })}
        impacts={[
          t('inquiries.bulk_delete.impact_count', '{{n}} lead records will be permanently removed', { n: selected.size, defaultValue: '{{n}} lead records will be permanently removed' }),
        ]}
        onConfirm={async () => {
          try {
            await api.post('/v1/admin/inquiries/bulk', {
              action: 'delete',
              ids: Array.from(selected),
            })
            toast.success(t('inquiries.toasts.bulk_deleted', '{{n}} leads deleted', { n: selected.size, defaultValue: '{{n}} leads deleted' }))
            setSelected(new Set())
            qc.invalidateQueries({ queryKey: ['inquiries'] })
            qc.invalidateQueries({ queryKey: ['inquiries-today'] })
            qc.invalidateQueries({ queryKey: ['inquiries-kpis'] })
            setBulkDeleteOpen(false)
          } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Bulk delete failed')
          }
        }}
        mode="simple"
      />
    </div>
  )
}

/**
 * Compact next-task card for the leads list. Renders three states:
 *   - Active task → title + due chip + Done / Edit / Cancel icon buttons
 *   - Completed   → green badge + "Add another" hint
 *   - Empty       → "+ Add task" placeholder
 *
 * Due date is normalised to a human "Today / Tomorrow / Mar 15 / Overdue"
 * label so the raw ISO `2026-05-15T00:00:00.000000Z` never reaches the
 * user. Icons replace the verb labels for a tighter row.
 */
function NextTaskCard({
  inquiry: inq,
  isOverdue,
  onAdd, onEdit, onComplete, onCancel,
  t,
}: {
  inquiry: any
  isOverdue: boolean
  onAdd: () => void
  onEdit: () => void
  onComplete: () => void
  onCancel: () => void
  t: any
}) {
  if (inq.next_task_completed) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 size={10} /> {t('inquiries.table.task_done', 'Done')}
        </span>
        <button type="button" onClick={onAdd}
          className="text-[10px] text-[#636366] hover:text-primary-400 inline-flex items-center gap-1">
          <Plus size={10} /> {t('inquiries.table.add_another', 'Add another')}
        </button>
      </div>
    )
  }
  if (!inq.next_task_type) {
    return (
      <button type="button" onClick={onAdd}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-dark-border text-[11px] text-[#636366] hover:text-primary-400 hover:border-primary-500/50 transition-colors">
        <Plus size={11} /> {t('inquiries.table.add_task', 'Add task')}
      </button>
    )
  }

  const due = inq.next_task_due ? new Date(inq.next_task_due) : null
  let dueLabel: string | null = null
  if (due && !isNaN(due.getTime())) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const d2 = new Date(due); d2.setHours(0, 0, 0, 0)
    const diffDays = Math.round((d2.getTime() - today.getTime()) / 86_400_000)
    if (diffDays < 0)      dueLabel = t('inquiries.table.due_overdue', 'Overdue')
    else if (diffDays === 0) dueLabel = t('inquiries.table.due_today', 'Today')
    else if (diffDays === 1) dueLabel = t('inquiries.table.due_tomorrow', 'Tomorrow')
    else if (diffDays < 7)   dueLabel = due.toLocaleDateString(undefined, { weekday: 'short' })
    else                     dueLabel = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 ${isOverdue ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-dark-border bg-white/[0.02]'}`}>
      <div className="min-w-0">
        <button type="button" onClick={onEdit}
          className="text-xs font-medium text-white hover:text-primary-400 truncate text-left block max-w-[160px]"
          title={inq.next_task_type}>
          {inq.next_task_type}
        </button>
        {dueLabel && (
          <div className={`text-[10px] font-semibold ${isOverdue ? 'text-red-400' : 'text-[#9a9aa0]'}`}>
            {dueLabel}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 pl-1 border-l border-dark-border">
        <button type="button" onClick={onComplete}
          title={t('inquiries.table.mark_done', 'Mark done')}
          className="p-1 rounded hover:bg-emerald-500/15 text-emerald-400 transition-colors">
          <CheckCircle2 size={12} />
        </button>
        <button type="button" onClick={onEdit}
          title={t('inquiries.table.edit_task', 'Edit task')}
          className="p-1 rounded hover:bg-primary-500/15 text-primary-400 transition-colors">
          <Pencil size={11} />
        </button>
        <button type="button" onClick={onCancel}
          title={t('inquiries.table.cancel_task', 'Cancel task')}
          className="p-1 rounded hover:bg-red-500/15 text-red-400 transition-colors">
          <XIcon size={12} />
        </button>
      </div>
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

function HeaderMenu({
  focusMode,
  onToggleFocus,
  onCapture,
  onExport,
  exporting,
  t,
}: {
  focusMode: boolean
  onToggleFocus: () => void
  onCapture: () => void
  onExport: () => void
  exporting: boolean
  t: (k: string, def: string) => string
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    window.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') setOpen(false) })
    return () => window.removeEventListener('click', close)
  }, [open])

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        title={t('inquiries.actions.more_tooltip', 'More — Focus, AI Capture, Export, Insights')}
        aria-label={t('inquiries.actions.more_label', 'More actions')}
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-dark-surface border border-dark-border text-t-secondary hover:text-white hover:border-primary-500/40 transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-dark-border bg-[#1a1a1a] shadow-2xl py-1.5 z-30">
          <button
            onClick={() => { onToggleFocus(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-t-secondary hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            {focusMode ? <EyeOff size={14} className="text-primary-400" /> : <Eye size={14} />}
            <span className="flex-1 text-left">{focusMode ? t('inquiries.focus.exit_label', 'Exit focus mode') : t('inquiries.focus.enter_label', 'Focus mode')}</span>
            {focusMode && <span className="text-[9px] uppercase tracking-wider text-primary-400 font-bold">On</span>}
          </button>
          <button
            onClick={() => { onCapture(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-t-secondary hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            <Sparkles size={14} className="text-purple-400" />
            <span className="flex-1 text-left">{t('inquiries.actions.ai_capture', 'AI Capture')}</span>
          </button>
          <button
            onClick={() => { onExport(); setOpen(false) }}
            disabled={exporting}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-t-secondary hover:bg-white/[0.04] hover:text-white transition-colors disabled:opacity-50"
          >
            <Download size={14} />
            <span className="flex-1 text-left">{exporting ? t('inquiries.actions.exporting', 'Exporting…') : t('inquiries.actions.export', 'Export CSV')}</span>
          </button>
          <div className="h-px bg-dark-border my-1" />
          <Link
            to="/pipeline?tab=insights"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-t-secondary hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            <Sparkles size={14} className="text-amber-400" />
            <span className="flex-1 text-left">{t('inquiries.quick_stats.insights', 'Insights dashboard')}</span>
          </Link>
        </div>
      )}
    </div>
  )
}
