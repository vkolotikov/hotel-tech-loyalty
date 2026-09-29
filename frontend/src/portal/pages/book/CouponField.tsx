import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { refreshAfterCouponResolved } from './steps'
import { Button } from '../../ui/Button'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import type { Claim, CouponRef, Priced, Redemption } from '../../lib/types'

const sameRef = (a: CouponRef | null, b: CouponRef) => !!a && JSON.stringify(a) === JSON.stringify(b)

/** A top-level component so it isn't recreated on every render of `CouponField` (react-hooks' `static-components`). */
function CouponChip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`min-h-[44px] px-3 rounded-p-control border text-sm ${active ? 'bg-p-accent text-p-accent-ink border-p-accent' : 'bg-p-surface border-p-border'}`}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}

interface Props {
  value: CouponRef | null
  onChange: (c: CouponRef | null) => void
  quote: Priced | null
  /** The sentence for a `coupon_*` error the *quote itself* answered with (the applied coupon turned out
   *  to be no good) — shown here, next to the coupon the member picked, rather than as a page-level notice. */
  quoteErrorMessage?: string | null
}

export function CouponField({ value, onChange, quote, quoteErrorMessage = null }: Props) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const qc = useQueryClient()
  const offers = useQuery({ queryKey: ['portal-offers'], queryFn: portalApi.offers })
  const redemptions = useQuery({ queryKey: ['portal-redemptions'], queryFn: portalApi.redemptions })
  const resolve = useMutation({
    mutationFn: (c: string) => portalApi.resolveCoupon(c),
    onSuccess: r => {
      setError(null); setApplied(r.label); onChange(r.coupon); setCode('')
      for (const queryKey of refreshAfterCouponResolved(r)) void qc.invalidateQueries({ queryKey })
    },
    onError: e => {
      const failedCode = apiErrorCode(e)
      setError(t(bookErrorKey(failedCode), bookErrorFallback(failedCode)))
    },
  })

  const claims: Claim[] = (offers.data?.personalized ?? []).filter(c => c.status !== 'used' && !c.used_at)
  const codes: Redemption[] = (redemptions.data?.redemptions ?? []).filter(r => r.status === 'pending')
  const loadingCoupons = offers.isPending || redemptions.isPending

  return (
    <section className="space-y-3" aria-label={t('portal.book.coupon', 'Coupon')}>
      <h3 className="text-sm font-medium">{t('portal.book.coupon_yours', 'Your coupons')}</h3>
      {loadingCoupons ? (
        <Skeleton className="h-11" />
      ) : claims.length + codes.length === 0 ? (
        <p className="text-sm text-p-text-2">{t('portal.book.coupon_none', 'No coupons yet. Codes from the venue go here.')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {claims.map(c => {
            const ref: CouponRef = { member_offer_id: c.id }
            const active = sameRef(value, ref)
            return <CouponChip key={`o${c.id}`} label={c.offer?.title ?? ''} active={active} onToggle={() => { setError(null); setApplied(null); onChange(active ? null : ref) }} />
          })}
          {codes.map(r => {
            const ref: CouponRef = { redemption_id: r.id }
            const active = sameRef(value, ref)
            return <CouponChip key={`r${r.id}`} label={r.reward?.name ?? r.code} active={active} onToggle={() => { setError(null); setApplied(null); onChange(active ? null : ref) }} />
          })}
        </div>
      )}
      <form className="flex gap-2 items-end" onSubmit={e => { e.preventDefault(); if (code.trim()) resolve.mutate(code.trim()) }}>
        <div className="flex-1">
          <Field label={t('portal.book.coupon_code', 'Have a code?')}>
            <input className={INPUT_CLASS} value={code} onChange={e => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" maxLength={32} />
          </Field>
        </div>
        <Button type="submit" variant="secondary" loading={resolve.isPending}>{t('portal.book.coupon_apply', 'Apply')}</Button>
      </form>
      {error && <Notice tone="danger">{error}</Notice>}
      {quoteErrorMessage && <Notice tone="danger">{quoteErrorMessage}</Notice>}
      {applied && quote?.coupon?.status === 'applied' && <Notice tone="success">{t('portal.book.coupon_applied', '{{label}} applied', { label: applied })}</Notice>}
      {value && <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(null); setApplied(null); setError(null) }}>{t('portal.book.coupon_remove', 'Remove')}</Button>}
    </section>
  )
}
