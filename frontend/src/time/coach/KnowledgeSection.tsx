import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Building2, CheckCircle2, Layers, ListChecks, Save, Sparkles, Users } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { useRefresh } from '../lib/queries'
import { plannerApi } from '../lib/tasks'
import type { AiContext, CoachOverview, Drafts, TaskNote, TypeNote } from '../lib/types'
import { Card } from '../ui/Card'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import {
  GOALS_MAX, MINUTES_MAX, MINUTES_MIN, NOTE_MAX, TEXT_MAX, knowledgeProblem, mergeNotes, personDraftBody, taskEntry, taskRows, typeEntry, typeRows,
  withTaskDraft, withTypeDraft, type KnowledgeProblem, type TaskRow, type TypeRow,
} from './coachLogic'

const BEST_DEFAULTS: Record<string, string> = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time' }

function problemText(t: TFunction, problem: KnowledgeProblem): string {
  if (problem === 'text') return t('time.coach.problem_text', 'Keep the business and the rules to {{max}} characters each.', { max: TEXT_MAX })
  if (problem === 'goals') return t('time.coach.problem_goals', 'Keep the goals to {{max}} characters.', { max: GOALS_MAX })
  if (problem === 'note') return t('time.coach.problem_note', 'Keep each note to {{max}} characters.', { max: NOTE_MAX })
  return t('time.coach.problem_minutes', 'A length is whole minutes from {{min}} to {{max}}, or empty.', { min: MINUTES_MIN, max: MINUTES_MAX })
}

type PeopleDraft = Extract<Drafts, { kind: 'people' }>['people'][number]

/**
 * Teach the AI (a manager's): the business, its house rules and goals; per task type a note, a typical length and the
 * best time of day; per task a note and a typical length. The AI drafts what is missing from the settings and the
 * history; a draft only fills the form, and nothing is saved until the manager saves. Saving reads the notes as they are
 * now and changes only the rows touched here. People's drafts are saved person by person through their profile's writer.
 */
