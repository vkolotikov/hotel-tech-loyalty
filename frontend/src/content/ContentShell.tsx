import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Compass, FileText, Fingerprint, Lightbulb, Plus, Search } from 'lucide-react'
import { WorkspaceShell, type WorkspaceNavItem } from '../workspace/WorkspaceShell'
import type { FindTarget } from '../workspace/find/findCore'
import { firstLetter } from '../workspace/lib/firstLetter'
import { useMedia } from '../workspace/lib/useMedia'
import { accentTokens } from '../workspace/theme/accent'
import { Button } from '../workspace/ui/Button'
import { Notice } from '../workspace/ui/Notice'
import { useContent } from './ContentProvider'
import { ContentFind } from './find/ContentFind'
import { CaptureDialog } from './ideas/CaptureDialog'
import { findActions, postOf } from './find/findItems'
import { failureOf } from './lib/api'
import { APP_NAME } from './lib/constants'
import { fullAdminPath } from './lib/links'
import { loadBrandPaint, rememberBrandPaint, useLook } from './lib/look'
import { onShortcuts } from './lib/shortcuts'
import { usePanel } from './panel/PanelProvider'
import { PanelFailed } from './panel/PanelFailed'
import { PostPanel } from './panel/PostPanel'
import { ContentErrorBoundary } from './ui/ContentErrorBoundary'
import { ContentShortcuts } from './ui/ContentShortcuts'

/**
 * HexaTech Content on the shared frame (WorkspaceShell): its areas in the
 * side panel, the organisation's brand colour as the accent; in the top bar
 * the organisation and the brand (a switcher when the person may use more
 * than one), Find and New post; and the notices that explain why something
 * is not available. "Full admin" opens the Marketing hub for managers and
 * the dashboard for staff.
 */
