import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, LayoutGrid, LogOut, Menu, Plus, Search, Users } from 'lucide-react'
import { logoutAndRedirect } from '../lib/logout'
import { SUPPORTED_LANGUAGES } from '../i18n'
import { useAppointments } from './AppointmentsProvider'
import { failureOf } from './lib/api'
import { useVocab } from './lib/vocab'
import { Button } from './ui/Button'
import { Notice } from './ui/Notice'

/**
 * The workspace's frame: a calm dark rail with the two daily areas, a top
 * bar with the organisation, client search and New appointment, and the
 * notices that explain why something is not available. Nothing here links
 * into the full admin except the one "Full admin" entry in the secondary
 * area.
 */
export function AppointmentsShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const vocab = useVocab()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data, isLoading, isError, error, refetch } = useAppointments()
  const [search, setSearch] = useState('')
  const main = useRef<HTMLElement>(null)
  const arrived = useRef(false)

  // The link that led to a page is gone with the page it was on. Without
  // this the keyboard would start again from the top of the document.
  useEffect(() => {
    if (!arrived.current) { arrived.current = true; return }
    if (document.activeElement === document.body) main.current?.focus()
  }, [pathname])

  const refusal = isError ? failureOf(error).code : ''
  const switchedOff = refusal === 'workspace_disabled'
  // The organisation's subscription is not active: nothing here can load, before or after the page was open.
  const lapsed = refusal === 'subscription_required'
  const stopped = switchedOff || lapsed
  // An organisation that never had the workspace: the route is not for them.
  if (switchedOff && !data) return <Navigate to="/" replace />

  const nav = [
    { to: '/appointments', end: true, icon: CalendarDays, label: t('appointments.nav.calendar', 'Calendar') },
    { to: '/appointments/clients', end: false, icon: Users, label: vocab('clients') },
  ]

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    const term = search.trim()
    if (term.length >= 2) navigate(`/appointments/clients?search=${encodeURIComponent(term)}`)
  }

  const signOut = () => { void logoutAndRedirect('/login') }
  const language = (className: string) => (
    <label className="block">
      <span className="sr-only">{t('appointments.shell.language', 'Language')}</span>
      <select value={i18n.language?.slice(0, 2)} onChange={(e) => { void i18n.changeLanguage(e.target.value) }} className={className}>
        {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  )

  return (
    <div data-appointments="" className="min-h-screen flex bg-a-canvas text-a-text">
      <aside data-rail="" className="hidden lg:flex w-56 shrink-0 flex-col bg-a-side text-a-side-text" aria-label={t('appointments.shell.menu', 'Menu')}>
        <div className="px-5 py-5">
          <div className="text-base font-semibold leading-tight">{data?.name ?? 'HexaTech Appointments'}</div>
          <div className="text-xs text-a-side-text-2 mt-0.5 truncate">{data?.organization.name}</div>
        </div>
        <nav className="px-3 space-y-1">
          {nav.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-a-side-2 text-a-side-text' : 'text-a-side-text-2 hover:text-a-side-text'}`}>
              <Icon size={18} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-3 pb-4 pt-4 border-t border-a-side-2 space-y-1">
          <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-a-side-text-2 hover:text-a-side-text">
            <LayoutGrid size={16} aria-hidden /> {t('appointments.shell.full_admin', 'Full admin')}
          </Link>
          <div className="px-3 py-2">
            {language('w-full rounded-md bg-a-side-2 text-a-side-text text-sm px-2 py-1.5 border border-a-side-2')}
          </div>
          <div className="px-3 pt-2 text-xs text-a-side-text-2 break-words">{data?.staff.name}</div>
          <button type="button" onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-a-side-text-2 hover:text-a-side-text">
            <LogOut size={16} aria-hidden /> {t('appointments.shell.sign_out', 'Sign out')}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 bg-a-surface border-b border-a-border">
          <nav className="flex lg:hidden items-center gap-1" aria-label={t('appointments.shell.menu', 'Menu')}>
            {nav.map(({ to, end, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={end} aria-label={label}
                className={({ isActive }) => `rounded-lg p-2 ${isActive ? 'bg-a-surface-2 text-a-text' : 'text-a-text-2'}`}>
                <Icon size={18} aria-hidden />
              </NavLink>
            ))}
          </nav>
          <div className="hidden md:block min-w-0">
            <div className="text-sm font-semibold truncate">{data?.organization.name}</div>
            {data?.brand && data.brand.name !== data.organization.name && <div className="text-xs text-a-text-2 truncate">{data.brand.name}</div>}
          </div>
          <form role="search" onSubmit={onSearch} className="flex-1 max-w-md lg:ml-4">
            <label className="relative block">
              <span className="sr-only">{t('appointments.shell.search', 'Search clients')}</span>
              <Search size={15} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-a-text-2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('appointments.shell.search', 'Search clients')}
                className="w-full rounded-lg bg-a-surface-2 border border-a-border pl-9 pr-3 py-2 text-sm text-a-text placeholder:text-a-text-2" />
            </label>
          </form>
          <Link to="/appointments?new=1"
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-a-accent text-a-accent-ink hover:bg-a-accent-deep px-3.5 py-2 text-sm font-semibold whitespace-nowrap">
            <Plus size={16} aria-hidden /> {t('appointments.shell.new_appointment', 'New appointment')}
          </Link>
          {/* Below the width of the rail, what the rail's secondary area holds lives here. */}
          <details className="relative lg:hidden">
            <summary className="list-none cursor-pointer rounded-lg p-2 text-a-text-2 hover:text-a-text [&::-webkit-details-marker]:hidden" aria-label={t('appointments.shell.menu', 'Menu')}>
              <Menu size={18} aria-hidden />
            </summary>
            <div className="absolute right-0 top-full z-40 mt-2 w-56 space-y-1 rounded-lg border border-a-border bg-a-surface p-2 shadow-lg">
              <div className="px-2 py-1 text-xs text-a-text-2 break-words">{data?.staff.name}</div>
              <Link to="/" className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-a-text hover:bg-a-surface-2">
                <LayoutGrid size={16} aria-hidden /> {t('appointments.shell.full_admin', 'Full admin')}
              </Link>
              <div className="px-2 py-1">
                {language('w-full rounded-md border border-a-border bg-a-surface px-2 py-1.5 text-sm text-a-text')}
              </div>
              <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-a-text hover:bg-a-surface-2">
                <LogOut size={16} aria-hidden /> {t('appointments.shell.sign_out', 'Sign out')}
              </button>
            </div>
          </details>
        </header>

        {stopped && (
          <div className="p-6 max-w-xl space-y-3">
            <Notice tone="warning">
              {lapsed
                ? t('appointments.shell.subscription_required', 'Your organisation\'s subscription is not active, so the workspace cannot open. Your bookings are unchanged. An administrator can restore access under Billing in the full admin.')
                : t('appointments.shell.switched_off', 'The appointments workspace has been switched off for your organisation. Your bookings are unchanged and remain in the full admin.')}
            </Notice>
            <Link to="/" className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
              {t('appointments.shell.open_full_admin', 'Open the full admin')}
            </Link>
          </div>
        )}

        {!stopped && isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}

        {!stopped && isError && !data && (
          <div className="p-6 max-w-xl space-y-3">
            <Notice tone="danger">{t('appointments.common.error', 'Something went wrong. Please try again.')}</Notice>
            <Button variant="secondary" onClick={refetch}>{t('appointments.common.retry', 'Try again')}</Button>
          </div>
        )}

        {!stopped && data && (
          <>
            {!data.venue.timezone_named && (
              <div className="px-4 pt-3">
                <Notice tone="warning">{t('appointments.shell.timezone_missing', 'The venue\'s time zone is not set, so "now" and "today" follow UTC. Set it in the full admin under Settings → General → Timezone (for example Europe/London).')}</Notice>
              </div>
            )}
            {!data.readiness.bookable && (
              <div className="px-4 pt-3">
                <Notice tone="info">{t('appointments.shell.not_bookable', 'Nothing can be booked yet: add a service, a team member who performs it, and their working hours in the full admin.')}</Notice>
              </div>
            )}
            <main ref={main} tabIndex={-1} className="flex-1 min-h-0">{children}</main>
          </>
        )}
      </div>
    </div>
  )
}
