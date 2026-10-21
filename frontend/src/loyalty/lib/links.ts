/** The sign-in screen, set to bring the visitor back to the Loyalty page they asked for. */
export { loginPath } from '../../workspace/lib/landing'

/** The interface name. One constant: the owner may rename the product. */
export const APP_NAME = 'HexaTech Loyalty'

/** Where "Full admin" goes (spec 2026-10-21 §6.7): the Members hub, which is everyone's there. */
export const FULL_ADMIN = '/members'

/** A member's page here, and the same member in the full admin (for what the workspace does not do). */
export const memberPath = (id: number): string => `/loyalty/members/${id}`
export const fullAdminMemberPath = (id: number): string => `/members/${id}`
