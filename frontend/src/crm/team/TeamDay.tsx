import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarCheck, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Clock3, ListTodo, Mail, Minus, Plus, Radio, Target, Trophy, UserPlus, Users } from 'lucide-react'
import { Dialog } from '../../workspace/ui/Dialog'
import { addDays, isDay } from '../../time/lib/dates'
import { plannerApi } from '../../time/lib/tasks'
import { useBoot } from '../CrmProvider'
import { count, initials } from '../lib/format'
import { send } from '../lib/api'
import { useRecords } from '../lib/useRecords'
import { useTaskChanged } from '../tasks/taskData'
import { boardDay, PEOPLE_PER_SLIDE, type DayPlan, type PersonPlan, type PlanStatus, type PlanTask, type TeamBoard } from './teamBoard'
import './dayPlan.css'

interface Props {
  plan: DayPlan; board?: TeamBoard; lang: string; tv: boolean; page: number; pages: number
  changePage: (n: number) => void; changeDate: (day: string) => void
}
const statusIcons = { todo: Clock3, in_progress: Radio, blocked: CircleAlert, done: CircleCheck }
const statuses: PlanStatus[] = ['todo', 'in_progress', 'blocked', 'done']
const workKey = (task: PlanTask) => task.source + task.id

function Metric({ label, value, icon, children, lang }: { label: string; value?: number; icon: ReactNode; children: ReactNode; lang: string }) {
  return <div className="crm-day-metric"><span>{icon}{label}</span><strong>{value === undefined ? '—' : count(value, lang)}</strong><small>{children}</small></div>
}

function Change({ diff, label, lang }: { diff: number; label: string; lang: string }) {
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus
  return <><b data-change={Math.sign(diff)}><Icon size={14} aria-hidden/>{new Intl.NumberFormat(lang, { signDisplay: 'exceptZero' }).format(diff)}</b> {label}</>
}

function PersonSummary({ person, expand }: { person: PersonPlan; expand: boolean }) {
  const { t } = useTranslation()
  const focus = person.tasks[0]
  const name = person.name || (person.key === 'unassigned' ? t('crm.dayplan.unassigned') : t('crm.dayplan.member'))
  const Icon = focus ? statusIcons[focus.status] : Minus
  return <div className="crm-day-person" data-status={focus?.status ?? 'empty'}>
    <span className="crm-day-avatar" aria-hidden>{person.key === 'unassigned' ? <Users size={18}/> : initials(name)}</span>
    <div className="crm-day-person-content"><div className="crm-day-nameline"><strong title={name}>{name}</strong>
      {focus && <span className="crm-day-state"><Icon size={13} aria-hidden/>{t(`crm.dayplan.status_${focus.status}`)}</span>}</div>
      <div className="crm-day-focus">{focus?.time && <time>{focus.time}</time>}<span title={focus?.title}>{focus?.title || t('crm.dayplan.nothing')}</span></div></div>
    {person.tasks.length > 0 && <div className="crm-day-person-count" title={t('crm.dayplan.progress', { done: person.done, total: person.tasks.length })}>
      <span>{person.done} / {person.tasks.length}</span><progress value={person.done} max={person.tasks.length} aria-label={t('crm.dayplan.progress', { done: person.done, total: person.tasks.length })}/></div>}
    {expand && <ChevronDown size={16} className="crm-day-disclose" aria-hidden/>}
  </div>
}

function StatusControl({ task }: { task: PlanTask }) {
  const { t } = useTranslation()
  const changed = useTaskChanged()
  const update = useMutation({ mutationFn: (status: PlanStatus) => task.source === 'planner'
    ? plannerApi.status(task.id, status) : send('post', `tasks/${task.id}/${status === 'done' ? 'complete' : 'reopen'}`),
    onSuccess: changed })
  const options = task.source === 'planner' ? statuses : (['todo', 'done'] as const)
  return <div>{task.editable ? <select aria-label={t('crm.dayplan.status_for', { title: task.title })} value={task.status} disabled={update.isPending}
    onChange={e => update.mutate(e.target.value as PlanStatus)}>{options.map(s => <option key={s} value={s}>{t(`crm.dayplan.status_${s}`)}</option>)}</select> : <span>{t(`crm.dayplan.status_${task.status}`)}</span>}
    {update.isError && <p role="alert">{t('crm.dayplan.save_error')}</p>}</div>
}

