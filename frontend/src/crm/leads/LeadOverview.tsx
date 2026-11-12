import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, Trophy, XCircle } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { CustomFieldsCard, ContactCard, AiCard, StayCard } from './LeadSide'
import { DetailsCard, KeyFacts } from './LeadFacts'
import { useLeadFields } from './leadData'
import { activeFields, hasStay, kindOf } from './leadLogic'
import { stageSteps } from './listLogic'
import type { AiRead } from './recordData'
import type { LeadDetail, Stage } from './leadTypes'

/**
 * A lead's Overview tab (round 5; round 2's overview and side column in one): where it is in the pipeline as a bar of
 * its stages — a press moves it, won and lost at the two ends through their own flows — the facts that decide the next
 * move, changed where they stand, what the AI made of it, then who it is, its details, a hotel's stay and the
 * organisation's own fields.
 */
export function OverviewTab({ lead, stages, onPick, busy, ai, onEdit, onDeal }: {
  lead: LeadDetail
  stages: Stage[]
  onPick: (stage: Stage) => void
  busy: boolean
  ai: AiRead
  onEdit: () => void
  /** To the Deal tab (a won lead). */
  onDeal: () => void
}) {
  const { t } = useTranslation()
  const fieldsQuery = useLeadFields()
  const fields = activeFields(fieldsQuery.data)
  const kind = kindOf(lead, stages)
  return (
    <div className="space-y-4">
      {kind === 'won' && (
        <Notice tone="success">
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span className="inline-flex items-center gap-1.5"><Trophy size={14} aria-hidden />{t('crm.leads.is_won_short', 'Won: a deal now.')}</span>
            <button type="button" onClick={onDeal} className="inline-flex items-center gap-1 font-medium underline">{t('crm.leads.open_deal', 'Open the deal')}<ArrowRight size={13} aria-hidden /></button>
          </span>
        </Notice>
      )}
      {kind === 'lost' && (
        <Notice tone="warning">{lead.lost_reason ? t('crm.leads.is_lost_because', 'Lost: {{reason}}', { reason: lead.lost_reason.label }) : t('crm.leads.is_lost', 'Lost.')}</Notice>
      )}
      <section aria-label={t('crm.leads.overview', 'Overview')} className="space-y-4 rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm">
        <StageBar lead={lead} stages={stages} onPick={onPick} busy={busy} />
        <KeyFacts lead={lead} />
      </section>
      <AiCard ai={ai} />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <ContactCard lead={lead} />
        <DetailsCard lead={lead} onEdit={onEdit} />
        {hasStay(lead) && <StayCard lead={lead} />}
        {fields.length > 0 && <CustomFieldsCard lead={lead} fields={fields} />}
      </div>
    </div>
  )
}

/** The pipeline's open stages as a bar, the lead's own marked; won and lost as the two ends. */
function StageBar({ lead, stages, onPick, busy }: { lead: LeadDetail; stages: Stage[]; onPick: (stage: Stage) => void; busy: boolean }) {
  const { t } = useTranslation()
  const steps = stageSteps(lead, stages)
  const at = steps.open.findIndex(s => s.state === 'current')
  if (steps.open.length === 0) return null
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs text-a-text-2">
        <span className="font-medium text-a-text">{steps.current?.name ?? lead.status}</span>
        {at >= 0 && <span>{t('crm.leads.stage_of', 'step {{at}} of {{total}}', { at: at + 1, total: steps.open.length })}</span>}
      </div>
      <ol aria-label={t('crm.leads.stage_bar', 'Stages of the pipeline')} className="flex items-center gap-1">
        {steps.open.map(step => (
          <li key={step.stage.id} className="min-w-0 flex-1">
            <button type="button" disabled={busy || step.state === 'current'} onClick={() => onPick(step.stage)} aria-current={step.state === 'current' ? 'step' : undefined}
              aria-label={step.state === 'current' ? t('crm.leads.stage_here', '{{stage}}, where the lead is', { stage: step.stage.name }) : t('crm.leads.stage_move', 'Move to {{stage}}', { stage: step.stage.name })}
              title={step.stage.name}
              className="group block w-full min-w-0 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-default">
              <span aria-hidden className={`block h-2 rounded-full transition-colors ${step.state === 'next' ? 'bg-a-surface-2 group-hover:bg-a-accent/30' : 'bg-a-accent'}`} />
              <span aria-hidden className={`mt-1 hidden items-center gap-1 truncate text-xs sm:flex ${step.state === 'current' ? 'font-semibold text-a-text' : 'text-a-text-2'}`}>
                {step.state === 'done' && <Check size={11} className="shrink-0" />}
                <span className="truncate">{step.stage.name}</span>
              </span>
            </button>
          </li>
        ))}
        {steps.won && (
          <li className="shrink-0">
            <button type="button" disabled={busy || steps.current?.kind === 'won'} onClick={() => steps.won && onPick(steps.won)} title={t('crm.leads.won_confirm', 'Mark won')}
              aria-label={t('crm.leads.won_confirm', 'Mark won')} aria-current={steps.current?.kind === 'won' ? 'step' : undefined}
              className={`grid h-8 w-8 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-a-accent ${steps.current?.kind === 'won' ? 'border-transparent bg-a-st-confirmed/12 text-a-st-confirmed' : 'border-a-border text-a-text-2 hover:text-a-st-confirmed'}`}>
              <Trophy size={14} aria-hidden />
            </button>
          </li>
        )}
        {steps.lost && (
          <li className="shrink-0">
            <button type="button" disabled={busy || steps.current?.kind === 'lost'} onClick={() => steps.lost && onPick(steps.lost)} title={t('crm.leads.lost_confirm', 'Mark lost')}
              aria-label={t('crm.leads.lost_confirm', 'Mark lost')} aria-current={steps.current?.kind === 'lost' ? 'step' : undefined}
              className={`grid h-8 w-8 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-a-accent ${steps.current?.kind === 'lost' ? 'border-transparent bg-a-danger/12 text-a-danger' : 'border-a-border text-a-text-2 hover:text-a-danger'}`}>
              <XCircle size={14} aria-hidden />
            </button>
          </li>
        )}
      </ol>
    </div>
  )
}
