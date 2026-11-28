import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../CrmProvider'
import { useToast } from '../ui/Toast'
import { useMyOpenTasks } from './taskData'
import { TaskForm } from './TaskForm'

/**
 * One of the person's open tasks in the task form, over the page it was pressed on (round 5, owner 2026-11-12: "open,
 * don't leave"): Today lists your tasks from `crm/today`, and the form needs the task as `GET tasks` answers it, so it
 * is read from the person's open tasks — the Tasks page's own read for Mine, one cache. A task no longer open there
 * (done or moved meanwhile) closes with a word instead of an empty form.
 */
export function TaskOpen({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const open = useMyOpenTasks(boot.staff.id)
  const task = open.data?.data.find(row => row.id === id) ?? null
  const missing = (open.isSuccess && !task) || open.isError

  useEffect(() => {
    if (!missing) return
    toast(t('crm.tasks.gone', 'This task is no longer open.'), 'danger')
    onClose()
  }, [missing, onClose, t, toast])

  if (!task) return null
  return <TaskForm key={task.id} task={task} onClose={onClose} />
}
