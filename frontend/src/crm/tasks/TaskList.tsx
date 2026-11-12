import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ExternalLink, Flag, ListChecks, Pencil, Repeat as RepeatIcon, RotateCcw, Target, Trash2 } from 'lucide-react'
import { endsAt, planOf } from '../../lib/taskForm'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Confirm } from '../ui/Confirm'
import { IconButton } from '../ui/IconButton'
import { TONE_CHIP } from '../ui/tones'
import { ActionMenu, type MenuItem } from '../ui/Menu'
import { TextInput } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { completeBody, dueParts, dueState, type Task, type TaskType } from './taskLogic'
import { useTaskChanged } from './taskData'
import { TaskForm } from './TaskForm'
import { dueTone, priorityLabel, repeatLabel, TASK_ICONS, taskTypeLabel } from './taskWords'

/** A due state's words in its tone's ink. */
const DUE_INK: Record<ReturnType<typeof dueTone>, string> = {
  danger: 'text-a-danger', pending: 'text-a-st-pending', progress: 'text-a-st-progress', success: 'text-a-st-confirmed', neutral: 'text-a-text-2',
}

/**
 * Tasks as rows (round 2: a clear due state on each), each with what can be done to it: mark it done with an outcome
 * (`complete`) in one press, and in its "…" menu open it again (`reopen`), change it, go to its lead, delete it (asked
 * first). Used by Tasks and by a lead's page.
 */
export function TaskList({ tasks, showLead = true, leadName }: { tasks: readonly Task[]; showLead?: boolean; leadName?: string | null }) {
  const [editing, setEditing] = useState<Task | null>(null)
  const [completing, setCompleting] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)

  return (
    <>
      <ul className="divide-y divide-a-border">
        {tasks.map(task => (
          <TaskRow key={task.id} task={task} showLead={showLead}
            onEdit={() => setEditing(task)} onComplete={() => setCompleting(task)} onDelete={() => setDeleting(task)} />
        ))}
      </ul>
      {editing && <TaskForm key={editing.id} task={editing} leadName={leadName} onClose={() => setEditing(null)} />}
      {completing && <CompleteDialog task={completing} onClose={() => setCompleting(null)} />}
      {deleting && <DeleteTask task={deleting} onClose={() => setDeleting(null)} />}
    </>
  )
}

