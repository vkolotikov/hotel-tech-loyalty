import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Building2, Sparkles, Stethoscope, Scale, Home, GraduationCap, Dumbbell, Utensils, Briefcase,
  CheckCircle2, X, Star, Zap, Info, Plus, Trash2, Edit2, Save, ListChecks,
  Users, ChevronUp, ChevronDown,
} from 'lucide-react'
import {
  ICON_OPTIONS, COLOR_OPTIONS, TASK_GROUP_META, CUSTOM_GROUP_META,
  parsePlannerGroups, parsePlannerChannels, parseEmployeePrefs, getIcon,
  type ChannelDef, type GroupMeta, type EmployeePref,
} from '../lib/plannerMeta'

/**
 * Settings → Planner tab. Three sections:
 *
 *   1. "Quick setup by industry" card — mirrors the Pipelines tab's
 *      `IndustryPresetPicker`, but seeds planner groups + the
 *      org-wide template library instead of pipeline stages.
 *   2. Task groups editor — the list shown as the icon-tab row in
 *      Schedule / Day / Month views. Add / remove / rename.
 *   3. Task templates editor — the org-wide library used from
 *      "Use a template" in the New Task drawer. Full CRUD.
 *
 * Storage:
 *   • Groups → CrmSetting('planner_groups') as JSON array. Read +
 *     written through the generic /v1/admin/crm-settings/{key}
 *     endpoint, so no schema migration needed.
 *   • Templates → planner_templates table via the Phase v2 CRUD
 *     endpoints under /v1/admin/planner/templates.
 */

const PRESET_ICONS: Record<string, any> = {
  'building-2':     Building2,
  'sparkles':       Sparkles,
  'stethoscope':    Stethoscope,
  'scale':          Scale,
  'home':           Home,
  'graduation-cap': GraduationCap,
  'dumbbell':       Dumbbell,
  'utensils':       Utensils,
  'briefcase':      Briefcase,
}

/**
 * Helper: resolve a group's icon + color given the customisation map
 * pulled from settings. Order: custom override → built-in → fallback.
 * Wraps the shared `lib/plannerMeta` helpers so the editor stays in
 * sync with whatever the live planner renders.
 */
function metaFor(name: string, custom: Record<string, GroupMeta>): GroupMeta {
  return custom[name] ?? TASK_GROUP_META[name] ?? CUSTOM_GROUP_META
}

interface PlannerPreset {
  key: string
  label: string
  description: string
  icon: string
  group_count: number
  template_count: number
  groups: string[]
  is_current: boolean
}
interface PresetsResponse { presets: PlannerPreset[]; current: string | null }

interface Template {
  id: number
  name: string
  title: string
  category: string
  task_group: string | null
  task_category: string | null
  priority: string
  duration_minutes: number | null
  description: string | null
  sort_order: number
}

export function PlannerSettings() {
  return (
    <div className="space-y-6">
      <PresetPicker />
      <GroupsEditor />
      <ChannelsEditor />
      <EmployeesEditor />
      <TemplatesEditor />
    </div>
  )
}

/* ─────────────────────── Industry preset picker ─────────────────────── */

