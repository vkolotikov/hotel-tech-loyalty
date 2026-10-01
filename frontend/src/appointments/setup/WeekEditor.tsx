import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { copyToWeekdays, dayDate, dayProblem, toRows, toWeek, WEEK_ORDER, type Week, type Window } from '../lib/hours'
import type { HoursRow } from '../lib/types'
import { formatDate } from '../lib/wallClock'
import { Button } from '../ui/Button'

const timeField = 'w-[5.5rem] rounded-lg border border-a-border bg-a-surface px-2 py-1.5 text-sm text-a-text disabled:bg-a-surface-2'

/** A person's week, Monday first: each day off or one or more time ranges. Saving hands the whole week back. */
export function WeekEditor({ rows, readOnly, locale, saving, onSave }: { rows: HoursRow[]; readOnly: boolean; locale: string; saving: boolean; onSave: (rows: HoursRow[]) => void }) {
  const { t } = useTranslation()
  const [week, setWeek] = useState<Week>(() => toWeek(rows))
  const problems = Object.fromEntries(WEEK_ORDER.map(day => [day, dayProblem(week[day])]))
  const blocked = Object.values(problems).some(Boolean)
  const setDay = (day: number, windows: Window[]) => setWeek(w => ({ ...w, [day]: windows }))
  const change = (day: number, i: number, patch: Partial<Window>) => setDay(day, week[day].map((w, j) => (j === i ? { ...w, ...patch } : w)))

  return (
    <div className="space-y-2">
      {WEEK_ORDER.map(day => {
        const name = formatDate(dayDate(day), locale, { weekday: 'long' })
        const windows = week[day]
        const problem = problems[day]
        return (
          <div key={day} className="flex flex-wrap items-start gap-3 rounded-lg border border-a-border px-3 py-2">
            <span className="w-28 shrink-0 pt-1.5 text-sm font-medium text-a-text">{name}</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              {windows.length === 0 && <span className="block pt-1.5 text-sm text-a-text-2">{t('appointments.setup.hours.off', 'Off')}</span>}
              {windows.map((w, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <label>
                    <span className="sr-only">{name}: {t('appointments.setup.hours.from', 'From')}</span>
                    <input value={w.start} disabled={readOnly} maxLength={5} placeholder="09:00" className={timeField}
                      onChange={(e) => change(day, i, { start: e.target.value })} />
                  </label>
                  <span aria-hidden className="text-a-text-2">–</span>
                  <label>
                    <span className="sr-only">{name}: {t('appointments.setup.hours.to', 'To')}</span>
                    <input value={w.end} disabled={readOnly} maxLength={5} placeholder="17:00" className={timeField}
                      onChange={(e) => change(day, i, { end: e.target.value })} />
                  </label>
                  {!readOnly && (
                    <button type="button" onClick={() => setDay(day, windows.filter((_, j) => j !== i))}
                      aria-label={`${t('appointments.setup.remove', 'Remove')}: ${name} ${w.start}–${w.end}`}
                      className="rounded p-1 text-a-text-2 hover:text-a-danger">
                      <Trash2 size={15} aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {problem && <p className="text-xs text-a-danger">{t(`appointments.setup.hours.problem.${problem}`)}</p>}
            </div>
            {!readOnly && (
              <div className="flex flex-col items-end gap-1">
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-a-accent-deep"
                  onClick={() => setDay(day, [...windows, windows.length > 0 ? { start: windows[windows.length - 1].end, end: windows[windows.length - 1].end } : { start: '09:00', end: '17:00' }])}>
                  <Plus size={13} aria-hidden /> {t('appointments.setup.hours.add_window', 'Add hours')}
                </button>
                {day === 1 && (
                  <button type="button" onClick={() => setWeek(w => copyToWeekdays(w, 1))} className="text-xs font-semibold text-a-accent-deep">
                    {t('appointments.setup.hours.copy_to_weekdays', 'Copy to Monday–Friday')}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {!readOnly && (
        <Button onClick={() => onSave(toRows(week))} disabled={blocked} loading={saving}>{t('appointments.setup.team.save_hours', 'Save hours')}</Button>
      )}
    </div>
  )
}
