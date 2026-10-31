import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../../lib/api'
import { addMonths, monthGrid, rangeTap } from '../../lib/calendar'
import { asPortalError, serverCodeOf } from '../../lib/failure'
import { feel } from '../../lib/haptics'
import { payWithSheet } from '../../lib/payment'
import { queryClient, useBoot } from '../../lib/queries'
import { useT } from '../../lib/i18n'
import { C, RADIUS, fonts } from '../../lib/theme'
import {
  afterStayConfirmError, afterStayQuoteError, bookErrorFallback, bookErrorKey, canTryOnlineAgain, chosenRoomsLabel, combinationPerNight, counted,
  datesProblem, formatDay, formatMoney, nightsBetween, payAtVenueGrantOf, payView, perNightShown, resolveLocale, retryConfirmArgs,
  retryOnlineVisit, showCardUnavailable, stayBounceArgs, stayChargeable, stayChargeLine, stayHold, stayIntentAnswer, stayIntentErrorKind,
  stayPayNoticeKind, stayQuoteBody, stayRoomChoices, venueToday,
  type AvailableCombination, type AvailableRoom, type CouponRef, type PayVisit, type StayCatalogue, type StayIntentAnswer, type StayQuote,
  type StayReviewPatch, type StayRules, type StayState,
} from '../../shared/portal'
import type { PortalBooking, PortalVenue } from '../../lib/types'
import { Empty, Field, GhostButton, GoldButton, Notice, Picture, Press, Shimmer, Surface, Toggle } from '../ui'
import { Line, Stepper } from './parts'
import { Coupons } from './review'
import { freshId } from './pay'

/** How far ahead the dates picker pages: the server refuses anything it does not sell, this only bounds the browsing. */
const MONTHS_AHEAD = 18

/**
 * Arrival, departure and who is coming (the portal's DatesStep). The phone shows a month on the venue's calendar: the
 * first tap is the arrival, the next the departure; "today" is the venue's day. `datesProblem` says which rule a choice
 * breaks before anything is asked.
 */
