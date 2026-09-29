import { useEffect, useReducer, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CalendarX } from 'lucide-react'
import { usePortal } from '../../PortalProvider'
import { portalApi } from '../../lib/portalApi'
import { PageSkeleton } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { StepStrip } from '../book/StepStrip'
import { BookNotice } from '../book/BookNotice'
import { canLeavePay, newPayVisit } from '../book/steps'
import { DatesStep } from './DatesStep'
import { RoomStep } from './RoomStep'
import { StayReviewStep } from './StayReviewStep'
import { StayPayStep } from './StayPayStep'
import { STAY_STEPS, initialStayState, stayCatalogueGuard, stayFocusTarget, stayReducer, type StayStep } from './staySteps'

const randomId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`)

/**
 * The four-step stay flow: dates, room, review, pay. All of its state is in memory: a stay's price is held
 * for minutes, so a refresh starts again rather than resume a quote that has lapsed.
 */
export function StayBook() {
  const { t } = useTranslation()
  const { data } = usePortal()
  const navigate = useNavigate()
  // Every transition goes through `stayReducer` (staySteps.ts), never `{ ...state, … }` from this render's closure.
  const [state, dispatch] = useReducer(stayReducer, initialStayState)
  const catalogue = useQuery({ queryKey: ['portal-stay-catalogue'], queryFn: portalApi.stayCatalogue, enabled: data?.capabilities.stays === true, retryOnMount: false })

  // After a step change, keyboard focus moves to the new step's heading — or to the notice a bounce carried.
  // Keyed on the step actually shown: the first mount (and StrictMode's repeat of it) moves nothing.
  const rootRef = useRef<HTMLDivElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  const focusedStep = useRef(state.step)
  const hasNotice = state.notice !== null && state.notice.step === state.step
  useEffect(() => {
    if (focusedStep.current === state.step) return
    focusedStep.current = state.step
    const target = stayFocusTarget(state.step, hasNotice)
    const el = target.kind === 'notice' ? noticeRef.current : rootRef.current?.querySelector<HTMLElement>(`[data-step-heading="${target.step}"]`)
    el?.focus()
  }, [state.step, hasNotice])

  if (!data) return <PageSkeleton />
  if (!data.capabilities.stays) return <EmptyState icon={<CalendarX size={22} aria-hidden />} title={t('portal.book.not_bookable', 'Online booking is not available for this venue yet.')} />
  // The decision is `stayCatalogueGuard()`, a pure function with its own test — it is
  // what keeps a failed BACKGROUND refetch from replacing the whole tree while the member is mid-payment on
  // Pay: `'ready'` wins the moment there is data to show, stale or not.
  const guard = stayCatalogueGuard(!!catalogue.data, catalogue.isError)
  if (guard === 'error') {
    return (
      <div className="space-y-3">
        <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>
        <Button variant="secondary" size="sm" onClick={() => { void catalogue.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
      </div>
    )
  }
  if (guard === 'loading') return <PageSkeleton />
  const cat = catalogue.data!

  const labels: Record<StayStep, string> = {
    dates: t('portal.stay.step_dates', 'Dates'),
    room: t('portal.stay.step_room', 'Room'),
    review: t('portal.stay.step_review', 'Review'),
    pay: t('portal.stay.step_pay', 'Pay'),
  }

  return (
    <div className="space-y-5" ref={rootRef}>
      <h1 className="font-p-display text-2xl">{t('portal.stay.title', 'Book a stay')}</h1>
      <StepStrip steps={STAY_STEPS} current={state.step} labels={labels} ariaLabel={t('portal.stay.title', 'Book a stay')} locked={!canLeavePay(state.visit)} onJump={step => dispatch({ type: 'jump', step })} />
      {hasNotice && <BookNotice code={state.notice!.code} ref={noticeRef} />}
      {state.step === 'dates' && (
        <>
          {cat.pricing.automatic && <Chip tone="accent">{t('portal.book.member_price_note', '{{label}} applied', { label: cat.pricing.automatic.label })}</Chip>}
          <DatesStep
            state={state}
            rules={cat.rules}
            timezone={data.venue.timezone}
            onDates={(checkIn, checkOut) => dispatch({ type: 'setDates', checkIn, checkOut })}
            onGuests={(adults, children) => dispatch({ type: 'setGuests', adults, children })}
            onSearch={() => dispatch({ type: 'search' })}
          />
        </>
      )}
      {state.step === 'room' && (
        <RoomStep state={state} onPick={roomId => dispatch({ type: 'pickRoom', roomId })} onChangeDates={() => dispatch({ type: 'jump', step: 'dates' })} />
      )}
      {state.step === 'review' && state.roomId !== null && (
        <StayReviewStep
          catalogue={cat}
          state={state}
          onChange={patch => dispatch({ type: 'patchReview', patch })}
          onBack={() => dispatch({ type: 'jump', step: 'room' })}
          onBounce={(to, code) => dispatch({ type: 'bounce', to, code, clearRoom: true })}
          onContinue={(quote, requests) => dispatch({ type: 'continueToPay', quote, requests, visit: newPayVisit(randomId) })}
        />
      )}
      {state.step === 'pay' && state.quote && state.visit && (
        <StayPayStep
          quote={state.quote}
          state={state}
          visit={state.visit}
          onVisitChange={patch => dispatch({ type: 'visit', patch })}
          onBack={(to, code, clearRoom) => dispatch({ type: 'bounce', to, code, clearRoom })}
          onDone={b => { dispatch({ type: 'reset' }); navigate(`/portal/bookings/${b.kind}/${b.id}?confirmed=1`) }}
        />
      )}
    </div>
  )
}
