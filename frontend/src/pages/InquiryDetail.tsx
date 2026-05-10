import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, MessageSquare, Phone, Mail, Calendar as CalendarIcon, FileText,
  Sparkles, Clock, User, Building2, ChevronDown, Send, CheckCircle2, Plus,
  Tag, MapPin, AlertCircle, RefreshCw, Trophy, X, ArrowRight, Snowflake,
  Flame, Wand2, Mic, Square, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { BrandBadge } from '../components/BrandBadge'
import { TaskDrawer } from '../components/TaskDrawer'
import { CustomFieldsForm, CustomFieldsDisplay, useCustomFields } from '../components/CustomFields'

/**
 * Lead Detail page — `/inquiries/:id`. Three-column layout
 * (Profile · Activity Timeline · Smart Panel + Tasks).
 *
 * Phase 2 wires:
 *   • Smart Panel — fetches and caches the gpt-4o-mini brief +
 *     intent + win probability + going-cold risk + suggested action
 *     from POST /v1/admin/inquiries/{id}/ai-brief.
 *   • Won/Lost flows — picking a stage with kind=won opens the Won
 *     modal (POST /won, auto-creates a draft reservation when the
 *     inquiry has property + dates). Picking kind=lost opens a modal
 *     that requires a lost-reason from the seeded taxonomy
 *     (POST /lost).
 *
 * See apps/loyalty/CRM_IMPROVEMENT_PLAN.md.
 */

interface InquiryDetail {
  id: number
  guest_id: number
  property_id: number | null
  brand_id: number | null
  status: string
  priority: string
  source: string | null
  inquiry_type: string | null
  check_in: string | null
  check_out: string | null
  num_nights: number | null
  num_rooms: number | null
  num_adults: number | null
  num_children: number | null
  rate_offered: number | null
  total_value: number | null
  special_requests: string | null
  notes: string | null
  assigned_to: number | null
  pipeline_id: number | null
  pipeline_stage_id: number | null
  lost_reason_id: number | null
  ai_brief: string | null
  ai_brief_at: string | null
  ai_intent: string | null
  ai_win_probability: number | null
  ai_going_cold_risk: string | null
  ai_suggested_action: string | null
  custom_data: Record<string, any> | null
  guest?: { id: number; full_name: string; email: string | null; phone: string | null; company: string | null }
  property?: { id: number; name: string }
  corporate_account?: { id: number; name: string }
  pipeline?: { id: number; name: string; stages?: Stage[] }
  pipeline_stage?: Stage
  lost_reason?: { id: number; label: string }
  activities?: Activity[]
  open_tasks?: Task[]
  reservations?: Array<{ id: number; confirmation_no: string | null; status: string }>
}

interface Activity {
  id: number
  type: string
  subject: string | null
  body: string | null
  direction: string | null
  duration_minutes: number | null
  occurred_at: string
  created_at: string
  creator?: { id: number; name: string; email: string }
}

interface Task {
  id: number
  type: string
  title: string
  description: string | null
  due_at: string | null
  completed_at: string | null
  assignee?: { id: number; name: string }
}

interface Stage {
  id: number
  name: string
  slug: string
  color: string
  kind: 'open' | 'won' | 'lost'
  sort_order: number
  default_win_probability: number | null
}

interface AiBrief {
  brief: string | null
  intent: string | null
  win_probability: number | null
  going_cold_risk: string | null
  suggested_action: string | null
  generated_at: string | null
  cached: boolean
  error?: string
}

interface LostReason {
  id: number
  label: string
  slug: string
  sort_order: number
}

const ACTIVITY_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  note:           { label: 'Note',         icon: FileText,        color: '#94a3b8' },
  call:           { label: 'Call',         icon: Phone,           color: '#22d3ee' },
  email:          { label: 'Email',        icon: Mail,            color: '#a78bfa' },
  meeting:        { label: 'Meeting',      icon: CalendarIcon,    color: '#fbbf24' },
  chat:           { label: 'Chat',         icon: MessageSquare,   color: '#10b981' },
  status_change:  { label: 'Status',       icon: Tag,             color: '#f472b6' },
  task_completed: { label: 'Task done',    icon: CheckCircle2,    color: '#34d399' },
  file:           { label: 'File',         icon: FileText,        color: '#94a3b8' },
  system:         { label: 'System',       icon: AlertCircle,     color: '#94a3b8' },
}

const INTENT_META: Record<string, { label: string; color: string }> = {
  booking_inquiry: { label: 'Booking',      color: '#22d3ee' },
  group:           { label: 'Group',        color: '#a78bfa' },
  event:           { label: 'Event',        color: '#fbbf24' },
  info_request:    { label: 'Info request', color: '#94a3b8' },
  complaint:       { label: 'Complaint',    color: '#f87171' },
  other:           { label: 'Other',        color: '#64748b' },
}

