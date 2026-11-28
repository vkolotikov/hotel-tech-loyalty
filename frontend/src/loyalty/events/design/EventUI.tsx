import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { dateOf, formatDate, timeOf } from '../../../workspace/lib/wallClock'
import { points } from '../../lib/format'
import { ManagementHeading, ManagementStatus } from '../../management/ManagementUI'
import { adminAssets } from '../../management/assets'
import { OverviewButton } from '../../overview/OverviewUI'
import type { LoyaltyEventRow } from '../types'
import { dateBlock, whereOf } from '../eventsMath'
import { PHASE_WORDS } from '../words'
import { useEventWords } from './words'
import { eventRowStatus } from './math'
import calendar from './assets/calendar.svg'
import boost from './assets/aa934.svg'
import people from './assets/1734b.svg'
import scan from './assets/d6aea.svg'
import waiting from './assets/dc22c.svg'
import gift from './assets/9f980.svg'
import './events.css'
import './compact.css'

const icons = { calendar, boost, people, scan, waiting, gift }
export function EventIcon({ kind = 'calendar' }: { kind?: keyof typeof icons }) {
  return <span className="l-ec-icon" data-kind={kind} aria-hidden><img src={icons[kind]} alt="" /></span>
}
export function EventHeading(props: { title: string; line: string; children?: ReactNode }) { return <ManagementHeading {...props} /> }
export function EventEyebrow({ children }: { children: ReactNode }) { return <div className="l-ev-eyebrow"><EventIcon />{children}</div> }
export function EventReward({ event }: { event: Pick<LoyaltyEventRow, 'points' | 'counts_as_visit'> }) {
  const { t, i18n } = useTranslation(), say = useEventWords()
  return <>{say('pointsValue', { n: points(event.points, i18n.language) })}{event.counts_as_visit && <> · {t('loyalty.events.card.visit', 'Counts as a visit')}</>}</>
}
export function EventDetails({ event, canChange = false, actions }: { event: LoyaltyEventRow; canChange?: boolean; actions?: ReactNode }) {
  const say = useEventWords(), { t, i18n } = useTranslation()
  const days = dateOf(event.starts_at) === dateOf(event.ends_at)
  const n = points(event.counts.signed_up, i18n.language), cap = event.capacity === null ? '' : ` / ${points(event.capacity, i18n.language)}`
  return <aside className="l-ad-panel l-ec-detail" id="management-detail" tabIndex={-1} aria-label={event.title}>
    <header className="l-ec-detail-head"><span className="l-ec-eyebrow"><EventIcon />{say('selectedEvent')}</span><ManagementStatus state={event.status === 'published' && event.phase !== 'ended' ? 'active' : event.status === 'draft' ? 'upcoming' : 'off'}>{t(`loyalty.events.phase.${event.phase}`, PHASE_WORDS[event.phase])}</ManagementStatus></header>
    <h2>{event.title}</h2>
    <div className="l-ec-date"><small>{formatDate(dateOf(event.starts_at), i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{!days && ` – ${formatDate(dateOf(event.ends_at), i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}`}</small><strong>{timeOf(event.starts_at)}–{timeOf(event.ends_at)}</strong>{whereOf(event) && <p>{whereOf(event)}</p>}</div>
    <dl className="l-ec-facts"><dt>{say('who')}</dt><dd>{event.admits === 'all' ? say('allMembers') : event.tiers.map(t => t.name).join(', ')}</dd><dt>{say('signup')}</dt><dd>{event.sign_up ? say('required') : say('notRequired')}</dd></dl>
    <div className="l-ec-capacity"><div><span>{event.sign_up ? say('signedUp', { n: `${n}${cap}` }) : say('checkedInCount', { n: points(event.counts.checked_in, i18n.language) })}</span><small>{event.counts.room_left === null ? say('unlimited') : say('placesLeft', { n: points(event.counts.room_left, i18n.language) })}</small></div>{event.capacity !== null && event.capacity > 0 && event.counts.room_left !== null && <meter aria-label={say('capacity')} min={0} max={event.capacity} value={Math.max(0, Math.min(event.capacity, event.capacity - event.counts.room_left))} />}</div>
    <div className="l-ec-reward"><small>{say('reward')}</small><strong><EventReward event={event} /></strong><p>{say('afterAttendance')}</p></div>
    {event.description && <details className="l-ad-more"><summary>{say('description')}</summary><p className="l-ec-description">{event.description}</p></details>}
    {actions || <div className="l-ec-detail-actions">{canChange && event.status !== 'cancelled' && <Link className="l-ov-button" to={`/loyalty/events/${event.id}/edit`}>{say('edit')}</Link>}<Link className="l-ov-button l-ov-primary" to={`/loyalty/events/${event.id}`}>{say('viewAttendees')}</Link></div>}
  </aside>
}
export function EventRow({ name, caption, value, status, tone = 'neutral', selected, onSelect, id, event }: { name: string; caption: string; value: string; status: string; tone?: string; selected: boolean; onSelect: () => void; id: number; event?: LoyaltyEventRow }) {
  const { i18n } = useTranslation(), say = useEventWords()
  const start = event && dateBlock(event.starts_at, i18n.language), end = event && dateBlock(event.ends_at, i18n.language)
  const range = event && dateOf(event.starts_at) !== dateOf(event.ends_at)
  const sameMonth = event && event.starts_at.slice(0, 7) === event.ends_at.slice(0, 7)
  return <li className="l-ec-row" data-selected={selected || undefined} data-record={id}>
    <OverviewButton type="button" className="l-ec-row-content" aria-pressed={selected} onClick={onSelect} aria-label={say('select', { name })}>
      <span className="l-ec-identity">{start ? <span className="l-ec-day" data-tone={eventRowStatus(event!).tone}><strong>{start.day}{range && sameMonth && `–${end!.day}`}</strong><small>{start.month}{range && !sameMonth && ` – ${end!.day} ${end!.month}`}</small></span> : <span className="l-ec-avatar" aria-hidden>{name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('')}</span>}<span className="l-ec-name"><strong>{name}</strong><small>{caption}</small></span></span>
      <span className="l-ec-value">{value}</span><span className="l-ec-state"><ManagementStatus state={tone === 'green' ? 'active' : tone === 'amber' ? 'upcoming' : 'off'}>{status}</ManagementStatus></span><img className="l-ad-chevron" src={adminAssets.chevron.src} width={16} height={16} alt="" />
    </OverviewButton>
  </li>
}
