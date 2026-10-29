import campaignProgramIcon from '../campaigns/design/assets/program.svg'
import { tabFrom, searchFor, CAMPAIGN_TABS } from '../campaigns/campaignsMath'
import { TAB_WORDS } from '../campaigns/words'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Fragment } from 'react'
import { groupOf } from '../options/groups'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
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
import '../redesign/redesign.css'
import { useRedesignWords } from '../redesign/words'
import { useEarnWords } from '../earn/words'
import { useRewardWords } from '../rewards/design/words'
import rewardsProgramIcon from '../rewards/design/assets/program.svg'
import eventsProgramIcon from '../events/design/assets/program.svg'
import insightsProgramIcon from '../insights/assets/program.svg'
import requestsProgramIcon from '../requests/assets/program.svg'
import cardAppProgramIcon from '../app/design/assets/program.svg'

import { ScanMobileNav, ScanMobileHeader } from '../scan/design/ScanMobileNav'
import scanProgramIcon from '../scan/design/assets/program.svg'
import { useSettingsWords } from '../settings/words'
import '../settings/utility.css'
import { OverviewLookContext } from './OverviewLookContext'
import setupProgramIcon from '../options/assets/program.svg'
import settingsProgramIcon from '../settings/assets/program.svg'

export function OverviewShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const say = useOverviewWords()
  const words = useRedesignWords()
  const earn = useEarnWords()
  const rewards = useRewardWords()
  const location = useLocation()
  const settings = useSettingsWords()
  const isSetup = location.pathname.replace(/\/$/, '') === '/loyalty/options/setup'
  const isSettings = location.pathname.replace(/\/$/, '') === '/loyalty/settings'
  const utility = /\/loyalty\/(start|guide|members\/(import|duplicates))\/?$/.test(location.pathname)
  const isCampaigns = /^\/loyalty\/campaigns(?:\/|$)/.test(location.pathname)
  const campaignTab = tabFrom(location.search)
  const isScan = location.pathname.replace(/\/$/, '') === '/loyalty/scan'
  const isInsights = location.pathname.replace(/\/$/, '') === '/loyalty/insights'
  const isCardApp = location.pathname.replace(/\/$/, '') === '/loyalty/app'
  const isRequests = location.pathname.replace(/\/$/, '') === '/loyalty/requests'
  const isEvents = /^\/loyalty\/events(?:\/|$)/.test(location.pathname)
  const eventsTab = location.pathname.endsWith('/new') ? 'drafts' : new URLSearchParams(location.search).get('tab') ?? 'upcoming'
  const eventSections: Record<string, string> = { upcoming: t('loyalty.events.tab.upcoming', 'Upcoming'), past: t('loyalty.events.tab.past', 'Past'), drafts: t('loyalty.events.tab.drafts', 'Drafts') }
  const isProgram = location.pathname.startsWith('/loyalty/program') || isSetup
  const isEarn = location.pathname.replace(/\/$/, '') === '/loyalty/options'
  const isRewards = location.pathname.replace(/\/$/, '') === '/loyalty/rewards'
  const rewardsTab = new URLSearchParams(location.search).get('tab') ?? 'catalogue'
  const rewardsSection = rewardsTab === 'benefits' ? rewards('benefits') : rewardsTab === 'offers' ? rewards('offers') : rewardsTab === 'redemptions' ? t('loyalty.rewards.tab.redemptions', 'Redemptions') : rewardsTab === 'referrals' ? t('loyalty.rewards.tab.referrals', 'Referrals') : rewards('pointsRewards')
  const isMembers = /^\/loyalty\/?$/.test(location.pathname) || location.pathname.startsWith('/loyalty/members/')
  const earnParams = new URLSearchParams(location.search)
  const earnTab = earnParams.get('tab') ?? (earnParams.has('way') ? groupOf(earnParams.get('way')!) : 'earn')
  const earnSection = earnTab === 'bonus' ? earn('bonuses') : earnTab === 'rule' ? earn('rules') : earnTab === 'overview' ? earn('checks') : earn('earning')
  const sectionName = isSettings ? t('workspace.shell.settings', 'Settings') : isSetup ? `${t('loyalty.nav.program', 'Program')} / ${words('guidedSetup')}` : location.pathname.endsWith('/start') ? t('loyalty.start.title', 'Get started') : location.pathname.endsWith('/guide') ? t('loyalty.guide.page.title', 'Guide') : isCampaigns ? t('loyalty.nav.campaigns', 'Campaigns') + ' / ' + (campaignTab === 'campaigns' ? t('loyalty.campaigndesign.email', 'Email') : campaignTab === 'push' ? t('loyalty.campaigndesign.push', 'Push') : t(`loyalty.campaigns.tab.${campaignTab}`, TAB_WORDS[campaignTab])) : isScan ? say('scan') : isCardApp ? t('loyalty.nav.app', 'Card & app') : isInsights ? t('loyalty.nav.insights', 'Insights') : isRequests ? t('loyalty.nav.requests', 'Requests') : isEvents ? t('loyalty.nav.events', 'Events') + ' / ' + (eventSections[eventsTab] ?? eventSections.upcoming) : isRewards ? `${t('loyalty.rewards.title', 'Rewards')} / ${rewardsSection}` : isEarn ? `${t('loyalty.nav.options', 'Ways to earn')} / ${earnSection}` : isProgram ? t('loyalty.nav.program', 'Program') : isMembers ? t('loyalty.nav.members', 'Members') : say('nav')
  const tab = new URLSearchParams(location.search).get('tab') ?? 'tiers'
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
  const assetFor = (to: string) => isSetup && to === '/loyalty/program' ? setupProgramIcon : isSettings && to === '/loyalty/program' ? settingsProgramIcon : isCampaigns && to === '/loyalty/program' ? campaignProgramIcon : isScan && to === '/loyalty/program' ? scanProgramIcon : isCardApp && to === '/loyalty/program' ? cardAppProgramIcon : isInsights && to === '/loyalty/program' ? insightsProgramIcon : isRequests && to === '/loyalty/program' ? requestsProgramIcon : isEvents && to === '/loyalty/program' ? eventsProgramIcon : isRewards && to === '/loyalty/program' ? rewardsProgramIcon : assets[(to === '/loyalty' ? 'members' : to === '/loyalty/overview' ? 'home' : to.split('/').pop()) as keyof typeof assets]
  const rewardsNav = isRewards && !slim ? <div className="l-rd-subnav">{[['catalogue', rewards('pointsRewards')], ['benefits', rewards('benefits')], ['offers', rewards('offers')]].map(([key, label]) => <Link key={key} to={key === 'catalogue' ? '/loyalty/rewards' : `/loyalty/rewards?tab=${key}`} className={rewardsTab === key ? 'l-rd-subnav-active' : ''} onClick={() => setMenu(false)}>{label}</Link>)}</div> : null
  const subnav = isProgram && !slim ? <div className="l-rd-subnav">{[['tiers', words('levels')], ['benefits', words('membershipBenefits')], ['places', t('loyalty.places.title', 'Places')], ['boosts', t('loyalty.program.boosts.title', 'Boost events')]].map(([key, label]) => <Link key={key} to={`/loyalty/program?tab=${key}`} className={!isSetup && tab === key ? 'l-rd-subnav-active' : ''} onClick={() => setMenu(false)}>{label}</Link>)}{can?.manage_program && <Link className={isSetup ? 'l-rd-subnav-active' : ''} to="/loyalty/options/setup" onClick={() => setMenu(false)}>{words('guidedSetup')}</Link>}</div> : null
  const earnNav = isEarn && !slim ? <div className="l-rd-subnav">{[['earn', earn('earning')], ['bonus', earn('bonuses')], ['rule', earn('rules')]].map(([key, label]) => <Link key={key} to={`/loyalty/options?tab=${key}`} className={earnTab === key ? 'l-rd-subnav-active' : ''} onClick={() => setMenu(false)}>{label}</Link>)}</div> : null
  const eventsNav = isEvents && !slim ? <div className="l-rd-subnav">{Object.entries(eventSections).map(([key, label]) => <Link key={key} to={`/loyalty/events?tab=${key}`} className={eventsTab === key ? 'l-rd-subnav-active' : ''} onClick={() => setMenu(false)}>{label}</Link>)}</div> : null
  const campaignsNav = isCampaigns && !slim ? <div className="l-rd-subnav">{CAMPAIGN_TABS.map(key => <Link key={key} to={{ pathname: '/loyalty/campaigns', search: searchFor(key) }} className={campaignTab === key ? 'l-rd-subnav-active' : ''} onClick={() => setMenu(false)}>{key === 'campaigns' ? t('loyalty.campaigndesign.email', 'Email') : key === 'push' ? t('loyalty.campaigndesign.push', 'Push') : t(`loyalty.campaigns.tab.${key}`, TAB_WORDS[key])}</Link>)}</div> : null
  const links = <nav className="l-ov-nav" aria-label={say('menu')}>{nav.map(n => <Fragment key={n.to}><NavLink to={n.to} end={n.end} title={slim ? n.label : undefined} onClick={() => setMenu(false)} className={({ isActive }) => `l-ov-nav-item ${(isActive && !(isSetup && n.to === '/loyalty/options')) || (isSetup && n.to === '/loyalty/program') || (n.to === '/loyalty' && isMembers) ? 'l-ov-selected' : ''}`}><span className="l-ov-icon"><img src={assetFor(n.to)} alt="" /></span><span>{n.label}</span>{['requests', 'program', 'options', 'rewards', 'campaigns', 'app'].includes(n.to.split('/').pop() ?? '') && <img className="l-ov-disclosure" src={assets.submenu} alt="" />}</NavLink>{n.to === '/loyalty/campaigns' && campaignsNav}{n.to === '/loyalty/events' && eventsNav}{n.to === '/loyalty/program' && subnav}{n.to === '/loyalty/options' && earnNav}{n.to === '/loyalty/rewards' && rewardsNav}</Fragment>)}</nav>
  const foot = { settings: { to: '/loyalty/settings', label: settings('allSettings'), onSelect: () => setMenu(false) }, look, fullAdmin: FULL_ADMIN, person: ready ? boot?.staff.name : undefined, role: ready ? boot?.staff.role ?? null : null, onLeave: () => true, onShortcuts: () => { setMenu(false); setHelp(true) }, onFind: () => { setMenu(false); setFind(true) }, guide: { to: '/loyalty/guide', label: say('help') } }
  const findList = findActions({ nav: [...nav, { to: '/loyalty/scan', end: false, icon: ScanLine, label: say('scan') }], dark: look.resolved === 'dark', wide: true, slim, words: { scan: say('scan'), goTo: t('loyalty.find.go_to', 'Go to'), toDark: t('loyalty.find.theme_dark', 'Switch to dark'), toLight: t('loyalty.find.theme_light', 'Switch to light'), collapse: t('workspace.shell.collapse', 'Collapse menu'), expand: t('workspace.shell.expand', 'Expand menu'), shortcuts: t('workspace.shortcuts.title', 'Keyboard shortcuts'), guide: say('help'), start: say('checklist') } })
  const run = (target: FindTarget) => { const action = runOf(target); if (action === null && 'to' in target) navigate(target.to); else if (action === 'theme') look.setTheme(look.resolved === 'dark' ? 'light' : 'dark'); else if (action === 'rail') look.setRail(slim ? 'full' : 'slim'); else if (action === 'shortcuts') setHelp(true) }
  return <OverviewLookContext.Provider value={look}><div data-workspace="" data-loyalty="" data-theme={look.resolved} data-overview="" data-settings={isSettings || undefined} data-scan={isScan || undefined} data-requests={isRequests || undefined} data-redesign={utility || isSettings || isProgram || isMembers || isEarn || isRewards || isEvents || isRequests || isInsights || isCardApp || isScan || isCampaigns || undefined} data-slim={slim || undefined} className="l-overview-frame" style={accentStyle(accentTokens(boot?.accent, look.resolved, LOYALTY_SURFACES[look.resolved]))}>
    <button className="l-ov-skip" onClick={() => main.current?.focus()}>{say('skip')}</button>
    <aside className="l-ov-sidebar" aria-label={say('menu')}>
      <Link to="/loyalty/overview" className="l-ov-brand"><span className="l-ov-mark"><img src={assets.star} alt="" /></span><span><strong>hexa</strong><small>{say('platform')}</small></span></Link>
      <div className="l-ov-workspace" title={say('switchInfo')}><strong>{ready ? boot?.organization.name : say('workspace')}</strong><small>{say('workspace')}</small></div>
      {links}
      <div className="l-ov-sidebar-foot"><Link className="l-ov-button" to="/loyalty/scan">{say('scan')}</Link><FrameFooter {...foot} /></div>
    </aside>
    <div className="l-ov-main-frame">
      {isScan && <ScanMobileHeader name={boot?.organization.name ?? say('workspace')} person={boot?.staff.name ?? ''} onMenu={() => setMenu(true)} />}<header className="l-ov-topbar"><OverviewButton className="l-ov-menu-button" onClick={() => setMenu(true)} aria-haspopup="dialog" aria-label={say('menu')}>☰</OverviewButton><strong className="l-ov-mobile-brand">hexa</strong><div className="l-ov-crumb">{ready && <><span>{boot?.organization.name}</span><span>/</span></>}<span aria-current="page">{sectionName}</span></div><button ref={searchRef} className="l-ov-search" onClick={() => setFind(true)} disabled={!ready} aria-label={say('search')} aria-haspopup="dialog"><img src={assets.search} alt="" /><span>{say('search')}</span></button></header>
      <main ref={main} tabIndex={-1} className="l-ov-main">
        {!ready && context.isLoading && <div className="l-ov-page"><OverviewSkeleton rows={6} /></div>}
        {!ready && context.isError && <div className="l-ov-page"><h1>{say('unavailableOverview')}</h1><OverviewRecovery forbidden={denied} onRetry={context.refetch} busy={context.isLoading} /><Link className="l-ov-link" to={FULL_ADMIN}>{t('loyalty.shell.open_full_admin', 'Open the full admin')}</Link>{code === 'workspace_disabled' && <p>{t('loyalty.shell.switched_off', 'HexaTech Loyalty has been switched off for your organisation. Your members and their points are unchanged.')}</p>}</div>}
        {ready && <PageBoundary message={say('unavailableOverview')} reload={say('retry')}><div className={utility ? 'l-utility-content' : undefined} key={`${boot?.organization.id}:${boot?.staff.id}`}>{children}</div></PageBoundary>}
      </main>
    </div>
    {isScan && <ScanMobileNav onMenu={() => setMenu(true)} />}
    {menu && <OverviewDialog kind="menu" title={say('menu')} onClose={() => setMenu(false)}><div className="l-ov-workspace"><strong>{boot?.organization.name}</strong><small>{say('workspace')}</small></div>{links}<Link to="/loyalty/scan" className="l-ov-button" onClick={() => setMenu(false)}>{say('scan')}</Link><PhoneMenu {...foot} /></OverviewDialog>}
    {ready && <><LoyaltyFind open={find} onClose={() => setFind(false)} onRun={run} actions={findList} fallbackFocus={[searchRef, main]} /><LoyaltyShortcuts open={help} onClose={() => setHelp(false)} modKey="Ctrl" fallbackFocus={[searchRef, main]} /></>}
  </div></OverviewLookContext.Provider>
}
