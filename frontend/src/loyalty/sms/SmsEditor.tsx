import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, FlaskConical, Save, Send, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { Eyebrow } from '../../workspace/ui/Typography'
import { TAG_WORDS } from '../campaigns/words'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { ConfirmDialog, FormField } from '../ui/formParts'
import { afterSmsChange, SEGMENTS_KEY, smsApi, smsAudienceKey, smsKey } from './api'
import { ERRORS } from './errors'
import { LengthLine, PhoneBubble, Refusal, StatusBadge, TwilioSetup } from './parts'
import {
  bodyOf, canCount, canTest, confirmationOf, draftProblems, fillTags, formOf, isDirty, sendBlockers, serverProblems, smsLength, smsSearch,
  unknownSmsTags, withTagAt, type SmsForm,
} from './smsMath'
import { SmsSendDialog } from './SmsSendDialog'
import type { SmsAnswer, SmsAudience, SmsOptions } from './types'
import { BLOCKER_WORDS, NOT_REACHED_WORDS, PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * A draft SMS campaign (spec 2026-10-22 release 4 §5, R4-4): its name, its text with the tag bar (the email campaigns'
 * tags, filled per member as plain text) and how long it is as the networks count it, and its segment, beside a phone's
 * view of it with the viewer's own sample in the tags. Save writes the draft; once it is saved with a segment, the page
 * says who it would reach now and how many SMS parts that comes to. Send me a test and Send work on the saved draft
 * only, so what is tested and confirmed is what goes out; Send says first why it cannot be pressed yet. Without the
 * venue's Twilio account the page says what to set and where.
 */
export function SmsEditor({ answer }: { answer: SmsAnswer }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const navigate = useNavigate()
  const client = useQueryClient()
  const { sms: s, options } = answer
  const [form, setForm] = useState<SmsForm>(() => formOf(s))
  const [tried, setTried] = useState(false)
  const [open, setOpen] = useState<'send' | 'delete' | null>(null)
  const [cursor, setCursor] = useState<{ start: number; end: number } | null>(null)
  const [caret, setCaret] = useState<number | null>(null)
  const [noRoom, setNoRoom] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const segments = useQuery({ queryKey: SEGMENTS_KEY, queryFn: smsApi.segments })
  const dirty = isDirty(form, s)
  const counting = canCount(s, dirty)
  const audience = useQuery({ queryKey: smsAudienceKey(s.id), queryFn: () => smsApi.audience(s.id), enabled: counting, retry: false })

  const save = useMutation({
    mutationFn: () => smsApi.update(s.id, bodyOf(form)),
    onSuccess: (next) => {
      client.setQueryData(smsKey(s.id), next)
      setForm(formOf(next.sms))
      setTried(false)
      afterSmsChange(client, s.id)
    },
    onError: (error) => {
      const code = failureOf(error).code
      if (code === 'not_a_draft' || code === 'not_found') afterSmsChange(client, s.id)
    },
  })
  const test = useMutation({ mutationFn: () => smsApi.test(s.id) })
  const duplicate = useMutation({
    mutationFn: () => smsApi.duplicate(s.id, t('loyalty.sms.copy_name', '{{name}} (copy)', { name: s.name })),
    onSuccess: (copy) => {
      client.setQueryData(smsKey(copy.sms.id), copy)
      afterSmsChange(client, null)
      navigate({ pathname: '/loyalty/campaigns', search: smsSearch(copy.sms.id) })
    },
  })
  const update = (patch: Partial<SmsForm>) => {
    setForm(f => ({ ...f, ...patch }))
    setNoRoom(false)
    if (save.isError) save.reset()
    if (test.isSuccess || test.isError) test.reset()
  }

  // A tag goes where the cursor was; the cursor then stands after it.
  const insertTag = (tag: string) => {
    const at = cursor ?? { start: form.body.length, end: form.body.length }
    const next = withTagAt(form.body, at.start, at.end, tag, options.max_body)
    if (!next) {
      setNoRoom(true)
      return
    }
    update({ body: next.text })
    setCursor({ start: next.caret, end: next.caret })
    setCaret(next.caret)
  }
  useEffect(() => {
    if (caret === null) return
    field.current?.focus()
    field.current?.setSelectionRange(caret, caret)
  }, [caret])

  const failure = save.isError ? failureOf(save.error) : null
  const own = draftProblems(form, options)
  const server = serverProblems(failure?.fields)
  const problem = (name: string, max?: number): string | null => {
    const code = (tried ? own[name] : undefined) ?? server[name]
    return code ? t(`loyalty.sms.problem.${code}`, PROBLEM_WORDS[code] ?? PROBLEM_WORDS.name, { max }) : null
  }
  const blockers = sendBlockers(s, dirty, segments.data?.segments, options.twilio)
  const list = segments.data?.segments ?? []
  const chosenGone = form.segment_id !== '' && segments.data !== undefined && !list.some(x => String(x.id) === form.segment_id)
  const preview = fillTags(form.body, options.sample)
  const unknown = unknownSmsTags(form.body, options.known_tags)
  const track = (e: { currentTarget: HTMLTextAreaElement }) => setCursor({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-2">
          <h2 className="break-words font-a-display text-3xl font-normal leading-tight text-a-text">{s.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-a-text-2">
            <StatusBadge status={s.status} />
            {dirty && <span data-unsaved="">{t('loyalty.sms.editor.unsaved', 'Changes not saved')}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button variant={dirty ? 'primary' : 'secondary'} loading={save.isPending} disabled={!dirty} onClick={() => {
            setTried(true)
            if (Object.keys(draftProblems(form, options)).length === 0) save.mutate()
          }}>
            <Save size={15} aria-hidden />{t('loyalty.sms.editor.save', 'Save draft')}
          </Button>
          <Button variant="secondary" loading={test.isPending} disabled={!canTest(s, dirty, options.twilio)} onClick={() => test.mutate()}>
            <FlaskConical size={15} aria-hidden />{t('loyalty.sms.editor.test', 'Send me a test')}
          </Button>
          <Button disabled={blockers.length > 0} onClick={() => setOpen('send')}>
            <Send size={15} aria-hidden />{t('loyalty.sms.editor.send', 'Send…')}
          </Button>
        </div>
      </div>

      {!options.twilio.ready && <TwilioSetup twilio={options.twilio} />}
      {failure && <Refusal family="save" failure={failure} />}
      {test.isSuccess && (
        <Notice tone="success">{t('loyalty.sms.editor.test_sent', 'A test went to {{phone}}, with “[TEST]” before the text.', { phone: test.data.sent_to })}</Notice>
      )}
      {test.isError && <Refusal family="test" failure={failureOf(test.error)} />}
      {blockers.length > 0 && (
        <div className="max-w-2xl" data-blockers="">
          <Notice tone="info">
            <p className="font-medium">{t('loyalty.sms.editor.before_send', 'Before it can be sent:')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {blockers.map(code => <li key={code}>{t(`loyalty.sms.blocker.${code}`, BLOCKER_WORDS[code])}</li>)}
            </ul>
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="sms-edit" className="min-w-0 space-y-4">
          <Eyebrow><span id="sms-edit">{t('loyalty.sms.editor.heading', 'The text')}</span></Eyebrow>
          <FormField label={t('loyalty.sms.editor.name', 'Name')} hint={t('loyalty.sms.editor.name_hint', 'Only staff see it.')} problem={problem('name', options.max_name)}>
            <input type="text" value={form.name} maxLength={options.max_name} onChange={(e) => update({ name: e.target.value })} className={INPUT} />
          </FormField>

          <div className="space-y-2">
            <TagButtons options={options} noRoom={noRoom} onInsert={insertTag} />
            <FormField label={t('loyalty.sms.editor.body', 'Text')} problem={problem('body', options.max_body)}>
              <textarea ref={field} value={form.body} rows={5} onChange={(e) => { update({ body: e.target.value }); track(e) }}
                onSelect={track} onFocus={track} className={INPUT}
                placeholder={t('loyalty.sms.editor.body_example', 'e.g. Hi {{first}}, double points at {{venue}} until Sunday. Reply STOP to opt out.', { first: '{{first_name}}', venue: '{{hotel_name}}' })} />
            </FormField>
            <div className="text-xs text-a-text-2" data-sms-length="">
              <LengthLine length={smsLength(preview)} max={options.max_body} chars={[...form.body].length} />
              <span className="block">{t('loyalty.sms.editor.length_hint', 'Counted with your own name in the tags; each member’s copy is counted with theirs, and Send says the total.')}</span>
            </div>
            <p className="text-xs text-a-text-2">{t('loyalty.sms.editor.stop_hint', 'Many countries require marketing SMS to say how to stop them, for example “Reply STOP to opt out”.')}</p>
            {unknown.length > 0 && (
              <div data-unknown-tags="">
                <Notice tone="warning">{t('loyalty.sms.editor.unknown_tags', '{{tags}} will reach members as written: no tag of that name is filled in.', { tags: unknown.join(', ') })}</Notice>
              </div>
            )}
          </div>

          <FormField label={t('loyalty.sms.editor.audience', 'Who receives it')} problem={problem('segment_id')}
            hint={t('loyalty.sms.editor.audience_hint', 'Only the segment’s members who turned on offers by SMS and have a phone number with its country code get it. Send shows the exact number first.')}>
            <select value={form.segment_id} onChange={(e) => update({ segment_id: e.target.value })} className={INPUT}>
              <option value="">{t('loyalty.sms.editor.choose_segment', 'Choose a segment')}</option>
              {list.map(x => (
                <option key={x.id} value={String(x.id)}>
                  {x.problem
                    ? t('loyalty.sms.editor.segment_problem', '{{name}} (a rule needs fixing)', { name: x.name })
                    : t('loyalty.sms.editor.segment_option', '{{name}} · {{number}} members', { name: x.name, number: points(x.members, locale) })}
                </option>
              ))}
              {chosenGone && <option value={form.segment_id}>{t('loyalty.sms.editor.segment_gone', 'A segment that no longer exists')}</option>}
            </select>
          </FormField>
          <Reach counting={counting} dirty={dirty} audience={audience} locale={locale} />
        </section>

        <section aria-labelledby="sms-preview" className="min-w-0 space-y-2">
          <Eyebrow><span id="sms-preview">{t('loyalty.sms.preview.heading', 'On a phone')}</span></Eyebrow>
          <PhoneBubble text={preview} from={options.twilio.from} sample={preview !== form.body.replace(/\r\n?/g, '\n')} />
        </section>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-a-border pt-4">
        <Button variant="secondary" size="sm" loading={duplicate.isPending} onClick={() => duplicate.mutate()}>
          <Copy size={14} aria-hidden />{t('loyalty.sms.editor.duplicate', 'Duplicate')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen('delete')}>
          <Trash2 size={14} aria-hidden />{t('loyalty.sms.editor.delete', 'Delete draft')}
        </Button>
      </div>
      {duplicate.isError && <Refusal family="duplicate" failure={failureOf(duplicate.error)} />}

      {open === 'send' && <SmsSendDialog sms={s} onClose={() => setOpen(null)} />}
      {open === 'delete' && <DeleteDraft id={s.id} name={s.name} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** The tags the server fills, as buttons; one goes where the cursor was in the text. The press keeps the focus in the text. */
function TagButtons({ options, noRoom, onInsert }: { options: SmsOptions; noRoom: boolean; onInsert: (tag: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5" data-tags="">
      <p className="text-xs font-medium text-a-text-2">{t('loyalty.sms.tags.title', 'Tags')}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.tags.map(tag => (
          <Button key={tag.tag} type="button" size="sm" variant="secondary" title={tag.tag} onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(tag.tag)}>
            {tag.name in TAG_WORDS ? t(`loyalty.campaigns.tag.${tag.name}`, TAG_WORDS[tag.name]) : tag.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-a-text-2">{t('loyalty.sms.tags.where', 'A tag goes where the cursor is in the text. Each member’s copy shows their own.')}</p>
      {noRoom && <p className="text-xs font-medium text-a-danger">{t('loyalty.sms.tags.no_room', 'There is no room for that tag in the text.')}</p>}
    </div>
  )
}

/** Who the saved draft would text now, and the SMS parts that comes to; "save first" while the form differs. */
function Reach({ counting, dirty, audience, locale }: {
  counting: boolean
  dirty: boolean
  audience: UseQueryResult<{ audience: SmsAudience }>
  locale: string
}) {
  const { t } = useTranslation()
  const n = (count: number) => points(count, locale)
  if (dirty) return <p className="text-sm text-a-text-2" data-reach="unsaved">{t('loyalty.sms.reach.save_first', 'Save the draft to count who it reaches.')}</p>
  if (!counting) return <p className="text-sm text-a-text-2" data-reach="none">{t('loyalty.sms.reach.choose', 'Choose a segment to see who it reaches.')}</p>
  if (audience.isError) return <Refusal family="audience" failure={failureOf(audience.error)} />
  const a = audience.data?.audience
  if (!a) {
    return (
      <div role="status" className="space-y-1">
        <span className="sr-only">{t('loyalty.sms.send.counting', 'Counting who it will reach…')}</span>
        <Skeleton className="h-5 w-2/3" />
      </div>
    )
  }
  const said = confirmationOf(a)
  return (
    <div className="space-y-1 rounded-xl border border-a-border bg-a-surface-2 px-3.5 py-2.5 text-sm" data-reach="counted">
      <p className="font-medium text-a-text">
        {t('loyalty.sms.reach.counted', 'It would reach {{number}} of the {{members}} members of {{segment}} now: {{segments}} SMS in all.', {
          number: n(a.reached), members: n(a.members), segment: a.segment.name, segments: n(a.segments),
        })}
      </p>
      {said.reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-a-text-2">
          {said.reasons.map(r => <li key={r.code}>{t(`loyalty.sms.not_reached.${r.code}`, NOT_REACHED_WORDS[r.code], { number: n(r.count) })}</li>)}
        </ul>
      )}
    </div>
  )
}

/** The step before a draft is deleted. */
function DeleteDraft({ id, name, onClose }: { id: number; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => smsApi.remove(id),
    onSuccess: () => {
      afterSmsChange(client, null)
      client.removeQueries({ queryKey: smsKey(id) })
      navigate({ pathname: '/loyalty/campaigns', search: smsSearch(null) })
    },
    onError: (error) => { if (failureOf(error).code === 'not_a_draft') afterSmsChange(client, id) },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  return (
    <ConfirmDialog title={t('loyalty.sms.delete.title', 'Delete {{name}}?', { name })}
      confirm={t('loyalty.sms.delete.confirm', 'Delete draft')} keep={t('loyalty.sms.delete.keep', 'Keep it')}
      busy={remove.isPending} failure={failure && t(...refusalKey('loyalty.sms', ERRORS, 'remove', failure))}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('loyalty.sms.delete.body', 'The draft goes for good. Nothing was sent from it.')}</p>
    </ConfirmDialog>
  )
}
