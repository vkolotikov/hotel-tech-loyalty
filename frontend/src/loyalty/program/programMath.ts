import { addDays } from '../../workspace/lib/wallClock'
import { wholeIn, numberIn, decimalOf, serverProblems, isWall, wallOf, type Problems, type Tone } from '../lib/forms'
import type { Can } from '../lib/types'
import type { Benefit, BenefitBody, Boost, BoostBody, BoostState, ProgramOptions, Tier, TierBenefit, TierBenefitBody, TierBody } from './types'

/**
 * Program's decisions (spec 2026-10-21 §4.5, §5), kept out of the components so they can be tested: what a role sees,
 * what a form refuses before sending, the words a server value is read under, and the venue's clock for boosts.
 */

/** Only a manager changes the programme; everyone else reads it (§5). The server checks again. */
export function programActions(can: Can): { manage: boolean } {
  return { manage: can.manage_program }
}

const filled = (text: string): boolean => text.trim() !== ''

// ─── Tiers ─────────────────────────────────────────────────────────────────

/** The server's bounds for a tier (ProgramController: min_points ≤ 10,000,000; earn_rate is decimal(4,2)). */
export const MAX_MIN_POINTS = 10_000_000
export const MAX_EARN_RATE = 99.99

export interface TierForm {
  name: string
  color: string
  min_points: string
  earn_rate: string
  description: string
  is_active: boolean
}

export function tierFormOf(tier: Tier | null): TierForm {
  if (!tier) return { name: '', color: '', min_points: '0', earn_rate: '1', description: '', is_active: true }
  return {
    name: tier.name,
    color: tier.color ?? '',
    min_points: String(tier.min_points),
    earn_rate: String(tier.earn_rate),
    description: tier.description ?? '',
    is_active: tier.is_active,
  }
}

export const isHex = (text: string): boolean => /^#[0-9a-fA-F]{6}$/.test(text.trim())

export function tierProblems(form: TierForm): Problems {
  const out: Problems = {}
  if (!filled(form.name)) out.name = 'name'
  if (filled(form.color) && !isHex(form.color)) out.color = 'color'
  if (!wholeIn(form.min_points, 0, MAX_MIN_POINTS)) out.min_points = 'min_points'
  if (!numberIn(form.earn_rate, 0, MAX_EARN_RATE)) out.earn_rate = 'earn_rate'
  return out
}

export function tierBody(form: TierForm): TierBody {
  return {
    name: form.name.trim(),
    color: filled(form.color) ? form.color.trim().toLowerCase() : null,
    min_points: Number(form.min_points.trim()),
    earn_rate: decimalOf(form.earn_rate) ?? 0,
    description: filled(form.description) ? form.description.trim() : null,
    is_active: form.is_active,
  }
}

export const TIER_FIELDS: Record<string, string> = {
  name: 'name', color: 'color', min_points: 'min_points', earn_rate: 'earn_rate', description: 'description',
}

export type Threshold = 'points' | 'nights' | 'stays' | 'spend'

/** What it takes to reach a tier: points always, nights, stays and spend where the tier sets them. */
export function thresholds(tier: Tier): { kind: Threshold; value: number }[] {
  const out: { kind: Threshold; value: number }[] = [{ kind: 'points', value: tier.min_points }]
  if (tier.min_nights !== null) out.push({ kind: 'nights', value: tier.min_nights })
  if (tier.min_stays !== null) out.push({ kind: 'stays', value: tier.min_stays })
  if (tier.min_spend !== null) out.push({ kind: 'spend', value: tier.min_spend })
  return out
}

/** A tier's or a benefit's switch as a badge's tone. */
export const activeTone = (active: boolean): Tone => (active ? 'fulfilled' : 'cancelled')

// ─── The benefit catalogue ────────────────────────────────────────────────

export interface BenefitForm {
  name: string
  code: string
  category: string
  fulfillment_mode: string
  description: string
}

export function benefitFormOf(benefit: Benefit | null): BenefitForm {
  return {
    name: benefit?.name ?? '',
    code: benefit?.code ?? '',
    category: benefit?.category ?? '',
    fulfillment_mode: benefit?.fulfillment_mode ?? '',
    description: benefit?.description ?? '',
  }
}

/** The code is given once, on create: presets find their benefits by it, so the server keeps it (§4.5). */
export function benefitProblems(form: BenefitForm, creating: boolean, options: ProgramOptions): Problems {
  const out: Problems = {}
  if (!filled(form.name)) out.name = 'name'
  if (creating && (!filled(form.code) || form.code.trim().length > 50)) out.code = 'code'
  if (!options.categories.includes(form.category)) out.category = 'category'
  if (!options.fulfillment_modes.includes(form.fulfillment_mode)) out.fulfillment_mode = 'fulfillment_mode'
  return out
}

