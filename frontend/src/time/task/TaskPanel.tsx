import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays, CheckCircle2, ChevronDown, Copy, FileText, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { VoiceButton } from '../ai/VoiceButton'
import { appendWords } from '../ai/voice'
import { timeApi } from '../lib/api'
import { addDays, isoWeekday } from '../lib/dates'
import { errorText } from '../lib/errors'
import { duration } from '../lib/format'
import { assignable, usePeople, useRefresh, useTemplates } from '../lib/queries'
import { choosable, mayChange, mayGive, meOf, rightsOf } from '../lib/rights'
import {
  DURATIONS, EMPTY_FORM, PRIORITIES, RECURRING, STATUSES, assignmentOf, endOf, formProblem, payloadOf, plannerApi, priorityOf,
  type Status, type TaskForm,
} from '../lib/tasks'
import type { Task } from '../lib/types'
import { templateGroups } from '../settings/settingsLogic'
import { Confirm } from '../ui/Confirm'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { TaskGrid, TypeGrid } from './TaskPickers'
import { nextForm, taskTiles, typeTiles, withTask, withType } from './taskFormLogic'

export interface TaskPanelProps {
  task?: Task | null
  defaults?: Partial<TaskForm>
  onClose: () => void
}

function formOf(task: Task): TaskForm {
  return {
    ...EMPTY_FORM,
    title: task.title,
    task_date: task.task_date ?? '',
    start_time: task.start_time ?? '',
    duration_minutes: task.duration_minutes ? String(task.duration_minutes) : '',
    person: task.owner ?? '',
    priority: priorityOf(task.priority),
    status: (STATUSES as readonly string[]).includes(task.status) ? (task.status as Status) : 'todo',
    task_group: task.task_group ?? '',
    task_category: task.task_category ?? '',
    description: task.description ?? '',
    pool_horizon: (task.pool_horizon as TaskForm['pool_horizon']) ?? '',
    pool_due_date: task.pool_due_date ?? '',
  }
}

