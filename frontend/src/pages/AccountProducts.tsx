import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, CreditCard, Plus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { moduleHome } from '../workspace/lib/landing'
import { formatMonthly } from './productSignup'
import { orderedProducts, PRODUCT_HOME, planAction, planName, planStatus, productAction, type ModuleKey, type ModulesState, type ProductRow } from './accountProducts'

/**
 * Plan & products (owner 2026-11-02). An organisation that bought HexaTech Loyalty, Content or Appointments on its
 * own sees here what its plan holds, adds another product (its plan moves to the larger one; billing prorates) and
 * pays for its trial or manages its card — the workspaces have no full admin's Billing. Outside every workspace and
 * outside the subscription check, so a plan that ended can still be started again. Every figure is the server's.
 */
export function AccountProducts() {
  const { t, i18n } = useTranslation()
  const { token, user } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<ModuleKey | null>(null)
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

  const names: Record<ModuleKey, string> = {
    appointments: 'HexaTech Appointments',
    loyalty: 'HexaTech Loyalty',
    content: 'HexaTech Content',
  }
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
  const returnNotice = !returnShown || returnedFrom === null ? ''
    : returnedFrom === 'paid' ? t('account.products.paid', 'Thank you. Your payment card is saved and your plan is active.')
    : t('account.products.canceled', 'Checkout was cancelled. Nothing was charged.')
  const shownNotice = notice || returnNotice

  if (!token) return <Navigate to={`/login?redirect=${encodeURIComponent('/account/products')}`} replace />
  if (user?.user_type !== 'staff') return <Navigate to="/portal" replace />

  const state = query.data
  const home = moduleHome(user) ?? '/'
  const price = (amount: number | null | undefined, currency?: string) => formatMonthly(amount, currency ?? 'eur', i18n.language)
  const failure = (err: unknown) => {
    const body = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
    return body?.message || t('account.products.failed', 'That did not work. Nothing was changed. Please try again.')
  }

  const add = async (module: ModuleKey) => {
    setBusy(module); setError(''); setNotice(''); setReturnShown(false)
    try {
      const { data } = await api.post<ModulesState & { charged?: string }>('/v1/auth/modules/add', { module })
      queryClient.setQueryData(['account-products'], data)
      // The sign-in answer changes too: the new workspace opens without signing in again.
      const me = await api.get('/v1/auth/me').then(r => r.data).catch(() => null)
      if (me) useAuthStore.setState(s => ({ user: s.user ? { ...s.user, ...me, id: s.user.id } : s.user }))
      setNotice(data.charged === 'prorated'
        ? t('account.products.added_paid', { product: names[module], defaultValue: '{{product}} is added. Your next invoice includes the difference for the rest of this month.' })
        : t('account.products.added_trial', { product: names[module], defaultValue: '{{product}} is added and ready to use.' }))
      setConfirming(null)
    } catch (err) {
      setError(failure(err))
    } finally {
      setBusy(null)
    }
  }

  const go = async (action: 'activate' | 'portal' | 'restart') => {
    setBusy(action); setError(''); setNotice(''); setReturnShown(false)
    try {
      const { data } = await api.post(action === 'portal' ? '/v1/auth/modules/portal' : '/v1/auth/modules/activate')
      const url = data?.checkoutUrl ?? data?.portalUrl
      if (url) { window.location.href = url; return }
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
  const actionLabel = action === 'activate' ? t('account.products.activate', 'Add a card and activate')
    : action === 'portal' ? t('account.products.portal', 'Card and invoices')
    : action === 'restart' ? t('account.products.restart', 'Start again') : ''

  return (
    <main className="min-h-screen bg-hx-eaeef2 text-hx-1b2a34">
      <header className="bg-hx-0e1a24 px-5 py-8 text-hx-f4f6f8 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Link to={home} className="inline-flex min-h-10 items-center gap-2 rounded-sm text-sm text-hx-c1cdd4 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white">
            <ArrowLeft size={16} aria-hidden="true" /> {t('account.products.back', 'Back to your workspace')}
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{t('account.products.title', 'Plan & products')}</h1>
          <p className="mt-2 wrap-break-word text-sm text-hx-c1cdd4">{state?.organization.name ?? user.email}</p>
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
            <Link to="/billing" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-hx-0e1a24 px-4 text-sm font-medium text-hx-f4f6f8">{t('account.products.open_billing', 'Open Billing')}</Link>
          </section>
        )}

        {state && state.on_modules && (
          <>
            <section data-plan="" className="rounded-xl bg-hx-f4f6f8 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-hx-54626e">{t('account.products.your_plan', 'Your plan')}</div>
                  <h2 className="mt-1 text-lg font-semibold">{planName(state.modules, names)}</h2>
                  <p className="mt-1 text-sm text-hx-54626e">{statusLine}</p>
                </div>
                {state.plan && price(state.plan.monthly_amount, state.plan.currency) && (
                  <div className="text-right">
                    <span className="text-2xl font-bold">{price(state.plan.monthly_amount, state.plan.currency)}</span>
                    <span className="ml-1 text-sm text-hx-54626e">{t('account.products.per_month', 'a month')}</span>
                  </div>
                )}
              </div>
              {action && (
                <button type="button" onClick={() => go(action)} disabled={busy !== null}
                  className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-hx-0e1a24 px-4 text-sm font-medium text-hx-f4f6f8 disabled:opacity-60">
                  <CreditCard size={16} aria-hidden="true" />{busy === action ? t('account.products.working', 'One moment…') : actionLabel}
                </button>
              )}
              {!state.can_manage && <p className="mt-3 text-xs text-hx-54626e">{t('account.products.managers_only', 'Only an owner or a manager can change the plan.')}</p>}
            </section>

            <section aria-labelledby="products-heading" className="space-y-3">
              <h2 id="products-heading" className="text-base font-semibold">{t('account.products.products', 'Products')}</h2>
              {orderedProducts(state.products).map((row: ProductRow) => {
                const what = productAction(row, state)
                const extra = price(row.extra_monthly_amount, row.currency)
                return (
                  <article key={row.key} data-product={row.key} className="rounded-xl bg-hx-f4f6f8 p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{names[row.key]}</h3>
                        <p className="mt-0.5 text-sm text-hx-54626e">{blurbs[row.key]}</p>
                      </div>
                      {what === 'open' && (
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-sm text-green-800"><Check size={16} aria-hidden="true" />{t('account.products.included', 'In your plan')}</span>
                          <Link to={PRODUCT_HOME[row.key]} className="inline-flex min-h-10 items-center rounded-lg border border-hx-0e1a24/20 px-3 text-sm font-medium">{t('account.products.open', 'Open')}</Link>
                        </span>
                      )}
                      {what === 'add' && confirming !== row.key && (
                        <button type="button" onClick={() => { setConfirming(row.key); setError('') }} disabled={busy !== null}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-hx-0e1a24 px-4 text-sm font-medium text-hx-f4f6f8 disabled:opacity-60">
                          <Plus size={16} aria-hidden="true" />{extra ? t('account.products.add_for', { price: extra, defaultValue: 'Add for {{price}} a month' }) : t('account.products.add', 'Add')}
                        </button>
                      )}
                      {what === 'ask' && <span className="text-sm text-hx-54626e">{t('account.products.ask', 'Ask an owner or a manager to add it')}</span>}
                      {what === 'inactive' && <span className="text-sm text-hx-54626e">{t('account.products.inactive', 'Start your plan again first, then add it')}</span>}
                      {what === 'unavailable' && <span className="text-sm text-hx-54626e">{t('account.products.unavailable', 'Not available online yet. Contact HexaTech to add it.')}</span>}
                    </div>
                    {what === 'add' && confirming === row.key && (
                      <div className="mt-4 rounded-lg border border-hx-0e1a24/15 bg-hx-eaeef2 p-4">
                        <p className="text-sm">
                          {t('account.products.confirm', {
                            product: names[row.key],
                            plan: planName([...state.modules, row.key].sort((a, b) => ['appointments', 'loyalty', 'content'].indexOf(a) - ['appointments', 'loyalty', 'content'].indexOf(b)), names),
                            price: price(row.monthly_amount, row.currency) ?? '—',
                            defaultValue: 'Add {{product}}? Your plan becomes {{plan}} at {{price}} a month.',
                          })}
                        </p>
                        <p className="mt-1 text-xs text-hx-54626e">
                          {status === 'trial'
                            ? t('account.products.confirm_trial', 'It is included in your free trial; you pay the new price once you activate.')
                            : t('account.products.confirm_paid', 'You pay only the difference for the rest of this month, on your next invoice.')}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => add(row.key)} disabled={busy !== null}
                            className="inline-flex min-h-10 items-center rounded-lg bg-hx-0e1a24 px-4 text-sm font-medium text-hx-f4f6f8 disabled:opacity-60">
                            {busy === row.key ? t('account.products.working', 'One moment…') : t('account.products.confirm_add', { product: names[row.key], defaultValue: 'Add {{product}}' })}
                          </button>
                          <button type="button" onClick={() => setConfirming(null)} disabled={busy !== null}
                            className="inline-flex min-h-10 items-center rounded-lg border border-hx-0e1a24/20 px-4 text-sm font-medium">
                            {t('account.products.cancel', 'Not now')}
                          </button>
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
