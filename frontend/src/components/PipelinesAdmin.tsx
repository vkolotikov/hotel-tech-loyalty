import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  GitBranch, Plus, Trash2, Star, ChevronDown, ChevronRight, Edit3,
  Trophy, X, Flag, Save, LayoutGrid, Eye, EyeOff,
} from 'lucide-react'
import { useSettings, DEFAULT_INQUIRY_FIELDS, type InquiryFieldConfig } from '../lib/crmSettings'
import { CustomFieldsAdmin } from './CustomFieldsAdmin'

/**
 * Settings → Pipelines tab. Manages:
 *   • Pipelines (rename, set default, add new with seeded stages, delete)
 *   • Stages per pipeline (rename, recolor, change kind, win-prob, delete)
 *   • Lost-reason taxonomy used by the lead-detail Lost flow
 *
 * CRM Phase 3.
 */

interface PipelineStage {
  id: number
  name: string
  slug: string
  color: string
  kind: 'open' | 'won' | 'lost'
  sort_order: number
  default_win_probability: number | null
  inquiries_count?: number
}

interface Pipeline {
  id: number
  name: string
  slug: string
  description: string | null
  is_default: boolean
  sort_order: number
  inquiries_count: number
  stages: PipelineStage[]
}

interface LostReason {
  id: number
  label: string
  slug: string
  sort_order: number
  is_active: boolean
  inquiries_count: number
}

const KIND_META = {
  open: { label: 'Open',  color: '#3b82f6', icon: Flag },
  won:  { label: 'Won',   color: '#22c55e', icon: Trophy },
  lost: { label: 'Lost',  color: '#ef4444', icon: X },
} as const

const STAGE_COLORS = [
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ef4444',
  '#f59e0b', '#eab308', '#22c55e', '#10b981', '#14b8a6',
  '#22d3ee', '#94a3b8',
]

