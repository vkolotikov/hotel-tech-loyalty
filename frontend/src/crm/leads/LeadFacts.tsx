import { useId, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Check, ClipboardList, Coins, Flag, Pencil, UserRound, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { money, timeAgo } from '../lib/format'
import { Card } from '../ui/Card'
import { IconButton } from '../ui/IconButton'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { nextStepWord } from '../tasks/taskWords'
import { InlineField, type InlineOption } from './InlineField'
import { useLeadChanged, useLeadSettings } from './leadData'
import {
  amount, CLEAR_NEXT_STEP, detailsDraft, detailsPatch, followUp, nextStepBody, ownerOptions, sourceOptions, validateNextStep,
  type DetailsDraft, type NextStepDraft,
} from './leadLogic'
import { dueIn, priorityTone } from './listLogic'
import { factPatch, type FactKey } from './recordLogic'
import { useLeadWrite } from './recordData'
import type { LeadDetail } from './leadTypes'
import { dueInLabel, dueInTone, problemText, sourceLabel } from './leadWords'

/** Saves one fact changed in place, or says why it was refused (the value must be a number of zero or more). */
function useFactSave(lead: LeadDetail) {
  const { t } = useTranslation()
  const toast = useToast()
  const write = useLeadWrite(lead.id)
  return {
    busy: write.isPending,
    save: (key: FactKey) => (raw: string) => {
      const patch = factPatch(lead, key, raw)
      if (patch.problem) { toast(problemText(t, 'number') ?? '', 'danger'); return }
      if (patch.body) write.mutate(patch.body)
    },
  }
}

function Fact({ icon: Icon, label, children, wide = false }: { icon: LucideIcon; label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="flex items-center gap-1.5 text-xs text-a-text-2"><Icon size={13} aria-hidden className="shrink-0" />{label}</dt>
      <dd className="mt-0.5 min-w-0">{children}</dd>
    </div>
  )
}

/**
 * The facts that decide the next move (round 5): the value, the owner, the priority and the next step, each changed
 * where it stands (`PUT inquiries/{id}`, one field at a time); the next step is done in one press (`complete-task`).
 */
export function KeyFacts({ lead }: { lead: LeadDetail }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const settings = useLeadSettings()
  const team = useTeam()
  const { save, busy } = useFactSave(lead)
  const [stepEditing, setStepEditing] = useState(false)
  const value = amount(lead.total_value)
  const tone = priorityTone(lead.priority, settings.priorities)
  const me = boot.staff.name
  const owners: InlineOption[] = [
    { value: '', label: t('crm.leads.owner_none', 'Nobody yet') },
    ...ownerOptions(me, settings.owners, team.data ?? [], lead.assigned_to).map(o => ({ value: o, label: o === me ? t('crm.leads.owner_me', 'Me ({{name}})', { name: o }) : o })),
  ]
  const priorities: InlineOption[] = [
    { value: '', label: t('crm.leads.priority_none', 'Not set') },
    ...[...new Set([...settings.priorities, ...(lead.priority ? [lead.priority] : [])])].map(p => ({ value: p, label: p })),
  ]
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Fact icon={Coins} label={t('crm.leads.value', 'Value')}>
          <InlineField label={t('crm.leads.value', 'Value')} kind="number" busy={busy} value={value === null ? '' : String(value)} onSave={save('value')}
            display={value === null ? undefined : <span className="font-a-display text-lg leading-tight">{money(value, boot.venue.currency, lang)}</span>} />
        </Fact>
        <Fact icon={UserRound} label={t('crm.leads.field_owner', 'Owner')}>
          <InlineField label={t('crm.leads.field_owner', 'Owner')} kind="select" busy={busy} value={lead.assigned_to ?? ''} options={owners} onSave={save('owner')}
            display={lead.assigned_to || <span className="font-medium text-a-st-pending">{t('crm.leads.owner_none', 'Nobody yet')}</span>} />
        </Fact>
        <Fact icon={Flag} label={t('crm.leads.field_priority', 'Priority')}>
          <InlineField label={t('crm.leads.field_priority', 'Priority')} kind="select" busy={busy} value={lead.priority ?? ''} options={priorities} onSave={save('priority')}
            display={lead.priority && tone ? <Pill tone={tone}>{lead.priority}</Pill> : undefined} />
        </Fact>
        <Fact icon={CalendarClock} label={t('crm.leads.next_step', 'Next step')}>
          <NextStepValue lead={lead} onEdit={() => setStepEditing(true)} />
        </Fact>
      </dl>
      {stepEditing && <NextStepForm lead={lead} onDone={() => setStepEditing(false)} />}
    </div>
  )
}

