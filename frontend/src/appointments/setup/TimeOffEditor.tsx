import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { DateKey, TimeOffBody, TimeOffEntry } from '../lib/types'
import { formatDate } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'

const field = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/** A person's time off from today on, and, for whoever may change it, a range to add. */
export function TimeOffEditor({ entries, canEdit, locale, today, saving, onAdd, onRemove }: {
  entries: TimeOffEntry[]; canEdit: boolean; locale: string; today: DateKey; saving: boolean
  onAdd: (body: TimeOffBody) => void; onRemove: (entryId: number) => void
}) {
  const { t } = useTranslation()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [allDay, setAllDay] = useState(true)
  const [start, setStart] = useState('12:00')
  const [end, setEnd] = useState('13:00')
  const [reason, setReason] = useState('')

  const add = (e: FormEvent) => {
    e.preventDefault()
    onAdd({
      from,
      to: to < from ? from : to,
      ...(allDay ? {} : { start_time: start, end_time: end }),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    })
  }

  return (
    <div className="space-y-3">
      {entries.length === 0
        ? <p className="text-sm text-a-text-2">{t('appointments.setup.time_off.none', 'No time off planned.')}</p>
        : (
          <ul className="divide-y divide-a-border rounded-lg border border-a-border">
            {entries.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-a-text">
                  {formatDate(o.date, locale)} · {o.start_time ? `${o.start_time}–${o.end_time}` : t('appointments.setup.time_off.all_day', 'All day')}
                  {o.reason && <span className="text-a-text-2"> · {o.reason}</span>}
                </span>
                {canEdit && (
                  <button type="button" onClick={() => onRemove(o.id)} disabled={saving} className="text-sm font-semibold text-a-danger">
                    {t('appointments.setup.remove', 'Remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

      {canEdit && (
        <form onSubmit={add} className="grid grid-cols-2 gap-3 rounded-lg border border-a-border p-3">
          <Field label={t('appointments.setup.time_off.from', 'From')}>
            <input type="date" required min={today} value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </Field>
          <Field label={t('appointments.setup.time_off.to', 'To')}>
            <input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm text-a-text">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            {t('appointments.setup.time_off.all_day', 'All day')}
          </label>
          {!allDay && (
            <>
              <Field label={t('appointments.setup.time_off.start', 'Starts')}>
                <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={field} />
              </Field>
              <Field label={t('appointments.setup.time_off.end', 'Ends')}>
                <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
              </Field>
            </>
          )}
          <div className="col-span-2">
            <Field label={t('appointments.setup.time_off.reason', 'Reason')}>
              <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={field} />
            </Field>
          </div>
          <div className="col-span-2">
            <Button type="submit" loading={saving}>{t('appointments.setup.time_off.add', 'Add time off')}</Button>
          </div>
        </form>
      )}
    </div>
  )
}
