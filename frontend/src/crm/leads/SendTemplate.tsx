import { useId, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Mail, Send } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { SearchInput, TextInput } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { useLeadChanged } from './leadData'
import { previewDoc, searchTemplates, templateSendable, templateSendBody } from './listLogic'
import type { EmailTemplate, LeadDetail } from './leadTypes'

/**
 * Send one of the organisation's email templates to the lead's contact (the main platform's "Send email",
 * `POST email-templates/{id}/send`): pick a template, check the address and the subject, see the template, send. A
 * template that needs a loyalty member's details goes only to a contact who is a member (see templateSendable). It is
 * noted on the lead's timeline when the person asks (an email entry, which also counts as the last touch).
 */
export function SendTemplate({ lead, name, onClose }: { lead: LeadDetail; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const formId = useId()
  const templates = useQuery({
    queryKey: ['crm', 'leads', 'email-templates'],
    queryFn: () => get<{ templates: EmailTemplate[] }>('email-templates').then(r => (r.templates ?? []).filter(x => x.is_active !== false)),
    staleTime: 60_000,
  })
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<number | null>(null)
  const [to, setTo] = useState(lead.guest?.email ?? '')
  const [subject, setSubject] = useState('')
  const [note, setNote] = useState(true)
  const list = searchTemplates(templates.data ?? [], q)
  const template = (templates.data ?? []).find(x => x.id === chosen) ?? null
  const memberId = lead.guest?.member_id ?? null
  const sendable = template ? templateSendable(template, memberId) : null
  const body = templateSendBody(to, memberId, subject)

  const go = useMutation({
    mutationFn: async () => {
      if (!template || !body || !sendable?.ok) throw new Error('not ready')
      const sent = await send<{ subject?: string }>('post', `email-templates/${template.id}/send`, body)
      if (note) {
        await send('post', `inquiries/${lead.id}/activities`, {
          type: 'email', subject: (sent?.subject || body.subject || template.subject).slice(0, 200),
          body: t('crm.leads.template_noted', 'Sent with the template “{{name}}” to {{to}}.', { name: template.name, to: body.to }),
        }).catch(() => undefined)
      }
      return sent
    },
    onSuccess: () => { changed(); toast(t('crm.leads.template_sent', 'Email sent to {{to}}', { to: body?.to ?? '' })); onClose() },
  })

  return (
    <SidePanel title={t('crm.leads.template_title', 'Send an email to {{name}}', { name })} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={go.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" form={formId} loading={go.isPending} disabled={!template || !body || !sendable?.ok}><Send size={15} aria-hidden />{t('crm.leads.template_send', 'Send the email')}</Button>
        </div>
      )}>
      <form id={formId} className="space-y-4" onSubmit={e => { e.preventDefault(); go.mutate() }}>
        <p className="text-sm text-a-text-2">{t('crm.leads.template_line', 'Choose one of your email templates. It goes out at once, from your organisation\'s address.')}</p>
        {go.isError && <Notice tone="danger">{errorText(t, go.error)}</Notice>}
        <QueryState loading={templates.isLoading} error={templates.error} onRetry={() => { void templates.refetch() }} rows={3}>
          {(templates.data ?? []).length === 0 ? (
            <Notice tone="info">{t('crm.leads.template_none', 'There are no email templates yet. They are written in the full admin under Marketing → Email templates.')}</Notice>
          ) : (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium text-a-text-2">{t('crm.leads.template_pick', 'Template')}</legend>
              {(templates.data ?? []).length > 6 && <SearchInput label={t('crm.leads.template_search', 'Find a template')} value={q} onChange={setQ} />}
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {list.map(x => (
                  <label key={x.id} className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 ${chosen === x.id ? 'border-a-accent bg-a-accent/10' : 'border-a-border hover:bg-a-surface-2'}`}>
                    <input type="radio" name="template" className="mt-1 accent-a-accent" checked={chosen === x.id} onChange={() => { setChosen(x.id); setSubject('') }} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-a-text">{x.name}</span>
                      <span className="block truncate text-xs text-a-text-2">{x.subject}</span>
                    </span>
                  </label>
                ))}
                {list.length === 0 && <p className="py-2 text-sm text-a-text-2">{t('crm.leads.template_no_match', 'No template matches.')}</p>}
              </div>
            </fieldset>
          )}
        </QueryState>

        {sendable && !sendable.ok && (
          <Notice tone="warning">{t('crm.leads.template_member_only', 'This template fills in a loyalty member\'s details ({{tags}}), and {{name}} is not a member. Choose a template without them.', { tags: sendable.tags.map(tag => `{{${tag}}}`).join(', '), name })}</Notice>
        )}

        <Field label={t('crm.leads.template_to', 'To')}>
          <TextInput type="email" value={to} onChange={e => setTo(e.target.value)} maxLength={191} autoComplete="off" aria-invalid={to.trim() && !body ? true : undefined} />
          {to.trim() !== '' && !body && <span className="mt-1 block text-xs text-a-danger">{t('crm.leads.problem_email', 'This does not look like an email address.')}</span>}
        </Field>
        <Field label={t('crm.leads.template_subject', 'Subject (optional)')} hint={template ? t('crm.leads.template_subject_hint', 'Empty keeps the template\'s: {{subject}}', { subject: template.subject }) : undefined}>
          <TextInput value={subject} onChange={e => setSubject(e.target.value)} maxLength={255} disabled={!template} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-a-text">
          <input type="checkbox" className="h-4 w-4 accent-a-accent" checked={note} onChange={e => setNote(e.target.checked)} />
          {t('crm.leads.template_note', 'Note it on the lead\'s timeline')}
        </label>

        {template && (
          <section aria-label={t('crm.leads.template_preview', 'Preview')} className="space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-a-text-2"><Mail size={13} aria-hidden />{t('crm.leads.template_preview', 'Preview')}</p>
            {/* Sandboxed: no script, form or same-origin access from a template's HTML. */}
            <iframe title={t('crm.leads.template_preview', 'Preview')} sandbox="" srcDoc={previewDoc(template.html_body)} className="h-72 w-full rounded-xl border border-a-border" />
            <p className="text-xs text-a-text-2">{t('crm.leads.template_tags', 'Tags like {{tag}} are filled in when it is sent.', { tag: '{{hotel_name}}' })}</p>
          </section>
        )}
      </form>
    </SidePanel>
  )
}