/** The next step as it reads in the facts: what, when (late in red), Done; a press on it changes it. */
function NextStepValue({ lead, onEdit }: { lead: LeadDetail; onEdit: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const next = followUp(lead, boot.venue.today)
  const due = next ? dueIn(next.day, boot.venue.today) : null
  const done = useMutation({
    mutationFn: () => send('post', `inquiries/${lead.id}/complete-task`),
    onSuccess: () => { changed(); toast(t('crm.leads.next_done', 'Next step done')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const label = t('crm.leads.next_step', 'Next step')
  return (
    <div className="flex min-w-0 items-start gap-1">
      <InlineButton label={label} onEdit={onEdit}>
        {next ? (
          <span className="block min-w-0">
            <span className="block truncate">{nextStepWord(t, next.type) ?? t('crm.leads.next_untitled', 'Follow up')}</span>
            {due && <Pill tone={dueInTone(due)}>{dueInLabel(t, due, i18n.language)}</Pill>}
          </span>
        ) : <span className="text-a-text-2">{t('crm.leads.next_set', 'Set one')}</span>}
      </InlineButton>
      {next && <IconButton icon={Check} size="sm" tone="accent" label={t('crm.leads.next_mark_done_long', 'Next step done')} onClick={() => done.mutate()} disabled={done.isPending} />}
    </div>
  )
}

/** A fact that opens a form of its own (the next step) instead of one box. */
function InlineButton({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  const change = t('crm.leads.change_named', 'Change: {{label}}', { label })
  return (
    <button type="button" onClick={onEdit} title={change}
      className="group -mx-1.5 flex min-h-8 min-w-0 flex-1 items-start gap-1.5 rounded-lg px-1.5 py-1 text-left text-sm text-a-text transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
      <span className="sr-only">{change}. </span>
      <span className="min-w-0 flex-1">{children}</span>
      <Pencil size={12} aria-hidden className="mt-1 shrink-0 text-a-text-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  )
}

/** The next step's form (a day, what to do, a note), under the facts: saved, cleared or let go. */
function NextStepForm({ lead, onDone }: { lead: LeadDetail; onDone: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const next = followUp(lead, boot.venue.today)
  const [draft, setDraft] = useState<NextStepDraft>(() => ({
    type: lead.next_task_completed ? '' : (lead.next_task_type ?? ''),
    day: lead.next_task_completed ? '' : (next?.day ?? ''),
    note: lead.next_task_completed ? '' : (lead.next_task_notes ?? ''),
  }))
  const [tried, setTried] = useState(false)
  const errors = validateNextStep(draft)
  const write = useMutation({
    mutationFn: (body: Record<string, unknown>) => send('put', `inquiries/${lead.id}`, body),
    onSuccess: () => { changed(); onDone(); toast(t('crm.common.saved', 'Saved')) },
  })
  return (
    <form className="space-y-3 rounded-xl border border-a-border bg-a-surface-2/50 p-3 animate-a-fade"
      onSubmit={e => { e.preventDefault(); setTried(true); if (Object.keys(errors).length === 0) write.mutate(nextStepBody(draft)) }}
      onKeyDown={e => { if (e.key === 'Escape' && !write.isPending) { e.preventDefault(); onDone() } }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('crm.leads.next_what', 'What to do')}>
          <TextInput autoFocus value={draft.type} maxLength={50} onChange={e => setDraft({ ...draft, type: e.target.value })} placeholder={t('crm.leads.next_what_hint', 'Call back')}
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
        <Button variant="secondary" size="sm" type="button" onClick={onDone} disabled={write.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
        <Button size="sm" type="submit" loading={write.isPending}>{t('crm.common.save', 'Save')}</Button>
      </div>
    </form>
  )
}

/**
 * The lead's details: where it came from and its type (changed in place), when it came in, the last touch and its
 * notes (a press writes them). The pencil opens the whole form (`LeadEditPanel`).
 */
export function DetailsCard({ lead, onEdit }: { lead: LeadDetail; onEdit: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const settings = useLeadSettings()
  const { save, busy } = useFactSave(lead)
  const types = [...new Set([...settings.types, ...(lead.inquiry_type ? [lead.inquiry_type] : [])])]
  const sources: InlineOption[] = [{ value: '', label: sourceLabel(t, '') }, ...sourceOptions(settings.sources, lead.source).map(s => ({ value: s, label: sourceLabel(t, s) }))]
  return (
    <Card title={t('crm.leads.details_short', 'Details')} icon={ClipboardList} tone="neutral"
      action={<IconButton icon={Pencil} size="sm" label={t('crm.leads.edit', 'Edit the lead')} onClick={onEdit} />}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="min-w-0">
          <dt className="text-xs text-a-text-2">{t('crm.leads.came_from', 'Came from')}</dt>
          <dd><InlineField label={t('crm.leads.came_from', 'Came from')} kind="select" busy={busy} value={lead.source ?? ''} options={sources} onSave={save('source')} display={sourceLabel(t, lead.source)} /></dd>
        </div>
        {types.length > 0 && (
          <div className="min-w-0">
            <dt className="text-xs text-a-text-2">{t('crm.leads.field_type', 'Type of enquiry')}</dt>
            <dd><InlineField label={t('crm.leads.field_type', 'Type of enquiry')} kind="select" busy={busy} value={lead.inquiry_type ?? ''} onSave={save('type')}
              options={[{ value: '', label: t('crm.leads.type_none', 'Not set') }, ...types.map(v => ({ value: v, label: v }))]} /></dd>
          </div>
        )}
        <div className="min-w-0">
          <dt className="text-xs text-a-text-2">{t('crm.leads.came_in_label', 'Came in')}</dt>
          <dd className="py-1 text-sm text-a-text">{timeAgo(lead.created_at, lang)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-a-text-2">{t('crm.leads.last_touch_label', 'Last touch')}</dt>
          <dd className="py-1 text-sm text-a-text">
            {lead.last_contacted_at ? timeAgo(lead.last_contacted_at, lang) : t('crm.leads.never', 'Never')}
            <span className="ml-1.5 text-xs text-a-text-2">{t('crm.leads.touches', '{{calls}} calls · {{emails}} emails', { calls: lead.phone_calls_made ?? 0, emails: lead.emails_sent ?? 0 })}</span>
          </dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-xs text-a-text-2">{t('crm.leads.field_notes_short', 'Notes')}</dt>
          <dd><InlineField label={t('crm.leads.field_notes_short', 'Notes')} kind="textarea" busy={busy} value={lead.notes ?? ''} onSave={save('notes')}
            display={lead.notes || <span className="text-a-text-2">{t('crm.leads.no_notes', 'No notes.')}</span>} /></dd>
        </div>
      </dl>
    </Card>
  )
}

/** The whole lead at once (the … menu's Edit): value, priority, owner, where it came from, the type and notes. */
export function LeadEditPanel({ lead, onClose }: { lead: LeadDetail; onClose: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const settings = useLeadSettings()
  const team = useTeam()
  const formId = useId()
  const [draft, setDraft] = useState<DetailsDraft>(() => detailsDraft(lead))
  const [problem, setProblem] = useState(false)
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => send('put', `inquiries/${lead.id}`, body),
    onSuccess: () => { changed(); toast(t('crm.common.saved', 'Saved')); onClose() },
  })
  const submit = () => {
    const patch = detailsPatch(lead, draft)
    setProblem(Boolean(patch.problem))
    if (patch.problem) return
    if (!patch.body) { onClose(); return }
    save.mutate(patch.body)
  }
  const set = (p: Partial<DetailsDraft>) => setDraft(d => ({ ...d, ...p }))
  const types = [...new Set([...settings.types, ...(lead.inquiry_type ? [lead.inquiry_type] : [])])]
  const name = lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
  return (
    <SidePanel title={t('crm.leads.edit_title', 'Edit: {{name}}', { name })} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" form={formId} loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
        </div>
      )}>
      <form id={formId} className="space-y-3" onSubmit={e => { e.preventDefault(); submit() }}>
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
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
          <TextArea rows={5} value={draft.notes} onChange={e => set({ notes: e.target.value })} />
        </Field>
      </form>
    </SidePanel>
  )
}
