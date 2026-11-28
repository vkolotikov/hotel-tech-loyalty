import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Flame, Inbox, UserCheck, UserX, Users } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { timeAgo } from '../lib/format'
import { Avatar } from '../ui/Avatar'
import { EmptyState } from '../ui/EmptyState'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { INTENT_ICON, INTENT_TONE, TONE_INK } from './icons'
import { STATUS_TONE, displayName, intentKey, rowState, type InboxRow } from './inboxLogic'
import { INTENT_DEFAULTS, STATUS_DEFAULTS } from './words'

const DOT: Record<string, string> = {
  pending: 'bg-a-st-pending', progress: 'bg-a-st-progress', success: 'bg-a-st-confirmed', neutral: 'bg-a-text-2',
}

/**
 * The conversations (round 5: compact rows that show their state as icons — the AI answering, a hot lead, what the chat
 * is about, who has it). The search and the filters sit in the page's header; the open row stays in view as J and K
 * move through the list.
 */
export function ConversationList({ rows, loading, error, onRetry, term, total, openId, onOpen, page, last, onPage, agents, className = '' }: {
  rows: InboxRow[]
  loading: boolean
  error: unknown
  onRetry: () => void
  term: string
  total?: number
  openId: number | null
  onOpen: (id: number) => void
  page: number
  last: number
  onPage: (page: number) => void
  /** The team's names by id, for a row the feed gave only an id for. */
  agents?: ReadonlyMap<number, string>
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!openId) return
    list.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [openId])

  return (
    <section aria-label={t('crm.inbox.list_label', 'Conversations')} className={`min-h-0 min-w-0 flex-col border-a-border md:border-r ${className}`}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <QueryState loading={loading} error={error} onRetry={onRetry} rows={6}>
          {rows.length === 0
            ? <EmptyState icon={Inbox} title={term.trim() ? t('crm.inbox.none_found', 'No conversation matches') : t('crm.inbox.none', 'No conversations here')} />
            : (
              <ul ref={list} className="divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface md:rounded-none md:border-0">
                {rows.map(c => (
                  <li key={c.id}>
                    <ConversationRow c={c} open={c.id === openId} onOpen={() => onOpen(c.id)} lang={i18n.language} agents={agents} />
                  </li>
                ))}
              </ul>
            )}
          <div className="px-3 pb-2">
            <Pager page={page} last={last} total={total} onPage={onPage} />
          </div>
        </QueryState>
      </div>
    </section>
  )
}

/** What the chat is about, as its icon in its tone (the word is the tooltip and what a screen reader hears). */
export function IntentMark({ tag, withLabel = false }: { tag: string | null | undefined; withLabel?: boolean }) {
  const { t } = useTranslation()
  const intent = intentKey(tag)
  if (!intent) return null
  const Icon = INTENT_ICON[intent]
  const label = t(`crm.inbox.intent.${intent}`, INTENT_DEFAULTS[intent])
  return withLabel
    ? <span className={`inline-flex min-w-0 items-center gap-1 text-xs font-medium ${TONE_INK[INTENT_TONE[intent]]}`}><Icon size={13} aria-hidden className="shrink-0" /><span className="truncate">{label}</span></span>
    : <span role="img" aria-label={label} title={label} className={`inline-flex shrink-0 ${TONE_INK[INTENT_TONE[intent]]}`}><Icon size={14} aria-hidden /></span>
}

/** The feed's hot-lead flag. */
export function HotMark() {
  const { t } = useTranslation()
  const label = t('crm.inbox.hot', 'Hot lead')
  return <span role="img" aria-label={label} title={label} className="inline-flex shrink-0 text-a-st-pending"><Flame size={14} aria-hidden /></span>
}

/**
 * One conversation in three short lines: who (with a hot lead's and the intent's icons) and when; the last words with
 * the unread count; the status as a dot and its word, then who has it. Waiting shows on the edge, the open one in the
 * accent.
 */
