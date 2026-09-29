import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Gift, CalendarDays, CalendarPlus, User, LogOut } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { logoutAndRedirect } from '../lib/logout'
import { usePortal } from './PortalProvider'
import { Notice } from './ui/Notice'
import { Button } from './ui/Button'
import { PageSkeleton } from './ui/Skeleton'

// Tailwind only generates classes it can see as literals, so the column
// count per visible nav item must be spelled out rather than interpolated.
const MOBILE_COLS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }

/**
 * The member's frame: venue name up top, a thumb-reachable bar on phones,
 * tabs from `sm`. Destinations follow what the venue can do — no Rewards
 * for a clinic, no Book for a venue that sells neither appointments nor stays — so
 * nothing points at a page that would be empty.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { data, isLoading, isError, error, refetch } = usePortal()

  const items = [
    { to: '/portal', label: t('portal.nav.home', 'Home'), icon: Home, end: true, show: true, badge: 0 },
    { to: '/portal/book', label: t('portal.nav.book', 'Book'), icon: CalendarPlus, end: false, show: !!data?.capabilities.services || !!data?.capabilities.stays, badge: 0 },
    { to: '/portal/rewards', label: t('portal.nav.rewards', 'Rewards'), icon: Gift, end: false, show: !!data?.capabilities.loyalty, badge: 0 },
    { to: '/portal/bookings', label: t('portal.nav.bookings', 'Bookings'), icon: CalendarDays, end: false, show: true, badge: data?.counts.upcoming_bookings ?? 0 },
    { to: '/portal/profile', label: t('portal.nav.profile', 'Profile'), icon: User, end: false, show: true, badge: 0 },
  ].filter(i => i.show)

  const firstName = user?.name?.split(' ')[0]
  const status = (error as { response?: { status?: number; data?: { error?: string } } })?.response
  const portalOff = status?.status === 403 && status.data?.error === 'portal_disabled'
  // A venue that switched the portal off should never keep showing the page
  // (blocking regardless of cached data). Any other error only blocks when
  // there is nothing cached to show yet — a background refetch failing on a
  // flaky connection should not replace a page the member was already
  // reading with the error screen.
  const blockingError = isError && !portalOff && !data

  return (
    <div data-portal="" className="min-h-screen flex flex-col font-p-body">
      <header className="sticky top-0 z-30 bg-p-bg/90 backdrop-blur border-b border-p-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {data?.venue.logo_url && <img src={data.venue.logo_url} alt="" className="h-7 w-7 rounded-full object-cover" />}
            <span className="font-p-display text-lg truncate">{data?.venue.name ?? t('portal.shell.membership', 'My membership')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {firstName && <span className="hidden sm:inline text-sm text-p-text-2">{t('portal.shell.greeting', 'Hello, {{name}}', { name: firstName })}</span>}
            <button
              onClick={() => { void logoutAndRedirect('/login') }}
              className="flex items-center gap-1.5 text-xs text-p-text-2 hover:text-p-text rounded-p-control px-2 min-h-11"
            >
              <LogOut size={14} aria-hidden /> {t('portal.common.sign_out', 'Sign out')}
            </button>
          </div>
        </div>
        <nav className="hidden sm:block border-t border-p-border" aria-label={t('portal.shell.menu', 'Menu')}>
          <div className="max-w-3xl mx-auto px-4 flex gap-1">
            {items.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-p-accent text-p-text' : 'border-transparent text-p-text-2 hover:text-p-text'}`}>
                <Icon size={15} aria-hidden /> {label}
                {badge > 0 && <span className="ml-1 rounded-full bg-p-accent text-p-accent-ink text-[10px] font-bold px-1.5">{badge}</span>}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-5 pb-24 sm:pb-8">
        {isLoading && <PageSkeleton />}
        {isError && portalOff && <Notice tone="warning">{t('portal.shell.portal_off', 'The member portal is switched off for this venue. Please contact them directly.')}</Notice>}
        {blockingError && (
          <div className="space-y-3">
            <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>
            <Button variant="secondary" onClick={refetch}>{t('portal.common.retry', 'Try again')}</Button>
          </div>
        )}
        {isError && !portalOff && data && (
          <div className="mb-3">
            <Notice tone="warning">
              <div className="flex items-center justify-between gap-3">
                <span>{t('portal.common.error', 'Something went wrong. Please try again.')}</span>
                <Button variant="secondary" size="sm" onClick={refetch}>{t('portal.common.retry', 'Try again')}</Button>
              </div>
            </Notice>
          </div>
        )}
        {!isLoading && !portalOff && !blockingError && children}
      </main>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-p-surface/95 backdrop-blur border-t border-p-border" aria-label={t('portal.shell.menu', 'Menu')} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className={`grid ${MOBILE_COLS[items.length] ?? 'grid-cols-4'}`}>
          {items.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 min-h-14 text-[11px] font-medium transition-colors ${isActive ? 'text-p-accent-deep' : 'text-p-text-2'}`}>
              <Icon size={20} aria-hidden />
              {label}
              {badge > 0 && <span className="absolute top-1.5 right-[calc(50%-18px)] rounded-full bg-p-accent text-p-accent-ink text-[10px] font-bold px-1.5">{badge}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
