import type { ReactNode } from 'react'
import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { APP_BASE } from '../lib/api'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Users, Gift, BarChart2, Sparkles,
  Bell, Settings, LogOut, Hotel, Scan, Bot, Inbox, Mail,
  Crown, Building2, FileText,
  Briefcase, ClipboardList, Radio, ScrollText,
  ListChecks, TrendingUp, FilePlus2,
  ChevronLeft, ChevronRight, ChevronDown,
  BedDouble, CreditCard, Home, Package, Star,
  UserCog, AlertTriangle, Scissors,
  Menu, X, MoreHorizontal,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useBrandStore, type BrandSummary } from '../stores/brandStore'
import { api, resolveImage } from '../lib/api'
import { useRealtimeEvents } from '../hooks/useRealtimeEvents'
import { useTaskReminders } from '../hooks/useTaskReminders'
import { useSubscription } from '../hooks/useSubscription'
import { useSettings } from '../lib/crmSettings'
import { BrandSwitcher } from './BrandSwitcher'
import { MemberQuickSearch } from './MemberQuickSearch'
import { LangSwitcher } from './LangSwitcher'
import { useTranslation } from 'react-i18next'

// gate: 'all' = everyone, 'admin' = super_admin/manager only, or a staff permission key
export type NavGate = 'all' | 'admin' | 'can_manage_offers' | 'can_view_analytics'

interface NavItem {
  path: string
  /**
   * i18n key (e.g. `nav.items.dashboard`). Resolved with `t()` at
   * render time — see `getDisplayLabel()` further down. Keeping the
   * key in the structural list (rather than threading translated
   * strings through here) means the list stays language-agnostic and
   * fine to use from useMemo / route maps.
   */
  labelKey: string
  /** English fallback for places that don't have i18n in context. */
  defaultLabel: string
  icon: any
  gate: NavGate
  product?: string   // required SaaS product slug
  feature?: string   // required SaaS feature key
  altPaths?: string[] // sibling routes that should keep this item highlighted (used for PairTabs siblings)
}

