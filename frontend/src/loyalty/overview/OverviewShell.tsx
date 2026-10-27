import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, Users, Inbox, Crown, Sparkles, Gift, CalendarDays, Mail, BarChart3, CreditCard, ScanLine } from 'lucide-react'
import { FrameFooter, PhoneMenu } from '../../workspace/shell/FrameFooter'
import { markShell } from '../../workspace/lib/shellMark'
import { accentStyle, accentTokens, LOYALTY_SURFACES } from '../../workspace/theme/accent'
import { PageBoundary } from '../../workspace/ui/PageBoundary'
import type { WorkspaceNavItem } from '../../workspace/WorkspaceShell'
import type { FindTarget } from '../../workspace/find/findCore'
import { useLoyalty } from '../LoyaltyProvider'
import { LoyaltyFind } from '../find/LoyaltyFind'
import { findActions, runOf } from '../find/findItems'
import { useLook } from '../lib/look'
import { failureOf } from '../lib/api'
import { onShortcuts } from '../lib/shortcuts'
import { FULL_ADMIN } from '../lib/links'
import { LoyaltyShortcuts } from '../ui/LoyaltyShortcuts'
import { overviewAssets as assets } from './assets'
import { OverviewButton, OverviewDialog, OverviewRecovery, OverviewSkeleton } from './OverviewUI'
import { useOverviewWords } from './words'
import './overview.css'

