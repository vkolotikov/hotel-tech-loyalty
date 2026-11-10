import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePortal } from './PortalProvider'
import { badgeText } from './pages/inbox/inboxState'
import { Notice } from './ui/Notice'
import { Button } from './ui/Button'
import { PageSkeleton } from './ui/Skeleton'
import { PortalIcon, type PortalIconName } from './design/PortalIcon'
import { usePortalPanels } from './design/panels'

/** Four core destinations; booking, events and help remain actions within their pages. */
export function PortalShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { data, isLoading, isError, error, refetch } = usePortal()
  const panels = usePortalPanels()
  const items: { to: string; label: string; icon: PortalIconName; active: PortalIconName; end?: boolean; show: boolean }[] = [
    { to: '/portal', label: t('portal.nav.home', 'Home'), icon: 'home', active: 'homeActive', end: true, show: true },
    { to: '/portal/rewards', label: t('portal.nav.rewards', 'Rewards'), icon: 'rewards', active: 'rewardsActive', show: !!data?.capabilities.loyalty },
    { to: '/portal/bookings', label: t('portal.nav.bookings', 'Bookings'), icon: 'bookings', active: 'bookingsActive', show: true },
    { to: '/portal/profile', label: t('portal.nav.profile', 'Profile'), icon: 'profile', active: 'profileActive', show: true },
  ]
  const shown = items.filter(i => i.show)
  const unread = badgeText(data?.counts.unread_notifications ?? 0)
  const status = (error as { response?: { status?: number; data?: { error?: string } } })?.response
  const portalOff = status?.status === 403 && status.data?.error === 'portal_disabled'
  const blockingError = isError && !portalOff && !data
  const links = shown.map(({ to, label, icon, active, end }) => <NavLink key={to} to={to} end={end} className="p-nav-link">
    {({ isActive }) => <><PortalIcon name={isActive ? active : icon} /><span>{label}</span></>}
  </NavLink>)
  return (
    <div data-portal="" className="p-portal flex flex-col font-p-body">
      <header className="p-header">
        <div className="p-header-inner">
          <NavLink to="/portal" className="p-brand">
            <span className="p-brand-logo">{data?.venue.logo_url ? <img src={data.venue.logo_url} alt="" /> : <PortalIcon name="star" />}</span>
            <span className="min-w-0"><span className="p-brand-name block">{data?.venue.name ?? t('portal.shell.membership', 'My membership')}</span><span className="p-brand-caption">{t('portal.design.member_club', 'Member club')}</span></span>
          </NavLink>
          <nav className="p-desktop-nav" aria-label={t('portal.shell.menu', 'Menu')}>{links}</nav>
          <div className="p-header-actions">
            {data?.member && <>
              <Button variant="secondary" size="sm" onClick={() => panels.open('card')}><PortalIcon name="qr" />{t('portal.design.my_card', 'My card')}</Button>
              <button type="button" className="p-header-bell" title={t('portal.inbox.title', 'Inbox')} aria-label={t('portal.design.updates', 'Updates')} onClick={() => panels.open('updates')}>
                <PortalIcon name="bell" />
                {unread && <span data-inbox-badge="" className="absolute -top-1 -right-1 min-w-[17px] rounded-full bg-p-accent text-p-accent-ink text-[10px] font-bold px-1">{unread}<span className="sr-only"> {t('portal.inbox.unread', 'Unread')}</span></span>}
              </button>
            </>}
          </div>
        </div>
      </header>
      <main className="p-main flex-1">
        {isLoading && <PageSkeleton />}
        {isError && portalOff && <Notice tone="warning">{t('portal.shell.portal_off', 'The member portal is switched off for this venue. Please contact them directly.')}</Notice>}
        {blockingError && <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={refetch}>{t('portal.common.retry', 'Try again')}</Button></div>}
        {isError && !portalOff && data && <div className="mb-3"><Notice tone="warning"><div className="flex items-center justify-between gap-3"><span>{t('portal.common.error', 'Something went wrong. Please try again.')}</span><Button variant="secondary" size="sm" onClick={refetch}>{t('portal.common.retry', 'Try again')}</Button></div></Notice></div>}
        {!isLoading && !portalOff && !blockingError && children}
      </main>
      <nav className="p-mobile-nav" aria-label={t('portal.shell.menu', 'Menu')}><div className={shown.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}>{links}</div></nav>
    </div>
  )
}
