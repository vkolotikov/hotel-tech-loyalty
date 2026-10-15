import { lazy, Suspense, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Bell, Mail, Star, ArrowLeft, Search, PenLine } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useDataInk } from '../../theme/hx'
import { showsWorkspaceLink } from '../../workspace/lib/landing'

/**
 * "Marketing" hub — outbound communication + customer feedback, and the way
 * into HexaTech Content (AI content planning, in its own workspace at /content).
 *
 * Layout (2026-05-30 rev): flat square-tile grid. Outreach / Feedback
 * section headers dropped — each tile carries its own accent for
 * identity.
 *
 * Detail routes (/notifications/:id, /reviews/forms/:id,
 * /reviews/submissions/:id) stay outside the hub — they're leaves.
 */

const Notifications  = lazy(() => import('../Notifications').then(m => ({ default: m.Notifications })))
const EmailTemplates = lazy(() => import('../EmailTemplates').then(m => ({ default: m.EmailTemplates })))
const Reviews        = lazy(() => import('../Reviews').then(m => ({ default: m.Reviews })))

type TabKey = 'campaigns' | 'email-templates' | 'reviews'

// Warm a tab's chunk on hover/pointer-down so the click opens instantly.
const TAB_IMPORT: Record<TabKey, () => Promise<unknown>> = {
  'campaigns':       () => import('../Notifications'),
  'email-templates': () => import('../EmailTemplates'),
  'reviews':         () => import('../Reviews'),
}
const preloadTab = (k: string) => { try { TAB_IMPORT[k as TabKey]?.() } catch { /* best-effort */ } }

interface TileDef {
  key: TabKey | 'content'
  label: string
  desc: string
  icon: any
  accent: string
  /** A tile that opens another place (a workspace) rather than a tab here. */
  to?: string
}

const TILES: TileDef[] = [
  { key: 'campaigns',       label: 'Campaigns',       desc: 'Scheduled and one-off push + email campaigns',  icon: Bell, accent: '#a78bfa' }, // violet
  { key: 'email-templates', label: 'Email Templates', desc: 'Reusable email designs you can send to anyone', icon: Mail, accent: '#f472b6' }, // pink
  { key: 'reviews',         label: 'Reviews & Surveys', desc: 'Feedback surveys for web, email and on-site kiosks — with per-survey analytics', icon: Star, accent: '#c9a84c' }, // gold
  { key: 'content', label: 'HexaTech Content', desc: 'Plan and write your social posts with AI, in their own workspace', icon: PenLine, accent: '#8b5cf6', to: '/content' }, // purple
]

const fallback = <div className="text-center text-t-muted py-8 text-sm">Loading…</div>

const tint = (hex: string, alpha: number) => {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function MarketingHub() {
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
  const navigate = useNavigate()
  // HexaTech Content only where the organisation has it (the menu's rule; Layout keeps the user fresh from /auth/me).
  const hasContent = showsWorkspaceLink(useAuthStore(s => s.user), 'content')
  const tiles = TILES.filter(td => td.key !== 'content' || hasContent)

  // The old planner tab now lives in its own workspace (spec §6.9): old bookmarks land there — or on the hub's home
  // where the organisation does not have it.
  if (searchParams.get('tab') === 'content-planner' && hasContent) return <Navigate to="/content" replace />

  const tile = TILES.find(td => td.key === active && !td.to)
  const onHome = active === 'home' || !tile

  return (
    <div className="space-y-5">
      {onHome && (
        <div>
          <h1 className="text-2xl font-bold text-white">Marketing</h1>
          <p className="text-sm text-t-secondary mt-0.5">Reach guests with campaigns and listen to what they say back.</p>
        </div>
      )}

      {onHome ? (() => {
        const q = homeSearch.trim().toLowerCase()
        const visibleTiles = q
          ? tiles.filter(t => t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q))
          : tiles

        return (
          <div className="space-y-5">
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
              <input
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
                placeholder="Search marketing…"
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {visibleTiles.length === 0 && (
              <div className="text-center py-12 text-t-secondary text-sm">No matches.</div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 max-w-[1400px]">
              {visibleTiles.map(t => <Tile key={t.key} tile={t} onClick={() => (t.to ? navigate(t.to) : setActive(t.key as TabKey))} onPreload={() => preloadTab(t.key)} />)}
            </div>
          </div>
        )
      })() : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setActive('home')}
              className="flex items-center gap-1 text-xs text-t-secondary hover:text-white transition-colors px-1.5 py-1 -ml-1.5 rounded-md hover:bg-dark-surface2 flex-shrink-0"
              title="Back to Marketing home"
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Marketing</span>
            </button>
            <span className="text-t-secondary/40 flex-shrink-0">/</span>
            <div className="flex items-center gap-1.5 min-w-0">
              {tile && <tile.icon size={14} className="text-t-secondary flex-shrink-0" />}
              {tile && <h2 className="text-base font-semibold text-white truncate">{tile.label}</h2>}
            </div>
          </div>

          <Suspense fallback={fallback}>
            {active === 'campaigns'        && <Notifications />}
            {active === 'email-templates'  && <EmailTemplates />}
            {active === 'reviews'          && <Reviews />}
          </Suspense>
        </div>
      )}
    </div>
  )
}

function Tile({ tile, onClick, onPreload }: { tile: TileDef; onClick: () => void; onPreload?: () => void }) {
  const Icon = tile.icon
  const { accent } = tile
  const ink = useDataInk()
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
      <span
        aria-hidden
        className="absolute -right-12 -top-12 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-3xl pointer-events-none"
        style={{ background: tint(accent, 0.30) }}
      />
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${tint(accent, 0.45)}, transparent)` }}
      />

      <div className="relative">
        <span
          className="inline-flex w-12 h-12 sm:w-14 sm:h-14 rounded-2xl items-center justify-center transition-transform group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${tint(accent, 0.22)}, ${tint(accent, 0.06)})`,
            border: `1px solid ${tint(accent, 0.35)}`,
            boxShadow: `0 0 24px ${tint(accent, 0.20)}`,
          }}
        >
          <Icon size={22} style={{ color: ink(accent) }} />
        </span>
      </div>

      <div className="relative mt-auto">
        <h3 className="text-base sm:text-lg font-bold text-white leading-tight">{tile.label}</h3>
        <p className="text-xs text-t-secondary mt-1 line-clamp-2 leading-relaxed">{tile.desc}</p>
      </div>
    </button>
  )
}