/** A chip of a row of choices (a type, a length, a priority). */
function Chip({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string | null }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${on ? 'border-a-accent bg-a-accent/12 font-semibold text-a-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
      {color && <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  )
}

/**
 * A task, new or as it is (2026-11-09): every field the full admin's planner keeps — title, type and task, day, start,
 * length, person, priority, status, notes, subtasks, repeats, the pool's horizon — saved through its own endpoints.
 * The type and the task are picked as the full admin's drawer picks them: a grid of types with their icons, then the
 * chosen type's tasks as a grid (TaskPickers); a task picked fills an empty title, and "Add & next" keeps the panel
 * open for the next task of the same day, person and type.
 * Help on the way: the team's templates, how long such a task usually takes (time/estimate, from finished ones), and the
 * microphone for the title and the notes. In the `own` planning mode a staff member's list of people is only themselves,
 * and a colleague's task opens read-only (it can still be copied to one's own day).
 */
export function TaskPanel({ task, defaults, onClose }: TaskPanelProps) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const creating = !task
  const rights = rightsOf(boot)
  // A new task offered for a colleague (their lane, their page) is one's own when one may plan only one's own day.
  const [form, setForm] = useState<TaskForm>(() => (task ? formOf(task) : {
    ...EMPTY_FORM, ...defaults, person: defaults?.person && !mayGive(rights, defaults.person) ? boot.staff.key : defaults?.person ?? '',
  }))
  const [subtasks, setSubtasks] = useState(task?.subtasks ?? [])
  const [newSub, setNewSub] = useState('')
  const [draftSubs, setDraftSubs] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copyTo, setCopyTo] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  // The title the form filled from a task (so another task may replace it); null once the person types their own.
  const [filled, setFilled] = useState<string | null>(null)
  const [added, setAdded] = useState(0)
  const titleRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof TaskForm>(key: K, value: TaskForm[K]) => setForm(f => ({ ...f, [key]: value }))
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }

  const locked = Boolean(task) && !mayChange(rights, task!)
  const everyone = assignable(usePeople().data?.people)
  const people = choosable(rights, everyone, creating ? null : form.person)
  const person = people.find(p => p.key === form.person) ?? null
  const ownerName = task?.owner ? everyone.find(p => p.key === task.owner)?.name ?? task.employee_name ?? '' : ''
  const templates = useTemplates().data ?? []
  const groups = boot.settings.groups
  const allChannels = boot.settings.channels
  const chosen = everyone.find(p => p.key === form.person) ?? null
  const types = typeTiles(groups, chosen?.prefers.groups)
  const tasks = taskTiles(form.task_group, allChannels, chosen?.prefers.tasks)
  // An older row's own text (not one of the settings' tasks) stays shown as it is.
  const looseCategory = form.task_category && !allChannels.some(c => c.key === form.task_category) ? form.task_category : null
  const today = boot.venue.today

  // The title takes the focus without scrolling the pickers above it out of view (and again after "Add & next").
  useEffect(() => {
    if (!locked) titleRef.current?.focus({ preventScroll: true })
  }, [locked, added])
  const pickType = (type: string) => setForm(f => {
    const next = withType(f, type, allChannels)
    // A title the form filled from a task the new type does not offer goes with it.
    return next.task_category === '' && f.task_category !== '' && f.title === filled ? { ...next, title: '' } : next
  })
  const pickTask = (tile: { key: string; label: string }) => {
    const answer = withTask(form, tile, filled)
    setForm(answer.form)
    setFilled(answer.filled)
  }

  // How long a task like this usually takes, once there is something to go by and no length chosen.
  const [asked, setAsked] = useState({ group: form.task_group, category: form.task_category, title: form.title })
  useEffect(() => {
    const id = window.setTimeout(() => setAsked({ group: form.task_group, category: form.task_category, title: form.title.trim() }), 500)
    return () => window.clearTimeout(id)
  }, [form.task_group, form.task_category, form.title])
  const estimate = useQuery({
    queryKey: ['time', 'estimate', asked],
    queryFn: () => timeApi.estimate({ task_group: asked.group || null, task_category: asked.category || null, title: asked.title || null }),
    enabled: !form.duration_minutes && (Boolean(asked.group) || Boolean(asked.category) || asked.title.length >= 3),
    staleTime: 5 * 60_000,
  }).data?.estimate

  // `again`: "Add & next" (the panel stays open for the next task); read by onSuccess from the call's variables.
  const save = useMutation<unknown, unknown, { again: boolean }>({
    mutationFn: async () => {
      const body = payloadOf(form, person, creating)
      if (creating) {
        const created = await plannerApi.create(body)
        for (const title of draftSubs.filter(s => s.trim())) await plannerApi.addSubtask(created.id, title.trim())
        return created
      }
      return plannerApi.update(task!.id, body)
    },
    onSuccess: (_, { again }) => {
      refresh()
      toast(creating ? t('time.task.created', 'Task added') : t('time.task.saved', 'Saved'))
      if (!again) { onClose(); return }
      // The next task of the same day, person and type.
      setForm(f => nextForm(EMPTY_FORM, f))
      setDraftSubs([])
      setNewSub('')
      setFilled(null)
      setProblem(null)
      setAdded(n => n + 1)
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const remove = useMutation({
    mutationFn: (scope: 'just_this' | 'all_future' | 'whole_series') => plannerApi.remove(task!.id, scope),
    onSuccess: () => { refresh(); toast(t('time.task.deleted', 'Task deleted')); onClose() },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const finish = useMutation({
    mutationFn: () => plannerApi.status(task!.id, 'done'),
    onSuccess: () => { refresh(); toast(t('time.task.finished', 'Done — well done')); onClose() },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const copy = useMutation({
    // A colleague's task is copied to one's own day when one may plan only one's own (PlanningMode).
    mutationFn: (date: string) => plannerApi.copy(task!.id, { task_date: date, ...(locked ? assignmentOf(meOf(boot)) : {}) }),
    onSuccess: () => { refresh(); toast(t('time.task.copied', 'Copied')); setCopyTo('') },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const sub = useMutation({
    mutationFn: async (action: { kind: 'add'; title: string } | { kind: 'toggle' | 'remove'; id: number }) => {
      if (action.kind === 'add') return plannerApi.addSubtask(task!.id, action.title)
      if (action.kind === 'toggle') return plannerApi.toggleSubtask(action.id)
      return plannerApi.removeSubtask(action.id)
    },
    onSuccess: (answer, action) => {
      refresh()
      if (action.kind === 'add') setSubtasks(list => [...list, { id: (answer as { id: number }).id, title: action.title, is_done: false }])
      if (action.kind === 'toggle') setSubtasks(list => list.map(s => (s.id === action.id ? { ...s, is_done: !s.is_done } : s)))
      if (action.kind === 'remove') setSubtasks(list => list.filter(s => s.id !== action.id))
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const submit = (again = false) => {
    const why = formProblem(form, creating)
    if (why) { setProblem(why); return }
    setProblem(null)
    save.mutate({ again })
  }

  const nextMonday = useMemo(() => addDays(today, 8 - isoWeekday(today)), [today])
  const minutes = Number(form.duration_minutes) || 0
  const end = form.start_time && minutes ? endOf(form.start_time, minutes) : null
  const busy = save.isPending || remove.isPending
  const problems: Record<string, string> = {
    title: t('time.task.problem_title', 'Give the task a title.'),
    recurring_needs_day: t('time.task.problem_repeat_day', 'A repeating task needs its first day.'),
    recurring_until: t('time.task.problem_until', 'The repeat must end after the first day.'),
    pool_due_date: t('time.task.problem_due', 'Choose the day it is due by.'),
  }

  return (
    <SidePanel title={creating ? t('time.task.new', 'New task') : t('time.task.edit', 'Task')} onClose={onClose}
      footer={locked ? (
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t('time.common.close', 'Close')}</Button></div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!creating && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 size={14} aria-hidden />{t('time.common.delete', 'Delete')}
            </Button>
          )}
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>{t('time.common.cancel', 'Cancel')}</Button>
            {creating && (
              <Button variant="secondary" onClick={() => submit(true)} disabled={busy} title={t('time.task.add_next_hint', 'Add this one and start the next, for the same day and person')}>
                {t('time.task.add_next', 'Add & next')}
              </Button>
            )}
            <Button onClick={() => submit()} loading={save.isPending && !save.variables?.again}>{creating ? t('time.task.add', 'Add task') : t('time.common.save', 'Save')}</Button>
          </div>
        </div>
      )}>
      <div className="space-y-5">
        {locked && <Notice tone="info">{t('time.task.locked', '{{name}} plans this task. In this planner everyone plans their own day; you can copy it to yours.', { name: ownerName })}</Notice>}
        {problem && <Notice tone="warning">{problems[problem]}</Notice>}
        {/* Read-only for a colleague's task in the `own` planning mode: every field and button below is disabled. */}
        <fieldset disabled={locked} className={`m-0 min-w-0 space-y-5 border-0 p-0 ${locked ? 'opacity-70' : ''}`}>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-a-text-2">{t('time.task.type', 'Type')}</span>
            {creating && templates.length > 0 && (
              <button type="button" aria-expanded={showTemplates} onClick={() => setShowTemplates(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-a-accent-text hover:underline">
                <FileText size={13} aria-hidden />
                {showTemplates ? t('time.task.hide_templates', 'Hide templates') : t('time.task.use_template', 'Use a template')}
                <ChevronDown size={12} aria-hidden className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          {creating && showTemplates && (
            <div className="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-a-border bg-a-surface-2/50 p-2.5">
              {templateGroups(templates).map(group => (
                <div key={group.category}>
                  <p className="mb-1 font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{group.category}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map(tpl => (
                      <button key={tpl.id} type="button"
                        onClick={() => {
                          setForm(f => ({
                            ...f, title: tpl.title, task_group: tpl.task_group ?? '', task_category: tpl.task_category ?? '',
                            priority: priorityOf(tpl.priority), duration_minutes: tpl.duration_minutes ? String(tpl.duration_minutes) : f.duration_minutes,
                            description: tpl.description ?? f.description,
                          }))
                          setFilled(null)
                          setShowTemplates(false)
                        }}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-a-border bg-a-surface px-3 text-xs font-medium text-a-text hover:border-a-accent">
                        {tpl.name}
                        {tpl.duration_minutes ? <span className="text-a-text-2">{duration(tpl.duration_minutes, units)}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {groups.length > 0
            ? <TypeGrid tiles={types} value={form.task_group} onPick={pickType} person={chosen?.name} />
            : <p className="text-xs text-a-text-2">{t('time.task.no_types', 'No task types yet: a manager adds them in Settings → Task types.')}</p>}
        </div>

        {(tasks.length > 0 || looseCategory) && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-a-text-2">{t('time.task.category', 'Task')}</span>
            {/* The task's key, as the full admin stores it; an older row's own text is shown as it is. */}
            {looseCategory && <p className="mb-1.5 text-xs text-a-text-2">{t('time.task.loose_category', 'Saved as “{{name}}”', { name: looseCategory })}</p>}
            <TaskGrid tiles={tasks} value={form.task_category} onPick={pickTask} person={chosen?.name} />
          </div>
        )}

        <div>
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('time.task.title', 'Title')}</span>
          <div className="flex items-center gap-2">
            <TextInput ref={titleRef} value={form.title} maxLength={200}
              onChange={e => { set('title', e.target.value); setFilled(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); if (!locked) submit() } }}
              aria-label={t('time.task.title', 'Title')} placeholder={t('time.task.title_hint', 'What needs doing?')} />
            {boot.features.voice && <VoiceButton language={i18n.language} onText={words => { set('title', form.title ? `${form.title} ${words}` : words); setFilled(null) }} />}
          </div>
        </div>

        <Field label={t('time.task.person', 'Who')}>
          <Select value={form.person} onChange={e => set('person', e.target.value)}>
            <option value="">{form.task_date ? t('time.task.nobody', 'Nobody yet') : t('time.task.pool', 'Nobody: the open pool')}</option>
            {people.map(p => <option key={p.key} value={p.key}>{p.name}{p.has_account ? '' : ` · ${t('time.task.no_account', 'no account')}`}</option>)}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label={t('time.task.day', 'Day')}>
              <TextInput type="date" value={form.task_date} onChange={e => set('task_date', e.target.value)} />
            </Field>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip on={form.task_date === today} onClick={() => set('task_date', today)}>{t('time.common.today', 'Today')}</Chip>
              <Chip on={form.task_date === addDays(today, 1)} onClick={() => set('task_date', addDays(today, 1))}>{t('time.common.tomorrow', 'Tomorrow')}</Chip>
              <Chip on={form.task_date === nextMonday} onClick={() => set('task_date', nextMonday)}>{t('time.task.next_week', 'Next week')}</Chip>
              <Chip on={form.task_date === ''} onClick={() => setForm(f => ({ ...f, task_date: '', start_time: '' }))}>{t('time.task.no_day', 'No day yet')}</Chip>
            </div>
          </div>
          <Field label={t('time.task.start', 'Start')} hint={end ? t('time.task.ends', 'Ends at {{time}}', { time: end }) : undefined}>
            <TextInput type="time" step={300} value={form.start_time} disabled={!form.task_date} onChange={e => set('start_time', e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-a-text-2">{t('time.task.length', 'How long')}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATIONS.map(m => <Chip key={m} on={minutes === m} onClick={() => set('duration_minutes', String(m))}>{duration(m, units)}</Chip>)}
            <TextInput type="number" min={5} max={720} step={5} value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)}
              aria-label={t('time.task.minutes', 'Minutes')} placeholder={t('time.task.minutes', 'Minutes')} className="w-28!" />
          </div>
          {estimate && !form.duration_minutes && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl time-ai-soft px-3 py-2 text-sm">
              <Sparkles size={14} aria-hidden />
              <span>{estimate.basis === 'title'
                ? t('time.task.estimate_title', 'Tasks like this usually take about {{length}} ({{count}} done before).', { length: duration(estimate.minutes, units), count: estimate.samples })
                : estimate.basis === 'category'
                  ? t('time.task.estimate_category', '“{{name}}” usually takes about {{length}} ({{count}} done before).', { name: boot.settings.channels.find(c => c.key === form.task_category)?.label ?? form.task_category, length: duration(estimate.minutes, units), count: estimate.samples })
                  : t('time.task.estimate_group', '{{name}} work usually takes about {{length}} ({{count}} done before).', { name: form.task_group, length: duration(estimate.minutes, units), count: estimate.samples })}</span>
              <button type="button" className="ml-auto font-semibold underline" onClick={() => set('duration_minutes', String(estimate.minutes))}>{t('time.task.use', 'Use it')}</button>
            </div>
          )}
        </div>


        {!form.task_date && !form.person && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-a-text-2">{t('time.task.horizon', 'When it should be done')}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip on={form.pool_horizon === '' || form.pool_horizon === 'general'} onClick={() => set('pool_horizon', 'general')}>{t('time.horizon.general', 'Anytime')}</Chip>
              <Chip on={form.pool_horizon === 'week'} onClick={() => set('pool_horizon', 'week')}>{t('time.horizon.week', 'This week')}</Chip>
              <Chip on={form.pool_horizon === 'day'} onClick={() => set('pool_horizon', 'day')}>{t('time.horizon.day', 'By a day')}</Chip>
              {form.pool_horizon === 'day' && (
                <TextInput type="date" value={form.pool_due_date} onChange={e => set('pool_due_date', e.target.value)} aria-label={t('time.horizon.day', 'By a day')} className="w-44!" />
              )}
            </div>
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-xs font-medium text-a-text-2">{t('time.task.priority', 'Priority')}</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('time.task.priority', 'Priority')}>
            {PRIORITIES.map(p => <Chip key={p} on={form.priority === p} onClick={() => set('priority', p)}>{t(`time.priority.${p.toLowerCase()}`, p)}</Chip>)}
          </div>
        </div>

        {!creating && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-a-text-2">{t('time.task.status', 'Status')}</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('time.task.status', 'Status')}>
              {STATUSES.map(s => <Chip key={s} on={form.status === s} onClick={() => set('status', s)}>{t(`time.status.${s}`, s)}</Chip>)}
            </div>
          </div>
        )}

        {creating && form.task_date && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('time.task.repeat', 'Repeat')}>
              <Select value={form.recurring} onChange={e => set('recurring', e.target.value as TaskForm['recurring'])}>
                {RECURRING.map(r => <option key={r} value={r}>{t(`time.repeat.${r}`, r)}</option>)}
              </Select>
            </Field>
            {form.recurring !== 'none' && (
              <Field label={t('time.task.until', 'Until')} hint={t('time.task.until_hint', 'At most 90 times.')}>
                <TextInput type="date" value={form.recurring_until} min={form.task_date} onChange={e => set('recurring_until', e.target.value)} />
              </Field>
            )}
          </div>
        )}

        <div>
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('time.task.notes', 'Notes')}</span>
          <div className="flex items-start gap-2">
            <TextArea rows={3} value={form.description} onChange={e => set('description', e.target.value)} aria-label={t('time.task.notes', 'Notes')} />
            {boot.features.voice && <VoiceButton language={i18n.language} onText={words => set('description', appendWords(form.description, words))} />}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-a-text-2">{t('time.task.subtasks', 'Steps')}</span>
          <ul className="space-y-1.5">
            {(creating ? draftSubs.map((title, i) => ({ id: -i - 1, title, is_done: false })) : subtasks).map(s => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border border-a-border px-2.5 py-1.5 text-sm">
                {!creating && (
                  <input type="checkbox" checked={s.is_done} onChange={() => sub.mutate({ kind: 'toggle', id: s.id })} aria-label={s.title} className="h-4 w-4 accent-[rgb(var(--a-accent))]" />
                )}
                <span className={`min-w-0 flex-1 truncate ${s.is_done ? 'text-a-text-2 line-through' : 'text-a-text'}`}>{s.title}</span>
                <button type="button" aria-label={`${t('time.common.delete', 'Delete')}: ${s.title}`} className="rounded-sm p-1 text-a-text-2 hover:text-a-danger"
                  onClick={() => (creating ? setDraftSubs(list => list.filter((_, i) => -i - 1 !== s.id)) : sub.mutate({ kind: 'remove', id: s.id }))}>
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <form className="mt-2 flex gap-2" onSubmit={e => {
            e.preventDefault()
            const title = newSub.trim()
            if (!title) return
            if (creating) setDraftSubs(list => [...list, title])
            else sub.mutate({ kind: 'add', title })
            setNewSub('')
          }}>
            <TextInput value={newSub} onChange={e => setNewSub(e.target.value)} maxLength={200} placeholder={t('time.task.add_step', 'Add a step')} aria-label={t('time.task.add_step', 'Add a step')} />
            <Button type="submit" variant="secondary" size="sm" disabled={!newSub.trim()}>{t('time.common.add', 'Add')}</Button>
          </form>
        </div>
        </fieldset>

        {!creating && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-a-border bg-a-surface-2 p-3">
            <Copy size={15} aria-hidden className="text-a-text-2" />
            <span className="text-sm text-a-text-2">{t('time.task.copy_to', 'Copy to another day')}</span>
            <TextInput type="date" value={copyTo} onChange={e => setCopyTo(e.target.value)} aria-label={t('time.task.copy_to', 'Copy to another day')} className="w-44!" />
            <Button variant="secondary" size="sm" disabled={!copyTo} loading={copy.isPending} onClick={() => copy.mutate(copyTo)}>
              <CalendarDays size={14} aria-hidden />{t('time.task.copy', 'Copy')}
            </Button>
            {task && !task.done && !locked && (
              <Button variant="ghost" size="sm" className="ml-auto" loading={finish.isPending} onClick={() => finish.mutate()}>
                <CheckCircle2 size={14} aria-hidden />{t('time.task.mark_done', 'Mark done')}
              </Button>
            )}
          </div>
        )}
      </div>

      {confirmDelete && task && (
        <Confirm title={t('time.task.delete_title', 'Delete this task?')} confirm={t('time.common.delete', 'Delete')} busy={remove.isPending}
          onClose={() => setConfirmDelete(false)} onConfirm={() => remove.mutate('just_this')}>
          <p>{t('time.task.delete_line', '“{{title}}” and its steps go for good.', { title: task.title })}</p>
          {task.recurring && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => remove.mutate('all_future')}>{t('time.task.delete_future', 'This and later repeats')}</Button>
              <Button variant="secondary" size="sm" onClick={() => remove.mutate('whole_series')}>{t('time.task.delete_series', 'The whole series')}</Button>
            </div>
          )}
        </Confirm>
      )}
    </SidePanel>
  )
}
