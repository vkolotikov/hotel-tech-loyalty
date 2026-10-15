import { showsWorkspaceLink, type LandingUser } from '../../workspace/lib/landing'

// The generic half lives in the shared core; its old importers keep importing it from here.
export { landingPath, loginPath, loginPathAfterExpiry, safeRedirect } from '../../workspace/lib/landing'

/**
 * Whether the full admin shows its way into HexaTech Appointments (the menu
 * item, first in Bookings, and the button on the service-booking pages):
 * staff of every organisation that has the workspace, with or without
 * services yet — the workspace's Setup is where the first one is added
 * (owner, 2026-10-06). The menu's own rules still apply on top.
 */
export function showsAppointmentsLink(user: LandingUser | null | undefined): boolean {
  return showsWorkspaceLink(user, 'appointments')
}

/**
 * Staff of an organisation on the Appointments plan: the workspace is all
 * they have, no full admin (Part C). The server refuses the rest of the
 * admin API (`not_in_plan`); this keeps the screens from asking.
 */
export function isAppointmentsOnly(user: LandingUser | null | undefined): boolean {
  return user?.user_type !== 'member' && user?.workspaces?.appointments?.only === true
}

/** Where the full admin sends a user it does not serve; null for everyone it does. */
export function fullAdminRedirect(user: LandingUser | null | undefined): string | null {
  return isAppointmentsOnly(user) ? '/appointments' : null
}

/** The same user, known from now on to be appointments-only: a session that signed in before the plan changed. */
export function withAppointmentsOnly<T extends LandingUser>(user: T): T {
  return {
    ...user,
    workspaces: { ...user.workspaces, appointments: { ...user.workspaces?.appointments, landing: true, only: true } },
  }
}

/** "Full admin" from the workspace opens the same tool there. */
export function fullAdminPathFor(pathname: string): string {
  if (/^\/appointments\/?$/.test(pathname)) return '/service-bookings/calendar'
  if (/^\/appointments\/clients(\/|$)/.test(pathname)) return '/leads?tab=customers'
  return '/'
}
