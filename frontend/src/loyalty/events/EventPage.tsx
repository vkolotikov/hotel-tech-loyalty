import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import { SideMenu } from '../../workspace/shell/SideMenu'
import { Notice } from '../../workspace/ui/Notice'
import { venueNow } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { FormField } from '../ui/formParts'
import { Pager } from '../ui/Pager'
import { OverviewButton, OverviewRecovery, OverviewSkeleton } from '../overview/OverviewUI'
import { DesignDialog } from '../redesign/DesignUI'
import { AddMemberDialog, ByName, CancelEventDialog, DeleteDraftDialog, MoreRow } from './EventActions'
import { ERRORS } from './errors'
import { afterEventChange, afterPersonChange, eventKey, eventsApi, peopleKey } from './eventsApi'
import { SCAN_CONTEXT_KEY, checkInSentence, doorPathFor, eventActions, moreItems, personLine, scanContextFor, scanPathFor, wallNow, whenLine, type CheckInSaid, type MoreItem } from './eventsMath'
import type { EventOptions, EventPerson, LoyaltyEventRow } from './types'
import { EventDetails, EventHeading, EventReward, EventRow } from './design/EventUI'
import { useEventWords } from './design/words'

export function EventPage() {
  const say = useEventWords()
  const { id: param } = useParams(), id = Number(param), valid = Number.isInteger(id) && id > 0
  const one = useQuery({ queryKey: eventKey(id), queryFn: () => eventsApi.one(id), enabled: valid })
  if (!valid || one.isError && !one.data) return <div className="l-ov-page"><Link className="l-ov-link" to="/loyalty/events">{say('back')}</Link><OverviewRecovery onRetry={one.refetch} busy={one.isFetching} forbidden={!valid || failureOf(one.error).status === 403} /></div>
  if (!one.data) return <div className="l-ov-page"><OverviewSkeleton rows={4} /></div>
  return <EventView key={id} event={one.data.event} canChange={one.data.can_change} options={one.data.options} />
}

