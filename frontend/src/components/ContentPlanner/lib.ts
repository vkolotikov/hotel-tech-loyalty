import { api } from '../../lib/api'

/**
 * Shared types, API calls, and metadata for the AI Content Planner.
 * NOTE: the axios `api` baseURL already ends in `/api`, so every path
 * here starts with `/v1/...` (never `/api/v1/...`).
 */

/* ─── Types ──────────────────────────────────────────────────────── */

export interface Readiness {
  overall: number
  sections: { key: string; label: string; score: number; hints: string[] }[]
}

export interface Audience {
  id?: number
  name: string
  description?: string | null
  job_role?: string | null
  industry?: string | null
  country?: string | null
  language?: string | null
  business_size?: string | null
  pain_points?: string[] | null
  goals?: string[] | null
  fears?: string[] | null
  objections?: string[] | null
  buying_triggers?: string[] | null
  emotional_triggers?: string[] | null
  rational_triggers?: string[] | null
  questions?: string[] | null
  content_they_trust?: string | null
  desired_transformation?: string | null
  preferred_platforms?: string[] | null
  is_ai_assumed?: boolean
}

export interface Channel {
  id?: number
  platform: string
  label: string
  url?: string | null
  goal?: string | null
  role?: string | null
  audience_id?: number | null
  audience_index?: number | null
  posts_per_week?: number | null
  frequency?: Record<string, boolean> | null
  preferred_formats?: string[] | null
  emoji_policy?: string | null
  hashtag_policy?: string | null
  cta_style?: string | null
  visual_style?: string | null
  link_policy?: string | null
  tone_override?: string | null
  active: boolean
}

export interface BrandVoice {
  tone?: string | null
  formality_level?: string | null
  emoji_policy?: string | null
  hashtag_policy?: string | null
  sentence_style?: string | null
  point_of_view?: string | null
  preferred_words?: string[] | null
  forbidden_words?: string[] | null
  claims_to_avoid?: string[] | null
}

export interface Pillar {
  id: number
  name: string
  description?: string | null
  purpose?: string | null
  frequency_weight: number
  recommended_platforms?: string[] | null
  example_topics?: string[] | null
  cta_examples?: string[] | null
  visual_direction?: string | null
  active: boolean
}

export interface Positioning {
  old_way?: string
  new_way?: string
  beliefs?: string[]
  transformation?: string
}

export interface VisualStyle {
  style?: string
  image_types?: string[]
  avoid?: string[]
  aspect_ratios?: string[]
  colors?: string[]
}

export interface PlannerProfile {
  id: number
  name: string | null
  default_language: string
  default_tone: string | null
  primary_goal: string | null
  secondary_goals: string[] | null
  knowledge_sources: Record<string, boolean> | null
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
  weekly_rhythm: Record<string, { role: string; notes?: string }> | null
  engagement_goals: string[] | null
  visual_style: VisualStyle | null
  trend_mode: string | null
  knowledge_score: number | null
  setup_step: number
  setup_completed_at: string | null
  last_knowledge_sync_at: string | null
  audiences?: Audience[]
  channels?: Channel[]
  brand_voices?: BrandVoice[]
  pillars?: Pillar[]
}

export interface EngagementMechanic {
  type?: string
  instruction?: string
}

export interface VisualBrief {
  id?: number
  visual_type?: string | null
  aspect_ratio?: string | null
  style?: string | null
  description?: string | null
  scene?: string | null
  mood?: string | null
  composition?: string | null
  text_overlay?: string | null
  avoid?: string | null
  video_script?: string | null
  image_prompt_future?: string | null
  image_url?: string | null
  image_status?: string | null
  image_model?: string | null
  image_error?: string | null
  image_generated_at?: string | null
  metadata?: Record<string, unknown> | null
}

export interface QualityScore {
  scores?: Record<string, number>
  overall?: number
  flags?: string[]
  improvements?: string[]
  verdict?: string
}

export interface PostVariation {
  id: number
  variation_type: string
  copy: string
  created_at?: string
}

export interface Post {
  id: number
  platform: string
  scheduled_date: string | null
  scheduled_time: string | null
  language: string
  topic: string | null
  title: string | null
  goal: string | null
  format: string | null
  status: string
  main_copy: string | null
  short_copy: string | null
  hook: string | null
  cta: string | null
  hashtags: string[] | null
  weekday_role: string | null
  funnel_stage: string | null
  post_type: string | null
  strategic_reason: string | null
  engagement_mechanic: EngagementMechanic | null
  quality_score: QualityScore | null
  source_context: { hook_alternatives?: string[] } | null
  generated_by: string | null
  published_url: string | null
  published_at: string | null
  pillar_id: number | null
  audience_id: number | null
  pillar?: Pillar | null
  audience?: Audience | null
  visual_brief?: VisualBrief | null
  variations?: PostVariation[]
  created_at?: string
}

