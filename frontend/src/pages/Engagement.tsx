import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye, MessageSquare, Mail, Phone, Sparkles, Star,
  Search, ChevronLeft, ChevronRight, RefreshCw, Inbox as InboxIcon,
  AlertCircle, Bot, Wifi, MapPin, BellRing, BellOff, Bell, X,
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

interface KpiCard {
  value: number
  detail: string
}

interface KpiResp {
  online_now: KpiCard
  hot_leads: KpiCard
  unanswered: KpiCard
  ai_handled: KpiCard
}

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

export function Engagement() {
  const qc = useQueryClient()
  const { brands } = useBrandStore()

  const [filter, setFilter] = useState<FilterKey>('priority')
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

  // KPI cards — Phase 4 tightens to 15s. React-query auto-pauses polling
  // when the browser tab is hidden so we don't spend API quota on a tab
  // nobody is looking at.
  const { data: kpis } = useQuery<{ data: KpiResp }>({
    queryKey: ['engagement', 'kpis'],
    queryFn: () => api.get('/v1/admin/engagement/kpis').then(r => r.data),
    refetchInterval: 15_000,
  })

  // Feed — Phase 4 tightens to 5s when the tab is visible. Combined with
  // useHotLeadAlert below this gives a near-realtime "hot lead arrived"
  // signal without per-row backend events.
  const { data: feed, isLoading, refetch, isFetching } = useQuery<{
    data: EngagementRow[]
    meta: { current_page: number; last_page: number; total: number; per_page: number }
  }>({
    queryKey: ['engagement', 'feed', filter, search, page],
    queryFn: () => api.get('/v1/admin/engagement/feed', {
      params: { filter, search, page, per_page: 50, sort: 'priority' },
    }).then(r => r.data),
    refetchInterval: 5_000,
    placeholderData: (prev) => prev,
  })

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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Sparkles size={20} className="text-accent" />
            Engagement
          </h1>
          <p className="text-sm text-t-secondary mt-1">
            Visitors and conversations in one place — sorted so the rows that need attention surface first.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {/* Notification permission status chip — clickable when default */}
          {permission === 'granted' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/10 border border-green-500/40 rounded-lg text-xs text-green-400" title="Browser notifications enabled — you'll be pinged when a hot lead arrives">
              <BellRing size={13} />
              Alerts on
            </div>
          )}
          {permission === 'denied' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 border border-red-500/40 rounded-lg text-xs text-red-400" title="Notifications were blocked. Re-enable in your browser site settings.">
              <BellOff size={13} />
              Alerts blocked
            </div>
          )}
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['engagement'] })
              refetch()
            }}
            className="flex items-center gap-2 px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm hover:bg-dark-surface2 transition-colors"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
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
            <p className="text-sm font-semibold">Get pinged the moment a hot lead arrives</p>
            <p className="text-xs text-t-secondary mt-0.5">
              Enable browser notifications and we'll alert you even when this tab isn't focused — perfect for catching booking-page visitors.
            </p>
          </div>
          <button
            onClick={async () => {
              const r = await requestPermission()
              if (r === 'denied') sessionStorage.setItem('engagement-perm-dismissed', '1')
            }}
            className="bg-accent text-black font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-accent/90 transition-colors"
          >
            Enable
          </button>
          <button
            onClick={() => {
              sessionStorage.setItem('engagement-perm-dismissed', '1')
              setPermBannerDismissed(true)
            }}
            className="p-1 text-t-secondary hover:text-white"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          icon={Wifi}
          label="Online now"
          value={kpis?.data.online_now.value ?? 0}
          detail={kpis?.data.online_now.detail}
          color="#22c55e"
          onClick={() => { setFilter('online'); setPage(1) }}
          active={filter === 'online'}
        />
        <KpiTile
          icon={Star}
          label="Leads"
          value={kpis?.data.hot_leads.value ?? 0}
          detail={kpis?.data.hot_leads.detail}
          color="#f59e0b"
          onClick={() => { setFilter('has_contact'); setPage(1) }}
          active={filter === 'has_contact'}
        />
        <KpiTile
          icon={AlertCircle}
          label="Unanswered"
          value={kpis?.data.unanswered.value ?? 0}
          detail={kpis?.data.unanswered.detail}
          color="#ef4444"
          onClick={() => { setFilter('active_chat'); setPage(1) }}
          active={filter === 'active_chat'}
        />
        <KpiTile
          icon={Bot}
          label="AI handled today"
          value={kpis?.data.ai_handled.value ?? 0}
          detail={kpis?.data.ai_handled.detail}
          color="#8b5cf6"
        />
      </div>

      {/* Filter chips + search */}
      <div className="flex flex-col gap-3 bg-dark-surface border border-dark-border rounded-xl p-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ flexShrink: 0 }}>
          {FILTERS.map(f => {
            const active = filter === f.key
            const tone = f.tone === 'green' ? 'text-green-400' : f.tone === 'amber' ? 'text-amber-300' : ''
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
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Intent filter row — narrows the feed to a single AI-classified
            intent. Only AI-tagged conversations appear here, so a brand-new
            org may see empty results until the chats accumulate. */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ flexShrink: 0 }}>
          <span className="text-[9px] uppercase tracking-wide font-bold text-t-secondary whitespace-nowrap pl-1 pr-1">
            By intent
          </span>
          {INTENT_FILTERS.map(f => {
            const active = filter === f.key
            const meta = INTENT_META[f.key]
            const Ic = meta?.icon ?? Sparkles
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
                {f.label}
              </button>
            )
          })}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name, email, phone, IP, city, or page…"
            className="w-full bg-dark-bg border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-t-secondary text-sm">Loading…</div>
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
            Page {meta.current_page} of {meta.last_page} · {meta.total.toLocaleString()} {meta.total === 1 ? 'row' : 'rows'}
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

