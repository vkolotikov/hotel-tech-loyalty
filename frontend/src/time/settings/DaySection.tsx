import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Clock, Users } from 'lucide-react'
import { Field } from '../../workspace/ui/Field'
import { useBoot } from '../TimeProvider'
import { errorText } from '../lib/errors'
import { useRefresh } from '../lib/queries'
import { plannerApi } from '../lib/tasks'
import { Card } from '../ui/Card'
import { TextInput } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { SaveBar } from './parts'
import { clockValue, dayChanges, dayFormOf, dayProblem, sameDay, type DayForm, type DayProblem } from './settingsLogic'
import { useDraft } from './useDraft'

/**
 * The working day (the full admin's Workday editor and the venue's day): when the venue's day starts and ends
 * (`business_hours_profile`, which WorkWindow reads as {start, end}), the standard hours a day and days a week
 * (`planner_work_hours_per_day`, `planner_work_days_per_week`). A person's own hours are Team & skills'.
 */
export function DaySection({ can }: { can: boolean }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const saved = useMemo(() => dayFormOf(boot.settings), [boot.settings])
  const draft = useDraft(saved, sameDay)
  const form = draft.value
  const problem = dayProblem(form)
  const set = (key: keyof DayForm, value: string) => draft.set(f => ({ ...f, [key]: value }))

  const save = useMutation({
    mutationFn: async (sent: DayForm) => {
      for (const change of dayChanges(sent, saved)) await plannerApi.saveSetting(change.key, change.value)
    },
    onSuccess: (_, sent) => { draft.sent(sent); refresh(); toast(t('time.common.saved', 'Saved')) },
    onError: error => { refresh(); toast(errorText(t, error), 'danger') },
  })

  const problems: Record<DayProblem, string> = {
    start: t('time.settings.day.problem_start', 'Enter the time the day starts, such as 09:00.'),
    end: t('time.settings.day.problem_end', 'Enter the time the day ends, such as 18:00.'),
    end_before_start: t('time.settings.day.problem_order', 'The day must end after it starts.'),
    hours: t('time.settings.day.problem_hours', 'Hours per day: from 1 to 24, in half hours.'),
    days: t('time.settings.day.problem_days', 'Days per week: a whole number from 1 to 7.'),
  }
  const off = !can || save.isPending

  return (
    <div className="space-y-4">
      <Card title={t('time.settings.day.title', 'The working day')} icon={Clock}
        description={t('time.settings.day.line', 'The venue’s hours and a standard day.')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('time.settings.day.start', 'The day starts')}>
            <TextInput type="time" value={form.start} disabled={off} aria-invalid={problem === 'start' || problem === 'end_before_start' || undefined}
              onChange={e => set('start', clockValue(e.target.value))} />
          </Field>
          <Field label={t('time.settings.day.end', 'The day ends')}>
            <TextInput type="time" value={form.end} disabled={off} aria-invalid={problem === 'end' || problem === 'end_before_start' || undefined}
              onChange={e => set('end', clockValue(e.target.value))} />
          </Field>
          <Field label={t('time.settings.day.hours', 'Standard hours per day')} hint={t('time.settings.day.hours_hint', 'How much work a person is planned for in a day, unless they have their own hours.')}>
            <TextInput type="number" inputMode="decimal" min={1} max={24} step={0.5} value={form.hours} disabled={off} aria-invalid={problem === 'hours' || undefined}
              onChange={e => set('hours', e.target.value)} />
          </Field>
          <Field label={t('time.settings.day.days', 'Working days per week')} hint={t('time.settings.day.days_hint', 'With the hours per day, the weekly target the full admin’s planner reports use.')}>
            <TextInput type="number" inputMode="numeric" min={1} max={7} step={1} value={form.days} disabled={off} aria-invalid={problem === 'days' || undefined}
              onChange={e => set('days', e.target.value)} />
          </Field>
        </div>
        <p className="mt-4 text-sm text-a-text-2">
          {t('time.settings.day.window_line', 'The planner fits work into these hours. Anyone without their own hours works them.')}
        </p>
      </Card>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-a-border bg-a-surface-2/50 p-4">
        <Users size={18} aria-hidden className="shrink-0 text-a-text-2" />
        <p className="min-w-0 flex-1 text-sm text-a-text">{t('time.settings.day.people_line', 'Each person’s own hours, working days and break are set on Team & skills.')}</p>
        <Link to="/time/team" className="text-sm font-semibold text-a-accent-text">{t('time.settings.day.open_team', 'Open Team & skills')}</Link>
      </div>

      {can && draft.dirty && (
        <SaveBar problem={problem ? problems[problem] : null} busy={save.isPending} onDiscard={draft.reset} onSave={() => save.mutate(form)} />
      )}
    </div>
  )
}
