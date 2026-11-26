import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Clipboard, Clock3, FileText, ListPlus, Mail, Megaphone, Save, Sparkles, Target } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SectionNav } from '../ui/SectionNav'
import { useToast } from '../ui/Toast'
import { assistantKey, MODES, SALES_FIELD, strategyMode, working, type Assistant, type Mode, type Result, type Strategy, type useAssistant } from './assistantData'

import { OpportunityQuote } from './OpportunityQuote'

const ICONS = { brief: Sparkles, sales_strategy: Target, marketing_strategy: Megaphone, proposal: FileText, reply: Mail, follow_up: Clock3 }
const CONTEXT_FIELDS = ['customer_fields', 'business_fields', 'activities', 'chats', 'emails', 'whatsapp'] as const
const OUTPUT_TEXT = 'whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-a-text'
type Email = { subject: string; body: string }
type DraftAction = { focus: string; revise?: Email & { source_id: string; revision: number } }
type Actions = { onEmails: () => void; onUse: (email: Email) => void }

export function LeadAssistantPanel({ leadId, recipient, mode, onMode, query, onEmails, onUse }: {
  leadId: number
  recipient?: string | null
  mode: Mode
  onMode: (mode: Mode) => void
  query: ReturnType<typeof useAssistant>
} & Actions) {
  const { t } = useTranslation()
  const id = useId()
  const panel = `${id}-panel`
  return (
    <div className="space-y-4">
      <SectionNav label={t('crm.sales.title')} idPrefix={id} panelId={panel} value={mode} onChange={onMode}
        sections={MODES.map(key => ({
          key, icon: ICONS[key], tone: 'ai',
          title: t(`crm.sales.modes.${key}`),
          badge: strategyMode(key) && query.data?.strategies[key] ? <span aria-label={t('crm.sales.strategy.saved_label')}>✓</span> : undefined,
        }))} />
      <div id={panel} role="tabpanel" aria-labelledby={`${id}-${mode}`}>
        <QueryState loading={query.isLoading} error={query.data ? null : query.error} rows={3} onRetry={() => void query.refetch()}>
          {query.data && <AssistantMode key={`${leadId}:${mode}`} data={query.data} leadId={leadId} mode={mode}
            recipient={recipient} onEmails={onEmails} onUse={onUse} />}
        </QueryState>
      </div>
    </div>
  )
}

