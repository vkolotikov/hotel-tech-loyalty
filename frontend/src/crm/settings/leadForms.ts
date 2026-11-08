/**
 * Lead forms (LeadFormController): forms on the venue's website that send leads straight into the CRM. A form is
 * edited as a draft and saved as the fields that changed (PUT takes any of them). Its public page is `/form/<key>`,
 * as the full admin builds it. Pure.
 */
export type FieldType = 'text' | 'textarea' | 'email' | 'phone' | 'date' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'url'

export interface FormField {
  key: string
  type: FieldType
  label: string
  placeholder?: string
  required: boolean
  enabled: boolean
  options?: string[]
  options_source?: string
  help_text?: string
}

export interface FormDesign {
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

export interface LeadFormSummary {
  id: number
  name: string
  embed_key: string
  description: string | null
  is_active: boolean
  submission_count: number
  last_submitted_at: string | null
  updated_at: string | null
}

export interface LeadForm extends LeadFormSummary {
  default_source: string | null
  default_inquiry_type: string | null
  fields: FormField[]
  design: FormDesign
}

export interface Submission {
  id: number
  payload: Record<string, unknown> | null
  inquiry_id: number | null
  status: string | null
  created_at: string
  guest: { id: number; full_name: string | null; email: string | null; phone: string | null } | null
}

export const FORM_LIMITS = { name: 120, description: 500, source: 100, inquiry_type: 50 } as const
export const CUSTOM_TYPES: readonly FieldType[] = ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'checkbox', 'email', 'phone', 'url']

/** The form's public page and the frame that shows it on a website (the full admin's snippet). */
export function formUrl(origin: string, embedKey: string): string {
  return `${origin.replace(/\/+$/, '')}/form/${embedKey}`
}

export function iframeSnippet(url: string): string {
  return `<iframe src="${url}" width="100%" height="700" frameborder="0" style="border: 0; max-width: 600px;"></iframe>`
}

/** What can be edited of a form. */
export type FormDraft = Pick<LeadForm, 'name' | 'description' | 'is_active' | 'default_source' | 'default_inquiry_type' | 'fields' | 'design'>

export function formDraft(form: LeadForm): FormDraft {
  return {
    name: form.name,
    description: form.description,
    is_active: form.is_active,
    default_source: form.default_source,
    default_inquiry_type: form.default_inquiry_type,
    fields: form.fields ?? [],
    design: form.design,
  }
}

/** The fields of the draft that differ from what is saved: the body of PUT lead-forms/{id}. */
export function formPatch(saved: FormDraft, draft: FormDraft): Partial<FormDraft> {
  const out: Partial<FormDraft> = {}
  for (const key of Object.keys(draft) as (keyof FormDraft)[]) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(saved[key])) (out as Record<string, unknown>)[key] = draft[key]
  }
  if ('name' in out) out.name = (out.name ?? '').trim()
  if ('default_source' in out) out.default_source = out.default_source?.trim() || null
  if ('default_inquiry_type' in out) out.default_inquiry_type = out.default_inquiry_type?.trim() || null
  return out
}

export type FormProblem = 'name' | 'too_long' | 'field_label'

export function formProblems(draft: FormDraft): FormProblem[] {
  const out: FormProblem[] = []
  if (!draft.name.trim()) out.push('name')
  if (draft.name.trim().length > FORM_LIMITS.name || (draft.description ?? '').length > FORM_LIMITS.description
    || (draft.default_source ?? '').length > FORM_LIMITS.source || (draft.default_inquiry_type ?? '').length > FORM_LIMITS.inquiry_type) out.push('too_long')
  if (draft.fields.some(f => f.enabled && !f.label.trim())) out.push('field_label')
  return out
}

/** The fields with one changed. */
export function setField(fields: readonly FormField[], index: number, patch: Partial<FormField>): FormField[] {
  return fields.map((f, i) => (i === index ? { ...f, ...patch } : f))
}

/** A new field of the venue's own, at the end: shown, optional, a single line. `id` makes its key unique. */
export function addCustomField(fields: readonly FormField[], id: string, label: string): FormField[] {
  return [...fields, { key: `custom:${id}`, type: 'text', label, placeholder: '', required: false, enabled: true }]
}

/** Only the venue's own fields can be removed; the built-in ones are switched off instead. */
export function isCustom(field: FormField): boolean {
  return field.key.startsWith('custom:')
}

/** A list's options as typed, one per line. */
export function optionsFromText(text: string): string[] {
  return text.split('\n').map(s => s.trim()).filter(Boolean)
}

/** Who sent a submission, and how to reach them. */
export function submitter(sub: Submission): { name: string | null; email: string | null } {
  const payload = sub.payload ?? {}
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    name: sub.guest?.full_name ?? str(payload.name),
    email: sub.guest?.email ?? str(payload.email),
  }
}
