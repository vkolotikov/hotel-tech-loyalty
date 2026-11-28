import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlarmClock, ArrowRight, CalendarCheck, CircleDashed, Inbox, Pause, Play, Plus, Sparkles, StickyNote, Timer, Wand2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useTimeActions } from '../TimeActions'
import { useBoot } from '../TimeProvider'
import { VoiceButton } from '../ai/VoiceButton'
import { ReviewCard } from '../ai/ReviewCard'
import { timeApi } from '../lib/api'
import { addDays } from '../lib/dates'
import { errorText } from '../lib/errors'
import { clockOf, dayLabel, duration, firstName, planned, weekdayName } from '../lib/format'
import { useRefresh } from '../lib/queries'
import { rankSignals, signalText, signalTone } from '../lib/signals'
import { assignmentOf, plannerApi } from '../lib/tasks'
import type { Task } from '../lib/types'
import { DayTimeline } from '../plan/DayTimeline'
import { PlanDialog } from '../plan/PlanDialog'
import { TaskCard, useTaskActions } from '../task/TaskCard'
import { Card } from '../ui/Card'
import { TextArea, TextInput } from '../ui/inputs'
import { AiButton } from '../ui/AiButton'
import { Page } from '../ui/Page'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'
import { useToast } from '../ui/Toast'
import { partOfDay, progressOf, timed, untimed, weekHeights } from './todayLogic'
import { PulseCard, PulseFact } from '../../workspace/pulse/PulseCard'

/**
 * My day (2026-11-09): what I am on now and next, my day on the clock, what has no time yet, what is overdue, what the
 * pool offers, the week at a glance and the day's note — with the quickest ways to add work (type it, say it, or let the
 * AI read it) and to plan the day with the AI.
 */