function AssistantMode({ data, leadId, mode, recipient, onEmails, onUse }: {
  data: Assistant
  leadId: number
  mode: Mode
  recipient?: string | null
} & Actions) {
  const { t, i18n } = useTranslation()
  const cache = useQueryClient()
  const [focus, setFocus] = useState('')
  const key = assistantKey(leadId)
  const generating = working(data.run)
  const result = data.results[mode]
  const emailMode = mode === 'proposal' || mode === 'reply' || mode === 'follow_up'
  const held = result?.decision && result.decision !== 'draft'
  const review = data.reviews?.[mode]
  const showSetup = !emailMode || !result || held
  const notes = [...new Set(result?.review_notes ?? [])].filter(note => note.trim() && (!held || note !== result?.reason)).slice(0, emailMode ? 3 : 6)
  const generate = useMutation({
    mutationFn: (action?: DraftAction) => send<Assistant>('post', `crm/leads/${leadId}/assistant`, {
      mode, language: (i18n.resolvedLanguage ?? 'en').split('-')[0], ...(action ?? { focus: focus.trim() }),
    }),
    onSuccess: next => cache.setQueryData(key, next),
    onError: error => {
      if (failureOf(error).code === 'strategy_changed') void cache.invalidateQueries({ queryKey: key })
    },
  })
  const failure = data.run?.mode === mode && data.run.status === 'failed' ? data.run.error : null
  return (
    <div className="space-y-4">
      {showSetup && <Card title={t(`crm.sales.modes.${mode}`)} hint={data.brand.name} icon={ICONS[mode]} tone="ai">
        <div className="space-y-3">
          <p className="text-sm text-a-text-2">{t(`crm.sales.describe.${mode}`)}</p>
          {(!emailMode || !result || held) && <label className="block space-y-1 text-sm font-medium text-a-text">
            <span>{t('crm.sales.focus')}</span>
            <textarea className={SALES_FIELD} rows={2} maxLength={600} value={focus} onChange={event => setFocus(event.target.value)}
              placeholder={t(`crm.sales.examples.${mode}`)} />
          </label>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to={`/crm/settings?tab=business&for_brand=${data.brand.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-a-accent-text hover:underline">
              <ArrowUpRight size={15} aria-hidden />{t('crm.sales.profile.title')}
            </Link>
            {(!emailMode || !result || held) && <Button size="sm" className="crm-ai-fill" loading={generate.isPending || (generating && data.run?.mode === mode)}
              disabled={generating} onClick={() => generate.mutate()}>
              <Sparkles size={15} aria-hidden />{t(result ? 'crm.sales.regenerate' : 'crm.sales.generate')}
            </Button>}
          </div>
        </div>
      </Card>}
      {generating && data.run && <p role="status" className="text-sm text-a-text-2">{t('crm.sales.working', { mode: t(`crm.sales.modes.${data.run.mode}`) })}</p>}
      {generate.error && <div role="alert"><Notice tone="danger">{assistantError(t, generate.error)}</Notice></div>}
      {failure && <div role="status"><Notice tone="warning">{jobError(t, failure)}</Notice></div>}
      {result && (
        <div className="space-y-3">
          <Card title={t(held ? `crm.sales.email.${result.decision}` : emailMode ? 'crm.sales.email.draft' : 'crm.sales.result')} icon={held ? Clock3 : emailMode ? Mail : FileText} tone="ai"
            hint={timeAgo(result.generated_at, i18n.language)}>
            {emailMode && result.new_correspondence && <div role="status" className="mb-3"><Notice tone="warning">{t('crm.sales.email.new_correspondence')}</Notice></div>}
            {held ? <p role="status" className={OUTPUT_TEXT}>{result.reason}</p> : emailMode
              ? <DraftEditor key={result.id} initial={review?.source_id === result.id ? review : { subject: result.subject ?? '', body: result.body ?? '' }}
                recipient={recipient} onUse={onUse} leadId={leadId} mode={mode} resultId={result.id} data={data}
                busy={generate.isPending || generating} onGenerate={action => generate.mutate(action)} />
              : <Insight result={result} />}
          </Card>
          {notes.length > 0 && <Card title={t(emailMode ? 'crm.sales.email.recommendations' : 'crm.sales.review')} icon={Clipboard} tone="pending">
            <ul className="list-disc space-y-1 pl-4 text-sm text-a-text">{notes.map(note => <li key={note} className="[overflow-wrap:anywhere]">{note}</li>)}</ul>
          </Card>}
          <div className="space-y-2">
            <details className="rounded-xl border border-a-border p-3 text-sm text-a-text">
              <summary className="cursor-pointer font-medium">{t('crm.sales.context.title')}</summary>
              <CoverageCard coverage={result.coverage} mode={mode} onEmails={onEmails} />
              {Boolean(result.knowledge_trace?.sources.length) && <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-a-text-2">
                {result.knowledge_trace?.sources.map(s => <li key={s.id}>{s.title}</li>)}
              </ul>}
              <Link to={`/crm/settings?tab=business&for_brand=${data.brand.id}`} className="mt-2 inline-flex items-center gap-1 text-a-accent-text hover:underline">
                <ArrowUpRight size={14} aria-hidden />{t('crm.sales.profile.title')}
              </Link>
            </details>
            {result.knowledge_trace && result.knowledge_trace.questions.length > 0 && <details className="rounded-xl border border-a-border p-3 text-sm text-a-text">
              <summary className="cursor-pointer font-medium">{t('inquiryDetail.proposal.evidence')}</summary>
              <ul className="mt-3 space-y-3">
                {result.knowledge_trace.questions.map(q => {
                  const trace = result.knowledge_trace!
                  const answer = trace.assessment?.find(row => row.id === q.id)
                  const titles = trace.sources.filter(row => (answer?.sources ?? []).includes(row.id)).map(row => row.title)
                  return <li key={q.id}><p>{q.need}</p>
                    {titles.length > 0 && <p className="text-xs text-a-text-2">{titles.join(' · ')}</p>}
                    {answer?.pending && <p className="text-xs text-a-text-2">{answer.pending}</p>}</li>
                })}
              </ul>
            </details>}
            {(result.intent || result.next_step || Boolean(result.unanswered?.length)) && (
              <details className="rounded-xl border border-a-border p-3 text-sm text-a-text">
                <summary className="cursor-pointer font-medium">{t('crm.sales.email.assessment')}</summary>
                <dl className="mt-3 space-y-2 text-sm">{(['intent', 'next_step', 'unanswered'] as const).map(field => {
                  const value = result[field]
                  return value?.length ? <div key={field}><dt className="font-medium text-a-text">{t(`crm.sales.email.${field}`)}</dt>
                    <dd className="whitespace-pre-line text-a-text-2">{Array.isArray(value) ? value.join('\n') : value}</dd></div> : null
                })}</dl>
              </details>
            )}
          </div>
        </div>
      )}
      {strategyMode(mode) && <StrategyEditor leadId={leadId} mode={mode} data={data} result={result} />}
      {emailMode && (data.can_review || data.quote) && <OpportunityQuote leadId={leadId} data={data} />}
    </div>
  )

  function jobError(translate: typeof t, code: string) {
    return code === 'ai_budget_used_up' ? translate('crm.errors.ai_budget_used_up')
      : code === 'strategy_changed' ? translate('crm.sales.reload')
      : ['assistant_timed_out', 'assistant_unavailable', 'assistant_access_changed', 'draft_revision_failed'].includes(code) ? translate(`crm.sales.errors.${code}`)
      : translate('crm.errors.ai_failed')
  }

  function assistantError(translate: typeof t, error: unknown) {
    const code = failureOf(error).code
    if (code === 'strategy_changed') return translate('crm.sales.reload')
    return code === 'assistant_unavailable' ? translate('crm.sales.errors.assistant_unavailable') : errorText(translate, error)
  }
}

function Insight({ result }: { result: Result }) {
  return (
    <div className="space-y-4">
      <p className={OUTPUT_TEXT}>{result.summary}</p>
      {result.sections?.map(({ title, body }, index) => (
        <section key={index} className="space-y-1 border-t border-a-border pt-3">
          <h3 className="break-words text-sm font-semibold text-a-text">{title}</h3>
          <p className={OUTPUT_TEXT}>{body}</p>
        </section>
      ))}
    </div>
  )
}

function StrategyEditor({ leadId, mode, data, result }: { leadId: number; mode: Strategy; data: Assistant; result?: Result }) {
  const { t, i18n } = useTranslation()
  const cache = useQueryClient()
  const toast = useToast()
  const key = assistantKey(leadId)
  const [edit, setEdit] = useState<{ body: string; revision: number } | null>(null)
  const saved = data.strategies[mode]
  const aiText = result ? [result.summary, ...(result.sections?.map(section => `${section.title}\n${section.body}`) ?? [])]
    .filter(Boolean).join('\n\n').slice(0, 10000) : ''
  const body = edit?.body ?? saved?.body ?? aiText
  const setBody = (draft: string) => setEdit({ body: draft, revision: edit?.revision ?? data.revision })
  const save = useMutation({
    mutationFn: () => send<Assistant>('put', `crm/leads/${leadId}/assistant`, {
      mode, revision: edit?.revision ?? data.revision, body: body.trim(),
    }),
    onSuccess: next => {
      cache.setQueryData(key, next)
      setEdit(null)
      toast(t('crm.sales.strategy.saved'))
    },
  })
  const changed = failureOf(save.error).code === 'strategy_changed'
  return (
    <Card title={t('crm.sales.strategy.title')} icon={BookOpen} tone="accent"
      hint={saved ? timeAgo(saved.saved_at, i18n.language) : undefined}
      action={saved ? <Pill tone="success">{t('crm.sales.strategy.saved_label')}</Pill> : undefined}>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault()
        if (body.trim() !== (saved?.body ?? '') && !save.isPending && !changed) save.mutate()
      }}>
        <label className="block space-y-1 text-sm font-medium text-a-text">
          <span>{t('crm.sales.strategy.edit')}</span>
          <textarea className={SALES_FIELD} value={body} onChange={event => setBody(event.target.value)}
            rows={result || saved ? 6 : 3} maxLength={10000} disabled={save.isPending} placeholder={t('crm.sales.strategy.placeholder')} />
        </label>
        {save.error && <div role="alert"><Notice tone="danger">{changed ? t('crm.sales.strategy.changed') : errorText(t, save.error)}</Notice></div>}
        <div className="flex flex-wrap justify-end gap-2">
          {changed && (
            <Button type="button" size="sm" variant="secondary" onClick={async () => {
              await cache.invalidateQueries({ queryKey: key })
              setEdit(null)
              save.reset()
            }}>{t('crm.sales.reload')}</Button>
          )}
          {aiText && body !== aiText && (
            <Button type="button" size="sm" variant="secondary" disabled={save.isPending} onClick={() => setBody(aiText)}>
              <Sparkles size={15} aria-hidden />{t('crm.sales.strategy.use_ai')}
            </Button>
          )}
          <Button type="submit" size="sm" loading={save.isPending} disabled={changed || body.trim() === (saved?.body ?? '')}>
            <Save size={15} aria-hidden />{t('crm.sales.strategy.save')}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function CoverageCard({ coverage, mode, onEmails }: { coverage: Result['coverage']; mode: Mode; onEmails: () => void }) {
  const { t } = useTranslation()
  const fields = [...CONTEXT_FIELDS, ...(['knowledge_answers', 'knowledge_documents'] as const).filter(key => coverage[key] !== undefined),
    ...(['other_logged_emails', 'discovery_fields', 'writing_samples', 'project_files', 'recorded_tasks', 'prior_orders'] as const).filter(key => coverage[key])]
  const target = coverage.reply_to
  const channelLabels = { whatsapp: 'crm.whatsapp.title', chat: 'crm.sales.context.chats', activity: 'crm.sales.context.activities' } as const
  const replySource = target?.channel === 'email' ? target.subject || t('crm.mail.no_subject')
    : target ? t(channelLabels[target.channel]) : null
  return (
    <div className="mt-3">
      <dl className="space-y-1.5 text-sm">
        {fields.map(key => (
          <div key={key} className="flex items-baseline justify-between gap-3">
            <dt className="text-a-text-2">{t(`crm.sales.context.${key}`)}</dt><dd className="tabular-nums text-a-text">{coverage[key]}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 space-y-2 border-t border-a-border pt-3 text-xs text-a-text-2">
        {coverage.email_state !== 'captured' && <p>{t(`crm.sales.mail.${coverage.email_state}`)}</p>}
        {coverage.whatsapp_state && coverage.whatsapp_state !== 'connected' && <p>{t('crm.whatsapp.title')} · {t(`crm.whatsapp.state.${coverage.whatsapp_state}`)}</p>}
        {coverage.history_limited && <p>{t('crm.sales.context.history_limited')}</p>}
        {coverage.project_history_limited && <p>{t('crm.sales.context.project_history_limited')}</p>}
        {coverage.strategies.length > 0 && <p>{t('crm.sales.strategy.used', { plans: coverage.strategies.map(item => t(`crm.sales.modes.${item}`)).join(' · ') })}</p>}
        {mode === 'reply' && <p className="break-words">{replySource
          ? t('crm.sales.email.reply_to', { subject: replySource })
          : t('crm.sales.email.reply_missing')}</p>}
        {(coverage.emails > 0 || mode === 'reply') && (
          <button type="button" className="text-left font-medium text-a-accent-text hover:underline" onClick={onEmails}>{t('crm.sales.email.view_history')}</button>
        )}
      </div>
    </div>
  )
}

function DraftEditor({ initial, recipient, onUse, leadId, resultId, mode, data, busy, onGenerate }: {
  initial: Email; recipient?: string | null; onUse: Actions['onUse']; leadId: number; resultId: string; mode: Mode; data: Assistant
  busy: boolean; onGenerate: (action: DraftAction) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const fieldId = useId()
  const [edit, setEdit] = useState<{ draft: Email; revision: number } | null>(null)
  const draft = edit?.draft ?? initial
  const revision = edit?.revision ?? data.revision
  const setDraft = (next: Email) => setEdit({ draft: next, revision })
  const [confirmFresh, setConfirmFresh] = useState(false)
  const edited = draft.subject !== initial.subject || draft.body !== initial.body
  const [comment, setComment] = useState('')
  const cache = useQueryClient()
  const key = assistantKey(leadId)
  const save = useMutation({
    mutationFn: () => send<Assistant>('put', `crm/leads/${leadId}/assistant/review`, {
      mode, revision, source_id: resultId, subject: draft.subject, body: draft.body,
    }),
    onSuccess: next => { cache.setQueryData(key, next); setEdit(null); toast(t('crm.sales.email.reviewed')) },
  })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`)
      toast(t('crm.common.copied'))
    } catch {
      toast(t('crm.errors.unknown'), 'danger')
    }
  }
  const recipientAddress = recipient?.trim() ?? ''
  const ready = draft.subject.trim() && draft.body.trim()
  const emailAddress = /^[^\s,@;<>?&:#/]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(recipientAddress) ? recipientAddress : null
  const href = emailAddress && ready
    ? `mailto:${encodeURIComponent(emailAddress).replace('%40', '@')}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : null

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm font-medium text-a-text">
        <span id={`${fieldId}-subject`}>{t('crm.sales.email.subject')}</span>
        <input aria-labelledby={`${fieldId}-subject`} className={SALES_FIELD} value={draft.subject} disabled={busy} maxLength={240} onChange={event => setDraft({ ...draft, subject: event.target.value })} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-a-text">
        <span id={`${fieldId}-body`}>{t('crm.sales.email.body')}</span>
        <textarea aria-labelledby={`${fieldId}-body`} className={`${SALES_FIELD} min-h-56 resize-y leading-relaxed`} value={draft.body} maxLength={10000}
          rows={12} disabled={busy} onChange={event => setDraft({ ...draft, body: event.target.value })} />
      </label>
      <div className="space-y-2 rounded-xl border border-a-border p-3">
        <label className="block space-y-1 text-sm font-medium text-a-text">
          <span>{t('inquiryDetail.proposal.comment')}</span>
          <textarea className={SALES_FIELD} rows={2} maxLength={600} value={comment} disabled={busy}
            placeholder={t('inquiryDetail.proposal.comment_hint')} onChange={event => setComment(event.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {data.results[mode]?.can_revise !== false && <Button type="button" size="sm" className="crm-ai-fill" disabled={busy || save.isPending || !ready || !comment.trim()}
            onClick={() => onGenerate({ focus: comment.trim(), revise: { source_id: resultId, revision, ...draft } })}>
            <Sparkles size={15} aria-hidden />{t('inquiryDetail.proposal.revise')}</Button>}
          <Button type="button" size="sm" variant="secondary" disabled={busy || save.isPending}
            onClick={() => edited ? setConfirmFresh(true) : onGenerate({ focus: comment.trim() })}>{t('inquiryDetail.proposal.fresh')}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {data.can_review && <Button type="button" size="sm" variant="secondary" loading={save.isPending} disabled={busy || !ready || (data.reviews?.[mode]?.source_id === resultId && draft.subject === initial.subject && draft.body === initial.body)}
          onClick={() => save.mutate()}><Save size={15} aria-hidden />{t('crm.sales.email.approve')}</Button>}
        <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={() => void copy()}><Clipboard size={15} aria-hidden />{t('crm.common.copy')}</Button>
        <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={() => onUse(draft)}><ListPlus size={15} aria-hidden />{t('crm.sales.email.use_activity')}</Button>
        {href && <a href={href} className="crm-ai-soft inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"><Mail size={15} aria-hidden />{t('crm.sales.email.open')}</a>}
      </div>
      {confirmFresh && <Confirm title={t('crm.sales.email.replace_edits')} confirm={t('inquiryDetail.proposal.fresh')} danger={false}
        onClose={() => setConfirmFresh(false)} onConfirm={() => { setConfirmFresh(false); onGenerate({ focus: comment.trim() }) }} />}
      {save.error && <Notice tone="danger">{failureOf(save.error).code === 'strategy_changed'
        ? <button type="button" className="underline" onClick={async () => {
          await cache.invalidateQueries({ queryKey: key })
          setEdit({ draft, revision: cache.getQueryData<Assistant>(key)?.revision ?? data.revision })
          save.reset()
        }}>{t('crm.sales.reload')}</button>
        : errorText(t, save.error)}</Notice>}
    </div>
  )
}
