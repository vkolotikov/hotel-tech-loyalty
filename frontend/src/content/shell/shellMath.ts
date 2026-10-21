/** A brand without a logo in its chip (spec 2026-10-21 §4.2): the first letters of its first two words, else its first two letters. */
export function brandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length > 1) return words.slice(0, 2).map(w => Array.from(w)[0] ?? '').join('').toUpperCase()
  return Array.from(words[0]).slice(0, 2).join('').toUpperCase()
}

export type PageKey = 'plan' | 'ideas' | 'posts' | 'promote' | 'strategy' | 'brand' | 'write'
const PAGES: PageKey[] = ['ideas', 'posts', 'promote', 'strategy', 'brand', 'write']

/** The page a Content address shows, for the breadcrumb; the Plan for /content and anything unknown. */
export function pageKeyOf(pathname: string): PageKey {
  const part = pathname.replace(/^\/content\/?/, '').split('/')[0] as PageKey
  return PAGES.includes(part) ? part : 'plan'
}
