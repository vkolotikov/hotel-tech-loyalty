import { useState } from 'react'
import { RecordEmails } from '../mail/RecordEmails'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CalendarClock, CheckSquare, Coins, Mail, Plus, Trash2, Trophy, Wand2, XCircle } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, money, timeAgo } from '../lib/format'
import { Card } from '../ui/Card'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { splitBuckets, type Task } from '../tasks/taskLogic'
import { TaskForm } from '../tasks/TaskForm'
import { TaskList } from '../tasks/TaskList'
import { InlineSelect } from './InlineSelect'
import { LostDialog, WonDialog } from './LeadClose'
import { useLeadChanged, useLeadFields, useLeadSettings, usePipelines } from './leadData'
import { DeleteLead } from './LeadDelete'
import {
  activeFields, amount, CLEAR_NEXT_STEP, defaultPipeline, detailsDraft, detailsPatch, followUp, hasStay, kindOf, moveTo,
  nextStepBody, ownerOptions, resolveStage, sortedStages, sourceOptions, validateNextStep, type DetailsDraft, type NextStepDraft,
} from './leadLogic'
import { LeadOverview } from './LeadOverview'
import { AiCard, AttachmentsCard, ChatCard, ContactCard, CustomFieldsCard, StayCard } from './LeadSide'
import { LeadTimeline, type ComposerSeed } from './LeadTimeline'
import { ActionMenu } from '../ui/Menu'
import { StagePill } from './parts'
import { SendTemplate } from './SendTemplate'
import type { LeadDetail, MetaList, Stage } from './leadTypes'
import { problemText, sourceLabel } from './leadWords'
import { nextStepWord } from '../tasks/taskWords'

/** The page's sections, for the phone's "jump to" pills (a button that scrolls; no `#` link in the workspace). */
const SECTIONS = ['next', 'timeline', 'tasks', 'contact', 'details', 'files'] as const
type SectionKey = (typeof SECTIONS)[number]

/**
 * One lead (round 2, structured as the main platform's lead page): its overview first — the stage bar, the figures,
 * what the AI made of it — then, on a wide screen, the work in the main column (the next step, the timeline, the tasks)
 * and the facts beside it (the contact, the AI's brief and a proposal, the details, a hotel's stay, the organisation's
 * own fields, files, the website chat). On a phone the two stack, with pills that jump to each section. Sending an
 * email template, won and lost, and delete with what goes with it are in the header. Everything is the full admin's
 * (`inquiries/{id}` and its sub-resources); the page polls as the full admin's lead page does.
 */
export function LeadPage() {
  const { id } = useParams<{ id: string }>()
  const leadId = Number(id)
  const { t } = useTranslation()
  const lead = useQuery({
    queryKey: ['crm', 'leads', 'detail', leadId],
    queryFn: () => get<LeadDetail>(`inquiries/${leadId}`),
    enabled: Number.isInteger(leadId) && leadId > 0,
    refetchInterval: 15_000,
  })
  return (
    <QueryState loading={lead.isLoading} error={lead.error ?? (!Number.isInteger(leadId) || leadId <= 0 ? { response: { status: 404 } } : null)} onRetry={() => { void lead.refetch() }}>
      {lead.data ? <LeadBody lead={lead.data} /> : (
        <Page title={t('crm.nav.leads', 'Leads')}><p className="text-sm text-a-text-2">{t('crm.errors.not_found', 'This is no longer here. It may have been deleted.')}</p></Page>
      )}
    </QueryState>
  )
}

