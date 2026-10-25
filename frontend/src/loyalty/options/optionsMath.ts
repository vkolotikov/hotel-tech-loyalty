import type { ApiFailure } from '../lib/api'
import { decimal, decimalOf } from '../lib/forms'
import { money, points } from '../lib/format'
import type { CatalogueReward, FieldDef, OptionValue, Options, OptionsAnswer, Preset, SetupBody, Way } from './types'
import { AMOUNT_WORDS, PROBLEM_WORDS, SENTENCE_WORDS } from './words'

/**
 * "Ways to earn" and the setup wizard, kept out of the components so they can be tested by value (release 7 §1): a card's
 * form from the options and back (strings in the inputs, typed values out), what a card changes, the problems the
 * workspace can see before sending, the sentence that says what members get, a preset's recommendation as a form, and
 * the wizard's steps and body. The cards, the fields' rules and the choices are the server's (`ways`, `fields`).
 */

/** The cards and the rules of their fields, as the server describes them. */
export type Described = Pick<OptionsAnswer, 'ways' | 'fields'>

/** One card's form: whether the way is on, and what each of its fields holds as typed. */
export interface WayForm {
  on: boolean
  values: Record<string, string>
}

/** Every card's form, by way. */
export type OptionsForm = Record<string, WayForm>

/** What is wrong with a field: the code of its sentence (PROBLEM_WORDS) and the bounds it names. */
export interface Problem {
  code: 'whole' | 'number' | 'choice' | 'reward'
  min?: number
  max?: number
}

export type Problems = Record<string, Problem>

/** A translation function as the sentences take it (react-i18next's `t` fits). */
export type Say = (key: string, fallback: string, vars?: Record<string, string>) => string

/** What a sentence needs besides the options: the words, the venue's currency, the language and the rewards by id. */
export interface SayContext {
  say: Say
  currency: string
  locale: string
  rewards: CatalogueReward[]
}

// ─── Form ↔ options ───────────────────────────────────────────────────────

/** Whether the way is on in these options: its switch, or its number above 0. */
export function isOn(way: Way, options: Options): boolean {
  if (way.switch) return options[way.switch] === true
  if (way.zero_off) return Number(options[way.zero_off] ?? 0) > 0
  return false
}

/** An option's value as its input shows it. */
function textOf(value: OptionValue): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * A card's form from the options. A number whose 0 is "off" shows the server's default while off, so switching it on
 * starts from a sensible number rather than 0.
 */
export function wayFormOf(way: Way, options: Options, fields: Record<string, FieldDef>): WayForm {
  const on = isOn(way, options)
  const values: Record<string, string> = {}
  for (const key of way.fields) {
    const value = key === way.zero_off && !on ? fields[key]?.default ?? null : options[key] ?? fields[key]?.default ?? null
    values[key] = textOf(value)
  }
  return { on, values }
}

/** Every card's form from the options. */
export function formOf(d: Described, options: Options): OptionsForm {
  return Object.fromEntries(d.ways.map(way => [way.key, wayFormOf(way, options, d.fields)]))
}

/** Whether a field counts as the card stands: always, or while the option it depends on holds its value. */
export function shown(key: string, form: WayForm, fields: Record<string, FieldDef>): boolean {
  const when = fields[key]?.when
  return !when || form.values[when.field] === when.is
}

/** The value a field's text reads as, or undefined when it does not read as one (problems say why). */
export function typedValue(text: string, def: FieldDef | undefined): OptionValue | undefined {
  const v = text.trim()
  switch (def?.type) {
    case 'int':
      return /^\d+$/.test(v) ? Number(v) : undefined
    case 'decimal':
      return decimalOf(v) ?? undefined
    case 'enum':
      return def.choices?.includes(v) ? v : undefined
    case 'reward':
      return v === '' ? null : /^\d+$/.test(v) ? Number(v) : undefined
    case 'bool':
      return v === 'true' ? true : v === 'false' ? false : undefined
    default:
      return undefined
  }
}

/**
 * A card's options as they would be saved: its switch (or its number, 0 when off) and, while on, the fields it shows
 * that read as values. A card that is off sends only that it is off: its numbers stay as stored.
 */
