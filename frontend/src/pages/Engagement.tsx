import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Eye, MessageSquare, Mail, Phone, Sparkles, Star,
  Search, ChevronLeft, ChevronRight, RefreshCw, Inbox as InboxIcon,
  Bot, Wifi, MapPin, BellRing, BellOff, Bell, X, Monitor,
} from 'lucide-react'
import { api } from '../lib/api'
import { INTENT_META } from '../lib/intentMeta'
import { useBrandStore } from '../stores/brandStore'
import { BrandBadge } from '../components/BrandBadge'
import { EngagementDrawer } from '../components/EngagementDrawer'
import { useHotLeadAlert, useNotificationPermission, type HotLeadInfo } from '../hooks/useHotLeadAlert'

/**
 * Engagement Hub — replaces the Inbox + Visitors split with a single
 * smart-prioritised feed. See apps/loyalty/ENGAGEMENT_HUB_PLAN.md.
 *
 * Phase 1 deliverable: list view + KPI cards + filter chips + search.
 * Detail drawer + quick actions land in Phase 2.
 */

type FilterKey =
  | 'priority' | 'online' | 'has_contact' | 'active_chat' | 'hot_lead'
  | 'anonymous' | 'resolved'
  | 'booking_inquiry' | 'info_request' | 'complaint' | 'cancellation' | 'support'

interface EngagementRow {
  id: number
  visitor_key: string
  effective_name: string
  email: string | null
  phone: string | null
  has_email: boolean
  has_phone: boolean
  is_lead: boolean
  is_online: boolean
  country: string | null
  city: string | null
  visitor_ip: string | null
  current_page: string | null
  current_page_title: string | null
  visit_count: number
  page_views_count: number
  messages_count: number
  last_seen_at: string | null
  brand_id: number | null
  guest: { id: number; name: string } | null
  conversation: {
    id: number
    status: string
    last_message_preview: string | null
    last_message_sender: string | null
    last_message_at: string | null
    lead_captured: boolean
    ai_enabled: boolean
    assigned_to: number | null
    unread_admin_count: number
    intent_tag: string | null
  } | null
  is_hot_lead: boolean
  priority_score: number
}

// KpiCard / KpiResp types moved with the tiles to /analytics → Chat tab.

// Module-level filter taxonomy. The `label` here is the English fallback;
// the component resolves the localised label via t(`engagement.filters.${key}`)
// at render time. Keeping the structural list out of the component keeps
// it cheap to import for tests and other helpers.
const FILTERS: { key: FilterKey; label: string; icon: any; tone?: string }[] = [
  { key: 'priority',    label: 'Priority',     icon: Sparkles                 },
  { key: 'online',      label: 'Online',       icon: Wifi,  tone: 'green'     },
  { key: 'has_contact', label: 'Has contact',  icon: Mail                     },
  { key: 'active_chat', label: 'Active chat',  icon: MessageSquare            },
  { key: 'hot_lead',    label: 'Hot leads',    icon: Sparkles, tone: 'amber'  },
  { key: 'anonymous',   label: 'Anonymous',    icon: Eye                      },
  { key: 'resolved',    label: 'Resolved',     icon: InboxIcon                },
]

const INTENT_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'booking_inquiry', label: 'Booking' },
  { key: 'info_request',    label: 'Info' },
  { key: 'complaint',       label: 'Complaint' },
  { key: 'cancellation',    label: 'Cancellation' },
  { key: 'support',         label: 'Support' },
]

/** Maps a FilterKey to its i18n key under `engagement.filters.*`. The
 * top-row chips live at `.priority/.online/...` and intent chips live
 * one level deeper at `.intent.<key>`. */
function filterLabelKey(k: FilterKey): string {
  const intentKeys = ['booking_inquiry', 'info_request', 'complaint', 'cancellation', 'support'] as const
  return (intentKeys as readonly string[]).includes(k) ? `engagement.filters.intent.${k}` : `engagement.filters.${k}`
}

