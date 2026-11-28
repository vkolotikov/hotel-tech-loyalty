import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpRight, BarChart3, CalendarCheck, CalendarClock, CalendarRange, Check, Clock3, Copy, GraduationCap, Inbox, ListPlus, Loader2, Search, UserRoundCheck,
  Users, X, type LucideIcon,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { staggerDelay } from '../lib/motion'
import type { AssistantProposal } from '../lib/types'
import { Orb } from '../ui/motion'
import { TONE_CHIP } from '../ui/tones'
import {
  applyProgress, blocks, blocksLength, cutBlocks, dayLink, followUps, pending, proposalText, sourcesOf, type ChatMessage, type FollowUpKey, type SourceKey,
} from './assistantLogic'
import { useReveal } from './useReveal'

const KIND_ICONS: Record<AssistantProposal['kind'], LucideIcon> = { create: ListPlus, assign: UserRoundCheck, move: CalendarClock, set_length: Clock3 }
const KIND_CHIP: Record<AssistantProposal['kind'], string> = { create: TONE_CHIP.accent, assign: TONE_CHIP.ai, move: TONE_CHIP.progress, set_length: TONE_CHIP.pending }

const SOURCE_ICONS: Record<SourceKey, LucideIcon> = {
  get_day: CalendarCheck, get_week: CalendarRange, get_pool: Inbox, get_people: Users, get_learning: GraduationCap, get_insights: BarChart3, find_tasks: Search,
}
const SOURCE_DEFAULTS: Record<SourceKey, string> = {
  get_day: 'a day', get_week: 'the week', get_pool: 'the pool', get_people: 'the team', get_learning: 'what it learned', get_insights: 'the figures', find_tasks: 'tasks',
}
const FOLLOW_DEFAULTS: Record<FollowUpKey, { label: string; ask: string }> = {
  why: { label: 'Why these?', ask: 'Explain briefly why you suggest these changes.' },
  other: { label: 'Another way', ask: 'Suggest another way to do it.' },
  plan_it: { label: 'Make it changes I can apply', ask: 'Turn this into changes I can apply.' },
}

/** What is being applied just now: the message, its proposals in order, and the one in hand. */
export interface Applying { messageId: string; ids: string[]; at: string | null }

/**
 * One answer of the assistant (2026-11-28): the text — writing itself out when it has just arrived, whole at a press —
 * then what it looked at in the planner, the changes it proposes (each applied on its own or all at once, with a way
 * to its day once applied), and what to ask next. A screen reader gets the whole answer at once from the page's status
 * line, not the letters as they appear.
 */