function ConversationRow({ c, open, onOpen, lang, agents }: { c: InboxRow; open: boolean; onOpen: () => void; lang: string; agents?: ReadonlyMap<number, string> }) {
  const { t } = useTranslation()
  const { features } = useBoot()
  const name = displayName(c) ?? t('crm.common.visitor', 'Visitor')
  const state = rowState(c)
  const aiOn = features.chatbot && c.ai_enabled !== false
  const agent = c.assigned_agent?.name ?? (c.assigned_to ? agents?.get(c.assigned_to) : undefined)
  const edge = open ? 'border-l-a-accent' : state.waiting ? 'border-l-a-st-pending' : 'border-l-transparent'
  const fill = open ? 'bg-a-accent/10' : state.unread > 0 ? 'bg-a-surface-2/50' : 'bg-a-surface'
  const openChat = c.status === 'waiting' || c.status === 'active'
  return (
    <button type="button" onClick={onOpen} aria-current={open ? 'true' : undefined}
      className={`flex w-full items-start gap-2.5 border-l-[3px] px-3 py-2.5 text-left transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent ${edge} ${fill}`}>
      <span className="relative mt-0.5 shrink-0">
        <Avatar name={name} tone={c.ai_enabled === false ? 'accent' : 'neutral'} />
        {aiOn && (
          <span role="img" aria-label={t('crm.inbox.ai_answering_long', 'The AI answers')} title={t('crm.inbox.ai_answering_long', 'The AI answers')} className="absolute -bottom-1 -right-1 grid h-4.5 w-4.5 place-items-center rounded-full border-2 border-a-surface crm-ai-fill">
            <Bot size={10} aria-hidden />
          </span>
        )}
        {c.online && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-a-surface bg-a-st-confirmed" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={`min-w-0 truncate text-sm text-a-text ${state.unread > 0 ? 'font-semibold' : 'font-medium'}`}>{name}</span>
          {c.hot && <HotMark />}
          <IntentMark tag={c.intent_tag} />
          <span className={`ml-auto shrink-0 pl-1 text-xs ${state.unread > 0 ? 'font-semibold text-a-accent-text' : 'text-a-text-2'}`}>{timeAgo(c.last_message_at, lang)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm ${state.unread > 0 ? 'text-a-text' : 'text-a-text-2'}`}>{c.last_message || c.visitor_email || '—'}</span>
          {state.unread > 0 && (
            <span role="img" aria-label={t('crm.inbox.unread', '{{count}} new', { count: state.unread })} className="shrink-0 rounded-full bg-a-accent px-1.5 text-center text-xs font-semibold leading-5 text-a-accent-ink">
              {state.unread}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-a-text-2">
          <span className="inline-flex shrink-0 items-center gap-1">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[STATUS_TONE[c.status]] ?? DOT.neutral}`} />
            {t(`crm.status.${c.status}`, STATUS_DEFAULTS[c.status])}
          </span>
          {(c.ip_session_count ?? 1) > 1 && (
            <span role="img" aria-label={t('crm.inbox.sessions', '{{count}} chats from this visitor', { count: c.ip_session_count })} title={t('crm.inbox.sessions', '{{count}} chats from this visitor', { count: c.ip_session_count })} className="inline-flex shrink-0 items-center gap-0.5">
              <Users size={12} aria-hidden />{c.ip_session_count}
            </span>
          )}
          {agent
            ? <span className="inline-flex min-w-0 items-center gap-1"><UserCheck size={12} aria-hidden className="shrink-0" /><span className="truncate">{agent}</span></span>
            : openChat && !c.assigned_to && (
              <span role="img" aria-label={t('crm.inbox.nobody_short', 'Nobody assigned')} title={t('crm.inbox.nobody_short', 'Nobody assigned')} className="inline-flex shrink-0 items-center gap-1 text-a-st-pending">
                <UserX size={12} aria-hidden />
              </span>
            )}
        </span>
      </span>
    </button>
  )
}
