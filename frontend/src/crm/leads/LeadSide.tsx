import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BedDouble, Copy, ExternalLink, FileText, FileUp, ListChecks, ListPlus, Mail, MessagesSquare, Pencil, Phone, RefreshCw, Sparkles, Trash2, UserRound } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { failureOf, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel, timeAgo } from '../lib/format'
import { conversationPath } from '../lib/links'
import { useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { IconButton } from '../ui/IconButton'
import { InfoTip } from '../ui/InfoTip'
import { Confirm } from '../ui/Confirm'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { CustomFieldInputs, CustomFieldsView } from './CustomFields'
import { useLeadChanged } from './leadData'
import { TextInput } from '../ui/inputs'
import { customBody, customErrors, dayOf, fileSize, missingCustom, newestConversation, winTone } from './leadLogic'
import { contactDraft, contactPatch, type ContactDraft } from './listLogic'
import type { Attachment, CustomField, LeadDetail, ProposalDraft } from './leadTypes'
import { useLeadChats, useLeadFiles, type AiRead } from './recordData'
import { coldLabel, intentLabel, senderLabel } from './leadWords'
import type { ComposerSeed } from './LeadTimeline'

/**
 * Who the lead is: name, company, country and how to reach them (one press to write, call or message), their contact
 * page, and the contact's details changed in place (`PUT guests/{id}`, the full admin's "Edit customer details").
 */
export function ContactCard({ lead }: { lead: LeadDetail }) {
  const { t } = useTranslation()
  const records = useRecords()
  const toast = useToast()
  const changed = useLeadChanged()
  const g = lead.guest
  const phone = g?.phone || g?.mobile
  const [draft, setDraft] = useState<ContactDraft | null>(null)
  const [problem, setProblem] = useState<'name' | 'email' | null>(null)
  const save = useMutation({
    mutationFn: (body: Record<string, string | null>) => send('put', `guests/${g?.id}`, body),
    onSuccess: () => { changed(); setDraft(null); toast(t('crm.common.saved', 'Saved')) },
  })
  const submit = () => {
    if (!draft) return
    const patch = contactPatch(g, draft)
    setProblem(patch.problem ?? null)
    if (patch.problem) return
    if (!patch.body) { setDraft(null); return }
    save.mutate(patch.body)
  }
  const set = (p: Partial<ContactDraft>) => setDraft(d => (d ? { ...d, ...p } : d))
  return (
    <Card title={t('crm.leads.contact', 'Contact')} icon={UserRound} tone="progress"
      action={g && !draft ? (
        <>
          {lead.guest_id && <IconButton icon={ExternalLink} size="sm" label={t('crm.leads.open_contact', 'Open the contact')} to={records.href('contact', lead.guest_id)} />}
          <IconButton icon={Pencil} size="sm" label={t('crm.leads.contact_edit', 'Edit the contact')} onClick={() => { setDraft(contactDraft(g)); setProblem(null) }} />
        </>
      ) : undefined}>
      {draft ? (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); submit() }}>
          <Field label={t('crm.leads.field_name', 'Name')}>
            <TextInput value={draft.name} onChange={e => set({ name: e.target.value })} maxLength={200} aria-invalid={problem === 'name' ? true : undefined} />
            {problem === 'name' && <span className="mt-1 block text-xs text-a-danger">{t('crm.leads.problem_required', 'This is needed.')}</span>}
          </Field>
          <Field label={t('crm.leads.field_company', 'Company (optional)')}>
            <TextInput value={draft.company} onChange={e => set({ company: e.target.value })} maxLength={200} />
          </Field>
          <Field label={t('crm.leads.field_email', 'Email (optional)')}>
            <TextInput type="email" value={draft.email} onChange={e => set({ email: e.target.value })} maxLength={150} aria-invalid={problem === 'email' ? true : undefined} />
            {problem === 'email' && <span className="mt-1 block text-xs text-a-danger">{t('crm.leads.problem_email', 'This does not look like an email address.')}</span>}
          </Field>
          <Field label={t('crm.leads.field_phone', 'Phone (optional)')}>
            <TextInput type="tel" value={draft.phone} onChange={e => set({ phone: e.target.value })} maxLength={50} />
          </Field>
          <Field label={t('crm.leads.field_country_opt', 'Country (optional)')}>
            <TextInput value={draft.country} onChange={e => set({ country: e.target.value })} maxLength={100} />
          </Field>
          {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" type="button" onClick={() => setDraft(null)} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
            <Button size="sm" type="submit" loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-3">
            <Avatar name={g?.full_name || g?.email} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-a-text">{g?.full_name || t('crm.common.no_name', 'No name')}</p>
              {(g?.company || g?.country) && <p className="truncate text-a-text-2">{[g?.company, g?.country].filter(Boolean).join(' · ')}</p>}
            </div>
          </div>
          {g?.email && <a href={`mailto:${g.email}`} className="flex items-center gap-2 break-all text-a-accent-text hover:underline"><Mail size={14} aria-hidden className="shrink-0" />{g.email}</a>}
          {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-a-accent-text hover:underline"><Phone size={14} aria-hidden className="shrink-0" />{phone}</a>}
          {!g?.email && !phone && <p className="text-a-text-2">{t('crm.leads.no_contact', 'No email or phone yet.')}</p>}
        </div>
      )}
    </Card>
  )
}