interface NavGroup {
  labelKey: string
  defaultLabel: string
  /** Per-group accent — drives the colored dot in the header + the
   *  tinted active-item background. Keeps groups visually distinct
   *  without making the sidebar look cartoony. */
  accent: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    labelKey: 'nav.groups.overview', defaultLabel: 'Overview',
    accent: '#60a5fa', // blue
    items: [
      { path: '/',          labelKey: 'nav.items.dashboard',    defaultLabel: 'Dashboard',   icon: LayoutDashboard, gate: 'all' },
      // Analytics is plain charts/KPIs (no LLM) so it gates only on the
      // staff `can_view_analytics` flag, not on the `ai_insights` plan
      // feature. Previously admins on a plan without the AI feature were
      // hidden from Analytics even though that page does no AI work.
      { path: '/analytics', labelKey: 'nav.items.analytics',    defaultLabel: 'Analytics',   icon: BarChart2,       gate: 'can_view_analytics' },
      // AI Insights does call the LLM (CrmAiService) — the ai_insights
      // feature flag stays here, so plans without AI don't see it.
      { path: '/ai',        labelKey: 'nav.items.ai_insights',  defaultLabel: 'AI Insights', icon: Sparkles,        gate: 'can_view_analytics', feature: 'ai_insights' },
    ],
  },
  {
    labelKey: 'nav.groups.ai_chat', defaultLabel: 'AI Chat',
    accent: '#a78bfa', // violet
    items: [
      { path: '/engagement',     labelKey: 'nav.items.engagement',     defaultLabel: 'Engagement',    icon: Inbox, gate: 'all',   product: 'chat',
        altPaths: ['/inbox', '/visitors', '/chat-inbox', '/legacy/visitors'] },
      { path: '/chatbot-setup',  labelKey: 'nav.items.chatbot_setup',  defaultLabel: 'Chatbot Setup', icon: Bot,   gate: 'admin', product: 'chat' },
    ],
  },
  {
    labelKey: 'nav.groups.members_loyalty', defaultLabel: 'Members & Loyalty',
    accent: '#fbbf24', // gold
    items: [
      // 4-hub consolidation. Each hub is a tabbed container — see
      // pages/hubs/* for the per-tab routing. Legacy paths like
      // /tiers, /offers, /referrals etc. still work; they redirect
      // into the right hub tab.
      { path: '/members',   labelKey: 'nav.items.members',   defaultLabel: 'Members',  icon: Users,    gate: 'all',   altPaths: ['/members/duplicates', '/segments'] },
      { path: '/program',   labelKey: 'nav.items.program',   defaultLabel: 'Program',  icon: Crown,    gate: 'admin', product: 'loyalty', altPaths: ['/tiers', '/benefits', '/earn-rate-events'] },
      { path: '/rewards',   labelKey: 'nav.items.rewards',   defaultLabel: 'Rewards',  icon: Gift,     gate: 'admin', product: 'loyalty', altPaths: ['/offers', '/referrals'] },
      { path: '/campaigns', labelKey: 'nav.items.campaigns', defaultLabel: 'Campaigns', icon: Mail,   gate: 'admin', product: 'loyalty', altPaths: ['/email-campaigns'] },
    ],
  },
  {
    labelKey: 'nav.groups.bookings', defaultLabel: 'Bookings',
    accent: '#34d399', // emerald
    items: [
      // Reservations & Services each surface own resource. The List ↔ Calendar
      // toggle lives inside the page; the dropped /calendar legacy entry was
      // a duplicate of the in-page Timeline view.
      { path: '/bookings',          labelKey: 'nav.items.reservations',    defaultLabel: 'Reservations',     icon: BedDouble,     gate: 'all',   product: 'booking', altPaths: ['/bookings/calendar'] },
      { path: '/service-bookings',  labelKey: 'nav.items.services',        defaultLabel: 'Services',         icon: Scissors,      gate: 'all',   product: 'booking', altPaths: ['/service-bookings/calendar'] },
      { path: '/booking-rooms',     labelKey: 'nav.items.rooms_services',  defaultLabel: 'Rooms & Services', icon: Home,          gate: 'admin', product: 'booking', altPaths: ['/services'] },
      { path: '/service-masters',   labelKey: 'nav.items.masters',         defaultLabel: 'Masters',          icon: UserCog,       gate: 'admin', product: 'booking' },
      { path: '/booking-extras',    labelKey: 'nav.items.extras',          defaultLabel: 'Extras',           icon: Package,       gate: 'admin', product: 'booking', altPaths: ['/service-extras'] },
      { path: '/bookings/payments', labelKey: 'nav.items.payments',        defaultLabel: 'Payments',         icon: CreditCard,    gate: 'all',   product: 'booking' },
    ],
  },
  {
    labelKey: 'nav.groups.crm_marketing', defaultLabel: 'CRM & Marketing',
    accent: '#f472b6', // pink
    items: [
      { path: '/inquiries',     labelKey: 'nav.items.leads_inquiries', defaultLabel: 'Leads & Inquiries', icon: FileText,  gate: 'all' },
      { path: '/tasks',         labelKey: 'nav.items.tasks',           defaultLabel: 'Tasks',             icon: ListChecks, gate: 'all' },
      { path: '/reports',       labelKey: 'nav.items.reports',         defaultLabel: 'Reports',           icon: TrendingUp, gate: 'admin' },
      { path: '/lead-forms',    labelKey: 'nav.items.lead_forms',      defaultLabel: 'Lead forms',        icon: FilePlus2,  gate: 'admin' },
      { path: '/corporate',     labelKey: 'nav.items.companies',       defaultLabel: 'Companies',         icon: Briefcase, gate: 'admin' },
      { path: '/notifications', labelKey: 'nav.items.campaigns',       defaultLabel: 'Campaigns',         icon: Bell,      gate: 'admin', feature: 'push_notifications', altPaths: ['/email-templates'] },
      { path: '/reviews',       labelKey: 'nav.items.reviews',         defaultLabel: 'Reviews',           icon: Star,      gate: 'admin' },
    ],
  },
  {
    labelKey: 'nav.groups.operations', defaultLabel: 'Operations',
    accent: '#22d3ee', // cyan
    items: [
      { path: '/planner',    labelKey: 'nav.items.planner',    defaultLabel: 'Planner',    icon: ClipboardList, gate: 'all' },
      { path: '/brands',     labelKey: 'nav.items.brands',     defaultLabel: 'Brands',     icon: Briefcase,     gate: 'admin' },
      { path: '/properties', labelKey: 'nav.items.properties', defaultLabel: 'Properties', icon: Building2,     gate: 'admin', altPaths: ['/venues'] },
      { path: '/scan',       labelKey: 'nav.items.scan',       defaultLabel: 'Scan',       icon: Scan,          gate: 'all' },
    ],
  },
  {
    labelKey: 'nav.groups.system', defaultLabel: 'System',
    accent: '#9ca3af', // slate
    items: [
      { path: '/billing',   labelKey: 'nav.items.billing',    defaultLabel: 'Billing',   icon: CreditCard, gate: 'admin' },
      { path: '/audit-log', labelKey: 'nav.items.audit_log',  defaultLabel: 'Audit Log', icon: ScrollText, gate: 'admin' },
      { path: '/settings',  labelKey: 'nav.items.settings',   defaultLabel: 'Settings',  icon: Settings,   gate: 'admin' },
    ],
  },
]

