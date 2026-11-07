import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ListChecks, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel } from '../lib/format'
import { leadPath } from '../lib/links'
import { Confirm } from '../ui/Confirm'
import { TextInput } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { bucketOf, completeBody, dueParts, type Task, type TaskType } from './taskLogic'
import { useTaskChanged } from './taskData'
import { TaskForm } from './TaskForm'
import { TASK_ICONS, taskTypeLabel } from './taskWords'

/**
 * Tasks as rows, each with what can be done to it: mark it done with an outcome (`complete`), open it again (`reopen`),
 * change it, delete it (asked first). Used by Tasks and by a lead's page.
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
  const changed = useTaskChanged()
  const done = Boolean(task.completed_at)
  const bucket = bucketOf(task, boot.venue.today, zone)
  const due = dueParts(task.due_at, zone)
  const Icon = TASK_ICONS[task.type as TaskType] ?? ListChecks

  const reopen = useMutation({
    mutationFn: () => send<Task>('post', `tasks/${task.id}/reopen`),
    onSuccess: () => { changed(); toast(t('crm.tasks.reopened', 'Task opened again')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })

  const meta: ReactNode[] = []
  meta.push(<span key="type">{taskTypeLabel(t, task.type)}</span>)
  if (done && task.completed_at) {
    meta.push(<span key="done">{t('crm.tasks.done_at', 'Done {{when}}', { when: dateTime(task.completed_at, lang, zone) })}</span>)
  } else if (due) {
    const text = `${dayLabel(due.day, lang)}${due.time ? `, ${due.time}` : ''}`
    meta.push(
      <span key="due" className={bucket === 'overdue' ? 'font-medium text-a-danger' : bucket === 'today' ? 'font-medium text-a-st-pending' : ''}>
        {bucket === 'overdue' ? t('crm.tasks.overdue_since', 'Overdue since {{when}}', { when: text }) : text}
      </span>,
    )
  } else {
    meta.push(<span key="none">{t('crm.tasks.no_due', 'No day set')}</span>)
  }
  if (task.assignee) meta.push(<span key="who">{task.assignee.id === boot.staff.id ? t('crm.common.me', 'Me') : task.assignee.name}</span>)
  if (showLead && task.inquiry_id) {
    meta.push(<Link key="lead" to={leadPath(task.inquiry_id)} className="font-medium text-a-accent-text hover:underline">{t('crm.tasks.lead_number', 'Lead #{{id}}', { id: task.inquiry_id })}</Link>)
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {done ? (
        <button type="button" onClick={() => reopen.mutate()} disabled={reopen.isPending}
          aria-label={t('crm.tasks.reopen_named', 'Open again: {{title}}', { title: task.title })}
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-a-st-confirmed/12 text-a-st-confirmed disabled:opacity-50">
          <Check size={14} aria-hidden />
        </button>
      ) : (
        <button type="button" onClick={onComplete} aria-label={t('crm.tasks.complete_named', 'Mark done: {{title}}', { title: task.title })}
          className="mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 border-a-border hover:border-a-st-confirmed focus-visible:outline-2 focus-visible:outline-a-accent" />
      )}
      <span aria-hidden className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${bucket === 'overdue' ? 'bg-a-danger/12 text-a-danger' : 'bg-a-surface-2 text-a-text-2'}`}>
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} className={`block max-w-full truncate text-left text-sm font-medium hover:underline ${done ? 'text-a-text-2 line-through' : 'text-a-text'}`}>
          {task.title}
        </button>
        {task.description && <p className="mt-0.5 line-clamp-2 text-sm text-a-text-2">{task.description}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-a-text-2">
          {meta.map((part, i) => <span key={i} className="inline-flex items-center gap-2">{i > 0 && <span aria-hidden>·</span>}{part}</span>)}
        </p>
        {done && task.outcome && <p className="mt-1 text-xs text-a-st-confirmed">{t('crm.tasks.outcome_was', 'Outcome: {{outcome}}', { outcome: task.outcome })}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {done && (
          <button type="button" onClick={() => reopen.mutate()} disabled={reopen.isPending} title={t('crm.tasks.reopen', 'Open again')}
            aria-label={t('crm.tasks.reopen_named', 'Open again: {{title}}', { title: task.title })} className="rounded-lg p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
            <RotateCcw size={15} aria-hidden />
          </button>
        )}
        <button type="button" onClick={onEdit} title={t('crm.common.edit', 'Edit')}
          aria-label={t('crm.tasks.edit_named', 'Change: {{title}}', { title: task.title })} className="rounded-lg p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
          <Pencil size={15} aria-hidden />
        </button>
        <button type="button" onClick={onDelete} title={t('crm.common.delete', 'Delete')}
          aria-label={t('crm.tasks.delete_named', 'Delete: {{title}}', { title: task.title })} className="rounded-lg p-2 text-a-text-2 hover:bg-a-danger/12 hover:text-a-danger">
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
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
