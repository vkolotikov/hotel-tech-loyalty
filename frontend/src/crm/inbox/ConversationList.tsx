import { useTranslation } from 'react-i18next'
import { Inbox, Users } from 'lucide-react'
import { timeAgo } from '../lib/format'
import { Avatar } from '../ui/Avatar'
import { EmptyState } from '../ui/EmptyState'
import { Pager } from '../ui/Pager'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SearchInput, Toggle } from '../ui/inputs'
import { Tabs } from '../ui/Tabs'
import { STATUS_FILTERS, STATUS_TONE, channelKey, displayName, filterCounts, needsAttention, type StatusFilter } from './inboxLogic'
import type { Conversation, InboxStats } from './types'
import { STATUS_DEFAULTS, CHANNEL_DEFAULTS } from './words'

/** The conversations, newest and most urgent first, with the filters, the search box and "Group by visitor". */
export function ConversationList({ rows, loading, error, onRetry, stats, status, onStatus, term, onTerm, group, onGroup, sound, onSound, openId, onOpen, page, last, total, onPage, className = '' }: {
  rows: Conversation[]
  loading: boolean
  error: unknown
  onRetry: () => void
  stats: InboxStats | undefined
  status: StatusFilter
  onStatus: (next: StatusFilter) => void
  term: string
  onTerm: (next: string) => void
  group: boolean
  onGroup: (on: boolean) => void
  sound: boolean
  onSound: (on: boolean) => void
  openId: number | null
  onOpen: (id: number) => void
  page: number
  last: number
  total?: number
  onPage: (page: number) => void
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const counts = filterCounts(stats)
  const filters = STATUS_FILTERS.map(key => ({
    key,
    label: key === 'all' ? t('crm.common.all', 'All') : t(`crm.status.${key}`, STATUS_DEFAULTS[key]),
    count: counts[key],
  }))

  return (
    <section aria-label={t('crm.inbox.list_label', 'Conversations')} className={`min-h-0 min-w-0 flex-col border-a-border md:border-r ${className}`}>
      <div className="space-y-3 border-b border-a-border p-3">
        <SearchInput label={t('crm.inbox.search', 'Search by name or email')} value={term} onChange={onTerm} />
        <Tabs label={t('crm.inbox.filter_label', 'Show')} items={filters} value={status} onChange={onStatus} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-3 md:p-0">
          <QueryState loading={loading} error={error} onRetry={onRetry} rows={6}>
            {rows.length === 0
              ? <EmptyState icon={Inbox} title={term.trim() ? t('crm.inbox.none_found', 'No conversation matches') : t('crm.inbox.none', 'No conversations here')}
                  line={term.trim() ? undefined : t('crm.inbox.none_line', 'When a visitor writes in the website chat, the conversation shows here.')} />
              : (
                <ul className="divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border md:rounded-none md:border-0">
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
      </div>

      <div className="space-y-2 border-t border-a-border px-3 py-2.5">
        <Toggle label={t('crm.inbox.group', 'One row per visitor')} hint={t('crm.inbox.group_hint', 'Older chats of the same person fold into the latest.')} checked={group} onChange={onGroup} />
        <Toggle label={t('crm.inbox.sound', 'Sound when a visitor writes')} checked={sound} onChange={onSound} />
      </div>
    </section>
  )
}

function ConversationRow({ c, open, onOpen, lang }: { c: Conversation; open: boolean; onOpen: () => void; lang: string }) {
  const { t } = useTranslation()
  const name = displayName(c) ?? t('crm.common.visitor', 'Visitor')
  const channel = channelKey(c.channel)
  const unread = c.unread_count ?? 0
  const urgent = needsAttention(c)
  return (
    <button type="button" onClick={onOpen} aria-current={open ? 'true' : undefined}
      className={`flex w-full items-start gap-3 border-l-2 bg-a-surface px-3 py-3 text-left transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent ${open ? 'border-l-a-accent bg-a-surface-2' : 'border-l-transparent'}`}>
      <span className="relative">
        <Avatar name={name} tone={c.ai_enabled === false ? 'accent' : 'neutral'} />
        {urgent && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-a-surface bg-a-st-pending" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`truncate text-sm text-a-text ${unread > 0 ? 'font-semibold' : 'font-medium'}`}>{name}</span>
          <span className="ml-auto shrink-0 text-xs text-a-text-2">{timeAgo(c.last_message_at, lang)}</span>
        </span>
        {(c.visitor_email || c.channel) && (
          <span className="block truncate text-xs text-a-text-2">
            {c.visitor_email && c.visitor_email !== name ? c.visitor_email : (channel ? t(`crm.inbox.channel.${channel}`, CHANNEL_DEFAULTS[channel]) : c.channel)}
          </span>
        )}
        {c.last_message && <span className={`mt-0.5 line-clamp-2 block text-sm ${unread > 0 ? 'text-a-text' : 'text-a-text-2'}`}>{c.last_message}</span>}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Pill tone={STATUS_TONE[c.status]}>{t(`crm.status.${c.status}`, STATUS_DEFAULTS[c.status])}</Pill>
          {unread > 0 && <Pill tone="accent">{t('crm.inbox.unread', '{{count}} new', { count: unread })}</Pill>}
          {c.ai_enabled !== false && <Pill tone="ai">{t('crm.inbox.ai_answering', 'AI')}</Pill>}
          {(c.ip_session_count ?? 1) > 1 && (
            <Pill title={t('crm.inbox.sessions', '{{count}} chats from this visitor', { count: c.ip_session_count })}>
              <Users size={12} aria-hidden />{c.ip_session_count}
            </Pill>
          )}
          {c.assigned_agent && <span className="truncate text-xs text-a-text-2">{t('crm.inbox.assigned_short', 'With {{name}}', { name: c.assigned_agent.name })}</span>}
        </span>
      </span>
    </button>
  )
}