const COLD_META: Record<string, { label: string; color: string; icon: any }> = {
  low:    { label: 'Engaged',  color: '#10b981', icon: Flame },
  medium: { label: 'Watch',    color: '#fbbf24', icon: Clock },
  high:   { label: 'Going cold', color: '#f87171', icon: Snowflake },
}

export function InquiryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: inq, isLoading } = useQuery<InquiryDetail>({
    queryKey: ['inquiry', id],
    queryFn: () => api.get(`/v1/admin/inquiries/${id}`).then(r => r.data),
    enabled: !!id,
    refetchInterval: 15_000,
  })

  const stages: Stage[] = useMemo(
    () => (inq?.pipeline?.stages ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [inq?.pipeline?.stages],
  )

  // ── Mutations ────────────────────────────────────────────────────

  const changeStage = useMutation({
    mutationFn: (stageName: string) => api.put(`/v1/admin/inquiries/${id}`, { status: stageName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiry', id] })
      qc.invalidateQueries({ queryKey: ['admin-inquiries'] })
      toast.success('Stage updated')
    },
    onError: () => toast.error('Failed to update stage'),
  })

  const addActivity = useMutation({
    mutationFn: (payload: { type: string; subject?: string; body: string; duration_minutes?: number }) =>
      api.post(`/v1/admin/inquiries/${id}/activities`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiry', id] })
      toast.success('Activity logged')
    },
    onError: () => toast.error('Failed to save'),
  })

  const completeTask = useMutation({
    mutationFn: (taskId: number) => api.post(`/v1/admin/tasks/${taskId}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiry', id] })
      toast.success('Task completed')
    },
  })

  // Stage transitions: kind=won → Won modal; kind=lost → Lost picker
  const [pendingWon, setPendingWon] = useState<Stage | null>(null)
  const [pendingLost, setPendingLost] = useState<Stage | null>(null)
  const [draftingProposal, setDraftingProposal] = useState(false)
  // Pre-populate the activity composer when "Use as email draft" is clicked
  // on the proposal modal. Cleared on next open.
  const [composerSeed, setComposerSeed] = useState<{ type: string; subject?: string; body: string } | null>(null)

  const handleStagePick = (stage: Stage) => {
    if (stage.kind === 'won')  { setPendingWon(stage);  return }
    if (stage.kind === 'lost') { setPendingLost(stage); return }
    changeStage.mutate(stage.name)
  }

  // ── Render guards ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-t-secondary text-sm">
        Loading lead…
      </div>
    )
  }
  if (!inq) {
    return (
      <div className="flex items-center justify-center py-24 text-t-secondary text-sm">
        Lead not found.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Header
        inq={inq}
        stages={stages}
        onBack={() => navigate(-1)}
        onPickStage={handleStagePick}
        onDraftProposal={() => setDraftingProposal(true)}
        changing={changeStage.isPending}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-4">
        <ProfileCol inq={inq} />
        <TimelineCol
          activities={inq.activities ?? []}
          onAdd={(payload) => addActivity.mutate(payload)}
          adding={addActivity.isPending}
          seed={composerSeed}
          onSeedConsumed={() => setComposerSeed(null)}
        />
        <SmartPanelCol
          inq={inq}
          tasks={inq.open_tasks ?? []}
          onCompleteTask={(taskId) => completeTask.mutate(taskId)}
        />
      </div>

      {pendingWon && (
        <WonModal
          inq={inq}
          stage={pendingWon}
          onClose={() => setPendingWon(null)}
          onSuccess={() => { setPendingWon(null) }}
        />
      )}
      {pendingLost && (
        <LostModal
          inq={inq}
          stage={pendingLost}
          onClose={() => setPendingLost(null)}
          onSuccess={() => { setPendingLost(null) }}
        />
      )}
      {draftingProposal && (
        <ProposalModal
          inq={inq}
          onClose={() => setDraftingProposal(false)}
          onUseAsEmail={(draft) => {
            setComposerSeed({ type: 'email', subject: draft.subject, body: draft.body })
            setDraftingProposal(false)
            toast.success('Draft loaded into composer')
          }}
        />
      )}
    </div>
  )
}

/* ── Header ──────────────────────────────────────────────────── */

function Header({ inq, stages, onBack, onPickStage, onDraftProposal, changing }: {
  inq: InquiryDetail
  stages: Stage[]
  onBack: () => void
  onPickStage: (stage: Stage) => void
  onDraftProposal: () => void
  changing: boolean
}) {
  const [stageOpen, setStageOpen] = useState(false)
  const stage = inq.pipeline_stage
  const stageColor = stage?.color ?? '#94a3b8'

  const value = inq.total_value ? `€${Number(inq.total_value).toLocaleString()}` : '—'
  const guestName = inq.guest?.full_name ?? '—'
  const company = inq.guest?.company || inq.corporate_account?.name

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white truncate">{guestName}</h1>
              <BrandBadge brandId={inq.brand_id} />
              {stage?.kind === 'lost' && inq.lost_reason && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                  Lost: {inq.lost_reason.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-t-secondary flex-wrap">
              {company && <span className="flex items-center gap-1"><Building2 size={11} />{company}</span>}
              <span>·</span>
              <span>{inq.inquiry_type ?? 'general'}</span>
              <span>·</span>
              <span className="font-mono">{value}</span>
              {inq.source && <><span>·</span><span>via {inq.source}</span></>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onDraftProposal}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/15 hover:text-purple-200 text-xs font-bold"
            title="AI: draft proposal email from this inquiry"
          >
            <Wand2 size={13} />
            Draft proposal
          </button>

          <div className="relative">
            <button
              onClick={() => setStageOpen(s => !s)}
              disabled={changing}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold disabled:opacity-50"
              style={{
                borderColor: stageColor + '60',
                background: stageColor + '15',
                color: stageColor,
              }}
            >
              {stage?.name ?? inq.status}
              <ChevronDown size={14} />
            </button>

            {stageOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-60 bg-dark-surface border border-dark-border rounded-xl shadow-2xl overflow-hidden z-30"
                onMouseLeave={() => setStageOpen(false)}
              >
                {stages.map(s => {
                  const isWon = s.kind === 'won'
                  const isLost = s.kind === 'lost'
                  return (
                    <button
                      key={s.id}
                      onClick={() => { onPickStage(s); setStageOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-dark-surface2 text-left text-sm"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: s.color }}
                      />
                      <span className="flex-1 text-white">{s.name}</span>
                      {isWon && <Trophy size={11} className="text-emerald-400" />}
                      {isLost && <X size={11} className="text-red-400" />}
                      {!isWon && !isLost && (
                        <ArrowRight size={10} className="text-t-secondary opacity-0 group-hover:opacity-100" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Left: Profile column ───────────────────────────────────── */

function ProfileCol({ inq }: { inq: InquiryDetail }) {
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4 space-y-4 self-start">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide font-bold text-t-secondary">
        <User size={11} /> Contact
      </div>
      <Field label="Email" value={inq.guest?.email ?? '—'} />
      <Field label="Phone" value={inq.guest?.phone ?? '—'} />

      <div className="border-t border-dark-border pt-4 flex items-center gap-2 text-[10px] uppercase tracking-wide font-bold text-t-secondary">
        <CalendarIcon size={11} /> Stay
      </div>
      <Field label="Check-in"  value={inq.check_in ?? '—'} mono />
      <Field label="Check-out" value={inq.check_out ?? '—'} mono />
      <div className="grid grid-cols-3 gap-2">
        <Field label="Rooms"    value={String(inq.num_rooms ?? '—')} />
        <Field label="Adults"   value={String(inq.num_adults ?? '—')} />
        <Field label="Children" value={String(inq.num_children ?? '—')} />
      </div>

      {inq.special_requests && (
        <>
          <div className="border-t border-dark-border pt-4 text-[10px] uppercase tracking-wide font-bold text-t-secondary">
            Special requests
          </div>
          <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{inq.special_requests}</p>
        </>
      )}

      <div className="border-t border-dark-border pt-4 flex items-center gap-2 text-[10px] uppercase tracking-wide font-bold text-t-secondary">
        <MapPin size={11} /> Pipeline
      </div>
      <Field label="Property" value={inq.property?.name ?? '—'} />
      <Field label="Priority" value={inq.priority ?? 'Medium'} />
      <Field label="Source"   value={inq.source ?? 'Manual'} />

      {inq.reservations && inq.reservations.length > 0 && (
        <>
          <div className="border-t border-dark-border pt-4 text-[10px] uppercase tracking-wide font-bold text-t-secondary">
            Linked reservation
          </div>
          {inq.reservations.map(r => (
            <Link key={r.id} to={`/reservations`} className="flex items-center justify-between text-xs hover:underline">
              <span className="font-mono text-accent">{r.confirmation_no ?? `#${r.id}`}</span>
              <span className="text-t-secondary">{r.status}</span>
            </Link>
          ))}
        </>
      )}

      <CustomFieldsSection inq={inq} />

      {inq.guest_id && (
        <Link to={`/guest/${inq.guest_id}`} className="block text-xs text-accent hover:underline pt-2 border-t border-dark-border">
          Open guest profile →
        </Link>
      )}
    </div>
  )
}

