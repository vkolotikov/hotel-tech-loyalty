import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen, CalendarCheck, CalendarDays, Clock, Flame, Gauge, GraduationCap, Pencil, SearchX, ShieldCheck, Star, Tag, Tags,
  Users, Wand2,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { duration, percent, weekdayName } from '../lib/format'
import { usePeople } from '../lib/queries'
import type { Person } from '../lib/types'
import { PlanDialog } from '../plan/PlanDialog'
import { loadState } from '../plan/timeline'
import { AiButton } from '../ui/AiButton'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput } from '../ui/inputs'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SectionNav, type Section } from '../ui/SectionNav'
import { StatTile } from '../ui/StatTile'
import { Toolbar } from '../ui/Toolbar'
import { ProfilePanel } from './ProfilePanel'
import {
  WEEKDAYS, experienceRows, filterPeople, hoursOf, loadBar, roleKind, skillsKind, teamFigures, teamTab, typeRoster, workDays,
  type TeamTab, type TypeRoster,
} from './teamLogic'

const PREFIX = 'time-team'
const PANEL = 'time-team-panel'

const FILL = { none: 'time-load-ok', ok: 'time-load-ok', high: 'time-load-high', over: 'time-load-over' } as const

function roleText(t: TFunction, person: Person): string {
  switch (roleKind(person)) {
    case 'admin': return t('time.team.role_admin', 'Administrator')
    case 'manager': return t('time.team.role_manager', 'Manager')
    case 'staff': return t('time.team.role_staff', 'Staff')
    case 'none': return t('time.team.role_none', 'No account')
    default: return person.role ?? ''
  }
}

/**
 * Team & skills (2026-11-09): the team as the planner knows them, which is what its AI plans their days from — each
 * person's hours, days and break, the types they may take from the open pool (a rule), the work that fits them (a hint),
 * what they know in their manager's words, and what they have shown in the last 90 days of finished work; by type, who
 * may take, prefers and has done each kind of work. A manager edits a person's planner profile here.
 */
export function TeamPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const people = usePeople()
  const [params, setParams] = useSearchParams()
  const tab = teamTab(params.get('tab'))
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [planning, setPlanning] = useState<null | { scope: 'me' | 'person' | 'team'; person?: string }>(null)
  const list = people.data?.people ?? []
  const knowledgeMax = people.data?.knowledge_max ?? 1000
  const canEdit = boot.staff.can.edit_people
  const canPlan = boot.staff.can.plan_team
  const taskLabels = Object.fromEntries(boot.settings.channels.map(c => [c.key, c.label]))
  const figures = teamFigures(list)
  const shown = filterPeople(list, q, taskLabels)
  const editPerson = editing ? list.find(p => p.key === editing) ?? null : null
  const loaded = Boolean(people.data)
  const load = loadState(figures.load)

  const choose = (next: TeamTab) => setParams(prev => {
    const out = new URLSearchParams(prev)
    if (next === 'people') out.delete('tab')
    else out.set('tab', next)
    return out
  }, { replace: true })

  const sections: Section<TeamTab>[] = [
    { key: 'people', icon: Users, tone: 'accent', title: t('time.team.people', 'People'), caption: t('time.team.people_caption', 'Hours, skills and knowledge, person by person') },
    { key: 'types', icon: Tags, tone: 'progress', title: t('time.team.by_type', 'By type of work'), caption: t('time.team.by_type_caption', 'Who may take, prefers and has done each type') },
  ]

  return (
    <Page title={t('time.nav.team', 'Team & skills')} line={t('time.team.line', 'What the planner knows about each person. Its AI plans their days from this.')}
      actions={(
        <AiButton onClick={() => setPlanning(canPlan ? { scope: 'team' } : { scope: 'me' })}>
          <Wand2 size={15} aria-hidden />{canPlan ? t('time.team.plan_team', 'Plan the team’s day with AI') : t('time.team.plan_me', 'Plan my day with AI')}
        </AiButton>
      )}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} tone="accent" label={t('time.team.fig_people', 'People')} value={loaded ? figures.people : '—'}
          hint={t('time.team.fig_people_hint', 'With an account: {{count}}', { count: figures.accounts })} />
        <StatTile icon={CalendarCheck} tone="success" label={t('time.team.fig_working', 'Working today')} value={loaded ? figures.working : '—'}
          hint={t('time.team.fig_working_hint', 'of {{total}} on the team', { total: figures.people })} />
        <StatTile icon={Gauge} tone={load === 'over' ? 'danger' : load === 'high' ? 'pending' : 'progress'} label={t('time.team.fig_load', 'Team load today')}
          value={figures.load !== null ? `${figures.load} %` : '—'} hint={t('time.team.fig_load_hint', 'Planned of everyone’s hours')} />
        <StatTile icon={Flame} tone={figures.over > 0 ? 'danger' : 'neutral'} label={t('time.team.fig_over', 'Over their hours today')} value={loaded ? figures.over : '—'}
          hint={t('time.team.fig_over_hint', 'More planned than their day holds')} />
      </div>

      {!canEdit && <Notice>{t('time.team.read_only', 'A manager edits planner profiles. This is what the planner knows about each person.')}</Notice>}

      <SectionNav label={t('time.team.sections', 'Team sections')} idPrefix={PREFIX} panelId={PANEL} sections={sections} value={tab} onChange={choose} />

      <div id={PANEL} role="tabpanel" aria-labelledby={`${PREFIX}-${tab}`} className="space-y-4 animate-a-fade" key={tab}>
        {tab === 'people' && (
          <>
            <Toolbar>
              <SearchInput label={t('time.team.search', 'Search people, skills or knowledge')} value={q} onChange={setQ} className="sm:w-80" />
            </Toolbar>
            <QueryState loading={people.isLoading} error={people.error} onRetry={() => void people.refetch()}>
              {list.length === 0 ? (
                <Card><EmptyTeam canAdd={canEdit} /></Card>
              ) : shown.length === 0 ? (
                <Card>
                  <EmptyState icon={SearchX} title={t('time.team.no_match', 'Nobody matches')} line={t('time.team.no_match_line', 'Try a name, a type of work or a word from what they know.')}
                    action={<Button variant="secondary" onClick={() => setQ('')}>{t('time.team.clear', 'Clear the search')}</Button>} />
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {shown.map(person => (
                    <PersonCard key={person.key} person={person} canEdit={canEdit} canPlan={canPlan}
                      onEdit={() => setEditing(person.key)} onPlan={() => setPlanning({ scope: 'person', person: person.key })} />
                  ))}
                </div>
              )}
            </QueryState>
          </>
        )}
        {tab === 'types' && (
          <QueryState loading={people.isLoading} error={people.error} onRetry={() => void people.refetch()}>
            <TypesSection people={list} />
          </QueryState>
        )}
      </div>

      {editPerson && <ProfilePanel key={editPerson.key} person={editPerson} knowledgeMax={knowledgeMax} onClose={() => setEditing(null)} />}
      {planning && <PlanDialog date={boot.venue.today} scope={planning.scope} person={planning.person} onClose={() => setPlanning(null)} />}
    </Page>
  )
}

