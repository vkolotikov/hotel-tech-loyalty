import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Clock, Flag, Repeat as RepeatIcon, Search, Timer, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import {
  DURATIONS, endsAt, groupOf, isGridTime, partOf, PRIORITIES, quickDays, REPEATS, startTimes, suggestedTitle, summaryOf,
  TYPE_GROUPS, withDate, withDuration, withTime, type DayPart, type Priority, type TypeGroup,
} from '../../lib/taskForm'
import { useBoot } from '../CrmProvider'
import { get, params, send, failureOf } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel } from '../lib/format'
import { leadPath } from '../lib/links'
import { CONTROL, Select, TextArea, TextInput } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { TONE_CHIP, type Tone } from '../ui/tones'
import type { LeadRow, Paginated } from '../leads/leadTypes'
import { draftOf, taskBody, validateTask, type Task, type TaskDraft } from './taskLogic'
import { useTaskChanged, useTeam } from './taskData'
import {
  groupLabel, lengthLabel, partLabel, priorityLabel, quickDayLabel, repeatLabel, TASK_ICONS, taskProblem, taskTypeLabel,
} from './taskWords'

/** Each group's tone in the type grid: getting in touch the accent, meeting amber, selling green, the rest quiet. */
const GROUP_TONE: Record<TypeGroup, Tone> = { talk: 'accent', meet: 'pending', sell: 'success', other: 'neutral' }
const PRIORITY_TONE: Record<Priority, string> = {
  low: 'border-a-border bg-a-surface-2 text-a-text',
  normal: 'border-transparent bg-a-accent text-a-accent-ink',
  high: 'border-transparent bg-a-danger text-a-danger-ink',
}
const CHIP = 'min-h-9 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent disabled:cursor-not-allowed disabled:opacity-45'
const CHIP_OFF = 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'
const CHIP_ON = 'border-transparent bg-a-accent text-a-accent-ink'

/**
 * Add or change a task (TaskController::store / update), in four steps (owner 2026-11-09: easier, organised, with the
 * main platform's type grid; the shared form's rules are `src/lib/taskForm.ts`, which the full admin's drawer uses
 * too): what (the type from a grid in four groups, the title the type suggests, the priority), when (a day, then a
 * start time by part of the day, then how long and how often — each on once the one before is set; on the venue's
 * clock), who does it and the lead (chosen when it is added; the server does not move a task to another lead), and
 * notes. The footer sums it up.
 */
