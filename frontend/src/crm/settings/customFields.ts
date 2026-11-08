/**
 * Custom fields (CustomFieldController): the venue's own fields on leads, contacts, companies and tasks. A field's
 * type is fixed once made (the controller refuses to change it: saved values would stop fitting); a deleted field's
 * values are kept and come back if one with the same name is made again. Pure.
 */
export const ENTITIES = ['inquiry', 'guest', 'corporate_account', 'task'] as const
export type Entity = (typeof ENTITIES)[number]

export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'checkbox', 'email', 'phone', 'url'] as const
export type CustomFieldType = (typeof FIELD_TYPES)[number]

export interface CustomField {
  id: number
  entity: Entity
  key: string
  label: string
  type: CustomFieldType
  config: { options?: string[] } | null
  help_text: string | null
  required: boolean
  is_active: boolean
  show_in_list: boolean
  sort_order: number
}

export const FIELD_LIMITS = { label: 120, help: 240 } as const

/** Whether a type picks from a list of options. */
export function hasOptions(type: CustomFieldType): boolean {
  return type === 'select' || type === 'multiselect'
}

export interface FieldForm {
  label: string
  type: CustomFieldType
  options: string
  help_text: string
  required: boolean
  is_active: boolean
  show_in_list: boolean
}

export function fieldForm(field: CustomField | null): FieldForm {
  return {
    label: field?.label ?? '',
    type: field?.type ?? 'text',
    options: (field?.config?.options ?? []).join('\n'),
    help_text: field?.help_text ?? '',
    required: field?.required ?? false,
    is_active: field?.is_active ?? true,
    show_in_list: field?.show_in_list ?? false,
  }
}

export function optionList(text: string): string[] {
  return [...new Set(text.split('\n').map(s => s.trim()).filter(Boolean))]
}

export type FieldProblem = 'label' | 'label_long' | 'help_long' | 'options'

export function fieldProblems(form: FieldForm): FieldProblem[] {
  const out: FieldProblem[] = []
  const label = form.label.trim()
  if (!label) out.push('label')
  else if (label.length > FIELD_LIMITS.label) out.push('label_long')
  if (form.help_text.trim().length > FIELD_LIMITS.help) out.push('help_long')
  if (hasOptions(form.type) && optionList(form.options).length === 0) out.push('options')
  return out
}

/** The body of POST custom-fields (a new one names its record type and its type). */
export function createPayload(form: FieldForm, entity: Entity): Record<string, unknown> {
  return { entity, type: form.type, ...updatePayload(form) }
}

/** The body of PUT custom-fields/{id}: never the type. */
export function updatePayload(form: FieldForm): Record<string, unknown> {
  return {
    label: form.label.trim(),
    config: hasOptions(form.type) ? { options: optionList(form.options) } : null,
    help_text: form.help_text.trim() || null,
    required: form.required,
    is_active: form.is_active,
    show_in_list: form.show_in_list,
  }
}

/** One record type's fields in their order. */
export function fieldsOf(fields: readonly CustomField[], entity: Entity): CustomField[] {
  return fields.filter(f => f.entity === entity).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
}

/** How many fields each record type has (for the pills). */
export function countsByEntity(fields: readonly CustomField[]): Record<Entity, number> {
  const out = Object.fromEntries(ENTITIES.map(e => [e, 0])) as Record<Entity, number>
  for (const f of fields) if (f.entity in out) out[f.entity]++
  return out
}
