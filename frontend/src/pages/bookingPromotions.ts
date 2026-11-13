export interface BookingPromotion {
  id?: number
  revision?: number
  name: string
  code: string
  type: 'percentage' | 'fixed_amount' | 'second_night_free'
  value: number
  status: 'draft' | 'published' | 'paused' | 'archived'
  state?: string
  booking_from: string | null
  booking_until: string | null
  stay_from: string | null
  stay_until: string | null
  min_nights: number
  room_ids: number[]
  excluded_dates: { from: string; until: string }[]
  currency?: string
  stats?: { bookings: number; discounts: number; accommodation_revenue: number }
}

export function newPromotion(code = '', type: BookingPromotion['type'] = 'percentage', value = 20): BookingPromotion {
  return { name: '', code, type, value: type === 'second_night_free' ? 0 : value, status: 'draft', booking_from: null, booking_until: null,
    stay_from: null, stay_until: null, min_nights: type === 'second_night_free' ? 2 : 1, room_ids: [], excluded_dates: [] }
}

/** Duplicating never publishes a campaign or carries its use history into the copy. */
export function duplicatePromotion(p: BookingPromotion): BookingPromotion {
  return { ...newPromotion(), ...p, id: undefined, revision: undefined, stats: undefined, state: undefined, name: `${p.name} (copy)`, code: '', status: 'draft', room_ids: [...p.room_ids], excluded_dates: p.excluded_dates.map(r => ({ ...r })) }
}

export function promotionBody(p: BookingPromotion): BookingPromotion {
  return { name: p.name.trim(), code: p.code.trim().toUpperCase(), type: p.type, value: p.type === 'second_night_free' ? 0 : Number(p.value), status: p.status,
    booking_from: p.booking_from || null, booking_until: p.booking_until || null, stay_from: p.stay_from || null, stay_until: p.stay_until || null,
    min_nights: Math.max(p.type === 'second_night_free' ? 2 : 1, Number(p.min_nights)), room_ids: p.room_ids, excluded_dates: p.excluded_dates,
    ...(p.revision ? { revision: p.revision } : {}) }
}
