import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings, triggerExport } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import { Plus, Search, ChevronLeft, ChevronRight, Trash2, Download, Filter, Sparkles, Loader2, Link2, RefreshCw } from 'lucide-react'
import { CustomFieldsForm } from '../components/CustomFields'

const VIP_COLORS: Record<string, string> = {
  Standard: 'bg-gray-500/20 text-gray-400',
  Silver: 'bg-slate-400/20 text-slate-300',
  Gold: 'bg-amber-500/20 text-amber-400',
  Platinum: 'bg-purple-500/20 text-purple-400',
  Diamond: 'bg-cyan-500/20 text-cyan-400',
}

const SOURCE_COLORS: Record<string, string> = {
  'Chat Widget':    'bg-blue-500/20 text-blue-300',
  'Booking Widget': 'bg-emerald-500/20 text-emerald-300',
  'Booking Form':   'bg-emerald-500/20 text-emerald-300',
  'Email':          'bg-indigo-500/20 text-indigo-300',
  'Manual':         'bg-gray-500/20 text-gray-300',
  'Manual Entry':   'bg-gray-500/20 text-gray-300',
  'Referral':       'bg-pink-500/20 text-pink-300',
  'Walk-in':        'bg-orange-500/20 text-orange-300',
}

const LIFECYCLE_COLORS: Record<string, string> = {
  Lead:     'bg-amber-500/20 text-amber-300',
  Prospect: 'bg-yellow-500/20 text-yellow-300',
  Customer: 'bg-emerald-500/20 text-emerald-300',
  Repeat:   'bg-cyan-500/20 text-cyan-300',
  Inactive: 'bg-gray-500/20 text-gray-400',
}

const EMPTY_FORM = {
  salutation: '', first_name: '', last_name: '', full_name: '', email: '', phone: '', mobile: '',
  company: '', nationality: '', country: '', guest_type: '', vip_level: 'Standard', lead_source: '', notes: '',
  custom_data: {} as Record<string, any>,
}

