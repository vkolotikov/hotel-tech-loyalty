/** The sign-in screen, set to bring the visitor back to the planner page they asked for. */
export { loginPath } from '../../workspace/lib/landing'

/** The interface name. One constant: the owner may rename the product. */
export const APP_NAME = 'HexaTech Time Planner'

/** Where "Full admin" goes for a full customer: the full admin's own Planner. */
export const FULL_ADMIN = '/planner'

export const planPath = (date?: string, view: 'day' | 'week' = 'day'): string =>
  `/time/plan${date ? `?date=${date}${view === 'week' ? '&view=week' : ''}` : view === 'week' ? '?view=week' : ''}`
