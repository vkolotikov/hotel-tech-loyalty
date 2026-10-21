import { describe, expect, it } from 'vitest'
import { menuKey, roleLabelKey } from './shellMath'

describe('the cards frame\'s rules (spec 2026-10-21 §4)', () => {
  it('names the person\'s role under their name: the owner\'s account is super_admin', () => {
    expect(roleLabelKey('super_admin')).toEqual(['workspace.shell.role.owner', 'Owner'])
    expect(roleLabelKey('owner')).toEqual(['workspace.shell.role.owner', 'Owner'])
    expect(roleLabelKey('manager')).toEqual(['workspace.shell.role.manager', 'Manager'])
    expect(roleLabelKey('staff')).toEqual(['workspace.shell.role.staff', 'Staff'])
    expect(roleLabelKey(null)).toEqual(['workspace.shell.role.staff', 'Staff'])
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
