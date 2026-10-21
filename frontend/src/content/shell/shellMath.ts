/** The person's role under their name in the side panel (spec 2026-10-21 §4.1): Owner, Manager, else Staff. */
export function roleLabelKey(role: string | null): [string, string] {
  if (role === 'owner') return ['content.shell.role.owner', 'Owner']
  if (role === 'manager') return ['content.shell.role.manager', 'Manager']
  return ['content.shell.role.staff', 'Staff']
}

/** The item a key moves to in a menu of `count` items: the arrows wrap, Home and End go to the ends; null for other keys. */
export function menuKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null
  if (key === 'ArrowDown') return (index + 1) % count
  if (key === 'ArrowUp') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

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
