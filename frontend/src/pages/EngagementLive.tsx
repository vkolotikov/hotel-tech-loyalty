import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Wifi, Users, Sparkles, AlertCircle, Bot, X, MapPin, Mail, Phone, Star,
} from 'lucide-react'
import { api } from '../lib/api'
import { INTENT_META } from '../lib/intentMeta'

/**
 * Engagement Live Wall — fullscreen back-office monitor view.
 *
 * Designed to be cast onto a TV/monitor at the concierge desk so the
 * front-office team gets ambient awareness of who's on the website
 * right now. No interactive controls, no drawer, no sidebar — just big
 * numbers, a grid of online visitors, and arrival animations.
 *
 * Renders OUTSIDE the admin Layout (the FullscreenRoute wrapper in
 * App.tsx skips it). Esc returns to /engagement.
 */

interface LiveRow {
  id: number
  effective_name: string
  email: string | null
  phone: string | null
  has_email: boolean
  has_phone: boolean
  is_lead: boolean
  is_online: boolean
  is_hot_lead: boolean
  country: string | null
  city: string | null
  current_page: string | null
  current_page_title: string | null
  visit_count: number
  page_views_count: number
  messages_count: number
  last_seen_at: string | null
  conversation: {
    id: number
    status: string
    intent_tag: string | null
  } | null
}

interface KpiCard { value: number; detail: string }

