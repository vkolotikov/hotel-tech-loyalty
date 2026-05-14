import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  Search, Send, CheckCircle, Archive, MessageSquare, User, Bot, X,
  MapPin, Smile, ThumbsUp, ThumbsDown, GraduationCap, Save,
  PauseCircle, PlayCircle, ArrowRightLeft, Zap, Paperclip, Download, FileText,
  MoreHorizontal, UserPlus, Edit3, Mic, Square, Loader2, ChevronLeft,
} from 'lucide-react'
import { API_URL } from '../lib/api'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

type ConvStatus = 'all' | 'active' | 'waiting' | 'resolved' | 'archived'

export function ChatInbox() {
  const { t } = useTranslation()
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
  const [groupByVisitor, setGroupByVisitor] = useState<boolean>(() => {
    try { return localStorage.getItem('chat-inbox-group-by-visitor') !== '0' } catch { return true }
  })
  const [replyText, setReplyText] = useState('')
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [showContactEdit, setShowContactEdit] = useState(false)
  const [contactForm, setContactForm] = useState<any>({})
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showCannedMenu, setShowCannedMenu] = useState(false)
  const [showTransferMenu, setShowTransferMenu] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState<number | null>(null)
  const [feedbackForm, setFeedbackForm] = useState<{ rating: 'good' | 'bad'; comment: string; corrected_answer: string; apply_to_training: boolean }>({
    rating: 'good', comment: '', corrected_answer: '', apply_to_training: false,
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastTypingPingRef = useRef<number>(0)
  const lastUnreadRef = useRef<number>(-1)

  // Voice dictation: agents tap the mic, speak their reply, and we drop the
  // transcript into the reply textarea. Manual-send only — we never auto-post
  // so the agent can edit wording before the visitor sees it.
  const [micState, setMicState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])

  const hasMediaRecorder = typeof window !== 'undefined'
    && 'MediaRecorder' in window
    && !!navigator.mediaDevices?.getUserMedia

  const pickRecorderMime = (): string => {
    const prefs = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      for (const m of prefs) if (MediaRecorder.isTypeSupported(m)) return m
    }
    return ''
  }

  const cleanupMic = () => {
    if (mediaStreamRef.current) {
      try { mediaStreamRef.current.getTracks().forEach(t => t.stop()) } catch {}
      mediaStreamRef.current = null
    }
    mediaRecorderRef.current = null
    mediaChunksRef.current = []
  }

  const startDictation = async () => {
    if (micState !== 'idle') return
    if (!hasMediaRecorder) {
      toast.error(t('chat_inbox.toasts.voice_unsupported', 'Voice input not supported in this browser'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      mediaChunksRef.current = []
      const mime = pickRecorderMime()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      mediaRecorderRef.current = rec

      rec.addEventListener('dataavailable', (e) => {
        if (e.data && e.data.size > 0) mediaChunksRef.current.push(e.data)
      })
      rec.addEventListener('stop', async () => {
        const blob = new Blob(mediaChunksRef.current, { type: rec.mimeType || 'audio/webm' })
        cleanupMic()
        if (blob.size < 800) {
          setMicState('idle')
          return
        }
        setMicState('transcribing')
        try {
          const mime = blob.type || 'audio/webm'
          const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'
          const fd = new FormData()
          fd.append('audio', blob, `reply.${ext}`)
          const res = await api.post('/v1/admin/chat-inbox/transcribe', fd)
          const text = String(res.data?.text || '').trim()
          if (text) {
            setReplyText(prev => (prev.trim() ? prev.trim() + ' ' + text : text))
          } else {
            toast(t('chat_inbox.toasts.no_speech', 'No speech detected'), { icon: 'ℹ️' })
          }
        } catch (e: any) {
          toast.error(e?.response?.data?.error || t('chat_inbox.toasts.transcription_failed', 'Transcription failed'))
        } finally {
          setMicState('idle')
        }
      })
      rec.addEventListener('error', () => {
        cleanupMic()
        setMicState('idle')
      })

      setMicState('recording')
      rec.start()
    } catch (e: any) {
      toast.error(t('chat_inbox.toasts.mic_denied', 'Microphone permission denied'))
      cleanupMic()
      setMicState('idle')
    }
  }

  const stopDictation = () => {
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch {}
    }
  }

  const toggleDictation = () => {
    if (micState === 'recording') stopDictation()
    else if (micState === 'idle') startDictation()
  }

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

  const pingAgentTyping = () => {
    if (!selectedId) return
    const now = Date.now()
    if (now - lastTypingPingRef.current < 2000) return
    lastTypingPingRef.current = now
    api.post(`/v1/admin/chat-inbox/${selectedId}/typing`, { typing: true }).catch(() => {})
  }

  const EMOJIS = ['😊', '😀', '😂', '😍', '🙏', '👍', '👏', '🎉', '❤️', '🔥', '✨', '💯', '👋', '🤝', '☺️', '😎', '🙌', '💪', '🌟', '✅']

  const { data: stats } = useQuery({
    queryKey: ['chat-inbox-stats'],
    queryFn: () => api.get('/v1/admin/chat-inbox/stats').then(r => r.data),
    refetchInterval: 5000,
  })

  useEffect(() => {
    const total = stats?.unread_messages ?? 0
    if (lastUnreadRef.current === -1) { lastUnreadRef.current = total; return }
    if (total > lastUnreadRef.current) playDing()
    lastUnreadRef.current = total
  }, [stats?.unread_messages])

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['chat-inbox', statusFilter, search, groupByVisitor],
    queryFn: () => api.get('/v1/admin/chat-inbox', {
      params: { status: statusFilter === 'all' ? undefined : statusFilter, search: search || undefined, group_by_visitor: groupByVisitor ? 1 : 0 },
    }).then(r => r.data.data || r.data),
    refetchInterval: 10000,
  })

  const { data: detail } = useQuery({
    queryKey: ['chat-inbox-detail', selectedId],
    queryFn: () => api.get(`/v1/admin/chat-inbox/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
    refetchInterval: 5000,
  })
  const conv = detail?.conversation
  const messages: any[] = detail?.messages || []
  // detail?.siblings available for future session linking

  const { data: cannedResponses = [] } = useQuery({
    queryKey: ['chat-canned'],
    queryFn: () => api.get('/v1/admin/chat-inbox-canned').then(r => r.data),
    staleTime: 60000,
  })
  const { data: agentList } = useQuery({
    queryKey: ['chat-agents'],
    queryFn: () => api.get('/v1/admin/chat-inbox-agents').then(r => r.data),
    staleTime: 60000,
  })

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  useEffect(() => {
    if (conv && showContactEdit) {
      setContactForm({
        visitor_name: conv.visitor_name || '', visitor_email: conv.visitor_email || '',
        visitor_phone: conv.visitor_phone || '', visitor_country: conv.visitor_country || '',
        visitor_city: conv.visitor_city || '', agent_notes: conv.agent_notes || '',
      })
    }
  }, [conv?.id, showContactEdit])

  const invalidateAll = () => { qc.invalidateQueries({ queryKey: ['chat-inbox-detail'] }); qc.invalidateQueries({ queryKey: ['chat-inbox'] }) }

  const sendReply = useMutation({
    mutationFn: (text: string) => api.post(`/v1/admin/chat-inbox/${selectedId}/messages`, { content: text }),
    onSuccess: () => { setReplyText(''); invalidateAll() },
    onError: () => toast.error(t('chat_inbox.toasts.send_failed', 'Failed to send')),
  })

  const uploadAttachment = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData(); fd.append('file', file)
      return api.post(`/v1/admin/chat-inbox/${selectedId}/upload`, fd)
    },
    onSuccess: () => { invalidateAll(); toast.success(t('chat_inbox.toasts.file_sent', 'File sent')) },
    onError: () => toast.error(t('chat_inbox.toasts.upload_failed', 'Upload failed (max 8MB)')),
  })

  const downloadTranscript = (format: 'text' | 'html') => {
    window.open(`${API_URL}/api/v1/admin/chat-inbox/${selectedId}/transcript?format=${format}&token=${localStorage.getItem('auth_token')}`, '_blank')
  }

  const updateStatus = useMutation({
    mutationFn: (status: string) => api.put(`/v1/admin/chat-inbox/${selectedId}/status`, { status }),
    onSuccess: () => { invalidateAll(); setShowMoreMenu(false); toast.success(t('chat_inbox.toasts.status_updated', 'Status updated')) },
  })

  const toggleAi = useMutation({
    mutationFn: (enabled: boolean) => api.put(`/v1/admin/chat-inbox/${selectedId}/ai-toggle`, { ai_enabled: enabled }),
    onSuccess: () => invalidateAll(),
  })

  const updateContact = useMutation({
    mutationFn: (data: any) => api.put(`/v1/admin/chat-inbox/${selectedId}/contact`, data),
    onSuccess: () => { invalidateAll(); setShowContactEdit(false); toast.success(t('chat_inbox.toasts.contact_updated', 'Contact updated')) },
  })

  const captureLead = useMutation({
    mutationFn: (data: any) => api.post(`/v1/admin/chat-inbox/${selectedId}/capture-lead`, data),
    onSuccess: () => { invalidateAll(); setShowLeadForm(false); toast.success(t('chat_inbox.toasts.lead_captured', 'Lead captured → Inquiries')) },
  })

  const submitFeedback = useMutation({
    mutationFn: ({ messageId, payload }: any) => api.post(`/v1/admin/chat-inbox/messages/${messageId}/feedback`, payload),
    onSuccess: () => { invalidateAll(); setFeedbackOpen(null); toast.success(t('chat_inbox.toasts.feedback_saved', 'Feedback saved')) },
  })

  const transferConv = useMutation({
    mutationFn: (agentId: number) => api.put(`/v1/admin/chat-inbox/${selectedId}/assign`, { agent_id: agentId }),
    onSuccess: () => { invalidateAll(); setShowTransferMenu(false); toast.success(t('chat_inbox.toasts.transferred', 'Transferred')) },
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (replyText.trim()) sendReply.mutate(replyText.trim())
    }
  }

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
    waiting: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
    resolved: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
    archived: 'bg-white/[0.04] text-gray-500 border border-white/[0.06]',
  }

  const senderStyles: Record<string, any> = {
    visitor: { icon: User, align: 'justify-start', bg: 'bg-white/[0.03] border border-white/[0.06]' },
    ai: { icon: Bot, align: 'justify-start', bg: 'bg-primary-500/[0.06] border border-primary-500/15' },
    agent: { icon: User, align: 'justify-end', bg: 'bg-blue-500/[0.08] border border-blue-500/15' },
    system: { icon: User, align: 'justify-center', bg: '' },
  }

  const convName = (c: any) => c.member?.user?.name || c.visitor_name || t('chat_inbox.visitor_fallback', 'Visitor')
  const convInitial = (c: any) => (convName(c)).charAt(0).toUpperCase()

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    // Height: top header is 64px always. On mobile we also need to clear the
    // 56px fixed bottom nav + safe-area inset; lg+ has no bottom nav so the
    // full viewport minus the header is available.
    <div className="flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-64px)]">
      {/* ═══ Compact Header ═══ */}
      <div className="flex items-center justify-between px-1 pb-3">
        <h1 className="text-lg font-bold text-white">{t('chat_inbox.title', 'Inbox')}</h1>
        {stats && (
          <div className="flex gap-3">
            {[
              { key: 'active', label: t('chat_inbox.stats.active', 'Active'), value: stats.active, color: 'text-emerald-400' },
              { key: 'waiting', label: t('chat_inbox.stats.waiting', 'Waiting'), value: stats.waiting, color: 'text-amber-400' },
              { key: 'unassigned', label: t('chat_inbox.stats.unassigned', 'Unassigned'), value: stats.unassigned, color: 'text-red-400' },
            ].filter(s => s.value > 0).map(s => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs">
                <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
                <span className="text-gray-500">{s.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0 gap-0 rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(14,18,16,0.6)' }}>

        {/* ═══ LEFT: Conversation List ═══
             Mobile (<md): full-width, hidden as soon as a conversation is opened.
             md+: fixed 320px side panel, always visible alongside the detail pane.
             This replaces the old layout where the w-80 list always took ~85%
             of a phone screen and pushed the chat detail off-screen. */}
        <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-80 md:flex-shrink-0 flex-col border-r border-white/[0.06]`}>
          {/* Search + Filters */}
          <div className="p-2.5 space-y-2 border-b border-white/[0.04]">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-8 pr-3 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-primary-500/30"
                placeholder={t('chat_inbox.search_placeholder', 'Search conversations...')} />
            </div>
            <div className="flex gap-0.5 bg-white/[0.02] rounded-lg p-0.5">
              {(['all', 'active', 'waiting', 'resolved', 'archived'] as ConvStatus[]).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`flex-1 py-1 rounded-md text-[11px] transition-all ${
                    statusFilter === s
                      ? 'bg-white/[0.08] text-white font-medium shadow-sm'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}>{t(`chat_inbox.status_filters.${s}`, s)}</button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center text-gray-600 py-12 text-xs">{t('chat_inbox.no_conversations', 'No conversations')}</div>
            ) : conversations.map((c: any) => {
              const active = selectedId === c.id
              return (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2.5 transition-all border-l-2 ${
                    active
                      ? 'bg-white/[0.04] border-l-primary-500'
                      : 'border-l-transparent hover:bg-white/[0.02]'
                  }`}>
                  <div className="flex items-start gap-2.5">
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      c.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' :
                      c.status === 'waiting' ? 'bg-amber-500/15 text-amber-400' :
                      'bg-white/[0.06] text-gray-500'
                    }`}>
                      {convInitial(c)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-white truncate">{convName(c)}</span>
                        <span className="text-[10px] text-gray-600 flex-shrink-0">
                          {c.last_message_at ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false }) : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {c.visitor_email && <span className="text-[11px] text-gray-500 truncate">{c.visitor_email}</span>}
                        {!c.visitor_email && c.channel && <span className="text-[11px] text-gray-500">{c.channel}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {c.unread_count > 0 && (
                          <span className="bg-primary-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{c.unread_count}</span>
                        )}
                        {c.ip_session_count > 1 && (
                          <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full">{c.ip_session_count}×</span>
                        )}
                        {c.assigned_agent && <span className="text-[10px] text-gray-600">@{c.assigned_agent.name}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Bottom toggle */}
          <div className="px-3 py-2 border-t border-white/[0.04]">
            <label className="flex items-center justify-between text-[11px] text-gray-500 cursor-pointer select-none">
              <span>{t('chat_inbox.group_by_visitor', 'Group by visitor')}</span>
              <button type="button" onClick={() => {
                const next = !groupByVisitor
                setGroupByVisitor(next)
                try { localStorage.setItem('chat-inbox-group-by-visitor', next ? '1' : '0') } catch {}
              }} className={`relative w-7 h-3.5 rounded-full transition-colors ${groupByVisitor ? 'bg-primary-600' : 'bg-white/[0.08]'}`}>
                <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${groupByVisitor ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
            </label>
          </div>
        </div>

        {/* ═══ RIGHT: Conversation Detail ═══ */}
        {selectedId && conv ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* ── Header ── */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-4">
              <div className="min-w-0 flex items-center gap-2">
                {/* Mobile-only back button — returns to the conversation list */}
                <button
                  onClick={() => setSelectedId(null)}
                  className="md:hidden p-1.5 -ml-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                  aria-label={t('chat_inbox.back_aria', 'Back to conversations')}
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    conv.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' :
                    conv.status === 'waiting' ? 'bg-amber-500/15 text-amber-400' :
                    conv.status === 'resolved' ? 'bg-blue-500/15 text-blue-400' :
                    'bg-white/[0.06] text-gray-500'
                  }`}>
                    {convInitial(conv)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{convName(conv)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[conv.status] || ''}`}>{t(`chat_inbox.status_filters.${conv.status}`, { defaultValue: String(conv.status ?? '') })}</span>
                      {conv.member?.tier && <span className="text-[10px] bg-primary-500/15 text-primary-400 px-1.5 py-0.5 rounded">{conv.member.tier.name}</span>}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {conv.visitor_email && <span>{conv.visitor_email}</span>}
                      {conv.visitor_phone && <><span className="text-gray-700">·</span><span>{conv.visitor_phone}</span></>}
                      {(conv.visitor_city || conv.visitor_country) && (
                        <><span className="text-gray-700">·</span><span className="flex items-center gap-0.5"><MapPin size={9} />{[conv.visitor_city, conv.visitor_country].filter(Boolean).join(', ')}</span></>
                      )}
                      {conv.assigned_agent && <><span className="text-gray-700">·</span><span>@{conv.assigned_agent.name}</span></>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* AI Toggle */}
                <button onClick={() => toggleAi.mutate(!(conv.ai_enabled ?? true))} disabled={toggleAi.isPending}
                  className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors ${
                    (conv.ai_enabled ?? true)
                      ? 'bg-primary-500/10 text-primary-400 hover:bg-primary-500/20'
                      : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  }`}
                  title={(conv.ai_enabled ?? true) ? t('chat_inbox.ai_pause_tooltip', 'Pause AI auto-replies') : t('chat_inbox.ai_resume_tooltip', 'Resume AI auto-replies')}>
                  {(conv.ai_enabled ?? true) ? <><PauseCircle size={12} /> {t('chat_inbox.ai_on', 'AI On')}</> : <><PlayCircle size={12} /> {t('chat_inbox.ai_off', 'AI Off')}</>}
                </button>

                {/* Resolve */}
                {conv.status !== 'resolved' && conv.status !== 'archived' && (
                  <button onClick={() => updateStatus.mutate('resolved')}
                    className="flex items-center gap-1 text-[11px] bg-blue-500/10 text-blue-400 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/20">
                    <CheckCircle size={12} /> {t('chat_inbox.resolve', 'Resolve')}
                  </button>
                )}

                {/* More Menu */}
                <div className="relative">
                  <button onClick={() => setShowMoreMenu(v => !v)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors">
                    <MoreHorizontal size={16} />
                  </button>
                  {showMoreMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-[#1a1e1c] border border-white/[0.08] rounded-xl shadow-2xl min-w-[200px] py-1 overflow-hidden">
                        <button onClick={() => { setShowContactEdit(v => !v); setShowMoreMenu(false) }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.04] hover:text-white">
                          <Edit3 size={13} /> {t('chat_inbox.more.edit_contact', 'Edit contact info')}
                        </button>
                        {!conv.lead_captured && (
                          <button onClick={() => {
                            setLeadForm({ name: conv.visitor_name || '', email: conv.visitor_email || '', phone: conv.visitor_phone || '', notes: '' })
                            setShowLeadForm(true); setShowMoreMenu(false)
                          }} className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.04] hover:text-white">
                            <UserPlus size={13} /> {t('chat_inbox.more.capture_lead', 'Capture as lead')}
                          </button>
                        )}
                        <button onClick={() => { setShowTransferMenu(true); setShowMoreMenu(false) }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.04] hover:text-white">
                          <ArrowRightLeft size={13} /> {t('chat_inbox.more.transfer', 'Transfer to agent')}
                        </button>
                        <button onClick={() => { downloadTranscript('text'); setShowMoreMenu(false) }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.04] hover:text-white">
                          <Download size={13} /> {t('chat_inbox.more.download_transcript', 'Download transcript')}
                        </button>
                        <div className="border-t border-white/[0.06] my-1" />
                        {conv.status !== 'archived' && (
                          <button onClick={() => updateStatus.mutate('archived')}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-gray-500 hover:bg-white/[0.04] hover:text-gray-300">
                            <Archive size={13} /> {t('chat_inbox.more.archive', 'Archive')}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Transfer Agent Selector ── */}
            {showTransferMenu && (
              <div className="px-4 py-2.5 border-b border-white/[0.06] bg-purple-500/[0.03]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-purple-300">{t('chat_inbox.transfer.header', 'Transfer to:')}</span>
                  <button onClick={() => setShowTransferMenu(false)} className="text-gray-500 hover:text-white"><X size={13} /></button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(agentList || []).length === 0 && <span className="text-[11px] text-gray-500">{t('chat_inbox.transfer.no_agents', 'No agents available')}</span>}
                  {(agentList || []).map((a: any) => (
                    <button key={a.id} onClick={() => transferConv.mutate(a.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors ${
                        conv.assigned_to === a.id
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.06] hover:text-white border border-white/[0.06]'
                      }`}>
                      <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[9px] font-bold text-purple-400">
                        {a.name?.charAt(0) || '?'}
                      </div>
                      {a.name}
                      {conv.assigned_to === a.id && <span className="text-[9px] text-purple-500">{t('chat_inbox.transfer.current', '(current)')}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Lead Capture ── */}
            {showLeadForm && (
              <div className="px-4 py-3 border-b border-white/[0.06] bg-emerald-500/[0.03]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-emerald-300">{t('chat_inbox.lead.header', 'Capture as inquiry')}</span>
                  <button onClick={() => setShowLeadForm(false)} className="text-gray-500 hover:text-white"><X size={13} /></button>
                </div>
                <div className="flex gap-2 items-end">
                  <input type="text" value={leadForm.name} onChange={e => setLeadForm(p => ({ ...p, name: e.target.value }))}
                    className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/30" placeholder={t('chat_inbox.lead.name', 'Name')} />
                  <input type="email" value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))}
                    className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/30" placeholder={t('chat_inbox.lead.email', 'Email')} />
                  <input type="text" value={leadForm.phone} onChange={e => setLeadForm(p => ({ ...p, phone: e.target.value }))}
                    className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/30" placeholder={t('chat_inbox.lead.phone', 'Phone')} />
                  <button onClick={() => captureLead.mutate(leadForm)} disabled={captureLead.isPending}
                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex-shrink-0">
                    {captureLead.isPending ? t('chat_inbox.lead.saving', '...') : t('chat_inbox.lead.create', 'Create')}
                  </button>
                </div>
              </div>
            )}

            {/* ── Contact Edit ── */}
            {showContactEdit && (
              <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.01]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-300">{t('chat_inbox.contact.header', 'Contact details')}</span>
                  <button onClick={() => setShowContactEdit(false)} className="text-gray-500 hover:text-white"><X size={13} /></button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <input type="text" value={contactForm.visitor_name || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_name: e.target.value }))}
                    className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-primary-500/30" placeholder={t('chat_inbox.contact.name', 'Name')} />
                  <input type="email" value={contactForm.visitor_email || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_email: e.target.value }))}
                    className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-primary-500/30" placeholder={t('chat_inbox.contact.email', 'Email')} />
                  <input type="text" value={contactForm.visitor_phone || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_phone: e.target.value }))}
                    className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-primary-500/30" placeholder={t('chat_inbox.contact.phone', 'Phone')} />
                  <input type="text" value={contactForm.visitor_country || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_country: e.target.value }))}
                    className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-primary-500/30" placeholder={t('chat_inbox.contact.country', 'Country')} />
                  <input type="text" value={contactForm.visitor_city || ''} onChange={e => setContactForm((p: any) => ({ ...p, visitor_city: e.target.value }))}
                    className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-primary-500/30" placeholder={t('chat_inbox.contact.city', 'City')} />
                </div>
                <div className="flex gap-2 mt-2">
                  <input type="text" value={contactForm.agent_notes || ''} onChange={e => setContactForm((p: any) => ({ ...p, agent_notes: e.target.value }))}
                    className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-primary-500/30" placeholder={t('chat_inbox.contact.notes', 'Internal notes...')} />
                  <button onClick={() => updateContact.mutate(contactForm)} disabled={updateContact.isPending}
                    className="flex items-center gap-1 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50 flex-shrink-0">
                    <Save size={11} /> {t('chat_inbox.contact.save', 'Save')}
                  </button>
                </div>
              </div>
            )}

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
              {messages.map((msg: any) => {
                const style = senderStyles[msg.sender_type] || senderStyles.system

                if (msg.sender_type === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center py-1">
                      <span className="text-[10px] text-gray-600 bg-white/[0.02] px-3 py-0.5 rounded-full">{msg.content}</span>
                    </div>
                  )
                }

                const isAgent = msg.sender_type === 'agent'

                return (
                  <div key={msg.id} className={`flex ${style.align} gap-2 group`}>
                    {!isAgent && (
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                        msg.sender_type === 'ai' ? 'bg-primary-500/15' : 'bg-white/[0.06]'
                      }`}>
                        {msg.sender_type === 'ai' ? <Bot size={11} className="text-primary-400" /> : <User size={11} className="text-gray-500" />}
                      </div>
                    )}
                    <div className={`${style.bg} rounded-2xl px-3.5 py-2 max-w-[70%]`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-gray-500 capitalize">
                          {isAgent ? (msg.sender_user?.name || t('chat_inbox.messages.agent_self', 'You')) : msg.sender_type}
                        </span>
                        <span className="text-[10px] text-gray-700">
                          {msg.created_at ? formatDistanceToNow(new Date(msg.created_at), { addSuffix: true }) : ''}
                        </span>
                      </div>
                      <p className="text-[13px] text-white/90 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      {msg.attachment_url && (
                        <div className="mt-2">
                          {msg.attachment_type === 'image' ? (
                            <a href={API_URL + msg.attachment_url} target="_blank" rel="noopener noreferrer">
                              <img src={API_URL + msg.attachment_url} alt={msg.content || 'attachment'}
                                className="max-w-[200px] max-h-[200px] rounded-lg border border-white/[0.06]" />
                            </a>
                          ) : (
                            <a href={API_URL + msg.attachment_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 bg-white/[0.03] px-3 py-1.5 rounded-lg border border-white/[0.06] text-xs text-primary-400 hover:text-primary-300">
                              <FileText size={13} /> {msg.content || t('chat_inbox.messages.download_file', 'Download file')}
                            </a>
                          )}
                        </div>
                      )}
                      {/* AI Feedback */}
                      {msg.sender_type === 'ai' && (
                        <div className="mt-2 pt-1.5 border-t border-white/[0.04]">
                          {msg.feedback ? (
                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                              {msg.feedback.rating === 'good' ? <ThumbsUp size={9} className="text-emerald-400" /> : <ThumbsDown size={9} className="text-red-400" />}
                              <span>{t('chat_inbox.messages.feedback_reviewed', 'Reviewed')}</span>
                              {msg.feedback.applied_to_training && <span className="flex items-center gap-0.5 text-amber-400"><GraduationCap size={9} /> {t('chat_inbox.messages.feedback_trained', 'trained')}</span>}
                              <button onClick={() => { setFeedbackOpen(msg.id); setFeedbackForm({ rating: msg.feedback.rating, comment: msg.feedback.comment || '', corrected_answer: '', apply_to_training: false }) }}
                                className="ml-auto text-gray-600 hover:text-gray-400">{t('chat_inbox.messages.feedback_edit', 'Edit')}</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setFeedbackOpen(msg.id); setFeedbackForm({ rating: 'good', comment: '', corrected_answer: '', apply_to_training: false }) }}
                                className="text-[10px] text-gray-600 hover:text-emerald-400 flex items-center gap-0.5"><ThumbsUp size={9} /> {t('chat_inbox.messages.feedback_good', 'Good')}</button>
                              <button onClick={() => { setFeedbackOpen(msg.id); setFeedbackForm({ rating: 'bad', comment: '', corrected_answer: '', apply_to_training: true }) }}
                                className="text-[10px] text-gray-600 hover:text-red-400 flex items-center gap-0.5"><ThumbsDown size={9} /> {t('chat_inbox.messages.feedback_bad', 'Bad')}</button>
                            </div>
                          )}
                          {feedbackOpen === msg.id && (
                            <div className="mt-2 space-y-2 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.06]">
                              <div className="flex gap-1.5">
                                <button onClick={() => setFeedbackForm(p => ({ ...p, rating: 'good' }))}
                                  className={`flex-1 text-[10px] py-1 rounded-lg flex items-center justify-center gap-1 ${feedbackForm.rating === 'good' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.04] text-gray-500'}`}>
                                  <ThumbsUp size={9} /> {t('chat_inbox.messages.feedback_good', 'Good')}
                                </button>
                                <button onClick={() => setFeedbackForm(p => ({ ...p, rating: 'bad' }))}
                                  className={`flex-1 text-[10px] py-1 rounded-lg flex items-center justify-center gap-1 ${feedbackForm.rating === 'bad' ? 'bg-red-500/15 text-red-300' : 'bg-white/[0.04] text-gray-500'}`}>
                                  <ThumbsDown size={9} /> {t('chat_inbox.messages.feedback_bad', 'Bad')}
                                </button>
                              </div>
                              <textarea value={feedbackForm.comment} onChange={e => setFeedbackForm(p => ({ ...p, comment: e.target.value }))}
                                rows={2} className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none" placeholder={t('chat_inbox.messages.feedback_comment', 'Comment (optional)')} />
                              {feedbackForm.rating === 'bad' && (
                                <>
                                  <textarea value={feedbackForm.corrected_answer} onChange={e => setFeedbackForm(p => ({ ...p, corrected_answer: e.target.value }))}
                                    rows={3} className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder:text-gray-600 focus:outline-none" placeholder={t('chat_inbox.messages.feedback_correction', 'What should the AI have said?')} />
                                  <label className="flex items-center gap-2 text-[10px] text-gray-500">
                                    <input type="checkbox" checked={feedbackForm.apply_to_training} onChange={e => setFeedbackForm(p => ({ ...p, apply_to_training: e.target.checked }))} className="rounded" />
                                    <GraduationCap size={9} /> {t('chat_inbox.messages.feedback_save_kb', 'Save to AI knowledge base')}
                                  </label>
                                </>
                              )}
                              <div className="flex gap-2">
                                <button onClick={() => submitFeedback.mutate({ messageId: msg.id, payload: feedbackForm })} disabled={submitFeedback.isPending}
                                  className="flex-1 bg-primary-600 text-white text-[10px] py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium">
                                  {submitFeedback.isPending ? t('chat_inbox.messages.feedback_submitting', 'Saving...') : t('chat_inbox.messages.feedback_submit', 'Submit')}
                                </button>
                                <button onClick={() => setFeedbackOpen(null)} className="px-3 text-[10px] text-gray-500 hover:text-white">{t('chat_inbox.messages.feedback_cancel', 'Cancel')}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {isAgent && (
                      <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-1">
                        <User size={11} className="text-blue-400" />
                      </div>
                    )}
                  </div>
                )
              })}
              {detail?.visitor_typing && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-2 flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '240ms' }} />
                    <span className="text-[10px] text-gray-600 ml-1">{t('chat_inbox.messages.typing', 'typing…')}</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Reply Input ── */}
            {conv.status !== 'archived' && (
              <div className="px-4 py-3 border-t border-white/[0.06] relative">
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-4 mb-2 bg-[#1a1e1c] border border-white/[0.08] rounded-xl p-2 shadow-2xl grid grid-cols-10 gap-0.5 z-10">
                    {EMOJIS.map(e => (
                      <button key={e} type="button" onClick={() => { setReplyText(p => p + e); setShowEmojiPicker(false) }}
                        className="text-base hover:bg-white/[0.06] rounded-lg p-1 transition-colors">{e}</button>
                    ))}
                  </div>
                )}
                {showCannedMenu && (
                  <div className="absolute bottom-full left-16 mb-2 z-20 bg-[#1a1e1c] border border-white/[0.08] rounded-xl shadow-2xl min-w-[260px] max-h-72 overflow-y-auto">
                    {cannedResponses.length === 0 && (
                      <div className="p-3 text-xs text-gray-500">{t('chat_inbox.reply.no_canned', 'No canned responses yet')}</div>
                    )}
                    {cannedResponses.map((c: any, i: number) => (
                      <button key={i} onClick={() => { setReplyText(p => p ? p + ' ' + c.text : c.text); setShowCannedMenu(false) }}
                        className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.04] hover:text-white border-b border-white/[0.04] last:border-b-0">
                        <div className="font-medium">{c.label}</div>
                        <div className="text-[10px] text-gray-600 truncate mt-0.5">{c.text}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5 items-end">
                  <div className="flex gap-0.5">
                    <button type="button" onClick={() => { setShowEmojiPicker(v => !v); setShowCannedMenu(false) }}
                      className="text-gray-600 hover:text-white rounded-lg p-2 hover:bg-white/[0.04] transition-colors" title={t('chat_inbox.reply.emoji_title', 'Emoji')}>
                      <Smile size={16} />
                    </button>
                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.txt"
                      onChange={e => { const file = e.target.files?.[0]; if (file) uploadAttachment.mutate(file) }} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadAttachment.isPending}
                      className="text-gray-600 hover:text-white rounded-lg p-2 hover:bg-white/[0.04] transition-colors disabled:opacity-50" title={t('chat_inbox.reply.attach_title', 'Attach file')}>
                      <Paperclip size={16} />
                    </button>
                    <button type="button" onClick={() => { setShowCannedMenu(v => !v); setShowEmojiPicker(false) }}
                      className="text-gray-600 hover:text-white rounded-lg p-2 hover:bg-white/[0.04] transition-colors" title={t('chat_inbox.reply.canned_title', 'Canned responses')}>
                      <Zap size={16} />
                    </button>
                  </div>
                  <textarea value={replyText} onChange={e => { setReplyText(e.target.value); pingAgentTyping() }}
                    onKeyDown={handleKeyDown} rows={1}
                    className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white resize-none placeholder:text-gray-600 focus:outline-none focus:border-primary-500/30"
                    placeholder={micState === 'recording' ? t('chat_inbox.reply.listening', 'Listening… tap stop when done') : micState === 'transcribing' ? t('chat_inbox.reply.transcribing', 'Transcribing…') : t('chat_inbox.reply.placeholder', 'Type a reply... (Enter to send)')} />
                  {hasMediaRecorder && (
                    <button type="button" onClick={toggleDictation} disabled={micState === 'transcribing'}
                      title={micState === 'recording' ? t('chat_inbox.reply.mic_stop', 'Stop recording') : t('chat_inbox.reply.mic_dictate', 'Dictate reply')}
                      className={
                        'p-2 rounded-xl transition-colors disabled:opacity-50 ' +
                        (micState === 'recording'
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse'
                          : micState === 'transcribing'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.06]')
                      }>
                      {micState === 'recording' ? <Square size={16} /> : micState === 'transcribing' ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
                    </button>
                  )}
                  <button onClick={() => { if (replyText.trim()) sendReply.mutate(replyText.trim()) }}
                    disabled={!replyText.trim() || sendReply.isPending}
                    className="bg-primary-600 text-white p-2 rounded-xl hover:bg-primary-700 disabled:opacity-30 transition-colors">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare size={40} className="mx-auto mb-3 text-gray-800" />
              <p className="text-sm text-gray-600">{t('chat_inbox.empty_select', 'Select a conversation')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
