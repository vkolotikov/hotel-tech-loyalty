/** Settings' sections and the small list helpers its editors share. Pure: the tests render to a string. */

/** The sections, as `?tab=` names them (Get started links to `pipelines`). */
export const SETTINGS_TABS = ['canned', 'pipelines', 'forms', 'fields', 'account'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

/** The section a `?tab=` names, or the first one when it names none of them. */
export function pickTab<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback
}

/** The list with item `index` moved one place up (-1) or down (+1); unchanged at either end. */
export function moveItem<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list]
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

/** The ids of a list in its order after one item moved: the body a reorder endpoint takes. */
export function reorderIds<T extends { id: number }>(list: readonly T[], index: number, dir: -1 | 1): number[] {
  return moveItem(list, index, dir).map(item => item.id)
}

/** Whether the order moved anything at all (a move past either end does not). */
export function orderChanged<T extends { id: number }>(list: readonly T[], ids: readonly number[]): boolean {
  return list.some((item, i) => item.id !== ids[i])
}
