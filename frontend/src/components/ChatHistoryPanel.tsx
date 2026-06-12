import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  MessageCircle, Bot, User, ChevronDown, ChevronRight, ExternalLink, Sparkles,
} from 'lucide-react'
import { api } from '../lib/api'

/**
 * Chat conversations linked to an inquiry's guest. Mounted in the right
 * column of /inquiries/:id alongside tasks + attachments + AI smart panel.
 *
 * Linkage: inquiry.guest_id -> visitors.guest_id -> chat_conversations.
 * Backend resolves the chain in one endpoint and returns conversations with
 * their messages inline so the agent can read the full chat history without
 * bouncing to the Engagement Hub. Each conversation is collapsible; the
 * most-recent one is auto-expanded so it surfaces at a glance.
 *
 * Lightly designed for the common case of one chatbot conversation per
 * lead — but handles N conversations cleanly when a guest has multiple
 * (e.g. returning visitor, multi-device).
 *
 * User report (2026-06-12): "as we have a lot customers in leads from AI
 * chatbot, can we see chat communication directly in leads section. Now I
 * need to go back in chat and try to find this customer, not comfortable."
 */

type Message = {
  id: number
  conversation_id: number
  sender_type: 'visitor' | 'ai' | 'agent' | 'system' | string
  sender_user_id: number | null
  content: string | null
  created_at: string | null
}

type Conversation = {
  id: number
  channel: string | null
  status: string | null
  intent_tag: string | null
  page_url: string | null
  last_message_at: string | null
  created_at: string | null
  assigned_user_id: number | null
  visitor_name: string | null
  visitor_email: string | null
  assignedAgent: { id: number; name: string; email: string } | null
  visitor: { id: number; country?: string; city?: string; visit_count?: number; referrer?: string; is_lead?: boolean } | null
  messages: Message[]
}

