import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, Save, Send, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { Eyebrow } from '../../workspace/ui/Typography'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { ConfirmDialog, FormField } from '../ui/formParts'
import { afterPushChange, pushApi, pushAudienceKey, pushKey, SEGMENTS_KEY } from './api'
import { ERRORS } from './errors'
import { CategoryName, Refusal, StatusBadge } from './parts'
import { PhonePreview } from './PhonePreview'
import {
  bodyOf, canCount, confirmationOf, draftProblems, formOf, isDirty, lengthGuide, pushSearch, sendBlockers, serverProblems, type PushForm,
} from './pushMath'
import { PushSendDialog } from './PushSendDialog'
import type { PushAnswer, PushAudience, PushOptions } from './types'
import { BLOCKER_WORDS, CATEGORY_HINT_WORDS, CATEGORY_WORDS, GUIDE_WORDS, NOT_REACHED_WORDS, PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * A draft push message (spec 2026-10-22 release 3 §5): its name, title (with how much of it a phone shows), message,
 * kind (the member's own switch in the app, from the server's list) and segment, beside a phone's view of it. Save
 * writes the draft; once it is saved with a segment and a kind, the page says who it would reach now. Send works on the
 * saved draft only, so what is confirmed is what goes out, and says first why it cannot be pressed yet.
 */
export function PushEditor({ answer }: { answer: PushAnswer }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { push: p, options } = answer
  const [form, setForm] = useState<PushForm>(() => formOf(p))
  const [tried, setTried] = useState(false)
  const [open, setOpen] = useState<'send' | 'delete' | null>(null)
  const segments = useQuery({ queryKey: SEGMENTS_KEY, queryFn: pushApi.segments })
  const dirty = isDirty(form, p)
  const counting = canCount(p, dirty)
  const audience = useQuery({ queryKey: pushAudienceKey(p.id), queryFn: () => pushApi.audience(p.id), enabled: counting, retry: false })

  const save = useMutation({
    mutationFn: () => pushApi.update(p.id, bodyOf(form)),
    onSuccess: (next) => {
      client.setQueryData(pushKey(p.id), next)
      setForm(formOf(next.push))
      setTried(false)
      afterPushChange(client, p.id)
    },
    onError: (error) => {
      const code = failureOf(error).code
      if (code === 'not_a_draft' || code === 'not_found') afterPushChange(client, p.id)
    },
  })
  const duplicate = useMutation({
    mutationFn: () => pushApi.duplicate(p.id, t('loyalty.push.copy_name', '{{name}} (copy)', { name: p.name })),
    onSuccess: (copy) => {
      client.setQueryData(pushKey(copy.push.id), copy)
      afterPushChange(client, null)
      navigate({ pathname: '/loyalty/campaigns', search: pushSearch(copy.push.id) })
    },
  })
  const update = (patch: Partial<PushForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const own = draftProblems(form, options)
  const server = serverProblems(failure?.fields)
  const problem = (field: string, max?: number): string | null => {
    const code = (tried ? own[field] : undefined) ?? server[field]
    return code ? t(`loyalty.push.problem.${code}`, PROBLEM_WORDS[code] ?? PROBLEM_WORDS.name, { max }) : null
  }
  const blockers = sendBlockers(p, dirty, segments.data?.segments)
  const list = segments.data?.segments ?? []
  const chosenGone = form.segment_id !== '' && segments.data !== undefined && !list.some(s => String(s.id) === form.segment_id)
  const guideLine = (text: string, guide: number, max: number): string => {
    const g = lengthGuide(text, guide, max)
    return t(`loyalty.push.guide.${g.state}`, GUIDE_WORDS[g.state], { chars: points(g.count, locale), guide, max })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-2">
          <h2 className="break-words font-a-display text-3xl font-normal leading-tight text-a-text">{p.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-a-text-2">
            <StatusBadge status={p.status} />
            {dirty && <span data-unsaved="">{t('loyalty.push.editor.unsaved', 'Changes not saved')}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button variant={dirty ? 'primary' : 'secondary'} loading={save.isPending} disabled={!dirty} onClick={() => {
            setTried(true)
            if (Object.keys(draftProblems(form, options)).length === 0) save.mutate()
          }}>
            <Save size={15} aria-hidden />{t('loyalty.push.editor.save', 'Save draft')}
          </Button>
          <Button disabled={blockers.length > 0} onClick={() => setOpen('send')}>
            <Send size={15} aria-hidden />{t('loyalty.push.editor.send', 'Send…')}
          </Button>
        </div>
      </div>

      {failure && <Refusal family="save" failure={failure} />}
      {blockers.length > 0 && (
        <div className="max-w-2xl" data-blockers="">
          <Notice tone="info">
            <p className="font-medium">{t('loyalty.push.editor.before_send', 'Before it can be sent:')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {blockers.map(code => <li key={code}>{t(`loyalty.push.blocker.${code}`, BLOCKER_WORDS[code])}</li>)}
            </ul>
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="push-edit" className="min-w-0 space-y-4">
          <Eyebrow><span id="push-edit">{t('loyalty.push.editor.heading', 'The message')}</span></Eyebrow>
          <FormField label={t('loyalty.push.editor.name', 'Name')} hint={t('loyalty.push.editor.name_hint', 'Only staff see it.')} problem={problem('name', options.max_name)}>
            <input type="text" value={form.name} maxLength={options.max_name} onChange={(e) => update({ name: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.push.editor.title', 'Title')} problem={problem('title', options.max_title)} hint={guideLine(form.title, options.title_guide, options.max_title)}>
            <input type="text" value={form.title} maxLength={options.max_title} onChange={(e) => update({ title: e.target.value })} className={INPUT}
              placeholder={t('loyalty.push.editor.title_example', 'e.g. Double points this weekend')} />
          </FormField>
          <FormField label={t('loyalty.push.editor.body', 'Message')} problem={problem('body', options.max_body)} hint={guideLine(form.body, options.body_guide, options.max_body)}>
            <textarea value={form.body} maxLength={options.max_body} rows={4} onChange={(e) => update({ body: e.target.value })} className={INPUT}
              placeholder={t('loyalty.push.editor.body_example', 'e.g. Every visit until Sunday earns double points.')} />
          </FormField>
          <CategoryChoice options={options} value={form.category} problem={problem('category')} onChange={(category) => update({ category })} />
          <FormField label={t('loyalty.push.editor.audience', 'Who receives it')} problem={problem('segment_id')}
            hint={t('loyalty.push.editor.audience_hint', 'Only the segment’s members with the app, push switched on and this kind of message switched on get it. Send shows the exact number first.')}>
            <select value={form.segment_id} onChange={(e) => update({ segment_id: e.target.value })} className={INPUT}>
              <option value="">{t('loyalty.push.editor.choose_segment', 'Choose a segment')}</option>
              {list.map(s => (
                <option key={s.id} value={String(s.id)}>
                  {s.problem
                    ? t('loyalty.push.editor.segment_problem', '{{name}} (a rule needs fixing)', { name: s.name })
                    : t('loyalty.push.editor.segment_option', '{{name}} · {{number}} members', { name: s.name, number: points(s.members, locale) })}
                </option>
              ))}
              {chosenGone && <option value={form.segment_id}>{t('loyalty.push.editor.segment_gone', 'A segment that no longer exists')}</option>}
            </select>
          </FormField>
          <Reach counting={counting} dirty={dirty} audience={audience} locale={locale} />
        </section>

        <section aria-labelledby="push-preview" className="min-w-0 space-y-2">
          <Eyebrow><span id="push-preview">{t('loyalty.push.preview.heading', 'On a phone')}</span></Eyebrow>
          <PhonePreview title={form.title} body={form.body} appName={boot.organization.name} titleGuide={options.title_guide} />
        </section>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-a-border pt-4">
        <Button variant="secondary" size="sm" loading={duplicate.isPending} onClick={() => duplicate.mutate()}>
          <Copy size={14} aria-hidden />{t('loyalty.push.editor.duplicate', 'Duplicate')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen('delete')}>
          <Trash2 size={14} aria-hidden />{t('loyalty.push.editor.delete', 'Delete draft')}
        </Button>
      </div>
      {duplicate.isError && <Refusal family="duplicate" failure={failureOf(duplicate.error)} />}

      {open === 'send' && <PushSendDialog push={p} onClose={() => setOpen(null)} />}
      {open === 'delete' && <DeleteDraft id={p.id} name={p.name} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** The kind of message: the server's categories, each with what the member's switch in the app covers. */
function CategoryChoice({ options, value, problem, onChange }: { options: PushOptions; value: string; problem: string | null; onChange: (category: string) => void }) {
  const { t } = useTranslation()
  const name = useId()
  return (
    <fieldset className="space-y-2" aria-describedby={`${name}-hint`}>
      <legend className="mb-1 text-xs font-medium text-a-text-2">{t('loyalty.push.editor.category', 'Kind of message')}</legend>
      <p id={`${name}-hint`} className="text-xs text-a-text-2">
        {t('loyalty.push.editor.category_hint', 'Members choose in the app which kinds they get. A member who switched this kind off does not get it, not even in the inbox.')}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.categories.map(c => (
          <label key={c} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${value === c ? 'border-a-accent-text bg-a-accent/10' : 'border-a-border bg-a-surface'}`}>
            <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} className="mt-1 h-4 w-4 shrink-0 accent-a-accent-text" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-a-text"><CategoryName category={c} /></span>
              {c in CATEGORY_WORDS && <span className="block text-xs text-a-text-2">{t(`loyalty.push.category_hint.${c}`, CATEGORY_HINT_WORDS[c])}</span>}
            </span>
          </label>
        ))}
      </div>
      {problem && <p className="text-xs font-medium text-a-danger">{problem}</p>}
    </fieldset>
  )
}

/** Who the saved draft would reach now, once it has a segment and a kind; "save first" while the form differs. */
function Reach({ counting, dirty, audience, locale }: {
  counting: boolean
  dirty: boolean
  audience: UseQueryResult<{ audience: PushAudience }>
  locale: string
}) {
  const { t } = useTranslation()
  const n = (count: number) => points(count, locale)
  if (dirty) {
    return <p className="text-sm text-a-text-2" data-reach="unsaved">{t('loyalty.push.reach.save_first', 'Save the draft to count who it reaches.')}</p>
  }
  if (!counting) {
    return <p className="text-sm text-a-text-2" data-reach="none">{t('loyalty.push.reach.choose', 'Choose a kind and a segment to see who it reaches.')}</p>
  }
  if (audience.isError) return <Refusal family="audience" failure={failureOf(audience.error)} />
  const a = audience.data?.audience
  if (!a) {
    return (
      <div role="status" className="space-y-1">
        <span className="sr-only">{t('loyalty.push.send.counting', 'Counting who it will reach…')}</span>
        <Skeleton className="h-5 w-2/3" />
      </div>
    )
  }
  const said = confirmationOf(a)
  return (
    <div className="space-y-1 rounded-xl border border-a-border bg-a-surface-2 px-3.5 py-2.5 text-sm" data-reach="counted">
      <p className="font-medium text-a-text">
        {t('loyalty.push.reach.counted', 'It would reach {{number}} of the {{members}} members of {{segment}} now.', { number: n(a.reached), members: n(a.members), segment: a.segment.name })}
      </p>
      {said.reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-a-text-2">
          {said.reasons.map(r => <li key={r.code}>{t(`loyalty.push.not_reached.${r.code}`, NOT_REACHED_WORDS[r.code], { number: n(r.count) })}</li>)}
        </ul>
      )}
    </div>
  )
}

/** The step before a draft is deleted. */
export function DeleteDraft({ id, name, onClose }: { id: number; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => pushApi.remove(id),
    onSuccess: () => {
      afterPushChange(client, null)
      client.removeQueries({ queryKey: pushKey(id) })
      navigate({ pathname: '/loyalty/campaigns', search: pushSearch(null) })
    },
    onError: (error) => { if (failureOf(error).code === 'not_a_draft') afterPushChange(client, id) },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  return (
    <ConfirmDialog title={t('loyalty.push.delete.title', 'Delete {{name}}?', { name })}
      confirm={t('loyalty.push.delete.confirm', 'Delete draft')} keep={t('loyalty.push.delete.keep', 'Keep it')}
      busy={remove.isPending} failure={failure && t(...refusalKey('loyalty.push', ERRORS, 'remove', failure))}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('loyalty.push.delete.body', 'The draft goes for good. Nothing was sent from it.')}</p>
    </ConfirmDialog>
  )
}
