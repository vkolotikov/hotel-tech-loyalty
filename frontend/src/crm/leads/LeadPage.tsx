import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CalendarClock, CheckSquare, Coins, Plus, Trash2, Trophy, XCircle } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, money, timeAgo } from '../lib/format'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { splitBuckets, type Task } from '../tasks/taskLogic'
import { TaskForm } from '../tasks/TaskForm'
import { TaskList } from '../tasks/TaskList'
import { useLeadChanged, useLeadFields, useLeadSettings, usePipelines } from './leadData'
import {
  activeFields, amount, CLEAR_NEXT_STEP, defaultPipeline, detailsDraft, detailsPatch, followUp, hasStay, impactOf, kindOf,
  moveTo, nextStepBody, ownerOptions, resolveStage, sortedStages, sourceOptions, stageColor, validateNextStep,
  type DetailsDraft, type NextStepDraft,
} from './leadLogic'
import { LostDialog, WonDialog } from './LeadClose'
import { AiCard, AttachmentsCard, ChatCard, ContactCard, CustomFieldsCard, StayCard } from './LeadSide'
import { LeadTimeline, type ComposerSeed } from './LeadTimeline'
import type { DeleteImpact, LeadDetail, MetaList, Stage } from './leadTypes'
import { impactLabel, problemText, sourceLabel } from './leadWords'

