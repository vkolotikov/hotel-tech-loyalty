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
  /** `id`: the user's own id — the posts they post (spec 2026-10-19 §4.4); `morning_email`: their switch (§4.5). */
  staff: { name: string; role: string | null; can_manage: boolean; id?: number; morning_email?: boolean }
  /** `requires_approval`: the brand's posts need a manager's approval (spec 2026-10-16 §6.1). */
  profile: { id: number; setup_completed: boolean; readiness: number; requires_approval?: boolean } | null
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
  /** Spec 2026-10-16 §7.1: its comments, counted. */
  comments_count?: number
  /** Spec §6.3: a draft whose latest approval step sent it back, with no change to the post since. */
  sent_back?: boolean
  /** Spec 2026-10-19 §3.4: the posts in its group of versions (0 for none and for a group of one). */
  group_size?: number
  /** Spec 2026-10-19 §4.1: who posts it, as stored (the panel's `poster` says whether they are still on the team). */
  poster_id?: number | null
  /** Spec 2026-10-19 §5.5: its short link's clicks in all (0 without a Link). */
  clicks?: number
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
  /** The repeat series it belongs to (the original's id), and how that series runs (spec 2026-10-15 §8). */
  series_id?: number | null
  series?: Series | null
  /** Who wrote it (spec 2026-10-16 §7.1): null for a post the AI or a repeat made, or whose writer left. */
  author?: string | null
  /** Its comments and approval steps, oldest first, the newest 200 (`GET posts/{id}` and the approval steps send it). */
  timeline?: TimelineItem[]
  /** Its versions for other platforms (spec 2026-10-19 §3.4); null when it is in no group (or a group of one). */
  group?: PostGroup | null
  /** Who posts it: a member of the brand's team, or null for nobody (also someone who left) (spec 2026-10-19 §4.1). */
  poster?: Person | null
  /** Its tracked short link (spec 2026-10-19 §5.5); null when it never had a Link. */
  link?: ShortLinkFacts | null
}

/** A post in a group of versions, as the panel lists it (spec 2026-10-19 §3.4). */
export interface GroupPost { id: number; platform: Platform; status: PostStatus; scheduled_date: DateKey | null; scheduled_time: string | null }
/** A post's group: its posts oldest first, the versions the AI is still adapting, and those it did not adapt, and why (§3.3). */
export interface PostGroup { id: number; posts: GroupPost[]; adapting: number[]; kept_original: number[]; kept_reason: 'budget' | 'ai_failed' | null }
/** Someone on the brand's team, for "Who posts it" (spec 2026-10-19 §4.1). */
export interface TeamMember { id: number; name: string; role: 'manager' | 'staff' }

/** A post's short link and its clicks (spec 2026-10-19 §5.5): `on` false once its Link was cleared; `days` the last 14 venue days, oldest first. */
export interface ShortLinkFacts { code: string; short_url: string; destination: string | null; on: boolean; clicks: number; clicks_bio: number; days: { day: DateKey; clicks: number }[] }
/** A brand's link-in-bio page (spec §6): off until a manager switches it on; `title` null is the brand's name. */
export interface BioPage { is_on: boolean; slug: string; title: string | null; line: string | null; show_posts: boolean }
/** A button on it, with its short link and its clicks over the last 30 venue days. */
export interface BioButton { id: number; label: string; destination: string | null; short_url: string | null; clicks_30d: number }
/** `GET bio`: the page (null before its first save), its buttons in order, its address, a name to start from, and the address without a name. */
export interface BioPayload { page: BioPage | null; buttons: BioButton[]; url: string | null; suggested_name: string; base_url: string }
/** `PUT bio`: the whole page and its buttons in order; a button sent with its id keeps its short link. */
export interface BioBody { is_on: boolean; slug: string; title: string | null; line: string | null; show_posts: boolean; buttons: { id?: number; label: string; destination: string }[] }

/** A day and platform the brand's channels expect, with no post yet. */
export interface Slot { date: DateKey; platform: Platform }
export interface PlanFigures { planned: number; ready: number; published: number; open_slots: number }
export interface PlanPayload {
  posts: PostCard[]
  unscheduled: PostCard[]
  unscheduled_total?: number
  slots: Slot[]
  figures: PlanFigures
  /** The range's holidays, special days, events and notes (spec 2026-10-16 §3.4). */
  key_dates?: KeyDate[]
}

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
  /** Who posts it (spec 2026-10-19 §4.1): a member of the team, or null for nobody. */
  poster_id?: number | null
  /** The Link (spec 2026-10-19 §5.1): an http(s) address, or null to switch its short link off. */
  link?: string | null
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
  /** Why a run stopped before it could report (`generation_failed`, `no_channels`). */
  error?: string
  finished_at?: string
}

/**
 * A brand's Generate run as `POST`/`GET generate` answer it (2026-10-20: the run is a job on the queue worker): none yet,
 * running (202 on POST), or its result.
 */
