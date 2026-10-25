import { useId, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { venueNow } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { serverProblems, toggled } from '../lib/forms'
import { useLook } from '../lib/look'
import { useFirstFocus } from '../lib/useFirstFocus'
import { Check, FormField, Toggle } from '../ui/formParts'
import { TierChip } from '../ui/TierChip'
import { ERRORS } from './errors'
import { afterEventChange, eventsApi } from './eventsApi'
import { EVENT_FIELDS, FIELD_OF, MAX_CAPACITY, MAX_POINTS, bodyOf, counted, durationMinutes, formOf, formProblems, newForm, type EventForm, type Say } from './eventsMath'
import type { EventOptions, LoyaltyEventRow } from './types'
import { PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * New event, or change one (release 8, spec 2026-10-25 §4) — one dialog, in five short sections: When (the day, the
 * start and end on the venue's clock; "Ends on a later day" for a night that runs past midnight or a retreat), Where
 * (one of the venue's places, or a written place), Who (every member, or chosen tiers), What it gives (points, and
 * whether attending counts as a visit), and Sign-up (in the portal, how many places, walk-ins). A new event starts
 * tonight 18:00–21:00 for every member with 50 points; it is saved as a draft or published at once. A published
 * event's change tells the members signed up when its time or place moves.
 */
export function EventDialog({ event, options, onClose }: { event: LoyaltyEventRow | null; options: EventOptions; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const say: Say = (key, fallback, vars) => t(key, fallback, vars ?? {})
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const look = useLook()
  const client = useQueryClient()
  const navigate = useNavigate()
  const first = useFirstFocus<HTMLInputElement>()
  const tiersId = useId()
  const places = options.places.filter(p => p.is_active || p.id === event?.place?.id)
  const [form, setForm] = useState<EventForm>(() => event ? formOf(event) : newForm(venueNow(boot.venue.timezone), places.length > 0))
  const [tried, setTried] = useState(false)
  const key = useMemo(() => newPressKey(), [])
  const tiers = boot.programme.tiers.filter(tier => tier.is_active || form.tier_ids.includes(tier.id))
  const draft = event === null || event.status === 'draft'

  const save = useMutation({
    mutationFn: async (publish: boolean): Promise<LoyaltyEventRow> => {
      const body = bodyOf(form)
      if (event === null) return (await eventsApi.create({ ...body, publish, idempotency_key: key })).event
      const changed = (await eventsApi.update(event.id, body)).event
      return publish && changed.status === 'draft' ? (await eventsApi.publish(event.id)).event : changed
    },
    onSuccess: (saved) => {
      afterEventChange(client, saved.id)
      onClose()
      if (event === null) navigate(`/loyalty/events/${saved.id}`)
    },
  })
  const update = (patch: Partial<EventForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }
  const submit = (publish: boolean) => {
    setTried(true)
    if (Object.keys(formProblems(form)).length === 0) save.mutate(publish)
  }

  const failure = save.isError ? failureOf(save.error) : null
  const fromServer = serverProblems(failure?.fields, EVENT_FIELDS)
  const problems: Record<string, string> = { ...(tried ? formProblems(form) : {}) }
  for (const [field, code] of Object.entries(fromServer)) problems[FIELD_OF[field] ?? field] = code
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.events.problem.${code}`, PROBLEM_WORDS[code] ?? PROBLEM_WORDS.title) : null
  }
  const minutes = durationMinutes(form)
  const whereValue = form.where === 'place' && form.place_id !== null ? `place:${form.place_id}` : form.where
  const told = event?.status === 'published' && event.counts.signed_up > 0

  return (
    <Dialog title={event ? t('loyalty.events.dialog.edit_title', 'Change {{title}}', { title: event.title }) : t('loyalty.events.dialog.new_title', 'New event')}
      onClose={onClose} busy={save.isPending}>
      <form className="space-y-5" noValidate onSubmit={(e) => { e.preventDefault(); submit(false) }}>
        <FormField label={t('loyalty.events.dialog.title', 'What is it?')} problem={problem('title')}>
          <input ref={first} type="text" value={form.title} maxLength={120} onChange={(e) => update({ title: e.target.value })} className={INPUT}
            placeholder={t('loyalty.events.dialog.title_example', 'e.g. Wine tasting, Yoga class, Members’ night')} />
        </FormField>

        <Section title={t('loyalty.events.dialog.when', 'When')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <FormField label={t('loyalty.events.dialog.date', 'Day')} problem={problem('date')}>
                <input type="date" value={form.date} onChange={(e) => update({ date: e.target.value, ...(form.later_day ? {} : { end_date: e.target.value }) })} className={INPUT} />
              </FormField>
            </div>
            <FormField label={t('loyalty.events.dialog.start', 'Starts')} problem={problem('start')}>
              <input type="time" value={form.start} step={300} onChange={(e) => update({ start: e.target.value.slice(0, 5) })} className={INPUT} />
            </FormField>
            <FormField label={t('loyalty.events.dialog.end', 'Ends')} problem={problem('end')}>
              <input type="time" value={form.end} step={300} onChange={(e) => update({ end: e.target.value.slice(0, 5) })} className={INPUT} />
            </FormField>
          </div>
          <Check label={t('loyalty.events.dialog.later_day', 'Ends on a later day')} checked={form.later_day}
            onChange={(on) => update({ later_day: on, end_date: on && form.end_date <= form.date ? form.date : form.end_date })} />
          {form.later_day && (
            <FormField label={t('loyalty.events.dialog.end_date', 'Last day')}>
              <input type="date" value={form.end_date} min={form.date} onChange={(e) => update({ end_date: e.target.value })} className={INPUT} />
            </FormField>
          )}
          <p className="text-xs text-a-text-2">
            {t('loyalty.events.dialog.clock', 'On your venue’s clock ({{zone}}).', { zone: boot.venue.timezone })}
            {minutes !== null && <> {t('loyalty.events.dialog.lasts', 'Lasts {{hours}} h {{minutes}} min.', { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, '0') })}</>}
          </p>
        </Section>

        <Section title={t('loyalty.events.dialog.where', 'Where')}>
          {places.length > 0 && (
            <FormField label={t('loyalty.events.dialog.where_label', 'Place')} problem={problem('place_id')}>
              <select value={whereValue} className={INPUT} onChange={(e) => {
                const v = e.target.value
                if (v.startsWith('place:')) update({ where: 'place', place_id: Number(v.slice(6)) })
                else update({ where: v as EventForm['where'], place_id: null })
              }}>
                {places.map(place => <option key={place.id} value={`place:${place.id}`}>{place.name}</option>)}
                <option value="location">{t('loyalty.events.dialog.elsewhere', 'Somewhere else…')}</option>
                <option value="none">{t('loyalty.events.dialog.nowhere', 'Not said')}</option>
              </select>
            </FormField>
          )}
          {(places.length === 0 || form.where === 'location') && (
            <FormField label={places.length === 0 ? t('loyalty.events.dialog.where_label', 'Place') : t('loyalty.events.dialog.location', 'Where exactly')} problem={problem('location')}
              hint={places.length === 0 ? t('loyalty.events.dialog.location_hint', 'Optional: a room, an address. Places you add under Program can be chosen here.') : undefined}>
              <input type="text" value={form.location} maxLength={200} className={INPUT}
                onChange={(e) => update({ location: e.target.value, where: 'location', place_id: null })}
                placeholder={t('loyalty.events.dialog.location_example', 'e.g. The terrace, 2nd floor')} />
            </FormField>
          )}
        </Section>

        <Section title={t('loyalty.events.dialog.who', 'Who may come')}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('loyalty.events.dialog.who', 'Who may come')}>
            <Toggle on={form.admits === 'all'} onClick={() => update({ admits: 'all' })}>{t('loyalty.events.dialog.every_member', 'Every member')}</Toggle>
            {tiers.length > 0 && <Toggle on={form.admits === 'tiers'} onClick={() => update({ admits: 'tiers' })}>{t('loyalty.events.dialog.chosen_tiers', 'Chosen tiers')}</Toggle>}
          </div>
          {form.admits === 'tiers' && (
            <div role="group" aria-labelledby={tiersId} className="space-y-1.5">
              <p id={tiersId} className="text-xs font-medium text-a-text-2">{t('loyalty.events.dialog.tiers', 'Tiers let in')}</p>
              <div className="flex flex-wrap gap-1.5">
                {tiers.map(tier => (
                  <Toggle key={tier.id} on={form.tier_ids.includes(tier.id)} onClick={() => update({ tier_ids: toggled(form.tier_ids, tier.id) })}>
                    <TierChip tier={tier} theme={look.resolved} size="sm" />
                  </Toggle>
                ))}
              </div>
              {problem('tier_ids') && <p className="text-xs font-medium text-a-danger">{problem('tier_ids')}</p>}
            </div>
          )}
        </Section>

        <Section title={t('loyalty.events.dialog.gives', 'What attending gives')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('loyalty.events.dialog.points', 'Points')} problem={problem('points')}
              hint={t('loyalty.events.dialog.points_hint', 'Given at check-in. 0 for none.')}>
              <input type="number" inputMode="numeric" min={0} max={MAX_POINTS} step={1} value={form.points} onChange={(e) => update({ points: e.target.value })} className={INPUT} />
            </FormField>
          </div>
          <Check label={t('loyalty.events.dialog.visit', 'Counts as a visit')} checked={form.counts_as_visit} onChange={(on) => update({ counts_as_visit: on })}
            hint={t('loyalty.events.dialog.visit_hint', 'A stamp on the stamp card, and progress towards the next tier where tiers go by visits.')} />
        </Section>

        <Section title={t('loyalty.events.dialog.sign_up_section', 'Sign-up')}>
          <Check label={t('loyalty.events.dialog.sign_up', 'Members sign up in the portal')} checked={form.sign_up}
            onChange={(on) => update({ sign_up: on, ...(on ? {} : { walk_ins: true }) })}
            hint={t('loyalty.events.dialog.sign_up_hint', 'They see the event, sign up or cancel; you see who is coming.')} />
          {form.sign_up && (
            <Check label={t('loyalty.events.dialog.walk_ins', 'Walk-ins welcome')} checked={form.walk_ins} onChange={(on) => update({ walk_ins: on })}
              hint={form.walk_ins
                ? t('loyalty.events.dialog.walk_ins_on', 'Members who did not sign up can be checked in while places are left.')
                : t('loyalty.events.dialog.walk_ins_off', 'Only members who signed up get in.')} />
          )}
          {problem('walk_ins') && <p className="text-xs font-medium text-a-danger">{problem('walk_ins')}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('loyalty.events.dialog.capacity', 'Places')} problem={problem('capacity')}
              hint={t('loyalty.events.dialog.capacity_hint', 'Empty: no limit. Each sign-up and each walk-in takes a place.')}>
              <input type="number" inputMode="numeric" min={1} max={MAX_CAPACITY} step={1} value={form.capacity} onChange={(e) => update({ capacity: e.target.value })} className={INPUT}
                placeholder={t('loyalty.events.dialog.no_limit', 'No limit')} />
            </FormField>
          </div>
        </Section>

        <FormField label={t('loyalty.events.dialog.description', 'Description')} problem={problem('description')}
          hint={t('loyalty.events.dialog.description_hint', 'Optional. Members read it in the portal.')}>
          <textarea value={form.description} rows={3} maxLength={2000} onChange={(e) => update({ description: e.target.value })} className={INPUT} />
        </FormField>

        {told && (
          <p className="text-xs text-a-text-2">{t('loyalty.events.dialog.told', 'If the time or place changes, the members signed up get an inbox message and a push.')}{' '}
            <span className="font-medium text-a-text">{counted(say, 'signed_up', event.counts.signed_up, locale)}</span></p>
        )}
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, 'save', failure))}</Notice>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
          {draft ? (
            <>
              <Button type="submit" variant="secondary" loading={save.isPending && save.variables === false}>{t('loyalty.events.dialog.save_draft', 'Save as draft')}</Button>
              <Button type="button" loading={save.isPending && save.variables === true} onClick={() => submit(true)}>{t('loyalty.events.dialog.publish', 'Publish')}</Button>
            </>
          ) : (
            <Button type="submit" loading={save.isPending}>{t('loyalty.events.dialog.save', 'Save changes')}</Button>
          )}
        </div>
      </form>
    </Dialog>
  )
}

/** A short section of the dialog under its heading. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-a-border pt-4">
      <legend className="float-left mb-1 w-full text-xs font-semibold uppercase tracking-wide text-a-text-2">{title}</legend>
      <div className="clear-both space-y-3">{children}</div>
    </fieldset>
  )
}
