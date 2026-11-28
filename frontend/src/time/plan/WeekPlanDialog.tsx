import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bot, CheckCircle2, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { VoiceButton } from '../ai/VoiceButton'
import { appendWords } from '../ai/voice'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { addDays } from '../lib/dates'
import { dayLabel, duration } from '../lib/format'
import { useRefresh } from '../lib/queries'
import type { ApplyResult, WeekPlanResult } from '../lib/types'
import { TextArea, Toggle } from '../ui/inputs'
import { Tabs } from '../ui/Tabs'
import { LoadBar } from '../ui/motion'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { dayLoad, planSummary, weekLinesToApply, weekOptions, weekTaskIds } from './planLogic'
import { PlanLine, PlanProgress, PlanSummaryBar, Unplaced } from './PlanParts'

/**
 * Plan the week with AI (2026-11-14): mine, or the team's for whoever may plan for others. The pool, the backlogs and
 * the overdue work each go to a day and a person — the AI weighs skills, knowledge, levels, experience, due days and
 * each day's room, and the server checks every line (the rules place what fails) — then each day gets its times. The
 * lines are grouped by day with how full each person's day becomes; nothing changes until the person applies them.
 */
export function WeekPlanDialog({ monday, team, onClose }: { monday: string; team: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const [options, setOptions] = useState({ include_pool: true, include_backlog: true, include_overdue: true, use_ai: boot.ai.ready })
  const [instruction, setInstruction] = useState('')
  const weeks = weekOptions(monday, boot.venue.today)
  const [which, setWhich] = useState<'this' | 'next'>(weeks.preferred)
  const start = which === 'this' ? weeks.this.start : weeks.next.start
  const range = (from: string, to: string) => `${dayLabel(from, i18n.language)} – ${dayLabel(to, i18n.language)}`
  const [plan, setPlan] = useState<WeekPlanResult | null>(null)
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [applied, setApplied] = useState<ApplyResult | null>(null)

  const make = useMutation({
    mutationFn: () => timeApi.planWeek({ start, scope: team ? 'team' : 'me', ...options, lang: (i18n.language || 'en').slice(0, 2), ...(instruction.trim() ? { instruction: instruction.trim() } : {}) }),
    onSuccess: answer => { setPlan(answer); setTicked(new Set(weekTaskIds(answer.days))); setApplied(null) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const apply = useMutation({
    mutationFn: () => timeApi.apply(plan!.from, weekLinesToApply(plan!.days, ticked)),
    onSuccess: answer => {
      refresh()
      setApplied(answer)
      toast(t('time.plan.applied', '{{count}} task(s) planned', { count: answer.applied }))
      if (answer.skipped.length === 0) onClose()
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const total = useMemo(() => (plan ? weekTaskIds(plan.days).length : 0), [plan])
  const toggle = (id: number) => setTicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const title = team ? t('time.plan.week_team', 'Plan the team’s week') : t('time.plan.week_mine', 'Plan my week')

  return (
    <SidePanel title={title} onClose={onClose}
      footer={plan ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setPlan(null)} disabled={apply.isPending}><ArrowLeft size={14} aria-hidden />{t('time.plan.again', 'Change and plan again')}</Button>
          <Button className="ml-auto" onClick={() => apply.mutate()} loading={apply.isPending} disabled={ticked.size === 0}>
            <CheckCircle2 size={15} aria-hidden />{t('time.plan.apply', 'Apply {{count}} line(s)', { count: ticked.size })}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onClose}>{t('time.common.cancel', 'Cancel')}</Button>
          <Button className="ml-auto" onClick={() => make.mutate()} loading={make.isPending}>{!make.isPending && <Wand2 size={15} aria-hidden />}{t('time.plan.make', 'Make the plan')}</Button>
        </div>
      )}>
      {!plan && make.isPending ? <PlanProgress kind="week" ai={options.use_ai} /> : !plan ? (
        <div className="space-y-4">
          <p className="text-sm text-a-text-2">{team
            ? t('time.plan.week_line_team', 'The pool, everyone’s backlog and overdue work, shared across the days of the week: each task to the person whose skills, knowledge and experience fit it, before its due day, within each day’s room. Then each day gets its times.')
            : t('time.plan.week_line_mine', 'Your backlog, overdue work and what you may take from the pool, spread over the days of the week within your free time.')}</p>
          {!boot.ai.ready && <Notice tone="info">{t(`time.ai_state.${boot.ai.state}`, t('time.ai_state.unknown', 'The AI cannot be asked just now.'))} {t('time.plan.rules_instead', 'The planner’s rules make the plan instead.')}</Notice>}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-a-text-2">{t('time.plan.which_week', 'Which week')}</span>
            <Tabs label={t('time.plan.which_week', 'Which week')} value={which} onChange={setWhich}
              items={[
                ...(weeks.this.daysLeft > 0 ? [{ key: 'this' as const, label: t('time.plan.this_week', 'This week: {{range}}', { range: range(weeks.this.start, addDays(monday, 6)) }) }] : []),
                { key: 'next' as const, label: t('time.plan.next_week', 'Next week: {{range}}', { range: range(weeks.next.start, addDays(weeks.next.start, 6)) }) },
              ]} />
          </div>
          <div className="space-y-3 rounded-2xl border border-a-border p-3">
            <Toggle label={t('time.plan.opt_ai', 'Plan with AI')} hint={t('time.plan.opt_ai_hint', 'Off: the rules plan (skills, preferences, experience, free time).')} checked={options.use_ai} disabled={!boot.ai.ready} onChange={v => setOptions(o => ({ ...o, use_ai: v }))} />
            <Toggle label={t('time.plan.opt_pool_week', 'Share out the pool')} hint={t('time.plan.opt_pool_hint', 'Open tasks nobody has taken, that the skills allow.')} checked={options.include_pool} onChange={v => setOptions(o => ({ ...o, include_pool: v }))} />
            <Toggle label={t('time.plan.opt_backlog', 'Give backlog work a day')} hint={t('time.plan.opt_backlog_hint', 'Tasks people already have but no day yet; they stay theirs.')} checked={options.include_backlog} onChange={v => setOptions(o => ({ ...o, include_backlog: v }))} />
            <Toggle label={t('time.plan.opt_overdue', 'Bring in overdue work')} hint={t('time.plan.opt_overdue_hint', 'Unfinished tasks from the last 30 days.')} checked={options.include_overdue} onChange={v => setOptions(o => ({ ...o, include_overdue: v }))} />
          </div>
          {options.use_ai && (
            <div>
              <span className="mb-1 block text-xs font-medium text-a-text-2">{t('time.plan.instruction', 'Anything the AI should know? (optional)')}</span>
              <div className="flex items-start gap-2">
                <TextArea rows={3} value={instruction} maxLength={500} onChange={e => setInstruction(e.target.value)} aria-label={t('time.plan.instruction', 'Anything the AI should know? (optional)')}
                  placeholder={t('time.plan.week_instruction_hint', 'e.g. “Boris is off on Friday”, “give Elina some front desk practice”')} />
                {boot.features.voice && <VoiceButton language={i18n.language} onText={w => setInstruction(before => appendWords(before, w))} />}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {plan.source === 'ai' && plan.summary && (
            <div className="flex gap-2.5 rounded-2xl time-ai-soft p-3 text-sm animate-a-rise"><Sparkles size={16} aria-hidden className="mt-0.5 shrink-0" /><p>{plan.summary}</p></div>
          )}
          {plan.source === 'rules' && (
            <Notice tone="info">
              <span className="inline-flex items-center gap-1.5"><Bot size={14} aria-hidden />{t('time.plan.by_rules', 'Planned by the rules.')}</span>{' '}
              {plan.ai_status === 'failed' && t('time.plan.ai_failed', 'The AI could not be reached.')}
              {plan.ai_status === 'over' && t('time.plan.ai_over', "This month's AI allowance is used up.")}
            </Notice>
          )}
          {total === 0 && <Notice tone="info">{t('time.plan.week_nothing', 'Nothing to plan this week: the pool and backlogs are empty, and every day’s work has its time.')}</Notice>}

          {total > 0 && (
            <PlanSummaryBar summary={planSummary(plan.days.flatMap(d => d.proposals), plan.unplaced.length, plan.days.filter(d => d.proposals.length > 0).length)} ticked={ticked.size}
              onAll={() => setTicked(new Set(weekTaskIds(plan.days)))} onNone={() => setTicked(new Set())} />
          )}

          {plan.days.filter(d => d.proposals.length > 0).map((d, at) => (
            <section key={d.date} className="overflow-hidden rounded-2xl border border-a-border animate-a-rise" style={{ animationDelay: `${at * 70}ms` }}>
              <header className="space-y-2.5 border-b border-a-border bg-a-surface-2/40 px-3 py-2.5">
                <h3 className="text-sm font-semibold text-a-text">{dayLabel(d.date, i18n.language, 'long')}</h3>
                <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  {dayLoad(d, ticked).filter(l => d.proposals.some(p => p.person === l.person)).map(l => (
                    <li key={l.person} className="min-w-0 space-y-1">
                      <p className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-medium text-a-text">{l.name}</span>
                        <span className={`shrink-0 tabular-nums ${l.pct > 100 ? 'font-semibold text-a-danger' : 'text-a-text-2'}`}>{duration(l.planned, units)} / {duration(l.capacity, units)}</span>
                      </p>
                      <LoadBar pct={l.pct} />
                    </li>
                  ))}
                </ul>
              </header>
              <ul className="divide-y divide-a-border">
                {d.proposals.map((line, i) => <PlanLine key={line.task_id} line={line} index={at + i} showPerson checked={ticked.has(line.task_id)} onToggle={() => toggle(line.task_id)} />)}
              </ul>
            </section>
          ))}

          <Unplaced items={plan.unplaced} week />

          {applied && applied.skipped.length > 0 && (
            <Notice tone="warning">{t('time.plan.skipped_title', 'Some lines were not applied:')} {applied.skipped.length}</Notice>
          )}
        </div>
      )}
    </SidePanel>
  )
}