export function EventView({ event, canChange }: { event: LoyaltyEventRow; canChange: boolean; options: EventOptions }) {
  const { t, i18n } = useTranslation(), say = useEventWords(), boot = useBoot(), navigate = useNavigate(), client = useQueryClient()
  const [params, setParams] = useSearchParams(), page = Math.max(1, Number(params.get('page')) || 1)
  const latestParams = useRef(params)
  useEffect(() => { latestParams.current = params }, [params])
  const [open, setOpen] = useState<null | 'details' | 'add' | 'cancel' | 'delete' | 'publish'>(null), [byName, setByName] = useState(false), [said, setSaid] = useState<CheckInSaid | null>(null)
  const keys = useRef(new Map<number, string>())
  const filters = Object.fromEntries(['q', 'attendance'].flatMap(k => params.get(k) ? [[k, params.get(k)!]] : []))
  const people = useQuery({ queryKey: [...peopleKey(event.id), page, ...(Object.keys(filters).length ? [filters] : [])], queryFn: () => eventsApi.people(event.id, page, { ...filters, per_page: '5' }) })
  const current = people.data?.event ?? event, c = people.data?.counts ?? current.counts
  const can = eventActions(current, canChange, wallNow(venueNow(boot.venue.timezone)))
  const selected = people.data?.people.find(p => String(p.member.id) === params.get('selected')) ?? people.data?.people[0]
  const change = (patch: Record<string, string>, paging = false) => { const next = new URLSearchParams(latestParams.current); if (!paging) { next.delete('page'); next.delete('selected') }; for (const [k,v] of Object.entries(patch)) { if (v) next.set(k,v); else next.delete(k) }; latestParams.current = next; setParams(next, { replace: true }) }
  const checkIn = useMutation({ mutationFn: (member: { id: number; name: string }) => { if (!keys.current.has(member.id)) keys.current.set(member.id, newPressKey()); return eventsApi.checkIn(event.id, member.id, keys.current.get(member.id)!) }, onSuccess: (answer, member) => { keys.current.delete(member.id); setSaid(checkInSentence(answer, member.name, (k, f, v) => t(k, f, v ?? {}), i18n.language)); afterPersonChange(client, event.id, member.id) } })
  const cancelSignup = useMutation({ mutationFn: (id: number) => eventsApi.cancelSignUp(event.id, id), onSuccess: (_, id) => afterPersonChange(client, event.id, id) })
  const publish = useMutation({ mutationFn: () => eventsApi.publish(event.id), onSuccess: () => { afterEventChange(client, event.id); setOpen(null) } })
  const remember = () => { try { localStorage.setItem(SCAN_CONTEXT_KEY, scanContextFor(event.id)) } catch { /* URL carries the context too. */ } }
  const pick = (item: MoreItem) => { if (item === 'edit') navigate(`/loyalty/events/${event.id}/edit`); else setOpen(item) }
  const busy = checkIn.isPending || cancelSignup.isPending
  const award = (p: EventPerson) => !p.checked_in_at ? say('notAwarded') : p.points_reversed ? say('reversed') : p.points_awarded == null ? say('unknownAward') : say('awarded', { n: points(p.points_awarded, i18n.language) })
  const registration = (p: EventPerson) => p.cancelled_at ? t('loyalty.events.person.cancelled', 'Cancelled') : p.signed_up_at ? say('confirmed') : say('notRegistered')
  const performCheckIn = (member: { id: number; name: string }) => { setSaid(null); checkIn.mutate(member) }
  return <div className="l-ov-page l-rd-page l-ev-page">
    <Link className="l-ov-link l-ev-back" to={`/loyalty/events?tab=${event.status === 'draft' ? 'drafts' : event.phase === 'ended' ? 'past' : 'upcoming'}&selected=${event.id}`}>{say('overview')}</Link>
    <EventHeading title={say('attendees')} line={`${current.title} · ${whenLine(current.starts_at, current.ends_at, i18n.language)}`}><OverviewButton type="button" onClick={() => setOpen('details')}>{say('details')}</OverviewButton>{can.checkIn && <Link className="l-ov-button l-ov-primary" onClick={remember} to={scanPathFor(event.id)}>{t('loyalty.overview.scan', 'Scan a member')}</Link>}{can.publish && <OverviewButton type="button" primary onClick={() => setOpen('publish')}>{t('loyalty.events.page.publish', 'Publish')}</OverviewButton>}</EventHeading>
    {current.status === 'draft' && <p className="l-ev-hint">{say('hidden')}</p>}<dl className="l-ev-stats"><div className="l-ov-panel"><dt>{say('registered')}</dt><dd>{points(c.signed_up, i18n.language)}</dd><small>{current.capacity === null ? say('unlimited') : say('places', { n: current.capacity })}</small></div><div className="l-ov-panel"><dt>{say('checkedIn')}</dt><dd>{points(c.checked_in, i18n.language)}</dd><small>{say('attendanceConfirmed')}</small></div><div className="l-ov-panel"><dt>{say('notCheckedIn')}</dt><dd>{c.not_checked_in === undefined ? '—' : points(c.not_checked_in, i18n.language)}</dd><small>{say('stillArrive')}</small></div></dl>
    <div className="l-ev-filters l-ev-attendee-filters"><FormField label={say('findAttendee')}><input type="search" value={filters.q ?? ''} maxLength={120} onChange={e => change({ q: e.target.value })} placeholder={say('findHint')} /></FormField><FormField label={say('attendance')}><select value={filters.attendance ?? 'all'} onChange={e => change({ attendance: e.target.value === 'all' ? '' : e.target.value })}><option value="all">{say('allAttendees')}</option><option value="not_checked_in">{say('notCheckedIn')}</option><option value="checked_in">{say('checkedIn')}</option><option value="walk_in">{t('loyalty.events.page.walk_ins', 'Walk-ins')}</option><option value="cancelled">{t('loyalty.events.person.cancelled', 'Cancelled')}</option></select></FormField></div>
    {checkIn.isError && <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, 'check_in', failureOf(checkIn.error)))}</Notice>}{cancelSignup.isError && <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, 'people', failureOf(cancelSignup.error)))}</Notice>}<div aria-live="polite">{said && <Notice tone={said.tone}>{said.text}{said.points && ` · ${said.points}`}</Notice>}</div>
    {people.isError && <OverviewRecovery onRetry={people.refetch} busy={people.isFetching} />}{!people.data && people.isLoading && <OverviewSkeleton rows={4} />}
    {people.data && <div className="l-ev-columns"><section className="l-ov-panel l-ev-list"><div className="l-ev-list-heading"><h2>{say('attendees')}</h2><small>{say('showing', { n: people.data.people.length, total: people.data.total })}</small></div>{!people.data.people.length && <p className="l-ev-empty">{say('emptyPeople')}</p>}<ul>{people.data.people.map(p => <EventRow key={p.member.id} id={p.member.id} name={p.member.name || p.member.member_number || String(p.member.id)} caption={[p.member.tier?.name, p.member.member_number].filter(Boolean).join(' · ')} value={p.checked_in_at ? personLine(p, (k,f,v) => t(k,f,v ?? {}), current.sign_up) : p.cancelled_at ? registration(p) : say('registered')} status={p.checked_in_at ? award(p) : say('notCheckedIn')} tone={p.checked_in_at && !p.points_reversed ? 'green' : 'amber'} selected={p.member.id === selected?.member.id} onSelect={() => change({ selected: String(p.member.id) }, true)} />)}</ul><Pager page={people.data.page} pages={people.data.pages} onPage={n => change({ page: String(n), selected: '' }, true)} /></section>
      {selected && <section className="l-ov-panel l-ev-detail l-ev-attendee-detail"><div className="l-ev-eyebrow">{say('selectedAttendee')}</div><h2>{selected.member.name}</h2><p>{[selected.member.tier?.name, selected.member.member_number].filter(Boolean).join(' · ')}</p><dl className="l-ev-facts"><dt>{say('registrationLabel')}</dt><dd>{registration(selected)}</dd><dt>{say('attendance')}</dt><dd>{selected.checked_in_at ? personLine(selected, (k,f,v) => t(k,f,v ?? {}), current.sign_up) : say('notCheckedIn')}</dd><dt>{say('eventPoints')}</dt><dd>{award(selected)}</dd></dl>
        {!selected.checked_in_at && <div className="l-ev-inset"><small>{say('afterConfirmation')}</small><strong><EventReward event={current} /></strong><small>{say('once')}</small></div>}
        {can.checkIn && !selected.checked_in_at && <><p>{say('confirmHere', { name: selected.member.name })}</p><OverviewButton type="button" primary disabled={busy} onClick={() => performCheckIn(selected.member)}>{say('confirmCheckIn')}</OverviewButton></>}
        <Link className="l-ov-link" to={`/loyalty/members/${selected.member.id}`}>{say('profile')}</Link><p>{say('alreadyNote')}</p>
        {can.cancelSignUp && selected.signed_up_at && !selected.cancelled_at && !selected.checked_in_at && <OverviewButton type="button" disabled={busy} onClick={() => cancelSignup.mutate(selected.member.id)}>{t('loyalty.events.page.cancel_sign_up', 'Cancel sign-up')}</OverviewButton>}
      </section>}</div>}
    <div className="l-ev-extra-actions">{can.checkIn && <><Link className="l-ov-button" to={doorPathFor(event.id)} onClick={remember}>{t('loyalty.events.page.door_mode', 'Door mode')}</Link><OverviewButton type="button" aria-expanded={byName} onClick={() => setByName(v => !v)}>{t('loyalty.events.page.by_name', 'Check in by name')}</OverviewButton></>}{moreItems(can).length > 0 && <div data-event-more=""><SideMenu kind="menu" place="up" label={t('loyalty.events.page.more', 'More')} named buttonClassName="l-ov-button" face={<MoreHorizontal size={18} aria-hidden />} listClassName="w-56">{moreItems(can).map(item => <MoreRow key={item} item={item} onPick={pick} />)}</SideMenu></div>}</div>
    {byName && can.checkIn && <section className="l-ov-panel l-ev-list"><ByName pending={busy} onCheckIn={performCheckIn} /></section>}
    {open === 'details' && <DesignDialog title={say('details')} onClose={() => setOpen(null)}><div className="l-ev-page"><EventDetails event={current} canChange={canChange} actions={<div className="l-ev-actions">{can.edit && <Link className="l-ov-button" to={`/loyalty/events/${event.id}/edit`}>{say('edit')}</Link>}<OverviewButton type="button" onClick={() => setOpen(null)}>{t('loyalty.overview.close', 'Close')}</OverviewButton></div>} /><p className="l-ev-hint">{say('zone', { zone: boot.venue.timezone })} · {t('loyalty.events.page.walk_ins', 'Walk-ins')}: {c.walk_ins}</p></div></DesignDialog>}
    {open === 'publish' && <DesignDialog title={say('publishTitle')} onClose={() => setOpen(null)} busy={publish.isPending}><p>{say('publishLine')}</p>{publish.isError && <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, 'life', failureOf(publish.error)))}</Notice>}<div className="l-rd-actions"><OverviewButton type="button" primary disabled={publish.isPending} onClick={() => publish.mutate()}>{t('loyalty.events.page.publish', 'Publish')}</OverviewButton></div></DesignDialog>}
    {open === 'add' && <AddMemberDialog event={current} onClose={() => setOpen(null)} />}{open === 'cancel' && <CancelEventDialog event={current} onClose={() => setOpen(null)} />}{open === 'delete' && <DeleteDraftDialog event={current} onClose={() => setOpen(null)} onDeleted={() => navigate('/loyalty/events?tab=drafts')} />}
  </div>
}
