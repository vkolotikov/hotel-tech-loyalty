interface LandingUser {
  user_type?: string
  workspaces?: { appointments?: { landing?: boolean } }
}

/**
 * Where a user goes right after signing in. `fallback` is what the sign-in
 * screen would have used anyway ('/' or an explicit ?redirect=): the
 * workspace is chosen only when nothing else was asked for, so an
 * organisation that never opted in lands exactly where it always did.
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