export function Guests() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const settings = useSettings()
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [guestType, setGuestType] = useState('')
  const [vipLevel, setVipLevel] = useState('')
  const [lifecycle, setLifecycle] = useState('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [exporting, setExporting] = useState(false)
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState('desc')
  // AI capture
  const [showCapture, setShowCapture] = useState(false)
  const [captureText, setCaptureText] = useState('')
  const [captureLoading, setCaptureLoading] = useState(false)
  const [captureResult, setCaptureResult] = useState<any>(null)
  const [backfilling, setBackfilling] = useState(false)

  const params: any = { page, per_page: 25, sort, dir }
  if (search) params.search = search
  if (countryFilter) params.country = countryFilter
  if (guestType) params.guest_type = guestType
  if (vipLevel) params.vip_level = vipLevel
  if (lifecycle) params.lifecycle_status = lifecycle
  if (source) params.lead_source = source

  const { data, isLoading } = useQuery({
    queryKey: ['guests', params],
    queryFn: () => api.get('/v1/admin/guests', { params }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/guests', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['guests'] }); setShowCreate(false); setForm({ ...EMPTY_FORM }); toast.success(t('guests.toasts.created', 'Guest created')) },
    onError: (e: any) => toast.error(e.response?.data?.message || t('guests.toasts.error', 'Error')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/guests/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['guests'] }); toast.success(t('guests.toasts.deleted', 'Deleted')) },
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      await triggerExport('/v1/admin/guests/export', { search, country: countryFilter, guest_type: guestType, vip_level: vipLevel, lifecycle_status: lifecycle, lead_source: source })
    } catch { toast.error(t('guests.toasts.export_failed', 'Export failed')) } finally { setExporting(false) }
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    try {
      const res = await api.post('/v1/admin/guests/backfill-links')
      toast.success(res.data.message)
      qc.invalidateQueries({ queryKey: ['guests'] })
    } catch { toast.error(t('guests.toasts.backfill_failed', 'Backfill failed')) } finally { setBackfilling(false) }
  }

  const guests = data?.data ?? []
  const meta = { total: data?.total ?? 0, current_page: data?.current_page ?? 1, last_page: data?.last_page ?? 1 }
  const hasFilters = countryFilter || guestType || vipLevel || source || lifecycle

  const toggleSort = (col: string) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setDir('desc') }
  }

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary cursor-pointer hover:text-gray-300 select-none" onClick={() => toggleSort(col)}>
      {label} {sort === col ? (dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  const updateFullName = (f: typeof form, field: 'first_name' | 'last_name', value: string) => {
    const updated = { ...f, [field]: value }
    updated.full_name = [updated.first_name, updated.last_name].filter(Boolean).join(' ')
    return updated
  }

  const sel = 'w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const inp = sel
  const filterSel = 'bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('guests.title', 'Guests')}</h1>
          <p className="text-sm text-t-secondary mt-0.5">{t('guests.total_count', { count: meta.total ?? 0, defaultValue: '{{count}} total' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleBackfill} disabled={backfilling} className="flex items-center gap-2 bg-dark-surface border border-dark-border hover:border-blue-500 text-t-secondary hover:text-blue-400 font-medium text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-50" title={t('guests.actions.backfill_tooltip', 'Link unlinked guests to loyalty members by email match')}>
            {backfilling ? <RefreshCw size={14} className="animate-spin" /> : <Link2 size={14} />} {backfilling ? t('guests.actions.backfill_linking', 'Linking...') : t('guests.actions.backfill_links', 'Backfill Links')}
          </button>
          <button onClick={() => { setShowCapture(true); setCaptureResult(null); setCaptureText('') }} className="flex items-center gap-2 bg-purple-500/15 border border-purple-500/30 hover:border-purple-400 text-purple-400 hover:text-purple-300 font-medium text-sm px-3 py-2 rounded-lg transition-colors">
            <Sparkles size={14} /> {t('guests.actions.ai_capture', 'AI Capture')}
          </button>
          <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 bg-dark-surface border border-dark-border hover:border-primary-500 text-t-secondary hover:text-white font-medium text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            <Download size={14} /> {t('guests.actions.export', 'Export')}
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors">
            <Plus size={15} /> {t('guests.actions.add_guest', 'Add Guest')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder={t('guests.search_placeholder', 'Search name, email, phone, company...')} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <button onClick={() => setShowFilters(f => !f)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${hasFilters ? 'border-primary-500 text-primary-400' : 'border-dark-border text-t-secondary hover:text-white'}`}>
            <Filter size={14} /> {t('guests.filters_button', 'Filters')} {hasFilters ? '●' : ''}
          </button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-2 items-center">
            <select value={countryFilter} onChange={e => { setCountryFilter(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('guests.filters.all_countries', 'All Countries')}</option>
              {settings.countries.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={guestType} onChange={e => { setGuestType(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('guests.filters.all_guest_types', 'All Guest Types')}</option>
              {settings.guest_types.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={vipLevel} onChange={e => { setVipLevel(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('guests.filters.all_vip_levels', 'All VIP Levels')}</option>
              {settings.vip_levels.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={source} onChange={e => { setSource(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('guests.filters.all_sources', 'All Sources')}</option>
              {settings.lead_sources.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={lifecycle} onChange={e => { setLifecycle(e.target.value); setPage(1) }} className={filterSel}>
              <option value="">{t('guests.filters.all_lifecycle', 'All Lifecycle')}</option>
              <option value="Lead">{t('guests.lifecycle.Lead', 'Lead')}</option>
              <option value="Prospect">{t('guests.lifecycle.Prospect', 'Prospect')}</option>
              <option value="Customer">{t('guests.lifecycle.Customer', 'Customer')}</option>
              <option value="Repeat">{t('guests.lifecycle.Repeat', 'Repeat')}</option>
              <option value="Inactive">{t('guests.lifecycle.Inactive', 'Inactive')}</option>
            </select>
            {hasFilters && <button onClick={() => { setCountryFilter(''); setGuestType(''); setVipLevel(''); setSource(''); setLifecycle(''); setPage(1) }} className="text-xs text-[#636366] hover:text-white px-2">{t('guests.filters.clear', 'Clear')}</button>}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border">
                <SortHeader col="full_name" label={t('guests.table.full_name', 'Full Name')} />
                <SortHeader col="email" label={t('guests.table.email', 'Email')} />
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">{t('guests.table.phone', 'Phone')}</th>
                <SortHeader col="company" label={t('guests.table.company', 'Company')} />
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">{t('guests.table.nationality', 'Nationality')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">{t('guests.table.vip_level', 'VIP Level')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">{t('guests.table.loyalty', 'Loyalty')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">{t('guests.table.source', 'Source')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">{t('guests.table.lifecycle', 'Lifecycle')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">{t('guests.table.guest_type', 'Guest Type')}</th>
                <SortHeader col="total_stays" label={t('guests.table.total_stays', 'Total Stays')} />
                <SortHeader col="total_revenue" label={t('guests.table.total_revenue', 'Total Revenue')} />
                <SortHeader col="last_stay" label={t('guests.table.last_stay', 'Last Stay')} />
                <SortHeader col="created_at" label={t('guests.table.created', 'Created')} />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={15} className="px-4 py-8 text-center text-[#636366]">{t('guests.table.loading', 'Loading...')}</td></tr>}
              {!isLoading && guests.length === 0 && <tr><td colSpan={15} className="px-4 py-8 text-center text-[#636366]">{t('guests.table.no_guests', 'No guests found')}</td></tr>}
              {guests.map((g: any) => (
                <tr key={g.id} className="border-b border-dark-border/50 hover:bg-dark-surface2 transition-colors cursor-pointer" onClick={() => navigate(`/guests/${g.id}`)}>
                  <td className="px-4 py-3 font-medium text-white">{g.full_name}</td>
                  <td className="px-4 py-3 text-[#a0a0a0] text-xs">{g.email ?? '—'}</td>
                  <td className="px-4 py-3 text-[#a0a0a0] text-xs">{g.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-[#a0a0a0] text-xs">{g.company ?? '—'}</td>
                  <td className="px-4 py-3 text-[#a0a0a0] text-xs">{g.nationality ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VIP_COLORS[g.vip_level] ?? VIP_COLORS.Standard}`}>
                      {g.vip_level ?? t('guests.vip_standard', 'Standard')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {g.loyalty_tier ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-primary-500/20 text-primary-400">
                        <Link2 size={10} /> {g.loyalty_tier}
                      </span>
                    ) : (
                      <span className="text-[#636366] text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {g.lead_source ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[g.lead_source] ?? 'bg-gray-500/20 text-gray-400'}`}>
                        {g.lead_source}
                      </span>
                    ) : (
                      <span className="text-[#636366] text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {g.lifecycle_status ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LIFECYCLE_COLORS[g.lifecycle_status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                        {g.lifecycle_status}
                      </span>
                    ) : (
                      <span className="text-[#636366] text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#a0a0a0] text-xs">{g.guest_type ?? '—'}</td>
                  <td className="px-4 py-3 text-[#a0a0a0] text-center">{g.total_stays ?? 0}</td>
                  <td className="px-4 py-3 text-[#a0a0a0]">{g.total_revenue ? `${settings.currency_symbol}${Number(g.total_revenue).toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3 text-t-secondary text-xs">{g.last_stay ?? '—'}</td>
                  <td className="px-4 py-3 text-t-secondary text-xs">{g.created_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); if (confirm(t('guests.toasts.delete_confirm', 'Delete this guest?'))) deleteMutation.mutate(g.id) }} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#636366] hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-t-secondary">{t('guests.table.page_of', { current: meta.current_page, last: meta.last_page, defaultValue: 'Page {{current}} of {{last}}' })}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-4">{t('guests.create.title', 'Add Guest')}</h2>
            <form onSubmit={e => { e.preventDefault(); createMutation.mutate(form) }} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.salutation', 'Salutation')}</label>
                  <select value={form.salutation} onChange={e => setForm(f => ({ ...f, salutation: e.target.value }))} className={sel}>
                    <option value="">{t('guests.create.salutation_none', '--')}</option>
                    {settings.salutations.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.first_name', 'First Name *')}</label>
                  <input required value={form.first_name} onChange={e => setForm(f => updateFullName(f, 'first_name', e.target.value))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.last_name', 'Last Name *')}</label>
                  <input required value={form.last_name} onChange={e => setForm(f => updateFullName(f, 'last_name', e.target.value))} className={inp} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.full_name', 'Full Name')}</label>
                <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.email', 'Email')}</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.phone', 'Phone')}</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.mobile', 'Mobile')}</label>
                  <input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.company', 'Company')}</label>
                  <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.nationality', 'Nationality')}</label>
                  <select value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} className={sel}>
                    <option value="">{t('guests.create.select_placeholder', '-- Select --')}</option>
                    {settings.countries.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.country', 'Country')}</label>
                  <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className={sel}>
                    <option value="">{t('guests.create.select_placeholder', '-- Select --')}</option>
                    {settings.countries.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.guest_type', 'Guest Type')}</label>
                  <select value={form.guest_type} onChange={e => setForm(f => ({ ...f, guest_type: e.target.value }))} className={sel}>
                    <option value="">{t('guests.create.select_placeholder', '-- Select --')}</option>
                    {settings.guest_types.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.vip_level', 'VIP Level')}</label>
                  <select value={form.vip_level} onChange={e => setForm(f => ({ ...f, vip_level: e.target.value }))} className={sel}>
                    {settings.vip_levels.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.lead_source', 'Lead Source')}</label>
                  <select value={form.lead_source} onChange={e => setForm(f => ({ ...f, lead_source: e.target.value }))} className={sel}>
                    <option value="">{t('guests.create.none_placeholder', '-- None --')}</option>
                    {settings.lead_sources.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.create.notes', 'Notes')}</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={`${inp} resize-none`} />
              </div>
              <CustomFieldsForm
                entity="guest"
                values={form.custom_data}
                onChange={(next) => setForm(f => ({ ...f, custom_data: next }))}
                inputClassName={inp}
              />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">{t('guests.create.cancel', 'Cancel')}</button>
                <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50">
                  {createMutation.isPending ? t('guests.create.saving', 'Saving...') : t('guests.create.create', 'Create')}
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
              <h2 className="text-lg font-bold text-white">{t('guests.capture.title', 'AI Guest Capture')}</h2>
            </div>

            {!captureResult ? (
              <div className="space-y-3">
                <p className="text-xs text-t-secondary">{t('guests.capture.instructions', 'Paste an email, booking request, or any inquiry message. AI will extract guest and inquiry information automatically.')}</p>
                <textarea
                  value={captureText}
                  onChange={e => setCaptureText(e.target.value)}
                  rows={8}
                  placeholder={t('guests.capture.placeholder', 'Paste the email or message here...')}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setShowCapture(false)} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">{t('guests.capture.cancel', 'Cancel')}</button>
                  <button
                    onClick={async () => {
                      if (!captureText.trim()) return
                      setCaptureLoading(true)
                      try {
                        const res = await api.post('/v1/admin/crm-ai/capture-lead', { text: captureText })
                        if (res.data.success) {
                          setCaptureResult(res.data.data)
                        } else {
                          toast.error(res.data.error || t('guests.toasts.extract_failed', 'Failed to extract data'))
                        }
                      } catch (e: any) {
                        toast.error(e.response?.data?.message || t('guests.toasts.ai_failed', 'AI extraction failed'))
                      } finally { setCaptureLoading(false) }
                    }}
                    disabled={captureLoading || !captureText.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {captureLoading ? <><Loader2 size={14} className="animate-spin" /> {t('guests.capture.extracting', 'Extracting...')}</> : <><Sparkles size={14} /> {t('guests.capture.extract', 'Extract')}</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-xs text-purple-300">
                  {t('guests.capture.review_hint', 'AI extracted the following. Review and edit before creating.')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'customer_name', label: t('guests.capture.fields.customer_name', 'Guest Name'), type: 'text' },
                    { key: 'email', label: t('guests.capture.fields.email', 'Email'), type: 'email' },
                    { key: 'phone', label: t('guests.capture.fields.phone', 'Phone'), type: 'text' },
                    { key: 'company', label: t('guests.capture.fields.company', 'Company'), type: 'text' },
                    { key: 'country', label: t('guests.capture.fields.country', 'Country'), type: 'text' },
                    { key: 'nationality', label: t('guests.capture.fields.nationality', 'Nationality'), type: 'text' },
                    { key: 'guest_type', label: t('guests.capture.fields.guest_type', 'Guest Type'), type: 'text' },
                    { key: 'vip_level', label: t('guests.capture.fields.vip_level', 'VIP Level'), type: 'text' },
                    { key: 'source', label: t('guests.capture.fields.source', 'Source'), type: 'text' },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="block text-xs text-[#a0a0a0] mb-1">{label}</label>
                      <input
                        type={type}
                        value={captureResult[key] ?? ''}
                        onChange={e => setCaptureResult((r: any) => ({ ...r, [key]: e.target.value }))}
                        className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">{t('guests.capture.notes', 'Notes')}</label>
                  <textarea
                    value={captureResult.notes ?? ''}
                    onChange={e => setCaptureResult((r: any) => ({ ...r, notes: e.target.value }))}
                    rows={3}
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>
                <div className="flex justify-between pt-1">
                  <button onClick={() => setCaptureResult(null)} className="text-sm text-[#636366] hover:text-white">{t('guests.capture.back', 'Back')}</button>
                  <div className="flex gap-3">
                    <button onClick={() => setShowCapture(false)} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">{t('guests.capture.cancel', 'Cancel')}</button>
                    <button
                      onClick={async () => {
                        const r = captureResult
                        try {
                          await api.post('/v1/admin/guests', {
                            full_name: r.customer_name,
                            email: r.email || undefined,
                            phone: r.phone || undefined,
                            company: r.company || undefined,
                            country: r.country || undefined,
                            nationality: r.nationality || undefined,
                            guest_type: r.guest_type || undefined,
                            vip_level: r.vip_level || 'Standard',
                            lead_source: r.source || undefined,
                            notes: r.notes || undefined,
                          })
                          qc.invalidateQueries({ queryKey: ['guests'] })
                          toast.success(t('guests.toasts.captured_for', { name: r.customer_name, defaultValue: 'Guest created for {{name}}' }))
                          setShowCapture(false)
                          setCaptureResult(null)
                        } catch (e: any) {
                          toast.error(e.response?.data?.message || t('guests.toasts.create_failed', 'Failed to create guest'))
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg transition-colors"
                    >
                      {t('guests.capture.create_guest', 'Create Guest')}
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
