/**
 * What the chatbot's admin endpoints answer (ChatbotConfigController, ChatbotOnboardingController,
 * KnowledgeBaseController, PopupRuleController). Only the fields the AI assistant area reads.
 */

export type SalesStyle = 'consultative' | 'aggressive' | 'passive' | 'educational'
export type Tone = 'professional' | 'friendly' | 'casual' | 'formal'
export type ReplyLength = 'concise' | 'moderate' | 'detailed'

/** GET chatbot-config/behavior: the saved row, or an unsaved template (no id) with the defaults. */
export interface BehaviourConfig {
  id?: number
  assistant_name: string | null
  identity: string | null
  goal: string | null
  sales_style: SalesStyle | null
  tone: Tone | null
  reply_length: ReplyLength | null
  language: string | null
  core_rules: string[] | null
  escalation_policy: string | null
  fallback_message: string | null
  custom_instructions: string | null
  is_active: boolean | null
}

/** One fact the quick setup asks for (ChatbotPresetService facts). */
export interface OnboardingFact { label: string; placeholder: string; required: boolean }

/** GET chatbot-onboarding (ChatbotOnboardingService::state). */
export interface OnboardingState {
  completed: boolean
  industry: string
  widget_key: string | null
  preset: {
    assistant_name: string
    tone: string
    goal: string
    core_rules: string[]
    escalation_policy: string
    fallback_message: string
    welcome_title: string
    welcome_subtitle: string
    suggestions: string[]
  }
  facts: Record<string, OnboardingFact>
  prefill: Record<string, string>
}

/** POST chatbot-onboarding: what was written. */
export interface OnboardingResult { knowledge_created: number; facts_supplied: number; industry: string }

export interface KnowledgeCategory {
  id: number
  name: string
  description: string | null
  priority: number
  sort_order: number
  is_active: boolean
  items_count?: number
}

export interface KnowledgeItem {
  id: number
  category_id: number | null
  question: string
  answer: string
  keywords: string[] | null
  priority: number
  use_count: number
  is_active: boolean
  category?: { id: number; name: string } | null
}

export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface KnowledgeDocument {
  id: number
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  extracted_text: string | null
  chunks_count: number | null
  processing_status: DocumentStatus
  created_at: string | null
}

/** One question and answer the AI drafted from pasted text (knowledge/extract-faqs). */
export interface DraftFaq { question: string; answer: string; keywords: string[] }

export type TriggerType = 'page_load' | 'time_delay' | 'scroll_depth' | 'exit_intent'
export type UrlMatch = 'exact' | 'contains' | 'starts_with' | 'regex'
export type VisitorType = 'all' | 'new' | 'returning'

export interface PopupRule {
  id: number
  name: string
  is_active: boolean
  trigger_type: TriggerType
  trigger_value: string | null
  url_match_type: UrlMatch | null
  url_match_value: string | null
  visitor_type: VisitorType | null
  language_targets: string[] | null
  message: string
  quick_replies: string[] | null
  priority: number
  impressions_count: number | null
  clicks_count: number | null
}

/** POST chatbot-config/test-chat. */
export interface TestChatReply { reply: string; kb_context_used: boolean; system_prompt: string }

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
