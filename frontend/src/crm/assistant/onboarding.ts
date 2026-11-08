import type { OnboardingState } from './types'

/**
 * The assistant's quick setup (POST chatbot-onboarding, ChatbotOnboardingService), as the full admin's first-run
 * wizard asks it: the name and tone (the industry's preset until typed over), the venue's facts (what the server
 * already knows until typed over), the preset's rules left ticked, and who a visitor reaches. Pure.
 */
export interface QuickSetupAnswers {
  assistant_name?: string
  tone?: string
  facts: Record<string, string>
  rules?: string[]
  handoff_whatsapp: string
  handoff_email: string
}

export const QUICK_TONES = ['friendly', 'professional', 'casual', 'formal'] as const

/** A fact's value: what was typed, else what the server already knows. */
export function factValue(state: OnboardingState, answers: QuickSetupAnswers, key: string): string {
  return answers.facts[key] ?? state.prefill?.[key] ?? ''
}

/** The facts in the order the server lists them. */
export function factKeys(state: OnboardingState): string[] {
  return Object.keys(state.facts ?? {})
}

/** The required facts left empty (they become the answers visitors ask most; setup still goes ahead without them). */
export function missingFacts(state: OnboardingState, answers: QuickSetupAnswers): string[] {
  return factKeys(state).filter(key => state.facts[key]?.required && !factValue(state, answers, key).trim())
}

export function activeRules(state: OnboardingState, answers: QuickSetupAnswers): string[] {
  return answers.rules ?? state.preset.core_rules ?? []
}

/** The same rule list with one rule ticked or unticked, in the preset's order. */
export function toggleRule(state: OnboardingState, answers: QuickSetupAnswers, rule: string): string[] {
  const on = new Set(activeRules(state, answers))
  if (on.has(rule)) on.delete(rule)
  else on.add(rule)
  return (state.preset.core_rules ?? []).filter(r => on.has(r))
}

const WHATSAPP = /^[+0-9 ()-]{6,32}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** What the server would refuse: a WhatsApp number or an email address of the wrong shape. */
export function quickSetupProblems(answers: QuickSetupAnswers): ('handoff_whatsapp' | 'handoff_email')[] {
  const out: ('handoff_whatsapp' | 'handoff_email')[] = []
  const whatsapp = answers.handoff_whatsapp.trim()
  const email = answers.handoff_email.trim()
  if (whatsapp && !WHATSAPP.test(whatsapp)) out.push('handoff_whatsapp')
  if (email && (!EMAIL.test(email) || email.length > 190)) out.push('handoff_email')
  return out
}

/** The body of POST chatbot-onboarding. `timezone` is the venue's, from the bootstrap. */
export function quickSetupPayload(state: OnboardingState, answers: QuickSetupAnswers, timezone: string): Record<string, unknown> {
  return {
    company_name: state.prefill?.company_name ?? '',
    assistant_name: (answers.assistant_name ?? state.preset.assistant_name ?? '').trim(),
    tone: answers.tone ?? state.preset.tone ?? 'friendly',
    handoff_whatsapp: answers.handoff_whatsapp.trim(),
    handoff_email: answers.handoff_email.trim(),
    timezone,
    core_rules: activeRules(state, answers),
    facts: Object.fromEntries(factKeys(state).map(key => [key, factValue(state, answers, key).trim().slice(0, 500)])),
  }
}
