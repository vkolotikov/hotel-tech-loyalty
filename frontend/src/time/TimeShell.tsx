import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BarChart3, CalendarRange, Home, Inbox, Mic, Plus, Search, Settings2, Users, type LucideIcon } from 'lucide-react'
import { WorkspaceShell, type WorkspaceNavItem } from '../workspace/WorkspaceShell'
import type { FindTarget } from '../workspace/find/findCore'
import { firstLetter } from '../workspace/lib/firstLetter'
import { onShortcuts } from '../workspace/lib/shortcuts'
import { useModuleLinks } from '../workspace/lib/useModuleLinks'
import { FrameFooter, PhoneMenu } from '../workspace/shell/FrameFooter'
import { TIME_SURFACES, accentTokens } from '../workspace/theme/accent'
import { Button } from '../workspace/ui/Button'
import { Notice } from '../workspace/ui/Notice'
import { PageBoundary } from '../workspace/ui/PageBoundary'
import { ShortcutsSheet } from '../workspace/ui/ShortcutsSheet'
import { ActionPanels, useTimeActions } from './TimeActions'
import { useTime } from './TimeProvider'
import { TimeFind } from './find/TimeFind'
import { failureOf } from './lib/api'
import { APP_NAME, FULL_ADMIN } from './lib/links'
import { loadBrandPaint, rememberBrandPaint, useLook } from './lib/look'
import { AREAS, areaOf, countOf, type AreaGroup, type AreaKey } from './shell/nav'

const ICONS: Record<AreaKey, LucideIcon> = {
  today: Home,
  plan: CalendarRange,
  backlog: Inbox,
  team: Users,
  insights: BarChart3,
  settings: Settings2,
}

/** The default (English) name of each area, beside its key time.nav.<area>. */
const NAV_DEFAULTS: Record<AreaKey, string> = {
  today: 'My day', plan: 'Planner', backlog: 'Backlog & pool', team: 'Team & skills', insights: 'Insights', settings: 'Settings',
}

/** The groups' default (English) names, beside their keys time.nav.groups.<group>. */
const GROUP_DEFAULTS: Record<AreaGroup, string> = { planning: 'Planning', people: 'People', reports: 'Reports', setup: 'Set up' }

/**
 * HexaTech Time Planner on the shared frame (WorkspaceShell): the areas in their groups, Settings, Help and the person
 * at the foot; in the top bar the organisation's line, Find and the two ways to add work (a task, or AI from text or
 * voice); and the notices that explain why something is not available — switched off, a lapsed subscription, a plan
 * without the Planner, the month's AI allowance.
 */
