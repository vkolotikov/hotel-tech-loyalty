import { useCallback } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { get, params } from '../lib/api'
import { lastMessageId, mergeMessages } from './inboxLogic'
import type { ConversationDetail, PollAnswer } from './types'

/** The inbox's query keys: everything under ['crm', 'inbox']. */
export const inboxKeys = {
  all: ['crm', 'inbox'] as const,
  stats: ['crm', 'inbox', 'stats'] as const,
  lists: ['crm', 'inbox', 'list'] as const,
  detail: (id: number) => ['crm', 'inbox', 'detail', id] as const,
  poll: (id: number) => ['crm', 'inbox', 'poll', id] as const,
  agents: ['crm', 'inbox', 'agents'] as const,
  canned: ['crm', 'inbox', 'canned'] as const,
  brief: (id: number) => ['crm', 'inbox', 'brief', id] as const,
}

/**
 * One poll of an open conversation (`chat-inbox/{id}/poll?since_id=`): what was written since the newest message on
 * screen goes into the thread, and whether the visitor is typing. A status changed elsewhere reloads the conversation.
 */
export async function pollOnce(qc: QueryClient, id: number): Promise<PollAnswer> {
  const before = qc.getQueryData<ConversationDetail>(inboxKeys.detail(id))
  const answer = await get<PollAnswer>(`chat-inbox/${id}/poll${params({ since_id: lastMessageId(before?.messages ?? []) })}`)
  const messages = Array.isArray(answer?.messages) ? answer.messages : []
  qc.setQueryData<ConversationDetail>(inboxKeys.detail(id), old => old && {
    ...old,
    messages: mergeMessages(old.messages, messages),
    visitor_typing: Boolean(answer?.visitor_typing),
  })
  if (before && answer?.status && answer.status !== before.conversation.status) {
    void qc.invalidateQueries({ queryKey: inboxKeys.detail(id) })
  }
  if (messages.length) {
    void qc.invalidateQueries({ queryKey: inboxKeys.lists })
    void qc.invalidateQueries({ queryKey: inboxKeys.stats })
  }
  return answer
}

/** After a write: the conversation, the list, its counts, and the counts beside Inbox and on Today. */
export function useInboxRefresh(): (id?: number) => void {
  const qc = useQueryClient()
  return useCallback((id?: number) => {
    if (id) void qc.invalidateQueries({ queryKey: inboxKeys.detail(id) })
    void qc.invalidateQueries({ queryKey: inboxKeys.lists })
    void qc.invalidateQueries({ queryKey: inboxKeys.stats })
    void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
    void qc.invalidateQueries({ queryKey: ['crm', 'today'] })
  }, [qc])
}
