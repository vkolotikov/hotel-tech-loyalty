interface LandingUser {
  user_type?: string
  workspaces?: { appointments?: { landing?: boolean; has_services?: boolean; only?: boolean } }
}

const WORKSPACE_PATH = /^\/appointments(\/|\?|$)/

/**
 * Whether the full admin shows its way into HexaTech Appointments (the menu
 * item and the button on the service-booking pages): staff of an
 * organisation that has the workspace and at least one active service.
 * The address itself works for every organisation that has it.
 */
export function showsAppointmentsLink(user: LandingUser | null | undefined): boolean {
  return user?.user_type !== 'member' && user?.workspaces?.appointments?.has_services === true
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

/**
 * Where a sign-in that ran out sends the user: back to the same workspace
 * page after signing in again; every other page keeps the plain sign-in it
 * always had.
 */
export function loginPathAfterExpiry(pathname: string, search: string): string {
  return /^\/appointments(\/|$)/.test(pathname) ? loginPath({ pathname, search }) : '/login'
}

/** "Full admin" from the workspace opens the same tool there. */
export function fullAdminPathFor(pathname: string): string {
  if (/^\/appointments\/?$/.test(pathname)) return '/service-bookings/calendar'
  if (/^\/appointments\/clients(\/|$)/.test(pathname)) return '/leads?tab=customers'
  return '/'
}

/**
 * A `?redirect=` the sign-in screen may follow: a path on this site, or the
 * dashboard. `//host` and `/\host` are other sites to a browser.
 */
export function safeRedirect(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/'
}

/** The sign-in screen, set to bring the visitor back to where they were (see safeRedirect). */
export function loginPath(location: { pathname: string; search: string }): string {
  return `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`
}

/**
 * Where a user goes right after signing in. `fallback` is what the sign-in
 * screen would have used anyway ('/' or an explicit ?redirect=): the
 * workspace is chosen only when nothing else was asked for and the
 * organisation chose it (`--landing`); everyone else lands where they always
 * did. On the Appointments plan the workspace is all there is, whatever
 * the link asked for.
 */
export function landingPath(user: LandingUser | null | undefined, fallback: string): string {
  if (user?.user_type === 'member') return '/portal'
  if (isAppointmentsOnly(user)) return WORKSPACE_PATH.test(fallback) ? fallback : '/appointments'
  if (fallback === '/' && user?.workspaces?.appointments?.landing === true) return '/appointments'
  return fallback
}
