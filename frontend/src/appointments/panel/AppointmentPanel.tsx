import { useEffect, useRef, useState, type Dispatch } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { appointmentsApi, failureOf } from '../lib/api'
import { useBoot } from '../AppointmentsProvider'
import type { ActionKey, AppointmentDetail, CalendarMaster, CatalogueService, ClientMessageInfo, DateKey, DeskMethod, PointsResult, RefundVia, Wall } from '../lib/types'
import { Notice } from '../ui/Notice'
import { ActionConfirm } from './ActionConfirm'
import { AppointmentView } from './AppointmentView'
import { MoveForm } from './MoveForm'
import { RefundForm } from './RefundForm'
import { TakePaymentForm } from './TakePaymentForm'
import { NEEDS_CONFIRM } from './consequences'
import { CreateForm } from './CreateForm'
import { detailPollMs, draftBody, newKey, type CancelRefunds, type PanelEvent, type PanelState } from './panelState'
import { makeWall, minutesOf } from '../lib/wallClock'

interface Props {
  state: PanelState
  dispatch: Dispatch<PanelEvent>
  masters: CalendarMaster[]
  services: CatalogueService[]
  today: DateKey
}

/**
 * The right-side appointment workspace. It lies over the right edge of the
 * calendar and leaves the rest of it visible, with its date, filter and
 * scroll untouched. Esc closes it and focus goes back to the card or slot
 * that opened it.
 */
