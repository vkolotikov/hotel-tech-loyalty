import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Bot, CalendarClock, Check, Clock3, GraduationCap, ListPlus, RotateCcw, Sparkles, UserRoundCheck, X, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { VoiceButton } from '../ai/VoiceButton'
import { appendWords } from '../ai/voice'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { useRefresh } from '../lib/queries'
import type { AssistantProposal } from '../lib/types'
import { Card } from '../ui/Card'
import { Page } from '../ui/Page'
import { TextArea } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { MESSAGE_MAX, blocks, historyFor, pending, proposalText, suggestions, type ChatMessage, type SuggestionKey } from './assistantLogic'

const KIND_ICONS: Record<AssistantProposal['kind'], LucideIcon> = { create: ListPlus, assign: UserRoundCheck, move: CalendarClock, set_length: Clock3 }

const SUGGESTION_DEFAULTS: Record<SuggestionKey, string> = {
  plan_tomorrow_team: 'Plan tomorrow for the team: who does what and when?',
  fill_week: 'Fill next week from the pool, fairly and by skills.',
  best_at: 'Who does {{type}} best, and who could use support?',
  last_week: 'How did last week go? What should we change?',
  longer_than_planned: 'Which tasks take longer than we plan?',
  plan_my_day: 'Plan my day.',
  pool_for_me: 'What should I take from the pool?',
  my_week: 'How did my week go?',
}

/** The conversation is kept for the browser's session (a convenience; it never reaches anyone else). */
function storageKey(userId: number): string {
  return `time:assistant:${userId}`
}

function loadMessages(userId: number): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(-40) : []
  } catch {
    return []
  }
}

/**
 * The AI assistant (2026-11-14): ask about the team's days and weeks; it looks things up in the planner (a day, a week,
 * the pool, the team, what the planner learned, a period's figures) and proposes changes — each already checked by the
 * server against the person's rights — which the person applies one by one or all at once, through the planner's own
 * endpoints. Nothing changes without a press.
 */
