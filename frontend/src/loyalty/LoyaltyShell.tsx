import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BarChart3, CalendarDays, CreditCard, Crown, Gift, Inbox, Mail, ScanLine, Search, Sparkles, Users } from 'lucide-react'
import { WorkspaceShell, type WorkspaceNavItem } from '../workspace/WorkspaceShell'
import type { FindTarget } from '../workspace/find/findCore'
import { firstLetter } from '../workspace/lib/firstLetter'
import { useMedia } from '../workspace/lib/useMedia'
import { FrameFooter, PhoneMenu } from '../workspace/shell/FrameFooter'
import { LOYALTY_SURFACES, accentTokens } from '../workspace/theme/accent'
import { Button } from '../workspace/ui/Button'
import { Notice } from '../workspace/ui/Notice'
import { PageBoundary } from '../workspace/ui/PageBoundary'
import { useLoyalty } from './LoyaltyProvider'
import { LoyaltyFind } from './find/LoyaltyFind'
import { findActions, runOf } from './find/findItems'
import { failureOf } from './lib/api'
import { APP_NAME, FULL_ADMIN } from './lib/links'
import { loadBrandPaint, rememberBrandPaint, useLook } from './lib/look'
import { onShortcuts } from './lib/shortcuts'
import { Crumb } from './shell/Crumb'
import { areaOf } from './shell/areaOf'
import { LoyaltyShortcuts } from './ui/LoyaltyShortcuts'

/**
 * HexaTech Loyalty on the shared frame (WorkspaceShell), in the cards look Content wears (spec 2026-10-21 §4): the
 * areas as cards — Requests with what waits —, Settings, Help & resources and the person at the foot; in the top bar
 * the organisation's breadcrumb and Find; and the notices that explain why something is not available.
 */
