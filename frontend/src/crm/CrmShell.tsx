import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BrandSwitcher } from './shell/BrandSwitcher'
import { QuickCreate } from './shell/QuickCreate'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BarChart3, Bot, BriefcaseBusiness, CheckSquare, Contact, Eye, Home, MessageSquareText, MessagesSquare, Search, Settings2, Target,
  type LucideIcon,
} from 'lucide-react'
import { WorkspaceShell, type WorkspaceNavItem } from '../workspace/WorkspaceShell'
import type { FindTarget } from '../workspace/find/findCore'
import { firstLetter } from '../workspace/lib/firstLetter'
import { onShortcuts } from '../workspace/lib/shortcuts'
import { useModuleLinks } from '../workspace/lib/useModuleLinks'
import { FrameFooter, PhoneMenu } from '../workspace/shell/FrameFooter'
import { CRM_SURFACES, accentTokens } from '../workspace/theme/accent'
import { Button } from '../workspace/ui/Button'
import { Notice } from '../workspace/ui/Notice'
import { PageBoundary } from '../workspace/ui/PageBoundary'
import { ShortcutsSheet } from '../workspace/ui/ShortcutsSheet'
import { useCrm } from './CrmProvider'
import { CrmFind } from './find/CrmFind'
import { failureOf } from './lib/api'
import { APP_NAME, FULL_ADMIN } from './lib/links'
import { loadBrandPaint, rememberBrandPaint, useLook } from './lib/look'
import { AREAS, areaOf, countOf, type AreaGroup, type AreaKey } from './shell/nav'
import { withCreate } from './lib/records'

const ICONS: Record<AreaKey, LucideIcon> = {
  today: Home,
  inbox: MessagesSquare,
  visitors: Eye,
  leads: Target,
  deals: BriefcaseBusiness,
  contacts: Contact,
  tasks: CheckSquare,
  assistant: Bot,
  widget: MessageSquareText,
  insights: BarChart3,
  settings: Settings2,
}

/** The default (English) name of each area, beside its key crm.nav.<area>. */
const NAV_DEFAULTS: Record<AreaKey, string> = {
  today: 'Today', inbox: 'Inbox', visitors: 'Visitors', leads: 'Leads', deals: 'Deals', contacts: 'Contacts',
  tasks: 'Tasks', assistant: 'AI assistant', widget: 'Chat widget', insights: 'Insights', settings: 'Settings',
}

/** The groups' default (English) names, beside their keys crm.nav.groups.<group>. */
const GROUP_DEFAULTS: Record<AreaGroup, string> = { conversations: 'Conversations', sales: 'Sales', reports: 'Reports', setup: 'Set up' }

/**
 * HexaTech CRM on the shared frame (WorkspaceShell): the areas as compact rows in their groups (Conversations, Sales,
 * Reports, Set up) — Inbox, Leads and Tasks with what waits —, Settings, Help & resources and the person at the foot; in the top bar the
 * organisation's line and Find; and the notices that explain why something is not available. On modules there is no
 * full admin: the other workspaces bought, Team and Plan & products take its place.
 */
