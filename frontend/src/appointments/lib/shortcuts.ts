/**
 * Keyboard shortcuts (spec §5.2). Only Ctrl/⌘ K works while typing; every
 * other key waits until focus is out of fields and dialogs and no modal is
 * open; ← → on a focused grid stop belong to the grid's own moves. A
 * non-Latin layout reaches the same shortcuts by the keys' places.
 */
export type Shortcut = 'find' | 'help' | 'new' | 'today' | 'prev' | 'next' | 'day' | 'week' | 'list'
export interface KeyLike {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null; defaultPrevented?: boolean
  /** Where the key sits ("KeyN"), whatever the layout types there. */
  code?: string
  shiftKey?: boolean
}

interface ElementLike { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null; closest?: (s: string) => unknown }

const NOT_TEXT = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']

export function isTyping(target: EventTarget | null): boolean {
  const el = target as ElementLike | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NOT_TEXT.includes((el.getAttribute?.('type') ?? 'text').toLowerCase())
  if (el.isContentEditable) return true
  const role = el.getAttribute?.('role')
  return role === 'textbox' || role === 'combobox' || role === 'searchbox'
}

export function inDialog(target: EventTarget | null): boolean {
  return Boolean((target as ElementLike | null)?.closest?.('[role="dialog"], [role="alertdialog"]'))
}

export function modalOpen(doc: { querySelector: (s: string) => unknown } | undefined): boolean {
  return Boolean(doc?.querySelector('[aria-modal="true"]'))
}

const PLAIN: Record<string, Shortcut> = { n: 'new', t: 'today', d: 'day', w: 'week', l: 'list', '/': 'find', '?': 'help', ArrowLeft: 'prev', ArrowRight: 'next' }

/**
 * The same keys by where they sit on a US keyboard, for a layout that types
 * something else there: on a Russian one, N types "т" and "/" types ".".
 * The character is read first, and a Latin letter (accented ones too) is never
 * read by its place, so a Latin layout (AZERTY, Dvorak, Spanish…) keeps its own
 * letters. The "/" place is read only for the Cyrillic layouts' own "." and
 * Shift ",": Latin layouts type "-", "!" or ";" there.
 */
const PLACE: Record<string, Shortcut> = { KeyN: 'new', KeyT: 'today', KeyD: 'day', KeyW: 'week', KeyL: 'list' }
const latinLetter = (key: string): boolean => /^\p{Script=Latin}$/u.test(key)

function byPlace(e: KeyLike): Shortcut | null {
  if (!e.code || latinLetter(e.key)) return null
  if (e.code === 'Slash') return e.shiftKey ? (e.key === ',' ? 'help' : null) : (e.key === '.' ? 'find' : null)
  return PLACE[e.code] ?? null
}

export function shortcutFor(e: KeyLike, env: { modal: boolean }): Shortcut | null {
  if (e.defaultPrevented || env.modal) return null
  // Ctrl/⌘ Shift K is left to the browser (Firefox's console).
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key.toLowerCase() === 'k' || (e.code === 'KeyK' && !latinLetter(e.key)))) return 'find'
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (isTyping(e.target) || inDialog(e.target)) return null
  const name = e.key.length === 1 ? (e.key === '?' || e.key === '/' ? e.key : e.key.toLowerCase()) : e.key
  const hit = PLAIN[name] ?? byPlace(e)
  if (!hit) return null
  if ((hit === 'prev' || hit === 'next') && (e.target as ElementLike | null)?.closest?.('[data-stop]')) return null
  return hit
}

/**
 * Listens for shortcuts on a window and says which one was pressed; the
 * returned function removes that same listener. The modal check is made at
 * the moment of each key, so a dialog that opens later is heard about.
 * The page that listens decides what each shortcut does, and calls
 * `preventDefault` on the keys it acts on.
 */
export function onShortcuts(
  win: { addEventListener: (type: 'keydown', fn: (e: KeyboardEvent) => void) => void; removeEventListener: (type: 'keydown', fn: (e: KeyboardEvent) => void) => void },
  doc: { querySelector: (s: string) => unknown } | undefined,
  run: (hit: Shortcut, e: KeyboardEvent) => void,
): () => void {
  const onKey = (e: KeyboardEvent) => {
    const hit = shortcutFor(e, { modal: modalOpen(doc) })
    if (hit) run(hit, e)
  }
  win.addEventListener('keydown', onKey)
  return () => win.removeEventListener('keydown', onKey)
}