export function TodayPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const { openTask, openCapture } = useTimeActions()
  const today = useQuery({ queryKey: ['time', 'today'], queryFn: () => timeApi.today(), refetchInterval: 60_000 })
  // The venue's clock and weather for the card at the top (2026-11-09); the page stands without it.
  const pulse = useQuery({ queryKey: ['time', 'pulse'], queryFn: () => timeApi.pulse(), staleTime: 10 * 60_000, refetchInterval: 15 * 60_000, retry: false })
  const [planning, setPlanning] = useState(false)
  const [quick, setQuick] = useState('')
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const data = today.data
  const me = data?.me ?? null
  const { clock } = useTaskActions()
  const lane = { key: boot.staff.key, user_id: boot.staff.id, name: boot.staff.name }

  const add = useMutation({
    mutationFn: (title: string) => plannerApi.create({ title, task_date: boot.venue.today, priority: 'Normal', ...assignmentOf(lane) }),
    onSuccess: () => { setQuick(''); refresh(); toast(t('time.task.created', 'Task added')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const move = useMutation({
    mutationFn: ({ task, date, start }: { task: Task; date: string | null; start?: string | null }) =>
      plannerApi.move(task.id, { task_date: date, ...(start !== undefined ? { start_time: start } : {}), ...assignmentOf(lane) }),
    onSuccess: refresh,
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const take = useMutation({
    mutationFn: async (task: Task) => { await plannerApi.claim(task.id); return plannerApi.move(task.id, { task_date: boot.venue.today, ...assignmentOf(lane) }) },
    onSuccess: () => { refresh(); toast(t('time.today.taken', 'Added to your day')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const greeting = {
    morning: t('time.today.morning', 'Good morning, {{name}}', { name: firstName(boot.staff.name) }),
    afternoon: t('time.today.afternoon', 'Good afternoon, {{name}}', { name: firstName(boot.staff.name) }),
    evening: t('time.today.evening', 'Good evening, {{name}}', { name: firstName(boot.staff.name) }),
  }[partOfDay(data?.now ?? null)]
  const progress = progressOf(me)
  const next = data?.next ?? null
  const signals = rankSignals(data?.signals ?? [], 5)
  const allTasks = [...(me?.tasks ?? []), ...(me?.overdue ?? [])]
  const names = { person: () => boot.staff.name, task: (id: number) => allTasks.find(x => x.id === id) }

  return (
    <Page title={greeting} line={`${dayLabel(boot.venue.today, i18n.language, 'long')}${data?.now ? ` · ${data.now}` : ''}`}
      actions={(
        <AiButton onClick={() => setPlanning(true)}>
          <Wand2 size={15} aria-hidden />{t('time.today.plan', 'Plan my day with AI')}
        </AiButton>
      )}>
      <PulseCard pulse={pulse.data} greet={false}>
        {data?.next && (
          <>
            {data.next && <PulseFact value={data.next.start_time ? data.next.start_time.slice(0, 5) : '·'} label={`${t('time.today.next', 'Up next')}: ${data.next.title}`} />}
          </>
        )}
      </PulseCard>
      <QueryState loading={today.isLoading} error={today.error} onRetry={() => void today.refetch()}>
        {data && (
          <div className="space-y-5">
            {/* Add work the quickest way: type and press Enter, speak, or hand it to the AI. */}
            <form className="flex flex-wrap items-center gap-2 rounded-2xl border border-a-border bg-a-surface p-2 shadow-a-sm"
              onSubmit={e => { e.preventDefault(); if (quick.trim()) add.mutate(quick.trim()) }}>
              <Plus size={18} aria-hidden className="ml-2 shrink-0 text-a-text-2" />
              <TextInput value={quick} onChange={e => setQuick(e.target.value)} maxLength={200} aria-label={t('time.today.quick', 'Add a task for today')}
                placeholder={t('time.today.quick_hint', 'Add a task for today and press Enter…')} className="min-w-0 flex-1 border-0! shadow-none! focus:ring-0!" />
              <button type="button" onClick={() => openCapture(boot.venue.today, quick)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold time-ai-soft">
                <Sparkles size={15} aria-hidden /><span className="hidden sm:inline">{t('time.today.with_ai', 'With AI')}</span>
              </button>
              {boot.features.voice && <VoiceButton big language={i18n.language} onText={words => openCapture(boot.venue.today, words)} label={t('time.today.speak', 'Say what needs doing')} />}
            </form>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile icon={CalendarCheck} tone="success" label={t('time.today.done', 'Done today')} value={`${progress.done}/${progress.total}`}
                hint={progress.donePct !== null ? t('time.today.done_pct', '{{pct}} % of the day’s tasks', { pct: progress.donePct }) : t('time.today.nothing_yet', 'Nothing planned yet')} />
              <StatTile icon={Timer} tone="progress" label={t('time.today.planned', 'Planned')} value={planned(me?.planned_minutes ?? 0, units)}
                hint={me ? t('time.today.of_capacity', 'of {{capacity}} ({{pct}} %)', { capacity: duration(me.capacity_minutes, units), pct: me.load_pct ?? 0 }) : undefined} />
              <StatTile icon={AlarmClock} tone={(me?.overdue.length ?? 0) > 0 ? 'danger' : 'neutral'} label={t('time.today.overdue', 'Overdue')} value={me?.overdue.length ?? 0}
                hint={t('time.today.overdue_hint', 'from the last 30 days')} />
              <StatTile icon={Inbox} tone="accent" label={t('time.today.pool', 'In the pool for you')} value={data.backlog.pool} to="/time/backlog"
                hint={t('time.today.bucket', '{{count}} in your bucket', { count: data.backlog.mine })} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-5">
                {/* Now or next. */}
                {next && (
                  <section className={`flex flex-wrap items-center gap-4 rounded-2xl border p-4 shadow-a-sm ${next.running ? 'border-a-st-progress/40 bg-a-st-progress/8' : 'border-a-border bg-a-surface'}`}>
                    <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${next.running ? 'bg-a-st-progress/15 text-a-st-progress' : 'bg-a-accent/12 text-a-accent-text'}`}>
                      {next.running ? <Timer size={20} className="animate-pulse" /> : <ArrowRight size={20} />}
                    </span>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openTask(next)}>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-a-text-2">{next.running ? t('time.today.now', 'On it now') : t('time.today.next', 'Up next')}</span>
                      <span className="block truncate font-a-display text-xl text-a-text">{next.title}</span>
                      <span className="block text-sm text-a-text-2">
                        {next.start_time ? `${next.start_time}–${next.end_time}` : t('time.task.no_time', 'No time yet')} · {duration(next.minutes, units)}
                        {next.running && next.started_at ? ` · ${t('time.today.since', 'since {{time}}', { time: clockOf(next.started_at, i18n.language, boot.venue.timezone) })}` : ''}
                      </span>
                    </button>
                    {next.running ? (
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => clock.mutate({ task: next, action: 'pause' })}><Pause size={14} aria-hidden />{t('time.task.pause', 'Pause')}</Button>
                        <Button size="sm" onClick={() => clock.mutate({ task: next, action: 'finish' })}>{t('time.task.finish', 'Finish')}</Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => clock.mutate({ task: next, action: 'start' })}><Play size={14} aria-hidden />{t('time.task.start_clock', 'Start')}</Button>
                    )}
                  </section>
                )}

                <Card title={t('time.today.timeline', 'My day on the clock')} description={t('time.today.timeline_line', 'Press an empty hour to add a task there; drag a task to move it.')} icon={CalendarCheck} padded={false}
                  action={<Link to={`/time/plan?date=${boot.venue.today}`} className="text-sm font-semibold text-a-accent-text">{t('time.today.open_planner', 'Team planner')}</Link>}>
                  <div className="p-3">
                    {me ? (
                      <DayTimeline now={data.now} hourPx={56}
                        lanes={[{ key: me.key, name: t('time.today.me', 'Me'), works: me.works, window: me.window, tasks: timed(me), load_pct: me.load_pct, planned_minutes: me.planned_minutes, capacity_minutes: me.capacity_minutes }]}
                        onOpen={task => openTask(task)}
                        onCreate={(_, start) => openTask(null, { task_date: boot.venue.today, start_time: start, person: boot.staff.key })}
                        onMove={(task, _, start) => move.mutate({ task, date: boot.venue.today, start })} />
                    ) : <p className="p-4 text-sm text-a-text-2">{t('time.today.not_on_team', 'You are not on the planner’s team list.')}</p>}
                  </div>
                </Card>

                <Card title={t('time.today.untimed', 'Without a time')} description={t('time.today.untimed_line', 'Give them a time, or let the AI fit them into your day.')} icon={CircleDashed}
                  action={untimed(me).some(x => !x.done) ? <Button size="sm" variant="secondary" onClick={() => setPlanning(true)}><Sparkles size={14} aria-hidden />{t('time.today.fit', 'Fit them in')}</Button> : undefined}>
                  {untimed(me).length === 0
                    ? <p className="text-sm text-a-text-2">{t('time.today.untimed_none', 'Everything today has its time.')}</p>
                    : <div className="space-y-2">{untimed(me).map(task => <TaskCard key={task.id} task={task} onOpen={x => openTask(x)} />)}</div>}
                </Card>
              </div>

              <aside className="min-w-0 space-y-5">
                <ReviewCard ask={{ kind: 'day', date: boot.venue.today, person: boot.staff.key }} title={t('time.today.briefing', 'AI briefing')}
                  line={t('time.today.briefing_line', 'A quick read of your day and what to change.')} />

                {signals.length > 0 && (
                  <Card title={t('time.today.heads_up', 'Heads-up')} icon={AlarmClock} tone="pending">
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

                {me && me.overdue.length > 0 && (
                  <Card title={t('time.today.overdue_title', 'Overdue')} description={t('time.today.overdue_line', 'Bring them into today, or open them.')} icon={AlarmClock} tone="danger">
                    <div className="space-y-2">
                      {me.overdue.slice(0, 6).map(task => (
                        <TaskCard key={task.id} task={task} showDay onOpen={x => openTask(x)}
                          actions={<button type="button" onClick={() => move.mutate({ task, date: boot.venue.today, start: null })} className="rounded-full bg-a-accent/12 px-2.5 py-1 text-xs font-semibold text-a-accent-text">{t('time.today.to_today', 'Today')}</button>} />
                      ))}
                    </div>
                  </Card>
                )}

                {data.pool_top.length > 0 && (
                  <Card title={t('time.today.from_pool', 'From the pool')} description={t('time.today.from_pool_line', 'Open work your skills allow. Take one into today.')} icon={Inbox}
                    action={<Link to="/time/backlog" className="text-sm font-semibold text-a-accent-text">{t('time.common.all', 'All')}</Link>}>
                    <div className="space-y-2">
                      {data.pool_top.map(task => (
                        <TaskCard key={task.id} task={task} compact onOpen={x => openTask(x)}
                          actions={<button type="button" disabled={take.isPending} onClick={() => take.mutate(task)} className="rounded-full bg-a-accent px-2.5 py-1 text-xs font-semibold text-a-accent-ink">{t('time.today.take', 'Take')}</button>} />
                      ))}
                    </div>
                  </Card>
                )}

                <Card title={t('time.today.week', 'My week')} icon={CalendarCheck}>
                  {/* An empty week says so instead of drawing seven bare bars. */}
                  {data.week.every(d => d.tasks === 0) && (
                    <p className="mb-2 text-sm text-a-text-2">{t('time.today.week_empty', 'Nothing planned this week yet. Press a day to plan it.')}</p>
                  )}
                  <div className="flex items-end gap-2" role="list" aria-label={t('time.today.week', 'My week')}>
                    {data.week.map((d, i) => (
                      <Link key={d.date} role="listitem" to={`/time/plan?date=${d.date}`} className="flex min-w-0 flex-1 flex-col items-center gap-1"
                        aria-label={`${dayLabel(d.date, i18n.language)}: ${duration(d.minutes, units)}, ${d.done}/${d.tasks}`}>
                        <span className="flex h-20 w-full items-end"><span className={`block w-full rounded-t-md ${d.date === data.date ? 'bg-a-accent' : 'bg-a-accent/35'}`} style={{ height: `${Math.max(4, weekHeights(data.week)[i])}%` }} /></span>
                        <span className={`text-xs ${d.date === data.date ? 'font-semibold text-a-text' : 'text-a-text-2'}`}>{weekdayName(i + 1, i18n.language)}</span>
                      </Link>
                    ))}
                  </div>
                </Card>

                <DayNote key={`${data.date}:${data.note ?? ''}`} date={data.date} initial={data.note ?? ''} />
              </aside>
            </div>
          </div>
        )}
      </QueryState>
      {planning && <PlanDialog date={boot.venue.today} scope="me" onClose={() => setPlanning(false)} />}
      <TomorrowLink today={boot.venue.today} />
    </Page>
  )
}

/** The day's note for the whole team (the full admin's day note), saved when the person leaves the box. */
function DayNote({ date, initial }: { date: string; initial: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState(initial)
  const save = useMutation({
    mutationFn: (value: string) => plannerApi.saveDayNote(date, value),
    onSuccess: () => toast(t('time.common.saved', 'Saved')),
    onError: error => toast(errorText(t, error), 'danger'),
  })
  return (
    <Card title={t('time.today.note', 'Note for the day')} description={t('time.today.note_line', 'Everyone sees it on this day.')} icon={StickyNote}>
      <TextArea rows={3} value={text} onChange={e => setText(e.target.value)} onBlur={() => { if (text !== initial) save.mutate(text) }}
        aria-label={t('time.today.note', 'Note for the day')} placeholder={t('time.today.note_hint', 'An inspection at 15:00, a delivery, a guest to look after…')} />
    </Card>
  )
}

/** A quiet way to look at tomorrow. */
function TomorrowLink({ today }: { today: string }) {
  const { t } = useTranslation()
  return (
    <p className="text-center text-sm">
      <Link to={`/time/plan?date=${addDays(today, 1)}`} className="font-semibold text-a-accent-text">{t('time.today.tomorrow', 'Look at tomorrow')} →</Link>
    </p>
  )
}
