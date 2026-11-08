import { useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Timer } from 'lucide-react'
import { toClock, toMinutes } from '../lib/dates'
import { duration } from '../lib/format'
import type { Task } from '../lib/types'
import { useGroupColor } from '../task/TaskCard'
import { HOUR_PX, columnsOf, heightOf, loadState, minutesAt, topOf, visibleRange } from './timeline'

export interface TimelineLane {
  key: string
  name: string
  works: boolean
  window: { start: string; end: string }
  tasks: Task[]
  load_pct?: number | null
  planned_minutes?: number
  capacity_minutes?: number
}

/** The drag's payload: which task (its id). Lists beside the timeline set the same, so their tasks can be dropped on it. */
export const DRAG = 'application/x-time-task'

/**
 * A day as columns of hours, one per person (one for My day): every timed task where it sits and as long as it lasts,
 * side by side where tasks overlap, the hours outside a person's day shaded, and the "now" line today. A press on a task
 * opens it; a press on an empty hour adds a task there; a task dragged to another time or person is moved
 * (`onMove`, which the page sends through the full admin's `planner/tasks/{id}/move`).
 */
export function DayTimeline({ lanes, now, onOpen, onCreate, onMove, extra = [], hourPx = HOUR_PX, minColumn = 220 }: {
  lanes: TimelineLane[]
  /** Tasks shown elsewhere on the page (the untimed list) that may be dropped here. */
  extra?: Task[]
  now: string | null
  onOpen: (task: Task) => void
  onCreate?: (lane: string, start: string) => void
  onMove?: (task: Task, lane: string, start: string) => void
  hourPx?: number
  minColumn?: number
}) {
  const { t } = useTranslation()
  const color = useGroupColor()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const [over, setOver] = useState<{ lane: string; minutes: number } | null>(null)
  const all = useMemo(() => lanes.flatMap(l => l.tasks), [lanes])
  const windowAll = useMemo(() => {
    const starts = lanes.map(l => toMinutes(l.window.start) ?? 540)
    const ends = lanes.map(l => toMinutes(l.window.end) ?? 1080)
    return { start: toClock(Math.min(...starts, 540)), end: toClock(Math.max(...ends, 1020)) }
  }, [lanes])
  const range = useMemo(() => visibleRange(windowAll, all), [windowAll, all])
  const hours = Array.from({ length: (range.end - range.start) / 60 }, (_, i) => range.start + i * 60)
  const height = ((range.end - range.start) / 60) * hourPx
  const nowMin = toMinutes(now)
  const byId = useMemo(() => new Map([...extra, ...all].map(task => [task.id, task])), [all, extra])

  const dropAt = (e: DragEvent<HTMLDivElement>, lane: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { lane, minutes: minutesAt(e.clientY - rect.top, range, 15, hourPx) }
  }

  return (
    <div className="time-scroll overflow-x-auto rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
      <div className="flex min-w-max" style={{ '--time-hour-px': `${hourPx}px` } as CSSProperties}>
        {/* The hours' labels. */}
        <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-a-border bg-a-surface">
          <div className="h-12 border-b border-a-border" />
          <div className="relative" style={{ height }}>
            {hours.map(h => (
              <span key={h} className="absolute right-2 -translate-y-1/2 font-a-mono text-xs text-a-text-2" style={{ top: topOf(h, range, hourPx) }}>
                {h > range.start ? toClock(h) : ''}
              </span>
            ))}
          </div>
        </div>

        {lanes.map(lane => {
          const placed = columnsOf(lane.tasks)
          const ws = toMinutes(lane.window.start) ?? range.start
          const we = toMinutes(lane.window.end) ?? range.end
          const state = loadState(lane.load_pct)
          return (
            <div key={lane.key} className="shrink-0 border-r border-a-border last:border-r-0" style={{ width: lanes.length === 1 ? '100%' : minColumn, minWidth: minColumn }}>
              <div className="flex h-12 items-center gap-2 border-b border-a-border px-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-a-text">{lane.name}</span>
                {!lane.works && <span className="shrink-0 rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text-2">{t('time.plan.off', 'Off')}</span>}
                {lane.works && lane.load_pct !== undefined && lane.load_pct !== null && (
                  <span className="flex shrink-0 items-center gap-1.5" title={t('time.plan.load_of', '{{planned}} of {{capacity}}', { planned: duration(lane.planned_minutes ?? 0, units), capacity: duration(lane.capacity_minutes ?? 0, units) })}>
                    <span aria-hidden className="h-1.5 w-14 overflow-hidden rounded-full bg-a-surface-2">
                      <span className={`block h-full rounded-full time-load-${state === 'none' ? 'ok' : state}`} style={{ width: `${Math.min(100, lane.load_pct)}%` }} />
                    </span>
                    <span className="font-a-mono text-xs text-a-text-2">{lane.load_pct}%</span>
                  </span>
                )}
              </div>
              <div role="presentation" className={`time-hours relative ${over?.lane === lane.key ? 'time-drop' : ''}`} style={{ height }}
                onClick={e => {
                  if (!onCreate || e.target !== e.currentTarget) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  onCreate(lane.key, toClock(minutesAt(e.clientY - rect.top, range, 15, hourPx)))
                }}
                onDragOver={e => { if (!onMove) return; e.preventDefault(); setOver(dropAt(e, lane.key)) }}
                onDragLeave={() => setOver(null)}
                onDrop={e => {
                  if (!onMove) return
                  e.preventDefault()
                  const id = Number(e.dataTransfer.getData(DRAG))
                  const task = byId.get(id)
                  const at = dropAt(e, lane.key)
                  setOver(null)
                  if (task) onMove(task, at.lane, toClock(at.minutes))
                }}>
                {/* The hours outside this person's day. */}
                {ws > range.start && <div aria-hidden className="time-off-hours pointer-events-none absolute inset-x-0 top-0" style={{ height: topOf(ws, range, hourPx) }} />}
                {we < range.end && <div aria-hidden className="time-off-hours pointer-events-none absolute inset-x-0" style={{ top: topOf(we, range, hourPx), bottom: 0 }} />}
                {!lane.works && <div aria-hidden className="time-off-hours pointer-events-none absolute inset-0" />}

                {over?.lane === lane.key && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-1 z-20 rounded-md bg-a-accent/20 px-2 font-a-mono text-xs text-a-text" style={{ top: topOf(over.minutes, range, hourPx) }}>
                    {toClock(over.minutes)}
                  </div>
                )}

                {placed.map(({ item: task, column, columns, start }) => {
                  const c = color(task.task_group)
                  const h = heightOf(task.minutes, hourPx)
                  return (
                    <button key={task.id} type="button" draggable={Boolean(onMove)}
                      onDragStart={e => { e.dataTransfer.setData(DRAG, String(task.id)); e.dataTransfer.effectAllowed = 'move' }}
                      onClick={() => onOpen(task)}
                      aria-label={`${task.start_time}–${task.end_time} ${task.title}`}
                      className={`time-block absolute z-10 overflow-hidden rounded-lg border border-a-border px-2 py-1 text-left shadow-a-sm transition-shadow hover:shadow-a focus-visible:outline-2 focus-visible:outline-a-accent ${task.done ? 'opacity-60' : ''}`}
                      style={{
                        top: topOf(start, range, hourPx) + 1,
                        height: h,
                        left: `calc(${(column / columns) * 100}% + 4px)`,
                        width: `calc(${100 / columns}% - 8px)`,
                        borderLeftColor: c,
                        backgroundColor: `color-mix(in srgb, ${c} 14%, rgb(var(--a-surface)))`,
                      }}>
                      <span className="flex items-center gap-1">
                        {task.done && <CheckCircle2 size={12} aria-hidden className="shrink-0 text-a-st-confirmed" />}
                        {task.running && <Timer size={12} aria-hidden className="shrink-0 animate-pulse text-a-st-progress" />}
                        {!task.done && task.priority_rank === 0 && <AlertTriangle size={12} aria-hidden className="shrink-0 text-a-danger" />}
                        <span className={`truncate text-xs font-semibold ${task.done ? 'text-a-text-2 line-through' : 'text-a-text'}`}>{task.title}</span>
                      </span>
                      {h >= 36 && (
                        <span className="block truncate font-a-mono text-xs text-a-text-2">{task.start_time}–{task.end_time}{task.task_group ? ` · ${task.task_group}` : ''}</span>
                      )}
                    </button>
                  )
                })}

                {nowMin !== null && nowMin >= range.start && nowMin <= range.end && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-30" style={{ top: topOf(nowMin, range, hourPx) }}>
                    <div className="time-now h-0.5 w-full" />
                    <div className="time-now absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full" />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
