import { base } from '../book/testUtils'
import type { PortalBootstrap, StayAvailability, StayCatalogue, StayQuote } from '../../lib/types'

/** Fixtures for the stay flow's tests; the render helpers are `pages/book/testUtils`' own. */

export const stayCatalogue: StayCatalogue = {
  rooms: [
    { id: '101', name: 'Sea view', description: null, short_description: 'A balcony over the bay', max_guests: 2, bedrooms: 1, bed_type: 'King', size: '24 m²', image: null, gallery: [], amenities: ['Balcony'], tags: [], base_price: 100 },
    { id: '102', name: 'Garden', description: null, short_description: null, max_guests: 3, bedrooms: 1, bed_type: null, size: null, image: null, gallery: [], amenities: [], tags: [], base_price: 90 },
  ],
  extras: [{ id: '3', name: 'Breakfast', description: null, price: 15, price_type: 'per_stay', lead_time_hours: 0, image: null, icon: null, category: null }],
  policies: { check_in_time: '15:00', check_out_time: '11:00', cancellation_policy: 'Free until two days before.', payment_terms: null, cancel_hours: 48 },
  rules: { currency: 'EUR', min_nights: 1, max_nights: 30 },
  pricing: { automatic: { label: '10% off stays', type: 'percent_discount', value: 10 } },
  payment: { mode: 'at_venue', reason: 'payments_off' },
}

export const availability: StayAvailability = {
  nights: 2,
  party_too_large: false,
  rooms: [
    { id: '101', name: 'Sea view', short_description: 'A balcony over the bay', max_guests: 2, bedrooms: 1, bed_type: 'King', size: '24 m²', image: null, gallery: [], amenities: ['Balcony'], price_per_night: 100, total_price: 200, member_total: 180, currency: 'EUR', min_stay: 1 },
    { id: '102', name: 'Garden', short_description: null, max_guests: 3, bedrooms: 1, bed_type: null, size: null, image: null, gallery: [], amenities: [], price_per_night: 90, total_price: 180, member_total: 180, currency: 'EUR', min_stay: 1 },
  ],
}

export const stayQuote: StayQuote = {
  hold_token: 'HOLD-TOKEN-1', expires_at: '2026-10-01T09:10:00Z', room: { id: '101', name: 'Sea view' },
  check_in: '2026-10-10', check_out: '2026-10-12', nights: 2, adults: 2, children: 0,
  lines: { room_total: 200, price_per_night: 100, extras: [{ id: '3', name: 'Breakfast', unit_price: 15, quantity: 1, line_total: 15 }], extras_total: 15 },
  list_amount: 215, discount: { amount: 21.5, label: '10% off stays', source: 'tier_benefit' }, coupon: null, total_amount: 193.5, currency: 'EUR',
  payment: { mode: 'at_venue', reason: 'payments_off' },
  policy: { cancellation_policy: 'Free until two days before.', cancel_hours: 48, check_in_time: '15:00', check_out_time: '11:00' },
}

export const stayVenue: PortalBootstrap = {
  ...base,
  venue: { ...base.venue, name: 'Seaside Hotel', industry: 'hotel', contact: { email: 'hello@seaside.test', phone: null } },
  capabilities: { ...base.capabilities, services: false, stays: true },
}
