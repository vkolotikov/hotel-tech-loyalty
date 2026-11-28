import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bot, CheckCircle2, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { VoiceButton } from '../ai/VoiceButton'
import { appendWords } from '../ai/voice'
import { timeApi, type PlanRequest } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, duration } from '../lib/format'
import { useRefresh } from '../lib/queries'
import type { ApplyResult, PlanResult } from '../lib/types'
import { TextArea, Toggle } from '../ui/inputs'
import { Avatar } from '../ui/Avatar'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { byPerson, linesToApply, planSummary } from './planLogic'
import { PlanLine, PlanProgress, PlanSummaryBar, Unplaced } from './PlanParts'

const SKIPPED_DEFAULTS: Record<string, string> = {
  changed: 'changed meanwhile', done: 'already done', not_yours: 'not yours to plan', no_person: 'person not on the team',
  not_allowed: 'not their type of work', not_found: 'not found',
}

/**
 * Plan a day (2026-11-09): mine, one person's or the team's (a manager's). The AI plans from the team's skills,
 * knowledge, preferences, shown experience, hours and capacity, and the server checks every line before it is shown; the
 * rules plan when the AI cannot. Nothing changes until the person applies the lines they keep.
 */
export function PlanDialog({ date, scope, person, onClose }: { date: string; scope: 'me' | 'person' | 'team'; person?: string; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const [options, setOptions] = useState({ include_pool: scope !== 'team' ? true : false, include_overdue: true, include_timed: false, use_ai: boot.ai.ready })
  const [instruction, setInstruction] = useState('')
  const [plan, setPlan] = useState<PlanResult | null>(null)
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [applied, setApplied] = useState<ApplyResult | null>(null)

  const make = useMutation({
    mutationFn: () => {
      const body: PlanRequest = { date, scope, ...options, lang: (i18n.language || 'en').slice(0, 2) }
      if (scope === 'person' && person) body.person = person
      if (instruction.trim()) body.instruction = instruction.trim()
      return timeApi.plan(body)
    },
    onSuccess: answer => { setPlan(answer); setTicked(new Set(answer.proposals.map(p => p.task_id))); setApplied(null) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const apply = useMutation({
    mutationFn: () => timeApi.apply(date, linesToApply(plan!.proposals, ticked)),
    onSuccess: answer => {
      refresh()
      setApplied(answer)
      toast(t('time.plan.applied', '{{count}} task(s) planned', { count: answer.applied }))
      if (answer.skipped.length === 0) onClose()
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const groups = useMemo(() => (plan ? byPerson(plan.proposals) : []), [plan])
  const toggle = (id: number) => setTicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const title = scope === 'team' ? t('time.plan.plan_team', 'Plan the team’s day') : scope === 'person' ? t('time.plan.plan_person', 'Plan their day') : t('time.plan.plan_mine', 'Plan my day')

  return (
    <SidePanel title={`${title} · ${dayLabel(date, i18n.language)}`} onClose={onClose}
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
      {!plan && make.isPending ? <PlanProgress kind="day" ai={options.use_ai} /> : !plan ? (
        <div className="space-y-4">
          <p className="text-sm text-a-text-2">{scope === 'team'
            ? t('time.plan.line_team', 'Who does what and when: the AI matches each task to the person whose skills, knowledge and experience fit it, within their hours and capacity, and keeps high priority work early.')
            : t('time.plan.line_mine', 'Your open tasks fitted into your free time, high priority first, around what is already timed.')}</p>
          {!boot.ai.ready && <Notice tone="info">{t(`time.ai_state.${boot.ai.state}`, t('time.ai_state.unknown', 'The AI cannot be asked just now.'))} {t('time.plan.rules_instead', 'The planner’s rules make the plan instead.')}</Notice>}
          <div className="space-y-3 rounded-2xl border border-a-border p-3">
            <Toggle label={t('time.plan.opt_ai', 'Plan with AI')} hint={t('time.plan.opt_ai_hint', 'Off: the rules plan (skills, preferences, experience, free time).')} checked={options.use_ai} disabled={!boot.ai.ready} onChange={v => setOptions(o => ({ ...o, use_ai: v }))} />
            <Toggle label={t('time.plan.opt_overdue', 'Bring in overdue work')} hint={t('time.plan.opt_overdue_hint', 'Unfinished tasks from the last 30 days.')} checked={options.include_overdue} onChange={v => setOptions(o => ({ ...o, include_overdue: v }))} />
            <Toggle label={t('time.plan.opt_pool', 'Fill free time from the pool')} hint={t('time.plan.opt_pool_hint', 'Open tasks nobody has taken, that the skills allow.')} checked={options.include_pool} onChange={v => setOptions(o => ({ ...o, include_pool: v }))} />
            <Toggle label={t('time.plan.opt_timed', 'Re-plan tasks that already have a time')} checked={options.include_timed} onChange={v => setOptions(o => ({ ...o, include_timed: v }))} />
          </div>
          {options.use_ai && (
            <div>
              <span className="mb-1 block text-xs font-medium text-a-text-2">{t('time.plan.instruction', 'Anything the AI should know? (optional)')}</span>
              <div className="flex items-start gap-2">
                <TextArea rows={3} value={instruction} maxLength={500} onChange={e => setInstruction(e.target.value)} aria-label={t('time.plan.instruction', 'Anything the AI should know? (optional)')}
                  placeholder={t('time.plan.instruction_hint', 'e.g. “Anna leaves at 15:00”, “keep the morning for check-outs”')} />
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
          {plan.proposals.length === 0 && <Notice tone="info">{t('time.plan.nothing', 'Nothing to plan: every open task already has its time.')}</Notice>}

          {plan.proposals.length > 0 && (
            <PlanSummaryBar summary={planSummary(plan.proposals, plan.unplaced.length)} ticked={ticked.size}
              onAll={() => setTicked(new Set(plan.proposals.map(p => p.task_id)))} onNone={() => setTicked(new Set())} />
          )}

          {groups.map((g, at) => (
            <section key={g.person} className="overflow-hidden rounded-2xl border border-a-border animate-a-rise" style={{ animationDelay: `${at * 60}ms` }}>
              <header className="flex items-center gap-2.5 border-b border-a-border bg-a-surface-2/40 px-3 py-2">
                <Avatar name={g.name} size="sm" />
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-a-text">{g.name}</h3>
                <span className="text-xs text-a-text-2">{duration(g.minutes, units)}</span>
              </header>
              <ul className="divide-y divide-a-border">
                {g.lines.map((line, i) => <PlanLine key={line.task_id} line={line} index={at + i} checked={ticked.has(line.task_id)} onToggle={() => toggle(line.task_id)} />)}
              </ul>
            </section>
          ))}

          <Unplaced items={plan.unplaced} />

          {applied && applied.skipped.length > 0 && (
            <Notice tone="warning">
              {t('time.plan.skipped_title', 'Some lines were not applied:')}{' '}
              {applied.skipped.map(s => `${plan.proposals.find(p => p.task_id === s.task_id)?.title ?? `#${s.task_id}`} (${t(`time.plan.skipped.${s.reason}`, SKIPPED_DEFAULTS[s.reason] ?? s.reason)})`).join(', ')}
            </Notice>
          )}
        </div>
      )}
    </SidePanel>
  )
}
