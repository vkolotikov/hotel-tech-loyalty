import { AI_PROVIDERS, findModel, findProvider, isListedModel, takesTemperature, type Provider } from '../../lib/aiModels'

/**
 * The AI model the website assistant answers with (round 5, owner 2026-11-12: "implement all features we have in our
 * main platform"; the full admin's pages/ChatbotConfig.tsx): GET/PUT chatbot-config/model, on the same model registry
 * (lib/aiModels.ts, one list for every model picker). The plan's model list (`allowed_models`, AiUsageService::
 * isModelAllowed: null or empty = every model) is the server's; a model outside it is shown and not offered, and the
 * server refuses to switch to one (403 `model_not_allowed`). Pure: the tests render to a string.
 */

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh'
export type Verbosity = 'low' | 'medium' | 'high'

export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh']
export const VERBOSITIES: readonly Verbosity[] = ['low', 'medium', 'high']

/** What GET chatbot-config/model answers (ChatbotModelConfig, with the plan's list beside it). */
export interface ModelConfig {
  provider?: string | null
  model_name?: string | null
  temperature?: number | string | null
  max_tokens?: number | string | null
  reasoning_effort?: string | null
  verbosity?: string | null
  /** The models the plan includes; null or missing = every model. */
  allowed_models?: string[] | null
}

export interface ModelForm {
  provider: Provider
  model_name: string
  temperature: number
  max_tokens: number
  reasoning_effort: ReasoningEffort
  verbosity: Verbosity
}

/** The server's limits (ChatbotConfigController::updateModelConfig); the slider keeps tokens from 200, as the full admin. */
export const MODEL_LIMITS = { temperature: { min: 0, max: 2 }, max_tokens: { min: 50, max: 4096 } } as const

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** The form for what the server holds (its defaults when nothing was saved: OpenAI, the server's model). */
export function modelForm(config: ModelConfig | undefined): ModelForm {
  const provider = findProvider(config?.provider)?.id ?? 'openai'
  const fallbackModel = findProvider(provider)?.defaultModel ?? AI_PROVIDERS[0].defaultModel
  return {
    provider,
    model_name: (config?.model_name ?? '').trim() || fallbackModel,
    temperature: num(config?.temperature, 0.7),
    max_tokens: Math.round(num(config?.max_tokens, 1024)),
    reasoning_effort: oneOf(config?.reasoning_effort, REASONING_EFFORTS, 'low'),
    verbosity: oneOf(config?.verbosity, VERBOSITIES, 'medium'),
  }
}

/** Whether the plan includes a model: no list, or an empty one, means every model (AiUsageService::isModelAllowed). */
export function modelAllowed(allowed: readonly string[] | null | undefined, model: string): boolean {
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(model)
}

export interface ModelOption {
  id: string
  label: string
  recommended: boolean
  /** Saved before and no longer listed: it still works, and stays offered for that reason. */
  older: boolean
  allowed: boolean
}

/** The models offered for a provider: an older saved one first, then the listed ones, each marked if the plan lacks it. */
export function modelOptions(provider: Provider, saved: string, allowed: readonly string[] | null | undefined): ModelOption[] {
  const entry = findProvider(provider) ?? AI_PROVIDERS[0]
  const listed = entry.models.map(m => ({ id: m.id, label: m.label, recommended: !!m.recommended, older: false, allowed: modelAllowed(allowed, m.id) }))
  const older = saved && !isListedModel(entry.id, saved)
    ? [{ id: saved, label: saved, recommended: false, older: true, allowed: modelAllowed(allowed, saved) }]
    : []
  return [...older, ...listed]
}

/**
 * The form after another provider was chosen: its recommended model when the plan includes it, else the first it
 * includes, else its default (shown as not in the plan, which the save then refuses).
 */
export function switchProvider(form: ModelForm, provider: Provider, allowed: readonly string[] | null | undefined): ModelForm {
  const entry = findProvider(provider)
  if (!entry) return form
  const pick = [entry.defaultModel, ...entry.models.map(m => m.id)].find(id => modelAllowed(allowed, id)) ?? entry.defaultModel
  return { ...form, provider: entry.id, model_name: pick }
}

/** What the chosen model takes: temperature, reasoning effort, verbosity (the registry's capability flags). */
export function modelCapabilities(form: Pick<ModelForm, 'provider' | 'model_name'>): { temperature: boolean; reasoning: boolean; verbosity: boolean } {
  const entry = findModel(form.model_name)
  return {
    temperature: takesTemperature(form.provider, form.model_name),
    reasoning: !!entry?.capabilities.reasoning,
    verbosity: !!entry?.capabilities.verbosity,
  }
}

export type ModelProblem = 'not_in_plan' | 'temperature' | 'max_tokens'

/** What the server would refuse: a model the plan lacks (only when it changes), a number out of its range. */
export function modelProblems(form: ModelForm, saved: ModelForm, allowed: readonly string[] | null | undefined): ModelProblem[] {
  const out: ModelProblem[] = []
  if (form.model_name !== saved.model_name && !modelAllowed(allowed, form.model_name)) out.push('not_in_plan')
  if (form.temperature < MODEL_LIMITS.temperature.min || form.temperature > MODEL_LIMITS.temperature.max) out.push('temperature')
  if (form.max_tokens < MODEL_LIMITS.max_tokens.min || form.max_tokens > MODEL_LIMITS.max_tokens.max || !Number.isInteger(form.max_tokens)) out.push('max_tokens')
  return out
}

/**
 * The body of PUT chatbot-config/model: the fields this form edits. Reasoning effort and verbosity are sent only for a
 * model that takes them, so a stored value is kept for the day the venue switches back.
 */
export function modelPayload(form: ModelForm): Record<string, unknown> {
  const can = modelCapabilities(form)
  return {
    provider: form.provider,
    model_name: form.model_name,
    temperature: Math.round(form.temperature * 100) / 100,
    max_tokens: form.max_tokens,
    ...(can.reasoning ? { reasoning_effort: form.reasoning_effort } : {}),
    ...(can.verbosity ? { verbosity: form.verbosity } : {}),
  }
}

export function sameModel(a: ModelForm, b: ModelForm): boolean {
  return JSON.stringify(modelPayload(a)) === JSON.stringify(modelPayload(b))
}

/** The plan's warning: the saved model is one the plan does not include, so the assistant cannot answer with it. */
export function savedModelBlocked(saved: ModelForm, allowed: readonly string[] | null | undefined): boolean {
  return !modelAllowed(allowed, saved.model_name)
}

/** What a probe of the model answered (POST chatbot-config/probe-model), in states the page words itself. */
export type ProbeState = 'idle' | 'checking' | 'ready' | 'unavailable' | 'failed'

export function probeState(answer: { available?: unknown } | null | undefined, failed: boolean): ProbeState {
  if (failed) return 'failed'
  if (!answer) return 'idle'
  return answer.available === true ? 'ready' : 'unavailable'
}
