/**
 * Plan & products (/account/products, owner 2026-11-02): what the page decides, kept pure so it is tested without a
 * browser. Every figure and every "may" is the server's (GET /v1/auth/modules); the page only places them.
 */
export type ModuleKey = 'appointments' | 'loyalty' | 'content'

export interface ProductRow {
  key: ModuleKey
  held: boolean
  plan_slug?: string
  available?: boolean
  monthly_amount?: number | null
  extra_monthly_amount?: number | null
  currency?: string
}

export interface ModulesState {
  organization: { name: string }
  on_modules: boolean
  modules: ModuleKey[]
  landing: ModuleKey | null
  plan: { slug: string; monthly_amount: number | null; currency: string } | null
  subscription: { status: string | null; active: boolean; plan_slug: string | null; trial_end: string | null; period_end: string | null }
  products: ProductRow[]
  can_manage: boolean
  billing_available: boolean
}

export type PlanStatus = 'trial' | 'active' | 'overdue' | 'ended'

/** How the plan stands, from billing's status. */
export function planStatus(state: Pick<ModulesState, 'subscription'>): PlanStatus {
  const status = (state.subscription.status ?? '').toUpperCase()
  if (status === 'TRIALING') return 'trial'
  if (status === 'ACTIVE' || status === 'LOCAL') return 'active'
  if (status === 'PAST_DUE' || status === 'PAST_DUE_GRACE' || status === 'UNPAID') return 'overdue'
  return 'ended'
}

/** The plan's one main button for an owner or manager: pay for the trial, manage the card, or start again. */
export function planAction(state: ModulesState): 'activate' | 'portal' | 'restart' | null {
  if (!state.on_modules || !state.can_manage || !state.billing_available) return null
  const status = planStatus(state)
  if (status === 'trial') return 'activate'
  if (status === 'ended') return 'restart'
  return 'portal'
}

/** What a product's card offers: open it, add it, ask someone who may, or say it cannot be bought online yet. */
export function productAction(row: ProductRow, state: Pick<ModulesState, 'can_manage' | 'on_modules' | 'subscription'>): 'open' | 'add' | 'ask' | 'unavailable' | 'inactive' {
  if (row.held) return 'open'
  if (!row.available) return 'unavailable'
  if (!state.subscription.active) return 'inactive'
  return state.can_manage ? 'add' : 'ask'
}

/** The products this page lists: the ones held first, then the others, each in the server's order. */
export function orderedProducts(rows: ProductRow[]): ProductRow[] {
  return [...rows.filter(r => r.held), ...rows.filter(r => !r.held)]
}

/** The workspace each product opens. */
export const PRODUCT_HOME: Record<ModuleKey, string> = { appointments: '/appointments', loyalty: '/loyalty', content: '/content' }

/** The plan's name: its products' names joined. */
export function planName(modules: ModuleKey[], names: Record<ModuleKey, string>): string {
  return modules.map(m => names[m]).join(' + ')
}
