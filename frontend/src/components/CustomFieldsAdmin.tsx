import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, Edit3, Sparkles, Stethoscope, Scale, Home,
  GraduationCap, Dumbbell, Utensils, Briefcase,
  Type, AlignLeft, Hash, Calendar, ChevronDown, ListChecks,
  CheckSquare, Mail, Phone, Globe, ChevronUp, Eye, EyeOff,
  Cake, AlertTriangle, MessageSquare, Tag, MapPin,
} from 'lucide-react'

/**
 * Settings → Pipelines fourth section. Per-entity custom-field
 * editor with industry presets at the top. Designed for non-technical
 * users — visual cards over selects, examples next to every field
 * type, one-click quick-adds for common fields, friendly empty states.
 */

const ENTITY_TABS: Array<{ key: 'inquiry' | 'guest' | 'corporate_account' | 'task'; label: string; hint: string }> = [
  { key: 'inquiry',           label: 'Leads / Inquiries',  hint: 'Shown on Add Inquiry + lead detail page.' },
  { key: 'guest',             label: 'Guests / Customers', hint: 'Shown on guest profiles and the inline guest-create form.' },
  { key: 'corporate_account', label: 'Companies',          hint: 'Shown on the company detail panel and create modal.' },
  { key: 'task',              label: 'Tasks',              hint: 'Shown on the task drawer create + edit form.' },
]

interface FieldTypeMeta {
  value: string
  label: string
  short: string
  example: string
  icon: any
  supportsOptions: boolean
}

const FIELD_TYPES: FieldTypeMeta[] = [
  { value: 'text',        label: 'Single line',  short: 'Text',     example: 'e.g. Sarah Williams',           icon: Type,         supportsOptions: false },
  { value: 'textarea',    label: 'Multi-line',   short: 'Long text', example: 'e.g. allergies, full notes…',  icon: AlignLeft,    supportsOptions: false },
  { value: 'number',      label: 'Number',       short: 'Number',   example: 'e.g. 25, 1500',                 icon: Hash,         supportsOptions: false },
  { value: 'date',        label: 'Date',         short: 'Date',     example: 'e.g. 1985-03-15',               icon: Calendar,     supportsOptions: false },
  { value: 'select',      label: 'Dropdown (one)','short': 'Select', example: 'pick one of: Hot · Warm · Cold', icon: ChevronDown,  supportsOptions: true  },
  { value: 'multiselect', label: 'Tag picker',   short: 'Tags',     example: 'pick many of a list',           icon: ListChecks,   supportsOptions: true  },
  { value: 'checkbox',    label: 'Yes / No',     short: 'Checkbox', example: 'on/off toggle',                 icon: CheckSquare,  supportsOptions: false },
  { value: 'email',       label: 'Email',        short: 'Email',    example: 'e.g. sarah@acme.com',           icon: Mail,         supportsOptions: false },
  { value: 'phone',       label: 'Phone',        short: 'Phone',    example: 'e.g. +49 30 1234 5678',         icon: Phone,        supportsOptions: false },
  { value: 'url',         label: 'Web link',     short: 'URL',      example: 'e.g. https://example.com',      icon: Globe,        supportsOptions: false },
]

const PRESET_ICONS: Record<string, any> = {
  sparkles: Sparkles, stethoscope: Stethoscope, scale: Scale,
  home: Home, 'graduation-cap': GraduationCap,
  dumbbell: Dumbbell, utensils: Utensils, briefcase: Briefcase,
}

/**
 * One-click quick-add chips. Saves a non-expert from picking a type
 * + writing a label + filling options. The chip just calls store
 * with sensible defaults.
 */
