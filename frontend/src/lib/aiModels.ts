// Single source of truth for the AI model selector.
//
// Each entry is a *static* description: the live availability of a given
// model on the org's API key is verified separately via the probe endpoint
// (POST /v1/admin/chatbot-config/probe-model). Adding a new model is one
// entry here — the UI gates (reasoning_effort visibility, vision warnings)
// derive from the capability flags rather than hardcoded model-name checks.

export type Provider = 'openai' | 'anthropic' | 'google'

export interface ModelCapabilities {
  /** Supports OpenAI-style `reasoning_effort` parameter (none/low/medium/high/xhigh). */
  reasoning?: boolean
  /** Supports OpenAI-style `text.verbosity` parameter (low/medium/high). */
  verbosity?: boolean
  /** Accepts image inputs in the messages array. */
  vision?: boolean
  /** Supports `response_format: json_schema` strict structured outputs. */
  structuredOutputs?: boolean
  /** Function-calling / tool use. */
  toolUse?: boolean
  /** Supports streaming response chunks. */
  streaming?: boolean
  /** Should be dispatched via /v1/responses (true) or /v1/chat/completions (false). */
  responsesApi?: boolean
  /** Recommended default reasoning_effort when none configured. */
  defaultReasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh'
  /**
   * The server sends the venue's temperature setting to this model (a
   * reasoning model only with reasoning_effort `none`). Absent = the model
   * keeps its own, and the page hides the slider.
   */
  temperature?: boolean
}

export interface ModelEntry {
  /** Exact API model id sent on the wire. */
  id: string
  /** Human label shown in the dropdown. */
  label: string
  /** Short line under the label. */
  blurb?: string
  /** Maximum input context (tokens). For information only. */
  contextTokens?: number
  /** Capability flags — drive UI gates. */
  capabilities: ModelCapabilities
  /** ★ recommended for luxury hospitality. */
  recommended?: boolean
  /** Marked as preview / not yet GA on most accounts. */
  preview?: boolean
}

export interface ProviderEntry {
  id: Provider
  label: string
  /** Picked when user switches provider; should be a known-good GA model. */
  defaultModel: string
  /**
   * Whether a saved model that is no longer listed still receives the
   * temperature setting from the server (the same rule as DispatchesAiChat).
   */
  olderModelsTakeTemperature: boolean
  models: ModelEntry[]
}

// ── OpenAI ──────────────────────────────────────────────────────────────
// A short list on purpose (owner, 2026-11-01): fast, current models that
// hold a natural guest conversation. A venue whose saved model is no longer
// listed keeps it — the server dispatches whatever is stored, and the page
// shows it as an older model (see `isListedModel`).
// Every gpt-5.x model routes through the Responses API (DispatchesAiChat.php
// matches the `gpt-5` prefix); temperature reaches them only with reasoning
// effort `none`.
const openai: ProviderEntry = {
  id: 'openai',
  label: 'OpenAI',
  defaultModel: 'gpt-5.6-terra',
  olderModelsTakeTemperature: true,
  models: [
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', blurb: 'Balanced: natural replies at a good speed',
      capabilities: { reasoning: true, verbosity: true, vision: true, structuredOutputs: true, toolUse: true, streaming: true, responsesApi: true, defaultReasoningEffort: 'low', temperature: true }, recommended: true },
    { id: 'gpt-5.6-luna',  label: 'GPT-5.6 Luna',  blurb: 'Fastest and cheapest, for busy chats',
      capabilities: { reasoning: true, verbosity: true, vision: true, structuredOutputs: true, toolUse: true, streaming: true, responsesApi: true, defaultReasoningEffort: 'low', temperature: true } },
    { id: 'gpt-5.5',       label: 'GPT-5.5',       blurb: 'Most capable, but slower',
      capabilities: { reasoning: true, verbosity: true, vision: true, structuredOutputs: true, toolUse: true, streaming: true, responsesApi: true, defaultReasoningEffort: 'medium', temperature: true } },
  ],
}

// ── Anthropic ───────────────────────────────────────────────────────────
// Claude chooses its own sampling: the server never sends temperature or
// top_p to any Claude model (API version 2026-10-21 refuses them), and asks
// for effort `low` where the model accepts it.
const anthropic: ProviderEntry = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  defaultModel: 'claude-haiku-5-5',
  olderModelsTakeTemperature: false,
  models: [
    { id: 'claude-haiku-5-5',  label: 'Claude Haiku 5.5',  blurb: 'Fastest Claude, quick natural replies',
      capabilities: { vision: true, toolUse: true, streaming: true }, recommended: true },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', blurb: 'Smarter, still quick',
      capabilities: { vision: true, toolUse: true, streaming: true } },
  ],
}

// ── Google Gemini ───────────────────────────────────────────────────────
// Gemini 3 and later keep their default temperature (Google's advice), so the
// server does not send the setting to them; older saved Gemini 2.x still get it.
const google: ProviderEntry = {
  id: 'google',
  label: 'Google (Gemini)',
  defaultModel: 'gemini-3.5-flash-lite',
  olderModelsTakeTemperature: true,
  models: [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', blurb: 'Fast and low-cost',
      capabilities: { vision: true, structuredOutputs: true, toolUse: true, streaming: true }, recommended: true },
  ],
}

export const AI_PROVIDERS: ProviderEntry[] = [openai, anthropic, google]

/** Find a model entry by id, regardless of provider. */
export function findModel(id: string | null | undefined): ModelEntry | null {
  if (!id) return null
  for (const p of AI_PROVIDERS) {
    const m = p.models.find(m => m.id === id)
    if (m) return m
  }
  return null
}

/** Find the provider entry by id. */
export function findProvider(id: string | null | undefined): ProviderEntry | null {
  return AI_PROVIDERS.find(p => p.id === id) ?? null
}

/** Whether the model is one of the provider's listed (current) models. */
export function isListedModel(providerId: string | null | undefined, modelId: string | null | undefined): boolean {
  if (!modelId) return false
  return !!findProvider(providerId)?.models.some(m => m.id === modelId)
}

/**
 * Whether the server sends the temperature setting with this model. A listed
 * model says so in its capabilities; a saved older model follows its
 * provider's rule.
 */
export function takesTemperature(providerId: string | null | undefined, modelId: string | null | undefined): boolean {
  const provider = findProvider(providerId)
  const listed = provider?.models.find(m => m.id === modelId)
  if (listed) return !!listed.capabilities.temperature
  return provider?.olderModelsTakeTemperature ?? true
}

/** Format a model dropdown label including the ★ flag and short blurb. */
export function formatModelLabel(m: ModelEntry): string {
  const star = m.recommended ? ' ★' : ''
  const preview = m.preview ? ' (preview)' : ''
  const blurb = m.blurb ? ` — ${m.blurb}` : ''
  return `${m.label}${star}${preview}${blurb}`
}
