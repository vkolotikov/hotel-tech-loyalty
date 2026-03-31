import type { ReactNode } from 'react'
import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { APP_BASE } from '../lib/api'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Users, Gift, BarChart2, Sparkles,
  Bell, Settings, LogOut, Menu, X, Hotel, Scan,
  Crown, Award, Building2, UserCheck, FileText,
  CalendarCheck, Briefcase, ClipboardList, MapPin, Radio, Mail, ScrollText,
  AlertTriangle, Clock,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { api, resolveImage } from '../lib/api'
import { useRealtimeEvents } from '../hooks/useRealtimeEvents'

// gate: 'all' = everyone, 'admin' = super_admin/manager only, or a staff permission key
export type NavGate = 'all' | 'admin' | 'can_manage_offers' | 'can_view_analytics'

const navItems: { path: string; label: string; icon: any; gate: NavGate }[] = [
  { path: '/',             label: 'Dashboard',     icon: LayoutDashboard,  gate: 'all' },
  { path: '/scan',         label: 'Scan',          icon: Scan,             gate: 'all' },
  { path: '/members',      label: 'Members',       icon: Users,            gate: 'all' },
  { path: '/guests',       label: 'Guests',        icon: UserCheck,        gate: 'all' },
  { path: '/inquiries',    label: 'Inquiries',     icon: FileText,         gate: 'all' },
  { path: '/reservations', label: 'Reservations',  icon: CalendarCheck,    gate: 'all' },
  { path: '/corporate',    label: 'Corporate',     icon: Briefcase,        gate: 'admin' },
  { path: '/planner',      label: 'Planner',       icon: ClipboardList,    gate: 'all' },
  { path: '/venues',       label: 'Venues',        icon: MapPin,           gate: 'admin' },
  { path: '/offers',       label: 'Offers',        icon: Gift,             gate: 'can_manage_offers' },
  { path: '/tiers',        label: 'Tiers',         icon: Crown,            gate: 'admin' },
  { path: '/benefits',     label: 'Benefits',      icon: Award,            gate: 'admin' },
  { path: '/properties',   label: 'Properties',    icon: Building2,        gate: 'admin' },
  { path: '/analytics',    label: 'Analytics',     icon: BarChart2,        gate: 'can_view_analytics' },
  { path: '/ai',           label: 'AI Insights',   icon: Sparkles,         gate: 'can_view_analytics' },
  { path: '/notifications',label: 'Campaigns',     icon: Bell,             gate: 'admin' },
  { path: '/email-templates',label: 'Email Templates', icon: Mail,           gate: 'admin' },
  { path: '/audit-log',    label: 'Audit Log',     icon: ScrollText,       gate: 'admin' },
  { path: '/settings',     label: 'Settings',      icon: Settings,         gate: 'admin' },
]

export const routeGates: Record<string, NavGate> = Object.fromEntries(
  navItems.filter(i => i.gate !== 'all').map(i => [i.path, i.gate])
)

export function canAccess(gate: NavGate, staff: { role: string; can_manage_offers: boolean; can_view_analytics: boolean } | null): boolean {
  if (!staff) return gate === 'all'
  const isAdmin = staff.role === 'super_admin' || staff.role === 'manager'
  if (isAdmin) return true
  if (gate === 'all') return true
  if (gate === 'admin') return false
  return !!staff[gate]
}

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()
  const { user, staff, logout } = useAuthStore()
  const visibleNav = navItems.filter(item => canAccess(item.gate, staff))
  const roleName = staff?.role === 'super_admin' ? 'Admin' : staff?.role === 'manager' ? 'Manager' : staff?.role ? staff.role.charAt(0).toUpperCase() + staff.role.slice(1) : ''
  const { connected, events } = useRealtimeEvents()
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [seenCount, setSeenCount] = useState(0)
  const notifRef = useRef<HTMLDivElement>(null)
  const unseenCount = Math.max(0, events.length - seenCount)

  // Close panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifPanel(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: settingsData } = useQuery({
    queryKey: ['settings-logo'],
    queryFn: () => api.get('/v1/admin/settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  // Settings come grouped: { settings: { general: [...], appearance: [...], ... } }
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

  return (
    <div className="flex h-screen bg-dark-bg">
      {/* Sidebar */}
      <aside className={clsx(
        'flex flex-col bg-dark-surface text-white transition-all duration-300 flex-shrink-0 border-r border-dark-border',
        sidebarOpen ? 'w-64' : 'w-16'
      )}>
        {/* Logo */}
        <div className={clsx("flex items-center border-b border-dark-border", logoUrl ? "justify-center px-3 py-4" : "gap-3 px-4 py-5")}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className={clsx("rounded-lg object-contain flex-shrink-0", sidebarOpen ? "h-10 max-w-[180px]" : "h-8 w-8 object-cover")} />
          ) : (
            <>
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Hotel size={18} />
              </div>
              {sidebarOpen && <span className="font-bold text-lg truncate">Hotel Loyalty</span>}
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {visibleNav.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={clsx(
                'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors text-sm font-medium',
                location.pathname === path
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-[#8e8e93] hover:text-white hover:bg-dark-surface2'
              )}
            >
              <Icon size={18} className="flex-shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </Link>
          ))}
        </nav>

        {/* User + logout */}
        <div className="border-t border-dark-border p-4">
          {sidebarOpen && (
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-sm font-bold">
                {user?.name?.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{user?.name}</p>
                  {roleName && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-400 font-medium flex-shrink-0">{roleName}</span>}
                </div>
                <p className="text-xs text-[#8e8e93] truncate">{user?.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-[#8e8e93] hover:text-white text-sm w-full"
          >
            <LogOut size={16} />
            {sidebarOpen && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-dark-surface border-b border-dark-border px-6 py-3 flex items-center gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-[#8e8e93] hover:text-white">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex-1" />

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 text-xs text-[#8e8e93]">
            <Radio size={12} className={connected ? 'text-green-400' : 'text-red-400'} />
            <span className={connected ? 'text-green-400' : 'text-red-400'}>{connected ? 'Live' : 'Offline'}</span>
          </div>

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setShowNotifPanel(p => !p); setSeenCount(events.length) }}
              className="relative p-1.5 text-[#8e8e93] hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors"
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
                          {evt.type === 'arrival' ? '🛬' : evt.type === 'departure' ? '🛫' : evt.type === 'inquiry' ? '📩' : evt.type === 'points' ? '⭐' : evt.type === 'member' ? '👤' : '🏨'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate">{evt.title}</p>
                          {evt.body && <p className="text-[11px] text-[#8e8e93] truncate">{evt.body}</p>}
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

          <span className="text-sm text-[#8e8e93]">Hotel Loyalty Admin</span>
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