export interface StrategyOutput {
  title?: string
  brand_summary?: string
  positioning_narrative?: { old_way?: string; new_way?: string; beliefs?: string[]; key_messages?: string[] }
  audience_map?: { name: string; pains?: string[]; desires?: string[]; objections?: string[]; emotional_triggers?: string[]; content_they_engage_with?: string[] }[]
  content_pillars?: { name: string; description?: string; purpose?: string; frequency_weight?: number; recommended_platforms?: string[]; example_topics?: string[]; cta_examples?: string[]; visual_direction?: string }[]
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
  assumptions?: string[]
  next_actions?: string[]
}

export interface Strategy {
  id: number
  title: string
  summary: string | null
  content_mix: Record<string, number> | null
  platform_strategy: Record<string, unknown> | null
  visual_direction: string | null
  ai_output: StrategyOutput | null
  status: string
  created_at: string
  pillars?: Pillar[]
}

export interface ProfileResponse {
  exists: boolean
  profile?: PlannerProfile
  readiness?: Readiness
  detected_knowledge?: {
    sources?: { has_faq?: boolean; faq_count?: number; has_chatbot?: boolean; has_services?: boolean; has_org_info?: boolean }
    faq?: { question: string; answer: string }[]
    services?: { name: string; description?: string }[]
    organization?: { name?: string; industry?: string; website?: string }
    missing_fields?: string[]
  }
}

/* ─── API calls ──────────────────────────────────────────────────── */

const BASE = '/v1/admin/content-planner'
const AI_TIMEOUT = 360_000 // strategy/post AI calls can take minutes

export const cp = {
  getProfile: () => api.get<ProfileResponse>(`${BASE}/profile`).then(r => r.data),
  saveProfile: (payload: Record<string, unknown>) =>
    api.post(`${BASE}/profile`, payload, { timeout: 120_000 }).then(r => r.data),
  quickSetup: (payload: { name?: string; default_language?: string; primary_goal?: string; platforms: string[]; intensity?: string }) =>
    api.post(`${BASE}/profile/quick-setup`, payload, { timeout: AI_TIMEOUT }).then(r => r.data),
  updateProfile: (id: number, payload: Record<string, unknown>) =>
    api.put(`${BASE}/profile/${id}`, payload).then(r => r.data),
  getReadiness: () => api.get<{ readiness: Readiness }>(`${BASE}/profile/readiness`).then(r => r.data),
  refreshKnowledge: (id: number) => api.post(`${BASE}/profile/${id}/refresh-knowledge`).then(r => r.data),

  listStrategies: (profileId: number) =>
    api.get(`${BASE}/strategies`, { params: { planner_profile_id: profileId } }).then(r => r.data),
  generateStrategy: (profileId: number, instructions?: string) =>
    api.post(`${BASE}/strategies/generate`, { planner_profile_id: profileId, instructions }, { timeout: AI_TIMEOUT }).then(r => r.data),
  archiveStrategy: (id: number) => api.delete(`${BASE}/strategies/${id}`).then(r => r.data),

  listPosts: (params: Record<string, unknown>) =>
    api.get(`${BASE}/posts`, { params }).then(r => r.data),
  getPost: (id: number) => api.get<Post>(`${BASE}/posts/${id}`).then(r => r.data),
  createPost: (payload: Record<string, unknown>) => api.post(`${BASE}/posts`, payload).then(r => r.data),
  updatePost: (id: number, payload: Record<string, unknown>) =>
    api.put(`${BASE}/posts/${id}`, payload).then(r => r.data),
  deletePost: (id: number) => api.delete(`${BASE}/posts/${id}`).then(r => r.data),
  duplicatePost: (id: number) => api.post(`${BASE}/posts/${id}/duplicate`).then(r => r.data),
  generateCopy: (id: number) =>
    api.post(`${BASE}/posts/${id}/generate-copy`, {}, { timeout: AI_TIMEOUT }).then(r => r.data),
  generateAlternative: (id: number, type: string) =>
    api.post(`${BASE}/posts/${id}/generate-alternative?type=${type}`, {}, { timeout: AI_TIMEOUT }).then(r => r.data),
  generateVisualBrief: (id: number) =>
    api.post(`${BASE}/posts/${id}/visual-brief`, {}, { timeout: AI_TIMEOUT }).then(r => r.data),
  generateImage: (id: number) =>
    api.post(`${BASE}/posts/${id}/generate-image`, {}, { timeout: AI_TIMEOUT }).then(r => r.data),
  qualityCheck: (id: number) =>
    api.post(`${BASE}/posts/${id}/quality-check`, {}, { timeout: AI_TIMEOUT }).then(r => r.data),
  markReady: (id: number) => api.post(`${BASE}/posts/${id}/mark-ready`).then(r => r.data),
  markPublished: (id: number, url?: string) =>
    api.post(`${BASE}/posts/${id}/mark-published`, url ? { published_url: url } : {}).then(r => r.data),

  generateCalendar: (payload: { planner_profile_id: number; start_date: string; end_date: string; platforms?: string[]; fill_empty_only?: boolean; instructions?: string }) =>
    api.post(`${BASE}/calendar/generate`, payload, { timeout: 600_000 }).then(r => r.data),
}

