import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * Shared rendering for admin-defined custom fields. Two surfaces:
 *
 *   <CustomFieldsForm>     — inputs for create/edit forms
 *   <CustomFieldsDisplay>  — read-only rendering for detail panels
 *
 * Plus a hook:
 *
 *   useCustomFields(entity) — returns the active fields for an entity,
 *                              cached across the SPA.
 *
 * Both components are entity-agnostic — they take an `entity` prop
 * and render whatever the admin has defined for that entity.
 */

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'date'
  | 'select' | 'multiselect' | 'checkbox'
  | 'url' | 'email' | 'phone'

export type Entity = 'inquiry' | 'guest' | 'corporate_account' | 'task'

export interface CustomFieldDef {
  id: number
  entity: Entity
  key: string
  label: string
  type: FieldType
  config: { options?: string[] } | null
  help_text: string | null
  required: boolean
  is_active: boolean
  show_in_list: boolean
  sort_order: number
}

export function useCustomFields(entity: Entity, opts: { activeOnly?: boolean } = {}) {
  const activeOnly = opts.activeOnly ?? true
  return useQuery<CustomFieldDef[]>({
    queryKey: ['custom-fields', entity, activeOnly],
    queryFn: () => api.get('/v1/admin/custom-fields', {
      params: { entity, active_only: activeOnly ? 1 : 0 },
    }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

/* ── Form ──────────────────────────────────────────────────── */

export function CustomFieldsForm({
  entity,
  values,
  onChange,
  errors,
  inputClassName = '',
  layout = 'grid',
}: {
  entity: Entity
  values: Record<string, any>
  onChange: (next: Record<string, any>) => void
  /**
   * Per-field validation errors from the backend, keyed by field key.
   * Comes from a 422 response shaped `{ errors: { 'custom_data.allergies': ['Required'] } }`
   * — strip the `custom_data.` prefix when extracting. See
   * `extractCustomFieldErrors()` below.
   */
  errors?: Record<string, string[]>
  inputClassName?: string
  /** 'grid' = 2-col responsive grid for create/edit forms; 'stack' = single column for narrow drawers. */
  layout?: 'grid' | 'stack'
}) {
  const { data: fields } = useCustomFields(entity)

  if (!fields || fields.length === 0) return null

  const setVal = (key: string, val: any) => onChange({ ...values, [key]: val })

  const wrapperClass = layout === 'grid'
    ? 'grid grid-cols-1 md:grid-cols-2 gap-3'
    : 'space-y-2'

  return (
    <div className="border-t border-dark-border pt-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wide font-bold text-purple-300">Custom fields</span>
      </div>
      <div className={wrapperClass}>
        {fields.map(f => {
          const fieldErrors = errors?.[f.key]
          const hasError = !!fieldErrors?.length
          return (
            <div key={f.id} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
              <label className="block text-xs text-[#a0a0a0] mb-1">
                {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <FieldInput
                field={f}
                value={values[f.key]}
                onChange={(v) => setVal(f.key, v)}
                className={`${inputClassName} ${hasError ? 'border-red-500/60 focus:border-red-500' : ''}`}
              />
              {hasError ? (
                <p className="text-[10px] text-red-400 mt-0.5 font-semibold leading-snug">{fieldErrors[0]}</p>
              ) : f.help_text ? (
                <p className="text-[10px] text-[#636366] mt-0.5 leading-snug">{f.help_text}</p>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Pull custom-field errors out of a Laravel 422 response. Returns a
 * map of `{ field_key: ['error'] }` ready to feed into
 * <CustomFieldsForm errors=... />.
 *
 * Usage:
 *   onError: (err) => setCfErrors(extractCustomFieldErrors(err))
 */
export function extractCustomFieldErrors(err: any): Record<string, string[]> {
  const raw = err?.response?.data?.errors
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('custom_data.') && Array.isArray(v)) {
      out[k.slice('custom_data.'.length)] = v as string[]
    }
  }
  return out
}

function FieldInput({ field, value, onChange, className }: {
  field: CustomFieldDef
  value: any
  onChange: (v: any) => void
  className: string
}) {
  const opts = field.config?.options ?? []

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className={`${className} resize-none`}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={className}
        />
      )
    case 'date':
      // Backend returns ISO8601; date input wants YYYY-MM-DD. Trim to first 10.
      return (
        <input
          type="date"
          value={value ? String(value).slice(0, 10) : ''}
          onChange={e => onChange(e.target.value || null)}
          className={className}
        />
      )
    case 'email':
      return (
        <input
          type="email"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className={className}
        />
      )
    case 'phone':
      return (
        <input
          type="tel"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className={className}
        />
      )
    case 'url':
      return (
        <input
          type="url"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder="https://"
          className={className}
        />
      )
    case 'select':
      return (
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          className={className}
        >
          <option value="">-- Select --</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    case 'multiselect': {
      const current: string[] = Array.isArray(value) ? value : []
      const toggle = (opt: string) => {
        const next = current.includes(opt) ? current.filter(x => x !== opt) : [...current, opt]
        onChange(next)
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {opts.map(o => {
            const on = current.includes(o)
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className={`text-xs px-2 py-1 rounded-md border transition ${
                  on
                    ? 'bg-accent text-black border-accent font-bold'
                    : 'bg-dark-bg border-dark-border text-t-secondary hover:text-white'
                }`}
              >
                {o}
              </button>
            )
          })}
        </div>
      )
    }
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer text-sm text-white">
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
            className="accent-primary-500 w-4 h-4"
          />
          <span className="text-xs text-t-secondary">Yes</span>
        </label>
      )
    case 'text':
    default:
      return (
        <input
          type="text"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className={className}
        />
      )
  }
}

/* ── Display ───────────────────────────────────────────────── */

export function CustomFieldsDisplay({ entity, values, dense }: {
  entity: Entity
  values: Record<string, any> | null | undefined
  /** Compact label-on-top layout for narrow profile columns. */
  dense?: boolean
}) {
  const { data: fields } = useCustomFields(entity)

  if (!fields || fields.length === 0) return null

  // Only render fields that actually have a value — empty rows on a
  // detail page just add visual noise.
  const visible = fields.filter(f => {
    const v = values?.[f.key]
    if (v === null || v === undefined || v === '') return false
    if (Array.isArray(v) && v.length === 0) return false
    return true
  })

  if (visible.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide font-bold text-purple-300">Custom fields</div>
      <div className={dense ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
        {visible.map(f => (
          <div key={f.id}>
            <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">{f.label}</p>
            <DisplayValue field={f} value={values![f.key]} />
          </div>
        ))}
      </div>
    </div>
  )
}

function DisplayValue({ field, value }: { field: CustomFieldDef; value: any }) {
  if (field.type === 'checkbox') {
    return <p className="text-sm text-white mt-0.5">{value ? 'Yes' : 'No'}</p>
  }
  if (field.type === 'multiselect' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1 mt-0.5">
        {value.map(v => (
          <span key={v} className="text-[11px] px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border text-white">
            {v}
          </span>
        ))}
      </div>
    )
  }
  if (field.type === 'date' && value) {
    const d = new Date(value)
    if (!isNaN(d.getTime())) {
      return <p className="text-sm text-white mt-0.5 font-mono">{d.toLocaleDateString()}</p>
    }
  }
  if (field.type === 'url' && value) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline mt-0.5 block break-all">
        {value}
      </a>
    )
  }
  if (field.type === 'email' && value) {
    return <a href={`mailto:${value}`} className="text-sm text-accent hover:underline mt-0.5 block">{value}</a>
  }
  if (field.type === 'phone' && value) {
    return <a href={`tel:${value}`} className="text-sm text-accent hover:underline mt-0.5 block">{value}</a>
  }
  return (
    <p className={`text-sm text-white mt-0.5 ${field.type === 'textarea' ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>
      {String(value)}
    </p>
  )
}