export function benefitBody(form: BenefitForm, creating: boolean): BenefitBody {
  return {
    name: form.name.trim(),
    ...(creating ? { code: form.code.trim() } : {}),
    category: form.category,
    fulfillment_mode: form.fulfillment_mode,
    description: filled(form.description) ? form.description.trim() : null,
  }
}

/** The only check on a code the form cannot make is that no other benefit has it, so a refused code reads as taken. */
export const BENEFIT_FIELDS: Record<string, string> = {
  name: 'name', code: 'code_taken', category: 'category', fulfillment_mode: 'fulfillment_mode', description: 'description',
}

// ─── A tier's benefits ────────────────────────────────────────────────────

/**
 * The value types whose amount the server's DiscountService reads (a percentage, a sum off, a points multiplier);
 * the others are a wording only, so the form asks no amount for them.
 */
const AMOUNT_TYPES = ['percent_discount', 'fixed_amount', 'points_multiplier']
export const needsAmount = (type: string): boolean => AMOUNT_TYPES.includes(type)

export interface TierBenefitForm {
  benefit_id: string
  value: string
  value_type: string
  value_amount: string
  applies_to: string
}

/** A new tier benefit starts as the server stores one sent without a type: a wording, for every booking. */
export function tierBenefitFormOf(tb: TierBenefit | null, options: ProgramOptions): TierBenefitForm {
  const type = tb?.value_type ?? (options.value_types.includes('text') ? 'text' : (options.value_types[0] ?? 'text'))
  const scope = tb?.applies_to ?? (options.applies_to.includes('all') ? 'all' : (options.applies_to[0] ?? 'all'))
  return {
    benefit_id: tb ? String(tb.benefit_id) : '',
    value: tb?.value ?? '',
    value_type: type,
    value_amount: tb?.value_amount !== null && tb?.value_amount !== undefined ? String(tb.value_amount) : '',
    applies_to: scope,
  }
}

/** The tier's benefit for a catalogue entry, if it already gives it: saving it again changes that one (firstOrNew). */
export function existingOn(tier: Tier, benefitId: number): TierBenefit | null {
  return tier.benefits.find(tb => tb.benefit_id === benefitId) ?? null
}

/** The benefits a tier may be given: the active ones, and the one it already has even when switched off since. */
export function benefitChoices(benefits: Benefit[], keep: number | null = null): Benefit[] {
  return benefits.filter(b => b.is_active || b.id === keep)
}

export function tierBenefitProblems(form: TierBenefitForm, options: ProgramOptions): Problems {
  const out: Problems = {}
  if (!wholeIn(form.benefit_id, 1, Number.MAX_SAFE_INTEGER)) out.benefit_id = 'benefit_id'
  if (form.value.trim().length > 255) out.value = 'value'
  if (!options.value_types.includes(form.value_type)) out.value_type = 'value_type'
  if (!options.applies_to.includes(form.applies_to)) out.applies_to = 'applies_to'
  if (needsAmount(form.value_type)) {
    const amount = decimalOf(form.value_amount)
    if (amount === null || amount > 1_000_000) out.value_amount = 'value_amount'
    else if (form.value_type === 'percent_discount' && amount > 100) out.value_amount = 'percent_over'
    else if (form.value_type === 'points_multiplier' && amount < 1) out.value_amount = 'multiplier_under'
  }
  return out
}

export function tierBenefitBody(form: TierBenefitForm): TierBenefitBody {
  return {
    benefit_id: Number(form.benefit_id),
    value: filled(form.value) ? form.value.trim() : null,
    value_type: form.value_type,
    value_amount: needsAmount(form.value_type) ? decimalOf(form.value_amount) : null,
    applies_to: form.applies_to,
  }
}

/** The server refuses an amount for what its type allows (over 100 %, a multiplier under 1): the same words here. */
export function tierBenefitServerProblems(fields: Record<string, string[]> | undefined, form: TierBenefitForm): Problems {
  const amount = form.value_type === 'percent_discount' ? 'percent_over' : form.value_type === 'points_multiplier' ? 'multiplier_under' : 'value_amount'
  return serverProblems(fields, {
    benefit_id: 'benefit_id', value: 'value', value_type: 'value_type', value_amount: amount, applies_to: 'applies_to',
  })
}

/** A tier benefit's typed value, when it has one to show ("15% off", "×2 points"); a wording-only one has none. */
export function typedValue(tb: Pick<TierBenefit, 'value_type' | 'value_amount'>): { type: string; amount: number } | null {
  return needsAmount(tb.value_type) && tb.value_amount !== null ? { type: tb.value_type, amount: tb.value_amount } : null
}

