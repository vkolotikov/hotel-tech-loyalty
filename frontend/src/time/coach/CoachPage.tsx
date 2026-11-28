import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  BookOpen, Bot, CalendarCheck, CheckCircle2, Circle, Clock, Gauge, GraduationCap, Lightbulb, ListChecks, Sparkles, Timer, Users, Wand2,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { duration } from '../lib/format'
import { staggerDelay } from '../lib/motion'
import { useRefresh } from '../lib/queries'
import { plannerApi } from '../lib/tasks'
import type { CoachOverview, Strategy, StrategyFix, TaskNote, TypeNote } from '../lib/types'
import { Card } from '../ui/Card'
import { CountUp, Orb, Ring, ShimmerLines } from '../ui/motion'
import { Pill } from '../ui/Pill'
import { Page } from '../ui/Page'
import { QueryState } from '../ui/QueryState'
import { SectionNav, type Section } from '../ui/SectionNav'
import { StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { Toolbar } from '../ui/Toolbar'
import { useToast } from '../ui/Toast'
import { DurationsSection, PeopleSection } from './CoachSections'
import { KnowledgeSection } from './KnowledgeSection'
import { WEEK_CHOICES, coachTab, figuresOf, gaps, readinessState, readinessWhere, typicalWrite, weeksOf, type CoachTab } from './coachLogic'

const PANEL = 'time-coach-panel'
const PREFIX = 'time-coach-section'

const ITEM_DEFAULTS: Record<string, { title: string; hint: string }> = {
  about: { title: 'About the business', hint: 'What the venue does, its busy times, what matters to its guests.' },
  rules: { title: 'House rules', hint: 'What must always happen, in which order, and who may not do what.' },
  types: { title: 'Notes on task types', hint: 'How long each kind of work takes and when it is best done.' },
  people: { title: 'What people do', hint: 'Job titles and what each person knows.' },
  skills: { title: 'Skills', hint: 'The types each staff member may take from the pool.' },
  hours: { title: 'Working hours', hint: 'Each person’s hours and days, so the plan fits them.' },
  history: { title: 'Finished work', hint: 'The planner learns from finished tasks; it fills itself as the team works.' },
  clocked: { title: 'Clocked time', hint: 'Real lengths come from tasks someone timed with Start and Finish.' },
}

const KIND_DEFAULTS: Record<string, string> = {
  duration: 'Lengths', training: 'Training', cross_skill: 'Cross-skilling', schedule: 'Schedule', recognition: 'Recognition', process: 'Process', data: 'Data',
}

/** A readiness item's count in words: "3 of 5", or the share of clocked work. */
function itemCount(t: TFunction, item: CoachOverview['readiness']['items'][number]): string | null {
  if (item.count === null || item.total === null) return null
  if (item.code === 'clocked') return t('time.coach.clocked_share', '{{pct}} % clocked', { pct: item.count })
  return t('time.coach.of', '{{count}} of {{total}}', { count: item.count, total: item.total })
}

/**
 * The AI coach (2026-11-14): what the planner's AI knows and has learned, and what to do about it. Readiness (what a
 * manager has taught it, how much history it has), what the weeks behind say about lengths and people (Learning), a
 * strategy the AI writes from all of it with one-press fixes the server checked, and — a manager's — the knowledge
 * itself, with drafts from the AI to accept. A staff member sees only their own figures. Sections in `?tab=`, the
 * learning window in `?weeks=`.
 */
export function CoachPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const [search, setSearch] = useSearchParams()
  const manager = boot.staff.can.manage_settings
  const tab = coachTab(search.get('tab'), manager)
  const weeks = weeksOf(search.get('weeks'))
  const query = useQuery({ queryKey: ['time', 'coach', weeks], queryFn: () => timeApi.coach(weeks), placeholderData: keepPreviousData })
  const data = query.data

  const go = (next: CoachTab) => setSearch(prev => { const p = new URLSearchParams(prev); if (next === 'overview') p.delete('tab'); else p.set('tab', next); return p }, { replace: true })
  const setWeeks = (n: number) => setSearch(prev => { const p = new URLSearchParams(prev); if (n === 8) p.delete('weeks'); else p.set('weeks', String(n)); return p }, { replace: true })

  const sections: Section<CoachTab>[] = [
    { key: 'overview', icon: Gauge, tone: 'ai', title: t('time.coach.tab.overview', 'Overview'), caption: t('time.coach.caption.overview', 'How ready the AI is, and a strategy') },
    { key: 'durations', icon: Timer, tone: 'progress', title: t('time.coach.tab.durations', 'Task lengths'), caption: t('time.coach.caption.durations', 'Planned against real, per type and task') },
    { key: 'people', icon: Users, tone: 'accent', title: manager ? t('time.coach.tab.people', 'People') : t('time.coach.tab.me', 'My work'), caption: manager ? t('time.coach.caption.people', 'Who does what best, who needs support') : t('time.coach.caption.me', 'How your work went') },
    ...(manager ? [{ key: 'knowledge' as const, icon: BookOpen, tone: 'success' as const, title: t('time.coach.tab.knowledge', 'Teach the AI'), caption: t('time.coach.caption.knowledge', 'The business, the work and the team') }] : []),
  ]

  return (
    <Page title={t('time.coach.title', 'AI coach')}
      line={t('time.coach.line', 'Teach the AI about the business, the work and the team; see what the past weeks say and what to change.')}
      actions={<Link to="/time/assistant" className="inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2"><Bot size={15} aria-hidden />{t('time.coach.ask', 'Ask the assistant')}</Link>}>
      <Toolbar>
        <span className="inline-flex items-center gap-2 px-1 text-sm font-medium text-a-text-2"><CalendarCheck size={15} aria-hidden />{t('time.coach.learn_from', 'Learn from')}</span>
        <Tabs label={t('time.coach.learn_from', 'Learn from')} value={String(weeks)} onChange={v => setWeeks(Number(v))}
          items={WEEK_CHOICES.map(n => ({ key: String(n), label: t('time.coach.weeks', 'Last {{count}} weeks', { count: n }) }))} />
      </Toolbar>

      <QueryState loading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} rows={6}>
        {data && (
          <div className={`space-y-5 transition-opacity ${query.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={query.isPlaceholderData || undefined}>
            <SectionNav label={t('time.coach.sections', 'Coach sections')} idPrefix={PREFIX} panelId={PANEL} sections={sections} value={tab} onChange={go} />
            <div id={PANEL} role="tabpanel" aria-labelledby={`${PREFIX}-${tab}`} className="animate-a-fade" key={tab}>
              {tab === 'overview' && <Overview data={data} weeks={weeks} manager={manager} onTeach={() => go('knowledge')} />}
              {tab === 'durations' && <DurationsSection data={data} manager={manager} />}
              {tab === 'people' && <PeopleSection data={data} manager={manager} />}
              {tab === 'knowledge' && manager && <KnowledgeSection data={data} />}
            </div>
          </div>
        )}
      </QueryState>
    </Page>
  )
}

function Overview({ data, weeks, manager, onTeach }: { data: CoachOverview; weeks: number; manager: boolean; onTeach: () => void }) {
  const { t } = useTranslation()
  // A staff member's tiles are their own figures (the server sends only their row); a manager's are the team's.
  const totals = figuresOf(data, manager)
  // Each figure counts up to its value when the page opens (the text itself is always the final figure).
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : <CountUp value={v} format={n => t('time.coach.pct', '{{pct}} %', { pct: n })} />)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={ListChecks} tone="accent" label={t('time.coach.finished', 'Finished')} value={<CountUp value={totals.done} />}
          hint={t('time.coach.finished_hint', 'of {{count}} tasks in the last {{weeks}} weeks', { count: totals.tasks, weeks })} />
        <StatTile icon={CalendarCheck} tone="success" label={t('time.coach.on_time', 'On time')} value={pct(totals.on_time_pct)}
          hint={t('time.coach.late_open', '{{count}} still open after their day', { count: totals.late_open })} />
        <StatTile icon={Clock} tone="pending" label={t('time.coach.clocked', 'Clocked')} value={pct(totals.clocked_pct)}
          hint={t('time.coach.clocked_hint', 'of finished tasks were timed')} />
        <StatTile icon={Timer} tone="progress" label={t('time.coach.accuracy', 'Real against planned')} value={pct(totals.accuracy_pct)}
          hint={totals.accuracy_pct === null ? t('time.coach.accuracy_none', 'Clock some tasks to learn real lengths') : t('time.coach.accuracy_hint', '100 % means the plans were right')} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <ReadinessCard data={data} manager={manager} onTeach={onTeach} />
        {manager ? <StrategyCard data={data} weeks={weeks} /> : <StaffCard />}
      </div>
    </div>
  )
}

function ReadinessCard({ data, manager, onTeach }: { data: CoachOverview; manager: boolean; onTeach: () => void }) {
  const { t } = useTranslation()
  const { score, items } = data.readiness
  const state = readinessState(score)
  const open = gaps(items)
  return (
    <Card title={t('time.coach.readiness', 'What the AI knows')} description={t('time.coach.readiness_line', 'The more it knows, the better it plans.')} icon={GraduationCap} tone="ai">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Ring value={score} size={104} stroke={10} label={t('time.coach.ready_label', '{{pct}} % of what the AI could know', { pct: score })}>
            <span className="font-a-display text-2xl text-a-text"><CountUp value={score} format={n => `${n}%`} /></span>
          </Ring>
          <div className="min-w-0 space-y-1">
            <p className="font-a-display text-xl text-a-text">{t(`time.coach.state.${state}`, state === 'high' ? 'Well taught' : state === 'mid' ? 'Getting there' : 'Little to go by yet')}</p>
            {open.length > 0 && <p className="text-sm text-a-text-2">{t('time.coach.state_left', 'Still to fill in: {{count}}', { count: open.length })}</p>}
          </div>
        </div>
        <ul className="space-y-2.5">
          {items.map(item => {
            const where = readinessWhere(item.code)
            const words = ITEM_DEFAULTS[item.code] ?? { title: item.code, hint: '' }
            const done = item.pct >= 100
            const count = itemCount(t, item)
            return (
              <li key={item.code} className="flex items-start gap-2.5 animate-a-rise" style={{ animationDelay: `${staggerDelay(items.indexOf(item), 40)}ms` }}>
                {done
                  ? <CheckCircle2 size={17} aria-hidden className="mt-0.5 shrink-0 text-a-st-confirmed" />
                  : <Circle size={17} aria-hidden className="mt-0.5 shrink-0 text-a-text-2" />}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className={done ? 'text-a-text' : 'font-semibold text-a-text'}>{t(`time.coach.item.${item.code}`, words.title)}</span>
                    {count && <span className="text-xs text-a-text-2">{count}</span>}
                  </p>
                  {!done && <p className="text-xs text-a-text-2">{t(`time.coach.item_hint.${item.code}`, words.hint)}</p>}
                </div>
                {!done && manager && where === 'knowledge' && (
                  <button type="button" onClick={onTeach} className="shrink-0 text-xs font-semibold text-a-accent-text hover:underline">{t('time.coach.fill_in', 'Fill in')}</button>
                )}
                {!done && manager && where === 'team' && (
                  <Link to="/time/team" className="shrink-0 text-xs font-semibold text-a-accent-text hover:underline">{t('time.coach.open_team', 'Open the team')}</Link>
                )}
              </li>
            )
          })}
        </ul>
        {open.length === 0 && <p className="text-sm text-a-text-2">{t('time.coach.all_set', 'Everything is in. Keep clocking tasks so the lengths stay true.')}</p>}
      </div>
    </Card>
  )
}

/** The fix a recommendation offers, in words: "Plan Cleaning for 45 min", "Let Anna take Front desk". */
function fixText(t: TFunction, fix: StrategyFix, units: { h: string; min: string }): string {
  if (fix.type === 'add_skill') return t('time.coach.fix_skill', 'Let {{name}} take {{type}} from the pool', { name: fix.name ?? '', type: fix.label })
  return t('time.coach.fix_typical', 'Plan {{name}} for {{length}}', { name: fix.label, length: duration(fix.minutes ?? 0, units) })
}

/** Applies one fix through its own writer: a typical length into the notes (read afresh), a type into a person's skills. */
async function applyFix(fix: StrategyFix): Promise<void> {
  if (fix.type === 'set_typical') {
    const settings = await plannerApi.settings()
    const types = (settings.planner_type_notes ?? {}) as Record<string, TypeNote>
    const tasks = (settings.planner_task_notes ?? {}) as Record<string, TaskNote>
    const write = typicalWrite(fix, types, tasks)
    if (write) await plannerApi.saveSetting(write.key, write.value)
    return
  }
  // A person's skills as they are now: a type already there, or "any type", needs nothing.
  const people = await timeApi.people()
  const person = people.people.find(p => p.key === fix.person)
  const skills = person?.profile.skills
  if (!person || person.staff_id === null || !Array.isArray(skills) || !fix.type_name || skills.includes(fix.type_name)) return
  await plannerApi.saveSkills(person.staff_id, [...skills, fix.type_name])
}

function StrategyCard({ data, weeks }: { data: CoachOverview; weeks: number }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [fixed, setFixed] = useState<Set<number>>(new Set())
  const make = useMutation({
    mutationFn: () => timeApi.strategy(weeks, (i18n.language || 'en').slice(0, 2)),
    onSuccess: answer => { setStrategy(answer); setFixed(new Set()) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const fix = useMutation({
    mutationFn: ({ fix }: { index: number; fix: StrategyFix }) => applyFix(fix),
    onSuccess: (_, { index }) => { setFixed(s => new Set(s).add(index)); refresh(); toast(t('time.coach.fixed', 'Done')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const enough = data.learning.totals.done > 0 || data.readiness.score > 0

  return (
    <Card title={t('time.coach.strategy', 'Strategy')} icon={Lightbulb} tone="ai"
      description={t('time.coach.strategy_line', 'The AI reads the figures and what you taught it, and says what to change.')}
      action={strategy && <Button size="sm" variant="secondary" onClick={() => make.mutate()} loading={make.isPending} disabled={!boot.ai.ready}><Wand2 size={14} aria-hidden />{t('time.coach.again', 'Again')}</Button>}>
      {!boot.ai.ready && <Notice tone="info">{t(`time.ai_state.${boot.ai.state}`, t('time.ai_state.unknown', 'The AI cannot be asked just now.'))}</Notice>}
      {make.isPending && !strategy ? (
        <div role="status" className="space-y-4 animate-a-fade">
          <div className="flex items-center gap-3">
            <Orb size="md" busy />
            <div>
              <p className="text-sm font-semibold text-a-text">{t('time.coach.strategy_wait', 'The AI is reading the figures…')}</p>
              <p className="text-xs text-a-text-2">{t('time.coach.strategy_wait_line', 'What was planned, what it really took, and what you taught it.')}</p>
            </div>
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} aria-hidden className="space-y-2.5 rounded-2xl border border-a-border p-3">
              <span className="block h-4 w-28 rounded-full time-shimmer" />
              <ShimmerLines widths={['w-2/3', 'w-full']} />
            </div>
          ))}
        </div>
      ) : !strategy ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-a-text-2">{enough
            ? t('time.coach.strategy_intro', 'Who to train, which lengths to change, how to share the work better — each with the reason, and a fix you can make at once where there is one.')
            : t('time.coach.strategy_empty', 'There is little to go on yet. Teach the AI and let the team work a week, then ask again.')}</p>
          <Button onClick={() => make.mutate()} loading={make.isPending} disabled={!boot.ai.ready}><Sparkles size={15} aria-hidden />{t('time.coach.make', 'Make a strategy')}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {strategy.summary && <p className="rounded-2xl time-ai-soft p-3 text-sm animate-a-rise">{strategy.summary}</p>}
          {strategy.recommendations.length === 0 && <p className="text-sm text-a-text-2">{t('time.coach.no_recs', 'Nothing to change just now.')}</p>}
          <ol className="space-y-3">
            {strategy.recommendations.map((r, i) => (
              <li key={i} className="rounded-2xl border border-a-border p-3 animate-a-rise" style={{ animationDelay: `${staggerDelay(i + 1, 70)}ms` }}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={r.impact === 'high' ? 'danger' : r.impact === 'medium' ? 'pending' : 'neutral'}>{t(`time.coach.impact.${r.impact}`, r.impact)}</Pill>
                  <Pill tone="ai">{t(`time.coach.kind.${r.kind}`, KIND_DEFAULTS[r.kind] ?? r.kind)}</Pill>
                </div>
                <p className="mt-2 text-sm font-semibold text-a-text">{r.title}</p>
                {r.detail && <p className="mt-1 text-sm text-a-text-2">{r.detail}</p>}
                {r.fix && (fixed.has(i)
                  ? <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-a-st-confirmed"><CheckCircle2 size={14} aria-hidden className="time-pop" />{fixText(t, r.fix, units)}</p>
                  : <Button size="sm" className="mt-2" onClick={() => fix.mutate({ index: i, fix: r.fix! })} loading={fix.isPending && fix.variables?.index === i} disabled={fix.isPending}>
                      <CheckCircle2 size={14} aria-hidden />{fixText(t, r.fix, units)}
                    </Button>)}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  )
}

function StaffCard() {
  const { t } = useTranslation()
  return (
    <Card title={t('time.coach.staff_title', 'Your assistant')} icon={Sparkles} tone="ai" description={t('time.coach.staff_line', 'Plan your day and see how your work goes.')}>
      <p className="text-sm text-a-text-2">{t('time.coach.staff_body', 'Ask the assistant to plan your day, to suggest what to take from the pool, or how long your tasks really take. Your manager teaches it about the work and the team.')}</p>
      <Link to="/time/assistant" className="mt-3 inline-flex items-center gap-2 rounded-full bg-a-accent px-4 py-2 text-sm font-semibold text-a-accent-ink"><Bot size={15} aria-hidden />{t('time.coach.ask', 'Ask the assistant')}</Link>
    </Card>
  )
}
