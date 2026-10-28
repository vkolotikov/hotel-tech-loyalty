import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { venueNow } from '../../../workspace/lib/wallClock'
import { Notice } from '../../../workspace/ui/Notice'
import { useBoot } from '../../LoyaltyProvider'
import { useLeaveGuard, type EarnGuard } from '../../earn/useLeaveGuard'
import { failureOf, newPressKey } from '../../lib/api'
import { refusalKey } from '../../lib/errors'
import { serverProblems, toggled } from '../../lib/forms'
import { Check, FormField, ToneBadge } from '../../ui/formParts'
import { OverviewButton, OverviewRecovery, OverviewSkeleton } from '../../overview/OverviewUI'
import { DesignDialog, NumberControl } from '../../redesign/DesignUI'
import { useRedesignWords } from '../../redesign/words'
import { afterEventChange, EVENTS_KEY, eventKey, eventsApi } from '../eventsApi'
import { bodyOf, EVENT_FIELDS, FIELD_OF, formOf, formProblems, MAX_CAPACITY, MAX_POINTS, newForm, outsideLine, whenLine, type EventForm } from '../eventsMath'
import { ERRORS } from '../errors'
import { PROBLEM_WORDS } from '../words'
import type { EventOptions, LoyaltyEventRow } from '../types'
import { EventEyebrow, EventHeading, EventReward } from './EventUI'
import { useEventWords } from './words'
import { eventChanges } from './math'

export function EventEditorPage() {
  const { id } = useParams(), guard = useLeaveGuard(), say = useEventWords(), rd = useRedesignWords()
  const existing = id !== undefined, number = Number(id), valid = !existing || Number.isInteger(number) && number > 0
  const one = useQuery({ queryKey: eventKey(number), queryFn: () => eventsApi.one(number), enabled: existing && valid })
  const list = useQuery({ queryKey: [...EVENTS_KEY, 'drafts', 1], queryFn: () => eventsApi.list('drafts', 1), enabled: !existing })
  const data = existing ? one.data : list.data, query = existing ? one : list
  return <>{!valid || query.isError ? <div className="l-ov-page"><OverviewRecovery onRetry={query.refetch} busy={query.isFetching} forbidden={!valid || failureOf(query.error).status === 403} /></div> : !data ? <div className="l-ov-page"><OverviewSkeleton rows={5} /></div> : <EventEditor key={`${id ?? 'new'}:${guard.resetVersion}`} event={one.data?.event ?? null} options={data.options} canChange={data.can_change} guard={guard} />}
    {guard.destination && <DesignDialog title={say('discardTitle')} onClose={guard.keep} busy={guard.busy}><p>{say('discardLine')}</p><div className="l-rd-actions"><OverviewButton type="button" onClick={guard.keep}>{rd('keepEditing')}</OverviewButton><OverviewButton type="button" primary onClick={guard.discard}>{rd('discard')}</OverviewButton></div></DesignDialog>}
  </>
}