// ─── Boost events ─────────────────────────────────────────────────────────

/** The server's bounds for a boost (ProgramController::boostValues). */
export const MIN_MULTIPLIER = 1
export const MAX_MULTIPLIER = 10

const STATES: BoostState[] = ['live', 'upcoming', 'ended', 'off']

/** The state the server worked out against its own now; anything it might add later reads as off. */
export function boostState(raw: string): BoostState {
  return (STATES as string[]).includes(raw) ? (raw as BoostState) : 'off'
}

/**
 * Whether a boost asks for its times to be checked (R4-6): the server's `check_time` — saved before the fix by the
 * full admin, whose times may be off by the venue's offset — while it can still give points (an ended one cannot).
 */
export function needsTimeCheck(boost: Pick<Boost, 'check_time' | 'state'>): boolean {
  return boost.check_time === true && boostState(boost.state) !== 'ended'
}

/** Live reads as done-green, upcoming as approved-teal, ended and off as the quiet grey. */
export function boostTone(state: BoostState): Tone {
  return state === 'live' ? 'fulfilled' : state === 'upcoming' ? 'approved' : 'cancelled'
}

export interface BoostForm {
  name: string
  description: string
  multiplier: string
  /** The venue's wall clock, as a datetime-local input holds it. */
  starts_at: string
  ends_at: string
  days: number[]
  tiers: number[]
  is_active: boolean
}

/** A new boost runs from the start of the venue's today for a week; a manager changes both. */
export function boostFormOf(boost: Boost | null, timeZone: string, today: string): BoostForm {
  if (!boost) {
    return { name: '', description: '', multiplier: '2', starts_at: `${today}T00:00`, ends_at: `${addDays(today, 7)}T23:59`, days: [], tiers: [], is_active: true }
  }
  return {
    name: boost.name,
    description: boost.description ?? '',
    multiplier: String(boost.multiplier),
    starts_at: wallOf(boost.starts_at, timeZone),
    ends_at: wallOf(boost.ends_at, timeZone),
    days: boost.days_of_week ?? [],
    tiers: boost.tier_ids ?? [],
    is_active: boost.is_active,
  }
}

export function boostProblems(form: BoostForm): Problems {
  const out: Problems = {}
  if (!filled(form.name) || form.name.trim().length > 120) out.name = 'name'
  if (form.description.trim().length > 500) out.description = 'description'
  if (!numberIn(form.multiplier, MIN_MULTIPLIER, MAX_MULTIPLIER)) out.multiplier = 'multiplier'
  if (!isWall(form.starts_at)) out.starts_at = 'starts_at'
  if (!isWall(form.ends_at)) out.ends_at = 'ends_at'
  else if (isWall(form.starts_at) && form.ends_at <= form.starts_at) out.ends_at = 'order'
  return out
}

/** The whole event, as the server takes it on create and on change alike; empty lists mean every day and every tier. */
export function boostBody(form: BoostForm): BoostBody {
  return {
    name: form.name.trim(),
    description: filled(form.description) ? form.description.trim() : null,
    multiplier: decimalOf(form.multiplier) ?? MIN_MULTIPLIER,
    starts_at: form.starts_at,
    ends_at: form.ends_at,
    days_of_week: form.days.length > 0 ? [...form.days].sort((a, b) => a - b) : null,
    tier_ids: form.tiers.length > 0 ? [...form.tiers].sort((a, b) => a - b) : null,
    is_active: form.is_active,
  }
}

/** The form checks the format of both instants, so a refused end is one the server found before the start. */
export const BOOST_FIELDS: Record<string, string> = {
  name: 'name', description: 'description', multiplier: 'multiplier', starts_at: 'starts_at', ends_at: 'order',
  days_of_week: 'days_of_week', tier_ids: 'tier_ids',
}

/** The week from Monday, in the server's numbers (Carbon's dayOfWeek: 0 = Sunday). */
export const WEEK = [1, 2, 3, 4, 5, 6, 0]

/** A weekday's name in the language ("Mon", "lun."), from a known Sunday in UTC so no zone can shift it. */
export function weekdayName(day: number, locale: string, width: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(locale || 'en', { weekday: width, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)))
}

/** A boost's weekdays from Monday, named; empty when it runs every day. */
export function weekdaysText(days: number[] | null, locale: string): string {
  if (!days || days.length === 0 || WEEK.every(d => days.includes(d))) return ''
  return WEEK.filter(d => days.includes(d)).map(d => weekdayName(d, locale)).join(', ')
}
