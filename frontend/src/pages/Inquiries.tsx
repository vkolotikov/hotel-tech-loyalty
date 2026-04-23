import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings, triggerExport } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import { Plus, Search, ChevronLeft, ChevronRight, CheckCircle2, Download, Filter, AlertCircle, Sparkles, Loader2 } from 'lucide-react'

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
}

export function Inquiries() {
  const qc = useQueryClient()
  const settings = useSettings()
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

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/inquiries', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inquiries'] }); setShowCreate(false); setForm({ ...EMPTY_FORM }); toast.success('Inquiry created') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const completeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/inquiries/${id}/complete-task`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inquiries'] }); toast.success('Task completed') },
  })

  const handleExport = async () => {
    setExporting(true)
    try { await triggerExport('/v1/admin/inquiries/export', params) }
    catch { toast.error('Export failed') } finally { setExporting(false) }
  }

  const inquiries = data?.data ?? []
  const meta = data?.meta ?? {}
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
          <h1 className="text-xl md:text-2xl font-bold text-white">Leads &amp; Inquiries</h1>
          <p className="text-xs md:text-sm text-t-secondary mt-0.5">{meta.total ?? 0} total</p>
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

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search guest, company..." className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={filterSel}>
            <option value="">All Statuses</option>
            {settings.inquiry_statuses.map(s => <option key={s}>{s}</option>)}
          </select>
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

      {/* Table */}
      <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Guest</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Property</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Source</th>
                <SortHeader col="check_in" label="Check-in" />
                <SortHeader col="check_out" label="Check-out" />
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Nights</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Rooms</th>
                <SortHeader col="total_value" label="Total Value" />
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary whitespace-nowrap">Assigned</th>
                <SortHeader col="next_task_due" label="Next Task" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={14} className="px-4 py-8 text-center text-[#636366]">Loading...</td></tr>}
              {!isLoading && inquiries.length === 0 && <tr><td colSpan={14} className="px-4 py-8 text-center text-[#636366]">No inquiries found</td></tr>}
              {inquiries.map((inq: any) => {
                const isOverdue = inq.next_task_due && !inq.next_task_completed && new Date(inq.next_task_due) < new Date()
                const nights = inq.check_in && inq.check_out
                  ? Math.max(0, Math.round((new Date(inq.check_out).getTime() - new Date(inq.check_in).getTime()) / 86400000))
                  : null
                return (
                  <tr key={inq.id} className={`border-b border-dark-border/50 hover:bg-dark-surface2 transition-colors ${isOverdue ? 'bg-red-500/5' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white whitespace-nowrap">{inq.guest?.full_name ?? '—'}</div>
                      <div className="text-xs text-[#636366]">{inq.guest?.company ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 text-[#a0a0a0] text-xs whitespace-nowrap">{inq.property?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-[#a0a0a0] text-xs whitespace-nowrap">{inq.inquiry_type ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inq.source ? (
                        SOURCE_BADGES[inq.source] ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_BADGES[inq.source].cls}`}>{SOURCE_BADGES[inq.source].label}</span>
                        ) : (
                          <span className="text-xs text-[#a0a0a0]">{inq.source}</span>
                        )
                      ) : <span className="text-xs text-[#636366]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[#a0a0a0] text-xs whitespace-nowrap">{inq.check_in ?? '—'}</td>
                    <td className="px-4 py-3 text-[#a0a0a0] text-xs whitespace-nowrap">{inq.check_out ?? '—'}</td>
                    <td className="px-4 py-3 text-[#a0a0a0] text-xs text-center">{nights ?? '—'}</td>
                    <td className="px-4 py-3 text-[#a0a0a0] text-xs text-center">{inq.num_rooms ?? '—'}</td>
                    <td className="px-4 py-3 text-[#a0a0a0]">{inq.total_value ? `${settings.currency_symbol}${Number(inq.total_value).toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[inq.status] ?? 'bg-gray-500/20 text-t-secondary'}`}>
                        {inq.status}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${PRIORITY_COLORS[inq.priority] ?? 'text-t-secondary'}`}>{inq.priority}</td>
                    <td className="px-4 py-3 text-[#a0a0a0] text-xs whitespace-nowrap">{inq.assigned_to ?? '—'}</td>
                    <td className="px-4 py-3">
                      {inq.next_task_type && !inq.next_task_completed ? (
                        <div className="flex items-center gap-1">
                          {isOverdue && <AlertCircle size={11} className="text-red-400 flex-shrink-0" />}
                          <div>
                            <div className="text-xs text-gray-300 whitespace-nowrap">{inq.next_task_type}</div>
                            {inq.next_task_due && <div className={`text-xs ${isOverdue ? 'text-red-400' : 'text-[#636366]'}`}>{inq.next_task_due}</div>}
                          </div>
                        </div>
                      ) : inq.next_task_completed ? (
                        <span className="text-xs text-green-400">Done</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {inq.next_task_type && !inq.next_task_completed && (
                        <button onClick={() => completeMutation.mutate(inq.id)} title="Mark task done" className="p-1.5 rounded-lg hover:bg-green-500/10 text-[#636366] hover:text-green-400 transition-colors">
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-t-secondary">Page {meta.current_page} of {meta.last_page}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-4">Add Inquiry</h2>
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
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Inquiry Type</label>
                  <select value={form.inquiry_type} onChange={e => setForm(f => ({ ...f, inquiry_type: e.target.value }))} className={inp}>
                    <option value="">-- Select --</option>
                    {settings.inquiry_types.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Source</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} className={inp}>
                    <option value="">-- None --</option>
                    {settings.lead_sources.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Check-in</label>
                  <input type="date" value={form.check_in} onChange={e => setForm(f => ({ ...f, check_in: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Check-out</label>
                  <input type="date" value={form.check_out} onChange={e => setForm(f => ({ ...f, check_out: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Rooms</label>
                  <input type="number" value={form.num_rooms} onChange={e => setForm(f => ({ ...f, num_rooms: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Room Type</label>
                  <select value={form.room_type_requested} onChange={e => setForm(f => ({ ...f, room_type_requested: e.target.value }))} className={inp}>
                    <option value="">-- Select --</option>
                    {settings.room_types.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Rate ({settings.currency_symbol})</label>
                  <input type="number" step="0.01" value={form.rate_offered} onChange={e => setForm(f => ({ ...f, rate_offered: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Total Value ({settings.currency_symbol})</label>
                  <input type="number" step="0.01" value={form.total_value} onChange={e => setForm(f => ({ ...f, total_value: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inp}>
                    {settings.inquiry_statuses.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inp}>
                    {settings.priorities.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Assigned To</label>
                  <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className={inp}>
                    <option value="">-- None --</option>
                    {settings.lead_owners.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

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

              <div>
                <label className="block text-xs text-[#a0a0a0] mb-1">Special Requests</label>
                <textarea value={form.special_requests} onChange={e => setForm(f => ({ ...f, special_requests: e.target.value }))} rows={2} className={`${inp} resize-none`} />
              </div>
              <div>
                <label className="block text-xs text-[#a0a0a0] mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={`${inp} resize-none`} />
              </div>
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

function GuestPicker({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

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
      {open && guests.length > 0 && !value && (
        <div className="absolute z-10 mt-1 w-full bg-dark-surface border border-dark-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
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
        </div>
      )}
    </div>
  )
}
