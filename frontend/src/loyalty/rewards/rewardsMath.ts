import { addDays, isDateKey } from '../../workspace/lib/wallClock'
import type { Can } from '../lib/types'
import { decimalOf, isWall, numberIn, serverProblems, wallOf, wholeIn, type Problems, type Tone } from '../lib/forms'
import type { Offer, OfferBody, OfferOptions, RedemptionFilter, Reward, RewardBody, RewardOptions } from './types'

/**
 * Rewards' decisions (spec 2026-10-21 §4.6, §5), kept out of the components so they can be tested: the tab an address
 * names, what a role may do, a redemption's next steps, the forms' problems before sending, and the state words.
 * The checks shared with Program (numbers, the venue's clock, the server's field errors) come from programMath.ts.
 */

// ─── The tabs ─────────────────────────────────────────────────────────────

export const REWARD_TABS = ['catalogue', 'redemptions', 'offers', 'referrals'] as const
export type RewardTab = typeof REWARD_TABS[number]

/** The tab an address names (`?tab=offers`); the catalogue for none or anything else. */
export function tabFrom(search: string): RewardTab {
  const tab = new URLSearchParams(search).get('tab')
  return (REWARD_TABS as readonly string[]).includes(tab ?? '') ? (tab as RewardTab) : 'catalogue'
}

/** The address of a tab: the catalogue is the page's own address, the others carry `?tab=`. */
export function searchFor(tab: RewardTab): string {
  return tab === 'catalogue' ? '' : `?tab=${tab}`
}

/** The tab the arrow keys, Home and End move to from the current one (they wrap); null for any other key. */
export function tabAfter(current: RewardTab, key: string): RewardTab | null {
  const i = REWARD_TABS.indexOf(current)
  const n = REWARD_TABS.length
  if (key === 'ArrowRight') return REWARD_TABS[(i + 1) % n]
  if (key === 'ArrowLeft') return REWARD_TABS[(i - 1 + n) % n]
  if (key === 'Home') return REWARD_TABS[0]
  if (key === 'End') return REWARD_TABS[n - 1]
  return null
}

// ─── Who does what ────────────────────────────────────────────────────────

/** Rewards and offers change with "manage offers"; redemptions are handled by whoever may redeem points (§5). */
export function rewardsActions(can: Can): { manage: boolean; redeem: boolean } {
  return { manage: can.manage_rewards, redeem: can.redeem }
}

/**
 * What a redemption offers. Only a pending one is fulfilled or cancelled here: the server would let a fulfilled one be
 * cancelled for the books, but nothing would go back to the member, and the desk does not need that step.
 */
export function redemptionActions(state: string, can: Can): { fulfil: boolean; cancel: boolean } {
  const open = state === 'pending' && can.redeem
  return { fulfil: open, cancel: open }
}

export const REDEMPTION_FILTERS: RedemptionFilter[] = ['pending', 'done', 'all']

/** Pending waits (amber), fulfilled is done (green), cancelled and anything else is the quiet grey. */
export function redemptionTone(state: string): Tone {
  return state === 'pending' ? 'pending' : state === 'fulfilled' ? 'fulfilled' : 'cancelled'
}

export type OfferState = 'live' | 'upcoming' | 'ended' | 'off'
const OFFER_STATES: OfferState[] = ['live', 'upcoming', 'ended', 'off']

/** An offer's state, worked out by the server against the venue's today; anything it might add later reads as off. */
export function offerState(raw: string): OfferState {
  return (OFFER_STATES as string[]).includes(raw) ? (raw as OfferState) : 'off'
}

export function offerTone(state: OfferState): Tone {
  return state === 'live' ? 'fulfilled' : state === 'upcoming' ? 'approved' : 'cancelled'
}

/** A referral's state: rewarded is done, qualified on its way, pending waits. */
export function referralTone(state: string): Tone {
  return state === 'rewarded' ? 'fulfilled' : state === 'qualified' ? 'approved' : state === 'pending' ? 'pending' : 'cancelled'
}

// ─── A reward ─────────────────────────────────────────────────────────────

/** The server's bounds for a reward (RewardController::validated). */
export const MAX_COST = 1_000_000
export const MAX_STOCK = 1_000_000
export const MAX_PER_MEMBER = 1000
export const MAX_DISCOUNT = 100_000

export interface RewardForm {
  name: string
  description: string
  terms: string
  category: string
  points_cost: string
  stock: string
  per_member_limit: string
  /** Empty for none. */
  discount_type: string
  discount_value: string
  applies_to: string
  /** The venue's wall clock, empty for none. */
  expires_at: string
  is_active: boolean
}

