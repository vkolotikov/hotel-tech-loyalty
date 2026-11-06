import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { OverviewButton } from '../../overview/OverviewUI'
import { DesignDialog } from '../../redesign/DesignUI'
import { useRedesignWords } from '../../redesign/words'
import type { EarnGuard } from '../../earn/useLeaveGuard'
import { useRewardWords } from './words'
import { RewardIcon, RewardStatus, type RewardIconKind } from './presentation'

export function RewardHeading({ title, line, children }: { title: string; line: string; children?: ReactNode }) {
  return <header className="l-rb-heading"><div><h1>{title}</h1><p>{line}</p></div><div className="l-rd-actions">{children}</div></header>
}
export function RewardHero({ title, line, count }: { title: string; line: string; count: string }) {
  return <section className="l-rb-hero"><div><h2>{title}</h2><p>{line}</p></div><small>{count}</small></section>
}
export function RewardEyebrow({ children, icon = 'gift' }: { children: ReactNode; icon?: RewardIconKind }) {
  return <div className="l-rb-eyebrow"><RewardIcon kind={icon} />{children}</div>
}
export function RewardRow({ name, caption, value, status, tone, selected, onSelect, id, image, icon = 'gift' }: { name: string; caption: string; value: string; status: string; tone?: string; selected: boolean; onSelect: () => void; id: string; image?: ReactNode; icon?: RewardIconKind }) {
  const say = useRewardWords()
  return <li className={`l-rb-row ${selected ? 'l-rb-selected' : ''}`} data-record={id}>{image ?? <RewardIcon kind={icon} />}<button type="button" className="l-rb-row-content" aria-pressed={selected} onClick={onSelect}><span><strong>{name}</strong><small>{caption}</small></span><span className="l-rb-value">{value}</span><RewardStatus tone={tone}>{status}</RewardStatus></button><OverviewButton type="button" className="l-rb-arrow" aria-label={say('select', { name })} onClick={onSelect}>→</OverviewButton></li>
}
export function RewardColumns({ first, value }: { first: string; value: string }) {
  const say = useRewardWords()
  return <div className="l-rc-columns" aria-hidden="true"><span>{first}</span><span>{value}</span><span>{say('status')}</span></div>
}
export function RewardShortcut({ to, title, caption, icon }: { to: string; title: string; caption: string; icon: RewardIconKind }) {
  return <Link to={to} className={`l-ov-panel l-rc-shortcut ${icon === 'calendar' ? 'l-rc-amber' : 'l-rc-cyan'}`}><RewardIcon kind={icon} /><span><strong>{title}</strong><small>{caption}</small></span><span aria-hidden="true">→</span></Link>
}
export function RewardEmpty({ empty, onClear }: { empty?: string; onClear?: () => void }) {
  const say = useRewardWords()
  return <div className="l-rb-empty"><p>{empty ?? say('noResults')}</p>{onClear && <OverviewButton type="button" onClick={onClear}>{say('clear')}</OverviewButton>}</div>
}
export function RewardLeaveDialog({ guard }: { guard: EarnGuard }) {
  const say = useRewardWords(), rd = useRedesignWords()
  return guard.destination && <DesignDialog title={say('discardTitle')} onClose={guard.keep} busy={guard.busy}><p>{say('discardLine')}</p><div className="l-rd-actions"><OverviewButton type="button" onClick={guard.keep}>{rd('keepEditing')}</OverviewButton><OverviewButton type="button" primary onClick={guard.discard}>{rd('discard')}</OverviewButton></div></DesignDialog>
}
export function RewardActivityLinks() {
  const { t } = useTranslation()
  return <footer className="l-rb-activity"><Link className="l-ov-link" to="/loyalty/rewards?tab=redemptions">{t('loyalty.rewards.tab.redemptions', 'Redemptions')} →</Link><Link className="l-ov-link" to="/loyalty/rewards?tab=referrals">{t('loyalty.rewards.tab.referrals', 'Referrals')} →</Link></footer>
}
