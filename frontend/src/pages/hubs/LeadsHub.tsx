import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FileText, Users, Building2, Copy, FilePlus2,
  ArrowLeft, Search,
} from 'lucide-react'

/**
 * "Leads" hub — top of the CRM funnel. Combines pipeline intake +
 * contact identity (Customers / Companies / Duplicates) + lead-capture
 * into one grid-home page so staff can manage their entire
 * leads-and-contacts workflow from a single sidebar entry.
 *
 * Layout (2026-05-30 rev): flat square-tile grid. Section headers
 * (Pipeline / Contacts / Capture) removed — they added a layer of
 * visual chrome without conveying anything that couldn't be inferred
 * from each tile's own icon + colour. Tiles are roughly square at all
 * breakpoints so the page reads as a wall of equal-weight choices,
 * not a hierarchy.
 *
 * Each tile carries its own accent colour for visual identity, since
 * section colour-coding is gone:
 *   Leads & Inquiries → gold (primary action)
 *   Customers         → pink
 *   Companies         → cyan
 *   Duplicates        → orange
 *   Lead forms        → violet
 */

const Inquiries          = lazy(() => import('../Inquiries').then(m => ({ default: m.Inquiries })))
const Customers          = lazy(() => import('../Customers').then(m => ({ default: m.Customers })))
const Corporate          = lazy(() => import('../Corporate').then(m => ({ default: m.Corporate })))
const CustomerDuplicates = lazy(() => import('../CustomerDuplicates').then(m => ({ default: m.CustomerDuplicates })))
const LeadForms          = lazy(() => import('../LeadForms').then(m => ({ default: m.LeadForms })))

type TabKey = 'inquiries' | 'customers' | 'companies' | 'duplicates' | 'lead-forms'

// Warm a tab's chunk on hover/pointer-down so clicking the tile opens it
// instantly instead of waiting on the lazy fetch. Same module specifiers as
// the lazy() above → the registry dedupes, no double download.
const TAB_IMPORT: Record<TabKey, () => Promise<unknown>> = {
  'inquiries':  () => import('../Inquiries'),
  'customers':  () => import('../Customers'),
  'companies':  () => import('../Corporate'),
  'duplicates': () => import('../CustomerDuplicates'),
  'lead-forms': () => import('../LeadForms'),
}
const preloadTab = (k: TabKey) => { try { TAB_IMPORT[k]?.() } catch { /* best-effort */ } }

interface TileDef {
  key: TabKey
  label: string
  desc: string
  icon: any
  accent: string
}

const TILES: TileDef[] = [
  { key: 'inquiries',  label: 'Leads & Inquiries', desc: 'Open leads moving through your sales pipeline', icon: FileText,  accent: '#c9a84c' },
  { key: 'customers',  label: 'Customers',         desc: 'Individual contacts — guests and prospects',    icon: Users,     accent: '#f472b6' },
  { key: 'companies',  label: 'Companies',         desc: 'Corporate accounts and B2B contacts',           icon: Building2, accent: '#22d3ee' },
  { key: 'duplicates', label: 'Duplicates',        desc: 'Possible duplicates — review and merge',        icon: Copy,      accent: '#fb923c' },
  { key: 'lead-forms', label: 'Lead forms',        desc: 'Embeddable forms — the front door for leads',   icon: FilePlus2, accent: '#a78bfa' },
]

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