export function ContentShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { data, isLoading, isError, error, refetch, switchBrand } = useContent()
  const panel = usePanel()
  const navigate = useNavigate()
  // The side panel, and with it "collapse the menu", exists from 1024 px (lg).
  const wide = useMedia('(min-width: 1024px)')
  const [findOpen, setFindOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // The capture box (I, or Find's "Add an idea": spec 2026-10-16 §4.3).
  const [capturing, setCapturing] = useState(false)
  const main = useRef<HTMLElement>(null)
  const findButton = useRef<HTMLButtonElement>(null)
  const arrived = useRef(false)

  // The link that led to a page is gone with the page it was on: the keyboard starts again from the page, not the top.
  useEffect(() => {
    if (!arrived.current) { arrived.current = true; return }
    if (document.activeElement === document.body) main.current?.focus()
  }, [pathname])

  // While the bootstrap loads, the frame wears the accent and mark this device last saw (lib/look.ts).
  const look = useLook()
  const [remembered] = useState(loadBrandPaint)
  const accent = accentTokens(data ? data.accent : remembered?.accent, look.resolved)
  const initial = data ? firstLetter(data.organization.name, 'H') : (remembered?.initial ?? 'H')
  const known = Boolean(data)
  const brandHex = accent.accent
  useEffect(() => { if (known) rememberBrandPaint({ accent: brandHex, initial }) }, [known, brandHex, initial])

  const refusal = isError ? failureOf(error).code : ''
  const switchedOff = refusal === 'workspace_disabled'
  const lapsed = refusal === 'subscription_required'
  const stopped = switchedOff || lapsed
  // Find, the shortcuts and the panel need the workspace: not while it loads, and not once it has stopped.
  const ready = Boolean(data) && !stopped
  if (findOpen && !ready) setFindOpen(false)
  if (helpOpen && !ready) setHelpOpen(false)
  if (capturing && !ready) setCapturing(false)
  const today = data?.venue.today ?? null
  const { openNew, close, open: openPost } = panel

  // Shortcuts for every page (spec §4.7): Find, the list of shortcuts, a new post. The Plan hears its own.
  useEffect(() => {
    if (!ready || today === null) return
    return onShortcuts(window, document, (hit, e) => {
      if (hit === 'find') setFindOpen(true)
      else if (hit === 'help') setHelpOpen(true)
      else if (hit === 'new') openNew({ date: today, platform: null })
      else if (hit === 'idea') setCapturing(true)
      else return
      e.preventDefault()
    })
  }, [ready, today, openNew])

  const nav: WorkspaceNavItem[] = [
    { to: '/content', end: true, icon: CalendarDays, label: t('content.nav.plan', 'Plan') },
    { to: '/content/ideas', end: false, icon: Lightbulb, label: t('content.nav.ideas', 'Ideas') },
    { to: '/content/posts', end: false, icon: FileText, label: t('content.nav.posts', 'Posts') },
    { to: '/content/strategy', end: false, icon: Compass, label: t('content.nav.strategy', 'Strategy') },
    { to: '/content/brand', end: false, icon: Fingerprint, label: t('content.nav.brand', 'Brand') },
  ]
  const findLabel = t('content.shell.find', 'Find a post or action')
  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl'
  const canManage = Boolean(data?.staff.can_manage)
  const setUp = data?.profile?.setup_completed === true
  // Another brand drops the open post: the panel asks first (spec §6.7).
  const chooseBrand = (id: number) => { if (data && id > 0 && id !== data.brand?.id && close()) switchBrand(id) }

  // Find: what it offers (the pages this person sees above), and what each choice does.
  const slim = look.rail === 'slim'
  const findList = findActions({
    nav, dark: look.resolved === 'dark', wide, slim,
    words: {
      newPost: t('content.shell.new_post', 'New post'),
      newIdea: t('content.find.new_idea', 'Add an idea'),
      goTo: t('content.find.go_to', 'Go to'),
      toDark: t('content.find.theme_dark', 'Switch to dark'),
      toLight: t('content.find.theme_light', 'Switch to light'),
      collapse: t('content.find.collapse', 'Collapse menu'),
      expand: t('content.find.expand', 'Expand menu'),
      shortcuts: t('content.find.shortcuts', 'Keyboard shortcuts'),
    },
  })
  const runFind = (target: FindTarget) => {
    const post = postOf(target)
    if (post !== null) openPost(post)
    else if ('to' in target) navigate(target.to)
    else if (target.run === 'new' && today !== null) openNew({ date: today, platform: null })
    else if (target.run === 'theme') look.setTheme(look.resolved === 'dark' ? 'light' : 'dark')
    else if (target.run === 'rail') look.setRail(slim ? 'full' : 'slim')
    else if (target.run === 'shortcuts') setHelpOpen(true)
    else if (target.run === 'idea') setCapturing(true)
  }

  return (
    <WorkspaceShell workspace="content" look={look} accent={accent} initial={initial}
      organization={data?.organization.name} product={data?.name ?? APP_NAME} person={data?.staff.name}
      nav={nav}
      fullAdmin={fullAdminPath(canManage)}
      onLeave={panel.guard}
      header={<>
        {/* On a phone the brand takes the free room and shrinks with it: a long name is cut, never under the buttons. */}
        <div className="min-w-0 flex-1 sm:flex-initial">
          <div className="hidden truncate text-sm font-semibold md:block">{data?.organization.name}</div>
          {data && data.brands.length > 1 ? (
            <label data-brand-switcher="" className="block">
              <span className="sr-only">{t('content.shell.brand', 'Brand')}</span>
              <select value={data.brand?.id ?? ''} onChange={(e) => chooseBrand(Number(e.target.value))}
                className="w-full max-w-[12rem] truncate rounded-md border border-a-border bg-a-surface px-1.5 py-0.5 text-xs text-a-text">
                {data.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          ) : data?.brand && data.brand.name !== data.organization.name && (
            <div className="hidden truncate text-xs text-a-text-2 md:block">{data.brand.name}</div>
          )}
        </div>
        <button ref={findButton} type="button" onClick={() => { if (ready) setFindOpen(true) }} disabled={!ready} aria-label={findLabel} aria-keyshortcuts={modKey === '⌘' ? 'Meta+K' : 'Control+K'} aria-haspopup="dialog"
          className="flex min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-a-border bg-a-surface p-2 text-left text-sm text-a-text-2 shadow-a-sm enabled:hover:border-a-text-2/40 disabled:opacity-60 sm:max-w-md sm:flex-1 sm:shrink sm:justify-start sm:px-3 lg:ml-4">
          <Search size={15} aria-hidden className="shrink-0" />
          <span className="hidden min-w-0 truncate sm:inline">{findLabel}</span>
          <kbd aria-hidden="true" className="ml-auto hidden shrink-0 rounded-md border border-a-border px-1.5 font-a-mono text-xs sm:inline">{modKey} K</kbd>
        </button>
        <button type="button" onClick={() => { if (today !== null) openNew({ date: today, platform: null }) }} disabled={!ready}
          aria-label={t('content.shell.new_post', 'New post')}
          className="ml-auto inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-a-accent px-3 py-2 text-sm font-semibold text-a-accent-ink shadow-a-sm transition hover:bg-a-accent-deep disabled:opacity-60 sm:px-4 [@media(hover:hover)]:hover:-translate-y-px">
          <Plus size={16} aria-hidden /><span className="hidden sm:inline">{t('content.shell.new_post', 'New post')}</span>
        </button>
      </>}
      overlays={ready ? <>
        {/* The panel has its own boundary, keyed by its opening: a post that breaks says so in the panel's place. */}
        <ContentErrorBoundary key={panel.target?.seq ?? 0}
          message={t('content.panel.failed', 'This post could not be shown. What you saved is safe.')}
          reload={t('content.common.reload', 'Reload the page')} fallback={<PanelFailed />}>
          <PostPanel />
        </ContentErrorBoundary>
        <ContentFind open={findOpen} onClose={() => setFindOpen(false)} onRun={runFind} actions={findList} fallbackFocus={[findButton, main]} />
        <ContentShortcuts open={helpOpen} onClose={() => setHelpOpen(false)} modKey={modKey} fallbackFocus={[findButton, main]} />
        {capturing && <CaptureDialog onClose={() => setCapturing(false)} />}
      </> : null}>
      {stopped && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="warning">
            {lapsed
              ? t('content.shell.subscription_required', "Your organisation's subscription is not active, so HexaTech Content cannot open. Your posts are unchanged. An administrator can restore access under Billing in the full admin.")
              : t('content.shell.switched_off', 'HexaTech Content has been switched off for your organisation. Your posts are unchanged.')}
          </Notice>
          <Link to="/" className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
            {t('content.shell.open_full_admin', 'Open the full admin')}
          </Link>
        </div>
      )}

      {!stopped && isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('content.common.loading', 'Loading…')}</p>}

      {!stopped && isError && !data && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={refetch}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}

      {!stopped && data && (
        <>
          {(data.ai.status === 'warn' || data.ai.status === 'over' || !setUp) && (
            <div className="space-y-2 px-4 pt-3 lg:px-6">
              {data.ai.status === 'warn' && (
                <Notice tone="warning">{t('content.shell.budget_warn', "This month's AI budget is {{percent}} % used.", { percent: data.ai.percent ?? 80 })}</Notice>
              )}
              {data.ai.status === 'over' && (
                <Notice tone="danger">{t('content.shell.budget_over', "This month's AI budget is used up. AI actions are paused until next month; writing by hand still works.")}</Notice>
              )}
              {!setUp && (
                <Notice tone="info">
                  {canManage
                    ? t('content.shell.not_set_up_manager', 'This brand is not set up yet, so the AI does not know its voice and channels.')
                    : t('content.shell.not_set_up_staff', 'Your manager has not set up this brand yet.')}
                </Notice>
              )}
            </div>
          )}
          <main ref={main} tabIndex={-1} className="min-h-0 flex-1">
            <ContentErrorBoundary key={pathname}
              message={t('content.common.page_failed', 'This page could not be shown. What you saved is safe.')}
              reload={t('content.common.reload', 'Reload the page')}>
              {children}
            </ContentErrorBoundary>
          </main>
        </>
      )}
    </WorkspaceShell>
  )
}