export function KnowledgeSection({ data }: { data: CoachOverview }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const lang = (i18n.language || 'en').slice(0, 2)
  const [context, setContext] = useState<AiContext>(data.knowledge.context)
  const [types, setTypes] = useState<TypeRow[]>(() => typeRows(boot.settings.groups, data.knowledge.types))
  const [tasks, setTasks] = useState<TaskRow[]>(() => taskRows(boot.settings.channels, data.knowledge.tasks))
  const [touched, setTouched] = useState({ context: false, types: new Set<string>(), tasks: new Set<string>() })
  const [checked, setChecked] = useState(false)
  const [drafted, setDrafted] = useState<string | null>(null)
  const [people, setPeople] = useState<PeopleDraft[] | null>(null)
  const [savedPeople, setSavedPeople] = useState<Set<string>>(new Set())
  const dirty = touched.context || touched.types.size > 0 || touched.tasks.size > 0
  const problem = checked ? knowledgeProblem(context, types, tasks) : null

  const editContext = (key: keyof AiContext, value: string) => { setContext(c => ({ ...c, [key]: value })); setTouched(x => ({ ...x, context: true })) }
  const editType = (name: string, patch: Partial<TypeRow>) => {
    setTypes(rows => rows.map(r => (r.type === name ? { ...r, ...patch } : r)))
    setTouched(x => ({ ...x, types: new Set(x.types).add(name) }))
  }
  const editTask = (key: string, patch: Partial<TaskRow>) => {
    setTasks(rows => rows.map(r => (r.key === key ? { ...r, ...patch } : r)))
    setTouched(x => ({ ...x, tasks: new Set(x.tasks).add(key) }))
  }

  const save = useMutation({
    mutationFn: async () => {
      if (touched.context) await plannerApi.saveSetting('planner_ai_context', { about: context.about.trim(), rules: context.rules.trim(), goals: context.goals.trim() })
      if (touched.types.size === 0 && touched.tasks.size === 0) return
      // The notes as they are now: another manager's rows stay as they are.
      const fresh = await plannerApi.settings()
      if (touched.types.size > 0) {
        const edited = Object.fromEntries(types.filter(r => touched.types.has(r.type)).map(r => [r.type, typeEntry(r)]))
        await plannerApi.saveSetting('planner_type_notes', mergeNotes((fresh.planner_type_notes ?? {}) as Record<string, TypeNote>, edited))
      }
      if (touched.tasks.size > 0) {
        const edited = Object.fromEntries(tasks.filter(r => touched.tasks.has(r.key)).map(r => [r.key, taskEntry(r)]))
        await plannerApi.saveSetting('planner_task_notes', mergeNotes((fresh.planner_task_notes ?? {}) as Record<string, TaskNote>, edited))
      }
    },
    onSuccess: () => {
      setTouched({ context: false, types: new Set(), tasks: new Set() })
      setChecked(false)
      setDrafted(null)
      refresh()
      toast(t('time.coach.saved', 'Saved. The AI plans with it from now on.'))
    },
    onError: error => { refresh(); toast(errorText(t, error), 'danger') },
  })
  const submit = () => {
    setChecked(true)
    if (knowledgeProblem(context, types, tasks)) return
    save.mutate()
  }

  const draft = useMutation({
    mutationFn: (kind: 'people' | 'types' | 'business') => timeApi.draft(kind, lang),
    onSuccess: answer => {
      if (answer.kind === 'business') {
        const next = answer.context
        setContext(c => ({ about: next.about || c.about, rules: next.rules || c.rules, goals: next.goals || c.goals }))
        setTouched(x => ({ ...x, context: true }))
        setDrafted('business')
      } else if (answer.kind === 'types') {
        const byType = new Map(answer.types.map(d => [d.type, d]))
        const byTask = new Map(answer.tasks.map(d => [d.task_key, d]))
        setTypes(rows => rows.map(r => (byType.has(r.type) ? withTypeDraft(r, byType.get(r.type)!) : r)))
        setTasks(rows => rows.map(r => (byTask.has(r.key) ? withTaskDraft(r, byTask.get(r.key)!) : r)))
        setTouched(x => ({ ...x, types: new Set([...x.types, ...byType.keys()]), tasks: new Set([...x.tasks, ...byTask.keys()]) }))
        setDrafted('types')
      } else {
        setPeople(answer.people)
        setSavedPeople(new Set())
      }
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const savePerson = useMutation({
    mutationFn: (d: PeopleDraft) => timeApi.updatePerson(d.user_id, personDraftBody(d)),
    onSuccess: (_, d) => { setSavedPeople(s => new Set(s).add(d.person)); refresh(); toast(t('time.coach.person_saved', '{{name}}’s profile saved', { name: d.name })) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const editPerson = (key: string, patch: Partial<PeopleDraft>) => setPeople(list => (list ?? []).map(d => (d.person === key ? { ...d, ...patch } : d)))

  const tasksByType = useMemo(() => {
    const out = new Map<string, TaskRow[]>()
    for (const row of tasks) {
      const group = row.groups[0] ?? ''
      out.set(group, [...(out.get(group) ?? []), row])
    }
    return out
  }, [tasks])

  const draftButton = (kind: 'people' | 'types' | 'business') => (
    <Button size="sm" variant="secondary" onClick={() => draft.mutate(kind)} loading={draft.isPending && draft.variables === kind} disabled={!boot.ai.ready || draft.isPending}>
      <Sparkles size={14} aria-hidden />{t('time.coach.draft', 'Draft with AI')}
    </Button>
  )

  return (
    <div className="space-y-5 pb-20">
      {!boot.ai.ready && <Notice tone="info">{t(`time.ai_state.${boot.ai.state}`, t('time.ai_state.unknown', 'The AI cannot be asked just now.'))}</Notice>}
      {drafted && <Notice tone="info">{t('time.coach.drafted', 'The AI filled in what it could. Read it through, change what is wrong, then save.')}</Notice>}

      <Card title={t('time.coach.business', 'The business')} icon={Building2} tone="accent"
        description={t('time.coach.business_line', 'What the AI should know before it plans anyone’s day.')} action={draftButton('business')}>
        <div className="space-y-4">
          <Field label={t('time.coach.about', 'About the business')} hint={t('time.coach.about_hint', 'What the venue does, its size, its busy days and hours, what guests expect.')}>
            <TextArea rows={4} value={context.about} maxLength={TEXT_MAX} onChange={e => editContext('about', e.target.value)}
              placeholder={t('time.coach.about_placeholder', 'A 40-room boutique hotel by the sea; check-out by 11, check-in from 15; weekends are full…')} />
          </Field>
          <Field label={t('time.coach.rules', 'House rules')} hint={t('time.coach.rules_hint', 'What must always happen, in what order, and what nobody may do alone.')}>
            <TextArea rows={4} value={context.rules} maxLength={TEXT_MAX} onChange={e => editContext('rules', e.target.value)}
              placeholder={t('time.coach.rules_placeholder', 'Rooms are cleaned before 14:00; trainees never close the till alone; the spa opens at 9…')} />
          </Field>
          <Field label={t('time.coach.goals', 'Goals')} hint={t('time.coach.goals_hint', 'What the plans should aim for this season.')}>
            <TextArea rows={2} value={context.goals} maxLength={GOALS_MAX} onChange={e => editContext('goals', e.target.value)}
              placeholder={t('time.coach.goals_placeholder', 'Fewer late check-ins; train two more people on the front desk…')} />
          </Field>
        </div>
      </Card>

      <Card title={t('time.coach.types', 'Task types and tasks')} icon={Layers} tone="progress"
        description={t('time.coach.types_line', 'How long the work takes and when it is best done. A typical length is what the planner plans with.')} action={draftButton('types')}>
        {types.length === 0 && tasks.length === 0 ? (
          <p className="text-sm text-a-text-2">{t('time.coach.no_types', 'No task types are set up yet.')} <Link to="/time/settings?tab=types" className="font-semibold text-a-accent-text hover:underline">{t('time.coach.open_settings', 'Set them up')}</Link></p>
        ) : (
          <div className="space-y-4">
            {types.map(row => (
              <div key={row.type} className="rounded-2xl border border-a-border">
                <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem]">
                  <Field label={row.type}>
                    <TextArea rows={2} value={row.notes} maxLength={NOTE_MAX} onChange={e => editType(row.type, { notes: e.target.value })}
                      placeholder={t('time.coach.type_placeholder', 'What this work involves, who does it best, what to watch…')} />
                  </Field>
                  <Field label={t('time.coach.typical', 'Typical, min')}>
                    <TextInput type="number" inputMode="numeric" min={MINUTES_MIN} max={MINUTES_MAX} step={5} value={row.minutes} onChange={e => editType(row.type, { minutes: e.target.value })} />
                  </Field>
                  <Field label={t('time.coach.best_time', 'Best done')}>
                    <Select value={row.best_time} onChange={e => editType(row.type, { best_time: e.target.value })}>
                      <option value="">{t('time.coach.best_none', 'Not set')}</option>
                      {data.best_times.map(b => <option key={b} value={b}>{t(`time.coach.best.${b}`, BEST_DEFAULTS[b] ?? b)}</option>)}
                    </Select>
                  </Field>
                </div>
                {(tasksByType.get(row.type) ?? []).length > 0 && (
                  <ul className="divide-y divide-a-border border-t border-a-border bg-a-surface-2/50">
                    {(tasksByType.get(row.type) ?? []).map(task => <TaskLine key={task.key} row={task} onChange={patch => editTask(task.key, patch)} />)}
                  </ul>
                )}
              </div>
            ))}
            {(tasksByType.get('') ?? []).length > 0 && (
              <div className="rounded-2xl border border-a-border">
                <p className="flex items-center gap-2 px-3 pt-3 text-sm font-semibold text-a-text"><ListChecks size={15} aria-hidden />{t('time.coach.other_tasks', 'Tasks of no type')}</p>
                <ul className="divide-y divide-a-border">{(tasksByType.get('') ?? []).map(task => <TaskLine key={task.key} row={task} onChange={patch => editTask(task.key, patch)} />)}</ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title={t('time.coach.people', 'People')} icon={Users} tone="ai"
        description={t('time.coach.people_line', 'Job titles, knowledge, strengths and what each person is learning. Drafted from the team and the history; saved person by person.')}
        action={draftButton('people')}>
        {people === null ? (
          <p className="text-sm text-a-text-2">
            {t('time.coach.people_intro', 'Each person’s profile is on the team page; the AI can draft what is missing for everyone at once.')}{' '}
            <Link to="/time/team" className="font-semibold text-a-accent-text hover:underline">{t('time.coach.open_team', 'Open the team')}</Link>
          </p>
        ) : people.length === 0 ? (
          <p className="text-sm text-a-text-2">{t('time.coach.people_none', 'The AI had nothing to add for anyone.')}</p>
        ) : (
          <ul className="space-y-4">
            {people.map(d => (
              <li key={d.person} className="rounded-2xl border border-a-border p-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold text-a-text">{d.name}</p>
                  {savedPeople.has(d.person)
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-a-st-confirmed"><CheckCircle2 size={14} aria-hidden />{t('time.coach.saved_short', 'Saved')}</span>
                    : <Button size="sm" onClick={() => savePerson.mutate(d)} loading={savePerson.isPending && savePerson.variables?.person === d.person} disabled={savePerson.isPending}>{t('time.common.save', 'Save')}</Button>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('time.team.job_title', 'Job title')} hint={d.now.job_title ? t('time.coach.now', 'Now: {{text}}', { text: d.now.job_title }) : undefined}>
                    <TextInput value={d.job_title} maxLength={80} onChange={e => editPerson(d.person, { job_title: e.target.value })} />
                  </Field>
                  <Field label={t('time.team.knowledge', 'What they know')}>
                    <TextArea rows={2} value={d.knowledge} maxLength={1000} onChange={e => editPerson(d.person, { knowledge: e.target.value })} />
                  </Field>
                  <Field label={t('time.team.strengths', 'What they do best')}>
                    <TextArea rows={2} value={d.strengths} maxLength={NOTE_MAX} onChange={e => editPerson(d.person, { strengths: e.target.value })} />
                  </Field>
                  <Field label={t('time.team.develop', 'What they are learning')}>
                    <TextArea rows={2} value={d.develop} maxLength={NOTE_MAX} onChange={e => editPerson(d.person, { develop: e.target.value })} />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(dirty || problem) && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-a-border bg-a-surface p-3 shadow-a-lg">
          {problem
            ? <p className="min-w-0 flex-1 text-sm text-a-danger">{problemText(t, problem)}</p>
            : <p className="min-w-0 flex-1 text-sm text-a-text-2">{t('time.coach.unsaved', 'Changes not saved yet.')}</p>}
          <Button onClick={submit} loading={save.isPending}><Save size={15} aria-hidden />{t('time.coach.save', 'Save what the AI knows')}</Button>
        </div>
      )}
    </div>
  )
}

function TaskLine({ row, onChange }: { row: TaskRow; onChange: (patch: Partial<TaskRow>) => void }) {
  const { t } = useTranslation()
  return (
    <li className="grid gap-2 px-3 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)_7rem] sm:items-center">
      <p className="flex min-w-0 items-center gap-2 text-sm text-a-text">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
        <span className="min-w-0 truncate">{row.label}</span>
      </p>
      <TextInput value={row.notes} maxLength={NOTE_MAX} onChange={e => onChange({ notes: e.target.value })} aria-label={t('time.coach.task_note', 'Note on {{name}}', { name: row.label })}
        placeholder={t('time.coach.task_placeholder', 'A note for the AI (optional)')} />
      <TextInput type="number" inputMode="numeric" min={MINUTES_MIN} max={MINUTES_MAX} step={5} value={row.minutes} onChange={e => onChange({ minutes: e.target.value })}
        aria-label={t('time.coach.task_minutes', 'Typical minutes for {{name}}', { name: row.label })} placeholder={t('time.common.min', 'min')} />
    </li>
  )
}