/**
 * Read-only display + Edit pencil. Opens an inline form drawer that
 * PATCHes /v1/admin/inquiries/{id} with a fresh custom_data object.
 * Only renders when the org has at least one active custom field for
 * the inquiry entity — no field defs, no section.
 */
function CustomFieldsSection({ inq }: { inq: InquiryDetail }) {
  const qc = useQueryClient()
  const { data: fields } = useCustomFields('inquiry')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, any>>({})

  const save = useMutation({
    mutationFn: () => api.put(`/v1/admin/inquiries/${inq.id}`, { custom_data: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiry', String(inq.id)] })
      qc.invalidateQueries({ queryKey: ['admin-inquiries'] })
      toast.success('Saved')
      setEditing(false)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Save failed'
      toast.error(msg)
    },
  })

  if (!fields || fields.length === 0) return null

  const start = () => {
    setDraft(inq.custom_data ?? {})
    setEditing(true)
  }

  return (
    <div className="border-t border-dark-border pt-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide font-bold text-purple-300">
          <Sparkles size={11} /> Custom fields
        </div>
        {!editing && (
          <button onClick={start} className="text-[10px] text-t-secondary hover:text-accent flex items-center gap-1">
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <>
          <CustomFieldsForm
            entity="inquiry"
            values={draft}
            onChange={setDraft}
            inputClassName="w-full bg-dark-bg border border-dark-border rounded-md px-2.5 py-1.5 text-sm placeholder-t-secondary outline-none focus:border-accent"
            layout="stack"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs text-t-secondary hover:text-white">Cancel</button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="bg-accent text-black font-bold rounded-md px-3 py-1 text-xs disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : (
        <CustomFieldsDisplay entity="inquiry" values={inq.custom_data} dense />
      )}
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">{label}</p>
      <p className={`text-sm text-white mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

/* ── Centre: Activity Timeline ──────────────────────────────── */

function TimelineCol({ activities, onAdd, adding, seed, onSeedConsumed }: {
  activities: Activity[]
  onAdd: (payload: { type: string; subject?: string; body: string; duration_minutes?: number }) => void
  adding: boolean
  seed: { type: string; subject?: string; body: string } | null
  onSeedConsumed: () => void
}) {
  const [filter, setFilter] = useState<string>('all')
  const filtered = useMemo(
    () => filter === 'all' ? activities : activities.filter(a => a.type === filter),
    [activities, filter],
  )

  const filterChips = ['all', 'note', 'call', 'email', 'meeting', 'chat', 'status_change', 'task_completed']

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl flex flex-col" style={{ minHeight: 480 }}>
      <div className="flex items-center gap-1 p-2 border-b border-dark-border overflow-x-auto">
        {filterChips.map(t => {
          const active = filter === t
          const meta = t === 'all' ? null : ACTIVITY_TYPES[t]
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap ${
                active ? 'bg-accent text-black' : 'text-t-secondary hover:text-white hover:bg-dark-surface2'
              }`}
            >
              {t === 'all' ? 'All' : meta?.label ?? t}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="text-center text-t-secondary text-sm py-8">
            No activity yet — log a note, call, or email below.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(a => <ActivityRow key={a.id} activity={a} />)}
          </div>
        )}
      </div>

      <ActivityComposer
        onSubmit={onAdd}
        disabled={adding}
        seed={seed}
        onSeedConsumed={onSeedConsumed}
      />
    </div>
  )
}

