import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, CreditCard, Plus, Repeat } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { moduleHome } from '../workspace/lib/landing'
import { formatMonthly, PACKAGE_NAMES, type PackageKey } from './productSignup'
import {
  canChangePackage, canRemove, firstPick, orderedProducts, payIntervals, PRODUCT_HOME, planAction, planName, planStatus,
  productAction, productName, type ModuleKey, type ModulesState, type PackageOption, type ProductRow,
} from './accountProducts'

type Panel = { kind: 'add' | 'change' | 'remove'; module: ModuleKey } | null

/**
 * Plan & products (owner 2026-11-02). An organisation that bought HexaTech Loyalty, Content or Appointments on its
 * own sees here what its plan holds and in which package (Lite, Standard, Pro), adds a product, moves one to another
 * package or takes one off, and pays monthly or yearly (15 % less a month) or manages its card — the workspaces have
 * no full admin's Billing. Outside every workspace and outside the subscription check, so a plan that ended can still
 * be started again. Every figure is the server's.
 */
export function AccountProducts() {
  const { t, i18n } = useTranslation()
  const { token, user } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [panel, setPanel] = useState<Panel>(null)
  const [pick, setPick] = useState<PackageKey | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // Back from Stripe (?success=1 / ?canceled=1): said once, until the next action says something else.
  const [returnedFrom] = useState<'paid' | 'canceled' | null>(() => params.get('success') === '1' ? 'paid' : params.get('canceled') === '1' ? 'canceled' : null)
  const [returnShown, setReturnShown] = useState(true)
  const returned = useRef(false)

  const query = useQuery({
    queryKey: ['account-products'],
    queryFn: () => api.get<ModulesState>('/v1/auth/modules').then(r => r.data),
    enabled: Boolean(token) && user?.user_type === 'staff',
  })

  const names: Record<ModuleKey, string> = { appointments: 'HexaTech Appointments', loyalty: 'HexaTech Loyalty', content: 'HexaTech Content' }
  const blurbs: Record<ModuleKey, string> = {
    appointments: t('account.products.blurb.appointments', 'Calendar, online booking and client records'),
    loyalty: t('account.products.blurb.loyalty', 'Points, tiers, rewards, a member app and campaigns'),
    content: t('account.products.blurb.content', 'AI social media planner: ideas, captions, images and a calendar'),
  }

  // Back from Stripe: read billing again once (the address loses its ?success=1).
  useEffect(() => {
    if (returned.current || !token || returnedFrom === null) return
    returned.current = true
    setParams({}, { replace: true })
    if (returnedFrom === 'paid') {
      api.post<ModulesState>('/v1/auth/modules/refresh').then(r => queryClient.setQueryData(['account-products'], r.data)).catch(() => {})
    }
  }, [returnedFrom, setParams, token, queryClient])

  if (!token) return <Navigate to={`/login?redirect=${encodeURIComponent('/account/products')}`} replace />
  if (user?.user_type !== 'staff') return <Navigate to="/portal" replace />

  const state = query.data
  const home = moduleHome(user) ?? '/'
  const money = (amount: number | null | undefined, currency?: string) => formatMonthly(amount, currency ?? 'eur', i18n.language)
  const failure = (err: unknown) => {
    const body = (err as { response?: { data?: { message?: string; error?: string; limit?: number; count?: number; limit_key?: string } } })?.response?.data
    if (body?.error === 'over_limit' && body.limit != null && body.count != null) {
      if (body.limit_key === 'max_booking_staff') {
        return t('account.products.over_limit_booking', { limit: body.limit, count: body.count, defaultValue: 'This package allows {{limit}} team members who can be booked and you have {{count}} active. Choose a larger package, or switch some off in Setup first.' })
      }
      return body.limit_key === 'max_team_members'
        ? t('account.products.over_limit_team', { limit: body.limit, count: body.count, defaultValue: 'This package allows {{limit}} team members and you have {{count}} active. Choose a larger package, or switch some off first.' })
        : t('account.products.over_limit_members', { limit: body.limit, count: body.count, defaultValue: 'This package allows {{limit}} members and you have {{count}}. Choose a larger package.' })
    }
    return body?.message || t('account.products.failed', 'That did not work. Nothing was changed. Please try again.')
  }
  const returnNotice = !returnShown || returnedFrom === null ? ''
    : returnedFrom === 'paid' ? t('account.products.paid', 'Thank you. Your payment card is saved and your plan is active.')
    : t('account.products.canceled', 'Checkout was cancelled. Nothing was charged.')
  const shownNotice = notice || returnNotice
  const begin = (what: string) => { setBusy(what); setError(''); setNotice(''); setReturnShown(false) }

  const open = (kind: 'add' | 'change' | 'remove', row: ProductRow) => {
    setPanel({ kind, module: row.key })
    // Adding starts on Standard (or the first that can be had); a package change waits for an explicit choice.
    setPick(kind === 'add' ? firstPick(row.options ?? []) : null)
    setError('')
  }

  const change = async (kind: 'add' | 'change' | 'remove', module: ModuleKey, pkg: PackageKey | null) => {
    begin(module)
    try {
      const path = kind === 'add' ? '/v1/auth/modules/add' : kind === 'change' ? '/v1/auth/modules/package' : '/v1/auth/modules/remove'
      const { data } = await api.post<ModulesState & { charged?: string }>(path, kind === 'remove' ? { module } : { module, package: pkg })
      queryClient.setQueryData(['account-products'], data)
      // The sign-in answer changes too: a workspace added or taken away shows without signing in again.
      const me = await api.get('/v1/auth/me').then(r => r.data).catch(() => null)
      if (me) useAuthStore.setState(s => ({ user: s.user ? { ...s.user, ...me, id: s.user.id } : s.user }))
      const product = productName(module, names, kind === 'remove' ? null : pkg, PACKAGE_NAMES)
      setNotice(kind === 'remove'
        ? t('account.products.removed', { product: names[module], defaultValue: '{{product}} is off your plan. Its data is kept if you add it again.' })
        : data.charged === 'prorated'
          ? t('account.products.changed_paid', { product, defaultValue: 'Done: {{product}}. Your next invoice settles the difference for the rest of this period.' })
          : kind === 'add'
            ? t('account.products.added_trial', { product, defaultValue: '{{product}} is added and ready to use.' })
            : t('account.products.changed_trial', { product, defaultValue: 'Done: {{product}}.' }))
      setPanel(null)
    } catch (err) {
      setError(failure(err))
    } finally {
      setBusy(null)
    }
  }

  const pay = async (action: 'activate' | 'portal' | 'restart', interval?: 'MONTHLY' | 'YEARLY') => {
    begin(`${action}:${interval ?? ''}`)
    try {
      const { data } = await api.post(action === 'portal' ? '/v1/auth/modules/portal' : '/v1/auth/modules/activate', action === 'portal' ? {} : { interval })
      const url = data?.checkoutUrl ?? data?.portalUrl
      if (url) { window.location.assign(url); return }
      if (data?.modules) queryClient.setQueryData(['account-products'], data)
      setNotice(t('account.products.restarted', 'Your plan has started again.'))
    } catch (err) {
      setError(failure(err))
    } finally {
      setBusy(null)
    }
  }

  const status = state ? planStatus(state) : null
  const action = state ? planAction(state) : null
  const statusLine = !state || !status ? '' : status === 'trial'
    ? t('account.products.status.trial', { date: state.subscription.trial_end ? new Date(state.subscription.trial_end).toLocaleDateString(i18n.language) : '—', defaultValue: 'Free trial until {{date}}' })
    : status === 'active' ? t('account.products.status.active', 'Active')
    : status === 'overdue' ? t('account.products.status.overdue', 'Payment overdue: update your card to keep access')
    : t('account.products.status.ended', 'Ended: start your plan again to use your workspace')
  const save = t('auth.product.save', { percent: state?.yearly_discount_percent ?? 15, defaultValue: 'Save {{percent}}%' })
  const BUTTON = 'inline-flex min-h-10 items-center gap-2 rounded-lg bg-hx-0e1a24 px-4 text-sm font-medium text-hx-f4f6f8 disabled:opacity-60'
  const QUIET = 'inline-flex min-h-10 items-center gap-2 rounded-lg border border-hx-0e1a24/20 px-3 text-sm font-medium disabled:opacity-60'

  const optionLine = (option: PackageOption, row: ProductRow) => {
    const diff = option.extra_monthly_amount
    const diffText = diff == null ? '' : diff >= 0
      ? t('account.products.more_a_month', { price: money(diff, option.currency), defaultValue: '+{{price}} a month' })
      : t('account.products.less_a_month', { price: money(-diff, option.currency), defaultValue: '−{{price}} a month' })
    return `${productName(row.key, names, option.package, PACKAGE_NAMES)}${diffText ? ` · ${diffText}` : ''}`
  }

  return (
    <main className="min-h-screen bg-hx-eaeef2 text-hx-1b2a34">
      <header className="bg-hx-0e1a24 px-5 py-8 text-hx-f4f6f8 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Link to={home} className="inline-flex min-h-10 items-center gap-2 rounded-sm text-sm text-hx-c1cdd4 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white">
            <ArrowLeft size={16} aria-hidden="true" /> {t('account.products.back', 'Back to your workspace')}
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{t('account.products.title', 'Plan & products')}</h1>
          <p className="mt-2 wrap-break-word text-sm text-hx-c1cdd4">{state?.organization.name ?? user.email}</p>
          {state?.on_modules && <Link to="/account/team" className="mt-3 inline-flex min-h-10 items-center text-sm text-hx-c1cdd4 underline hover:text-white">{t('workspace.shell.team', 'Team')}</Link>}
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-0 sm:py-8">
        {shownNotice && <p role="status" className="rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-800">{shownNotice}</p>}
        {error && <p role="alert" className="rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-800">{error}</p>}

        {query.isLoading && <div className="h-40 animate-pulse rounded-xl bg-hx-f4f6f8" />}
        {query.isError && <p role="alert" className="rounded-lg bg-hx-f4f6f8 px-4 py-3 text-sm">{failure(query.error)}</p>}

        {state && !state.on_modules && (
          <section className="rounded-xl bg-hx-f4f6f8 p-5 shadow-sm">
            <h2 className="text-lg font-semibold">{t('account.products.everything_title', 'Your plan includes every product')}</h2>
            <p className="mt-1 text-sm text-hx-54626e">{t('account.products.everything_body', 'Plan changes, your card and invoices are in Billing in the full admin.')}</p>
            <Link to="/billing" className={`mt-4 ${BUTTON}`}>{t('account.products.open_billing', 'Open Billing')}</Link>
          </section>
        )}

        {state && state.on_modules && (
          <>
            <section data-plan="" className="rounded-xl bg-hx-f4f6f8 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-hx-54626e">{t('account.products.your_plan', 'Your plan')}</div>
                  <h2 className="mt-1 text-lg font-semibold">{planName(state.packages, names, PACKAGE_NAMES)}</h2>
                  <p className="mt-1 text-sm text-hx-54626e">{statusLine}</p>
                </div>
                {state.plan && money(state.plan.monthly_amount, state.plan.currency) && (
                  <div className="text-right">
                    <div><span className="text-2xl font-bold">{money(state.plan.monthly_amount, state.plan.currency)}</span><span className="ml-1 text-sm text-hx-54626e">{t('account.products.per_month', 'a month')}</span></div>
                    {state.plan.yearly_amount != null && (
                      <div className="text-xs text-hx-54626e">{t('account.products.or_yearly', { price: money(state.plan.yearly_amount, state.plan.currency), save, defaultValue: 'or {{price}} a year ({{save}})' })}</div>
                    )}
                  </div>
                )}
              </div>
              {(action === 'activate' || action === 'restart') && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {payIntervals(state).map(interval => (
                    <button key={interval} type="button" onClick={() => pay(action, interval)} disabled={busy !== null} data-pay={interval} className={interval === 'YEARLY' ? BUTTON : QUIET}>
                      <CreditCard size={16} aria-hidden="true" />
                      {busy === `${action}:${interval}` ? t('account.products.working', 'One moment…') : interval === 'YEARLY'
                        ? t('account.products.pay_yearly', { price: money(state.plan?.yearly_amount, state.plan?.currency), save, defaultValue: 'Pay yearly: {{price}} ({{save}})' })
                        : t('account.products.pay_monthly', { price: money(state.plan?.monthly_amount, state.plan?.currency), defaultValue: 'Pay monthly: {{price}}' })}
                    </button>
                  ))}
                </div>
              )}
              {action === 'portal' && (
                <button type="button" onClick={() => pay('portal')} disabled={busy !== null} className={`mt-4 ${BUTTON}`}>
                  <CreditCard size={16} aria-hidden="true" />{busy === 'portal:' ? t('account.products.working', 'One moment…') : t('account.products.portal', 'Card and invoices')}
                </button>
              )}
              {!state.can_manage && <p className="mt-3 text-xs text-hx-54626e">{t('account.products.managers_only', 'Only an owner or a manager can change the plan.')}</p>}
            </section>

            <section aria-labelledby="products-heading" className="space-y-3">
              <h2 id="products-heading" className="text-base font-semibold">{t('account.products.products', 'Products')}</h2>
              {orderedProducts(state.products).map((row: ProductRow) => {
                const what = productAction(row, state)
                const options = row.options ?? []
                const cheapest = options.filter(o => o.available).map(o => o.extra_monthly_amount).filter((a): a is number => a != null).sort((a, b) => a - b)[0]
                const isOpen = panel?.module === row.key
                return (
                  <article key={row.key} data-product={row.key} className="rounded-xl bg-hx-f4f6f8 p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{productName(row.key, names, row.held ? row.package : null, PACKAGE_NAMES)}</h3>
                        <p className="mt-0.5 text-sm text-hx-54626e">{blurbs[row.key]}</p>
                        {row.held && row.package && <p className="mt-1 text-xs text-hx-54626e">{t('account.products.package', { name: PACKAGE_NAMES[row.package], defaultValue: 'Package: {{name}}' })}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {what === 'open' && (
                          <>
                            <span className="inline-flex items-center gap-1 text-sm text-green-800"><Check size={16} aria-hidden="true" />{t('account.products.included', 'In your plan')}</span>
                            <Link to={PRODUCT_HOME[row.key]} className={QUIET}>{t('account.products.open', 'Open')}</Link>
                            {canChangePackage(row, state) && !isOpen && (
                              <button type="button" onClick={() => open('change', row)} disabled={busy !== null} className={QUIET}><Repeat size={16} aria-hidden="true" />{t('account.products.change_package', 'Change package')}</button>
                            )}
                            {canRemove(row, state) && !isOpen && (
                              <button type="button" onClick={() => open('remove', row)} disabled={busy !== null} className={QUIET}>{t('account.products.remove', 'Remove')}</button>
                            )}
                          </>
                        )}
                        {what === 'add' && !isOpen && (
                          <button type="button" onClick={() => open('add', row)} disabled={busy !== null} className={BUTTON}>
                            <Plus size={16} aria-hidden="true" />{cheapest != null ? t('account.products.add_from', { price: money(cheapest, options[0]?.currency), defaultValue: 'Add from {{price}} a month' }) : t('account.products.add', 'Add')}
                          </button>
                        )}
                        {what === 'ask' && <span className="text-sm text-hx-54626e">{t('account.products.ask', 'Ask an owner or a manager to add it')}</span>}
                        {what === 'inactive' && <span className="text-sm text-hx-54626e">{t('account.products.inactive', 'Start your plan again first, then add it')}</span>}
                        {what === 'unavailable' && <span className="text-sm text-hx-54626e">{t('account.products.unavailable', 'Not available online yet. Contact HexaTech to add it.')}</span>}
                      </div>
                    </div>

                    {isOpen && panel && (panel.kind === 'add' || panel.kind === 'change') && (
                      <div className="mt-4 rounded-lg border border-hx-0e1a24/15 bg-hx-eaeef2 p-4" data-panel={panel.kind}>
                        <fieldset>
                          <legend className="text-sm font-medium">{panel.kind === 'add' ? t('account.products.choose_add', { product: names[row.key], defaultValue: 'Add {{product}} in which package?' }) : t('account.products.choose_change', 'Move to which package?')}</legend>
                          <div className="mt-2 space-y-2">
                            {options.map(option => (
                              <label key={option.package} className={`flex items-start gap-2 rounded-md p-2 text-sm ${option.available ? 'cursor-pointer' : 'opacity-50'}`}>
                                <input type="radio" name={`package-${row.key}`} value={option.package} checked={pick === option.package} disabled={!option.available} onChange={() => setPick(option.package)} className="mt-1" />
                                <span>{optionLine(option, row)}{!option.available && ` · ${t('account.products.not_online', 'not online yet')}`}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        {pick && (() => {
                          const chosen = options.find(o => o.package === pick)
                          const next = { ...state.packages, [row.key]: pick }
                          return chosen ? (
                            <p className="mt-3 text-sm">{t('account.products.confirm_plan', { plan: planName(next, names, PACKAGE_NAMES), price: money(chosen.monthly_amount, chosen.currency) ?? '—', defaultValue: 'Your plan becomes {{plan}} at {{price}} a month.' })}</p>
                          ) : null
                        })()}
                        <p className="mt-1 text-xs text-hx-54626e">
                          {status === 'trial'
                            ? t('account.products.confirm_trial', 'It is included in your free trial; you pay the new price once you activate.')
                            : t('account.products.confirm_paid_any', 'You pay or are credited only the difference for the rest of this period, on your next invoice.')}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => change(panel.kind, row.key, pick)} disabled={busy !== null || !pick} className={BUTTON}>
                            {busy === row.key ? t('account.products.working', 'One moment…') : t('account.products.confirm_button', 'Confirm')}
                          </button>
                          <button type="button" onClick={() => setPanel(null)} disabled={busy !== null} className={QUIET}>{t('account.products.cancel', 'Not now')}</button>
                        </div>
                      </div>
                    )}

                    {isOpen && panel?.kind === 'remove' && (
                      <div className="mt-4 rounded-lg border border-red-600/30 bg-red-600/5 p-4" data-panel="remove">
                        <p className="text-sm">{t('account.products.confirm_remove', { product: names[row.key], defaultValue: 'Remove {{product}}? Your team loses its workspace at once. Nothing is deleted: add it again and everything is there.' })}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => change('remove', row.key, null)} disabled={busy !== null} className={BUTTON}>
                            {busy === row.key ? t('account.products.working', 'One moment…') : t('account.products.confirm_remove_button', { product: names[row.key], defaultValue: 'Remove {{product}}' })}
                          </button>
                          <button type="button" onClick={() => setPanel(null)} disabled={busy !== null} className={QUIET}>{t('account.products.cancel', 'Not now')}</button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
