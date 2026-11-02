import type { PackageKey } from './productSignup'

/**
 * Plan & products (/account/products, owner 2026-11-02): what the page decides, kept pure so it is tested without a
 * browser. Every figure and every "may" is the server's (GET /v1/auth/modules); the page only places them.
 */
export type ModuleKey = 'appointments' | 'loyalty' | 'content'

/** One package a product could move to (or be added in), as the server prices it. */
export interface PackageOption {
  package: PackageKey
  plan_slug: string
  available: boolean
  monthly_amount: number | null
  yearly_amount: number | null
  /** What the whole plan's monthly price changes by; negative for a smaller package. */
  extra_monthly_amount: number | null
  currency: string
  features: Record<string, string>
}

export interface ProductRow {
  key: ModuleKey
  held: boolean
  /** The package held; null when not held. Absent for a full customer. */
  package?: PackageKey | null
  can_remove?: boolean
  /** For a product held: its other packages; for one not held: each package it can be added in. */
  options?: PackageOption[]
}

export interface ModulesState {
  organization: { name: string }
  on_modules: boolean
  modules: ModuleKey[]
  packages: Partial<Record<ModuleKey, PackageKey>>
  landing: ModuleKey | null
  plan: { slug: string; monthly_amount: number | null; yearly_amount: number | null; currency: string; features?: Record<string, string> } | null
  subscription: { status: string | null; active: boolean; plan_slug: string | null; trial_end: string | null; period_end: string | null }
  products: ProductRow[]
  can_manage: boolean
  billing_available: boolean
  yearly_discount_percent: number
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

/** The plan's main action for an owner or manager: pay for the trial, manage the card, or start it again. */
export function planAction(state: ModulesState): 'activate' | 'portal' | 'restart' | null {
  if (!state.on_modules || !state.can_manage || !state.billing_available) return null
  const status = planStatus(state)
  if (status === 'trial') return 'activate'
  if (status === 'ended') return 'restart'
  return 'portal'
}

/** Paying (activate, restart) asks monthly or yearly; yearly only where the plan has a yearly price. */
export function payIntervals(state: Pick<ModulesState, 'plan'>): ('MONTHLY' | 'YEARLY')[] {
  return state.plan?.yearly_amount != null ? ['MONTHLY', 'YEARLY'] : ['MONTHLY']
}

/** What a product's card offers: open it, add it, ask someone who may, or say it cannot be bought online yet. */
export function productAction(row: ProductRow, state: Pick<ModulesState, 'can_manage' | 'on_modules' | 'subscription'>): 'open' | 'add' | 'ask' | 'unavailable' | 'inactive' {
  if (row.held) return 'open'
  if (!(row.options ?? []).some(o => o.available)) return 'unavailable'
  if (!state.subscription.active) return 'inactive'
  return state.can_manage ? 'add' : 'ask'
}

/** Whether an owner or manager may move a held product to another package now. */
export function canChangePackage(row: ProductRow, state: Pick<ModulesState, 'can_manage' | 'on_modules' | 'subscription'>): boolean {
  return row.held && state.on_modules && state.can_manage && state.subscription.active && (row.options ?? []).some(o => o.available)
}

/** Whether an owner or manager may take a held product off the plan (the server says which may go). */
export function canRemove(row: ProductRow, state: Pick<ModulesState, 'can_manage' | 'subscription'>): boolean {
  return row.held && row.can_remove === true && state.can_manage && state.subscription.active
}

/** The option to pick first in a list: Standard when it can be had, else the first that can. */
export function firstPick(options: PackageOption[]): PackageKey | null {
  return (options.find(o => o.package === 'standard' && o.available) ?? options.find(o => o.available))?.package ?? null
}

/** The products this page lists: the ones held first, then the others, each in the server's order. */
export function orderedProducts(rows: ProductRow[]): ProductRow[] {
  return [...rows.filter(r => r.held), ...rows.filter(r => !r.held)]
}

/** The workspace each product opens. */
export const PRODUCT_HOME: Record<ModuleKey, string> = { appointments: '/appointments', loyalty: '/loyalty', content: '/content' }

const MODULE_ORDER: readonly ModuleKey[] = ['appointments', 'loyalty', 'content']

/** A product's name with its package: "HexaTech Loyalty Pro" (Standard and Appointments' one package carry no word). */
export function productName(module: ModuleKey, names: Record<ModuleKey, string>, pkg?: PackageKey | null, packageNames?: Record<PackageKey, string>): string {
  return pkg && pkg !== 'standard' && packageNames ? `${names[module]} ${packageNames[pkg]}` : names[module]
}

/** The plan's name: its products' names with their packages, in the server's order. */
export function planName(packages: Partial<Record<ModuleKey, PackageKey>> | ModuleKey[], names: Record<ModuleKey, string>, packageNames?: Record<PackageKey, string>): string {
  const chosen: Partial<Record<ModuleKey, PackageKey>> = Array.isArray(packages) ? Object.fromEntries(packages.map(m => [m, 'standard'])) : packages
  return MODULE_ORDER.filter(m => chosen[m]).map(m => productName(m, names, chosen[m], packageNames)).join(' + ')
}
