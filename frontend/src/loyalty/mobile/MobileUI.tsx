import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OverviewButton } from '../overview/OverviewUI'
import { useBoot } from '../LoyaltyProvider'
import { useMobileWords } from './words'
import { mobileIcons } from './assets'

export function MobileHeader({ onAccount, name, person }: { onAccount: () => void; name: string; person: string }) {
  const say = useMobileWords()
  return <header className="l-mw-header"><div><strong>{name}</strong><small>{say('admin')}</small></div><OverviewButton onClick={onAccount} aria-label={say('account')} aria-haspopup="dialog">{person.split(/\s+/).map(s => s[0]).slice(0, 2).join('')}</OverviewButton></header>
}

export function MobileNav() {
  const say = useMobileWords()
  const { t } = useTranslation()
  const location = useLocation()
  const path = location.pathname.replace(/\/$/, '')
  const active = path === '/loyalty/overview' ? 'home' : path === '/loyalty' || path.startsWith('/loyalty/members/') ? 'members' : path === '/loyalty/scan' ? 'scan' : path === '/loyalty/requests' ? 'requests' : 'more'
  const tabs = [ ['home', '/loyalty/overview', say('home')], ['members', '/loyalty', t('loyalty.nav.members', 'Members')], ['scan', '/loyalty/scan', t('loyalty.scandesign.scan', 'Scan')], ['requests', '/loyalty/requests', t('loyalty.nav.requests', 'Requests')], ['more', '/loyalty/more', say('more')] ] as const
  return <nav className="l-mw-nav" aria-label={say('admin')}>{tabs.map(([key, to, label]) => <Link key={key} to={to} className={`l-mw-nav-${key}`} aria-current={active === key ? 'page' : undefined}><img src={mobileIcons[key]} alt="" /><span>{label}</span></Link>)}</nav>
}

export function MobileTile({ icon, title, hint, to, onClick, primary = false, disabled = false }: { icon: string; title: string; hint?: string; to?: string; onClick?: () => void; primary?: boolean; disabled?: boolean }) {
  const body = <><span className="l-mw-tile-icon"><img src={icon} alt="" /></span><strong>{title}</strong>{hint && <small>{hint}</small>}</>
  const className = `l-mw-tile ${primary ? 'l-mw-primary' : ''}`
  return to ? <Link className={className} to={to}>{body}</Link> : <button type="button" className={className} onClick={onClick} disabled={disabled}>{body}</button>
}

export function MobileTitle({ children, icon }: { children: ReactNode; icon?: string }) { return <h1 className="l-mw-title">{icon && <img src={icon} alt="" />}{children}</h1> }

export function MorePage() {
  const say = useMobileWords()
  const { t } = useTranslation()
  const boot = useBoot()
  const can = boot.staff.can
  return <div className="l-ov-page l-mw-page l-mw-more"><MobileTitle>{say('more')}</MobileTitle>
    <section className="l-mw-panel"><small className="l-mw-eyebrow">{say('viewManage')}</small>{can.view_insights && <Link className="l-ov-button" to="/loyalty/insights">{t('loyalty.nav.insights', 'Insights')} →</Link>}<Link className="l-ov-button" to="/loyalty/events">{t('loyalty.nav.events', 'Events')} →</Link><Link className="l-ov-button" to="/loyalty/rewards">{t('loyalty.overview.rewardsNav', 'Rewards & benefits')} →</Link></section>
    <section className="l-mw-panel"><small className="l-mw-eyebrow">{say('yourProgram')}</small><Link className="l-ov-button" to="/loyalty/overview?panel=program">{say('programSummary')} →</Link>{can.manage_app && <Link className="l-ov-button" to="/loyalty/overview?panel=preview">{say('appPreview')} →</Link>}<Link className="l-ov-button" to="/loyalty/settings">{t('workspace.shell.settings', 'Settings')} →</Link></section>
    <section className="l-mw-panel l-mw-advanced"><h2>{say('advanced')}</h2><p>{say('advancedHint')}</p><Link className="l-ov-button" to="/members">{t('loyalty.shell.open_full_admin', 'Open the full admin')}</Link></section>
    <Link className="l-ov-button" to="/loyalty/guide">{say('help')}</Link><details><summary>{say('allTools')}</summary><div className="l-mw-tool-links"><Link to="/loyalty/program">{t('loyalty.nav.program', 'Program')}</Link><Link to="/loyalty/options">{t('loyalty.nav.options', 'Ways to earn')}</Link>{can.manage_program && <Link to="/loyalty/options/setup">{t('loyalty.redesign.guidedSetup', 'Guided setup')}</Link>}{can.manage_campaigns && <Link to="/loyalty/campaigns">{t('loyalty.nav.campaigns', 'Campaigns')}</Link>}{can.manage_members && <Link to="/loyalty/members/import">{t('loyalty.membership.list.import', 'Import')}</Link>}</div></details>
  </div>
}
