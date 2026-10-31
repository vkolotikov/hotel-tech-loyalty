import { useState, type ReactNode } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { failureOf, serverCodeOf } from '../../../lib/failure'
import { feel } from '../../../lib/haptics'
import { queryClient, useBoot } from '../../../lib/queries'
import { useT } from '../../../lib/i18n'
import { C, RADIUS, fonts } from '../../../lib/theme'
import {
  afterCancelError, bookingPaymentLabel, cancelErrorFallback, cancelErrorKey, cancelOffer, counted, formatDay, formatDateTime,
  formatMoney, moneyPromise, nightsAndGuests, statusLabel, statusTone,
} from '../../../shared/portal'
import type { BookingKind, CancelReply, PortalBooking, PortalVenue } from '../../../lib/types'
import { bookingWhen, toneColor } from '../../../components/Bookings'
import { GhostButton, Notice, Pill, Shimmer, Surface } from '../../../components/ui'
import { Sheet } from '../../../components/Sheet'

type Stage = 'idle' | 'asking' | 'done'

/**
 * One booking, as the portal's sheet: what, when, the money, the policy, and cancelling. Whether cancelling is offered,
 * what the member is promised about their money and what was done are the server's (`can_cancel`, `cancel_deadline`,
 * `paid_online`, the cancel reply), read through the portal's own `cancelOffer`/`moneyPromise`/`afterCancelError`.
 */
export default function BookingScreen() {
  const params = useLocalSearchParams<{ kind: string; id: string; confirmed?: string }>()
  const kind: BookingKind = params.kind === 'stay' ? 'stay' : 'service'
  const id = Number(params.id)
  const { tp, language } = useT()
  const boot = useBoot()
  const venue = boot.data?.venue
  const booking = useQuery({ queryKey: ['booking', kind, id], queryFn: () => api.booking(kind, id), retry: false })
  const [stage, setStage] = useState<Stage>('idle')
  const [result, setResult] = useState<CancelReply['refund'] | null>(null)

  const cancel = useMutation({
    mutationFn: () => api.cancelBooking(kind, id),
    onSuccess: reply => {
      feel.success()
      setResult(reply.refund)
      setStage('done')
      queryClient.setQueryData(['booking', kind, id], reply.booking)
      void queryClient.invalidateQueries({ queryKey: ['bookings'] })
      void queryClient.invalidateQueries({ queryKey: ['boot'] })
      void queryClient.invalidateQueries({ queryKey: ['rewards'] })
    },
    onError: error => {
      feel.warning()
      const failure = failureOf(error)
      // A failed cancel can carry the booking's true state (a refund may already have gone through): it is truer than
      // what the screen holds. With none, `cancel_failed` still cannot trust the cache, so the booking is read again.
      const truth = failure.extra.booking as PortalBooking | undefined
      if (truth) queryClient.setQueryData(['booking', kind, id], truth)
      else if (failure.serverCode === 'cancel_failed') void queryClient.invalidateQueries({ queryKey: ['booking', kind, id] })
      void queryClient.invalidateQueries({ queryKey: ['bookings'] })
      const decision = afterCancelError(failure.serverCode ?? null)
      if (decision.refetch) void queryClient.invalidateQueries({ queryKey: ['booking', kind, id] })
      if (decision.closes) setStage('idle')
    },
  })

  const b = booking.data
  const cancelError = cancel.isError ? serverCodeOf(cancel.error) ?? 'unknown' : null
  return (
    <Sheet title={b?.title ?? tp('portal.bookings.title')} busy={cancel.isPending}>
      {booking.isLoading && <View style={{ gap: 10 }}><Shimmer height={28} /><Shimmer height={180} /></View>}
      {booking.isError && <Notice text={tp('portal.bookings.not_found')} />}
      {b && venue && (
        <>
          {params.confirmed === '1' && (
            <Surface tint={C.success} style={{ gap: 4 }}>
              <Text style={[fonts.bodyStrong, { color: C.text }]}>{tp('portal.book.confirmed_title')}</Text>
              <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.book.confirmed_body', { reference: b.reference })}</Text>
            </Surface>
          )}
          <View style={styles.head}>
            <Pill text={tp(`portal.bookings.status.${b.status}`, statusLabel(b.status))} color={toneColor(statusTone(b.status))} />
            <Text style={[fonts.small, { color: C.text2, fontVariant: ['tabular-nums'] }]}>{b.reference}</Text>
          </View>
          <Surface padding={0} style={{ paddingHorizontal: 16 }}>
            <Line label={tp('portal.bookings.when')}>
              {bookingWhen(b, language, venue.timezone)}
              {b.kind === 'stay' && b.ends_at ? ` – ${formatDay(b.ends_at, language)}` : ''}
            </Line>
            {b.kind === 'service' && b.subtitle ? <Line label={tp('portal.bookings.with')}>{b.subtitle}</Line> : null}
            {b.kind === 'stay' && b.nights != null && b.guests != null ? <Line label={tp('portal.bookings.guests')}>{nightsAndGuests(tp, b.nights, b.guests)}</Line> : null}
            {b.kind === 'service' && b.party_size != null && b.party_size > 1 ? <Line label={tp('portal.bookings.guests')}>{counted(tp, 'bookings.party', b.party_size, language)}</Line> : null}
            {b.discount ? <Line label={tp('portal.bookings.discount')}>{`−${formatMoney(b.discount.amount, b.currency, language)} · ${b.discount.label}`}</Line> : null}
            <Line label={tp('portal.bookings.total')} strong>{formatMoney(b.total, b.currency, language)}</Line>
            {bookingPaymentLabel(b, tp) ? <Line label={tp('portal.bookings.payment')}>{bookingPaymentLabel(b, tp)}</Line> : null}
            {b.notes ? <Line label={tp('portal.bookings.notes')} last>{b.notes}</Line> : null}
          </Surface>
          {b.kind === 'service' && boot.data?.policies.services_cancellation_policy ? (
            <View style={{ gap: 4 }}>
              <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.bookings.policy')}</Text>
              <Text style={[fonts.small, { color: C.text2 }]}>{boot.data.policies.services_cancellation_policy}</Text>
            </View>
          ) : null}
          <CancelPanel
            booking={b}
            venue={venue}
            offer={cancelOffer(b, new Date())}
            stage={cancel.isPending ? 'cancelling' : stage}
            error={stage === 'asking' ? cancelError : null}
            result={result}
            onAsk={() => { cancel.reset(); setStage('asking') }}
            onKeep={() => { cancel.reset(); setStage('idle') }}
            onConfirm={() => cancel.mutate()}
          />
        </>
      )}
    </Sheet>
  )
}

