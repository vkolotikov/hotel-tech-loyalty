import { useEffect, useReducer, useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useBoot } from '../../lib/queries'
import { useT } from '../../lib/i18n'
import { C, fonts } from '../../lib/theme'
import { STAY_STEPS, canLeavePay, hasRoomChoice, initialStayState, newPayVisit, stayCatalogueGuard, stayReducer, type StayStep } from '../../shared/portal'
import type { PortalBooking } from '../../lib/types'
import { Empty, Notice, Shimmer } from '../../components/ui'
import { Sheet } from '../../components/Sheet'
import { StepStrip } from '../../components/book/parts'
import { BookNotice } from '../../components/book/steps'
import { freshId } from '../../components/book/pay'
import { StayDatesStep, StayPayStep, StayReviewStep, StayRoomStep } from '../../components/book/stay'

/**
 * Booking a stay, as the portal's stay flow: dates, room, review, pay. Every transition is the portal's `stayReducer`;
 * the quote names a hold the server prices and keeps for minutes, so all of this lives in memory. While a card is held
 * against a stay not yet confirmed the member cannot leave, unless the server's answer asked them to stop and check.
 */
export default function BookStay() {
  const { tp } = useT()
  const boot = useBoot()
  const [state, dispatch] = useReducer(stayReducer, initialStayState)
  const stays = boot.data?.capabilities.stays === true
  const catalogue = useQuery({ queryKey: ['book', 'stay-catalogue'], queryFn: api.stayCatalogue, enabled: stays, retryOnMount: false })
  const [stuck, setStuck] = useState(false)
  const locked = !canLeavePay(state.visit)
  // The confirmed stay opens once the flow has let go of the visit: the sheet refuses to close while a card is held.
  const [booked, setBooked] = useState<PortalBooking | null>(null)
  useEffect(() => {
    if (booked && !locked) router.replace({ pathname: '/booking/[kind]/[id]', params: { kind: booked.kind, id: String(booked.id), confirmed: '1' } })
  }, [booked, locked])

  const venue = boot.data?.venue
  const labels: Record<StayStep, string> = {
    dates: tp('portal.stay.step_dates'),
    room: tp('portal.stay.step_room'),
    review: tp('portal.stay.step_review'),
    pay: tp('portal.stay.step_pay'),
  }
  const hasNotice = state.notice !== null && state.notice.step === state.step
  const guard = stayCatalogueGuard(!!catalogue.data, catalogue.isError)
  const cat = catalogue.data

  return (
    <Sheet title={tp('portal.stay.title')} busy={locked && !stuck}>
      {boot.data && !stays && <Empty icon="calendar-clear-outline" text={tp('portal.book.not_bookable')} />}
      {stays && guard === 'error' && <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void catalogue.refetch() }} />}
      {stays && guard === 'loading' && <View style={{ gap: 10 }}><Shimmer height={30} /><Shimmer height={260} /></View>}
      {guard === 'ready' && cat && venue && (
        <>
          <StepStrip steps={STAY_STEPS} current={state.step} labels={labels} locked={locked} onJump={step => dispatch({ type: 'jump', step })} />
          {hasNotice && <BookNotice code={state.notice!.code} />}
          {state.step === 'dates' && (
            <>
              {cat.pricing.automatic && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="ribbon-outline" size={16} color={C.gold} />
                  <Text style={[fonts.smallStrong, { color: C.goldLight, flex: 1 }]}>{tp('portal.book.member_price_note', { label: cat.pricing.automatic.label })}</Text>
                </View>
              )}
              <StayDatesStep
                state={state}
                rules={cat.rules}
                timezone={venue.timezone}
                onDates={(checkIn, checkOut) => dispatch({ type: 'setDates', checkIn, checkOut })}
                onGuests={(adults, children) => dispatch({ type: 'setGuests', adults, children })}
                onSearch={() => dispatch({ type: 'search' })}
              />
            </>
          )}
          {state.step === 'room' && (
            <StayRoomStep
              state={state}
              venue={venue}
              onPick={roomId => dispatch({ type: 'pickRoom', roomId })}
              onPickRooms={roomIds => dispatch({ type: 'pickRooms', roomIds })}
              onChangeDates={() => dispatch({ type: 'jump', step: 'dates' })}
            />
          )}
          {state.step === 'review' && hasRoomChoice(state) && (
            <StayReviewStep
              catalogue={cat}
              state={state}
              venueName={venue.name}
              onChange={patch => dispatch({ type: 'patchReview', patch })}
              onBack={() => dispatch({ type: 'jump', step: 'room' })}
              onBounce={(to, code) => dispatch({ type: 'bounce', to, code, clearRoom: true })}
              onContinue={(quote, requests) => dispatch({ type: 'continueToPay', quote, requests, visit: newPayVisit(freshId) })}
            />
          )}
          {state.step === 'pay' && state.quote && state.visit && (
            <StayPayStep
              quote={state.quote}
              state={state}
              visit={state.visit}
              venue={venue}
              onVisitChange={patch => dispatch({ type: 'visit', patch })}
              onBack={(to, code, clearRoom) => { setStuck(false); dispatch({ type: 'bounce', to, code, clearRoom }) }}
              onDone={b => { setStuck(false); dispatch({ type: 'reset' }); setBooked(b) }}
              onStuck={setStuck}
            />
          )}
        </>
      )}
    </Sheet>
  )
}
