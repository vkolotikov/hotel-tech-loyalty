import { useEffect, useRef, type Dispatch } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { appointmentsApi, failureOf } from '../lib/api'
import { useBoot } from '../AppointmentsProvider'
import type { ActionKey, AppointmentDetail, CalendarMaster, CatalogueService, DateKey, PointsResult, Wall } from '../lib/types'
import { Notice } from '../ui/Notice'
import { ActionConfirm } from './ActionConfirm'
import { AppointmentView } from './AppointmentView'
import { MoveForm } from './MoveForm'
import { NEEDS_CONFIRM } from './consequences'
import { CreateForm } from './CreateForm'
import { draftBody, newKey, type PanelEvent, type PanelState } from './panelState'

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

  const draft = state.mode === 'create' ? state.draft : null
  const slots = useQuery({
    queryKey: ['appointments', 'slots', draft?.serviceId ?? null, draft?.masterId ?? null, draft?.date ?? null, null],
    queryFn: () => appointmentsApi.slots(draft!.serviceId!, draft!.masterId!, draft!.date),
    enabled: draft !== null && draft.serviceId !== null && draft.masterId !== null,
  })

  const save = async () => {
    if (state.mode !== 'create') return
    const body = draftBody(state.draft)
    if (!body) return
    dispatch({ type: 'saving' })
    try {
      const { booking } = await appointmentsApi.createBooking(body, state.key)
      queryClient.setQueryData(['appointments', 'booking', booking.id], { booking })
      void queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] })
      dispatch({ type: 'created', id: booking.id })
    } catch (e) {
      const failure = failureOf(e)
      // The slot was lost: fetch the times that are free now.
      if (failure.code === 'slot_taken') void queryClient.invalidateQueries({ queryKey: ['appointments', 'slots'] })
      dispatch({ type: 'failed', error: { code: failure.code, message: failure.message } })
    }
  }

  const id = state.mode === 'view' ? state.id : null
  const detail = useQuery({
    queryKey: ['appointments', 'booking', id],
    queryFn: () => appointmentsApi.booking(id!),
    enabled: id !== null,
    refetchInterval: 30_000,
  })
  const booking = detail.data?.booking

  const settle = (next: AppointmentDetail, outcome: PointsResult | null) => {
    queryClient.setQueryData(['appointments', 'booking', next.id], { booking: next })
    void queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] })
    dispatch({ type: 'done', outcome })
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
      const result = await appointmentsApi.act(booking.id, { action, revision: booking.revision, ...(reason?.trim() ? { reason: reason.trim() } : {}) })
      settle(result.booking, result.points)
    } catch (e) {
      refuse(e)
    }
  }

  const move = async (start: Wall, masterId: number) => {
    if (!booking) return
    dispatch({ type: 'saving' })
    try {
      const result = await appointmentsApi.move(booking.id, { start, master_id: masterId, revision: booking.revision })
      settle(result.booking, null)
    } catch (e) {
      refuse(e)
    }
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
          />
        )}
        {state.mode === 'view' && detail.isLoading && <p className="text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
        {state.mode === 'view' && detail.isError && !booking && <Notice tone="danger">{t('appointments.panel.load_failed', 'This appointment could not be loaded.')}</Notice>}

        {state.mode === 'view' && booking && state.sub === 'summary' && (
          <AppointmentView booking={booking} zone={boot.venue.timezone} locale={i18n.language || 'en'}
            saving={state.saving} error={state.error} outcome={state.outcome} onAction={onAction} />
        )}

        {state.mode === 'view' && booking && state.sub === 'move' && (
          <MoveForm booking={booking} masters={masters} services={services} today={today}
            saving={state.saving} error={state.error}
            onMove={(start, masterId) => { void move(start, masterId) }} onBack={() => dispatch({ type: 'back' })} />
        )}

        {state.mode === 'view' && booking && state.sub === 'confirm' && state.action !== null && (() => {
          const info = booking.actions.find(a => a.key === state.action)
          return info ? (
            <ActionConfirm booking={booking} action={info} reason={state.reason} saving={state.saving} error={state.error}
              onReason={(reason) => dispatch({ type: 'setReason', reason })}
              onConfirm={() => { void act(info.key, state.reason) }} onBack={() => dispatch({ type: 'back' })} />
          ) : null
        })()}
      </div>
    </aside>
  )
}
