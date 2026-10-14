import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { money } from '../../lib/money'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import type { AppointmentSummary } from '../lib/types'
import { timeOf } from '../../workspace/lib/wallClock'
import type { PreviewOpener } from './previewTimer'

/** A box on the screen (a DOMRect has these): a card, or the part of the grid that can be seen. */
export interface ScreenBox { left: number; right: number; top: number; bottom: number }

/**
 * Where a preview goes. `inside`: within the card's column, at its right edge,
 * for when nothing beside the card can be seen (a single wide column). `nudge`:
 * how far it moves into view (down below the card, up above it) when part of the
 * card itself is out of view.
 */
export interface PreviewPlacement { side: 'right' | 'left' | 'inside'; above: boolean; nudge?: number }

/** The room a preview takes beside or under a card: 17rem wide, the height of its every line, each with the 8 px gap. */
// eslint-disable-next-line react-refresh/only-export-components
export const PREVIEW_ROOM = { width: 272 + 8, height: 216 }

/**
 * Where a preview goes (spec §5.5), judged on the part of the grid that can be
 * seen, since the scroller clips anything beyond it and an open panel covers its
 * right: to the right of the card's column while there is room there, else to the
 * left, else inside the column; below the card while there is room under its top,
 * else above it when there is more room above; level with the part of the card in
 * view. The sides are the column's: the preview is placed beside the column, and
 * a card can be narrower (an overlap lane, a gutter).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function previewPlacement(column: ScreenBox, card: ScreenBox, view: ScreenBox): PreviewPlacement {
  const side = view.right - column.right >= PREVIEW_ROOM.width ? 'right' : column.left - view.left >= PREVIEW_ROOM.width ? 'left' : 'inside'
  const below = view.bottom - card.top
  const above = below < PREVIEW_ROOM.height && card.bottom - view.top > below
  return { side, above, nudge: Math.max(0, above ? card.bottom - view.bottom : view.top - card.top) }
}

/** The part of the grid that can be seen: the scroller's window below its sticky column head, up to an open panel's left edge (`null`: none). */
// eslint-disable-next-line react-refresh/only-export-components
export function visibleArea(scroller: ScreenBox, headBottom: number, coverLeft: number | null): ScreenBox {
  return {
    left: scroller.left,
    right: coverLeft === null ? scroller.right : Math.min(scroller.right, coverLeft),
    top: Math.max(scroller.top, headBottom),
    bottom: scroller.bottom,
  }
}

/**
 * A small card beside a calendar card after a short rest of the pointer or on
 * keyboard focus. It reads the same appointment detail the panel loads, so the
 * panel opens at once afterwards; until (or unless) that detail arrives it shows
 * what the calendar card already knows. The pointer may move onto it and rest
 * there (WCAG 1.4.13): `onHold` when it arrives, `onLeave` with where it went;
 * a click on it opens the appointment, as a click on the card does.
 */
export function CardPreview({ id, appointment, memberName, placement, top, bottom, by = 'pointer', onHold, onLeave, onOpen }: {
  id: string; appointment: AppointmentSummary; memberName: string | null
  placement: PreviewPlacement; top: number; bottom: number
  /** What opened it: the hint names the click for the pointer and the Enter key for the keyboard. */
  by?: PreviewOpener
  onHold?: () => void; onLeave?: (to: EventTarget | null) => void; onOpen?: () => void
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const detail = useQuery({
    queryKey: ['appointments', 'booking', appointment.id],
    queryFn: () => appointmentsApi.booking(appointment.id),
    staleTime: 30_000,
    retry: false,
  })
  const b = detail.data?.booking
  const member = b?.loyalty?.member ?? b?.client.member ?? null
  const points = member ? new Intl.NumberFormat(i18n.language || 'en').format(member.points) : null
  const style = {
    ...(placement.side === 'inside' ? { right: 8 } : { [placement.side === 'right' ? 'left' : 'right']: 'calc(100% + 8px)' }),
    ...(placement.above ? { bottom: `calc(100% - ${bottom - (placement.nudge ?? 0)}px)` } : { top: top + (placement.nudge ?? 0) }),
  } as CSSProperties

  return (
    // A press here must not take the focus from a card the keyboard previewed: its blur would close this before the click arrives.
    <div id={id} role="tooltip" style={style}
      onPointerEnter={onHold} onPointerLeave={(e) => onLeave?.(e.relatedTarget)} onClick={onOpen} onMouseDown={(e) => e.preventDefault()}
      className="absolute z-30 w-[17rem] cursor-pointer space-y-1.5 rounded-xl border border-a-border bg-a-surface p-3.5 text-sm text-a-text shadow-a-lg animate-a-pop">
      <div className="font-a-display text-base font-normal leading-tight">{appointment.client.name}</div>
      {boot.loyalty.programme_on && member && points !== null && (
        <div className="text-xs text-a-text-2">{member.tier
          ? t('appointments.preview.points', '{{tier}} · {{points}} points', { tier: member.tier, points })
          : t('appointments.preview.points_only', '{{points}} points', { points })}</div>
      )}
      <div>{appointment.service?.name ?? '—'}</div>
      <div className="font-a-mono text-xs text-a-text-2">{timeOf(appointment.start)} – {timeOf(appointment.end)} · {t('appointments.preview.length', '{{minutes}} min', { minutes: appointment.duration_minutes })}</div>
      {memberName && <div className="text-a-text-2">{t('appointments.preview.with', 'with {{name}}', { name: memberName })}</div>}
      {b && (
        <div className="text-a-text-2"><span className="font-semibold text-a-text">{money(b.price.total, b.price.currency)}</span> · {t(`appointments.payment.${b.payment.state}`)}</div>
      )}
      <div className="border-t border-a-border pt-1.5 text-xs text-a-text-2">
        {by === 'focus' ? t('appointments.preview.hint_keyboard', 'Press Enter to open') : t('appointments.preview.hint', 'Click to open')}
      </div>
    </div>
  )
}
