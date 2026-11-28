import type { WidgetProblem } from './widgetForm'

/** The chat widget's sections, as `?tab=` names them (Get started links to `install`), and its query key. */
export const WIDGET_TABS = ['look', 'behaviour', 'install'] as const
export type WidgetTab = (typeof WIDGET_TABS)[number]

export const WIDGET_KEY = ['crm', 'widget', 'config'] as const

/**
 * Round 5 (owner 2026-11-12: the Look was one 2,800 px page): each section's parts, as `?part=` names them. Look: on the
 * website, the style, the launcher, the words, the suggested questions, the picture; Behaviour: contact details, a way
 * to a person, consent and ratings, the opening hours.
 */
export const LOOK_PARTS = ['site', 'style', 'launcher', 'words', 'questions', 'picture'] as const
export type LookPart = (typeof LOOK_PARTS)[number]

export const CHAT_PARTS = ['contact', 'person', 'privacy', 'hours'] as const
export type ChatPart = (typeof CHAT_PARTS)[number]

export type WidgetPart = LookPart | ChatPart

/** The part holding a field the server would refuse. */
export function partOf(field: WidgetProblem['field']): WidgetPart {
  switch (field) {
    case 'primary_color': case 'header_gradient_end': case 'header_text_color': case 'user_bubble_color': case 'user_bubble_text':
    case 'bot_bubble_color': case 'bot_bubble_text': case 'chat_bg_color':
      return 'style'
    case 'company_name': case 'header_title': case 'header_subtitle': case 'welcome_title': case 'welcome_subtitle':
    case 'welcome_message': case 'input_placeholder': case 'input_hint_text':
      return 'words'
    case 'suggestions':
      return 'questions'
    case 'assistant_avatar_url': case 'branding_text':
      return 'picture'
    case 'handoff_whatsapp': case 'handoff_email':
      return 'person'
    case 'gdpr_consent_text': case 'rating_prompt_text':
      return 'privacy'
    default:
      // offline_message, timezone and the days of the week.
      return 'hours'
  }
}

/** The section a part is in. */
export function tabOfPart(part: WidgetPart): WidgetTab {
  return (LOOK_PARTS as readonly string[]).includes(part) ? 'look' : 'behaviour'
}

/** The section a `?tab=` names, or the first one when it names none of them. */
export function pickTab<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback
}

/** The address after a section was chosen: `?tab=` names it, or is left out for the first one; the rest is kept. */
export function withTab(prev: URLSearchParams, param: string, next: string, first: string): URLSearchParams {
  const out = new URLSearchParams(prev)
  if (next === first) out.delete(param)
  else out.set(param, next)
  return out
}
