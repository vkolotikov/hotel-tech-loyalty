import { parseHashtags } from '../lib/postText'
import type { Platform } from '../lib/types'

/** The most hashtags a platform takes (spec 2026-10-15 §6): Instagram 30; the others are not warned about. */
export const TAG_LIMITS: Partial<Record<Platform, number>> = { instagram: 30 }

const bare = (tag: string) => tag.replace(/^#+/, '').toLowerCase()

/** A hashtag group added to the tags already typed: its new ones at the end; one already there (ignoring case and #) skipped. */
export function insertHashtags(current: string, group: string): { value: string; added: number } {
  const tags = parseHashtags(current)
  const seen = new Set(tags.map(bare))
  let added = 0
  for (const tag of parseHashtags(group)) {
    const key = bare(tag)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    added++
  }
  return { value: tags.join(' '), added }
}

/** Past the platform's limit: how many tags the field holds now, and the limit (Review Focus 3: counted after an insert). */
export function tooManyTags(platform: Platform, value: string): { count: number; limit: number } | null {
  const limit = TAG_LIMITS[platform]
  const count = parseHashtags(value).length
  return limit !== undefined && count > limit ? { count, limit } : null
}

/**
 * A snippet put where the cursor is (over any selection), or — when the field has no cursor — at the end: on a line of
 * its own in a text, after a space in a one-line field. `caret` is where the cursor goes after it.
 */
export function insertAt(value: string, text: string, cursor: { start: number; end: number } | null, multiline: boolean): { value: string; caret: number } {
  if (cursor === null) {
    const sep = value === '' ? '' : multiline ? (value.endsWith('\n') ? '' : '\n') : value.endsWith(' ') ? '' : ' '
    const next = value + sep + text
    return { value: next, caret: next.length }
  }
  const start = Math.max(0, Math.min(cursor.start, value.length))
  const end = Math.max(start, Math.min(cursor.end, value.length))
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length }
}
