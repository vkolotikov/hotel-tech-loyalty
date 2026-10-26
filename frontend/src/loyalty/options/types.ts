/**
 * What "Ways to earn" and the setup wizard read and send (release 7, spec 2026-10-25 §1; OptionsController,
 * ProgrammeOverview). The options, their cards, every field's rules and every choice are the server's: the workspace
 * keeps no copy of them.
 */

/** An option's value: a switch, a number, a choice, a reward's id, or nothing. */
export type OptionValue = boolean | number | string | null

/** Every option by its key (ProgrammeOptions::OPTIONS), typed. */
export type Options = Record<string, OptionValue>

/**
 * A way to earn or be rewarded, as one card: the option that switches it on, or the number whose 0 means off
 * (`zero_off`: points that never expire, no welcome bonus), and the options the card sets.
 */
export interface Way {
  key: string
  switch: string | null
  zero_off: string | null
  fields: string[]
}

/** How the server checks an option: its type, default, bounds (inclusive), choices, and when it counts. */
export interface FieldDef {
  type: 'bool' | 'int' | 'decimal' | 'enum' | 'reward' | string
  default: OptionValue
  min: number | null
  max: number | null
  choices: string[] | null
  /** Counts only while another option of the same card holds this value (a full card's points or reward). */
  when: { field: string; is: string } | null
}

export interface CatalogueReward {
  id: number
  name: string
  points_cost: number
}

/** The other parts of the programme, as their own pages count them. */
export interface Catalogue {
  tiers: number
  /** The active rewards, cheapest first: what a full stamp card may give. */
  rewards: CatalogueReward[]
  offers: number
  boosts: number
}

/** A starting programme (LoyaltyPresetService), with the options it recommends. */
export interface Preset {
  key: string
  label: string
  description: string
  icon: string
  tier_count: number
  tier_names: string[]
  reward_count: number
  sample_rewards: string[]
  welcome_bonus: number
  /** The venue's industry's own preset. */
  recommended: boolean
  is_current: boolean
  recommends: Options
}

/**
 * One of "Ways to earn"'s checks (ProgrammeAdvice, owner 2026-10-26): what does not work together, `warn`, or works but
 * is unusual, `tip`; the card to open for it (null: the catalogue); the numbers its sentence names.
 */
export interface Advice {
  code: string
  level: 'warn' | 'tip'
  way: string | null
  params: Record<string, number>
}

export interface OptionsAnswer {
  options: Options
  ways: Way[]
  fields: Record<string, FieldDef>
  catalogue: Catalogue
  presets: Preset[]
  /** The wizard was applied or skipped (`programme_setup_completed_at`). */
  setup_done: boolean
  /** A manager: may change the options, apply the wizard or skip it. */
  can_change: boolean
  /** Owner 2026-10-26: the checks, warnings first, and the ways that do nothing at this venue as it stands. */
  advice?: Advice[]
  not_used?: string[]
}

/** What the wizard's apply did. */
export interface SetupOutcome {
  preset: string | null
  preset_applied: boolean
  /** `has_tiers`: the venue kept its tiers, the preset was not applied. */
  reason: string | null
  /** LoyaltyPresetService::apply's summary when the preset was applied. */
  summary: Record<string, number | boolean> | null
  completed_at: string
  /** A retry with the same key: the first apply's outcome, nothing written. */
  replayed: boolean
}

export interface SetupAnswer extends OptionsAnswer {
  setup: SetupOutcome
}

export interface SetupBody {
  preset?: string
  options: Options
  idempotency_key: string
}