const filled = (text: string): boolean => text.trim() !== ''
const orNull = (text: string): string | null => (filled(text) ? text.trim() : null)
const wholeOrNull = (text: string): number | null => (filled(text) ? Number(text.trim()) : null)
const defaultScope = (list: string[]): string => (list.includes('all') ? 'all' : (list[0] ?? 'all'))

export function rewardFormOf(reward: Reward | null, options: RewardOptions, timeZone: string): RewardForm {
  if (!reward) {
    return {
      name: '', description: '', terms: '', category: '', points_cost: '', stock: '', per_member_limit: '', discount_type: '', discount_value: '',
      applies_to: defaultScope(options.applies_to), expires_at: '', is_active: true,
    }
  }
  return {
    name: reward.name,
    description: reward.description ?? '',
    terms: reward.terms ?? '',
    category: reward.category ?? '',
    points_cost: String(reward.points_cost),
    stock: reward.stock !== null ? String(reward.stock) : '',
    per_member_limit: reward.per_member_limit !== null ? String(reward.per_member_limit) : '',
    discount_type: reward.discount_type ?? '',
    discount_value: reward.discount_value !== null ? String(reward.discount_value) : '',
    applies_to: reward.applies_to,
    expires_at: wallOf(reward.expires_at, timeZone),
    is_active: reward.is_active,
  }
}

export function rewardProblems(form: RewardForm, options: RewardOptions): Problems {
  const out: Problems = {}
  if (!filled(form.name) || form.name.trim().length > 191) out.name = 'name'
  if (form.category.trim().length > 60) out.category = 'category'
  if (!wholeIn(form.points_cost, 1, MAX_COST)) out.points_cost = 'points_cost'
  if (filled(form.stock) && !wholeIn(form.stock, 0, MAX_STOCK)) out.stock = 'stock'
  if (filled(form.per_member_limit) && !wholeIn(form.per_member_limit, 1, MAX_PER_MEMBER)) out.per_member_limit = 'per_member_limit'
  if (form.discount_type !== '') {
    if (!options.discount_types.includes(form.discount_type)) out.discount_type = 'discount_type'
    else if (!numberIn(form.discount_value, 0.01, MAX_DISCOUNT)) out.discount_value = 'discount_value'
    else if (form.discount_type === 'percent_discount' && (decimalOf(form.discount_value) ?? 0) > 100) out.discount_value = 'percent_over'
  }
  if (!options.applies_to.includes(form.applies_to)) out.applies_to = 'applies_to'
  if (filled(form.expires_at) && !isWall(form.expires_at)) out.expires_at = 'expires_at'
  return out
}

/** The whole reward, as the server takes it on create and on change alike; no discount type clears its value too. */
export function rewardBody(form: RewardForm): RewardBody {
  const typed = form.discount_type !== ''
  return {
    name: form.name.trim(),
    description: orNull(form.description),
    terms: orNull(form.terms),
    category: orNull(form.category),
    points_cost: Number(form.points_cost.trim()),
    stock: wholeOrNull(form.stock),
    per_member_limit: wholeOrNull(form.per_member_limit),
    discount_type: typed ? form.discount_type : null,
    discount_value: typed ? decimalOf(form.discount_value) : null,
    applies_to: form.applies_to,
    expires_at: filled(form.expires_at) ? form.expires_at : null,
    is_active: form.is_active,
  }
}

/** The server's field errors in the reward form's words; a refused discount value is read by its type. */
export function rewardServerProblems(fields: Record<string, string[]> | undefined, form: RewardForm): Problems {
  return serverProblems(fields, {
    name: 'name', description: 'description', terms: 'terms', category: 'category', points_cost: 'points_cost', stock: 'stock',
    per_member_limit: 'per_member_limit', discount_type: 'discount_type',
    discount_value: form.discount_type === 'percent_discount' ? 'percent_over' : 'discount_value',
    applies_to: 'applies_to', expires_at: 'expires_at',
  })
}

/** A reward's typed discount, when it has one. */
export function rewardDiscount(reward: Pick<Reward, 'discount_type' | 'discount_value'>): { type: string; amount: number } | null {
  return reward.discount_type && reward.discount_value !== null ? { type: reward.discount_type, amount: reward.discount_value } : null
}

/** A reward's stock as the card says it: no limit, none left, or how many. */
export function stockOf(stock: number | null): 'unlimited' | 'none' | 'some' {
  return stock === null ? 'unlimited' : stock <= 0 ? 'none' : 'some'
}

// ─── An offer ─────────────────────────────────────────────────────────────

export const MAX_OFFER_VALUE = 999_999.99

