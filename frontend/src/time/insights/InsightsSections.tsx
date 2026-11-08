import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarDays, Clock3, Inbox, Layers, Users } from 'lucide-react'
import { useBoot } from '../TimeProvider'
import { dayLabel, hours, weekdayName } from '../lib/format'
import type { Insights } from '../lib/types'
import { LookTile } from '../settings/parts'
import { lookOf } from '../settings/settingsLogic'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { Pill } from '../ui/Pill'
import { Columns, LoadBar, ShareBar } from './charts'
import {
  accuracyNote, barShare, dayBars, groupRows, hourRows, instantDay, labelled, peopleRows, poolRows, shortDay, weekdayRows, type PoolBucket,
} from './insightsLogic'

/**
 * Insights' three sections. People: each person's tasks, done, finished and on-time shares, planned time against what
 * they could work (the load bar), clocked time, late and overdue — a press opens their plan. Work: the task types with
 * planned and clocked time and the estimate accuracy, and when work happens (weekdays, start hours). Days: each day's
 * planned and finished time, and the pool's ages now. Every number is the server's (TimeInsights).
 */

function useWords() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const h = t('time.common.h', 'h')
  return {
    t,
    lang,
    hrs: (minutes: number) => `${hours(minutes, lang)} ${h}`,
    pct: (value: number | null | undefined) => (value === null || value === undefined ? '—' : t('time.insights.pct', '{{pct}} %', { pct: value })),
  }
}

const planOf = (key: string) => `/time/plan?person=${encodeURIComponent(key)}`

/* ─── People ─────────────────────────────────────────────────────── */

