import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, Lock, Mail, Reply, Save, Undo2, UserRound } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Card } from '../ui/Card'
import { InfoTip } from '../ui/InfoTip'
import { TextInput } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { INTEGRATION_KEYS, integrationError, integrationsApi } from './integrationsApi'
import { SENDER_NAME_MAX, mailDraftOf, mailPayload, mailPreview, mailProblems, sameMail, type MailDraft, type MailSettings } from './integrationsLogic'
import { Problem } from './parts'

/**
 * Email (round 5): the name on the envelope and the reply-to address of the emails the CRM sends (a template from a
 * lead, the venue's own mail), with how the next email will read. The two settings the full admin keeps in Settings →
 * Integrations → Email sender, under the same rule: an owner changes them (the server's `can_change`). The From address
 * stays the platform's, so the email passes the inbox's checks.
 */
export function EmailTab() {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: INTEGRATION_KEYS.mail, queryFn: integrationsApi.mail })
  return (
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }} rows={3}>
      {query.data ? <SenderForm settings={query.data} /> : <p className="text-sm text-a-text-2">{t('crm.common.loading', 'Loading…')}</p>}
    </QueryState>
  )
}

function SenderForm({ settings }: { settings: MailSettings }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const saved = mailDraftOf(settings)
  const [draft, setDraft] = useState<MailDraft>(saved)
  const dirty = !sameMail(draft, saved)
  const problems = mailProblems(draft)
  const valid = !problems.from_name && !problems.reply_to
  const preview = mailPreview(settings, draft)
  const can = settings.can_change

  const save = useMutation({
    mutationFn: () => integrationsApi.saveMail(mailPayload(draft)),
    onSuccess: data => {
      qc.setQueryData(INTEGRATION_KEYS.mail, data)
      setDraft(mailDraftOf(data))
      say(t('crm.integrations.email.saved', 'Saved. The next email carries it.'))
    },
    onError: error => say(integrationError(t, error), 'danger'),
  })

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card title={t('crm.integrations.email.sender', 'Sender')} icon={Mail} tone="progress"
        description={t('crm.integrations.email.about', 'Leave a field empty to use your organisation\'s name and email.')}
        action={!can ? <span className="inline-flex items-center gap-1 text-xs text-a-text-2"><Lock size={13} aria-hidden />{t('crm.integrations.email.owner', 'Owner')}</span> : undefined}>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (can && dirty && valid) save.mutate() }}>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-a-text-2"><UserRound size={13} aria-hidden />{t('crm.integrations.email.name', 'Sender name')}</span>
            <TextInput value={draft.from_name} maxLength={SENDER_NAME_MAX} disabled={!can} placeholder={settings.defaults.from_name ?? ''}
              onChange={e => setDraft({ ...draft, from_name: e.target.value })} aria-invalid={!!problems.from_name} />
            {problems.from_name === 'too_long' && <Problem>{t('crm.integrations.email.name_long', 'At most {{max}} characters.', { max: SENDER_NAME_MAX })}</Problem>}
            {problems.from_name === 'characters' && <Problem>{t('crm.integrations.email.name_characters', 'One line, without < > or ".')}</Problem>}
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-a-text-2"><Reply size={13} aria-hidden />{t('crm.integrations.email.reply_to', 'Replies go to')}</span>
            <TextInput type="email" value={draft.reply_to} maxLength={191} disabled={!can} placeholder={settings.defaults.reply_to ?? 'team@example.com'}
              onChange={e => setDraft({ ...draft, reply_to: e.target.value })} aria-invalid={!!problems.reply_to} />
            {problems.reply_to && <Problem>{t('crm.integrations.email.reply_bad', 'This does not look like an email address.')}</Problem>}
          </label>
          {can ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setDraft(saved)} disabled={!dirty || save.isPending}>
                <Undo2 size={14} aria-hidden />{t('crm.integrations.discard', 'Discard')}
              </Button>
              <Button type="submit" size="sm" loading={save.isPending} disabled={!dirty || !valid}>
                <Save size={14} aria-hidden />{t('crm.integrations.save', 'Save')}
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-a-text-2"><Lock size={14} aria-hidden className="shrink-0" />{t('crm.integrations.email.owner_only', 'Only an owner can change this.')}</p>
          )}
        </form>
      </Card>

      <Card title={t('crm.integrations.email.preview', 'How it reads')} icon={Eye} tone="neutral"
        description={t('crm.integrations.email.preview_about', 'What the next email from a lead\'s page carries.')}>
        <dl className="space-y-3 text-sm">
          <div className="flex min-w-0 items-start gap-3">
            <dt className="flex w-24 shrink-0 items-center gap-1.5 text-a-text-2"><UserRound size={14} aria-hidden />{t('crm.integrations.email.from', 'From')}</dt>
            <dd className="min-w-0 break-words text-a-text">
              <span className="font-medium">{preview.fromName ?? '—'}</span>
              <span className="text-a-text-2"> &lt;{preview.fromAddress}&gt;</span>
              <span className="ml-1 inline-flex align-middle"><InfoTip text={t('crm.integrations.email.platform_tip', 'Emails go out from our checked address so they reach the inbox, not spam. Replies still come to you.')} align="right" /></span>
              {preview.nameIsDefault && <span className="ml-2 rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text-2">{t('crm.integrations.email.default', 'default')}</span>}
            </dd>
          </div>
          <div className="flex min-w-0 items-start gap-3">
            <dt className="flex w-24 shrink-0 items-center gap-1.5 text-a-text-2"><Reply size={14} aria-hidden />{t('crm.integrations.email.reply', 'Reply-to')}</dt>
            <dd className="min-w-0 break-words text-a-text">
              {preview.replyTo ?? <span className="text-a-st-pending">{t('crm.integrations.email.no_reply', 'None: replies would be lost')}</span>}
              {preview.replyTo && preview.replyIsDefault && <span className="ml-2 rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text-2">{t('crm.integrations.email.default', 'default')}</span>}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}
