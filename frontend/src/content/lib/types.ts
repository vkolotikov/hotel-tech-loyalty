import type { DateKey } from '../../workspace/lib/wallClock'

export type { DateKey } from '../../workspace/lib/wallClock'

/**
 * What the Content API sends and takes (Plan A, app/Http/Controllers/Api/V1/Admin/Content/*).
 * Dates are the venue's wall-clock days (`YYYY-MM-DD`) and times `HH:MM`; they are never converted.
 */
export type Platform = 'linkedin' | 'instagram' | 'tiktok' | 'facebook' | 'x' | 'youtube' | 'blog' | 'email'
export type PostStatus = 'idea' | 'draft' | 'needs_review' | 'needs_visual' | 'approved' | 'ready_to_publish' | 'published' | 'skipped' | 'archived'
export type Rewrite = 'shorter' | 'longer' | 'professional' | 'friendly' | 'alternative'
export type BudgetStatus = 'unlimited' | 'under' | 'warn' | 'over'

export interface BrandRef { id: number; name: string }

export interface Bootstrap {
  name: string
  organization: { id: number; name: string; industry: string }
  /** The one brand every call of this session works on. */
  brand: BrandRef | null
  /** The brands this person may use: the switcher shows when there is more than one. */
  brands: BrandRef[]
  accent: string | null
  venue: { timezone: string; timezone_named: boolean; today: DateKey }
  staff: { name: string; role: string | null; can_manage: boolean }
  profile: { id: number; setup_completed: boolean; readiness: number } | null
  ai: { status: BudgetStatus; percent: number | null }
  platforms: Platform[]
  statuses: PostStatus[]
  rewrites: Rewrite[]
}

/** A post as a card, a list row and Find draw it. `updated_at` is the version a save or a move sends back. */
export interface PostCard {
  id: number
  platform: Platform
  scheduled_date: DateKey | null
  scheduled_time: string | null
  status: PostStatus
  title: string | null
  hook: string | null
  topic: string | null
  pillar_id: number | null
  image_url: string | null
  updated_at: string
}

export interface VisualBrief {
  visual_type: string | null
  aspect_ratio: string | null
  style: string | null
  description: string | null
  scene: string | null
  mood: string | null
  composition: string | null
  text_overlay: string | null
  avoid: string | null
  image_url: string | null
  image_status: string | null
  image_error: string | null
}

export interface Quality {
  scores: Record<string, number>
  overall: number
  flags: string[]
  improvements: string[]
  verdict: string
}

/** Everything the post panel shows and edits. */
export interface PostDetail extends PostCard {
  language: string | null
  goal: string | null
  format: string | null
  main_copy: string | null
  short_copy: string | null
  cta: string | null
  hashtags: string[]
  audience_id: number | null
  campaign_id: number | null
  weekday_role: string | null
  funnel_stage: string | null
  post_type: string | null
  strategic_reason: string | null
  quality: Quality | null
  published_url: string | null
  published_at: string | null
  generated_by: string | null
  hook_alternatives: string[]
  visual_brief: VisualBrief | null
}

/** A day and platform the brand's channels expect, with no post yet. */
export interface Slot { date: DateKey; platform: Platform }
export interface PlanFigures { planned: number; ready: number; published: number; open_slots: number }
export interface PlanPayload { posts: PostCard[]; unscheduled: PostCard[]; slots: Slot[]; figures: PlanFigures }

/** The fields the panel saves; each one optional, `null` for "none". */
export interface PostFields {
  platform?: Platform
  scheduled_date?: DateKey | null
  scheduled_time?: string | null
  status?: PostStatus
  pillar_id?: number | null
  audience_id?: number | null
  language?: string | null
  topic?: string | null
  hook?: string | null
  main_copy?: string | null
  cta?: string | null
  hashtags?: string[]
}

export interface Variation { id: number; type: Rewrite; copy: string }

export interface GenerateBody {
  from: DateKey
  to: DateKey
  platforms?: Platform[]
  fill_empty_only: boolean
  instructions?: string
}

export interface GenerateResult {
  status: 'completed' | 'partial' | 'failed'
  created_count: number
  posts: PostCard[]
  skipped: { date: string; platform: string; reason: string }[]
  failed_windows: { start_date: DateKey; end_date: DateKey; reason: string }[]
}

/** One page of `GET posts`: 50 a page, newest scheduled first, posts with no day last. */
export interface PostsPage { data: PostCard[]; meta: { page: number; pages: number; total: number } }

/** The Posts page's filters ('' or null: not filtered), as the address and `GET posts` hold them. */
export interface PostFilters {
  q: string
  status: PostStatus | ''
  platform: Platform | ''
  pillar_id: number | null
  from: DateKey | ''
  to: DateKey | ''
  unscheduled: boolean
  page: number
}

export interface StrategySummary {
  id: number
  title: string | null
  summary: string | null
  status: 'generating' | 'active' | 'superseded' | 'archived' | 'failed'
  created_at: string | null
}
export interface PillarRef { id: number; name: string; active: boolean }
export interface StrategyPillar extends PillarRef { description: string | null; purpose: string | null; frequency_weight: number | null }
/** This month's posts per pillar against the pillars' target weights (the active strategy only). */
export interface PillarBalance { from: DateKey; to: DateKey; pillars: { id: number; name: string; target_weight: number | null; posts: number }[] }

