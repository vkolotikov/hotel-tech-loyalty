import { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  X, Send, Loader2, Sparkles, Trash2, Maximize2, Minimize2,
  Bot, User, ChevronRight, Zap,
} from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string; actions?: any[] }

const SUGGESTION_GROUPS = [
  {
    label: 'CRM',
    items: [
      "How many arrivals today?",
      "Show in-house VIP guests",
      "What's our pipeline value?",
    ],
  },
  {
    label: 'Loyalty',
    items: [
      "Show Gold tier members",
      "Analyze churn risk for member #1",
      "What loyalty offers are active?",
    ],
  },
  {
    label: 'Operations',
    items: [
      "What tasks are planned for today?",
      "Show venue bookings this week",
      "Create a task for tomorrow: Staff meeting",
    ],
  },
  {
    label: 'AI Insights',
    items: [
      "Generate weekly performance report",
      "Detect any anomalies or unusual patterns",
      "Forecast occupancy for the next 2 weeks",
      "Find stale inquiries and create follow-up tasks",
    ],
  },
]

function formatMessage(text: string) {
  const lines = text.split('\n')
  const elements: any[] = []
  let inList = false
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-0.5 my-1">
          {listItems.map((item, i) => (
            <li key={i} className="flex gap-1.5 items-start">
              <span className="text-primary-400 mt-1 flex-shrink-0">•</span>
              <span>{formatInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      listItems = []
    }
    inList = false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const bulletMatch = line.match(/^[\s]*[-•*]\s+(.*)/)
    const numberedMatch = line.match(/^[\s]*\d+[.)]\s+(.*)/)

    if (bulletMatch || numberedMatch) {
      inList = true
      listItems.push((bulletMatch || numberedMatch)![1])
      continue
    }

    if (inList) flushList()

    if (line.match(/^#{1,3}\s/)) {
      elements.push(
        <div key={`h-${i}`} className="font-semibold text-white mt-2 mb-0.5">
          {formatInline(line.replace(/^#{1,3}\s/, ''))}
        </div>
      )
    } else if (line.trim() === '') {
      if (elements.length > 0) elements.push(<div key={`br-${i}`} className="h-1.5" />)
    } else {
      elements.push(<div key={`p-${i}`}>{formatInline(line)}</div>)
    }
  }

  flushList()
  return elements
}

function formatInline(text: string) {
  // Bold, inline code, then return
  const parts: any[] = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    if (match[2]) parts.push(<strong key={match.index} className="text-white font-semibold">{match[2]}</strong>)
    else if (match[3]) parts.push(<code key={match.index} className="bg-dark-surface px-1 py-0.5 rounded text-primary-300 text-[11px] font-mono">{match[3]}</code>)
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : text
}

export default function AiChat() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const stored = sessionStorage.getItem('ai_chat_messages')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  useEffect(() => {
    try { sessionStorage.setItem('ai_chat_messages', JSON.stringify(messages)) } catch {}
  }, [messages])

  const send = useCallback(async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    const next: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setToolStatus(null)

    // Simulate tool status for UX
    const statusTimer = setTimeout(() => setToolStatus('Searching data…'), 2000)
    const statusTimer2 = setTimeout(() => setToolStatus('Processing results…'), 5000)

    try {
      const res = await api.post('/v1/admin/crm-ai/chat', { messages: next.map(m => ({ role: m.role, content: m.content })) })
      const actions = res.data.actions ?? []
      setMessages([...next, { role: 'assistant', content: res.data.response, actions }])
      if (actions.some((a: any) => a.tool?.startsWith('create_') || a.tool?.startsWith('update_') || a.tool?.startsWith('award_') || a.tool?.startsWith('redeem_') || a.tool === 'analyze_inquiries_create_followups')) {
        qc.invalidateQueries()
      }
    } catch (e: any) {
      setMessages([...next, { role: 'assistant', content: 'Error: ' + (e.response?.data?.message || 'Could not reach AI service.') }])
    } finally {
      clearTimeout(statusTimer)
      clearTimeout(statusTimer2)
      setLoading(false)
      setToolStatus(null)
    }
  }, [input, loading, messages, qc])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clearChat = () => {
    setMessages([])
    sessionStorage.removeItem('ai_chat_messages')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 w-13 h-13 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-dark-bg flex items-center justify-center shadow-lg shadow-primary-500/30 z-50 transition-all hover:scale-110 hover:shadow-xl hover:shadow-primary-500/40 group"
        title="AI Assistant"
      >
        <Sparkles size={22} className="group-hover:rotate-12 transition-transform" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-dark-bg animate-pulse" />
      </button>
    )
  }

  const panelSize = expanded
    ? 'w-[680px] h-[85vh]'
    : 'w-[420px] h-[600px]'

  return (
    <div className={`fixed bottom-5 right-5 ${panelSize} bg-dark-bg border border-dark-border rounded-2xl shadow-2xl shadow-black/50 z-50 flex flex-col overflow-hidden transition-all duration-300`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-border flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-dark-surface to-dark-surface2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-md shadow-primary-500/20">
            <Sparkles size={16} className="text-dark-bg" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
              AI Assistant
              <span className="text-[9px] font-medium bg-primary-500/15 text-primary-400 px-1.5 py-0.5 rounded-full">Claude + GPT-4o</span>
            </div>
            <div className="text-[11px] text-[#636366]">CRM, Loyalty, Planning & Analytics</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-dark-surface text-[#636366] hover:text-gray-300 transition-colors" title="Clear chat">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg hover:bg-dark-surface text-[#636366] hover:text-gray-300 transition-colors" title={expanded ? 'Minimize' : 'Expand'}>
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-dark-surface text-[#636366] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-5 py-2">
            {/* Welcome */}
            <div className="text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-700/10 flex items-center justify-center border border-primary-500/20">
                <Sparkles size={26} className="text-primary-400" />
              </div>
              <div>
                <div className="text-base font-semibold text-white mb-1">How can I help?</div>
                <div className="text-xs text-[#8e8e93] max-w-[280px] mx-auto">
                  I can search guests, manage loyalty members & points, handle reservations, analyze churn risk, and more.
                </div>
              </div>
            </div>

            {/* Suggestion Groups */}
            <div className="space-y-3">
              {SUGGESTION_GROUPS.map(group => (
                <div key={group.label}>
                  <div className="text-[10px] font-semibold text-[#636366] uppercase tracking-wider mb-1.5 px-1">{group.label}</div>
                  <div className="space-y-1">
                    {group.items.map(q => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="group flex items-center w-full text-left text-xs text-[#a0a0a0] hover:text-white bg-dark-surface hover:bg-dark-surface2 border border-dark-border hover:border-primary-500/30 rounded-xl px-3 py-2.5 transition-all"
                      >
                        <ChevronRight size={12} className="text-[#636366] group-hover:text-primary-400 mr-2 flex-shrink-0 transition-colors" />
                        <span className="flex-1">{q}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500/20 to-primary-700/10 flex items-center justify-center flex-shrink-0 mt-0.5 border border-primary-500/10">
                <Bot size={14} className="text-primary-400" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary-600 text-dark-bg rounded-br-md font-medium'
                : 'bg-dark-surface text-[#c8c8c8] border border-dark-border rounded-bl-md'
            }`}>
              {msg.role === 'assistant' ? formatMessage(msg.content) : msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-dark-surface2 flex items-center justify-center flex-shrink-0 mt-0.5 border border-dark-border">
                <User size={14} className="text-[#8e8e93]" />
              </div>
            )}
          </div>
        ))}

        {/* Tool actions from last assistant message */}
        {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].actions?.length ? (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {messages[messages.length - 1].actions!.map((a: any, i: number) => (
              <span key={i} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                a.success ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                <Zap size={8} />
                {a.tool?.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        ) : null}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500/20 to-primary-700/10 flex items-center justify-center flex-shrink-0 border border-primary-500/10">
              <Bot size={14} className="text-primary-400" />
            </div>
            <div className="bg-dark-surface border border-dark-border rounded-2xl rounded-bl-md px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-[13px] text-[#8e8e93]">
                <Loader2 size={14} className="animate-spin text-primary-400" />
                <span>{toolStatus || 'Thinking…'}</span>
              </div>
              {toolStatus && (
                <div className="mt-1.5 flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '200ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '400ms' }} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-dark-border flex-shrink-0 bg-dark-surface/50">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about guests, loyalty, reservations…"
            disabled={loading}
            rows={1}
            className="flex-1 bg-dark-surface border border-dark-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 disabled:opacity-50 resize-none max-h-[100px]"
            style={{ minHeight: '42px' }}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="p-2.5 bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-dark-bg rounded-xl disabled:opacity-40 transition-all flex-shrink-0 shadow-md shadow-primary-500/10 disabled:shadow-none"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-[#4a4a4a]">Shift+Enter for new line</span>
          <span className="text-[10px] text-[#4a4a4a]">{messages.length} messages</span>
        </div>
      </div>
    </div>
  )
}