/**
 * The AI's read of the lead (`POST inquiries/{id}/ai-brief`, kept 15 minutes by the server): a summary, what they
 * want, the chance to win, whether it is going cold and the next step. Shown from what the lead already holds; asked
 * for only when someone presses (here or in the header, one answer: `useAiBrief`). The header's Proposal drafts an email
 * for a person to edit (`draft-proposal`, ProposalDialog); nothing is sent.
 */
export function AiCard({ ai }: { ai: AiRead }) {
  const { t, i18n } = useTranslation()
  const shown = ai.shown
  const tone = winTone(shown?.win_probability)
  const intent = intentLabel(t, shown?.intent)
  const cold = coldLabel(t, shown?.going_cold_risk)
  return (
    <section aria-label={t('crm.leads.ai_title', 'AI brief')} className="crm-ai-border min-w-0 rounded-2xl border bg-a-surface shadow-a-sm">
      <div className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-2">
        <span aria-hidden className="crm-ai-soft grid h-7 w-7 shrink-0 place-items-center rounded-lg"><Sparkles size={15} /></span>
        <h2 className="text-sm font-semibold text-a-text">{t('crm.leads.ai_title', 'AI brief')}</h2>
        <InfoTip text={t('crm.leads.ai_line', 'Where the lead stands, read by the AI')} />
        {shown?.generated_at && <span className="text-xs text-a-text-2">{timeAgo(shown.generated_at, i18n.language)}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={ai.run} disabled={ai.pending}
            className={`${shown?.brief ? 'crm-ai-soft' : 'crm-ai-fill'} inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-a-accent`}>
            {shown?.brief ? <RefreshCw size={13} aria-hidden className={ai.pending ? 'animate-spin' : ''} /> : <Sparkles size={13} aria-hidden />}
            {ai.pending ? t('crm.leads.ai_reading', 'Reading…') : shown?.brief ? t('crm.leads.ai_refresh_short', 'Again') : t('crm.leads.ai_write_short', 'Write it')}
          </button>
        </span>
      </div>
      {(shown?.brief || ai.failed || Boolean(ai.error)) && (
        <div className="space-y-2 border-t border-a-border px-4 py-3">
          {shown?.brief && (
            <>
              <p className="text-sm text-a-text">{shown.brief}</p>
              <div className="flex flex-wrap gap-1.5">
                {typeof shown.win_probability === 'number' && tone && <Pill tone={tone}>{t('crm.leads.ai_win', '{{percent}} % likely to win', { percent: shown.win_probability })}</Pill>}
                {intent && <Pill tone="ai">{intent}</Pill>}
                {cold && <Pill tone={shown.going_cold_risk === 'high' ? 'danger' : shown.going_cold_risk === 'medium' ? 'pending' : 'success'}>{cold}</Pill>}
              </div>
              {shown.suggested_action && <p className="text-sm"><span className="crm-ai-text font-medium">{t('crm.leads.ai_next', 'Next:')}</span> <span className="text-a-text">{shown.suggested_action}</span></p>}
            </>
          )}
          {ai.failed && <p className="text-sm text-a-danger">{t('crm.errors.ai_failed', 'The AI could not help just now. Please try again in a moment.')}</p>}
          {Boolean(ai.error) && <Notice tone="danger">{errorText(t, ai.error)}</Notice>}
        </div>
      )}
    </section>
  )
}

/** A proposal drafted by the AI (`draft-proposal`): copied, or put in the Activity tab's box for a person to send. */
export function ProposalDialog({ leadId, onClose, onUse }: { leadId: number; onClose: () => void; onUse: (seed: Omit<ComposerSeed, 'n'>) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const draft = useQuery({
    queryKey: ['crm', 'leads', 'proposal', leadId],
    queryFn: () => send<ProposalDraft>('post', `inquiries/${leadId}/draft-proposal`),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })
  const ok = draft.data && !draft.data.error && (draft.data.subject || draft.data.body)
  const copy = async () => {
    if (!draft.data) return
    try {
      await navigator.clipboard.writeText(`${draft.data.subject}\n\n${draft.data.body}`)
      toast(t('crm.common.copied', 'Copied'))
    } catch {
      toast(t('crm.errors.unknown', 'Something went wrong. Please try again.'), 'danger')
    }
  }
  return (
    <Dialog title={t('crm.leads.proposal_title', 'A proposal, drafted by AI')} onClose={onClose}>
      <div className="space-y-4">
        <QueryState loading={draft.isLoading} error={draft.error} onRetry={() => { void draft.refetch() }} rows={3}>
          {ok ? (
            <div className="crm-ai-border space-y-2 rounded-xl border p-3">
              <p className="text-sm font-semibold text-a-text">{draft.data?.subject}</p>
              <p className="whitespace-pre-wrap text-sm text-a-text">{draft.data?.body}</p>
            </div>
          ) : (
            <Notice tone="danger">{t('crm.errors.ai_failed', 'The AI could not help just now. Please try again in a moment.')}</Notice>
          )}
        </QueryState>
        <p className="text-xs text-a-text-2">{t('crm.leads.proposal_line', 'Nothing is sent. Read it, change it, then send it yourself.')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => { void draft.refetch() }} disabled={draft.isFetching}><RefreshCw size={14} aria-hidden />{t('crm.leads.proposal_again', 'Draft again')}</Button>
          <Button variant="secondary" onClick={() => { void copy() }} disabled={!ok}><Copy size={14} aria-hidden />{t('crm.common.copy', 'Copy')}</Button>
          <Button onClick={() => draft.data && onUse({ type: 'email', subject: draft.data.subject, body: draft.data.body })} disabled={!ok}>
            <ListPlus size={14} aria-hidden />{t('crm.leads.proposal_use_short', 'Use it')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** The Files tab (`inquiries/{id}/attachments`): proposals, contracts, pictures; up to 25 MB; added and removed. */
export function FilesTab({ leadId }: { leadId: number }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const input = useRef<HTMLInputElement>(null)
  const [removing, setRemoving] = useState<Attachment | null>(null)
  const files = useLeadFiles(leadId)
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return send<Attachment>('post', `inquiries/${leadId}/attachments`, form)
    },
    onSuccess: () => { changed(); toast(t('crm.leads.file_added', 'File added')) },
    onError: e => toast(failureOf(e).status === 422 ? t('crm.leads.file_refused', 'This file cannot be added: up to 25 MB, documents, spreadsheets, pictures or zip.') : errorText(t, e), 'danger'),
  })
  const remove = useMutation({
    mutationFn: (id: number) => send('delete', `inquiries/${leadId}/attachments/${id}`),
    onSuccess: () => { changed(); setRemoving(null); toast(t('crm.leads.file_removed', 'File removed')) },
  })
  const rows = files.data ?? []
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-a-text-2">{t('crm.leads.files_hint', 'Up to 25 MB')}</span>
        <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload.mutate(file) }} />
        <Button size="sm" className="ml-auto" loading={upload.isPending} onClick={() => input.current?.click()}><FileUp size={14} aria-hidden />{t('crm.leads.file_add', 'Add a file')}</Button>
      </div>
      <QueryState loading={files.isLoading} error={files.error} onRetry={() => { void files.refetch() }} rows={2}>
        {rows.length === 0 ? <p className="py-6 text-center text-sm text-a-text-2">{t('crm.leads.files_empty', 'No files yet.')}</p> : (
          <ul className="divide-y divide-a-border rounded-2xl border border-a-border bg-a-surface">
            {rows.map(f => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-a-surface-2 text-a-text-2"><FileText size={15} /></span>
                <div className="min-w-0 flex-1">
                  <a href={f.url} target="_blank" rel="noreferrer noopener" className="block truncate text-sm font-medium text-a-accent-text hover:underline">{f.filename}</a>
                  <p className="truncate text-xs text-a-text-2">{[fileSize(f.size_bytes), f.uploader?.name, dateTime(f.created_at, i18n.language, boot.venue.timezone)].filter(Boolean).join(' · ')}</p>
                </div>
                <IconButton icon={Trash2} size="sm" tone="danger" label={t('crm.leads.file_remove_named', 'Remove {{name}}', { name: f.filename })} onClick={() => setRemoving(f)} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      {removing && (
        <Confirm title={t('crm.leads.file_remove_title', 'Remove this file?')} confirm={t('crm.leads.file_remove', 'Remove')} busy={remove.isPending}
          onConfirm={() => remove.mutate(removing.id)} onClose={() => setRemoving(null)}>
          <p>{removing.filename}</p>
          {remove.isError && <div className="mt-3"><Notice tone="danger">{errorText(t, remove.error)}</Notice></div>}
        </Confirm>
      )}
    </div>
  )
}

/**
 * The Chat tab: what the lead's contact wrote to the website chat (`inquiries/{id}/chat-history`) — the newest chat's
 * messages, a way to it in the inbox, and the earlier chats.
 */
export function ChatTab({ leadId }: { leadId: number }) {
  const { t, i18n } = useTranslation()
  const history = useLeadChats(leadId)
  const conversations = history.data?.conversations ?? []
  const newest = newestConversation(conversations)
  const messages = (newest?.messages ?? []).filter(m => m.content).slice(-30)
  return (
    <QueryState loading={history.isLoading} error={history.error} onRetry={() => { void history.refetch() }} rows={3}>
      <div className="space-y-3">
        {newest && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-a-text-2">{timeAgo(newest.last_message_at ?? newest.created_at, i18n.language)}</span>
            <Link to={conversationPath(newest.id)} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-a-accent-text hover:underline">
              <MessagesSquare size={14} aria-hidden />{t('crm.leads.chat_open', 'Open in the inbox')}
            </Link>
          </div>
        )}
        <div className="space-y-2">
          {messages.map(m => (
            <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.sender_type === 'visitor' ? 'crm-bubble-visitor' : `ml-auto ${m.sender_type === 'ai' || m.sender_type === 'bot' ? 'crm-bubble-ai' : 'crm-bubble-agent'}`}`}>
              <p className="text-xs text-a-text-2">{senderLabel(t, m.sender_type, newest?.visitor_name)} · {timeAgo(m.created_at, i18n.language)}</p>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          ))}
        </div>
        {conversations.length > 1 && (
          <ul className="space-y-1 border-t border-a-border pt-3 text-sm">
            {conversations.filter(c => c.id !== newest?.id).slice(0, 6).map(c => (
              <li key={c.id}>
                <Link to={conversationPath(c.id)} className="text-a-accent-text hover:underline">{t('crm.leads.chat_earlier', 'Earlier chat, {{when}}', { when: timeAgo(c.last_message_at ?? c.created_at, i18n.language) })}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </QueryState>
  )
}

/** The stay a hotel lead asks for; only when the lead has one. */
export function StayCard({ lead }: { lead: LeadDetail }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const rows: [string, string][] = [
    [t('crm.leads.check_in', 'Arrival'), dayLabel(dayOf(lead.check_in), lang)],
    [t('crm.leads.check_out', 'Departure'), dayLabel(dayOf(lead.check_out), lang)],
    [t('crm.leads.rooms', 'Rooms'), lead.num_rooms ? String(lead.num_rooms) : ''],
    [t('crm.leads.adults', 'Adults'), lead.num_adults ? String(lead.num_adults) : ''],
    [t('crm.leads.children', 'Children'), lead.num_children ? String(lead.num_children) : ''],
  ]
  return (
    <Card title={t('crm.leads.stay_title', 'Stay')} icon={BedDouble} tone="progress">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {rows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label}><dt className="text-xs text-a-text-2">{label}</dt><dd className="text-sm text-a-text">{value}</dd></div>
        ))}
      </dl>
      {lead.special_requests && <p className="mt-3 whitespace-pre-wrap text-sm text-a-text">{lead.special_requests}</p>}
      {(lead.reservations ?? []).length > 0 && (
        <p className="mt-3 text-xs text-a-text-2">{t('crm.leads.booked_as', 'Booked as {{numbers}}', { numbers: (lead.reservations ?? []).map(r => r.confirmation_no ?? `#${r.id}`).join(', ') })}</p>
      )}
    </Card>
  )
}

/** The organisation's own fields: read, and changed in place (`PUT inquiries/{id}` with `custom_data`). */
export function CustomFieldsCard({ lead, fields }: { lead: LeadDetail; fields: readonly CustomField[] }) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [tried, setTried] = useState(false)
  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => send('put', `inquiries/${lead.id}`, { custom_data: customBody(fields, values) }),
    onSuccess: () => { changed(); setDraft(null); setTried(false); toast(t('crm.common.saved', 'Saved')) },
  })
  const missing = draft ? missingCustom(fields, draft) : []
  return (
    <Card title={t('crm.leads.more_fields', 'More about the lead')} description={t('crm.leads.more_fields_line', 'Your organisation\'s own fields')} icon={ListChecks} tone="neutral"
      action={!draft ? <IconButton icon={Pencil} size="sm" label={t('crm.leads.more_fields_edit', 'Edit these fields')} onClick={() => setDraft({ ...(lead.custom_data ?? {}) })} /> : undefined}>
      {draft ? (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); setTried(true); if (missing.length === 0) save.mutate(draft) }}>
          <CustomFieldInputs fields={fields} values={draft} onChange={setDraft} invalid={[...(tried ? missing : []), ...customErrors(failureOf(save.error).fields)]} />
          {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" type="button" onClick={() => setDraft(null)} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
            <Button size="sm" type="submit" loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
          </div>
        </form>
      ) : (
        <CustomFieldsView fields={fields} values={lead.custom_data} />
      )}
    </Card>
  )
}