export function Answer({ message, fresh, last, idle, applying, onApply, onAsk }: {
  message: ChatMessage
  /** It has just arrived: it writes itself out. */
  fresh: boolean
  /** The latest answer: the follow-ups are under it. */
  last: boolean
  /** Nothing is being asked or applied: buttons may be pressed. */
  idle: boolean
  applying: Applying | null
  onApply: (messageId: string, list: AssistantProposal[]) => void
  onAsk: (text: string) => void
}) {
  const { t, i18n } = useTranslation()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const all = useMemo(() => blocks(message.content), [message.content])
  const total = blocksLength(all)
  const [written, finish] = useReveal(total, fresh)
  const done = written >= total
  const shown = done ? all : cutBlocks(all, written)
  const proposals = message.proposals ?? []
  const waiting = pending(message)
  const sources = sourcesOf(message.used)
  const mine = applying?.messageId === message.id ? applying : null
  const progress = applyProgress(mine)
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(message.content).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className="flex gap-3 animate-a-rise">
      <Orb size="sm" />
      <div className="min-w-0 flex-1 space-y-3">
        {/* While it writes, the letters are for the eye; the status line under the conversation says the whole answer. */}
        <div aria-hidden={!done || undefined} onClick={done ? undefined : finish} title={done ? undefined : t('time.assistant.show_all', 'Show the whole answer')}
          className={`space-y-2 text-sm leading-relaxed text-a-text ${done ? '' : 'cursor-pointer'}`}>
          {shown.map((b, i) => b.kind === 'p'
            ? <p key={i}>{b.text}{!done && i === shown.length - 1 && <span aria-hidden className="time-caret" />}</p>
            : (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((item, j) => <li key={j}>{item}{!done && i === shown.length - 1 && j === b.items.length - 1 && <span aria-hidden className="time-caret" />}</li>)}
              </ul>
            ))}
        </div>

        {done && (sources.length > 0 || message.content) && (
          <div className="flex flex-wrap items-center gap-1.5 animate-a-fade">
            {sources.length > 0 && (
              <>
                <span className="text-xs text-a-text-2">{t('time.assistant.looked_at', 'Looked at')}</span>
                {sources.map(source => {
                  const Icon = SOURCE_ICONS[source]
                  return (
                    <span key={source} className="inline-flex items-center gap-1 rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text-2">
                      <Icon size={12} aria-hidden />{t(`time.assistant.source.${source}`, SOURCE_DEFAULTS[source])}
                    </span>
                  )
                })}
              </>
            )}
            <button type="button" onClick={copy} title={t('time.assistant.copy', 'Copy the answer')} aria-label={t('time.assistant.copy', 'Copy the answer')}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
              {copied ? <><Check size={12} aria-hidden className="time-pop" />{t('time.assistant.copied', 'Copied')}</> : <Copy size={13} aria-hidden />}
            </button>
          </div>
        )}

        {done && proposals.length > 0 && (
          <div className="space-y-2 rounded-2xl border p-3 time-ai-border time-ai-wash animate-a-rise">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.12em] text-a-text-2">{t('time.assistant.proposed', 'Proposed changes')}</p>
              {(waiting.length > 1 || progress) && (
                <Button size="sm" onClick={() => onApply(message.id, waiting)} loading={!!progress} disabled={!idle}>
                  {progress
                    ? t('time.assistant.applying', 'Applying {{done}} of {{count}}…', { done: progress[0] + 1, count: progress[1] })
                    : <><Check size={14} aria-hidden />{t('time.assistant.apply_all', 'Apply all ({{count}})', { count: waiting.length })}</>}
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {proposals.map((p, i) => {
                const Icon = KIND_ICONS[p.kind]
                const outcome = message.outcome?.[p.id]
                const inHand = mine?.at === p.id
                const day = dayLink(p)
                return (
                  <li key={p.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-a-border bg-a-surface p-2.5 animate-a-rise" style={{ animationDelay: `${staggerDelay(i, 70)}ms` }}>
                    <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${KIND_CHIP[p.kind]}`}><Icon size={16} /></span>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="text-sm text-a-text">{proposalText(t, p, i18n.language, units)}</p>
                      {p.note && <p className="text-xs text-a-text-2">{p.note}</p>}
                    </div>
                    {outcome === 'done' ? (
                      <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-a-st-confirmed">
                        <span className="inline-flex items-center gap-1"><Check size={14} aria-hidden className="time-pop" />{t('time.assistant.done', 'Applied')}</span>
                        {day && <Link to={day} className="inline-flex items-center gap-0.5 font-semibold text-a-accent-text hover:underline">{t('time.assistant.open_day', 'Open the day')}<ArrowUpRight size={12} aria-hidden /></Link>}
                      </span>
                    ) : outcome === 'failed' ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-a-danger"><X size={14} aria-hidden />{t('time.assistant.failed', 'Not applied')}</span>
                    ) : inHand ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-a-text-2" role="status"><Loader2 size={14} aria-hidden className="animate-spin" />{t('time.assistant.applying_one', 'Applying…')}</span>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => onApply(message.id, [p])} disabled={!idle}>{t('time.assistant.apply', 'Apply')}</Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {done && last && idle && (
          <div className="flex flex-wrap gap-1.5 animate-a-fade">
            {followUps(message).map(key => (
              <button key={key} type="button" onClick={() => onAsk(t(`time.assistant.follow_ask.${key}`, FOLLOW_DEFAULTS[key].ask))}
                className="rounded-full border bg-a-surface px-3 py-1.5 text-xs font-medium text-a-text-2 transition-colors hover:text-a-text time-ai-border">
                {t(`time.assistant.follow.${key}`, FOLLOW_DEFAULTS[key].label)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
