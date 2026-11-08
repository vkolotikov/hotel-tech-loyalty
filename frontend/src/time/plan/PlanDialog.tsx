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
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { byPerson, changesPerson, knownReasons, linesToApply } from './planLogic'

const REASON_DEFAULTS: Record<string, string> = {
  ai: 'AI', keeps_owner: 'stays theirs', skill: 'their skill', prefers: 'fits their knowledge', experience: 'has done this before',
  most_free: 'has the most room', priority: 'high priority', over_capacity: 'over their capacity', from_pool: 'from the pool',
  from_overdue: 'overdue',
}
const UNPLACED_DEFAULTS: Record<string, string> = {
  no_room: 'No free time left in their day.', no_one: 'Nobody who may take it has room.', not_working: 'Its person is off that day.',
  not_yours: 'Someone else\'s task.',
}
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
          <Button className="ml-auto" onClick={() => make.mutate()} loading={make.isPending}><Wand2 size={15} aria-hidden />{t('time.plan.make', 'Make the plan')}</Button>
        </div>
      )}>
      {!plan ? (
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
            <div className="flex gap-2.5 rounded-2xl time-ai-soft p-3 text-sm"><Sparkles size={16} aria-hidden className="mt-0.5 shrink-0" /><p>{plan.summary}</p></div>
          )}
          {plan.source === 'rules' && (
            <Notice tone="info">
              <span className="inline-flex items-center gap-1.5"><Bot size={14} aria-hidden />{t('time.plan.by_rules', 'Planned by the rules.')}</span>{' '}
              {plan.ai_status === 'failed' && t('time.plan.ai_failed', 'The AI could not be reached.')}
              {plan.ai_status === 'over' && t('time.plan.ai_over', "This month's AI allowance is used up.")}
            </Notice>
          )}
          {plan.proposals.length === 0 && <Notice tone="info">{t('time.plan.nothing', 'Nothing to plan: every open task already has its time.')}</Notice>}

          {groups.map(g => (
            <section key={g.person} className="rounded-2xl border border-a-border">
              <header className="flex items-center gap-2 border-b border-a-border px-3 py-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-a-text">{g.name}</h3>
                <span className="text-xs text-a-text-2">{duration(g.minutes, units)}</span>
              </header>
              <ul className="divide-y divide-a-border">
                {g.lines.map(line => (
                  <li key={line.task_id} className="flex items-start gap-3 px-3 py-2.5">
                    <input type="checkbox" checked={ticked.has(line.task_id)} onChange={() => toggle(line.task_id)} aria-label={line.title} className="mt-1 h-4 w-4 accent-[rgb(var(--a-accent))]" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-a-mono text-a-text">{line.start_time}–{line.end_time}</span>
                        <span className="min-w-0 truncate font-medium text-a-text">{line.title}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {changesPerson(line) && <span className="rounded-full bg-a-st-progress/12 px-2 py-0.5 text-xs text-a-st-progress">{t('time.plan.reassigned', 'new person')}</span>}
                        {knownReasons(line.reasons).map(r => (
                          <span key={r} className={`rounded-full px-2 py-0.5 text-xs ${r === 'ai' ? 'time-ai-soft' : r === 'over_capacity' ? 'bg-a-danger/12 text-a-danger' : 'bg-a-surface-2 text-a-text-2'}`}>
                            {t(`time.plan.reason.${r}`, REASON_DEFAULTS[r] ?? r)}
                          </span>
                        ))}
                      </div>
                      {line.note && <p className="mt-1 text-xs time-ai-text">{line.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {plan.unplaced.length > 0 && (
            <section className="rounded-2xl border border-dashed border-a-border p-3">
              <h3 className="mb-2 text-sm font-semibold text-a-text">{t('time.plan.unplaced_title', 'Not planned')}</h3>
              <ul className="space-y-1 text-sm">
                {plan.unplaced.map(u => (
                  <li key={u.task_id} className="flex flex-wrap gap-x-2"><span className="text-a-text">{u.title}</span><span className="text-a-text-2">— {t(`time.plan.unplaced.${u.reason}`, UNPLACED_DEFAULTS[u.reason] ?? u.reason)}</span></li>
                ))}
              </ul>
            </section>
          )}

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