function Line({ label, children, strong, last }: { label: string; children: ReactNode; strong?: boolean; last?: boolean }) {
  return (
    <View style={[styles.line, !last && { borderBottomWidth: 1, borderBottomColor: C.hairline }]}>
      <Text style={[fonts.small, { color: C.text2 }]}>{label}</Text>
      <Text style={[strong ? fonts.bodyStrong : fonts.body, { color: C.text, flex: 1, textAlign: 'right' }]}>{children}</Text>
    </View>
  )
}

/**
 * The foot of the booking: cancel, the question before it (with what happens to the money), and what was done after,
 * as the portal's CancelPanel says each.
 */
function CancelPanel({ booking: b, venue, offer, stage, error, result, onAsk, onKeep, onConfirm }: {
  booking: PortalBooking
  venue: PortalVenue
  offer: 'offer' | 'ended' | 'contact' | 'none'
  stage: Stage | 'cancelling'
  error: string | null
  result: CancelReply['refund'] | null
  onAsk: () => void
  onKeep: () => void
  onConfirm: () => void
}) {
  const { tp, language } = useT()
  const money = (amount: number, currency: string) => formatMoney(amount, currency, language)
  const deadline = b.kind === 'service' && b.cancel_deadline ? formatDateTime(b.cancel_deadline, language, venue.timezone) : null
  const contact = venue.contact.phone || venue.contact.email
  const reachVenue = () => { void Linking.openURL(venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`) }

  if (stage === 'done' && result) {
    const venueMoney = result.outcome === 'none' && moneyPromise(b) === 'venue'
    return (
      <Surface tint={C.success} style={{ gap: 6 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{tp('portal.bookings.cancelled_done')}</Text>
        {result.outcome === 'refunded' && <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.bookings.cancelled_refunded', { amount: money(result.amount, result.currency) })}</Text>}
        {result.outcome === 'released' && <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.bookings.cancelled_released')}</Text>}
        {venueMoney && <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.bookings.cancel_money_venue', { venue: venue.name })}</Text>}
        {result.coupon_released && <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.bookings.cancelled_coupon')}</Text>}
        {result.points_reversed > 0 && <Text style={[fonts.small, { color: C.text2 }]}>{counted(tp, 'bookings.cancelled_points', result.points_reversed, language)}</Text>}
      </Surface>
    )
  }

  if (offer === 'none') return null

  if (offer === 'ended' || offer === 'contact') {
    return (
      <Surface tint={C.info} style={{ gap: 8 }}>
        {offer === 'ended' && deadline && <Text style={[fonts.small, { color: C.text2 }]}>{`${tp('portal.bookings.cancel_ended')} ${deadline}`}</Text>}
        <Text style={[fonts.small, { color: C.text }]}>{tp('portal.bookings.contact_to_change', { venue: venue.name })}</Text>
        {contact && <GhostButton title={contact} icon={venue.contact.phone ? 'call-outline' : 'mail-outline'} onPress={reachVenue} />}
      </Surface>
    )
  }

  if (stage === 'idle') {
    return (
      <View style={{ gap: 8 }}>
        {deadline && <Text style={[fonts.small, { color: C.text2 }]}>{`${tp('portal.bookings.cancel_until')} ${deadline}`}</Text>}
        <GhostButton title={tp('portal.bookings.cancel')} icon="close-circle-outline" tone={C.danger} onPress={onAsk} />
      </View>
    )
  }

  const promise = moneyPromise(b)
  const busy = stage === 'cancelling'
  return (
    <Surface style={{ gap: 12, borderColor: C.dangerWash }}>
      <Text style={[fonts.bodyStrong, { color: C.text }]}>{tp('portal.bookings.cancel_title')}</Text>
      {b.rooms && b.rooms.length > 1 && (
        <View style={{ gap: 6 }}>
          <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.bookings.cancel_rooms')}</Text>
          <View style={[styles.rooms, { borderColor: C.hairline }]}>
            {b.rooms.map((room, i) => (
              <View key={room.id} style={[styles.line, i < (b.rooms?.length ?? 0) - 1 && { borderBottomWidth: 1, borderBottomColor: C.hairline }]}>
                <Text style={[fonts.small, { color: C.text, flex: 1 }]}>
                  {room.title}{room.guests ? ` · ${counted(tp, 'bookings.guest_count', room.guests, language)}` : ''}
                </Text>
                <Text style={[fonts.small, { color: C.text2 }]}>{money(room.total, b.currency)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <Text style={[fonts.small, { color: C.text2 }]}>
        {promise === 'refund' ? tp('portal.bookings.cancel_refund', { amount: money(b.total, b.currency) })
          : promise === 'release' ? tp('portal.bookings.cancel_release')
            : promise === 'deposit' && b.deposit ? tp('portal.bookings.cancel_deposit', { amount: money(b.deposit.amount, b.currency) })
              : promise === 'venue' ? tp('portal.bookings.cancel_money_venue', { venue: venue.name })
                : tp('portal.bookings.cancel_nothing')}
      </Text>
      {error && (
        <Notice text={b.kind === 'stay' && error === 'outside_policy'
          ? tp('portal.bookings.contact_to_change', { venue: venue.name })
          : tp(cancelErrorKey(error), cancelErrorFallback(error))} />
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <GhostButton title={tp('portal.bookings.cancel_keep')} disabled={busy} onPress={onKeep} style={{ flex: 1 }} />
        <GhostButton title={busy ? tp('portal.bookings.cancelling') : tp('portal.bookings.cancel_confirm')} tone={C.danger} busy={busy} onPress={onConfirm} style={{ flex: 1 }} />
      </View>
    </Surface>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 12 },
  rooms: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 12 },
})
