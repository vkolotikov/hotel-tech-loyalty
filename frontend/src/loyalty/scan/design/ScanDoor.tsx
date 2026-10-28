import { useState, type ReactNode } from 'react'
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

export function ScanDoor({ view, context, contextName, onNext, onOptions, onDesk, children }: { view: VerdictView; context: ScanContext; contextName: string; onNext: () => void; onOptions: () => void; onDesk: () => void; children?: ReactNode }) {
  const words = useScanWords(), { t } = useTranslation(), boot = useBoot()
  const say = (sentence: VerdictView['headline']) => t(sentence.key, sentence.fallback, sentence.vars)
  const [review, setReview] = useState(false)
  return <><header className="l-sc-heading"><div><h1><span className="l-sc-desktop">{words('door')}</span><span className="l-sc-mobile">{words('doorAccess')}</span></h1><p className="l-sc-desktop">{words('doorSubtitle')}</p><p className="l-sc-mobile">{contextName}</p></div><OverviewButton className="l-sc-mobile" onClick={onOptions}>{words('changePlace')}</OverviewButton><Link className="l-ov-button l-sc-desktop" to="/loyalty/guide">{t('loyalty.overview.help', 'Help & guide')}</Link></header>
    <div className="l-sc-context-bar l-sc-desktop"><OverviewButton onClick={onDesk}>{words('desk')}</OverviewButton><OverviewButton primary onClick={onOptions}>{words(context.kind === 'event' ? 'event' : 'door')}</OverviewButton><div><small>{words(context.kind === 'event' ? 'event' : 'place')}</small><OverviewButton onClick={onOptions}>{contextName} ⌄</OverviewButton></div></div>
    {view.member && <ScanIdentity member={view.member} />}
    <div className="l-sc-columns"><section className="l-sc-panel l-sc-verdict" data-verdict={view.tone}><div className="l-sc-result-heading"><span className="l-sc-verdict-mark" aria-hidden>{view.mark === 'check' ? '✓' : view.mark === 'cross' ? '×' : '!'}</span><h2>{view.tone === 'granted' ? words('allowed') : say(view.headline)}</h2></div>{view.reason && <p>{say(view.reason)}</p>}<p>{words('checkMember')}</p>{view.validity && <p>{say(view.validity)}</p>}{view.facts.map(f => <p key={f.key}>{say(f)}</p>)}{context.kind === 'place' && <small>{words('noCheckin')}</small>}<div className="l-sc-stack">{children}<OverviewButton primary onClick={onNext}>{words('next')}</OverviewButton>{view.member && <Link className="l-ov-link" to={memberPath(view.member.id)}>{words('profile')}</Link>}</div></section>
    <aside className="l-sc-stack"><section className="l-sc-panel l-sc-desktop"><h2>{words('why')}</h2><p>{contextName}</p>{view.reason && <p>{say(view.reason)}</p>}{view.benefits.length > 0 && <ul>{view.benefits.map(b => <li key={b}>{b}</li>)}</ul>}<small>{words('accessHint')}</small>{boot.staff.can.manage_program && <Link className="l-ov-link" to="/loyalty/program?tab=places">{words('managePlaces')}</Link>}</section>{view.member && <section className="l-sc-panel"><h2>{words('review')}</h2><OverviewButton onClick={() => setReview(!review)} aria-expanded={review}>{words('review')}</OverviewButton>{review && <DeskActions member={view.member} />}</section>}<section className="l-sc-panel"><h2>{words('moreDoor')}</h2><Link className="l-ov-link" to={doorPath(context)}>{words('continuous')}</Link></section></aside></div><div className="l-sc-paused"><small>{words('paused')}</small><OverviewButton onClick={onOptions}>{words('changeReader')}</OverviewButton></div>
  </>
}
