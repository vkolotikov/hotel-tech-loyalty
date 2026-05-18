import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, Plus, X, Users, UserCheck, Briefcase, Crown, Loader2,
  ChevronRight, Filter, Star,
} from 'lucide-react'
import { api } from '../lib/api'
import { ContactActions } from '../components/ContactActions'
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
  const [searchParams, setSearchParams] = useSearchParams()

  // Filters live in URL so back / refresh / bookmark survive.
  const q       = searchParams.get('q')       ?? ''
  const vipOnly = searchParams.get('vip')     === '1'
  const b2bOnly = searchParams.get('b2b')     === '1'
  const sortIdx = parseInt(searchParams.get('sort') ?? '0', 10) || 0
  const page    = parseInt(searchParams.get('page') ?? '1', 10) || 1
  const sort    = SORTS[Math.min(sortIdx, SORTS.length - 1)]

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
  if (q.trim())   params.search     = q.trim()
  if (vipOnly)    params.vip_level  = 'VIP'
  if (b2bOnly)    params.guest_type = 'Corporate'

  const { data, isLoading, isFetching } = useQuery<IndexResponse>({
    queryKey: ['customers-list', params],
    queryFn: () => api.get('/v1/admin/guests', { params }).then(r => r.data),
    placeholderData: prev => prev,
  })

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
        <button
          onClick={() => navigate('/guests/new')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-medium text-sm transition-colors"
        >
          <Plus size={14} /> New customer
        </button>
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

      {/* Table */}
      <div className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] md:grid-cols-[2fr_2fr_1fr_1fr_auto] gap-3 px-4 py-2.5 border-b border-dark-border bg-dark-surface2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
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
            {q || vipOnly || b2bOnly
              ? 'No customers match your filters.'
              : 'No customers yet. Capture your first lead via /inquiries or /lead-forms.'}
          </div>
        ) : (
          rows.map(g => (
            <Row
              key={g.id}
              guest={g}
              onClick={() => navigate(`/guests/${g.id}`)}
            />
          ))
        )}
      </div>

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

function Row({ guest, onClick }: { guest: Guest; onClick: () => void }) {
  const isVip = !!guest.vip_level && guest.vip_level !== 'Standard'
  const initials = (guest.full_name || guest.email || '?')
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div
      onClick={onClick}
      className="grid grid-cols-[1fr_auto_auto] md:grid-cols-[2fr_2fr_1fr_1fr_auto] gap-3 px-4 py-3 border-b border-dark-border last:border-b-0 hover:bg-white/[0.02] cursor-pointer group items-center"
    >
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
            {isVip && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                <Star size={9} fill="currentColor" /> VIP
              </span>
            )}
          </div>
          {guest.position_title && (
            <div className="text-[11px] text-gray-500 truncate">{guest.position_title}</div>
          )}
        </div>
      </div>

      {/* Contact (hidden on mobile, shown on md+) */}
      <div className="hidden md:flex flex-col gap-0.5 min-w-0">
        {guest.email && <div className="text-xs text-gray-300 truncate">{guest.email}</div>}
        {(guest.phone || guest.mobile) && (
          <div className="text-[11px] text-gray-500 truncate">{guest.phone || guest.mobile}</div>
        )}
        {!guest.email && !guest.phone && !guest.mobile && (
          <div className="text-[11px] text-gray-700">—</div>
        )}
      </div>

      {/* Company */}
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

      {/* Activity */}
      <div className="hidden md:block text-right text-[11px] text-gray-500">
        {guest.total_stays && guest.total_stays > 0
          ? <><span className="text-emerald-400 font-semibold tabular-nums">{guest.total_stays}</span> stays</>
          : guest.created_at
            ? <>added {format(new Date(guest.created_at), 'MMM d')}</>
            : '—'}
      </div>

      {/* Mobile contact + chevron */}
      <div className="flex items-center gap-2 justify-end md:hidden">
        <ContactActions email={guest.email} phone={guest.phone || guest.mobile} compact />
      </div>
      <div className="hidden md:block">
        <ChevronRight size={14} className="text-gray-600 group-hover:text-primary-400 transition" />
      </div>
    </div>
  )
}
