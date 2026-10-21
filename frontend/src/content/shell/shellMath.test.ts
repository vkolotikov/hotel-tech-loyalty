import { describe, expect, it } from 'vitest'
import { brandInitials, menuKey, pageKeyOf, roleLabelKey } from './shellMath'

describe('the frame\'s rules (spec 2026-10-21 §4)', () => {
  it('names the person\'s role under their name', () => {
    expect(roleLabelKey('owner')).toEqual(['content.shell.role.owner', 'Owner'])
    expect(roleLabelKey('manager')).toEqual(['content.shell.role.manager', 'Manager'])
    expect(roleLabelKey('staff')).toEqual(['content.shell.role.staff', 'Staff'])
    expect(roleLabelKey(null)).toEqual(['content.shell.role.staff', 'Staff'])
  })

  it('moves through a menu with the arrows (wrapping), Home and End', () => {
    expect(menuKey('ArrowDown', 0, 3)).toBe(1)
    expect(menuKey('ArrowDown', 2, 3)).toBe(0)
    expect(menuKey('ArrowUp', 0, 3)).toBe(2)
    expect(menuKey('Home', 2, 3)).toBe(0)
    expect(menuKey('End', 0, 3)).toBe(2)
    expect(menuKey('a', 0, 3)).toBeNull()
    expect(menuKey('ArrowDown', 0, 0)).toBeNull()
  })
})

describe('the breadcrumb (spec 2026-10-21 §4.2)', () => {
  it('draws a brand without a logo by up to two initials', () => {
    expect(brandInitials('FDS Cards')).toBe('FC')
    expect(brandInitials('Lumière')).toBe('LU')
    expect(brandInitials('A very long brand name')).toBe('AV')
    expect(brandInitials('  ')).toBe('?')
  })

  it('names the page from its address', () => {
    expect(pageKeyOf('/content')).toBe('plan')
    expect(pageKeyOf('/content/')).toBe('plan')
    expect(pageKeyOf('/content/ideas')).toBe('ideas')
    expect(pageKeyOf('/content/promote')).toBe('promote')
    expect(pageKeyOf('/content/brand')).toBe('brand')
    expect(pageKeyOf('/content/write/12')).toBe('write')
    expect(pageKeyOf('/content/nowhere')).toBe('plan')
  })
})
