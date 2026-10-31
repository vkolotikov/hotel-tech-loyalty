import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { serverCodeOf } from '../../lib/failure'
import { queryClient } from '../../lib/queries'
import { useT } from '../../lib/i18n'
import { C, fonts } from '../../lib/theme'
import {
  afterQuoteError, bookErrorFallback, bookErrorKey, couponChoices, formatDateTime, formatMoney, isWindowCode, quoteBody, sameCoupon,
  type BookState, type Catalogue, type CouponRef, type Quote, type ReviewPatch,
} from '../../shared/portal'
import { Field, GhostButton, GoldButton, Notice, Shimmer, Surface, Toggle } from '../ui'
import { Choice, PriceBreakdown, Stepper } from './parts'

/**
 * The Review step, as the portal's: how many people, add-ons, a note, a coupon, and the server's quote for exactly that.
 * Notes travel with Continue only (they do not change the price, so they never touch the quote's key).
 */
export function ReviewStep({ catalogue, state, industry, timezone, onChange, onBack, onContinue }: {
  catalogue: Catalogue
  state: BookState
  industry: string | null | undefined
  timezone: string
  onChange: (patch: ReviewPatch) => void
  onBack: () => void
  onContinue: (quote: Quote, notes: string) => void
}) {
  const { tp, language } = useT()
  const [notes, setNotes] = useState(state.notes)
  const body = useMemo(() => quoteBody(state), [state])
  // A price the member is about to accept is always the server's answer for the current selection: never cached.
  const quote = useQuery({ queryKey: ['book', 'quote', body], queryFn: () => api.quote(body), retry: false, retryOnMount: false, staleTime: 0, gcTime: 0 })
  const code = quote.isError ? serverCodeOf(quote.error) : null
  const windowCode = isWindowCode(code) ? code : null
  const otherError = quote.isError && !windowCode && !(code ?? '').startsWith('coupon_') && code !== 'extra_lead_time'
  const [couponNotice, setCouponNotice] = useState<string | null>(null)

  // The decision is the portal's `afterQuoteError()`: a coupon the quote refused is dropped, and the member told why.
  useEffect(() => {
    const result = afterQuoteError(code)
    if (!result || state.coupon === null) return
    onChange(result.patch)
    setCouponNotice(result.noticeCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const pickCoupon = (coupon: CouponRef | null) => { setCouponNotice(null); onChange({ coupon }) }
  const service = catalogue.services.find(s => s.id === state.serviceId)

  return (
    <View style={{ gap: 18 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.book.heading_review')}</Text>
      <Surface style={styles.summary}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[fonts.bodyStrong, { color: C.text }]}>{service?.name}</Text>
          {state.startAt ? <Text style={[fonts.small, { color: C.text2 }]}>{formatDateTime(state.startAt, language, timezone)}</Text> : null}
        </View>
        <GhostButton title={tp('portal.book.change')} onPress={onBack} />
      </Surface>

      <Stepper label={tp('portal.book.party_size')} value={state.partySize} min={1} max={10} onChange={v => onChange({ partySize: v })} />

      {catalogue.extras.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.book.extras')}</Text>
          {catalogue.extras.map(x => (
            <View key={x.id} style={styles.extra}>
              <View style={{ flex: 1 }}>
                <Text style={[fonts.bodyStrong, { color: C.text }]}>{x.name}</Text>
                <Text style={[fonts.small, { color: C.text2 }]}>{formatMoney(x.price, x.currency ?? catalogue.rules.currency, language)}</Text>
              </View>
              <Toggle
                value={state.extras.includes(x.id)}
                label={x.name}
                onChange={on => onChange({ extras: on ? [...state.extras, x.id] : state.extras.filter(id => id !== x.id) })}
              />
            </View>
          ))}
          {code === 'extra_lead_time' && <Notice tone="warning" text={tp(bookErrorKey(code), bookErrorFallback(code))} />}
        </View>
      )}

      <Field label={tp('portal.book.notes')} hint={tp('portal.book.notes_hint')} value={notes} onChangeText={setNotes} multiline maxLength={500} style={{ minHeight: 88, paddingTop: 14, textAlignVertical: 'top' }} />

      <Coupons value={state.coupon} onChange={pickCoupon} quote={quote.data ?? null} quoteError={couponNotice ? tp(bookErrorKey(couponNotice), bookErrorFallback(couponNotice)) : null} />

      {quote.isPending && <Shimmer height={120} />}
      {windowCode && <Notice tone="warning" text={tp(bookErrorKey(windowCode), bookErrorFallback(windowCode))} action={tp('portal.book.change')} onAction={onBack} />}
      {otherError && <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void quote.refetch() }} />}
      {quote.data && <Surface><PriceBreakdown quote={quote.data} industry={industry} /></Surface>}
      {quote.data?.policy.cancellation_policy ? (
        <Text style={[fonts.small, { color: C.text2 }]}>{`${tp('portal.bookings.policy')}: ${quote.data.policy.cancellation_policy}`}</Text>
      ) : null}
      <GoldButton title={tp('portal.book.continue')} icon="arrow-forward" disabled={!quote.data} onPress={() => { if (quote.data) onContinue(quote.data, notes) }} />
    </View>
  )
}

/**
 * The member's coupons as chips (claimed offers not yet used, reward codes still pending), a code typed from the venue,
 * and what became of it. Explicit: nothing is applied without the member choosing it.
 */
function Coupons({ value, onChange, quote, quoteError }: { value: CouponRef | null; onChange: (coupon: CouponRef | null) => void; quote: Quote | null; quoteError: string | null }) {
  const { tp } = useT()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const offers = useQuery({ queryKey: ['rewards', 'offers'], queryFn: api.offers })
  const redemptions = useQuery({ queryKey: ['rewards', 'codes'], queryFn: api.redemptions })
  const resolve = useMutation({
    mutationFn: (typed: string) => api.resolveCoupon(typed),
    onSuccess: r => {
      setError(null); setApplied(r.label); onChange(r.coupon); setCode('')
      // A resolved offer code is now the member's claim; a reward code was theirs already. Either list is read again.
      void queryClient.invalidateQueries({ queryKey: ['rewards'] })
    },
    onError: e => { const failed = serverCodeOf(e); setError(tp(bookErrorKey(failed), bookErrorFallback(failed))) },
  })
  const { claims, codes } = couponChoices(offers.data?.personalized, redemptions.data?.redemptions)
  const loading = offers.isPending || redemptions.isPending
  const toggle = (ref: CouponRef) => { setError(null); setApplied(null); onChange(sameCoupon(value, ref) ? null : ref) }

  return (
    <View style={{ gap: 10 }}>
      <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.book.coupon_yours')}</Text>
      {loading ? <Shimmer height={48} /> : claims.length + codes.length === 0 ? (
        <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.book.coupon_none')}</Text>
      ) : (
        <View style={styles.chips}>
          {claims.map(c => {
            const ref: CouponRef = { member_offer_id: c.id }
            const on = sameCoupon(value, ref)
            return <Choice key={`o${c.id}`} picked={on} onPress={() => toggle(ref)}><Text style={[fonts.smallStrong, { color: on ? C.onGold : C.text }]}>{c.offer?.title ?? ''}</Text></Choice>
          })}
          {codes.map(r => {
            const ref: CouponRef = { redemption_id: r.id }
            const on = sameCoupon(value, ref)
            return <Choice key={`r${r.id}`} picked={on} onPress={() => toggle(ref)}><Text style={[fonts.smallStrong, { color: on ? C.onGold : C.text }]}>{r.reward?.name ?? r.code}</Text></Choice>
          })}
        </View>
      )}
      <View style={styles.codeRow}>
        <View style={{ flex: 1 }}>
          <Field label={tp('portal.book.coupon_code')} value={code} onChangeText={v => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={32} returnKeyType="done" onSubmitEditing={() => { if (code.trim()) resolve.mutate(code.trim()) }} />
        </View>
        <GhostButton title={tp('portal.book.coupon_apply')} busy={resolve.isPending} disabled={!code.trim()} onPress={() => resolve.mutate(code.trim())} />
      </View>
      {error && <Notice text={error} />}
      {quoteError && <Notice text={quoteError} />}
      {applied && quote?.coupon?.status === 'applied' && <Notice tone="success" text={tp('portal.book.coupon_applied', { label: applied })} />}
      {value && <GhostButton title={tp('portal.book.coupon_remove')} icon="close" onPress={() => { onChange(null); setApplied(null); setError(null) }} style={{ alignSelf: 'flex-start' }} />}
    </View>
  )
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
})
