import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Plus, FileText, Trash2, Copy, ExternalLink, RefreshCw,
  Eye, Pencil, ChevronUp, ChevronDown, X, Inbox, CheckCircle2,
  Code, Palette, Settings as SettingsIcon, Layers, Power,
} from 'lucide-react'

/**
 * Lead Forms admin page (CRM Phase 10) — list + editor.
 *
 * The list shows all forms with submission counts + an embed-code
 * popover. Clicking a form opens the editor as a side drawer with
 * three tabs: Fields (toggle + reorder + edit built-ins, add custom),
 * Design (colors, copy, theme), Embed (iframe snippet + regenerate
 * key + submissions log).
 */

interface LeadForm {
  id: number
  name: string
  embed_key: string
  description: string | null
  default_source: string
  default_inquiry_type: string | null
  default_property_id: number | null
  default_assigned_to: string | null
  fields: FormField[]
  design: FormDesign
  is_active: boolean
  submission_count: number
  last_submitted_at: string | null
  updated_at: string
}

interface FormField {
  key: string
  type: 'text' | 'textarea' | 'email' | 'phone' | 'date' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'url'
  label: string
  placeholder?: string
  required: boolean
  enabled: boolean
  options?: string[]
  options_source?: string
  help_text?: string
}

interface FormDesign {
  title: string
  intro: string
  submit_text: string
  success_title: string
  success_message: string
  primary_color: string
  theme: 'light' | 'dark'
  corners: 'rounded' | 'sharp'
  show_privacy_link: boolean
  show_brand_logo: boolean
}

const FIELD_TYPE_META: Record<FormField['type'], { label: string; icon: any }> = {
  text:        { label: 'Text',       icon: FileText },
  textarea:    { label: 'Long text',  icon: FileText },
  email:       { label: 'Email',      icon: FileText },
  phone:       { label: 'Phone',      icon: FileText },
  date:        { label: 'Date',       icon: FileText },
  number:      { label: 'Number',     icon: FileText },
  select:      { label: 'Dropdown',   icon: FileText },
  multiselect: { label: 'Tags',       icon: FileText },
  checkbox:    { label: 'Checkbox',   icon: FileText },
  url:         { label: 'URL',        icon: FileText },
}