const QUICK_ADDS: Record<string, Array<{ label: string; type: string; icon: any; help_text?: string; config?: any }>> = {
  guest: [
    { label: 'Birthday',     type: 'date',  icon: Cake },
    { label: 'Allergies',    type: 'textarea', icon: AlertTriangle, help_text: 'Anything that affects what we serve / use.' },
    { label: 'Notes',        type: 'textarea', icon: MessageSquare },
    { label: 'Tags',         type: 'multiselect', icon: Tag, config: { options: ['VIP', 'Regular', 'New', 'Local', 'Tourist'] } },
    { label: 'Address',      type: 'textarea', icon: MapPin },
    { label: 'Website',      type: 'url',   icon: Globe },
  ],
  inquiry: [
    { label: 'Source detail', type: 'text', icon: Type },
    { label: 'Notes',         type: 'textarea', icon: MessageSquare },
    { label: 'Internal tags', type: 'multiselect', icon: Tag, config: { options: ['Hot lead', 'Repeat', 'Referral', 'Discount needed'] } },
    { label: 'Reference number', type: 'text', icon: Hash },
  ],
  corporate_account: [
    { label: 'Website',      type: 'url',   icon: Globe },
    { label: 'Year founded', type: 'number', icon: Calendar },
    { label: 'Headcount',    type: 'number', icon: Hash },
    { label: 'Tags',         type: 'multiselect', icon: Tag, config: { options: ['Strategic', 'Long-term', 'High volume'] } },
  ],
  task: [
    { label: 'Notes',        type: 'textarea', icon: MessageSquare },
    { label: 'Tags',         type: 'multiselect', icon: Tag, config: { options: ['Follow-up', 'Closed', 'Important'] } },
  ],
}

interface CustomFieldRow {
  id: number
  entity: string
  key: string
  label: string
  type: string
  config: { options?: string[] } | null
  help_text: string | null
  required: boolean
  is_active: boolean
  show_in_list: boolean
  sort_order: number
}

interface PresetMeta {
  key: string
  label: string
  description: string
  field_count: number
  icon: string
}

