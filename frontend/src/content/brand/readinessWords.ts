import type { ReadinessKey } from '../lib/types'

/** Readiness sections in the portal's words (the server's labels are English). */
export const SECTION_TEXT: Record<ReadinessKey, string> = {
  company: 'Company and brand', knowledge: 'Knowledge', audience: 'Audiences', voice: 'Voice', channels: 'Channels', strategy_inputs: 'Strategy inputs',
}

/** Every readiness gap by its code (ContentKnowledgeService::GAPS; a PHP test keeps the two lists equal). */
export const GAP_TEXT: Record<string, string> = {
  company_name: 'The organisation has no name yet (full admin, Settings).',
  company_industry: 'The organisation has no industry yet (full admin, Settings).',
  company_website: 'The organisation has no website yet (full admin, Settings).',
  brand_summary: 'Add a brand summary (Brand DNA).',
  usp: 'Say what makes the brand different (Brand DNA).',
  mission: 'Add the mission (Brand DNA).',
  faq_none: 'Add questions and answers to the knowledge base of the AI chat widget.',
  faq_more: 'Add more questions and answers to the knowledge base: {{count}} so far, 5 or more work best.',
  services: 'Add your services or products in the full admin.',
  audience_none: 'Add at least one audience (Audiences).',
  audience_pains: 'Give every audience its pain points.',
  audience_goals: 'Give every audience its goals.',
  voice_none: 'Describe the brand voice (Voice).',
  voice_tone: 'Choose a tone (Voice).',
  voice_emoji: 'Choose how many emoji to use (Voice).',
  voice_hashtag: 'Choose how many hashtags to use (Voice).',
  channels_none: 'Switch on at least one channel (Channels).',
  channels_days: 'Choose posting days on your channels.',
  channels_per_week: 'Set posts per week on your channels.',
  content_mix: 'Set the content mix (Rhythm and goals).',
  weekly_rhythm: 'Set the weekly rhythm (Rhythm and goals).',
  engagement_goals: 'Choose engagement goals (Rhythm and goals).',
}
