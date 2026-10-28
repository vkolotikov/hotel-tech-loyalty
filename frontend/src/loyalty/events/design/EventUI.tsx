import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDate, dateOf, timeOf } from '../../../workspace/lib/wallClock'
import { points } from '../../lib/format'
import { OverviewButton } from '../../overview/OverviewUI'
import type { LoyaltyEventRow } from '../types'
import { whereOf } from '../eventsMath'
import { PHASE_WORDS } from '../words'
import { useEventWords } from './words'
import calendar from './assets/calendar.svg'
import './events.css'

export function EventHeading({ title, line, children }: { title: string; line: string; children?: ReactNode }) {
  return <header className="l-ev-heading"><div><h1>{title}</h1><p>{line}</p></div><div className="l-ev-actions">{children}</div></header>
}
export function EventEyebrow({ children }: { children: ReactNode }) { return <div className="l-ev-eyebrow"><span className="l-ev-icon"><img src={calendar} alt="" /></span>{children}</div> }
export function EventReward({ event }: { event: Pick<LoyaltyEventRow, 'points' | 'counts_as_visit'> }) {
  const { t, i18n } = useTranslation()
  const say = useEventWords()
  return <>{say('pointsValue', { n: points(event.points, i18n.language) })}{event.counts_as_visit && <> · {t('loyalty.events.card.visit', 'Counts as a visit')}</>}</>
}
export function EventDetails({ event, canChange = false, actions }: { event: LoyaltyEventRow; canChange?: boolean; actions?: ReactNode }) {
  const say = useEventWords(), { t, i18n } = useTranslation()
  const days = dateOf(event.starts_at) === dateOf(event.ends_at)
  const n = points(event.counts.signed_up, i18n.language), cap = event.capacity === null ? '' : ` / ${points(event.capacity, i18n.language)}`
  return <section className="l-ov-panel l-ev-detail">
    <EventEyebrow>{event.status === 'published' ? say('published') : t(`loyalty.events.phase.${event.phase}`, PHASE_WORDS[event.phase])}</EventEyebrow>
    <h2>{event.title}</h2>
    <div className="l-ev-inset l-ev-date"><small>{formatDate(dateOf(event.starts_at), i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{!days && ` – ${formatDate(dateOf(event.ends_at), i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}`}</small><strong>{timeOf(event.starts_at)}–{timeOf(event.ends_at)}</strong>{whereOf(event) && <p>{whereOf(event)}</p>}</div>
    <dl className="l-ev-facts"><dt>{say('who')}</dt><dd>{event.admits === 'all' ? say('allMembers') : event.tiers.map(t => t.name).join(', ')}</dd><dt>{say('signup')}</dt><dd>{event.sign_up ? `${say('required')} · ${n}${cap}` : say('notRequired')}</dd><dt>{say('availability')}</dt><dd>{event.counts.room_left === null ? say('unlimited') : say('placesLeft', { n: points(event.counts.room_left, i18n.language) })}</dd></dl>
    <div className="l-ev-reward"><small>{say('reward')}</small><strong><EventReward event={event} /></strong><p>{say('afterAttendance')}</p></div>
    {event.description && <p className="l-ev-description">{event.description}</p>}
    {actions || <>{canChange && event.status !== 'cancelled' && <Link className="l-ov-button" to={`/loyalty/events/${event.id}/edit`}>{say('edit')}</Link>}<Link className="l-ov-button l-ov-primary" to={`/loyalty/events/${event.id}`}>{say('viewAttendees')}</Link></>}
  </section>
}
export function EventRow({ name, caption, value, status, tone, selected, onSelect, id }: { name: string; caption: string; value: string; status: string; tone?: string; selected: boolean; onSelect: () => void; id: number }) {
  const say = useEventWords()
  return <li className={`l-ev-row ${selected ? 'l-ev-selected' : ''}`} data-record={id}><button type="button" className="l-ev-row-content" aria-pressed={selected} onClick={onSelect}><span><strong>{name}</strong><small>{caption}</small></span><span><span className="l-ev-value">{value}</span><small data-tone={tone}>{status}</small></span></button><OverviewButton type="button" className="l-ev-arrow" aria-label={say('select', { name })} onClick={onSelect}>→</OverviewButton></li>
}