export function StayDatesStep({ state, rules, timezone, onDates, onGuests, onSearch }: {
  state: StayState
  rules: StayRules
  timezone: string
  onDates: (checkIn: string | null, checkOut: string | null) => void
  onGuests: (adults: number, children: number) => void
  onSearch: () => void
}) {
  const { tp, language } = useT()
  const today = venueToday(timezone)
  const [month, setMonth] = useState((state.checkIn ?? today).slice(0, 7))
  const problem = datesProblem(state.checkIn, state.checkOut, rules, today)
  const nights = state.checkIn && state.checkOut ? nightsBetween(state.checkIn, state.checkOut) : 0
  const locale = resolveLocale(language)
  const weeks = monthGrid(month)
  const firstWeek = weeks[0].map((d, i) => d ?? weeks[1][i])
  const sentence = problem === null ? null
    : problem.code === 'min_nights' ? counted(tp, 'stay.min_nights', problem.count, language)
      : problem.code === 'max_nights' ? counted(tp, 'stay.max_nights', problem.count, language)
        : tp('portal.stay.pick_dates')

  return (
    <View style={{ gap: 16 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.stay.heading_dates')}</Text>
      <View style={styles.datesRow}>
        <DateBox label={tp('portal.stay.check_in')} day={state.checkIn} language={language} active={!state.checkIn || !!state.checkOut} />
        <Ionicons name="arrow-forward" size={16} color={C.text3} />
        <DateBox label={tp('portal.stay.check_out')} day={state.checkOut} language={language} active={!!state.checkIn && !state.checkOut} />
      </View>
      <Surface style={{ gap: 10 }}>
        <View style={styles.monthRow}>
          <Press onPress={() => setMonth(addMonths(month, -1))} disabled={month <= today.slice(0, 7)} label={tp('portal.common.previous')}>
            <View style={[styles.arrow, month <= today.slice(0, 7) && { opacity: 0.35 }]}><Ionicons name="chevron-back" size={18} color={C.text} /></View>
          </Press>
          <Text style={[fonts.bodyStrong, { color: C.text, flex: 1, textAlign: 'center' }]}>{formatDay(`${month}-01`, locale, { month: 'long', year: 'numeric' })}</Text>
          <Press onPress={() => setMonth(addMonths(month, 1))} disabled={month >= addMonths(today.slice(0, 7), MONTHS_AHEAD)} label={tp('portal.common.next')}>
            <View style={[styles.arrow, month >= addMonths(today.slice(0, 7), MONTHS_AHEAD) && { opacity: 0.35 }]}><Ionicons name="chevron-forward" size={18} color={C.text} /></View>
          </Press>
        </View>
        <View style={styles.week}>
          {firstWeek.map((d, i) => <Text key={i} style={[fonts.small, styles.cell, { color: C.text3, fontSize: 11 }]}>{d ? formatDay(d, locale, { weekday: 'narrow' }) : ''}</Text>)}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={styles.week}>
            {week.map((day, i) => {
              if (!day) return <View key={i} style={styles.cell} />
              const ends = day === state.checkIn || day === state.checkOut
              const between = !!state.checkIn && !!state.checkOut && day > state.checkIn && day < state.checkOut
              const past = day < today
              return (
                <Press key={i} onPress={() => { const next = rangeTap(state.checkIn, state.checkOut, day); onDates(next.checkIn, next.checkOut) }} disabled={past} label={formatDay(day, locale)} haptic={false} style={styles.cell}>
                  <View style={[styles.day, ends && { backgroundColor: C.gold }, between && { backgroundColor: C.goldWash }, past && { opacity: 0.3 }]}>
                    <Text style={[fonts.smallStrong, { color: ends ? C.onGold : C.text }]}>{Number(day.slice(8, 10))}</Text>
                  </View>
                </Press>
              )
            })}
          </View>
        ))}
      </Surface>
      <Stepper label={tp('portal.stay.adults')} value={state.adults} min={1} max={10} onChange={v => onGuests(v, state.children)} />
      <Stepper label={tp('portal.stay.children')} value={state.children} min={0} max={6} onChange={v => onGuests(state.adults, v)} />
      {problem === null
        ? <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.stay.nights_count', { count: nights })}</Text>
        : problem.code === 'pick_dates'
          ? <Text style={[fonts.small, { color: C.text2 }]}>{sentence}</Text>
          : <Notice tone="warning" text={sentence ?? ''} />}
      <GoldButton title={tp('portal.stay.see_rooms')} icon="search" disabled={problem !== null} onPress={onSearch} />
    </View>
  )
}

function DateBox({ label, day, language, active }: { label: string; day: string | null; language: string; active: boolean }) {
  return (
    <View style={[styles.dateBox, { borderColor: active ? C.gold : C.hairlineStrong }]}>
      <Text style={[fonts.label, { color: C.text2 }]}>{label}</Text>
      <Text style={[fonts.bodyStrong, { color: day ? C.text : C.text3 }]}>{day ? formatDay(day, language) : '—'}</Text>
    </View>
  )
}

/** What a stay's party and dates read like at the top of a step: the dates, and who is coming. */
function StaySummary({ checkIn, checkOut, adults, children, onChange, extra }: { checkIn: string | null; checkOut: string | null; adults: number; children: number; onChange?: () => void; extra?: ReactNode }) {
  const { tp, language } = useT()
  return (
    <Surface style={styles.summary}>
      <View style={{ flex: 1, gap: 2 }}>
        {extra}
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{`${checkIn ? formatDay(checkIn, language) : ''} – ${checkOut ? formatDay(checkOut, language) : ''}`}</Text>
        <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.stay.guests_line', { adults, children })}</Text>
      </View>
      {onChange && <GhostButton title={tp('portal.book.change')} onPress={onChange} />}
    </Surface>
  )
}

