/**
 * The full admin menu's decisions (2026-11-09, owner: "better logic for main portal, better menu structure"), pure so
 * they are tested without rendering:
 *
 * - which group holds the page one is on (`activeGroupOf`);
 * - whether a group is open: the person's own choice when they made one, otherwise only the Dashboard's group, the
 *   Workspaces launcher and the group of the page one is on — so the menu is a short list of headings with one group
 *   open, not forty items to scroll (`isGroupOpen`);
 * - what "Find in menu" matches: every word typed, in an item's label or its group's, case and accents ignored
 *   (`menuMatches`).
 */

export interface MenuItemLike {
  path: string
  altPaths?: string[]
}

export interface MenuGroupLike<I extends MenuItemLike = MenuItemLike> {
  defaultLabel: string
  layout?: 'apps'
  items: I[]
}

/** Groups open until the person closes them: the Dashboard's and the Workspaces launcher. */
export const OPEN_BY_DEFAULT = new Set(['Overview', 'Workspaces'])

/** Whether an item is the page at `pathname` — the same rule the menu's highlight uses. */
export function itemIsActive(item: MenuItemLike, pathname: string): boolean {
  if (item.path === '/') return pathname === '/'
  if (pathname === item.path || pathname.startsWith(item.path)) return true
  return (item.altPaths ?? []).some(p => pathname === p || pathname.startsWith(p))
}

/** How closely an item matches `pathname`: the length of its longest matching address, 0 for none. */
function matchLength(item: MenuItemLike, pathname: string): number {
  if (item.path === '/') return pathname === '/' ? 1 : 0
  return [item.path, ...(item.altPaths ?? [])]
    .filter(p => pathname === p || pathname.startsWith(p))
    .reduce((best, p) => Math.max(best, p.length), 0)
}

/**
 * The one item the page at `pathname` belongs to: the longest matching address wins, so Payments
 * (`/bookings/payments`) is lit on its own page and Reservations (`/bookings`) is not. Null when no item matches.
 */
export function activeItemOf<G extends MenuGroupLike>(groups: G[], pathname: string): { group: string; path: string } | null {
  let best: { group: string; path: string; length: number } | null = null
  for (const group of groups) {
    for (const item of group.items) {
      const length = matchLength(item, pathname)
      if (length > 0 && (best === null || length > best.length)) best = { group: group.defaultLabel, path: item.path, length }
    }
  }
  return best && { group: best.group, path: best.path }
}

/** The group holding the page at `pathname`, or null (a page the menu does not list). */
export function activeGroupOf<G extends MenuGroupLike>(groups: G[], pathname: string): string | null {
  return activeItemOf(groups, pathname)?.group ?? null
}

/**
 * Open or closed: what the person chose (`choices[label]`), else open for the default groups and the active one.
 * An icon-only side panel and a search show every group.
 */
export function isGroupOpen(label: string, choices: Record<string, boolean>, activeGroup: string | null, opts: { iconsOnly?: boolean; searching?: boolean } = {}): boolean {
  if (opts.iconsOnly || opts.searching) return true
  if (typeof choices[label] === 'boolean') return choices[label]
  return OPEN_BY_DEFAULT.has(label) || label === activeGroup
}

/** Lower case without accents: "Réservations" finds "reservations", "Planificación" finds "planificacion". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Every typed word is in the item's label or its group's label. An empty query matches everything. */
export function menuMatches(query: string, itemLabel: string, groupLabel: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = fold(`${itemLabel} ${groupLabel}`)
  return words.every(w => hay.includes(w))
}
