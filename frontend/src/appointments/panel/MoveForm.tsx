import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { appointmentsApi } from '../lib/api'
import type { AppointmentDetail, CalendarMaster, CatalogueService, DateKey, Wall } from '../lib/types'
import { dateOf, timeOf } from '../lib/wallClock'
import { useVocab } from '../lib/vocab'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { lengthBody, lengthChoices, lengthLabel, type LengthChoice } from './lengths'
import type { PanelError } from './panelState'
import { TellClient } from './TellClient'

interface Props {
  booking: AppointmentDetail
  masters: CalendarMaster[]
  services: CatalogueService[]
  today: DateKey
  saving: boolean
  error: PanelError | null
  /** "Tell the client by email" (Part D). */
  tell: boolean
  onTell: (tell: boolean) => void
  onMove: (start: Wall, masterId: number, length: { length?: number; normal_length?: boolean }) => void
  onBack: () => void
}

const control = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Move by choosing a day, a person, a length and one of the server's free
 * times — the click-only way to reschedule and to change the length (Part
 * F's drag does the same through the same request). The free times already
 * leave this appointment out, so its own slot is offered, and they fit the
 * chosen length.
 */
export function MoveForm({ booking, masters, services, today, saving, error, tell, onTell, onMove, onBack }: Props) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const [date, setDate] = useState<DateKey>(dateOf(booking.start) < today ? today : dateOf(booking.start))
  const [masterId, setMasterId] = useState<number | null>(booking.master?.id ?? null)
  const [start, setStart] = useState<Wall | ''>('')
  // Part F: the length the moved appointment will have; it starts at the staff-set length, if any.
  const [length, setLength] = useState<LengthChoice>(booking.length_set_by_staff ? booking.duration_minutes : 'normal')
  const lengthParam = length === 'normal' ? undefined : length

  const service = services.find(s => s.id === booking.service?.id) ?? null
  const eligible = masters.filter(m => service === null || service.master_ids.includes(m.id))

  const slots = useQuery({
    queryKey: ['appointments', 'slots', booking.service?.id ?? null, masterId, date, booking.id, lengthParam],
    queryFn: () => appointmentsApi.slots(booking.service!.id, masterId!, date, booking.id, lengthParam),
    enabled: booking.service !== null && masterId !== null,
  })
  const chosen = slots.data?.slots.find(s => s.start === start) ?? null

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (chosen && masterId !== null && !saving) onMove(chosen.start, masterId, lengthBody(length, booking.length_set_by_staff ?? false)) }}>
      <div>
        <div className="text-base font-semibold text-a-text">{t('appointments.action.move', 'Move')}</div>
        <div className="text-sm text-a-text-2">{booking.client.name} · {timeOf(booking.start)} – {timeOf(booking.end)}</div>
      </div>

      <Field label={t('appointments.panel.date', 'Date')}>
        <input type="date" className={control} min={today} value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setStart('') } }} />
      </Field>
      <Field label={vocab('team_member')}>
        <select className={control} value={masterId ?? ''} onChange={(e) => { setMasterId(e.target.value ? Number(e.target.value) : null); setStart('') }}>
          {eligible.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label={t('appointments.panel.length', 'Length')}>
        <select className={control} value={String(length)} onChange={(e) => { setLength(e.target.value === 'normal' ? 'normal' : Number(e.target.value)); setStart('') }}>
          <option value="normal">{slots.data
            ? t('appointments.panel.length_normal_minutes', 'Normal length ({{minutes}} min)', { minutes: slots.data.duration_minutes })
            : t('appointments.panel.length_normal', 'Normal length')}</option>
          {lengthChoices().map(n => { const l = lengthLabel(n); return <option key={n} value={n}>{t(l.key, l.fallback, l.vars)}</option> })}
        </select>
      </Field>
      <Field label={t('appointments.panel.time', 'Time')}>
        <select className={control} value={chosen ? start : ''} disabled={!slots.data} onChange={(e) => setStart(e.target.value)}>
          <option value="">{slots.isFetching ? t('appointments.common.loading', 'Loading…') : t('appointments.panel.choose_time', 'Choose a time…')}</option>
          {slots.data?.slots.map(s => <option key={s.start} value={s.start}>{s.label}</option>)}
        </select>
      </Field>
      {slots.data && slots.data.slots.length === 0 && <Notice tone="info">{t('appointments.panel.no_slots', 'No free time on this day for this service and team member.')}</Notice>}
      {chosen && <p className="text-sm text-a-text">{t('appointments.panel.move_to', 'New time: {{start}} – {{end}}', { start: timeOf(chosen.start), end: timeOf(chosen.end) })}</p>}

      <TellClient email={booking.client_email ?? null} checked={tell} onChange={onTell} />
      {error &&<Notice tone="danger">{t(`appointments.error.${error.code}`, error.message)}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!chosen} loading={saving}>{t('appointments.panel.save_move', 'Move appointment')}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onBack}>{t('appointments.common.back', 'Back')}</Button>
      </div>
    </form>
  )
}
