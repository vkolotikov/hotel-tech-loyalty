import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Search, X, Users, UserCheck, Briefcase, Crown, Loader2,
  ChevronRight, Filter, Star, Edit3, Trash2, Download, CheckSquare, Square,
  Tag as TagIcon, Save, GitMerge, Sparkles, SlidersHorizontal, Calendar,
  Globe, Mail, Phone as PhoneIcon, AtSign,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api, API_URL } from '../lib/api'
import { ContactActions } from '../components/ContactActions'
import { NewCustomerDrawer } from '../components/NewCustomerDrawer'
import { useSettings, type CustomerFieldConfig } from '../lib/crmSettings'
import { format } from 'date-fns'

/**
 * Customers (CRM contacts) list page.
 *
 * The unified entry point into the per-customer detail view. Every Guest row
 * here represents a real person the org has done business with — including
 * inquiry-only leads, guests who have stayed, and B2B contacts associated
 * with a Company. Clicking opens /guests/:id, which auto-redirects to
 * /members/:member_id when the guest has a linked loyalty member (the
 * standard case post-2026-05). Orphan guests fall through to GuestDetail.
 *
 * Why this page exists: until now there was no way to browse customers as
 * a list — the only entries into a guest detail were /guests/:id direct
 * URLs (no UI to discover them) and the per-row click on Inquiries /
 * Reservations rows (which didn't even open the detail page — guest names
 * were rendered as plain text).
 */

type Guest = {
  id: number
  full_name: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  company: string | null
  position_title: string | null
  guest_type: string | null
  vip_level: string | null
  nationality: string | null
  country: string | null
  loyalty_tier: string | null
  total_stays: number | null
  total_revenue: number | null
  lead_source: string | null
  importance: string | null
  lifecycle_status: string | null
  created_at: string | null
  last_activity_at?: string | null
  member_id?: number | null
}

type IndexResponse = {
  data: Guest[]
  current_page: number
  last_page: number
  total: number
  per_page: number
}

const PER_PAGE = 25
const SORTS = [
  { key: 'created_at',       dir: 'desc', label: 'Most recent'   },
  { key: 'last_activity_at', dir: 'desc', label: 'Last activity' },
  { key: 'total_revenue',    dir: 'desc', label: 'Top spenders'  },
  { key: 'total_stays',      dir: 'desc', label: 'Most stays'    },
  { key: 'full_name',        dir: 'asc',  label: 'Name (A→Z)'    },
] as const

