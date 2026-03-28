import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { X, Send, Loader2, Sparkles, Trash2 } from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string }

export default function AiChat() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res = await api.post('/v1/admin/crm-ai/chat', { messages: next })
      setMessages([...next, { role: 'assistant', content: res.data.response }])
      // Refresh data if AI made changes
      if (res.data.actions?.some((a: any) => a.tool?.startsWith('create_') || a.tool?.startsWith('update_'))) {
        qc.invalidateQueries()
      }
    } catch (e: any) {
      setMessages([...next, { role: 'assistant', content: 'Error: ' + (e.response?.data?.message || 'Could not reach AI service.') }])
    } finally {
      setLoading(false)
    }
  }

  const suggestions = [
    "How many arrivals do we have today?",
    "Show in-house VIP guests",
    "What's our pipeline value?",
    "Search loyalty members with Gold tier",
  ]

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 w-12 h-12 rounded-full bg-primary-500 hover:bg-primary-600 text-dark-bg flex items-center justify-center shadow-lg shadow-primary-500/20 z-50 transition-all hover:scale-105"
        title="Hotel AI Assistant"
      >
        <Sparkles size={20} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 w-[400px] h-[540px] bg-dark-surface border border-dark-border rounded-2xl shadow-2xl shadow-black/40 z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-border flex items-center justify-between flex-shrink-0 bg-dark-surface2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-500/15 flex items-center justify-center">
            <Sparkles size={15} className="text-primary-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Hotel Assistant</div>
            <div className="text-xs text-[#636366]">Guests, inquiries, reservations, loyalty — just ask</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-1.5 rounded-lg hover:bg-dark-surface text-[#636366] hover:text-gray-300 transition-colors"
              title="Clear chat"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-dark-surface text-[#636366] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 mx-auto rounded-xl bg-primary-500/10 flex items-center justify-center">
              <Sparkles size={22} className="text-primary-500" />
            </div>
            <div>
              <div className="text-sm font-medium text-white mb-1">How can I help?</div>
              <div className="text-xs text-[#636366]">I can search guests, manage inquiries, reservations, loyalty members, and more.</div>
            </div>
            <div className="space-y-1.5 text-left">
              {suggestions.map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="block w-full text-left text-xs text-[#8e8e93] hover:text-primary-400 bg-dark-surface2 hover:bg-dark-surface2/80 border border-dark-border rounded-lg px-3 py-2 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary-500 text-dark-bg rounded-br-md'
                  : 'bg-dark-surface2 text-gray-200 border border-dark-border rounded-bl-md'
              }`}
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-dark-surface2 border border-dark-border rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-[#8e8e93] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-primary-400" />
              <span>Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-dark-border flex-shrink-0">
        <form onSubmit={e => { e.preventDefault(); send() }} className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything…"
            disabled={loading}
            className="flex-1 bg-dark-surface2 border border-dark-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#636366] focus:outline-none focus:border-primary-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 bg-primary-500 hover:bg-primary-600 text-dark-bg rounded-xl disabled:opacity-40 transition-colors flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}
