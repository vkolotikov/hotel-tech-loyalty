import { useEffect, useReducer, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useBoot } from '../../lib/queries'
import { useT } from '../../lib/i18n'
import { BOOK_STEPS, afterConfirmError, bookInitialState, bookReducer, canLeavePay, newPayVisit, type BookStep } from '../../shared/portal'
import type { PortalBooking } from '../../lib/types'
import { Empty, Notice, Shimmer } from '../../components/ui'
import { Sheet } from '../../components/Sheet'
import { StepStrip } from '../../components/book/parts'
import { BookNotice, ServiceStep, StaffStep, WhenStep } from '../../components/book/steps'
import { ReviewStep } from '../../components/book/review'
import { PayStep, freshId } from '../../components/book/pay'

/**
 * Booking an appointment, as the portal's Book flow: service, who, when, review, pay. Every transition is the portal's
 * `bookReducer`; prices, holds and payments are the server's. While a card is held against a booking not yet confirmed,
 * the member cannot leave (the strip is locked and the sheet cannot be closed).
 */
export default function BookAppointment() {
  const { tp } = useT()
  const boot = useBoot()
  const [state, dispatch] = useReducer(bookReducer, bookInitialState)
  const services = boot.data?.capabilities.services === true
  const catalogue = useQuery({ queryKey: ['book', 'catalogue'], queryFn: api.catalogue, enabled: services, retryOnMount: false })
  const locked = !canLeavePay(state.visit)
  // The confirmed booking opens once the flow has let go of the visit: the sheet refuses to close while a card is held.
  const [booked, setBooked] = useState<PortalBooking | null>(null)
  useEffect(() => {
    if (booked && !locked) router.replace({ pathname: '/booking/[kind]/[id]', params: { kind: booked.kind, id: String(booked.id), confirmed: '1' } })
  }, [booked, locked])
  const venue = boot.data?.venue
  const labels: Record<BookStep, string> = {
    service: tp('portal.book.step_service'),
    staff: tp('portal.book.step_staff'),
    when: tp('portal.book.step_when'),
    review: tp('portal.book.step_review'),
    pay: tp('portal.book.step_pay'),
  }
  const hasNotice = state.notice !== null && state.notice.step === state.step
  const cat = catalogue.data

  return (
    <Sheet title={tp('portal.book.title')} busy={locked}>
      {boot.data && !services && <Empty icon="calendar-clear-outline" text={tp('portal.book.not_bookable')} />}
      {services && catalogue.isError && <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void catalogue.refetch() }} />}
      {services && !cat && !catalogue.isError && <View style={{ gap: 10 }}><Shimmer height={30} /><Shimmer height={90} /><Shimmer height={90} /></View>}
      {cat && venue && (
        <>
          <StepStrip steps={BOOK_STEPS} current={state.step} labels={labels} locked={locked} onJump={step => dispatch({ type: 'jump', step })} />
          {hasNotice && <BookNotice code={state.notice!.code} />}
          {state.step === 'service' && <ServiceStep catalogue={cat} onPick={serviceId => dispatch({ type: 'pickService', serviceId, catalogue: cat })} />}
          {state.step === 'staff' && <StaffStep catalogue={cat} serviceId={state.serviceId} value={state.masterId} onPick={masterId => dispatch({ type: 'pickStaff', masterId })} />}
          {state.step === 'when' && state.serviceId !== null && (
            <WhenStep serviceId={state.serviceId} masterId={state.masterId} rules={cat.rules} value={state.startAt} onPick={startAt => dispatch({ type: 'pickStart', startAt })} timezone={venue.timezone} />
          )}
          {state.step === 'review' && (
            <ReviewStep
              catalogue={cat}
              state={state}
              industry={venue.industry}
              timezone={venue.timezone}
              onChange={patch => dispatch({ type: 'patchReview', patch })}
              onBack={() => dispatch({ type: 'jump', step: 'when' })}
              onContinue={(quote, notes) => dispatch({ type: 'continueToPay', quote, notes, visit: newPayVisit(freshId) })}
            />
          )}
          {state.step === 'pay' && state.quote && state.visit && (
            <PayStep
              quote={state.quote}
              state={state}
              visit={state.visit}
              industry={venue.industry}
              timezone={venue.timezone}
              onVisitChange={patch => dispatch({ type: 'visit', patch })}
              onBack={(to, code) => dispatch({ type: 'bounce', to, code, clearStart: afterConfirmError(code).clearStart })}
              onDone={b => { dispatch({ type: 'reset' }); setBooked(b) }}
            />
          )}
        </>
      )}
    </Sheet>
  )
}
