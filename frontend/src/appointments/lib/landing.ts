interface LandingUser {
  user_type?: string
  workspaces?: { appointments?: { landing?: boolean; has_services?: boolean } }
}

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
 * Where a user goes right after signing in. `fallback` is what the sign-in
 * screen would have used anyway ('/' or an explicit ?redirect=): the
 * workspace is chosen only when nothing else was asked for and the
 * organisation chose it (`--landing`); everyone else lands where they always did.
 */
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

export function landingPath(user: LandingUser | null | undefined, fallback: string): string {
  if (user?.user_type === 'member') return '/portal'
  if (fallback === '/' && user?.workspaces?.appointments?.landing === true) return '/appointments'
  return fallback
}