export function Customers() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  // Per-org column visibility — admin toggles in Settings → Pipelines → Fields → Customers.
  // Always-shown bits (selection checkbox, name, actions) live outside this config.
  const customerFields = useSettings().customer_fields

  // Filters live in URL so back / refresh / bookmark survive.
  const q                = searchParams.get('q')                ?? ''
  const vipOnly          = searchParams.get('vip')              === '1'
  const b2bOnly          = searchParams.get('b2b')              === '1'
  const company          = searchParams.get('company')          ?? ''
  const lifecycle        = searchParams.get('lifecycle')        ?? ''
  const importance       = searchParams.get('importance')       ?? ''
  const country          = searchParams.get('country')          ?? ''
  const nationality      = searchParams.get('nationality')      ?? ''
  const leadSource       = searchParams.get('lead_source')      ?? ''
  const ownerName        = searchParams.get('owner_name')       ?? ''
  const loyaltyTier      = searchParams.get('loyalty_tier')     ?? ''
  const hasEmail         = searchParams.get('has_email')        === '1'
  const hasPhone         = searchParams.get('has_phone')        === '1'
  const minStays         = searchParams.get('min_stays')        ?? ''
  const dateFrom         = searchParams.get('date_from')        ?? ''
  const dateTo           = searchParams.get('date_to')          ?? ''
  const sortIdx          = parseInt(searchParams.get('sort') ?? '0', 10) || 0
  const page             = parseInt(searchParams.get('page') ?? '1', 10) || 1
  const sort             = SORTS[Math.min(sortIdx, SORTS.length - 1)]

  const updateParam = (key: string, value: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
      // Any filter change resets pagination to page 1.
      if (key !== 'page') next.delete('page')
      return next
    }, { replace: true })
  }

  const params: Record<string, any> = {
    per_page: PER_PAGE,
    page,
    sort: sort.key,
    dir:  sort.dir,
  }
  if (q.trim())     params.search           = q.trim()
  if (vipOnly)      params.vip_level        = 'VIP'
  if (b2bOnly)      params.guest_type       = 'Corporate'
  if (company)      params.company          = company
  if (lifecycle)    params.lifecycle_status = lifecycle
  if (importance)   params.importance       = importance
  if (country)      params.country          = country
  if (nationality)  params.nationality      = nationality
  if (leadSource)   params.lead_source      = leadSource
  if (ownerName)    params.owner_name       = ownerName
  if (loyaltyTier)  params.loyalty_tier     = loyaltyTier
  if (hasEmail)     params.has_email        = '1'
  if (hasPhone)     params.has_phone        = '1'
  if (minStays)     params.min_stays        = minStays
  if (dateFrom)     params.date_from        = dateFrom
  if (dateTo)       params.date_to          = dateTo

  // List of currently-active filters — drives the chip bar + the
  // selection reset hook below.
  const activeFilters: { key: string; label: string; value: string }[] = []
  if (vipOnly)      activeFilters.push({ key: 'vip',         label: 'VIPs only',     value: 'on' })
  if (b2bOnly)      activeFilters.push({ key: 'b2b',         label: 'B2B only',      value: 'on' })
  if (lifecycle)    activeFilters.push({ key: 'lifecycle',   label: 'Lifecycle',     value: lifecycle })
  if (importance)   activeFilters.push({ key: 'importance',  label: 'Importance',    value: importance })
  if (country)      activeFilters.push({ key: 'country',     label: 'Country',       value: country })
  if (nationality)  activeFilters.push({ key: 'nationality', label: 'Nationality',   value: nationality })
  if (leadSource)   activeFilters.push({ key: 'lead_source', label: 'Source',        value: leadSource })
  if (ownerName)    activeFilters.push({ key: 'owner_name',  label: 'Owner',         value: ownerName })
  if (loyaltyTier)  activeFilters.push({ key: 'loyalty_tier',label: 'Loyalty tier',  value: loyaltyTier })
  if (hasEmail)     activeFilters.push({ key: 'has_email',   label: 'Has email',     value: 'on' })
  if (hasPhone)     activeFilters.push({ key: 'has_phone',   label: 'Has phone',     value: 'on' })
  if (minStays)     activeFilters.push({ key: 'min_stays',   label: 'Min stays',     value: `≥${minStays}` })
  if (dateFrom)     activeFilters.push({ key: 'date_from',   label: 'From',          value: dateFrom })
  if (dateTo)       activeFilters.push({ key: 'date_to',     label: 'To',            value: dateTo })

  const { data, isLoading, isFetching } = useQuery<IndexResponse>({
    queryKey: ['customers-list', params],
    queryFn: () => api.get('/v1/admin/guests', { params }).then(r => r.data),
    placeholderData: prev => prev,
  })

  // Light-touch query just to surface a "X potential duplicates" link in the
  // header. Returns up to 50 pairs; we cap the badge display at 50+ so the
  // banner stays compact. Stale-time 60s keeps the network noise low.
  const { data: dupes } = useQuery<{ pairs: any[] }>({
    queryKey: ['customer-duplicates-count'],
    queryFn: () => api.get('/v1/admin/guests/duplicates', { params: { limit: 50 } }).then(r => r.data),
    staleTime: 60_000,
  })
  const duplicateCount = dupes?.pairs?.length ?? 0

  const rows = data?.data ?? []
  const total = data?.total ?? 0

  // KPIs derived from the current page — cheap and good enough until the
  // dataset grows past ~10k, at which point a dedicated /stats endpoint
  // would be worthwhile (see Members::stats pattern).
  const kpis = useMemo(() => ({
    vips:      rows.filter(g => (g.vip_level && g.vip_level !== 'Standard') || g.importance === 'VIP').length,
    b2b:       rows.filter(g => g.guest_type === 'Corporate' || !!g.company).length,
    withEmail: rows.filter(g => !!g.email).length,
  }), [rows])

  /* ─── Selection + bulk-ops state ──────────────────────────────────── */
  // Set of guest ids currently checked. Cleared on filter change / page nav
  // so a stale "selected" never targets rows the user can no longer see.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  useEffect(() => { setSelected(new Set()) }, [
    page, q, vipOnly, b2bOnly, company, sortIdx,
    lifecycle, importance, country, nationality, leadSource, ownerName,
    loyaltyTier, hasEmail, hasPhone, minStays, dateFrom, dateTo,
  ])

  /* ─── Filter popover state ─────────────────────────────────────── */
  const [filtersOpen, setFiltersOpen] = useState(false)

  /* ─── Facets (distinct values for free-form dropdowns) ─────────── */
  const { data: facets } = useQuery<{ country: string[]; nationality: string[]; lead_source: string[]; owner_name: string[]; loyalty_tier: string[] }>({
    queryKey: ['customers-facets'],
    queryFn: () => api.get('/v1/admin/guests/facets').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const toggleOne = (id: number) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allPageSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(prev => {
    const next = new Set(prev)
    if (allPageSelected) rows.forEach(r => next.delete(r.id))
    else                  rows.forEach(r => next.add(r.id))
    return next
  })
  const clearSelection = () => setSelected(new Set())

  /* ─── Inline edit drawer state ────────────────────────────────────── */
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)

  /* ─── Mutations ───────────────────────────────────────────────────── */
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Guest> }) =>
      api.put(`/v1/admin/guests/${id}`, patch).then(r => r.data),
    onSuccess: () => {
      toast.success('Customer updated')
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      setEditingGuest(null)
    },
    onError: () => toast.error('Could not update customer'),
  })

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ ids, fields }: { ids: number[]; fields: Record<string, any> }) =>
      api.post('/v1/admin/guests/bulk-update', { ids, fields }).then(r => r.data),
    onSuccess: (r) => {
      toast.success(`${r.updated} customer${r.updated === 1 ? '' : 's'} updated`)
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      clearSelection()
    },
    onError: () => toast.error('Bulk update failed'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      api.post('/v1/admin/guests/bulk-delete', { ids }).then(r => r.data),
    onSuccess: (r) => {
      toast.success(`${r.deleted} customer${r.deleted === 1 ? '' : 's'} deleted`)
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      clearSelection()
    },
    onError: () => toast.error('Bulk delete failed'),
  })

  const exportSelected = () => {
    // Reuse the existing /guests/export endpoint with `ids[]` so the CSV
    // contains only what the admin checked. Falls through to current
    // filter set when no selection — that's the "export everything I
    // see" behaviour staff usually want.
    const ids = Array.from(selected)
    const qs = new URLSearchParams()
    if (ids.length) {
      ids.forEach(id => qs.append('ids[]', String(id)))
    } else {
      if (q.trim())  qs.set('search', q.trim())
      if (vipOnly)   qs.set('vip_level', 'VIP')
      if (b2bOnly)   qs.set('guest_type', 'Corporate')
      if (company)   qs.set('company', company)
    }
    window.open(`${API_URL}/api/v1/admin/guests/export?${qs.toString()}`, '_blank')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            Every guest, lead and corporate contact in one place
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Duplicates badge — only shows when the backend suggests pairs.
              Click → /customers/duplicates merge UI. Count caps at 50+
              because that's the suggestion-fetch limit. */}
          {duplicateCount > 0 && (
            <Link
              to="/customers/duplicates"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 font-medium text-sm transition-colors"
              title="Review duplicate customers"
            >
              <GitMerge size={13} />
              <span className="hidden sm:inline">Duplicates</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/25">
                {duplicateCount}{dupes?.pairs?.length === 50 ? '+' : ''}
              </span>
            </Link>
          )}
          <button
            onClick={() => setCreatingNew(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-medium text-sm transition-colors"
            title="Add a customer — manually or with AI capture from pasted text"
          >
            <Sparkles size={13} className="opacity-70" />
            <span>New customer</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile icon={Users}      label="Total customers"   value={total.toLocaleString()} accent="blue" />
        <KpiTile icon={Crown}      label="VIPs"              value={kpis.vips.toLocaleString()} accent="amber" />
        <KpiTile icon={Briefcase}  label="B2B (corporate)"   value={kpis.b2b.toLocaleString()}  accent="purple" />
        <KpiTile icon={UserCheck}  label="With email"        value={kpis.withEmail.toLocaleString()} accent="emerald" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-[420px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            value={q}
            onChange={e => updateParam('q', e.target.value)}
            placeholder="Search name, email, phone, company…"
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-dark-surface2 border border-dark-border focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-sm text-white placeholder-gray-600"
          />
          {q && (
            <button
              onClick={() => updateParam('q', null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <Pill active={vipOnly}  onClick={() => updateParam('vip', vipOnly ? null : '1')}  icon={Crown}>VIPs</Pill>
        <Pill active={b2bOnly}  onClick={() => updateParam('b2b', b2bOnly ? null : '1')}  icon={Briefcase}>B2B only</Pill>

        {/* "More filters" toggle — opens the advanced popover. Active count
            on the button as a small badge so admins can see at a glance
            how many criteria are narrowing the list. */}
        <button
          onClick={() => setFiltersOpen(o => !o)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            filtersOpen || activeFilters.length > 2
              ? 'border-primary-500/40 bg-primary-500/15 text-primary-300'
              : 'border-dark-border bg-dark-surface2 text-t-secondary hover:text-white hover:border-white/20'
          }`}
        >
          <SlidersHorizontal size={11} /> More filters
          {activeFilters.length > 2 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-500/30 text-primary-200">
              {activeFilters.length - (vipOnly ? 1 : 0) - (b2bOnly ? 1 : 0)}
            </span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-t-secondary">
          <Filter size={12} />
          <select
            value={sortIdx}
            onChange={e => updateParam('sort', e.target.value)}
            className="bg-dark-surface2 border border-dark-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary-500/40"
          >
            {SORTS.map((s, i) => <option key={s.key} value={i}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Filter popover — collapses unless explicitly opened. Most days
          staff only need the search + VIP + B2B pills; this section is
          for the cases they want to slice by country / lifecycle / tier
          / date range etc. */}
      {filtersOpen && (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <FacetSelect
            label="Lifecycle status"
            value={lifecycle}
            onChange={v => updateParam('lifecycle', v)}
            options={['Prospect', 'Lead', 'First-Time Guest', 'Returning Guest', 'VIP', 'Dormant', 'Lost']}
            icon={Users}
          />
          <FacetSelect
            label="Importance"
            value={importance}
            onChange={v => updateParam('importance', v)}
            options={['Normal', 'High', 'Critical']}
            icon={Star}
          />
          <FacetSelect
            label="Loyalty tier"
            value={loyaltyTier}
            onChange={v => updateParam('loyalty_tier', v)}
            options={facets?.loyalty_tier ?? []}
            icon={Crown}
          />
          <FacetSelect
            label="Country"
            value={country}
            onChange={v => updateParam('country', v)}
            options={facets?.country ?? []}
            icon={Globe}
          />
          <FacetSelect
            label="Nationality"
            value={nationality}
            onChange={v => updateParam('nationality', v)}
            options={facets?.nationality ?? []}
            icon={Globe}
          />
          <FacetSelect
            label="Lead source"
            value={leadSource}
            onChange={v => updateParam('lead_source', v)}
            options={facets?.lead_source ?? []}
            icon={AtSign}
          />
          <FacetSelect
            label="Owner"
            value={ownerName}
            onChange={v => updateParam('owner_name', v)}
            options={facets?.owner_name ?? []}
            icon={UserCheck}
          />
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-t-secondary mb-1 flex items-center gap-1"><Star size={10} /> Min stays</span>
            <input
              type="number"
              min={0}
              value={minStays}
              onChange={e => updateParam('min_stays', e.target.value)}
              placeholder="any"
              className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-sm text-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-t-secondary mb-1 flex items-center gap-1"><Calendar size={10} /> Created from</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => updateParam('date_from', e.target.value)}
                className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-xs text-white"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-t-secondary mb-1">…to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => updateParam('date_to', e.target.value)}
                className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-xs text-white"
              />
            </label>
          </div>
          <div className="md:col-span-3 flex items-center gap-3 pt-2 border-t border-dark-border/50">
            <Toggle label="Has email" icon={Mail}      checked={hasEmail} onChange={v => updateParam('has_email', v ? '1' : null)} />
            <Toggle label="Has phone" icon={PhoneIcon} checked={hasPhone} onChange={v => updateParam('has_phone', v ? '1' : null)} />
          </div>
        </div>
      )}

      {/* Active-filter chip bar — visible whenever any filter beyond the
          base search is set. Each chip is independently dismissible. */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">Active</span>
          {activeFilters.map(f => (
            <button
              key={f.key}
              onClick={() => updateParam(f.key, null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-500/15 border border-primary-500/25 text-primary-200 hover:bg-primary-500/25 transition"
            >
              <span className="text-primary-300">{f.label}:</span>
              <span className="font-medium">{f.value}</span>
              <X size={10} className="opacity-70" />
            </button>
          ))}
          <button
            onClick={() => {
              setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                ;['vip','b2b','lifecycle','importance','country','nationality','lead_source','owner_name','loyalty_tier','has_email','has_phone','min_stays','date_from','date_to','company'].forEach(k => next.delete(k))
                next.delete('page')
                return next
              }, { replace: true })
            }}
            className="ml-1 text-[11px] text-t-secondary hover:text-white underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Company-filter banner — visible when arriving via /customers?company=X
          from a corporate row. One-click to clear, since the filter is a
          temporary view rather than a saved preference. */}
      {company && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-purple-500/20 bg-purple-500/[0.04] px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-purple-200">
            <Briefcase size={14} className="text-purple-400" />
            <span>Showing customers at <strong className="text-white">{company}</strong></span>
          </div>
          <button
            onClick={() => updateParam('company', null)}
            className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-white transition"
          >
            <X size={11} /> Clear filter
          </button>
        </div>
      )}

      {/* Bulk action bar — pops in when one or more rows are selected.
          Sticky-top so it stays in view while scrolling a long list. */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 -mx-0 rounded-lg border border-primary-500/40 bg-primary-500/[0.08] backdrop-blur px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="text-sm font-medium text-white">
            <span className="text-primary-300 font-bold">{selected.size}</span> selected
          </div>
          <button onClick={clearSelection} className="text-xs text-t-secondary hover:text-white">Clear</button>

          <div className="flex-1" />

          <button
            onClick={() => exportSelected()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition"
          >
            <Download size={11} /> Export CSV
          </button>
          <button
            onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selected), fields: { vip_level: 'VIP' } })}
            disabled={bulkUpdateMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/20 hover:bg-amber-500/25 disabled:opacity-50 transition"
          >
            <Crown size={11} /> Mark as VIP
          </button>
          <button
            onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selected), fields: { lifecycle_status: 'archived' } })}
            disabled={bulkUpdateMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-gray-500/15 text-gray-300 border border-gray-500/20 hover:bg-gray-500/25 disabled:opacity-50 transition"
          >
            <TagIcon size={11} /> Archive
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete ${selected.size} customer${selected.size === 1 ? '' : 's'}? This cannot be undone.`)) {
                bulkDeleteMutation.mutate(Array.from(selected))
              }
            }}
            disabled={bulkDeleteMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25 disabled:opacity-50 transition"
          >
            <Trash2 size={11} /> Delete
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto] md:grid-cols-[auto_2fr_2fr_1fr_1fr_auto] gap-3 px-4 py-2.5 border-b border-dark-border bg-dark-surface2 text-[10px] font-bold uppercase tracking-wider text-gray-500 items-center">
          <button
            onClick={toggleAll}
            disabled={rows.length === 0}
            title={allPageSelected ? 'Deselect this page' : 'Select this page'}
            className="text-gray-500 hover:text-white disabled:opacity-30"
          >
            {allPageSelected
              ? <CheckSquare size={14} className="text-primary-400" />
              : <Square size={14} />}
          </button>
          <div>Customer</div>
          <div className="hidden md:block">Contact</div>
          <div className="hidden md:block">Company</div>
          <div className="text-right">Activity</div>
          <div></div>
        </div>

        {isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-primary-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-t-secondary">
            {q || vipOnly || b2bOnly || company
              ? 'No customers match your filters.'
              : 'No customers yet. Capture your first lead via /inquiries or /lead-forms.'}
          </div>
        ) : (
          rows.map(g => (
            <Row
              key={g.id}
              guest={g}
              fieldCfg={customerFields}
              selected={selected.has(g.id)}
              onToggle={() => toggleOne(g.id)}
              onEdit={() => setEditingGuest(g)}
              onOpen={() => navigate(`/guests/${g.id}`)}
            />
          ))
        )}
      </div>

      {/* Inline edit drawer */}
      {editingGuest && (
        <EditDrawer
          guest={editingGuest}
          onClose={() => setEditingGuest(null)}
          onSave={(patch) => updateMutation.mutate({ id: editingGuest.id, patch })}
          saving={updateMutation.isPending}
        />
      )}

      {/* New customer drawer — AI capture + manual entry. Replaces the
          previous /guests/new navigation that 500'd because no such route
          existed and GuestDetail's :id binding tried to load id="new". */}
      {creatingNew && (
        <NewCustomerDrawer
          onClose={() => setCreatingNew(false)}
          onCreated={(id) => { setCreatingNew(false); navigate(`/guests/${id}`) }}
        />
      )}

      {/* Pagination */}
      {data && data.last_page > 1 && (
        <div className="flex items-center justify-between text-xs text-t-secondary">
          <div>
            Page {data.current_page} of {data.last_page} · {total.toLocaleString()} total
            {isFetching && <Loader2 size={11} className="inline ml-2 animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateParam('page', String(page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded bg-dark-surface2 border border-dark-border disabled:opacity-40 hover:border-white/20 transition"
            >Prev</button>
            <button
              onClick={() => updateParam('page', String(page + 1))}
              disabled={page >= data.last_page}
              className="px-3 py-1.5 rounded bg-dark-surface2 border border-dark-border disabled:opacity-40 hover:border-white/20 transition"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Helpers ───────────────────────── */

function KpiTile({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: 'blue' | 'amber' | 'purple' | 'emerald' }) {
  const ring = {
    blue:    'border-blue-500/15 bg-blue-500/[0.04]',
    amber:   'border-amber-500/15 bg-amber-500/[0.04]',
    purple:  'border-purple-500/15 bg-purple-500/[0.04]',
    emerald: 'border-emerald-500/15 bg-emerald-500/[0.04]',
  }[accent]
  const color = {
    blue:    'text-blue-400',
    amber:   'text-amber-400',
    purple:  'text-purple-400',
    emerald: 'text-emerald-400',
  }[accent]
  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={13} className={color} />
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      </div>
      <div className="text-xl font-bold text-white tabular-nums">{value}</div>
    </div>
  )
}

/**
 * FacetSelect — labelled <select> for filter dropdowns. Empty string =
 * "All", non-empty = the value the backend should filter on. Used for
 * lifecycle / importance / loyalty tier / country / nationality / etc.
 */
function FacetSelect({ label, value, onChange, options, icon: Icon }: {
  label: string
  value: string
  onChange: (v: string | null) => void
  options: string[]
  icon: any
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-t-secondary mb-1 flex items-center gap-1">
        <Icon size={10} /> {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value || null)}
        className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-sm text-white"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

/**
 * Toggle — labelled boolean switch for has_email / has_phone style flags.
 */
function Toggle({ label, icon: Icon, checked, onChange }: {
  label: string
  icon: any
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
        checked
          ? 'border-primary-500/40 bg-primary-500/15 text-primary-300'
          : 'border-dark-border bg-dark-surface2 text-t-secondary hover:text-white hover:border-white/20'
      }`}
    >
      <Icon size={11} /> {label}
    </button>
  )
}

function Pill({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: any; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
        active
          ? 'border-primary-500/40 bg-primary-500/15 text-primary-300'
          : 'border-dark-border bg-dark-surface2 text-t-secondary hover:text-white hover:border-white/20'
      }`}
    >
      <Icon size={11} /> {children}
    </button>
  )
}

type RowProps = {
  guest: Guest
  fieldCfg: CustomerFieldConfig
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onOpen: () => void
}

function Row({ guest, fieldCfg, selected, onToggle, onEdit, onOpen }: RowProps) {
  const isVip = !!guest.vip_level && guest.vip_level !== 'Standard'
  const initials = (guest.full_name || guest.email || '?')
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // Build md+ grid template dynamically — when a column is toggled off
  // we drop its track too, otherwise the row keeps an empty gap.
  const mdGridCols = [
    'auto',                                     // checkbox
    '2fr',                                      // name (always)
    fieldCfg.list.contact  ? '2fr' : null,
    fieldCfg.list.company  ? '1fr' : null,
    fieldCfg.list.activity ? '1fr' : null,
    'auto',                                     // actions
  ].filter(Boolean).join(' ')

  return (
    <div
      onClick={onOpen}
      style={{ ['--md-cols' as any]: mdGridCols }}
      className={`grid grid-cols-[auto_1fr_auto_auto] md:[grid-template-columns:var(--md-cols)] gap-3 px-4 py-3 border-b border-dark-border last:border-b-0 cursor-pointer group items-center transition-colors ${
        selected ? 'bg-primary-500/[0.06]' : 'hover:bg-white/[0.02]'
      }`}
    >
      {/* Selection checkbox — stopPropagation so clicking the box doesn't
          also fire the row's open-detail handler. */}
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        className="text-gray-500 hover:text-white"
        aria-label={selected ? 'Deselect row' : 'Select row'}
      >
        {selected
          ? <CheckSquare size={14} className="text-primary-400" />
          : <Square size={14} />}
      </button>

      {/* Customer name + initials */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-dark-surface2 border border-dark-border text-xs font-bold text-primary-300 flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white truncate group-hover:text-primary-300 transition-colors">
              {guest.full_name}
            </span>
            {fieldCfg.list.vip_badge && isVip && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                <Star size={9} fill="currentColor" /> VIP
              </span>
            )}
          </div>
          {fieldCfg.list.position_title && guest.position_title && (
            <div className="text-[11px] text-gray-500 truncate">{guest.position_title}</div>
          )}
        </div>
      </div>

      {/* Contact (hidden on mobile, shown on md+) */}
      {fieldCfg.list.contact && (
        <div className="hidden md:flex flex-col gap-0.5 min-w-0">
          {guest.email && <div className="text-xs text-gray-300 truncate">{guest.email}</div>}
          {(guest.phone || guest.mobile) && (
            <div className="text-[11px] text-gray-500 truncate">{guest.phone || guest.mobile}</div>
          )}
          {!guest.email && !guest.phone && !guest.mobile && (
            <div className="text-[11px] text-gray-700">—</div>
          )}
        </div>
      )}

      {/* Company */}
      {fieldCfg.list.company && (
        <div className="hidden md:block min-w-0">
          {guest.company ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-300 truncate">
              <Briefcase size={11} className="text-gray-500 flex-shrink-0" />
              <span className="truncate">{guest.company}</span>
            </div>
          ) : (
            <span className="text-[11px] text-gray-700">—</span>
          )}
        </div>
      )}

      {/* Activity */}
      {fieldCfg.list.activity && (
        <div className="hidden md:block text-right text-[11px] text-gray-500">
          {guest.total_stays && guest.total_stays > 0
            ? <><span className="text-emerald-400 font-semibold tabular-nums">{guest.total_stays}</span> stays</>
            : guest.created_at
              ? <>added {format(new Date(guest.created_at), 'MMM d')}</>
              : '—'}
        </div>
      )}

      {/* Right-side actions */}
      <div className="flex items-center gap-1.5 justify-end">
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-primary-300 transition"
          title="Quick edit"
          aria-label="Quick edit"
        >
          <Edit3 size={13} />
        </button>
        <div className="md:hidden">
          <ContactActions email={guest.email} phone={guest.phone || guest.mobile} compact />
        </div>
        <ChevronRight size={14} className="hidden md:block text-gray-600 group-hover:text-primary-400 transition" />
      </div>
    </div>
  )
}

/* ──────────────────── Quick-edit drawer ──────────────────── */

type EditDrawerProps = {
  guest: Guest
  onClose: () => void
  onSave: (patch: Partial<Guest>) => void
  saving: boolean
}

function EditDrawer({ guest, onClose, onSave, saving }: EditDrawerProps) {
  const [form, setForm] = useState({
    full_name:      guest.full_name ?? '',
    email:          guest.email ?? '',
    phone:          guest.phone ?? '',
    company:        guest.company ?? '',
    position_title: guest.position_title ?? '',
    vip_level:      guest.vip_level ?? 'Standard',
    owner_name:     '' as string,
    importance:     guest.importance ?? 'Normal',
  })

  const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  // Esc key to close — matches the rest of the drawer/modal patterns
  // throughout the admin SPA.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    // Only send the diff — keep the PUT body small and avoid blowing
    // away fields the drawer doesn't expose.
    const patch: any = {}
    if (form.full_name      !== (guest.full_name ?? ''))      patch.full_name      = form.full_name
    if (form.email          !== (guest.email ?? ''))          patch.email          = form.email || null
    if (form.phone          !== (guest.phone ?? ''))          patch.phone          = form.phone || null
    if (form.company        !== (guest.company ?? ''))        patch.company        = form.company || null
    if (form.position_title !== (guest.position_title ?? '')) patch.position_title = form.position_title || null
    if (form.vip_level      !== (guest.vip_level ?? 'Standard')) patch.vip_level   = form.vip_level
    if (form.importance     !== (guest.importance ?? 'Normal'))  patch.importance  = form.importance
    onSave(patch)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <form
        onSubmit={submit}
        className="fixed right-0 top-0 h-screen w-full max-w-md bg-dark-surface border-l border-dark-border shadow-2xl z-50 flex flex-col"
      >
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500">Quick edit</div>
            <h2 className="text-base font-semibold text-white">{guest.full_name}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <Field label="Full name" value={form.full_name}      onChange={v => set('full_name', v)} />
          <Field label="Email"     value={form.email}          onChange={v => set('email', v)} type="email" />
          <Field label="Phone"     value={form.phone}          onChange={v => set('phone', v)} type="tel" />
          <Field label="Company"   value={form.company}        onChange={v => set('company', v)} />
          <Field label="Position"  value={form.position_title} onChange={v => set('position_title', v)} />

          <div className="grid grid-cols-2 gap-3">
            <Select label="VIP level"   value={form.vip_level}  onChange={v => set('vip_level', v)}
              options={['Standard', 'VIP', 'VVIP', 'Platinum']} />
            <Select label="Importance" value={form.importance} onChange={v => set('importance', v)}
              options={['Normal', 'High', 'Critical']} />
          </div>

          <p className="text-[11px] text-gray-500 pt-2">
            Need more fields? Click the customer name to open the full detail page.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-dark-border flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded text-sm text-t-secondary hover:text-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-medium text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>
        </div>
      </form>
    </>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-sm text-white placeholder-gray-600"
      />
    </label>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-sm text-white"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
