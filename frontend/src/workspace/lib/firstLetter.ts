/**
 * The first letter of a name for a mark or an avatar. It walks the string by
 * code point: `charAt(0)` would hand back half of an emoji's surrogate pair.
 */
export function firstLetter(name: string | undefined, fallback: string): string {
  return (Array.from((name ?? '').trim())[0] ?? fallback).toUpperCase()
}

/** Up to two initials of a name: "Mara Ilves-Kask" → "MI". A whole emoji is one initial, never half of a pair. */
export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => firstLetter(part, '')).join('')
}
