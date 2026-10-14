import {
  onShortcuts as listen, shortcutFor as shortcutWith,
  type CommonShortcut, type KeyLike, type ShortcutDocument, type ShortcutKeys, type ShortcutWindow,
} from '../../workspace/lib/shortcuts'

/**
 * The Appointments workspace's shortcuts (Atelier spec §5.2) on the shared
 * engine (src/workspace/lib/shortcuts.ts): N a new appointment, T today,
 * D / W / L the day, week and list views, ← → the previous or next day (week
 * in the week view). Find and the list of shortcuts come with the engine.
 */
export type Shortcut = 'find' | 'help' | 'new' | 'today' | 'prev' | 'next' | 'day' | 'week' | 'list'
export type { KeyLike } from '../../workspace/lib/shortcuts'
export { inDialog, isTyping, modalOpen } from '../../workspace/lib/shortcuts'

export const APPOINTMENTS_KEYS: ShortcutKeys<Exclude<Shortcut, CommonShortcut>> = {
  letters: { n: 'new', t: 'today', d: 'day', w: 'week', l: 'list' },
  arrows: { left: 'prev', right: 'next' },
}

export function shortcutFor(e: KeyLike, env: { modal: boolean }): Shortcut | null {
  return shortcutWith(e, env, APPOINTMENTS_KEYS)
}

export function onShortcuts(win: ShortcutWindow, doc: ShortcutDocument, run: (hit: Shortcut, e: KeyboardEvent) => void): () => void {
  return listen(win, doc, APPOINTMENTS_KEYS, run)
}
