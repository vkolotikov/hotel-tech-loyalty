import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { APP_BASE } from '../lib/api'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Users, Gift, BarChart2, Sparkles,
  Bell, Settings, LogOut, Menu, X, Hotel, Scan,
  Crown, Award, Building2
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { api, API_URL } from '../lib/api'

const navItems = [
  { path: '/',          label: 'Dashboard',  icon: LayoutDashboard },
  { path: '/scan',      label: 'Scan',       icon: Scan },
  { path: '/members',   label: 'Members',    icon: Users },
  { path: '/offers',    label: 'Offers',     icon: Gift },
  { path: '/tiers',     label: 'Tiers',      icon: Crown },
  { path: '/benefits',  label: 'Benefits',   icon: Award },
  { path: '/properties',label: 'Properties', icon: Building2 },
  { path: '/analytics', label: 'Analytics',  icon: BarChart2 },
  { path: '/ai',        label: 'AI Insights',icon: Sparkles },
  { path: '/notifications', label: 'Campaigns', icon: Bell },
  { path: '/settings',  label: 'Settings',   icon: Settings },
]

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()
  const { user, logout } = useAuthStore()

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
      if (found?.value) {
        const v = found.value as string
        if (v.startsWith('http')) return v
        return API_URL + v
      }
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
          {navItems.map(({ path, label, icon: Icon }) => (
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
                <p className="text-sm font-medium truncate">{user?.name}</p>
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
          <span className="text-sm text-[#8e8e93]">Hotel Loyalty Admin</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