export function wayOptions(way: Way, form: WayForm, fields: Record<string, FieldDef>): Options {
  const out: Options = {}
  if (way.switch) out[way.switch] = form.on
  if (way.zero_off && !form.on) out[way.zero_off] = 0
  if (!form.on) return out
  for (const key of way.fields) {
    if (!shown(key, form, fields)) continue
    const value = typedValue(form.values[key] ?? '', fields[key])
    if (value !== undefined) out[key] = value
  }
  return out
}

/** Every card's options: what the wizard sends. */
export function optionsOfForm(d: Described, form: OptionsForm): Options {
  return Object.assign({}, ...d.ways.map(way => (form[way.key] ? wayOptions(way, form[way.key], d.fields) : {})))
}

/** Two values the same as the server stores them (decimals to two places). */
function same(a: OptionValue | undefined, b: OptionValue | undefined): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.round(a * 100) === Math.round(b * 100)
  return (a ?? null) === (b ?? null)
}

/** What a card changes against what is saved: only the options whose value differs. */
export function changesOf(way: Way, form: WayForm, saved: Options, fields: Record<string, FieldDef>): Options {
  return Object.fromEntries(Object.entries(wayOptions(way, form, fields)).filter(([key, value]) => !same(value, saved[key])))
}

/**
 * The options a card's sentence reads while someone types: the saved ones with the card's switch and every field that
 * reads as an allowed value laid over them — a number out of its bounds is not promised to members. A number switched
 * on but not yet an allowed number reads as its saved value, or its default.
 */
export function previewOptions(way: Way, form: WayForm, saved: Options, fields: Record<string, FieldDef>): Options {
  const typed = wayOptions(way, form, fields)
  // The catalogue is not needed here: a reward the sentence cannot find reads as "a reward you choose".
  for (const key of Object.keys(wayProblems(way, form, fields, []))) {
    if (fields[key]?.type !== 'reward') delete typed[key]
  }
  const out: Options = { ...saved, ...typed }
  if (way.zero_off && form.on && !(Number(out[way.zero_off] ?? 0) > 0)) {
    const kept = Number(saved[way.zero_off] ?? 0)
    out[way.zero_off] = kept > 0 ? kept : fields[way.zero_off]?.default ?? 0
  }
  return out
}

// ─── Problems ─────────────────────────────────────────────────────────────

/** The bounds a field holds while its card is on: a number whose 0 means off must be at least 1 then. */
function boundsOf(key: string, way: Way, def: FieldDef): { min: number; max: number } {
  const min = def.min ?? 0
  return { min: key === way.zero_off ? Math.max(1, min) : min, max: def.max ?? Number.MAX_SAFE_INTEGER }
}

/** What is wrong with one field as typed, or null. */
function fieldProblem(key: string, way: Way, form: WayForm, def: FieldDef | undefined, rewards: CatalogueReward[]): Problem | null {
  if (!def) return null
  const text = (form.values[key] ?? '').trim()
  switch (def.type) {
    case 'int': {
      const { min, max } = boundsOf(key, way, def)
      const n = /^\d+$/.test(text) ? Number(text) : null
      return n === null || n < min || n > max ? { code: 'whole', min, max } : null
    }
    case 'decimal': {
      const { min, max } = boundsOf(key, way, def)
      const n = decimalOf(text)
      return n === null || n < min || n > max ? { code: 'number', min, max } : null
    }
    case 'enum':
      return def.choices?.includes(text) ? null : { code: 'choice' }
    case 'reward':
      return rewards.some(r => String(r.id) === text) ? null : { code: 'reward' }
    default:
      return null
  }
}

/** What stops a card being saved, by field: nothing while it is off; while on, every field it shows. */
export function wayProblems(way: Way, form: WayForm, fields: Record<string, FieldDef>, rewards: CatalogueReward[]): Problems {
  const out: Problems = {}
  if (!form.on) return out
  for (const key of way.fields) {
    if (!shown(key, form, fields)) continue
    const problem = fieldProblem(key, way, form, fields[key], rewards)
    if (problem) out[key] = problem
  }
  return out
}

/** What stops the whole form (the wizard): every card's problems. */
export function formProblems(d: Described, form: OptionsForm, rewards: CatalogueReward[]): Problems {
  return Object.assign({}, ...d.ways.map(way => (form[way.key] ? wayProblems(way, form[way.key], d.fields, rewards) : {})))
}

