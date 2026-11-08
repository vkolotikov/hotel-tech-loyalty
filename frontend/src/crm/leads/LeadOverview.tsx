import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Flame, Sparkles, Trophy, XCircle } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { money, timeAgo } from '../lib/format'
import { Pill } from '../ui/Pill'
import { amount, followUp } from './leadLogic'
import { aiSignal, dueIn, priorityTone, stageSteps } from './listLogic'
import type { LeadDetail, Stage } from './leadTypes'
import { coldLabel, dueInLabel, dueInTone, intentLabel, sourceLabel } from './leadWords'
import { nextStepWord } from '../tasks/taskWords'

/**
 * A lead at a glance (round 2's overview, the top of its page): where it is in the pipeline as a bar of its stages — a
 * press moves it, won and lost at the two ends through their own flows — then the facts that decide the next move
 * (value, owner, priority, next step, last touch, where it came from) and what the AI made of it.
 */
export function LeadOverview({ lead, stages, priorities, onPick, busy }: { lead: LeadDetail; stages: Stage[]; priorities: string[]; onPick: (stage: Stage) => void; busy: boolean }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const steps = stageSteps(lead, stages)
  const value = amount(lead.total_value)
  const next = followUp(lead, boot.venue.today)
  const due = next ? dueIn(next.day, boot.venue.today) : null
  const ai = aiSignal(lead)
  const tone = priorityTone(lead.priority, priorities)
  const at = steps.open.findIndex(s => s.state === 'current')

  return (
    <section aria-label={t('crm.leads.overview', 'Overview')} className="space-y-4 rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm">
      {steps.open.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs text-a-text-2">
            <span className="font-medium text-a-text">{t('crm.leads.field_stage', 'Stage')}</span>
            <span>{steps.current?.name ?? lead.status}</span>
            {at >= 0 && <span>{t('crm.leads.stage_of', 'step {{at}} of {{total}}', { at: at + 1, total: steps.open.length })}</span>}
          </div>
          <ol aria-label={t('crm.leads.stage_bar', 'Stages of the pipeline')} className="flex items-stretch gap-1">
            {steps.open.map(step => (
              <li key={step.stage.id} className="min-w-0 flex-1">
                <button type="button" disabled={busy || step.state === 'current'} onClick={() => onPick(step.stage)} aria-current={step.state === 'current' ? 'step' : undefined}
                  aria-label={step.state === 'current' ? t('crm.leads.stage_here', '{{stage}}, where the lead is', { stage: step.stage.name }) : t('crm.leads.stage_move', 'Move to {{stage}}', { stage: step.stage.name })}
                  className="group block w-full min-w-0 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-default">
                  <span aria-hidden className={`block h-2 rounded-full transition-colors ${step.state === 'next' ? 'bg-a-surface-2 group-hover:bg-a-accent/30' : 'bg-a-accent'}`} />
                  <span aria-hidden className={`mt-1.5 hidden items-center gap-1 truncate text-xs sm:flex ${step.state === 'current' ? 'font-semibold text-a-text' : 'text-a-text-2'}`}>
                    {step.state === 'done' && <Check size={11} className="shrink-0" />}
                    <span className="truncate">{step.stage.name}</span>
                  </span>
                </button>
              </li>
            ))}
            {steps.won && (
              <li className="shrink-0">
                <button type="button" disabled={busy || steps.current?.kind === 'won'} onClick={() => steps.won && onPick(steps.won)}
                  aria-label={t('crm.leads.won_confirm', 'Mark won')} aria-current={steps.current?.kind === 'won' ? 'step' : undefined}
                  className={`grid h-9 w-9 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-a-accent ${steps.current?.kind === 'won' ? 'border-transparent bg-a-st-confirmed/12 text-a-st-confirmed' : 'border-a-border text-a-text-2 hover:text-a-st-confirmed'}`}>
                  <Trophy size={15} aria-hidden />
                </button>
              </li>
            )}
            {steps.lost && (
              <li className="shrink-0">
                <button type="button" disabled={busy || steps.current?.kind === 'lost'} onClick={() => steps.lost && onPick(steps.lost)}
                  aria-label={t('crm.leads.lost_confirm', 'Mark lost')} aria-current={steps.current?.kind === 'lost' ? 'step' : undefined}
                  className={`grid h-9 w-9 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-a-accent ${steps.current?.kind === 'lost' ? 'border-transparent bg-a-danger/12 text-a-danger' : 'border-a-border text-a-text-2 hover:text-a-danger'}`}>
                  <XCircle size={15} aria-hidden />
                </button>
              </li>
            )}
          </ol>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label={t('crm.leads.value', 'Value')}><span className="font-a-display text-xl text-a-text">{value === null ? '—' : money(value, boot.venue.currency, lang)}</span></Fact>
        <Fact label={t('crm.leads.field_owner', 'Owner')}><span className={lead.assigned_to ? 'text-a-text' : 'font-medium text-a-st-pending'}>{lead.assigned_to || t('crm.leads.owner_none', 'Nobody yet')}</span></Fact>
        <Fact label={t('crm.leads.field_priority', 'Priority')}>{lead.priority && tone ? <Pill tone={tone}>{lead.priority}</Pill> : <span className="text-a-text-2">—</span>}</Fact>
        <Fact label={t('crm.leads.next_step', 'Next step')}>
          {next ? (
            <span className="block min-w-0">
              <span className="block truncate text-a-text">{nextStepWord(t, next.type) ?? t('crm.leads.next_untitled', 'Follow up')}</span>
              {due && <Pill tone={dueInTone(due)}>{dueInLabel(t, due, lang)}</Pill>}
            </span>
          ) : <span className="text-a-text-2">{t('crm.leads.no_next', 'No next step')}</span>}
        </Fact>
        <Fact label={t('crm.leads.last_touch_label', 'Last touch')}>
          <span className="text-a-text">{lead.last_contacted_at ? timeAgo(lead.last_contacted_at, lang) : t('crm.leads.never', 'Never')}</span>
        </Fact>
        <Fact label={t('crm.leads.came_from', 'Came from')}>
          <span className="block truncate text-a-text">{sourceLabel(t, lead.source)}</span>
          <span className="block text-xs text-a-text-2">{t('crm.leads.came_in', 'came in {{when}}', { when: timeAgo(lead.created_at, lang) })}</span>
        </Fact>
      </dl>

      {ai && (
        <div className="crm-ai-border flex flex-wrap items-center gap-2 rounded-xl border p-3">
          <span className="crm-ai-text inline-flex items-center gap-1.5 text-xs font-semibold"><Sparkles size={14} aria-hidden />{t('crm.leads.ai_says', 'The AI says')}</span>
          {ai.probability !== null && <Pill tone={ai.probability >= 70 ? 'success' : ai.probability >= 40 ? 'pending' : 'danger'}>{t('crm.leads.ai_win', '{{percent}} % likely to win', { percent: ai.probability })}</Pill>}
          {coldLabel(t, ai.cold) && <Pill tone={ai.cold === 'high' ? 'danger' : ai.cold === 'medium' ? 'pending' : 'success'}>{ai.cold === 'high' && <Flame size={12} aria-hidden />}{coldLabel(t, ai.cold)}</Pill>}
          {intentLabel(t, ai.intent) && <Pill tone="ai">{intentLabel(t, ai.intent)}</Pill>}
          {ai.action && <p className="w-full text-sm text-a-text"><span className="crm-ai-text font-medium">{t('crm.leads.ai_next', 'Next:')}</span> {ai.action}</p>}
        </div>
      )}
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-a-text-2">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm">{children}</dd>
    </div>
  )
}