export function CustomFieldsAdmin() {
  const qc = useQueryClient()
  const [entity, setEntity] = useState<typeof ENTITY_TABS[number]['key']>('inquiry')
  const [adding, setAdding] = useState(false)

  const { data: fields, isLoading } = useQuery<CustomFieldRow[]>({
    queryKey: ['custom-fields-admin', entity],
    queryFn: () => api.get('/v1/admin/custom-fields', { params: { entity } }).then(r => r.data),
  })

  const { data: presets } = useQuery<PresetMeta[]>({
    queryKey: ['custom-field-presets'],
    queryFn: () => api.get('/v1/admin/custom-fields/presets').then(r => r.data),
  })

  // Per-entity counts so the tabs show "Leads (3)" without an extra fetch.
  const { data: allFields } = useQuery<CustomFieldRow[]>({
    queryKey: ['custom-fields-admin-all'],
    queryFn: () => api.get('/v1/admin/custom-fields').then(r => r.data),
  })
  const counts = (allFields ?? []).reduce<Record<string, number>>((acc, f) => {
    acc[f.entity] = (acc[f.entity] ?? 0) + 1
    return acc
  }, {})

  const applyPreset = useMutation({
    mutationFn: (key: string) => api.post('/v1/admin/custom-fields/apply-preset', { preset: key }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields-admin-all'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success(res.data?.message ?? 'Preset applied')
    },
    onError: () => toast.error('Could not apply preset'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/custom-fields/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields-admin-all'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success('Field deleted')
    },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/v1/admin/custom-fields/${id}`, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
    },
  })

  const toggleShowInList = useMutation({
    mutationFn: ({ id, show_in_list }: { id: number; show_in_list: boolean }) =>
      api.put(`/v1/admin/custom-fields/${id}`, { show_in_list }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success('List column updated')
    },
  })

  const reorder = useMutation({
    mutationFn: (orderedIds: number[]) => api.post('/v1/admin/custom-fields/reorder', {
      entity, order: orderedIds,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
    },
  })

  const moveField = (id: number, dir: -1 | 1) => {
    if (!fields) return
    const idx = fields.findIndex(f => f.id === id)
    const target = idx + dir
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    reorder.mutate(next.map(f => f.id))
  }

  const quickAdd = useMutation({
    mutationFn: (template: typeof QUICK_ADDS[string][number]) => api.post('/v1/admin/custom-fields', {
      entity,
      label: template.label,
      type: template.type,
      help_text: template.help_text ?? null,
      config: template.config ?? null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields-admin-all'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success('Field added')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed'
      toast.error(msg)
    },
  })

  const activeTab = ENTITY_TABS.find(t => t.key === entity)!
  const existingLabels = new Set((fields ?? []).map(f => f.label.toLowerCase()))
  const quickAddOptions = (QUICK_ADDS[entity] ?? []).filter(q => !existingLabels.has(q.label.toLowerCase()))

  return (
    <div>
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles size={16} className="text-purple-400" /> Custom fields
          </h2>
          <p className="text-xs text-t-secondary mt-1 max-w-2xl">
            Make this CRM fit your business. Pick an industry preset to get started fast, or add fields one
            at a time. Saved values stay safe even if you rename or delete a field.
          </p>
        </div>
      </div>

      {/* Industry presets — visual cards. The first thing a non-expert
          should see, with a clear "click here to get started" CTA. */}
      {presets && presets.length > 0 && (
        <div className="bg-purple-500/[0.04] border border-purple-500/20 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wide font-bold text-purple-300">Quick start by industry</span>
            <span className="text-[10px] text-t-secondary">— pick one to seed a starter field set, then adjust.</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {presets.map(p => {
              const Icon = PRESET_ICONS[p.icon] ?? Briefcase
              return (
                <button
                  key={p.key}
                  onClick={() => {
                    if (window.confirm(`Add the ${p.label} preset (${p.field_count} fields)? Existing keys are skipped — safe to re-apply.`)) {
                      applyPreset.mutate(p.key)
                    }
                  }}
                  disabled={applyPreset.isPending}
                  className="text-left bg-dark-bg border border-dark-border rounded-md p-3 hover:border-purple-500/50 hover:bg-purple-500/[0.04] transition disabled:opacity-50 group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-7 h-7 rounded-md bg-purple-500/15 border border-purple-500/30 flex items-center justify-center group-hover:scale-110 transition">
                      <Icon size={14} className="text-purple-300" />
                    </div>
                    <p className="text-sm font-bold text-white truncate">{p.label}</p>
                  </div>
                  <p className="text-[11px] text-t-secondary leading-snug line-clamp-2">{p.description}</p>
                  <p className="text-[10px] text-purple-300 mt-1.5 font-bold">+ {p.field_count} fields</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Entity tabs */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {ENTITY_TABS.map(t => {
          const c = counts[t.key] ?? 0
          return (
            <button
              key={t.key}
              onClick={() => setEntity(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition ${
                entity === t.key
                  ? 'bg-accent text-black border-accent'
                  : 'text-t-secondary hover:text-white border-dark-border hover:bg-dark-surface2'
              }`}
            >
              {t.label}
              {c > 0 && (
                <span className={`ml-1.5 ${entity === t.key ? 'opacity-70' : 'text-purple-300'}`}>{c}</span>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-t-secondary mb-3">{activeTab.hint}</p>

      {/* Quick-add common fields — one-click adds for fields most CRMs
          have, sized so a non-expert doesn't need to fight the form. */}
      {!isLoading && quickAddOptions.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5">Quick add</p>
          <div className="flex flex-wrap gap-1.5">
            {quickAddOptions.map(qa => {
              const Icon = qa.icon
              return (
                <button
                  key={qa.label}
                  onClick={() => quickAdd.mutate(qa)}
                  disabled={quickAdd.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border border-dark-border bg-dark-bg text-t-secondary hover:text-white hover:border-accent/40 transition disabled:opacity-50"
                  title={`Add a "${qa.label}" field (${qa.type})`}
                >
                  <Plus size={11} className="text-accent" />
                  <Icon size={11} />
                  {qa.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-t-secondary py-6 text-center">Loading…</p>
      ) : (
        <div className="space-y-1.5">
          {fields?.length === 0 && (
            <div className="text-center py-8 bg-dark-bg border border-dashed border-dark-border rounded-md">
              <Sparkles size={20} className="text-purple-300/40 mx-auto mb-2" />
              <p className="text-sm text-t-secondary mb-1">No custom fields for {activeTab.label.toLowerCase()} yet.</p>
              <p className="text-[11px] text-t-secondary/70">
                Try a quick-add chip above, or apply an industry preset at the top of this section.
              </p>
            </div>
          )}
          {fields?.map((f, i) => (
            <CustomFieldRowItem
              key={f.id}
              field={f}
              isFirst={i === 0}
              isLast={i === (fields?.length ?? 0) - 1}
              onMoveUp={() => moveField(f.id, -1)}
              onMoveDown={() => moveField(f.id, 1)}
              onToggle={() => toggleActive.mutate({ id: f.id, is_active: !f.is_active })}
              onToggleShowInList={() => toggleShowInList.mutate({ id: f.id, show_in_list: !f.show_in_list })}
              onDelete={() => {
                if (window.confirm(`Delete "${f.label}"?\n\nSaved values on existing records are NOT removed — re-creating the same key restores them.`)) {
                  remove.mutate(f.id)
                }
              }}
            />
          ))}

          {adding ? (
            <NewCustomFieldRow entity={entity} onClose={() => setAdding(false)} onAdded={() => setAdding(false)} />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs text-t-secondary hover:text-white hover:bg-dark-surface2 border border-dashed border-dark-border"
            >
              <Plus size={12} /> Add custom field
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CustomFieldRowItem({ field, isFirst, isLast, onMoveUp, onMoveDown, onToggle, onToggleShowInList, onDelete }: {
  field: CustomFieldRow
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onToggle: () => void
  onToggleShowInList: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(field.label)
  const [helpText, setHelpText] = useState(field.help_text ?? '')
  const [required, setRequired] = useState(field.required)
  const [optionsText, setOptionsText] = useState((field.config?.options ?? []).join('\n'))

  const supportsOptions = field.type === 'select' || field.type === 'multiselect'
  const typeMeta = FIELD_TYPES.find(t => t.value === field.type)
  const TypeIcon = typeMeta?.icon ?? Type
  const showInListSupported = field.entity === 'inquiry' // only the leads list renders custom columns today

  const update = useMutation({
    mutationFn: () => {
      const payload: Record<string, any> = { label, help_text: helpText || null, required }
      if (supportsOptions) {
        payload.config = { options: optionsText.split('\n').map(s => s.trim()).filter(Boolean) }
      }
      return api.put(`/v1/admin/custom-fields/${field.id}`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success('Saved')
      setEditing(false)
    },
    onError: () => toast.error('Save failed'),
  })

  if (editing) {
    return (
      <div className="bg-dark-bg border border-purple-500/40 rounded-md p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            className="flex-1 bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded">
            <TypeIcon size={10} /> {typeMeta?.short ?? field.type}
          </span>
        </div>
        <input
          value={helpText}
          onChange={e => setHelpText(e.target.value)}
          placeholder="Help text shown under the field (optional)"
          className="w-full bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-xs outline-none focus:border-accent"
        />
        {supportsOptions && (
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1 block">
              Options (one per line)
            </label>
            <textarea
              value={optionsText}
              onChange={e => setOptionsText(e.target.value)}
              rows={4}
              className="w-full bg-dark-surface border border-dark-border rounded-md px-2 py-1.5 text-xs outline-none focus:border-accent resize-none font-mono"
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs text-t-secondary cursor-pointer">
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} className="accent-primary-500" />
            Required when filling the form
          </label>
          <div className="flex gap-1.5">
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs text-t-secondary hover:text-white">Cancel</button>
            <button
              onClick={() => update.mutate()}
              disabled={!label.trim() || update.isPending}
              className="bg-accent text-black font-bold rounded-md px-3 py-1 text-xs disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`group flex items-center gap-2 p-2 rounded-md hover:bg-dark-surface2 ${field.is_active ? '' : 'opacity-50'}`}>
      {/* Move up/down — non-experts can re-order without learning drag-and-drop. */}
      <div className="flex flex-col -space-y-1">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-0.5 text-t-secondary hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
          title="Move up"
        >
          <ChevronUp size={11} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-0.5 text-t-secondary hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
          title="Move down"
        >
          <ChevronDown size={11} />
        </button>
      </div>

      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded w-20 truncate">
        <TypeIcon size={9} /> {typeMeta?.short ?? field.type}
      </span>
      <span className="text-sm font-semibold text-white flex-1 truncate">
        {field.label}
        {field.required && <span className="text-red-400 ml-1" title="Required">*</span>}
      </span>
      {field.config?.options && (
        <span className="text-[10px] text-t-secondary">
          {field.config.options.length} option{field.config.options.length === 1 ? '' : 's'}
        </span>
      )}
      <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
        {showInListSupported && (
          <button
            onClick={onToggleShowInList}
            className={`flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded border ${
              field.show_in_list
                ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10'
                : 'text-t-secondary border-dark-border'
            }`}
            title={field.show_in_list ? 'Showing in leads list' : 'Add as a column in the leads list'}
          >
            {field.show_in_list ? <Eye size={9} /> : <EyeOff size={9} />}
            {field.show_in_list ? 'In list' : 'List?'}
          </button>
        )}
        <button
          onClick={onToggle}
          className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded border ${
            field.is_active ? 'text-emerald-300 border-emerald-500/30' : 'text-t-secondary border-dark-border'
          }`}
        >
          {field.is_active ? 'Active' : 'Off'}
        </button>
        <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white" title="Edit field">
          <Edit3 size={11} />
        </button>
        <button onClick={onDelete} className="p-1 rounded hover:bg-red-500/15 text-t-secondary hover:text-red-400" title="Delete field">
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

function NewCustomFieldRow({ entity, onClose, onAdded }: {
  entity: string
  onClose: () => void
  onAdded: () => void
}) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [type, setType] = useState('text')
  const [helpText, setHelpText] = useState('')
  const [required, setRequired] = useState(false)
  const [optionsText, setOptionsText] = useState('')

  const typeMeta = FIELD_TYPES.find(t => t.value === type)
  const supportsOptions = !!typeMeta?.supportsOptions

  const create = useMutation({
    mutationFn: () => {
      const payload: Record<string, any> = { entity, label, type, help_text: helpText || null, required }
      if (supportsOptions) {
        payload.config = { options: optionsText.split('\n').map(s => s.trim()).filter(Boolean) }
      }
      return api.post('/v1/admin/custom-fields', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields-admin-all'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success('Field added')
      onAdded()
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed'),
  })

  return (
    <div className="bg-dark-bg border border-purple-500/40 rounded-md p-3 space-y-3">
      {/* Label first — most natural starting point. */}
      <div>
        <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1 block">
          Field label
        </label>
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder='e.g. "Allergies", "Budget", "Preferred trainer"'
          className="w-full bg-dark-surface border border-dark-border rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>

      {/* Visual type picker — replaces the select with cards showing
          icon + a concrete example so a non-expert knows when to pick
          which. */}
      <div>
        <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
          What kind of value?
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1.5">
          {FIELD_TYPES.map(ft => {
            const Icon = ft.icon
            const active = type === ft.value
            return (
              <button
                key={ft.value}
                onClick={() => setType(ft.value)}
                className={`text-left p-2 rounded-md border transition ${
                  active
                    ? 'border-accent bg-accent/10'
                    : 'border-dark-border bg-dark-surface hover:border-accent/40 hover:bg-dark-surface2'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon size={12} className={active ? 'text-accent' : 'text-t-secondary'} />
                  <span className={`text-xs font-bold ${active ? 'text-accent' : 'text-white'}`}>{ft.label}</span>
                </div>
                <p className="text-[10px] text-t-secondary leading-tight">{ft.example}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1 block">
          Help text <span className="font-normal lowercase text-t-secondary/70">(optional — shown under the field)</span>
        </label>
        <input
          value={helpText}
          onChange={e => setHelpText(e.target.value)}
          placeholder='e.g. "List ALL drug, food and environmental allergies."'
          className="w-full bg-dark-surface border border-dark-border rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        />
      </div>

      {supportsOptions && (
        <div>
          <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1 block">
            Options <span className="font-normal lowercase text-t-secondary/70">(one per line)</span>
          </label>
          <textarea
            value={optionsText}
            onChange={e => setOptionsText(e.target.value)}
            rows={4}
            placeholder={'Option A\nOption B\nOption C'}
            className="w-full bg-dark-surface border border-dark-border rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-accent resize-none font-mono"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <label className="flex items-center gap-1.5 text-xs text-t-secondary cursor-pointer">
          <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} className="accent-primary-500" />
          Required when filling the form
        </label>
        <div className="flex gap-1.5">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-t-secondary hover:text-white">Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={!label.trim() || (supportsOptions && optionsText.trim() === '') || create.isPending}
            className="bg-accent text-black font-bold rounded-md px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Add field
          </button>
        </div>
      </div>
    </div>
  )
}
