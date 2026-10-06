import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AppointmentSummary } from '../lib/types'
import { cardDensity, type Placed } from '../lib/layout'
import { STATUS_TONE, TONE_CLASS } from '../lib/status'
import { timeOf } from '../lib/wallClock'
import { StatusMark } from '../ui/StatusMark'

/** Room left beside a card that does not use its time, so the free slot under it can be seen and clicked. */
const GUTTER_PX = 28

interface Props {
  placed: Placed<AppointmentSummary>
  selected: boolean
  /** The slot under this card is on offer (a cancellation or a no-show on a day that can still be booked). */
  gutter: boolean
  onOpen: (id: number) => void
  /** Part F: the card can be dragged to move it and stretched by its bottom edge. */
  draggable?: boolean
  /** It is the card being dragged: outlined where it was. */
  lifted?: boolean
  onDragStart?: (e: ReactPointerEvent<HTMLElement>, kind: 'move' | 'resize') => void
  /** Part F: its key among the grid's stops, and whether it is the grid's one tab stop. */
  stopKey?: string
  tabIndex?: number
  onFocusStop?: (key: string) => void
}

/**
 * One appointment on the grid: time, client, service, and the status as an
 * icon plus a word (never colour alone). No notes, no contact details. What
 * is shown depends on the card's height, so a short appointment loses its
 * service line rather than having a line cut in half.
 */
export function AppointmentCard({ placed, selected, gutter, onOpen, draggable = false, lifted = false, onDragStart, stopKey, tabIndex, onFocusStop }: Props) {
  const { item, top, height, lane, lanes } = placed
  const tone = TONE_CLASS[STATUS_TONE[item.status]]
  const density = cardDensity(height)
  const struck = item.status === 'cancelled' ? 'line-through' : ''

  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      onPointerDown={draggable && onDragStart ? (e) => onDragStart(e, 'move') : undefined}
      aria-pressed={selected}
      data-density={density}
      data-gutter={gutter ? '' : undefined}
      data-drag={draggable ? 'move' : undefined}
      data-stop={stopKey}
      tabIndex={tabIndex}
      onFocus={stopKey && onFocusStop ? () => onFocusStop(stopKey) : undefined}
      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - ${4 + (gutter ? GUTTER_PX : 0)}px)`, WebkitTouchCallout: draggable ? 'none' : undefined }}
      className={`absolute z-10 overflow-hidden rounded-md border-l-[3px] px-2 text-left ${density === 'full' || density === 'two' ? 'py-1' : 'py-0.5'} ${tone.bar} ${tone.tint} ${selected ? 'ring-2 ring-a-accent' : ''} ${draggable ? 'select-none touch-manipulation cursor-grab' : ''} ${lifted ? 'outline-dashed outline-2 outline-a-accent' : ''}`}
    >
      {density === 'line' ? (
        <div className="flex items-center gap-2 text-xs leading-4">
          <span className={`shrink-0 font-semibold ${tone.text}`}>{timeOf(item.start)}</span>
          <span className={`min-w-0 flex-1 truncate font-semibold text-a-text ${struck}`}>{item.client.name}</span>
          <StatusMark status={item.status} compact />
        </div>
      ) : (
        <>
          <div className={`flex items-center justify-between gap-2 text-xs leading-4 font-semibold ${tone.text}`}>
            <span className="shrink-0 whitespace-nowrap">{timeOf(item.start)} – {timeOf(item.end)}</span>
            <StatusMark status={item.status} compact />
          </div>
          <div className={`font-semibold text-a-text truncate ${density === 'tight' ? 'text-xs leading-4' : 'text-sm'} ${struck}`}>{item.client.name}</div>
          {density === 'full' && item.service && <div className="text-xs text-a-text-2 truncate">{item.service.name}</div>}
        </>
      )}
      {draggable && onDragStart && (
        <span aria-hidden data-resize="" className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
          onPointerDown={(e) => { e.stopPropagation(); onDragStart(e, 'resize') }} />
      )}
    </button>
  )
}