export function PeopleSection({ data }: { data: Insights }) {
  const { t, hrs, pct } = useWords()
  const rows = peopleRows(data.people)
  const loadLabel = (p: (typeof rows)[number]) => t('time.insights.load_aria', 'Load {{pct}}: {{planned}} planned of {{capacity}}', { pct: pct(p.load_pct), planned: hrs(p.planned_minutes), capacity: hrs(p.capacity_minutes) })

  return (
    <Card title={t('time.insights.people_title', 'People')} icon={Users} padded={false}
      description={t('time.insights.people_line', 'Most planned first. Press one for their plan.')}>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-a-text-2">{t('time.insights.people_none', 'Nobody had work or working hours in this period.')}</p>
      ) : (
        <>
          {/* A wide screen: one row a person. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-a-border text-left text-xs text-a-text-2">
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('time.insights.col_person', 'Person')}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('time.insights.col_tasks', 'Tasks')}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('time.insights.col_done', 'Done')}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('time.insights.col_finished', 'Finished')}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('time.insights.col_on_time', 'On time')}</th>
                  <th scope="col" className="w-56 px-3 py-2.5 font-medium">{t('time.insights.col_load', 'Planned of their time')}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('time.insights.col_clocked', 'Clocked')}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('time.insights.col_late', 'Late · overdue')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.key} className="border-b border-a-border last:border-0 hover:bg-a-surface-2/50">
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      <Link to={planOf(p.key)} className="inline-flex max-w-56 items-center gap-2 font-semibold text-a-text hover:text-a-accent-text"
                        aria-label={t('time.insights.open_plan', 'Open the plan of {{name}}', { name: p.name })}>
                        <Avatar name={p.name} size="sm" /><span className="truncate">{p.name}</span>
                      </Link>
                    </th>
                    <td className="px-3 py-2.5 text-right tabular-nums text-a-text">{p.tasks}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-a-text">{p.done}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-a-text">{pct(p.completion_pct)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-a-text">{pct(p.on_time_pct)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-a-text-2">
                        <span className="tabular-nums">{t('time.insights.planned_of', '{{planned}} of {{capacity}}', { planned: hrs(p.planned_minutes), capacity: hrs(p.capacity_minutes) })}</span>
                        <span className="font-semibold tabular-nums text-a-text">{pct(p.load_pct)}</span>
                      </div>
                      <div className="mt-1"><LoadBar pct={p.load_pct} label={loadLabel(p)} /></div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-a-text">{hrs(p.tracked_minutes)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${p.late + p.overdue > 0 ? 'text-a-danger' : 'text-a-text-2'}`}>{p.late} · {p.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* A phone or a tablet: a card a person. */}
          <ul className="divide-y divide-a-border lg:hidden">
            {rows.map(p => (
              <li key={p.key}>
                <Link to={planOf(p.key)} className="block space-y-2.5 p-4 hover:bg-a-surface-2/50" aria-label={t('time.insights.open_plan', 'Open the plan of {{name}}', { name: p.name })}>
                  <span className="flex items-center gap-2">
                    <Avatar name={p.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-a-text">{p.name}</span>
                    <span className="text-sm font-semibold tabular-nums text-a-text">{pct(p.load_pct)}</span>
                    <ArrowRight size={15} aria-hidden className="shrink-0 text-a-text-2" />
                  </span>
                  <LoadBar pct={p.load_pct} label={loadLabel(p)} />
                  <span className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-a-text-2">
                    <span>{t('time.insights.card_tasks', '{{done}} of {{tasks}} done', { done: p.done, tasks: p.tasks })}</span>
                    <span>{t('time.insights.card_planned', 'Planned {{planned}} of {{capacity}}', { planned: hrs(p.planned_minutes), capacity: hrs(p.capacity_minutes) })}</span>
                    <span>{t('time.insights.card_finished', 'Finished {{pct}}', { pct: pct(p.completion_pct) })}</span>
                    <span>{t('time.insights.card_on_time', 'On time {{pct}}', { pct: pct(p.on_time_pct) })}</span>
                    <span>{t('time.insights.card_clocked', 'Clocked {{clocked}}', { clocked: hrs(p.tracked_minutes) })}</span>
                    <span className={p.late + p.overdue > 0 ? 'text-a-danger' : ''}>{t('time.insights.card_late', '{{late}} late · {{overdue}} overdue', { late: p.late, overdue: p.overdue })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

/* ─── Work ───────────────────────────────────────────────────────── */

export function WorkSection({ data }: { data: Insights }) {
  const { t, lang, hrs, pct } = useWords()
  const boot = useBoot()
  const groups = groupRows(data.groups)
  const maxPlanned = Math.max(0, ...groups.map(g => g.planned_minutes))
  const weekdays = weekdayRows(data.weekdays)
  const maxWeekday = Math.max(0, ...weekdays.map(w => w.minutes))
  const hourList = hourRows(data.hours, boot.settings.window)
  const maxHour = Math.max(0, ...hourList.map(h => h.tasks))

  return (
    <div className="space-y-5">
      <Card title={t('time.insights.types_title', 'Task types')} icon={Layers}
        description={t('time.insights.types_line', 'Planned and clocked time by type.')}>
        {groups.length === 0 ? <p className="text-sm text-a-text-2">{t('time.insights.types_none', 'No work in this period.')}</p> : (
          <ul className="divide-y divide-a-border">
            {groups.map(g => {
              const name = g.task_group ?? t('time.insights.no_type', 'No type')
              const look = lookOf(g.task_group, boot.settings.groups)
              const note = accuracyNote(g.accuracy_pct)
              return (
                <li key={g.task_group ?? ''} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <LookTile icon={g.task_group ? look.icon : 'clipboard-list'} color={g.task_group ? look.color : '#94a3b8'} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-a-text">{name}</p>
                      <p className="text-xs text-a-text-2">{t('time.insights.type_done', '{{done}} of {{tasks}} done', { done: g.done, tasks: g.tasks })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-a-text">{t('time.insights.type_planned', '{{planned}} planned', { planned: hrs(g.planned_minutes) })}</p>
                      <p className="text-xs tabular-nums text-a-text-2">{t('time.insights.type_clocked', '{{clocked}} clocked', { clocked: hrs(g.tracked_minutes) })}</p>
                    </div>
                  </div>
                  <ShareBar share={barShare(g.planned_minutes, maxPlanned)} label={t('time.insights.type_aria', '{{name}}: {{planned}} planned', { name, planned: hrs(g.planned_minutes) })} />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-a-text-2">
                    <span>{g.accuracy_pct !== null
                      ? t('time.insights.type_accuracy', 'Accuracy {{pct}}', { pct: pct(g.accuracy_pct) })
                      : t('time.insights.type_not_clocked', 'Not clocked yet')}</span>
                    {note === 'longer' && <Pill tone="pending">{t('time.insights.takes_longer', 'Takes longer than planned')}</Pill>}
                    {note === 'shorter' && <Pill tone="progress">{t('time.insights.takes_less', 'Takes less than planned')}</Pill>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {groups.length > 0 && (
          <p className="mt-3 border-t border-a-border pt-3 text-xs text-a-text-2">
            {t('time.insights.accuracy_line', 'Accuracy is clocked time against planned, over the tasks that were clocked: above 100 % took longer than planned.')}
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('time.insights.weekdays_title', 'By weekday')} icon={CalendarDays}
          description={t('time.insights.weekdays_line', 'Planned time on each weekday of the period.')}>
          <Columns label={t('time.insights.weekdays_title', 'By weekday')} items={weekdays.map(w => ({
            key: String(w.weekday),
            label: weekdayName(w.weekday, lang),
            height: barShare(w.minutes, maxWeekday),
            value: w.minutes > 0 ? hrs(w.minutes) : '',
            aria: t('time.insights.weekday_aria', '{{day}}: {{planned}} planned, {{done}} of {{tasks}} tasks done', {
              day: weekdayName(w.weekday, lang, 'long'), planned: hrs(w.minutes), done: w.done, tasks: w.tasks,
            }),
          }))} />
        </Card>

        <Card title={t('time.insights.hours_title', 'When work starts')} icon={Clock3}
          description={t('time.insights.hours_line', 'Tasks with a time, by the hour they start.')}>
          {hourList.length === 0
            ? <p className="text-sm text-a-text-2">{t('time.insights.hours_none', 'No task had a start time in this period.')}</p>
            : (
              <Columns label={t('time.insights.hours_title', 'When work starts')} values={hourList.length <= 16} items={hourList.map((h, i) => ({
                key: h.label,
                label: h.label,
                showLabel: hourList.length <= 12 || i % 2 === 0,
                height: barShare(h.tasks, maxHour),
                value: h.tasks > 0 ? String(h.tasks) : '',
                aria: t('time.insights.hour_aria', 'From {{hour}}:00: {{count}} task(s)', { hour: h.label, count: h.tasks }),
              }))} />
            )}
        </Card>
      </div>
    </div>
  )
}

/* ─── Days ───────────────────────────────────────────────────────── */

const POOL_FILL: Record<PoolBucket, string> = {
  d0: 'bg-a-st-confirmed',
  d1: 'bg-a-st-progress',
  d3: 'bg-a-st-pending',
  d7: 'bg-a-danger',
}

export function DaysSection({ data }: { data: Insights }) {
  const { t, lang, hrs } = useWords()
  const boot = useBoot()
  const bars = dayBars(data.by_day)
  const shown = labelled(bars.length, 6)
  const pool = poolRows(data.pool)
  const poolLabels: Record<PoolBucket, string> = {
    d0: t('time.insights.pool_d0', 'Under a day'),
    d1: t('time.insights.pool_d1', '1 to 3 days'),
    d3: t('time.insights.pool_d3', '3 to 7 days'),
    d7: t('time.insights.pool_d7', 'Over a week'),
  }
  const oldest = instantDay(data.pool.oldest, boot.venue.timezone)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card title={t('time.insights.days_title', 'Day by day')} icon={CalendarDays}
        description={t('time.insights.days_line', 'Planned each day; darker is finished.')}>
        <Columns label={t('time.insights.days_title', 'Day by day')} tall="h-44" items={bars.map((d, i) => ({
          key: d.date,
          label: shortDay(d.date, lang),
          showLabel: shown[i],
          height: d.height,
          inner: d.doneHeight,
          value: d.planned > 0 ? hrs(d.planned) : '',
          strong: d.date === boot.venue.today,
          aria: t('time.insights.day_aria', '{{day}}: {{planned}} planned, {{done}} of {{tasks}} tasks done', {
            day: dayLabel(d.date, lang, 'long'), planned: hrs(d.planned), done: d.done, tasks: d.tasks,
          }),
        }))} />
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-a-text-2">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-sm bg-a-accent/25" />{t('time.insights.legend_planned', 'Planned')}</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-sm bg-a-accent" />{t('time.insights.legend_finished', 'Finished')}</span>
        </div>
      </Card>

      <Card title={t('time.insights.pool_title', 'The pool now')} icon={Inbox}
        description={t('time.insights.pool_line', 'Work with no day and nobody yet, by age.')}
        action={<Link to="/time/backlog" className="text-sm font-semibold text-a-accent-text">{t('time.insights.open_pool', 'Open')}</Link>}>
        {data.pool.open === 0 ? (
          <p className="text-sm text-a-text-2">{t('time.insights.pool_empty', 'The pool is empty: nothing is waiting.')}</p>
        ) : (
          <div className="space-y-4">
            <p className="flex items-baseline gap-2">
              <span className="font-a-display text-3xl leading-none text-a-text">{data.pool.open}</span>
              <span className="text-sm text-a-text-2">{t('time.insights.pool_open', 'open')}</span>
            </p>
            <div role="img" aria-label={pool.map(r => `${poolLabels[r.key]}: ${r.count}`).join(', ')} className="flex h-3 overflow-hidden rounded-full bg-a-surface-2">
              {pool.filter(r => r.count > 0).map(r => <span key={r.key} className={`block h-full ${POOL_FILL[r.key]}`} style={{ width: `${r.share}%` }} />)}
            </div>
            <ul className="grid grid-cols-2 gap-3">
              {pool.map(r => (
                <li key={r.key} className="flex items-start gap-2">
                  <span aria-hidden className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${POOL_FILL[r.key]}`} />
                  <span className="min-w-0">
                    <span className="block text-xs text-a-text-2">{poolLabels[r.key]}</span>
                    <span className="block text-lg font-semibold tabular-nums text-a-text">{r.count}</span>
                  </span>
                </li>
              ))}
            </ul>
            {oldest && <p className="text-xs text-a-text-2">{t('time.insights.pool_oldest', 'The oldest has waited since {{day}}.', { day: dayLabel(oldest, lang, 'long') })}</p>}
          </div>
        )}
      </Card>
    </div>
  )
}