export function AssistantPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const lang = (i18n.language || 'en').slice(0, 2)
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(boot.staff.id))
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const readiness = useQuery({ queryKey: ['time', 'coach', 'readiness'], queryFn: () => timeApi.coach(), staleTime: 5 * 60_000 })
  const manager = boot.staff.can.manage_settings
  const firstType = boot.settings.groups[0]?.name ?? null

  useEffect(() => {
    try { window.sessionStorage.setItem(storageKey(boot.staff.id), JSON.stringify(messages.slice(-40))) } catch { /* private window: kept in memory only */ }
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages, boot.staff.id])

  const ask = useMutation({
    mutationFn: (sent: ChatMessage[]) => timeApi.assistant(historyFor(sent), lang),
    onSuccess: answer => setMessages(list => [...list, {
      // Ids by place: the conversation only grows, and a new one starts empty.
      id: `a${list.length}`, role: 'assistant',
      content: answer.reply || t('time.assistant.no_reply', 'I looked, but could not put an answer together. Try asking more narrowly.'),
      proposals: answer.proposals,
    }]),
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const apply = useMutation({
    mutationFn: async ({ list }: { messageId: string; list: AssistantProposal[] }) => {
      const results: Record<string, 'done' | 'failed'> = {}
      let refused: unknown = null
      for (const p of list) {
        try { await timeApi.applyProposal(p); results[p.id] = 'done' } catch (error) { results[p.id] = 'failed'; refused ??= error }
      }
      return { results, refused }
    },
    onSuccess: ({ results, refused }, { messageId }) => {
      refresh()
      setMessages(list => list.map(m => (m.id === messageId ? { ...m, outcome: { ...m.outcome, ...results } } : m)))
      const done = Object.values(results).filter(r => r === 'done').length
      if (done > 0) toast(t('time.assistant.applied', 'Changes applied: {{count}}', { count: done }))
      if (refused) toast(errorText(t, refused), 'danger')
    },
  })

  const send = (text: string) => {
    const content = text.trim().slice(0, MESSAGE_MAX)
    if (!content || ask.isPending) return
    const next: ChatMessage[] = [...messages, { id: `u${messages.length}`, role: 'user', content }]
    setMessages(next)
    setDraft('')
    ask.mutate(next)
  }
  const restart = () => { setMessages([]); setDraft(''); box.current?.focus() }

  const score = readiness.data?.readiness.score ?? null

  return (
    <Page wide title={t('time.assistant.title', 'AI assistant')}
      line={t('time.assistant.line', 'Ask about the team’s days and weeks. It looks things up in the planner and proposes changes you apply.')}
      actions={messages.length > 0 ? <Button variant="secondary" onClick={restart}><RotateCcw size={14} aria-hidden />{t('time.assistant.new', 'New conversation')}</Button> : undefined}>
      {!boot.ai.ready && <Notice tone="info">{t(`time.ai_state.${boot.ai.state}`, t('time.ai_state.unknown', 'The AI cannot be asked just now.'))}</Notice>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label={t('time.assistant.conversation', 'Conversation')} className="flex min-h-[60vh] min-w-0 flex-col rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-4 py-6 text-center">
                <span aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-2xl time-ai-soft"><Sparkles size={22} /></span>
                <p className="font-a-display text-xl text-a-text">{t('time.assistant.hello', 'What shall we plan, {{name}}?', { name: boot.staff.name.split(' ')[0] })}</p>
                <p className="mx-auto max-w-lg text-sm text-a-text-2">{t('time.assistant.hello_line', 'I know the team’s skills, hours and history, the pool and the plan. I suggest; you decide what is applied.')}</p>
                <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestions(manager, boot.staff.can.plan_team, firstType).map(key => {
                    const text = t(`time.assistant.suggest.${key}`, SUGGESTION_DEFAULTS[key], { type: firstType ?? '' })
                    return (
                      <button key={key} type="button" onClick={() => send(text)} disabled={!boot.ai.ready || ask.isPending}
                        className="rounded-full border border-a-border bg-a-surface px-3.5 py-2 text-left text-sm text-a-text transition-colors hover:border-a-accent disabled:opacity-50">
                        {text}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {messages.map(m => m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-a-accent px-3.5 py-2.5 text-sm text-a-accent-ink">{m.content}</p>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-xl time-ai-soft"><Bot size={16} /></span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="space-y-2 text-sm leading-relaxed text-a-text">
                    {blocks(m.content).map((b, i) => b.kind === 'p'
                      ? <p key={i}>{b.text}</p>
                      : <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((item, j) => <li key={j}>{item}</li>)}</ul>)}
                  </div>
                  {(m.proposals?.length ?? 0) > 0 && (
                    <div className="space-y-2 rounded-2xl border p-3 time-ai-border">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.12em] text-a-text-2">{t('time.assistant.proposed', 'Proposed changes')}</p>
                        {pending(m).length > 1 && (
                          <Button size="sm" onClick={() => apply.mutate({ messageId: m.id, list: pending(m) })} loading={apply.isPending && apply.variables?.messageId === m.id}>
                            <Check size={14} aria-hidden />{t('time.assistant.apply_all', 'Apply all ({{count}})', { count: pending(m).length })}
                          </Button>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {(m.proposals ?? []).map(p => {
                          const Icon = KIND_ICONS[p.kind]
                          const outcome = m.outcome?.[p.id]
                          return (
                            <li key={p.id} className="flex flex-wrap items-start gap-3 rounded-xl bg-a-surface-2 p-2.5">
                              <Icon size={16} aria-hidden className="mt-0.5 shrink-0 time-ai-text" />
                              <div className="min-w-0 flex-1 basis-48">
                                <p className="text-sm text-a-text">{proposalText(t, p, i18n.language, units)}</p>
                                {p.note && <p className="text-xs text-a-text-2">{p.note}</p>}
                              </div>
                              {outcome === 'done'
                                ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-a-st-confirmed"><Check size={14} aria-hidden />{t('time.assistant.done', 'Applied')}</span>
                                : outcome === 'failed'
                                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-a-danger"><X size={14} aria-hidden />{t('time.assistant.failed', 'Not applied')}</span>
                                  : <Button size="sm" variant="secondary" onClick={() => apply.mutate({ messageId: m.id, list: [p] })} disabled={apply.isPending}>{t('time.assistant.apply', 'Apply')}</Button>}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {ask.isPending && (
              <div className="flex gap-3" role="status">
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-xl time-ai-soft"><Bot size={16} /></span>
                <p className="flex items-center gap-2 text-sm text-a-text-2"><span aria-hidden className="h-2 w-2 animate-pulse rounded-full time-ai-fill" />{t('time.assistant.thinking', 'Looking at the planner…')}</p>
              </div>
            )}
            <div ref={end} />
          </div>

          <form className="flex items-end gap-2 border-t border-a-border p-3" onSubmit={e => { e.preventDefault(); send(draft) }}>
            <TextArea ref={box} rows={2} value={draft} maxLength={MESSAGE_MAX} disabled={!boot.ai.ready}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft) } }}
              aria-label={t('time.assistant.ask', 'Ask the assistant')} placeholder={t('time.assistant.placeholder', 'Ask anything about the plan, the team or the pool…')} />
            {boot.features.voice && <VoiceButton language={i18n.language} onText={words => setDraft(before => appendWords(before, words))} />}
            <Button type="submit" disabled={!draft.trim() || !boot.ai.ready} loading={ask.isPending} aria-label={t('time.assistant.send', 'Send')}><ArrowUp size={16} aria-hidden /></Button>
          </form>
        </section>

        <aside className="min-w-0 space-y-5">
          <Card title={t('time.assistant.knows', 'What the AI knows')} icon={GraduationCap}
            description={t('time.assistant.knows_line', 'The more you teach it, the better it plans.')}>
            {score !== null && (
              <div className="space-y-2">
                <p className="flex items-baseline gap-2"><span className="font-a-display text-3xl text-a-text">{score}%</span><span className="text-sm text-a-text-2">{t('time.assistant.ready', 'ready')}</span></p>
                <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-a-surface-2"><span className="block h-full time-ai-fill" style={{ width: `${score}%` }} /></span>
              </div>
            )}
            <Link to="/time/coach" className="mt-3 inline-flex text-sm font-semibold text-a-accent-text hover:underline">{t('time.assistant.open_coach', 'Teach it in the AI coach')}</Link>
          </Card>
          <Card title={t('time.assistant.tips', 'Ask it to…')} icon={Sparkles}>
            <ul className="space-y-1.5 text-sm text-a-text-2">
              <li>{t('time.assistant.tip_1', 'plan a day or a week, for you or the team')}</li>
              <li>{t('time.assistant.tip_2', 'share out the pool by skills and free time')}</li>
              <li>{t('time.assistant.tip_3', 'say how long work really takes')}</li>
              <li>{t('time.assistant.tip_4', 'review how a day or a week went')}</li>
            </ul>
          </Card>
        </aside>
      </div>
    </Page>
  )
}
