import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { Plus, Trash2, Edit3 } from 'lucide-react'

/**
 * Settings → Pipelines third sub-section. Per-entity custom-field
 * editor with industry presets at the top. Sibling to PipelinesAdmin
 * (kept in its own file because the editor is sizeable enough that
 * inlining it makes PipelinesAdmin unwieldy).
 */

const ENTITY_TABS: Array<{ key: 'inquiry' | 'guest' | 'corporate_account' | 'task'; label: string; hint: string }> = [
  { key: 'inquiry',           label: 'Leads / Inquiries',  hint: 'Shown on Add Inquiry + lead detail.' },
  { key: 'guest',             label: 'Guests / Customers', hint: 'Shown on guest profiles and the inline guest-create form.' },
  { key: 'corporate_account', label: 'Companies',          hint: 'Shown on the company detail panel and create modal.' },
  { key: 'task',              label: 'Tasks',              hint: 'Shown on the task drawer create + edit form.' },
]

const FIELD_TYPES: Array<{ value: string; label: string; supportsOptions: boolean }> = [
  { value: 'text',        label: 'Text (single line)', supportsOptions: false },
  { value: 'textarea',    label: 'Text (multi-line)',  supportsOptions: false },
  { value: 'number',      label: 'Number',             supportsOptions: false },
  { value: 'date',        label: 'Date',               supportsOptions: false },
  { value: 'select',      label: 'Select (one)',       supportsOptions: true  },
  { value: 'multiselect', label: 'Select (many)',      supportsOptions: true  },
  { value: 'checkbox',    label: 'Checkbox (yes/no)',  supportsOptions: false },
  { value: 'email',       label: 'Email',              supportsOptions: false },
  { value: 'phone',       label: 'Phone',              supportsOptions: false },
  { value: 'url',         label: 'URL',                supportsOptions: false },
]

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

  const applyPreset = useMutation({
    mutationFn: (key: string) => api.post('/v1/admin/custom-fields/apply-preset', { preset: key }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success(res.data?.message ?? 'Preset applied')
    },
    onError: () => toast.error('Could not apply preset'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/custom-fields/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
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

  const activeTab = ENTITY_TABS.find(t => t.key === entity)!

  return (
    <div>
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Plus size={16} className="text-purple-400" /> Custom fields
          </h2>
          <p className="text-xs text-t-secondary mt-1">
            Define industry-specific fields per entity. Saved values persist on each row even if you later
            deactivate or delete the field, so renaming a label is safe.
          </p>
        </div>
      </div>

      {presets && presets.length > 0 && (
        <div className="bg-purple-500/[0.04] border border-purple-500/20 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wide font-bold text-purple-300">Industry presets</span>
            <span className="text-[10px] text-t-secondary">— seed a starter field set, then tweak from here.</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {presets.map(p => (
              <button
                key={p.key}
                onClick={() => {
                  if (window.confirm(`Add the ${p.label} preset (${p.field_count} fields)? Existing keys are skipped — safe to re-apply.`)) {
                    applyPreset.mutate(p.key)
                  }
                }}
                disabled={applyPreset.isPending}
                className="text-left bg-dark-bg border border-dark-border rounded-md p-2.5 hover:border-purple-500/40 transition disabled:opacity-50"
              >
                <p className="text-sm font-bold text-white">{p.label}</p>
                <p className="text-[11px] text-t-secondary mt-0.5 leading-snug">{p.description}</p>
                <p className="text-[10px] text-purple-300 mt-1.5 font-bold">+ {p.field_count} fields</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {ENTITY_TABS.map(t => (
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
          </button>
        ))}
      </div>
      <p className="text-[11px] text-t-secondary mb-3">{activeTab.hint}</p>

      {isLoading ? (
        <p className="text-sm text-t-secondary py-6 text-center">Loading…</p>
      ) : (
        <div className="space-y-1.5">
          {fields?.length === 0 && (
            <p className="text-xs text-t-secondary italic py-4 text-center bg-dark-bg border border-dashed border-dark-border rounded-md">
              No custom fields yet. Apply an industry preset above, or add one manually.
            </p>
          )}
          {fields?.map(f => (
            <CustomFieldRowItem
              key={f.id}
              field={f}
              onToggle={() => toggleActive.mutate({ id: f.id, is_active: !f.is_active })}
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

function CustomFieldRowItem({ field, onToggle, onDelete }: {
  field: CustomFieldRow
  onToggle: () => void
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
          <span className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">{typeMeta?.label ?? field.type}</span>
        </div>
        <input
          value={helpText}
          onChange={e => setHelpText(e.target.value)}
          placeholder="Help text shown under the field"
          className="w-full bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-xs outline-none focus:border-accent"
        />
        {supportsOptions && (
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1 block">Options (one per line)</label>
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
            Required
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
      <span className="text-[10px] uppercase tracking-wide font-bold text-t-secondary w-24 truncate">
        {typeMeta?.label.split(' ')[0] ?? field.type}
      </span>
      <span className="text-sm font-semibold text-white flex-1 truncate">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </span>
      {field.config?.options && (
        <span className="text-[10px] text-t-secondary">
          {field.config.options.length} option{field.config.options.length === 1 ? '' : 's'}
        </span>
      )}
      <span className="text-[10px] font-mono text-t-secondary/70">{field.key}</span>
      <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
        <button
          onClick={onToggle}
          className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded border ${
            field.is_active ? 'text-emerald-300 border-emerald-500/30' : 'text-t-secondary border-dark-border'
          }`}
        >
          {field.is_active ? 'Active' : 'Off'}
        </button>
        <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white">
          <Edit3 size={11} />
        </button>
        <button onClick={onDelete} className="p-1 rounded hover:bg-red-500/15 text-t-secondary hover:text-red-400">
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
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success('Field added')
      onAdded()
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed'),
  })

  return (
    <div className="bg-dark-bg border border-purple-500/40 rounded-md p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Field label"
          className="bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-sm outline-none focus:border-accent"
        />
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-sm outline-none focus:border-accent"
        >
          {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <input
        value={helpText}
        onChange={e => setHelpText(e.target.value)}
        placeholder="Help text (optional)"
        className="w-full bg-dark-surface border border-dark-border rounded-md px-2 py-1 text-xs outline-none focus:border-accent"
      />
      {supportsOptions && (
        <div>
          <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1 block">Options (one per line)</label>
          <textarea
            value={optionsText}
            onChange={e => setOptionsText(e.target.value)}
            rows={4}
            placeholder="Option A&#10;Option B&#10;Option C"
            className="w-full bg-dark-surface border border-dark-border rounded-md px-2 py-1.5 text-xs outline-none focus:border-accent resize-none font-mono"
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-t-secondary cursor-pointer">
          <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} className="accent-primary-500" />
          Required field
        </label>
        <div className="flex gap-1.5">
          <button onClick={onClose} className="px-3 py-1 text-xs text-t-secondary hover:text-white">Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={!label.trim() || (supportsOptions && optionsText.trim() === '') || create.isPending}
            className="bg-accent text-black font-bold rounded-md px-3 py-1 text-xs disabled:opacity-50"
          >
            Add field
          </button>
        </div>
      </div>
    </div>
  )
}
