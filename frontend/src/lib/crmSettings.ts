import { useQuery } from '@tanstack/react-query'
import { api, API_BASE } from './api'

/**
 * Field-visibility config for CRM entities. Stored under per-entity
 * keys in `crm_settings` (`inquiry_fields`, `customer_fields`,
 * `corporate_fields`, `deal_fields`). Lets admins hide fields from
 * each entity's listing + add-new form without touching code.
 *
 * Always-shown fields (the identity column, status column, actions)
 * are NOT toggleable — they live outside this config to keep the UI
 * usable when an admin turns everything off.
 *
 * Adding a new toggleable field: add the key here, default it to true
 * in the matching `DEFAULT_*` const, wire the consumer page to gate
 * its render on `settings.<entity>_fields.<section>.<key>`. The
 * deep-merge in `useSettings()` fills missing keys for orgs that
 * saved a partial config before the new field existed — no migration
 * needed.
 */
export interface InquiryFieldConfig {
  form: {
    check_in: boolean
    check_out: boolean
    num_rooms: boolean
    inquiry_type: boolean
    source: boolean
    room_type: boolean
    rate_offered: boolean
    total_value: boolean
    status: boolean
    priority: boolean
    assigned_to: boolean
    special_requests: boolean
    notes: boolean
  }
  list: {
    stay: boolean
    value: boolean
    owner: boolean        // covers owner + source chip (combined column in v2 row)
    touches: boolean      // touch counters; in v2 row they fold into the AI signal hover popover
    next_task: boolean
    bulk_select: boolean
    country: boolean      // small country chip in the guest cell — handy for international hotels / clinics
    ai_signal: boolean    // v2 column: AI win probability + going-cold risk
  }
  detail: {
    contact_section: boolean           // email + phone block on the profile column
    stay_section: boolean              // check-in / check-out / rooms / adults / children
    special_requests: boolean
    pipeline_section: boolean          // property / priority / source block
    linked_reservation: boolean        // confirmation-no chip when a reservation exists
    custom_fields_section: boolean
    guest_profile_link: boolean        // "Open guest profile →" link at the bottom
    ai_smart_panel: boolean            // AI brief + intent + win prob + suggested action
    open_tasks: boolean                // tasks list in the right column
    attachments: boolean               // file attachments panel
  }
}

export interface CustomerFieldConfig {
  form: {
    // Add-Customer drawer fields. `full_name` is required and stays
    // out of this config. Drives both the standalone NewCustomerDrawer
    // and the "New customer" inline path inside AddInquiryDrawer.
    first_last_names: boolean   // First name + Last name pair
    email: boolean
    phone: boolean
    company: boolean
    position_title: boolean
    guest_type: boolean         // Individual / Corporate / Travel Agent…
    vip_level: boolean
    importance: boolean
    nationality: boolean
    country: boolean
    city: boolean
    notes: boolean
  }
  list: {
    contact: boolean        // email + phone column
    company: boolean        // company chip
    activity: boolean       // stays count / added-date column
    vip_badge: boolean      // VIP star pill on the row
    position_title: boolean // job title under the name
    country: boolean        // small country chip in the name cell
  }
  detail: {
    header_pills: boolean         // lifecycle / VIP / lead-source pills above stats
    stats_strip: boolean          // Total Stays / Nights / Revenue / Last Stay row
    profile_b2b: boolean          // company + guest type + owner + importance
    profile_location: boolean     // country / city / address
    profile_hotel_prefs: boolean  // preferred room / floor / language / dietary
    profile_dates: boolean        // last activity + first stay dates
    tags: boolean
    notes: boolean
    activity_log: boolean         // the timeline component on the right
    recent_reservations: boolean
    recent_inquiries: boolean
  }
}