function PresetPicker() {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState<PlannerPreset | null>(null)

  const { data } = useQuery<PresetsResponse>({
    queryKey: ['planner-presets'],
    queryFn: () => api.get('/v1/admin/planner-presets').then(r => r.data),
  })

  const apply = useMutation({
    mutationFn: (key: string) => api.post('/v1/admin/planner-presets/apply', { preset: key }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['planner-presets'] })
      qc.invalidateQueries({ queryKey: ['crm-settings'] })
      qc.invalidateQueries({ queryKey: ['planner-templates'] })
      toast.success(res.data?.message ?? 'Preset applied')
      setConfirming(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not apply preset'),
  })

  if (!data) return null
  const currentLabel = data.presets.find(p => p.is_current)?.label ?? 'Custom'

  return (
    <div className="bg-gradient-to-br from-amber-500/10 via-purple-500/[0.05] to-cyan-500/10 border border-amber-500/30 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-amber-300" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Quick setup by industry</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-2xl leading-snug">
              One click seeds the task groups + starter template library that fit how your industry runs daily.
              Existing tasks keep their group; templates you've authored stay untouched.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-dark-bg border border-dark-border">
          <Star size={11} className="text-amber-300 fill-amber-300" />
          <span className="text-gray-500">Currently:</span>
          <span className="text-white font-bold">{currentLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {data.presets.map(p => {
          const Icon = PRESET_ICONS[p.icon] ?? Briefcase
          return (
            <button
              key={p.key}
              onClick={() => setConfirming(p)}
              className={`text-left rounded-lg border p-2.5 transition group ${
                p.is_current
                  ? 'border-amber-500/50 bg-amber-500/[0.06] cursor-default'
                  : 'border-dark-border bg-dark-bg hover:border-amber-500/40 hover:bg-amber-500/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
                  p.is_current ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-purple-500/15 border border-purple-500/30 group-hover:scale-110 transition'
                }`}>
                  <Icon size={13} className={p.is_current ? 'text-amber-300' : 'text-purple-300'} />
                </div>
                <p className="text-sm font-bold text-white truncate flex-1">{p.label}</p>
                {p.is_current && <CheckCircle2 size={13} className="text-amber-400 flex-shrink-0" />}
              </div>
              <p className="text-[10px] text-gray-500 leading-snug line-clamp-2 min-h-[24px]">{p.description}</p>
              <div className="flex items-center gap-2 mt-1.5 text-[9px] text-gray-500 uppercase tracking-wide font-bold">
                <span>{p.group_count} groups</span>
                <span>·</span>
                <span className="text-purple-300">{p.template_count} templates</span>
              </div>
            </button>
          )
        })}
      </div>

      {confirming && (
        <ConfirmModal
          preset={confirming}
          isCurrent={confirming.is_current}
          onCancel={() => setConfirming(null)}
          onConfirm={() => apply.mutate(confirming.key)}
          applying={apply.isPending}
        />
      )}
    </div>
  )
}

function ConfirmModal({ preset, isCurrent, onCancel, onConfirm, applying }: {
  preset: PlannerPreset
  isCurrent: boolean
  onCancel: () => void
  onConfirm: () => void
  applying: boolean
}) {
  const Icon = PRESET_ICONS[preset.icon] ?? Briefcase
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={applying ? undefined : onCancel}>
      <div className="bg-dark-surface border border-dark-border rounded-xl p-5 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
              <Icon size={18} className="text-purple-300" />
            </div>
            <h3 className="text-lg font-bold text-white">Apply {preset.label}?</h3>
          </div>
          <button onClick={onCancel} disabled={applying} className="p-1.5 rounded hover:bg-dark-surface2 text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          {isCurrent
            ? <>This is your current preset. Re-applying restores the canonical groups for {preset.label} and tops up any missing starter templates.</>
            : <>One click reshapes the Planner for <span className="text-white font-semibold">{preset.label}</span>. You can switch back any time — your tasks stay.</>}
        </p>

        <div className="bg-dark-bg border border-dark-border rounded-lg p-3 space-y-2 mb-4">
          <p className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1">What changes</p>
          <ChangeRow label={`Task groups → ${preset.groups.join(' · ')}`} />
          <ChangeRow label={`+${preset.template_count} starter templates`} accent />
        </div>

        <div className="bg-blue-500/[0.04] border border-blue-500/20 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <Info size={13} className="text-blue-300 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-blue-100/90 leading-relaxed">
              <p className="font-bold text-blue-200 mb-0.5">Your tasks are safe</p>
              Tasks already assigned to a group keep their <code>task_group</code> value even if the new
              preset doesn't list that group. Existing templates with the same name as a starter are
              skipped (not overwritten).
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={applying} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={onConfirm} disabled={applying} className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2">
            {applying ? 'Applying…' : <><Zap size={14} /> Apply preset</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangeRow({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <CheckCircle2 size={12} className={'mt-0.5 flex-shrink-0 ' + (accent ? 'text-purple-300' : 'text-emerald-400')} />
      <span className="text-white">{label}</span>
    </div>
  )
}

/* ─────────────────────── Groups editor ─────────────────────── */

/**
 * Local group-entry shape used while editing — the editor always
 * works against the enriched form. We serialise back to the same
 * enriched JSON on save; the planner's parse helper still accepts
 * the legacy string-array form so older orgs stay backward-compat.
 */
interface GroupEntry { name: string; icon?: string; color?: string }

function GroupsEditor() {
  const qc = useQueryClient()
  const [adding, setAdding] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState<number | null>(null)

  const { data: rawSettings } = useQuery<Record<string, any>>({
    queryKey: ['crm-settings'],
    queryFn: () => api.get('/v1/admin/crm-settings').then(r => r.data),
  })

  // Normalise the on-disk value into enriched entries. Legacy string
  // entries get filled in with the built-in meta (if known) or the
  // Sparkles fallback (if not), so the editor can render an icon
  // tile + color swatch for every row regardless of save format.
  const entries: GroupEntry[] = (() => {
    const raw = rawSettings?.planner_groups
    if (raw === undefined || raw === null) {
      return ['Front Office', 'Housekeeping', 'F&B', 'Sales', 'Events', 'Maintenance']
        .map(name => ({ name }))
    }
    const { names, custom } = parsePlannerGroups(raw)
    return names.map(name => {
      const m = custom[name] ?? TASK_GROUP_META[name] ?? CUSTOM_GROUP_META
      return {
        name,
        icon: m.iconKey ?? 'sparkles',
        color: m.color,
      }
    })
  })()

  // Persist back as enriched objects. The planner reads either form.
  const save = useMutation({
    mutationFn: (next: GroupEntry[]) => api.put('/v1/admin/crm-settings/planner_groups', {
      value: JSON.stringify(next),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-settings'] }); toast.success('Groups saved') },
    onError: () => toast.error('Could not save groups'),
  })

  const addGroup = () => {
    const v = adding.trim()
    if (!v) return
    if (entries.some(e => e.name === v)) { toast.error('Group already exists'); return }
    save.mutate([...entries, { name: v, icon: 'sparkles', color: '#94a3b8' }])
    setAdding('')
  }
  const removeGroup = (name: string) => {
    if (!confirm(`Remove "${name}" from the group list?\n\nTasks currently using this group keep their value; they just won't have a matching tab.`)) return
    save.mutate(entries.filter(x => x.name !== name))
  }
  const renameGroup = (idx: number, name: string) => {
    const v = name.trim()
    if (!v) return
    if (v !== entries[idx].name && entries.some(e => e.name === v)) { toast.error('Group already exists'); return }
    const next = [...entries]; next[idx] = { ...next[idx], name: v }
    save.mutate(next)
    setEditingIdx(null)
  }
  const setIcon = (idx: number, icon: string) => {
    const next = [...entries]; next[idx] = { ...next[idx], icon }
    save.mutate(next)
  }
  const setColor = (idx: number, color: string) => {
    const next = [...entries]; next[idx] = { ...next[idx], color }
    save.mutate(next)
  }
  const move = (idx: number, delta: number) => {
    const j = idx + delta
    if (j < 0 || j >= entries.length) return
    const next = [...entries]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    save.mutate(next)
  }

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><ListChecks size={14} /> Task groups</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">The icon-tab row in Schedule / Day / Month views. Click the icon tile to pick a custom icon + color — saves immediately.</p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        {entries.map((entry, idx) => {
          const Icon = getIcon(entry.icon)
          const color = entry.color ?? '#94a3b8'
          const editing = editingIdx === idx
          const open = pickerOpen === idx
          return (
            <div key={entry.name} className="bg-dark-bg border border-dark-border rounded-md">
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <button
                  onClick={() => setPickerOpen(open ? null : idx)}
                  title="Change icon / color"
                  className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 hover:ring-2 hover:ring-primary-500/40 transition"
                  style={{ backgroundColor: color + '25', color }}>
                  <Icon size={14} />
                </button>
                {editing ? (
                  <input
                    autoFocus
                    defaultValue={entry.name}
                    onBlur={e => renameGroup(idx, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameGroup(idx, (e.target as HTMLInputElement).value)
                      if (e.key === 'Escape') setEditingIdx(null)
                    }}
                    className="flex-1 bg-transparent border-b border-primary-500 text-sm text-white px-1 outline-none"
                  />
                ) : (
                  <span className="flex-1 text-sm text-white">{entry.name}</span>
                )}
                <div className="flex items-center gap-0.5 text-gray-500">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0}
                    className="p-1 rounded hover:bg-dark-surface2 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs">▲</button>
                  <button onClick={() => move(idx, 1)} disabled={idx === entries.length - 1}
                    className="p-1 rounded hover:bg-dark-surface2 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs">▼</button>
                  <button onClick={() => setEditingIdx(idx)} className="p-1 rounded hover:bg-dark-surface2 hover:text-white"><Edit2 size={12} /></button>
                  <button onClick={() => removeGroup(entry.name)} className="p-1 rounded hover:bg-red-500/15 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              </div>
              {open && (
                <IconColorPicker
                  selectedIcon={entry.icon ?? 'sparkles'}
                  selectedColor={color}
                  onIcon={(k) => setIcon(idx, k)}
                  onColor={(c) => setColor(idx, c)}
                  onClose={() => setPickerOpen(null)}
                />
              )}
            </div>
          )
        })}
        {entries.length === 0 && (
          <p className="text-xs text-gray-500 italic py-4 text-center">No groups yet. Add one below or apply an industry preset above.</p>
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); addGroup() }} className="flex gap-2">
        <input
          value={adding}
          onChange={e => setAdding(e.target.value)}
          placeholder="Add a new group (e.g. Concierge)"
          className="flex-1 bg-dark-bg border border-dark-border rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500"
        />
        <button type="submit" disabled={!adding.trim() || save.isPending}
          className="bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-md px-3 py-1.5 text-sm disabled:opacity-50 flex items-center gap-1.5">
          <Plus size={13} /> Add
        </button>
      </form>
    </div>
  )
}