/**
 * One lead (2026-11-07): who it is and how to reach them, its stage (won and lost through their own flows), value,
 * priority, owner, the next step, the timeline, its tasks, files, the website chat it came from, the AI's brief and a
 * proposal draft, the organisation's own fields, and delete with what goes with it. Everything is the full admin's
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
  const line = [lead.guest?.company, sourceLabel(t, lead.source), t('crm.leads.came_in', 'came in {{when}}', { when: timeAgo(lead.created_at, lang) })].filter(Boolean).join(' · ')

  return (
    <Page title={name} line={line}
      below={<Link to="/crm/leads" className="inline-flex items-center gap-1 text-sm font-medium text-a-accent-text hover:underline"><ArrowLeft size={14} aria-hidden />{t('crm.leads.all', 'All leads')}</Link>}
      actions={(
        <>
          <label className="flex items-center gap-2">
            <span className="text-sm text-a-text-2">{t('crm.leads.field_stage', 'Stage')}</span>
            <Select className="w-auto min-w-40" value={stage ? String(stage.id) : ''} disabled={move.isPending || stages.length === 0}
              onChange={e => { const target = stages.find(s => String(s.id) === e.target.value); if (target) pickStage(target) }}>
              {!stage && <option value="">{lead.status}</option>}
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </label>
          {kind !== 'won' && <Button variant="secondary" onClick={() => setClosing('won')}><Trophy size={15} aria-hidden />{t('crm.leads.won', 'Won')}</Button>}
          {kind !== 'lost' && <Button variant="secondary" onClick={() => setClosing('lost')}><XCircle size={15} aria-hidden />{t('crm.leads.lost', 'Lost')}</Button>}
          {boot.staff.can.delete_records && (
            <Button variant="ghost" onClick={() => setDeleting(true)} aria-label={t('crm.leads.delete', 'Delete the lead')}><Trash2 size={15} aria-hidden /></Button>
          )}
        </>
      )}>
      {kind === 'won' && (
        <Notice tone="success">
          {t('crm.leads.is_won', 'Won. This lead is a deal now.')}{' '}
          <Link to="/crm/pipeline?tab=won" className="font-medium underline">{t('crm.leads.see_deals', 'See won deals')}</Link>
        </Notice>
      )}
      {kind === 'lost' && (
        <Notice tone="warning">{lead.lost_reason ? t('crm.leads.is_lost_because', 'Lost: {{reason}}', { reason: lead.lost_reason.label }) : t('crm.leads.is_lost', 'Lost.')}</Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <DetailsCard lead={lead} stage={stage} />
          <NextStepCard lead={lead} />
          <LeadTimeline lead={lead} seed={seed} />
        </div>
        <div className="min-w-0 space-y-5">
          <ContactCard lead={lead} />
          <AiCard lead={lead} onUseDraft={draft => { setSeed({ ...draft, n: Date.now() }); toast(t('crm.leads.proposal_placed', 'The draft is in the timeline box')) }} />
          <LeadTasks lead={lead} name={name} />
          {hasStay(lead) && <StayCard lead={lead} />}
          {fields.length > 0 && <CustomFieldsCard lead={lead} fields={fields} />}
          <AttachmentsCard leadId={lead.id} />
          <ChatCard leadId={lead.id} />
        </div>
      </div>

      {closing === 'won' && <WonDialog leadId={lead.id} name={name} onClose={() => setClosing(null)} />}
      {closing === 'lost' && <LostDialog leadId={lead.id} name={name} onClose={() => setClosing(null)} />}
      {deleting && <DeleteLead lead={lead} name={name} onClose={() => setDeleting(false)} />}
    </Page>
  )
}

/** Value, priority, owner, where it came from and notes; changed in one form (`PUT inquiries/{id}`). */
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
  const dot = stageColor(stage?.color)
  const submit = () => {
    if (!draft) return
    const patch = detailsPatch(lead, draft)
    setProblem(Boolean(patch.problem))
    if (patch.problem) return
    if (!patch.body) { setDraft(null); return }
    save.mutate(patch.body)
  }
  const set = (p: Partial<DetailsDraft>) => setDraft(d => (d ? { ...d, ...p } : d))

  return (
    <Card title={t('crm.leads.details', 'The lead')} icon={Coins}
      action={!draft ? <Button variant="ghost" size="sm" onClick={() => { setDraft(detailsDraft(lead)); setProblem(false) }}>{t('crm.common.edit', 'Edit')}</Button> : undefined}>
      {draft ? (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); submit() }}>
          <div className="grid gap-3 sm:grid-cols-2">
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
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <div><dt className="text-xs text-a-text-2">{t('crm.leads.field_stage', 'Stage')}</dt>
              <dd className="mt-0.5"><Pill>{dot && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}{stage?.name ?? lead.status}</Pill></dd></div>
            <div><dt className="text-xs text-a-text-2">{t('crm.leads.value', 'Value')}</dt><dd className="mt-0.5 text-sm font-medium text-a-text">{value === null ? '—' : money(value, boot.venue.currency, i18n.language)}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('crm.leads.field_priority', 'Priority')}</dt><dd className="mt-0.5 text-sm text-a-text">{lead.priority || '—'}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('crm.leads.field_owner', 'Owner')}</dt><dd className="mt-0.5 truncate text-sm text-a-text">{lead.assigned_to || t('crm.leads.owner_none', 'Nobody yet')}</dd></div>
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

  return (
    <Card title={t('crm.leads.next_step', 'Next step')} icon={CalendarClock}
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
            <p className="text-sm font-medium text-a-text">{next.type ?? t('crm.leads.next_untitled', 'Follow up')}</p>
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
    <Card title={t('crm.leads.tasks', 'Tasks')} icon={CheckSquare} padded={false}
      action={<Button variant="ghost" size="sm" onClick={() => setAdding(true)}><Plus size={14} aria-hidden />{t('crm.leads.task_add', 'Add')}</Button>}>
      <QueryState loading={tasks.isLoading} error={tasks.error} onRetry={() => { void tasks.refetch() }} rows={2}>
        {open.length === 0 && done.length === 0 && <p className="px-4 py-4 text-sm text-a-text-2">{t('crm.leads.tasks_empty', 'No tasks for this lead.')}</p>}
        {open.length > 0 && <TaskList tasks={open} showLead={false} leadName={name} />}
        {done.length > 0 && (
          <div className="border-t border-a-border">
            <button type="button" aria-expanded={showDone} onClick={() => setShowDone(s => !s)} className="w-full px-4 py-2.5 text-left text-sm font-medium text-a-accent-text hover:underline">
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

/** Delete a lead after saying what goes with it (`GET inquiries/{id}/delete-impact`, then `DELETE inquiries/{id}`). */
function DeleteLead({ lead, name, onClose }: { lead: LeadDetail; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const changed = useLeadChanged()
  const impact = useQuery({
    queryKey: ['crm', 'leads', 'delete-impact', lead.id],
    queryFn: () => get<DeleteImpact>(`inquiries/${lead.id}/delete-impact`),
    staleTime: 0,
  })
  const remove = useMutation({
    mutationFn: () => send('delete', `inquiries/${lead.id}`),
    onSuccess: () => { changed(); toast(t('crm.leads.deleted', 'Lead deleted')); onClose(); navigate('/crm/leads') },
  })
  const goes = impactOf(impact.data).filter(row => row.key !== 'reservations')
  const kept = impactOf(impact.data).find(row => row.key === 'reservations')
  return (
    <Confirm title={t('crm.leads.delete_title', 'Delete the lead for {{name}}?', { name })} confirm={t('crm.common.delete', 'Delete')}
      busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('crm.leads.delete_line', 'This cannot be undone. The contact stays.')}</p>
      {impact.isLoading && <p className="mt-2">{t('crm.common.loading', 'Loading…')}</p>}
      {goes.length > 0 && (
        <>
          <p className="mt-3 font-medium text-a-text">{t('crm.leads.delete_goes', 'Goes with it:')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {goes.map(row => <li key={row.key}>{impactLabel(t, row.key, row.count)}</li>)}
          </ul>
        </>
      )}
      {kept && <p className="mt-3">{impactLabel(t, kept.key, kept.count)}</p>}
      {remove.isError && <div className="mt-3"><Notice tone="danger">{errorText(t, remove.error)}</Notice></div>}
    </Confirm>
  )
}