export function EngagementLive() {
  const navigate = useNavigate()

  // Track previously-seen visitor ids so newly-arrived rows can fade in
  // with an animation hint. The first frame is treated as the baseline so
  // we don't replay every visitor as "just arrived" on page open.
  const [arrivedIds, setArrivedIds] = useState<Set<number>>(new Set())
  const [seenBaseline, setSeenBaseline] = useState(false)

  // Esc / Q exits the live wall.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'q') navigate('/engagement')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  const { data: feed } = useQuery<{ data: LiveRow[] }>({
    queryKey: ['engagement-live', 'feed'],
    queryFn: () => api.get('/v1/admin/engagement/feed', {
      params: { filter: 'online', per_page: 50, sort: 'priority' },
    }).then(r => r.data),
    refetchInterval: 5_000,
    placeholderData: (prev) => prev,
  })

  const { data: kpis } = useQuery<{
    data: {
      online_now: KpiCard
      hot_leads: KpiCard
      unanswered: KpiCard
      ai_handled: KpiCard
    }
  }>({
    queryKey: ['engagement-live', 'kpis'],
    queryFn: () => api.get('/v1/admin/engagement/kpis').then(r => r.data),
    refetchInterval: 10_000,
  })

  // Detect arrivals between snapshots so newly-online rows can fade in.
  useEffect(() => {
    const rows = feed?.data ?? []
    const ids = new Set(rows.map(r => r.id))
    if (!seenBaseline) {
      setSeenBaseline(true)
      setArrivedIds(ids)
      return
    }
    const fresh: number[] = []
    rows.forEach(r => { if (!arrivedIds.has(r.id)) fresh.push(r.id) })
    if (fresh.length === 0) return
    const next = new Set(arrivedIds)
    fresh.forEach(id => next.add(id))
    setArrivedIds(next)
    // Fade-in highlight wears off after ~3s — the renderer keys off
    // `arrivedRecently` set rebuilt below from a separate timed state.
    fresh.forEach(id => setTimeout(() => {
      setArrivedRecently(prev => {
        const n = new Set(prev); n.delete(id); return n
      })
    }, 3000))
    setArrivedRecently(prev => {
      const n = new Set(prev); fresh.forEach(id => n.add(id)); return n
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed?.data])

  const [arrivedRecently, setArrivedRecently] = useState<Set<number>>(new Set())

  const rows = feed?.data ?? []
  const k = kpis?.data

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#070b14] via-[#0a0d14] to-[#0a0d1f] text-white overflow-hidden flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/40 flex items-center justify-center">
            <Wifi size={20} className="text-accent animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">Engagement Live</h1>
            <p className="text-xs text-t-secondary">Real-time visitor wall · auto-refresh 5s</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-t-secondary uppercase tracking-wide hidden lg:inline">Press Esc to exit</span>
          <button
            onClick={() => navigate('/engagement')}
            className="flex items-center gap-2 px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm hover:bg-dark-surface2 transition-colors"
          >
            <X size={14} />
            Exit
          </button>
        </div>
      </header>

      {/* Big KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-8 py-6">
        <BigKpi
          icon={Wifi}
          label="Online now"
          value={k?.online_now.value ?? 0}
          detail={k?.online_now.detail}
          color="#22c55e"
          pulse
        />
        <BigKpi
          icon={Star}
          label="Leads"
          value={k?.hot_leads.value ?? 0}
          detail={k?.hot_leads.detail}
          color="#f59e0b"
        />
        <BigKpi
          icon={AlertCircle}
          label="Unanswered"
          value={k?.unanswered.value ?? 0}
          detail={k?.unanswered.detail}
          color="#ef4444"
        />
        <BigKpi
          icon={Bot}
          label="AI handled today"
          value={k?.ai_handled.value ?? 0}
          detail={k?.ai_handled.detail}
          color="#8b5cf6"
        />
      </div>

      {/* Visitor wall */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-accent/5 border border-accent/20 flex items-center justify-center mx-auto mb-4">
                <Users size={32} className="text-t-secondary" />
              </div>
              <p className="text-2xl font-bold text-t-secondary">No one is online</p>
              <p className="text-sm text-t-secondary/70 mt-2">Visitors will appear here as they hit your site.</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-t-secondary mb-3 uppercase tracking-wide font-semibold">
              {rows.length} online · sorted by priority
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {rows.map(r => (
                <VisitorTile
                  key={r.id}
                  row={r}
                  highlight={arrivedRecently.has(r.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Tiles ────────────────────────────────────────────────── */

function BigKpi({
  icon: Icon, label, value, detail, color, pulse,
}: {
  icon: any; label: string; value: number; detail?: string; color: string; pulse?: boolean
}) {
  return (
    <div
      className="bg-dark-surface/80 border rounded-2xl p-5 backdrop-blur"
      style={{ borderColor: color + '40' }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${pulse ? 'animate-pulse' : ''}`}
          style={{ background: color + '20', border: `1px solid ${color}55` }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-[11px] uppercase tracking-wide font-bold text-t-secondary">
          {label}
        </span>
      </div>
      <div className="mt-3 text-5xl font-black tabular-nums" style={{ color }}>
        {value.toLocaleString()}
      </div>
      {detail && (
        <div className="text-xs text-t-secondary mt-1 truncate">{detail}</div>
      )}
    </div>
  )
}

function VisitorTile({ row: r, highlight }: { row: LiveRow; highlight: boolean }) {
  const flag = r.country ? countryFlag(r.country) : null
  const intentMeta = r.conversation?.intent_tag ? INTENT_META[r.conversation.intent_tag] : null

  return (
    <div
      className={`relative bg-dark-surface/80 border rounded-xl p-4 backdrop-blur transition-all duration-500 ${
        highlight
          ? 'border-accent ring-2 ring-accent/40 scale-[1.02] shadow-[0_0_24px_rgba(201,168,76,0.3)]'
          : r.is_hot_lead
          ? 'border-orange-500/50 shadow-[0_0_16px_rgba(251,146,60,0.15)]'
          : 'border-dark-border'
      }`}
    >
      {/* Online dot */}
      <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />

      {/* Identity */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-base font-bold text-accent flex-shrink-0">
          {r.effective_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-white text-sm truncate">{r.effective_name}</span>
            {flag && <span className="text-xs">{flag}</span>}
          </div>
          {(r.has_email || r.has_phone) && (
            <div className="flex items-center gap-2 mt-1 text-[10px] text-t-secondary">
              {r.has_email && <Mail size={10} className="text-blue-400" />}
              {r.has_phone && <Phone size={10} className="text-emerald-400" />}
              <span className="truncate font-mono">{r.email ?? r.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {r.is_hot_lead && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40 animate-pulse">
            <Sparkles size={9} /> HOT
          </span>
        )}
        {r.is_lead && !r.is_hot_lead && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-300/15 text-amber-300 border border-amber-300/30">
            <Star size={9} /> LEAD
          </span>
        )}
        {intentMeta && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${intentMeta.cls}`}>
            <intentMeta.icon size={9} />
            {intentMeta.label}
          </span>
        )}
        {r.conversation && r.conversation.status === 'active' && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/15 text-green-400 border border-green-500/30">
            CHAT
          </span>
        )}
      </div>

      {/* Current page */}
      {r.current_page && (
        <div className="mt-2.5 flex items-start gap-1.5 text-[10px] text-t-secondary">
          <MapPin size={10} className="flex-shrink-0 mt-0.5" />
          <span className="truncate font-mono">{r.current_page}</span>
        </div>
      )}

      {/* Stats footer */}
      <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-dark-border text-[10px] text-t-secondary">
        {r.visit_count > 1 && <span>{r.visit_count} visits</span>}
        {r.page_views_count > 0 && <span>{r.page_views_count} pages</span>}
        {r.messages_count > 0 && <span>{r.messages_count} msgs</span>}
        {r.city && <span className="ml-auto truncate">{r.city}</span>}
      </div>
    </div>
  )
}

function countryFlag(code: string): string {
  const c = code.trim().toUpperCase()
  if (c.length !== 2) return ''
  const [a, b] = [c.charCodeAt(0), c.charCodeAt(1)]
  return String.fromCodePoint(0x1f1e6 + (a - 65), 0x1f1e6 + (b - 65))
}
