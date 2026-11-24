import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Clipboard, FileText, ListPlus, Mail, Megaphone, Save, Sparkles, Target } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { Card } from '../ui/Card'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SectionNav } from '../ui/SectionNav'
import { useToast } from '../ui/Toast'
import { assistantKey, MODES, SALES_FIELD, strategyMode, working, type Assistant, type Mode, type Result, type Strategy, type useAssistant } from './assistantData'

const ICONS = { brief: Sparkles, sales_strategy: Target, marketing_strategy: Megaphone, proposal: FileText, reply: Mail }
const CONTEXT_FIELDS = ['customer_fields', 'business_fields', 'activities', 'chats', 'emails', 'whatsapp'] as const
const OUTPUT_TEXT = 'whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-a-text'
type Email = { subject: string; body: string }
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
  const emailMode = mode === 'proposal' || mode === 'reply'
  const strategies = Object.keys(data.strategies)
  const generate = useMutation({
    mutationFn: () => send<Assistant>('post', `crm/leads/${leadId}/assistant`, {
      mode, language: (i18n.resolvedLanguage ?? 'en').split('-')[0], focus: focus.trim(),
    }),
    onSuccess: next => cache.setQueryData(key, next),
  })
  const failure = data.run?.mode === mode && data.run.status === 'failed' ? data.run.error : null
  return (
    <div className="space-y-4">
      <Card title={t(`crm.sales.modes.${mode}`)} hint={data.brand.name} icon={ICONS[mode]} tone="ai">
        <div className="space-y-3">
          <p className="text-sm text-a-text-2">{t(`crm.sales.describe.${mode}`)}</p>
          {emailMode && (
            <p className="text-sm text-a-text-2">{strategies.length > 0
              ? t('crm.sales.strategy.available', { plans: strategies.map(item => t(`crm.sales.modes.${item}`)).join(' · ') })
              : t('crm.sales.strategy.none')}</p>
          )}
          <label className="block space-y-1 text-sm font-medium text-a-text">
            <span>{t('crm.sales.focus')}</span>
            <textarea className={SALES_FIELD} rows={2} maxLength={600} value={focus} onChange={event => setFocus(event.target.value)}
              placeholder={t(`crm.sales.examples.${mode}`)} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to={`/crm/settings?tab=business&for_brand=${data.brand.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-a-accent-text hover:underline">
              <ArrowUpRight size={15} aria-hidden />{t('crm.sales.profile.title')}
            </Link>
            <Button size="sm" className="crm-ai-fill" loading={generate.isPending || (generating && data.run?.mode === mode)}
              disabled={generating} onClick={() => generate.mutate()}>
              <Sparkles size={15} aria-hidden />{t(result ? 'crm.sales.regenerate' : 'crm.sales.generate')}
            </Button>
          </div>
          {generating && data.run && (
            <p role="status" className="text-sm text-a-text-2">{t('crm.sales.working', { mode: t(`crm.sales.modes.${data.run.mode}`) })}</p>
          )}
          {generate.error && <div role="alert"><Notice tone="danger">{assistantError(t, generate.error)}</Notice></div>}
          {failure && <div role="status"><Notice tone="warning">{jobError(t, failure)}</Notice></div>}
        </div>
      </Card>
      {result && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(250px,0.42fr)]">
          <Card title={t(emailMode ? 'crm.sales.email.draft' : 'crm.sales.result')} icon={emailMode ? Mail : FileText} tone="ai"
            hint={timeAgo(result.generated_at, i18n.language)}>
            {emailMode
              ? <DraftEditor key={result.id} initial={{ subject: result.subject ?? '', body: result.body ?? '' }}
                recipient={recipient} onUse={onUse} />
              : <Insight result={result} />}
          </Card>
          <div className="space-y-4">
            <CoverageCard coverage={result.coverage} mode={mode} onEmails={onEmails} />
            {result.review_notes.length > 0 && (
              <Card title={t('crm.sales.review')} icon={Clipboard} tone="pending">
                <ul className="list-disc space-y-1 pl-4 text-sm text-a-text-2">{result.review_notes.map((note, index) => <li key={index} className="[overflow-wrap:anywhere]">{note}</li>)}</ul>
              </Card>
            )}
          </div>
        </div>
      )}
      {strategyMode(mode) && <StrategyEditor leadId={leadId} mode={mode} data={data} result={result} />}
      {emailMode && result && (
        <p className="text-xs text-a-text-2">{t('crm.sales.email.edit_hint')}</p>
      )}
    </div>
  )

  function jobError(translate: typeof t, code: string) {
    return code === 'ai_budget_used_up' ? translate('crm.errors.ai_budget_used_up')
      : ['assistant_timed_out', 'assistant_unavailable', 'assistant_access_changed'].includes(code) ? translate(`crm.sales.errors.${code}`)
      : translate('crm.errors.ai_failed')
  }

  function assistantError(translate: typeof t, error: unknown) {
    return failureOf(error).code === 'assistant_unavailable' ? translate('crm.sales.errors.assistant_unavailable') : errorText(translate, error)
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
  const fields = [...CONTEXT_FIELDS, ...(['other_logged_emails', 'discovery_fields', 'writing_samples'] as const).filter(key => coverage[key])]
  const target = coverage.reply_to
  const channelLabels = { whatsapp: 'crm.whatsapp.title', chat: 'crm.sales.context.chats', activity: 'crm.sales.context.activities' } as const
  const replySource = target?.channel === 'email' ? target.subject || t('crm.mail.no_subject')
    : target ? t(channelLabels[target.channel]) : null
  return (
    <Card title={t('crm.sales.context.title')} icon={BookOpen} tone="neutral">
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
        {coverage.strategies.length > 0 && <p>{t('crm.sales.strategy.used', { plans: coverage.strategies.map(item => t(`crm.sales.modes.${item}`)).join(' · ') })}</p>}
        {mode === 'reply' && <p className="break-words">{replySource
          ? t('crm.sales.email.reply_to', { subject: replySource })
          : t('crm.sales.email.reply_missing')}</p>}
        {(coverage.emails > 0 || mode === 'reply') && (
          <button type="button" className="text-left font-medium text-a-accent-text hover:underline" onClick={onEmails}>{t('crm.sales.email.view_history')}</button>
        )}
      </div>
    </Card>
  )
}

function DraftEditor({ initial, recipient, onUse }: { initial: Email; recipient?: string | null; onUse: Actions['onUse'] }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [draft, setDraft] = useState(initial)
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
        <span>{t('crm.sales.email.subject')}</span>
        <input className={SALES_FIELD} value={draft.subject} maxLength={240} onChange={event => setDraft({ ...draft, subject: event.target.value })} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-a-text">
        <span>{t('crm.sales.email.body')}</span>
        <textarea className={`${SALES_FIELD} min-h-56 resize-y leading-relaxed`} value={draft.body} maxLength={10000}
          rows={12} onChange={event => setDraft({ ...draft, body: event.target.value })} />
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={() => void copy()}><Clipboard size={15} aria-hidden />{t('crm.common.copy')}</Button>
        <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={() => onUse(draft)}><ListPlus size={15} aria-hidden />{t('crm.sales.email.use_activity')}</Button>
        {href && <a href={href} className="crm-ai-soft inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"><Mail size={15} aria-hidden />{t('crm.sales.email.open')}</a>}
      </div>
    </div>
  )
}
