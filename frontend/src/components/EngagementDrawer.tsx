import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, User, MessageSquare, Map, FileText, Send, Bot, CheckCircle2, UserPlus,
  Mail, Phone, MapPin, Clock, Eye, Globe, Briefcase, ExternalLink, Star,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { useBrandStore } from '../stores/brandStore'

/**
 * Slide-in detail drawer for an engagement row. Replaces the row-click
 * navigation hop to /chat-inbox with an in-page drawer that holds Profile,
 * Conversation, Journey, and Notes tabs plus a quick-action bar at the
 * bottom (decision #1 in ENGAGEMENT_HUB_PLAN.md, Phase 2).
 *
 * The drawer reuses existing detail endpoints — no new backend code:
 *   GET /v1/admin/visitors/{id}     — visitor + page views + conversations
 *   GET /v1/admin/chat-inbox/{id}   — conversation + messages
 *
 * It does NOT replace ChatInbox.tsx — that page still exists at
 * /chat-inbox for users who bookmarked it. The drawer is the new in-page
 * preferred experience inside /engagement.
 */

type TabKey = 'profile' | 'conversation' | 'journey' | 'notes'

interface VisitorDetail {
  visitor: {
    id: number
    visitor_key: string
    display_name: string | null
    email: string | null
    phone: string | null
    visitor_ip: string | null
    user_agent: string | null
    country: string | null
    city: string | null
    referrer: string | null
    current_page: string | null
    current_page_title: string | null
    first_seen_at: string | null
    last_seen_at: string | null
    visit_count: number
    page_views_count: number
    messages_count: number
    is_lead: boolean
    is_online?: boolean
    guest_id: number | null
    brand_id: number | null
    guest?: { id: number; full_name: string; email: string | null; phone: string | null } | null
  }
  page_views: Array<{ id: number; url: string; title: string | null; viewed_at: string }>
  conversations: Array<{ id: number; status: string; visitor_name: string | null; messages_count: number; lead_captured: boolean; last_message_at: string | null }>
}

interface ConversationDetail {
  id: number
  status: string
  ai_enabled: boolean
  assigned_to: number | null
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  agent_notes: string | null
  messages: Array<{
    id: number
    sender_type: 'visitor' | 'agent' | 'ai' | 'system'
    content: string
    created_at: string
    sender_user?: { id: number; name: string } | null
  }>
}

interface Props {
  visitorId: number | null
  conversationId: number | null
  onClose: () => void
}

