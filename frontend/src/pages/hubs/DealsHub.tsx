import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Package, AlertTriangle, CreditCard, Star,
  GitBranch, Banknote, ArrowLeft, ChevronRight, Search,
} from 'lucide-react'

/**
 * "Deals" hub — won inquiries working through fulfillment. Sibling
 * hub to Leads. Each tile is a pre-filtered view of the same Deals
 * page; the active filter is carried in `?view=` so refresh and deep
 * links land on the same view. The shared Deals component reads
 * ?view= on mount and re-syncs when it changes.
 *
 * Analytics deliberately not included — deal reporting lives in
 * /analytics so this hub stays focused on daily management.
 */

const Deals = lazy(() => import('../Deals').then(m => ({ default: m.Deals })))

type ViewKey = 'all' | 'overdue' | 'payment_pending' | 'high_value'

interface TileDef {
  key: ViewKey
  label: string
  desc: string
  icon: any
}

const TILES: TileDef[] = [
  { key: 'all',             label: 'All Active Deals', desc: 'Every deal currently being worked',                       icon: Package },
  { key: 'overdue',         label: 'Overdue',          desc: 'Past their delivery date and need attention',             icon: AlertTriangle },
  { key: 'payment_pending', label: 'Payment Pending',  desc: 'Deals waiting on the customer to settle',                 icon: CreditCard },
  { key: 'high_value',      label: 'High Value',       desc: 'Premium deals that should not slip through the cracks',   icon: Star },
]

interface Section {
  id: string
  label: string
  desc: string
  icon: any
  accent: string
  tiles: ViewKey[]
}

const SECTIONS: Section[] = [
  {
    id: 'work',
    label: 'Work the pipeline',
    desc: 'Open deals you are actively driving toward completion',
    icon: GitBranch,
    accent: '#c9a84c', // gold
    tiles: ['all', 'overdue'],
  },
  {
    id: 'money',
    label: 'Money matters',
    desc: 'Deals where payment is the next blocker',
    icon: Banknote,
    accent: '#34d399', // emerald
    tiles: ['payment_pending', 'high_value'],
  },
]

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

export function DealsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  // `tab=list` ⇒ render the Deals.tsx list. `view=<filter>` ⇒ which
  // filter pill to preselect inside it. Default (no params) renders
  // the grid home.
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

  const tint = (hex: string, alpha: number) => {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Deals</h1>
        <p className="text-sm text-t-secondary mt-0.5">Won deals working through fulfillment, payment, and delivery.</p>
      </div>

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

        return (
          <div className="space-y-8">
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
              <input
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
                placeholder="Search deals…"
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {filteredSections.length === 0 && (
              <div className="text-center py-12 text-t-secondary text-sm">No matches.</div>
            )}

            {filteredSections.map(section => {
              const SIcon = section.icon
              const tileCount = section.visibleTiles.length
              const gridCols = tileCount === 1 ? 'sm:grid-cols-1 lg:grid-cols-2'
                : tileCount === 2 ? 'sm:grid-cols-2 lg:grid-cols-2'
                : 'sm:grid-cols-2 lg:grid-cols-3'
              return (
                <section key={section.id} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${tint(section.accent, 0.22)}, ${tint(section.accent, 0.08)})`,
                        border: `1px solid ${tint(section.accent, 0.35)}`,
                        boxShadow: `0 0 24px ${tint(section.accent, 0.18)}`,
                      }}
                    >
                      <SIcon size={18} style={{ color: section.accent }} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-white">{section.label}</h2>
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: section.accent }} />
                        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: section.accent }}>{tileCount}</span>
                      </div>
                      <p className="text-xs text-t-secondary">{section.desc}</p>
                    </div>
                  </div>

                  <div className={`grid grid-cols-1 ${gridCols} gap-3`}>
                    {section.visibleTiles.map(tile => {
                      const TIcon = tile.icon
                      return (
                        <button
                          key={tile.key}
                          onClick={() => setActiveTile(tile.key)}
                          className="group relative text-left bg-dark-surface border border-dark-border rounded-xl p-4 overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = section.accent
                            e.currentTarget.style.boxShadow = `0 8px 30px ${tint(section.accent, 0.18)}`
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = ''
                            e.currentTarget.style.boxShadow = ''
                          }}
                        >
                          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: section.accent }} />
                          <span aria-hidden className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl pointer-events-none" style={{ background: tint(section.accent, 0.18) }} />
                          <div className="relative flex items-start gap-3">
                            <span
                              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                              style={{
                                background: `linear-gradient(135deg, ${tint(section.accent, 0.18)}, ${tint(section.accent, 0.04)})`,
                                border: `1px solid ${tint(section.accent, 0.3)}`,
                              }}
                            >
                              <TIcon size={20} style={{ color: section.accent }} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold text-white">{tile.label}</h3>
                              <p className="text-xs text-t-secondary mt-1 line-clamp-2 leading-relaxed">{tile.desc}</p>
                            </div>
                            <ChevronRight size={16} className="text-t-secondary transition-all flex-shrink-0 mt-1 group-hover:translate-x-0.5" />
                          </div>
                        </button>
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
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={goHome}
              className="flex items-center gap-1.5 text-xs text-t-secondary hover:text-white transition-colors px-2 py-1 -ml-2 rounded-md hover:bg-dark-surface2"
            >
              <ArrowLeft size={13} />
              All deals
            </button>
            <span className="text-t-secondary/40">/</span>
            <div className="flex items-center gap-2 min-w-0">
              <activeTile.icon size={14} className="text-t-secondary flex-shrink-0" />
              <h2 className="text-sm font-semibold text-white truncate">{activeTile.label}</h2>
              <span className="hidden md:inline text-xs text-t-secondary truncate">— {activeTile.desc}</span>
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