export function AppointmentPanel({ state, dispatch, masters, services, today }: Props) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const queryClient = useQueryClient()
  const panel = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    heading.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dispatch({ type: 'close' }) }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // The slot that opened the panel is gone once it is booked: fall back to the page.
      const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-appointments] main')
      back?.focus()
    }
  }, [dispatch])

  // Each step of the panel (the summary, the move form, a confirmation, the
  // result of an action) replaces the buttons that led to it. Focus goes to
  // the heading so the keyboard and a screen reader stay in the panel.
  const step = state.mode === 'view' ? `${state.sub}:${state.saving ? 'saving' : 'idle'}` : 'create'
  useEffect(() => {
    if (step.endsWith(':saving')) return
    if (!panel.current?.contains(document.activeElement)) heading.current?.focus()
  }, [step])

  // "Tell the client" starts from the venue's setting on every new step; staff may change it for this one.
  const staffDefault = boot.messages?.staff_default ?? false
  const tellKey = state.mode === 'create' ? 'create' : state.mode === 'view' ? `${state.id}:${state.sub}:${state.action ?? ''}` : 'closed'
  const [tellChoice, setTellChoice] = useState<{ key: string; value: boolean } | null>(null)
  const tell = tellChoice !== null && tellChoice.key === tellKey ? tellChoice.value : staffDefault
  const onTell = (value: boolean) => setTellChoice({ key: tellKey, value })
  const canManage = boot.staff.can_manage ?? false

  const draft = state.mode === 'create' ? state.draft : null
  const slots = useQuery({
    queryKey: ['appointments', 'slots', draft?.serviceId ?? null, draft?.masterId ?? null, draft?.date ?? null, null],
    queryFn: () => appointmentsApi.slots(draft!.serviceId!, draft!.masterId!, draft!.date),
    enabled: draft !== null && draft.serviceId !== null && draft.masterId !== null,
  })

  // Part E: the server's price for this client (the member price and coupon), and the member's coupons.
  const quoteParams = draft && draft.client && draft.serviceId !== null && draft.masterId !== null && draft.time !== null
    ? { client_id: draft.client.id, service_id: draft.serviceId, master_id: draft.masterId, start: makeWall(draft.date, minutesOf(draft.time)), coupon: draft.coupon ?? null }
    : null
  const quote = useQuery({ queryKey: ['appointments', 'quote', quoteParams], queryFn: () => appointmentsApi.quote(quoteParams!), enabled: quoteParams !== null, retry: false })
  const coupons = useQuery({ queryKey: ['appointments', 'coupons', draft?.client?.id ?? null], queryFn: () => appointmentsApi.coupons(draft!.client!.id), enabled: !!draft?.client?.member })
  const resolveCode = async (code: string) => {
    if (!draft?.client) return
    try {
      const { coupon } = await appointmentsApi.resolveCoupon(draft.client.id, code)
      void queryClient.invalidateQueries({ queryKey: ['appointments', 'coupons'] })
      dispatch({ type: 'edit', patch: { coupon: coupon.coupon }, key: newKey() })
    } catch (e) {
      const f = failureOf(e)
      dispatch({ type: 'failed', error: { code: f.code, message: f.message } })
    }
  }

  const save = async () => {
    if (state.mode !== 'create') return
    const body = draftBody(state.draft)
    if (!body) return
    dispatch({ type: 'saving' })
    try {
      const { booking, client_message } = await appointmentsApi.createBooking({ ...body, notify_client: tell, ...(quote.data ? { expected_total: quote.data.total_amount } : {}) }, state.key)
      queryClient.setQueryData(['appointments', 'booking', booking.id], { booking })
      void queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] })
      dispatch({ type: 'created', id: booking.id, told: client_message })
    } catch (e) {
      const failure = failureOf(e)
      // The slot was lost: fetch the times that are free now.
      if (failure.code === 'slot_taken') void queryClient.invalidateQueries({ queryKey: ['appointments', 'slots'] })
      // The price moved since the quote (Part E): show the new one.
      if (failure.code === 'price_changed') void queryClient.invalidateQueries({ queryKey: ['appointments', 'quote'] })
      dispatch({ type: 'failed', error: { code: failure.code, message: failure.message } })
    }
  }

  const id = state.mode === 'view' ? state.id : null
  const detail = useQuery({
    queryKey: ['appointments', 'booking', id],
    queryFn: () => appointmentsApi.booking(id!),
    enabled: id !== null,
    refetchInterval: detailPollMs(state),
    refetchOnWindowFocus: state.mode === 'view' && state.sub === 'summary',
  })
  const booking = detail.data?.booking

  const refundDefaults = (): CancelRefunds => ({ online: String(booking?.money?.refundable_online ?? 0), desk: String(booking?.money?.refundable_desk ?? 0), deskMethod: 'cash' })
  const [refundChoice, setRefundChoice] = useState<{ key: string; value: CancelRefunds } | null>(null)
  const refunds = refundChoice !== null && refundChoice.key === tellKey ? refundChoice.value : refundDefaults()

  const settle = (next: AppointmentDetail, outcome: PointsResult | null, told: ClientMessageInfo | null = null) => {
    queryClient.setQueryData(['appointments', 'booking', next.id], { booking: next })
    void queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] })
    dispatch({ type: 'done', outcome, told })
  }

  const refuse = (e: unknown) => {
    const failure = failureOf(e)
    // Someone changed it first: show what it is now.
    if (failure.code === 'stale' && failure.current) {
      queryClient.setQueryData(['appointments', 'booking', failure.current.id], { booking: failure.current })
      void queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] })
    }
    if (failure.code === 'slot_taken') void queryClient.invalidateQueries({ queryKey: ['appointments', 'slots'] })
    dispatch({ type: 'failed', error: { code: failure.code, message: failure.message } })
  }

  const act = async (action: ActionKey, reason?: string) => {
    if (!booking) return
    dispatch({ type: 'saving' })
    try {
      const asks = action === 'confirm' || action === 'cancel'
      const result = await appointmentsApi.act(booking.id, {
        action, revision: booking.revision, ...(reason?.trim() ? { reason: reason.trim() } : {}), ...(asks ? { notify_client: tell } : {}),
        ...(action === 'cancel' && canManage ? { refunds: [
          { via: 'online_card' as const, amount: Number(refunds.online) || 0 },
          { via: refunds.deskMethod, amount: Number(refunds.desk) || 0 },
        ].filter(r => r.amount > 0) } : {}),
      })
      settle(result.booking, result.points, result.client_message)
    } catch (e) {
      refuse(e)
    }
  }

  const move = async (start: Wall, masterId: number) => {
    if (!booking) return
    dispatch({ type: 'saving' })
    try {
      const result = await appointmentsApi.move(booking.id, { start, master_id: masterId, revision: booking.revision, notify_client: tell })
      settle(result.booking, null, result.client_message)
    } catch (e) {
      refuse(e)
    }
  }

  const pay = async (body: { amount: number; method: DeskMethod; note?: string }) => {
    if (!booking) return
    dispatch({ type: 'saving' })
    try { const r = await appointmentsApi.takePayment(booking.id, { ...body, revision: booking.revision }); settle(r.booking, null) } catch (e) { refuse(e) }
  }

  const giveBack = async (body: { amount: number; via: RefundVia; reason: string; corrects?: boolean }) => {
    if (!booking) return
    dispatch({ type: 'saving' })
    try { const r = await appointmentsApi.refund(booking.id, { ...body, revision: booking.revision }); settle(r.booking, null) } catch (e) { refuse(e) }
  }

  const onAction = (action: ActionKey) => {
    if (action === 'move') dispatch({ type: 'startMove' })
    else if (NEEDS_CONFIRM.has(action)) dispatch({ type: 'askConfirm', action })
    else void act(action)
  }

  const title = state.mode === 'create'
    ? t('appointments.panel.new_title', 'New appointment')
    : t('appointments.panel.title', 'Appointment')

  return (
    <aside ref={panel} role="dialog" aria-modal="false" aria-labelledby="appointment-panel-title"
      className="fixed right-0 top-14 bottom-0 z-30 w-full sm:w-[440px] overflow-y-auto bg-a-surface border-l border-a-border shadow-xl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-a-border bg-a-surface px-4 py-3">
        <h2 id="appointment-panel-title" ref={heading} tabIndex={-1} className="text-base font-semibold text-a-text outline-none">{title}</h2>
        <button type="button" onClick={() => dispatch({ type: 'close' })} className="rounded p-1.5 text-a-text-2 hover:text-a-text" aria-label={t('appointments.common.close', 'Close')}>
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="p-4">
        {state.mode === 'create' && (
          <CreateForm
            draft={state.draft} masters={masters} services={services}
            slots={slots.data} slotsLoading={slots.isFetching} today={today}
            saving={state.saving} error={state.error}
            onEdit={(patch) => dispatch({ type: 'edit', patch, key: newKey() })}
            onSave={() => { void save() }}
            tell={tell} onTell={onTell}
            quote={quote.data} coupons={coupons.data?.coupons ?? []} onResolveCode={resolveCode}
          />
        )}
        {state.mode === 'view' && detail.isLoading && <p className="text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
        {state.mode === 'view' && detail.isError && !booking && <Notice tone="danger">{t('appointments.panel.load_failed', 'This appointment could not be loaded.')}</Notice>}

        {state.mode === 'view' && booking && state.sub === 'summary' && (
          <AppointmentView booking={booking} zone={boot.venue.timezone} locale={i18n.language || 'en'}
            saving={state.saving} error={state.error} outcome={state.outcome} told={state.told} onAction={onAction}
            canManage={canManage} onPay={() => dispatch({ type: 'startPay' })} onRefund={() => dispatch({ type: 'startRefund' })} />
        )}

        {state.mode === 'view' && booking && state.sub === 'move' && (
          <MoveForm booking={booking} masters={masters} services={services} today={today}
            saving={state.saving} error={state.error} tell={tell} onTell={onTell}
            onMove={(start, masterId) => { void move(start, masterId) }} onBack={() => dispatch({ type: 'back' })} />
        )}

        {state.mode === 'view' && booking && state.sub === 'pay' && (
          <TakePaymentForm booking={booking} saving={state.saving} error={state.error} onSave={(b) => { void pay(b) }} onBack={() => dispatch({ type: 'back' })} />
        )}
        {state.mode === 'view' && booking && state.sub === 'refund' && booking.money && (
          <RefundForm booking={booking} saving={state.saving} error={state.error} onSave={(b) => { void giveBack(b) }} onBack={() => dispatch({ type: 'back' })} />
        )}

        {state.mode === 'view' && booking && state.sub === 'confirm' && state.action !== null && (() => {
          const info = booking.actions.find(a => a.key === state.action)
          return info ? (
            <ActionConfirm booking={booking} action={info} reason={state.reason} saving={state.saving} error={state.error} tell={tell} onTell={onTell}
              canManage={canManage} refunds={refunds} onRefunds={(value) => setRefundChoice({ key: tellKey, value })}
              onReason={(reason) => dispatch({ type: 'setReason', reason })}
              onConfirm={() => { void act(info.key, state.reason) }} onBack={() => dispatch({ type: 'back' })} />
          ) : null
        })()}
      </div>
    </aside>
  )
}
