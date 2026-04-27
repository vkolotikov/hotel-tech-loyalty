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
  models: ModelEntry[]
}

// ── OpenAI ──────────────────────────────────────────────────────────────
// Only models we have actually shipped support for via dispatchOpenAi() in
// DispatchesAiChat.php. Pricing/spec details intentionally NOT encoded here
// (they change too often and aren't load-bearing for routing).
const openai: ProviderEntry = {
  id: 'openai',
  label: 'OpenAI',
  defaultModel: 'gpt-4.1',
  models: [
    // gpt-5.x models route through the Responses API per OpenAI's official
    // guidance — Chat Completions is the wrong endpoint for these models
    // and was the cause of "some models don't work correctly" reports.
    { id: 'gpt-5.5',      label: 'GPT-5.5',      blurb: 'Newest — efficient reasoning, polished tone, Responses-API native',
      capabilities: { reasoning: true, verbosity: true, vision: true, structuredOutputs: true, toolUse: true, streaming: true, responsesApi: true, defaultReasoningEffort: 'medium' }, recommended: true },
    { id: 'gpt-5.4-pro',  label: 'GPT-5.4 Pro',  blurb: 'Top-tier reasoning, best for luxury sales',
      capabilities: { reasoning: true, verbosity: true, vision: true, structuredOutputs: true, toolUse: true, streaming: true, responsesApi: true, defaultReasoningEffort: 'low' } },
    { id: 'gpt-5.4',      label: 'GPT-5.4',      blurb: 'Flagship GPT-5.4',
      capabilities: { reasoning: true, verbosity: true, vision: true, structuredOutputs: true, toolUse: true, streaming: true, responsesApi: true, defaultReasoningEffort: 'low' } },
    { id: 'gpt-5',        label: 'GPT-5',        blurb: 'GPT-5 alias',
      capabilities: { reasoning: true, verbosity: true, vision: true, structuredOutputs: true, toolUse: true, streaming: true, responsesApi: true, defaultReasoningEffort: 'low' } },
    { id: 'gpt-5-mini',   label: 'GPT-5 Mini',   blurb: 'Faster, cheaper GPT-5',
      capabilities: { reasoning: true, verbosity: true, vision: true, structuredOutputs: true, toolUse: true, streaming: true, responsesApi: true, defaultReasoningEffort: 'low' } },
    { id: 'gpt-5-nano',   label: 'GPT-5 Nano',   blurb: 'Fastest GPT-5 — low latency',
      capabilities: { reasoning: true, verbosity: true, vision: true, structuredOutputs: true, toolUse: true, streaming: true, responsesApi: true, defaultReasoningEffort: 'none' } },
    { id: 'gpt-4.1',      label: 'GPT-4.1',      blurb: 'Stable workhorse for hospitality',
      capabilities: { vision: true, structuredOutputs: true, toolUse: true, streaming: true } },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', blurb: 'Fast & affordable',
      capabilities: { vision: true, structuredOutputs: true, toolUse: true, streaming: true } },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', blurb: 'Fastest GPT-4.1',
      capabilities: { vision: true, structuredOutputs: true, toolUse: true, streaming: true } },
    { id: 'gpt-4o',       label: 'GPT-4o',       blurb: 'Multimodal omni',
      capabilities: { vision: true, structuredOutputs: true, toolUse: true, streaming: true } },
    { id: 'gpt-4o-mini',  label: 'GPT-4o Mini',  blurb: 'Lightweight 4o',
      capabilities: { vision: true, structuredOutputs: true, toolUse: true, streaming: true } },
    { id: 'o3',           label: 'o3',           blurb: 'Deep reasoning — slow',
      capabilities: { reasoning: true, structuredOutputs: true, streaming: true } },
    { id: 'o4-mini',      label: 'o4-mini',      blurb: 'Fast reasoning',
      capabilities: { reasoning: true, structuredOutputs: true, streaming: true } },
  ],
}

// ── Anthropic ───────────────────────────────────────────────────────────
const anthropic: ProviderEntry = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  defaultModel: 'claude-opus-4-6',
  models: [
    { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6',   blurb: 'Most intelligent Claude',
      capabilities: { vision: true, toolUse: true, streaming: true }, recommended: true },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', blurb: 'Balanced speed & quality',
      capabilities: { vision: true, toolUse: true, streaming: true } },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  blurb: 'Fastest & cheapest',
      capabilities: { vision: true, toolUse: true, streaming: true } },
  ],
}

// ── Google Gemini ───────────────────────────────────────────────────────
const google: ProviderEntry = {
  id: 'google',
  label: 'Google (Gemini)',
  defaultModel: 'gemini-2.5-pro',
  models: [
    { id: 'gemini-2.5-pro',                       label: 'Gemini 2.5 Pro',        blurb: 'Best Gemini reasoning',
      capabilities: { vision: true, structuredOutputs: true, toolUse: true, streaming: true }, recommended: true },
    { id: 'gemini-2.5-flash',                     label: 'Gemini 2.5 Flash',      blurb: 'Fast & cost-effective',
      capabilities: { vision: true, structuredOutputs: true, streaming: true } },
    { id: 'gemini-2.5-flash-lite-preview-06-17',  label: 'Gemini 2.5 Flash Lite', blurb: 'Lowest latency',
      capabilities: { streaming: true }, preview: true },
    { id: 'gemini-2.0-flash',                     label: 'Gemini 2.0 Flash',      blurb: 'Previous-gen fast',
      capabilities: { streaming: true } },
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

/** Format a model dropdown label including the ★ flag and short blurb. */
export function formatModelLabel(m: ModelEntry): string {
  const star = m.recommended ? ' ★' : ''
  const preview = m.preview ? ' (preview)' : ''
  const blurb = m.blurb ? ` — ${m.blurb}` : ''
  return `${m.label}${star}${preview}${blurb}`
}
