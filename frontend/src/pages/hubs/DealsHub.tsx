import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Package, AlertTriangle, CreditCard, Star, Wrench, Truck,
  ArrowLeft, Search, TrendingUp,
} from 'lucide-react'
import { api } from '../../lib/api'

/**
 * "Deals" hub — won inquiries working through fulfillment.
 *
 * Layout (2026-05-30 rev2): flat square-tile grid. Section headers
 * (Active work / Payment & revenue) dropped — each tile now carries
 * its own accent + count for identity. KPI strip kept at the top:
 * it surfaces totals the tiles don't (pipeline value) and dims the
 * Overdue card when there's nothing on fire.
 *
 * Each tile is a pre-filtered view of the same Deals page; the active
 * filter is carried in `?view=` so refresh and deep links land on the
 * same view.
 */

const Deals = lazy(() => import('../Deals').then(m => ({ default: m.Deals })))

type ViewKey = 'all' | 'overdue' | 'design_needed' | 'in_production' | 'payment_pending' | 'high_value'

interface TileDef {
  key: ViewKey
  label: string
  desc: string
  icon: any
  accent: string
  countOf?: (kpis: any) => number | null | undefined
}

const TILES: TileDef[] = [
  { key: 'all',             label: 'All active',       desc: 'Every deal being worked right now',                 icon: Package,        accent: '#c9a84c', countOf: (k) => k?.total ?? null },
  { key: 'overdue',         label: 'Overdue',          desc: 'Past due date — needs attention',                   icon: AlertTriangle,  accent: '#f87171', countOf: (k) => k?.overdue?.count ?? null },
  { key: 'design_needed',   label: 'Preparation',      desc: 'Design / spec / scoping stage',                     icon: Wrench,         accent: '#60a5fa', countOf: (k) => k?.design_needed?.count ?? null },
  { key: 'in_production',   label: 'In progress',      desc: 'Being delivered or produced',                       icon: Truck,          accent: '#22d3ee', countOf: (k) => k?.in_production?.count ?? null },
  { key: 'payment_pending', label: 'Awaiting payment', desc: 'Closed deals waiting on the customer',              icon: CreditCard,     accent: '#fb923c', countOf: (k) => k?.awaiting_payment?.count ?? null },
  { key: 'high_value',      label: 'High value',       desc: 'Premium deals — don\'t let them slip',              icon: Star,           accent: '#34d399', countOf: (k) => k?.high_value?.count ?? null },
]

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

