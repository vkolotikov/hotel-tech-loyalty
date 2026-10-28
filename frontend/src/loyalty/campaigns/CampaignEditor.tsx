import { useBoot } from '../LoyaltyProvider'
import { useLeaveGuard } from '../earn/useLeaveGuard'
import { OverviewButton } from '../overview/OverviewUI'
import { CampaignHeading, CampaignSteps } from './design/CampaignUI'
import { CompactBlocks } from './design/CompactBlocks'
import { AudiencePanel } from './design/AudiencePanel'
import { useCampaignWords } from './design/words'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { ConfirmDialog, FormField } from '../ui/formParts'
import { afterCampaignChange, campaignKey, campaignsApi, SEGMENTS_KEY } from './api'
import {
  campaignBody, campaignFormOf, campaignPath, campaignServerProblems, canTest, draftProblems, fieldKey, formWords, isDirty, previewFilled, sendBlockers,
  targetFrom, unknownTags, withTag, type CampaignForm, type TagField, type TagTarget,
} from './campaignsMath'
import { EmailPreview } from './EmailPreview'
import { ERRORS } from './errors'
import { Refusal } from './parts'
import { SendDialog } from './SendDialog'
import { TagBar, type TagFieldProps } from './TagBar'
import type { CampaignAnswer } from './types'
import { BLOCKER_WORDS, DRAFT_PROBLEM_WORDS } from './words'


/**
 * A draft's page (spec 2026-10-21 release 2 §6): its name, subject and audience, the body as blocks, and beside them
 * the server's rendering of the saved draft. Save writes the blocks (the server renders the email); Send me a test and
 * Send work on the saved draft only, so what is tested and confirmed is what goes out. Send says first why it cannot
 * be pressed yet (campaignsMath.ts `sendBlockers`). Release 3: the tag bar puts the server's tags where the cursor was
 * (the subject included), the editor names any double-braced word no tag fills, and the preview shows the tags filled
 * with the viewer's own sample, as their test email has them.
 */
