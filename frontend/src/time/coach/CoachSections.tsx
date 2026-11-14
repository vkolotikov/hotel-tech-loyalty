import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Award, HeartHandshake, Layers, ListChecks, Medal, Timer, TrendingDown, TrendingUp, UserRound } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { errorText } from '../lib/errors'
import { duration } from '../lib/format'
import { useRefresh } from '../lib/queries'
import { plannerApi } from '../lib/tasks'
import type { CoachOverview, DurationRow, LearnedPerson, TaskNote, TypeNote } from '../lib/types'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Pill } from '../ui/Pill'
import { useToast } from '../ui/Toast'
import { canUseSuggested, driftTone, speedPct, typicalWrite } from './coachLogic'

const ADVICE_DEFAULTS: Record<DurationRow['advice'], string> = {
  few: 'Too few to say', longer: 'Plan it longer', shorter: 'Plan it shorter', set_typical: 'Write the length down', ok: 'About right',
}

function pctText(t: TFunction, v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : t('time.coach.pct', '{{pct}} %', { pct: v })
}

/**
 * Task lengths (Learning's durations): per type and per task, the planned and the real median, how far reality drifts,
 * the suggested length and what is written down; a manager writes the suggestion down at a press (the typical length the
 * planner and its AI then plan with).
 */
export function DurationsSection({ data, manager }: { data: CoachOverview; manager: boolean }) {
  const { t } = useTranslation()
  const { types, tasks } = data.learning
  if (types.length === 0 && tasks.length === 0) {
    return (
      <Card>
        <EmptyState icon={Timer} title={t('time.coach.no_lengths', 'No finished work to learn from yet')}
          line={t('time.coach.no_lengths_line', 'As the team finishes tasks — better still, times them with Start and Finish — the planner learns how long each kind of work really takes.')} />
      </Card>
    )
  }
  return (
    <div className="space-y-5">
      <Notice tone="info">{t('time.coach.lengths_note', 'Real lengths come from clocked tasks; with fewer than three clocked, the planned length stands in. A length written down is what the planner and the AI plan with.')}</Notice>
      <DurationCard title={t('time.coach.by_type', 'By task type')} icon={Layers} rows={types} kind="type" manager={manager} />
      <DurationCard title={t('time.coach.by_task', 'By task')} icon={ListChecks} rows={tasks} kind="task" manager={manager} />
    </div>
  )
}