export function CrmShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useCrm()
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
  const accent = accentTokens(data ? data.accent : remembered?.accent, look.resolved, CRM_SURFACES[look.resolved])
  const initial = data ? firstLetter(data.organization.name, 'H') : (remembered?.initial ?? 'H')
  const known = Boolean(data)
  const brandHex = accent.accent
  useEffect(() => { if (known) rememberBrandPaint({ accent: brandHex, initial }) }, [known, brandHex, initial])

  const modules = useModuleLinks('crm')
  const refusal = isError ? failureOf(error).code : ''
  const switchedOff = refusal === 'workspace_disabled'
  const lapsed = refusal === 'subscription_required'
  const notInPlan = refusal === 'not_in_plan'
  const stopped = switchedOff || lapsed || notInPlan
  const ready = Boolean(data) && !stopped
  if (findOpen && !ready) setFindOpen(false)
  if (helpOpen && !ready) setHelpOpen(false)

  useEffect(() => {
    if (!ready) return
    return onShortcuts(window, document, { letters: { i: 'inbox', l: 'leads', t: 'tasks', n: 'new' } }, (hit, e) => {
      if (hit === 'find') setFindOpen(true)
      else if (hit === 'new') navigate({ search: withCreate(new URLSearchParams(window.location.search), 'lead').toString() })
      else if (hit === 'help') setHelpOpen(true)
      else if (hit === 'inbox') navigate('/crm/inbox')
      else if (hit === 'leads') navigate('/crm/leads')
      else if (hit === 'tasks') navigate('/crm/tasks')
      else return
      e.preventDefault()
    })
  }, [ready, navigate])

  const nav: WorkspaceNavItem[] = AREAS.map(area => ({
    to: area.to,
    end: area.end,
    icon: ICONS[area.key],
    label: t(`crm.nav.${area.key}`, NAV_DEFAULTS[area.key]),
    count: countOf(area.key, data),
    phone: area.phone,
    section: area.group ? t(`crm.nav.groups.${area.group}`, GROUP_DEFAULTS[area.group]) : undefined,
  }))
  const area = areaOf(pathname)
  const pageName = nav[AREAS.findIndex(a => a.key === area)]?.label ?? ''
  const findLabel = t('crm.shell.find', 'Find a contact, lead or action')
  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl'
  const fullAdmin = modules.onModules ? null : FULL_ADMIN
  const slim = look.rail === 'slim'

  const foot = {
    look, fullAdmin, moduleLinks: modules.links, person: data?.staff.name, role: data?.staff.role ?? null, onLeave: () => true,
    onShortcuts: () => { if (ready) setHelpOpen(true) }, onFind: () => { if (ready) setFindOpen(true) },
    settings: { to: '/crm/settings', label: t('crm.nav.settings', 'Settings') },
  }
  const runFind = (target: FindTarget) => {
    if ('to' in target) navigate(target.to)
    else if (target.run === 'theme') look.setTheme(look.resolved === 'dark' ? 'light' : 'dark')
    else if (target.run === 'rail') look.setRail(slim ? 'full' : 'slim')
    else if (target.run === 'shortcuts') setHelpOpen(true)
  }
  const crumb = data ? (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <BrandSwitcher />
      <span aria-hidden className="text-a-text-2">/</span>
      <span className="truncate font-medium text-a-text">{pageName}</span>
    </div>
  ) : null

  return (
    <WorkspaceShell workspace="crm" look={look} accent={accent} initial={initial}
      organization={data?.organization.name} product={data?.name ?? APP_NAME} person={data?.staff.name}
      nav={nav} fullAdmin={fullAdmin} moduleLinks={modules.links}
      footer={<FrameFooter {...foot} />}
      phoneMenu={<PhoneMenu {...foot} />}
      crumbs={crumb && <div className="hidden min-w-0 sm:flex">{crumb}</div>}
      header={<>
        <button ref={findButton} type="button" onClick={() => { if (ready) setFindOpen(true) }} disabled={!ready} aria-label={findLabel}
          aria-keyshortcuts={modKey === '⌘' ? 'Meta+K' : 'Control+K'} aria-haspopup="dialog"
          className="hidden min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-a-border bg-a-surface p-2 text-left text-sm text-a-text-2 shadow-a-sm enabled:hover:border-a-text-2/40 disabled:opacity-60 sm:ml-auto sm:flex sm:min-w-40 sm:max-w-md sm:flex-1 sm:shrink sm:justify-start sm:px-3 lg:ml-4">
          <Search size={15} aria-hidden className="shrink-0" />
          <span className="hidden min-w-0 truncate sm:inline">{findLabel}</span>
          <kbd aria-hidden="true" className="ml-auto hidden shrink-0 rounded-md border border-a-border px-1.5 font-a-mono text-xs sm:inline">{modKey} K</kbd>
        </button>
        <div className="ml-auto sm:hidden" />
        {ready && <div className="ml-2 shrink-0"><QuickCreate /></div>}
      </>}
      overlays={ready ? <>
        <CrmFind open={findOpen} onClose={() => setFindOpen(false)} onRun={runFind} nav={nav} dark={look.resolved === 'dark'} slim={slim}
          fallbackFocus={[findButton, findPhone, main]} />
        <ShortcutsSheet open={helpOpen} onClose={() => setHelpOpen(false)} fallbackFocus={[findButton, findPhone, main]}
          sections={[{
            rows: [
              { name: t('workspace.find.title', 'Find'), keys: [[modKey, 'K'], ['/']] },
              { name: t('crm.nav.inbox', 'Inbox'), keys: [['I']] },
              { name: t('crm.nav.leads', 'Leads'), keys: [['L']] },
              { name: t('crm.nav.tasks', 'Tasks'), keys: [['T']] },
              { name: t('crm.create.lead_new', 'New lead'), keys: [['N']] },
              { name: t('crm.record.step', 'Previous or next record'), keys: [['['], [']']] },
              { name: t('workspace.shortcuts.title', 'Keyboard shortcuts'), keys: [['?']] },
            ],
          }]} />
      </> : null}>
      {stopped && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="warning">
            {lapsed
              ? (modules.onModules
                ? t('crm.shell.lapsed_modules', 'Your HexaTech plan is not active. Start it again in Plan & products; your chats, leads and contacts are unchanged.')
                : t('crm.shell.lapsed', "Your organisation's subscription is not active, so HexaTech CRM cannot open. Your chats, leads and contacts are unchanged."))
              : notInPlan
                ? t('crm.shell.not_in_plan', 'HexaTech CRM is not part of your plan. Add it in Plan & products.')
                : t('crm.shell.switched_off', 'HexaTech CRM has been switched off for your organisation. Your chats, leads and contacts are unchanged.')}
          </Notice>
          <Link to={modules.onModules ? '/account/products' : '/'} className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
            {modules.onModules ? t('workspace.shell.plan', 'Plan & products') : t('crm.shell.open_full_admin', 'Open the full admin')}
          </Link>
        </div>
      )}

      {!stopped && isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('crm.common.loading', 'Loading…')}</p>}

      {!stopped && isError && !data && (
        <div className="max-w-xl space-y-3 p-6">
          <Notice tone="danger">{t('crm.errors.unknown', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={refetch}>{t('crm.common.retry', 'Try again')}</Button>
        </div>
      )}

      {!stopped && data && (
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
                  ? t('crm.shell.ai_over', "This month's AI allowance is used up: the chat assistant hands every chat to your team, and drafts stop until next month.")
                  : t('crm.shell.ai_warn', "{{percent}} % of this month's AI allowance is used.", { percent: data.ai.percent ?? 80 })}
                {' '}
                {modules.onModules && <Link to="/account/products" className="font-semibold underline">{t('workspace.shell.plan', 'Plan & products')}</Link>}
              </Notice>
            </div>
          )}
          <main ref={main} tabIndex={-1} className="min-h-0 min-w-0 flex-1 outline-hidden">
            <PageBoundary key={pathname}
              message={t('crm.common.page_failed', 'This page could not be shown. What you saved is safe.')}
              reload={t('crm.common.reload', 'Reload the page')}>
              {children}
            </PageBoundary>
          </main>
        </>
      )}
    </WorkspaceShell>
  )
}