function TaskRow({ task, showLead, onEdit, onComplete, onDelete }: {
  task: Task
  showLead: boolean
  onEdit: () => void
  onComplete: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const zone = boot.venue.timezone
  const toast = useToast()
  const navigate = useNavigate()
  const changed = useTaskChanged()
  const records = useRecords()
  const done = Boolean(task.completed_at)
  const state = dueState(task, boot.venue.today, zone)
  const due = dueParts(task.due_at, zone)
  const Icon = TASK_ICONS[task.type as TaskType] ?? ListChecks
  const tone = dueTone(state)

  const reopen = useMutation({
    mutationFn: () => send<Task>('post', `tasks/${task.id}/reopen`),
    onSuccess: () => { changed(); toast(t('crm.tasks.reopened', 'Task opened again')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })

  // The plan (2026-11-09): a start and end where it has a length, high priority and the repeat beside the day.
  const plan = planOf(task)
  const end = due?.time ? endsAt(due.time, plan.duration) : null
  const when = due ? `${state === 'today' ? t('crm.tasks.quick_today', 'Today') : state === 'tomorrow' ? t('crm.tasks.quick_tomorrow', 'Tomorrow') : dayLabel(due.day, lang)}${due.time ? `, ${due.time}${end ? `–${end.time}` : ''}` : ''}` : ''
  const dueText = done && task.completed_at ? t('crm.tasks.done_at', 'Done {{when}}', { when: dateTime(task.completed_at, lang, zone) })
    : !due ? t('crm.tasks.no_due', 'No day set')
    : state === 'overdue' ? t('crm.tasks.overdue_since', 'Overdue since {{when}}', { when })
    : when

  const items: (MenuItem | 'divider')[] = [
    ...(done
      ? [{ key: 'reopen', label: t('crm.tasks.reopen', 'Open again'), icon: RotateCcw, onSelect: () => reopen.mutate() }]
      : [{ key: 'done', label: t('crm.tasks.complete', 'Mark done'), icon: Check, onSelect: onComplete }]),
    { key: 'edit', label: t('crm.common.edit', 'Edit'), icon: Pencil, onSelect: onEdit },
    ...(task.inquiry_id ? [{ key: 'lead', label: t('crm.tasks.open_lead', 'Open the lead'), icon: ExternalLink, onSelect: () => navigate(records.href('lead', task.inquiry_id as number)) }] : []),
    'divider' as const,
    { key: 'delete', label: t('crm.common.delete', 'Delete'), icon: Trash2, danger: true, onSelect: onDelete },
  ]

  return (
    <li className={`group flex items-center gap-2 py-1.5 pl-2 pr-2 transition-colors hover:bg-a-surface-2/50 sm:gap-3 sm:pl-3 border-l-2 ${state === 'overdue' ? 'border-l-a-danger' : 'border-l-transparent'}`}>
      {done ? (
        <button type="button" onClick={() => reopen.mutate()} disabled={reopen.isPending}
          aria-label={t('crm.tasks.reopen_named', 'Open again: {{title}}', { title: task.title })} title={t('crm.tasks.reopen', 'Open again')}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-a-st-confirmed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-a-accent">
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-a-st-confirmed/15"><Check size={14} /></span>
        </button>
      ) : (
        <button type="button" onClick={onComplete} aria-label={t('crm.tasks.complete_named', 'Mark done: {{title}}', { title: task.title })} title={t('crm.tasks.complete', 'Mark done')}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-a-text-2 hover:text-a-st-confirmed focus-visible:outline-2 focus-visible:outline-a-accent">
          <span aria-hidden className="block h-5 w-5 rounded-full border-2 border-a-border group-hover:border-a-st-confirmed/60" />
        </button>
      )}
      <button type="button" onClick={onEdit} data-task-open={task.id} aria-label={t('crm.tasks.open_named', 'Open: {{title}}', { title: task.title })}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 text-left focus-visible:outline-2 focus-visible:outline-a-accent">
        <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE_CHIP[tone === 'neutral' ? 'neutral' : tone]}`} title={taskTypeLabel(t, task.type)}>
          <Icon size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${done ? 'text-a-text-2 line-through' : 'text-a-text'}`}>{task.title}</span>
          <span className="flex min-w-0 items-center gap-x-2 gap-y-0.5 overflow-hidden text-xs text-a-text-2">
            <span className={`min-w-0 truncate font-medium ${DUE_INK[tone]}`}>{dueText}</span>
            {plan.priority === 'high' && !done && <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-a-danger" title={priorityLabel(t, 'high')}><Flag size={12} aria-hidden /><span className="sr-only">{priorityLabel(t, 'high')}</span></span>}
            {plan.repeat !== 'none' && <span className="inline-flex shrink-0 items-center gap-0.5" title={repeatLabel(t, plan.repeat)}><RepeatIcon size={12} aria-hidden /><span className="sr-only">{repeatLabel(t, plan.repeat)}</span></span>}
            {task.assignee && <span className="hidden shrink-0 sm:inline">· {task.assignee.id === boot.staff.id ? t('crm.common.me', 'Me') : task.assignee.name}</span>}
            {done && task.outcome
              ? <span className="min-w-0 truncate text-a-st-confirmed">· {task.outcome}</span>
              : task.description && <span className="hidden min-w-0 truncate md:inline">· {task.description}</span>}
          </span>
        </span>
      </button>
      {/* On a phone the lead is in the row's menu, so the title keeps its width. */}
      {showLead && task.inquiry_id && (
        <span className="hidden sm:contents">
          <IconButton icon={Target} size="sm" label={t('crm.tasks.open_lead', 'Open the lead')} to={records.href('lead', task.inquiry_id)} />
        </span>
      )}
      <ActionMenu label={t('crm.tasks.menu_named', 'More for: {{title}}', { title: task.title })} items={items} />
    </li>
  )
}

/** Mark a task done, with what came of it (optional, up to 60 characters). */
function CompleteDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useTaskChanged()
  const [outcome, setOutcome] = useState('')
  const complete = useMutation({
    mutationFn: () => send<Task>('post', `tasks/${task.id}/complete`, completeBody(outcome)),
    onSuccess: () => { changed(); toast(t('crm.tasks.completed', 'Task done')); onClose() },
  })
  return (
    <Dialog title={t('crm.tasks.complete_title', 'Mark it done')} onClose={onClose} busy={complete.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); complete.mutate() }}>
        <p className="text-sm text-a-text">{task.title}</p>
        {complete.isError && <Notice tone="danger">{errorText(t, complete.error)}</Notice>}
        <Field label={t('crm.tasks.outcome', 'What came of it (optional)')}>
          <TextInput value={outcome} onChange={e => setOutcome(e.target.value)} maxLength={60} autoFocus
            placeholder={t('crm.tasks.outcome_placeholder', 'Booked a viewing')} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={complete.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={complete.isPending}>{t('crm.tasks.complete', 'Mark done')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function DeleteTask({ task, onClose }: { task: Task; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useTaskChanged()
  const remove = useMutation({
    mutationFn: () => send('delete', `tasks/${task.id}`),
    onSuccess: () => { changed(); toast(t('crm.tasks.deleted', 'Task deleted')); onClose() },
  })
  return (
    <Confirm title={t('crm.tasks.delete_title', 'Delete this task?')} confirm={t('crm.common.delete', 'Delete')} busy={remove.isPending}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{task.title}</p>
      <p className="mt-2">{t('crm.tasks.delete_line', 'It goes for everyone. A lead it belongs to keeps its timeline.')}</p>
      {remove.isError && <div className="mt-3"><Notice tone="danger">{errorText(t, remove.error)}</Notice></div>}
    </Confirm>
  )
}