export interface CorporateFieldConfig {
  list: {
    industry: boolean
    contact_person: boolean
    account_manager: boolean
    contract: boolean        // contract start/end column
    rate: boolean
    discount: boolean
    revenue: boolean
    status: boolean
  }
  detail: {
    vitals_strip: boolean    // 4 KPI cards: LTV / Open pipeline / Credit / Last contact
    renewal_chip: boolean    // "Renewal soon" amber banner
    info_billing: boolean    // billing_email + tax_id + rate_type + payment_terms grid
    info_address: boolean    // billing_address paragraph
    info_notes: boolean      // free-form notes
    custom_fields: boolean   // the CustomFieldsDisplay block
    linked_deals: boolean    // recent_inquiries list
    recent_reservations: boolean
  }
}

export interface DealFieldConfig {
  list: {
    product_details: boolean
    amount: boolean
    payment: boolean
    fulfillment: boolean
    next_action: boolean
    due_date: boolean
    owner: boolean
  }
}

export interface TaskFieldConfig {
  list: {
    description: boolean   // multi-line task description under the title
    type_label: boolean    // uppercase "CALL" / "EMAIL" / etc. chip (icon stays)
    due_at: boolean        // due date inline
    assignee: boolean      // assigned staff name
    inquiry_link: boolean  // "Inquiry #123" clickable link
    outcome: boolean       // completion outcome on done tasks
  }
}

export interface MemberFieldConfig {
  list: {
    kpi_strip: boolean   // 4-card health strip above the table
    phone: boolean
    source: boolean      // lead-source pill
    tier: boolean
    points: boolean
    joined: boolean
    status: boolean      // active/inactive pill
  }
  detail: {
    hero_stats: boolean              // Stays / Total spent / Member since secondary row (current points always shown)
    ai_analysis_button: boolean      // button in the header that triggers churn/upsell AI
    tab_transactions: boolean        // show the Transactions tab
    tab_journey: boolean             // show the Journey tab (still gated by linkedGuest)
    tab_settings: boolean            // show the Settings tab
    overview_recent_activity: boolean // top-5 transactions card on Overview
    overview_qr_card: boolean         // MemberQrCard on Overview's right column
    overview_adjust_points: boolean   // Award / Redeem panel on Overview
  }
}

export const DEFAULT_INQUIRY_FIELDS: InquiryFieldConfig = {
  form: {
    check_in: true, check_out: true, num_rooms: true,
    inquiry_type: true, source: true, room_type: true,
    rate_offered: true, total_value: true,
    status: true, priority: true, assigned_to: true,
    special_requests: true, notes: true,
  },
  list: {
    stay: true, value: true, owner: true,
    touches: true, next_task: true,
    bulk_select: false, // hidden by default — admins opt in
    country: false,     // off by default — niche for most orgs
    ai_signal: true,    // v2 row default-on; cells render blank when there's no AI run yet so no churn for legacy data
  },
  detail: {
    contact_section: true, stay_section: true,
    special_requests: true, pipeline_section: true,
    linked_reservation: true, custom_fields_section: true,
    guest_profile_link: true,
    ai_smart_panel: true, open_tasks: true, attachments: true,
  },
}

export const DEFAULT_CUSTOMER_FIELDS: CustomerFieldConfig = {
  form: {
    // Sensible defaults: contact + company + identity classifications.
    // Location bits + first/last split off by default — niche fields.
    first_last_names: false,
    email: true, phone: true,
    company: true, position_title: true,
    guest_type: true, vip_level: true, importance: true,
    nationality: false, country: false, city: false,
    notes: true,
  },
  list: {
    contact: true, company: true, activity: true,
    vip_badge: true, position_title: true,
    country: false,  // off by default — admins opt in
  },
  detail: {
    header_pills: true, stats_strip: true,
    profile_b2b: true, profile_location: true,
    profile_hotel_prefs: true, profile_dates: true,
    tags: true, notes: true,
    activity_log: true, recent_reservations: true, recent_inquiries: true,
  },
}

export const DEFAULT_CORPORATE_FIELDS: CorporateFieldConfig = {
  list: {
    industry: true, contact_person: true, account_manager: true,
    contract: true, rate: true, discount: true,
    revenue: true, status: true,
  },
  detail: {
    vitals_strip: true, renewal_chip: true,
    info_billing: true, info_address: true, info_notes: true,
    custom_fields: true, linked_deals: true, recent_reservations: true,
  },
}

