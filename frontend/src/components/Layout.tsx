import type { ReactNode } from 'react'
import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { APP_BASE } from '../lib/api'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Users, Gift, BarChart2, Sparkles,
  Bell, Settings, LogOut, Hotel, Scan, Bot, Inbox, ArrowLeftRight,
  Crown, Award, Building2, FileText,
  Briefcase, ClipboardList, Radio, ScrollText,
  ChevronLeft, ChevronRight, ChevronDown,
  BedDouble, CalendarDays, CreditCard, Home, Package, Eye, Star,
  UserCog, AlertTriangle, Zap,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { api, resolveImage } from '../lib/api'
import { useRealtimeEvents } from '../hooks/useRealtimeEvents'
import { useSubscription } from '../hooks/useSubscription'

// gate: 'all' = everyone, 'admin' = super_admin/manager only, or a staff permission key
export type NavGate = 'all' | 'admin' | 'can_manage_offers' | 'can_view_analytics'

interface NavItem {
  path: string
  label: string
  icon: any
  gate: NavGate
  product?: string   // required SaaS product slug
  feature?: string   // required SaaS feature key
  altPaths?: string[] // sibling routes that should keep this item highlighted (used for PairTabs siblings)
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { path: '/',          label: 'Dashboard',   icon: LayoutDashboard, gate: 'all' },
      { path: '/analytics', label: 'Analytics',   icon: BarChart2,       gate: 'can_view_analytics', feature: 'ai_insights' },
      { path: '/ai',        label: 'AI Insights', icon: Sparkles,        gate: 'can_view_analytics', feature: 'ai_insights' },
    ],
  },
  {
    label: 'AI Chat',
    items: [
      { path: '/chat-inbox',     label: 'Inbox',         icon: Inbox, gate: 'all',   product: 'chat' },
      { path: '/visitors',       label: 'Visitors',      icon: Eye,   gate: 'all',   product: 'chat' },
      { path: '/chatbot-setup',  label: 'Chatbot Setup', icon: Bot,   gate: 'admin', product: 'chat' },
    ],
  },
  {
    label: 'Members & Loyalty',
    items: [
      { path: '/members',            label: 'Members',    icon: Users,     gate: 'all' },
      { path: '/members/duplicates', label: 'Duplicates', icon: ArrowLeftRight, gate: 'admin' },
      { path: '/tiers',    label: 'Tiers',    icon: Crown,     gate: 'admin', product: 'loyalty' },
      { path: '/benefits', label: 'Benefits', icon: Award,     gate: 'admin', product: 'loyalty' },
      { path: '/offers',   label: 'Offers',   icon: Gift,      gate: 'can_manage_offers', product: 'loyalty' },
    ],
  },
  {
    label: 'Bookings',
    items: [
      { path: '/calendar',          label: 'Calendar',         icon: CalendarDays,  gate: 'all',   product: 'booking' },
      { path: '/bookings',          label: 'Reservations',     icon: BedDouble,     gate: 'all',   product: 'booking', altPaths: ['/service-bookings'] },
      { path: '/booking-rooms',     label: 'Rooms & Services', icon: Home,          gate: 'admin', product: 'booking', altPaths: ['/services'] },
      { path: '/service-masters',   label: 'Masters',          icon: UserCog,       gate: 'admin', product: 'booking' },
      { path: '/booking-extras',    label: 'Extras',           icon: Package,       gate: 'admin', product: 'booking', altPaths: ['/service-extras'] },
      { path: '/bookings/payments', label: 'Payments',         icon: CreditCard,    gate: 'all',   product: 'booking' },
    ],
  },
  {
    label: 'CRM & Marketing',
    items: [
      { path: '/inquiries',     label: 'Leads & Inquiries', icon: FileText,  gate: 'all' },
      { path: '/corporate',     label: 'Corporate',         icon: Briefcase, gate: 'admin' },
      { path: '/notifications', label: 'Campaigns',         icon: Bell,      gate: 'admin', feature: 'push_notifications', altPaths: ['/email-templates'] },
      { path: '/reviews',       label: 'Reviews',           icon: Star,      gate: 'admin' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/planner',    label: 'Planner',    icon: ClipboardList, gate: 'all' },
      { path: '/properties', label: 'Properties', icon: Building2,     gate: 'admin', altPaths: ['/venues'] },
      { path: '/scan',       label: 'Scan',       icon: Scan,          gate: 'all' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/billing',   label: 'Billing',   icon: CreditCard, gate: 'admin' },
      { path: '/audit-log', label: 'Audit Log', icon: ScrollText, gate: 'admin' },
      { path: '/settings',  label: 'Settings',  icon: Settings,   gate: 'admin' },
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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const location = useLocation()
  const { user, staff, logout } = useAuthStore()
  const { hasFeature, hasProduct } = useSubscription()
  const roleName = staff?.role === 'super_admin' ? 'Admin' : staff?.role === 'manager' ? 'Manager' : staff?.role ? staff.role.charAt(0).toUpperCase() + staff.role.slice(1) : ''
  const { connected, events } = useRealtimeEvents()
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [seenCount, setSeenCount] = useState(0)
  const notifRef = useRef<HTMLDivElement>(null)
  const unseenCount = Math.max(0, events.length - seenCount)

  // Auto-expand group containing current page
  useEffect(() => {
    for (const group of navGroups) {
      const match = group.items.some(i => {
        if (i.path === location.pathname) return true
        if (i.path !== '/' && location.pathname.startsWith(i.path)) return true
        return (i.altPaths ?? []).some(p => location.pathname === p || location.pathname.startsWith(p))
      })
      if (match) {
        setExpandedGroups(prev => ({ ...prev, [group.label]: true }))
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
    if (collapsed) return
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

  // Filter groups: role gate + product/feature gate
  const visibleGroups = navGroups
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
      {/* Sidebar */}
      <aside className={clsx(
        'flex flex-col bg-dark-surface text-white transition-all duration-300 flex-shrink-0 border-r border-dark-border relative',
        collapsed ? 'w-[60px]' : 'w-60'
      )}>
        {/* Logo */}
        <div className={clsx('flex items-center border-b border-dark-border h-14', collapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className={clsx('rounded-lg object-contain flex-shrink-0', collapsed ? 'h-7 w-7 object-cover' : 'h-8 max-w-[140px]')} />
          ) : (
            <>
              <div className="w-7 h-7 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Hotel size={15} />
              </div>
              {!collapsed && <span className="font-bold text-sm truncate">Hotel Loyalty</span>}
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
          {visibleGroups.map(({ label, items }) => {
            const isOpen = collapsed || expandedGroups[label] !== false // default open
            return (
              <div key={label} className="mb-1">
                {/* Group header */}
                {!collapsed ? (
                  <button
                    onClick={() => toggleGroup(label)}
                    className="flex items-center justify-between w-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#636366] hover:text-t-secondary transition-colors"
                  >
                    <span>{label}</span>
                    <ChevronDown size={12} className={clsx('transition-transform', isOpen ? '' : '-rotate-90')} />
                  </button>
                ) : (
                  <div className="h-px bg-dark-border mx-2 my-1.5" />
                )}

                {/* Group items */}
                {isOpen && items.map(({ path, label: itemLabel, icon: Icon, altPaths }) => {
                  const active = path === '/'
                    ? location.pathname === '/'
                    : (location.pathname.startsWith(path) || (altPaths ?? []).some(p => location.pathname === p || location.pathname.startsWith(p)))
                  const badge = path === '/chat-inbox' && chatUnread > 0 ? chatUnread : 0
                  return (
                    <Link
                      key={path}
                      to={path}
                      title={collapsed ? itemLabel : undefined}
                      className={clsx(
                        'flex items-center gap-2.5 py-2 mx-1.5 rounded-lg transition-colors text-[13px] font-medium relative',
                        collapsed ? 'justify-center px-0' : 'px-3',
                        active
                          ? 'bg-primary-600/20 text-primary-400'
                          : 'text-t-secondary hover:text-white hover:bg-dark-surface2'
                      )}
                    >
                      <Icon size={17} className="flex-shrink-0" />
                      {!collapsed && <span className="truncate flex-1">{itemLabel}</span>}
                      {badge > 0 && (
                        collapsed ? (
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

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-16 w-6 h-6 bg-dark-surface border border-dark-border rounded-full flex items-center justify-center text-t-secondary hover:text-white hover:bg-dark-surface2 transition-colors z-10"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Plan badge */}
        <SidebarPlanBadge collapsed={collapsed} />

        {/* User + logout */}
        <div className="border-t border-dark-border p-3">
          {!collapsed && (
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
          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={clsx('flex items-center gap-2 text-t-secondary hover:text-white text-xs transition-colors', collapsed ? 'justify-center w-full' : '')}
          >
            <LogOut size={15} />
            {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-dark-surface border-b border-dark-border px-6 h-14 flex items-center gap-4">
          <div className="flex-1" />

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

        {/* Expired plan banner — unmissable prompt to renew */}
        <ExpiredPlanBanner />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
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

function ExpiredPlanBanner() {
  const { status } = useSubscription()
  const { staff } = useAuthStore()
  const location = useLocation()

  if (status !== 'EXPIRED' && status !== 'NO_PLAN') return null
  if (location.pathname === '/billing') return null

  const isAdmin = staff?.role === 'super_admin' || staff?.role === 'manager'
  const expired = status === 'EXPIRED'

  return (
    <div className={clsx(
      'border-b px-6 py-3 flex items-center gap-4',
      expired
        ? 'bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/30'
        : 'bg-gradient-to-r from-primary-500/10 to-primary-600/10 border-primary-500/30'
    )}>
      <div className={clsx(
        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
        expired ? 'bg-orange-500/20' : 'bg-primary-500/20'
      )}>
        {expired
          ? <AlertTriangle size={18} className="text-orange-400" />
          : <Zap size={18} className="text-primary-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm font-semibold', expired ? 'text-orange-200' : 'text-primary-200')}>
          {expired ? 'Your subscription has expired' : 'Choose a plan to activate your workspace'}
        </p>
        <p className="text-xs text-t-secondary mt-0.5">
          {isAdmin
            ? (expired
                ? 'Renew now to restore access to loyalty, bookings, chat and AI features.'
                : 'Start your free trial in one click — no credit card required.')
            : 'Please ask your workspace administrator to renew the plan to restore full access.'}
        </p>
      </div>
      {isAdmin && (
        <Link
          to="/billing"
          className={clsx(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shrink-0 transition-colors shadow-lg',
            expired
              ? 'bg-orange-500 hover:bg-orange-400 text-black shadow-orange-500/30'
              : 'bg-primary-500 hover:bg-primary-400 text-black shadow-primary-500/30'
          )}
        >
          <CreditCard size={14} />
          {expired ? 'Renew Plan' : 'Choose Plan'}
        </Link>
      )}
    </div>
  )
}

