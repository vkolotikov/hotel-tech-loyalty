import type { TFunction } from 'i18next'
import { orNull, wholeNumber } from './lists'
import type { PopupRule, TriggerType, UrlMatch, VisitorType } from './types'

/**
 * A pop-up rule as a form (PopupRuleController): when the chat opens by itself with a message. Lengths and choices are
 * the controller's. Pure.
 */
export const POPUP_LIMITS = { name: 120, trigger_value: 60, url: 500, message: 2000, reply: 100 } as const

export const TRIGGERS: readonly TriggerType[] = ['page_load', 'time_delay', 'scroll_depth', 'exit_intent']
export const URL_MATCHES: readonly UrlMatch[] = ['contains', 'exact', 'starts_with', 'regex']
export const VISITOR_TYPES: readonly VisitorType[] = ['all', 'new', 'returning']

export interface PopupForm {
  name: string
  is_active: boolean
  trigger_type: TriggerType
  trigger_value: string
  url_match_type: UrlMatch
  url_match_value: string
  visitor_type: VisitorType
  message: string
  quick_replies: string[]
  priority: string
}

export function popupForm(rule?: PopupRule | null): PopupForm {
  return {
    name: rule?.name ?? '',
    is_active: rule?.is_active ?? true,
    trigger_type: rule?.trigger_type ?? 'time_delay',
    trigger_value: rule ? (rule.trigger_value ?? '') : '5',
    url_match_type: rule?.url_match_type ?? 'contains',
    url_match_value: rule?.url_match_value ?? '',
    visitor_type: rule?.visitor_type ?? 'all',
    message: rule?.message ?? '',
    quick_replies: rule?.quick_replies ?? [],
    priority: String(rule?.priority ?? 0),
  }
}

/** Whether a trigger waits for a number: seconds after the page opens, or how far down the page (%). */
export function triggerTakesValue(type: TriggerType): boolean {
  return type === 'time_delay' || type === 'scroll_depth'
}

export type PopupProblem = 'name' | 'message' | 'value' | 'too_long'

export function popupProblems(form: PopupForm): PopupProblem[] {
  const out: PopupProblem[] = []
  if (!form.name.trim()) out.push('name')
  if (!form.message.trim()) out.push('message')
  if (triggerTakesValue(form.trigger_type)) {
    const n = Number(form.trigger_value)
    const max = form.trigger_type === 'scroll_depth' ? 100 : 3600
    if (form.trigger_value.trim() === '' || !Number.isFinite(n) || n < 0 || n > max) out.push('value')
  }
  if (form.name.trim().length > POPUP_LIMITS.name || form.message.trim().length > POPUP_LIMITS.message
    || form.url_match_value.trim().length > POPUP_LIMITS.url) out.push('too_long')
  return out
}

/** The body of POST/PUT popup-rules. The rule's language targets are left as they are (not edited here). */
export function popupPayload(form: PopupForm): Record<string, unknown> {
  return {
    name: form.name.trim(),
    is_active: form.is_active,
    trigger_type: form.trigger_type,
    trigger_value: triggerTakesValue(form.trigger_type) ? String(Number(form.trigger_value)) : null,
    url_match_type: form.url_match_type,
    url_match_value: orNull(form.url_match_value),
    visitor_type: form.visitor_type,
    message: form.message.trim(),
    quick_replies: form.quick_replies.map(r => r.trim().slice(0, POPUP_LIMITS.reply)).filter(Boolean),
    priority: wholeNumber(form.priority, 0, 1_000_000, 0),
  }
}

/** The trigger in words, with its value: "After 5 s", "At 50 % of the page". */
export function triggerText(t: TFunction, type: TriggerType, value: string | null): string {
  switch (type) {
    case 'page_load': return t('crm.assistant.popups.when_load', 'When the page opens')
    case 'time_delay': return t('crm.assistant.popups.when_delay', 'After {{value}} s', { value: value ?? '0' })
    case 'scroll_depth': return t('crm.assistant.popups.when_scroll', 'At {{value}} % of the page', { value: value ?? '0' })
    case 'exit_intent': return t('crm.assistant.popups.when_exit', 'When the visitor is about to leave')
  }
}

export function triggerOptions(t: TFunction): { value: TriggerType; label: string; line: string }[] {
  return [
    { value: 'page_load', label: t('crm.assistant.popups.trigger_load', 'Page opens'), line: t('crm.assistant.popups.trigger_load_line', 'As soon as the page loads.') },
    { value: 'time_delay', label: t('crm.assistant.popups.trigger_delay', 'After a while'), line: t('crm.assistant.popups.trigger_delay_line', 'A number of seconds after the page opens.') },
    { value: 'scroll_depth', label: t('crm.assistant.popups.trigger_scroll', 'Scrolled down'), line: t('crm.assistant.popups.trigger_scroll_line', 'When the visitor has read part of the page.') },
    { value: 'exit_intent', label: t('crm.assistant.popups.trigger_exit', 'About to leave'), line: t('crm.assistant.popups.trigger_exit_line', 'When the mouse heads for the browser bar.') },
  ]
}

export function urlMatchOptions(t: TFunction): { value: UrlMatch; label: string }[] {
  return [
    { value: 'contains', label: t('crm.assistant.popups.url_contains', 'Address contains') },
    { value: 'exact', label: t('crm.assistant.popups.url_exact', 'Address is exactly') },
    { value: 'starts_with', label: t('crm.assistant.popups.url_starts', 'Address starts with') },
    { value: 'regex', label: t('crm.assistant.popups.url_regex', 'Address matches a pattern') },
  ]
}

export function visitorOptions(t: TFunction): { value: VisitorType; label: string }[] {
  return [
    { value: 'all', label: t('crm.assistant.popups.visitors_all', 'Every visitor') },
    { value: 'new', label: t('crm.assistant.popups.visitors_new', 'First visit') },
    { value: 'returning', label: t('crm.assistant.popups.visitors_returning', 'Returning visitors') },
  ]
}
