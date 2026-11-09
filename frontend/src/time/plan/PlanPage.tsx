import { useMemo, useState, type DragEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlarmClock, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, CircleDashed, ClipboardList, Gauge, ListChecks, Plus, StickyNote, UserX, Users, Wand2,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useTimeActions } from '../TimeActions'
import { useBoot } from '../TimeProvider'
import { ReviewCard } from '../ai/ReviewCard'
import { timeApi } from '../lib/api'
import { addDays, weekStart } from '../lib/dates'
import { errorText } from '../lib/errors'
import { dayLabel, duration, planned, weekdayName } from '../lib/format'
import { usePeople, usePersonName, useRefresh } from '../lib/queries'
import { rankSignals, signalText, signalTone } from '../lib/signals'
import { mayDrop, mayGive, rightsOf } from '../lib/rights'
import { assignmentOf, plannerApi } from '../lib/tasks'
import type { Board, Task, Week } from '../lib/types'
import { TaskCard, useGroupColor } from '../task/TaskCard'
import { Card } from '../ui/Card'
import { TextArea } from '../ui/inputs'
import { AiButton } from '../ui/AiButton'
import { Page } from '../ui/Page'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { DayTimeline, DRAG } from './DayTimeline'
import { NOBODY, allTasks, cellOf, lanesOf, readQuery, step, untimedOf, weekPeople, type View } from './boardLogic'
import { PlanDialog } from './PlanDialog'
import { loadState } from './timeline'

/**
 * The Planner (2026-11-09): the team's day as lanes of hours, or its week as a grid of people and days. Drag a task to
 * another time, person or day; press an empty hour to add one; let the AI plan the day (a manager: the whole team) and
 * review it. Everything is the full admin's own planner data, moved through its own endpoints.
 */