function formatTimeShort(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const yest = new Date(today); yest.setDate(today.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) {
    return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function senderIcon(type: string) {
  switch (type) {
    case 'visitor': return <User size={11} className="text-blue-400" />
    case 'ai':      return <Bot size={11} className="text-purple-400" />
    case 'agent':   return <Sparkles size={11} className="text-emerald-400" />
    default:        return <MessageCircle size={11} className="text-t-secondary" />
  }
}

function senderLabel(type: string, conv: Conversation): string {
  switch (type) {
    case 'visitor': return conv.visitor_name || 'Visitor'
    case 'ai':      return 'AI'
    case 'agent':   return conv.assignedAgent?.name || 'Agent'
    case 'system':  return 'System'
    default:        return type
  }
}

export function ChatHistoryPanel({ inquiryId }: { inquiryId: number }) {
  // Expand the most-recent conversation by default; collapse the rest.
  const [openIds, setOpenIds] = useState<Set<number>>(new Set())

  const { data, isLoading } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ['inquiry-chat-history', inquiryId],
    queryFn: () => api.get(`/v1/admin/inquiries/${inquiryId}/chat-history`).then(r => r.data),
    staleTime: 60_000, // chat history doesn't change during a typical lead-view session
  })

  // First-render: open the latest conversation automatically.
  const conversations = data?.conversations ?? []
  if (openIds.size === 0 && conversations.length > 0) {
    openIds.add(conversations[0].id)
  }

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide font-bold text-t-secondary">
          <MessageCircle size={11} /> Chat history
          {conversations.length > 0 && (
            <span className="ml-1 text-primary-400">({conversations.length})</span>
          )}
        </div>
        {conversations[0] && (
          <Link
            to={`/engagement?conversation=${conversations[0].id}`}
            className="text-[10px] text-primary-400 hover:text-primary-300 flex items-center gap-0.5"
            title="Open in Engagement Hub"
          >
            <ExternalLink size={10} /> Open
          </Link>
        )}
      </div>

      {isLoading && (
        <p className="text-xs text-t-secondary italic">Loading chat history…</p>
      )}

      {!isLoading && conversations.length === 0 && (
        <p className="text-xs text-t-secondary italic">
          No linked chat conversations. This lead wasn't captured from the chat widget, or its guest hasn't been merged with a visitor.
        </p>
      )}

      <div className="space-y-2">
        {conversations.map((conv) => {
          const isOpen = openIds.has(conv.id)
          const lastMsg = conv.messages?.[conv.messages.length - 1]
          return (
            <div key={conv.id} className="border border-dark-border rounded-lg bg-dark-bg/40 overflow-hidden">
              {/* Header — clickable to expand/collapse */}
              <button
                onClick={() => setOpenIds(prev => {
                  const next = new Set(prev)
                  if (next.has(conv.id)) next.delete(conv.id)
                  else next.add(conv.id)
                  return next
                })}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-dark-surface2/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen ? <ChevronDown size={13} className="text-t-secondary flex-shrink-0" /> : <ChevronRight size={13} className="text-t-secondary flex-shrink-0" />}
                  <span className="text-xs font-semibold text-white truncate">
                    {conv.visitor?.country || 'Anonymous'}
                    {conv.visitor?.city ? `, ${conv.visitor.city}` : ''}
                  </span>
                  {conv.intent_tag && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-primary-500/15 text-primary-300 flex-shrink-0">
                      {conv.intent_tag.replace(/_/g, ' ')}
                    </span>
                  )}
                  {conv.status && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold flex-shrink-0 ${
                      conv.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-300' :
                      conv.status === 'active'   ? 'bg-blue-500/15 text-blue-300' :
                                                   'bg-amber-500/15 text-amber-300'
                    }`}>
                      {conv.status}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-t-secondary tabular-nums flex-shrink-0 ml-2">
                  {formatTimeShort(conv.last_message_at)}
                </span>
              </button>

              {/* Body — messages */}
              {isOpen && (
                <div className="border-t border-dark-border bg-dark-bg/20">
                  {conv.messages.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-t-secondary italic">No messages in this conversation.</p>
                  ) : (
                    <div className="px-3 py-2 space-y-2 max-h-96 overflow-y-auto">
                      {conv.messages.map((m) => {
                        const isVisitor = m.sender_type === 'visitor'
                        const isAi = m.sender_type === 'ai'
                        const isSystem = m.sender_type === 'system'
                        if (isSystem) {
                          return (
                            <div key={m.id} className="text-center">
                              <span className="text-[10px] text-t-secondary italic">{m.content}</span>
                            </div>
                          )
                        }
                        return (
                          <div key={m.id} className={`flex ${isVisitor ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${
                              isVisitor ? 'bg-dark-surface2 text-white' :
                              isAi      ? 'bg-purple-500/15 text-purple-100 border border-purple-500/30' :
                                          'bg-emerald-500/15 text-emerald-100 border border-emerald-500/30'
                            }`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                {senderIcon(m.sender_type)}
                                <span className="text-[10px] font-semibold opacity-80">
                                  {senderLabel(m.sender_type, conv)}
                                </span>
                                <span className="text-[9px] opacity-60 ml-auto tabular-nums">
                                  {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                              <div className="text-xs whitespace-pre-wrap break-words">{m.content || <span className="italic opacity-60">(empty)</span>}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Footer with link to full chat view */}
                  <div className="border-t border-dark-border px-3 py-1.5 flex items-center justify-between bg-dark-surface/40">
                    <span className="text-[10px] text-t-secondary">
                      {conv.messages.length} message{conv.messages.length === 1 ? '' : 's'}
                      {lastMsg?.created_at ? ` · last ${formatTimeShort(lastMsg.created_at)}` : ''}
                    </span>
                    <Link
                      to={`/engagement?conversation=${conv.id}`}
                      className="text-[10px] text-primary-400 hover:text-primary-300 flex items-center gap-0.5"
                    >
                      <ExternalLink size={9} /> Open
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