function KpiTile({
  icon: Icon, label, value, detail, color, onClick, active,
}: {
  icon: any; label: string; value: number; detail?: string; color: string;
  onClick?: () => void; active?: boolean;
}) {
  const Wrapper: any = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`text-left bg-dark-surface border rounded-xl p-4 transition-colors ${
        onClick ? 'cursor-pointer hover:bg-dark-surface2' : ''
      } ${active ? 'border-accent' : 'border-dark-border'}`}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: color + '22', border: `1px solid ${color}55` }}
        >
          <Icon size={15} style={{ color }} />
        </div>
        <span className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">
          {label}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value.toLocaleString()}</div>
      {detail && <div className="text-[11px] text-t-secondary mt-0.5 truncate">{detail}</div>}
    </Wrapper>
  )
}

function Row({ row: r, onOpen }: { row: EngagementRow; onOpen: (visitorId: number, conversationId: number | null) => void }) {
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
        ? 'AI'
        : 'Agent'
      return `${sender}: ${r.conversation.last_message_preview}`
    }
    if (r.is_online && r.current_page_title) return `Currently: ${r.current_page_title}`
    if (r.is_online && r.current_page) return `Currently: ${r.current_page}`
    return 'Browsing — no chat yet'
  }, [r])

  const onClick = () => {
    // Phase 2: open the in-page drawer. The drawer auto-selects the
    // Conversation tab when a conversation id is provided; otherwise the
    // Profile tab. The full /chat-inbox screen stays accessible via the
    // drawer's "Open full inbox" link for any user who prefers it.
    onOpen(r.id, r.conversation?.id ?? null)
  }

  const flag = r.country ? countryFlag(r.country) : null

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-dark-surface border rounded-xl p-3.5 hover:bg-dark-surface2 transition-colors ${
        isWaiting ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-dark-border'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar / online indicator */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-sm font-bold text-accent">
            {r.effective_name.charAt(0).toUpperCase()}
          </div>
          {r.is_online && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-dark-surface animate-pulse" />
          )}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{r.effective_name}</span>
            {flag && <span className="text-[11px]">{flag}</span>}
            {r.has_email && <Mail size={11} className="text-blue-400" />}
            {r.has_phone && <Phone size={11} className="text-emerald-400" />}
            {r.is_hot_lead && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/40 animate-pulse">
                <Sparkles size={9} /> HOT
              </span>
            )}
            {r.is_lead && !r.is_hot_lead && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-300/15 text-amber-300 border border-amber-300/30">
                <Star size={9} /> LEAD
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
                {r.conversation.unread_admin_count} new
              </span>
            ) : null}
            {isWaiting && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-300/15 text-amber-300 border border-amber-300/30">
                WAITING
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
                <Eye size={10} /> {r.visit_count} visits
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
                <Bot size={9} /> AI on
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

function EmptyState({ filter, hasBrandFilter }: { filter: FilterKey; hasBrandFilter: boolean }) {
  const messages: Record<FilterKey, { title: string; sub: string }> = {
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
  const m = messages[filter]
  return (
    <div className="text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center mx-auto mb-4">
        <Sparkles size={22} className="text-accent" />
      </div>
      <h2 className="text-base font-semibold mb-2">{m.title}</h2>
      <p className="text-sm text-t-secondary max-w-md mx-auto">{m.sub}</p>
      {hasBrandFilter && (
        <p className="text-xs text-t-secondary mt-3 italic">
          Tip: pick a different brand from the top-bar switcher to see its engagement.
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
