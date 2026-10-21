import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, FlaskConical, Save, Send, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Eyebrow } from '../../workspace/ui/Typography'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { ConfirmDialog, FormField } from '../ui/formParts'
import { afterCampaignChange, campaignKey, campaignsApi, SEGMENTS_KEY } from './api'
import { BlockList } from './BlockList'
import {
  campaignBody, campaignFormOf, campaignPath, campaignServerProblems, canTest, draftProblems, formWords, hasTags, isDirty, sendBlockers, type CampaignForm,
} from './campaignsMath'
import { EmailPreview } from './EmailPreview'
import { ERRORS } from './errors'
import { Refusal, StatusBadge } from './parts'
import { SendDialog } from './SendDialog'
import type { CampaignAnswer } from './types'
import { BLOCKER_WORDS, DRAFT_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * A draft's page (spec 2026-10-21 release 2 §6): its name, subject and audience, the body as blocks, and beside them
 * the server's rendering of the saved draft. Save writes the blocks (the server renders the email); Send me a test and
 * Send work on the saved draft only, so what is tested and confirmed is what goes out. Send says first why it cannot
 * be pressed yet (campaignsMath.ts `sendBlockers`).
 */
export function CampaignEditor({ answer }: { answer: CampaignAnswer }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const navigate = useNavigate()
  const client = useQueryClient()
  const { campaign: c, options } = answer
  const [form, setForm] = useState<CampaignForm>(() => campaignFormOf(c))
  const [tried, setTried] = useState(false)
  const [open, setOpen] = useState<'send' | 'delete' | null>(null)
  const segments = useQuery({ queryKey: SEGMENTS_KEY, queryFn: campaignsApi.segments })
  const dirty = isDirty(form, c)

  const save = useMutation({
    mutationFn: () => campaignsApi.updateCampaign(c.id, campaignBody(form)),
    onSuccess: (next) => {
      client.setQueryData(campaignKey(c.id), next)
      setForm(campaignFormOf(next.campaign))
      setTried(false)
      afterCampaignChange(client, c.id)
    },
    onError: (error) => {
      const code = failureOf(error).code
      if (code === 'not_a_draft' || code === 'not_editable_here' || code === 'not_found') afterCampaignChange(client, c.id)
    },
  })
  const test = useMutation({ mutationFn: () => campaignsApi.test(c.id) })
  const duplicate = useMutation({
    mutationFn: () => campaignsApi.duplicate(c.id, t('loyalty.campaigns.copy_name', '{{name}} (copy)', { name: c.name })),
    onSuccess: (copy) => {
      client.setQueryData(campaignKey(copy.campaign.id), copy)
      afterCampaignChange(client, null)
      navigate(campaignPath(copy.campaign.id))
    },
  })
  const update = (patch: Partial<CampaignForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
    if (test.isSuccess || test.isError) test.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const own = draftProblems(form, options)
  const server = campaignServerProblems(failure?.fields)
  const formProblem = (field: string): string | null => {
    const code = (tried ? own.form[field] : undefined) ?? server.form[field]
    return code ? t(`loyalty.campaigns.draft.problem.${code}`, DRAFT_PROBLEM_WORDS[code] ?? DRAFT_PROBLEM_WORDS.look) : null
  }
  const blockProblems = { ...own.blocks, ...server.blocks }
  const blockers = sendBlockers(c, dirty, segments.data?.segments)
  const tags = hasTags(...formWords(form))
  const list = segments.data?.segments ?? []
  const chosenGone = form.segment_id !== '' && segments.data !== undefined && !list.some(s => String(s.id) === form.segment_id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-2">
          <h1 className="font-a-display text-[40px] font-normal leading-none text-a-text">{c.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-a-text-2">
            <StatusBadge status={c.status} />
            {dirty && <span data-unsaved="">{t('loyalty.campaigns.editor.unsaved', 'Changes not saved')}</span>}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant={dirty ? 'primary' : 'secondary'} loading={save.isPending} disabled={!dirty} onClick={() => {
            setTried(true)
            const p = draftProblems(form, options)
            if (Object.keys(p.form).length === 0 && Object.keys(p.blocks).length === 0) save.mutate()
          }}>
            <Save size={15} aria-hidden />{t('loyalty.campaigns.editor.save', 'Save draft')}
          </Button>
          <Button variant="secondary" loading={test.isPending} disabled={!canTest(c, dirty)} onClick={() => test.mutate()}>
            <FlaskConical size={15} aria-hidden />{t('loyalty.campaigns.editor.test', 'Send me a test')}
          </Button>
          <Button disabled={blockers.length > 0} onClick={() => setOpen('send')}>
            <Send size={15} aria-hidden />{t('loyalty.campaigns.editor.send', 'Send…')}
          </Button>
        </div>
      </div>

      {failure && <Refusal family="save" failure={failure} />}
      {test.isSuccess && <Notice tone="success">{t('loyalty.campaigns.editor.test_sent', 'A test went to {{email}}, with “[TEST]” before the subject.', { email: test.data.sent_to })}</Notice>}
      {test.isError && <Refusal family="test" failure={failureOf(test.error)} />}
      {blockers.length > 0 && (
        <div className="max-w-2xl" data-blockers="">
          <Notice tone="info">
            <p className="font-medium">{t('loyalty.campaigns.editor.before_send', 'Before it can be sent:')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {blockers.map(code => <li key={code}>{t(`loyalty.campaigns.blocker.${code}`, BLOCKER_WORDS[code])}</li>)}
            </ul>
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="campaign-edit" className="min-w-0 space-y-4">
          <Eyebrow><span id="campaign-edit">{t('loyalty.campaigns.editor.title', 'The email')}</span></Eyebrow>
          <FormField label={t('loyalty.campaigns.editor.name', 'Name')} hint={t('loyalty.campaigns.editor.name_hint', 'Only staff see it.')} problem={formProblem('name')}>
            <input type="text" value={form.name} maxLength={options.max_name} onChange={(e) => update({ name: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.campaigns.editor.subject', 'Subject')} problem={formProblem('subject')}>
            <input type="text" value={form.subject} maxLength={options.max_subject} onChange={(e) => update({ subject: e.target.value })} className={INPUT}
              placeholder={t('loyalty.campaigns.editor.subject_example', 'e.g. Autumn at our place')} />
          </FormField>
          <FormField label={t('loyalty.campaigns.editor.audience', 'Who receives it')} problem={formProblem('segment_id')}
            hint={t('loyalty.campaigns.editor.audience_hint', 'Only the segment’s members who agreed to marketing email get it. Send shows the exact number first.')}>
            <select value={form.segment_id} onChange={(e) => update({ segment_id: e.target.value })} className={INPUT}>
              <option value="">{t('loyalty.campaigns.editor.choose_segment', 'Choose a segment')}</option>
              {list.map(s => (
                <option key={s.id} value={String(s.id)}>
                  {s.problem
                    ? t('loyalty.campaigns.editor.segment_problem', '{{name}} (a rule needs fixing)', { name: s.name })
                    : t('loyalty.campaigns.editor.segment_option', '{{name}} · {{number}} members', { name: s.name, number: points(s.members, locale) })}
                </option>
              ))}
              {chosenGone && <option value={form.segment_id}>{t('loyalty.campaigns.editor.segment_gone', 'A segment that no longer exists')}</option>}
            </select>
          </FormField>

          <div className="space-y-2">
            <p className="text-xs font-medium text-a-text-2">{t('loyalty.campaigns.editor.body', 'Body')}</p>
            {tags && (
              <Notice tone="warning">{t('loyalty.campaigns.editor.tags', 'Tags such as {{tag}} are not filled in: members would read them as written. Write the words themselves.', { tag: '{{member.name}}' })}</Notice>
            )}
            <BlockList blocks={form.blocks} options={options} problems={blockProblems} onChange={(blocks) => update({ blocks })} />
            {formProblem('blocks') && <p className="text-xs font-medium text-a-danger">{formProblem('blocks')}</p>}
          </div>
        </section>

        <section aria-labelledby="campaign-preview" className="min-w-0 space-y-2">
          <Eyebrow><span id="campaign-preview">{t('loyalty.campaigns.preview.heading', 'Preview')}</span></Eyebrow>
          {dirty && <p className="text-sm text-a-text-2">{t('loyalty.campaigns.preview.saved_only', 'This shows the saved draft. Save to see your changes.')}</p>}
          <EmailPreview html={c.body_html} />
          <p className="text-xs text-a-text-2">{t('loyalty.campaigns.preview.footer', 'Each member’s copy ends with the venue’s name and an unsubscribe link.')}</p>
        </section>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-a-border pt-4">
        <Button variant="secondary" size="sm" loading={duplicate.isPending} onClick={() => duplicate.mutate()}>
          <Copy size={14} aria-hidden />{t('loyalty.campaigns.editor.duplicate', 'Duplicate')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen('delete')}>
          <Trash2 size={14} aria-hidden />{t('loyalty.campaigns.editor.delete', 'Delete draft')}
        </Button>
      </div>
      {duplicate.isError && <Refusal family="duplicate" failure={failureOf(duplicate.error)} />}

      {open === 'send' && <SendDialog campaign={c} tags={hasTags(c.subject, c.body_html)} onClose={() => setOpen(null)} />}
      {open === 'delete' && <DeleteDraft id={c.id} name={c.name} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** The step before a draft is deleted. */
export function DeleteDraft({ id, name, onClose }: { id: number; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => campaignsApi.deleteCampaign(id),
    onSuccess: () => {
      afterCampaignChange(client, null)
      client.removeQueries({ queryKey: campaignKey(id) })
      navigate('/loyalty/campaigns')
    },
    onError: (error) => { if (failureOf(error).code === 'not_a_draft') afterCampaignChange(client, id) },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  return (
    <ConfirmDialog title={t('loyalty.campaigns.delete.title', 'Delete {{name}}?', { name })}
      confirm={t('loyalty.campaigns.delete.confirm', 'Delete draft')} keep={t('loyalty.campaigns.delete.keep', 'Keep it')}
      busy={remove.isPending} failure={failure && t(...refusalKey('loyalty.campaigns', ERRORS, 'remove', failure))}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('loyalty.campaigns.delete.body', 'The draft goes for good. Nothing was sent from it.')}</p>
    </ConfirmDialog>
  )
}
