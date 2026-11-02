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
    content?: { landing?: boolean; only?: boolean }
    loyalty?: { landing?: boolean; only?: boolean }
  }
}

/** A workspace page: /appointments…, /content… or /loyalty… (not /contentious). */
const WORKSPACE_PAGE = /^\/(appointments|content|loyalty)(\/|$)/

/** The server's order of the modules (App\Support\PlanModules): where staff land when nothing else says. */
const MODULE_ORDER: readonly WorkspaceName[] = ['appointments', 'loyalty', 'content']

/** The account pages an organisation on modules keeps beside its workspaces (Plan & products, Team, connections). */
const ACCOUNT_PAGE = /^\/account\/(products|team|connections)(\/|\?|$)/

const pageOf = (name: WorkspaceName) => new RegExp(`^/${name}(/|\\?|$)`)

/**
 * The workspaces an organisation on modules bought (owner 2026-11-02: HexaTech Loyalty, Content or Appointments
 * on their own, one or several), in the server's order; null for a full customer, a member or before sign-in.
 * The server marks each of them `only` (Organization::workspacesPayload).
 */
export function planModules(user: LandingUser | null | undefined): WorkspaceName[] | null {
  if (!user || user.user_type === 'member') return null
  const held = MODULE_ORDER.filter(name => user.workspaces?.[name]?.only === true)
  return held.length > 0 ? held : null
}

/** Where staff of an organisation on modules belong: the workspace the server lands them on, else the first. Null for everyone else. */
export function moduleHome(user: LandingUser | null | undefined): string | null {
  const held = planModules(user)
  if (!held) return null
  return `/${held.find(name => user?.workspaces?.[name]?.landing === true) ?? held[0]}`
}

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

/**
 * The sign-in screen, set to bring the visitor back to where they were (see safeRedirect). From HexaTech Loyalty or
 * Content it is that product's own sign-in page (/loyalty/login, /content/login; owner 2026-11-02): the same
 * accounts, the product's own look.
 */
export function loginPath(location: { pathname: string; search: string }): string {
  const product = /^\/(loyalty|content)(\/|$)/.exec(location.pathname)?.[1]
  return `${product ? `/${product}` : ''}/login?redirect=${encodeURIComponent(location.pathname + location.search)}`
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
 * always did. On modules (the Appointments plan, Loyalty or Content bought
 * on their own) the workspaces bought are all there is: a link into one of
 * them or into the account pages is followed, anything else lands on its home.
 */
export function landingPath(user: LandingUser | null | undefined, fallback: string): string {
  if (user?.user_type === 'member') return '/portal'
  const held = planModules(user)
  if (held) return held.some(name => pageOf(name).test(fallback)) || ACCOUNT_PAGE.test(fallback) ? fallback : moduleHome(user)!
  if (fallback === '/' && user?.workspaces?.appointments?.landing === true) return '/appointments'
  if (fallback === '/' && user?.workspaces?.content?.landing === true) return '/content'
  if (fallback === '/' && user?.workspaces?.loyalty?.landing === true) return '/loyalty'
  return fallback
}