/** Extract a human error message from an axios error. */
export function errMsg(e: unknown): string {
  const err = e as { response?: { data?: { message?: string; error?: string } }; message?: string }
  return err.response?.data?.message || err.response?.data?.error || err.message || 'Something went wrong'
}

/* ─── Metadata (must match backend enums) ────────────────────────── */

export const PLATFORM_META: Record<string, { label: string; color: string; short: string }> = {
  linkedin:  { label: 'LinkedIn',  color: '#0a66c2', short: 'in' },
  instagram: { label: 'Instagram', color: '#e1306c', short: 'ig' },
  tiktok:    { label: 'TikTok',    color: '#00f2ea', short: 'tt' },
  facebook:  { label: 'Facebook',  color: '#1877f2', short: 'fb' },
  x:         { label: 'X',         color: '#9ca3af', short: 'x' },
  youtube:   { label: 'YouTube',   color: '#ff0000', short: 'yt' },
  blog:      { label: 'Blog',      color: '#f59e0b', short: 'bl' },
  email:     { label: 'Email',     color: '#8b5cf6', short: 'em' },
}
export const PLATFORMS = Object.keys(PLATFORM_META)

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  idea:             { label: 'Idea',          color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' },
  draft:            { label: 'Draft',         color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  needs_review:     { label: 'Needs review',  color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  needs_visual:     { label: 'Needs visual',  color: '#f472b6', bg: 'rgba(244,114,182,0.15)' },
  approved:         { label: 'Approved',      color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  ready_to_publish: { label: 'Ready',         color: '#10b981', bg: 'rgba(16,185,129,0.18)' },
  published:        { label: 'Published',     color: '#22c55e', bg: 'rgba(34,197,94,0.18)' },
  skipped:          { label: 'Skipped',       color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  archived:         { label: 'Archived',      color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
}

export const MIX_CATEGORIES: Record<string, string> = {
  education: 'Education',
  problem_awareness: 'Problem awareness',
  myths: 'Myths & misconceptions',
  product_explanation: 'Product explanation',
  behind_the_scenes: 'Behind the scenes',
  social_proof: 'Social proof',
  thought_leadership: 'Thought leadership',
  faq_answers: 'FAQ answers',
  case_studies: 'Case studies',
  community: 'Community & interaction',
  soft_promotion: 'Soft promotion',
  direct_conversion: 'Direct conversion',
}

export const DEFAULT_MIX: Record<string, number> = {
  education: 25,
  problem_awareness: 15,
  thought_leadership: 15,
  product_explanation: 10,
  social_proof: 10,
  behind_the_scenes: 10,
  community: 10,
  soft_promotion: 5,
}

export const WEEKDAY_ROLE_META: Record<string, { label: string; desc: string }> = {
  problem_insight:   { label: 'Problem / Insight',    desc: 'Strategic thought, problem, or perspective shift' },
  educational:       { label: 'Educational / How-to', desc: 'Useful content that builds authority' },
  proof:             { label: 'Proof / Case',         desc: 'Trust through evidence, cases, before/after' },
  behind_the_scenes: { label: 'Behind the scenes',    desc: 'Human, team, and story content' },
  soft_conversion:   { label: 'Soft conversion',      desc: 'Move people closer to action without hard selling' },
  community:         { label: 'Community',            desc: 'Polls, questions, light interaction' },
  reflection:        { label: 'Reflection / Recap',   desc: 'Recaps, lessons, planning prompts' },
}

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export const DEFAULT_RHYTHM: Record<string, { role: string; notes: string }> = {
  monday:    { role: 'problem_insight',   notes: '' },
  tuesday:   { role: 'educational',       notes: '' },
  wednesday: { role: 'proof',             notes: '' },
  thursday:  { role: 'behind_the_scenes', notes: '' },
  friday:    { role: 'soft_conversion',   notes: '' },
  saturday:  { role: 'community',         notes: '' },
  sunday:    { role: 'reflection',        notes: '' },
}

export const ENGAGEMENT_GOALS: Record<string, string> = {
  comments: 'Comments',
  saves: 'Saves',
  shares: 'Shares',
  dms: 'Direct messages',
  profile_visits: 'Profile visits',
  link_clicks: 'Link clicks',
  demo_requests: 'Demo requests',
  trial_signups: 'Trial signups',
  bookings: 'Bookings',
  email_replies: 'Email replies',
}

export const TONES = ['professional', 'friendly', 'luxury', 'bold', 'expert', 'warm', 'direct', 'educational', 'premium', 'playful']

export const TREND_MODES: Record<string, { label: string; desc: string }> = {
  evergreen:         { label: 'Evergreen',        desc: 'Timeless content, no trend chasing' },
  trend_aware:       { label: 'Trend-aware',      desc: 'Adapt trends only when they fit the brand' },
  aggressive_trends: { label: 'Trend testing',    desc: 'Actively test trending formats' },
  conservative:      { label: 'Conservative',     desc: 'Strictly professional, no experiments' },
}

export const PRICE_POSITIONS: Record<string, string> = {
  budget: 'Budget',
  mid_market: 'Mid-market',
  premium: 'Premium',
  luxury: 'Luxury',
}

export const FUNNEL_STAGES: Record<string, string> = {
  awareness: 'Awareness',
  consideration: 'Consideration',
  conversion: 'Conversion',
  retention: 'Retention',
}

export const POST_TYPES: Record<string, string> = {
  problem_aware: 'Problem awareness',
  myth_busting: 'Myth busting',
  how_to: 'How-to',
  checklist: 'Checklist',
  mistakes: 'Mistakes list',
  comparison: 'Comparison',
  story: 'Story',
  before_after: 'Before / After',
  faq_answer: 'FAQ answer',
  behind_the_scenes: 'Behind the scenes',
  case_study: 'Case study',
  soft_offer: 'Soft offer',
  founder_opinion: 'Founder opinion',
  trend_reaction: 'Trend reaction',
  poll_question: 'Poll / Question',
  carousel: 'Carousel',
  video_script: 'Video script',
  product_demo: 'Product demo',
}

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'German' },
  { code: 'ru', label: 'Russian' },
  { code: 'lv', label: 'Latvian' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'et', label: 'Estonian' },
  { code: 'pl', label: 'Polish' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'uk', label: 'Ukrainian' },
]

export const GOAL_PRESETS = ['Increase brand awareness', 'Generate leads', 'Drive sales', 'Build community', 'Improve engagement']

export const FORMALITY_LEVELS = ['casual', 'balanced', 'formal']
export const SENTENCE_STYLES = ['short', 'balanced', 'storytelling']
export const POINTS_OF_VIEW = ['brand', 'founder', 'expert', 'customer']
export const EMOJI_POLICIES = ['none', 'light', 'medium', 'expressive']
export const HASHTAG_POLICIES = ['none', 'minimal', 'standard', 'broad']
export const VISUAL_STYLES = ['premium', 'minimal', 'bold', 'luxury', 'realistic', 'lifestyle', 'corporate', 'educational', 'dark', 'light']
export const IMAGE_TYPES = ['real photos', 'screenshots', 'UI mockups', 'people', 'product', 'abstract', 'studio', 'office', 'lifestyle']

/* ─── Small helpers ──────────────────────────────────────────────── */

export function fmtDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Normalize a backend date (may be "2026-07-15T00:00:00.000000Z") to YYYY-MM-DD. */
export function dateOnly(s: string | null | undefined): string | null {
  if (!s) return null
  return s.slice(0, 10)
}

export function scorePct(v: number | undefined | null, max = 10): number {
  if (v == null) return 0
  return Math.max(0, Math.min(100, Math.round((v / max) * 100)))
}