export function PipelinesAdmin() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState(false)

  const { data: pipelines, isLoading } = useQuery<Pipeline[]>({
    queryKey: ['admin-pipelines'],
    queryFn: () => api.get('/v1/admin/pipelines').then(r => r.data),
  })

  const { data: lostReasons } = useQuery<LostReason[]>({
    queryKey: ['admin-lost-reasons'],
    queryFn: () => api.get('/v1/admin/inquiry-lost-reasons-admin').then(r => r.data),
  })

  const setDefault = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/pipelines/${id}/set-default`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pipelines'] })
      toast.success('Default pipeline updated')
    },
  })

  const deletePipeline = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/pipelines/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pipelines'] })
      toast.success('Pipeline deleted')
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Could not delete'),
  })

  const toggleExpanded = (id: number) => {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <GitBranch size={16} className="text-accent" /> Pipelines
            </h2>
            <p className="text-xs text-t-secondary mt-1">
              Each pipeline is a named sequence of stages deals progress through. Most hotels need one ("Sales");
              groups running MICE / corporate sales add a second.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-accent text-black font-bold rounded-md px-3 py-1.5 text-xs hover:bg-accent/90"
          >
            <Plus size={13} /> New pipeline
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-t-secondary py-8 text-center">Loading…</p>
        ) : (
          <div className="space-y-2">
            {pipelines?.map(p => (
              <PipelineRow
                key={p.id}
                pipeline={p}
                expanded={expanded.has(p.id)}
                onToggle={() => toggleExpanded(p.id)}
                onSetDefault={() => setDefault.mutate(p.id)}
                onDelete={() => {
                  if (window.confirm(`Delete pipeline "${p.name}"? Inquiries on it must be closed or moved first.`)) {
                    deletePipeline.mutate(p.id)
                  }
                }}
              />
            ))}
          </div>
        )}

        {creating && (
          <NewPipelineModal
            onClose={() => setCreating(false)}
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ['admin-pipelines'] })
              setCreating(false)
            }}
          />
        )}
      </div>

      {/* Lost reasons */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <X size={16} className="text-red-400" /> Lost reasons
            </h2>
            <p className="text-xs text-t-secondary mt-1">
              Required pick when a deal is moved to a Lost stage. Powers the lost-reason breakdown on the funnel report.
            </p>
          </div>
        </div>

        <LostReasonsEditor reasons={lostReasons ?? []} />
      </div>

      {/* Field visibility — admin picks which fields show on the Add
          Inquiry form and which columns appear in the leads list. */}
      <FieldLayoutEditor />

      {/* Custom fields — admin-defined per entity. Multi-industry: a
          beauty salon adds skin_type / allergies to Guest, a clinic
          adds DOB + insurance, etc. Industry presets at the top. */}
      <CustomFieldsAdmin />
    </div>
  )
}

/* ── Pipeline row + stages ──────────────────────────────────── */

function PipelineRow({ pipeline, expanded, onToggle, onSetDefault, onDelete }: {
  pipeline: Pipeline
  expanded: boolean
  onToggle: () => void
  onSetDefault: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(pipeline.name)
  const [addingStage, setAddingStage] = useState(false)

  const rename = useMutation({
    mutationFn: () => api.put(`/v1/admin/pipelines/${pipeline.id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pipelines'] })
      toast.success('Pipeline renamed')
      setRenaming(false)
    },
  })

  return (
    <div className="bg-dark-bg border border-dark-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <button onClick={onToggle} className="p-0.5 text-t-secondary hover:text-white">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {renaming ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className="flex-1 bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={() => rename.mutate()}
              className="p-1.5 rounded hover:bg-emerald-500/15 text-emerald-400"
              title="Save"
            >
              <Save size={13} />
            </button>
            <button
              onClick={() => { setRenaming(false); setName(pipeline.name) }}
              className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <>
            <span className="font-semibold text-white flex-1">{pipeline.name}</span>
            {pipeline.is_default ? (
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                <Star size={9} className="fill-amber-300" /> Default
              </span>
            ) : (
              <button
                onClick={onSetDefault}
                className="text-[10px] uppercase tracking-wide font-bold text-t-secondary hover:text-amber-300 px-2 py-0.5 rounded border border-dark-border hover:border-amber-500/30"
                title="Make default"
              >
                Set default
              </button>
            )}
            <span className="text-xs text-t-secondary">
              {pipeline.stages.length} stages · {pipeline.inquiries_count} deals
            </span>
            <button
              onClick={() => setRenaming(true)}
              className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white"
              title="Rename"
            >
              <Edit3 size={13} />
            </button>
            {!pipeline.is_default && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded hover:bg-red-500/15 text-t-secondary hover:text-red-400"
                title="Delete pipeline"
              >
                <Trash2 size={13} />
              </button>
            )}
          </>
        )}
      </div>

      {expanded && (
        <div className="border-t border-dark-border bg-dark-surface/50 p-3 space-y-2">
          {pipeline.stages.map(stage => (
            <StageRow key={stage.id} stage={stage} />
          ))}
          {addingStage ? (
            <NewStageRow
              pipelineId={pipeline.id}
              onClose={() => setAddingStage(false)}
              onAdded={() => setAddingStage(false)}
            />
          ) : (
            <button
              onClick={() => setAddingStage(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs text-t-secondary hover:text-white hover:bg-dark-surface2 border border-dashed border-dark-border"
            >
              <Plus size={12} /> Add stage
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StageRow({ stage }: { stage: PipelineStage }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color)
  const [kind, setKind] = useState<'open' | 'won' | 'lost'>(stage.kind)
  const [winProb, setWinProb] = useState<string>(
    stage.default_win_probability !== null ? String(stage.default_win_probability) : ''
  )

  const KindIcon = KIND_META[stage.kind].icon

  const update = useMutation({
    mutationFn: () => api.put(`/v1/admin/pipeline-stages/${stage.id}`, {
      name,
      color,
      kind,
      default_win_probability: winProb === '' ? null : parseInt(winProb, 10),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pipelines'] })
      toast.success('Stage updated')
      setEditing(false)
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed'),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/v1/admin/pipeline-stages/${stage.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pipelines'] })
      toast.success('Stage deleted')
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed'),
  })

  if (editing) {
    return (
      <div className="bg-dark-bg border border-accent/40 rounded-md p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Stage name"
            className="flex-1 bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <input
            type="number"
            min="0"
            max="100"
            value={winProb}
            onChange={e => setWinProb(e.target.value)}
            placeholder="%"
            className="w-16 bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-sm text-center outline-none focus:border-accent"
            title="Default win probability"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['open', 'won', 'lost'] as const).map(k => {
            const m = KIND_META[k]
            const Icon = m.icon
            const active = kind === k
            return (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold border ${
                  active ? 'text-black' : 'text-t-secondary border-dark-border hover:bg-dark-surface2'
                }`}
                style={active ? { background: m.color, borderColor: m.color } : {}}
              >
                <Icon size={10} />
                {m.label}
              </button>
            )
          })}
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            {STAGE_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-4 h-4 rounded-full transition ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-bg' : ''}`}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-1.5">
          <button
            onClick={() => { setEditing(false); setName(stage.name); setColor(stage.color); setKind(stage.kind) }}
            className="px-3 py-1 text-xs text-t-secondary hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => update.mutate()}
            disabled={!name.trim() || update.isPending}
            className="bg-accent text-black font-bold rounded-md px-3 py-1 text-xs disabled:opacity-50 hover:bg-accent/90"
          >
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-2 p-2 rounded-md hover:bg-dark-surface2">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: stage.color }}
      />
      <span className="text-sm font-semibold text-white flex-1">{stage.name}</span>
      <span
        className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded"
        style={{ color: KIND_META[stage.kind].color, background: KIND_META[stage.kind].color + '15' }}
      >
        <KindIcon size={9} />
        {KIND_META[stage.kind].label}
      </span>
      {stage.default_win_probability !== null && (
        <span className="text-[10px] text-t-secondary tabular-nums">
          {stage.default_win_probability}% default
        </span>
      )}
      {(stage.inquiries_count ?? 0) > 0 && (
        <span className="text-[10px] text-t-secondary">
          · {stage.inquiries_count} deals
        </span>
      )}
      <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white"
        >
          <Edit3 size={11} />
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete stage "${stage.name}"? Any deals on it move to the first open stage.`)) {
              remove.mutate()
            }
          }}
          className="p-1 rounded hover:bg-red-500/15 text-t-secondary hover:text-red-400"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

function NewStageRow({ pipelineId, onClose, onAdded }: {
  pipelineId: number
  onClose: () => void
  onAdded: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'open' | 'won' | 'lost'>('open')
  const [color, setColor] = useState('#3b82f6')
  const [winProb, setWinProb] = useState('')

  const create = useMutation({
    mutationFn: () => api.post(`/v1/admin/pipelines/${pipelineId}/stages`, {
      name,
      kind,
      color,
      default_win_probability: winProb === '' ? null : parseInt(winProb, 10),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pipelines'] })
      toast.success('Stage added')
      onAdded()
    },
    onError: () => toast.error('Failed'),
  })

  return (
    <div className="bg-dark-bg border border-accent/40 rounded-md p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Stage name"
          autoFocus
          className="flex-1 bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-sm outline-none focus:border-accent"
        />
        <input
          type="number"
          min="0"
          max="100"
          value={winProb}
          onChange={e => setWinProb(e.target.value)}
          placeholder="%"
          className="w-16 bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-sm text-center outline-none focus:border-accent"
        />
      </div>
      <div className="flex items-center gap-1.5">
        {(['open', 'won', 'lost'] as const).map(k => {
          const m = KIND_META[k]
          const Icon = m.icon
          const active = kind === k
          return (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold border ${
                active ? 'text-black' : 'text-t-secondary border-dark-border hover:bg-dark-surface2'
              }`}
              style={active ? { background: m.color, borderColor: m.color } : {}}
            >
              <Icon size={10} />
              {m.label}
            </button>
          )
        })}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {STAGE_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-4 h-4 rounded-full transition ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-bg' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-1.5">
        <button onClick={onClose} className="px-3 py-1 text-xs text-t-secondary hover:text-white">
          Cancel
        </button>
        <button
          onClick={() => create.mutate()}
          disabled={!name.trim() || create.isPending}
          className="bg-accent text-black font-bold rounded-md px-3 py-1 text-xs disabled:opacity-50 hover:bg-accent/90"
        >
          Add
        </button>
      </div>
    </div>
  )
}

/* ── New pipeline modal ─────────────────────────────────────── */

function NewPipelineModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () => api.post('/v1/admin/pipelines', { name, description }),
    onSuccess: () => {
      toast.success('Pipeline created with default stages')
      onCreated()
    },
    onError: () => toast.error('Failed'),
  })

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark-surface border border-dark-border rounded-xl p-5 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-1">New pipeline</h3>
        <p className="text-xs text-t-secondary mb-4">
          Pipeline starts with the canonical 8 stages — rename or delete what you don't need.
        </p>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name (e.g. MICE & Group Sales)"
          autoFocus
          className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent mb-3"
        />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional — what kind of deals belong here?"
          rows={2}
          className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent resize-none mb-4"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-t-secondary hover:text-white">
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="bg-accent text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 hover:bg-accent/90"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Lost reasons editor ────────────────────────────────────── */