export const DEFAULT_DEAL_FIELDS: DealFieldConfig = {
  list: {
    product_details: true, amount: true, payment: true,
    fulfillment: true, next_action: true, due_date: true,
    owner: true,
  },
}

export const INQUIRY_LIST_FIELD_META: Array<{ key: keyof InquiryFieldConfig['list']; label: string; description?: string }> = [
  { key: 'bulk_select', label: 'Bulk select', description: 'Checkbox column for multi-row actions' },
  { key: 'country', label: 'Guest country', description: 'Shows guest nationality / flag in the identity cell' },
  { key: 'stay', label: 'Stay / Event', description: 'Check-in → check-out + room count, or event name + pax' },
  { key: 'value', label: 'Value', description: 'Estimated total value (currency-aware)' },
  { key: 'ai_signal', label: 'AI signal', description: 'Win probability + going-cold risk — hover for the suggested next action' },
  { key: 'owner', label: 'Owner + Source', description: 'Assigned salesperson plus the channel the lead came from' },
  { key: 'touches', label: 'Touches', description: 'Outreach activity counters (folded into the AI signal hover popover in v2 — leave off unless you need a dedicated column)' },
  { key: 'next_task', label: 'Next action', description: 'Upcoming task with relative due-date colour-coding' },
]

export const DEAL_LIST_FIELD_META: Array<{ key: keyof DealFieldConfig['list']; label: string; description?: string }> = [
  { key: 'product_details', label: 'Product details' },
  { key: 'amount', label: 'Amount' },
  { key: 'payment', label: 'Payment status' },
  { key: 'fulfillment', label: 'Fulfillment stage' },
  { key: 'next_action', label: 'Next action' },
  { key: 'due_date', label: 'Due date' },
  { key: 'owner', label: 'Owner' },
]

export const DEFAULT_TASK_FIELDS: TaskFieldConfig = {
  list: {
    description: true, type_label: true, due_at: true,
    assignee: true, inquiry_link: true, outcome: true,
  },
}

export const DEFAULT_MEMBER_FIELDS: MemberFieldConfig = {
  list: {
    kpi_strip: true,
    phone: true, source: true, tier: true,
    points: true, joined: true, status: true,
  },
  detail: {
    hero_stats: true, ai_analysis_button: true,
    tab_transactions: true, tab_journey: true, tab_settings: true,
    overview_recent_activity: true,
    overview_qr_card: true, overview_adjust_points: true,
  },
}

export interface CrmSettings {
  employees: string[]
  lead_owners: string[]
  account_managers: string[]
  property_types: string[]
  room_types: string[]
  meal_plans: string[]
  inquiry_types: string[]
  inquiry_statuses: string[]
  closed_statuses: string[]
  reservation_statuses: string[]
  payment_statuses: string[]
  payment_methods: string[]
  booking_channels: string[]
  lead_sources: string[]
  vip_levels: string[]
  guest_types: string[]
  salutations: string[]
  lifecycle_statuses: string[]
  importance_levels: string[]
  task_types: string[]
  reservation_task_types: string[]
  task_urgencies: string[]
  priorities: string[]
  planner_groups: string[]
  /** Sidebar group labels the admin has hidden via Settings → Menu. */
  hidden_nav_groups: string[]
  event_types: string[]
  function_spaces: string[]
  industries: string[]
  rate_types: string[]
  countries: string[]
  default_inquiry_value: number
  currency_symbol: string
  company_name: string
  date_format: string
  inquiry_fields: InquiryFieldConfig
  customer_fields: CustomerFieldConfig
  corporate_fields: CorporateFieldConfig
  deal_fields: DealFieldConfig
  member_fields: MemberFieldConfig
  task_fields: TaskFieldConfig
}

