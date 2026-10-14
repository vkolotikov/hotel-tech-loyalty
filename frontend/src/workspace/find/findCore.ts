/** Where choosing a Find result goes: to a page, or to something the workspace does itself (`run` names it). */
export type FindTarget = { to: string } | { run: string }
/** One choice in Find. `kind` is the workspace's own word for what it is; the workspace picks its icon by it. */
export interface FindItem { id: string; kind: string; label: string; sub?: string; go: FindTarget }

/** Lower case without accents, so "emilie" finds "Émilie". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export interface Focusable { isConnected: boolean; disabled?: boolean; focus: () => void }

/**
 * Where the focus goes when Find (or another dialog) closes: where the
 * person was; and when that was nothing in particular (the page body, which
 * is where Safari leaves it after a click on a button) or is gone, the first
 * fallback still on the page. A place that cannot take focus is no place: a
 * disabled button (Find's own, once the workspace has stopped) is skipped.
 */
export function focusTarget<T extends Focusable>(before: T | null, body: unknown, fallbacks: (T | null)[]): T | null {
  const candidates = before && before !== body ? [before, ...fallbacks] : fallbacks
  return candidates.find((c): c is T => c !== null && c.isConnected && c.disabled !== true) ?? null
}

/**
 * Where the focus was when a dialog opened, read once into `slot` (`undefined`
 * = not read yet; `null` = nothing in particular). React's development re-run
 * of a mount effect reads it again with the dialog's own button focused; the
 * first answer is the one that counts.
 */
export function firstFocus<T>(slot: { current: T | undefined }, now: T): T {
  if (slot.current === undefined) slot.current = now
  return slot.current
}

/** "?" in an empty box opens the list of shortcuts, as the footer says; with anything typed it is a character of the search. */
export function opensShortcuts(key: string, query: string): boolean {
  return key === '?' && query === ''
}

/** The option after (1) or before (-1) the current one, wrapping at both ends. A current option that is gone counts as the first. */
export function nextActive(ids: string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null
  const at = Math.max(0, current === null ? 0 : ids.indexOf(current))
  return ids[(at + delta + ids.length) % ids.length]
}