function EmptyTeam({ canAdd }: { canAdd: boolean }) {
  const { t } = useTranslation()
  return (
    <EmptyState icon={Users} title={t('time.team.empty', 'Nobody on the team yet')}
      line={t('time.team.empty_line', 'Staff with an account show here, with the extra names the planner’s settings list.')}
      action={canAdd ? (
        <Link to="/settings?tab=team" className="inline-flex items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm">
          <Users size={15} aria-hidden />{t('time.team.add_people', 'Add people to the team')}
        </Link>
      ) : undefined} />
  )
}

/* ─── A person ─────────────────────────────────────────────────────── */

function Fact({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-a-text-2"><Icon size={13} aria-hidden />{title}</p>
      {hint && <p className="text-xs text-a-text-2">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function TypeChip({ name, color }: { name: string; color: string | null | undefined }) {
  return (
    <li className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-a-border bg-a-surface px-2.5 py-0.5 text-xs text-a-text">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color ?? '#94a3b8' }} />
      <span className="truncate">{name}</span>
    </li>
  )
}

function TodayLoad({ person, canPlan, onPlan }: { person: Person; canPlan: boolean; onPlan: () => void }) {
  const { t } = useTranslation()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const box = 'rounded-xl bg-a-surface-2 px-3 py-2.5'
  if (!person.today) return <p className={`${box} text-sm text-a-text-2`}>{t('time.team.not_on_board', 'Not on today’s board.')}</p>
  if (!person.today.works) return <p className={`${box} text-sm text-a-text-2`}>{t('time.team.off_today', 'Not working today.')}</p>
  const bar = loadBar(person.today)
  const planned = duration(person.today.planned_minutes, units)
  return (
    <div className={box}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-a-text">
          {t('time.common.today', 'Today')} <span className="font-a-mono font-normal text-a-text-2">{person.today.window.start}–{person.today.window.end}</span>
        </p>
        <p className={`text-xs ${bar.state === 'over' ? 'font-semibold text-a-danger' : 'text-a-text-2'}`}>
          {bar.pct !== null
            ? t('time.team.load_line', '{{planned}} of {{capacity}} · {{pct}} %', { planned, capacity: duration(person.today.capacity_minutes, units), pct: bar.pct })
            : t('time.team.load_planned', '{{planned}} planned', { planned })}
        </p>
      </div>
      <div aria-hidden className="mt-2 h-2 overflow-hidden rounded-full bg-a-surface">
        <div className={`h-full rounded-full ${FILL[bar.state]}`} style={{ width: `${bar.width}%` }} />
      </div>
      {canPlan && person.has_account && (
        <button type="button" onClick={onPlan} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold time-ai-text"
          aria-label={t('time.team.plan_person_for', 'Plan {{name}}’s day with AI', { name: person.name })}>
          <Wand2 size={13} aria-hidden />{t('time.team.plan_person', 'Plan their day with AI')}
        </button>
      )}
    </div>
  )
}

function PersonCard({ person, canEdit, canPlan, onEdit, onPlan }: { person: Person; canEdit: boolean; canPlan: boolean; onEdit: () => void; onPlan: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const groups = boot.settings.groups
  const colorOf = (name: string) => groups.find(g => g.name === name)?.color ?? null
  const channelOf = (key: string) => boot.settings.channels.find(c => c.key === key)
  const hours = hoursOf(person.profile, boot.settings.window)
  const days = workDays(person.profile)
  const skills = skillsKind(person)
  const experience = experienceRows(person.experience)
  const titleId = `time-person-${person.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const line = [roleText(t, person), person.department].filter(Boolean).join(' · ')
  const prefers = person.prefers.groups.length + person.prefers.tasks.length > 0

  return (
    <article aria-labelledby={titleId} className="min-w-0 space-y-4 rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm">
      <header className="flex items-start gap-3">
        <Avatar name={person.name} size="lg" tone={person.manager ? 'accent' : 'neutral'} />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate font-a-display text-xl text-a-text">{person.name}</h2>
          {line && <p className="truncate text-sm text-a-text-2">{line}</p>}
        </div>
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={onEdit} aria-label={t('time.team.edit_person', 'Edit {{name}}’s planner profile', { name: person.name })}>
            <Pencil size={14} aria-hidden />{t('time.team.edit', 'Edit')}
          </Button>
        )}
      </header>

      {!person.has_account && <p className="text-xs text-a-text-2">{t('time.team.no_account_line', 'Without an account the AI does not plan their day; tasks can still be given to them by hand.')}</p>}

      <TodayLoad person={person} canPlan={canPlan} onPlan={onPlan} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Fact icon={Clock} title={t('time.team.hours', 'Hours')}>
          <p className="font-a-mono text-sm text-a-text">{hours.start}–{hours.end}</p>
          <p className="text-xs text-a-text-2">
            {hours.own ? t('time.team.own_hours', 'Their own hours') : t('time.team.venue_hours', 'The venue’s hours')}
            {' · '}
            {person.profile.break_minutes > 0
              ? t('time.team.break_of', 'Break {{length}}', { length: duration(person.profile.break_minutes, units) })
              : t('time.team.no_break_line', 'No break set')}
          </p>
        </Fact>

        <Fact icon={CalendarDays} title={t('time.team.days', 'Work days')}>
          <ul className="flex flex-wrap gap-1" aria-label={t('time.team.days', 'Work days')}>
            {WEEKDAYS.map(day => {
              const on = days.includes(day)
              return (
                <li key={day} className={`rounded-full px-2 py-0.5 text-xs ${on ? 'bg-a-accent/12 font-semibold text-a-accent-text' : 'bg-a-surface-2 text-a-text-2 line-through'}`}>
                  {weekdayName(day, i18n.language)}{!on && <span className="sr-only"> {t('time.team.day_off', '(day off)')}</span>}
                </li>
              )
            })}
          </ul>
          {person.profile.work_days === null && <p className="mt-1 text-xs text-a-text-2">{t('time.team.every_day', 'Every day')}</p>}
        </Fact>

        <Fact icon={ShieldCheck} title={t('time.team.pool_rule', 'May take from the pool')}>
          {skills === 'manager' && <Pill tone="accent">{t('time.team.any_manager', 'Any type (a manager)')}</Pill>}
          {skills === 'any' && <Pill tone="success">{t('time.team.any_type', 'Any type')}</Pill>}
          {skills === 'none' && <Pill tone="danger">{t('time.team.no_types_rule', 'Nothing from the pool')}</Pill>}
          {skills === 'some' && (
            <ul className="flex flex-wrap gap-1">
              {(person.profile.skills ?? []).map(name => <TypeChip key={name} name={name} color={colorOf(name)} />)}
            </ul>
          )}
        </Fact>

        <Fact icon={Star} title={t('time.team.fits', 'Fits their knowledge')}>
          {prefers ? (
            <ul className="flex flex-wrap gap-1">
              {person.prefers.groups.map(name => <TypeChip key={`g:${name}`} name={name} color={colorOf(name)} />)}
              {person.prefers.tasks.map(key => <TypeChip key={`t:${key}`} name={channelOf(key)?.label ?? key} color={channelOf(key)?.color} />)}
            </ul>
          ) : <p className="text-sm text-a-text-2">{t('time.team.no_prefers', 'No preference noted')}</p>}
        </Fact>
      </div>

      <Fact icon={BookOpen} title={t('time.team.knowledge', 'What they know')}>
        {person.profile.knowledge.trim()
          ? <p className="line-clamp-4 whitespace-pre-line break-words text-sm text-a-text">{person.profile.knowledge}</p>
          : <p className="text-sm text-a-text-2">{t('time.team.no_knowledge', 'Nothing noted yet.')}</p>}
      </Fact>

      <Fact icon={GraduationCap} title={t('time.team.shown', 'Shown in their work')} hint={t('time.team.shown_hint', 'Measured from the last 90 days of finished work')}>
        {person.experience.done === 0 ? (
          <p className="text-sm text-a-text-2">{t('time.team.shown_none', 'No finished work in the last 90 days.')}</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-a-text">
              {t('time.team.shown_total', '{{done}} finished · {{pct}} % on time', { done: person.experience.done, pct: percent(person.experience.on_time, person.experience.done) ?? 0 })}
            </p>
            <ul className="space-y-1">
              {experience.slice(0, 4).map(row => (
                <li key={row.group ?? '—'} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 text-a-text">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: (row.group && colorOf(row.group)) ?? '#94a3b8' }} />
                    <span className="truncate">{row.group ?? t('time.team.no_type', 'No type')}</span>
                  </span>
                  <span className="text-xs text-a-text-2">
                    {t('time.team.shown_row', '{{done}} done · {{pct}} % on time · ~{{length}}', { done: row.done, pct: row.onTimePct ?? 0, length: duration(row.avgMinutes, units) })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Fact>
    </article>
  )
}

/* ─── By type of work ──────────────────────────────────────────────── */

function NameList({ people, empty }: { people: Person[]; empty: string }) {
  if (people.length === 0) return <p className="text-sm text-a-text-2">{empty}</p>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {people.map(p => (
        <li key={p.key} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-a-border bg-a-surface py-0.5 pl-0.5 pr-2.5 text-xs text-a-text">
          <Avatar name={p.name} size="sm" tone={p.manager ? 'accent' : 'neutral'} /><span className="truncate">{p.name}</span>
        </li>
      ))}
    </ul>
  )
}

function TypesSection({ people }: { people: Person[] }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const roster = typeRoster(people, boot.settings.groups)

  if (roster.length === 0) {
    return (
      <Card>
        <EmptyState icon={Tags} title={t('time.team.no_types_yet', 'No types of work yet')}
          line={t('time.team.no_types_yet_line', 'Types such as housekeeping or maintenance are set in Settings. Then you can say who takes which.')}
          action={boot.staff.can.manage_settings ? (
            <Link to="/time/settings" className="inline-flex items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm">
              <Tags size={15} aria-hidden />{t('time.team.open_settings', 'Set up types')}
            </Link>
          ) : undefined} />
      </Card>
    )
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {roster.map(type => <TypeCard key={type.name} type={type} />)}
    </div>
  )
}

function TypeCard({ type }: { type: TypeRoster }) {
  const { t } = useTranslation()
  return (
    <Card title={type.name} icon={Tag}
      description={t('time.team.type_line', 'May take it: {{may}} · Prefer it: {{prefer}}', { may: type.mayTake.length, prefer: type.prefer.length })}>
      <div className="space-y-4">
        <Fact icon={ShieldCheck} title={t('time.team.type_may', 'May take it from the pool')}>
          {type.everyone && type.mayTake.length > 0
            ? <p className="text-sm text-a-text">{t('time.team.type_everyone', 'Everyone on the team')}</p>
            : <NameList people={type.mayTake} empty={t('time.team.type_nobody', 'Nobody: no one’s skills include it.')} />}
        </Fact>
        <Fact icon={Star} title={t('time.team.type_prefer', 'It fits their knowledge')}>
          <NameList people={type.prefer} empty={t('time.team.type_prefer_none', 'Nobody noted yet.')} />
        </Fact>
        <Fact icon={GraduationCap} title={t('time.team.type_most', 'Most done')} hint={t('time.team.shown_hint', 'Measured from the last 90 days of finished work')}>
          {type.experienced.length === 0 ? <p className="text-sm text-a-text-2">{t('time.team.type_most_none', 'Nobody has finished one yet.')}</p> : (
            <ul className="space-y-1">
              {type.experienced.map(x => (
                <li key={x.person.key} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="truncate text-a-text">{x.person.name}</span>
                  <span className="text-xs text-a-text-2">{t('time.team.type_most_row', '{{done}} done · {{pct}} % on time', { done: x.done, pct: x.onTimePct ?? 0 })}</span>
                </li>
              ))}
            </ul>
          )}
        </Fact>
      </div>
    </Card>
  )
}
