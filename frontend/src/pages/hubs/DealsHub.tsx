import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Package, AlertTriangle, CreditCard, Star, Wrench, Truck,
  Briefcase, Wallet, ArrowLeft, ChevronRight, Search,
  TrendingUp, Banknote,
} from 'lucide-react'
import { api } from '../../lib/api'

/**
 * "Deals" hub — won inquiries working through fulfillment. Sibling
 * hub to Leads.
 *
 * Layout overhaul (2026-05-30):
 *  - KPI strip at the top of the home view so the first paint conveys
 *    "how busy am I" instantly without clicking a tile.
 *  - Tiles show live counts pulled from the existing /deals/kpis
 *    endpoint. Tiles with zero work go quiet (dim).
 *  - Section titles tightened ("Work the pipeline" → "Active work",
 *    "Money matters" → "Payment & revenue") to read at a glance.
 *  - Two extra tiles (Preparation, In Progress) — they were always
 *    supported by Deals.tsx as filters, just not exposed from the hub.
 *  - Leaf view drops the big H1 + subtitle. Breadcrumb is the title.
 *
 * Each tile is a pre-filtered view of the same Deals page; the active
 * filter is carried in `?view=` so refresh and deep links land on the
 * same view. The shared Deals component reads `?view=` on mount and
 * re-syncs when it changes.
 */

const Deals = lazy(() => import('../Deals').then(m => ({ default: m.Deals })))

type ViewKey = 'all' | 'overdue' | 'design_needed' | 'in_production' | 'payment_pending' | 'high_value'

interface TileDef {
  key: ViewKey
  label: string
  desc: string
  icon: any
  /** When `kpis` is loaded, this maps to the count we should display. */
  countOf?: (kpis: any) => number | null | undefined
  /** Optional accent override per tile (otherwise inherits section accent). */
  tone?: string
}

const TILES: TileDef[] = [
  {
    key: 'all',
    label: 'All active',
    desc: 'Every deal being worked right now',
    icon: Package,
    countOf: (k) => k?.total ?? null,
  },
  {
    key: 'overdue',
    label: 'Overdue',
    desc: 'Past due date — needs attention',
    icon: AlertTriangle,
    countOf: (k) => k?.overdue?.count ?? null,
    tone: '#f87171', // red — urgency
  },
  {
    key: 'design_needed',
    label: 'Preparation',
    desc: 'Design / spec / scoping stage',
    icon: Wrench,
    countOf: (k) => k?.design_needed?.count ?? null,
  },
  {
    key: 'in_production',
    label: 'In progress',
    desc: 'Being delivered or produced',
    icon: Truck,
    countOf: (k) => k?.in_production?.count ?? null,
  },
  {
    key: 'payment_pending',
    label: 'Awaiting payment',
    desc: 'Closed deals waiting on the customer to settle',
    icon: CreditCard,
    countOf: (k) => k?.awaiting_payment?.count ?? null,
  },
  {
    key: 'high_value',
    label: 'High value',
    desc: 'Premium deals — don\'t let them slip',
    icon: Star,
    countOf: (k) => k?.high_value?.count ?? null,
    tone: '#34d399', // emerald
  },
]

interface Section {
  id: string
  label: string
  /** Short eyebrow shown above the title — sets context fast. */
  eyebrow: string
  icon: any
  accent: string
  tiles: ViewKey[]
}

