import { useTranslation } from 'react-i18next'
import { Bot, Inbox, Users } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { timeAgo } from '../lib/format'
import { Avatar } from '../ui/Avatar'
import { EmptyState } from '../ui/EmptyState'
import { Pager } from '../ui/Pager'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { STATUS_TONE, channelKey, displayName, rowState } from './inboxLogic'
import type { Conversation } from './types'
import { CHANNEL_DEFAULTS, STATUS_DEFAULTS } from './words'

/** The conversations, the most urgent and newest first; the search and the filters sit in the page's toolbar. */
export function ConversationList({ rows, loading, error, onRetry, term, total, openId, onOpen, page, last, onPage, className = '' }: {
  rows: Conversation[]
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
  className?: string
}) {
  const { t, i18n } = useTranslation()

  return (
    <section aria-label={t('crm.inbox.list_label', 'Conversations')} className={`min-h-0 min-w-0 flex-col border-a-border md:border-r ${className}`}>
      <div className="hidden items-center gap-2 border-b border-a-border px-4 py-2.5 md:flex">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-a-text">{t('crm.inbox.list_label', 'Conversations')}</h2>
        {total !== undefined && <span className="shrink-0 text-xs tabular-nums text-a-text-2">{t('crm.common.total', '{{count}} in all', { count: total })}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <QueryState loading={loading} error={error} onRetry={onRetry} rows={6}>
          {rows.length === 0
            ? <EmptyState icon={Inbox} title={term.trim() ? t('crm.inbox.none_found', 'No conversation matches') : t('crm.inbox.none', 'No conversations here')}
                line={term.trim() ? undefined : t('crm.inbox.none_line', 'When a visitor writes in the website chat, the conversation shows here.')} />
            : (
              <ul className="divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface md:rounded-none md:border-0">
                {rows.map(c => (
                  <li key={c.id}>
                    <ConversationRow c={c} open={c.id === openId} onOpen={() => onOpen(c.id)} lang={i18n.language} />
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

/**
 * One conversation: who, when, the last words; unread shows as a bold name with its count, waiting with the waiting
 * colour on the edge, the open one tinted in the accent.
 */
function ConversationRow({ c, open, onOpen, lang }: { c: Conversation; open: boolean; onOpen: () => void; lang: string }) {
  const { t } = useTranslation()
  const { features } = useBoot()
  const name = displayName(c) ?? t('crm.common.visitor', 'Visitor')
  const channel = channelKey(c.channel)
  const state = rowState(c)
  const second = [c.visitor_email && c.visitor_email !== name ? c.visitor_email : null, channel ? t(`crm.inbox.channel.${channel}`, CHANNEL_DEFAULTS[channel]) : c.channel]
    .filter(Boolean).join(' · ')
  const edge = open ? 'border-l-a-accent' : state.waiting ? 'border-l-a-st-pending' : 'border-l-transparent'
  const fill = open ? 'bg-a-accent/10' : state.unread > 0 ? 'bg-a-surface-2/50' : 'bg-a-surface'
  return (
    <button type="button" onClick={onOpen} aria-current={open ? 'true' : undefined}
      className={`flex w-full items-start gap-3 border-l-[3px] px-3 py-3 text-left transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent ${edge} ${fill}`}>
      <span className="relative shrink-0">
        <Avatar name={name} tone={c.ai_enabled === false ? 'accent' : 'neutral'} />
        {features.chatbot && c.ai_enabled !== false && (
          <span aria-hidden className="absolute -bottom-1 -right-1 grid h-4.5 w-4.5 place-items-center rounded-full border-2 border-a-surface crm-ai-fill"><Bot size={10} /></span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`min-w-0 truncate text-sm text-a-text ${state.unread > 0 ? 'font-semibold' : 'font-medium'}`}>{name}</span>
          <span className={`ml-auto shrink-0 text-xs ${state.unread > 0 ? 'font-semibold text-a-accent-text' : 'text-a-text-2'}`}>{timeAgo(c.last_message_at, lang)}</span>
        </span>
        {second && <span className="block truncate text-xs text-a-text-2">{second}</span>}
        <span className="mt-0.5 flex items-start gap-2">
          {c.last_message && <span className={`line-clamp-2 min-w-0 flex-1 text-sm ${state.unread > 0 ? 'text-a-text' : 'text-a-text-2'}`}>{c.last_message}</span>}
          {state.unread > 0 && (
            <span className="ml-auto mt-0.5 shrink-0 rounded-full bg-a-accent px-1.5 text-center text-xs font-semibold leading-5 text-a-accent-ink">
              <span aria-hidden>{state.unread}</span><span className="sr-only">{t('crm.inbox.unread', '{{count}} new', { count: state.unread })}</span>
            </span>
          )}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Pill tone={STATUS_TONE[c.status]}>{t(`crm.status.${c.status}`, STATUS_DEFAULTS[c.status])}</Pill>
          {features.chatbot && c.ai_enabled !== false && <Pill tone="ai">{t('crm.inbox.ai_answering', 'AI')}</Pill>}
          {(c.ip_session_count ?? 1) > 1 && (
            <Pill title={t('crm.inbox.sessions', '{{count}} chats from this visitor', { count: c.ip_session_count })}>
              <Users size={12} aria-hidden />{c.ip_session_count}
            </Pill>
          )}
          {c.assigned_agent
            ? <span className="min-w-0 truncate text-xs text-a-text-2">{t('crm.inbox.assigned_short', 'With {{name}}', { name: c.assigned_agent.name })}</span>
            : (c.status === 'waiting' || c.status === 'active') && <span className="text-xs text-a-text-2">{t('crm.inbox.nobody_short', 'Nobody assigned')}</span>}
        </span>
      </span>
    </button>
  )
}