export function TaskForm({ task, inquiryId, leadName, onClose }: {
  task: Task | null
  /** Opened from a lead: the new task is that lead's. */
  inquiryId?: number | null
  leadName?: string | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const zone = boot.venue.timezone
  const toast = useToast()
  const changed = useTaskChanged()
  const team = useTeam()
  const formId = useId()
  const isNew = !task
  const [draft, setDraft] = useState<TaskDraft>(() => draftOf(task, zone, { me: boot.staff.id, inquiryId: inquiryId ?? null }))
  const [picked, setPicked] = useState<string | null>(leadName ?? null)
  const [part, setPart] = useState<DayPart>(() => partOf(draft.time))
  const [tried, setTried] = useState(false)
  const suggestion = suggestedTitle(taskTypeLabel(t, draft.type), picked)
  const errors = validateTask(draft, suggestion)
  const set = (patch: Partial<TaskDraft>) => setDraft(d => ({ ...d, ...patch }))

  const save = useMutation({
    mutationFn: () => {
      const body = taskBody(draft, zone, !task, suggestion)
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

  const lang = i18n.language
  const people = team.data ?? []
  const meListed = people.some(p => p.id === boot.staff.id)
  const lockedLead = !isNew || Boolean(inquiryId)
  const fieldErrors = failureOf(save.error).fields ?? {}
  const days = quickDays(boot.venue.today)
  const isQuick = days.some(d => d.date === draft.date)
  const parts = startTimes()
  const shown = parts.find(p => p.part === part) ?? parts[0]
  const end = endsAt(draft.time, draft.duration)
  const problem = (field: keyof typeof errors) => (tried ? taskProblem(t, errors[field]) : undefined)

  return (
    <SidePanel title={isNew ? t('crm.tasks.new_title', 'New task') : t('crm.tasks.edit_title', 'Change the task')} onClose={onClose}
      footer={(
        <div className="space-y-3">
          <Summary draft={draft} lang={lang} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
            <Button type="submit" form={formId} loading={save.isPending}>{isNew ? t('crm.tasks.add', 'Add the task') : t('crm.common.save', 'Save')}</Button>
          </div>
        </div>
      )}>
      <form id={formId} onSubmit={submit} noValidate className="space-y-6">
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}

        <Step n={1} title={t('crm.tasks.step_what', 'What')} line={t('crm.tasks.step_what_line', 'The kind of task, its title and how urgent it is.')}>
          <div className="space-y-3" role="radiogroup" aria-label={t('crm.tasks.field_type', 'Type')}>
            {TYPE_GROUPS.map(group => (
              <div key={group.key}>
                <p className="mb-1.5 text-xs font-medium text-a-text-2">{groupLabel(t, group.key)}</p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {group.types.map(type => {
                    const Icon = TASK_ICONS[type]
                    const on = draft.type === type
                    return (
                      <button key={type} type="button" role="radio" aria-checked={on} onClick={() => set({ type })}
                        className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 text-center text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent ${on ? 'border-a-accent bg-a-accent/10 text-a-text' : 'border-a-border bg-a-surface text-a-text-2 hover:border-a-text-2/40 hover:text-a-text'}`}>
                        <span aria-hidden className={`grid h-7 w-7 place-items-center rounded-lg ${TONE_CHIP[GROUP_TONE[groupOf(type)]]}`}><Icon size={15} /></span>
                        <span className="leading-tight">{taskTypeLabel(t, type)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <Field label={t('crm.tasks.field_title', 'Title')} hint={draft.title.trim() ? undefined : t('crm.tasks.title_hint', 'Leave it empty to use “{{title}}”.', { title: suggestion })}>
            <TextInput value={draft.title} onChange={e => set({ title: e.target.value })} maxLength={200} placeholder={suggestion}
              aria-invalid={problem('title') || fieldErrors.title ? true : undefined} />
            {problem('title') && <span className="mt-1 block text-xs text-a-danger">{problem('title')}</span>}
          </Field>

          <div>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-a-text-2"><Flag size={13} aria-hidden />{t('crm.tasks.field_priority', 'Priority')}</span>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('crm.tasks.field_priority', 'Priority')}>
              {PRIORITIES.map(p => (
                <button key={p} type="button" role="radio" aria-checked={draft.priority === p} onClick={() => set({ priority: p })}
                  className={`${CHIP} ${draft.priority === p ? PRIORITY_TONE[p] : CHIP_OFF}`}>
                  {priorityLabel(t, p)}
                </button>
              ))}
            </div>
          </div>
        </Step>

        <Step n={2} title={t('crm.tasks.step_when', 'When')} line={t('crm.tasks.zone_hint', 'On the venue\'s clock ({{zone}})', { zone })}>
          <div>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-a-text-2"><CalendarDays size={13} aria-hidden />{t('crm.tasks.field_date', 'Day')}</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('crm.tasks.quick_dates', 'Quick days')}>
              {days.map(d => (
                <button key={d.key} type="button" aria-pressed={draft.date === d.date} onClick={() => setDraft(s => withDate(s, d.date))}
                  className={`${CHIP} ${draft.date === d.date ? CHIP_ON : CHIP_OFF}`}>
                  {quickDayLabel(t, d.key)}
                </button>
              ))}
              <button type="button" aria-pressed={!draft.date} onClick={() => setDraft(s => withDate(s, ''))}
                className={`${CHIP} ${!draft.date ? CHIP_ON : CHIP_OFF}`}>
                {t('crm.tasks.no_date', 'No day')}
              </button>
            </div>
            <label className="mt-2 flex items-center gap-2">
              <span className="shrink-0 text-xs text-a-text-2">{t('crm.tasks.pick_day', 'Another day')}</span>
              <TextInput type="date" value={isQuick ? '' : draft.date} onChange={e => setDraft(s => withDate(s, e.target.value))}
                aria-invalid={problem('date') || fieldErrors.due_at ? true : undefined} />
            </label>
            {draft.date && <p className="mt-1.5 text-xs text-a-text-2">{dayLabel(draft.date, lang)}</p>}
          </div>

          <fieldset disabled={!draft.date} className="min-w-0 disabled:opacity-60">
            <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-a-text-2"><Clock size={13} aria-hidden />{t('crm.tasks.field_start', 'Start time')}</legend>
            {!draft.date && <p className="mb-2 text-xs text-a-text-2">{t('crm.tasks.start_needs_day', 'Pick a day to choose a time.')}</p>}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button type="button" aria-pressed={!draft.time} onClick={() => setDraft(s => ({ ...s, time: '', duration: null }))}
                className={`${CHIP} ${!draft.time ? CHIP_ON : CHIP_OFF}`}>
                {t('crm.tasks.any_time', 'Any time')}
              </button>
              <span className="mx-1 h-5 w-px bg-a-border" aria-hidden />
              {parts.map(p => (
                <button key={p.part} type="button" aria-pressed={part === p.part} onClick={() => setPart(p.part)}
                  className={`min-h-9 rounded-full px-3 text-sm font-medium ${part === p.part ? 'bg-a-surface-2 text-a-text' : 'text-a-text-2 hover:text-a-text'}`}>
                  {partLabel(t, p.part)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={partLabel(t, shown.part)}>
              {shown.times.map(time => (
                <button key={time} type="button" aria-pressed={draft.time === time} onClick={() => setDraft(s => withTime(s, time))}
                  className={`min-h-9 rounded-lg border text-sm font-medium tabular-nums ${draft.time === time ? CHIP_ON : CHIP_OFF}`}>
                  {time}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2">
              <span className="shrink-0 text-xs text-a-text-2">{t('crm.tasks.other_time', 'Other time')}</span>
              <TextInput type="time" step={300} value={draft.time && !isGridTime(draft.time) ? draft.time : ''}
                onChange={e => setDraft(s => (e.target.value ? { ...s, time: e.target.value } : { ...s, time: '', duration: null }))}
                aria-invalid={problem('time') ? true : undefined} />
            </label>
            {problem('time') && <span className="mt-1 block text-xs text-a-danger">{problem('time')}</span>}
          </fieldset>

          <fieldset disabled={!draft.time} className="min-w-0 disabled:opacity-60">
            <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-a-text-2"><Timer size={13} aria-hidden />{t('crm.tasks.field_length', 'How long')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map(m => (
                <button key={m} type="button" aria-pressed={draft.duration === m} onClick={() => setDraft(s => withDuration(s, m))}
                  className={`${CHIP} ${draft.duration === m ? CHIP_ON : CHIP_OFF}`}>
                  {lengthLabel(t, m)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-a-text-2">
              {!draft.time ? t('crm.tasks.length_needs_time', 'Pick a start time to choose how long.')
                : end ? (end.nextDay ? t('crm.tasks.ends_next_day', 'Ends at {{time}} the next day', { time: end.time }) : t('crm.tasks.ends_at', 'Ends at {{time}}', { time: end.time }))
                : t('crm.tasks.length_open', 'No set length.')}
            </p>
          </fieldset>

          <fieldset disabled={!draft.date} className="min-w-0 disabled:opacity-60">
            <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-a-text-2"><RepeatIcon size={13} aria-hidden />{t('crm.tasks.field_repeat', 'Repeat')}</legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('crm.tasks.field_repeat', 'Repeat')}>
              {REPEATS.map(r => (
                <button key={r} type="button" role="radio" aria-checked={draft.repeat === r} onClick={() => set({ repeat: r })}
                  className={`${CHIP} ${draft.repeat === r ? CHIP_ON : CHIP_OFF}`}>
                  {repeatLabel(t, r)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-a-text-2">
              {!draft.date ? t('crm.tasks.repeat_needs_day', 'Pick a day to repeat it.')
                : draft.repeat === 'none' ? t('crm.tasks.repeat_once', 'Done once.')
                : t('crm.tasks.repeat_line', 'When it is done, the next one is added at the same time.')}
            </p>
          </fieldset>
        </Step>

        <Step n={3} title={t('crm.tasks.step_who', 'Who and for which lead')}>
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
        </Step>

        <Step n={4} title={t('crm.tasks.step_notes', 'Notes')}>
          <Field label={t('crm.tasks.field_notes', 'Notes (optional)')}>
            <TextArea rows={3} value={draft.description} onChange={e => set({ description: e.target.value })} maxLength={4000}
              placeholder={t('crm.tasks.notes_placeholder', 'What whoever picks this up should know.')} />
          </Field>
        </Step>
      </form>
    </SidePanel>
  )
}

/** One step of the form: its number, its title and what it is for. */
function Step({ n, title, line, children }: { n: number; title: string; line?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-a-border pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <header className="flex items-start gap-2.5">
        <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-a-accent/12 text-xs font-semibold text-a-accent-text">{n}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-a-text">{title}</h3>
          {line && <p className="text-xs text-a-text-2">{line}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

/** The task in one line: the type, the day and time (start and end), the repeat and the priority. */
function Summary({ draft, lang }: { draft: TaskDraft; lang: string }) {
  const { t } = useTranslation()
  const s = summaryOf(draft)
  const when = !s.date ? t('crm.tasks.summary_no_day', 'No day yet')
    : !s.start ? dayLabel(s.date, lang)
    : s.end ? t('crm.tasks.summary_range', '{{day}}, {{start}}–{{end}}', { day: dayLabel(s.date, lang), start: s.start, end: s.end.time })
    : t('crm.tasks.summary_at', '{{day}}, {{time}}', { day: dayLabel(s.date, lang), time: s.start })
  const Icon = TASK_ICONS[s.type]
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-a-text-2" aria-live="polite">
      <Icon size={15} aria-hidden className="text-a-text" />
      <span className="font-medium text-a-text">{taskTypeLabel(t, s.type)}</span>
      <span aria-hidden>·</span><span>{when}</span>
      {s.repeat !== 'none' && <><span aria-hidden>·</span><span>{repeatLabel(t, s.repeat)}</span></>}
      {s.priority !== 'normal' && <><span aria-hidden>·</span><span className={s.priority === 'high' ? 'font-medium text-a-danger' : undefined}>{priorityLabel(t, s.priority)}</span></>}
    </p>
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