const DEFAULTS: CrmSettings = {
  employees: [], lead_owners: [], account_managers: [],
  property_types: ['Hotel', 'Resort', 'Boutique Hotel'],
  room_types: ['Standard', 'Superior', 'Deluxe', 'Junior Suite', 'Executive Suite', 'Presidential Suite'],
  meal_plans: ['Room Only', 'Bed & Breakfast', 'Half Board', 'Full Board', 'All Inclusive'],
  inquiry_types: ['Room Reservation', 'Group Booking', 'Event/MICE', 'Wedding', 'Conference', 'Corporate Rate', 'Long Stay'],
  inquiry_statuses: ['New', 'Responded', 'Site Visit', 'Proposal Sent', 'Negotiating', 'Tentative', 'Confirmed', 'Lost'],
  closed_statuses: ['Confirmed', 'Lost'],
  reservation_statuses: ['Confirmed', 'Checked In', 'Checked Out', 'Cancelled', 'No Show'],
  payment_statuses: ['Pending', 'Deposit Paid', 'Fully Paid', 'Refunded', 'Comp'],
  payment_methods: ['Credit Card', 'Bank Transfer', 'Cash', 'OTA Collect', 'Corporate Invoice'],
  booking_channels: ['Direct', 'Phone', 'Email', 'Website', 'Booking.com', 'Expedia', 'Travel Agent', 'Corporate', 'Walk-in'],
  lead_sources: ['Website', 'Phone', 'Email', 'Walk-in', 'Booking.com', 'Expedia', 'Travel Agent', 'Referral', 'Social Media'],
  vip_levels: ['Standard', 'Silver', 'Gold', 'Platinum', 'Diamond'],
  guest_types: ['Individual', 'Corporate', 'Travel Agent', 'Group Leader'],
  salutations: ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'],
  lifecycle_statuses: ['Prospect', 'First-Time Guest', 'Returning Guest', 'VIP', 'Corporate', 'Inactive'],
  importance_levels: ['Standard', 'Important', 'VIP', 'VVIP'],
  task_types: ['Call', 'Email', 'WhatsApp', 'Site Visit', 'Follow-up', 'Send Proposal'],
  reservation_task_types: ['Room Assignment', 'Welcome Amenity', 'Airport Transfer', 'Special Setup'],
  task_urgencies: ['Low', 'Medium', 'High', 'Urgent'],
  priorities: ['Low', 'Medium', 'High'],
  planner_groups: ['Front Office', 'Housekeeping', 'F&B', 'Sales', 'Events', 'Maintenance'],
  hidden_nav_groups: [],
  event_types: ['Meeting', 'Conference', 'Wedding', 'Gala Dinner', 'Corporate Retreat'],
  function_spaces: ['Grand Ballroom', 'Conference Room 1', 'Meeting Room', 'Terrace'],
  industries: ['Technology', 'Finance', 'Consulting', 'Pharmaceutical', 'Automotive'],
  rate_types: ['Fixed Rate', 'Percentage Discount', 'Best Available Rate Minus'],
  countries: ['Germany', 'Austria', 'Switzerland', 'United Kingdom', 'France', 'Italy', 'Spain', 'USA', 'UAE'],
  default_inquiry_value: 0,
  currency_symbol: '€',
  company_name: 'Hotel Group',
  date_format: 'Y-m-d',
  inquiry_fields: DEFAULT_INQUIRY_FIELDS,
  customer_fields: DEFAULT_CUSTOMER_FIELDS,
  corporate_fields: DEFAULT_CORPORATE_FIELDS,
  deal_fields: DEFAULT_DEAL_FIELDS,
  member_fields: DEFAULT_MEMBER_FIELDS,
  task_fields: DEFAULT_TASK_FIELDS,
}