export type GenerateRun = { status: 'idle' } | { status: 'running'; started_at: string; from?: DateKey; to?: DateKey } | GenerateResult

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
  /** The channel's usual posting time, HH:MM; null = the first suggested time (spec 2026-10-15 §5). */
  post_time: string | null
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
  /** Spec 2026-10-16 §3.3: null = never chosen (guessed), one of the nine countries, or "none". */
  holiday_country?: string | null
  /** Marketing and industry days on the Plan (default on). */
  marketing_days?: boolean
  /** Spec 2026-10-16 §6.1: posts need a manager's approval (default off, managers switch it). */
  requires_approval?: boolean
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
  /** The brand's hashtag groups and text snippets (spec 2026-10-15 §6); every brand answer carries them. */
  snippets?: Snippet[]
  /** The brand's post templates (spec 2026-10-16 §5); every brand answer carries them. */
  templates?: Template[]
  /** The holiday country the venue suggests (its organisation's country or time zone), for "guessed". */
  holiday_country_guess?: string | null
}

/** What a brand change sends: only the fields it changes. */
export type ProfileFields = Partial<Omit<BrandProfile, 'id' | 'knowledge_score' | 'setup_completed_at' | 'last_knowledge_sync_at'>>
export type VoiceFields = Partial<Omit<Voice, 'id'>>
export type AudienceFields = Partial<Omit<Audience, 'id' | 'posts_count'>>
export type ChannelFields = Partial<Omit<Channel, 'id'>>

export type Intensity = 'light' | 'standard' | 'active'
export interface QuickSetupBody { platforms: Platform[]; name?: string; default_language?: string; primary_goal?: string; intensity?: Intensity }

/** A saved hashtag group or text snippet of the brand (spec 2026-10-15 §6). */
export type SnippetKind = 'hashtags' | 'text'
export interface Snippet { id: number; kind: SnippetKind; name: string; body: string }
/** A hashtag group the AI proposes: nothing is saved until a manager adds it. */
export interface SnippetSuggestion { name: string; body: string }

/** A built-in day on the Plan (spec 2026-10-16 §3.2); `substitute` is the day off in lieu (observed, in the US). */
export type BuiltInKind = 'holiday' | 'marketing' | 'industry'
export interface BuiltInDay { id: string; kind: BuiltInKind; date: DateKey; substitute: boolean; name_en: string }
/** The brand's own key date (spec §3.1): an event of up to 31 days, or a note; `end` is null for one day. */
export type OwnKind = 'event' | 'note'
export interface OwnKeyDate { id: number; kind: OwnKind; title: string; details: string | null; start: DateKey; end: DateKey | null }
export type KeyDate = BuiltInDay | OwnKeyDate
export interface KeyDateFields { kind?: OwnKind; title?: string; details?: string | null; start_date?: DateKey; end_date?: DateKey | null }

/** A post template (spec 2026-10-16 §5.1): words with [blanks]; the pillar kept by name. */
export interface Template {
  id: number
  name: string
  platform: Platform | null
  pillar_name: string | null
  topic: string | null
  hook: string | null
  main_copy: string | null
  cta: string | null
  hashtags: string[]
}
export type TemplateFields = Partial<Omit<Template, 'id'>>
/** A template the AI proposes: nothing is saved until a manager adds it. */
export type TemplateSuggestion = Omit<Template, 'id'>

/** The Ideas board (spec 2026-10-16 §4.1): the posts without a day, by stage. */
export type IdeasColumn = 'idea' | 'draft' | 'review' | 'ready'
export interface IdeasPayload { columns: Record<IdeasColumn, { posts: PostCard[]; total: number }> }

/** Posting goals for the venue's current week, per platform, and the streak (spec 2026-10-15 §7). */
export interface GoalPlatform { platform: Platform; target: number; published: number; planned: number }
export interface Streak { weeks: number; current_met: boolean; at_risk: boolean; short_by: number }
export interface Goals { week: { from: DateKey; to: DateKey } | null; platforms: GoalPlatform[]; streak: Streak }

/** How often a repeated post comes back (spec 2026-10-15 §8). */
export type RepeatEvery = 'week' | '2weeks' | 'month'
/** A post's series as the server reads it: `more` copies still ahead after this post, `removable` what Stop removes. */
export interface Series { id: number; every: RepeatEvery; until: DateKey | null; more: number; removable: number; rewriting: boolean }

/** Someone on the team as the timeline and the bell name them; null in their place when they have left (spec 2026-10-16 §7.1). */
export interface Person { id: number; name: string }
/** An approval step (spec §6.4). */
export type EventKind = 'sent_for_approval' | 'approved' | 'sent_back' | 'changed_after_approval'
export interface TimelineComment { type: 'comment'; id: number; user: Person | null; body: string; edited: boolean; mine: boolean; at: string }
export interface TimelineEvent { type: 'event'; id: number; kind: EventKind; user: Person | null; note: string | null; at: string }
export type TimelineItem = TimelineComment | TimelineEvent

/** One line of the "For you" list (spec §8): what waits for this manager, or news since they last looked. */
export type InboxKind = 'waiting' | 'approved' | 'sent_back' | 'comment' | 'to_post' | 'not_posted'
export interface InboxItem {
  id: string
  kind: InboxKind
  /** The reminders' second line reads its time and status (spec 2026-10-19 §4.3). */
  post: (Pick<PostCard, 'id' | 'platform' | 'title' | 'hook' | 'topic' | 'scheduled_date'> & { scheduled_time?: string | null; status?: PostStatus }) | null
  /** Who acted or commented; for a waiting post, its writer. */
  by: Person | null
  /** A send-back's note or a comment, cut to 200 characters. */
  note: string | null
  at: string
  unread: boolean
}
/** `GET inbox`: the newest 50, everything counted, and when it was read ("seen" goes up to that). */
export interface InboxPayload { items: InboxItem[]; count: number; read_at: string }