function ActivityRow({ activity }: { activity: Activity }) {
  const meta = ACTIVITY_TYPES[activity.type] ?? ACTIVITY_TYPES.system
  const Icon = meta.icon
  return (
    <div className="flex gap-3">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: meta.color + '22', border: `1px solid ${meta.color}55` }}
      >
        <Icon size={14} style={{ color: meta.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide font-bold" style={{ color: meta.color }}>
            {meta.label}
          </span>
          {activity.subject && (
            <span className="text-sm font-semibold text-white">{activity.subject}</span>
          )}
          {activity.duration_minutes && (
            <span className="text-[11px] text-t-secondary">· {activity.duration_minutes} min</span>
          )}
          <span className="text-[11px] text-t-secondary ml-auto">{relativeTime(activity.occurred_at)}</span>
        </div>
        {activity.body && (
          <p className="text-sm text-t-secondary mt-1 whitespace-pre-wrap leading-relaxed">{activity.body}</p>
        )}
        {activity.creator && (
          <p className="text-[10px] text-t-secondary mt-1">by {activity.creator.name}</p>
        )}
      </div>
    </div>
  )
}

function ActivityComposer({ onSubmit, disabled, seed, onSeedConsumed }: {
  onSubmit: (p: { type: string; subject?: string; body: string; duration_minutes?: number }) => void
  disabled: boolean
  seed: { type: string; subject?: string; body: string } | null
  onSeedConsumed: () => void
}) {
  const [type, setType] = useState<'note' | 'call' | 'email' | 'meeting'>('note')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [duration, setDuration] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  // Apply a programmatic seed (e.g. from the AI proposal modal) once,
  // then notify the parent so future opens don't reapply the same blob.
  useEffect(() => {
    if (!seed) return
    if (seed.type === 'email' || seed.type === 'note' || seed.type === 'call' || seed.type === 'meeting') {
      setType(seed.type)
    }
    setSubject(seed.subject ?? '')
    setBody(seed.body)
    onSeedConsumed()
  }, [seed, onSeedConsumed])

  const submit = () => {
    if (!body.trim()) return
    onSubmit({
      type,
      subject: subject || undefined,
      body: body.trim(),
      duration_minutes: (type === 'call' || type === 'meeting') && duration ? parseInt(duration) : undefined,
    })
    setBody(''); setSubject(''); setDuration('')
  }

  // CRM Phase 5 — Whisper voice notes. MediaRecorder records the agent's
  // mic, then we POST the blob to the existing /chat-inbox/transcribe
  // endpoint (already wired to gpt-4o-transcribe with whisper-1
  // fallback). The returned text is APPENDED to the body so users can
  // dictate multiple segments without losing previous content.
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (blob.size === 0) {
          setTranscribing(false)
          return
        }
        setTranscribing(true)
        try {
          const fd = new FormData()
          fd.append('audio', blob, 'voice-note.webm')
          fd.append('language', navigator.language || 'auto')
          const res = await api.post('/v1/admin/chat-inbox/transcribe', fd)
          const text = (res.data?.text ?? '').trim()
          if (text) {
            setBody(prev => prev ? `${prev}\n${text}` : text)
            toast.success('Transcribed')
          } else {
            toast.error('Heard nothing — try again')
          }
        } catch {
          toast.error('Transcription failed')
        } finally {
          setTranscribing(false)
        }
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      toast.error('Microphone permission denied')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  const tabs: ('note' | 'call' | 'email' | 'meeting')[] = ['note', 'call', 'email', 'meeting']

  return (
    <div className="border-t border-dark-border p-3" style={{ flexShrink: 0 }}>
      <div className="flex items-center gap-1 mb-2">
        {tabs.map(t => {
          const meta = ACTIVITY_TYPES[t]
          const Icon = meta.icon
          const active = type === t
          return (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold ${
                active ? 'bg-accent/15 text-accent border border-accent/40' : 'text-t-secondary hover:text-white'
              }`}
            >
              <Icon size={11} />
              {meta.label}
            </button>
          )
        })}
      </div>
      {(type === 'email' || type === 'meeting') && (
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder={type === 'email' ? 'Subject' : 'Meeting title'}
          className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-1.5 text-sm placeholder-t-secondary outline-none focus:border-accent mb-2"
        />
      )}
      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
          placeholder={
            type === 'note' ? 'Add a note…' :
            type === 'call' ? 'Call summary — what did the guest ask, what did you say…' :
            type === 'email' ? 'Email body…' : 'Meeting notes…'
          }
          rows={2}
          className="flex-1 bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent resize-none"
        />
        {(type === 'call' || type === 'meeting') && (
          <input
            value={duration}
            onChange={e => setDuration(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="min"
            className="w-16 bg-dark-bg border border-dark-border rounded-md px-2 py-1.5 text-sm text-center outline-none focus:border-accent"
          />
        )}
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing || disabled}
          className={`rounded-md px-3 disabled:opacity-50 ${
            recording
              ? 'bg-red-500 text-white animate-pulse hover:bg-red-400'
              : 'bg-dark-bg border border-dark-border text-t-secondary hover:text-white hover:border-accent/50'
          }`}
          title={recording ? 'Stop recording' : 'Voice note (Whisper)'}
        >
          {transcribing ? <Loader2 size={14} className="animate-spin" /> : recording ? <Square size={14} /> : <Mic size={14} />}
        </button>
        <button
          onClick={submit}
          disabled={!body.trim() || disabled}
          className="bg-accent text-black font-bold rounded-md px-3 disabled:opacity-50 hover:bg-accent/90"
        >
          <Send size={14} />
        </button>
      </div>
      <p className="text-[10px] text-t-secondary mt-1.5">
        ⌘/Ctrl + Enter to send
        {recording && <span className="text-red-400 font-bold ml-2">● Recording — click stop when done</span>}
        {transcribing && <span className="text-accent ml-2">Transcribing…</span>}
      </p>
    </div>
  )
}

/* ── Right: Smart Panel + Open Tasks ─────────────────────────── */

function SmartPanelCol({ inq, tasks, onCompleteTask }: {
  inq: InquiryDetail
  tasks: Task[]
  onCompleteTask: (taskId: number) => void
}) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4 self-start">
      <SmartPanel inq={inq} />

      <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide font-bold text-t-secondary">
            <Clock size={11} /> Open tasks ({tasks.length})
          </div>
          <button
            onClick={() => setAdding(true)}
            className="p-1 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white"
            title="Add task"
          >
            <Plus size={13} />
          </button>
        </div>
        {tasks.length === 0 ? (
          <p className="text-xs text-t-secondary italic">No open tasks.</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map(t => <TaskRow key={t.id} task={t} onComplete={() => onCompleteTask(t.id)} />)}
          </div>
        )}
      </div>

      {adding && (
        <TaskDrawer
          task={null}
          defaultInquiryId={inq.id}
          onClose={() => setAdding(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['inquiry', String(inq.id)] })
            qc.invalidateQueries({ queryKey: ['tasks-list'] })
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

/**
 * AI Smart Panel — fetches from /ai-brief on mount (cached server-side
 * for 15 min). Shows brief + intent badge + win prob + cold risk +
 * suggested action. Manual "Refresh" button hits the same endpoint
 * with force_refresh=true to bypass the cache.
 */
function SmartPanel({ inq }: { inq: InquiryDetail }) {
  const qc = useQueryClient()

  // Seed React Query with the cached values from the inquiry payload —
  // saves a round-trip when the brief on the row is recent. The
  // /ai-brief endpoint will hand back the same payload anyway.
  const seed: AiBrief | undefined = inq.ai_brief ? {
    brief: inq.ai_brief,
    intent: inq.ai_intent,
    win_probability: inq.ai_win_probability,
    going_cold_risk: inq.ai_going_cold_risk,
    suggested_action: inq.ai_suggested_action,
    generated_at: inq.ai_brief_at,
    cached: true,
  } : undefined

  const { data: brief, isFetching } = useQuery<AiBrief>({
    queryKey: ['inquiry-ai-brief', inq.id],
    queryFn: () => api.post(`/v1/admin/inquiries/${inq.id}/ai-brief`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    initialData: seed,
    enabled: true, // run on mount; cheap when server-cached
  })

  const refresh = useMutation({
    mutationFn: () => api.post(`/v1/admin/inquiries/${inq.id}/ai-brief`, { force_refresh: true }).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['inquiry-ai-brief', inq.id], data)
      qc.invalidateQueries({ queryKey: ['inquiry', String(inq.id)] })
      toast.success('Brief refreshed')
    },
    onError: () => toast.error('Could not refresh brief'),
  })

  const intent = brief?.intent ? INTENT_META[brief.intent] ?? INTENT_META.other : null
  const cold = brief?.going_cold_risk ? COLD_META[brief.going_cold_risk] ?? COLD_META.medium : null
  const ColdIcon = cold?.icon

  const generating = isFetching || refresh.isPending
  const empty = !brief?.brief && !generating

  return (
    <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide font-bold text-purple-300">
          <Sparkles size={11} /> AI Smart Panel
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={generating}
          className="p-1 rounded hover:bg-purple-500/15 text-purple-300/70 hover:text-purple-200 disabled:opacity-40"
          title="Regenerate brief"
        >
          <RefreshCw size={11} className={generating ? 'animate-spin' : ''} />
        </button>
      </div>

      {empty && !brief?.error && (
        <button
          onClick={() => refresh.mutate()}
          className="w-full text-left text-xs text-purple-200/80 hover:text-purple-200 italic py-2"
        >
          Generate brief →
        </button>
      )}

      {generating && !brief?.brief && (
        <p className="text-xs text-purple-200/60 italic">Generating…</p>
      )}

      {brief?.brief && (
        <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{brief.brief}</p>
      )}

      {brief?.error && (
        <p className="text-[11px] text-red-300 italic mt-2">{brief.error}</p>
      )}

      {(intent || cold) && (
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {intent && (
            <span
              className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide"
              style={{ background: intent.color + '20', color: intent.color, border: `1px solid ${intent.color}40` }}
            >
              {intent.label}
            </span>
          )}
          {cold && ColdIcon && (
            <span
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide"
              style={{ background: cold.color + '20', color: cold.color, border: `1px solid ${cold.color}40` }}
            >
              <ColdIcon size={9} />
              {cold.label}
            </span>
          )}
        </div>
      )}

      {brief?.win_probability !== null && brief?.win_probability !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide font-bold text-t-secondary">
            <span>Win probability</span>
            <span className="text-white">{brief.win_probability}%</span>
          </div>
          <div className="mt-1 h-1.5 bg-dark-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full transition-all"
              style={{ width: `${brief.win_probability}%` }}
            />
          </div>
        </div>
      )}

      {brief?.suggested_action && (
        <div className="mt-3 pt-3 border-t border-purple-500/20">
          <div className="text-[10px] uppercase tracking-wide font-bold text-purple-300 mb-1">
            Suggested next action
          </div>
          <p className="text-xs text-white leading-relaxed">{brief.suggested_action}</p>
        </div>
      )}

      {brief?.generated_at && (
        <p className="text-[9px] text-t-secondary italic mt-3">
          Generated {relativeTime(brief.generated_at)}{brief.cached ? ' · cached' : ''}
        </p>
      )}
    </div>
  )
}

function TaskRow({ task, onComplete }: { task: Task; onComplete: () => void }) {
  const overdue = task.due_at && new Date(task.due_at) < new Date()
  return (
    <div className="flex items-start gap-2 group">
      <button
        onClick={onComplete}
        className="w-4 h-4 rounded-full border-2 border-dark-border hover:border-emerald-400 flex-shrink-0 mt-0.5 transition-colors"
        title="Mark complete"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{task.title}</p>
        <div className="flex items-center gap-2 text-[10px] text-t-secondary mt-0.5">
          {task.due_at && (
            <span className={overdue ? 'text-red-400 font-bold' : ''}>
              {overdue ? 'Overdue · ' : ''}{relativeTime(task.due_at)}
            </span>
          )}
          {task.assignee && <span>· {task.assignee.name}</span>}
        </div>
      </div>
    </div>
  )
}

/* ── Modals ─────────────────────────────────────────────────── */

function WonModal({ inq, stage, onClose, onSuccess }: {
  inq: InquiryDetail
  stage: Stage
  onClose: () => void
  onSuccess: () => void
}) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')

  const willCreateReservation = !!inq.property_id && !!inq.check_in && !!inq.check_out
    && !(inq.reservations && inq.reservations.length > 0)

  const submit = useMutation({
    mutationFn: () => api.post(`/v1/admin/inquiries/${inq.id}/won`, { note: note || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['inquiry', String(inq.id)] })
      qc.invalidateQueries({ queryKey: ['admin-inquiries'] })
      toast.success(res.data?.message ?? 'Marked won')
      onSuccess()
    },
    onError: () => toast.error('Failed to mark won'),
  })

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-2 mb-1">
        <Trophy size={20} className="text-emerald-400" />
        <h2 className="text-lg font-bold text-white">Mark as Won</h2>
      </div>
      <p className="text-sm text-t-secondary mb-4">
        Move this lead into <span className="font-semibold" style={{ color: stage.color }}>{stage.name}</span>.
        {willCreateReservation && ' A draft reservation will be created automatically with the inquiry\'s dates and pax.'}
        {!willCreateReservation && !inq.reservations?.length && (
          <span className="block mt-1 text-xs text-amber-300">
            Heads up: no draft reservation will be created — the inquiry is missing a property or stay dates.
          </span>
        )}
        {!!inq.reservations?.length && (
          <span className="block mt-1 text-xs">A reservation is already linked.</span>
        )}
      </p>

      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional note — e.g. how the deal closed, terms agreed."
        rows={3}
        className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent resize-none mb-4"
      />

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-t-secondary hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2"
        >
          <Trophy size={14} />
          {submit.isPending ? 'Saving…' : 'Mark won'}
        </button>
      </div>
    </Modal>
  )
}

function LostModal({ inq, stage, onClose, onSuccess }: {
  inq: InquiryDetail
  stage: Stage
  onClose: () => void
  onSuccess: () => void
}) {
  const qc = useQueryClient()
  const [reasonId, setReasonId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [aiGuess, setAiGuess] = useState<{ confidence: string; reasoning: string | null } | null>(null)

  const { data: reasons } = useQuery<LostReason[]>({
    queryKey: ['inquiry-lost-reasons'],
    queryFn: () => api.get('/v1/admin/inquiry-lost-reasons').then(r => r.data),
    staleTime: 60 * 60 * 1000, // 1h
  })

  // Pre-select the previously-recorded reason if one exists.
  useEffect(() => {
    if (reasonId === null && inq.lost_reason_id) setReasonId(inq.lost_reason_id)
  }, [inq.lost_reason_id, reasonId])

  // CRM Phase 5 — AI lost-reason guesser. Reads the timeline + stay
  // context, returns the most likely match from the seeded taxonomy
  // plus a one-sentence rationale. Pre-selects the picker so the rep
  // only has to confirm, not pick from scratch.
  const guess = useMutation({
    mutationFn: () => api.post(`/v1/admin/inquiries/${inq.id}/guess-lost-reason`).then(r => r.data),
    onSuccess: (data) => {
      if (data.lost_reason_id) {
        setReasonId(data.lost_reason_id)
        setAiGuess({ confidence: data.confidence, reasoning: data.reasoning })
        toast.success(`Suggested: ${data.label}`)
      } else {
        toast.error(data.error ?? 'No clear signal — pick manually')
      }
    },
    onError: () => toast.error('Could not guess'),
  })

  const submit = useMutation({
    mutationFn: () => api.post(`/v1/admin/inquiries/${inq.id}/lost`, {
      lost_reason_id: reasonId,
      note: note || undefined,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['inquiry', String(inq.id)] })
      qc.invalidateQueries({ queryKey: ['admin-inquiries'] })
      toast.success(res.data?.message ?? 'Marked lost')
      onSuccess()
    },
    onError: () => toast.error('Failed to mark lost'),
  })

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-2 mb-1">
        <X size={20} className="text-red-400" />
        <h2 className="text-lg font-bold text-white">Mark as Lost</h2>
      </div>
      <p className="text-sm text-t-secondary mb-3">
        Closing this lead in <span className="font-semibold" style={{ color: stage.color }}>{stage.name}</span>.
        Pick the reason — it powers the loss-reason breakdown on the funnel report.
      </p>

      <button
        onClick={() => guess.mutate()}
        disabled={guess.isPending}
        className="w-full flex items-center justify-center gap-2 mb-3 px-3 py-2 rounded-md text-xs font-bold border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/15 disabled:opacity-50"
      >
        {guess.isPending
          ? <><Loader2 size={12} className="animate-spin" /> Reading timeline…</>
          : <><Wand2 size={12} /> Suggest from timeline</>
        }
      </button>

      {aiGuess && (
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-md px-3 py-2 mb-3 text-xs">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-bold text-purple-300 mb-0.5">
            <Sparkles size={9} /> AI suggestion · {aiGuess.confidence} confidence
          </div>
          {aiGuess.reasoning && <p className="text-white/80">{aiGuess.reasoning}</p>}
        </div>
      )}

      <div className="space-y-1.5 mb-4 max-h-64 overflow-y-auto">
        {reasons?.map(r => (
          <button
            key={r.id}
            onClick={() => setReasonId(r.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm border transition ${
              reasonId === r.id
                ? 'border-red-400/60 bg-red-500/10 text-white'
                : 'border-dark-border hover:bg-dark-surface2 text-t-secondary'
            }`}
          >
            <span
              className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                reasonId === r.id ? 'bg-red-400 border-red-400' : 'border-dark-border'
              }`}
            />
            {r.label}
          </button>
        ))}
        {!reasons?.length && (
          <p className="text-xs text-t-secondary italic">No reasons configured. Add some in Settings → Pipelines.</p>
        )}
      </div>

      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional context — e.g. what they went with instead, what we'd need to win next time."
        rows={3}
        className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent resize-none mb-4"
      />

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-t-secondary hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={() => submit.mutate()}
          disabled={!reasonId || submit.isPending}
          className="bg-red-500 hover:bg-red-400 text-white font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2"
        >
          <X size={14} />
          {submit.isPending ? 'Saving…' : 'Mark lost'}
        </button>
      </div>
    </Modal>
  )
}

function ProposalModal({ inq, onClose, onUseAsEmail }: {
  inq: InquiryDetail
  onClose: () => void
  onUseAsEmail: (draft: { subject: string; body: string }) => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  // Phase 5 — kick off the draft on mount, plus a refresh button for
  // when the agent wants a different angle. Editable fields so the
  // human can tighten before pasting into the composer.
  const draft = useMutation({
    mutationFn: () => api.post(`/v1/admin/inquiries/${inq.id}/draft-proposal`).then(r => r.data),
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error)
        return
      }
      setSubject(data.subject ?? '')
      setBody(data.body ?? '')
    },
    onError: () => toast.error('Could not draft proposal'),
  })

  useEffect(() => {
    draft.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark-surface border border-dark-border rounded-xl p-5 w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-purple-400" />
            <h2 className="text-lg font-bold text-white">AI proposal draft</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-t-secondary mb-3">
          Pulled from this inquiry's stay details + special requests. Edit before sending — the model is helpful, not magical.
        </p>

        {draft.isPending && !body ? (
          <div className="py-12 text-center text-t-secondary text-sm flex flex-col items-center gap-2">
            <Loader2 size={20} className="animate-spin text-purple-400" />
            Drafting…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
                Subject
              </label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
                Body
              </label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={14}
                className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent resize-none whitespace-pre-wrap leading-relaxed"
              />
            </div>
          </div>
        )}

        <div className="flex justify-between items-center gap-2 pt-3 mt-3 border-t border-dark-border">
          <button
            onClick={() => draft.mutate()}
            disabled={draft.isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-t-secondary hover:text-white disabled:opacity-50"
            title="Try a different draft"
          >
            <RefreshCw size={12} className={draft.isPending ? 'animate-spin' : ''} />
            Regenerate
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-t-secondary hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => onUseAsEmail({ subject, body })}
              disabled={!body.trim()}
              className="bg-accent text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 hover:bg-accent/90 flex items-center gap-2"
            >
              <Mail size={14} />
              Use as email draft
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark-surface border border-dark-border rounded-xl p-5 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/* ── Helpers ────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  const absMs = Math.abs(diff)
  const past = diff < 0
  const mins = Math.floor(absMs / 60_000)
  if (mins < 1) return past ? 'just now' : 'now'
  if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return past ? `${days}d ago` : `in ${days}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
