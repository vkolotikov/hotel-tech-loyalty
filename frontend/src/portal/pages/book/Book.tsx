import { useEffect, useReducer, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarX } from 'lucide-react'
import { usePortal } from '../../PortalProvider'
import { portalApi } from '../../lib/portalApi'
import { PageSkeleton } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { Button } from '../../ui/Button'
import { ServiceStep } from './ServiceStep'
import { StaffStep } from './StaffStep'
import { WhenStep } from './WhenStep'
import { ReviewStep } from './ReviewStep'
import { PayStep } from './PayStep'
import { StepStrip } from './StepStrip'
import { BookNotice } from './BookNotice'
import { STEPS, afterConfirmError, bookReducer, canLeavePay, focusTargetFor, initialState, newPayVisit, type Step } from './steps'

const randomId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`)

/**
 * The five-step booking flow: service, who, when, review, pay. `service`,
 * `master` and `date` mirror onto the query string so a member can share or
 * refresh mid-flow without losing their place; the rest of the state
 * (start time, extras, coupon, notes) is in-memory only, cleared on refresh
 * like the rest of the SPA.
 */
export function Book() {
  const { t } = useTranslation()
  const { data } = usePortal()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // Every transition goes through `bookReducer` (steps.ts), never `{ ...state, … }` from this render's
  // closure: two handlers fired by one click each apply to the latest state (final review, Important 1).
  // `state.visit` is the current attempt to pay for `state.quote` — created fresh by every Continue on Review,
  // dropped once confirmed or once a confirm() error released the hold; while a card is held,
  // `canLeavePay()` locks the strip (finding I1) — see `StepStrip`'s `locked` prop below.
  const [state, dispatch] = useReducer(bookReducer, params, p => ({
    ...initialState,
    serviceId: p.get('service') ? Number(p.get('service')) : null,
    masterId: p.get('master') ? Number(p.get('master')) : null,
    step: p.get('service') ? 'when' as const : 'service' as const,
  }))
  // `retryOnMount: false`: once this has failed, leave it failed until the
  // member presses "Try again" — otherwise every remount (stepping back and
  // forward through the flow) launches a silent, unrequested refetch.
  const catalogue = useQuery({ queryKey: ['portal-catalogue'], queryFn: portalApi.catalogue, enabled: data?.capabilities.services === true, retryOnMount: false })

  // After a step change, keyboard focus moves to the new step's heading — or to the notice a bounce carried,
  // so its sentence is read first (`focusTargetFor`, final review Minor 11). Keyed on the step actually shown:
  // the first mount (and StrictMode's repeat of it) moves nothing.
  const rootRef = useRef<HTMLDivElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  const focusedStep = useRef(state.step)
  const hasNotice = state.notice !== null && state.notice.step === state.step
  useEffect(() => {
    if (focusedStep.current === state.step) return
    focusedStep.current = state.step
    const target = focusTargetFor(state.step, hasNotice)
    const el = target.kind === 'notice' ? noticeRef.current : rootRef.current?.querySelector<HTMLElement>(`[data-step-heading="${target.step}"]`)
    el?.focus()
  }, [state.step, hasNotice])

  if (!data) return <PageSkeleton />
  if (!data.capabilities.services) return <EmptyState icon={<CalendarX size={22} aria-hidden />} title={t('portal.book.not_bookable', 'Online booking is not available for this venue yet.')} />
  if (catalogue.isError) {
    return (
      <div className="space-y-3">
        <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>
        <Button variant="secondary" size="sm" onClick={() => { void catalogue.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
      </div>
    )
  }
  if (!catalogue.data) return <PageSkeleton />
  const cat = catalogue.data

  // `service` and `master` mirror onto the query string (a picked service always resets the master).
  const syncParams = (serviceId: number | undefined, masterId: number | null) => {
    if (serviceId !== undefined) params.set('service', String(serviceId))
    if (masterId === null) params.delete('master')
    else params.set('master', String(masterId))
    setParams(params, { replace: true })
  }
  const pickService = (serviceId: number) => { dispatch({ type: 'pickService', serviceId, catalogue: cat }); syncParams(serviceId, null) }
  const pickStaff = (masterId: number | null) => { dispatch({ type: 'pickStaff', masterId }); syncParams(undefined, masterId) }
  const labels: Record<Step, string> = {
    service: t('portal.book.step_service', 'Service'),
    staff: t('portal.book.step_staff', 'Who'),
    when: t('portal.book.step_when', 'When'),
    review: t('portal.book.step_review', 'Review'),
    pay: t('portal.book.step_pay', 'Pay'),
  }
  const locked = !canLeavePay(state.visit)

  return (
    <div className="space-y-5" ref={rootRef}>
      <h1 className="font-p-display text-2xl">{t('portal.book.title', 'Book')}</h1>
      <StepStrip steps={STEPS} current={state.step} labels={labels} ariaLabel={t('portal.book.title', 'Book')} locked={locked} onJump={step => dispatch({ type: 'jump', step })} />
      {hasNotice && <BookNotice code={state.notice!.code} ref={noticeRef} />}
      {state.step === 'service' && <ServiceStep catalogue={cat} onPick={pickService} />}
      {state.step === 'staff' && <StaffStep catalogue={cat} serviceId={state.serviceId} value={state.masterId} onPick={pickStaff} />}
      {state.step === 'when' && state.serviceId !== null && (
        <WhenStep serviceId={state.serviceId} masterId={state.masterId} rules={cat.rules} value={state.startAt} onPick={startAt => dispatch({ type: 'pickStart', startAt })} timezone={data.venue.timezone} />
      )}
      {state.step === 'review' && (
        <ReviewStep
          catalogue={cat}
          state={state}
          onChange={patch => dispatch({ type: 'patchReview', patch })}
          onBack={() => dispatch({ type: 'jump', step: 'when' })}
          onContinue={(quote, notes) => dispatch({ type: 'continueToPay', quote, notes, visit: newPayVisit(randomId) })}
        />
      )}
      {state.step === 'pay' && state.quote && state.visit && (
        <PayStep
          quote={state.quote}
          state={state}
          visit={state.visit}
          onVisitChange={patch => dispatch({ type: 'visit', patch })}
          onBack={(to, code) => dispatch({ type: 'bounce', to, code, clearStart: afterConfirmError(code).clearStart })}
          onDone={b => { dispatch({ type: 'reset' }); navigate(`/portal/bookings/${b.kind}/${b.id}?confirmed=1`) }}
        />
      )}
    </div>
  )
}
