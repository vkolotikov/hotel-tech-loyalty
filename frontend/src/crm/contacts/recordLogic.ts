/**
 * Round 5 (owner 2026-11-12, "opening tabs, slides or popups … minimize copy"): a contact's and a company's record —
 * which tabs they have, which one the address names, the full page's address, and the organisation's own fields
 * (`custom_data`) as they are read, edited and sent. Pure, because the tests render to a string. The server decides
 * what a custom value may be (CustomFieldService::validate); these only shape what is shown and sent.
 */

export const CONTACT_TABS = ['overview', 'leads', 'activity', 'emails', 'fields'] as const
export type ContactTab = (typeof CONTACT_TABS)[number]

export const COMPANY_TABS = ['overview', 'people', 'leads', 'fields'] as const
export type CompanyTab = (typeof COMPANY_TABS)[number]

/** The tab the address names, or the record's first. */
export function contactTab(value: string | null | undefined): ContactTab {
  return (CONTACT_TABS as readonly string[]).includes(value ?? '') ? (value as ContactTab) : 'overview'
}

export function companyTab(value: string | null | undefined): CompanyTab {
  return (COMPANY_TABS as readonly string[]).includes(value ?? '') ? (value as CompanyTab) : 'overview'
}

/** A contact's own page (`/crm/contacts/:id`), on the tab the panel showed. */
export function contactPageHref(id: number, tab: string | null | undefined): string {
  const on = contactTab(tab)
  return on === 'overview' ? `/crm/contacts/${id}` : `/crm/contacts/${id}?tab=${on}`
}

/* ─── The organisation's own fields (custom_data) ──────────────────────────────────────────────── */

export type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'email' | 'phone' | 'url'

/** One of `GET custom-fields?entity=guest|corporate_account&active_only=1`. */
export interface CustomFieldDef {
  id: number
  entity: string
  key: string
  label: string
  type: CustomFieldType
  config: { options?: string[] } | null
  help_text: string | null
  required: boolean
  is_active?: boolean
  sort_order: number
}

export type CustomValues = Record<string, unknown>

/** The fields in the order the organisation set (Settings → Fields). */
export function orderedFields(fields: readonly CustomFieldDef[]): CustomFieldDef[] {
  return [...fields].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
}

function blank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0)
}

/** Whether a field holds something (a checkbox holds something once ticked or unticked on purpose). */
export function filled(field: CustomFieldDef, value: unknown): boolean {
  if (field.type === 'checkbox') return value === true
  return !blank(value)
}

/** How many of the fields hold a value (the Fields tab's count). */
export function filledCount(fields: readonly CustomFieldDef[], values: CustomValues | null | undefined): number {
  return fields.filter(field => filled(field, values?.[field.key])).length
}

/** A stored day (the server keeps an ISO date-time) as the calendar day it was written as: never converted. */
export function storedDay(value: unknown): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(typeof value === 'string' ? value : '')
  return m ? m[1] : ''
}

/** A value for reading: a list joined, a tick as yes or no, a day as written; '' for nothing. */
export function customText(field: CustomFieldDef, value: unknown, yes: string, no: string): string {
  if (field.type === 'checkbox') return value === true ? yes : value === false ? no : ''
  if (blank(value)) return ''
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (field.type === 'date') return storedDay(value) || String(value)
  return String(value)
}

/** What the edit form starts from: each field's stored value, a day as `YYYY-MM-DD`, a list as a list. */
export function customDraft(fields: readonly CustomFieldDef[], stored: CustomValues | null | undefined): CustomValues {
  const out: CustomValues = {}
  for (const field of fields) {
    const value = stored?.[field.key]
    if (field.type === 'checkbox') out[field.key] = value === true
    else if (field.type === 'multiselect') out[field.key] = Array.isArray(value) ? value.map(String) : []
    else if (field.type === 'date') out[field.key] = storedDay(value)
    else out[field.key] = blank(value) ? '' : String(value)
  }
  return out
}

/**
 * The `custom_data` a save sends: every field of the form with a value (a number as a number, a tick as true or
 * false, a list as a list), an emptied one left out — the server keeps only what it is sent for the active fields.
 */
export function customPayload(fields: readonly CustomFieldDef[], draft: CustomValues): CustomValues {
  const out: CustomValues = {}
  for (const field of fields) {
    const value = draft[field.key]
    if (field.type === 'checkbox') { out[field.key] = value === true; continue }
    if (field.type === 'multiselect') {
      const list = Array.isArray(value) ? value.map(String).filter(v => (field.config?.options ?? []).includes(v)) : []
      if (list.length) out[field.key] = list
      continue
    }
    if (blank(value)) continue
    const text = String(value).trim()
    out[field.key] = field.type === 'number' && Number.isFinite(Number(text)) ? Number(text) : text
  }
  return out
}

/** The required fields still empty (a checkbox always holds an answer). */
export function missingRequired(fields: readonly CustomFieldDef[], draft: CustomValues): string[] {
  return fields.filter(field => field.required && field.type !== 'checkbox' && blank(draft[field.key])).map(field => field.key)
}

/** The fields a 422 named (`custom_data.<key>`), by key. */
export function customErrorKeys(errors: Record<string, string[]> | undefined): string[] {
  return Object.keys(errors ?? {}).filter(k => k.startsWith('custom_data.')).map(k => k.slice('custom_data.'.length))
}

/** Whether two drafts hold the same values (Save stays off until something changed). */
export function sameDraft(a: CustomValues, b: CustomValues): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