/**
 * The server's field errors as problems in the workspace's words: each option it names gets its type's sentence with
 * the option's own bounds. The server's sentence is never shown; a field it names that no card shows is left to the
 * family's `invalid` notice.
 */
export function serverProblems(failure: ApiFailure | null, d: Described): Problems {
  const out: Problems = {}
  for (const name of Object.keys(failure?.fields ?? {})) {
    const key = name.split('.').pop() ?? name
    const def = d.fields[key]
    const way = d.ways.find(w => w.fields.includes(key))
    if (!def || !way || key in out) continue
    const bounds = def.type === 'int' || def.type === 'decimal' ? boundsOf(key, way, def) : null
    out[key] = def.type === 'int' ? { code: 'whole', ...bounds! }
      : def.type === 'decimal' ? { code: 'number', ...bounds! }
        : def.type === 'reward' ? { code: 'reward' }
          : { code: 'choice' }
  }
  return out
}

/** The ways that hold a problem (the wizard marks their steps). */
export function waysWith(problems: Problems, d: Described): string[] {
  return d.ways.filter(way => way.fields.some(key => key in problems)).map(way => way.key)
}

/** A problem's sentence. */
export function problemText(problem: Problem, say: Say, locale: string): string {
  const key = `loyalty.options.problem.${problem.code}`
  const min = problem.min !== undefined ? decimal(problem.min, locale) : ''
  const max = problem.max !== undefined ? points(problem.max, locale) : ''
  return say(key, PROBLEM_WORDS[problem.code], { min, max })
}

// ─── What members get ─────────────────────────────────────────────────────

/** "1 point", "250 points", "1.5 points", in the language. */
export function pointsPhrase(n: number, say: Say, locale: string): string {
  return n === 1
    ? say('loyalty.options.amount.points_one', AMOUNT_WORDS.points_one)
    : say('loyalty.options.amount.points_many', AMOUNT_WORDS.points_many, { points: Number.isInteger(n) ? points(n, locale) : decimal(n, locale) })
}

function monthsPhrase(n: number, say: Say, locale: string): string {
  return n === 1
    ? say('loyalty.options.amount.months_one', AMOUNT_WORDS.months_one)
    : say('loyalty.options.amount.months_many', AMOUNT_WORDS.months_many, { months: points(n, locale) })
}

/** One sentence of SENTENCE_WORDS. */
function sentence(name: string, ctx: SayContext, vars?: Record<string, string>): string {
  return ctx.say(`loyalty.options.sentence.${name}`, SENTENCE_WORDS[name] ?? name, vars)
}

const num = (value: OptionValue | undefined): number => (typeof value === 'number' ? value : Number(value ?? 0))

/**
 * What members get with a way, in one plain sentence ("Members get 1 point for every €1 they spend."), from the options
 * as they stand. A way the workspace has no sentence for says nothing (an empty string).
 */
export function sentenceOf(wayKey: string, o: Options, ctx: SayContext): string {
  const { say, locale } = ctx
  const pts = (value: OptionValue | undefined) => pointsPhrase(num(value), say, locale)
  switch (wayKey) {
    case 'points_on_spend':
      return o.points_on_bookings === true
        ? sentence('points_on_spend', ctx, { points: pts(o.points_per_currency), money: money(1, ctx.currency, locale) })
        : sentence('points_on_spend_off', ctx)
    case 'points_expiry':
      return num(o.points_expiry_months) > 0
        ? sentence('points_expiry', ctx, { months: monthsPhrase(num(o.points_expiry_months), say, locale) })
        : sentence('points_expiry_off', ctx)
    case 'welcome_bonus':
      return num(o.welcome_bonus_points) > 0 ? sentence('welcome_bonus', ctx, { points: pts(o.welcome_bonus_points) }) : sentence('welcome_bonus_off', ctx)
    case 'birthday_bonus':
      return num(o.birthday_bonus_points) > 0 ? sentence('birthday_bonus', ctx, { points: pts(o.birthday_bonus_points) }) : sentence('birthday_bonus_off', ctx)
    case 'referrals':
      if (o.referral_enabled !== true) return sentence('referrals_off', ctx)
      return sentence(o.referral_reward_on === 'signup' ? 'referrals_signup' : 'referrals_first_visit', ctx, {
        referrer: pts(o.referrer_bonus_points), referee: pts(o.referee_bonus_points),
      })
    case 'stamp_card': {
      if (o.stamps_enabled !== true) return sentence('stamp_card_off', ctx)
      const stamps = points(num(o.stamps_per_card), locale)
      if (o.stamp_reward_kind === 'reward') {
        const reward = ctx.rewards.find(r => r.id === num(o.stamp_reward_id))
        return reward ? sentence('stamp_card_reward', ctx, { stamps, reward: reward.name }) : sentence('stamp_card_reward_unset', ctx, { stamps })
      }
      return sentence('stamp_card_points', ctx, { stamps, points: pts(o.stamp_reward_points) })
    }
    case 'check_in':
      if (o.checkin_enabled !== true) return sentence('check_in_off', ctx)
      return num(o.checkin_points) > 0 ? sentence('check_in_points', ctx, { points: pts(o.checkin_points) }) : sentence('check_in_visit', ctx)
    case 'desk_earn':
      return o.desk_earn_enabled === true ? sentence('desk_earn', ctx) : sentence('desk_earn_off', ctx)
    case 'cashback':
      return o.cashback_enabled === true ? sentence('cashback', ctx, { percent: decimal(num(o.cashback_percent), locale) }) : sentence('cashback_off', ctx)
    default:
      return ''
  }
}

