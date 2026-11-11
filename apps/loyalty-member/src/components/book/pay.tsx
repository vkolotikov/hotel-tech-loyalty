import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import * as Crypto from 'expo-crypto'
import { api } from '../../lib/api'
import { asPortalError, serverCodeOf } from '../../lib/failure'
import { feel } from '../../lib/haptics'
import { payWithSheet } from '../../lib/payment'
import { queryClient, useBoot } from '../../lib/queries'
import { useT } from '../../lib/i18n'
import { C, fonts } from '../../lib/theme'
import {
  afterConfirmError, bookErrorFallback, bookErrorKey, canTryOnlineAgain, chargesNothing, formatDateTime, payAtVenueGrantOf, quoteBody,
  retryOnlineVisit, type BookState, type PayVisit, type Quote,
} from '../../shared/portal'
import type { PortalBooking } from '../../lib/types'
import { GoldButton, Notice, Shimmer, Surface } from '../ui'
import { PriceBreakdown } from './parts'

export const freshId = () => Crypto.randomUUID()

/**
 * The Pay step, as the portal's PayStep, with Stripe's payment sheet in place of the web form. One payment intent per
 * visit (keyed on `visit.nonce`, never refetched on its own); the mode is the quote's, the key the bootstrap's; a card
 * held against a booking not yet confirmed keeps the member here (`visit.held`/`paid`, owned by the flow); every
 * confirm error is decided by the portal's `afterConfirmError()`: back a step, or stay and resend the same confirm.
 */