export function CampaignEditor({ answer }: { answer: CampaignAnswer }) {
  const { t } = useTranslation()
  const w = useCampaignWords(), boot = useBoot(), leave = useLeaveGuard()
  const [step, setStep] = useState<'message' | 'audience'>('message')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [sending, setSending] = useState(false)
  const writing = useRef(false)
  const navigate = useNavigate()
  const client = useQueryClient()
  const { campaign: c, options } = answer
  const [form, setForm] = useState<CampaignForm>(() => campaignFormOf(c))
  const [tried, setTried] = useState(false)
  const [open, setOpen] = useState<'delete' | null>(null)
  const [target, setTarget] = useState<TagTarget | null>(null)
  const [noRoom, setNoRoom] = useState(false)
  const [caret, setCaret] = useState<{ key: string; at: number } | null>(null)
  const fields = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>())
  const segments = useQuery({ queryKey: SEGMENTS_KEY, queryFn: campaignsApi.segments })
  const dirty = isDirty(form, c)
  const mark = leave.mark
  useEffect(() => { mark('email', dirty) }, [mark, dirty])

  const save = useMutation({
    onSettled: () => { writing.current = false },
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
  const test = useMutation({ mutationFn: () => campaignsApi.test(c.id), onSettled: () => { writing.current = false } })
  const duplicate = useMutation({
    onSettled: () => { writing.current = false },
    mutationFn: () => campaignsApi.duplicate(c.id, t('loyalty.campaigns.copy_name', '{{name}} (copy)', { name: c.name })),
    onSuccess: (copy) => {
      client.setQueryData(campaignKey(copy.campaign.id), copy)
      afterCampaignChange(client, null)
      navigate(campaignPath(copy.campaign.id))
    },
  })
  const update = (patch: Partial<CampaignForm>) => {
    setForm(f => ({ ...f, ...patch }))
    setNoRoom(false)
    if (save.isError) save.reset()
    if (test.isSuccess || test.isError) test.reset()
  }

  // A tag goes where the cursor was; the cursor then stands after it, in the same field.
  const track = (field: TagField): TagFieldProps => ({
    ref: (el) => {
      if (el) fields.current.set(fieldKey(field), el)
      else fields.current.delete(fieldKey(field))
    },
    onSelect: (e) => setTarget(targetFrom(field, e.currentTarget)),
    onFocus: (e) => setTarget(targetFrom(field, e.currentTarget)),
  })
  const insertTag = (tag: string) => {
    if (!target) return
    const next = withTag(form, target, tag, options)
    if (!next) {
      setNoRoom(true)
      return
    }
    update(next.form)
    setTarget({ ...target, start: next.caret, end: next.caret })
    setCaret({ key: fieldKey(target.field), at: next.caret })
  }
  useEffect(() => {
    if (!caret) return
    const el = fields.current.get(caret.key)
    el?.focus()
    el?.setSelectionRange(caret.at, caret.at)
  }, [caret])

  const failure = save.isError ? failureOf(save.error) : null
  const own = draftProblems(form, options)
  const server = campaignServerProblems(failure?.fields)
  const formProblem = (field: string): string | null => {
    const code = (tried ? own.form[field] : undefined) ?? server.form[field]
    return code ? t(`loyalty.campaigns.draft.problem.${code}`, DRAFT_PROBLEM_WORDS[code] ?? DRAFT_PROBLEM_WORDS.look) : null
  }
  const blockProblems = { ...own.blocks, ...server.blocks }
  const blockers = sendBlockers(c, dirty, segments.data?.segments)
  const unknown = unknownTags(formWords(form), options.known_tags)

  const saveDraft = () => { setTried(true); const p = draftProblems(form, options); if (!writing.current && !Object.keys(p.form).length && !Object.keys(p.blocks).length) { writing.current = true; save.mutate() } }
  const busy = save.isPending || test.isPending || duplicate.isPending || sending
  const beginLeaveLock = leave.begin, endLeaveLock = leave.end
  useEffect(() => { if (busy) beginLeaveLock(); else endLeaveLock() }, [busy, beginLeaveLock, endLeaveLock])
  const audiencePanel = <AudiencePanel value={form.segment_id} subject={form.subject} busy={busy} onChange={segment_id => update({ segment_id })} onMessage={() => setStep('message')} />
  const blockerPanel = blockers.length > 0 ? <div data-blockers=""><Notice tone="info"><p className="font-medium">{t('loyalty.campaigns.editor.before_send', 'Before it can be sent:')}</p><ul className="mt-1 list-disc space-y-0.5 pl-5">{blockers.map(code => <li key={code}>{t(`loyalty.campaigns.blocker.${code}`, BLOCKER_WORDS[code])}</li>)}</ul></Notice></div> : null
  return <div className="l-cm-editor">
    <CampaignHeading title={step === 'message' ? w('writeEmail') : w('audienceSend')} line={c.name}><Button className="l-ov-button l-ov-primary" loading={save.isPending} disabled={!dirty || busy} onClick={saveDraft}>{t('loyalty.campaigns.editor.save', 'Save draft')}</Button></CampaignHeading>
    <CampaignSteps step={step} onStep={next => { if (!busy) setStep(next) }} busy={busy} />
    {failure && <Refusal family="save" failure={failure} />}
    {test.isSuccess && <Notice tone="success">{t('loyalty.campaigns.editor.test_sent', 'A test went to {{email}}, with “[TEST]” before the subject.', { email: test.data.sent_to })}</Notice>}
    {test.isError && <Refusal family="test" failure={failureOf(test.error)} />}
    {step === 'message' ? <>
      <fieldset disabled={busy} className="l-cm-editor-columns">
        <section className="l-cm-panel" aria-label={w('content')}>
          <div className="l-cm-fields"><FormField label={t('loyalty.campaigns.editor.name', 'Name')} hint={t('loyalty.campaigns.editor.name_hint', 'Only staff see it.')} problem={formProblem('name')}><input type="text" value={form.name} maxLength={options.max_name} onChange={e => update({ name: e.target.value })} /></FormField><FormField label={t('loyalty.campaigns.editor.subject', 'Subject')} problem={formProblem('subject')}><input type="text" value={form.subject} maxLength={options.max_subject} onChange={e => update({ subject: e.target.value })} {...track({ kind: 'subject' })} /></FormField></div>
          <label className="l-cm-field"><span>{w('sender')}</span><input value={options.sender_name ?? boot.organization.name} readOnly /></label>
          <CompactBlocks blocks={form.blocks} options={options} problems={blockProblems} onChange={blocks => update({ blocks })} track={track} />
          {formProblem('blocks') && <p className="text-xs font-medium text-a-danger">{formProblem('blocks')}</p>}
          <TagBar compact tags={options.tags} form={form} target={target} noRoom={noRoom} onInsert={insertTag} />
          {unknown.length > 0 && <div data-unknown-tags=""><Notice tone="warning">{t('loyalty.campaigns.editor.unknown_tags', '{{tags}} will reach members as written: no tag of that name is filled in.', { tags: unknown.join(', ') })}</Notice></div>}
        </section>
        <section className="l-cm-panel l-cm-preview" aria-label={w('preview')}><header className="l-cm-panel-head"><h2>{w('preview')}</h2><span className="l-cm-badge">{w('email')}</span></header><div className="l-cm-preview-width">{(['desktop','mobile'] as const).map(size => <OverviewButton key={size} primary={device === size} aria-pressed={device === size} onClick={() => setDevice(size)}>{w(size)}</OverviewButton>)}</div>
          {dirty && <p data-unsaved="">{t('loyalty.campaigns.preview.saved_only', 'This shows the saved draft. Save to see your changes.')}</p>}
          <div className="l-cm-preview-body" data-device={device}><EmailPreview subject={c.preview_subject} html={c.preview_html} filled={previewFilled(c)} /></div>
          <small>{t('loyalty.campaigns.preview.footer', 'Each member’s copy ends with the venue’s name and an unsubscribe link.')}</small>
          <div className="l-cm-test"><label className="l-cm-field"><span>{w('testRecipient')}</span><input type="text" value={options.test_recipient ?? boot.staff.name} readOnly /></label><Button className="l-ov-button" loading={test.isPending} disabled={!canTest(c, dirty) || busy} onClick={() => { if (!writing.current) { writing.current = true; test.mutate() } }}>{t('loyalty.campaigns.editor.test', 'Send me a test')}</Button></div><small>{w('testHint')}</small>
        </section>
      </fieldset>
      <footer className="l-cm-footer"><div><p>{w('draftOnly')}</p><small>{w('saveContinue')}</small></div><Link className="l-ov-button" to="/loyalty/campaigns">{t('loyalty.campaigns.back', 'All campaigns')}</Link><OverviewButton primary disabled={busy} onClick={() => setStep('audience')}>{w('audienceSend')} →</OverviewButton></footer>
    </> : !dirty && blockers.length === 0 ? <SendDialog key={`${c.id}:${c.revision}`} campaign={c} inline={audiencePanel} onClose={() => setStep('message')} onBusyChange={setSending} /> : <div className="l-cm-editor-columns">{audiencePanel}<section className="l-cm-panel l-cm-accent"><h2>{w('review')}</h2>{blockerPanel}{dirty && <p>{w('saveFirst')}</p>}<Button className="l-ov-button l-ov-primary" disabled={!dirty || busy} loading={save.isPending} onClick={saveDraft}>{t('loyalty.campaigns.editor.save', 'Save draft')}</Button></section></div>}
    <details className="l-cm-extra"><summary>{w('more')}</summary><div className="l-cm-actions"><Button className="l-ov-button" variant="secondary" disabled={busy || dirty} loading={duplicate.isPending} onClick={() => { if (!writing.current) { writing.current = true; duplicate.mutate() } }}>{t('loyalty.campaigns.editor.duplicate', 'Duplicate')}</Button><Button className="l-ov-button" variant="ghost" disabled={busy} onClick={() => setOpen('delete')}>{t('loyalty.campaigns.editor.delete', 'Delete draft')}</Button></div></details>
    {duplicate.isError && <Refusal family="duplicate" failure={failureOf(duplicate.error)} />}
    {open === 'delete' && <DeleteDraft id={c.id} name={c.name} onClose={() => setOpen(null)} />}
    {leave.destination && <ConfirmDialog title={w('discardTitle')} confirm={w('discard')} keep={w('keep')} failure={null} busy={busy} onConfirm={leave.discard} onClose={leave.keep}><p>{w('discardBody')}</p></ConfirmDialog>}
  </div>
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