const tint = (hex: string, alpha: number) => {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function DealsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const onHome = !searchParams.get('tab')
  const setActiveTile = (view: ViewKey) => {
    const sp = new URLSearchParams()
    sp.set('tab', 'list')
    if (view !== 'all') sp.set('view', view)
    setSearchParams(sp, { replace: true })
  }
  const goHome = () => {
    const sp = new URLSearchParams(searchParams)
    sp.delete('tab')
    sp.delete('view')
    setSearchParams(sp, { replace: true })
  }
  const currentView: ViewKey = ((): ViewKey => {
    const v = searchParams.get('view') as ViewKey | null
    return (v && TILES.some(t => t.key === v)) ? v : 'all'
  })()
  const activeTile = TILES.find(t => t.key === currentView) ?? TILES[0]

  const [homeSearch, setHomeSearch] = useState('')

  const { data: kpis } = useQuery<any>({
    queryKey: ['deals-kpis'],
    queryFn: () => api.get('/v1/admin/deals/kpis').then(r => r.data),
    staleTime: 60_000,
    refetchInterval: onHome ? 60_000 : false,
    enabled: onHome,
  })

  return (
    <div className="space-y-5">
      {onHome && (
        <div>
          <h1 className="text-2xl font-bold text-white">Deals</h1>
          <p className="text-sm text-t-secondary mt-0.5">Won inquiries flowing through fulfillment, payment, and delivery.</p>
        </div>
      )}

      {onHome ? (() => {
        const q = homeSearch.trim().toLowerCase()
        const visibleTiles = q
          ? TILES.filter(t => t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q))
          : TILES

        const total = kpis?.total
        const overdue = kpis?.overdue?.count
        const awaiting = kpis?.awaiting_payment?.count
        const valueCents: number | undefined = kpis?.total_value_cents ?? kpis?.pipeline_value_cents
        const currency = (kpis?.currency_symbol as string) ?? '€'
        const formatValue = (cents?: number) => {
          if (cents == null) return '—'
          const n = cents / 100
          if (n >= 1_000_000) return `${currency}${(n / 1_000_000).toFixed(1)}M`
          if (n >= 1_000)     return `${currency}${(n / 1_000).toFixed(1)}k`
          return `${currency}${Math.round(n)}`
        }

        return (
          <div className="space-y-5">
            {/* KPI strip — fast read of "what state is my pipeline in".
                Kept across the redesign because it carries one piece of
                data the tiles can't (pipeline value) + dims Overdue
                when there's nothing on fire. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-[1400px]">
              <KpiCard
                label="Active deals"
                value={total != null ? String(total) : '—'}
                icon={Package}
                accent="#c9a84c"
                tone="gold"
              />
              <KpiCard
                label="Overdue"
                value={overdue != null ? String(overdue) : '—'}
                icon={AlertTriangle}
                accent="#f87171"
                tone={overdue && overdue > 0 ? 'red' : 'dim'}
              />
              <KpiCard
                label="Awaiting payment"
                value={awaiting != null ? String(awaiting) : '—'}
                icon={CreditCard}
                accent="#38bdf8"
                tone="blue"
              />
              <KpiCard
                label="Pipeline value"
                value={formatValue(valueCents)}
                icon={TrendingUp}
                accent="#34d399"
                tone="emerald"
                hint={valueCents == null ? 'Add deal values to see total' : undefined}
              />
            </div>

            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
              <input
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
                placeholder="Search deals & views…"
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {visibleTiles.length === 0 && (
              <div className="text-center py-12 text-t-secondary text-sm">No matches.</div>
            )}

            {/* Flat square-tile grid — no section headers. Each tile
                carries its own accent + live count badge. 6 tiles fit
                a 3+3 layout at lg, 2+2+2 on mobile. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 max-w-[1400px]">
              {visibleTiles.map(tile => (
                <DealTile
                  key={tile.key}
                  tile={tile}
                  count={tile.countOf ? tile.countOf(kpis) ?? null : null}
                  quiet={tile.countOf ? tile.countOf(kpis) === 0 : false}
                  onClick={() => setActiveTile(tile.key)}
                />
              ))}
            </div>
          </div>
        )
      })() : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={goHome}
              className="flex items-center gap-1 text-xs text-t-secondary hover:text-white transition-colors px-1.5 py-1 -ml-1.5 rounded-md hover:bg-dark-surface2 flex-shrink-0"
              title="Back to Deals home"
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Deals</span>
            </button>
            <span className="text-t-secondary/40 flex-shrink-0">/</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <activeTile.icon size={14} className="text-t-secondary flex-shrink-0" />
              <h2 className="text-base font-semibold text-white truncate">{activeTile.label}</h2>
            </div>
          </div>

          <Suspense fallback={fallback}>
            <Deals />
          </Suspense>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, accent, tone, hint,
}: {
  label: string
  value: string
  icon: any
  accent: string
  tone: 'gold' | 'red' | 'blue' | 'emerald' | 'dim'
  hint?: string
}) {
  const dim = tone === 'dim'
  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-dark-surface px-4 py-3"
      style={{
        borderColor: dim ? 'rgba(255,255,255,0.06)' : tint(accent, 0.18),
      }}
    >
      <span
        aria-hidden
        className="absolute right-0 top-0 w-20 h-20 rounded-full blur-2xl pointer-events-none"
        style={{ background: dim ? 'transparent' : tint(accent, 0.08), transform: 'translate(30%, -30%)' }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-bold text-t-secondary truncate">{label}</p>
          <p className={`text-xl font-bold tabular-nums leading-tight mt-1 ${dim ? 'text-gray-500' : 'text-white'}`}>
            {value}
          </p>
          {hint && <p className="text-[10px] text-t-secondary mt-1 truncate">{hint}</p>}
        </div>
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: dim ? 'rgba(255,255,255,0.03)' : tint(accent, 0.15),
            border: `1px solid ${dim ? 'rgba(255,255,255,0.06)' : tint(accent, 0.3)}`,
          }}
        >
          <Icon size={14} style={{ color: dim ? '#6b7280' : accent }} />
        </span>
      </div>
    </div>
  )
}

function DealTile({
  tile, count, quiet, onClick,
}: {
  tile: TileDef
  count: number | null
  quiet: boolean
  onClick: () => void
}) {
  const Icon = tile.icon
  const { accent } = tile
  return (
    <button
      onClick={onClick}
      className="group relative aspect-square flex flex-col bg-dark-surface border border-dark-border rounded-2xl p-4 sm:p-5 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 text-left"
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent
        e.currentTarget.style.boxShadow = `0 12px 36px ${tint(accent, 0.22)}`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      <span
        aria-hidden
        className="absolute -right-12 -top-12 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-3xl pointer-events-none"
        style={{ background: tint(accent, 0.30) }}
      />
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${tint(accent, quiet ? 0.20 : 0.45)}, transparent)` }}
      />

      <div className="relative flex items-start justify-between gap-2">
        <span
          className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-2xl items-center justify-center transition-transform group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${tint(accent, quiet ? 0.10 : 0.22)}, ${tint(accent, 0.04)})`,
            border: `1px solid ${tint(accent, quiet ? 0.18 : 0.35)}`,
            boxShadow: quiet ? 'none' : `0 0 20px ${tint(accent, 0.18)}`,
          }}
        >
          <Icon size={20} style={{ color: quiet ? tint(accent, 0.6) : accent }} />
        </span>
        {count != null && (
          <span
            className="text-[11px] tabular-nums font-bold px-2 py-0.5 rounded-md self-start mt-1"
            style={{
              background: quiet ? 'rgba(255,255,255,0.04)' : tint(accent, 0.18),
              color: quiet ? '#6b7280' : accent,
              border: `1px solid ${quiet ? 'rgba(255,255,255,0.06)' : tint(accent, 0.30)}`,
            }}
          >
            {count}
          </span>
        )}
      </div>

      <div className="relative mt-auto">
        <h3 className={`text-sm sm:text-base font-bold leading-tight ${quiet ? 'text-gray-400' : 'text-white'}`}>{tile.label}</h3>
        <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${quiet ? 'text-gray-600' : 'text-t-secondary'}`}>
          {tile.desc}
        </p>
      </div>
    </button>
  )
}
