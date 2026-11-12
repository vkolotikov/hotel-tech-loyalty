/** Small list and address helpers the AI assistant's forms share. Pure: the tests render to a string. */

/** The AI assistant's sections, as `?tab=` names them (Get started links to `knowledge`). */
export const ASSISTANT_TABS = ['behaviour', 'knowledge', 'teach', 'try', 'popups'] as const
export type AssistantTab = (typeof ASSISTANT_TABS)[number]

/**
 * Round 5 (owner 2026-11-12: Behaviour was 1,700 px): its parts, as `?part=` names them, and the part each field the
 * server would refuse is in. Knowledge's parts are its three lists.
 */
export const BEHAVIOUR_PARTS = ['basics', 'identity', 'style', 'rules', 'handover', 'model', 'more'] as const
export type BehaviourPart = (typeof BEHAVIOUR_PARTS)[number]

export const KNOWLEDGE_PARTS = ['answers', 'categories', 'documents'] as const
export type KnowledgePart = (typeof KNOWLEDGE_PARTS)[number]

export type BehaviourField = 'assistant_name' | 'identity' | 'goal' | 'escalation_policy' | 'fallback_message' | 'custom_instructions' | 'rule' | 'model'

export function behaviourPartOf(field: BehaviourField): BehaviourPart {
  switch (field) {
    case 'assistant_name': return 'basics'
    case 'identity': case 'goal': return 'identity'
    case 'rule': return 'rules'
    case 'escalation_policy': case 'fallback_message': return 'handover'
    case 'model': return 'model'
    default: return 'more'
  }
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

/** The list with item `index` moved one place up (-1) or down (+1); unchanged at either end. */
export function moveItem<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list]
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** The list without item `index`. */
export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

/**
 * A short text added to a list of them (rules, keywords, quick replies): trimmed, cut to `max` characters, and not
 * added when empty or already there (case aside).
 */
export function addText(list: readonly string[], text: string, max: number): string[] {
  const clean = text.trim().slice(0, max)
  if (!clean || list.some(item => item.toLowerCase() === clean.toLowerCase())) return [...list]
  return [...list, clean]
}

/** Texts merged in, keeping the order and dropping repeats (the keywords the AI suggested). */
export function mergeTexts(list: readonly string[], more: readonly string[], max: number): string[] {
  return more.reduce<string[]>((acc, text) => addText(acc, text, max), [...list])
}

/** A text box's value as the server's nullable column: trimmed, null when empty. */
export function orNull(value: string): string | null {
  const clean = value.trim()
  return clean === '' ? null : clean
}

/** A whole number typed in a box, held between `min` and `max`; `fallback` when it is not a number. */
export function wholeNumber(value: string | number, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}