export interface OfferForm {
  title: string
  description: string
  type: string
  value: string
  code: string
  applies_to: string
  tiers: number[]
  /** The venue's days, `YYYY-MM-DD`. */
  start_date: string
  end_date: string
  usage_limit: string
  per_member_limit: string
  is_featured: boolean
  is_active: boolean
}

/**
 * The types an offer may take: the server's list, and the one it already has when that is not in it (an offer
 * written before the list, or by the AI generator, keeps its type: OfferController::update).
 */
export function typeChoices(types: string[], current: string | null): string[] {
  return current && !types.includes(current) ? [...types, current] : types
}

/** A new offer runs from the venue's today for 30 days, of the server's first type, for every tier. */
export function offerFormOf(offer: Offer | null, options: OfferOptions, today: string): OfferForm {
  if (!offer) {
    return {
      title: '', description: '', type: options.types[0] ?? '', value: '', code: '', applies_to: defaultScope(options.applies_to), tiers: [],
      start_date: today, end_date: addDays(today, 30), usage_limit: '', per_member_limit: '', is_featured: false, is_active: true,
    }
  }
  return {
    title: offer.title,
    description: offer.description ?? '',
    type: offer.type,
    value: String(offer.value),
    code: offer.code ?? '',
    applies_to: offer.applies_to,
    tiers: offer.tier_ids ?? [],
    start_date: offer.start_date ?? '',
    end_date: offer.end_date ?? '',
    usage_limit: offer.usage_limit !== null ? String(offer.usage_limit) : '',
    per_member_limit: offer.per_member_limit !== null ? String(offer.per_member_limit) : '',
    is_featured: offer.is_featured,
    is_active: offer.is_active,
  }
}

/** An offer code: 4 to 24 letters, digits or hyphens; the server trims and upper-cases it. */
export const isOfferCode = (text: string): boolean => /^[A-Za-z0-9-]{4,24}$/.test(text.trim())

export function offerProblems(form: OfferForm, options: OfferOptions, current: string | null = null): Problems {
  const out: Problems = {}
  if (!filled(form.title) || form.title.trim().length > 191) out.title = 'title'
  if (!filled(form.description)) out.description = 'description'
  if (!typeChoices(options.types, current).includes(form.type)) out.type = 'type'
  if (!numberIn(form.value, 0, MAX_OFFER_VALUE)) out.value = 'value'
  if (filled(form.code) && !isOfferCode(form.code)) out.code = 'code'
  if (!options.applies_to.includes(form.applies_to)) out.applies_to = 'applies_to'
  if (!isDateKey(form.start_date)) out.start_date = 'start_date'
  if (!isDateKey(form.end_date)) out.end_date = 'end_date'
  else if (isDateKey(form.start_date) && form.end_date <= form.start_date) out.end_date = 'order'
  if (filled(form.usage_limit) && !wholeIn(form.usage_limit, 1, Number.MAX_SAFE_INTEGER)) out.usage_limit = 'usage_limit'
  if (filled(form.per_member_limit) && !wholeIn(form.per_member_limit, 1, Number.MAX_SAFE_INTEGER)) out.per_member_limit = 'per_member_limit'
  return out
}

/** The whole offer; `is_active` only on a change (a new offer is made active), no tier meaning every tier. */
export function offerBody(form: OfferForm, editing: boolean): OfferBody {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    type: form.type,
    value: decimalOf(form.value) ?? 0,
    code: filled(form.code) ? form.code.trim().toUpperCase() : null,
    applies_to: form.applies_to,
    tier_ids: form.tiers.length > 0 ? [...form.tiers].sort((a, b) => a - b) : null,
    start_date: form.start_date,
    end_date: form.end_date,
    usage_limit: wholeOrNull(form.usage_limit),
    per_member_limit: wholeOrNull(form.per_member_limit),
    is_featured: form.is_featured,
    ...(editing ? { is_active: form.is_active } : {}),
  }
}

/**
 * The form checks a code's shape and the dates' order before sending, so a refused code is one another offer holds and
 * a refused end date is one the server found not after the start.
 */
export const OFFER_FIELDS: Record<string, string> = {
  title: 'title', description: 'description', type: 'type', value: 'value', code: 'code_taken', applies_to: 'applies_to', tier_ids: 'tier_ids',
  start_date: 'start_date', end_date: 'order', usage_limit: 'usage_limit', per_member_limit: 'per_member_limit',
}

/** How an offer's value reads: a sentence for the types whose value has one meaning, else the bare number. */
export function offerValue(type: string, value: number, phrased: string[]): 'phrase' | 'number' | null {
  if (!value) return null
  return phrased.includes(type) ? 'phrase' : 'number'
}
