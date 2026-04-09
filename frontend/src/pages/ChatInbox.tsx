import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  Inbox, Search, Send, UserPlus, CheckCircle, Archive,
  MessageSquare, User, Bot, AlertCircle, X, Flag,
  MapPin, Smile, ThumbsUp, ThumbsDown, GraduationCap, Edit3, Save,
  PauseCircle, PlayCircle, ArrowRightLeft, Zap, Paperclip, Download, FileText,
} from 'lucide-react'
import { API_URL } from '../lib/api'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

type ConvStatus = 'all' | 'active' | 'waiting' | 'resolved' | 'archived'

export function ChatInbox() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const initialId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const [selectedId, setSelectedId] = useState<number | null>(initialId)
  useEffect(() => {
    const id = searchParams.get('id')
    if (id) setSelectedId(Number(id))
  }, [searchParams])
  const [statusFilter, setStatusFilter] = useState<ConvStatus>('all')
  const [search, setSearch] = useState('')
  const [replyText, setReplyText] = useState('')
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [showContactEdit, setShowContactEdit] = useState(false)
  const [contactForm, setContactForm] = useState<any>({})
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showCannedMenu, setShowCannedMenu] = useState(false)
  const [showTransferMenu, setShowTransferMenu] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState<number | null>(null)
  const [feedbackForm, setFeedbackForm] = useState<{ rating: 'good' | 'bad'; comment: string; corrected_answer: string; apply_to_training: boolean }>({
    rating: 'good', comment: '', corrected_answer: '', apply_to_training: false,
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastTypingPingRef = useRef<number>(0)
  // Tracks the highest unread total we've seen so we only beep when it grows.
  // Persisted across mounts via a module-level ref so navigating away & back
  // doesn't replay the sound for already-known messages.
  const lastUnreadRef = useRef<number>(-1)

  // Tiny WebAudio "ding" — no asset file needed. Plays a short two-tone beep
  // when the unread count increases (a new visitor message arrived).
  const playDing = () => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      const ac = new Ctx()
      const playTone = (freq: number, start: number, dur: number) => {
        const o = ac.createOscillator()
        const g = ac.createGain()
        o.frequency.value = freq
        o.type = 'sine'
        o.connect(g); g.connect(ac.destination)
        g.gain.setValueAtTime(0.0001, ac.currentTime + start)
        g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + start + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur)
        o.start(ac.currentTime + start)
        o.stop(ac.currentTime + start + dur + 0.02)
      }
      playTone(880, 0, 0.12)
      playTone(1175, 0.13, 0.16)
      setTimeout(() => ac.close(), 600)
    } catch {}
  }

  // Throttled "agent typing" ping — fires at most once per 2s while the
  // agent is composing in the reply box. The server holds a 5s window so the
  // visitor's widget keeps showing typing dots between pings, then clears
  // naturally when the reply lands.
  const pingAgentTyping = () => {
    if (!selectedId) return
    const now = Date.now()
    if (now - lastTypingPingRef.current < 2000) return
    lastTypingPingRef.current = now
    api.post(`/v1/admin/chat-inbox/${selectedId}/typing`, { typing: true }).catch(() => {})
  }

  const EMOJIS = ['😊', '😀', '😂', '😍', '🙏', '👍', '👏', '🎉', '❤️', '🔥', '✨', '💯', '👋', '🤝', '☺️', '😎', '🙌', '💪', '🌟', '✅']

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['chat-inbox-stats'],
    queryFn: () => api.get('/v1/admin/chat-inbox/stats').then(r => r.data),
    refetchInterval: 5000,
  })

  // Beep whenever the unread count goes up. First load (lastUnreadRef = -1)
  // is treated as a baseline so we don't ding for pre-existing unreads.
  useEffect(() => {
    const cur = stats?.unread_messages ?? 0
    if (lastUnreadRef.current === -1) {
      lastUnreadRef.current = cur
      return
    }
    if (cur > lastUnreadRef.current) {
      playDing()
    }
    lastUnreadRef.current = cur
  }, [stats?.unread_messages])

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

  const uploadAttachment = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post(`/v1/admin/chat-inbox/${selectedId}/upload`, fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-inbox-detail', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-inbox'] })
      toast.success('File sent')
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Upload failed'),
  })

  const downloadTranscript = (format: 'text' | 'html') => {
    if (!selectedId) return
    const url = `${API_URL}/api/v1/admin/chat-inbox/${selectedId}/transcript?format=${format}`
    const token = localStorage.getItem('auth_token') || ''
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : Promise.reject(r))
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `chat-${selectedId}.${format === 'html' ? 'html' : 'txt'}`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      })
      .catch(() => toast.error('Failed to download transcript'))
  }

  const updateStatus = useMutation({
    mutationFn: (status: string) => api.put(`/v1/admin/chat-inbox/${selectedId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-inbox'] })
      qc.invalidateQueries({ queryKey: ['chat-inbox-detail', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-inbox-stats'] })
      toast.success('Status updated')
    },
  })

  const toggleAi = useMutation({
    mutationFn: (ai_enabled: boolean) =>
      api.put(`/v1/admin/chat-inbox/${selectedId}/ai-toggle`, { ai_enabled }),
    onSuccess: (_d, ai_enabled) => {
      qc.invalidateQueries({ queryKey: ['chat-inbox-detail', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-inbox'] })
      toast.success(ai_enabled ? 'AI auto-reply re-enabled' : 'AI paused — you are taking over')
    },
    onError: () => toast.error('Failed to toggle AI'),
  })

  const updateContact = useMutation({
    mutationFn: (data: any) => api.put(`/v1/admin/chat-inbox/${selectedId}/contact`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-inbox-detail', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-inbox'] })
      setShowContactEdit(false)
      toast.success('Contact details updated')
    },
    onError: () => toast.error('Failed to update contact'),
  })

  const submitFeedback = useMutation({
    mutationFn: ({ messageId, payload }: { messageId: number; payload: any }) =>
      api.post(`/v1/admin/chat-inbox/messages/${messageId}/feedback`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-inbox-detail', selectedId] })
      setFeedbackOpen(null)
      setFeedbackForm({ rating: 'good', comment: '', corrected_answer: '', apply_to_training: false })
      toast.success('Feedback saved')
    },
    onError: () => toast.error('Failed to save feedback'),
  })

  // Canned responses (org-scoped quick-reply snippets) and team agent list
  // for the transfer dropdown.
  const { data: cannedData } = useQuery({
    queryKey: ['chat-canned'],
    queryFn: () => api.get('/v1/admin/chat-inbox-canned').then(r => r.data),
    staleTime: 60000,
  })
  const cannedResponses: { label: string; text: string }[] = cannedData?.canned_responses || []

  const { data: agentList } = useQuery({
    queryKey: ['chat-agents'],
    queryFn: () => api.get('/v1/admin/chat-inbox-agents').then(r => r.data),
    staleTime: 60000,
  })

  const transferConv = useMutation({
    mutationFn: (userId: number) => api.put(`/v1/admin/chat-inbox/${selectedId}/assign`, { user_id: userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-inbox-detail', selectedId] })
      qc.invalidateQueries({ queryKey: ['chat-inbox'] })
      setShowTransferMenu(false)
      toast.success('Conversation transferred')
    },
    onError: () => toast.error('Failed to transfer'),
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
  const siblings = detail?.siblings || []

  // Hydrate contact form when conversation changes
  useEffect(() => {
    if (conv) {
      setContactForm({
        visitor_name: conv.visitor_name || '',
        visitor_email: conv.visitor_email || '',
        visitor_phone: conv.visitor_phone || '',
        visitor_country: conv.visitor_country || '',
        visitor_city: conv.visitor_city || '',
        agent_notes: conv.agent_notes || '',
      })
    }
  }, [conv?.id])

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400',
    waiting: 'bg-yellow-500/20 text-yellow-400',
    resolved: 'bg-blue-500/20 text-blue-400',
    archived: 'bg-dark-surface4 text-t-secondary',
  }

  const senderStyles: Record<string, { bg: string; align: string; icon: any }> = {
    visitor: { bg: 'bg-dark-surface border border-dark-border', align: 'justify-start', icon: User },
    ai: { bg: 'bg-primary-600/20 border border-primary-500/30', align: 'justify-start', icon: Bot },
    agent: { bg: 'bg-blue-600/30 border border-blue-500/30', align: 'justify-end', icon: User },
    system: { bg: 'bg-dark-surface/50', align: 'justify-center', icon: AlertCircle },
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
            <p className="text-sm text-t-secondary">Manage visitor and member chat conversations</p>
          </div>
        </div>
        {stats && (
          <div className="flex gap-4 text-xs">
            <div className="text-center"><div className="text-lg font-bold text-green-400">{stats.active}</div><div className="text-t-secondary">Active</div></div>
            <div className="text-center"><div className="text-lg font-bold text-yellow-400">{stats.waiting}</div><div className="text-t-secondary">Waiting</div></div>
            <div className="text-center"><div className="text-lg font-bold text-red-400">{stats.unassigned}</div><div className="text-t-secondary">Unassigned</div></div>
            <div className="text-center"><div className="text-lg font-bold text-blue-400">{stats.resolved_today}</div><div className="text-t-secondary">Resolved Today</div></div>
          </div>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ═══ LEFT: Conversation List ═══ */}
        <div className="w-96 flex-shrink-0 flex flex-col bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
          {/* Filters */}
          <div className="p-3 border-b border-dark-border space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-border2" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-8 pr-3 py-1.5 text-white text-xs"
                placeholder="Search by name or email..." />
            </div>
            <div className="flex gap-1">
              {(['all', 'active', 'waiting', 'resolved', 'archived'] as ConvStatus[]).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`flex-1 py-1 px-2 rounded text-xs capitalize transition-colors ${
                    statusFilter === s ? 'bg-primary-600 text-white' : 'text-t-secondary hover:text-white hover:bg-dark-surface3'
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="text-center text-t-secondary py-8 text-sm">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="text-center text-t-secondary py-8 text-sm">No conversations found</div>
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
                  <span className="text-xs text-t-secondary truncate">{c.visitor_email || c.channel}</span>
                  <span className="text-[10px] text-dark-border2">
                    {c.last_message_at ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true }) : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {c.assigned_agent && <span className="text-[10px] text-t-secondary">@ {c.assigned_agent.name}</span>}
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
                <div className="text-xs text-t-secondary mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                  {conv.visitor_email && <span>{conv.visitor_email}</span>}
                  {conv.visitor_phone && <span>| {conv.visitor_phone}</span>}
                  <span>| {conv.channel}</span>
                  {(conv.visitor_country || conv.visitor_city || conv.visitor_ip) && (
                    <span className="flex items-center gap-1 text-primary-300">
                      <MapPin size={10} />
                      {[conv.visitor_city, conv.visitor_country].filter(Boolean).join(', ') || conv.visitor_ip}
                      {conv.visitor_ip && <span className="text-dark-border2">({conv.visitor_ip})</span>}
                    </span>
                  )}
                  {siblings.length > 0 && (
                    <span className="text-yellow-400">| {siblings.length} other session{siblings.length !== 1 ? 's' : ''} from this IP</span>
                  )}
                  {conv.assigned_agent && <span>| Assigned: {conv.assigned_agent.name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleAi.mutate(!(conv.ai_enabled ?? true))}
                  disabled={toggleAi.isPending}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg ${
                    (conv.ai_enabled ?? true)
                      ? 'bg-primary-600/20 text-primary-300 hover:bg-primary-600/30'
                      : 'bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/30'
                  }`}
                  title={(conv.ai_enabled ?? true) ? 'Click to pause AI auto-replies and take over' : 'Click to re-enable AI auto-replies'}
                >
                  {(conv.ai_enabled ?? true) ? <><PauseCircle size={12} /> Pause AI</> : <><PlayCircle size={12} /> Resume AI</>}
                </button>
                <button onClick={() => setShowContactEdit(v => !v)}
                  className="flex items-center gap-1 text-xs bg-primary-600/20 text-primary-300 px-3 py-1.5 rounded-lg hover:bg-primary-600/30">
                  <Edit3 size={12} /> {showContactEdit ? 'Hide' : 'Contact'}
                </button>
                {!conv.lead_captured && (
                  <button onClick={() => {
                    setLeadForm({ name: conv.visitor_name || '', email: conv.visitor_email || '', phone: conv.visitor_phone || '', notes: '' })
                    setShowLeadForm(true)
                  }} className="flex items-center gap-1 text-xs bg-green-600/20 text-green-400 px-3 py-1.5 rounded-lg hover:bg-green-600/30">
                    <UserPlus size={12} /> Capture Lead
                  </button>
                )}
                <div className="relative">
                  <button onClick={() => setShowTransferMenu(v => !v)}
                    className="flex items-center gap-1 text-xs bg-purple-600/20 text-purple-400 px-3 py-1.5 rounded-lg hover:bg-purple-600/30">
                    <ArrowRightLeft size={12} /> Transfer
                  </button>
                  {showTransferMenu && (
                    <div className="absolute right-0 top-full mt-1 z-20 bg-dark-surface border border-dark-border rounded-lg shadow-xl min-w-[200px] max-h-72 overflow-y-auto">
                      {(agentList || []).length === 0 && (
                        <div className="p-3 text-xs text-t-secondary">No agents available</div>
                      )}
                      {(agentList || []).map((a: any) => (
                        <button key={a.id} onClick={() => transferConv.mutate(a.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs text-white hover:bg-dark-surface2 border-b border-dark-border last:border-b-0">
                          <div className="w-6 h-6 rounded-full bg-purple-600/30 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {a.name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{a.name}</div>
                            <div className="text-[10px] text-t-secondary truncate">{a.email}</div>
                          </div>
                          {conv.assigned_to === a.id && <span className="text-[10px] text-primary-400">current</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => downloadTranscript('text')}
                  title="Download transcript (.txt)"
                  className="flex items-center gap-1 text-xs bg-dark-surface3 text-t-secondary hover:text-white px-3 py-1.5 rounded-lg">
                  <Download size={12} /> Transcript
                </button>
                {conv.status !== 'resolved' && (
                  <button onClick={() => updateStatus.mutate('resolved')}
                    className="flex items-center gap-1 text-xs bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-lg hover:bg-blue-600/30">
                    <CheckCircle size={12} /> Resolve
                  </button>
                )}
                {conv.status !== 'archived' && (
                  <button onClick={() => updateStatus.mutate('archived')}
                    className="flex items-center gap-1 text-xs bg-dark-surface4 text-t-secondary px-3 py-1.5 rounded-lg hover:bg-dark-border2">
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
                  <button onClick={() => setShowLeadForm(false)} className="text-t-secondary hover:text-white"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={leadForm.name} onChange={e => setLeadForm(p => ({ ...p, name: e.target.value }))}
                    className="bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Name" />
                  <input type="email" value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))}
                    className="bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Email" />
                  <input type="text" value={leadForm.phone} onChange={e => setLeadForm(p => ({ ...p, phone: e.target.value }))}
                    className="bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Phone" />
                </div>
                <textarea value={leadForm.notes} onChange={e => setLeadForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} className="w-full bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Notes..." />
                <button onClick={() => captureLead.mutate(leadForm)} disabled={captureLead.isPending}
                  className="bg-green-600 text-white px-4 py-1.5 rounded text-xs hover:bg-green-700 disabled:opacity-50">
                  {captureLead.isPending ? 'Saving...' : 'Create Inquiry'}
                </button>
              </div>
            )}

            {/* Contact Edit Panel */}
            {showContactEdit && (
              <div className="p-4 border-b border-dark-border bg-primary-900/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Contact details & notes</h3>
                  <button onClick={() => setShowContactEdit(false)} className="text-t-secondary hover:text-white"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={contactForm.visitor_name || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_name: e.target.value }))}
                    className="bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Name" />
                  <input type="email" value={contactForm.visitor_email || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_email: e.target.value }))}
                    className="bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Email" />
                  <input type="text" value={contactForm.visitor_phone || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_phone: e.target.value }))}
                    className="bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Phone" />
                  <input type="text" value={contactForm.visitor_country || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_country: e.target.value }))}
                    className="bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Country" />
                  <input type="text" value={contactForm.visitor_city || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_city: e.target.value }))}
                    className="bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="City" />
                </div>
                <textarea value={contactForm.agent_notes || ''} onChange={e => setContactForm((p: any) => ({ ...p, agent_notes: e.target.value }))}
                  rows={2} className="w-full bg-dark-surface border border-dark-border rounded px-2 py-1.5 text-white text-xs" placeholder="Internal notes about this visitor..." />
                <button onClick={() => updateContact.mutate(contactForm)} disabled={updateContact.isPending}
                  className="flex items-center gap-1 bg-primary-600 text-white px-4 py-1.5 rounded text-xs hover:bg-primary-700 disabled:opacity-50">
                  <Save size={12} /> {updateContact.isPending ? 'Saving...' : 'Save contact'}
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
                      <span className="text-[10px] text-dark-border2 bg-dark-surface px-3 py-1 rounded-full">{msg.content}</span>
                    </div>
                  )
                }

                return (
                  <div key={msg.id} className={`flex ${style.align} gap-2`}>
                    {msg.sender_type !== 'agent' && (
                      <div className="w-7 h-7 rounded-full bg-dark-surface4 flex items-center justify-center flex-shrink-0">
                        <Icon size={12} className="text-t-secondary" />
                      </div>
                    )}
                    <div className={`${style.bg} rounded-xl px-3 py-2 max-w-[70%]`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-t-secondary capitalize">
                          {msg.sender_type === 'agent' ? (msg.sender_user?.name || 'Agent') : msg.sender_type}
                        </span>
                        <span className="text-[10px] text-dark-border2">
                          {msg.created_at ? formatDistanceToNow(new Date(msg.created_at), { addSuffix: true }) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
                      {msg.attachment_url && (
                        <div className="mt-2">
                          {msg.attachment_type === 'image' ? (
                            <a href={API_URL + msg.attachment_url} target="_blank" rel="noopener noreferrer">
                              <img src={API_URL + msg.attachment_url} alt={msg.content || 'attachment'}
                                className="max-w-[200px] max-h-[200px] rounded-lg border border-dark-border" />
                            </a>
                          ) : (
                            <a href={API_URL + msg.attachment_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 bg-dark-surface px-3 py-2 rounded border border-dark-border text-xs text-primary-400 hover:text-primary-300">
                              <FileText size={14} /> {msg.content || 'Download file'}
                            </a>
                          )}
                        </div>
                      )}
                      {msg.sender_type === 'ai' && (
                        <div className="mt-2 pt-2 border-t border-primary-500/20">
                          {msg.feedback ? (
                            <div className="flex items-center gap-2 text-[10px] text-t-secondary">
                              {msg.feedback.rating === 'good' ? <ThumbsUp size={10} className="text-green-400" /> : <ThumbsDown size={10} className="text-red-400" />}
                              <span>Reviewed</span>
                              {msg.feedback.applied_to_training && <span className="flex items-center gap-1 text-yellow-400"><GraduationCap size={10} /> trained</span>}
                              <button onClick={() => { setFeedbackOpen(msg.id); setFeedbackForm({ rating: msg.feedback.rating, comment: msg.feedback.comment || '', corrected_answer: '', apply_to_training: false }) }} className="ml-auto text-primary-400 hover:underline">Edit</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setFeedbackOpen(msg.id); setFeedbackForm({ rating: 'good', comment: '', corrected_answer: '', apply_to_training: false }) }} className="text-[10px] text-t-secondary hover:text-green-400 flex items-center gap-1"><ThumbsUp size={10} /> Good</button>
                              <button onClick={() => { setFeedbackOpen(msg.id); setFeedbackForm({ rating: 'bad', comment: '', corrected_answer: '', apply_to_training: true }) }} className="text-[10px] text-t-secondary hover:text-red-400 flex items-center gap-1"><ThumbsDown size={10} /> Bad / Correct it</button>
                            </div>
                          )}
                          {feedbackOpen === msg.id && (
                            <div className="mt-2 space-y-2 bg-dark-surface/60 p-2 rounded border border-dark-border">
                              <div className="flex gap-2">
                                <button onClick={() => setFeedbackForm(p => ({ ...p, rating: 'good' }))}
                                  className={`flex-1 text-[10px] py-1 rounded flex items-center justify-center gap-1 ${feedbackForm.rating === 'good' ? 'bg-green-600/30 text-green-300' : 'bg-dark-surface text-t-secondary'}`}>
                                  <ThumbsUp size={10} /> Good
                                </button>
                                <button onClick={() => setFeedbackForm(p => ({ ...p, rating: 'bad' }))}
                                  className={`flex-1 text-[10px] py-1 rounded flex items-center justify-center gap-1 ${feedbackForm.rating === 'bad' ? 'bg-red-600/30 text-red-300' : 'bg-dark-surface text-t-secondary'}`}>
                                  <ThumbsDown size={10} /> Bad
                                </button>
                              </div>
                              <textarea value={feedbackForm.comment} onChange={e => setFeedbackForm(p => ({ ...p, comment: e.target.value }))}
                                rows={2} className="w-full bg-dark-surface border border-dark-border rounded px-2 py-1 text-white text-xs" placeholder="Comment (optional)" />
                              {feedbackForm.rating === 'bad' && (
                                <>
                                  <textarea value={feedbackForm.corrected_answer} onChange={e => setFeedbackForm(p => ({ ...p, corrected_answer: e.target.value }))}
                                    rows={3} className="w-full bg-dark-surface border border-dark-border rounded px-2 py-1 text-white text-xs" placeholder="What should the AI have said?" />
                                  <label className="flex items-center gap-2 text-[10px] text-t-secondary">
                                    <input type="checkbox" checked={feedbackForm.apply_to_training} onChange={e => setFeedbackForm(p => ({ ...p, apply_to_training: e.target.checked }))} />
                                    <GraduationCap size={10} /> Save corrected answer to AI knowledge base
                                  </label>
                                </>
                              )}
                              <div className="flex gap-2">
                                <button onClick={() => submitFeedback.mutate({ messageId: msg.id, payload: feedbackForm })} disabled={submitFeedback.isPending}
                                  className="flex-1 bg-primary-600 text-white text-[10px] py-1 rounded hover:bg-primary-700 disabled:opacity-50">
                                  {submitFeedback.isPending ? 'Saving...' : 'Submit feedback'}
                                </button>
                                <button onClick={() => setFeedbackOpen(null)} className="px-3 text-[10px] text-t-secondary hover:text-white">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {msg.sender_type === 'agent' && (
                      <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0">
                        <Icon size={12} className="text-blue-400" />
                      </div>
                    )}
                  </div>
                )
              })}
              {detail?.visitor_typing && (
                <div className="flex justify-start mb-2">
                  <div className="bg-dark-surface border border-dark-border rounded-2xl px-4 py-2 flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-t-secondary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-t-secondary animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-t-secondary animate-bounce" style={{ animationDelay: '240ms' }} />
                    <span className="text-[10px] text-t-muted ml-1">visitor typing…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Input */}
            {conv.status !== 'archived' && (
              <div className="p-3 border-t border-dark-border relative">
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-3 mb-2 bg-dark-surface border border-dark-border rounded-lg p-2 shadow-xl grid grid-cols-10 gap-1 z-10">
                    {EMOJIS.map(e => (
                      <button key={e} type="button" onClick={() => { setReplyText(p => p + e); setShowEmojiPicker(false) }}
                        className="text-lg hover:bg-dark-surface3 rounded p-1">{e}</button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <button type="button" onClick={() => setShowEmojiPicker(v => !v)}
                    className="bg-dark-surface border border-dark-border text-t-secondary hover:text-white rounded-lg p-2.5"
                    title="Insert emoji">
                    <Smile size={16} />
                  </button>
                  <input ref={fileInputRef} type="file" className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) uploadAttachment.mutate(file)
                    }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    disabled={uploadAttachment.isPending}
                    className="bg-dark-surface border border-dark-border text-t-secondary hover:text-white rounded-lg p-2.5 disabled:opacity-50"
                    title="Attach file or image">
                    <Paperclip size={16} />
                  </button>
                  <div className="relative">
                    <button type="button" onClick={() => setShowCannedMenu(v => !v)}
                      className="bg-dark-surface border border-dark-border text-t-secondary hover:text-white rounded-lg p-2.5"
                      title="Insert canned response">
                      <Zap size={16} />
                    </button>
                    {showCannedMenu && (
                      <div className="absolute bottom-full left-0 mb-2 z-20 bg-dark-surface border border-dark-border rounded-lg shadow-xl min-w-[260px] max-h-72 overflow-y-auto">
                        {cannedResponses.length === 0 && (
                          <div className="p-3 text-xs text-t-secondary">No canned responses yet. Add some in Chatbot Setup.</div>
                        )}
                        {cannedResponses.map((c, i) => (
                          <button key={i} onClick={() => { setReplyText(p => p ? p + ' ' + c.text : c.text); setShowCannedMenu(false) }}
                            className="block w-full text-left px-3 py-2 text-xs text-white hover:bg-dark-surface2 border-b border-dark-border last:border-b-0">
                            <div className="font-medium">{c.label}</div>
                            <div className="text-[10px] text-t-secondary truncate">{c.text}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={replyText}
                    onChange={e => { setReplyText(e.target.value); pingAgentTyping() }}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    className="flex-1 bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm resize-none"
                    placeholder="Type a reply as agent... (Enter to send, Shift+Enter for newline)"
                  />
                  <button
                    onClick={() => { if (replyText.trim()) sendReply.mutate(replyText.trim()) }}
                    disabled={!replyText.trim() || sendReply.isPending}
                    className="bg-primary-600 text-white px-4 py-2.5 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-dark-surface border border-dark-border rounded-xl">
            <div className="text-center text-t-secondary">
              <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a conversation to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
