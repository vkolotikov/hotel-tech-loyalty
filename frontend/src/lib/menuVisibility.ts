/**
 * What the sidebar really does with a group, for the page that lets an admin change it. Three layers decide
 * (Layout.tsx): the venue's industry, the organisation's saved list, and a staff member's own whitelist. The
 * Sidebar Menu page edits only the second, so it has to say when the first has already decided.
 */
export type GroupVisibility = 'visible' | 'hidden' | 'industry'

export function groupVisibility(label: string, hidden: readonly string[], industryHidden: readonly string[]): GroupVisibility {
  if (industryHidden.includes(label)) return 'industry'
  return hidden.includes(label) ? 'hidden' : 'visible'
}

export function visibleGroupCount(toggleable: readonly string[], lockedCount: number, hidden: readonly string[], industryHidden: readonly string[]): number {
  return toggleable.filter(label => groupVisibility(label, hidden, industryHidden) === 'visible').length + lockedCount
}