const tint = (hex: string, alpha: number) => {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function LeadsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = (searchParams.get('tab') as TabKey | 'home' | null) || 'home'
  const setActive = (next: TabKey | 'home') => {
    if (next === 'home') {
      const sp = new URLSearchParams(searchParams)
      sp.delete('tab')
      setSearchParams(sp, { replace: true })
    } else {
      setSearchParams({ tab: next }, { replace: true })
    }
  }

  const [homeSearch, setHomeSearch] = useState('')

  const tile = TILES.find(td => td.key === active)
  const onHome = active === 'home' || !tile

  return (
    <div className="space-y-5">
      {onHome && (
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-sm text-t-secondary mt-0.5">Top-of-funnel inquiries plus everyone you're talking to.</p>
        </div>
      )}

      {onHome ? (() => {
        const q = homeSearch.trim().toLowerCase()
        const visibleTiles = q
          ? TILES.filter(t => t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q))
          : TILES

        return (
          <div className="space-y-5">
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
              <input
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
                placeholder="Search leads & contacts…"
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {visibleTiles.length === 0 && (
              <div className="text-center py-12 text-t-secondary text-sm">No matches.</div>
            )}

            {/* Flat square-tile grid. No section headers — each tile
                carries its own identity through icon + accent colour.
                Tiles are aspect-square so the page reads as a wall of
                equal-weight choices. Capped width via the grid so they
                don't balloon on ultrawide displays. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 max-w-[1400px]">
              {visibleTiles.map(t => <Tile key={t.key} tile={t} onClick={() => setActive(t.key)} onPreload={() => preloadTab(t.key)} />)}
            </div>
          </div>
        )
      })() : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setActive('home')}
              className="flex items-center gap-1 text-xs text-t-secondary hover:text-white transition-colors px-1.5 py-1 -ml-1.5 rounded-md hover:bg-dark-surface2 flex-shrink-0"
              title="Back to Leads home"
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Leads</span>
            </button>
            <span className="text-t-secondary/40 flex-shrink-0">/</span>
            <div className="flex items-center gap-1.5 min-w-0">
              {tile && <tile.icon size={14} className="text-t-secondary flex-shrink-0" />}
              {tile && <h2 className="text-base font-semibold text-white truncate">{tile.label}</h2>}
            </div>
          </div>

          <Suspense fallback={fallback}>
            {active === 'inquiries'  && <Inquiries />}
            {active === 'customers'  && <Customers />}
            {active === 'companies'  && <Corporate />}
            {active === 'duplicates' && <CustomerDuplicates />}
            {active === 'lead-forms' && <LeadForms />}
          </Suspense>
        </div>
      )}
    </div>
  )
}

// ─── Tile ────────────────────────────────────────────────────────────

function Tile({ tile, onClick, onPreload }: { tile: TileDef; onClick: () => void; onPreload?: () => void }) {
  const Icon = tile.icon
  const { accent } = tile
  return (
    <button
      onClick={onClick}
      onPointerDown={onPreload}
      onFocus={onPreload}
      className="group relative aspect-square flex flex-col bg-dark-surface border border-dark-border rounded-2xl p-5 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 text-left"
      onMouseEnter={(e) => {
        onPreload?.()
        e.currentTarget.style.borderColor = accent
        e.currentTarget.style.boxShadow = `0 12px 36px ${tint(accent, 0.22)}`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      {/* Decorative accent glow on hover */}
      <span
        aria-hidden
        className="absolute -right-12 -top-12 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-3xl pointer-events-none"
        style={{ background: tint(accent, 0.30) }}
      />
      {/* Faint baseline tint so the tile has color identity even at rest */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${tint(accent, 0.45)}, transparent)` }}
      />

      {/* Top: icon tile */}
      <div className="relative">
        <span
          className="inline-flex w-12 h-12 sm:w-14 sm:h-14 rounded-2xl items-center justify-center transition-transform group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${tint(accent, 0.22)}, ${tint(accent, 0.06)})`,
            border: `1px solid ${tint(accent, 0.35)}`,
            boxShadow: `0 0 24px ${tint(accent, 0.20)}`,
          }}
        >
          <Icon size={22} style={{ color: accent }} />
        </span>
      </div>

      {/* Bottom: title + description anchored to the bottom-left so the
          tile reads as: "icon up top, what-it-is down low". */}
      <div className="relative mt-auto">
        <h3 className="text-base sm:text-lg font-bold text-white leading-tight">{tile.label}</h3>
        <p className="text-xs text-t-secondary mt-1 line-clamp-2 leading-relaxed">{tile.desc}</p>
      </div>
    </button>
  )
}
