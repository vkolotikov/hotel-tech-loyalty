import { useEffect, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowRightLeft, BriefcaseBusiness, CheckSquare, ChevronDown, Globe2, History, LayoutDashboard, ListPlus, Mail, MessageCircle, MessagesSquare, Paperclip,
  MessageSquare, Pencil, Phone, Send, Sparkles, Trash2, Trophy, UserRound, Wand2, XCircle, type LucideIcon,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { BusinessProfilePanel } from '../business/BusinessProfilePanel'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { RecordEmails } from '../mail/RecordEmails'
import { useAssistant, type Mode } from '../sales/assistantData'
import { LeadAssistantPanel } from '../sales/LeadAssistantPanel'
import { Avatar } from '../ui/Avatar'
import { ActionMenu, type MenuItem } from '../ui/Menu'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { RecordFrame, RecordPanel, type RecordHostProps, type RecordTab } from '../ui/RecordPanel'
import { useToast } from '../ui/Toast'
import { WhatsAppHistory } from '../whatsapp/WhatsAppHistory'
import { TaskForm } from '../tasks/TaskForm'
import { DealTab } from './LeadDeal'
import { LostDialog, WonDialog } from './LeadClose'
import { LeadEditPanel } from './LeadFacts'
import { useLeadChanged, useLeadSettings, usePipelines } from './leadData'
import { DeleteLead } from './LeadDelete'
import { defaultPipeline, kindOf, moveTo, resolveStage, sortedStages } from './leadLogic'
import { OverviewTab } from './LeadOverview'
import { ChatTab, FilesTab } from './LeadSide'
import { LeadTasks } from './LeadTasks'
import { LeadTimeline, type ComposerSeed } from './LeadTimeline'
import { contactLinks, priorityTone } from './listLogic'
import { FreshChip, ReplyBadges, StagePill } from './parts'
import { fullPagePath, headerActions, leadSections, leadTabs, tabShown, type LeadSection, type LeadTab } from './recordLogic'
import { useLeadActivities, useLeadChats, useLeadDetail, useLeadFiles } from './recordData'
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
  overview: LayoutDashboard, deal: BriefcaseBusiness, assistant: Sparkles, business: Globe2, activity: History, tasks: CheckSquare,
  emails: Mail, whatsapp: MessageCircle, files: Paperclip, chat: MessagesSquare,
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
  const assistant = useAssistant(lead.id)
  const briefSignalId = assistant.data?.results.brief?.signals ? assistant.data.results.brief.id : null
  useEffect(() => {
    if (briefSignalId) changed()
  }, [briefSignalId, changed])
  const activities = useLeadActivities(lead.id)
  const files = useLeadFiles(lead.id)
  const chats = useLeadChats(lead.id)
  const [now] = useState(() => new Date())
  const [closing, setClosing] = useState<'won' | 'lost' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [mailing, setMailing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [assistantMode, setAssistantMode] = useState<Mode>('brief')
  const [seed, setSeed] = useState<ComposerSeed | null>(null)
  const openAssistant = (mode: Mode) => { setAssistantMode(mode); onTab('assistant') }

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
    business: !!lead.guest_id,
    whatsapp: !!lead.guest_id && !!boot.features.whatsapp_brand_id && lead.brand_id === boot.features.whatsapp_brand_id,
  })
  const tabLabel = (key: LeadTab): string => {
    switch (key) {
      case 'overview': return t('crm.leads.nav_summary')
      case 'deal': return t('crm.leads.tab_deal', 'Deal')
      case 'assistant': return t('crm.sales.title')
      case 'business': return t('crm.leads.nav_research')
      case 'activity': return t('crm.leads.tab_activity', 'Activity')
      case 'tasks': return t('crm.leads.tasks', 'Tasks')
      case 'emails': return t('crm.leads.emails', 'Emails')
      case 'whatsapp': return t('crm.whatsapp.title')
      case 'files': return t('crm.leads.files', 'Files')
      default: return t('crm.leads.tab_chat', 'Chat')
    }
  }
  const shown = tabShown(tab, tabs) as LeadTab
  const groups = leadSections(tabs)
  const group = groups.find(section => section.tabs.some(item => item.key === shown)) ?? groups[0]
  const sections: Record<LeadSection, Pick<RecordTab, 'label' | 'icon'>> = {
    overview: { label: t('crm.record.overview', 'Overview'), icon: LayoutDashboard },
    messages: { label: t('crm.leads.nav_messages'), icon: MessagesSquare },
    tasks: { label: tabLabel('tasks'), icon: CheckSquare },
    files: { label: tabLabel('files'), icon: Paperclip },
    ai: { label: t('crm.leads.nav_ai'), icon: Sparkles },
  }
  const frameTabs = groups.map(({ key, tabs: leaves }) => ({
    key, ...sections[key], count: key === 'tasks' || key === 'files' ? leaves[0].count : undefined,
  }))
  const sectionTabs = group.tabs.map(({ key, count }) => ({ key, count, label: tabLabel(key), icon: TAB_ICON[key] }))
  const changeGroup = (key: string) => {
    const next = groups.find(section => section.key === key)
    if (next && next.key !== group.key) onTab(next.tabs[0].key)
  }

  const links = contactLinks(lead.guest)
  const channels: MenuItem[] = [
    ...(links.email ? [{ key: 'mail', label: t('crm.leads.nav_mail_app'), icon: Mail, href: links.email }] : []),
    ...(links.call ? [{ key: 'call', label: t('crm.leads.call_to', { name }), icon: Phone, href: links.call }] : []),
    ...(links.whatsapp ? [{ key: 'whatsapp', label: t('crm.whatsapp.title'), icon: MessageCircle, href: links.whatsapp, external: true }] : []),
    ...(links.sms ? [{ key: 'text', label: t('crm.leads.sms_to', { name }), icon: MessageSquare, href: links.sms }] : []),
  ]
  const openStages: MenuItem[] = stages.filter(s => s.kind === 'open').map(s => ({
    key: `s${s.id}`, label: s.name, checked: stage?.id === s.id, disabled: move.isPending, onSelect: () => pickStage(s),
  }))
  const stageItems: (MenuItem | 'divider')[] = [
    ...openStages, ...(openStages.length ? ['divider' as const] : []),
    ...(can.won ? [{ key: 'won', label: t('crm.leads.nav_won'), icon: Trophy, disabled: move.isPending, onSelect: () => setClosing('won') }] : []),
    ...(can.lost ? [{ key: 'lost', label: t('crm.leads.nav_lost'), icon: XCircle, disabled: move.isPending, onSelect: () => setClosing('lost') }] : []),
  ]
  const more: (MenuItem | 'divider')[] = [
    { key: 'edit', label: t('crm.leads.edit', 'Edit the lead'), icon: Pencil, onSelect: () => setEditing(true) },
    { key: 'task', label: t('crm.leads.task_add_short', 'Add a task'), icon: ListPlus, onSelect: () => setAddingTask(true) },
    ...(can.contact ? [{ key: 'contact', label: t('crm.leads.open_contact', 'Open the contact'), icon: UserRound, onSelect: () => records.open('contact', lead.guest_id as number) }] : []),
    'divider',
    { key: 'brief', label: t('crm.sales.modes.brief'), icon: Sparkles, onSelect: () => openAssistant('brief') },
    { key: 'proposal', label: t('crm.leads.ai_proposal', 'Draft a proposal'), icon: Wand2, onSelect: () => openAssistant('proposal') },
    ...(can.remove ? ['divider' as const, { key: 'delete', label: t('crm.leads.delete', 'Delete the lead'), icon: Trash2, danger: true, onSelect: () => setDeleting(true) }] : []),
  ]
  const subtitle = [lead.guest?.company, sourceLabel(t, lead.source), t('crm.leads.came_in', 'came in {{when}}', { when: timeAgo(lead.created_at, lang) })].filter(Boolean).join(' · ')
  const actionStyle = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-a-accent'

  return (
    <>
      <RecordFrame idPrefix="lead-record" titleId={titleId} title={name} tools={tools} grouped tabs={frameTabs} tab={group.key} onTab={changeGroup}
        secondary={{ label: sections[group.key].label, tabs: sectionTabs, tab: shown, onTab }}
        avatar={<Avatar name={name} size="lg" tone={kind === 'won' ? 'accent' : 'neutral'} />}
        badges={(
          <span className="flex flex-wrap items-center gap-1.5">
            <StagePill stage={stage} fallback={lead.status} />
            {lead.priority && tone && <Pill tone={tone}>{lead.priority}</Pill>}
            <FreshChip lead={lead} closed={kind !== 'open'} now={now} />
            <ReplyBadges status={lead.reply_status} onOpen={onTab} />
          </span>
        )}
        subtitle={subtitle}
        actions={(
          <>
            <div className="inline-flex items-stretch rounded-full bg-a-accent text-a-accent-ink shadow-a-sm">
              <button type="button" onClick={() => setMailing(true)}
                className={`${actionStyle} hover:bg-a-accent-deep ${channels.length ? 'rounded-r-none' : ''}`}>
                <Send size={15} aria-hidden />{t('crm.leads.send_email_short', 'Send email')}
              </button>
              {channels.length > 0 && <ActionMenu label={t('crm.leads.nav_channels')} title={t('crm.leads.nav_channels')} items={channels} align="left"
                className="grid min-h-10 w-8 place-items-center rounded-r-full border-l border-current/25 hover:bg-a-accent-deep focus-visible:outline-2 focus-visible:outline-a-accent"
                button={<ChevronDown size={15} aria-hidden />} />}
            </div>
            <ActionMenu label={t('crm.leads.change_stage', 'Change the stage')} items={stageItems} align="left"
              className={`${actionStyle} border border-a-border bg-a-surface text-a-text hover:bg-a-surface-2`}
              button={<><ArrowRightLeft size={15} aria-hidden />{t('crm.leads.nav_stage')}<ChevronDown size={13} aria-hidden className="text-a-text-2" /></>} />
            <ActionMenu label={t('crm.leads.more_actions', 'More for this lead')} title={t('crm.leads.more_actions', 'More for this lead')} items={more}
              className="grid h-10 w-10 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent" />
          </>
        )}>
        {shown === 'overview' && (
          <OverviewTab lead={lead} stages={stages} onPick={pickStage} busy={move.isPending} brief={assistant.data?.results.brief}
            onBrief={() => openAssistant('brief')}
            onEdit={() => setEditing(true)} onDeal={() => onTab('deal')} />
        )}
        {shown === 'deal' && <DealTab lead={lead} />}
        {shown === 'assistant' && (
          <LeadAssistantPanel leadId={lead.id} recipient={lead.guest?.email} mode={assistantMode} onMode={setAssistantMode} query={assistant}
            onEmails={() => onTab('emails')}
            onUse={draft => { setSeed({ ...draft, type: 'email', n: Date.now() }); onTab('activity'); toast(t('crm.leads.proposal_placed_tab', 'The draft is in the Activity box')) }} />
        )}
        {shown === 'business' && <BusinessProfilePanel resource="inquiries" id={lead.id} />}
        {shown === 'activity' && <LeadTimeline lead={lead} seed={seed} />}
        {shown === 'tasks' && <LeadTasks lead={lead} name={name} onAdd={() => setAddingTask(true)} />}
        {shown === 'emails' && (
          <div>
            {/* The shared email history draws nothing without a mailbox for this record: then the tab says so. */}
            <div className="peer"><RecordEmails resource="inquiries" id={lead.id} /></div>
            <div className="hidden flex-col items-center gap-3 py-8 text-center peer-empty:flex">
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-a-surface-2 text-a-text-2"><Mail size={18} /></span>
              <p className="text-sm text-a-text-2">{t('crm.leads.emails_none', 'No emails to show.')}</p>
              <Button size="sm" variant="secondary" onClick={() => setMailing(true)}><Send size={14} aria-hidden />{t('crm.leads.send_email_short', 'Send email')}</Button>
            </div>
          </div>
        )}
        {shown === 'files' && <FilesTab leadId={lead.id} />}
        {shown === 'whatsapp' && <WhatsAppHistory key={lead.id} resource="inquiries" id={lead.id}
          onContactDetails={can.contact ? () => records.open('contact', lead.guest_id as number) : undefined} />}
        {shown === 'chat' && <ChatTab leadId={lead.id} />}
      </RecordFrame>

      {closing === 'won' && <WonDialog leadId={lead.id} name={name} onClose={() => setClosing(null)} onDone={() => onTab('deal')} />}
      {closing === 'lost' && <LostDialog leadId={lead.id} name={name} onClose={() => setClosing(null)} />}
      {deleting && <DeleteLead leadId={lead.id} name={name} back={back} onDeleted={onDeleted} onClose={() => setDeleting(false)} />}
      {mailing && <SendTemplate lead={lead} name={name} onClose={() => setMailing(false)} />}
      {editing && <LeadEditPanel lead={lead} onClose={() => setEditing(false)} />}
      {addingTask && <TaskForm task={null} inquiryId={lead.id} leadName={name} onClose={() => setAddingTask(false)} />}
    </>
  )
}