function AddAssignment({ plan, close }: { plan: DayPlan; close: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const choices = plan.people.filter(p => p.assignable && p.key !== 'unassigned')
  const [owner, setOwner] = useState(choices.find(p => p.user_id === boot.staff?.id)?.key ?? '')
  const [title, setTitle] = useState('')
  const [clock, setClock] = useState('')
  const [priority, setPriority] = useState('normal')
  const save = useMutation({ mutationFn: () => {
    const person = choices.find(p => p.key === owner)
    return plannerApi.create({ title: title.trim(), task_date: plan.date, start_time: clock || null, priority,
      assigned_to_user_id: person?.user_id ?? null, employee_name: person?.name ?? null })
  }, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['crm', 'team-day-plan'] }); close() } })
  const submit = (e: FormEvent) => { e.preventDefault(); if (title.trim() && !save.isPending) save.mutate() }
  return <Dialog title={t('crm.dayplan.add')} onClose={close} busy={save.isPending}><form className="crm-day-form" onSubmit={submit}>
    <label>{t('crm.tasks.field_title')}<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)}/></label>
    <label>{t('crm.tasks.field_assignee')}<select value={owner} onChange={e => setOwner(e.target.value)}><option value="">{t('crm.dayplan.unassigned')}</option>
      {choices.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
    <div><label>{t('crm.tasks.field_start')}<input type="time" value={clock} onChange={e => setClock(e.target.value)}/></label>
      <label>{t('crm.tasks.field_priority')}<select value={priority} onChange={e => setPriority(e.target.value)}>{['low','normal','high'].map(p => <option key={p} value={p}>{t(`crm.tasks.priority_${p}`)}</option>)}</select></label></div>
    {save.isError && <p role="alert">{t('crm.dayplan.save_error')}</p>}
    <footer><span><CalendarDays size={16} aria-hidden/>{boardDay(plan.date, i18n.language)}</span><button type="submit" className="crm-day-add" disabled={!title.trim() || save.isPending}>{t('crm.common.save')}</button></footer>
  </form></Dialog>
}