export function PlanPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const { openTask, openCapture } = useTimeActions()
  const [search, setSearch] = useSearchParams()
  const q = readQuery(search, boot.venue.today)
  const people = usePeople().data?.people ?? []
  const [chosen, setChosen] = useState<null | 'me' | 'team' | 'person'>(null)
  // Find's "Plan my day with AI" lands here with ?ai=me (or ?ai=team): the dialog opens until it is closed.
  const asked = search.get('ai')
  const planning = chosen ?? (asked === 'team' && boot.staff.can.plan_team ? 'team' : asked === 'me' || asked === 'team' ? 'me' : null)
  const setPlanning = (next: null | 'me' | 'team' | 'person') => {
    setChosen(next)
    if (next === null && asked) {
      const params = new URLSearchParams(search)
      params.delete('ai')
      setSearch(params, { replace: true })
    }
  }
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search)
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v) }
    setSearch(next)
  }

  const move = useMutation({
    mutationFn: ({ task, date, lane, start }: { task: Task; date: string; lane: string | null; start?: string | null }) => {
      const person = lane === null ? undefined : lane === NOBODY ? null : people.find(p => p.key === lane) ?? null
      return plannerApi.move(task.id, {
        task_date: date,
        ...(start !== undefined ? { start_time: start } : {}),
        ...(person !== undefined ? assignmentOf(person) : {}),
      })
    },
    onSuccess: () => { refresh(); toast(t('time.plan.moved', 'Moved')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  // In the `own` planning mode a staff member moves only their own and unassigned work, and only onto their own lane or
  // nobody's (PlanningMode); the server refuses the rest, so the page says so before it asks.
  const rights = rightsOf(boot)
  const tryMove = (task: Task, date: string, lane: string | null, start?: string | null) => {
    if (!mayDrop(rights, task, lane === null ? task.owner : lane === NOBODY ? null : lane)) {
      toast(t('time.errors.own_day_only', 'In this planner everyone plans only their own day. A manager can plan a colleague’s work.'), 'danger')
      return
    }
    move.mutate({ task, date, lane, start })
  }
  const laneFor = (lane: string) => (lane === NOBODY ? '' : mayGive(rights, lane) ? lane : boot.staff.key)

  const title = q.view === 'week'
    ? t('time.plan.week_of', 'Week of {{day}}', { day: dayLabel(weekStart(q.date), i18n.language) })
    : dayLabel(q.date, i18n.language, 'long')
  const personName = usePersonName()(q.person)

  return (
    <Page wide title={t('time.plan.title', 'Planner')} line={personName ? `${title} · ${personName}` : title}
      actions={(
        <>
          {boot.staff.can.plan_team && !q.person && (
            <AiButton onClick={() => setPlanning('team')}><Wand2 size={15} aria-hidden />{t('time.plan.plan_team_ai', 'Plan the team with AI')}</AiButton>
          )}
          {(q.person === null || q.person === boot.staff.key) && (
            boot.staff.can.plan_team
              ? <Button variant="secondary" onClick={() => setPlanning('me')}><Wand2 size={15} aria-hidden />{t('time.plan.plan_me_ai', 'Plan my day with AI')}</Button>
              : <AiButton onClick={() => setPlanning('me')}><Wand2 size={15} aria-hidden />{t('time.plan.plan_me_ai', 'Plan my day with AI')}</AiButton>
          )}
          {q.person && q.person !== boot.staff.key && boot.staff.can.plan_team && (
            <AiButton onClick={() => setPlanning('person')}><Wand2 size={15} aria-hidden />{t('time.plan.plan_person_ai', 'Plan their day with AI')}</AiButton>
          )}
        </>
      )}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-a-border bg-a-surface p-1 shadow-a-sm">
          <button type="button" onClick={() => go({ date: step(q, -1) })} aria-label={t('time.plan.previous', 'Previous')} className="rounded-full p-1.5 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text"><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" onClick={() => go({ date: null })} className={`rounded-full px-3 py-1 text-sm font-semibold ${q.date === boot.venue.today ? 'bg-a-accent text-a-accent-ink' : 'text-a-text hover:bg-a-surface-2'}`}>{t('time.common.today', 'Today')}</button>
          <button type="button" onClick={() => go({ date: step(q, 1) })} aria-label={t('time.plan.next', 'Next')} className="rounded-full p-1.5 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text"><ChevronRight size={16} aria-hidden /></button>
        </div>
        <input type="date" value={q.date} onChange={e => go({ date: e.target.value || null })} aria-label={t('time.plan.pick_day', 'Pick a day')}
          className="rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-sm text-a-text shadow-a-sm" />
        <Tabs<View> label={t('time.plan.view', 'View')} value={q.view} onChange={v => go({ view: v === 'day' ? null : v })}
          items={[{ key: 'day', label: t('time.plan.day', 'Day') }, { key: 'week', label: t('time.plan.week', 'Week') }]} />
        <select value={q.person ?? ''} onChange={e => go({ person: e.target.value || null })} aria-label={t('time.plan.person', 'Person')}
          className="rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-sm text-a-text shadow-a-sm">
          <option value="">{t('time.plan.everyone', 'The whole team')}</option>
          {people.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-a-text-2">
          <input type="checkbox" checked={q.everyone} onChange={e => go({ all: e.target.checked ? '1' : null })} className="h-4 w-4 accent-[rgb(var(--a-accent))]" />
          {t('time.plan.show_off', 'Show people who are off')}
        </label>
      </div>

      {q.view === 'day'
        ? <DayView date={q.date} person={q.person} everyone={q.everyone} onMove={(task, lane, start) => tryMove(task, q.date, lane, start)}
            onCreate={(lane, start) => openTask(null, { task_date: q.date, start_time: start, person: laneFor(lane) })}
            onOpen={task => openTask(task)} onCapture={() => openCapture(q.date)} />
        : <WeekView start={weekStart(q.date)} person={q.person} everyone={q.everyone}
            onMove={(task, date, lane) => tryMove(task, date, lane)}
            onOpenDay={date => go({ view: null, date })} onOpen={task => openTask(task)}
            onCreate={(date, lane) => openTask(null, { task_date: date, person: laneFor(lane) })} />}

      {planning && (
        <PlanDialog date={q.date < boot.venue.today ? boot.venue.today : q.date} scope={planning}
          person={planning === 'person' ? q.person ?? undefined : undefined} onClose={() => setPlanning(null)} />
      )}
      <p className="text-xs text-a-text-2">{t('time.plan.units_note', 'Times are the venue’s ({{zone}}).', { zone: boot.venue.timezone })} {duration(boot.settings.minutes_per_day, units)} {t('time.plan.standard_day', 'is the standard working day.')}</p>
    </Page>
  )
}

function DayView({ date, person, everyone, onMove, onCreate, onOpen, onCapture }: {
  date: string
  person: string | null
  everyone: boolean
  onMove: (task: Task, lane: string, start: string) => void
  onCreate: (lane: string, start: string) => void
  onOpen: (task: Task) => void
  onCapture: () => void
}) {
  const { t, i18n } = useTranslation()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const day = useQuery<Board>({ queryKey: ['time', 'day', date, person], queryFn: () => timeApi.day(date, person), refetchInterval: 60_000 })
  const board = day.data
  const extraNames = useMemo(() => board?.people.map(p => ({ key: p.key, name: p.name })) ?? [], [board])
  const nameOf = usePersonName(extraNames)
  const lanes = board ? lanesOf(board, everyone || person !== null, t('time.plan.nobody', 'Nobody yet')) : []
  const untimed = board ? untimedOf(board) : []
  const tasks = board ? allTasks(board) : []
  const signals = board ? rankSignals(board.signals, 8) : []
  const names = { person: (key: string) => nameOf(key), task: (id: number) => tasks.find(x => x.id === id) }

  return (
    <QueryState loading={day.isLoading} error={day.error} onRetry={() => void day.refetch()}>
      {board && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatTile icon={ListChecks} tone="success" label={t('time.plan.tasks', 'Tasks')} value={`${board.totals.done}/${board.totals.tasks}`} hint={t('time.plan.done_hint', 'done of all')} />
            <StatTile icon={Gauge} tone={loadState(board.totals.load_pct) === 'over' ? 'danger' : 'progress'} label={t('time.plan.team_load', 'Team load')}
              value={board.totals.load_pct !== null ? `${board.totals.load_pct}%` : '—'}
              hint={t('time.plan.load_of', '{{planned}} of {{capacity}}', { planned: planned(board.totals.planned_minutes, units), capacity: duration(board.totals.capacity_minutes, units) })} />
            <StatTile icon={UserX} tone={board.totals.unassigned > 0 ? 'pending' : 'neutral'} label={t('time.plan.unassigned', 'Nobody yet')} value={board.totals.unassigned} hint={t('time.plan.unassigned_hint', 'tasks of the day without a person')} />
            <StatTile icon={CircleDashed} tone="neutral" label={t('time.plan.untimed', 'Without a time')} value={untimed.filter(u => !u.task.done).length} hint={t('time.plan.untimed_hint', 'drag them onto the day')} />
            <StatTile icon={AlarmClock} tone={board.totals.overdue > 0 ? 'danger' : 'neutral'} label={t('time.plan.overdue', 'Overdue')} value={board.totals.overdue}
              hint={board.is_today ? t('time.plan.overdue_hint', 'open from earlier days') : t('time.plan.overdue_today_only', 'counted for today')} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-3">
              {lanes.length === 0
                ? <Card><p className="py-8 text-center text-sm text-a-text-2">{t('time.plan.no_lanes', 'Nobody works this day. Show people who are off to plan for them.')}</p></Card>
                : <DayTimeline lanes={lanes} now={board.is_today ? board.now : null} extra={untimed.map(u => u.task)} onOpen={onOpen} onCreate={onCreate} onMove={onMove} />}
              <p className="text-xs text-a-text-2">{t('time.plan.board_hint', 'Press an empty hour to add a task; drag a task to another time or person, or a task from “Without a time” onto the day.')}</p>
            </div>

            <aside className="min-w-0 space-y-5">
              <Card title={t('time.plan.untimed', 'Without a time')} description={t('time.plan.untimed_line', 'Drag onto a person’s hour, or let the AI fit them in.')} icon={CircleDashed}
                action={<Button size="sm" variant="secondary" onClick={onCapture}>{t('time.plan.add_ai', 'Add with AI')}</Button>}>
                {untimed.length === 0
                  ? <p className="text-sm text-a-text-2">{t('time.plan.untimed_none', 'Every task of the day has its time.')}</p>
                  : (
                    <ul className="space-y-2">
                      {untimed.map(({ task, name }) => (
                        <li key={task.id} draggable onDragStart={(e: DragEvent<HTMLLIElement>) => { e.dataTransfer.setData(DRAG, String(task.id)); e.dataTransfer.effectAllowed = 'move' }} className="cursor-grab">
                          <TaskCard task={task} onOpen={onOpen} compact
                            actions={<span className="max-w-24 truncate rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text-2">{name ?? t('time.plan.nobody', 'Nobody yet')}</span>} />
                        </li>
                      ))}
                    </ul>
                  )}
              </Card>

              {signals.length > 0 && (
                <Card title={t('time.plan.signals', 'Worth a look')} icon={AlarmClock} tone="pending">
                  <ul className="space-y-2">
                    {signals.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${signalTone(s.code) === 'danger' ? 'bg-a-danger' : signalTone(s.code) === 'info' ? 'bg-a-st-progress' : 'bg-a-st-pending'}`} />
                        <span className="text-a-text">{signalText(t, s, names, units)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <ReviewCard ask={{ kind: 'day', date, person }} title={t('time.plan.review', 'AI review of the day')} />

              <DayNoteCard key={`${date}:${board.note ?? ''}`} date={date} note={board.note ?? ''} />

              <Card title={t('time.plan.pool', 'The open pool')} icon={ClipboardList}
                action={<Link to="/time/backlog?tab=pool" className="text-sm font-semibold text-a-accent-text">{t('time.common.all', 'All')}</Link>}>
                <p className="text-sm text-a-text-2">{t('time.plan.pool_line', '{{open}} open, {{day}} due by this day or this week.', { open: board.pool.open, day: board.pool.for_day })}</p>
              </Card>
            </aside>
          </div>
          <p className="sr-only">{dayLabel(date, i18n.language)}</p>
        </div>
      )}
    </QueryState>
  )
}

function DayNoteCard({ date, note }: { date: string; note: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState(note)
  const save = useMutation({
    mutationFn: (value: string) => plannerApi.saveDayNote(date, value),
    onSuccess: () => toast(t('time.common.saved', 'Saved')),
    onError: error => toast(errorText(t, error), 'danger'),
  })
  return (
    <Card title={t('time.today.note', 'Note for the day')} description={t('time.today.note_line', 'Everyone sees it on this day.')} icon={StickyNote}>
      <TextArea rows={3} value={text} onChange={e => setText(e.target.value)} onBlur={() => { if (text !== note) save.mutate(text) }} aria-label={t('time.today.note', 'Note for the day')} />
    </Card>
  )
}

function WeekView({ start, person, everyone, onMove, onOpenDay, onOpen, onCreate }: {
  start: string
  person: string | null
  everyone: boolean
  onMove: (task: Task, date: string, lane: string) => void
  onOpenDay: (date: string) => void
  onOpen: (task: Task) => void
  onCreate: (date: string, lane: string) => void
}) {
  const { t, i18n } = useTranslation()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const color = useGroupColor()
  const week = useQuery<Week>({ queryKey: ['time', 'week', start, person], queryFn: () => timeApi.week(start, person) })
  const [over, setOver] = useState<string | null>(null)
  const data = week.data
  const rows = data ? weekPeople(data, everyone || person !== null) : []
  const byId = useMemo(() => new Map((data?.people ?? []).flatMap(p => p.days.flatMap(d => d.tasks)).concat((data?.unassigned ?? []).flatMap(u => u.tasks)).map(x => [x.id, x])), [data])

  const drop = (e: DragEvent<HTMLDivElement>, date: string, lane: string) => {
    e.preventDefault()
    setOver(null)
    const task = byId.get(Number(e.dataTransfer.getData(DRAG)))
    if (task) onMove(task, date, lane)
  }

  return (
    <QueryState loading={week.isLoading} error={week.error} onRetry={() => void week.refetch()}>
      {data && (
        <div className="time-scroll overflow-x-auto rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
          <div className="grid min-w-[980px]" style={{ gridTemplateColumns: '180px repeat(7, minmax(110px, 1fr))' }}>
            <div className="sticky left-0 z-10 border-b border-r border-a-border bg-a-surface px-3 py-2 text-xs font-semibold text-a-text-2">
              <span className="inline-flex items-center gap-1.5"><Users size={14} aria-hidden />{t('time.plan.people', 'People')}</span>
            </div>
            {data.days.map(d => (
              <button key={d.date} type="button" onClick={() => onOpenDay(d.date)}
                className={`border-b border-r border-a-border px-2 py-2 text-left last:border-r-0 hover:bg-a-surface-2 ${d.is_today ? 'bg-a-accent/10' : ''}`}>
                <span className="block text-xs font-semibold text-a-text">{weekdayName(d.weekday, i18n.language)} {d.date.slice(8)}</span>
                <span className="block text-xs text-a-text-2">{d.totals.load_pct !== null ? `${d.totals.load_pct}%` : '—'} · {d.totals.done}/{d.totals.tasks}</span>
              </button>
            ))}

            {rows.map(p => (
              <div key={p.key} className="contents">
                <div className="sticky left-0 z-10 border-b border-r border-a-border bg-a-surface px-3 py-2">
                  <p className="truncate text-sm font-semibold text-a-text">{p.name}</p>
                  <p className="text-xs text-a-text-2">{planned(p.planned_minutes, units)} / {duration(p.capacity_minutes, units)}{p.load_pct !== null ? ` · ${p.load_pct}%` : ''}</p>
                </div>
                {p.days.map(d => {
                  const cell = cellOf(d.tasks)
                  const state = loadState(d.load_pct)
                  const id = `${p.key}|${d.date}`
                  return (
                    <div key={d.date} role="presentation"
                      onDragOver={e => { e.preventDefault(); setOver(id) }} onDragLeave={() => setOver(null)} onDrop={e => drop(e, d.date, p.key)}
                      // One press on the cell's empty space adds a task for that person and day (a task in it opens instead).
                      onClick={e => { if (e.target === e.currentTarget) onCreate(d.date, p.key) }}
                      className={`group/cell flex min-h-24 cursor-pointer flex-col gap-1 border-b border-r border-a-border p-1.5 last:border-r-0 hover:bg-a-surface-2/40 ${d.works ? '' : 'time-off-hours'} ${over === id ? 'time-drop' : ''}`}>
                      {d.works && d.capacity_minutes > 0 && (
                        <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-a-surface-2">
                          <span className={`block h-full time-load-${state === 'none' ? 'ok' : state}`} style={{ width: `${Math.min(100, d.load_pct ?? 0)}%` }} />
                        </span>
                      )}
                      {cell.shown.map(task => (
                        <button key={task.id} type="button" draggable onDragStart={e => { e.dataTransfer.setData(DRAG, String(task.id)); e.dataTransfer.effectAllowed = 'move' }}
                          onClick={() => onOpen(task)} title={task.title}
                          className={`block w-full truncate rounded-md border border-a-border px-1.5 py-0.5 text-left text-xs ${task.done ? 'text-a-text-2 line-through' : 'text-a-text'}`}
                          style={{ borderLeftColor: color(task.task_group), borderLeftWidth: 3 }}>
                          {task.start_time ? <span className="font-a-mono text-a-text-2">{task.start_time} </span> : null}{task.title}
                        </button>
                      ))}
                      {cell.more > 0 && <button type="button" onClick={() => onOpenDay(d.date)} className="self-start text-xs font-semibold text-a-accent-text">+{cell.more}</button>}
                      <AddInCell label={t('time.plan.add_here', 'Add a task for {{name}} on {{day}}', { name: p.name, day: dayLabel(d.date, i18n.language) })} onClick={() => onCreate(d.date, p.key)} />
                    </div>
                  )
                })}
              </div>
            ))}

            <div className="contents">
              <div className="sticky left-0 z-10 border-r border-a-border bg-a-surface px-3 py-2 text-sm font-semibold text-a-text-2">{t('time.plan.nobody', 'Nobody yet')}</div>
              {data.unassigned.map(u => {
                const cell = cellOf(u.tasks)
                const id = `${NOBODY}|${u.date}`
                return (
                  <div key={u.date} role="presentation" onDragOver={e => { e.preventDefault(); setOver(id) }} onDragLeave={() => setOver(null)} onDrop={e => drop(e, u.date, NOBODY)}
                    onClick={e => { if (e.target === e.currentTarget) onCreate(u.date, NOBODY) }}
                    className={`group/cell flex min-h-16 cursor-pointer flex-col gap-1 border-r border-a-border p-1.5 last:border-r-0 hover:bg-a-surface-2/40 ${over === id ? 'time-drop' : ''}`}>
                    {cell.shown.map(task => (
                      <button key={task.id} type="button" draggable onDragStart={e => { e.dataTransfer.setData(DRAG, String(task.id)); e.dataTransfer.effectAllowed = 'move' }}
                        onClick={() => onOpen(task)} className="block w-full truncate rounded-md border border-dashed border-a-border px-1.5 py-0.5 text-left text-xs text-a-text">{task.title}</button>
                    ))}
                    {cell.more > 0 && <span className="text-xs text-a-text-2">+{cell.more}</span>}
                    <AddInCell label={t('time.plan.add_unassigned', 'Add a task for nobody yet on {{day}}', { day: dayLabel(u.date, i18n.language) })} onClick={() => onCreate(u.date, NOBODY)} />
                  </div>
                )
              })}
            </div>
          </div>
          <p className="flex items-center gap-1.5 border-t border-a-border px-3 py-2 text-xs text-a-text-2">
            <CalendarRange size={13} aria-hidden />{t('time.plan.week_hint', 'Drag a task to another day or person; press a cell’s empty space (or its Add) to add one there; press a day to open it.')}
            <CalendarDays size={13} aria-hidden className="ml-auto" />{addDays(start, 6) && dayLabel(addDays(start, 6), i18n.language)}
          </p>
        </div>
      )}
    </QueryState>
  )
}

/**
 * A cell's own "add" press in the week (2026-11-09: one click, not a double click): at the foot of the cell, shown while
 * the cell is pointed at or focused, and always on a touch screen, where nothing is pointed at.
 */
function AddInCell({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="mt-auto inline-flex items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-xs font-semibold text-a-text-2 opacity-100 hover:bg-a-surface-2 hover:text-a-text focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/cell:opacity-100">
      <Plus size={12} aria-hidden />{t('time.common.add', 'Add')}
    </button>
  )
}
