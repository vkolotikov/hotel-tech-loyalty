import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus, Search, Settings2, TrendingUp, Users, Wallet } from 'lucide-react'
import { WorkspaceShell, type WorkspaceNavItem } from '../workspace/WorkspaceShell'
import { firstLetter } from '../workspace/lib/firstLetter'
import { useMedia } from '../workspace/lib/useMedia'
import { accentTokens } from '../workspace/theme/accent'
import { Button } from '../workspace/ui/Button'
import { Notice } from '../workspace/ui/Notice'
import { useAppointments } from './AppointmentsProvider'
import { FindDialog } from './find/FindDialog'
import { findActions, type FindTarget } from './find/findResults'
import { failureOf } from './lib/api'
import { APP_NAME } from './lib/constants'
import { fullAdminPathFor } from './lib/landing'
import { loadBrand, rememberBrand, useLook } from './lib/look'
import { onShortcuts } from './lib/shortcuts'
import { useAppointmentsOnly } from './lib/useAppointmentsOnly'
import { useVocab } from './lib/vocab'
import { ChecklistBanner } from './setup/Checklist'
import { AppointmentsShortcuts } from './ui/AppointmentsShortcuts'

/**
 * The Appointments workspace on the shared frame (WorkspaceShell): its daily
 * areas in the side panel, with the organisation's brand colour as the
 * accent; in the top bar the organisation, Find (clients, appointments and
 * actions in one box) and New appointment; and the notices that explain why
 * something is not available. Nothing here links into the full admin except
 * the frame's one "Full admin" entry, and not even that on the Appointments
 * plan, which has no full admin.
 */
export function AppointmentsShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
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

  const nav: WorkspaceNavItem[] = [
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

  return (
    <WorkspaceShell workspace="appointments" look={look} accent={accent} initial={initial}
      organization={data?.organization.name} product={data?.name ?? APP_NAME} person={data?.staff.name}
      nav={nav}
      // "Full admin" opens the same tool there (the calendar, the client list); anything else, the dashboard. None on the Appointments plan.
      fullAdmin={appointmentsOnly ? null : fullAdminPathFor(pathname)}
      header={<>
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
      </>}
      overlays={<>
        {ready && <FindDialog open={findOpen} onClose={() => setFindOpen(false)} onRun={runFind} actions={findList} fallbackFocus={[findButton, main]} />}
        {ready && <AppointmentsShortcuts open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} fallbackFocus={[findButton, main]} />}
      </>}>
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
    </WorkspaceShell>
  )
}
