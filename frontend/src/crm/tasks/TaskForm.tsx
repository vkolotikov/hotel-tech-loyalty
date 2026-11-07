import { useId, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send, failureOf } from '../lib/api'
import { errorText } from '../lib/errors'
import { leadPath } from '../lib/links'
import { CONTROL, Select, TextArea, TextInput } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import type { LeadRow, Paginated } from '../leads/leadTypes'
import { draftOf, quickDates, taskBody, TASK_TYPES, validateTask, type Task, type TaskDraft, type TaskType } from './taskLogic'
import { useTaskChanged, useTeam } from './taskData'
import { taskProblem, taskTypeLabel } from './taskWords'

/**
 * Add or change a task (TaskController::store / update): its type, title, the venue's day and time, who does it, the
 * lead it is for (chosen when it is added; the server does not move a task to another lead) and notes.
 */
export function TaskForm({ task, inquiryId, leadName, onClose }: {
  task: Task | null
  /** Opened from a lead: the new task is that lead's. */
  inquiryId?: number | null
  leadName?: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const boot = useBoot()
  const zone = boot.venue.timezone
  const toast = useToast()
  const changed = useTaskChanged()
  const team = useTeam()
  const formId = useId()
  const isNew = !task
  const [draft, setDraft] = useState<TaskDraft>(() => draftOf(task, zone, { me: boot.staff.id, inquiryId: inquiryId ?? null }))
  const [picked, setPicked] = useState<string | null>(leadName ?? null)
  const [tried, setTried] = useState(false)
  const errors = validateTask(draft)
  const set = (patch: Partial<TaskDraft>) => setDraft(d => ({ ...d, ...patch }))

  const save = useMutation({
    mutationFn: () => {
      const body = taskBody(draft, zone, !task)
      return task ? send<Task>('put', `tasks/${task.id}`, body) : send<Task>('post', 'tasks', body)
    },
    onSuccess: () => {
      changed()
      toast(isNew ? t('crm.tasks.added', 'Task added') : t('crm.tasks.saved', 'Task saved'))
      onClose()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.keys(errors).length > 0) return
    save.mutate()
  }

  const people = team.data ?? []
  const meListed = people.some(p => p.id === boot.staff.id)
  const lockedLead = !isNew || Boolean(inquiryId)
  const fieldErrors = failureOf(save.error).fields ?? {}

  return (
    <SidePanel title={isNew ? t('crm.tasks.new_title', 'New task') : t('crm.tasks.edit_title', 'Change the task')} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" form={formId} loading={save.isPending}>{isNew ? t('crm.tasks.add', 'Add the task') : t('crm.common.save', 'Save')}</Button>
        </div>
      )}>
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}

        <Field label={t('crm.tasks.field_type', 'Type')}>
          <Select value={draft.type} onChange={e => set({ type: e.target.value as TaskType })}>
            {TASK_TYPES.map(type => <option key={type} value={type}>{taskTypeLabel(t, type)}</option>)}
          </Select>
        </Field>

        <Field label={t('crm.tasks.field_title', 'Title')}>
          <TextInput value={draft.title} onChange={e => set({ title: e.target.value })} maxLength={200} autoFocus={isNew}
            placeholder={t('crm.tasks.title_placeholder', 'Call back about the offer')}
            aria-invalid={(tried && errors.title) || fieldErrors.title ? true : undefined} />
          {tried && errors.title && <span className="mt-1 block text-xs text-a-danger">{taskProblem(t, errors.title)}</span>}
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('crm.tasks.field_date', 'Day')} hint={t('crm.tasks.zone_hint', 'On the venue\'s clock ({{zone}})', { zone })}>
            <TextInput type="date" value={draft.date} onChange={e => set({ date: e.target.value })}
              aria-invalid={(tried && errors.date) || fieldErrors.due_at ? true : undefined} />
          </Field>
          <Field label={t('crm.tasks.field_time', 'Time (optional)')}>
            <TextInput type="time" value={draft.time} onChange={e => set({ time: e.target.value })}
              aria-invalid={tried && errors.time ? true : undefined} />
            {tried && errors.time && <span className="mt-1 block text-xs text-a-danger">{taskProblem(t, errors.time)}</span>}
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('crm.tasks.quick_dates', 'Quick days')}>
          {quickDates(boot.venue.today).map(q => (
            <button key={q.key} type="button" aria-pressed={draft.date === q.date} onClick={() => set({ date: q.date })}
              className={`min-h-8 rounded-full border px-3 text-xs font-medium ${draft.date === q.date ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
              {q.key === 'today' ? t('crm.tasks.quick_today', 'Today') : q.key === 'tomorrow' ? t('crm.tasks.quick_tomorrow', 'Tomorrow') : t('crm.tasks.quick_next_week', 'In a week')}
            </button>
          ))}
          {draft.date && (
            <button type="button" onClick={() => set({ date: '', time: '' })} className="min-h-8 rounded-full px-3 text-xs font-medium text-a-text-2 hover:text-a-text">
              {t('crm.tasks.no_date', 'No day')}
            </button>
          )}
        </div>

        <Field label={t('crm.tasks.field_assignee', 'Who does it')}>
          <Select value={draft.assignee ?? boot.staff.id} onChange={e => set({ assignee: Number(e.target.value) })}>
            {!meListed && <option value={boot.staff.id}>{t('crm.tasks.me_named', 'Me ({{name}})', { name: boot.staff.name })}</option>}
            {people.map(p => (
              <option key={p.id} value={p.id}>{p.id === boot.staff.id ? t('crm.tasks.me_named', 'Me ({{name}})', { name: p.name }) : p.name}</option>
            ))}
          </Select>
        </Field>

        {lockedLead ? (
          draft.inquiryId ? (
            <p className="text-sm text-a-text-2">
              {t('crm.tasks.for_lead', 'For the lead')}{' '}
              <Link to={leadPath(draft.inquiryId)} onClick={onClose} className="font-medium text-a-accent-text hover:underline">
                {picked ?? t('crm.tasks.lead_number', 'Lead #{{id}}', { id: draft.inquiryId })}
              </Link>
            </p>
          ) : null
        ) : (
          <LeadPicker value={draft.inquiryId} label={picked}
            onPick={(id, name) => { set({ inquiryId: id }); setPicked(name) }}
            onClear={() => { set({ inquiryId: null }); setPicked(null) }} />
        )}

        <Field label={t('crm.tasks.field_notes', 'Notes (optional)')}>
          <TextArea rows={3} value={draft.description} onChange={e => set({ description: e.target.value })} maxLength={4000}
            placeholder={t('crm.tasks.notes_placeholder', 'What whoever picks this up should know.')} />
        </Field>
      </form>
    </SidePanel>
  )
}

/** Choose the lead a new task is for: type a name, an email or a company. */
function LeadPicker({ value, label, onPick, onClear }: { value: number | null; label: string | null; onPick: (id: number, name: string) => void; onClear: () => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const term = q.trim()
  const found = useQuery({
    queryKey: ['crm', 'tasks', 'lead-search', term],
    queryFn: () => get<Paginated<LeadRow>>(`inquiries${params({ search: term, active_only: true, per_page: 6 })}`),
    enabled: term.length >= 2,
    staleTime: 30_000,
  })

  if (value) {
    return (
      <div>
        <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.tasks.field_lead', 'Lead (optional)')}</span>
        <div className="flex items-center gap-2 rounded-xl border border-a-border bg-a-surface-2 px-3 py-2 text-sm text-a-text">
          <span className="min-w-0 flex-1 truncate">{label ?? t('crm.tasks.lead_number', 'Lead #{{id}}', { id: value })}</span>
          <button type="button" onClick={onClear} aria-label={t('crm.tasks.unlink_lead', 'Remove the lead')} className="rounded-sm p-1 text-a-text-2 hover:text-a-text"><X size={15} aria-hidden /></button>
        </div>
      </div>
    )
  }

  const rows = found.data?.data ?? []
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.tasks.field_lead', 'Lead (optional)')}</span>
        <span className="relative block">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-a-text-2" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} className={`${CONTROL} pl-9`}
            placeholder={t('crm.tasks.lead_search', 'Find a lead by name, email or company')} />
        </span>
      </label>
      {term.length >= 2 && (
        <ul className="mt-1.5 divide-y divide-a-border overflow-hidden rounded-xl border border-a-border">
          {found.isLoading && <li className="px-3 py-2 text-sm text-a-text-2">{t('crm.common.loading', 'Loading…')}</li>}
          {!found.isLoading && rows.length === 0 && <li className="px-3 py-2 text-sm text-a-text-2">{t('crm.tasks.lead_none', 'No open lead matches.')}</li>}
          {rows.map(lead => {
            const name = lead.guest?.full_name || lead.guest?.email || t('crm.tasks.lead_number', 'Lead #{{id}}', { id: lead.id })
            return (
              <li key={lead.id}>
                <button type="button" onClick={() => onPick(lead.id, name)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-a-text hover:bg-a-surface-2">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {lead.guest?.company && <span className="shrink-0 truncate text-xs text-a-text-2">{lead.guest.company}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
