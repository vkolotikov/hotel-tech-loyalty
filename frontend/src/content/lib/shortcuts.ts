import {
  onShortcuts as listen, type CommonShortcut, type ShortcutDocument, type ShortcutKeys, type ShortcutWindow,
} from '../../workspace/lib/shortcuts'

/**
 * HexaTech Content's shortcuts (spec §4.7) on the shared engine: N a new
 * post, I an idea (spec 2026-10-16 §4.3), T this week, W / M / L the week, month and list views, ← → the
 * previous or next week (month in the month view). Find and the list of
 * shortcuts come with the engine. A focused card keeps its own arrows
 * ([data-stop]); Shift+← → there moves the post a day.
 */
export type Shortcut = 'find' | 'help' | 'new' | 'idea' | 'today' | 'prev' | 'next' | 'week' | 'month' | 'list'

export const CONTENT_KEYS: ShortcutKeys<Exclude<Shortcut, CommonShortcut>> = {
  letters: { n: 'new', i: 'idea', t: 'today', w: 'week', m: 'month', l: 'list' },
  arrows: { left: 'prev', right: 'next' },
}

export function onShortcuts(win: ShortcutWindow, doc: ShortcutDocument, run: (hit: Shortcut, e: KeyboardEvent) => void): () => void {
  return listen(win, doc, CONTENT_KEYS, run)
}
