import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { TaskForm } from './lib/tasks'
import type { Task } from './lib/types'

const TaskPanel = lazy(() => import('./task/TaskPanel').then(m => ({ default: m.TaskPanel })))
const CaptureDialog = lazy(() => import('./ai/CaptureDialog').then(m => ({ default: m.CaptureDialog })))

export interface TimeActionsValue {
  /** A task's panel: an existing task, or a new one with what is already known (its day, start, person). */
  openTask: (task?: Task | null, defaults?: Partial<TaskForm>) => void
  /** The AI capture: tasks from text or a voice note, for `date` when a day page opened it. */
  openCapture: (date?: string, text?: string) => void
}

interface Open {
  task: { task: Task | null; defaults?: Partial<TaskForm> } | null
  capture: { date?: string; text?: string } | null
  close: (which: 'task' | 'capture') => void
}

const Ctx = createContext<TimeActionsValue>({ openTask: () => {}, openCapture: () => {} })
const OpenCtx = createContext<Open>({ task: null, capture: null, close: () => {} })

// eslint-disable-next-line react-refresh/only-export-components
export function useTimeActions(): TimeActionsValue {
  return useContext(Ctx)
}

/** What every page can open (a task, the AI capture); the panels themselves are drawn by ActionPanels, inside the frame. */
export function TimeActionsProvider({ children }: { children: ReactNode }) {
  const [task, setTask] = useState<Open['task']>(null)
  const [capture, setCapture] = useState<Open['capture']>(null)
  const openTask = useCallback((t?: Task | null, defaults?: Partial<TaskForm>) => setTask({ task: t ?? null, defaults }), [])
  const openCapture = useCallback((date?: string, text?: string) => setCapture({ date, text }), [])
  const close = useCallback((which: 'task' | 'capture') => (which === 'task' ? setTask(null) : setCapture(null)), [])
  const value = useMemo(() => ({ openTask, openCapture }), [openTask, openCapture])
  const open = useMemo(() => ({ task, capture, close }), [task, capture, close])

  return (
    <Ctx.Provider value={value}>
      <OpenCtx.Provider value={open}>{children}</OpenCtx.Provider>
    </Ctx.Provider>
  )
}

/** The open panels, drawn inside the frame's root so they wear its tokens. */
export function ActionPanels() {
  const { task, capture, close } = useContext(OpenCtx)
  return (
    <Suspense fallback={null}>
      {task && <TaskPanel key={task.task?.id ?? 'new'} task={task.task} defaults={task.defaults} onClose={() => close('task')} />}
      {capture && <CaptureDialog date={capture.date} initialText={capture.text} onClose={() => close('capture')} />}
    </Suspense>
  )
}
