import { describe, expect, it } from 'vitest'
import { navGroups } from './Layout'
import { TOGGLEABLE, LOCKED } from './MenuSettings'

/**
 * Task 5 fix round 1 — the cheapest non-vacuous guard against the class of
 * omission that made "Landing pages" unhideable: Layout.tsx's `navGroups`
 * is the single source of truth for what actually renders in the sidebar,
 * but Settings → Sidebar Menu (`MenuSettings.tsx`) enumerates the SAME
 * groups a second time, by hand, split across `TOGGLEABLE` (hideable) and
 * `LOCKED` (Overview + System, load-bearing). Nothing wired those two lists
 * to `navGroups` itself, so adding an eighth group to the sidebar — as
 * Task 5 did — left Settings silently unaware of it: no checkbox to hide
 * it, and its own "X of N groups" readout undercounting the live sidebar
 * by one.
 *
 * This asserts `TOGGLEABLE ∪ LOCKED` is EXACTLY the set of
 * `navGroups[].defaultLabel` values — no more, no fewer — so the ninth
 * group someone adds next year fails this test instead of shipping the
 * same silent gap. Pure data comparison, no rendering, node-env friendly.
 */
describe('MenuSettings groups stay in sync with Layout.tsx navGroups', () => {
  it('TOGGLEABLE + LOCKED together name exactly the groups Layout.tsx defines', () => {
    const liveGroupLabels = navGroups.map(g => g.defaultLabel).sort()
    const settingsGroupLabels = [...TOGGLEABLE.map(g => g.label), ...LOCKED.map(g => g.label)].sort()

    expect(settingsGroupLabels).toEqual(liveGroupLabels)
  })

  it('no group is listed in both TOGGLEABLE and LOCKED', () => {
    const toggleable = new Set(TOGGLEABLE.map(g => g.label))
    const overlap = LOCKED.map(g => g.label).filter(label => toggleable.has(label))

    expect(overlap).toEqual([])
  })

  it('"Landing pages" is toggleable, not locked (Task 5 fix round 1)', () => {
    expect(TOGGLEABLE.some(g => g.label === 'Landing pages')).toBe(true)
    expect(LOCKED.some(g => g.label === 'Landing pages')).toBe(false)
  })
})
