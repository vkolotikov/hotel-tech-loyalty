/**
 * Round 5 (owner 2026-11-12, "tabs, not long scrolls"): a long Set up form is split into parts the person moves between —
 * a left list on a wide screen, a strip of tabs on a phone — with the chosen part in the address (`?part=`). These are
 * the decisions behind it, pure, because the frontend tests render to a string.
 */

/** The part a `?part=` names, or the first one when it names none of them. */
export function pickPart<T extends string>(value: string | null, keys: readonly T[]): T {
  return (keys as readonly string[]).includes(value ?? '') ? (value as T) : keys[0]
}

/** The address after a part was chosen: `?part=` names it, or is left out for the first one; the rest is kept. */
export function withPart(prev: URLSearchParams, keys: readonly string[], next: string, param = 'part'): URLSearchParams {
  const out = new URLSearchParams(prev)
  if (next === keys[0]) out.delete(param)
  else out.set(param, next)
  return out
}

/** The address after a page's section changed: its `?tab=`, and no part of the section left behind. */
export function withSection(prev: URLSearchParams, next: string, first: string, tabParam = 'tab', partParam = 'part'): URLSearchParams {
  const out = new URLSearchParams(prev)
  if (next === first) out.delete(tabParam)
  else out.set(tabParam, next)
  out.delete(partParam)
  return out
}

/** The parts before and after the current one, for the "Next" button at a part's foot. */
export function neighbours<T extends string>(keys: readonly T[], current: T): { prev: T | null; next: T | null } {
  const i = keys.indexOf(current)
  if (i < 0) return { prev: null, next: null }
  return { prev: i > 0 ? keys[i - 1] : null, next: i < keys.length - 1 ? keys[i + 1] : null }
}

/**
 * The parts holding a field the server would refuse, so the list can mark them: the save bar says "Fix the marked
 * fields", and the field may be in a part that is not open.
 */
export function flaggedParts<F extends string, T extends string>(fields: readonly F[], partOf: (field: F) => T | null): Set<T> {
  const out = new Set<T>()
  for (const field of fields) {
    const part = partOf(field)
    if (part) out.add(part)
  }
  return out
}
