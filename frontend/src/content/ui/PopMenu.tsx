import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { focusWasInside, listPlace, outside } from './menuFocus'

export interface PopItem { id: string; label: string; sub?: string }

/**
 * A small menu behind a button (spec 2026-10-16 §3.5): the day's "+", Insert, the Template menu, an idea's "Move to…".
 * Real buttons; a mouse press does not take the focus, so a field keeps its cursor. While open, an Escape anywhere
 * closes the list (claimed, so an open panel stays open), as does a press or the focus outside it; after a choice or an
 * Escape in the list the focus goes back to the button. Nothing shows without items.
 */
export function PopMenu({ label, items, onPick, className, children, wrapClassName = '', data, align = 'right', side = 'below', listClassName = 'w-64', title }: {
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
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const listId = useId()

  const close = () => {
    if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
      setOpen(false)
    }
    const onPress = (e: PointerEvent) => { if (outside(box.current, e.target)) setOpen(false) }
    // Capture: the list closes before the panel's own Escape (which skips a claimed one) or a press reaches anything else.
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
    }
  }, [open])

  if (items.length === 0) return null
  // data-menu: a click anywhere in the menu (its padding included) is the menu's, never a day's (plan/addMath clickAdds).
  return (
    <div ref={box} data-menu="" data-side={side} data-align={align} className={`relative ${wrapClassName}`} onBlur={(e) => { if (open && outside(box.current, e.relatedTarget)) setOpen(false) }}>
      <button ref={toggle} type="button" aria-haspopup="true" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={label} title={title}
        {...data} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(o => !o)} className={className}>
        {children}
      </button>
      {open && (
        <ul id={listId} className={`absolute ${listPlace(align, side)} z-20 max-h-64 overflow-y-auto rounded-lg border border-a-border bg-a-surface p-1 shadow-a-lg ${listClassName}`}>
          {items.map(item => (
            <li key={item.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(item.id); close() }}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-a-surface-2">
                <span className="block truncate text-sm font-medium text-a-text">{item.label}</span>
                {item.sub && <span className="block truncate text-xs text-a-text-2">{item.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
