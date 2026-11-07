import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BedDouble, Copy, FileUp, Mail, MessagesSquare, Paperclip, Phone, Sparkles, Trash2, UserRound, Wand2, ListPlus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { failureOf, get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel, timeAgo } from '../lib/format'
import { contactPath, conversationPath } from '../lib/links'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { CustomFieldInputs, CustomFieldsView } from './CustomFields'
import { useLeadChanged } from './leadData'
import { customBody, customErrors, dayOf, fileSize, missingCustom, newestConversation, winTone } from './leadLogic'
import type { AiBrief, Attachment, ChatHistory, CustomField, LeadDetail, ProposalDraft } from './leadTypes'
import { coldLabel, intentLabel, senderLabel } from './leadWords'
import type { ComposerSeed } from './LeadTimeline'

/** Who the lead is: name, company, how to reach them, and their contact page. */
export function ContactCard({ lead }: { lead: LeadDetail }) {
  const { t } = useTranslation()
  const g = lead.guest
  const phone = g?.phone || g?.mobile
  return (
    <Card title={t('crm.leads.contact', 'Contact')} icon={UserRound}>
      <div className="space-y-2 text-sm">
        <p className="font-medium text-a-text">{g?.full_name || t('crm.common.no_name', 'No name')}</p>
        {g?.company && <p className="text-a-text-2">{g.company}</p>}
        {g?.email && <a href={`mailto:${g.email}`} className="flex items-center gap-2 break-all text-a-accent-text hover:underline"><Mail size={14} aria-hidden className="shrink-0" />{g.email}</a>}
        {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-a-accent-text hover:underline"><Phone size={14} aria-hidden className="shrink-0" />{phone}</a>}
        {!g?.email && !phone && <p className="text-a-text-2">{t('crm.leads.no_contact', 'No email or phone yet.')}</p>}
        {lead.guest_id && (
          <Link to={contactPath(lead.guest_id)} className="inline-block pt-1 font-medium text-a-accent-text hover:underline">{t('crm.leads.open_contact', 'Open the contact')}</Link>
        )}
      </div>
    </Card>
  )
}

/**
 * The AI's read of the lead (`POST inquiries/{id}/ai-brief`, kept 15 minutes by the server): a summary, what they
 * want, the chance to win, whether it is going cold and the next step. Shown from what the lead already holds; asked
 * for only when someone presses. And a proposal email drafted for a person to edit (`draft-proposal`); nothing is sent.
 */
export function AiCard({ lead, onUseDraft }: { lead: LeadDetail; onUseDraft: (seed: Omit<ComposerSeed, 'n'>) => void }) {
  const { t, i18n } = useTranslation()
  const changed = useLeadChanged()
  const [proposing, setProposing] = useState(false)
  const brief = useMutation({
    mutationFn: () => send<AiBrief>('post', `inquiries/${lead.id}/ai-brief`, lead.ai_brief ? { force_refresh: true } : {}),
    onSuccess: () => changed(),
  })
  const shown: AiBrief | null = brief.data && !brief.data.error ? brief.data
    : lead.ai_brief ? {
      brief: lead.ai_brief, intent: lead.ai_intent ?? null, win_probability: lead.ai_win_probability ?? null,
      going_cold_risk: lead.ai_going_cold_risk ?? null, suggested_action: lead.ai_suggested_action ?? null,
      generated_at: lead.ai_brief_at ?? null, cached: true,
    } : null
  const tone = winTone(shown?.win_probability)
  const intent = intentLabel(t, shown?.intent)
  const cold = coldLabel(t, shown?.going_cold_risk)

  return (
    <section className="crm-ai-border min-w-0 rounded-2xl border bg-a-surface shadow-a-sm">
      <div className="flex min-h-12 items-center gap-2 border-b border-a-border px-4 py-2.5">
        <span aria-hidden className="crm-ai-soft grid h-7 w-7 place-items-center rounded-lg"><Sparkles size={15} /></span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-a-text">{t('crm.leads.ai_title', 'AI brief')}</h2>
      </div>
      <div className="space-y-3 p-4">
        {shown?.brief ? (
          <>
            <p className="text-sm text-a-text">{shown.brief}</p>
            <div className="flex flex-wrap gap-1.5">
              {typeof shown.win_probability === 'number' && tone && (
                <Pill tone={tone}>{t('crm.leads.ai_win', '{{percent}} % likely to win', { percent: shown.win_probability })}</Pill>
              )}
              {intent && <Pill tone="ai">{intent}</Pill>}
              {cold && <Pill tone={shown.going_cold_risk === 'high' ? 'danger' : shown.going_cold_risk === 'medium' ? 'pending' : 'success'}>{cold}</Pill>}
            </div>
            {shown.suggested_action && <p className="text-sm"><span className="crm-ai-text font-medium">{t('crm.leads.ai_next', 'Next:')}</span> <span className="text-a-text">{shown.suggested_action}</span></p>}
            {shown.generated_at && <p className="text-xs text-a-text-2">{t('crm.leads.ai_when', 'Written {{when}}', { when: timeAgo(shown.generated_at, i18n.language) })}</p>}
          </>
        ) : (
          <p className="text-sm text-a-text-2">{t('crm.leads.ai_empty', 'The AI reads the lead and its timeline and says where it stands.')}</p>
        )}
        {brief.data?.error && <p className="text-sm text-a-danger">{t('crm.errors.ai_failed', 'The AI could not help just now. Please try again in a moment.')}</p>}
        {brief.isError && <Notice tone="danger">{errorText(t, brief.error)}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => brief.mutate()} disabled={brief.isPending}
            className="crm-ai-fill inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold disabled:opacity-60">
            <Sparkles size={14} aria-hidden />{brief.isPending ? t('crm.leads.ai_reading', 'Reading…') : shown?.brief ? t('crm.leads.ai_refresh', 'Read it again') : t('crm.leads.ai_write', 'Write the brief')}
          </button>
          <button type="button" onClick={() => setProposing(true)}
            className="crm-ai-soft inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold">
            <Wand2 size={14} aria-hidden />{t('crm.leads.ai_proposal', 'Draft a proposal')}
          </button>
        </div>
      </div>
      {proposing && <ProposalDialog leadId={lead.id} onClose={() => setProposing(false)} onUse={draft => { onUseDraft(draft); setProposing(false) }} />}
    </section>
  )
}

function ProposalDialog({ leadId, onClose, onUse }: { leadId: number; onClose: () => void; onUse: (seed: Omit<ComposerSeed, 'n'>) => void }) {
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
          <Button variant="secondary" onClick={() => { void draft.refetch() }} disabled={draft.isFetching}>{t('crm.leads.proposal_again', 'Draft again')}</Button>
          <Button variant="secondary" onClick={() => { void copy() }} disabled={!ok}><Copy size={14} aria-hidden />{t('crm.common.copy', 'Copy')}</Button>
          <Button onClick={() => draft.data && onUse({ type: 'email', subject: draft.data.subject, body: draft.data.body })} disabled={!ok}>
            <ListPlus size={14} aria-hidden />{t('crm.leads.proposal_use', 'Put it in the timeline box')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Files on the lead (`inquiries/{id}/attachments`): proposals, contracts; up to 25 MB, documents and pictures. */
export function AttachmentsCard({ leadId }: { leadId: number }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const input = useRef<HTMLInputElement>(null)
  const [removing, setRemoving] = useState<Attachment | null>(null)
  const files = useQuery({
    queryKey: ['crm', 'leads', 'attachments', leadId],
    queryFn: () => get<{ data: Attachment[] }>(`inquiries/${leadId}/attachments`).then(r => r.data),
  })
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
    <Card title={t('crm.leads.files', 'Files')} icon={Paperclip}
      action={(
        <>
          <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden
            onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload.mutate(file) }} />
          <Button variant="ghost" size="sm" loading={upload.isPending} onClick={() => input.current?.click()}><FileUp size={14} aria-hidden />{t('crm.leads.file_add', 'Add a file')}</Button>
        </>
      )}>
      <QueryState loading={files.isLoading} error={files.error} onRetry={() => { void files.refetch() }} rows={2}>
        {rows.length === 0 ? <p className="text-sm text-a-text-2">{t('crm.leads.files_empty', 'No files yet.')}</p> : (
          <ul className="space-y-2">
            {rows.map(f => (
              <li key={f.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <a href={f.url} target="_blank" rel="noreferrer noopener" className="block truncate text-sm font-medium text-a-accent-text hover:underline">{f.filename}</a>
                  <p className="text-xs text-a-text-2">{[fileSize(f.size_bytes), f.uploader?.name, dateTime(f.created_at, i18n.language, boot.venue.timezone)].filter(Boolean).join(' · ')}</p>
                </div>
                <button type="button" onClick={() => setRemoving(f)} aria-label={t('crm.leads.file_remove_named', 'Remove {{name}}', { name: f.filename })}
                  className="rounded-lg p-1.5 text-a-text-2 hover:bg-a-danger/12 hover:text-a-danger"><Trash2 size={14} aria-hidden /></button>
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
    </Card>
  )
}

/** The website chats this lead's contact had (`inquiries/{id}/chat-history`): the newest one's last words, and a way to it. */
export function ChatCard({ leadId }: { leadId: number }) {
  const { t, i18n } = useTranslation()
  const history = useQuery({
    queryKey: ['crm', 'leads', 'chat', leadId],
    queryFn: () => get<ChatHistory>(`inquiries/${leadId}/chat-history`),
    staleTime: 60_000,
  })
  const conversations = history.data?.conversations ?? []
  const newest = newestConversation(conversations)
  const last = (newest?.messages ?? []).filter(m => m.content).slice(-3)
  if (!history.isLoading && !history.error && conversations.length === 0) return null
  return (
    <Card title={t('crm.leads.chat', 'Website chat')} icon={MessagesSquare}
      action={newest ? <Link to={conversationPath(newest.id)} className="text-sm font-medium text-a-accent-text hover:underline">{t('crm.leads.chat_open', 'Open in the inbox')}</Link> : undefined}>
      <QueryState loading={history.isLoading} error={history.error} onRetry={() => { void history.refetch() }} rows={2}>
        <div className="space-y-2">
          {last.map(m => (
            <div key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.sender_type === 'visitor' ? 'crm-bubble-visitor' : m.sender_type === 'ai' || m.sender_type === 'bot' ? 'crm-bubble-ai' : 'crm-bubble-agent'}`}>
              <p className="text-xs text-a-text-2">{senderLabel(t, m.sender_type, newest?.visitor_name)} · {timeAgo(m.created_at, i18n.language)}</p>
              <p className="line-clamp-4 whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          ))}
          {conversations.length > 1 && (
            <ul className="space-y-1 pt-1 text-sm">
              {conversations.filter(c => c.id !== newest?.id).slice(0, 4).map(c => (
                <li key={c.id}>
                  <Link to={conversationPath(c.id)} className="text-a-accent-text hover:underline">{t('crm.leads.chat_earlier', 'Earlier chat, {{when}}', { when: timeAgo(c.last_message_at ?? c.created_at, i18n.language) })}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </QueryState>
    </Card>
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
    <Card title={t('crm.leads.stay_title', 'Stay')} icon={BedDouble}>
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
    <Card title={t('crm.leads.more_fields', 'More about the lead')} icon={Sparkles}
      action={!draft ? <Button variant="ghost" size="sm" onClick={() => setDraft({ ...(lead.custom_data ?? {}) })}>{t('crm.common.edit', 'Edit')}</Button> : undefined}>
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
