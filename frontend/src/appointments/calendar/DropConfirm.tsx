import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { appointmentsApi, failureOf } from '../lib/api'
import type { AppointmentSummary, Wall } from '../lib/types'
import { formatDate, hhmm, makeWall } from '../lib/wallClock'
import { TellClient } from '../panel/TellClient'
import type { PanelError } from '../panel/panelState'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import type { GridColumn } from './calendarState'
import { claimEscape, dropNotify, lengthNote } from './dropDialog'
import { focusDialog } from './focusDialog'
import type { DragState } from './useCardDrag'

/** What the calendar asks the server to do with a drop. `length` is set only by a resize; `notify` only by a move. */
export interface DropTarget { start: Wall; masterId: number; length: number | null; notify: boolean }

interface Props {
  title: string
  /** The "Tell the client" box (Part D) for a move; null for a resize, whose start does not change. */
  tell: { email: string | null; checked: boolean; loading: boolean; failed?: boolean } | null
  /** One more thing the drop changes, said plainly (the length it takes on another person). */
  note?: string | null
  onTell: (checked: boolean) => void
  saving: boolean
  error: PanelError | null
  onSave: () => void
  onCancel: () => void
}

/** The small dialog a drop opens: what will change, the client box, Save and Cancel. Escape cancels. */
export function DropConfirm({ title, tell, note = null, onTell, saving, error, onSave, onCancel }: Props) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return box.current ? focusDialog(box.current, before) : undefined
  }, [])
  useEffect(() => {
    // Heard before the panel (capture) and claimed, so an open panel stays; a save in flight is not cancelled.
    const onKey = (e: KeyboardEvent) => claimEscape(e, onCancel, saving)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel, saving])
  const stale = error?.code === 'stale'

  return (
    <div ref={box} role="dialog" tabIndex={-1} aria-modal="false" aria-label={title} className="w-72 space-y-3 rounded-lg border border-a-border bg-a-surface p-3 text-left shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-a-accent">
      <p className="text-sm font-semibold text-a-text">{title}</p>
      {note && <p className="text-sm text-a-text-2">{note}</p>}
      {tell && (tell.loading
        ? <p className="text-sm text-a-text-2" role="status">{t('appointments.calendar.drag.loading', 'Loading…')}</p>
        : tell.failed
          ? <p className="text-sm text-a-text-2">{t('appointments.calendar.drag.details_failed', "The client's details could not be loaded, so they will not be told.")}</p>
          : <TellClient email={tell.email} checked={tell.checked} onChange={onTell} />)}
      {/* Someone changed it first: the calendar behind already shows it as it is, and Save would send the old version again. */}
      {error && (stale
        ? <Notice tone="warning">{t('appointments.calendar.drag.stale', 'Someone changed this appointment meanwhile. The calendar now shows it as it is.')}</Notice>
        : <Notice tone="danger">{t(`appointments.error.${error.code}`, error.message)}</Notice>)}
      <div className="flex flex-wrap gap-2">
        {!stale && <Button type="button" size="sm" loading={saving} disabled={tell?.loading} onClick={onSave}>{t('appointments.calendar.drag.save', 'Save')}</Button>}
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          {stale ? t('appointments.common.close', 'Close') : t('appointments.calendar.drag.cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  )
}

/**
 * A drop waiting for its Save: works out the question, reads the client's
 * address from the appointment's detail (cards carry no contact details, R4),
 * and saves through the calendar's `onDrop` with the card's own revision.
 */
export function PendingDrop({ top, drag, column, locale, tellDefault, onDrop, onDone }: {
  top: number
  drag: DragState
  column: GridColumn
  locale: string
  tellDefault: boolean
  onDrop: (appointment: AppointmentSummary, to: DropTarget) => Promise<void>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { kind, origin, place } = drag
  const moving = kind === 'move'
  const detail = useQuery({ queryKey: ['appointments', 'booking', origin.appt.id], queryFn: () => appointmentsApi.booking(origin.appt.id), enabled: moving })
  const [tell, setTell] = useState(tellDefault)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<PanelError | null>(null)

  const title = moving
    ? t('appointments.calendar.drag.move_title', 'Move {{client}} to {{when}} with {{name}}?', {
        client: origin.appt.client.name,
        when: `${formatDate(column.date, locale, { weekday: 'short', day: 'numeric', month: 'short' })} ${hhmm(place.start)}`,
        name: column.master.name,
      })
    : t('appointments.calendar.drag.resize_title', 'Make it {{from}}–{{to}}?', { from: hhmm(place.start), to: hhmm(place.start + place.length) })

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // R7: a resize never asks to tell the client.
      await onDrop(origin.appt, {
        start: makeWall(column.date, place.start), masterId: column.master.id, length: moving ? null : place.length,
        notify: dropNotify({ moving, tell, detailsFailed: detail.isError }),
      })
      onDone()
    } catch (e) {
      const failure = failureOf(e)
      setError({ code: failure.code, message: failure.message })
      setSaving(false)
    }
  }

  return (
    <div className="absolute left-1 z-40" style={{ top }}>
      <DropConfirm title={title}
        tell={moving ? { email: detail.data?.booking.client_email ?? null, checked: tell, loading: detail.isLoading, failed: detail.isError } : null}
        note={lengthNote({ moving, from: origin.appt.master?.id, to: column.master.id, lengthSetByStaff: detail.data?.booking.length_set_by_staff })
          ? t('appointments.calendar.drag.length_note', "The length becomes {{name}}'s normal length for this service.", { name: column.master.name })
          : null}
        onTell={setTell} saving={saving} error={error} onSave={() => { void save() }} onCancel={onDone} />
    </div>
  )
}
