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
export function landingPath(user: LandingUser | null | undefined, fallback: string): string {
  if (user?.user_type === 'member') return '/portal'
  if (fallback === '/' && user?.workspaces?.appointments?.landing === true) return '/appointments'
  return fallback
}
