import { useTranslation } from 'react-i18next'
import { CalendarClock, Flame, Mail, MessageCircle, MessageSquare, Phone, Plus } from 'lucide-react'
import { Pill } from '../ui/Pill'
import { followUp, stageColor } from './leadLogic'
import { aiSignal, contactLinks, dueIn, freshness, type AiSignal } from './listLogic'
import type { LeadRow, Stage } from './leadTypes'
import { coldLabel, dueInLabel, dueInTone, freshLabel, intentLabel } from './leadWords'
import { nextStepWord } from '../tasks/taskWords'

/** A stage as a pill with its colour's dot (only a plain hex colour is drawn). */
export function StagePill({ stage, fallback }: { stage: Stage | null; fallback: string }) {
  const dot = stageColor(stage?.color)
  const tone = stage?.kind === 'won' ? 'success' : stage?.kind === 'lost' ? 'danger' : 'neutral'
  return (
    <Pill tone={tone} title={stage?.name ?? fallback}>
      {dot && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      {stage?.name ?? fallback}
    </Pill>
  )
}

/** How fresh a lead is: new today, its age, or cold since the last touch (open leads only). */
export function FreshChip({ lead, closed = false, now }: { lead: Pick<LeadRow, 'created_at' | 'last_contacted_at'>; closed?: boolean; now: Date }) {
  const { t } = useTranslation()
  const fresh = freshness(lead.created_at, lead.last_contacted_at, now, closed)
  if (!fresh) return null
  const cls = fresh.kind === 'fresh' ? 'bg-a-st-confirmed/12 text-a-st-confirmed' : fresh.kind === 'cold' ? 'bg-a-st-pending/12 text-a-st-pending' : 'bg-a-surface-2 text-a-text-2'
  return <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 text-xs font-medium leading-5 ${cls}`}>{freshLabel(t, fresh)}</span>
}

/** The AI's chance to win as a figure with a thin bar, a flame when it is going cold; nothing before the AI read it. */
export function AiCell({ lead, compact = false, blank = false }: { lead: Parameters<typeof aiSignal>[0]; compact?: boolean; blank?: boolean }) {
  const { t } = useTranslation()
  const ai = aiSignal(lead)
  // `blank`: a list's cell stays empty before the AI read the lead (round 5: no column of dashes).
  if (!ai) return compact || blank ? null : <span className="text-xs text-a-text-2">—</span>
  return <AiFigure ai={ai} compact={compact} title={aiTitle(t, ai)} />
}

function aiTitle(t: ReturnType<typeof useTranslation>['t'], ai: AiSignal): string {
  return [
    ai.probability !== null ? t('crm.leads.ai_win', '{{percent}} % likely to win', { percent: ai.probability }) : null,
    coldLabel(t, ai.cold),
    intentLabel(t, ai.intent),
    ai.action,
  ].filter(Boolean).join(' · ')
}

function AiFigure({ ai, compact, title }: { ai: AiSignal; compact: boolean; title: string }) {
  const { t } = useTranslation()
  const p = ai.probability
  const ink = p === null ? 'text-a-text-2' : p >= 70 ? 'text-a-st-confirmed' : p >= 40 ? 'text-a-st-pending' : 'text-a-danger'
  const fill = p === null ? 'bg-a-border' : p >= 70 ? 'bg-a-st-confirmed' : p >= 40 ? 'bg-a-st-pending' : 'bg-a-danger'
  return (
    <span title={title} className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1">
        {p !== null ? <span className={`text-sm font-semibold tabular-nums ${ink}`}>{`${p} %`}</span> : <span className="crm-ai-text text-xs font-medium">{t('crm.leads.ai_short', 'AI')}</span>}
        {ai.cold === 'high' && <Flame size={13} aria-label={coldLabel(t, 'high') ?? undefined} className="text-a-danger" />}
        {ai.cold === 'medium' && <span aria-label={coldLabel(t, 'medium') ?? undefined} className="h-1.5 w-1.5 rounded-full bg-a-st-pending" />}
      </span>
      {p !== null && !compact && (
        <span aria-hidden className="block h-1 w-12 overflow-hidden rounded-full bg-a-surface-2">
          <span className={`block h-full rounded-full ${fill}`} style={{ width: `${Math.max(4, p)}%` }} />
        </span>
      )}
      <span className="sr-only">{title}</span>
    </span>
  )
}

/** A lead's next step in a row: what to do and when (late in red, today in amber), or a way to add one. */
export function NextCell({ lead, today, lang, onAdd }: { lead: LeadRow; today: string; lang: string; onAdd?: () => void }) {
  const { t } = useTranslation()
  const next = followUp(lead, today)
  if (!next) {
    if (lead.next_task_completed && lead.next_task_type) return <span className="text-xs text-a-st-confirmed">{t('crm.leads.next_was_done', 'Done')}</span>
    return onAdd ? (
      <button type="button" onClick={onAdd} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent">
        <Plus size={13} aria-hidden />{t('crm.leads.task_add_short', 'Add a task')}
      </button>
    ) : <span className="text-xs text-a-text-2">{t('crm.leads.no_next', 'No next step')}</span>
  }
  const due = dueIn(next.day, today)
  const tone = dueInTone(due)
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      <CalendarClock size={14} aria-hidden className={`mt-0.5 shrink-0 ${tone === 'danger' ? 'text-a-danger' : tone === 'pending' ? 'text-a-st-pending' : 'text-a-text-2'}`} />
      <span className="min-w-0">
        <span className="block truncate text-sm text-a-text">{nextStepWord(t, next.type) ?? t('crm.leads.next_untitled', 'Follow up')}</span>
        {due && <span className={`block text-xs ${tone === 'danger' ? 'font-medium text-a-danger' : tone === 'pending' ? 'font-medium text-a-st-pending' : 'text-a-text-2'}`}>{dueInLabel(t, due, lang)}</span>}
      </span>
    </span>
  )
}

/** Write, call or message the contact, in one press each (only the ways the contact has). */
export function ContactLinks({ guest, name }: { guest: Parameters<typeof contactLinks>[0]; name: string }) {
  const { t } = useTranslation()
  const links = contactLinks(guest)
  const link = 'grid h-8 w-8 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-accent-text focus-visible:outline-2 focus-visible:outline-a-accent'
  if (!links.email && !links.call) return null
  return (
    <span className="inline-flex items-center gap-0.5">
      {links.email && <a href={links.email} className={link} aria-label={t('crm.leads.write_to', 'Email {{name}}', { name })}><Mail size={15} aria-hidden /></a>}
      {links.call && <a href={links.call} className={link} aria-label={t('crm.leads.call_to', 'Call {{name}}', { name })}><Phone size={15} aria-hidden /></a>}
      {links.whatsapp && <a href={links.whatsapp} target="_blank" rel="noreferrer noopener" className={link} aria-label={t('crm.leads.whatsapp_to', 'WhatsApp {{name}}', { name })}><MessageCircle size={15} aria-hidden /></a>}
      {links.sms && <a href={links.sms} className={`${link} hidden sm:grid`} aria-label={t('crm.leads.sms_to', 'Text {{name}}', { name })}><MessageSquare size={15} aria-hidden /></a>}
    </span>
  )
}
