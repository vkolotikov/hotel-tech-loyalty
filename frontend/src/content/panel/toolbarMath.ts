import type { EmojiItem } from './emojiData'

/** How the toolbar puts text in: a snippet as a block, a link as a word (spaced), an emoji just at the cursor. */
export type InsertMode = 'block' | 'word' | 'inline'

/** The emoji whose keywords start with what was typed, ignoring case (spec 2026-10-21 §7.5); all of them for nothing typed. */
export function searchEmoji(query: string, data: EmojiItem[]): EmojiItem[] {
  const q = query.trim().toLowerCase()
  if (q === '') return data
  return data.filter(item => item.keys.some(k => k.startsWith(q)))
}

/** The recent emoji with this one first, once, at most `max` of them. */
export function pushRecent(recent: string[], emoji: string, max = 16): string[] {
  return [emoji, ...recent.filter(r => r !== emoji)].slice(0, max)
}

/** What the Link tool puts in the text: the post's short link, else a web address typed in the Link field, else null (it asks). */
export function linkToInsert(shortUrl: string | null, typed: string): string | null {
  if (shortUrl) return shortUrl
  const address = typed.trim()
  return /^https?:\/\/\S+$/i.test(address) ? address : null
}

/** Where an arrow, Home or End moves in a grid of `count` buttons, `cols` to a row; null for any other key. */
export function gridMove(index: number, key: string, count: number, cols: number): number | null {
  const last = count - 1
  if (key === 'ArrowRight') return Math.min(index + 1, last)
  if (key === 'ArrowLeft') return Math.max(index - 1, 0)
  if (key === 'ArrowDown') return Math.min(index + cols, last)
  if (key === 'ArrowUp') return index - cols >= 0 ? index - cols : index
  if (key === 'Home') return 0
  if (key === 'End') return last
  return null
}

const RECENT = 'content:emoji-recent'

/** The emoji used last on this device; storage may be missing or refuse, and then there are none. */
export function loadRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT) ?? '[]')
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 16) : []
  } catch {
    return []
  }
}

export function saveRecent(recent: string[]): void {
  try { localStorage.setItem(RECENT, JSON.stringify(recent)) } catch { /* not remembered */ }
}

/** A link put in at the cursor, with a space on each side where the text has none (else the networks do not read it as a link). */
export function spacedWord(value: string, start: number, end: number, text: string): string {
  const before = start > 0 && !/\s/.test(value[start - 1]) ? ' ' : ''
  const after = end < value.length && !/\s/.test(value[end]) ? ' ' : ''
  return `${before}${text}${after}`
}