export function EventEditor({ event, options, canChange, guard }: { event: LoyaltyEventRow | null; options: EventOptions; canChange: boolean; guard: EarnGuard }) {
  const say = useEventWords(), { t, i18n } = useTranslation(), boot = useBoot(), navigate = useNavigate(), client = useQueryClient()
  const places = options.places.filter(p => p.is_active || p.id === event?.place?.id)
  const [initial] = useState(() => event ? formOf(event) : newForm(venueNow(boot.venue.timezone), places.length > 0))
  const [form, setForm] = useState(initial), [tried, setTried] = useState(false), [review, setReview] = useState(false), [partial, setPartial] = useState(false)
  const key = useRef(newPressKey()), saved = useRef(event)
  const tiers = boot.programme.tiers.filter(tier => tier.is_active || form.tier_ids.includes(tier.id))
  const draft = event === null || event.status === 'draft', manage = canChange && event?.status !== 'cancelled'
  const { mark, begin, end } = guard
  const dirty = JSON.stringify(initial) !== JSON.stringify(form)
  useEffect(() => { mark('event', dirty); return () => mark('event', false) }, [dirty, mark])
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const body = bodyOf(form)
      if (!saved.current) return (await eventsApi.create({ ...body, publish, idempotency_key: key.current })).event
      const changed = (await eventsApi.update(saved.current.id, eventChanges(body, bodyOf(formOf(saved.current))))).event
      saved.current = changed
      afterEventChange(client, changed.id)
      if (publish && changed.status === 'draft') { setPartial(true); return (await eventsApi.publish(changed.id)).event }
      return changed
    },
    onSuccess: updated => { setPartial(false); mark('event', false); afterEventChange(client, updated.id); navigate(`/loyalty/events?tab=${updated.status === 'draft' ? 'drafts' : 'upcoming'}&selected=${updated.id}`) }, onSettled: end,
  })
  const update = (patch: Partial<EventForm>) => { setForm(f => ({ ...f, ...patch })); if (save.isError) save.reset() }
  const submit = (publish: boolean, confirmed = false) => { setTried(true); if (!manage || Object.keys(formProblems(form)).length) return; const intent = uncertain ? save.variables ?? publish : publish; if (intent && !confirmed && !uncertain) { setReview(true); return }; if (begin()) save.mutate(intent) }
  const failure = save.isError ? failureOf(save.error) : null
  // A lost create response may already have committed. Keep its exact body and publication intent for retry.
  const uncertain = event === null && failure !== null && (failure.status === 0 || failure.status >= 500)
  const problems: Record<string, string> = { ...(tried ? formProblems(form) : {}) }
  for (const [field, code] of Object.entries(serverProblems(failure?.fields, EVENT_FIELDS))) problems[FIELD_OF[field] ?? field] = code
  const problem = (field: string) => problems[field] ? t(`loyalty.events.problem.${problems[field]}`, PROBLEM_WORDS[problems[field]] ?? PROBLEM_WORDS.title) : null
  const outside = failure?.code === 'signed_up_outside' ? outsideLine(failure.extra, (k, f, v) => t(k, f, v ?? {}), i18n.language) : null
  const whereValue = form.where === 'place' && form.place_id !== null ? `place:${form.place_id}` : form.where
  const body = bodyOf(form), reward = { points: body.points, counts_as_visit: form.counts_as_visit }
  const who = form.admits === 'all' ? say('allMembers') : tiers.filter(t => form.tier_ids.includes(t.id)).map(t => t.name).join(', ')
  const location = form.where === 'place' ? places.find(p => p.id === form.place_id)?.name : form.where === 'location' ? form.location : ''
  const scheduleValid = !formProblems(form).date && !formProblems(form).start && !formProblems(form).end
  const preview = <><EventEyebrow>{say('preview')}</EventEyebrow><div className="l-ev-inset"><EventEyebrow>{null}</EventEyebrow><h2>{form.title || say('previewTitle')}</h2>{form.description && <p>{form.description}</p>}{scheduleValid && <p>{whenLine(body.starts_at, body.ends_at, i18n.language)}</p>}<p>{location}</p><div className="l-ev-preview-reward"><EventReward event={reward} /></div><small>{say('confirmedAttendance')}</small><span className="l-ov-button l-ov-primary" aria-disabled="true">{form.sign_up ? t('loyalty.events.add.sign_up', 'Sign up') : say('noSignup')}</span></div><p className="l-ev-hint">{who} · {body.capacity === null ? say('unlimited') : say('places', { n: body.capacity })}</p></>
  return <div className="l-ov-page l-rd-page l-ev-page">
    <Link className="l-ov-link l-ev-back" to="/loyalty/events">{say('back')}</Link><EventHeading title={event ? say('edit') : say('createTitle')} line={say('editorLine')}><OverviewButton type="button" disabled={!manage || guard.busy} onClick={() => submit(false)}>{uncertain ? t('loyalty.common.retry', 'Try again') : draft ? say('saveDraft') : t('loyalty.events.dialog.save', 'Save changes')}</OverviewButton></EventHeading>
    {!manage && <Notice>{t('loyalty.events.read_only', 'Managers and staff allowed to manage offers create events.')}</Notice>}
    <form noValidate onSubmit={e => { e.preventDefault(); submit(false) }}><div className="l-ev-columns"><section className="l-ov-panel l-ev-form-panel"><fieldset disabled={!manage || guard.busy || uncertain} className="l-ev-fields">
      <FormField label={say('name')} problem={problem('title')}><input value={form.title} maxLength={120} onChange={e => update({ title: e.target.value })} /></FormField>
      <FormField label={say('description')} problem={problem('description')}><textarea rows={1} value={form.description} maxLength={2000} onChange={e => update({ description: e.target.value })} /></FormField>
      <div className="l-ev-schedule"><span>{say('schedule')}</span><OverviewButton type="button" aria-pressed={!form.later_day} onClick={() => update({ later_day: false })}>{say('single')}</OverviewButton><OverviewButton type="button" aria-pressed={form.later_day} onClick={() => update({ later_day: true, end_date: form.end_date < form.date ? form.date : form.end_date })}>{say('multiple')}</OverviewButton></div>
      <div className="l-ev-grid-two"><FormField label={t('loyalty.events.dialog.start', 'Starts')} problem={problem('date') || problem('start')}><input type="datetime-local" value={`${form.date}T${form.start}`} onChange={e => { const [date, start = ''] = e.target.value.split('T'); update({ date, start: start.slice(0,5), ...(!form.later_day ? { end_date: date } : {}) }) }} /></FormField><FormField label={t('loyalty.events.dialog.end', 'Ends')} problem={problem('end')}><input type="datetime-local" value={`${form.later_day ? form.end_date : form.date}T${form.end}`} onChange={e => { const [date, end = ''] = e.target.value.split('T'); update({ end_date: date, end: end.slice(0,5), later_day: date !== form.date }) }} /></FormField></div>
      <p className="l-ev-hint">{say('zone', { zone: boot.venue.timezone })}</p>
      <div className="l-ev-grid-two"><div className="l-ev-fields"><FormField label={say('location')} problem={problem('place_id')}><select value={whereValue} onChange={e => { const v = e.target.value; update({ where: v.startsWith('place:') ? 'place' : v as EventForm['where'], place_id: v.startsWith('place:') ? Number(v.slice(6)) : null }) }}><option value="place" disabled>{t('loyalty.events.dialog.where_label', 'Place')}</option>{places.map(p => <option key={p.id} value={`place:${p.id}`}>{p.name}</option>)}<option value="location">{t('loyalty.events.dialog.elsewhere', 'Somewhere else…')}</option><option value="none">{t('loyalty.events.dialog.nowhere', 'Not said')}</option></select></FormField>{form.where === 'location' && <FormField label={t('loyalty.events.dialog.location', 'Where exactly')} problem={problem('location')}><input value={form.location} maxLength={200} onChange={e => update({ location: e.target.value })} /></FormField>}</div>
      <div className="l-ev-fields"><FormField label={say('eligibility')} problem={problem('tier_ids')}><select value={form.admits} onChange={e => update({ admits: e.target.value as 'all' | 'tiers' })}><option value="all">{say('allMembers')}</option><option value="tiers">{t('loyalty.events.dialog.chosen_tiers', 'Chosen tiers')}</option></select></FormField>{form.admits === 'tiers' && tiers.map(tier => <Check key={tier.id} label={tier.name} checked={form.tier_ids.includes(tier.id)} onChange={() => update({ tier_ids: toggled(form.tier_ids, tier.id) })} />)}</div>
      <div className="l-ev-fields"><FormField label={say('memberSignup')}><select value={String(form.sign_up)} onChange={e => update({ sign_up: e.target.value === 'true', ...(e.target.value === 'false' ? { walk_ins: true } : {}) })}><option value="true">{say('required')}</option><option value="false">{say('notRequired')}</option></select></FormField>{form.sign_up && <Check label={t('loyalty.events.dialog.walk_ins', 'Walk-ins welcome')} checked={form.walk_ins} onChange={on => update({ walk_ins: on })} />}</div>
      <FormField label={say('capacity')} problem={problem('capacity')} hint={t('loyalty.events.dialog.no_limit', 'No limit')}><NumberControl label={say('capacity')} value={form.capacity} min={1} max={MAX_CAPACITY} onValue={v => update({ capacity: v })} placeholder={t('loyalty.events.dialog.no_limit', 'No limit')} /></FormField>
      <FormField label={say('eventPoints')} problem={problem('points')}><NumberControl label={say('eventPoints')} value={form.points} min={0} max={MAX_POINTS} onValue={v => update({ points: v })} /></FormField><FormField label={t('loyalty.events.dialog.visit', 'Counts as a visit')}><select value={String(form.counts_as_visit)} onChange={e => update({ counts_as_visit: e.target.value === 'true' })}><option value="true">{say('yes')}</option><option value="false">{say('no')}</option></select></FormField></div>
      <div className="l-ev-note"><strong>{say('registration')}</strong><p>{say('registrationLine')}</p></div>
      {event?.status === 'published' && event.counts.signed_up > 0 && <p className="l-ev-hint">{t('loyalty.events.dialog.told', 'If the time or place changes, the members signed up get an inbox message and a push.')}</p>}
    </fieldset>{failure && <Notice tone="danger">{partial && <p>{say('partialSave')}</p>}{t(...refusalKey('loyalty.events', ERRORS, 'save', failure))}{outside && <p>{outside}</p>}</Notice>}</section>
    <aside className="l-ev-stack"><section className="l-ov-panel l-ev-preview">{preview}</section><section className="l-ov-panel l-ev-publication"><ToneBadge tone={draft ? 'pending' : 'approved'}>{draft ? t('loyalty.events.phase.draft', 'Draft') : t('loyalty.events.phase.upcoming', 'Published')}</ToneBadge><h2>{draft ? say('hidden') : say('edit')}</h2><p>{say('reviewLine')}</p><p>{say('publishLine')}</p></section></aside></div>
    <footer className="l-ov-panel l-ev-footer" style={{ marginTop: 16 }}><div><p>{say('finalCheck')}</p><small>{say('draftLine')}</small></div><div className="l-ev-actions"><OverviewButton type="button" disabled={guard.busy} onClick={() => guard.go('/loyalty/events')}>{t('loyalty.common.cancel', 'Cancel')}</OverviewButton><OverviewButton type="button" primary disabled={!manage || guard.busy} onClick={() => submit(draft)}>{uncertain ? t('loyalty.common.retry', 'Try again') : draft ? say('reviewPublish') : t('loyalty.events.dialog.save', 'Save changes')}</OverviewButton></div></footer></form><p className="l-ev-hint">{say('previewOnly')}</p>
    {review && <DesignDialog title={say('publishTitle')} onClose={() => setReview(false)} busy={guard.busy}><div className="l-ev-page"><div className="l-ev-preview">{preview}</div><p>{say('publishLine')}</p>{failure && <Notice tone="danger">{partial && <p>{say('partialSave')}</p>}{t(...refusalKey('loyalty.events', ERRORS, 'save', failure))}{outside && <p>{outside}</p>}</Notice>}<div className="l-ev-actions"><OverviewButton type="button" disabled={guard.busy} onClick={() => setReview(false)}>{t('loyalty.common.cancel', 'Cancel')}</OverviewButton><OverviewButton type="button" primary disabled={guard.busy} onClick={() => submit(true, true)}>{t('loyalty.events.dialog.publish', 'Publish')}</OverviewButton></div></div></DesignDialog>}
  </div>
}