export function EngagementDrawer({ visitorId, conversationId, onClose }: Props) {
  const qc = useQueryClient()
  const { brands } = useBrandStore()
  const open = visitorId !== null
  const [tab, setTab] = useState<TabKey>(conversationId ? 'conversation' : 'profile')
  const [reply, setReply] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const messagesScrollRef = useRef<HTMLDivElement>(null)

  // Reset to a sensible default tab whenever the drawer opens for a new row.
  useEffect(() => {
    if (open) setTab(conversationId ? 'conversation' : 'profile')
  }, [open, visitorId, conversationId])

  // Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Visitor detail
  const { data: visitorDetail } = useQuery<VisitorDetail>({
    queryKey: ['engagement-drawer', 'visitor', visitorId],
    queryFn: () => api.get(`/v1/admin/visitors/${visitorId}`).then(r => r.data),
    enabled: open && visitorId !== null,
    refetchInterval: open ? 8_000 : false,
  })

  // Conversation detail (only when there is one)
  const { data: convDetail, refetch: refetchConv } = useQuery<{ conversation: ConversationDetail }>({
    queryKey: ['engagement-drawer', 'conversation', conversationId],
    queryFn: () => api.get(`/v1/admin/chat-inbox/${conversationId}`).then(r => ({ conversation: r.data.conversation ?? r.data })),
    enabled: open && conversationId !== null,
    refetchInterval: open ? 5_000 : false,
  })

  // Sync notes draft once the conversation loads.
  useEffect(() => {
    if (convDetail?.conversation) setNotesDraft(convDetail.conversation.agent_notes ?? '')
  }, [convDetail?.conversation?.id])

  // Auto-scroll the conversation pane to the bottom when new messages arrive.
  useEffect(() => {
    if (tab === 'conversation' && messagesScrollRef.current) {
      messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight
    }
  }, [convDetail?.conversation?.messages?.length, tab])

  /* ── Mutations ────────────────────────────────────────────────────── */

  const sendReply = useMutation({
    mutationFn: () => api.post(`/v1/admin/chat-inbox/${conversationId}/messages`, {
      content: reply.trim(),
      sender_type: 'agent',
    }),
    onSuccess: () => {
      setReply('')
      refetchConv()
      qc.invalidateQueries({ queryKey: ['engagement', 'feed'] })
      qc.invalidateQueries({ queryKey: ['engagement', 'kpis'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to send'),
  })

  const takeOverAi = useMutation({
    mutationFn: () => api.put(`/v1/admin/chat-inbox/${conversationId}/ai-toggle`, { ai_enabled: false }),
    onSuccess: () => {
      toast.success('AI handed over — you are now the assignee')
      refetchConv()
      qc.invalidateQueries({ queryKey: ['engagement', 'feed'] })
    },
    onError: () => toast.error('Failed to disable AI'),
  })

  const reEnableAi = useMutation({
    mutationFn: () => api.put(`/v1/admin/chat-inbox/${conversationId}/ai-toggle`, { ai_enabled: true }),
    onSuccess: () => {
      toast.success('AI re-enabled')
      refetchConv()
      qc.invalidateQueries({ queryKey: ['engagement', 'feed'] })
    },
  })

  const resolveConv = useMutation({
    mutationFn: () => api.put(`/v1/admin/chat-inbox/${conversationId}/status`, { status: 'resolved' }),
    onSuccess: () => {
      toast.success('Conversation resolved')
      refetchConv()
      qc.invalidateQueries({ queryKey: ['engagement', 'feed'] })
      qc.invalidateQueries({ queryKey: ['engagement', 'kpis'] })
    },
    onError: () => toast.error('Failed to resolve'),
  })

  const reopenConv = useMutation({
    mutationFn: () => api.put(`/v1/admin/chat-inbox/${conversationId}/status`, { status: 'active' }),
    onSuccess: () => {
      toast.success('Conversation reopened')
      refetchConv()
      qc.invalidateQueries({ queryKey: ['engagement', 'feed'] })
    },
  })

  const captureLead = useMutation({
    mutationFn: () => api.post(`/v1/admin/chat-inbox/${conversationId}/capture-lead`, {}),
    onSuccess: () => {
      toast.success('Added to CRM as a guest')
      refetchConv()
      qc.invalidateQueries({ queryKey: ['engagement', 'feed'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to capture'),
  })

  const saveNotes = useMutation({
    mutationFn: (notes: string) => api.put(`/v1/admin/chat-inbox/${conversationId}/contact`, { agent_notes: notes }),
    onSuccess: () => toast.success('Notes saved'),
    onError: () => toast.error('Failed to save notes'),
  })

  const startChatForVisitor = useMutation({
    mutationFn: () => api.post(`/v1/admin/visitors/${visitorId}/start-chat`),
    onSuccess: (resp: any) => {
      const newConvId = resp.data?.conversation_id
      if (newConvId) {
        // Close + re-open with the new conversation focused.
        toast.success('Chat started — pick up where they are')
        qc.invalidateQueries({ queryKey: ['engagement', 'feed'] })
        // Re-open into conversation tab by navigating the parent state via a custom event.
        window.dispatchEvent(new CustomEvent('engagement:open', { detail: { visitorId, conversationId: newConvId } }))
      }
    },
    onError: () => toast.error('Failed to start chat'),
  })

  const v = visitorDetail?.visitor
  const conv = convDetail?.conversation

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[600px] lg:w-[700px] bg-dark-bg border-l border-dark-border z-50 shadow-2xl flex flex-col transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ transitionDuration: '220ms' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-dark-border">
          <div className="flex items-start gap-3 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-base font-bold text-accent">
                {(v?.display_name || v?.email || v?.visitor_ip || 'V').charAt(0).toUpperCase()}
              </div>
              {v?.is_online && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-dark-bg animate-pulse" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate flex items-center gap-2 flex-wrap">
                {v?.display_name || v?.email || v?.phone || `Visitor ${v?.visitor_ip ?? ''}`}
                {v?.is_lead && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-300/15 text-amber-300 border border-amber-300/30">
                    <Star size={10} /> LEAD
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-t-secondary flex-wrap">
                {v?.is_online ? (
                  <span className="flex items-center gap-1 text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Online now
                  </span>
                ) : v?.last_seen_at ? (
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> Last seen {relativeTime(v.last_seen_at)}
                  </span>
                ) : null}
                {v?.country && <span>{countryFlag(v.country)} {v.city ?? v.country}</span>}
                {brands.length > 1 && v?.brand_id && (
                  <span className="flex items-center gap-1">
                    <Briefcase size={11} />
                    {brands.find(b => b.id === v.brand_id)?.name ?? '—'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-dark-surface2 text-t-secondary hover:text-white transition-colors flex-shrink-0"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-dark-border bg-dark-surface" style={{ flexShrink: 0 }}>
          <TabBtn active={tab === 'profile'}      onClick={() => setTab('profile')}      icon={User}          label="Profile" />
          <TabBtn active={tab === 'conversation'} onClick={() => setTab('conversation')} icon={MessageSquare} label="Conversation" disabled={!conv} />
          <TabBtn active={tab === 'journey'}      onClick={() => setTab('journey')}      icon={Map}           label="Journey" />
          <TabBtn active={tab === 'notes'}        onClick={() => setTab('notes')}        icon={FileText}      label="Notes" disabled={!conv} />
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === 'profile'      && <ProfileTab visitor={v} />}
          {tab === 'conversation' && (
            <ConversationTab
              conv={conv}
              messagesScrollRef={messagesScrollRef}
              reply={reply}
              setReply={setReply}
              onSend={() => reply.trim() && sendReply.mutate()}
              sending={sendReply.isPending}
            />
          )}
          {tab === 'journey'      && <JourneyTab pageViews={visitorDetail?.page_views ?? []} />}
          {tab === 'notes'        && (
            <NotesTab
              notes={notesDraft}
              onChange={setNotesDraft}
              saving={saveNotes.isPending}
              onSave={() => saveNotes.mutate(notesDraft)}
            />
          )}
        </div>

        {/* Quick action bar */}
        <div className="border-t border-dark-border p-3 flex flex-wrap gap-2 bg-dark-surface" style={{ flexShrink: 0 }}>
          {conv ? (
            <>
              {conv.ai_enabled ? (
                <ActionBtn icon={UserPlus} label="Take over from AI" onClick={() => takeOverAi.mutate()} disabled={takeOverAi.isPending} tone="primary" />
              ) : (
                <ActionBtn icon={Bot} label="Re-enable AI" onClick={() => reEnableAi.mutate()} disabled={reEnableAi.isPending} />
              )}
              {conv.status === 'resolved' ? (
                <ActionBtn icon={MessageSquare} label="Reopen" onClick={() => reopenConv.mutate()} disabled={reopenConv.isPending} />
              ) : (
                <ActionBtn icon={CheckCircle2} label="Resolve" onClick={() => resolveConv.mutate()} disabled={resolveConv.isPending} tone="success" />
              )}
              {!v?.guest_id && (v?.email || v?.phone) && (
                <ActionBtn icon={UserPlus} label="Add to CRM" onClick={() => captureLead.mutate()} disabled={captureLead.isPending} />
              )}
              <a
                href={`/chat-inbox?id=${conv.id}`}
                target="_blank"
                rel="noopener"
                className="ml-auto flex items-center gap-1 text-xs text-t-secondary hover:text-white transition-colors px-2"
              >
                Open full inbox <ExternalLink size={11} />
              </a>
            </>
          ) : v ? (
            <ActionBtn icon={MessageSquare} label="Start chat" onClick={() => startChatForVisitor.mutate()} disabled={startChatForVisitor.isPending} tone="primary" />
          ) : null}
        </div>
      </div>
    </>
  )
}

/* ── Tab components ───────────────────────────────────────────────── */

function ProfileTab({ visitor: v }: { visitor: VisitorDetail['visitor'] | undefined }) {
  if (!v) return <Loading />
  return (
    <div className="overflow-y-auto p-4 space-y-3">
      <Field label="Email" icon={Mail} value={v.email ?? '—'} />
      <Field label="Phone" icon={Phone} value={v.phone ?? '—'} />
      <Field label="Country / City" icon={MapPin} value={[v.city, v.country].filter(Boolean).join(', ') || '—'} />
      <Field label="IP" value={v.visitor_ip ?? '—'} mono />
      <Field label="First seen" icon={Clock} value={v.first_seen_at ? new Date(v.first_seen_at).toLocaleString() : '—'} />
      <Field label="Last seen"  icon={Clock} value={v.last_seen_at ? new Date(v.last_seen_at).toLocaleString() : '—'} />
      <Field label="Visits"     icon={Eye}   value={String(v.visit_count)} />
      <Field label="Page views" icon={Eye}   value={String(v.page_views_count)} />
      <Field label="Messages"   icon={MessageSquare} value={String(v.messages_count)} />
      <Field label="Source"     icon={Globe} value={v.referrer ?? 'Direct'} mono />

      {v.guest && (
        <div className="mt-4 p-3 bg-dark-surface border border-dark-border rounded-xl">
          <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5">
            Linked CRM guest
          </p>
          <p className="text-sm font-semibold">{v.guest.full_name}</p>
          <p className="text-xs text-t-secondary mt-0.5">{v.guest.email ?? v.guest.phone ?? '—'}</p>
          <a
            href={`/guest/${v.guest.id}`}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-2"
          >
            Open CRM card <ExternalLink size={11} />
          </a>
        </div>
      )}
    </div>
  )
}

function ConversationTab({
  conv, messagesScrollRef, reply, setReply, onSend, sending,
}: {
  conv: ConversationDetail | undefined
  messagesScrollRef: React.RefObject<HTMLDivElement | null>
  reply: string
  setReply: (s: string) => void
  onSend: () => void
  sending: boolean
}) {
  if (!conv) return <Loading />

  return (
    <>
      {/* Messages */}
      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {conv.messages.length === 0 ? (
          <div className="text-center text-t-secondary text-sm py-8">No messages yet.</div>
        ) : conv.messages.map(m => <MessageBubble key={m.id} message={m} />)}
      </div>

      {/* Composer — only enabled when AI is OFF (otherwise the agent should
          take over first to avoid duplicate replies). */}
      <div className="border-t border-dark-border p-3 bg-dark-surface" style={{ flexShrink: 0 }}>
        {conv.ai_enabled ? (
          <p className="text-[11px] text-t-secondary text-center py-2">
            <Bot size={11} className="inline mr-1" />
            AI is handling this conversation. Take it over below to reply manually.
          </p>
        ) : (
          <div className="flex gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSend()
              }}
              placeholder="Type your reply… (⌘/Ctrl+Enter to send)"
              rows={2}
              className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent transition-colors resize-none"
            />
            <button
              onClick={onSend}
              disabled={!reply.trim() || sending}
              className="bg-accent text-black font-bold rounded-lg px-3 disabled:opacity-50 hover:bg-accent/90 transition-colors flex-shrink-0"
            >
              <Send size={15} />
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function MessageBubble({ message: m }: { message: ConversationDetail['messages'][number] }) {
  const fromVisitor = m.sender_type === 'visitor'
  const fromAi = m.sender_type === 'ai'
  const fromAgent = m.sender_type === 'agent'

  const align = fromVisitor ? 'justify-start' : 'justify-end'
  const bubble = fromVisitor
    ? 'bg-dark-surface border border-dark-border text-white'
    : fromAi
    ? 'bg-purple-500/15 border border-purple-500/30 text-white'
    : fromAgent
    ? 'bg-accent/15 border border-accent/40 text-white'
    : 'bg-dark-surface2 text-t-secondary text-xs italic'

  const senderLabel = fromVisitor
    ? 'Visitor'
    : fromAi
    ? 'AI'
    : fromAgent
    ? (m.sender_user?.name ?? 'Agent')
    : 'System'

  return (
    <div className={`flex ${align}`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 ${bubble}`}>
        <div className="text-[9px] uppercase tracking-wide font-bold opacity-60 mb-0.5 flex items-center gap-1">
          {fromAi && <Bot size={9} />}
          {senderLabel} · {relativeTime(m.created_at)}
        </div>
        <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
      </div>
    </div>
  )
}

function JourneyTab({ pageViews }: { pageViews: VisitorDetail['page_views'] }) {
  if (pageViews.length === 0) {
    return (
      <div className="overflow-y-auto p-4">
        <div className="text-center text-t-secondary text-sm py-8">
          No page-view history yet.
        </div>
      </div>
    )
  }
  return (
    <div className="overflow-y-auto p-4 space-y-1">
      {pageViews.map((pv, i) => (
        <div key={pv.id} className="flex gap-3 items-start py-2 border-b border-dark-border/40 last:border-b-0">
          <div className="w-6 h-6 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center text-[10px] font-bold text-t-secondary flex-shrink-0">
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{pv.title || pv.url}</div>
            <div className="text-[10px] text-t-secondary truncate font-mono">{pv.url}</div>
          </div>
          <div className="text-[10px] text-t-secondary whitespace-nowrap flex-shrink-0">
            {relativeTime(pv.viewed_at)}
          </div>
        </div>
      ))}
    </div>
  )
}

function NotesTab({
  notes, onChange, saving, onSave,
}: {
  notes: string; onChange: (s: string) => void; saving: boolean; onSave: () => void
}) {
  return (
    <div className="overflow-y-auto p-4 flex flex-col gap-3">
      <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">
        Private agent notes (visible to staff only)
      </p>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. asked about late check-in, follow up Tuesday…"
        rows={10}
        className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent transition-colors resize-none"
      />
      <button
        onClick={onSave}
        disabled={saving}
        className="self-end bg-accent text-black font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50 hover:bg-accent/90 transition-colors"
      >
        {saving ? 'Saving…' : 'Save notes'}
      </button>
    </div>
  )
}

/* ── Small helpers ────────────────────────────────────────────────── */

function TabBtn({
  active, onClick, icon: Icon, label, disabled,
}: { active: boolean; onClick: () => void; icon: any; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-colors ${
        active
          ? 'text-accent border-b-2 border-accent'
          : disabled
          ? 'text-t-secondary/40 cursor-not-allowed'
          : 'text-t-secondary hover:text-white'
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

function ActionBtn({
  icon: Icon, label, onClick, disabled, tone,
}: { icon: any; label: string; onClick: () => void; disabled?: boolean; tone?: 'primary' | 'success' }) {
  const cls = tone === 'primary'
    ? 'bg-accent text-black hover:bg-accent/90'
    : tone === 'success'
    ? 'bg-green-500/15 text-green-400 border border-green-500/40 hover:bg-green-500/25'
    : 'bg-dark-bg text-white border border-dark-border hover:bg-dark-surface2'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${cls}`}
    >
      <Icon size={12} />
      {label}
    </button>
  )
}

function Field({ label, icon: Icon, value, mono }: {
  label: string; icon?: any; value: string; mono?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon size={13} className="text-t-secondary mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">{label}</p>
        <p className={`text-sm mt-0.5 break-words ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  )
}

function Loading() {
  return <div className="overflow-y-auto p-8 text-center text-t-secondary text-sm">Loading…</div>
}

/* ── time + flag ─────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function countryFlag(code: string): string {
  const c = code.trim().toUpperCase()
  if (c.length !== 2) return ''
  const [a, b] = [c.charCodeAt(0), c.charCodeAt(1)]
  return String.fromCodePoint(0x1f1e6 + (a - 65), 0x1f1e6 + (b - 65))
}
