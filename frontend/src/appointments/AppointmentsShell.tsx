import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Globe, LayoutGrid, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, TrendingUp, Users, Wallet } from 'lucide-react'
import { logoutAndRedirect } from '../lib/logout'
import { SUPPORTED_LANGUAGES } from '../i18n'
import { useAppointments } from './AppointmentsProvider'
import { failureOf } from './lib/api'
import { firstLetter } from './lib/firstLetter'
import { fullAdminPathFor } from './lib/landing'
import { markShell } from './lib/shellMark'
import { loadBrand, rememberBrand, useLook } from './lib/look'
import { onShortcuts } from './lib/shortcuts'
import { useAppointmentsOnly } from './lib/useAppointmentsOnly'
import { useMedia } from './lib/useMedia'
import { useVocab } from './lib/vocab'
import { FindDialog } from './find/FindDialog'
import { findActions, type FindTarget } from './find/findResults'
import { accentStyle, accentTokens } from './theme/accent'
import { Button } from './ui/Button'
import { Notice } from './ui/Notice'
import { ShortcutsSheet } from './ui/ShortcutsSheet'
import { ThemeSwitch } from './ui/ThemeSwitch'
import { ChecklistBanner } from './setup/Checklist'

/**
 * The workspace's frame: an ink side panel that collapses to icons, with the
 * daily areas, the Light/Dark/Auto switch and the organisation's brand colour
 * as the accent; a top bar with the organisation, Find (clients, appointments
 * and actions in one box) and New appointment; and the notices that explain
 * why something is not available.
 * Nothing here links into the full admin except the one "Full admin" entry in
 * the secondary area, and not even that on the Appointments plan, which has no
 * full admin.
 */