export function TeamDay({ plan, board, lang, tv, page, pages, changePage, changeDate }: Props) {
  const { t } = useTranslation()
  const records = useRecords()
  const [adding, setAdding] = useState(false)
  const people = tv ? plan.people.slice((page - 1) * PEOPLE_PER_SLIDE, page * PEOPLE_PER_SLIDE) : plan.people
  const progress = t('crm.dayplan.progress', { done: plan.done, total: plan.total })
  const dateLabel = new Intl.DateTimeFormat(lang, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(plan.date + 'T12:00:00Z'))
  const arrivals = board?.arrivals
  return <div className="crm-day">
    <section className="crm-day-metrics" aria-label={t('crm.team.performance')}>
      <Metric label={t('crm.dayplan.leads_today')} value={arrivals?.today} icon={<UserPlus size={16}/>} lang={lang}>{arrivals && <Change diff={arrivals.day_change} label={t('crm.dayplan.vs_day')} lang={lang}/>}</Metric>
      <Metric label={t('crm.dayplan.leads_week')} value={arrivals?.week} icon={<CalendarDays size={16}/>} lang={lang}>{arrivals && <Change diff={arrivals.week_change} label={t('crm.dayplan.vs_week')} lang={lang}/>}</Metric>
      <Metric label={t('crm.team.wins')} value={board?.wins} icon={<Trophy size={16}/>} lang={lang}>{board && t(`crm.team.${board.period}`)}</Metric>
      <Metric label={t('crm.team.unanswered')} value={board?.emails} icon={<Mail size={16}/>} lang={lang}>{t('crm.dayplan.waiting')}</Metric>
    </section>
    <div className="crm-day-columns">
      <section className="crm-day-roster">
        <header><div className="crm-day-sectionname"><CalendarCheck aria-hidden size={20}/><h2>{t('crm.dayplan.team_plan')}</h2></div>
          {tv ? <strong className="crm-day-date">{dateLabel}</strong> : <div className="crm-day-datebar">
            <button type="button" aria-label={t('crm.team.previous_day')} onClick={() => changeDate(addDays(plan.date, -1))}><ChevronLeft size={17}/></button>
            <input type="date" aria-label={t('crm.team.date')} value={plan.date} onChange={e => { if (isDay(e.target.value)) changeDate(e.target.value) }}/>
            <button type="button" aria-label={t('crm.team.next_day')} onClick={() => changeDate(addDays(plan.date, 1))}><ChevronRight size={17}/></button>
            {plan.date !== plan.today && <button type="button" onClick={() => changeDate(plan.today)}>{t('crm.tasks.quick_today')}</button>}</div>}</header>
        <div className="crm-day-progress"><div><span>{t('crm.dayplan.team_progress')}</span><strong>{progress}</strong></div>
          <progress value={plan.done} max={Math.max(plan.total, 1)} aria-label={progress}/></div>
        <ul className="crm-day-people">{people.map(p => <li key={p.key}>{tv || !p.tasks.length ? <PersonSummary person={p} expand={false}/> :
          <details><summary><PersonSummary person={p} expand/></summary><ul className="crm-day-assignments">{p.tasks.map(task => <li key={workKey(task)}>
            <div><strong>{task.title}</strong><small>{[task.time, t(`crm.dayplan.source_${task.source}`)].filter(Boolean).join(' · ')}</small></div>
            <StatusControl task={task}/></li>)}</ul></details>}</li>)}</ul>
        {!people.length && <p className="crm-day-empty">{t('crm.dayplan.empty_roster')}</p>}
        {tv && pages > 1 && <nav className="crm-day-pager" aria-label={t('crm.dayplan.people_pages')}><button type="button" disabled={page <= 1} aria-label={t('crm.common.previous')} onClick={() => changePage(page - 1)}><ChevronLeft size={16}/></button>
          <span>{page} / {pages}</span><button type="button" disabled={page >= pages} aria-label={t('crm.common.next')} onClick={() => changePage(page + 1)}><ChevronRight size={16}/></button></nav>}
        {!tv && <footer className="crm-day-roster-tools"><button className="crm-day-add" type="button" onClick={() => plan.planner ? setAdding(true) : records.create('task', { taskDate: plan.date })}><Plus size={16}/>{t('crm.dayplan.add')}</button>
          {plan.planner && <a href={`/time/plan?date=${plan.date}&all=1`}>{t('crm.dayplan.open_planner')}<ArrowUpRight size={15}/></a>}</footer>}
      </section>
      <aside className="crm-day-priorities"><section><header className="crm-day-sectionname"><ListTodo size={19}/><h2>{t('crm.dayplan.priority_tasks')}</h2></header>
        <ul>{plan.top_tasks.map(task => { const Icon = statusIcons[task.status]; return <li key={workKey(task)}><Icon aria-hidden size={17} className="crm-day-rank-icon" data-status={task.status}/>
          <div><strong title={task.title}>{task.title}</strong><small>{[task.owner || (task.owner_key === 'unassigned' ? t('crm.dayplan.unassigned') : t('crm.dayplan.member')), task.time, task.status === 'blocked' ? t('crm.dayplan.status_blocked') : null, task.priority === 0 ? t('crm.team.signal_high_priority') : null].filter(Boolean).join(' · ')}</small></div></li> })}</ul>
        {!plan.top_tasks.length && <p className="crm-day-empty"><Check size={17}/>{t(plan.total ? 'crm.dayplan.all_done' : 'crm.dayplan.no_tasks')}</p>}</section>
        <section><header className="crm-day-sectionname"><Target size={19}/><h2>{t('crm.dayplan.priority_leads')}</h2></header>
          <ul>{board?.top_leads?.map(l => <li key={l.lead_id}><Link to={'/crm/leads?lead=' + l.lead_id}><span className="crm-day-lead-dot" data-level={l.priority} aria-hidden/>
            <div><strong>{l.company || l.name || t('crm.team.unnamed', { id: l.lead_id })}</strong><small>{t(`crm.team.level_${l.priority}`)} · {l.deadline && l.signals.includes('delivery_due') ? t('crm.team.delivery_date', { date: boardDay(l.deadline, lang) }) : l.ai_reason && l.ai_reason !== 'routine' ? t(`crm.team.ai_${l.ai_reason}`) : t(`crm.team.kind_${l.kind}`)}</small></div><ArrowRight size={15}/></Link></li>)}</ul>
          {board && !board.top_leads?.length && <p className="crm-day-empty">{t('crm.dayplan.no_leads')}</p>}</section></aside>
    </div>
    {!tv && adding && <AddAssignment plan={plan} close={() => setAdding(false)}/>}
  </div>
}