function LostReasonsEditor({ reasons }: { reasons: LostReason[] }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  const add = useMutation({
    mutationFn: () => api.post('/v1/admin/inquiry-lost-reasons', { label: newLabel }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-lost-reasons'] })
      toast.success('Added')
      setNewLabel('')
      setAdding(false)
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/inquiry-lost-reasons/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-lost-reasons'] })
      const data = (res as any).data
      toast.success(data?.soft_deleted ? data.message : 'Removed')
    },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/v1/admin/inquiry-lost-reasons/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-lost-reasons'] }),
  })

  return (
    <div className="bg-dark-bg border border-dark-border rounded-lg p-3 space-y-1.5">
      {reasons.length === 0 ? (
        <p className="text-xs text-t-secondary italic py-3 text-center">
          No reasons defined yet.
        </p>
      ) : reasons.map(r => (
        <ReasonRow
          key={r.id}
          reason={r}
          onToggle={() => toggleActive.mutate({ id: r.id, is_active: !r.is_active })}
          onDelete={() => {
            if (window.confirm(`Delete reason "${r.label}"?`)) remove.mutate(r.id)
          }}
        />
      ))}
      {adding ? (
        <div className="flex items-center gap-2 pt-1">
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Reason label"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && newLabel.trim()) add.mutate() }}
            className="flex-1 bg-dark-surface border border-dark-border rounded-md px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={() => add.mutate()}
            disabled={!newLabel.trim() || add.isPending}
            className="bg-accent text-black font-bold rounded-md px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-accent/90"
          >
            Add
          </button>
          <button onClick={() => { setAdding(false); setNewLabel('') }} className="p-1.5 text-t-secondary hover:text-white">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs text-t-secondary hover:text-white hover:bg-dark-surface2 border border-dashed border-dark-border"
        >
          <Plus size={12} /> Add reason
        </button>
      )}
    </div>
  )
}

