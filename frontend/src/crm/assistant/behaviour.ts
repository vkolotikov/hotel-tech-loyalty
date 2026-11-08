import type { TFunction } from 'i18next'
import { orNull } from './lists'
import type { BehaviourConfig, ReplyLength, SalesStyle, Tone } from './types'

/**
 * The assistant's behaviour as a form (PUT chatbot-config/behavior): what the server answered, the person's edits,
 * whether they differ, what is too long, and the body to send. Lengths are ChatbotConfigController::updateBehavior's.
 */
export interface BehaviourForm {
  is_active: boolean
  assistant_name: string
  language: string
  identity: string
  goal: string
  sales_style: SalesStyle
  tone: Tone
  reply_length: ReplyLength
  core_rules: string[]
  escalation_policy: string
  fallback_message: string
  custom_instructions: string
}

export const BEHAVIOUR_LIMITS = {
  assistant_name: 120,
  identity: 2000,
  goal: 1000,
  escalation_policy: 2000,
  fallback_message: 500,
  custom_instructions: 3000,
  rule: 500,
} as const

type LimitedField = Exclude<keyof typeof BEHAVIOUR_LIMITS, 'rule'>

export const SALES_STYLES: readonly SalesStyle[] = ['consultative', 'aggressive', 'passive', 'educational']
export const TONES: readonly Tone[] = ['professional', 'friendly', 'casual', 'formal']
export const REPLY_LENGTHS: readonly ReplyLength[] = ['concise', 'moderate', 'detailed']

/** The reply languages the full admin offers ('auto' answers in the visitor's language). */
export const LANGUAGES = ['auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'pl', 'tr', 'ar', 'zh', 'ja', 'ko', 'hi', 'uk'] as const

function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback
}

/** The form for what the server holds; its unsaved template's defaults when nothing was saved yet. */
export function behaviourForm(config: BehaviourConfig | undefined): BehaviourForm {
  return {
    is_active: config?.is_active ?? true,
    assistant_name: config?.assistant_name ?? '',
    language: config?.language || 'en',
    identity: config?.identity ?? '',
    goal: config?.goal ?? '',
    sales_style: oneOf(config?.sales_style, SALES_STYLES, 'consultative'),
    tone: oneOf(config?.tone, TONES, 'professional'),
    reply_length: oneOf(config?.reply_length, REPLY_LENGTHS, 'moderate'),
    core_rules: Array.isArray(config?.core_rules) ? config.core_rules.filter(r => typeof r === 'string') : [],
    escalation_policy: config?.escalation_policy ?? '',
    fallback_message: config?.fallback_message ?? '',
    custom_instructions: config?.custom_instructions ?? '',
  }
}

/** Whether two forms say the same thing (spaces around a text do not count). */
export function sameBehaviour(a: BehaviourForm, b: BehaviourForm): boolean {
  return JSON.stringify(behaviourPayload(a)) === JSON.stringify(behaviourPayload(b))
}

/** The fields that are longer than the server takes, and a rule that is. */
export function behaviourProblems(form: BehaviourForm): { fields: LimitedField[]; rules: number[] } {
  const fields = (Object.keys(BEHAVIOUR_LIMITS) as (keyof typeof BEHAVIOUR_LIMITS)[])
    .filter((key): key is LimitedField => key !== 'rule' && form[key].trim().length > BEHAVIOUR_LIMITS[key])
  const rules = form.core_rules.map((rule, i) => (rule.length > BEHAVIOUR_LIMITS.rule ? i : -1)).filter(i => i >= 0)
  return { fields, rules }
}

export function behaviourValid(form: BehaviourForm): boolean {
  const { fields, rules } = behaviourProblems(form)
  return fields.length === 0 && rules.length === 0
}

/** The body of PUT chatbot-config/behavior: only the fields it validates, empty texts as null. */
export function behaviourPayload(form: BehaviourForm): Record<string, unknown> {
  return {
    is_active: form.is_active,
    assistant_name: orNull(form.assistant_name),
    language: form.language,
    identity: orNull(form.identity),
    goal: orNull(form.goal),
    sales_style: form.sales_style,
    tone: form.tone,
    reply_length: form.reply_length,
    core_rules: form.core_rules.map(r => r.trim()).filter(Boolean),
    escalation_policy: orNull(form.escalation_policy),
    fallback_message: orNull(form.fallback_message),
    custom_instructions: orNull(form.custom_instructions),
  }
}

/** A language's name in the person's language ("German"), or the code when the browser cannot name it. */
export function languageName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/** The sales styles with their words. */
export function salesStyleOptions(t: TFunction): { value: SalesStyle; label: string; line: string }[] {
  return [
    { value: 'consultative', label: t('crm.assistant.sales.consultative', 'Consultative'), line: t('crm.assistant.sales.consultative_line', 'Asks about needs first, then recommends.') },
    { value: 'aggressive', label: t('crm.assistant.sales.aggressive', 'Proactive'), line: t('crm.assistant.sales.aggressive_line', 'Suggests offers and upgrades on its own.') },
    { value: 'passive', label: t('crm.assistant.sales.passive', 'Reserved'), line: t('crm.assistant.sales.passive_line', 'Offers something only when asked.') },
    { value: 'educational', label: t('crm.assistant.sales.educational', 'Informative'), line: t('crm.assistant.sales.educational_line', 'Explains and lets the visitor decide.') },
  ]
}

export function toneOptions(t: TFunction): { value: Tone; label: string }[] {
  return [
    { value: 'professional', label: t('crm.assistant.tones.professional', 'Professional') },
    { value: 'friendly', label: t('crm.assistant.tones.friendly', 'Friendly') },
    { value: 'casual', label: t('crm.assistant.tones.casual', 'Casual') },
    { value: 'formal', label: t('crm.assistant.tones.formal', 'Formal') },
  ]
}

export function replyLengthOptions(t: TFunction): { value: ReplyLength; label: string }[] {
  return [
    { value: 'concise', label: t('crm.assistant.lengths.concise', 'Short') },
    { value: 'moderate', label: t('crm.assistant.lengths.moderate', 'Medium') },
    { value: 'detailed', label: t('crm.assistant.lengths.detailed', 'Detailed') },
  ]
}