export function Engagement() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { brands } = useBrandStore()

  const [filter, setFilter] = useState<FilterKey>('priority')
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'all'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Drawer state — visitorId !== null means it's open. conversationId is
  // optional; when set, the Conversation tab is auto-selected.
  const [drawerVisitorId, setDrawerVisitorId] = useState<number | null>(null)
  const [drawerConvId, setDrawerConvId] = useState<number | null>(null)
  const openDrawer = (visitorId: number, conversationId: number | null) => {
    setDrawerVisitorId(visitorId)
    setDrawerConvId(conversationId)
  }
  const closeDrawer = () => {
    setDrawerVisitorId(null)
    setDrawerConvId(null)
  }
  // The drawer can ask the page to re-open with a new conversation id (e.g.
  // after "Start chat" creates one). Listen for that event.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ visitorId: number; conversationId: number }>).detail
      if (detail?.visitorId) openDrawer(detail.visitorId, detail.conversationId ?? null)
    }
    window.addEventListener('engagement:open', handler as EventListener)
    return () => window.removeEventListener('engagement:open', handler as EventListener)
  }, [])

  // KPI tiles have moved to /analytics → Chat tab. The same data is
  // still polled from /v1/admin/engagement/kpis there.

  // Feed — Phase 4 tightens to 5s when the tab is visible. Combined with
  // useHotLeadAlert below this gives a near-realtime "hot lead arrived"
  // signal without per-row backend events.
  const { data: feed, isLoading, refetch, isFetching } = useQuery<{
    data: EngagementRow[]
    meta: { current_page: number; last_page: number; total: number; per_page: number }
  }>({
    queryKey: ['engagement', 'feed', filter, range, search, page],
    queryFn: () => api.get('/v1/admin/engagement/feed', {
      params: { filter, range, search, page, per_page: 50, sort: 'priority' },
    }).then(r => r.data),
    refetchInterval: 5_000,
    placeholderData: (prev) => prev,
  })

  // Per-filter row counts for the current range — feeds the badge
  // number next to each filter chip. Refresh every 30s so the badges
  // don't drift while the feed itself polls every 5s.
  const { data: filterCounts } = useQuery<{ data: Record<string, number> }>({
    queryKey: ['engagement', 'filter-counts', range],
    queryFn: () => api.get('/v1/admin/engagement/filter-counts', { params: { range } }).then(r => r.data),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })
  const counts = filterCounts?.data ?? {}

  const rows = feed?.data ?? []
  const meta = feed?.meta

  // Phase 4 — hot-lead arrival alerts. We feed the hook the list of ids
  // that the backend marked is_hot_lead=true on the current page, plus a
  // lookup that resolves the row's display name + a short context line.
  // The hook diffs against the previous snapshot and fires a toast +
  // (when permission is granted) a browser notification for each newly-hot
  // visitor, rate-limited at one alert per visitor per 30s.
  const hotIds = useMemo(() => rows.filter(r => r.is_hot_lead).map(r => r.id), [rows])
  const lookupRow = useCallback((id: number): HotLeadInfo | undefined => {
    const r = rows.find(x => x.id === id)
    if (!r) return undefined
    const context = r.is_online && r.current_page
      ? `Browsing ${r.current_page}`
      : r.conversation?.last_message_preview
      ? r.conversation.last_message_preview
      : r.is_online
      ? 'Online now'
      : undefined
    return { id, name: r.effective_name, context }
  }, [rows])
  useHotLeadAlert(hotIds, lookupRow)

  // Browser notification permission state — drives the small banner at
  // the top of the page that nudges the agent to enable notifications
  // once. Auto-hides when permission is granted or denied.
  const { permission, request: requestPermission } = useNotificationPermission()
  const [permBannerDismissed, setPermBannerDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('engagement-perm-dismissed') === '1'
  )

  // Phase 4 v3 — per-user opt-in for the daily summary email.
  const { data: prefs } = useQuery<{ wants_daily_summary: boolean }>({
    queryKey: ['me', 'preferences'],
    queryFn: () => api.get('/v1/admin/me/preferences').then(r => r.data),
    staleTime: 60_000,
  })
  const setDailySummary = useMutation({
    mutationFn: (enabled: boolean) => api.put('/v1/admin/me/preferences', { wants_daily_summary: enabled }),
    onSuccess: (_data, enabled) => {
      qc.invalidateQueries({ queryKey: ['me', 'preferences'] })
      toast.success(enabled
        ? t('engagement.toasts.daily_summary_on',  'Daily summary email turned on')
        : t('engagement.toasts.daily_summary_off', 'Daily summary email turned off'))
    },
    onError: () => toast.error(t('engagement.toasts.daily_summary_fail', 'Failed to update preference')),
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Sparkles size={20} className="text-accent" />
            {t('engagement.title', 'Engagement')}
          </h1>
          <p className="text-sm text-t-secondary mt-1">
            {t('engagement.subtitle', 'Visitors and conversations in one place — sorted so the rows that need attention surface first.')}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {/* Notification permission status chip — clickable when default */}
          {permission === 'granted' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/10 border border-green-500/40 rounded-lg text-xs text-green-400" title={t('engagement.alerts_on_tooltip', "Browser notifications enabled — you'll be pinged when a hot lead arrives")}>
              <BellRing size={13} />
              {t('engagement.alerts_on', 'Alerts on')}
            </div>
          )}
          {permission === 'denied' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 border border-red-500/40 rounded-lg text-xs text-red-400" title={t('engagement.alerts_blocked_tooltip', 'Notifications were blocked. Re-enable in your browser site settings.')}>
              <BellOff size={13} />
              {t('engagement.alerts_blocked', 'Alerts blocked')}
            </div>
          )}
          {/* Phase 4 v3 — daily summary email toggle */}
          <button
            onClick={() => setDailySummary.mutate(!prefs?.wants_daily_summary)}
            disabled={setDailySummary.isPending}
            title={prefs?.wants_daily_summary
              ? t('engagement.daily_email_on_tooltip',  'Daily summary email is on. Click to turn off.')
              : t('engagement.daily_email_off_tooltip', 'Get a morning email summary every day at 8am local time. Click to enable.')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              prefs?.wants_daily_summary
                ? 'bg-blue-500/10 border border-blue-500/40 text-blue-400'
                : 'bg-dark-surface border border-dark-border text-t-secondary hover:text-white'
            }`}
          >
            <Mail size={13} />
            {prefs?.wants_daily_summary ? t('engagement.daily_email_on', 'Daily email on') : t('engagement.daily_email', 'Daily email')}
          </button>
          <Link
            to="/engagement/live"
            className="flex items-center gap-2 px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm hover:bg-dark-surface2 transition-colors"
            title={t('engagement.live_wall_tooltip', 'Open the live wall — fullscreen monitor view')}
          >
            <Monitor size={14} />
            {t('engagement.live_wall', 'Live wall')}
          </Link>
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['engagement'] })
              refetch()
            }}
            className="flex items-center gap-2 px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm hover:bg-dark-surface2 transition-colors"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            {t('engagement.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      {/* One-time prompt to enable browser notifications. Auto-hides once
          the user picks (granted/denied) OR explicitly dismisses. Lives
          above the KPI strip so it's hard to miss without being modal. */}
      {permission === 'default' && !permBannerDismissed && (
        <div className="flex items-center gap-3 bg-dark-surface border border-amber-500/40 rounded-xl px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <Bell size={15} className="text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t('engagement.perm_banner.title', 'Get pinged the moment a hot lead arrives')}</p>
            <p className="text-xs text-t-secondary mt-0.5">
              {t('engagement.perm_banner.sub', "Enable browser notifications and we'll alert you even when this tab isn't focused — perfect for catching booking-page visitors.")}
            </p>
          </div>
          <button
            onClick={async () => {
              const r = await requestPermission()
              if (r === 'denied') sessionStorage.setItem('engagement-perm-dismissed', '1')
            }}
            className="bg-accent text-black font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-accent/90 transition-colors"
          >
            {t('engagement.perm_banner.enable', 'Enable')}
          </button>
          <button
            onClick={() => {
              sessionStorage.setItem('engagement-perm-dismissed', '1')
              setPermBannerDismissed(true)
            }}
            className="p-1 text-t-secondary hover:text-white"
            aria-label={t('engagement.perm_banner.dismiss', 'Dismiss')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI tiles moved to /analytics → Chat tab. Filter chips below
          carry the same filtering action without the duplicated stat
          numbers. */}

      {/* Filter chips + search */}
      <div className="flex flex-col gap-3 bg-dark-surface border border-dark-border rounded-xl p-3">
        {/* Range chips — Today / Week / Month / All. Reapplied to every
            filter + count query so the badges + feed stay in sync. */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wide font-bold text-t-secondary whitespace-nowrap pl-1 pr-1">
            {t('engagement.range.label', 'Range')}
          </span>
          {([
            { key: 'today', label: t('engagement.range.today', 'Today') },
            { key: 'week',  label: t('engagement.range.week',  '7 days') },
            { key: 'month', label: t('engagement.range.month', '30 days') },
            { key: 'all',   label: t('engagement.range.all',   'All time') },
          ] as const).map(r => {
            const active = range === r.key
            return (
              <button key={r.key}
                onClick={() => { setRange(r.key); setPage(1) }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  active ? 'bg-accent text-black' : 'bg-dark-bg text-t-secondary hover:text-white hover:bg-dark-surface2'
                }`}>
                {r.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ flexShrink: 0 }}>
          {FILTERS.map(f => {
            const active = filter === f.key
            const tone = f.tone === 'green' ? 'text-green-400' : f.tone === 'amber' ? 'text-amber-300' : ''
            const n = counts[f.key] ?? null
            return (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setPage(1) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-accent text-black'
                    : 'bg-dark-bg text-t-secondary hover:text-white hover:bg-dark-surface2'
                }`}
                style={{ height: 32 }}
              >
                <f.icon size={12} className={active ? '' : tone} />
                {t(filterLabelKey(f.key), f.label)}
                {n !== null && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                    active ? 'bg-black/20 text-black' : 'bg-dark-surface2 text-t-secondary'
                  }`}>{n}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Intent filter row — narrows the feed to a single AI-classified
            intent. Only AI-tagged conversations appear here, so a brand-new
            org may see empty results until the chats accumulate. */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ flexShrink: 0 }}>
          <span className="text-[9px] uppercase tracking-wide font-bold text-t-secondary whitespace-nowrap pl-1 pr-1">
            {t('engagement.filters.by_intent', 'By intent')}
          </span>
          {INTENT_FILTERS.map(f => {
            const active = filter === f.key
            const meta = INTENT_META[f.key]
            const Ic = meta?.icon ?? Sparkles
            const n = counts[f.key] ?? null
            return (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setPage(1) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? `${meta?.cls ?? ''} border-current`
                    : 'bg-dark-bg text-t-secondary hover:text-white hover:bg-dark-surface2'
                }`}
                style={{ height: 28 }}
              >
                <Ic size={11} />
                {t(filterLabelKey(f.key), f.label)}
                {n !== null && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold bg-dark-surface2/80">
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('engagement.filters.search_placeholder', 'Search by name, email, phone, IP, city, or page…')}
            className="w-full bg-dark-bg border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-t-secondary text-sm">{t('engagement.loading', 'Loading…')}</div>
      ) : rows.length === 0 ? (
        <EmptyState filter={filter} hasBrandFilter={brands.length > 1} />
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => <Row key={r.id} row={r} onOpen={openDrawer} />)}
        </div>
      )}

      {/* Detail drawer — visitorId !== null means open */}
      <EngagementDrawer
        visitorId={drawerVisitorId}
        conversationId={drawerConvId}
        onClose={closeDrawer}
      />

      {/* Pagination */}
      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-xs text-t-secondary px-1">
          <span>
            {t('engagement.pagination', { page: meta.current_page, total: meta.last_page, count: meta.total, defaultValue: 'Page {{page}} of {{total}} · {{count}} rows' })}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={meta.current_page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded hover:bg-dark-surface2 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              disabled={meta.current_page >= meta.last_page}
              onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded hover:bg-dark-surface2 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────── */

function Row({ row: r, onOpen }: { row: EngagementRow; onOpen: (visitorId: number, conversationId: number | null) => void }) {
  const { t } = useTranslation()
  const isWaiting = r.conversation
    && r.conversation.status === 'active'
    && !r.conversation.assigned_to
    && r.conversation.last_message_sender === 'visitor'
    && !r.conversation.ai_enabled

  const subline = useMemo(() => {
    if (r.conversation?.last_message_preview) {
      const sender = r.conversation.last_message_sender === 'visitor'
        ? r.effective_name.split(' ')[0]
        : r.conversation.last_message_sender === 'ai'
        ? t('engagement.row.ai_sender', 'AI')
        : t('engagement.row.agent_sender', 'Agent')
      return `${sender}: ${r.conversation.last_message_preview}`
    }
    if (r.is_online && r.current_page_title) return t('engagement.row.currently', { page: r.current_page_title, defaultValue: 'Currently: {{page}}' })
    if (r.is_online && r.current_page) return t('engagement.row.currently', { page: r.current_page, defaultValue: 'Currently: {{page}}' })
    return t('engagement.row.browsing_no_chat', 'Browsing — no chat yet')
  }, [r, t])

  const onClick = () => {
    // Phase 2: open the in-page drawer. The drawer auto-selects the
    // Conversation tab when a conversation id is provided; otherwise the
    // Profile tab. The full /chat-inbox screen stays accessible via the
    // drawer's "Open full inbox" link for any user who prefers it.
    onOpen(r.id, r.conversation?.id ?? null)
  }

  const flag = r.country ? countryFlag(r.country) : null
  // De-emphasise the "Anonymous" prefix — most rows are anonymous, so
  // promoting it to bold-white makes the row feel cluttered. Instead
  // render a small grey tag and lead with the actual identifier
  // (city / country / IP). When the visitor IS named, keep the name.
  const isAnonymous = /^Anonymous(\s|$)/i.test(r.effective_name)
  // Lead line for anonymous rows: City · Country, falling back to
  // the visitor IP when geolocation hasn't resolved yet.
  const anonHeadline = r.city || r.country || r.visitor_ip || 'Unknown'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-dark-surface border rounded-xl p-3.5 hover:bg-dark-surface2 transition-colors ${
        isWaiting ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-dark-border'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar / online indicator. For named visitors the initial
            sits inside the gold accent ring; anonymous rows get a
            country flag (when available) so a glance gives geography. */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-sm font-bold text-accent">
            {isAnonymous && flag
              ? <span className="text-lg leading-none">{flag}</span>
              : r.effective_name.charAt(0).toUpperCase()}
          </div>
          {r.is_online && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-dark-surface animate-pulse" />
          )}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isAnonymous ? (
              <>
                <span className="font-semibold text-sm text-white truncate">{anonHeadline}</span>
                <span className="text-[10px] uppercase tracking-wide text-t-secondary/70 font-medium">{t('engagement.row.anon', 'Anonymous')}</span>
              </>
            ) : (
              <>
                <span className="font-semibold text-sm truncate">{r.effective_name}</span>
                {flag && <span className="text-[11px]" title={r.country ?? undefined}>{flag}</span>}
                {r.country && <span className="text-[10px] text-t-secondary">{r.city ? `${r.city}, ${r.country}` : r.country}</span>}
              </>
            )}
            {r.has_email && <Mail size={11} className="text-blue-400" />}
            {r.has_phone && <Phone size={11} className="text-emerald-400" />}
            {r.is_hot_lead && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/40 animate-pulse">
                <Sparkles size={9} /> {t('engagement.row.hot', 'HOT')}
              </span>
            )}
            {r.is_lead && !r.is_hot_lead && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-300/15 text-amber-300 border border-amber-300/30">
                <Star size={9} /> {t('engagement.row.lead', 'LEAD')}
              </span>
            )}
            {r.conversation?.intent_tag && INTENT_META[r.conversation.intent_tag] && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${INTENT_META[r.conversation.intent_tag].cls}`}>
                {(() => {
                  const Ic = INTENT_META[r.conversation.intent_tag].icon
                  return <Ic size={9} />
                })()}
                {INTENT_META[r.conversation.intent_tag].label}
              </span>
            )}
            {r.conversation?.unread_admin_count ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/40">
                {t('engagement.row.unread_count', { count: r.conversation.unread_admin_count, defaultValue: '{{count}} new' })}
              </span>
            ) : null}
            {isWaiting && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-300/15 text-amber-300 border border-amber-300/30">
                {t('engagement.row.waiting', 'WAITING')}
              </span>
            )}
            <BrandBadge brandId={r.brand_id} />
          </div>
          <div className="text-xs text-t-secondary truncate mt-1">{subline}</div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-t-secondary">
            {r.is_online && r.current_page && (
              <span className="flex items-center gap-1 truncate max-w-[280px]">
                <MapPin size={10} className="flex-shrink-0" />
                <span className="truncate font-mono">{r.current_page}</span>
              </span>
            )}
            {!r.is_online && r.last_seen_at && (
              <span>{relativeTime(r.last_seen_at)}</span>
            )}
            {r.visit_count > 1 && (
              <span className="flex items-center gap-1">
                <Eye size={10} /> {t('engagement.row.visits', { count: r.visit_count, defaultValue: '{{count}} visits' })}
              </span>
            )}
            {r.messages_count > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare size={10} /> {r.messages_count}
              </span>
            )}
          </div>
        </div>

        {/* Right rail — conversation status */}
        {r.conversation && (
          <div className="flex flex-col items-end gap-1 flex-shrink-0 hidden sm:flex">
            <span className={`text-[10px] uppercase tracking-wide font-bold ${
              r.conversation.status === 'active'   ? 'text-green-400'
            : r.conversation.status === 'waiting'  ? 'text-amber-300'
            : r.conversation.status === 'resolved' ? 'text-t-secondary' : 'text-t-secondary'
            }`}>
              {r.conversation.status}
            </span>
            {r.conversation.ai_enabled && (
              <span className="text-[9px] text-purple-400 flex items-center gap-1">
                <Bot size={9} /> {t('engagement.row.ai_on', 'AI on')}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

function EmptyState({ filter, hasBrandFilter }: { filter: FilterKey; hasBrandFilter: boolean }) {
  const { t } = useTranslation()
  // English fallbacks kept inline so the page still reads if the locale
  // file is missing a key. Keep in sync with engagement.empty.* in the
  // locale JSON.
  const fallbacks: Record<FilterKey, { title: string; sub: string }> = {
    priority:        { title: 'Nothing needs attention',     sub: 'No online visitors, leads, or active chats right now.' },
    online:          { title: 'No one is online',             sub: 'Visitors will appear here in real time when they hit the chat widget.' },
    has_contact:     { title: 'No leads captured yet',        sub: 'Anyone who leaves an email or phone number lands here.' },
    active_chat:     { title: 'No active chats',              sub: 'Open conversations will appear here.' },
    hot_lead:        { title: 'No hot leads right now',       sub: 'Visitors with a captured contact + a strong buying signal (booking page visit, 3+ messages, online now) surface here.' },
    anonymous:       { title: 'No anonymous browsers',        sub: 'Visitors without contact info, hidden from the priority view, surface here.' },
    resolved:        { title: 'No resolved conversations',    sub: 'Closed chats land here for reference.' },
    booking_inquiry: { title: 'No booking inquiries',         sub: 'Conversations the AI tagged as booking-related land here. Tags appear after 3+ messages.' },
    info_request:    { title: 'No info requests',             sub: 'Visitors asking general questions surface here once their chat has been AI-tagged.' },
    complaint:       { title: 'No complaints',                sub: 'Issues raised by visitors land here once tagged.' },
    cancellation:    { title: 'No cancellation requests',     sub: 'Visitors asking to cancel a booking surface here once tagged.' },
    support:         { title: 'No support requests',          sub: 'General support conversations land here once tagged.' },
  }
  const fb = fallbacks[filter]
  const title = t(`engagement.empty.${filter}.title`, fb.title)
  const sub = t(`engagement.empty.${filter}.sub`, fb.sub)
  return (
    <div className="text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center mx-auto mb-4">
        <Sparkles size={22} className="text-accent" />
      </div>
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      <p className="text-sm text-t-secondary max-w-md mx-auto">{sub}</p>
      {hasBrandFilter && (
        <p className="text-xs text-t-secondary mt-3 italic">
          {t('engagement.empty.brand_tip', 'Tip: pick a different brand from the top-bar switcher to see its engagement.')}
        </p>
      )}
    </div>
  )
}

/* ── Helpers ───────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function countryFlag(code: string): string {
  // Flag emoji from ISO-3166-1 alpha-2 (regional-indicator pairs).
  const c = code.trim().toUpperCase()
  if (c.length !== 2) return ''
  const [a, b] = [c.charCodeAt(0), c.charCodeAt(1)]
  return String.fromCodePoint(0x1f1e6 + (a - 65), 0x1f1e6 + (b - 65))
}