function LeadBody({ lead }: { lead: LeadDetail }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const pipelines = usePipelines()
  const settings = useLeadSettings()
  const fieldsQuery = useLeadFields()
  const fields = activeFields(fieldsQuery.data)
  const toast = useToast()
  const changed = useLeadChanged()
  const stages = sortedStages(lead.pipeline?.stages?.length ? lead.pipeline.stages : defaultPipeline(pipelines.data)?.stages)
  const stage = resolveStage(lead, stages)
  const kind = kindOf(lead, stages)
  const name = lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
  const [closing, setClosing] = useState<'won' | 'lost' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [mailing, setMailing] = useState(false)
  const [proposing, setProposing] = useState(0)
  const [seed, setSeed] = useState<ComposerSeed | null>(null)

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
  const jump = (key: SectionKey) => document.getElementById(`lead-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const sectionLabel = (key: SectionKey): string => {
    switch (key) {
      case 'next': return t('crm.leads.next_step', 'Next step')
      case 'timeline': return t('crm.leads.timeline', 'Timeline')
      case 'tasks': return t('crm.leads.tasks', 'Tasks')
      case 'contact': return t('crm.leads.contact', 'Contact')
      case 'details': return t('crm.leads.details', 'The lead')
      default: return t('crm.leads.files', 'Files')
    }
  }
  const line = [lead.guest?.company, sourceLabel(t, lead.source), t('crm.leads.came_in', 'came in {{when}}', { when: timeAgo(lead.created_at, lang) })].filter(Boolean).join(' · ')

  return (
    <Page wide title={name} line={line}
      below={(
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/crm/leads" className="inline-flex items-center gap-1 text-sm font-medium text-a-accent-text hover:underline"><ArrowLeft size={14} aria-hidden />{t('crm.leads.all', 'All leads')}</Link>
        </div>
      )}
      actions={(
        <>
          <label className="flex items-center gap-2">
            <span className="text-sm text-a-text-2">{t('crm.leads.field_stage', 'Stage')}</span>
            <InlineSelect className="min-w-40" value={stage ? String(stage.id) : ''} disabled={move.isPending || stages.length === 0}
              onChange={e => { const target = stages.find(s => String(s.id) === e.target.value); if (target) pickStage(target) }}>
              {!stage && <option value="">{lead.status}</option>}
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </InlineSelect>
          </label>
          <Button variant="secondary" onClick={() => setMailing(true)}><Mail size={15} aria-hidden />{t('crm.leads.send_email', 'Send an email')}</Button>
          {kind !== 'won' && <Button onClick={() => setClosing('won')}><Trophy size={15} aria-hidden />{t('crm.leads.won', 'Won')}</Button>}
          {kind !== 'lost' && <Button variant="secondary" onClick={() => setClosing('lost')}><XCircle size={15} aria-hidden />{t('crm.leads.lost', 'Lost')}</Button>}
          <ActionMenu label={t('crm.leads.more_actions', 'More for this lead')} items={[
            { key: 'proposal', label: t('crm.leads.ai_proposal', 'Draft a proposal'), icon: Wand2, onSelect: () => setProposing(n => n + 1) },
            ...(boot.staff.can.delete_records ? ['divider' as const, { key: 'delete', label: t('crm.leads.delete', 'Delete the lead'), icon: Trash2, danger: true, onSelect: () => setDeleting(true) }] : []),
          ]} />
        </>
      )}>
      {kind === 'won' && (
        <Notice tone="success">
          {t('crm.leads.is_won', 'Won. This lead is a deal now.')}{' '}
          <Link to="/crm/deals" className="font-medium underline">{t('crm.leads.see_deals', 'See won deals')}</Link>
        </Notice>
      )}
      {kind === 'lost' && (
        <Notice tone="warning">{lead.lost_reason ? t('crm.leads.is_lost_because', 'Lost: {{reason}}', { reason: lead.lost_reason.label }) : t('crm.leads.is_lost', 'Lost.')}</Notice>
      )}

      <LeadOverview lead={lead} stages={stages} priorities={settings.priorities} onPick={pickStage} busy={move.isPending} />

      <nav aria-label={t('crm.leads.on_page', 'On this page')} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
        {SECTIONS.map(key => (
          <button key={key} type="button" onClick={() => jump(key)} className="min-h-9 shrink-0 rounded-full border border-a-border bg-a-surface px-3 text-xs font-medium text-a-text-2 hover:text-a-text">
            {sectionLabel(key)}
          </button>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <div id="lead-next" className="scroll-mt-4"><NextStepCard lead={lead} /></div>
          <div id="lead-timeline" className="scroll-mt-4"><LeadTimeline lead={lead} seed={seed} /></div>
          <RecordEmails resource="inquiries" id={lead.id} />
          <div id="lead-tasks" className="scroll-mt-4"><LeadTasks lead={lead} name={name} /></div>
        </div>
        <div className="min-w-0 space-y-5">
          <div id="lead-contact" className="scroll-mt-4"><ContactCard lead={lead} /></div>
          <AiCard key={proposing} lead={lead} openProposal={proposing > 0} onUseDraft={draft => { setSeed({ ...draft, n: Date.now() }); toast(t('crm.leads.proposal_placed', 'The draft is in the timeline box')); jump('timeline') }} />
          <div id="lead-details" className="scroll-mt-4"><DetailsCard lead={lead} stage={stage} /></div>
          {hasStay(lead) && <StayCard lead={lead} />}
          {fields.length > 0 && <CustomFieldsCard lead={lead} fields={fields} />}
          <div id="lead-files" className="scroll-mt-4"><AttachmentsCard leadId={lead.id} /></div>
          <ChatCard leadId={lead.id} />
        </div>
      </div>

      {closing === 'won' && <WonDialog leadId={lead.id} name={name} onClose={() => setClosing(null)} />}
      {closing === 'lost' && <LostDialog leadId={lead.id} name={name} onClose={() => setClosing(null)} />}
      {deleting && <DeleteLead leadId={lead.id} name={name} back onClose={() => setDeleting(false)} />}
      {mailing && <SendTemplate lead={lead} name={name} onClose={() => setMailing(false)} />}
    </Page>
  )
}

/** Value, priority, owner, where it came from, the type and notes; changed in one form (`PUT inquiries/{id}`). */
function DetailsCard({ lead, stage }: { lead: LeadDetail; stage: Stage | null }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const settings = useLeadSettings()
  const team = useTeam()
  const [draft, setDraft] = useState<DetailsDraft | null>(null)
  const [problem, setProblem] = useState(false)
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => send('put', `inquiries/${lead.id}`, body),
    onSuccess: () => { changed(); setDraft(null); toast(t('crm.common.saved', 'Saved')) },
  })
  const value = amount(lead.total_value)
  const submit = () => {
    if (!draft) return
    const patch = detailsPatch(lead, draft)
    setProblem(Boolean(patch.problem))
    if (patch.problem) return
    if (!patch.body) { setDraft(null); return }
    save.mutate(patch.body)
  }
  const set = (p: Partial<DetailsDraft>) => setDraft(d => (d ? { ...d, ...p } : d))
  const types = [...new Set([...settings.types, ...(lead.inquiry_type ? [lead.inquiry_type] : [])])]

  return (
    <Card title={t('crm.leads.details', 'The lead')} description={t('crm.leads.details_line', 'Value, priority, owner and notes')} icon={Coins} tone="success"
      action={!draft ? <Button variant="ghost" size="sm" onClick={() => { setDraft(detailsDraft(lead)); setProblem(false) }}>{t('crm.common.edit', 'Edit')}</Button> : undefined}>
      {draft ? (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); submit() }}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label={t('crm.leads.field_value', 'Value ({{currency}}, optional)', { currency: boot.venue.currency })}>
              <TextInput type="number" inputMode="decimal" min={0} step="0.01" value={draft.value} onChange={e => set({ value: e.target.value })} aria-invalid={problem ? true : undefined} />
              {problem && <span className="mt-1 block text-xs text-a-danger">{problemText(t, 'number')}</span>}
            </Field>
            <Field label={t('crm.leads.field_priority', 'Priority')}>
              <Select value={draft.priority} onChange={e => set({ priority: e.target.value })}>
                <option value="">{t('crm.leads.priority_none', 'Not set')}</option>
                {[...new Set([...settings.priorities, ...(lead.priority ? [lead.priority] : [])])].map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label={t('crm.leads.field_owner', 'Owner')}>
              <Select value={draft.owner} onChange={e => set({ owner: e.target.value })}>
                <option value="">{t('crm.leads.owner_none', 'Nobody yet')}</option>
                {ownerOptions(boot.staff.name, settings.owners, team.data ?? [], lead.assigned_to).map(o => (
                  <option key={o} value={o}>{o === boot.staff.name ? t('crm.leads.owner_me', 'Me ({{name}})', { name: o }) : o}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('crm.leads.field_source', 'Where it came from')}>
              <Select value={draft.source} onChange={e => set({ source: e.target.value })}>
                <option value="">{sourceLabel(t, '')}</option>
                {sourceOptions(settings.sources, lead.source).map(s => <option key={s} value={s}>{sourceLabel(t, s)}</option>)}
              </Select>
            </Field>
            {types.length > 0 && (
              <Field label={t('crm.leads.field_type', 'Type of enquiry')}>
                <Select value={draft.type} onChange={e => set({ type: e.target.value })}>
                  <option value="">{t('crm.leads.type_none', 'Not set')}</option>
                  {types.map(v => <option key={v} value={v}>{v}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <Field label={t('crm.leads.field_notes', 'Notes (optional)')}>
            <TextArea rows={4} value={draft.notes} onChange={e => set({ notes: e.target.value })} />
          </Field>
          {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" type="button" onClick={() => setDraft(null)} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
            <Button size="sm" type="submit" loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div><dt className="text-xs text-a-text-2">{t('crm.leads.field_stage', 'Stage')}</dt><dd className="mt-0.5"><StagePill stage={stage} fallback={lead.status} /></dd></div>
            <div><dt className="text-xs text-a-text-2">{t('crm.leads.value', 'Value')}</dt><dd className="mt-0.5 text-sm font-medium text-a-text">{value === null ? '—' : money(value, boot.venue.currency, i18n.language)}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('crm.leads.field_priority', 'Priority')}</dt><dd className="mt-0.5 text-sm text-a-text">{lead.priority || '—'}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('crm.leads.field_owner', 'Owner')}</dt><dd className="mt-0.5 truncate text-sm text-a-text">{lead.assigned_to || t('crm.leads.owner_none', 'Nobody yet')}</dd></div>
            {lead.inquiry_type && <div><dt className="text-xs text-a-text-2">{t('crm.leads.field_type', 'Type of enquiry')}</dt><dd className="mt-0.5 truncate text-sm text-a-text">{lead.inquiry_type}</dd></div>}
          </dl>
          {lead.notes ? <p className="whitespace-pre-wrap break-words text-sm text-a-text">{lead.notes}</p> : <p className="text-sm text-a-text-2">{t('crm.leads.no_notes', 'No notes.')}</p>}
        </div>
      )}
    </Card>
  )
}

/** The lead's next step (a day, what to do, a note): done (`complete-task`), changed or cleared (`PUT inquiries/{id}`). */
function NextStepCard({ lead }: { lead: LeadDetail }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const next = followUp(lead, boot.venue.today)
  const [draft, setDraft] = useState<NextStepDraft | null>(null)
  const [tried, setTried] = useState(false)
  const errors = draft ? validateNextStep(draft) : {}
  const write = useMutation({
    mutationFn: (body: Record<string, unknown>) => send('put', `inquiries/${lead.id}`, body),
    onSuccess: () => { changed(); setDraft(null); setTried(false); toast(t('crm.common.saved', 'Saved')) },
  })
  const done = useMutation({
    mutationFn: () => send('post', `inquiries/${lead.id}/complete-task`),
    onSuccess: () => { changed(); toast(t('crm.leads.next_done', 'Next step done')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const open = () => setDraft({ type: lead.next_task_completed ? '' : (lead.next_task_type ?? ''), day: lead.next_task_completed ? '' : (next?.day ?? ''), note: lead.next_task_completed ? '' : (lead.next_task_notes ?? '') })
  const tone = next?.state === 'overdue' ? 'danger' : next?.state === 'today' ? 'pending' : 'accent'

  return (
    <Card title={t('crm.leads.next_step', 'Next step')} description={t('crm.leads.next_line', 'What happens next, so the lead does not go cold')} icon={CalendarClock} tone={tone}
      action={!draft ? <Button variant="ghost" size="sm" onClick={open}>{next ? t('crm.common.edit', 'Edit') : t('crm.leads.next_set', 'Set one')}</Button> : undefined}>
      {draft ? (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); setTried(true); if (Object.keys(errors).length === 0) write.mutate(nextStepBody(draft)) }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('crm.leads.next_what', 'What to do')}>
              <TextInput value={draft.type} maxLength={50} onChange={e => setDraft({ ...draft, type: e.target.value })} placeholder={t('crm.leads.next_what_hint', 'Call back')}
                aria-invalid={tried && errors.type ? true : undefined} />
              {tried && errors.type && <span className="mt-1 block text-xs text-a-danger">{errors.type === 'too_long' ? problemText(t, 'too_long') : problemText(t, 'required')}</span>}
            </Field>
            <Field label={t('crm.leads.next_day', 'Day')}>
              <TextInput type="date" value={draft.day} onChange={e => setDraft({ ...draft, day: e.target.value })} />
            </Field>
          </div>
          <Field label={t('crm.leads.next_note', 'Note (optional)')}>
            <TextArea rows={2} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} />
          </Field>
          {write.isError && <Notice tone="danger">{errorText(t, write.error)}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            {next && <Button variant="ghost" size="sm" type="button" onClick={() => write.mutate({ ...CLEAR_NEXT_STEP })} disabled={write.isPending}>{t('crm.leads.next_clear', 'Remove the step')}</Button>}
            <Button variant="secondary" size="sm" type="button" onClick={() => setDraft(null)} disabled={write.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
            <Button size="sm" type="submit" loading={write.isPending}>{t('crm.common.save', 'Save')}</Button>
          </div>
        </form>
      ) : next ? (
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-a-text">{nextStepWord(t, next.type) ?? t('crm.leads.next_untitled', 'Follow up')}</p>
            {next.note && <p className="mt-0.5 whitespace-pre-wrap text-sm text-a-text-2">{next.note}</p>}
            {next.day && (
              <p className="mt-1.5">
                <Pill tone={next.state === 'overdue' ? 'danger' : next.state === 'today' ? 'pending' : 'neutral'}>
                  {next.state === 'today' ? t('crm.leads.next_today', 'Today') : next.state === 'overdue' ? t('crm.leads.next_overdue', 'Overdue since {{day}}', { day: dayLabel(next.day, i18n.language) }) : dayLabel(next.day, i18n.language)}
                </Pill>
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => done.mutate()} loading={done.isPending}>{t('crm.leads.next_mark_done', 'Done')}</Button>
        </div>
      ) : (
        <p className="text-sm text-a-text-2">{t('crm.leads.next_none', 'No next step. Set one so the lead does not go cold.')}</p>
      )}
    </Card>
  )
}

/** The lead's tasks (`GET tasks?inquiry_id=`): the open ones first, the done ones on request; a new one for this lead. */
function LeadTasks({ lead, name }: { lead: LeadDetail; name: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const query = { inquiry_id: lead.id, status: 'all', per_page: 100 }
  const tasks = useQuery({
    queryKey: ['crm', 'tasks', 'lead', lead.id],
    queryFn: () => get<MetaList<Task>>(`tasks${params(query)}`),
  })
  const all = tasks.data?.data ?? []
  const buckets = splitBuckets(all, boot.venue.today, boot.venue.timezone)
  const open = [...buckets.overdue, ...buckets.today, ...buckets.upcoming]
  const done = all.filter(task => task.completed_at)
  return (
    <Card title={t('crm.leads.tasks', 'Tasks')} description={t('crm.leads.tasks_line', 'Calls, emails and visits planned for this lead')} icon={CheckSquare} tone={buckets.overdue.length > 0 ? 'danger' : 'progress'} padded={false}
      action={<Button variant="ghost" size="sm" onClick={() => setAdding(true)}><Plus size={14} aria-hidden />{t('crm.leads.task_add', 'Add')}</Button>}>
      <QueryState loading={tasks.isLoading} error={tasks.error} onRetry={() => { void tasks.refetch() }} rows={2}>
        {open.length === 0 && done.length === 0 && <p className="px-4 py-4 text-sm text-a-text-2">{t('crm.leads.tasks_empty', 'No tasks for this lead.')}</p>}
        {open.length > 0 && <TaskList tasks={open} showLead={false} leadName={name} />}
        {done.length > 0 && (
          <div className="border-t border-a-border">
            <button type="button" aria-expanded={showDone} onClick={() => setShowDone(s => !s)} className="min-h-11 w-full px-4 py-2.5 text-left text-sm font-medium text-a-accent-text hover:underline">
              {showDone ? t('crm.leads.tasks_hide_done', 'Hide the done ones') : t('crm.leads.tasks_show_done', 'Show {{count}} done', { count: done.length })}
            </button>
            {showDone && <TaskList tasks={done} showLead={false} leadName={name} />}
          </div>
        )}
      </QueryState>
      {adding && <TaskForm task={null} inquiryId={lead.id} leadName={name} onClose={() => setAdding(false)} />}
    </Card>
  )
}
