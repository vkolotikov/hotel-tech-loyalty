import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CalendarDays, Clock, Flag, Repeat as RepeatIcon, Timer, UserRound, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import {
  DURATIONS, EMPTY_TASK_FORM, endsAt, formProblems, isGridTime, isTaskType, partOf, planBody, planOf, PRIORITIES,
  quickDays, REPEATS, splitMinutes, startTimes, suggestedTitle, summaryOf, titleOf, TYPE_GROUPS, withDate, withDuration,
  withTime, type DayPart, type Priority, type QuickDay, type Repeat, type TaskFormState, type TaskPlanFields,
  type TaskType, type TypeGroup,
} from '../lib/taskForm'
import { TASK_ICONS } from '../lib/taskTypeIcons'
import { CustomFieldsForm } from './CustomFields'

/**
 * The full admin's task drawer (lead detail, the Inquiries rows, Tasks). Redesigned on 2026-11-09 (owner: "improve
 * design, logic and make it easier to use, more structured"), in the same four steps as HexaTech CRM's task form, on
 * the same rules (`src/lib/taskForm.ts`):
 *
 *  1. What — the type from a grid in four groups (each type in its own colour), the title the type suggests, priority.
 *  2. When — a day, then a start time by part of the day (or any other time), then how long and how often; each step
 *     is on once the one before is set, so nothing chosen is silently dropped.
 *  3. Who does it, and the lead it is for.
 *  4. Notes and the organisation's own task fields.
 *
 * Priority, length and repeat are the task's own fields (`priority`, `duration_minutes`, `recurring_rule`): before,
 * they were sent inside `custom_data`, which keeps only the organisation's custom fields, so none was ever saved. Times
 * are the person's own clock, as before.
 */

export interface TaskDrawerTask extends TaskPlanFields {
  id: number
  type: string
  title: string
  description: string | null
  due_at: string | null
  inquiry_id: number | null
  assigned_to?: number | null
  custom_data?: Record<string, unknown> | null
}

interface Props {
  task: TaskDrawerTask | null
  defaultInquiryId?: number
  onClose: () => void
  onSaved: () => void
}

/** Each type's colour on its tile (the main platform's own). */
const TYPE_COLORS: Record<TaskType, string> = {
  call: '#22d3ee', email: '#a78bfa', whatsapp: '#25D366', sms: '#8b5cf6', video_call: '#06b6d4', meeting: '#fbbf24',
  site_visit: '#f472b6', demo: '#fb923c', send_proposal: '#34d399', contract: '#10b981', discovery: '#60a5fa',
  follow_up: '#94a3b8', custom: '#9ca3af',
}

const PRIORITY_ON: Record<Priority, string> = {
  low: 'bg-gray-500/15 text-gray-200 border-gray-500/40',
  normal: 'bg-blue-500/20 text-blue-200 border-blue-500/50',
  high: 'bg-red-500/20 text-red-200 border-red-500/50',
}

const CHIP = 'px-3 py-1.5 rounded-md border text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed'
const CHIP_OFF = 'bg-dark-bg border-dark-border text-t-secondary hover:text-white hover:bg-dark-surface2'
const CHIP_ON = 'bg-accent text-black border-accent'
const INPUT = 'w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-hidden focus:border-accent'

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** A stored due time on the person's own clock (a day without a time reads as midnight). */
function splitDueAt(dueAt: string | null): { date: string; time: string } {
  if (!dueAt) return { date: '', time: '' }
  const d = new Date(dueAt)
  if (isNaN(d.getTime())) return { date: '', time: '' }
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return { date: localDay(d), time: time === '00:00' ? '' : time }
}

/** The instant the person's own clock names (ISO UTC); midnight when only a day is chosen. */
function joinDueAt(date: string, time: string): string | null {
  if (!date) return null
  const local = new Date(`${date}T${time || '00:00'}`)
  return isNaN(local.getTime()) ? null : local.toISOString()
}

function formOf(task: TaskDrawerTask | null): TaskFormState {
  if (!task) return { ...EMPTY_TASK_FORM }
  const { date, time } = splitDueAt(task.due_at)
  const plan = planOf(task)
  return {
    ...EMPTY_TASK_FORM,
    ...plan,
    type: isTaskType(task.type) ? task.type : 'custom',
    title: task.title,
    description: task.description ?? '',
    date,
    time,
    duration: time ? plan.duration : null,
    repeat: date ? plan.repeat : 'none',
  }
}

