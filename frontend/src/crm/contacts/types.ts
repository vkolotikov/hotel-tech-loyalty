/**
 * What the full admin's contact endpoints answer (App\Http\Controllers\Api\V1\Admin\GuestController,
 * GuestMergeController, CorporateAccountController). Only the fields HexaTech CRM shows are typed; the loyalty ones
 * (member, tier, points) are left out on purpose: an organisation on the CRM module has no programme.
 */

/** Laravel's paginator, as `->paginate()` answers it. */
export interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  total: number
  per_page: number
}

/** One row of `guests` (GET guests, GET guests/{id}). */
export interface Guest {
  id: number
  full_name: string
  first_name: string | null
  last_name: string | null
  salutation?: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  company: string | null
  position_title: string | null
  country: string | null
  city: string | null
  address?: string | null
  postal_code?: string | null
  nationality?: string | null
  preferred_language?: string | null
  lead_source: string | null
  owner_name: string | null
  lifecycle_status: string | null
  importance: string | null
  notes?: string | null
  last_activity_at?: string | null
  created_at: string | null
  updated_at?: string | null
  tags?: GuestTag[]
}

/** GET guests/facets: the values that exist in this organisation, for the filters. */
export interface Facets {
  country: string[]
  nationality: string[]
  lead_source: string[]
  owner_name: string[]
  loyalty_tier: string[]
}

/** GET guests/tags. */
export interface GuestTag {
  id: number
  name: string
  color?: string | null
}

/** GET guests/segments: a saved set of the list's filters. */
export interface Segment {
  id: number
  name: string
  filters: Record<string, unknown> | unknown[] | null
}

/** GET guests/{id}/activities: one line of a contact's timeline. */
export interface GuestActivity {
  id: number
  type: string
  description: string
  performed_by: string | null
  created_at: string | null
}

/** GET guests/{id}/inquiries: one of a contact's leads. */
export interface GuestLead {
  id: number
  status: string | null
  inquiry_type: string | null
  source: string | null
  total_value: string | number | null
  next_task_type: string | null
  next_task_due: string | null
  next_task_completed?: boolean
  created_at: string | null
}

/** GET guests/{id}/delete-impact: what goes with a contact. */
export interface DeleteImpact {
  inquiries: number
  reservations: number
  activities: number
}

/** One pair of GET guests/duplicates: the older row is suggested as the one kept. */
export interface DuplicatePair {
  reason: 'shared_email' | 'shared_phone' | 'shared_name_context' | string
  winner: DuplicateGuest
  loser: DuplicateGuest
}

export interface DuplicateGuest {
  id: number
  full_name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  company: string | null
  city: string | null
  country: string | null
  lifecycle_status: string | null
  created_at: string | null
  last_activity_at: string | null
}

/** One row of GET corporate-accounts. */
export interface Company {
  id: number
  company_name: string
  industry: string | null
  tax_id: string | null
  billing_address: string | null
  billing_email: string | null
  contact_person: string | null
  contact_email: string | null
  contact_phone: string | null
  account_manager: string | null
  contract_start: string | null
  contract_end: string | null
  payment_terms: string | null
  credit_limit: string | number | null
  status: string | null
  notes: string | null
  created_at?: string | null
}

/** GET corporate-accounts/{id}: the row with its vitals and latest leads. */
export interface CompanyDetail extends Company {
  inquiries_count?: number
  ltv?: {
    open_pipeline_value: number
    open_pipeline_count: number
    last_contact_at: string | null
    renewal_soon: boolean
  }
  recent_inquiries?: {
    id: number
    guest_name: string | null
    inquiry_type: string | null
    total_value: string | number | null
    status: string | null
    created_at: string | null
  }[]
}
