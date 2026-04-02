import type { ReactNode } from 'react'
import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { APP_BASE } from '../lib/api'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Users, Gift, BarChart2, Sparkles,
  Bell, Settings, LogOut, Hotel, Scan, Bot, BookOpen, Inbox, Zap, GraduationCap,
  Crown, Award, Building2, UserCheck, FileText,
  CalendarCheck, Briefcase, ClipboardList, MapPin, Radio, Mail, ScrollText,
  AlertTriangle, Clock, ChevronLeft, ChevronRight, ChevronDown,
  BedDouble, CalendarDays, ListChecks, CreditCard,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { api, resolveImage } from '../lib/api'
import { useRealtimeEvents } from '../hooks/useRealtimeEvents'

// gate: 'all' = everyone, 'admin' = super_admin/manager only, or a staff permission key
export type NavGate = 'all' | 'admin' | 'can_manage_offers' | 'can_view_analytics'

interface NavItem {
  path: string
  label: string
  icon: any
  gate: NavGate
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
      { path: '/analytics', label: 'Analytics',   icon: BarChart2,       gate: 'can_view_analytics' },
      { path: '/ai',        label: 'AI Insights', icon: Sparkles,        gate: 'can_view_analytics' },
    ],
  },
  {
    label: 'AI Chat',
    items: [
      { path: '/chat-inbox',      label: 'Inbox',          icon: Inbox,          gate: 'all' },
      { path: '/chatbot-config',  label: 'Chatbot Config', icon: Bot,            gate: 'admin' },
      { path: '/knowledge-base',  label: 'Knowledge Base', icon: BookOpen,       gate: 'admin' },
      { path: '/popup-rules',     label: 'Popup Rules',    icon: Zap,            gate: 'admin' },
      { path: '/training',        label: 'AI Training',    icon: GraduationCap,  gate: 'admin' },
    ],
  },
  {
    label: 'Guests & Loyalty',
    items: [
      { path: '/members',  label: 'Members',  icon: Users,     gate: 'all' },
      { path: '/guests',   label: 'Guests',   icon: UserCheck, gate: 'all' },
      { path: '/tiers',    label: 'Tiers',    icon: Crown,     gate: 'admin' },
      { path: '/benefits', label: 'Benefits', icon: Award,     gate: 'admin' },
      { path: '/offers',   label: 'Offers',   icon: Gift,      gate: 'can_manage_offers' },
    ],
  },
  {
    label: 'Bookings',
    items: [
      { path: '/bookings',             label: 'Bookings',     icon: BedDouble,     gate: 'all' },
      { path: '/bookings/calendar',    label: 'Calendar',     icon: CalendarDays,  gate: 'all' },
      { path: '/reservations',         label: 'Reservations', icon: CalendarCheck, gate: 'all' },
      { path: '/bookings/payments',    label: 'Payments',     icon: CreditCard,    gate: 'all' },
      { path: '/bookings/submissions', label: 'Submissions',  icon: ListChecks,    gate: 'admin' },
    ],
  },
  {
    label: 'CRM & Marketing',
    items: [
      { path: '/inquiries',       label: 'Inquiries',       icon: FileText,  gate: 'all' },
      { path: '/corporate',       label: 'Corporate',       icon: Briefcase, gate: 'admin' },
      { path: '/notifications',   label: 'Campaigns',       icon: Bell,      gate: 'admin' },
      { path: '/email-templates', label: 'Email Templates', icon: Mail,      gate: 'admin' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/planner',    label: 'Planner',    icon: ClipboardList, gate: 'all' },
      { path: '/properties', label: 'Properties', icon: Building2,     gate: 'admin' },
      { path: '/venues',     label: 'Venues',     icon: MapPin,        gate: 'admin' },
      { path: '/scan',       label: 'Scan',       icon: Scan,          gate: 'all' },
    ],
  },
  {
    label: 'System',
    items: [
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
  const roleName = staff?.role === 'super_admin' ? 'Admin' : staff?.role === 'manager' ? 'Manager' : staff?.role ? staff.role.charAt(0).toUpperCase() + staff.role.slice(1) : ''
  const { connected, events } = useRealtimeEvents()
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [seenCount, setSeenCount] = useState(0)
  const notifRef = useRef<HTMLDivElement>(null)
  const unseenCount = Math.max(0, events.length - seenCount)

  // Auto-expand group containing current page
  useEffect(() => {
    for (const group of navGroups) {
      if (group.items.some(i => i.path === location.pathname || (i.path !== '/' && location.pathname.startsWith(i.path)))) {
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

  // Filter groups to only show items the user can access, hide empty groups
  const visibleGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => canAccess(item.gate, staff)),
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
                {isOpen && items.map(({ path, label: itemLabel, icon: Icon }) => {
                  const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
                  return (
                    <Link
                      key={path}
                      to={path}
                      title={collapsed ? itemLabel : undefined}
                      className={clsx(
                        'flex items-center gap-2.5 py-2 mx-1.5 rounded-lg transition-colors text-[13px] font-medium',
                        collapsed ? 'justify-center px-0' : 'px-3',
                        active
                          ? 'bg-primary-600/20 text-primary-400'
                          : 'text-t-secondary hover:text-white hover:bg-dark-surface2'
                      )}
                    >
                      <Icon size={17} className="flex-shrink-0" />
                      {!collapsed && <span className="truncate">{itemLabel}</span>}
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <SubscriptionBanner />
          {children}
        </main>
      </div>
    </div>
  )
}

function SubscriptionBanner() {
  const { data } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => api.get('/v1/auth/subscription').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  if (!data || data.status === 'LOCAL' || data.status === 'ACTIVE') return null

  if (data.status === 'TRIALING') {
    const trialEnd = data.trialEnd ? new Date(data.trialEnd) : null
    const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : null
    return (
      <div className="mb-4 bg-primary-500/10 border border-primary-500/20 rounded-lg px-4 py-2.5 flex items-center gap-3">
        <Clock size={16} className="text-primary-400 shrink-0" />
        <span className="text-sm text-primary-300">
          <strong>Trial</strong> {daysLeft !== null ? ' \u2014 ' + daysLeft + ' days remaining' : ''}.
          {data.plan?.name ? ' Plan: ' + data.plan.name + '.' : ''}
          {' '}Visit{' '}
          <a href="https://saas.hotel-tech.ai/admin/subscription" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-200">
            Billing
          </a>{' '}to subscribe.
        </span>
      </div>
    )
  }

  if (data.status === 'EXPIRED' || !data.active) {
    return (
      <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 flex items-center gap-3">
        <AlertTriangle size={16} className="text-red-400 shrink-0" />
        <span className="text-sm text-red-300">
          <strong>Subscription expired.</strong> Some features may be limited.{' '}
          <a href="https://saas.hotel-tech.ai/admin/subscription" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-200">
            Renew now
          </a>
        </span>
      </div>
    )
  }

  return null
}