export function LoyaltyShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useLoyalty()
  // The side panel, and with it "collapse the menu", exists from 1024 px (lg).
  const wide = useMedia('(min-width: 1024px)')
  const [findOpen, setFindOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const main = useRef<HTMLElement>(null)
  const findButton = useRef<HTMLButtonElement>(null)
  const findPhone = useRef<HTMLButtonElement>(null)
  const arrived = useRef(false)

  // The link that led to a page is gone with the page it was on: the keyboard starts again from the page, not the top.
  useEffect(() => {
    if (!arrived.current) { arrived.current = true; return }
    if (document.activeElement === document.body) main.current?.focus()
  }, [pathname])

  // While the bootstrap loads, the frame wears the accent and mark this device last saw (lib/look.ts).
  const look = useLook()
  const [remembered] = useState(loadBrandPaint)
  const accent = accentTokens(data ? data.accent : remembered?.accent, look.resolved, LOYALTY_SURFACES[look.resolved])
  const initial = data ? firstLetter(data.organization.name, 'H') : (remembered?.initial ?? 'H')
  const known = Boolean(data)
  const brandHex = accent.accent
  useEffect(() => { if (known) rememberBrandPaint({ accent: brandHex, initial }) }, [known, brandHex, initial])

  const refusal = isError ? failureOf(error).code : ''
  const switchedOff = refusal === 'workspace_disabled'
  const lapsed = refusal === 'subscription_required'
  const stopped = switchedOff || lapsed
  // Find and the shortcuts need the workspace: not while it loads, and not once it has stopped.
  const ready = Boolean(data) && !stopped
  if (findOpen && !ready) setFindOpen(false)
  if (helpOpen && !ready) setHelpOpen(false)

  useEffect(() => {
    if (!ready) return
    return onShortcuts(window, document, (hit, e) => {
      if (hit === 'find') setFindOpen(true)
      else if (hit === 'help') setHelpOpen(true)
      else if (hit === 'scan') navigate('/loyalty/scan')
      else return
      e.preventDefault()
    })
  }, [ready, navigate])

  // The desk's areas (Members, Requests, Scan) stay in the phone's top bar; the others are in the phone menu (release 2
  // §3). Campaigns, Insights and Card & app are listed only for whoever may use them; the server decides either way.
  const can = data?.staff.can
  const nav: WorkspaceNavItem[] = [
    { to: '/loyalty', end: false, icon: Users, label: t('loyalty.nav.members', 'Members') },
    { to: '/loyalty/requests', end: false, icon: Inbox, label: t('loyalty.nav.requests', 'Requests'), count: data?.counts.requests_waiting },
    { to: '/loyalty/program', end: false, icon: Crown, label: t('loyalty.nav.program', 'Program'), phone: false },
    // Release 7: the ways to earn and reward the venue uses, and the setup wizard.
    { to: '/loyalty/options', end: false, icon: Sparkles, label: t('loyalty.nav.options', 'Ways to earn'), phone: false },
    { to: '/loyalty/rewards', end: false, icon: Gift, label: t('loyalty.nav.rewards', 'Rewards'), phone: false },
    { to: '/loyalty/events', end: false, icon: CalendarDays, label: t('loyalty.nav.events', 'Events'), phone: false },
    ...(can?.manage_campaigns ? [{ to: '/loyalty/campaigns', end: false, icon: Mail, label: t('loyalty.nav.campaigns', 'Campaigns'), phone: false }] : []),
    ...(can?.view_insights ? [{ to: '/loyalty/insights', end: false, icon: BarChart3, label: t('loyalty.nav.insights', 'Insights'), phone: false }] : []),
    { to: '/loyalty/scan', end: false, icon: ScanLine, label: t('loyalty.nav.scan', 'Scan') },
    ...(can?.manage_app ? [{ to: '/loyalty/app', end: false, icon: CreditCard, label: t('loyalty.nav.app', 'Card & app'), phone: false }] : []),
  ]
  // Members is current on /loyalty and on a member's page, not on the other areas' addresses under it.
  const area = areaOf(pathname)
  nav[0].end = area !== 'members'
  const pageName = area === 'guide' ? t('loyalty.guide.page.title', 'Guide') : area === 'start' ? t('loyalty.start.title', 'Get started') : nav.find(n => (area === 'members' ? n.to === '/loyalty' : n.to === `/loyalty/${area}`))?.label ?? ''
  const findLabel = t('loyalty.shell.find', 'Find a member or action')
  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl'
  const crumb = data ? <Crumb organization={data.organization.name} page={pageName} /> : null

  const slim = look.rail === 'slim'
  const foot = {
    look, fullAdmin: FULL_ADMIN, person: data?.staff.name, role: data?.staff.role ?? null, onLeave: () => true,
    onShortcuts: () => { if (ready) setHelpOpen(true) }, onFind: () => { if (ready) setFindOpen(true) },
    guide: { to: '/loyalty/guide', label: t('loyalty.guide.page.title', 'Guide') },
  }
  const findList = findActions({
    nav, dark: look.resolved === 'dark', wide, slim,
    words: {
      scan: t('loyalty.find.scan', 'Scan a card'),
      goTo: t('loyalty.find.go_to', 'Go to'),
      toDark: t('loyalty.find.theme_dark', 'Switch to dark'),
      toLight: t('loyalty.find.theme_light', 'Switch to light'),
      collapse: t('workspace.shell.collapse', 'Collapse menu'),
      expand: t('workspace.shell.expand', 'Expand menu'),
      shortcuts: t('workspace.shortcuts.title', 'Keyboard shortcuts'),
      guide: t('loyalty.guide.page.title', 'Guide'),
      start: t('loyalty.start.title', 'Get started'),
    },
  })
  const runFind = (target: FindTarget) => {
    const run = runOf(target)
    if (run === null && 'to' in target) navigate(target.to)
    else if (run === 'theme') look.setTheme(look.resolved === 'dark' ? 'light' : 'dark')
    else if (run === 'rail') look.setRail(slim ? 'full' : 'slim')
    else if (run === 'shortcuts') setHelpOpen(true)
  }

  return (
    <WorkspaceShell workspace="loyalty" look={look} accent={accent} initial={initial}
      organization={data?.organization.name} product={data?.name ?? APP_NAME} person={data?.staff.name}
      nav={nav}
      fullAdmin={FULL_ADMIN}
      variant="cards" railLabel={t('workspace.shell.workspace', 'Workspace')}
      footer={<FrameFooter {...foot} />}
      crumbs={crumb && <div className="hidden min-w-0 sm:flex">{crumb}</div>}
      phoneMenu={<PhoneMenu {...foot} />}
      header={<>
        <button ref={findButton} type="button" onClick={() => { if (ready) setFindOpen(true) }} disabled={!ready} aria-label={findLabel} aria-keyshortcuts={modKey === '⌘' ? 'Meta+K' : 'Control+K'} aria-haspopup="dialog"
          className="hidden min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-a-border bg-a-surface p-2 text-left text-sm text-a-text-2 shadow-a-sm enabled:hover:border-a-text-2/40 disabled:opacity-60 sm:ml-auto sm:flex sm:min-w-[10rem] sm:max-w-md sm:flex-1 sm:shrink sm:justify-start sm:px-3 lg:ml-4">
          <Search size={15} aria-hidden className="shrink-0" />
          <span className="hidden min-w-0 truncate sm:inline">{findLabel}</span>
          <kbd aria-hidden="true" className="ml-auto hidden shrink-0 rounded-md border border-a-border px-1.5 font-a-mono text-xs sm:inline">{modKey} K</kbd>
        </button>
        <div className="ml-auto sm:hidden" />
      </>}
      overlays={ready ? <>
        <LoyaltyFind open={findOpen} onClose={() => setFindOpen(false)} onRun={runFind} actions={findList} fallbackFocus={[findButton, findPhone, main]} />
        <LoyaltyShortcuts open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} fallbackFocus={[findButton, findPhone, main]} />
      </> : null}>
      {stopped && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="warning">
            {lapsed
              ? t('loyalty.shell.subscription_required', "Your organisation's subscription is not active, so HexaTech Loyalty cannot open. Your members and their points are unchanged. An administrator can restore access under Billing in the full admin.")
              : t('loyalty.shell.switched_off', 'HexaTech Loyalty has been switched off for your organisation. Your members and their points are unchanged.')}
          </Notice>
          <Link to="/" className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
            {t('loyalty.shell.open_full_admin', 'Open the full admin')}
          </Link>
        </div>
      )}

      {!stopped && isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('loyalty.common.loading', 'Loading…')}</p>}

      {!stopped && isError && !data && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="danger">{t('loyalty.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={refetch}>{t('loyalty.common.retry', 'Try again')}</Button>
        </div>
      )}

      {!stopped && data && (
        <>
          {/* On a phone the breadcrumb and Find have their own rows (the top bar holds the five area buttons and the menu). */}
          <div data-phone-crumb="" className="flex min-w-0 px-4 pt-3 sm:hidden">{crumb}</div>
          <div data-phone-row="" className="flex items-center gap-2 px-4 pt-3 sm:hidden">
            <button ref={findPhone} type="button" data-find-phone="" onClick={() => setFindOpen(true)} aria-haspopup="dialog"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-a-border bg-a-surface px-3 py-2 text-left text-sm text-a-text-2 shadow-a-sm">
              <Search size={15} aria-hidden className="shrink-0" /><span className="truncate">{findLabel}</span>
            </button>
          </div>
          {!data.programme.on && (
            <div className="px-4 pt-3 lg:px-6">
              <Notice tone="info">
                {data.staff.can.manage_program
                  ? t('loyalty.shell.programme_off_manager', 'The programme has no active tier yet, so members cannot see it in the app or the portal. Add or switch on a tier under Program.')
                  : t('loyalty.shell.programme_off_staff', 'The programme is not running yet: your manager has not set up its tiers.')}
              </Notice>
            </div>
          )}
          <main ref={main} tabIndex={-1} className="min-h-0 min-w-0 flex-1">
            <PageBoundary key={pathname}
              message={t('loyalty.common.page_failed', 'This page could not be shown. What you saved is safe.')}
              reload={t('loyalty.common.reload', 'Reload the page')}>
              {children}
            </PageBoundary>
          </main>
        </>
      )}
    </WorkspaceShell>
  )
}