export function TimeShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useTime()
  const { openTask, openCapture } = useTimeActions()
  const [findOpen, setFindOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const main = useRef<HTMLElement>(null)
  const findButton = useRef<HTMLButtonElement>(null)
  const findPhone = useRef<HTMLButtonElement>(null)
  const arrived = useRef(false)

  useEffect(() => {
    if (!arrived.current) { arrived.current = true; return }
    if (document.activeElement === document.body) main.current?.focus()
  }, [pathname])

  const look = useLook()
  const [remembered] = useState(loadBrandPaint)
  const accent = accentTokens(data ? data.accent : remembered?.accent, look.resolved, TIME_SURFACES[look.resolved])
  const initial = data ? firstLetter(data.organization.name, 'H') : (remembered?.initial ?? 'H')
  const known = Boolean(data)
  const brandHex = accent.accent
  useEffect(() => { if (known) rememberBrandPaint({ accent: brandHex, initial }) }, [known, brandHex, initial])

  const modules = useModuleLinks('time')
  // A new task from the frame starts as today's and mine; the panel's "No day yet" and "Who" change that.
  const today = data?.venue.today
  const myKey = data?.staff.key
  const mine = useMemo(() => ({ task_date: today ?? '', person: myKey ?? '' }), [today, myKey])
  const refusal = isError ? failureOf(error).code : ''
  const switchedOff = refusal === 'workspace_disabled'
  const lapsed = refusal === 'subscription_required'
  const notInPlan = refusal === 'not_in_plan'
  const locked = Boolean(data) && !data!.features.time_management
  const stopped = switchedOff || lapsed || notInPlan
  const ready = Boolean(data) && !stopped && !locked
  if (findOpen && !ready) setFindOpen(false)
  if (helpOpen && !ready) setHelpOpen(false)

  useEffect(() => {
    if (!ready) return
    return onShortcuts(window, document, { letters: { n: 'new', a: 'capture', p: 'plan', b: 'backlog' } }, (hit, e) => {
      if (hit === 'find') setFindOpen(true)
      else if (hit === 'help') setHelpOpen(true)
      else if (hit === 'new') openTask(null, mine)
      else if (hit === 'capture') openCapture()
      else if (hit === 'plan') navigate('/time/plan')
      else if (hit === 'backlog') navigate('/time/backlog')
      else return
      e.preventDefault()
    })
  }, [ready, navigate, openTask, openCapture, mine])

  const nav: WorkspaceNavItem[] = AREAS.map(area => ({
    to: area.to,
    end: area.end,
    icon: ICONS[area.key],
    label: t(`time.nav.${area.key}`, NAV_DEFAULTS[area.key]),
    count: countOf(area.key, data),
    phone: area.phone,
    section: area.group ? t(`time.nav.groups.${area.group}`, GROUP_DEFAULTS[area.group]) : undefined,
  }))
  const area = areaOf(pathname)
  const pageName = nav[AREAS.findIndex(a => a.key === area)]?.label ?? ''
  const findLabel = t('time.shell.find', 'Find a person or an action')
  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl'
  const fullAdmin = modules.onModules ? null : FULL_ADMIN
  const slim = look.rail === 'slim'

  const foot = {
    look, fullAdmin, moduleLinks: modules.links, person: data?.staff.name, role: data?.staff.role ?? null, onLeave: () => true,
    onShortcuts: () => { if (ready) setHelpOpen(true) }, onFind: () => { if (ready) setFindOpen(true) },
    settings: { to: '/time/settings', label: t('time.nav.settings', 'Settings') },
  }
  const runFind = (target: FindTarget) => {
    if ('to' in target) navigate(target.to)
    else if (target.run === 'theme') look.setTheme(look.resolved === 'dark' ? 'light' : 'dark')
    else if (target.run === 'rail') look.setRail(slim ? 'full' : 'slim')
    else if (target.run === 'shortcuts') setHelpOpen(true)
    else if (target.run === 'new-task') openTask(null, mine)
    else if (target.run === 'capture') openCapture()
  }
  const crumb = data ? (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="truncate text-a-text-2">{data.organization.name}</span>
      <span aria-hidden className="text-a-text-2">/</span>
      <span className="truncate font-medium text-a-text">{pageName}</span>
    </div>
  ) : null

  return (
    <WorkspaceShell workspace="time" look={look} accent={accent} initial={initial}
      organization={data?.organization.name} product={data?.name ?? APP_NAME} person={data?.staff.name}
      nav={nav} fullAdmin={fullAdmin} moduleLinks={modules.links}
      footer={<FrameFooter {...foot} />}
      phoneMenu={<PhoneMenu {...foot} />}
      crumbs={crumb && <div className="hidden min-w-0 sm:flex">{crumb}</div>}
      header={<>
        <button ref={findButton} type="button" onClick={() => { if (ready) setFindOpen(true) }} disabled={!ready} aria-label={findLabel}
          aria-keyshortcuts={modKey === '⌘' ? 'Meta+K' : 'Control+K'} aria-haspopup="dialog"
          className="hidden min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-a-border bg-a-surface p-2 text-left text-sm text-a-text-2 shadow-a-sm enabled:hover:border-a-text-2/40 disabled:opacity-60 sm:ml-auto sm:flex sm:min-w-40 sm:max-w-sm sm:flex-1 sm:shrink sm:justify-start sm:px-3 lg:ml-4">
          <Search size={15} aria-hidden className="shrink-0" />
          <span className="hidden min-w-0 truncate sm:inline">{findLabel}</span>
          <kbd aria-hidden="true" className="ml-auto hidden shrink-0 rounded-md border border-a-border px-1.5 font-a-mono text-xs sm:inline">{modKey} K</kbd>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-3">
          {ready && (
            <>
              <button type="button" onClick={() => openCapture()} aria-label={t('time.shell.capture', 'Add with AI')} aria-keyshortcuts="A"
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold time-ai-fill hover:opacity-90">
                <Mic size={15} aria-hidden /><span className="hidden md:inline">{t('time.shell.capture', 'Add with AI')}</span>
              </button>
              <Button size="sm" onClick={() => openTask(null, mine)} aria-keyshortcuts="N">
                <Plus size={15} aria-hidden /><span className="hidden md:inline">{t('time.shell.new_task', 'New task')}</span>
              </Button>
            </>
          )}
        </div>
      </>}
      overlays={ready ? <>
        <ActionPanels />
        <TimeFind open={findOpen} onClose={() => setFindOpen(false)} onRun={runFind} nav={nav} dark={look.resolved === 'dark'} slim={slim}
          fallbackFocus={[findButton, findPhone, main]} />
        <ShortcutsSheet open={helpOpen} onClose={() => setHelpOpen(false)} fallbackFocus={[findButton, findPhone, main]}
          sections={[{
            rows: [
              { name: t('workspace.find.title', 'Find'), keys: [[modKey, 'K'], ['/']] },
              { name: t('time.shell.new_task', 'New task'), keys: [['N']] },
              { name: t('time.shell.capture', 'Add with AI'), keys: [['A']] },
              { name: t('time.nav.plan', 'Planner'), keys: [['P']] },
              { name: t('time.nav.backlog', 'Backlog & pool'), keys: [['B']] },
              { name: t('workspace.shortcuts.title', 'Keyboard shortcuts'), keys: [['?']] },
            ],
          }]} />
      </> : null}>
      {stopped && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="warning">
            {lapsed
              ? (modules.onModules
                ? t('time.shell.lapsed_modules', 'Your HexaTech plan is not active. Start it again in Plan & products; your tasks are unchanged.')
                : t('time.shell.lapsed', "Your organisation's subscription is not active, so the Time Planner cannot open. Your tasks are unchanged."))
              : notInPlan
                ? t('time.shell.not_in_plan', 'HexaTech Time Planner is not part of your plan.')
                : t('time.shell.switched_off', 'HexaTech Time Planner has been switched off for your organisation. Your tasks are unchanged.')}
          </Notice>
          <Link to={modules.onModules ? '/account/products' : '/'} className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
            {modules.onModules ? t('workspace.shell.plan', 'Plan & products') : t('time.shell.open_full_admin', 'Open the full admin')}
          </Link>
        </div>
      )}

      {!stopped && locked && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="warning">{modules.onModules
            ? t('time.shell.locked_modules', 'Your plan does not include the Time Planner’s planner yet. Plan & products shows what your packages include.')
            : t('time.shell.locked', 'The Time Planner is part of the Enterprise plan. Your plan does not include it yet; the full admin shows how to upgrade.')}</Notice>
          <Link to={modules.onModules ? '/account/products' : '/'} className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
            {modules.onModules ? t('workspace.shell.plan', 'Plan & products') : t('time.shell.open_full_admin', 'Open the full admin')}
          </Link>
        </div>
      )}

      {!stopped && isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('time.common.loading', 'Loading…')}</p>}

      {!stopped && isError && !data && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="danger">{t('time.errors.unknown', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={refetch}>{t('time.common.retry', 'Try again')}</Button>
        </div>
      )}

      {ready && data && (
        <>
          <div data-phone-crumb="" className="flex min-w-0 px-4 pt-3 sm:hidden">{crumb}</div>
          <div data-phone-row="" className="flex items-center gap-2 px-4 pt-3 sm:hidden">
            <button ref={findPhone} type="button" onClick={() => setFindOpen(true)} aria-haspopup="dialog"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-a-border bg-a-surface px-3 py-2 text-left text-sm text-a-text-2 shadow-a-sm">
              <Search size={15} aria-hidden className="shrink-0" /><span className="truncate">{findLabel}</span>
            </button>
          </div>
          {(data.ai.status === 'over' || data.ai.status === 'warn') && (
            <div className="px-4 pt-3 lg:px-6">
              <Notice tone={data.ai.status === 'over' ? 'danger' : 'warning'}>
                {data.ai.status === 'over'
                  ? t('time.shell.ai_over', "This month's AI allowance is used up: plans are made by the rules, and AI capture and reviews stop until next month.")
                  : t('time.shell.ai_warn', "{{percent}} % of this month's AI allowance is used.", { percent: data.ai.percent ?? 80 })}
              </Notice>
            </div>
          )}
          <main ref={main} tabIndex={-1} className="min-h-0 min-w-0 flex-1 outline-hidden">
            <PageBoundary key={pathname}
              message={t('time.common.page_failed', 'This page could not be shown. What you saved is safe.')}
              reload={t('time.common.reload', 'Reload the page')}>
              {children}
            </PageBoundary>
          </main>
        </>
      )}
    </WorkspaceShell>
  )
}
