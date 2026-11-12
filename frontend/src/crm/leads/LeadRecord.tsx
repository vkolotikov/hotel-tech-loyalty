import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowRightLeft, BriefcaseBusiness, CheckSquare, ChevronDown, History, LayoutDashboard, ListPlus, Mail, MessagesSquare, Paperclip,
  Pencil, Send, Sparkles, Trash2, Trophy, UserRound, Wand2, XCircle, type LucideIcon,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { RecordEmails } from '../mail/RecordEmails'
import { Avatar } from '../ui/Avatar'
import { ActionMenu, type MenuItem } from '../ui/Menu'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { RecordFrame, RecordPanel, type RecordHostProps, type RecordTab } from '../ui/RecordPanel'
import { useToast } from '../ui/Toast'
import { TaskForm } from '../tasks/TaskForm'
import { DealTab } from './LeadDeal'
import { LostDialog, WonDialog } from './LeadClose'
import { LeadEditPanel } from './LeadFacts'
import { useLeadChanged, useLeadSettings, usePipelines } from './leadData'
import { DeleteLead } from './LeadDelete'
import { defaultPipeline, kindOf, moveTo, resolveStage, sortedStages } from './leadLogic'
import { OverviewTab } from './LeadOverview'
import { ChatTab, FilesTab, ProposalDialog } from './LeadSide'
import { LeadTasks } from './LeadTasks'
import { LeadTimeline, type ComposerSeed } from './LeadTimeline'
import { priorityTone } from './listLogic'
import { ContactLinks, FreshChip, StagePill } from './parts'
import { fullPagePath, headerActions, leadTabs, tabShown, type LeadTab } from './recordLogic'
import { useAiBrief, useLeadActivities, useLeadChats, useLeadDetail, useLeadFiles } from './recordData'
import { SendTemplate } from './SendTemplate'
import type { LeadDetail, Stage } from './leadTypes'
import { sourceLabel } from './leadWords'

/**
 * A lead in its panel (round 5, owner 2026-11-12: "opening tabs, slides or popups"), over whichever list it was chosen
 * on: the record host gives the tab the address names, previous and next through that list, and close.
 */
export function LeadRecordPanel({ id, tab, onTab, onClose, onPrev, onNext }: RecordHostProps) {
  const { t } = useTranslation()
  const lead = useLeadDetail(id)
  const name = lead.data ? leadName(lead.data, t('crm.common.no_name', 'No name')) : t('crm.leads.lead_number', 'Lead #{{id}}', { id })
  return (
    <RecordPanel label={name} onClose={onClose} onPrev={onPrev} onNext={onNext} fullHref={fullPagePath(id, tab)}>
      {(tools, titleId) => lead.data
        ? <LeadRecordView lead={lead.data} tab={tab} onTab={onTab} tools={tools} titleId={titleId} onDeleted={onClose} />
        : (
          <RecordFrame idPrefix="lead-record" titleId={titleId} title={name} tools={tools} tab="overview" onTab={onTab}
            tabs={[{ key: 'overview', label: t('crm.record.overview', 'Overview'), icon: LayoutDashboard }]}>
            <QueryState loading={lead.isLoading} error={lead.error} onRetry={() => { void lead.refetch() }}>{null}</QueryState>
          </RecordFrame>
        )}
    </RecordPanel>
  )
}

function leadName(lead: LeadDetail, none: string): string {
  return lead.guest?.full_name || lead.guest?.email || none
}

const TAB_ICON: Record<LeadTab, LucideIcon> = {
  overview: LayoutDashboard, deal: BriefcaseBusiness, activity: History, tasks: CheckSquare, emails: Mail, files: Paperclip, chat: MessagesSquare,
}

/**
 * The lead's record (round 5), the same in its panel and on its own page (`/crm/leads/:id`, full width): who it is, its
 * stage, priority and freshness, where it came from; its few actions — the stage, won, lost, an email from a template,
 * write, call or message the contact, the AI's brief and a proposal, and "…" for edit, a task, the contact and delete —
 * then its parts as tabs with what each holds: Overview, the Deal once won, Activity, Tasks, Emails, Files, the Chat.
 * Everything is the full admin's (`inquiries/{id}` and its sub-resources).
 */
