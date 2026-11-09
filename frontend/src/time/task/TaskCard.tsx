import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Circle, ListChecks, Pause, Play, Repeat, Timer } from 'lucide-react'
import { useBoot } from '../TimeProvider'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, duration } from '../lib/format'
import { useRefresh } from '../lib/queries'
import { mayChange, rightsOf } from '../lib/rights'
import { plannerApi } from '../lib/tasks'
import type { Task } from '../lib/types'
import { useToast } from '../ui/Toast'

/** A type's colour from the settings, else a calm grey. */
// eslint-disable-next-line react-refresh/only-export-components
export function useGroupColor(): (group: string | null | undefined) => string {
  const groups = useBoot().settings.groups
  return (group) => groups.find(g => g.name === group)?.color ?? '#94a3b8'
}

/** Tick done / not done, and the clock (Start, Pause, Finish) of one task. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTaskActions() {
  const { t } = useTranslation()
  const toast = useToast()
  const refresh = useRefresh()
  const toggle = useMutation({
    mutationFn: (task: Task) => plannerApi.toggle(task.id),
    onSuccess: refresh,
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const clock = useMutation({
    mutationFn: ({ task, action }: { task: Task; action: 'start' | 'pause' | 'finish' }) => timeApi.clock(task.id, action),
    onSuccess: (_, { action }) => { refresh(); if (action === 'finish') toast(t('time.task.finished', 'Done — well done')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  return { toggle, clock }
}

/**
 * One task in a list (My day, the backlog, a lane): its tick, title, time, length, type, steps and clock, and a press to
 * open it. `compact` drops the second line. A colleague's task in the `own` planning mode shows its tick without a press
 * and no clock (PlanningMode refuses both).
 */
export function TaskCard({ task, onOpen, showDay = false, compact = false, actions }: {
  task: Task
  onOpen: (task: Task) => void
  showDay?: boolean
  compact?: boolean
  actions?: React.ReactNode
}) {
  const { t, i18n } = useTranslation()
  const color = useGroupColor()(task.task_group)
  const { toggle, clock } = useTaskActions()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const high = task.priority_rank === 0
  const changeable = mayChange(rightsOf(useBoot()), task)

  return (
    <div className={`group flex min-w-0 items-start gap-3 rounded-xl border border-a-border bg-a-surface px-3 py-2.5 shadow-a-sm transition-colors hover:border-a-text-2/40 ${task.done ? 'opacity-70' : ''}`}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
      <button type="button" onClick={() => toggle.mutate(task)} disabled={toggle.isPending || !changeable}
        aria-label={task.done ? t('time.task.undo_done', 'Mark not done') : t('time.task.mark_done', 'Mark done')}
        className="mt-0.5 shrink-0 text-a-text-2 hover:text-a-st-confirmed">
        {task.done ? <CheckCircle2 size={19} aria-hidden className="text-a-st-confirmed" /> : <Circle size={19} aria-hidden />}
      </button>
      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <span className="flex min-w-0 items-center gap-1.5">
          {high && !task.done && <AlertTriangle size={13} aria-label={t('time.priority.high', 'High')} className="shrink-0 text-a-danger" />}
          <span className={`line-clamp-2 break-words text-sm font-medium ${task.done ? 'text-a-text-2 line-through' : 'text-a-text'}`}>{task.title}</span>
        </span>
        {!compact && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-a-text-2">
            {showDay && task.task_date && <span>{dayLabel(task.task_date, i18n.language)}</span>}
            {task.start_time ? <span className="font-a-mono">{task.start_time}–{task.end_time}</span> : <span>{t('time.task.no_time', 'No time yet')}</span>}
            <span>{duration(task.minutes, units)}</span>
            {task.task_group && <span>{task.task_group}</span>}
            {task.subtasks_total > 0 && <span className="inline-flex items-center gap-1"><ListChecks size={12} aria-hidden />{task.subtasks_done}/{task.subtasks_total}</span>}
            {task.recurring && <Repeat size={12} aria-label={t('time.task.repeats', 'Repeats')} />}
            {task.actual_minutes !== null && task.actual_minutes > 0 && (
              <span className="inline-flex items-center gap-1"><Timer size={12} aria-hidden />{duration(task.actual_minutes, units)}</span>
            )}
            {task.overdue && <span className="font-semibold text-a-danger">{t('time.task.overdue', 'Overdue')}</span>}
          </span>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {!task.done && changeable && (task.running ? (
          <>
            <button type="button" onClick={() => clock.mutate({ task, action: 'pause' })} aria-label={t('time.task.pause', 'Pause')}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-a-st-progress/12 px-2.5 text-xs font-semibold text-a-st-progress">
              <Pause size={13} aria-hidden /><span className="hidden sm:inline">{t('time.task.running', 'Running')}</span>
            </button>
            <button type="button" onClick={() => clock.mutate({ task, action: 'finish' })} aria-label={t('time.task.finish', 'Finish')}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-a-st-confirmed/12 px-2.5 text-xs font-semibold text-a-st-confirmed">
              <CheckCircle2 size={13} aria-hidden /><span className="hidden sm:inline">{t('time.task.finish', 'Finish')}</span>
            </button>
          </>
        ) : (
          <button type="button" onClick={() => clock.mutate({ task, action: 'start' })} aria-label={t('time.task.start_clock', 'Start')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-a-border text-a-text-2 opacity-100 hover:text-a-text sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
            <Play size={13} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
}