/**
 * Inline icon + color picker. Rendered below the group row when its
 * icon tile is clicked. Saves on every selection (no separate "save"
 * step) so the planner reflects the change immediately.
 */
function IconColorPicker({ selectedIcon, selectedColor, onIcon, onColor, onClose }: {
  selectedIcon: string
  selectedColor: string
  onIcon: (k: string) => void
  onColor: (c: string) => void
  onClose: () => void
}) {
  return (
    <div className="border-t border-dark-border bg-dark-surface/50 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wide font-bold text-gray-500">Icon</span>
        <button onClick={onClose} className="text-gray-600 hover:text-white text-[10px]">Close</button>
      </div>
      <div className="grid grid-cols-8 sm:grid-cols-12 gap-1 mb-3">
        {Object.entries(ICON_OPTIONS).map(([key, Icon]) => {
          const active = key === selectedIcon
          return (
            <button key={key} type="button" onClick={() => onIcon(key)}
              title={key}
              className={'w-7 h-7 rounded-md flex items-center justify-center transition ' +
                (active ? 'ring-2 ring-primary-500 bg-primary-500/15' : 'text-gray-400 hover:bg-dark-surface2 hover:text-white')}>
              <Icon size={13} />
            </button>
          )
        })}
      </div>
      <span className="text-[10px] uppercase tracking-wide font-bold text-gray-500 block mb-1.5">Color</span>
      <div className="flex flex-wrap gap-1">
        {COLOR_OPTIONS.map(c => {
          const active = c.toLowerCase() === selectedColor.toLowerCase()
          return (
            <button key={c} type="button" onClick={() => onColor(c)}
              title={c}
              className={'w-6 h-6 rounded-md transition ' + (active ? 'ring-2 ring-white' : 'hover:scale-110')}
              style={{ backgroundColor: c }} />
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────────────── Channels editor ─────────────────────── */

/**
 * Communication channels surfaced as the "Channel" picker in the
 * Planner's New-task drawer. Org-wide, optional, defaults to the
 * 6 starter channels (Call / Email / WhatsApp / SMS / Video /
 * In-person). Stored in crm_settings.planner_channels as an array
 * of { key, label, icon, color } objects.
 */
function ChannelsEditor() {
  const qc = useQueryClient()
  const [adding, setAdding] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState<number | null>(null)

  const { data: rawSettings } = useQuery<Record<string, any>>({ queryKey: ['crm-settings'] })
  const channels: ChannelDef[] = parsePlannerChannels(rawSettings?.planner_channels)
  const { names: groupNames } = parsePlannerGroups(rawSettings?.planner_groups)

  const save = useMutation({
    mutationFn: (next: ChannelDef[]) => api.put('/v1/admin/crm-settings/planner_channels', {
      value: JSON.stringify(next),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-settings'] }); toast.success('Tasks saved') },
    onError: () => toast.error('Could not save tasks'),
  })

  // Slugify label → key. Keeps existing keys stable on rename so
  // saved task_category values don't suddenly stop matching.
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'channel'

  const addChannel = () => {
    const v = adding.trim()
    if (!v) return
    const key = slugify(v)
    if (channels.some(c => c.key === key || c.label.toLowerCase() === v.toLowerCase())) {
      toast.error('Task already exists'); return
    }
    save.mutate([...channels, { key, label: v, icon: 'clipboard-list', color: '#94a3b8', groups: [] }])
    setAdding('')
  }
  const removeChannel = (key: string) => {
    if (!confirm(`Remove this task?\n\nPlanner tasks already tagged with it keep their value; it just disappears from the picker.`)) return
    save.mutate(channels.filter(c => c.key !== key))
  }
  const renameChannel = (idx: number, label: string) => {
    const v = label.trim()
    if (!v) return
    if (v !== channels[idx].label && channels.some(c => c.label.toLowerCase() === v.toLowerCase())) {
      toast.error('Task already exists'); return
    }
    const next = [...channels]; next[idx] = { ...next[idx], label: v }
    save.mutate(next)
    setEditingIdx(null)
  }
  const setIcon = (idx: number, icon: string) => {
    const next = [...channels]; next[idx] = { ...next[idx], icon }
    save.mutate(next)
  }
  const setColor = (idx: number, color: string) => {
    const next = [...channels]; next[idx] = { ...next[idx], color }
    save.mutate(next)
  }
  // Toggle a group tag on a task. Empty groups = the task shows under every
  // group in the New-task drawer; otherwise only under the tagged groups.
  const toggleGroup = (idx: number, group: string) => {
    const cur = channels[idx].groups ?? []
    const groups = cur.includes(group) ? cur.filter(g => g !== group) : [...cur, group]
    const next = [...channels]; next[idx] = { ...next[idx], groups }
    save.mutate(next)
  }
  const move = (idx: number, delta: number) => {
    const j = idx + delta
    if (j < 0 || j >= channels.length) return
    const next = [...channels]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    save.mutate(next)
  }

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><CheckCircle2 size={14} /> Tasks</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">The task picker in the New task drawer. Tag each task to the groups it belongs to (leave untagged = shows under every group). Click the icon tile to customise; rename inline.</p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        {channels.map((c, idx) => {
          const Icon = getIcon(c.icon)
          const editing = editingIdx === idx
          const open = pickerOpen === idx
          return (
            <div key={c.key} className="bg-dark-bg border border-dark-border rounded-md">
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <button
                  onClick={() => setPickerOpen(open ? null : idx)}
                  title="Change icon / color"
                  className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 hover:ring-2 hover:ring-primary-500/40 transition"
                  style={{ backgroundColor: c.color + '25', color: c.color }}>
                  <Icon size={14} />
                </button>
                {editing ? (
                  <input
                    autoFocus
                    defaultValue={c.label}
                    onBlur={e => renameChannel(idx, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameChannel(idx, (e.target as HTMLInputElement).value)
                      if (e.key === 'Escape') setEditingIdx(null)
                    }}
                    className="flex-1 bg-transparent border-b border-primary-500 text-sm text-white px-1 outline-none"
                  />
                ) : (
                  <span className="flex-1 text-sm text-white">{c.label}</span>
                )}
                <span className="text-[10px] text-gray-600 font-mono px-1.5 py-0.5 bg-dark-surface2 rounded border border-dark-border" title="Stable key (used in task_category)">
                  {c.key}
                </span>
                <div className="flex items-center gap-0.5 text-gray-500">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0}
                    className="p-1 rounded hover:bg-dark-surface2 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs">▲</button>
                  <button onClick={() => move(idx, 1)} disabled={idx === channels.length - 1}
                    className="p-1 rounded hover:bg-dark-surface2 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs">▼</button>
                  <button onClick={() => setEditingIdx(idx)} className="p-1 rounded hover:bg-dark-surface2 hover:text-white"><Edit2 size={12} /></button>
                  <button onClick={() => removeChannel(c.key)} className="p-1 rounded hover:bg-red-500/15 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              </div>
              {groupNames.length > 0 && (
                <div className="px-2.5 pb-2 pt-0.5 flex flex-wrap items-center gap-1 border-t border-dark-border/60">
                  <span className="text-[10px] text-gray-600 mr-1">Groups:</span>
                  {groupNames.map(g => {
                    const on = (c.groups ?? []).includes(g)
                    return (
                      <button key={g} type="button" onClick={() => toggleGroup(idx, g)}
                        className={'text-[10px] px-2 py-0.5 rounded-full border transition ' +
                          (on ? 'bg-primary-500/20 border-primary-500 text-primary-200'
                              : 'border-dark-border text-gray-500 hover:text-white hover:border-gray-500')}>
                        {g}
                      </button>
                    )
                  })}
                  {(c.groups ?? []).length === 0 && (
                    <span className="text-[10px] text-gray-600 italic">all groups</span>
                  )}
                </div>
              )}
              {open && (
                <IconColorPicker
                  selectedIcon={c.icon}
                  selectedColor={c.color}
                  onIcon={(k) => setIcon(idx, k)}
                  onColor={(col) => setColor(idx, col)}
                  onClose={() => setPickerOpen(null)}
                />
              )}
            </div>
          )
        })}
        {channels.length === 0 && (
          <p className="text-xs text-gray-500 italic py-4 text-center">No tasks yet. Add your first one below, then tag it to the groups it belongs to.</p>
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); addChannel() }} className="flex gap-2">
        <input
          value={adding}
          onChange={e => setAdding(e.target.value)}
          placeholder="Add a new task (e.g. Cold call, Site visit)"
          className="flex-1 bg-dark-bg border border-dark-border rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500"
        />
        <button type="submit" disabled={!adding.trim() || save.isPending}
          className="bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-md px-3 py-1.5 text-sm disabled:opacity-50 flex items-center gap-1.5">
          <Plus size={13} /> Add
        </button>
      </form>
    </div>
  )
}

/* ─────────────────────── Employees editor ─────────────────────── */

/**
 * Per-employee preferred task groups + tasks. Soft preference only — any
 * employee can still be assigned anything; preferred items get highlighted
 * in the New-task drawer when that employee is selected (and will feed AI
 * task assignment later). Keyed by employee NAME (matches the drawer's
 * Assign-to list, settings.employees); stored in crm_settings.planner_employee_prefs.
 */
function EmployeesEditor() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data: rawSettings } = useQuery<Record<string, any>>({ queryKey: ['crm-settings'] })

  const parseEmployees = (raw: any): string[] => {
    let p = raw
    if (typeof raw === 'string') { try { p = JSON.parse(raw) } catch { p = [] } }
    return Array.isArray(p) ? p.filter((x: any) => typeof x === 'string' && x.trim()) : []
  }
  const employees = parseEmployees(rawSettings?.employees)
  const { names: groupNames } = parsePlannerGroups(rawSettings?.planner_groups)
  const tasks = parsePlannerChannels(rawSettings?.planner_channels)
  const prefs = parseEmployeePrefs(rawSettings?.planner_employee_prefs)

  const save = useMutation({
    mutationFn: (next: Record<string, EmployeePref>) => api.put('/v1/admin/crm-settings/planner_employee_prefs', {
      value: JSON.stringify(next),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-settings'] }); toast.success('Employee preferences saved') },
    onError: () => toast.error('Could not save preferences'),
  })

  const toggle = (emp: string, kind: 'groups' | 'tasks', val: string) => {
    const cur = prefs[emp] ?? { groups: [], tasks: [] }
    const arr = cur[kind]
    const nextArr = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
    save.mutate({ ...prefs, [emp]: { ...cur, [kind]: nextArr } })
  }

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2"><Users size={14} /> Employee skills</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">Mark the task groups + tasks that best fit each employee. They can still be assigned anything — preferred items are highlighted in the New-task drawer when that employee is selected.</p>
      </div>

      {employees.length === 0 ? (
        <p className="text-xs text-gray-500 italic py-4 text-center">No employees in the assign-to list yet. Add team members (Settings → Team), then mark their preferred tasks here.</p>
      ) : (
        <div className="space-y-1.5">
          {employees.map(emp => {
            const p = prefs[emp] ?? { groups: [], tasks: [] }
            const open = expanded === emp
            const count = p.groups.length + p.tasks.length
            return (
              <div key={emp} className="bg-dark-bg border border-dark-border rounded-md">
                <button onClick={() => setExpanded(open ? null : emp)} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
                  <span className="w-7 h-7 rounded-full bg-primary-500/15 text-primary-300 flex items-center justify-center text-xs font-bold flex-shrink-0">{emp.charAt(0).toUpperCase()}</span>
                  <span className="flex-1 text-sm text-white">{emp}</span>
                  {count > 0 && <span className="text-[10px] text-amber-300/80">{count} preferred</span>}
                  {open ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
                </button>
                {open && (
                  <div className="border-t border-dark-border px-3 py-2.5 space-y-3">
                    <div>
                      <span className="text-[10px] uppercase tracking-wide font-bold text-gray-500 block mb-1.5">Task groups</span>
                      {groupNames.length === 0 ? (
                        <span className="text-[10px] text-gray-600 italic">No groups defined.</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {groupNames.map(g => {
                            const on = p.groups.includes(g)
                            return (
                              <button key={g} type="button" onClick={() => toggle(emp, 'groups', g)}
                                className={'text-[10px] px-2 py-0.5 rounded-full border transition ' +
                                  (on ? 'bg-amber-400/20 border-amber-400 text-amber-200' : 'border-dark-border text-gray-500 hover:text-white hover:border-gray-500')}>
                                {g}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wide font-bold text-gray-500 block mb-1.5">Tasks</span>
                      {tasks.length === 0 ? (
                        <span className="text-[10px] text-gray-600 italic">No tasks defined yet (add some in the Tasks section above).</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tasks.map(tk => {
                            const on = p.tasks.includes(tk.key)
                            return (
                              <button key={tk.key} type="button" onClick={() => toggle(emp, 'tasks', tk.key)}
                                className={'text-[10px] px-2 py-0.5 rounded-full border transition ' +
                                  (on ? 'bg-amber-400/20 border-amber-400 text-amber-200' : 'border-dark-border text-gray-500 hover:text-white hover:border-gray-500')}>
                                {tk.label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────── Templates editor ─────────────────────── */

function TemplatesEditor() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['planner-templates'],
    queryFn: () => api.get('/v1/admin/planner/templates').then(r => r.data),
  })

  // Pull crm-settings for the group-icon resolution below — same
  // cached query the rest of the editor uses, no extra fetch. Hoist
  // the customisation map once so we don't re-parse per row.
  const { data: rawSettingsForTemplates } = useQuery<Record<string, any>>({ queryKey: ['crm-settings'] })
  const { custom: customGroupMeta } = parsePlannerGroups(rawSettingsForTemplates?.planner_groups)

  const del = useMutation({
    mutationFn: (id: number) => api.delete('/v1/admin/planner/templates/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner-templates'] }); toast.success('Template deleted') },
  })

  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    const k = t.category || 'General'
    ;(acc[k] ||= []).push(t)
    return acc
  }, {})

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Briefcase size={14} /> Task templates</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Reusable shortcuts shown in the "Use a template" picker inside the New Task drawer.</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-md px-3 py-1.5 text-xs flex items-center gap-1.5">
          <Plus size={12} /> New template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-xs text-gray-500 italic py-6 text-center">No templates yet. Add one or apply an industry preset above.</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{cat}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {items.map(t => {
                  const meta = t.task_group ? metaFor(t.task_group, customGroupMeta) : null
                  const Icon = meta?.icon
                  return (
                    <div key={t.id} className="flex items-center gap-2 bg-dark-bg border border-dark-border rounded-md px-2.5 py-1.5">
                      {Icon && (
                        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: meta!.color + '25', color: meta!.color }}>
                          <Icon size={13} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{t.name}</div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-2">
                          {t.task_group && <span>{t.task_group}</span>}
                          {t.duration_minutes && <span>· {t.duration_minutes}m</span>}
                          {t.priority && t.priority !== 'Normal' && <span>· {t.priority}</span>}
                        </div>
                      </div>
                      <button onClick={() => setEditing(t)} className="p-1 rounded text-gray-500 hover:bg-dark-surface2 hover:text-white"><Edit2 size={12} /></button>
                      <button onClick={() => { if (confirm(`Delete template "${t.name}"?`)) del.mutate(t.id) }}
                        className="p-1 rounded text-gray-500 hover:bg-red-500/15 hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <TemplateForm
          initial={editing}
          onClose={() => { setEditing(null); setCreating(false) }}
        />
      )}
    </div>
  )
}

function TemplateForm({ initial, onClose }: { initial: Template | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    title: initial?.title ?? '',
    category: initial?.category ?? 'General',
    task_group: initial?.task_group ?? '',
    priority: initial?.priority ?? 'Normal',
    duration_minutes: initial?.duration_minutes ? String(initial.duration_minutes) : '',
    description: initial?.description ?? '',
  })

  /**
   * Pull live groups from settings so the dropdown reflects whatever
   * the admin just configured above without a page reload.
   */
  const { data: rawSettings } = useQuery<Record<string, any>>({ queryKey: ['crm-settings'] })
  // Use the shared parser so enriched + legacy group entries both
  // surface in the dropdown.
  const { names: groups } = parsePlannerGroups(rawSettings?.planner_groups)

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        task_group: form.task_group || null,
      }
      return initial
        ? api.put('/v1/admin/planner/templates/' + initial.id, payload)
        : api.post('/v1/admin/planner/templates', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner-templates'] })
      toast.success(initial ? 'Template updated' : 'Template created')
      onClose()
    },
    onError: () => toast.error('Could not save template'),
  })

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-surface border border-dark-border rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h3 className="text-lg font-bold text-white">{initial ? 'Edit template' : 'New template'}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-dark-surface2 text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        <form onSubmit={e => { e.preventDefault(); save.mutate() }} className="p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Template name</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Morning briefing"
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary-500" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Task title (pre-filled)</label>
            <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="What the task is called when applied"
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Category</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="General"
                className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Group</label>
              <select value={form.task_group} onChange={e => setForm(f => ({ ...f, task_group: e.target.value }))}
                className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary-500">
                <option value="">— None —</option>
                {groups.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary-500">
                {['Low', 'Normal', 'High'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Duration (min)</label>
              <input type="number" min="1" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                placeholder="30"
                className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary-500" />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              placeholder="Pre-filled task description"
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary-500 resize-none" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-dark-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={save.isPending || !form.name.trim() || !form.title.trim()}
              className="bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2">
              <Save size={13} /> {save.isPending ? 'Saving…' : initial ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