export function LeadRecordView({ lead, tab, onTab, tools, titleId, onDeleted, back = false }: {
  lead: LeadDetail
  tab: string | null
  onTab: (tab: string) => void
  tools?: ReactNode
  titleId?: string
  /** After a delete from the panel: it closes. */
  onDeleted?: () => void
  /** From the lead's own page a delete goes back to the list. */
  back?: boolean
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const records = useRecords()
  const toast = useToast()
  const changed = useLeadChanged()
  const pipelines = usePipelines()
  const settings = useLeadSettings()
  const ai = useAiBrief(lead)
  const activities = useLeadActivities(lead.id)
  const files = useLeadFiles(lead.id)
  const chats = useLeadChats(lead.id)
  const [now] = useState(() => new Date())
  const [closing, setClosing] = useState<'won' | 'lost' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [mailing, setMailing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [proposing, setProposing] = useState(false)
  const [seed, setSeed] = useState<ComposerSeed | null>(null)

  const stages = sortedStages(lead.pipeline?.stages?.length ? lead.pipeline.stages : defaultPipeline(pipelines.data)?.stages)
  const stage = resolveStage(lead, stages)
  const kind = kindOf(lead, stages)
  const name = leadName(lead, t('crm.common.no_name', 'No name'))
  const can = headerActions(kind, boot.staff.can.delete_records, lead.guest_id)
  const tone = priorityTone(lead.priority, settings.priorities)

  const move = useMutation({
    mutationFn: (status: string) => send('put', `inquiries/${lead.id}`, { status }),
    onSuccess: (_r, status) => { changed(); toast(t('crm.leads.moved', 'Moved to {{stage}}', { stage: status })) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const pickStage = (target: Stage) => {
    const action = moveTo(lead, target, stages)
    if (action.kind === 'won' || action.kind === 'lost') setClosing(action.kind)
    else if (action.kind === 'stage') move.mutate(action.status)
  }

  const tabs = leadTabs({
    won: kind === 'won',
    chats: chats.data?.conversations?.length ?? 0,
    activities: activities.data?.meta.total,
    openTasks: lead.open_tasks?.length,
    files: files.data?.length,
  })
  const tabLabel = (key: LeadTab): string => {
    switch (key) {
      case 'overview': return t('crm.record.overview', 'Overview')
      case 'deal': return t('crm.leads.tab_deal', 'Deal')
      case 'activity': return t('crm.leads.tab_activity', 'Activity')
      case 'tasks': return t('crm.leads.tasks', 'Tasks')
      case 'emails': return t('crm.leads.emails', 'Emails')
      case 'files': return t('crm.leads.files', 'Files')
      default: return t('crm.leads.tab_chat', 'Chat')
    }
  }
  const frameTabs: RecordTab[] = tabs.map(({ key, count }) => ({ key, count, label: tabLabel(key), icon: TAB_ICON[key] }))
  const shown = tabShown(tab, tabs) as LeadTab

  const stageItems: MenuItem[] = stages.map(s => ({
    key: `s${s.id}`, label: s.name, checked: stage?.id === s.id, icon: s.kind === 'won' ? Trophy : s.kind === 'lost' ? XCircle : undefined,
    disabled: move.isPending, onSelect: () => { if (stage?.id !== s.id) pickStage(s) },
  }))
  const more: (MenuItem | 'divider')[] = [
    { key: 'edit', label: t('crm.leads.edit', 'Edit the lead'), icon: Pencil, onSelect: () => setEditing(true) },
    { key: 'task', label: t('crm.leads.task_add_short', 'Add a task'), icon: ListPlus, onSelect: () => setAddingTask(true) },
    ...(can.contact ? [{ key: 'contact', label: t('crm.leads.open_contact', 'Open the contact'), icon: UserRound, onSelect: () => records.open('contact', lead.guest_id as number) }] : []),
    ...(can.remove ? ['divider' as const, { key: 'delete', label: t('crm.leads.delete', 'Delete the lead'), icon: Trash2, danger: true, onSelect: () => setDeleting(true) }] : []),
  ]
  const subtitle = [lead.guest?.company, sourceLabel(t, lead.source), t('crm.leads.came_in', 'came in {{when}}', { when: timeAgo(lead.created_at, lang) })].filter(Boolean).join(' · ')
  const aiPill = 'crm-ai-soft inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-a-accent'

  return (
    <>
      <RecordFrame idPrefix="lead-record" titleId={titleId} title={name} tools={tools} tabs={frameTabs} tab={shown} onTab={onTab}
        avatar={<Avatar name={name} size="lg" tone={kind === 'won' ? 'accent' : 'neutral'} />}
        badges={(
          <span className="flex flex-wrap items-center gap-1.5">
            <StagePill stage={stage} fallback={lead.status} />
            {lead.priority && tone && <Pill tone={tone}>{lead.priority}</Pill>}
            <FreshChip lead={lead} closed={kind !== 'open'} now={now} />
          </span>
        )}
        subtitle={subtitle}
        actions={(
          <>
            {stages.length > 0 && (
              <ActionMenu label={t('crm.leads.change_stage', 'Change the stage')} items={stageItems} align="left"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-a-border bg-a-surface px-3 text-sm font-medium text-a-text hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent"
                button={<><ArrowRightLeft size={14} aria-hidden />{t('crm.pipeline.move_to', 'Move to')}<ChevronDown size={13} aria-hidden className="text-a-text-2" /></>} />
            )}
            {can.won && <Button size="sm" className="min-h-9" onClick={() => setClosing('won')}><Trophy size={14} aria-hidden />{t('crm.leads.won', 'Won')}</Button>}
            {can.lost && <Button size="sm" variant="secondary" className="min-h-9" onClick={() => setClosing('lost')}><XCircle size={14} aria-hidden />{t('crm.leads.lost', 'Lost')}</Button>}
            <Button size="sm" variant="secondary" className="min-h-9" onClick={() => setMailing(true)} title={t('crm.leads.send_email', 'Send an email')}>
              <Send size={14} aria-hidden />{t('crm.leads.send_email_short', 'Send email')}
            </Button>
            <ContactLinks guest={lead.guest} name={name} />
            <span className="flex items-center gap-1.5">
              <button type="button" className={aiPill} disabled={ai.pending} title={t('crm.leads.ai_line', 'Where the lead stands, read by the AI')}
                onClick={() => { ai.run(); onTab('overview') }}>
                <Sparkles size={14} aria-hidden className={ai.pending ? 'animate-pulse' : ''} />{t('crm.leads.ai_title', 'AI brief')}
              </button>
              <button type="button" className={aiPill} onClick={() => setProposing(true)} title={t('crm.leads.ai_proposal', 'Draft a proposal')}>
                <Wand2 size={14} aria-hidden />{t('crm.leads.ai_proposal_short', 'Proposal')}
              </button>
            </span>
            <ActionMenu label={t('crm.leads.more_actions', 'More for this lead')} items={more} />
          </>
        )}>
        {shown === 'overview' && (
          <OverviewTab lead={lead} stages={stages} onPick={pickStage} busy={move.isPending} ai={ai}
            onProposal={() => setProposing(true)} onEdit={() => setEditing(true)} onDeal={() => onTab('deal')} />
        )}
        {shown === 'deal' && <DealTab lead={lead} />}
        {shown === 'activity' && <LeadTimeline lead={lead} seed={seed} />}
        {shown === 'tasks' && <LeadTasks lead={lead} name={name} onAdd={() => setAddingTask(true)} />}
        {shown === 'emails' && <RecordEmails resource="inquiries" id={lead.id} />}
        {shown === 'files' && <FilesTab leadId={lead.id} />}
        {shown === 'chat' && <ChatTab leadId={lead.id} />}
      </RecordFrame>

      {closing === 'won' && <WonDialog leadId={lead.id} name={name} onClose={() => setClosing(null)} onDone={() => onTab('deal')} />}
      {closing === 'lost' && <LostDialog leadId={lead.id} name={name} onClose={() => setClosing(null)} />}
      {deleting && <DeleteLead leadId={lead.id} name={name} back={back} onDeleted={onDeleted} onClose={() => setDeleting(false)} />}
      {mailing && <SendTemplate lead={lead} name={name} onClose={() => setMailing(false)} />}
      {editing && <LeadEditPanel lead={lead} onClose={() => setEditing(false)} />}
      {addingTask && <TaskForm task={null} inquiryId={lead.id} leadName={name} onClose={() => setAddingTask(false)} />}
      {proposing && (
        <ProposalDialog leadId={lead.id} onClose={() => setProposing(false)}
          onUse={draft => { setSeed({ ...draft, n: Date.now() }); setProposing(false); onTab('activity'); toast(t('crm.leads.proposal_placed_tab', 'The draft is in the Activity box')) }} />
      )}
    </>
  )
}