export function useSettings(): CrmSettings {
  const { data } = useQuery<Record<string, any>>({
    queryKey: ['crm-settings'],
    queryFn: () => api.get('/v1/admin/crm-settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  if (!data) return DEFAULTS

  const merged: any = { ...DEFAULTS }
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined) continue
    let parsed: any = val
    if (typeof val === 'string') {
      try { parsed = JSON.parse(val) } catch { /* keep as string */ }
    }
    // If an object with numeric keys came back (PHP associative array), convert to array
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const defaultVal = (DEFAULTS as any)[key]
      if (Array.isArray(defaultVal)) {
        parsed = Object.values(parsed)
      }
    }
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
      parsed = parsed.map((g: any) => g.name ?? String(g))
    }
    // Ensure array fields stay arrays
    if (Array.isArray((DEFAULTS as any)[key]) && !Array.isArray(parsed)) {
      continue // skip bad value, keep default
    }
    merged[key] = parsed
  }

  // Deep-merge per-entity field configs so adding a new toggleable
  // field in code doesn't break orgs that saved a partial config
  // before the field existed. Server value wins where present;
  // defaults fill the gaps.
  if (merged.inquiry_fields && typeof merged.inquiry_fields === 'object') {
    merged.inquiry_fields = {
      form:   { ...DEFAULT_INQUIRY_FIELDS.form,   ...(merged.inquiry_fields.form   ?? {}) },
      list:   { ...DEFAULT_INQUIRY_FIELDS.list,   ...(merged.inquiry_fields.list   ?? {}) },
      detail: { ...DEFAULT_INQUIRY_FIELDS.detail, ...(merged.inquiry_fields.detail ?? {}) },
    }
  } else {
    merged.inquiry_fields = DEFAULT_INQUIRY_FIELDS
  }
  if (merged.customer_fields && typeof merged.customer_fields === 'object') {
    merged.customer_fields = {
      form:   { ...DEFAULT_CUSTOMER_FIELDS.form,   ...(merged.customer_fields.form   ?? {}) },
      list:   { ...DEFAULT_CUSTOMER_FIELDS.list,   ...(merged.customer_fields.list   ?? {}) },
      detail: { ...DEFAULT_CUSTOMER_FIELDS.detail, ...(merged.customer_fields.detail ?? {}) },
    }
  } else {
    merged.customer_fields = DEFAULT_CUSTOMER_FIELDS
  }
  if (merged.corporate_fields && typeof merged.corporate_fields === 'object') {
    merged.corporate_fields = {
      list:   { ...DEFAULT_CORPORATE_FIELDS.list,   ...(merged.corporate_fields.list   ?? {}) },
      detail: { ...DEFAULT_CORPORATE_FIELDS.detail, ...(merged.corporate_fields.detail ?? {}) },
    }
  } else {
    merged.corporate_fields = DEFAULT_CORPORATE_FIELDS
  }
  if (merged.deal_fields && typeof merged.deal_fields === 'object') {
    merged.deal_fields = {
      list: { ...DEFAULT_DEAL_FIELDS.list, ...(merged.deal_fields.list ?? {}) },
    }
  } else {
    merged.deal_fields = DEFAULT_DEAL_FIELDS
  }
  if (merged.member_fields && typeof merged.member_fields === 'object') {
    merged.member_fields = {
      list:   { ...DEFAULT_MEMBER_FIELDS.list,   ...(merged.member_fields.list   ?? {}) },
      detail: { ...DEFAULT_MEMBER_FIELDS.detail, ...(merged.member_fields.detail ?? {}) },
    }
  } else {
    merged.member_fields = DEFAULT_MEMBER_FIELDS
  }
  if (merged.task_fields && typeof merged.task_fields === 'object') {
    merged.task_fields = {
      list: { ...DEFAULT_TASK_FIELDS.list, ...(merged.task_fields.list ?? {}) },
    }
  } else {
    merged.task_fields = DEFAULT_TASK_FIELDS
  }

  return merged
}

export async function triggerExport(path: string, params: Record<string, any> = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== null && v !== undefined) qs.set(k, String(v))
  }
  const token = localStorage.getItem('auth_token')
  const base = API_BASE
  const url = `${base}${path}${qs.toString() ? '?' + qs.toString() : ''}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/csv' } })
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (res.headers.get('content-disposition') ?? '').match(/filename="?([^"]+)"?/)?.[1] ?? 'export.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