function ReasonRow({ reason, onToggle, onDelete }: {
  reason: LostReason
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className={`group flex items-center gap-2 px-2 py-1.5 rounded ${reason.is_active ? '' : 'opacity-50'}`}>
      <span className={`text-sm flex-1 ${reason.is_active ? 'text-white' : 'text-t-secondary line-through'}`}>
        {reason.label}
      </span>
      {reason.inquiries_count > 0 && (
        <span className="text-[10px] text-t-secondary">{reason.inquiries_count} uses</span>
      )}
      <button
        onClick={onToggle}
        className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded border opacity-0 group-hover:opacity-100 transition text-t-secondary hover:text-white border-dark-border"
      >
        {reason.is_active ? 'Hide' : 'Activate'}
      </button>
      <button
        onClick={onDelete}
        className="p-1 rounded hover:bg-red-500/15 text-t-secondary hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

/* ── Field layout editor ────────────────────────────────────── */

const FORM_FIELDS: Array<{ key: keyof InquiryFieldConfig['form']; label: string; group: 'main' | 'advanced' }> = [
  { key: 'check_in',         label: 'Check-in',         group: 'main' },
  { key: 'check_out',        label: 'Check-out',        group: 'main' },
  { key: 'num_rooms',        label: 'Rooms',            group: 'main' },
  { key: 'inquiry_type',     label: 'Inquiry type',     group: 'main' },
  { key: 'source',           label: 'Source',           group: 'advanced' },
  { key: 'room_type',        label: 'Room type',        group: 'advanced' },
  { key: 'rate_offered',     label: 'Rate',             group: 'advanced' },
  { key: 'total_value',      label: 'Total value',      group: 'advanced' },
  { key: 'status',           label: 'Status',           group: 'advanced' },
  { key: 'priority',         label: 'Priority',         group: 'advanced' },
  { key: 'assigned_to',      label: 'Assigned to',      group: 'advanced' },
  { key: 'special_requests', label: 'Special requests', group: 'advanced' },
  { key: 'notes',            label: 'Notes',            group: 'advanced' },
]

const LIST_COLUMNS: Array<{ key: keyof InquiryFieldConfig['list']; label: string; hint?: string }> = [
  { key: 'bulk_select', label: 'Bulk-select column', hint: 'Checkbox to multi-select rows for bulk actions. Off by default — turn on if your team uses bulk owner reassign / status changes.' },
  { key: 'stay',        label: 'Stay (dates · nights · rooms)' },
  { key: 'value',       label: 'Value (€)' },
  { key: 'owner',       label: 'Owner' },
  { key: 'touches',     label: 'Touches' },
  { key: 'next_task',   label: 'Next task' },
]

function FieldLayoutEditor() {
  const qc = useQueryClient()
  const settings = useSettings()
  // Local working copy so toggles feel immediate; we save on user click
  // rather than per-toggle to keep the API calls cheap.
  const [draft, setDraft] = useState<InquiryFieldConfig>(settings.inquiry_fields)
  const [dirty, setDirty] = useState(false)

  // Re-sync when the upstream settings change (e.g. after our own save).
  useEffect(() => { setDraft(settings.inquiry_fields); setDirty(false) }, [settings.inquiry_fields])

  const save = useMutation({
    mutationFn: () => api.put('/v1/admin/crm-settings/inquiry_fields', { value: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-settings'] })
      toast.success('Layout saved')
      setDirty(false)
    },
    onError: () => toast.error('Save failed'),
  })

  const reset = () => {
    setDraft(DEFAULT_INQUIRY_FIELDS)
    setDirty(true)
  }

  const toggleForm = (key: keyof InquiryFieldConfig['form']) => {
    setDraft(d => ({ ...d, form: { ...d.form, [key]: !d.form[key] } }))
    setDirty(true)
  }
  const toggleList = (key: keyof InquiryFieldConfig['list']) => {
    setDraft(d => ({ ...d, list: { ...d.list, [key]: !d.list[key] } }))
    setDirty(true)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <LayoutGrid size={16} className="text-cyan-400" /> Pipeline layout
          </h2>
          <p className="text-xs text-t-secondary mt-1">
            Pick which fields appear on Add Inquiry and which columns show in the leads list.
            Guest, Property, Status and Actions are always shown.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="text-xs text-t-secondary hover:text-white px-2 py-1 rounded hover:bg-dark-surface2"
          >
            Reset to defaults
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="flex items-center gap-1.5 bg-accent text-black font-bold rounded-md px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-accent/90"
          >
            <Save size={12} />
            {save.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Add Inquiry form */}
        <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-t-secondary mb-2">
            Add Inquiry form
          </h3>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-t-secondary/70 px-2 pt-1">Main</div>
            {FORM_FIELDS.filter(f => f.group === 'main').map(f => (
              <ToggleRow
                key={f.key}
                label={f.label}
                on={draft.form[f.key]}
                onToggle={() => toggleForm(f.key)}
              />
            ))}
            <div className="text-[10px] uppercase tracking-wide text-t-secondary/70 px-2 pt-2">Advanced</div>
            {FORM_FIELDS.filter(f => f.group === 'advanced').map(f => (
              <ToggleRow
                key={f.key}
                label={f.label}
                on={draft.form[f.key]}
                onToggle={() => toggleForm(f.key)}
              />
            ))}
          </div>
        </div>

        {/* Leads list columns */}
        <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-t-secondary mb-2">
            Leads list columns
          </h3>
          <div className="space-y-1">
            {LIST_COLUMNS.map(c => (
              <ToggleRow
                key={c.key}
                label={c.label}
                hint={c.hint}
                on={draft.list[c.key]}
                onToggle={() => toggleList(c.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ label, hint, on, onToggle }: {
  label: string
  hint?: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition ${
        on ? 'hover:bg-emerald-500/5' : 'hover:bg-dark-surface2 opacity-60'
      }`}
    >
      <div className={`mt-0.5 w-7 h-4 rounded-full p-0.5 flex-shrink-0 transition ${on ? 'bg-emerald-500/80' : 'bg-dark-surface2'}`}>
        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${on ? 'translate-x-3' : ''}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {on ? <Eye size={11} className="text-emerald-400 flex-shrink-0" /> : <EyeOff size={11} className="text-t-secondary flex-shrink-0" />}
          <span className={`text-xs font-semibold ${on ? 'text-white' : 'text-t-secondary'}`}>{label}</span>
        </div>
        {hint && <p className="text-[10px] text-t-secondary mt-0.5 leading-snug">{hint}</p>}
      </div>
    </button>
  )
}
