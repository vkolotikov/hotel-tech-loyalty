/** The chat widget's sections, as `?tab=` names them (Get started links to `install`), and its query key. */
export const WIDGET_TABS = ['look', 'behaviour', 'install'] as const
export type WidgetTab = (typeof WIDGET_TABS)[number]

export const WIDGET_KEY = ['crm', 'widget', 'config'] as const

/** The section a `?tab=` names, or the first one when it names none of them. */
export function pickTab<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback
}
