import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { focusWasInside, listPlace, outside } from './menuFocus'

export interface PopItem {
  id: string
  label: string
  sub?: string
  /** A line to notice (the bell's news): a dot, a tint, and `markLabel` for a screen reader. */
  mark?: boolean
}

/** The open list of a PopMenu — its own component so a static render can draw it (a test cannot open the menu). */
export function PopList({ id, items, onPick, className, emptyText, markLabel }: {
  id: string
  items: PopItem[]
  onPick: (id: string) => void
  className: string
  /** Said when there are no items. */
  emptyText?: string
  /** The word a screen reader hears before a marked line ("New"). */
  markLabel?: string
}) {
  return (
    <ul id={id} className={className}>
      {items.length === 0 && emptyText !== undefined && <li className="px-2 py-1.5 text-sm text-a-text-2">{emptyText}</li>}
      {items.map(item => (
        <li key={item.id}>
          <button type="button" data-mark={item.mark ? '' : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(item.id)}
            className={`block w-full rounded-md px-2 py-1.5 text-left hover:bg-a-surface-2 ${item.mark ? 'bg-a-accent/10' : ''}`}>
            {item.mark ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-a-text">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-a-accent" />
                {markLabel && <span className="sr-only">{markLabel}: </span>}
                <span className="truncate">{item.label}</span>
              </span>
            ) : <span className="block truncate text-sm font-medium text-a-text">{item.label}</span>}
            {item.sub && <span className="block truncate text-xs text-a-text-2">{item.sub}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * A small menu behind a button (spec 2026-10-16 §3.5): the day's "+", Insert, the Template menu, an idea's "Move to…",
 * the "For you" bell. Real buttons; a mouse press does not take the focus, so a field keeps its cursor. While open, an
 * Escape anywhere closes the list (claimed, so an open panel stays open), as does a press or the focus outside it; after
 * a choice or an Escape in the list the focus goes back to the button. Nothing shows without items — unless the menu has
 * an empty line to say (`emptyText`). `onOpenChange` hears every opening and closing.
 */
export function PopMenu({ label, items, onPick, className, children, wrapClassName = '', data, align = 'right', side = 'below', listClassName = 'w-64', title, emptyText, markLabel, onOpenChange }: {
  /** The button's accessible name. */
  label: string
  items: PopItem[]
  onPick: (id: string) => void
  /** The button's classes. */
  className: string
  /** What the button shows. */
  children: ReactNode
  /** Classes for the wrapper (margins, self-alignment; never a position: it is the list's anchor). */
  wrapClassName?: string
  /** Extra data-* attributes on the button. */
  data?: Record<string, string>
  align?: 'left' | 'right'
  /** Where the list opens: above where a list below would leave the screen (the foot of a week day). */
  side?: 'below' | 'above'
  listClassName?: string
  title?: string
  /** Said in the open list when there are no items; with it, the menu shows even without items. */
  emptyText?: string
  markLabel?: string
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const listId = useId()
  // The latest callback, read only in handlers (never while rendering).
  const changed = useRef(onOpenChange)
  useEffect(() => { changed.current = onOpenChange })

  const shut = () => {
    setOpen(false)
    changed.current?.(false)
  }
  const close = () => {
    if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
    shut()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
      setOpen(false)
      changed.current?.(false)
    }
    const onPress = (e: PointerEvent) => {
      if (!outside(box.current, e.target)) return
      setOpen(false)
      changed.current?.(false)
    }
    // Capture: the list closes before the panel's own Escape (which skips a claimed one) or a press reaches anything else.
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
    }
  }, [open])

  if (items.length === 0 && emptyText === undefined) return null
  // data-menu: a click anywhere in the menu (its padding included) is the menu's, never a day's (plan/addMath clickAdds).
  return (
    <div ref={box} data-menu="" data-side={side} data-align={align} className={`relative ${wrapClassName}`} onBlur={(e) => { if (open && outside(box.current, e.relatedTarget)) shut() }}>
      <button ref={toggle} type="button" aria-haspopup="true" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={label} title={title}
        {...data} onMouseDown={(e) => e.preventDefault()} onClick={() => { const next = !open; setOpen(next); changed.current?.(next) }} className={className}>
        {children}
      </button>
      {open && (
        <PopList id={listId} items={items} emptyText={emptyText} markLabel={markLabel} onPick={(id) => { onPick(id); close() }}
          className={`absolute ${listPlace(align, side)} z-20 max-h-64 overflow-y-auto rounded-lg border border-a-border bg-a-surface p-1 shadow-a-lg ${listClassName}`} />
      )}
    </div>
  )
}
