import { describe, expect, it } from 'vitest'
import { activeGroupOf, activeItemOf, isGroupOpen, itemIsActive, menuMatches } from './navMenu'
import { navGroups } from './Layout'

describe('the full admin menu (2026-11-09)', () => {
  it('knows which group holds the page, by path and by a sibling path', () => {
    expect(activeGroupOf(navGroups, '/')).toBe('Overview')
    expect(activeGroupOf(navGroups, '/members/42')).toBe('Members & Loyalty')
    expect(activeGroupOf(navGroups, '/tiers')).toBe('Members & Loyalty')
    expect(activeGroupOf(navGroups, '/bookings/payments')).toBe('Bookings')
    expect(activeGroupOf(navGroups, '/loyalty/members')).toBe('Workspaces')
    expect(activeGroupOf(navGroups, '/nowhere-listed')).toBeNull()
  })

  it('lights the one item whose address matches longest', () => {
    expect(activeItemOf(navGroups, '/bookings/payments')?.path).toBe('/bookings/payments')
    expect(activeItemOf(navGroups, '/bookings')?.path).toBe('/bookings')
    expect(activeItemOf(navGroups, '/bookings/calendar')?.path).toBe('/bookings')
    expect(activeItemOf(navGroups, '/service-bookings/calendar')?.path).toBe('/service-bookings')
    expect(activeItemOf(navGroups, '/')?.path).toBe('/')
  })

  it('the Dashboard is active only on the dashboard itself', () => {
    expect(itemIsActive({ path: '/' }, '/')).toBe(true)
    expect(itemIsActive({ path: '/' }, '/members')).toBe(false)
  })

  it('opens the Dashboard group, the launcher and the page\'s group; the rest are headings until opened', () => {
    expect(isGroupOpen('Overview', {}, 'Bookings')).toBe(true)
    expect(isGroupOpen('Workspaces', {}, 'Bookings')).toBe(true)
    expect(isGroupOpen('Bookings', {}, 'Bookings')).toBe(true)
    expect(isGroupOpen('System', {}, 'Bookings')).toBe(false)
  })

  it('keeps the person\'s own choice, both ways', () => {
    expect(isGroupOpen('System', { System: true }, 'Bookings')).toBe(true)
    expect(isGroupOpen('Bookings', { Bookings: false }, 'Bookings')).toBe(false)
    expect(isGroupOpen('Overview', { Overview: false }, null)).toBe(false)
  })

  it('shows every group while the panel is icons only or a search is typed', () => {
    expect(isGroupOpen('System', { System: false }, null, { iconsOnly: true })).toBe(true)
    expect(isGroupOpen('System', { System: false }, null, { searching: true })).toBe(true)
  })

  it('finds every typed word in the item or its group, without case or accents', () => {
    expect(menuMatches('pay', 'Payments', 'Bookings')).toBe(true)
    expect(menuMatches('book pay', 'Payments', 'Bookings')).toBe(true)
    expect(menuMatches('reserv', 'Réservations', 'Réservations')).toBe(true)
    expect(menuMatches('book loyalty', 'Payments', 'Bookings')).toBe(false)
    expect(menuMatches('  ', 'Payments', 'Bookings')).toBe(true)
  })

  it('gathers the five workspaces in the launcher, each still answering to the group it came from', () => {
    const apps = navGroups.find(g => g.defaultLabel === 'Workspaces')
    expect(apps?.layout).toBe('apps')
    expect(apps?.items.map(i => [i.path, i.home])).toEqual([
      ['/loyalty', 'Members & Loyalty'],
      ['/appointments', 'Bookings'],
      ['/crm', 'CRM & Marketing'],
      ['/content', 'CRM & Marketing'],
      ['/time', 'Operations'],
    ])
    // Each workspace once in the whole menu.
    const paths = navGroups.flatMap(g => g.items.map(i => i.path))
    for (const p of ['/loyalty', '/appointments', '/crm', '/content', '/time', '/scan']) {
      expect(paths.filter(x => x === p)).toHaveLength(1)
    }
    // Every home names a real group.
    const labels = new Set(navGroups.map(g => g.defaultLabel))
    for (const item of navGroups.flatMap(g => g.items)) {
      if (item.home) expect(labels.has(item.home), item.path).toBe(true)
    }
  })

  it('gives no two items of the menu the same icon', () => {
    const icons = navGroups.filter(g => g.layout !== 'apps').flatMap(g => g.items.map(i => [i.icon, i.path] as const))
    const seen = new Map<unknown, string>()
    const twice: string[] = []
    for (const [icon, path] of icons) {
      if (seen.has(icon)) twice.push(`${seen.get(icon)} & ${path}`)
      else seen.set(icon, path)
    }
    expect(twice).toEqual([])
  })
})
