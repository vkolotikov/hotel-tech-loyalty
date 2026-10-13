import type { CSSProperties, FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { AppointmentSummary } from '../lib/types'
import { cardDensity, type Placed } from '../lib/layout'
import { isHandedBack } from '../lib/handBack'
import { timeOf } from '../lib/wallClock'
import { StatusMark } from '../ui/StatusMark'
import type { PreviewOpener } from './previewTimer'

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
  /** The grid's arrow-key hint, on the card that takes the focus. */
  describedBy?: string
  onFocusStop?: (key: string) => void
  /** The person's calendar colour (spec 5.3), drawn as a dot before the time. Decoration only: the status stays an icon and a word. */
  memberColor?: string
  /** The pointer rested on the card (a mouse only) or the keyboard focused it: the grid opens its preview after a short rest. */
  onPreviewStart?: (id: number, by: PreviewOpener) => void
  /** Focus moved on, or the card was clicked (the grid closes it on Escape itself): the preview closes. */
  onPreviewEnd?: () => void
  /** The pointer left the card: the grid closes the preview after a short grace, in which the pointer may reach the preview (WCAG 1.4.13). */
  onPreviewLeave?: () => void
  /** The id of this card's preview while it is open: the card is then described by it. */
  previewId?: string
}

/** Focus the keyboard moved here. A click is not that; an engine without `:focus-visible` counts every focus as the keyboard's. (A focus handed back by a closing panel or dialog is asked about separately: after an Escape the browser draws it as keyboard focus.) */
function isKeyboardFocus(e: ReactFocusEvent<HTMLElement>): boolean {
  try { return e.currentTarget.matches(':focus-visible') } catch { return true }
}

/**
 * One appointment on the grid: time, service, client, and the status as an
 * icon plus a word (never colour alone). No notes, no contact details. What
 * is shown depends on the card's height, so a short appointment loses its
 * client line rather than having a line cut in half; the client's name then
 * stays in the card's accessible name as hidden text.
 */
export function AppointmentCard({ placed, selected, gutter, onOpen, draggable = false, lifted = false, onDragStart, stopKey, tabIndex, describedBy, onFocusStop, memberColor, onPreviewStart, onPreviewEnd, onPreviewLeave, previewId }: Props) {
  const { item, top, height, lane, lanes } = placed
  const density = cardDensity(height)
  const struck = item.status === 'cancelled' || item.status === 'no_show' ? 'line-through' : ''
  // The card leads with the service; one without a service leads with the client, who is then not named twice.
  const lead = item.service?.name ?? item.client.name
  const clientInName = item.service ? <span className="sr-only">{`, ${item.client.name}`}</span> : null
  // The card shows its start time (spec 4.6, mock A): at four columns a range cut the status word. The end stays in its name.
  const end = <span className="sr-only">{` – ${timeOf(item.end)}`}</span>
  const dot = memberColor ? <span aria-hidden className="a-member-dot h-2 w-2 shrink-0 rounded-full" style={{ '--a-m': memberColor } as CSSProperties} /> : null

  return (
    <button
      type="button"
      // The panel is opening: the preview has done its job. (Safari and Firefox on macOS do not focus a button on click, so no blur would close it.)
      onClick={() => { onPreviewEnd?.(); onOpen(item.id) }}
      onPointerDown={draggable && onDragStart ? (e) => onDragStart(e, 'move') : undefined}
      aria-pressed={selected}
      data-density={density}
      data-gutter={gutter ? '' : undefined}
      data-drag={draggable ? 'move' : undefined}
      data-stop={stopKey}
      tabIndex={tabIndex}
      aria-describedby={[describedBy, previewId].filter(Boolean).join(' ') || undefined}
      onFocus={(e) => {
        if (stopKey && onFocusStop) onFocusStop(stopKey)
        if (isKeyboardFocus(e) && !isHandedBack(e.currentTarget)) onPreviewStart?.(item.id, 'focus')
      }}
      onBlur={() => onPreviewEnd?.()}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onPreviewStart?.(item.id, 'pointer') }}
      onPointerLeave={() => onPreviewLeave?.()}
      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - ${4 + (gutter ? GUTTER_PX : 0)}px)`, WebkitTouchCallout: draggable ? 'none' : undefined }}
      className={`absolute z-10 overflow-hidden rounded-lg border px-2.5 text-left shadow-a-sm animate-a-rise transition-[transform,box-shadow,border-color] duration-150 ${density === 'full' || density === 'two' ? 'py-1.5' : 'py-0.5'} ${item.status === 'completed' ? 'bg-a-surface-2 border-a-border' : 'bg-a-surface border-a-border'} ${!lifted ? '[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-a [@media(hover:hover)]:hover:border-a-text-2/40' : ''} ${selected ? 'ring-2 ring-a-accent-text' : ''} ${draggable ? 'select-none touch-manipulation cursor-grab' : ''} ${lifted ? 'outline-dashed outline-2 outline-a-accent-text' : ''}`}
    >
      {density === 'line' ? (
        <div className="flex items-center gap-2 text-xs leading-4">
          {dot}
          <span className="shrink-0 font-a-mono text-a-text-2">{timeOf(item.start)}{end}</span>
          <span className={`min-w-0 flex-1 truncate font-semibold text-a-text ${struck}`}>{lead}{clientInName}</span>
          <StatusMark status={item.status} compact />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs leading-4">
            {/* The dot and the time stay together on the left; the status mark keeps the right. */}
            <span className="flex shrink-0 items-center gap-1.5">
              {dot}
              <span className="whitespace-nowrap font-a-mono text-a-text-2">{timeOf(item.start)}{end}</span>
            </span>
            <StatusMark status={item.status} compact />
          </div>
          <div className={`font-semibold text-a-text truncate ${density === 'tight' ? 'text-xs leading-4' : 'text-sm'} ${struck}`}>{lead}{density !== 'full' && clientInName}</div>
          {density === 'full' && item.service && <div className="text-xs text-a-text-2 truncate">{item.client.name}</div>}
        </>
      )}
      {draggable && onDragStart && (
        <span aria-hidden data-resize="" className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
          onPointerDown={(e) => { e.stopPropagation(); onDragStart(e, 'resize') }} />
      )}
    </button>
  )
}