/** The organisation's own task fields, without what older drawers put there by mistake. */
function customOf(task: TaskDrawerTask | null): Record<string, unknown> {
  const cd = { ...(task?.custom_data ?? {}) }
  delete cd.priority; delete cd.duration_minutes; delete cd.recurring
  return cd
}

export function TaskDrawer({ task, defaultInquiryId, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation()
  const isNew = !task
  const [form, setForm] = useState<TaskFormState>(() => formOf(task))
  const [assignee, setAssignee] = useState<number | null>(task?.assigned_to ?? null)
  const [customData, setCustomData] = useState<Record<string, unknown>>(() => customOf(task))
  const [part, setPart] = useState<DayPart>(() => partOf(form.time))
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<TaskFormState>) => setForm(f => ({ ...f, ...patch }))

  const team = useQuery({
    queryKey: ['task-drawer', 'team'],
    queryFn: () => api.get<{ id: number; name: string }[]>('/v1/admin/chat-inbox-agents').then(r => r.data),
    staleTime: 5 * 60_000,
    retry: false,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const suggestion = suggestedTitle(typeLabel(t, form.type))
  const problems = formProblems(form, suggestion)
  const inquiryId = task?.inquiry_id ?? defaultInquiryId ?? null

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        type: form.type,
        title: titleOf(form, suggestion),
        description: form.description.trim() || null,
        due_at: joinDueAt(form.date, form.time),
        ...planBody(form),
        custom_data: customData,
      }
      if (assignee) payload.assigned_to = assignee
      if (isNew && defaultInquiryId) payload.inquiry_id = defaultInquiryId
      return isNew ? api.post('/v1/admin/tasks', payload) : api.put(`/v1/admin/tasks/${task!.id}`, payload)
    },
    onSuccess: () => {
      toast.success(isNew ? t('taskDrawer.toasts.created', 'Task created') : t('taskDrawer.toasts.updated', 'Task updated'))
      onSaved()
    },
    onError: () => toast.error(t('taskDrawer.toasts.save_failed', 'Save failed')),
  })

  const submit = () => {
    setTried(true)
    if (Object.keys(problems).length > 0) return
    save.mutate()
  }

  const days = quickDays(localDay(new Date()))
  const isQuick = days.some(d => d.date === form.date)
  const parts = startTimes()
  const shown = parts.find(p => p.part === part) ?? parts[0]
  const end = endsAt(form.time, form.duration)
  const people = team.data ?? []

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50 flex justify-end" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? t('taskDrawer.title_new', 'New task') : t('taskDrawer.title_edit', 'Edit task')}
        className="bg-dark-surface border-l border-dark-border w-full max-w-lg h-full flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-lg font-bold text-white">{isNew ? t('taskDrawer.title_new', 'New task') : t('taskDrawer.title_edit', 'Edit task')}</h2>
          <button onClick={onClose} aria-label={t('taskDrawer.actions.cancel', 'Cancel')} className="p-1.5 rounded-sm hover:bg-dark-surface2 text-t-secondary hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <Step n={1} title={t('taskDrawer.steps.what', 'What')} line={t('taskDrawer.steps.what_line', 'The kind of task, its title and how urgent it is.')}>
            <div className="space-y-3" role="radiogroup" aria-label={t('taskDrawer.labels.type', 'Type')}>
              {TYPE_GROUPS.map(group => (
                <div key={group.key}>
                  <p className="text-[11px] font-semibold text-t-secondary mb-1.5">{groupLabel(t, group.key)}</p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {group.types.map(type => {
                      const Icon = TASK_ICONS[type]
                      const on = form.type === type
                      return (
                        <button key={type} type="button" role="radio" aria-checked={on} onClick={() => set({ type })}
                          className={`flex flex-col items-center justify-center gap-1 min-h-[58px] px-1 py-2 rounded-md border text-[11px] font-bold text-center leading-tight transition ${on ? 'text-black' : 'text-t-secondary border-dark-border hover:bg-dark-surface2 hover:text-white'}`}
                          style={on ? { background: TYPE_COLORS[type], borderColor: TYPE_COLORS[type] } : undefined}>
                          <Icon size={15} style={on ? undefined : { color: TYPE_COLORS[type] }} />
                          {typeLabel(t, type)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <Label>{t('taskDrawer.labels.title', 'Title')}</Label>
            <input value={form.title} onChange={e => set({ title: e.target.value })} maxLength={200} placeholder={suggestion}
              className={INPUT} aria-invalid={tried && problems.title ? true : undefined} />
            <p className="text-[11px] text-t-secondary mt-1">
              {tried && problems.title ? problemText(t, problems.title)
                : form.title.trim() ? null : t('taskDrawer.title_hint', { title: suggestion, defaultValue: 'Leave it empty to use “{{title}}”.' })}
            </p>

            <Label icon={<Flag size={11} />}>{t('taskDrawer.labels.priority', 'Priority')}</Label>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('taskDrawer.labels.priority', 'Priority')}>
              {PRIORITIES.map(p => (
                <button key={p} type="button" role="radio" aria-checked={form.priority === p} onClick={() => set({ priority: p })}
                  className={`${CHIP} py-2 ${form.priority === p ? PRIORITY_ON[p] : CHIP_OFF}`}>
                  {priorityLabel(t, p)}
                </button>
              ))}
            </div>
          </Step>

          <Step n={2} title={t('taskDrawer.steps.when', 'When')} line={t('taskDrawer.steps.when_line', 'On your own clock.')}>
            <Label icon={<CalendarDays size={11} />}>{t('taskDrawer.labels.date', 'Date')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {days.map(d => (
                <button key={d.key} type="button" aria-pressed={form.date === d.date} onClick={() => setForm(f => withDate(f, d.date))}
                  className={`${CHIP} ${form.date === d.date ? CHIP_ON : CHIP_OFF}`}>
                  {quickDayLabel(t, d.key)}
                </button>
              ))}
              <button type="button" aria-pressed={!form.date} onClick={() => setForm(f => withDate(f, ''))}
                className={`${CHIP} ${!form.date ? CHIP_ON : CHIP_OFF}`}>
                {t('taskDrawer.date_quick.none', 'No date')}
              </button>
            </div>
            <label className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-t-secondary shrink-0">{t('taskDrawer.date_quick.other', 'Another day')}</span>
              <input type="date" value={isQuick ? '' : form.date} onChange={e => setForm(f => withDate(f, e.target.value))} className={INPUT} />
            </label>
            {form.date && <p className="text-[11px] text-t-secondary mt-1">{dayText(form.date, i18n.language)}</p>}

            <fieldset disabled={!form.date} className="min-w-0 disabled:opacity-60">
              <legend className="w-full"><Label icon={<Clock size={11} />}>{t('taskDrawer.labels.start_time', 'Start time')}</Label></legend>
              {!form.date && <p className="text-[11px] text-t-secondary mb-2">{t('taskDrawer.start_needs_day', 'Pick a day to choose a time.')}</p>}
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <button type="button" aria-pressed={!form.time} onClick={() => setForm(f => ({ ...f, time: '', duration: null }))}
                  className={`${CHIP} ${!form.time ? CHIP_ON : CHIP_OFF}`}>
                  {t('taskDrawer.any_time', 'Any time')}
                </button>
                <span className="mx-1 h-5 w-px bg-dark-border" aria-hidden />
                {parts.map(p => (
                  <button key={p.part} type="button" aria-pressed={part === p.part} onClick={() => setPart(p.part)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold ${part === p.part ? 'bg-dark-surface2 text-white' : 'text-t-secondary hover:text-white'}`}>
                    {partLabel(t, p.part)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1" role="group" aria-label={partLabel(t, shown.part)}>
                {shown.times.map(time => (
                  <button key={time} type="button" aria-pressed={form.time === time} onClick={() => setForm(f => withTime(f, time))}
                    className={`px-1.5 py-1.5 rounded text-xs font-medium tabular-nums transition ${form.time === time ? 'bg-primary-600 text-on-primary' : 'bg-dark-bg text-t-secondary hover:bg-dark-surface2 hover:text-white'}`}>
                    {time}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-t-secondary shrink-0">{t('taskDrawer.other_time', 'Other time')}</span>
                <input type="time" step={300} value={form.time && !isGridTime(form.time) ? form.time : ''}
                  onChange={e => setForm(f => (e.target.value ? { ...f, time: e.target.value } : { ...f, time: '', duration: null }))} className={INPUT} />
              </label>
            </fieldset>

            <fieldset disabled={!form.time} className="min-w-0 disabled:opacity-60">
              <legend className="w-full"><Label icon={<Timer size={11} />}>{t('taskDrawer.labels.duration', 'Duration')}</Label></legend>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map(m => (
                  <button key={m} type="button" aria-pressed={form.duration === m} onClick={() => setForm(f => withDuration(f, m))}
                    className={`${CHIP} ${form.duration === m ? CHIP_ON : CHIP_OFF}`}>
                    {lengthLabel(t, m)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-t-secondary mt-1">
                {!form.time ? t('taskDrawer.length_needs_time', 'Pick a start time to choose how long.')
                  : end ? (end.nextDay ? t('taskDrawer.ends_next_day', { time: end.time, defaultValue: 'Ends at {{time}} the next day' }) : t('taskDrawer.ends_at', { time: end.time, defaultValue: 'Ends at {{time}}' }))
                  : t('taskDrawer.length_open', 'No set length.')}
              </p>
            </fieldset>

            <fieldset disabled={!form.date} className="min-w-0 disabled:opacity-60">
              <legend className="w-full"><Label icon={<RepeatIcon size={11} />}>{t('taskDrawer.labels.repeat', 'Repeat')}</Label></legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="radiogroup" aria-label={t('taskDrawer.labels.repeat', 'Repeat')}>
                {REPEATS.map(r => (
                  <button key={r} type="button" role="radio" aria-checked={form.repeat === r} onClick={() => set({ repeat: r })}
                    className={`${CHIP} ${form.repeat === r ? 'bg-accent/15 border-accent/50 text-accent' : CHIP_OFF}`}>
                    {repeatLabel(t, r)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-t-secondary mt-1">
                {!form.date ? t('taskDrawer.repeat_needs_day', 'Pick a day to repeat it.')
                  : form.repeat === 'none' ? t('taskDrawer.repeat_once', 'Done once.')
                  : t('taskDrawer.repeat_line', 'When it is done, the next one is added at the same time.')}
              </p>
            </fieldset>
          </Step>

          <Step n={3} title={t('taskDrawer.steps.who', 'Who and for which lead')}>
            {people.length > 0 && (
              <>
                <Label icon={<UserRound size={11} />}>{t('taskDrawer.labels.assignee', 'Who does it')}</Label>
                <select value={assignee ?? ''} onChange={e => setAssignee(e.target.value ? Number(e.target.value) : null)} className={INPUT}>
                  <option value="">{t('taskDrawer.assignee_me', 'Me')}</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </>
            )}
            {inquiryId ? (
              <div className="bg-dark-bg border border-dark-border rounded-md p-3 text-xs text-t-secondary">
                <p className="font-semibold text-white mb-1">{t('taskDrawer.linked_inquiry', 'Linked inquiry')}</p>
                <Link to={`/inquiries/${inquiryId}`} className="text-accent hover:underline" onClick={onClose}>
                  {t('taskDrawer.open_inquiry', { id: inquiryId, defaultValue: 'Open inquiry #{{id}} →' })}
                </Link>
              </div>
            ) : (
              <p className="text-[11px] text-t-secondary">{t('taskDrawer.no_inquiry', 'Not linked to an inquiry.')}</p>
            )}
          </Step>

          <Step n={4} title={t('taskDrawer.steps.notes', 'Notes')}>
            <textarea value={form.description} onChange={e => set({ description: e.target.value })} rows={3} maxLength={4000}
              placeholder={t('taskDrawer.placeholders.notes', 'Anything the staff picking this up should know.')} className={`${INPUT} resize-none`} />
            <CustomFieldsForm entity="task" values={customData} onChange={setCustomData} inputClassName={INPUT} layout="stack" />
          </Step>
        </div>

        <div className="border-t border-dark-border px-5 py-4 space-y-3">
          <Summary form={form} lang={i18n.language} />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-t-secondary hover:text-white">
              {t('taskDrawer.actions.cancel', 'Cancel')}
            </button>
            <button onClick={submit} disabled={save.isPending}
              className="bg-accent text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 hover:bg-accent/90">
              {save.isPending ? t('taskDrawer.actions.saving', 'Saving…') : isNew ? t('taskDrawer.actions.create', 'Create') : t('taskDrawer.actions.save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step({ n, title, line, children }: { n: number; title: string; line?: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-dark-border pt-5 first:border-t-0 first:pt-0">
      <header className="flex items-start gap-2.5 mb-1">
        <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">{n}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {line && <p className="text-[11px] text-t-secondary">{line}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function Label({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <span className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mt-3 mb-1.5 flex items-center gap-1.5">{icon}{children}</span>
}

function Summary({ form, lang }: { form: TaskFormState; lang: string }) {
  const { t } = useTranslation()
  const s = summaryOf(form)
  const Icon = TASK_ICONS[s.type]
  const day = s.date ? dayText(s.date, lang) : null
  const when = !day ? t('taskDrawer.summary.no_day', 'No date yet')
    : !s.start ? day
    : s.end ? t('taskDrawer.summary.range', { day, start: s.start, end: s.end.time, defaultValue: '{{day}}, {{start}}–{{end}}' })
    : t('taskDrawer.summary.at', { day, time: s.start, defaultValue: '{{day}}, {{time}}' })
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-t-secondary" aria-live="polite">
      <Icon size={14} style={{ color: TYPE_COLORS[s.type] }} aria-hidden />
      <span className="font-semibold text-white">{typeLabel(t, s.type)}</span>
      <span aria-hidden>·</span><span>{when}</span>
      {s.repeat !== 'none' && <><span aria-hidden>·</span><span>{repeatLabel(t, s.repeat)}</span></>}
      {s.priority !== 'normal' && <><span aria-hidden>·</span><span className={s.priority === 'high' ? 'font-semibold text-red-300' : undefined}>{priorityLabel(t, s.priority)}</span></>}
    </p>
  )
}

/** A day in the person's language ("Thu 5 Nov"), read as a calendar day, never through the device's time zone. */
function dayText(ymd: string, lang: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

/* ─── Words (literal keys, so the locale sweep checks every one) ──────────── */

function typeLabel(t: TFunction, type: string): string {
  switch (type) {
    case 'call': return t('tasks.types.call', 'Call')
    case 'email': return t('tasks.types.email', 'Email')
    case 'whatsapp': return t('tasks.types.whatsapp', 'WhatsApp')
    case 'sms': return t('tasks.types.sms', 'SMS')
    case 'video_call': return t('tasks.types.video_call', 'Video call')
    case 'meeting': return t('tasks.types.meeting', 'Meeting')
    case 'site_visit': return t('tasks.types.site_visit', 'Site visit')
    case 'demo': return t('tasks.types.demo', 'Demo')
    case 'send_proposal': return t('tasks.types.send_proposal', 'Send proposal')
    case 'contract': return t('tasks.types.contract', 'Contract')
    case 'discovery': return t('tasks.types.discovery', 'Discovery')
    case 'follow_up': return t('tasks.types.follow_up', 'Follow-up')
    default: return t('tasks.types.custom', 'Custom')
  }
}

function groupLabel(t: TFunction, group: TypeGroup): string {
  switch (group) {
    case 'talk': return t('taskDrawer.groups.talk', 'Get in touch')
    case 'meet': return t('taskDrawer.groups.meet', 'Meet')
    case 'sell': return t('taskDrawer.groups.sell', 'Close the sale')
    default: return t('taskDrawer.groups.other', 'Other')
  }
}

function priorityLabel(t: TFunction, priority: Priority): string {
  switch (priority) {
    case 'low': return t('taskDrawer.priority.low', 'Low')
    case 'high': return t('taskDrawer.priority.high', 'High')
    default: return t('taskDrawer.priority.normal', 'Normal')
  }
}

function quickDayLabel(t: TFunction, key: QuickDay): string {
  switch (key) {
    case 'today': return t('taskDrawer.date_quick.today', 'Today')
    case 'tomorrow': return t('taskDrawer.date_quick.tomorrow', 'Tomorrow')
    case 'in_2_days': return t('taskDrawer.date_quick.in_2_days', 'In 2 days')
    default: return t('taskDrawer.date_quick.next_monday', 'Next Monday')
  }
}

function partLabel(t: TFunction, part: DayPart): string {
  switch (part) {
    case 'morning': return t('taskDrawer.parts.morning', 'Morning')
    case 'afternoon': return t('taskDrawer.parts.afternoon', 'Afternoon')
    default: return t('taskDrawer.parts.evening', 'Evening')
  }
}

function lengthLabel(t: TFunction, total: number): string {
  const { hours, minutes } = splitMinutes(total)
  if (hours === 0) return t('taskDrawer.length.minutes', { count: minutes, defaultValue: '{{count}} min' })
  if (minutes === 0) return t('taskDrawer.length.hours', { count: hours, defaultValue: '{{count}} h' })
  return t('taskDrawer.length.hours_minutes', { hours, minutes, defaultValue: '{{hours}} h {{minutes}}' })
}

function repeatLabel(t: TFunction, repeat: Repeat): string {
  switch (repeat) {
    case 'daily': return t('taskDrawer.repeat.daily', 'Every day')
    case 'weekly': return t('taskDrawer.repeat.weekly', 'Every week')
    case 'monthly': return t('taskDrawer.repeat.monthly', 'Every month')
    default: return t('taskDrawer.repeat.none', 'Does not repeat')
  }
}

function problemText(t: TFunction, problem: string): string {
  return problem === 'too_long' ? t('taskDrawer.problems.too_long', 'This is too long.') : t('taskDrawer.problems.title_required', 'Give the task a title.')
}
