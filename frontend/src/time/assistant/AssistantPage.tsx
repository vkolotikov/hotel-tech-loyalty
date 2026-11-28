import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight, ArrowUp, Award, BarChart3, CalendarCheck, CalendarClock, CalendarRange, ChevronRight, GraduationCap, Inbox, Mic, RotateCcw, Sparkles, Timer,
  TrendingUp, Wand2, type LucideIcon,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useTimeActions } from '../TimeActions'
import { useBoot } from '../TimeProvider'
import { VoiceButton } from '../ai/VoiceButton'
import { appendWords } from '../ai/voice'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { firstName } from '../lib/format'
import { staggerDelay } from '../lib/motion'
import { useRefresh } from '../lib/queries'
import type { AssistantProposal } from '../lib/types'
import { Card } from '../ui/Card'
import { CountUp, Dots, Orb, Ring, ShimmerLines } from '../ui/motion'
import { Page } from '../ui/Page'
import { useToast } from '../ui/Toast'
import { Answer, type Applying } from './Answer'
import { MESSAGE_MAX, historyFor, questionOf, suggestions, type ChatMessage, type SuggestionKey } from './assistantLogic'

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
const SUGGESTION_ICONS: Record<SuggestionKey, LucideIcon> = {
  plan_tomorrow_team: CalendarClock, fill_week: CalendarRange, best_at: Award, last_week: BarChart3, longer_than_planned: Timer,
  plan_my_day: CalendarCheck, pool_for_me: Inbox, my_week: TrendingUp,
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
 * The AI assistant (2026-11-14; its look and motion 2026-11-28): ask about the team's days and weeks; it looks things
 * up in the planner (a day, a week, the pool, the team, what the planner learned, a period's figures) and proposes
 * changes — each already checked by the server against the person's rights — which the person applies one by one or
 * all at once, through the planner's own endpoints. Nothing changes without a press. A fresh answer writes itself out;
 * while the AI works its orb turns and the lines to come shimmer; a question handed over in the address (`?q=`, from
 * Find) is asked at once. Beside the conversation: what the AI knows, and every other AI tool of the planner.
 */
export function AssistantPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const [search, setSearch] = useSearchParams()
  const lang = (i18n.language || 'en').slice(0, 2)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(boot.staff.id))
  const [draft, setDraft] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [applying, setApplying] = useState<Applying | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  // Whether the conversation follows its end: from the first question on, until the person scrolls up to read, and again
  // when they ask. An empty conversation starts at its top (on a phone its start screen is taller than the panel).
  const pinned = useRef(messages.length > 0)
  // Which conversation an answer belongs to: one that arrives after "New conversation" is dropped.
  const run = useRef(0)
  const readiness = useQuery({ queryKey: ['time', 'coach', 'readiness'], queryFn: () => timeApi.coach(), staleTime: 5 * 60_000 })
  const manager = boot.staff.can.manage_settings
  const firstType = boot.settings.groups[0]?.name ?? null
  const ready = boot.ai.ready

  useEffect(() => {
    try { window.sessionStorage.setItem(storageKey(boot.staff.id), JSON.stringify(messages.slice(-40))) } catch { /* private window: kept in memory only */ }
  }, [messages, boot.staff.id])

  // The conversation stays at its end while it grows (an answer writing itself, a change applied), unless the person scrolled up.
  useEffect(() => {
    const view = scroller.current
    const content = inner.current
    if (!view || !content || typeof ResizeObserver === 'undefined') return
    const onScroll = () => { pinned.current = view.scrollHeight - view.scrollTop - view.clientHeight < 120 }
    const observer = new ResizeObserver(() => { if (pinned.current) view.scrollTop = view.scrollHeight })
    view.addEventListener('scroll', onScroll, { passive: true })
    observer.observe(content)
    return () => { view.removeEventListener('scroll', onScroll); observer.disconnect() }
  }, [])

  // The box grows with what is typed, up to a few lines.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [draft])

  const ask = useMutation({
    mutationFn: ({ sent }: { sent: ChatMessage[]; run: number }) => timeApi.assistant(historyFor(sent), lang),
    onSuccess: (answer, { sent, run: asked }) => {
      if (asked !== run.current) return
      // Ids by place: the conversation only grows, and a new one starts empty.
      const id = `a${sent.length}`
      setMessages(list => [...list, {
        id, role: 'assistant',
        content: answer.reply || t('time.assistant.no_reply', 'I looked, but could not put an answer together. Try asking more narrowly.'),
        proposals: answer.proposals, used: answer.used,
      }])
      setFresh(id)
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const send = (text: string) => {
    const content = text.trim().slice(0, MESSAGE_MAX)
    if (!content || ask.isPending || !ready) return
    const next: ChatMessage[] = [...messages, { id: `u${messages.length}`, role: 'user', content }]
    pinned.current = true
    setMessages(next)
    setDraft('')
    ask.mutate({ sent: next, run: run.current })
  }
  const restart = () => {
    run.current += 1
    pinned.current = false
    setMessages([])
    setDraft('')
    setFresh(null)
    scroller.current?.scrollTo({ top: 0 })
    box.current?.focus()
  }

  // A question handed over in the address (Find's "Ask the AI"): asked once, then taken out of the address.
  const handed = questionOf(search)
  const sendLatest = useRef(send)
  useEffect(() => { sendLatest.current = send })
  useEffect(() => {
    if (!handed) return
    const id = window.setTimeout(() => {
      setSearch(prev => { const params = new URLSearchParams(prev); params.delete('q'); return params }, { replace: true })
      if (ready) sendLatest.current(handed)
      else setDraft(handed)
    }, 0)
    return () => window.clearTimeout(id)
  }, [handed, ready, setSearch])

  // Changes are applied one after another, each marked as it lands, through the planner call the server worked out.
  const apply = async (messageId: string, list: AssistantProposal[]) => {
    if (applying || list.length === 0) return
    const ids = list.map(p => p.id)
    let done = 0
    let refused: unknown = null
    for (const p of list) {
      setApplying({ messageId, ids, at: p.id })
      let outcome: 'done' | 'failed' = 'done'
      try { await timeApi.applyProposal(p); done += 1 } catch (error) { outcome = 'failed'; refused ??= error }
      setMessages(all => all.map(m => (m.id === messageId ? { ...m, outcome: { ...m.outcome, [p.id]: outcome } } : m)))
    }
    setApplying(null)
    refresh()
    if (done > 0) toast(t('time.assistant.applied', 'Changes applied: {{count}}', { count: done }))
    if (refused) toast(errorText(t, refused), 'danger')
  }

  const idle = !ask.isPending && applying === null
  const lastAnswer = [...messages].reverse().find(m => m.role === 'assistant')
  const score = readiness.data?.readiness.score ?? null

  return (
    <Page wide title={t('time.assistant.title', 'AI assistant')}
      line={t('time.assistant.line', 'Ask about the team’s days and weeks. It looks things up in the planner and proposes changes you apply.')}
      actions={messages.length > 0 ? <Button variant="secondary" onClick={restart}><RotateCcw size={14} aria-hidden />{t('time.assistant.new', 'New conversation')}</Button> : undefined}>
      {!ready && <Notice tone="info">{t(`time.ai_state.${boot.ai.state}`, t('time.ai_state.unknown', 'The AI cannot be asked just now.'))}</Notice>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label={t('time.assistant.conversation', 'Conversation')}
          className="flex h-[calc(100dvh-19rem)] min-h-[26rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-a-border bg-a-surface shadow-a-sm sm:h-[calc(100dvh-15rem)] sm:min-h-[30rem]">
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto time-scroll">
            <div ref={inner} className="space-y-5 p-4 sm:p-5">
              {messages.length === 0 && (
                <div className="mx-auto max-w-2xl space-y-5 py-4 text-center time-ai-wash sm:py-8">
                  <Orb size="lg" className="mx-auto" />
                  <div className="space-y-1.5">
                    <p className="font-a-display text-2xl text-a-text">{t('time.assistant.hello', 'What shall we plan, {{name}}?', { name: firstName(boot.staff.name) })}</p>
                    <p className="mx-auto max-w-lg text-sm text-a-text-2">{t('time.assistant.hello_line', 'I know the team’s skills, hours and history, the pool and the plan. I suggest; you decide what is applied.')}</p>
                  </div>
                  <ul aria-label={t('time.assistant.starters', 'Questions to start with')} className="grid gap-2.5 text-left sm:grid-cols-2">
                    {suggestions(manager, boot.staff.can.plan_team, firstType).map((key, i) => {
                      const Icon = SUGGESTION_ICONS[key]
                      const text = t(`time.assistant.suggest.${key}`, SUGGESTION_DEFAULTS[key], { type: firstType ?? '' })
                      return (
                        <li key={key} className="animate-a-rise" style={{ animationDelay: `${staggerDelay(i, 60)}ms` }}>
                          <button type="button" onClick={() => send(text)} disabled={!ready || ask.isPending}
                            className="group flex h-full w-full items-center gap-3 rounded-2xl border border-a-border bg-a-surface p-3 text-left transition duration-150 hover:border-a-accent/50 hover:shadow-a-sm disabled:opacity-50 [@media(hover:hover)]:hover:-translate-y-px">
                            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl time-ai-soft"><Icon size={17} /></span>
                            <span className="min-w-0 flex-1 text-sm text-a-text">{text}</span>
                            <ArrowRight size={15} aria-hidden className="shrink-0 text-a-text-2 transition-transform group-hover:translate-x-0.5" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {messages.map(m => m.role === 'user' ? (
                <div key={m.id} className="flex justify-end animate-a-rise">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-a-accent px-3.5 py-2.5 text-sm text-a-accent-ink">{m.content}</p>
                </div>
              ) : (
                <Answer key={m.id} message={m} fresh={m.id === fresh} last={m.id === lastAnswer?.id} idle={idle} applying={applying}
                  onApply={(id, list) => void apply(id, list)} onAsk={send} />
              ))}

              {ask.isPending && (
                <div className="flex gap-3 animate-a-fade" role="status">
                  <Orb size="sm" busy />
                  <div className="min-w-0 max-w-xl flex-1 space-y-3 rounded-2xl rounded-tl-md bg-a-surface-2/60 p-3.5">
                    <p className="flex items-center gap-2 text-sm text-a-text-2">{t('time.assistant.thinking', 'Looking at the planner…')}<Dots /></p>
                    <ShimmerLines />
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* The whole of a new answer, once, for a screen reader (the letters appearing above are for the eye). */}
          <p className="sr-only" role="status">{fresh && lastAnswer?.id === fresh ? lastAnswer.content : ''}</p>

          <form className="border-t border-a-border p-3" onSubmit={e => { e.preventDefault(); send(draft) }}>
            <div className="flex items-end gap-2 rounded-2xl border border-a-border bg-a-surface p-1.5 pl-3.5 time-composer">
              <textarea ref={box} rows={1} value={draft} maxLength={MESSAGE_MAX} disabled={!ready}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft) } }}
                aria-label={t('time.assistant.ask', 'Ask the assistant')} placeholder={t('time.assistant.placeholder', 'Ask anything about the plan, the team or the pool…')}
                className="min-h-9 min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 text-sm text-a-text placeholder:text-a-text-2 focus:outline-hidden disabled:opacity-60" />
              {boot.features.voice && <VoiceButton language={i18n.language} onText={words => setDraft(before => appendWords(before, words))} />}
              <button type="submit" disabled={!draft.trim() || !ready || ask.isPending} aria-label={t('time.assistant.send', 'Send')} title={t('time.assistant.send', 'Send')}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full time-ai-fill transition duration-150 hover:opacity-90 disabled:opacity-40">
                <ArrowUp size={16} aria-hidden />
              </button>
            </div>
            <p className="mt-1.5 flex justify-between gap-3 px-1 text-xs text-a-text-2">
              <span>{t('time.assistant.enter_hint', 'Enter sends, Shift + Enter starts a new line.')}</span>
              {draft.length > MESSAGE_MAX * 0.8 && <span className={draft.length >= MESSAGE_MAX ? 'text-a-danger' : ''}>{t('time.assistant.counter', '{{used}} of {{max}}', { used: draft.length, max: MESSAGE_MAX })}</span>}
            </p>
          </form>
        </section>

        <aside className="min-w-0 space-y-5">
          <Card title={t('time.assistant.knows', 'What the AI knows')} icon={GraduationCap} tone="ai"
            description={t('time.assistant.knows_line', 'The more you teach it, the better it plans.')}>
            <div className="flex items-center gap-4">
              {score !== null
                ? (
                  <Ring value={score} size={84} stroke={8} label={t('time.assistant.ready_label', '{{pct}} % ready', { pct: score })}>
                    <span className="font-a-display text-xl text-a-text"><CountUp value={score} format={n => `${n}%`} /></span>
                  </Ring>
                )
                : <span aria-hidden className="h-[84px] w-[84px] shrink-0 rounded-full time-shimmer" />}
              <div className="min-w-0 space-y-1.5">
                <p className="text-sm text-a-text-2">{t('time.assistant.ready_line', 'of what it could know about your business, work and team.')}</p>
                <Link to="/time/coach" className="inline-flex items-center gap-1 text-sm font-semibold text-a-accent-text hover:underline">{t('time.assistant.open_coach', 'Teach it in the AI coach')}<ChevronRight size={14} aria-hidden /></Link>
              </div>
            </div>
          </Card>
          <ToolsCard manager={boot.staff.can.plan_team} />
        </aside>
      </div>
    </Page>
  )
}

/** Every other way the planner's AI helps, one press away: the day's and the week's plan, capture, review, the coach. */
function ToolsCard({ manager }: { manager: boolean }) {
  const { t } = useTranslation()
  const { openCapture } = useTimeActions()
  const row = 'group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-a-surface-2'
  const body = (Icon: LucideIcon, title: string, line: string) => (
    <>
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl time-ai-soft"><Icon size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-a-text">{title}</span>
        <span className="block text-xs text-a-text-2">{line}</span>
      </span>
      <ChevronRight size={15} aria-hidden className="shrink-0 text-a-text-2 transition-transform group-hover:translate-x-0.5" />
    </>
  )
  return (
    <Card title={t('time.assistant.tools', 'AI tools')} icon={Sparkles} tone="ai" description={t('time.assistant.tools_line', 'Every way the AI helps, in one place.')} padded={false}>
      <ul className="space-y-0.5 p-2">
        <li><Link to="/time/plan?ai=me" className={row}>{body(Wand2, t('time.assistant.tool.plan_day', 'Plan my day'), t('time.assistant.tool.plan_day_line', 'Your open tasks fitted into your free time.'))}</Link></li>
        <li><Link to="/time/plan?view=week&ai=week" className={row}>{body(CalendarRange, manager ? t('time.assistant.tool.plan_week_team', 'Plan the team’s week') : t('time.assistant.tool.plan_week', 'Plan my week'), t('time.assistant.tool.plan_week_line', 'The pool and backlogs shared across the days.'))}</Link></li>
        <li><button type="button" onClick={() => openCapture()} className={row}>{body(Mic, t('time.assistant.tool.capture', 'Add tasks with AI'), t('time.assistant.tool.capture_line', 'From a message, a list or a voice note.'))}</button></li>
        <li><Link to="/time/plan" className={row}>{body(BarChart3, t('time.assistant.tool.review', 'Review a day'), t('time.assistant.tool.review_line', 'What went well and what to change, on the planner’s day.'))}</Link></li>
        <li><Link to="/time/coach" className={row}>{body(GraduationCap, t('time.assistant.tool.coach', 'AI coach'), t('time.assistant.tool.coach_line', 'Teach the AI, see what it learned, get a strategy.'))}</Link></li>
      </ul>
    </Card>
  )
}