export function OverviewShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const say = useOverviewWords()
  const context = useLoyalty()
  const { data: boot } = context
  const look = useLook()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [find, setFind] = useState(false)
  const [help, setHelp] = useState(false)
  const searchRef = useRef<HTMLButtonElement>(null)
  const main = useRef<HTMLElement>(null)
  const code = failureOf(context.error).code
  const denied = [401, 402, 403].includes(failureOf(context.error).status)
  const ready = Boolean(boot) && !denied
  const can = ready ? boot?.staff.can : undefined
  const slim = look.rail === 'slim'
  useLayoutEffect(() => markShell(document.documentElement, 'loyalty'), [])
  useEffect(() => { if (!ready) return; return onShortcuts(window, document, (hit, e) => { if (hit === 'find') setFind(true); else if (hit === 'help') setHelp(true); else if (hit === 'scan') navigate('/loyalty/scan'); else return; e.preventDefault() }) }, [ready, navigate])
  const nav: WorkspaceNavItem[] = [
    { to: '/loyalty/overview', end: true, icon: LayoutGrid, label: say('nav') },
    { to: '/loyalty', end: true, icon: Users, label: t('loyalty.nav.members', 'Members') },
    { to: '/loyalty/requests', end: false, icon: Inbox, label: t('loyalty.nav.requests', 'Requests') },
    { to: '/loyalty/program', end: false, icon: Crown, label: t('loyalty.nav.program', 'Program') },
    { to: '/loyalty/options', end: false, icon: Sparkles, label: t('loyalty.nav.options', 'Ways to earn') },
    { to: '/loyalty/rewards', end: false, icon: Gift, label: say('rewardsNav') },
    { to: '/loyalty/events', end: false, icon: CalendarDays, label: t('loyalty.nav.events', 'Events') },
    ...(can?.manage_campaigns ? [{ to: '/loyalty/campaigns', end: false, icon: Mail, label: t('loyalty.nav.campaigns', 'Campaigns') }] : []),
    ...(can?.view_insights ? [{ to: '/loyalty/insights', end: false, icon: BarChart3, label: t('loyalty.nav.insights', 'Insights') }] : []),
    ...(can?.manage_app ? [{ to: '/loyalty/app', end: false, icon: CreditCard, label: t('loyalty.nav.app', 'Card & app') }] : []),
  ]
  const assetFor = (to: string) => assets[(to === '/loyalty' ? 'members' : to === '/loyalty/overview' ? 'home' : to.split('/').pop()) as keyof typeof assets]
  const links = <nav className="l-ov-nav" aria-label={say('menu')}>{nav.map(n => <NavLink key={n.to} to={n.to} end={n.end} title={slim ? n.label : undefined} onClick={() => setMenu(false)} className={({ isActive }) => `l-ov-nav-item ${isActive ? 'l-ov-selected' : ''}`}><span className="l-ov-icon"><img src={assetFor(n.to)} alt="" /></span><span>{n.label}</span>{['requests', 'program', 'options', 'rewards', 'campaigns', 'app'].includes(n.to.split('/').pop() ?? '') && <img className="l-ov-disclosure" src={assets.submenu} alt="" />}</NavLink>)}</nav>
  const foot = { look, fullAdmin: FULL_ADMIN, person: ready ? boot?.staff.name : undefined, role: ready ? boot?.staff.role ?? null : null, onLeave: () => true, onShortcuts: () => { setMenu(false); setHelp(true) }, onFind: () => { setMenu(false); setFind(true) }, guide: { to: '/loyalty/guide', label: say('help') } }
  const findList = findActions({ nav: [...nav, { to: '/loyalty/scan', end: false, icon: ScanLine, label: say('scan') }], dark: look.resolved === 'dark', wide: true, slim, words: { scan: say('scan'), goTo: t('loyalty.find.go_to', 'Go to'), toDark: t('loyalty.find.theme_dark', 'Switch to dark'), toLight: t('loyalty.find.theme_light', 'Switch to light'), collapse: t('workspace.shell.collapse', 'Collapse menu'), expand: t('workspace.shell.expand', 'Expand menu'), shortcuts: t('workspace.shortcuts.title', 'Keyboard shortcuts'), guide: say('help'), start: say('checklist') } })
  const run = (target: FindTarget) => { const action = runOf(target); if (action === null && 'to' in target) navigate(target.to); else if (action === 'theme') look.setTheme(look.resolved === 'dark' ? 'light' : 'dark'); else if (action === 'rail') look.setRail(slim ? 'full' : 'slim'); else if (action === 'shortcuts') setHelp(true) }
  return <div data-workspace="" data-loyalty="" data-theme={look.resolved} data-overview="" data-slim={slim || undefined} className="l-overview-frame" style={accentStyle(accentTokens(boot?.accent, look.resolved, LOYALTY_SURFACES[look.resolved]))}>
    <button className="l-ov-skip" onClick={() => main.current?.focus()}>{say('skip')}</button>
    <aside className="l-ov-sidebar" aria-label={say('menu')}>
      <Link to="/loyalty/overview" className="l-ov-brand"><span className="l-ov-mark"><img src={assets.star} alt="" /></span><span><strong>hexa</strong><small>{say('platform')}</small></span></Link>
      <div className="l-ov-workspace" title={say('switchInfo')}><strong>{ready ? boot?.organization.name : say('workspace')}</strong><small>{say('workspace')}</small></div>
      {links}
      <div className="l-ov-sidebar-foot"><Link className="l-ov-button" to="/loyalty/scan">{say('scan')}</Link><FrameFooter {...foot} /></div>
    </aside>
    <div className="l-ov-main-frame">
      <header className="l-ov-topbar"><OverviewButton className="l-ov-menu-button" onClick={() => setMenu(true)} aria-haspopup="dialog" aria-label={say('menu')}>☰</OverviewButton><strong className="l-ov-mobile-brand">hexa</strong><div className="l-ov-crumb">{ready && <><span>{boot?.organization.name}</span><span>/</span></>}<span aria-current="page">{say('nav')}</span></div><button ref={searchRef} className="l-ov-search" onClick={() => setFind(true)} disabled={!ready} aria-label={say('search')} aria-haspopup="dialog"><img src={assets.search} alt="" /><span>{say('search')}</span></button></header>
      <main ref={main} tabIndex={-1} className="l-ov-main">
        {!ready && context.isLoading && <div className="l-ov-page"><OverviewSkeleton rows={6} /></div>}
        {!ready && context.isError && <div className="l-ov-page"><h1>{say('unavailableOverview')}</h1><OverviewRecovery forbidden={denied} onRetry={context.refetch} busy={context.isLoading} /><Link className="l-ov-link" to={FULL_ADMIN}>{t('loyalty.shell.open_full_admin', 'Open the full admin')}</Link>{code === 'workspace_disabled' && <p>{t('loyalty.shell.switched_off', 'HexaTech Loyalty has been switched off for your organisation. Your members and their points are unchanged.')}</p>}</div>}
        {ready && <PageBoundary message={say('unavailableOverview')} reload={say('retry')}><div key={`${boot?.organization.id}:${boot?.staff.id}`}>{children}</div></PageBoundary>}
      </main>
    </div>
    {menu && <OverviewDialog kind="menu" title={say('menu')} onClose={() => setMenu(false)}><div className="l-ov-workspace"><strong>{boot?.organization.name}</strong><small>{say('workspace')}</small></div>{links}<Link to="/loyalty/scan" className="l-ov-button" onClick={() => setMenu(false)}>{say('scan')}</Link><PhoneMenu {...foot} /></OverviewDialog>}
    {ready && <><LoyaltyFind open={find} onClose={() => setFind(false)} onRun={run} actions={findList} fallbackFocus={[searchRef, main]} /><LoyaltyShortcuts open={help} onClose={() => setHelp(false)} modKey="Ctrl" fallbackFocus={[searchRef, main]} /></>}
  </div>
}