// Flatten for route-gate mapping
const allNavItems = navGroups.flatMap(g => g.items)

export const routeGates: Record<string, NavGate> = Object.fromEntries(
  allNavItems.filter(i => i.gate !== 'all').map(i => [i.path, i.gate])
)

export function canAccess(gate: NavGate, staff: { role: string; can_manage_offers: boolean; can_view_analytics: boolean } | null): boolean {
  if (!staff) return gate === 'all'
  const isAdmin = staff.role === 'super_admin' || staff.role === 'manager'
  if (isAdmin) return true
  if (gate === 'all') return true
  if (gate === 'admin') return false
  return !!staff[gate]
}

const SIDEBAR_KEY = 'loyalty-sidebar-collapsed'

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  )
  const location = useLocation()
  const { user, staff, logout } = useAuthStore()
  const { hasFeature, hasProduct, status: subStatus } = useSubscription()
  const settings = useSettings()
  /**
   * Admin-configured per-org sidebar visibility (Settings → Menu).
   * Hides whole nav groups for non-power-users. Overview + System
   * are never in this list — they're locked visible in the UI so
   * the user can always reach the Dashboard and Settings itself.
   */
  const hiddenNavGroups: string[] = Array.isArray(settings.hidden_nav_groups) ? settings.hidden_nav_groups : []
  // Hard-block: when subscription is EXPIRED / NO_PLAN, the wall used to
  // render as an overlay only — the page content underneath kept rendering
  // and firing API calls (queries, polls, websocket reconnects). On a long
  // session that meant the user could navigate around with broken
  // dashboards instead of seeing a clear "trial ended" screen, AND we
  // billed OpenAI / hit the DB for someone who shouldn't have access.
  // The /billing page is exempt so a user can still complete checkout to
  // restore access.
  const blockForSub = (subStatus === 'EXPIRED' || subStatus === 'NO_PLAN')
    && location.pathname !== '/billing'
    && staff?.role !== 'super_admin'
  const roleName = staff?.role === 'super_admin' ? 'Admin' : staff?.role === 'manager' ? 'Manager' : staff?.role ? staff.role.charAt(0).toUpperCase() + staff.role.slice(1) : ''
  const { connected, events } = useRealtimeEvents()
  // CRM Phase 6: poll the tasks list every minute and fire a browser
  // notification when a task is 5 min from due / due now. Disabled
  // during the subscription wall so we don't hit the API for blocked
  // users. Permission state is owned by the user — see Engagement
  // Hub's "Enable notifications" prompt for the request UX.
  useTaskReminders(!blockForSub && !!user)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [seenCount, setSeenCount] = useState(0)
  const notifRef = useRef<HTMLDivElement>(null)
  const unseenCount = Math.max(0, events.length - seenCount)

  // Force sidebar labels visible on mobile — drawer is always expanded.
  const displayCollapsed = isMobile ? false : collapsed

  // Hydrate the brand store on app load. Single-brand orgs still benefit:
  // the BrandSwitcher hides itself when brands.length <= 1, but having the
  // brand list lets pages like Settings → Brands render without a flash.
  const setBrands = useBrandStore(s => s.setBrands)
  useQuery({
    queryKey: ['brands'],
    queryFn: () => api.get<{ data: BrandSummary[] }>('/v1/admin/brands').then(r => r.data),
    enabled: !!staff,
    staleTime: 60_000,
    select: (d) => {
      setBrands(d.data ?? [])
      return d
    },
  })

  // Track viewport — below 1024px the sidebar becomes an off-canvas drawer
  // and a bottom nav is shown. Desktop behavior is untouched.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Lock body scroll when drawer is open on mobile.
  useEffect(() => {
    if (isMobile && mobileOpen) {
      document.body.classList.add('mobile-drawer-open')
      return () => document.body.classList.remove('mobile-drawer-open')
    }
  }, [isMobile, mobileOpen])

  // Auto-expand group containing current page
  useEffect(() => {
    for (const group of navGroups) {
      const match = group.items.some(i => {
        if (i.path === location.pathname) return true
        if (i.path !== '/' && location.pathname.startsWith(i.path)) return true
        return (i.altPaths ?? []).some(p => location.pathname === p || location.pathname.startsWith(p))
      })
      if (match) {
        setExpandedGroups(prev => ({ ...prev, [group.defaultLabel]: true }))
        break
      }
    }
  }, [location.pathname])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifPanel(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
  }

  const toggleGroup = (label: string) => {
    if (displayCollapsed) return
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const { data: settingsData } = useQuery({
    queryKey: ['settings-logo'],
    queryFn: () => api.get('/v1/admin/settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  // Sidebar unread badge for chat inbox: total unread visitor messages across
  // all open conversations. Polled every 15s.
  const { data: chatStats } = useQuery({
    queryKey: ['chat-inbox-stats-sidebar'],
    queryFn: () => api.get('/v1/admin/chat-inbox/stats').then(r => r.data),
    refetchInterval: 15000,
    staleTime: 10000,
  })
  const chatUnread: number = chatStats?.unread_messages || 0

  // Favicon dot — flip the favicon to a "has unread" version when count > 0.
  // Uses canvas to draw a red dot on the existing favicon so we don't need
  // a second image file shipped in /public.
  useEffect(() => {
    const link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']")
    if (!link) return
    if (!(link as any)._origHref) (link as any)._origHref = link.href
    const orig = (link as any)._origHref as string
    if (chatUnread <= 0) {
      link.href = orig
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 32; canvas.height = 32
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, 32, 32)
      ctx.beginPath()
      ctx.arc(24, 8, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#ef4444'
      ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
      try { link.href = canvas.toDataURL('image/png') } catch {}
    }
    img.onerror = () => {}
    img.src = orig
  }, [chatUnread])

  // Listen for 403 subscription:expired events from API interceptor — refresh subscription status
  const qc = useQueryClient()
  useEffect(() => {
    const handler = () => qc.invalidateQueries({ queryKey: ['subscription-status'] })
    window.addEventListener('subscription:expired', handler)
    return () => window.removeEventListener('subscription:expired', handler)
  }, [qc])

  const logoUrl = (() => {
    const groups = settingsData?.settings
    if (!groups || typeof groups !== 'object') return null
    for (const group of Object.values(groups) as any[][]) {
      if (!Array.isArray(group)) continue
      const found = group.find((s: any) => s.key === 'company_logo')
      if (found?.value) return resolveImage(found.value as string)
    }
    return null
  })()

  const handleLogout = async () => {
    try { await api.delete('/v1/auth/logout') } catch {}
    logout()
    window.location.href = `${APP_BASE}/login`
  }

  // Filter groups in 3 layers, in order:
  //   1. Per-user whitelist (Settings → Team) — for non-admin staff
  //      with an `allowed_nav_groups` list set, ONLY those groups
  //      are visible. Admin roles (super_admin, manager) skip this
  //      filter so they always see everything. Overview + System
  //      are exempt regardless (Dashboard + Settings must always
  //      be reachable).
  //   2. Org-wide hidden list (Settings → Menu) — applied next.
  //   3. Per-item role + product + feature gates.
  const ALWAYS_VISIBLE = new Set(['Overview', 'System'])
  const isAdmin = staff?.role === 'super_admin' || staff?.role === 'manager'
  const userAllowed = Array.isArray(staff?.allowed_nav_groups) ? staff!.allowed_nav_groups! : null
  const hasPerUserWhitelist = !isAdmin && userAllowed && userAllowed.length > 0

  const visibleGroups = navGroups
    .filter(group => {
      // Identity stays in English (`defaultLabel`) so the saved
      // whitelist + hidden-list keys are language-stable. Only the
      // displayed text comes from i18n.
      if (ALWAYS_VISIBLE.has(group.defaultLabel)) return true
      if (hasPerUserWhitelist && !userAllowed!.includes(group.defaultLabel)) return false
      if (hiddenNavGroups.includes(group.defaultLabel)) return false
      return true
    })
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (!canAccess(item.gate, staff)) return false
        if (item.product && !hasProduct(item.product)) return false
        if (item.feature && !hasFeature(item.feature)) return false
        return true
      }),
    }))
    .filter(group => group.items.length > 0)

  return (
    <div className="flex h-screen bg-dark-bg">
      {/* Cmd+K global member search — listens for the chord and
          renders its own modal portal at z-100. Always-mounted so a
          fresh page can open it before the rest of the SPA hydrates. */}
      <MemberQuickSearch />

      {/* Mobile drawer backdrop */}
      <div
        onClick={() => setMobileOpen(false)}
        className={clsx(
          'fixed inset-0 bg-black/60 z-40 lg:hidden transition-opacity duration-300',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={clsx(
        'mobile-drawer flex flex-col bg-dark-surface text-white flex-shrink-0 border-r border-dark-border',
        // Mobile: fixed off-canvas drawer, wide w-72
        'fixed inset-y-0 left-0 z-50 w-72 transform',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: in-flow column, translate cleared, width based on collapsed pref
        'lg:relative lg:z-auto lg:translate-x-0 lg:transition-all lg:duration-300',
        collapsed ? 'lg:w-[60px]' : 'lg:w-60'
      )}>
        {/* Logo */}
        <div className={clsx('flex items-center border-b border-dark-border h-14', displayCollapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className={clsx('rounded-lg object-contain flex-shrink-0', displayCollapsed ? 'h-7 w-7 object-cover' : 'h-8 max-w-[140px]')} />
          ) : (
            <>
              <div className="w-7 h-7 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Hotel size={15} />
              </div>
              {!displayCollapsed && <span className="font-bold text-sm truncate">Hotel Loyalty</span>}
            </>
          )}
          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-1.5 text-t-secondary hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
          {visibleGroups.map(({ labelKey, defaultLabel, items, accent }) => {
            const groupLabel = t(labelKey, defaultLabel)
            const isOpen = displayCollapsed || expandedGroups[defaultLabel] !== false // default open
            // hex8 helper — convert "#rrggbb" to rgba with the supplied alpha.
            // Used for the active-state tint so each group's highlight
            // colour reads as a translucent wash of the accent.
            const tint = (a: number) => {
              const hex = accent.replace('#', '')
              const r = parseInt(hex.slice(0, 2), 16)
              const g = parseInt(hex.slice(2, 4), 16)
              const b = parseInt(hex.slice(4, 6), 16)
              return `rgba(${r},${g},${b},${a})`
            }
            return (
              <div key={defaultLabel} className="mb-3 last:mb-1">
                {/* Group header — colored dot + bolder label so the
                    seven sections read as distinct sections at a glance.
                    Collapsed sidebar shows only a thin accent line. */}
                {!displayCollapsed ? (
                  <button
                    onClick={() => toggleGroup(defaultLabel)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-white/[0.02] rounded-lg transition-colors group"
                    style={{ color: tint(0.9) }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent, boxShadow: `0 0 8px ${tint(0.5)}` }} />
                    <span className="flex-1 text-left">{groupLabel}</span>
                    <ChevronDown size={11} className={clsx('transition-transform opacity-50 group-hover:opacity-100', isOpen ? '' : '-rotate-90')} />
                  </button>
                ) : (
                  <div className="h-0.5 mx-3 my-2 rounded-full" style={{ background: tint(0.4) }} />
                )}

                {/* Group items */}
                {isOpen && items.map(({ path, labelKey: itemLabelKey, defaultLabel: itemDefault, icon: Icon, altPaths }) => {
                  const itemLabel = t(itemLabelKey, itemDefault)
                  const active = path === '/'
                    ? location.pathname === '/'
                    : (location.pathname.startsWith(path) || (altPaths ?? []).some(p => location.pathname === p || location.pathname.startsWith(p)))
                  const badge = path === '/engagement' && chatUnread > 0 ? chatUnread : 0
                  return (
                    <Link
                      key={path}
                      to={path}
                      title={displayCollapsed ? itemLabel : undefined}
                      className={clsx(
                        'flex items-center gap-2.5 py-2 mx-1.5 rounded-lg transition-colors text-[13px] font-medium relative',
                        displayCollapsed ? 'justify-center px-0' : 'px-3',
                        !active && 'text-t-secondary hover:text-white hover:bg-dark-surface2',
                      )}
                      style={active ? {
                        background: tint(0.16),
                        color: accent,
                        boxShadow: `inset 2px 0 0 ${accent}`,
                      } : undefined}
                    >
                      <Icon size={17} className="flex-shrink-0" />
                      {!displayCollapsed && <span className="truncate flex-1">{itemLabel}</span>}
                      {badge > 0 && (
                        displayCollapsed ? (
                          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                        ) : (
                          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )
                      )}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-16 w-6 h-6 bg-dark-surface border border-dark-border rounded-full hidden lg:flex items-center justify-center text-t-secondary hover:text-white hover:bg-dark-surface2 transition-colors z-10"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Plan badge */}
        <SidebarPlanBadge collapsed={displayCollapsed} />

        {/* User + logout */}
        <div className="border-t border-dark-border p-3">
          {!displayCollapsed && (
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-7 h-7 bg-primary-500 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                {user?.name?.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium truncate">{user?.name}</p>
                  {roleName && <span className="text-[9px] px-1 py-0.5 rounded bg-primary-500/20 text-primary-400 font-medium flex-shrink-0">{roleName}</span>}
                </div>
                <p className="text-[10px] text-[#636366] truncate">{user?.email}</p>
              </div>
            </div>
          )}
          <div className={clsx('flex items-center gap-3', displayCollapsed ? 'flex-col' : 'justify-between')}>
            <button
              onClick={handleLogout}
              title={displayCollapsed ? t('topbar.logout', 'Log out') : undefined}
              className={clsx('flex items-center gap-2 text-t-secondary hover:text-white text-xs transition-colors', displayCollapsed ? 'justify-center w-full' : '')}
            >
              <LogOut size={15} />
              {!displayCollapsed && t('topbar.logout', 'Log out')}
            </button>
            <LangSwitcher collapsed={displayCollapsed} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Top bar */}
        <header className="bg-dark-surface border-b border-dark-border px-4 lg:px-6 h-14 flex items-center gap-3 lg:gap-4">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 -ml-1.5 text-t-secondary hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          {/* Mobile logo/title */}
          <div className="lg:hidden flex items-center gap-2 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-7 max-w-[120px] object-contain" />
            ) : (
              <span className="font-semibold text-sm truncate">Hotel Loyalty</span>
            )}
          </div>
          <div className="flex-1" />

          {/* Brand switcher — auto-hides when org has only one brand */}
          <BrandSwitcher />

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 text-xs text-t-secondary">
            <Radio size={12} className={connected ? 'text-green-400' : 'text-red-400'} />
            <span className={connected ? 'text-green-400' : 'text-red-400'}>{connected ? 'Live' : 'Offline'}</span>
          </div>

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setShowNotifPanel(p => !p); setSeenCount(events.length) }}
              className="relative p-1.5 text-t-secondary hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors"
            >
              <Bell size={18} />
              {unseenCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                  {unseenCount > 9 ? '9+' : unseenCount}
                </span>
              )}
            </button>

            {showNotifPanel && (
              <div className="absolute right-0 top-10 w-80 bg-dark-surface border border-dark-border rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Live Activity</h3>
                  <span className="text-[10px] text-[#636366]">{events.length} events</span>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-dark-border/50">
                  {events.length === 0 ? (
                    <p className="text-center text-[#636366] text-xs py-8">No recent events</p>
                  ) : events.map((evt, i) => (
                    <div key={i} className="px-4 py-2.5 hover:bg-dark-surface2 transition-colors">
                      <div className="flex items-start gap-2">
                        <span className="text-sm flex-shrink-0 mt-0.5">
                          {evt.type === 'arrival' ? '\ud83d\udecf' : evt.type === 'departure' ? '\ud83d\udecf' : evt.type === 'inquiry' ? '\ud83d\udce9' : evt.type === 'points' ? '\u2b50' : evt.type === 'member' ? '\ud83d\udc64' : '\ud83c\udfe8'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate">{evt.title}</p>
                          {evt.body && <p className="text-[11px] text-t-secondary truncate">{evt.body}</p>}
                        </div>
                        <span className="text-[10px] text-[#636366] flex-shrink-0 whitespace-nowrap">
                          {new Date(evt.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Subscription wall — locks out access when trial expires */}
        <SubscriptionWall />

        {/* Trial-near-expiry warning banner */}
        <TrialExpiryBanner />

        {/* Paid-plan card-failed grace-period banner. Shown when
            Stripe says the most recent payment failed and we're
            inside the 3-day grace window before lockout. */}
        <PastDueGraceBanner />

        {/* Page content. Skipped entirely when the wall is showing so
            that no background queries fire for a tenant whose trial has
            ended. This is intentional — without this gate, every page's
            React Query hooks kept polling endpoints that all return
            403, generating log spam and a flicker of broken UI behind
            the wall. */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 mobile-safe-bottom">
          {blockForSub ? null : children}
        </main>
      </div>

      {/* Mobile bottom nav — 5 most-used destinations */}
      <MobileBottomNav
        pathname={location.pathname}
        chatUnread={chatUnread}
        hasProduct={hasProduct}
        onOpenDrawer={() => setMobileOpen(true)}
      />
    </div>
  )
}

function MobileBottomNav({
  pathname,
  chatUnread,
  hasProduct,
  onOpenDrawer,
}: {
  pathname: string
  chatUnread: number
  hasProduct: (p: string) => boolean
  onOpenDrawer: () => void
}) {
  const hasBooking = hasProduct('booking')
  const hasChat = hasProduct('chat')

  const isActive = (path: string, startsWith = true) =>
    path === '/' ? pathname === '/' : (startsWith ? pathname.startsWith(path) : pathname === path)

  return (
    <nav className="mobile-bottom-nav lg:hidden" aria-label="Primary">
      <Link to="/" className={clsx(isActive('/', false) && 'active')}>
        <LayoutDashboard size={20} />
        <span>Home</span>
      </Link>
      <Link to="/members" className={clsx(isActive('/members') && 'active')}>
        <Users size={20} />
        <span>Members</span>
      </Link>
      {hasBooking && (
        <Link
          to="/bookings"
          className={clsx(
            (pathname.startsWith('/bookings') || pathname.startsWith('/service-bookings') || pathname === '/calendar') && 'active'
          )}
        >
          <BedDouble size={20} />
          <span>Bookings</span>
        </Link>
      )}
      {hasChat && (
        <Link to="/engagement" className={clsx('relative', (pathname.startsWith('/engagement') || pathname.startsWith('/chat-inbox') || pathname === '/inbox' || pathname.startsWith('/visitors')) && 'active')}>
          <Inbox size={20} />
          <span>Inbox</span>
          {chatUnread > 0 && (
            <span className="absolute top-1.5 right-[calc(50%-14px)] bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
              {chatUnread > 9 ? '9+' : chatUnread}
            </span>
          )}
        </Link>
      )}
      <button type="button" onClick={onOpenDrawer}>
        <MoreHorizontal size={20} />
        <span>More</span>
      </button>
    </nav>
  )
}

function SidebarPlanBadge({ collapsed }: { collapsed: boolean }) {
  const { data, status, isLoading } = useSubscription()

  if (!data || status === 'LOCAL' || status === 'LOADING' || isLoading) return null

  const trialEnd = data.trialEnd ? new Date(data.trialEnd) : null
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : null
  const planName = data.plan?.name ?? 'Free'

  if (collapsed) {
    return (
      <div className="border-t border-dark-border px-2 py-2 flex justify-center" title={`${planName} plan${status === 'TRIALING' && daysLeft !== null ? ` — ${daysLeft}d trial` : ''}`}>
        <div className={clsx(
          'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold',
          status === 'TRIALING' ? 'bg-primary-500/20 text-primary-300' : status === 'ACTIVE' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
        )}>
          {planName.charAt(0)}
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-dark-border px-3 py-2.5">
      <Link
        to="/billing"
        className="block px-2.5 py-2 rounded-lg bg-dark-surface2 hover:bg-dark-surface3 transition-colors group"
      >
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles size={11} className={clsx('shrink-0',
              status === 'TRIALING' ? 'text-primary-400' :
              status === 'ACTIVE' ? 'text-green-400' :
              'text-red-400'
            )} />
            <span className="text-[11px] font-semibold text-white truncate">{planName} plan</span>
          </div>
          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0',
            status === 'TRIALING' ? 'bg-primary-500/20 text-primary-300' :
            status === 'ACTIVE' ? 'bg-green-500/20 text-green-300' :
            'bg-red-500/20 text-red-300'
          )}>
            {status === 'TRIALING' ? 'Trial' : status === 'ACTIVE' ? 'Active' : 'Expired'}
          </span>
        </div>
        {status === 'TRIALING' && daysLeft !== null && (
          <p className="text-[10px] text-t-secondary">{daysLeft} day{daysLeft === 1 ? '' : 's'} left &middot; <span className="text-primary-400 group-hover:text-primary-300">Upgrade &rarr;</span></p>
        )}
        {status === 'ACTIVE' && data.periodEnd && (
          <p className="text-[10px] text-t-secondary">Renews {new Date(data.periodEnd).toLocaleDateString()}</p>
        )}
        {(status === 'EXPIRED' || !data.active) && (
          <p className="text-[10px] text-red-400">Renew to restore access</p>
        )}
      </Link>
    </div>
  )
}

/**
 * Slim banner pinned under the top header that shows up while the trial is
 * still active but ≤3 days from expiry. Gives users a clear runway to upgrade
 * before the SubscriptionWall locks them out. Hidden on /billing so the page
 * isn't double-prompting.
 */
function TrialExpiryBanner() {
  const { data, status } = useSubscription()
  const location = useLocation()
  const trialEnd = data?.trialEnd ? new Date(data.trialEnd) : null

  if (status !== 'TRIALING' || !trialEnd) return null
  if (location.pathname === '/billing') return null

  const msLeft = trialEnd.getTime() - Date.now()
  const daysLeft = Math.ceil(msLeft / 86400000)
  if (daysLeft > 3) return null  // only flag the last 3 days

  const tone = daysLeft <= 1
    ? { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-300', accent: 'text-red-400' }
    : { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-300', accent: 'text-amber-400' }

  const label = daysLeft <= 0 ? 'Trial expires today'
    : daysLeft === 1 ? 'Trial expires tomorrow'
    : `Trial expires in ${daysLeft} days`

  return (
    <div className={`${tone.bg} border-b ${tone.border} px-4 lg:px-6 py-2`}>
      <div className="flex items-center gap-3 text-sm">
        <AlertTriangle size={16} className={tone.accent} />
        <span className={tone.text}>{label} — <strong>subscribe now</strong> to keep access.</span>
        <Link
          to="/billing"
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white transition-colors"
        >
          <CreditCard size={12} />
          Upgrade
        </Link>
      </div>
    </div>
  )
}

/**
 * Banner shown when Stripe has set the subscription to PAST_DUE
 * (most recent charge failed) but we're still inside the 3-day grace
 * window before our middleware will start blocking. Critical UX —
 * pre-fix a failed charge instantly 403'd everything including
 * /billing itself, locking the customer out of the very page they
 * needed to fix their card.
 */
function PastDueGraceBanner() {
  const { status, graceDaysLeft } = useSubscription()
  const location = useLocation()
  if (status !== 'PAST_DUE_GRACE') return null
  if (location.pathname === '/billing') return null

  const tone = (graceDaysLeft ?? 3) <= 1
    ? { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-300', accent: 'text-red-400' }
    : { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-300', accent: 'text-amber-400' }

  const label = (graceDaysLeft ?? 0) <= 0 ? 'Final notice — payment failed'
    : (graceDaysLeft === 1) ? 'Payment failed — 1 day to update'
    : `Payment failed — ${graceDaysLeft} days to update`

  return (
    <div className={`${tone.bg} border-b ${tone.border} px-4 lg:px-6 py-2`}>
      <div className="flex items-center gap-3 text-sm">
        <AlertTriangle size={16} className={tone.accent} />
        <span className={tone.text}>{label}. <strong>Update your card</strong> to keep access.</span>
        <Link
          to="/billing"
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white transition-colors"
        >
          <CreditCard size={12} />
          Update payment
        </Link>
      </div>
    </div>
  )
}

function SubscriptionWall() {
  const { data, status, isLoading } = useSubscription()
  const { staff } = useAuthStore()
  const location = useLocation()

  // Don't render while loading
  if (isLoading || status === 'LOADING') return null

  // No wall for active/trialing subscriptions
  if (status === 'ACTIVE' || status === 'TRIALING' || status === 'LOCAL') return null

  // Always allow access to billing page
  if (location.pathname === '/billing') return null

  // Super admin bypass
  if (staff?.role === 'super_admin') return null

  // Show wall for EXPIRED or NO_PLAN
  const isExpired = status === 'EXPIRED'
  const trialAlreadyUsed = !!data?.trialAlreadyUsed
  const isAdmin = staff?.role === 'super_admin' || staff?.role === 'manager'

  return (
    <div className="fixed inset-0 bg-dark-bg/95 backdrop-blur-sm z-40 flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center text-center max-w-2xl gap-6">
        {/* Lock Icon */}
        <div className="w-20 h-20 rounded-2xl bg-orange-500/20 flex items-center justify-center">
          <AlertTriangle size={40} className="text-orange-400" />
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {isExpired ? 'Your trial has ended'
              : trialAlreadyUsed ? 'Free trial already used'
              : 'Subscription required'}
          </h1>
          <p className="text-gray-300 text-base">
            {isExpired
              ? 'Your free trial has expired. Subscribe to restore access to all features.'
              : trialAlreadyUsed
              ? 'You\'ve already used your free trial. Pick a plan below to continue using the platform — switching plans does not restart the trial.'
              : 'Choose a plan to activate your workspace and start using the platform.'}
          </p>
        </div>

        {/* Plan Cards for Admins */}
        {isAdmin ? (
          <div className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {[
                { name: 'Starter', price: '$149', desc: 'For small teams' },
                { name: 'Growth', price: '$269', desc: 'For growing hotels' },
                { name: 'Enterprise', price: 'Custom', desc: 'For large chains' },
              ].map((plan) => (
                <Link
                  key={plan.name}
                  to="/billing"
                  className="border border-dark-border rounded-xl p-5 bg-dark-surface hover:bg-dark-surface2 hover:border-primary-500/50 transition-all group"
                >
                  <h3 className="font-semibold text-white mb-1 group-hover:text-primary-300 transition-colors">{plan.name}</h3>
                  <p className="text-sm text-gray-400 mb-3">{plan.desc}</p>
                  <p className="text-xl font-bold text-primary-400">{plan.price}</p>
                  <p className="text-xs text-gray-600 mt-3">/month</p>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 max-w-md w-full text-center">
            <p className="text-gray-300">Contact your workspace administrator to renew the subscription and restore access.</p>
          </div>
        )}

        {/* CTA Button */}
        <Link
          to="/billing"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-400 text-black font-semibold rounded-lg transition-colors shadow-lg shadow-primary-500/30"
        >
          <CreditCard size={16} />
          Go to Billing
          <ChevronRight size={16} />
        </Link>

        {/* Logout button */}
        <button
          onClick={() => { localStorage.removeItem('auth_token'); window.location.href = '/login' }}
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors mt-2"
        >
          Or sign out
        </button>
      </div>
    </div>
  )
}

