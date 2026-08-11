import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Gift, Sparkles, User, LogOut, Crown } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

/**
 * Shell for the member-facing web portal.
 *
 * Members previously had no web access at all — `ProtectedRoute` required
 * `user_type === 'staff'`, so anyone signing in with a member account was
 * bounced straight back to the login screen. The whole `/v1/member/*` API
 * existed and only the mobile app could reach it.
 *
 * Deliberately NOT the admin `Layout`: a member is not an operator. No
 * sidebar, no brand switcher, no dense nav tree — a header, five
 * destinations, and a thumb-reachable bar on phones, which is where
 * loyalty members actually are.
 *
 * Colours come from the same CSS-variable tokens as the admin app, so a
 * white-labelled org gets its own palette here for free.
 */

// Six destinations. Activity moved off the bar and onto Home's "See all"
// link — six icons is the most that stays tappable at 390px, and a member
// checks their perks far more often than their full ledger.
const NAV = [
  { to: '/portal',          label: 'Home',     icon: Home, end: true },
  { to: '/portal/benefits', label: 'Benefits', icon: Crown },
  { to: '/portal/rewards',  label: 'Rewards',  icon: Gift },
  { to: '/portal/offers',   label: 'Offers',   icon: Sparkles },
  { to: '/portal/profile',  label: 'Profile',  icon: User },
]

export function PortalLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const signOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-dark-bg text-t-primary flex flex-col">
      <header className="sticky top-0 z-30 bg-dark-bg/95 backdrop-blur border-b border-dark-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold tracking-tight">
            {user?.name ? `Hello, ${user.name.split(' ')[0]}` : 'My membership'}
          </span>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs text-t-secondary hover:text-white
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 rounded px-2 py-1"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

        {/* Desktop nav. On phones this is replaced by the bottom bar. */}
        <nav className="hidden sm:block border-t border-dark-border">
          <div className="max-w-3xl mx-auto px-4 flex gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    isActive
                      ? 'border-primary-500 text-white'
                      : 'border-transparent text-t-secondary hover:text-white'
                  }`
                }
              >
                <Icon size={15} /> {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      {/* pb-20 clears the fixed mobile bar so the last card is never
          trapped underneath it. */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-5 pb-24 sm:pb-8">
        {children}
      </main>

      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-dark-surface/95 backdrop-blur
                   border-t border-dark-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-primary-400' : 'text-t-secondary'
                }`
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
