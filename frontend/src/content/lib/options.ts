/**
 * The brand's option lists, moved from the old planner's lib.ts (spec §6.9:
 * its types and metadata move to content/lib; Plan D deletes the old copy).
 * Values are stored exactly as before (the AI reads them); each list maps a
 * value to its English name, the fallback under content.options.<group>.<slug>
 * (options.test.ts keeps the English bundle equal). A stored value no list
 * knows is shown as itself and kept.
 */

export const TONES: Record<string, string> = {
  professional: 'Professional', friendly: 'Friendly', luxury: 'Luxury', bold: 'Bold', expert: 'Expert',
  warm: 'Warm', direct: 'Direct', educational: 'Educational', premium: 'Premium', playful: 'Playful',
}
export const FORMALITY: Record<string, string> = { casual: 'Casual', balanced: 'Balanced', formal: 'Formal' }
export const SENTENCE_STYLES: Record<string, string> = { short: 'Short sentences', balanced: 'Balanced', storytelling: 'Storytelling' }
export const POINTS_OF_VIEW: Record<string, string> = { brand: 'The brand', founder: 'The founder', expert: 'An expert', customer: 'A customer' }
export const EMOJI_POLICIES: Record<string, string> = { none: 'None', light: 'A few', medium: 'Some', expressive: 'Many' }
export const HASHTAG_POLICIES: Record<string, string> = { none: 'None', minimal: 'Minimal', standard: 'Standard', broad: 'Broad' }
export const PRICE_POSITIONS: Record<string, string> = { budget: 'Budget', mid_market: 'Mid-market', premium: 'Premium', luxury: 'Luxury' }
export const TREND_MODES: Record<string, string> = {
  evergreen: 'Evergreen', trend_aware: 'Trend-aware', aggressive_trends: 'Trend testing', conservative: 'Conservative',
}
export const TREND_HINTS: Record<string, string> = {
  evergreen: 'Timeless content, no trend chasing',
  trend_aware: 'Trends only when they fit the brand',
  aggressive_trends: 'Actively test trending formats',
  conservative: 'Strictly professional, no experiments',
}
export const VISUAL_STYLES: Record<string, string> = {
  premium: 'Premium', minimal: 'Minimal', bold: 'Bold', luxury: 'Luxury', realistic: 'Realistic',
  lifestyle: 'Lifestyle', corporate: 'Corporate', educational: 'Educational', dark: 'Dark', light: 'Light',
}
/** Stored with spaces, as the old wizard wrote them. */
export const IMAGE_TYPES: Record<string, string> = {
  'real photos': 'Real photos', screenshots: 'Screenshots', 'UI mockups': 'Interface mock-ups', people: 'People',
  product: 'Product', abstract: 'Abstract', studio: 'Studio', office: 'Office', lifestyle: 'Lifestyle',
}
export const ENGAGEMENT_GOALS: Record<string, string> = {
  comments: 'Comments', saves: 'Saves', shares: 'Shares', dms: 'Direct messages', profile_visits: 'Profile visits',
  link_clicks: 'Link clicks', demo_requests: 'Demo requests', trial_signups: 'Trial sign-ups', bookings: 'Bookings', email_replies: 'Email replies',
}
export const WEEKDAY_ROLES: Record<string, string> = {
  problem_insight: 'Problem or insight', educational: 'Educational, how-to', proof: 'Proof, a case', behind_the_scenes: 'Behind the scenes',
  soft_conversion: 'Soft conversion', community: 'Community', reflection: 'Reflection, recap',
}
export const ROLE_HINTS: Record<string, string> = {
  problem_insight: 'A problem, an insight or a change of view',
  educational: 'Useful content that builds authority',
  proof: 'Trust through evidence, cases, before and after',
  behind_the_scenes: 'People, the team and their story',
  soft_conversion: 'Closer to action without hard selling',
  community: 'Polls, questions, light interaction',
  reflection: 'Recaps, lessons, planning prompts',
}
export const MIX_CATEGORIES: Record<string, string> = {
  education: 'Education', problem_awareness: 'Problem awareness', myths: 'Myths and misconceptions', product_explanation: 'Product explanation',
  behind_the_scenes: 'Behind the scenes', social_proof: 'Social proof', thought_leadership: 'Thought leadership', faq_answers: 'FAQ answers',
  case_studies: 'Case studies', community: 'Community and interaction', soft_promotion: 'Soft promotion', direct_conversion: 'Direct conversion',
}
export const INTENSITIES: Record<string, string> = { light: 'Light', standard: 'Standard', active: 'Active' }

/** Every list by its group in content.options (the bundle test walks this). */
export const OPTION_GROUPS = {
  tone: TONES, formality: FORMALITY, sentence_style: SENTENCE_STYLES, point_of_view: POINTS_OF_VIEW,
  emoji: EMOJI_POLICIES, hashtag: HASHTAG_POLICIES, price: PRICE_POSITIONS, trend: TREND_MODES, trend_hint: TREND_HINTS,
  visual_style: VISUAL_STYLES, image_type: IMAGE_TYPES, engagement: ENGAGEMENT_GOALS, role: WEEKDAY_ROLES, role_hint: ROLE_HINTS,
  mix: MIX_CATEGORIES, intensity: INTENSITIES,
} as const
export type OptionGroup = keyof typeof OPTION_GROUPS

/** The content mix a manager starts from (100 %). */
export const DEFAULT_MIX: Record<string, number> = {
  education: 25, problem_awareness: 15, thought_leadership: 15, product_explanation: 10,
  social_proof: 10, behind_the_scenes: 10, community: 10, soft_promotion: 5,
}
/** The weekly rhythm keys its days by their full English names (as the AI reads them). */
export const RHYTHM_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export const DEFAULT_RHYTHM: Record<string, { role: string; notes: string }> = {
  monday: { role: 'problem_insight', notes: '' }, tuesday: { role: 'educational', notes: '' }, wednesday: { role: 'proof', notes: '' },
  thursday: { role: 'behind_the_scenes', notes: '' }, friday: { role: 'soft_conversion', notes: '' }, saturday: { role: 'community', notes: '' },
  sunday: { role: 'reflection', notes: '' },
}
/** A channel's posting days, Monday first. */
export const CHANNEL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** A stored value as a key part: lower case, spaces to underscores ("UI mockups" → ui_mockups). */
export const optionSlug = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '_')

/** A value's name in the reader's words; a value the list does not know reads as itself. */
export function optionText(t: (key: string, fallback: string) => string, group: OptionGroup, value: string): string {
  const english = (OPTION_GROUPS[group] as Record<string, string>)[value]
  return english === undefined ? value : t(`content.options.${group}.${optionSlug(value)}`, english)
}