/** What the AI wrote for a strategy (every part optional: older strategies lack some). */
export interface StrategyOutput {
  title?: string
  brand_summary?: string
  assumptions?: string[]
  positioning_narrative?: { old_way?: string; new_way?: string; beliefs?: string[]; key_messages?: string[] }
  audience_map?: { name?: string; pains?: string[]; desires?: string[]; objections?: string[]; emotional_triggers?: string[]; content_they_engage_with?: string[] }[]
  content_pillars?: { name?: string; description?: string; purpose?: string; frequency_weight?: number; recommended_platforms?: string[]; example_topics?: string[]; cta_examples?: string[]; visual_direction?: string }[]
  content_mix?: Record<string, number>
  weekly_rhythm?: Record<string, { role?: string; description?: string; platforms?: string[]; pillars?: string[] }>
  platform_strategy?: Record<string, { role?: string; formats?: string[]; tone?: string; frequency?: string; post_types?: string[]; cta_style?: string; engagement_mechanics?: string[]; visual_style?: string }>
  engagement_strategy?: { primary_goals?: string[]; mechanics?: { goal?: string; tactic?: string }[] }
  conversion_strategy?: { approach?: string; soft_cta_examples?: string[] }
  visual_direction?: string
  monthly_themes?: string[]
  campaign_ideas?: { name?: string; goal?: string; description?: string }[]
  example_posts?: { platform?: string; post_type?: string; hook?: string; summary?: string }[]
  risks?: string[]
  opportunities?: string[]
  missing_information?: string[]
  next_actions?: string[]
}
export interface StrategyDetail extends StrategySummary {
  ai_output: StrategyOutput | null
  pillars: StrategyPillar[]
  balance: PillarBalance | null
}

/** A channel's posting days, as `frequency` keys them. */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface Channel {
  id: number
  platform: Platform
  label: string
  url: string | null
  goal: string | null
  role: string | null
  cta_style: string | null
  visual_style: string | null
  link_policy: string | null
  tone_override: string | null
  default_language: string | null
  emoji_policy: string | null
  hashtag_policy: string | null
  posts_per_week: number | null
  preferred_formats: string[] | null
  frequency: Partial<Record<Weekday, boolean>> | null
  audience_id: number | null
  active: boolean
}
export type ChannelRef = Pick<Channel, 'id' | 'platform' | 'label' | 'active'>

export interface Audience {
  id: number
  name: string
  description: string | null
  industry: string | null
  country: string | null
  business_size: string | null
  job_role: string | null
  preferred_tone: string | null
  language: string | null
  pain_points: string[] | null
  goals: string[] | null
  fears: string[] | null
  objections: string[] | null
  buying_triggers: string[] | null
  emotional_triggers: string[] | null
  rational_triggers: string[] | null
  questions: string[] | null
  preferred_platforms: string[] | null
  content_they_trust: string | null
  desired_transformation: string | null
  is_ai_assumed: boolean
  posts_count: number
}
export type AudienceRef = Pick<Audience, 'id' | 'name'>

export interface Voice {
  id: number
  tone: string | null
  style: string | null
  formality_level: string | null
  emoji_policy: string | null
  hashtag_policy: string | null
  sentence_style: string | null
  point_of_view: string | null
  preferred_words: string[] | null
  forbidden_words: string[] | null
  claims_to_avoid: string[] | null
  example_good_posts: string[] | null
  example_bad_posts: string[] | null
}

export interface Positioning { old_way?: string; new_way?: string; transformation?: string; beliefs?: string[] }
export interface RhythmDay { role?: string; notes?: string }
export interface VisualStyle { style?: string; image_types?: string[]; avoid?: string[]; aspect_ratios?: string[]; colors?: string[] }

export interface BrandProfile {
  id: number
  name: string | null
  default_language: string | null
  default_tone: string | null
  primary_goal: string | null
  secondary_goals: string[] | null
  content_rules: string[] | null
  brand_summary: string | null
  usp: string | null
  mission: string | null
  brand_values: string[] | null
  brand_promise: string | null
  differentiators: string | null
  proof_points: string[] | null
  price_position: string | null
  main_cta: string | null
  important_links: string[] | null
  positioning: Positioning | null
  key_messages: string[] | null
  content_mix: Record<string, number> | null
  weekly_rhythm: Record<string, RhythmDay> | null
  engagement_goals: string[] | null
  visual_style: VisualStyle | null
  trend_mode: string | null
  setup_step: number | null
  knowledge_score: number | null
  setup_completed_at: string | null
  last_knowledge_sync_at: string | null
}

export type ReadinessKey = 'company' | 'knowledge' | 'audience' | 'voice' | 'channels' | 'strategy_inputs'
/** One readiness section: its score and what is missing, by code (Task 1; `hints` are the server's English for the old screens). */
export interface ReadinessSection { key: ReadinessKey; label: string; score: number; hints: string[]; missing: string[]; faq_count?: number }
export interface Readiness { overall: number; sections: ReadinessSection[] }

/** `GET brand`, and the answer of every brand change: the whole brand as it now is. */
export interface BrandPayload {
  profile: BrandProfile | null
  audiences: Audience[]
  channels: Channel[]
  voice: Voice | null
  readiness: Readiness | null
}

/** What a brand change sends: only the fields it changes. */
export type ProfileFields = Partial<Omit<BrandProfile, 'id' | 'knowledge_score' | 'setup_completed_at' | 'last_knowledge_sync_at'>>
export type VoiceFields = Partial<Omit<Voice, 'id'>>
export type AudienceFields = Partial<Omit<Audience, 'id' | 'posts_count'>>
export type ChannelFields = Partial<Omit<Channel, 'id'>>

export type Intensity = 'light' | 'standard' | 'active'
export interface QuickSetupBody { platforms: Platform[]; name?: string; default_language?: string; primary_goal?: string; intensity?: Intensity }