/** The wizard's review: a sentence for each way that is on, in the cards' order, and the ways left off. */
export function reviewOf(d: Described, form: OptionsForm, saved: Options, ctx: SayContext): { on: { key: string; text: string }[]; off: string[] } {
  const options = { ...saved, ...optionsOfForm(d, form) }
  const on = d.ways.filter(way => form[way.key]?.on).map(way => ({ key: way.key, text: sentenceOf(way.key, options, ctx) }))
  return { on, off: d.ways.filter(way => !form[way.key]?.on).map(way => way.key) }
}

// ─── The wizard ───────────────────────────────────────────────────────────

export const STEPS = ['business', 'choose', 'configure', 'review'] as const
export type Step = typeof STEPS[number]

/** The step before or after this one, or null at either end. */
export function stepAfter(step: Step, delta: 1 | -1): Step | null {
  return STEPS[STEPS.indexOf(step) + delta] ?? null
}

/** The first step's choice: a preset's key, or `keep` (a venue that has tiers keeps them and its rewards). */
export const KEEP = 'keep'

/** A venue with any tier keeps its ladder: the presets are shown, not chosen. */
export function keepsTiers(answer: Pick<OptionsAnswer, 'catalogue'>): boolean {
  return answer.catalogue.tiers > 0
}

/** Where the first step starts: keep for a venue with tiers; otherwise its industry's preset, or the first. */
export function startChoice(answer: Pick<OptionsAnswer, 'catalogue' | 'presets'>): string {
  if (keepsTiers(answer)) return KEEP
  return (answer.presets.find(p => p.recommended) ?? answer.presets[0])?.key ?? KEEP
}

export function presetOf(answer: Pick<OptionsAnswer, 'presets'>, choice: string): Preset | null {
  return answer.presets.find(p => p.key === choice) ?? null
}

/**
 * A preset's recommendation as the wizard's form: its switches and numbers over the venue's options (a full card's
 * reward stays the venue's own). Keeping the tiers starts from today's options.
 */
export function recommendedForm(d: Described, preset: Preset | null, options: Options): OptionsForm {
  return formOf(d, preset ? { ...options, ...preset.recommends } : options)
}

/** The ways that have something to set while on (the configure step lists them). */
export function configurable(d: Described, form: OptionsForm): Way[] {
  return d.ways.filter(way => form[way.key]?.on && way.fields.length > 0)
}

/** What Apply sends: the preset unless the tiers are kept, every card's options, and this press's key. */
export function setupBody(d: Described, choice: string, form: OptionsForm, key: string): SetupBody {
  return { ...(choice === KEEP ? {} : { preset: choice }), options: optionsOfForm(d, form), idempotency_key: key }
}

/** The banner's question: a manager, at a venue whose wizard was neither applied nor skipped. */
export function offersSetup(manager: boolean, ways: { setup_done: boolean } | undefined): boolean {
  return manager && ways !== undefined && !ways.setup_done
}
