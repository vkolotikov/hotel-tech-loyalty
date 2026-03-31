import { useQuery } from '@tanstack/react-query'
import { api, API_BASE } from './api'

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
  event_types: string[]
  function_spaces: string[]
  industries: string[]
  rate_types: string[]
  countries: string[]
  default_inquiry_value: number
  currency_symbol: string
  company_name: string
  date_format: string
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
  event_types: ['Meeting', 'Conference', 'Wedding', 'Gala Dinner', 'Corporate Retreat'],
  function_spaces: ['Grand Ballroom', 'Conference Room 1', 'Meeting Room', 'Terrace'],
  industries: ['Technology', 'Finance', 'Consulting', 'Pharmaceutical', 'Automotive'],
  rate_types: ['Fixed Rate', 'Percentage Discount', 'Best Available Rate Minus'],
  countries: ['Germany', 'Austria', 'Switzerland', 'United Kingdom', 'France', 'Italy', 'Spain', 'USA', 'UAE'],
  default_inquiry_value: 0,
  currency_symbol: '€',
  company_name: 'Hotel Group',
  date_format: 'Y-m-d',
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
