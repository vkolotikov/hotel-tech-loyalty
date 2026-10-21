import {
  onShortcuts as listen, type CommonShortcut, type ShortcutDocument, type ShortcutKeys, type ShortcutWindow,
} from '../../workspace/lib/shortcuts'

/**
 * HexaTech Loyalty's shortcuts (spec 2026-10-21 §4.8) on the shared engine: S
 * Scan from anywhere; on a member's page A awards and R redeems points. Find
 * (Ctrl/⌘ K, "/") and the list of shortcuts ("?") come with the engine.
 */
export type Shortcut = 'find' | 'help' | 'scan' | 'award' | 'redeem'

export const LOYALTY_KEYS: ShortcutKeys<Exclude<Shortcut, CommonShortcut>> = {
  letters: { s: 'scan', a: 'award', r: 'redeem' },
}

export function onShortcuts(win: ShortcutWindow, doc: ShortcutDocument, run: (hit: Shortcut, e: KeyboardEvent) => void): () => void {
  return listen(win, doc, LOYALTY_KEYS, run)
}