export function LeadForms() {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: forms, isLoading } = useQuery<LeadForm[]>({
    queryKey: ['lead-forms'],
    queryFn: () => api.get('/v1/admin/lead-forms').then(r => r.data),
    // Always refetch on mount — the list is small (one query, all forms
    // for the org) and seeing a stale row that's been deleted in
    // another tab is a confusing trap. Cheap to refresh.
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const createMut = useMutation({
    mutationFn: (name: string) => api.post('/v1/admin/lead-forms', { name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lead-forms'] })
      setNewName('')
      setShowCreate(false)
      setEditingId(res.data.id)
      toast.success('Form created — edit fields & design')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/lead-forms/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-forms'] })
      toast.success('Form deleted')
    },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/v1/admin/lead-forms/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-forms'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead-capture forms</h1>
          <p className="text-sm text-t-secondary mt-0.5 max-w-2xl">
            Build forms for your website that send leads straight into the CRM. Embed via iframe — no website changes
            beyond a single <code className="text-accent font-mono text-xs px-1 py-0.5 rounded bg-dark-surface">&lt;iframe&gt;</code> snippet.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-accent text-black font-bold rounded-lg px-4 py-2 text-sm flex items-center gap-2 hover:bg-accent/90"
        >
          <Plus size={15} /> New form
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-sm text-t-secondary">Loading…</div>
      ) : !forms?.length ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {forms.map(f => (
            <FormCard
              key={f.id}
              form={f}
              onEdit={() => setEditingId(f.id)}
              onToggle={() => toggleActive.mutate({ id: f.id, is_active: !f.is_active })}
              onDelete={() => {
                if (window.confirm(`Delete form "${f.name}"? Existing submissions are kept.`)) {
                  deleteMut.mutate(f.id)
                }
              }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          name={newName}
          onChange={setNewName}
          onCancel={() => { setShowCreate(false); setNewName('') }}
          onCreate={() => newName.trim() && createMut.mutate(newName.trim())}
          busy={createMut.isPending}
        />
      )}

      {editingId !== null && (
        <FormEditor
          formId={editingId}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-20 bg-dark-surface border border-dashed border-dark-border rounded-xl">
      <Inbox size={32} className="text-t-secondary/40 mx-auto mb-3" />
      <h2 className="text-lg font-bold text-white mb-1">No forms yet</h2>
      <p className="text-sm text-t-secondary mb-4 max-w-md mx-auto">
        Build a "Contact us", "Request a quote" or "Inquire about a service" form. Submissions land in your
        CRM as new inquiries automatically.
      </p>
      <button onClick={onCreate} className="bg-accent text-black font-bold rounded-md px-4 py-2 text-sm hover:bg-accent/90 inline-flex items-center gap-2">
        <Plus size={14} /> Create your first form
      </button>
    </div>
  )
}

function FormCard({ form, onEdit, onToggle, onDelete }: {
  form: LeadForm
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const url = `${window.location.origin}/form/${form.embed_key}`
  const lastSubmitText = form.last_submitted_at
    ? new Date(form.last_submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : 'Never'

  return (
    <div className={`bg-dark-surface border rounded-xl p-4 transition ${form.is_active ? 'border-dark-border' : 'border-dark-border opacity-60'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-base font-bold text-white truncate flex-1">{form.name}</h3>
        <span
          className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded ${
            form.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-500/15 text-gray-400'
          }`}
        >
          {form.is_active ? 'Live' : 'Off'}
        </span>
      </div>

      {form.description && (
        <p className="text-xs text-t-secondary mb-3 line-clamp-2">{form.description}</p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-dark-bg border border-dark-border rounded-md p-2">
          <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">Submissions</p>
          <p className="text-lg font-bold text-white tabular-nums">{form.submission_count}</p>
        </div>
        <div className="bg-dark-bg border border-dark-border rounded-md p-2">
          <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">Last</p>
          <p className="text-sm font-bold text-white">{lastSubmitText}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 bg-accent text-black font-bold rounded-md px-3 py-1.5 text-xs hover:bg-accent/90"
        >
          <Pencil size={12} /> Edit
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="p-1.5 rounded-md border border-dark-border text-t-secondary hover:text-white hover:border-accent/40"
          title="Preview public form"
        >
          <Eye size={13} />
        </a>
        <button
          onClick={onToggle}
          className={`p-1.5 rounded-md border ${form.is_active ? 'border-emerald-500/30 text-emerald-300' : 'border-dark-border text-t-secondary hover:text-white'}`}
          title={form.is_active ? 'Disable (stop accepting submissions)' : 'Enable'}
        >
          <Power size={13} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md border border-dark-border text-t-secondary hover:text-red-400 hover:border-red-500/30"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function CreateModal({ name, onChange, onCancel, onCreate, busy }: {
  name: string
  onChange: (s: string) => void
  onCancel: () => void
  onCreate: () => void
  busy: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-dark-surface border border-dark-border rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-1">New lead-capture form</h2>
        <p className="text-xs text-t-secondary mb-4">Pick a memorable name. You'll configure fields and design after creating.</p>
        <input
          autoFocus
          value={name}
          onChange={e => onChange(e.target.value)}
          placeholder='e.g. "Contact us", "Request a quote", "Wedding inquiry"'
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onCreate() }}
          className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent mb-4"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-t-secondary hover:text-white">Cancel</button>
          <button
            onClick={onCreate}
            disabled={!name.trim() || busy}
            className="bg-accent text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 hover:bg-accent/90"
          >
            {busy ? 'Creating…' : 'Create form'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Editor drawer ─────────────────────────────────────────── */

function FormEditor({ formId, onClose }: { formId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'fields' | 'design' | 'embed'>('fields')

  // Surface a 404 gracefully — happens when the editor is opened from
  // a stale list cache (form was deleted in another tab / by another
  // user). Don't retry on 4xx so the user gets the friendly empty
  // state immediately instead of three retries of failed requests.
  const { data: form, isLoading, error } = useQuery<LeadForm>({
    queryKey: ['lead-form', formId],
    queryFn: () => api.get(`/v1/admin/lead-forms/${formId}`).then(r => r.data),
    retry: (failureCount, err: any) => {
      const status = err?.response?.status
      if (status === 404 || status === 403) return false
      return failureCount < 2
    },
  })

  const errStatus: number | undefined = (error as any)?.response?.status
  const notFound = errStatus === 404
  const subscriptionBlocked = errStatus === 403
    && (error as any)?.response?.data?.error === 'subscription_required'

  // 404 means the editor opened against a stale id (form was deleted
  // in another tab / by another user). Auto-close + refresh the list
  // so the user doesn't have to click Refresh themselves. The toast
  // tells them what happened.
  useEffect(() => {
    if (!notFound) return
    toast.error('That form no longer exists — refreshed the list.')
    qc.invalidateQueries({ queryKey: ['lead-forms'] })
    onClose()
  }, [notFound, qc, onClose])

  // Subscription-expired is the OTHER common reason a fetch fails on
  // CRM endpoints. The Layout's subscription wall handles the page-
  // level UX; for the drawer just give a clear message + close so the
  // wall is visible underneath.
  useEffect(() => {
    if (!subscriptionBlocked) return
    toast.error('Your trial has expired. Please renew to use lead forms.')
    onClose()
  }, [subscriptionBlocked, onClose])

  // Editor saves silently on every change (debounced via React Query
  // mutation queue) — toast on every keystroke would be noise. Failures
  // do toast so the user notices.
  const update = useMutation({
    mutationFn: (patch: Partial<LeadForm>) => api.put(`/v1/admin/lead-forms/${formId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-form', formId] })
      qc.invalidateQueries({ queryKey: ['lead-forms'] })
    },
    onError: () => toast.error('Save failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-dark-surface border-l border-dark-border w-full max-w-2xl h-full flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-white truncate">{form?.name ?? 'Loading…'}</h2>
            {form && <p className="text-[11px] text-t-secondary mt-0.5 truncate">/form/{form.embed_key}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-dark-border">
          {[
            { k: 'fields', label: 'Fields',  icon: Layers },
            { k: 'design', label: 'Design',  icon: Palette },
            { k: 'embed',  label: 'Embed',   icon: Code },
          ].map(t => {
            const Icon = t.icon
            const active = tab === t.k
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
                  active ? 'text-accent border-b-2 border-accent' : 'text-t-secondary hover:text-white border-b-2 border-transparent'
                }`}
              >
                <Icon size={12} />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {notFound ? (
            <div className="text-center py-16 px-6">
              <X size={28} className="text-red-400/60 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1">Form not found</h3>
              <p className="text-sm text-t-secondary mb-4 max-w-xs mx-auto">
                This form may have been deleted in another tab. Refresh the list and try again.
              </p>
              <button
                onClick={() => {
                  qc.invalidateQueries({ queryKey: ['lead-forms'] })
                  onClose()
                }}
                className="bg-accent text-black font-bold rounded-md px-4 py-2 text-sm hover:bg-accent/90"
              >
                Refresh list
              </button>
            </div>
          ) : isLoading || !form ? (
            <p className="text-center text-sm text-t-secondary py-12">Loading…</p>
          ) : tab === 'fields' ? (
            <FieldsTab form={form} onUpdate={update.mutate} />
          ) : tab === 'design' ? (
            <DesignTab form={form} onUpdate={update.mutate} />
          ) : (
            <EmbedTab formId={formId} form={form} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Fields tab ────────────────────────────────────────────── */

function FieldsTab({ form, onUpdate }: { form: LeadForm; onUpdate: (patch: Partial<LeadForm>) => void }) {
  const fields = form.fields ?? []

  const setField = (i: number, patch: Partial<FormField>) => {
    const next = [...fields]
    next[i] = { ...next[i], ...patch }
    onUpdate({ fields: next })
  }

  const move = (i: number, dir: -1 | 1) => {
    const target = i + dir
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    ;[next[i], next[target]] = [next[target], next[i]]
    onUpdate({ fields: next })
  }

  const removeField = (i: number) => {
    if (!window.confirm(`Remove "${fields[i].label}"?`)) return
    onUpdate({ fields: fields.filter((_, idx) => idx !== i) })
  }

  const addCustom = () => {
    const key = 'custom:' + Math.random().toString(36).slice(2, 8)
    const newField: FormField = {
      key, type: 'text', label: 'New field',
      placeholder: '', required: false, enabled: true,
    }
    onUpdate({ fields: [...fields, newField] })
  }

  return (
    <div className="p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white mb-1">Form fields</h3>
        <p className="text-xs text-t-secondary">
          Toggle which fields appear, mark them required, edit labels and placeholders. Add your own
          custom fields at the bottom.
        </p>
      </div>

      <div className="space-y-2">
        {fields.map((f, i) => (
          <FieldRow
            key={f.key + i}
            field={f}
            isFirst={i === 0}
            isLast={i === fields.length - 1}
            onChange={(patch) => setField(i, patch)}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            onDelete={f.key.startsWith('custom:') ? () => removeField(i) : undefined}
          />
        ))}
      </div>

      <button
        onClick={addCustom}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs text-t-secondary hover:text-white hover:bg-dark-surface2 border border-dashed border-dark-border"
      >
        <Plus size={12} /> Add custom field
      </button>
    </div>
  )
}

function FieldRow({ field, isFirst, isLast, onChange, onMoveUp, onMoveDown, onDelete }: {
  field: FormField
  isFirst: boolean
  isLast: boolean
  onChange: (patch: Partial<FormField>) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isCustom = field.key.startsWith('custom:')

  return (
    <div className={`bg-dark-bg border rounded-md transition ${field.enabled ? 'border-dark-border' : 'border-dark-border/60 opacity-60'}`}>
      <div className="flex items-center gap-2 p-2.5">
        <div className="flex flex-col -space-y-1">
          <button onClick={onMoveUp} disabled={isFirst} className="p-0.5 text-t-secondary hover:text-white disabled:opacity-20" title="Move up">
            <ChevronUp size={11} />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="p-0.5 text-t-secondary hover:text-white disabled:opacity-20" title="Move down">
            <ChevronDown size={11} />
          </button>
        </div>

        <button
          onClick={() => onChange({ enabled: !field.enabled })}
          className={`w-9 h-5 rounded-full p-0.5 flex-shrink-0 transition ${field.enabled ? 'bg-emerald-500/80' : 'bg-dark-surface2'}`}
          title={field.enabled ? 'Disable field' : 'Enable field'}
        >
          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${field.enabled ? 'translate-x-4' : ''}`} />
        </button>

        <div className="flex-1 min-w-0">
          {expanded ? (
            <input
              value={field.label}
              onChange={e => onChange({ label: e.target.value })}
              className="w-full bg-dark-surface border border-dark-border rounded px-2 py-1 text-sm outline-none focus:border-accent"
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">{field.label}</span>
              {field.required && <span className="text-red-400 text-xs">*</span>}
            </div>
          )}
          {!expanded && (
            <p className="text-[10px] text-t-secondary uppercase tracking-wide">
              {FIELD_TYPE_META[field.type]?.label ?? field.type}
              {isCustom && <span className="text-purple-300 ml-1.5">· Custom</span>}
            </p>
          )}
        </div>

        <label className="flex items-center gap-1 text-[11px] text-t-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={field.required}
            onChange={e => onChange({ required: e.target.checked })}
            className="accent-primary-500"
          />
          Required
        </label>
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-1 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white"
          title={expanded ? 'Collapse' : 'Edit details'}
        >
          {expanded ? <ChevronUp size={12} /> : <SettingsIcon size={12} />}
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/15 text-t-secondary hover:text-red-400"
            title="Delete field"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-dark-border p-3 space-y-2 bg-dark-surface/40">
          <div className="grid grid-cols-2 gap-2">
            {isCustom && (
              <div>
                <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">Type</label>
                <select
                  value={field.type}
                  onChange={e => onChange({ type: e.target.value as FormField['type'] })}
                  className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs outline-none focus:border-accent"
                >
                  {Object.entries(FIELD_TYPE_META).map(([k, m]) => (
                    <option key={k} value={k}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className={isCustom ? '' : 'col-span-2'}>
              <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">Placeholder</label>
              <input
                value={field.placeholder ?? ''}
                onChange={e => onChange({ placeholder: e.target.value })}
                className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs outline-none focus:border-accent"
              />
            </div>
          </div>
          {(field.type === 'select' || field.type === 'multiselect') && (
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">Options (one per line)</label>
              <textarea
                value={(field.options ?? []).join('\n')}
                onChange={e => onChange({ options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                rows={4}
                className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent resize-none font-mono"
              />
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">Help text (optional)</label>
            <input
              value={field.help_text ?? ''}
              onChange={e => onChange({ help_text: e.target.value })}
              placeholder="Shown under the input."
              className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs outline-none focus:border-accent"
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Design tab ────────────────────────────────────────────── */

function DesignTab({ form, onUpdate }: { form: LeadForm; onUpdate: (patch: Partial<LeadForm>) => void }) {
  const d = form.design

  const setDesign = (patch: Partial<FormDesign>) => {
    onUpdate({ design: { ...d, ...patch } })
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white mb-1">Design</h3>
        <p className="text-xs text-t-secondary">Customise the look and the copy. Preview by clicking "Eye" on the form list.</p>
      </div>

      <Section title="Copy">
        <Field label="Form title">
          <input value={d.title} onChange={e => setDesign({ title: e.target.value })} className={inp} />
        </Field>
        <Field label="Intro paragraph">
          <textarea value={d.intro} onChange={e => setDesign({ intro: e.target.value })} rows={2} className={`${inp} resize-none`} />
        </Field>
        <Field label="Submit button text">
          <input value={d.submit_text} onChange={e => setDesign({ submit_text: e.target.value })} className={inp} />
        </Field>
        <Field label="Success — title">
          <input value={d.success_title} onChange={e => setDesign({ success_title: e.target.value })} className={inp} />
        </Field>
        <Field label="Success — message">
          <textarea value={d.success_message} onChange={e => setDesign({ success_message: e.target.value })} rows={2} className={`${inp} resize-none`} />
        </Field>
      </Section>

      <Section title="Look">
        <Field label="Primary color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={d.primary_color}
              onChange={e => setDesign({ primary_color: e.target.value })}
              className="w-10 h-9 rounded border border-dark-border bg-dark-bg cursor-pointer"
            />
            <input
              value={d.primary_color}
              onChange={e => setDesign({ primary_color: e.target.value })}
              className={`${inp} font-mono`}
            />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Theme">
            <div className="flex gap-1.5">
              {(['light', 'dark'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setDesign({ theme: t })}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-bold capitalize ${d.theme === t ? 'bg-accent text-black' : 'bg-dark-bg border border-dark-border text-t-secondary hover:text-white'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Corners">
            <div className="flex gap-1.5">
              {(['rounded', 'sharp'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setDesign({ corners: c })}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-bold capitalize ${d.corners === c ? 'bg-accent text-black' : 'bg-dark-bg border border-dark-border text-t-secondary hover:text-white'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-t-secondary cursor-pointer">
          <input type="checkbox" checked={d.show_privacy_link} onChange={e => setDesign({ show_privacy_link: e.target.checked })} className="accent-primary-500" />
          Show "By submitting, you agree to be contacted" footer
        </label>
      </Section>

      <Section title="Defaults applied to created leads">
        <Field label="Source label" hint='What "source" field is set on the inquiry. Defaults to "website_form".'>
          <input value={form.default_source ?? ''} onChange={e => onUpdate({ default_source: e.target.value })} placeholder="website_form" className={inp} />
        </Field>
        <Field label="Inquiry type" hint="Optional — auto-tag every submission as this type.">
          <input value={form.default_inquiry_type ?? ''} onChange={e => onUpdate({ default_inquiry_type: e.target.value || null })} placeholder="e.g. Wedding" className={inp} />
        </Field>
      </Section>
    </div>
  )
}

const inp = 'w-full bg-dark-bg border border-dark-border rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-accent'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-dark-bg border border-dark-border rounded-lg p-3 space-y-2.5">
      <h4 className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">{title}</h4>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-t-secondary mt-0.5 leading-snug">{hint}</p>}
    </div>
  )
}

/* ── Embed tab ─────────────────────────────────────────────── */

function EmbedTab({ formId, form }: { formId: number; form: LeadForm }) {
  const qc = useQueryClient()
  const url = `${window.location.origin}/form/${form.embed_key}`
  const iframeSnippet = `<iframe src="${url}" width="100%" height="700" frameborder="0" style="border: 0; max-width: 600px;"></iframe>`
  const linkSnippet = url

  const regenerate = useMutation({
    mutationFn: () => api.post(`/v1/admin/lead-forms/${formId}/regenerate-key`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-form', formId] })
      qc.invalidateQueries({ queryKey: ['lead-forms'] })
      toast.success('New key generated. Old iframes will stop working.')
    },
  })

  const { data: subs } = useQuery<any>({
    queryKey: ['lead-form-submissions', formId],
    queryFn: () => api.get(`/v1/admin/lead-forms/${formId}/submissions`).then(r => r.data),
  })

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Could not copy'),
    )
  }

  return (
    <div className="p-4 space-y-4">
      <Section title="Direct link">
        <p className="text-xs text-t-secondary mb-1">Paste this in emails, social posts, footers — anywhere a link makes sense.</p>
        <div className="flex gap-1.5">
          <input value={linkSnippet} readOnly className={`${inp} font-mono`} />
          <button onClick={() => copy(linkSnippet, 'Link')} className="px-3 py-1.5 bg-dark-bg border border-dark-border rounded-md text-xs text-white hover:border-accent/40 flex items-center gap-1.5">
            <Copy size={11} /> Copy
          </button>
          <a href={linkSnippet} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-dark-bg border border-dark-border rounded-md text-xs text-white hover:border-accent/40 flex items-center gap-1.5">
            <ExternalLink size={11} /> Open
          </a>
        </div>
      </Section>

      <Section title="Embed on your website">
        <p className="text-xs text-t-secondary mb-1">Paste this snippet anywhere in your site's HTML to embed the form.</p>
        <textarea
          value={iframeSnippet}
          readOnly
          rows={3}
          className={`${inp} font-mono resize-none`}
        />
        <button onClick={() => copy(iframeSnippet, 'Snippet')} className="px-3 py-1.5 bg-accent text-black font-bold rounded-md text-xs flex items-center gap-1.5">
          <Copy size={11} /> Copy snippet
        </button>
      </Section>

      <Section title="Security — embed key">
        <p className="text-xs text-t-secondary mb-2">
          Your embed URL contains a public key. Regenerate if the form is being spammed or the key has leaked —
          existing iframes will need to be updated to the new URL.
        </p>
        <button
          onClick={() => {
            if (window.confirm('Regenerate the embed key? Existing iframes will stop working until you update them.')) {
              regenerate.mutate()
            }
          }}
          disabled={regenerate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-bg border border-amber-500/30 rounded-md text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
        >
          <RefreshCw size={11} /> Regenerate key
        </button>
      </Section>

      <Section title={`Recent submissions (${form.submission_count} total)`}>
        {!subs?.data?.length ? (
          <p className="text-xs text-t-secondary italic py-3 text-center">No submissions yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {subs.data.slice(0, 10).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-2 bg-dark-bg border border-dark-border rounded text-xs">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">
                    {s.guest?.full_name ?? s.payload?.name ?? 'Anonymous'}
                  </p>
                  <p className="text-t-secondary text-[10px]">
                    {s.guest?.email ?? s.payload?.email ?? '—'} ·
                    {' '}{new Date(s.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                {s.inquiry_id && (
                  <a
                    href={`/inquiries/${s.inquiry_id}`}
                    className="ml-2 text-accent hover:underline flex items-center gap-1"
                  >
                    <CheckCircle2 size={11} /> Lead #{s.inquiry_id}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