export function AppointmentsShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const vocab = useVocab()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data, isLoading, isError, error, refetch } = useAppointments()
  const appointmentsOnly = useAppointmentsOnly()
  const [findOpen, setFindOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // The side panel, and with it "collapse the menu", exists from 1024 px (lg).
  const wide = useMedia('(min-width: 1024px)')
  const main = useRef<HTMLElement>(null)
  const findButton = useRef<HTMLButtonElement>(null)
  const arrived = useRef(false)

  // The link that led to a page is gone with the page it was on. Without
  // this the keyboard would start again from the top of the document.
  useEffect(() => {
    if (!arrived.current) { arrived.current = true; return }
    if (document.activeElement === document.body) main.current?.focus()
  }, [pathname])

  // Hooks stay above the early return below so their order never changes.
  // <html data-shell="appointments"> keeps the full admin's Branding mood typography out, from the first paint.
  useLayoutEffect(() => markShell(document.documentElement), [])
  const look = useLook()
  const slim = look.rail === 'slim'
  // While the bootstrap loads, the frame wears the accent and mark this device last saw (lib/look.ts) rather than the fallback blue and an H.
  const [remembered] = useState(loadBrand)
  const accent = accentTokens(data ? data.accent : remembered?.accent, look.resolved)
  const initial = data ? firstLetter(data.organization.name, 'H') : (remembered?.initial ?? 'H')
  const known = Boolean(data)
  const brandHex = accent.accent
  useEffect(() => { if (known) rememberBrand({ accent: brandHex, initial }) }, [known, brandHex, initial])

  const refusal = isError ? failureOf(error).code : ''
  const switchedOff = refusal === 'workspace_disabled'
  // The organisation's subscription is not active: nothing here can load, before or after the page was open.
  const lapsed = refusal === 'subscription_required'
  const stopped = switchedOff || lapsed
  // Find needs the workspace: not while it loads, and not once it has stopped. A box left open by a stop closes.
  const ready = Boolean(data) && !stopped
  if (findOpen && !ready) setFindOpen(false)
  if (helpOpen && !ready) setHelpOpen(false)

  // Shortcuts (spec §5.2) that belong to every page: Find, the list of shortcuts, a new appointment. The ones for the calendar
  // (today, the days, the views) are heard by the calendar page itself. None of them act while the workspace loads or has stopped.
  useEffect(() => {
    if (!ready) return
    return onShortcuts(window, document, (hit, e) => {
      if (hit === 'find') setFindOpen(true)
      else if (hit === 'help') setHelpOpen(true)
      else if (hit === 'new') navigate('/appointments?new=1')
      else return
      e.preventDefault()
    })
  }, [ready, navigate])

  // An organisation that never had the workspace: the route is not for them.
  if (switchedOff && !data) return <Navigate to="/" replace />

  const nav = [
    { to: '/appointments', end: true, icon: CalendarDays, label: t('appointments.nav.calendar', 'Calendar') },
    { to: '/appointments/clients', end: false, icon: Users, label: vocab('clients') },
    ...(data?.staff.can_manage ? [
      { to: '/appointments/takings', end: false, icon: Wallet, label: t('appointments.nav.takings', 'Takings') },
      { to: '/appointments/insights', end: false, icon: TrendingUp, label: t('appointments.nav.insights', 'Insights') },
    ] : []),
    { to: '/appointments/setup', end: false, icon: Settings2, label: t('appointments.nav.setup', 'Setup') },
  ]

  // Find: what it can do (the pages are the ones this person sees above), and what each choice does.
  const findLabel = t('appointments.find.open', 'Find a client, appointment or action')
  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl'
  const findList = findActions({
    nav, canManage: Boolean(data?.staff.can_manage), wide, dark: look.resolved === 'dark', slim,
    words: {
      newAppointment: t('appointments.shell.new_appointment', 'New appointment'),
      goTo: t('appointments.find.go_to', 'Go to'),
      timeOff: t('appointments.find.time_off', 'Time off'),
      toDark: t('appointments.find.theme_dark', 'Switch to dark'),
      toLight: t('appointments.find.theme_light', 'Switch to light'),
      collapse: t('appointments.shell.collapse', 'Collapse menu'),
      expand: t('appointments.shell.expand', 'Expand menu'),
      shortcuts: t('appointments.find.shortcuts', 'Keyboard shortcuts'),
    },
  })
  const runFind = (target: FindTarget) => {
    if ('to' in target) navigate(target.to)
    else if (target.run === 'theme') look.setTheme(look.resolved === 'dark' ? 'light' : 'dark')
    else if (target.run === 'rail') look.setRail(slim ? 'full' : 'slim')
    else if (target.run === 'shortcuts') setHelpOpen(true)
  }

  // "Full admin" opens the same tool there (the calendar, the client list); anything else, the dashboard.
  const fullAdmin = fullAdminPathFor(pathname)
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
    <div data-appointments="" data-theme={look.resolved} data-accent-edge={accent.edge ? '' : undefined}
      style={accentStyle(accent) as CSSProperties} className="min-h-screen flex bg-a-canvas text-a-text">
      <aside data-rail="" data-rail-size={look.rail} aria-label={t('appointments.shell.menu', 'Menu')}
        className={`hidden lg:flex ${slim ? 'w-[76px]' : 'w-64'} shrink-0 flex-col gap-6 bg-a-side px-3 py-5 text-a-side-text transition-[width] duration-300 ease-out`}>
        <div className={`flex min-h-11 items-center gap-3 ${slim ? 'justify-center' : 'px-2'}`}>
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-a-accent font-a-display text-lg font-semibold text-a-accent-ink">{initial}</span>
          <div className={slim ? 'sr-only' : 'min-w-0'}>
            <div className="truncate text-[15px] font-semibold leading-tight">{data?.organization.name}</div>
            <div className="truncate text-xs text-a-side-text-2">{data?.name ?? 'HexaTech Appointments'}</div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} data-tip={slim ? label : undefined}
              className={({ isActive }) => `relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${slim ? 'justify-center' : ''} ${isActive ? 'bg-a-side-2 text-a-side-text' : 'text-a-side-text-2 hover:bg-a-side-2/60 hover:text-a-side-text'}`}>
              {({ isActive }) => (
                <>
                  <Icon size={18} aria-hidden className="shrink-0" />
                  <span className={slim ? 'sr-only' : 'truncate'}>{label}</span>
                  {isActive && !slim && <span aria-hidden className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-a-accent-rail" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-a-side-2 pt-4">
          <ThemeSwitch value={look.theme} onChange={look.setTheme} vertical={slim} />
          {!appointmentsOnly && (
            <Link to={fullAdmin} data-tip={slim ? t('appointments.shell.full_admin', 'Full admin') : undefined}
              className={`relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text ${slim ? 'justify-center' : ''}`}>
              <LayoutGrid size={16} aria-hidden className="shrink-0" /><span className={slim ? 'sr-only' : ''}>{t('appointments.shell.full_admin', 'Full admin')}</span>
            </Link>
          )}
          {!slim && <div className="px-1">{language('w-full rounded-lg bg-a-side-2 text-a-side-text text-sm px-2 py-1.5 border border-a-side-2')}</div>}
          {/* Slim: a globe with the real picker laid over it, transparent. The select keeps its "Language" name and opens on click and on the keyboard; its own focus ring is invisible at zero opacity, so the wrapper draws one. The opened list is drawn from the select's own colours, not the wrapper's, hence the explicit bg and text. */}
          {slim && (
            <div data-tip={t('appointments.shell.language', 'Language')}
              className="relative flex min-h-10 items-center justify-center rounded-xl text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-a-side-text">
              <Globe size={16} aria-hidden />
              {language('absolute inset-0 h-full w-full cursor-pointer opacity-0 bg-a-side-2 text-a-side-text')}
            </div>
          )}
          <div className={`flex items-center gap-2 px-1 ${slim ? 'justify-center' : ''}`}>
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-a-side-2 text-xs font-semibold">{firstLetter(data?.staff.name, '')}</span>
            <span className={slim ? 'sr-only' : 'min-w-0 flex-1 truncate text-xs text-a-side-text-2'}>{data?.staff.name}</span>
            {!slim && (
              <button type="button" onClick={signOut} className="rounded-lg p-2 text-a-side-text-2 hover:text-a-side-text" aria-label={t('appointments.shell.sign_out', 'Sign out')}>
                <LogOut size={16} aria-hidden />
              </button>
            )}
          </div>
          {slim && (
            <button type="button" onClick={signOut} data-tip={t('appointments.shell.sign_out', 'Sign out')}
              className="relative flex min-h-10 w-full items-center justify-center rounded-xl text-a-side-text-2 hover:bg-a-side-2/60 hover:text-a-side-text">
              <LogOut size={16} aria-hidden /><span className="sr-only">{t('appointments.shell.sign_out', 'Sign out')}</span>
            </button>
          )}
          <button type="button" onClick={() => look.setRail(slim ? 'full' : 'slim')} aria-expanded={!slim}
            data-tip={slim ? t('appointments.shell.expand', 'Expand menu') : undefined}
            className={`relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text ${slim ? 'justify-center' : ''}`}>
            {slim ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
            <span className={slim ? 'sr-only' : ''}>{slim ? t('appointments.shell.expand', 'Expand menu') : t('appointments.shell.collapse', 'Collapse menu')}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 lg:px-6 bg-a-canvas border-b border-a-border">
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
          {/* Find opens the one box for clients, appointments and actions. On a phone it keeps only its icon (and its name, for a screen reader). */}
          <button ref={findButton} type="button" onClick={() => { if (ready) setFindOpen(true) }} disabled={!ready} aria-label={findLabel} aria-haspopup="dialog"
            className="flex min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-a-border bg-a-surface p-2 text-left text-sm text-a-text-2 shadow-a-sm enabled:hover:border-a-text-2/40 disabled:opacity-60 sm:max-w-md sm:flex-1 sm:shrink sm:justify-start sm:px-3 lg:ml-4">
            <Search size={15} aria-hidden className="shrink-0" />
            <span className="hidden sm:inline min-w-0 truncate">{findLabel}</span>
            <kbd className="ml-auto hidden sm:inline shrink-0 rounded-md border border-a-border px-1.5 font-a-mono text-xs">{modKey} K</kbd>
          </button>
          {/* On a phone the header holds three areas, Find and the menu: the button keeps only its icon. */}
          <Link to="/appointments?new=1" aria-label={t('appointments.shell.new_appointment', 'New appointment')}
            className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full bg-a-accent px-3 sm:px-4 py-2 text-sm font-semibold text-a-accent-ink shadow-a-sm transition hover:bg-a-accent-deep [@media(hover:hover)]:hover:-translate-y-px whitespace-nowrap">
            <Plus size={16} aria-hidden /><span className="hidden sm:inline">{t('appointments.shell.new_appointment', 'New appointment')}</span>
          </Link>
          {/* Below the width of the rail, what the rail's secondary area holds lives here. */}
          <details className="relative lg:hidden">
            <summary className="list-none cursor-pointer rounded-lg p-2 text-a-text-2 hover:text-a-text [&::-webkit-details-marker]:hidden" aria-label={t('appointments.shell.menu', 'Menu')}>
              <Menu size={18} aria-hidden />
            </summary>
            <div className="absolute right-0 top-full z-40 mt-2 w-56 animate-a-pop space-y-1 rounded-lg border border-a-border bg-a-surface p-2 shadow-lg">
              <div className="px-2 py-1 text-xs text-a-text-2 break-words">{data?.staff.name}</div>
              <div className="px-1 pb-1"><ThemeSwitch value={look.theme} onChange={look.setTheme} tone="surface" /></div>
              {!appointmentsOnly && (
                <Link to={fullAdmin} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-a-text hover:bg-a-surface-2">
                  <LayoutGrid size={16} aria-hidden /> {t('appointments.shell.full_admin', 'Full admin')}
                </Link>
              )}
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
                ? (appointmentsOnly
                  ? t('appointments.shell.subscription_required_plan', 'Your organisation\'s subscription is not active, so the workspace cannot open. Your bookings are unchanged. Contact HexaTech to restore it.')
                  : t('appointments.shell.subscription_required', 'Your organisation\'s subscription is not active, so the workspace cannot open. Your bookings are unchanged. An administrator can restore access under Billing in the full admin.'))
                : t('appointments.shell.switched_off', 'The appointments workspace has been switched off for your organisation. Your bookings are unchanged and remain in the full admin.')}
            </Notice>
            {!appointmentsOnly && (
              <Link to="/" className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
                {t('appointments.shell.open_full_admin', 'Open the full admin')}
              </Link>
            )}
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
            {!data.readiness.checklist.complete && !pathname.startsWith('/appointments/setup') && (
              <div className="px-4 pt-3">
                <ChecklistBanner checklist={data.readiness.checklist} />
              </div>
            )}
            <main ref={main} tabIndex={-1} className="flex-1 min-h-0">{children}</main>
          </>
        )}
      </div>

      {ready && <FindDialog open={findOpen} onClose={() => setFindOpen(false)} onRun={runFind} actions={findList} fallbackFocus={[findButton, main]} />}
      {ready && <ShortcutsSheet open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} fallbackFocus={[findButton, main]} />}
    </div>
  )
}
