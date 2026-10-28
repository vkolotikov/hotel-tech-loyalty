import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../../LoyaltyProvider'
import { OverviewButton } from '../../overview/OverviewUI'
import { memberPath } from '../../lib/links'
import { DeskActions } from '../../visits/DeskActions'
import { doorPath, type ScanContext } from '../scanContext'
import type { VerdictView } from '../verdict'
import { useScanWords } from './words'
import { ScanIdentity } from './ScanMember'

export function ScanDoor({ view, context, contextName, onNext, onOptions, children }: { view: VerdictView; context: ScanContext; contextName: string; onNext: () => void; onOptions: () => void; children?: ReactNode }) {
  const words = useScanWords(), { t } = useTranslation(), boot = useBoot()
  const say = (sentence: VerdictView['headline']) => t(sentence.key, sentence.fallback, sentence.vars)
  return <><header className="l-sc-heading"><div><h1><span className="l-sc-desktop">{words('door')}</span><span className="l-sc-mobile">{words('doorAccess')}</span></h1><p>{contextName}</p></div><OverviewButton onClick={onOptions}>{words('changePlace')}</OverviewButton></header>
    {view.member && <ScanIdentity member={view.member} />}
    <div className="l-sc-columns"><section className="l-sc-panel l-sc-verdict" data-verdict={view.tone}><span className="l-sc-verdict-mark" aria-hidden>{view.mark === 'check' ? '✓' : view.mark === 'cross' ? '×' : '!'}</span><h2>{say(view.headline)}</h2>{view.reason && <p>{say(view.reason)}</p>}<p>{words('checkMember')}</p>{view.validity && <p>{say(view.validity)}</p>}{view.facts.map(f => <p key={f.key}>{say(f)}</p>)}{context.kind === 'place' && <small>{words('noCheckin')}</small>}<div className="l-sc-stack">{children}<OverviewButton primary onClick={onNext}>{words('next')}</OverviewButton>{view.member && <Link className="l-ov-button" to={memberPath(view.member.id)}>{words('profile')}</Link>}</div></section>
    <aside className="l-sc-stack"><section className="l-sc-panel l-sc-desktop"><h2>{words('why')}</h2><p>{contextName}</p>{view.reason && <p>{say(view.reason)}</p>}{view.benefits.length > 0 && <ul>{view.benefits.map(b => <li key={b}>{b}</li>)}</ul>}<small>{words('accessHint')}</small>{boot.staff.can.manage_program && <Link className="l-ov-link" to="/loyalty/program?tab=places">{words('managePlaces')}</Link>}</section>{view.member && <section className="l-sc-panel"><h2>{words('review')}</h2><DeskActions member={view.member} /></section>}<section className="l-sc-panel"><h2>{words('moreDoor')}</h2><Link className="l-ov-link" to={doorPath(context)}>{words('continuous')}</Link></section></aside></div><div className="l-sc-paused"><small>{words('paused')}</small><OverviewButton onClick={onOptions}>{words('changeReader')}</OverviewButton></div>
  </>
}