/**
 * The rooms free for the dates and party, each with the member's own total; when no single room sleeps the party, the
 * rooms that do together (the portal's RoomStep, `stayRoomChoices`).
 */
export function StayRoomStep({ state, venue, onPick, onPickRooms, onChangeDates }: { state: StayState; venue: PortalVenue; onPick: (roomId: string) => void; onPickRooms: (roomIds: string[]) => void; onChangeDates: () => void }) {
  const { tp } = useT()
  const { checkIn, checkOut, adults, children } = state
  const free = useQuery({
    queryKey: ['book', 'stay-availability', checkIn, checkOut, adults, children],
    queryFn: () => api.stayAvailability(checkIn as string, checkOut as string, adults, children),
    enabled: !!checkIn && !!checkOut,
    retryOnMount: false,
  })
  const code = free.isError ? serverCodeOf(free.error) : null
  const nights = free.data?.nights ?? 0
  const choices = free.data ? stayRoomChoices(free.data) : null
  const contact = venue.contact.phone || venue.contact.email

  return (
    <View style={{ gap: 14 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.stay.heading_room')}</Text>
      <StaySummary checkIn={checkIn} checkOut={checkOut} adults={adults} children={children} onChange={onChangeDates} />
      {free.isPending && <View style={{ gap: 10 }}><Shimmer height={120} /><Shimmer height={120} /></View>}
      {free.isError && (
        <Notice
          tone={code === 'invalid_stay' ? 'warning' : 'danger'}
          text={tp(bookErrorKey(code), bookErrorFallback(code))}
          action={code === 'invalid_stay' ? tp('portal.stay.change_dates') : tp('portal.common.retry')}
          onAction={code === 'invalid_stay' ? onChangeDates : () => { void free.refetch() }}
        />
      )}
      {choices === 'contact' && (
        <Surface tint={C.info} style={{ gap: 10 }}>
          <Text style={[fonts.small, { color: C.text }]}>{tp('portal.stay.party_too_large', { venue: venue.name })}</Text>
          {contact && <GhostButton title={contact} icon={venue.contact.phone ? 'call-outline' : 'mail-outline'} onPress={() => { void Linking.openURL(venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`) }} />}
        </Surface>
      )}
      {choices === 'none' && (
        <View style={{ gap: 10 }}>
          <Empty icon="bed-outline" text={tp('portal.stay.no_rooms')} />
          <GhostButton title={tp('portal.stay.change_dates')} onPress={onChangeDates} />
        </View>
      )}
      {free.data?.rooms.map(room => <RoomCard key={room.id} room={room} nights={nights} onPick={onPick} />)}
      {choices === 'combinations' && (
        <>
          <Notice tone="info" text={tp('portal.stay.together_intro')} />
          {free.data?.combinations?.map(combo => <CombinationCard key={combo.key} combo={combo} nights={nights} onPick={onPickRooms} />)}
        </>
      )}
    </View>
  )
}

function Prices({ list, member, currency, perNight }: { list: number; member: number; currency: string; perNight: number | null }) {
  const { tp, language } = useT()
  const discounted = member < list
  return (
    <View style={{ alignItems: 'flex-end', gap: 2 }}>
      {discounted && <Text style={[fonts.small, { color: C.text3, textDecorationLine: 'line-through' }]} accessibilityLabel={tp('portal.book.list_price')}>{formatMoney(list, currency, language)}</Text>}
      <Text style={[fonts.number, { color: C.goldLight }]} accessibilityLabel={discounted ? tp('portal.book.your_price') : undefined}>{formatMoney(member, currency, language)}</Text>
      <Text style={[fonts.small, { color: C.text3, fontSize: 11 }]}>{tp('portal.stay.total_for_stay')}</Text>
      {!!perNight && <Text style={[fonts.small, { color: C.text3, fontSize: 11 }]}>{tp('portal.stay.per_night', { price: formatMoney(perNight, currency, language) })}</Text>}
    </View>
  )
}

function RoomCard({ room, nights, onPick }: { room: AvailableRoom; nights: number; onPick: (id: string) => void }) {
  const { tp, language } = useT()
  return (
    <Surface padding={0} style={{ overflow: 'hidden' }}>
      <Picture url={room.image} style={styles.picture} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[fonts.title, { color: C.text, fontSize: 22 }]}>{room.name}</Text>
            {room.short_description ? <Text style={[fonts.small, { color: C.text2 }]}>{room.short_description}</Text> : null}
            <Text style={[fonts.small, { color: C.text3 }]}>{[counted(tp, 'stay.sleeps', room.max_guests, language), room.bed_type, room.size].filter(Boolean).join(' · ')}</Text>
          </View>
          <Prices list={room.total_price} member={room.member_total} currency={room.currency} perNight={perNightShown(room, nights)} />
        </View>
        <GoldButton title={tp('portal.stay.choose')} onPress={() => onPick(room.id)} />
      </View>
    </Surface>
  )
}

function CombinationCard({ combo, nights, onPick }: { combo: AvailableCombination; nights: number; onPick: (ids: string[]) => void }) {
  const { tp, language } = useT()
  return (
    <Surface style={{ gap: 12 }}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[fonts.title, { color: C.text, fontSize: 22 }]}>{combo.rooms.map(r => r.name).join(' + ')}</Text>
          {combo.rooms.map((r, i) => <Text key={`${r.id}-${i}`} style={[fonts.small, { color: C.text2 }]}>{`${r.name} · ${counted(tp, 'stay.sleeps', r.max_guests, language)}`}</Text>)}
        </View>
        <Prices list={combo.total_price} member={combo.member_total} currency={combo.currency} perNight={combinationPerNight(combo, nights)} />
      </View>
      <GoldButton title={tp('portal.stay.choose_together')} onPress={() => onPick(combo.rooms.map(r => r.id))} />
    </Surface>
  )
}

/** Every number comes straight from the server's quote; `stayChargeLine` decides what the charge line says. */
function StayPriceBreakdown({ quote: q, venueName, stage, paid = false, intentAnswer = null }: { quote: StayQuote; venueName: string; stage: 'review' | 'pay'; paid?: boolean; intentAnswer?: StayIntentAnswer }) {
  const { tp, language } = useT()
  const money = (amount: number) => formatMoney(amount, q.currency, language)
  const chargeLine = stayChargeLine(q.payment.mode, q.total_amount, stage === 'pay', paid, intentAnswer)
  const amount = money(q.total_amount)
  const charge = chargeLine === 'charged_now' ? tp('portal.stay.charged_now', { venue: venueName, amount })
    : chargeLine === 'charged_pending' ? tp('portal.stay.charged_pending', { venue: venueName, amount })
      : chargeLine === 'charged_next_step' ? tp('portal.stay.charged_next_step', { amount })
        : chargeLine === 'pay_at_venue' ? tp('portal.stay.pay_at_venue_total', { venue: venueName, amount })
          : tp('portal.stay.nothing_to_pay')
  return (
    <View style={{ gap: 8 }}>
      {q.rooms && q.rooms.length > 0
        ? q.rooms.map((r, i) => <Line key={`${r.id}-${i}`} label={tp('portal.stay.room_line', { room: r.name, count: q.nights })} value={money(r.room_total)} />)
        : <Line label={tp('portal.stay.room_line', { room: q.room.name, count: q.nights })} value={money(q.lines.room_total)} />}
      {q.lines.extras.map(l => <Line key={l.id} label={`${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`} value={money(l.line_total)} />)}
      <View style={styles.rule} />
      <Line label={tp('portal.book.subtotal')} value={money(q.list_amount)} />
      {q.discount && <Line label={q.discount.label} value={`−${money(q.discount.amount)}`} tone={C.success} />}
      <View style={styles.rule} />
      <Line label={tp('portal.book.total')} value={money(q.total_amount)} strong />
      <Text style={[fonts.small, { color: C.text2 }]}>{charge}</Text>
      {q.coupon?.status === 'outbid' && <Notice tone="info" text={tp('portal.book.coupon_outbid', { label: q.coupon.label })} />}
      {q.coupon?.status === 'wrong_scope' && <Notice tone="warning" text={tp('portal.book.coupon_wrong_scope', { label: q.coupon.label, noun: tp('portal.vocab.hotel.booking_plural', 'stays') })} />}
    </View>
  )
}

/**
 * Review (the portal's StayReviewStep): the room or rooms, add-ons, requests, a coupon, and the server's quote, which
 * names a hold. A quote error that belongs to an earlier step sends the member back (`afterStayQuoteError`).
 */
export function StayReviewStep({ catalogue, state, venueName, onChange, onBack, onBounce, onContinue }: {
  catalogue: StayCatalogue
  state: StayState
  venueName: string
  onChange: (patch: StayReviewPatch) => void
  onBack: () => void
  onBounce: (to: 'dates' | 'room', code: string) => void
  onContinue: (quote: StayQuote, requests: string) => void
}) {
  const { tp, language } = useT()
  const [requests, setRequests] = useState(state.requests)
  const body = useMemo(() => stayQuoteBody(state), [state])
  const quote = useQuery({ queryKey: ['book', 'stay-quote', body], queryFn: () => api.stayQuote(body), retry: false, retryOnMount: false, staleTime: 0, gcTime: 0 })
  const code = quote.isError ? serverCodeOf(quote.error) : null
  const decision = afterStayQuoteError(code)
  const otherError = quote.isError && decision === null && code !== 'extra_lead_time'
  const [couponNotice, setCouponNotice] = useState<string | null>(null)

  useEffect(() => {
    const result = afterStayQuoteError(code)
    if (!result) return
    if (result.to) { onBounce(result.to, result.noticeCode); return }
    if (result.patch && state.coupon !== null) { onChange(result.patch); setCouponNotice(result.noticeCode) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const pickCoupon = (coupon: CouponRef | null) => { setCouponNotice(null); onChange({ coupon }) }
  const roomsLabel = chosenRoomsLabel(state, catalogue.rooms)
  const policy = quote.data?.policy

  return (
    <View style={{ gap: 18 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.stay.heading_review')}</Text>
      <StaySummary
        checkIn={state.checkIn}
        checkOut={state.checkOut}
        adults={state.adults}
        children={state.children}
        onChange={onBack}
        extra={(
          <>
            <Text style={[fonts.bodyStrong, { color: C.text }]}>{quote.data?.room.name ?? roomsLabel}</Text>
            {quote.data?.rooms?.map((r, i) => <Text key={`${r.id}-${i}`} style={[fonts.small, { color: C.text2 }]}>{tp('portal.stay.room_party', { room: r.name, adults: r.adults, children: r.children })}</Text>)}
            {state.roomIds !== null && <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.stay.together_note')}</Text>}
          </>
        )}
      />
      {catalogue.extras.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.stay.extras')}</Text>
          {catalogue.extras.map(x => (
            <View key={x.id} style={styles.extra}>
              <View style={{ flex: 1 }}>
                <Text style={[fonts.bodyStrong, { color: C.text }]}>{x.name}</Text>
                <Text style={[fonts.small, { color: C.text2 }]}>{formatMoney(x.price, catalogue.rules.currency, language)}</Text>
              </View>
              <Toggle value={state.extras.includes(x.id)} label={x.name} onChange={on => onChange({ extras: on ? [...state.extras, x.id] : state.extras.filter(id => id !== x.id) })} />
            </View>
          ))}
          {code === 'extra_lead_time' && <Notice tone="warning" text={tp(bookErrorKey(code), bookErrorFallback(code))} />}
        </View>
      )}
      <Field
        label={tp('portal.stay.requests')}
        hint={tp('portal.stay.requests_hint')}
        value={requests}
        onChangeText={setRequests}
        onBlur={() => onChange({ requests })}
        multiline
        maxLength={500}
        style={{ minHeight: 88, paddingTop: 14, textAlignVertical: 'top' }}
      />
      <Coupons value={state.coupon} onChange={pickCoupon} quote={quote.data ?? null} quoteError={couponNotice ? tp(bookErrorKey(couponNotice), bookErrorFallback(couponNotice)) : null} />
      {quote.isPending && <Shimmer height={120} />}
      {otherError && <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void quote.refetch() }} />}
      {quote.data && <Surface><StayPriceBreakdown quote={quote.data} venueName={venueName} stage="review" /></Surface>}
      {policy && <Text style={[fonts.small, { color: C.text2 }]}>{`${tp('portal.stay.arrival_from', { time: policy.check_in_time })} · ${tp('portal.stay.departure_by', { time: policy.check_out_time })}`}</Text>}
      <GoldButton title={tp('portal.book.continue')} icon="arrow-forward" disabled={!quote.data} onPress={() => { if (quote.data) onContinue(quote.data, requests) }} />
    </View>
  )
}

/**
 * Pay (the portal's StayPayStep), with Stripe's payment sheet in place of the web form. One intent per visit, for the
 * hold the quote names; what the step shows is `payView()`; a confirm error is `afterStayConfirmError()`, with the paid
 * state of that very attempt; once a card is held only an answer that released it may send the member away.
 * `onStuck` tells the flow the member was asked to stop and check (a `contact` answer), so the sheet may be closed.
 */
export function StayPayStep({ quote, state, visit, venue, onVisitChange, onBack, onDone, onStuck }: {
  quote: StayQuote
  state: StayState
  visit: PayVisit
  venue: PortalVenue
  onVisitChange: (patch: Partial<PayVisit>) => void
  onBack: (to: 'dates' | 'room' | 'review', code: string, clearRoom: boolean) => void
  onDone: (booking: PortalBooking) => void
  onStuck: (stuck: boolean) => void
}) {
  const { tp, language } = useT()
  const boot = useBoot()
  const [sheetProblem, setSheetProblem] = useState<string | null>(null)
  const contact = venue.contact.phone || venue.contact.email
  const online = quote.payment.mode === 'online'
  const chargeable = stayChargeable(quote)
  const publishableKey = boot.data?.capabilities.payments.publishable_key ?? null

  const intent = useQuery({
    queryKey: ['book', 'stay-payment-intent', visit.nonce],
    queryFn: () => api.stayPaymentIntent(quote.hold_token),
    enabled: chargeable && !!publishableKey && !visit.paid && !visit.noCard,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    retryOnMount: false,
  })
  const intentErrorCode = intent.isError ? serverCodeOf(intent.error) : null
  const intentKind = intentErrorCode !== null ? stayIntentErrorKind(intentErrorCode) : null
  const nothingToCharge = visit.noCard || intentKind === 'nothing_to_charge'
  const atVenueGrant = visit.atVenueGrant ?? (intent.isError ? payAtVenueGrantOf(asPortalError(intent.error)) : null)
  const holdGone = intentKind === 'hold_gone'
  const intentAnswer = stayIntentAnswer(intentErrorCode, visit.noCard)
  const noKey = showCardUnavailable(chargeable, !!publishableKey, visit.paid, nothingToCharge)

  useEffect(() => {
    if (nothingToCharge && !visit.noCard) onVisitChange({ noCard: true, atVenueGrant: intent.isError ? payAtVenueGrantOf(asPortalError(intent.error)) : null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingToCharge])

  // The hold lapsed or its price moved before a card was asked for: back to Review for a fresh price and hold.
  useEffect(() => {
    if (holdGone) onBack('review', intentErrorCode as string, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdGone, intentErrorCode])

  const confirm = useMutation({
    mutationFn: (vars: { paymentIntentId: string | null; paid: boolean }) =>
      api.stayConfirm({
        hold_token: quote.hold_token, payment_intent_id: vars.paymentIntentId, special_requests: state.requests || null,
        ...(vars.paymentIntentId === null && atVenueGrant ? { pay_at_venue_grant: atVenueGrant } : {}),
      }),
    onSuccess: (r, vars) => {
      feel.success()
      if (vars.paid) queryClient.removeQueries({ queryKey: ['book', 'stay-payment-intent'] })
      void queryClient.invalidateQueries({ queryKey: ['bookings'] })
      void queryClient.invalidateQueries({ queryKey: ['boot'] })
      void queryClient.invalidateQueries({ queryKey: ['rewards'] })
      void queryClient.invalidateQueries({ queryKey: ['book', 'stay-availability'] })
      onDone(r.booking)
    },
    onError: (_error, vars) => {
      feel.warning()
      if (vars.paid) queryClient.removeQueries({ queryKey: ['book', 'stay-payment-intent'] })
    },
  })
  const confirmErrorCode = confirm.isError ? serverCodeOf(confirm.error) : null
  const confirmPaid = confirm.variables?.paid ?? visit.paid
  const confirmDecision = confirm.isError ? afterStayConfirmError(confirmErrorCode, confirmPaid) : null

  useEffect(() => {
    if (!confirm.isError) return
    const args = stayBounceArgs(afterStayConfirmError(confirmErrorCode, confirmPaid), confirmErrorCode as string)
    if (!args) return
    void queryClient.invalidateQueries({ queryKey: ['book', 'stay-availability'] })
    onBack(args.to, args.code, args.clearRoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm.isError, confirmErrorCode, confirmPaid])

  const hold = stayHold(confirmDecision)
  const noticeKind = stayPayNoticeKind(hold, visit.paid, confirmErrorCode)
  const view = payView({
    online,
    total: quote.total_amount,
    noCard: nothingToCharge,
    cardReady: !!intent.data,
    paid: visit.paid,
    confirm: confirm.isPending ? 'pending' : confirm.isSuccess ? 'success' : 'idle',
    hold,
  })

  useEffect(() => { onStuck(view === 'contact') }, [view])

  const member = boot.data?.member
  const pay = async () => {
    if (!intent.data || !publishableKey) return
    setSheetProblem(null)
    onVisitChange({ held: true })
    const outcome = await payWithSheet({
      publishableKey,
      clientSecret: intent.data.client_secret,
      venueName: venue.name,
      member: { name: member?.name ?? '', email: member?.user.email ?? '' },
      colors: { accent: C.gold, onAccent: C.onGold, background: C.bg, surface: C.surface, border: C.hairlineStrong, text: C.text, text2: C.text2, danger: C.danger },
      payLabel: tp('portal.book.pay_online'),
    })
    if (outcome.kind === 'paid') {
      onVisitChange({ paymentIntentId: intent.data.payment_intent_id, paid: true, held: true })
      confirm.mutate({ paymentIntentId: intent.data.payment_intent_id, paid: true })
      return
    }
    onVisitChange({ held: false })
    if (outcome.kind === 'failed') { feel.warning(); setSheetProblem(outcome.message ?? tp('portal.book.payment_failed')) }
  }
  const confirmWithoutCard = () => confirm.mutate({ paymentIntentId: null, paid: false })
  const retryConfirm = () => confirm.mutate(retryConfirmArgs(visit))
  const reachVenue = () => { void Linking.openURL(venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`) }

  return (
    <View style={{ gap: 16 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.stay.heading_pay')}</Text>
      <Surface style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text style={[fonts.bodyStrong, { color: C.text }]}>{quote.room.name}</Text>
          <Text style={[fonts.small, { color: C.text2 }]}>{`${formatDay(quote.check_in, language)} – ${formatDay(quote.check_out, language)}`}</Text>
          <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.stay.guests_line', { adults: quote.adults, children: quote.children })}</Text>
        </View>
        <StayPriceBreakdown quote={quote} venueName={venue.name} stage="pay" paid={visit.paid} intentAnswer={intentAnswer} />
      </Surface>

      {noKey && <Notice tone="warning" text={tp('portal.book.card_unavailable')} action={tp('portal.common.retry')} onAction={() => { void boot.refetch() }} />}

      {!noKey && view === 'nothing_to_pay' && <GoldButton title={tp('portal.stay.confirm')} icon="checkmark" busy={confirm.isPending} onPress={confirmWithoutCard} />}

      {!noKey && view === 'at_venue' && (
        <>
          {atVenueGrant && (
            <Notice
              tone="warning"
              text={tp('portal.payment.at_venue_fallback')}
              action={canTryOnlineAgain(atVenueGrant, confirm.isPending ? 'pending' : confirm.isError ? 'error' : confirm.isSuccess ? 'success' : 'idle') ? tp('portal.payment.pay_online_again') : undefined}
              onAction={() => onVisitChange(retryOnlineVisit(freshId))}
            />
          )}
          <GoldButton title={tp('portal.stay.confirm')} icon="checkmark" busy={confirm.isPending} onPress={confirmWithoutCard} />
        </>
      )}

      {!noKey && view === 'loading_card' && (intent.isError
        ? <Notice tone="warning" text={tp('portal.book.card_unavailable')} action={tp('portal.common.retry')} onAction={() => onVisitChange({ nonce: freshId() })} />
        : (
          <View style={{ gap: 8 }}>
            <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.book.card_loading')}</Text>
            <Shimmer height={54} />
          </View>
        ))}

      {!noKey && view === 'card' && intent.data && (
        <>
          <GoldButton title={tp('portal.book.pay_online')} icon="card" busy={visit.held && !visit.paid} onPress={() => { void pay() }} />
          {sheetProblem && <Notice text={sheetProblem} />}
        </>
      )}

      {view === 'confirming' && <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.book.confirming')}</Text>}

      {view === 'contact' && (
        <Surface tint={C.danger} style={{ gap: 10 }}>
          <Text style={[fonts.small, { color: C.text }]}>
            {noticeKind === 'contact_unpaid' ? tp('portal.stay.confirm_contact_unpaid', { venue: venue.name }) : tp('portal.stay.confirm_contact', { venue: venue.name })}
          </Text>
          <GhostButton title={tp('portal.bookings.title')} icon="calendar-outline" onPress={() => router.push('/bookings')} />
          {contact && <GhostButton title={contact} icon={venue.contact.phone ? 'call-outline' : 'mail-outline'} onPress={reachVenue} />}
        </Surface>
      )}

      {view === 'confirm_button' && (
        <>
          {hold === 'retry' && (
            <Notice
              tone="warning"
              text={noticeKind === 'retry_payment_check_failed'
                ? tp(bookErrorKey(confirmErrorCode), bookErrorFallback(confirmErrorCode))
                : noticeKind === 'retry_unpaid' ? tp('portal.stay.confirm_retry_unpaid') : tp('portal.stay.confirm_retry')}
            />
          )}
          <GoldButton title={tp('portal.book.confirm')} icon="checkmark" busy={confirm.isPending} onPress={retryConfirm} />
        </>
      )}

      {confirmDecision && confirmDecision.to === null && (
        <Notice text={tp(bookErrorKey(confirmErrorCode), bookErrorFallback(confirmErrorCode))} action={tp('portal.common.retry')} onAction={retryConfirm} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  datesRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBox: { flex: 1, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, textAlign: 'center', alignItems: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  picture: { width: '100%', height: 150 },
  rule: { height: 1, backgroundColor: C.hairline },
})