function DurationCard({ title, icon, rows, kind, manager }: { title: string; icon: typeof Layers; rows: DurationRow[]; kind: 'type' | 'task'; manager: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const refresh = useRefresh()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const write = useMutation({
    mutationFn: async (row: DurationRow) => {
      // The notes as they are now, so another manager's change is kept; only this row's length changes.
      const settings = await plannerApi.settings()
      const next = typicalWrite(kind === 'type' ? { type_name: row.key, minutes: row.suggested ?? undefined } : { task_key: row.key, minutes: row.suggested ?? undefined },
        (settings.planner_type_notes ?? {}) as Record<string, TypeNote>, (settings.planner_task_notes ?? {}) as Record<string, TaskNote>)
      if (next) await plannerApi.saveSetting(next.key, next.value)
    },
    onSuccess: () => { refresh(); toast(t('time.coach.length_saved', 'Length written down')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  if (rows.length === 0) return null
  return (
    <Card title={title} icon={icon} padded={false}>
      {/* relative: the header's screen-reader-only label is positioned, and must scroll with the table, not widen the page. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-a-border text-left text-xs text-a-text-2">
              <th scope="col" className="px-4 py-2 font-medium">{kind === 'type' ? t('time.coach.col.type', 'Type') : t('time.coach.col.task', 'Task')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('time.coach.col.done', 'Done')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('time.coach.col.planned', 'Planned')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('time.coach.col.real', 'Really took')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('time.coach.col.drift', 'Against plan')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('time.coach.col.suggested', 'Suggested')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('time.coach.col.typical', 'Written down')}</th>
              <th scope="col" className="px-4 py-2 font-medium"><span className="sr-only">{t('time.coach.col.advice', 'Advice')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-a-border">
            {rows.map(row => {
              const tone = driftTone(row.drift_pct)
              return (
                <tr key={row.key}>
                  <th scope="row" className="max-w-[16rem] px-4 py-2.5 text-left font-medium text-a-text"><span className="line-clamp-2 break-words">{row.name}</span></th>
                  <td className="px-3 py-2.5 text-right tabular-nums text-a-text">{row.samples}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-a-text">{duration(row.planned_median, units)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-a-text">
                    {duration(row.real_median, units)}
                    <span className="block text-xs text-a-text-2">{t('time.coach.clocked_n', 'clocked: {{count}}', { count: row.clocked })}</span>
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${tone === 'over' ? 'font-semibold text-a-danger' : tone === 'under' ? 'font-semibold text-a-st-progress' : 'text-a-text-2'}`}>
                    {row.drift_pct === null ? '—' : (
                      <span className="inline-flex items-center gap-1">
                        {tone === 'over' && <TrendingUp size={13} aria-hidden />}{tone === 'under' && <TrendingDown size={13} aria-hidden />}
                        {pctText(t, row.drift_pct)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-a-text">{duration(row.suggested, units)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-a-text-2">{duration(row.typical, units)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <Pill tone={row.advice === 'longer' ? 'danger' : row.advice === 'shorter' ? 'progress' : row.advice === 'set_typical' ? 'pending' : row.advice === 'ok' ? 'success' : 'neutral'}>
                        {t(`time.coach.advice.${row.advice}`, ADVICE_DEFAULTS[row.advice])}
                      </Pill>
                      {manager && canUseSuggested(row) && (
                        <Button size="sm" variant="secondary" onClick={() => write.mutate(row)} loading={write.isPending && write.variables?.key === row.key} disabled={write.isPending}>
                          {t('time.coach.use_length', 'Use {{length}}', { length: duration(row.suggested, units) })}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/**
 * People (Learning's people and leaders): for a manager, who stands out at each type either way and each person's
 * figures against the team; for anyone else, only their own. The server decides who sees whom.
 */
export function PeopleSection({ data, manager }: { data: CoachOverview; manager: boolean }) {
  const { t } = useTranslation()
  const { people, leaders } = data.learning
  if (people.length === 0) {
    return (
      <Card>
        <EmptyState icon={UserRound} title={t('time.coach.no_people', 'No finished work in this period')}
          line={t('time.coach.no_people_line', 'Pick a longer period, or come back once the team has finished some tasks.')} />
      </Card>
    )
  }
  return (
    <div className="space-y-5">
      {manager && leaders.length > 0 && (
        <Card title={t('time.coach.leaders', 'At each type')} icon={Medal} tone="pending"
          description={t('time.coach.leaders_line', 'Who does it best, and who could use support — on time first, then speed against the team.')} padded={false}>
          <ul className="divide-y divide-a-border">
            {leaders.map(l => (
              <li key={l.type} className="grid gap-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                <p className="text-sm font-semibold text-a-text">{l.type}</p>
                <p className="flex min-w-0 items-center gap-2 text-sm">
                  <Award size={15} aria-hidden className="shrink-0 text-a-st-confirmed" />
                  <span className="min-w-0 truncate text-a-text">{l.best.name}</span>
                  <span className="shrink-0 text-xs text-a-text-2">{pctText(t, l.best.on_time_pct)} · {t('time.coach.done_n', 'done: {{count}}', { count: l.best.done })}</span>
                </p>
                {l.people > 1 && l.least.person !== l.best.person ? (
                  <p className="flex min-w-0 items-center gap-2 text-sm">
                    <HeartHandshake size={15} aria-hidden className="shrink-0 text-a-st-pending" />
                    <span className="min-w-0 truncate text-a-text">{l.least.name}</span>
                    <span className="shrink-0 text-xs text-a-text-2">{pctText(t, l.least.on_time_pct)} · {t('time.coach.done_n', 'done: {{count}}', { count: l.least.done })}</span>
                  </p>
                ) : <p className="text-xs text-a-text-2">{t('time.coach.only_one', 'Only one person did this')}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!manager && <Notice tone="info">{t('time.coach.only_yours', 'These are your own figures; how you compare is between you and your manager.')}</Notice>}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {people.map(p => <PersonCard key={p.person} person={p} />)}
      </div>
    </div>
  )
}

function PersonCard({ person }: { person: LearnedPerson }) {
  const { t } = useTranslation()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  return (
    <section className="min-w-0 rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
      <header className="flex items-center gap-3 border-b border-a-border px-4 py-3">
        <Avatar name={person.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-a-text">{person.name}</h3>
          <p className="text-xs text-a-text-2">{t('time.coach.person_line', 'Finished {{done}} of {{tasks}}', { done: person.done, tasks: person.tasks })}</p>
        </div>
      </header>
      <div className="space-y-3 p-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [t('time.coach.on_time', 'On time'), pctText(t, person.on_time_pct)],
            [t('time.coach.completion', 'Finished'), pctText(t, person.completion_pct)],
            [t('time.coach.accuracy_short', 'Real / planned'), pctText(t, person.accuracy_pct)],
            [t('time.coach.late', 'Still open late'), String(person.late_open)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="truncate text-xs text-a-text-2">{label}</dt>
              <dd className="font-a-display text-xl text-a-text">{value}</dd>
            </div>
          ))}
        </dl>
        {(person.strengths.length > 0 || person.support.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {person.strengths.map(s => <Pill key={`s${s}`} tone="success"><TrendingUp size={12} aria-hidden />{s}</Pill>)}
            {person.support.map(s => <Pill key={`n${s}`} tone="pending"><HeartHandshake size={12} aria-hidden />{s}</Pill>)}
          </div>
        )}
        {person.types.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-a-text-2">
                <th scope="col" className="py-1 font-medium">{t('time.coach.col.type', 'Type')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('time.coach.col.done', 'Done')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('time.coach.col.on_time', 'On time / team')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('time.coach.col.speed', 'Speed')}</th>
              </tr>
            </thead>
            <tbody>
              {person.types.slice(0, 6).map(row => {
                const speed = speedPct(row.speed)
                return (
                  <tr key={row.type} className="border-t border-a-border">
                    <th scope="row" className="max-w-[10rem] truncate py-1.5 text-left font-normal text-a-text">{row.type}</th>
                    <td className="py-1.5 text-right tabular-nums text-a-text">{row.done}</td>
                    <td className="py-1.5 text-right tabular-nums text-a-text">{pctText(t, row.on_time_pct)} <span className="text-a-text-2">/ {pctText(t, row.team_on_time_pct)}</span></td>
                    <td className={`py-1.5 text-right tabular-nums ${speed === null ? 'text-a-text-2' : speed >= 15 ? 'text-a-st-confirmed' : speed <= -15 ? 'text-a-st-pending' : 'text-a-text'}`}
                      title={row.median_minutes !== null ? t('time.coach.speed_title', '{{mine}} against the team’s {{team}}', { mine: duration(row.median_minutes, units), team: duration(row.team_median_minutes, units) }) : undefined}>
                      {speed === null ? '—' : t('time.coach.speed', '{{sign}}{{pct}} %', { sign: speed > 0 ? '+' : '', pct: speed })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
