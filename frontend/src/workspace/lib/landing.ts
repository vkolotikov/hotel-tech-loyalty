/**
 * Where people go between the full admin and its workspaces — HexaTech
 * Appointments (/appointments), HexaTech Content (/content) and HexaTech
 * Loyalty (/loyalty): the generic
 * half of the way in (spec 2026-10-14 §6.1). The Appointments-only rules
 * (its plan, its pages in the full admin) stay in appointments/lib/landing.ts,
 * which re-exports these.
 */
export type WorkspaceName = 'appointments' | 'content' | 'loyalty'

export interface LandingUser {
  user_type?: string
  workspaces?: {
    appointments?: { landing?: boolean; has_services?: boolean; only?: boolean }
    content?: { landing?: boolean }
    loyalty?: { landing?: boolean }
  }
}

/** A workspace page: /appointments…, /content… or /loyalty… (not /contentious). */
const WORKSPACE_PAGE = /^\/(appointments|content|loyalty)(\/|$)/
const APPOINTMENTS_PATH = /^\/appointments(\/|\?|$)/

/**
 * Whether the full admin shows its way into a workspace (the menu item, the
 * hub tile, the buttons on its pages): staff of an organisation that has
 * the workspace. The menu's own rules still apply on top.
 */
export function showsWorkspaceLink(user: LandingUser | null | undefined, name: WorkspaceName): boolean {
  return user?.user_type !== 'member' && user?.workspaces?.[name] != null
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
 * Where a sign-in that ran out sends the user: back to the same workspace
 * page after signing in again (spec §8.2); every other page keeps the plain
 * sign-in it always had.
 */
export function loginPathAfterExpiry(pathname: string, search: string): string {
  return WORKSPACE_PAGE.test(pathname) ? loginPath({ pathname, search }) : '/login'
}

/**
 * Where a user goes right after signing in. `fallback` is what the sign-in
 * screen would have used anyway ('/' or an explicit ?redirect=): a workspace
 * is chosen only when nothing else was asked for and the organisation chose
 * it (`--landing`; one per organisation); everyone else lands where they
 * always did. On the Appointments plan that workspace is all there is,
 * whatever the link asked for.
 */
export function landingPath(user: LandingUser | null | undefined, fallback: string): string {
  if (user?.user_type === 'member') return '/portal'
  if (user?.workspaces?.appointments?.only === true) return APPOINTMENTS_PATH.test(fallback) ? fallback : '/appointments'
  if (fallback === '/' && user?.workspaces?.appointments?.landing === true) return '/appointments'
  if (fallback === '/' && user?.workspaces?.content?.landing === true) return '/content'
  if (fallback === '/' && user?.workspaces?.loyalty?.landing === true) return '/loyalty'
  return fallback
}
