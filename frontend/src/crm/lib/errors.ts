import type { TFunction } from 'i18next'
import { failureOf } from './api'

/** The refusals the workspace says in its own words (crm.errors.<code>); anything else is the general sentence. */
export const KNOWN_ERRORS = [
  'network', 'not_found', 'not_allowed', 'manager_only', 'invalid', 'too_many', 'feature_locked', 'ai_budget_used_up',
  'model_not_allowed', 'nothing_to_answer', 'ai_failed', 'workspace_disabled', 'subscription_required', 'not_in_plan',
  'plan_limit',
] as const

/** The i18n key for a failure's sentence. */
export function errorKey(error: unknown): string {
  const { code } = failureOf(error)
  return (KNOWN_ERRORS as readonly string[]).includes(code) ? `crm.errors.${code}` : 'crm.errors.unknown'
}

/** A failure's sentence, in the person's language; for `invalid`, the first field error the server sent is not shown. */
export function errorText(t: TFunction, error: unknown): string {
  return t(errorKey(error), t('crm.errors.unknown', 'Something went wrong. Please try again.'))
}
