import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  Inbox, Search, Send, UserPlus, CheckCircle, Archive,
  MessageSquare, User, Bot, AlertCircle, X, Flag,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

type ConvStatus = 'all' | 'active' | 'waiting' | 'resolved' | 'archived'

export function ChatInbox() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<ConvStatus>('all')
  const [search, setSearch] = useState('')
  const [replyText, setReplyText] = useState('')
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['chat-inbox-stats'],
    queryFn: () => api.get('/v1/admin/chat-inbox/stats').then(r => r.data),
    refetchInterval: 15000,
  })

  // Conversation list
  const { data: convData, isLoading } = useQuery({
    queryKey: ['chat-inbox', statusFilter, search],
    queryFn: () => api.get('/v1/admin/chat-inbox', {
      params: { status: statusFilter !== 'all' ? statusFilter : undefined, search: search || undefined },
    }).then(r => r.data),
    refetchInterval: 10000,
  })
  const conversations = convData?.data || []

  // Selected conversation detail
  const { data: detail } = useQuery({
    queryKey: ['chat-inbox-detail', selectedId],
    queryFn: () => api.get(`/v1/admin/chat-inbox/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
    refetchInterval: 5000,
  })

  const sendReply = useMutation({
    mutationFn: (content: string) => api.post(`/v1/admin/chat-inbox/${selectedId}/messages`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-inbox-detail', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-inbox'] })
      setReplyText('')
    },
    onError: () => toast.error('Failed to send message'),
  })

  const updateStatus = useMutation({
    mutationFn: (status: string) => api.put(`/v1/admin/chat-inbox/${selectedId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-inbox'] })
      qc.invalidateQueries({ queryKey: ['chat-inbox-detail', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-inbox-stats'] })
      toast.success('Status updated')
    },
  })

  const captureLead = useMutation({
    mutationFn: (data: any) => api.post(`/v1/admin/chat-inbox/${selectedId}/capture-lead`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-inbox-detail', selectedId] })
      setShowLeadForm(false)
      setLeadForm({ name: '', email: '', phone: '', notes: '' })
      toast.success('Lead captured as inquiry')
    },
    onError: () => toast.error('Failed to capture lead'),
  })

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [detail?.messages])

  const conv = detail?.conversation
  const messages = detail?.messages || []

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400',
    waiting: 'bg-yellow-500/20 text-yellow-400',
    resolved: 'bg-blue-500/20 text-blue-400',
    archived: 'bg-[#333] text-[#8e8e93]',
  }

  const senderStyles: Record<string, { bg: string; align: string; icon: any }> = {
    visitor: { bg: 'bg-[#1c1c1e] border border-dark-border', align: 'justify-start', icon: User },
    ai: { bg: 'bg-primary-600/20 border border-primary-500/30', align: 'justify-start', icon: Bot },
    agent: { bg: 'bg-blue-600/30 border border-blue-500/30', align: 'justify-end', icon: User },
    system: { bg: 'bg-[#1c1c1e]/50', align: 'justify-center', icon: AlertCircle },
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (replyText.trim()) sendReply.mutate(replyText.trim())
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Inbox className="text-primary-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-white">Chat Inbox</h1>
            <p className="text-sm text-[#8e8e93]">Manage visitor and member chat conversations</p>
          </div>
        </div>
        {stats && (
          <div className="flex gap-4 text-xs">
            <div className="text-center"><div className="text-lg font-bold text-green-400">{stats.active}</div><div className="text-[#8e8e93]">Active</div></div>
            <div className="text-center"><div className="text-lg font-bold text-yellow-400">{stats.waiting}</div><div className="text-[#8e8e93]">Waiting</div></div>
            <div className="text-center"><div className="text-lg font-bold text-red-400">{stats.unassigned}</div><div className="text-[#8e8e93]">Unassigned</div></div>
            <div className="text-center"><div className="text-lg font-bold text-blue-400">{stats.resolved_today}</div><div className="text-[#8e8e93]">Resolved Today</div></div>
          </div>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ═══ LEFT: Conversation List ═══ */}
        <div className="w-96 flex-shrink-0 flex flex-col bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
          {/* Filters */}
          <div className="p-3 border-b border-dark-border space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555]" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg pl-8 pr-3 py-1.5 text-white text-xs"
                placeholder="Search by name or email..." />
            </div>
            <div className="flex gap-1">
              {(['all', 'active', 'waiting', 'resolved', 'archived'] as ConvStatus[]).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`flex-1 py-1 px-2 rounded text-xs capitalize transition-colors ${
                    statusFilter === s ? 'bg-primary-600 text-white' : 'text-[#8e8e93] hover:text-white hover:bg-[#222]'
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="text-center text-[#8e8e93] py-8 text-sm">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="text-center text-[#8e8e93] py-8 text-sm">No conversations found</div>
            ) : conversations.map((c: any) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={`w-full text-left p-3 border-b border-dark-border hover:bg-[#1a1a1a] transition-colors ${
                  selectedId === c.id ? 'bg-[#1a1a1a] border-l-2 border-l-primary-500' : ''
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">
                    {c.member?.user?.name || c.visitor_name || 'Visitor'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[c.status] || ''}`}>
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8e8e93] truncate">{c.visitor_email || c.channel}</span>
                  <span className="text-[10px] text-[#555]">
                    {c.last_message_at ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true }) : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {c.assigned_agent && <span className="text-[10px] text-[#8e8e93]">@ {c.assigned_agent.name}</span>}
                  {c.unread_count > 0 && (
                    <span className="bg-primary-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{c.unread_count}</span>
                  )}
                  {c.lead_captured && <Flag size={10} className="text-green-400" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ═══ RIGHT: Conversation Detail ═══ */}
        {selectedId && conv ? (
          <div className="flex-1 flex flex-col bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
            {/* Conversation Header */}
            <div className="p-4 border-b border-dark-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">{conv.member?.user?.name || conv.visitor_name || 'Visitor'}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[conv.status] || ''}`}>{conv.status}</span>
                  {conv.member?.tier && <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded">{conv.member.tier.name}</span>}
                </div>
                <div className="text-xs text-[#8e8e93] mt-0.5">
                  {conv.visitor_email && <span>{conv.visitor_email}</span>}
                  {conv.visitor_phone && <span> | {conv.visitor_phone}</span>}
                  <span> | {conv.channel}</span>
                  {conv.assigned_agent && <span> | Assigned: {conv.assigned_agent.name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!conv.lead_captured && (
                  <button onClick={() => {
                    setLeadForm({ name: conv.visitor_name || '', email: conv.visitor_email || '', phone: conv.visitor_phone || '', notes: '' })
                    setShowLeadForm(true)
                  }} className="flex items-center gap-1 text-xs bg-green-600/20 text-green-400 px-3 py-1.5 rounded-lg hover:bg-green-600/30">
                    <UserPlus size={12} /> Capture Lead
                  </button>
                )}
                {conv.status !== 'resolved' && (
                  <button onClick={() => updateStatus.mutate('resolved')}
                    className="flex items-center gap-1 text-xs bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-lg hover:bg-blue-600/30">
                    <CheckCircle size={12} /> Resolve
                  </button>
                )}
                {conv.status !== 'archived' && (
                  <button onClick={() => updateStatus.mutate('archived')}
                    className="flex items-center gap-1 text-xs bg-[#333] text-[#8e8e93] px-3 py-1.5 rounded-lg hover:bg-[#444]">
                    <Archive size={12} /> Archive
                  </button>
                )}
              </div>
            </div>

            {/* Lead Capture Modal */}
            {showLeadForm && (
              <div className="p-4 border-b border-dark-border bg-green-900/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Capture Lead as Inquiry</h3>
                  <button onClick={() => setShowLeadForm(false)} className="text-[#8e8e93] hover:text-white"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={leadForm.name} onChange={e => setLeadForm(p => ({ ...p, name: e.target.value }))}
                    className="bg-[#1c1c1e] border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Name" />
                  <input type="email" value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))}
                    className="bg-[#1c1c1e] border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Email" />
                  <input type="text" value={leadForm.phone} onChange={e => setLeadForm(p => ({ ...p, phone: e.target.value }))}
                    className="bg-[#1c1c1e] border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Phone" />
                </div>
                <textarea value={leadForm.notes} onChange={e => setLeadForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} className="w-full bg-[#1c1c1e] border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Notes..." />
                <button onClick={() => captureLead.mutate(leadForm)} disabled={captureLead.isPending}
                  className="bg-green-600 text-white px-4 py-1.5 rounded text-xs hover:bg-green-700 disabled:opacity-50">
                  {captureLead.isPending ? 'Saving...' : 'Create Inquiry'}
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg: any) => {
                const style = senderStyles[msg.sender_type] || senderStyles.system
                const Icon = style.icon

                if (msg.sender_type === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-[10px] text-[#555] bg-[#1c1c1e] px-3 py-1 rounded-full">{msg.content}</span>
                    </div>
                  )
                }

                return (
                  <div key={msg.id} className={`flex ${style.align} gap-2`}>
                    {msg.sender_type !== 'agent' && (
                      <div className="w-7 h-7 rounded-full bg-[#333] flex items-center justify-center flex-shrink-0">
                        <Icon size={12} className="text-[#8e8e93]" />
                      </div>
                    )}
                    <div className={`${style.bg} rounded-xl px-3 py-2 max-w-[70%]`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-[#8e8e93] capitalize">
                          {msg.sender_type === 'agent' ? (msg.sender_user?.name || 'Agent') : msg.sender_type}
                        </span>
                        <span className="text-[10px] text-[#555]">
                          {msg.created_at ? formatDistanceToNow(new Date(msg.created_at), { addSuffix: true }) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.sender_type === 'agent' && (
                      <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0">
                        <Icon size={12} className="text-blue-400" />
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Input */}
            {conv.status !== 'archived' && (
              <div className="p-3 border-t border-dark-border">
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    className="flex-1 bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm resize-none"
                    placeholder="Type a reply as agent... (Enter to send, Shift+Enter for newline)"
                  />
                  <button
                    onClick={() => { if (replyText.trim()) sendReply.mutate(replyText.trim()) }}
                    disabled={!replyText.trim() || sendReply.isPending}
                    className="bg-primary-600 text-white px-4 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-dark-surface border border-dark-border rounded-xl">
            <div className="text-center text-[#8e8e93]">
              <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a conversation to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
