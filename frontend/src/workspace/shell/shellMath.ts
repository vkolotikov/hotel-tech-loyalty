/**
 * The person's role under their name in the side panel (spec 2026-10-21 §4.1): Owner, Manager, else Staff. The account
 * roles are `super_admin`, `manager` and `staff` (TeamController::ROLES); `super_admin` is the organisation's owner.
 */
export function roleLabelKey(role: string | null): [string, string] {
  if (role === 'super_admin' || role === 'owner') return ['workspace.shell.role.owner', 'Owner']
  if (role === 'manager') return ['workspace.shell.role.manager', 'Manager']
  return ['workspace.shell.role.staff', 'Staff']
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