const SECTIONS: Section[] = [
  {
    id: 'work',
    label: 'Active work',
    eyebrow: 'Pipeline',
    icon: Briefcase,
    accent: '#c9a84c', // gold
    tiles: ['all', 'overdue', 'design_needed', 'in_production'],
  },
  {
    id: 'money',
    label: 'Payment & revenue',
    eyebrow: 'Money',
    icon: Wallet,
    accent: '#34d399', // emerald
    tiles: ['payment_pending', 'high_value'],
  },
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

  // KPI data — only fetched while on home so the leaf doesn't double-
  // fetch (Deals.tsx already pulls /deals/kpis for its filter pills).
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
        const filteredSections = SECTIONS
          .map(s => ({
            ...s,
            visibleTiles: s.tiles
              .map(id => TILES.find(t => t.key === id))
              .filter((t): t is TileDef => !!t)
              .filter(t => !q
                || t.label.toLowerCase().includes(q)
                || t.desc.toLowerCase().includes(q)
                || s.label.toLowerCase().includes(q)),
          }))
          .filter(s => s.visibleTiles.length > 0)

        // KPI strip data — derived from the live kpis response. Null/
        // undefined become "—" so the row paints sensibly during load.
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
          <div className="space-y-6">
            {/* KPI strip — fast read of "what state is my pipeline in".
                Each card has a semantic accent + icon; "Overdue" dims
                green when nothing is on fire. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

            {/* Search */}
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
              <input
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
                placeholder="Search deals & views…"
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {filteredSections.length === 0 && (
              <div className="text-center py-12 text-t-secondary text-sm">No matches.</div>
            )}

            {filteredSections.map(section => {
              const SIcon = section.icon
              const tileCount = section.visibleTiles.length
              return (
                <section key={section.id} className="space-y-3">
                  {/* Compact section header — eyebrow + title + count in
                      one line. Replaces the old taller heading + desc. */}
                  <div className="flex items-center gap-3">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${tint(section.accent, 0.20)}, ${tint(section.accent, 0.06)})`,
                        border: `1px solid ${tint(section.accent, 0.30)}`,
                      }}
                    >
                      <SIcon size={16} style={{ color: section.accent }} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: tint(section.accent, 0.7) }}>
                          {section.eyebrow}
                        </span>
                        <h2 className="text-base font-bold text-white leading-tight">{section.label}</h2>
                        <span className="text-[10px] tabular-nums font-bold text-t-secondary">
                          {tileCount}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Denser grid — 3 wide on lg so the 4-tile Active row
                      lays out as 3 + 1 (looks natural with the headline
                      "All active" tile spanning back to the front). 2
                      wide for Money section reads as a clean pair. */}
                  <div
                    className={`grid grid-cols-1 gap-3 ${
                      tileCount === 1 ? 'sm:grid-cols-2 lg:grid-cols-2'
                      : tileCount === 2 ? 'sm:grid-cols-2 lg:grid-cols-2'
                      : tileCount === 3 ? 'sm:grid-cols-2 lg:grid-cols-3'
                      : 'sm:grid-cols-2 lg:grid-cols-4'
                    }`}
                  >
                    {section.visibleTiles.map(tile => {
                      const accent = tile.tone ?? section.accent
                      const count = tile.countOf ? tile.countOf(kpis) : null
                      const quiet = count === 0
                      return (
                        <DealTile
                          key={tile.key}
                          tile={tile}
                          accent={accent}
                          count={count ?? null}
                          quiet={quiet}
                          onClick={() => setActiveTile(tile.key)}
                        />
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )
      })() : (
        <div className="space-y-5">
          {/* Leaf header — drops the verbose "— description" tail. The
              breadcrumb itself is the page title. Same pattern as
              LeadsHub for consistency. */}
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
          <p
            className={`text-xl font-bold tabular-nums leading-tight mt-1 ${dim ? 'text-gray-500' : 'text-white'}`}
          >
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
  tile, accent, count, quiet, onClick,
}: {
  tile: TileDef
  accent: string
  count: number | null
  quiet: boolean
  onClick: () => void
}) {
  const TIcon = tile.icon
  return (
    <button
      onClick={onClick}
      className="group relative text-left bg-dark-surface border border-dark-border rounded-xl p-3.5 overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent
        e.currentTarget.style.boxShadow = `0 8px 30px ${tint(accent, 0.18)}`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: accent }}
      />
      <span
        aria-hidden
        className="absolute -right-8 -top-8 w-28 h-28 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl pointer-events-none"
        style={{ background: tint(accent, 0.18) }}
      />
      <div className="relative flex items-start gap-3">
        <span
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${tint(accent, quiet ? 0.10 : 0.20)}, ${tint(accent, 0.04)})`,
            border: `1px solid ${tint(accent, quiet ? 0.18 : 0.30)}`,
          }}
        >
          <TIcon size={18} style={{ color: quiet ? tint(accent, 0.6) : accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className={`text-sm font-semibold leading-tight ${quiet ? 'text-gray-400' : 'text-white'}`}>{tile.label}</h3>
            {count != null && (
              <span
                className="text-[10px] tabular-nums font-bold px-1.5 py-0.5 rounded-md"
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
          <p className={`text-xs mt-0.5 line-clamp-2 leading-relaxed ${quiet ? 'text-gray-600' : 'text-t-secondary'}`}>
            {tile.desc}
          </p>
        </div>
        <ChevronRight size={16} className="text-t-secondary transition-all flex-shrink-0 mt-0.5 group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}

// Banknote is intentionally imported but only used in some configs — silence
// the linter without forcing a runtime import elsewhere.
void Banknote