export function PayStep({ quote, state, visit, industry, timezone, onVisitChange, onBack, onDone }: {
  quote: Quote
  state: BookState
  visit: PayVisit
  industry: string | null | undefined
  timezone: string
  onVisitChange: (patch: Partial<PayVisit>) => void
  onBack: (to: 'when' | 'review', code: string) => void
  onDone: (booking: PortalBooking) => void
}) {
  const { tp, language } = useT()
  const boot = useBoot()
  const [sheetProblem, setSheetProblem] = useState<string | null>(null)
  const online = quote.payment.mode === 'online'
  const publishableKey = boot.data?.capabilities.payments.publishable_key ?? null
  const noKey = online && !publishableKey
  const body = quoteBody(state)

  const intent = useQuery({
    queryKey: ['book', 'payment-intent', visit.nonce],
    queryFn: () => api.paymentIntent(body, visit.idempotencyKey),
    enabled: online && !!publishableKey && !visit.paid && !visit.noCard,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    retryOnMount: false,
  })
  const intentError = intent.isError ? asPortalError(intent.error) : null
  const intentErrorCode = intent.isError ? serverCodeOf(intent.error) : null
  const nothingToCharge = visit.noCard || chargesNothing(intentErrorCode)
  const payAtVenue = !online || nothingToCharge
  const atVenueGrant = visit.atVenueGrant ?? (intentError ? payAtVenueGrantOf(intentError) : null)

  useEffect(() => {
    if (nothingToCharge && !visit.noCard) onVisitChange({ noCard: true, atVenueGrant: intentError ? payAtVenueGrantOf(intentError) : null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingToCharge])

  const confirm = useMutation({
    mutationFn: (paymentIntentId: string | null) =>
      api.confirm({
        ...body, notes: state.notes || null, payment_intent_id: paymentIntentId,
        ...(paymentIntentId === null && atVenueGrant ? { pay_at_venue_grant: atVenueGrant } : {}),
      }, visit.idempotencyKey),
    onSuccess: r => {
      feel.success()
      if (visit.paid) queryClient.removeQueries({ queryKey: ['book', 'payment-intent'] })
      void queryClient.invalidateQueries({ queryKey: ['bookings'] })
      void queryClient.invalidateQueries({ queryKey: ['boot'] })
      void queryClient.invalidateQueries({ queryKey: ['rewards'] })
      void queryClient.invalidateQueries({ queryKey: ['book', 'slots'] })
      void queryClient.invalidateQueries({ queryKey: ['book', 'calendar'] })
      onDone(r.booking)
    },
    onError: () => {
      feel.warning()
      if (visit.paid) queryClient.removeQueries({ queryKey: ['book', 'payment-intent'] })
    },
  })
  const confirmErrorCode = confirm.isError ? serverCodeOf(confirm.error) : null
  const confirmDecision = confirm.isError ? afterConfirmError(confirmErrorCode) : null

  useEffect(() => {
    if (!confirm.isError) return
    const code = confirmErrorCode
    const decision = afterConfirmError(code)
    if (decision.to && code) {
      void queryClient.invalidateQueries({ queryKey: ['book', 'slots'] })
      void queryClient.invalidateQueries({ queryKey: ['book', 'calendar'] })
      onBack(decision.to, code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm.isError, confirmErrorCode])

  const member = boot.data?.member
  const pay = async () => {
    if (!intent.data || !publishableKey) return
    setSheetProblem(null)
    onVisitChange({ held: true })
    const outcome = await payWithSheet({
      publishableKey,
      clientSecret: intent.data.client_secret,
      venueName: boot.data?.venue.name ?? '',
      member: { name: member?.name ?? '', email: member?.user.email ?? '' },
      colors: { accent: C.gold, onAccent: C.onGold, background: C.bg, surface: C.surface, border: C.hairlineStrong, text: C.text, text2: C.text2, danger: C.danger },
      payLabel: tp('portal.book.pay_online'),
    })
    if (outcome.kind === 'paid') {
      onVisitChange({ paymentIntentId: intent.data.payment_intent_id, paid: true, held: true })
      confirm.mutate(intent.data.payment_intent_id)
      return
    }
    onVisitChange({ held: false })
    if (outcome.kind === 'failed') {
      feel.warning()
      setSheetProblem(outcome.message ?? tp('portal.book.payment_failed'))
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.book.heading_pay')}</Text>
      <Surface style={{ gap: 12 }}>
        <Text style={[fonts.small, { color: C.text2 }]}>{`${formatDateTime(quote.start_at, language, timezone)}${quote.master ? ` · ${quote.master.name}` : ''}`}</Text>
        <PriceBreakdown quote={quote} industry={industry} />
      </Surface>

      {noKey && <Notice tone="warning" text={tp('portal.book.card_unavailable')} action={tp('portal.common.retry')} onAction={() => { void boot.refetch() }} />}

      {!noKey && payAtVenue && (
        <>
          {atVenueGrant ? (
            <Notice
              tone="warning"
              text={tp('portal.payment.at_venue_fallback')}
              action={canTryOnlineAgain(atVenueGrant, confirm.isPending ? 'pending' : confirm.isError ? 'error' : confirm.isSuccess ? 'success' : 'idle') ? tp('portal.payment.pay_online_again') : undefined}
              onAction={() => onVisitChange(retryOnlineVisit(freshId))}
            />
          ) : (
            <Notice tone="info" text={tp('portal.book.pay_at_venue_note')} />
          )}
          <GoldButton title={confirm.isPending ? tp('portal.book.confirming') : tp('portal.book.confirm')} icon="checkmark" busy={confirm.isPending} onPress={() => confirm.mutate(null)} />
        </>
      )}

      {!noKey && online && !payAtVenue && !visit.paid && (
        <>
          {!intent.data && !intent.isError && (
            <View style={{ gap: 8 }}>
              <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.book.card_loading')}</Text>
              <Shimmer height={54} />
            </View>
          )}
          {intent.isError && <Notice tone="warning" text={tp('portal.book.card_unavailable')} action={tp('portal.common.retry')} onAction={() => onVisitChange({ nonce: freshId() })} />}
          {intent.data && <GoldButton title={tp('portal.book.pay_online')} icon="card" busy={visit.held && !visit.paid} onPress={() => { void pay() }} />}
          {sheetProblem && <Notice text={sheetProblem} />}
        </>
      )}

      {visit.paid && confirm.isPending && <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.book.confirming')}</Text>}

      {confirm.isError && confirmDecision && !confirmDecision.to && (
        <Notice
          text={tp(bookErrorKey(confirmErrorCode), bookErrorFallback(confirmErrorCode))}
          action={tp('portal.common.retry')}
          onAction={() => confirm.mutate(visit.paymentIntentId)}
        />
      )}
    </View>
  )
}
