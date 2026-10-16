import { useEffect, useId, useRef, useState } from 'react'
import { ListPlus } from 'lucide-react'
import type { Snippet } from '../lib/types'
import { focusWasInside, outside } from './menuFocus'

/**
 * "Insert" beside a field (spec 2026-10-15 §6): opens the brand's hashtag groups or snippets; picking one hands it over
 * and closes. Real buttons; a mouse press does not take the focus, so the field keeps its cursor. While open, an Escape
 * anywhere closes the list (claimed, so the panel stays open), as does a press or the focus outside it; after a pick or
 * an Escape in the list the focus goes back to the button. Nothing shows when the brand has none of that kind.
 */
export function InsertMenu({ label, items, onPick }: { label: string; items: Snippet[]; onPick: (item: Snippet) => void }) {
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
  return (
    <div ref={box} className="relative" onBlur={(e) => { if (open && outside(box.current, e.relatedTarget)) setOpen(false) }}>
      <button ref={toggle} type="button" aria-haspopup="true" aria-expanded={open} aria-controls={open ? listId : undefined}
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
        <ListPlus size={12} aria-hidden />{label}
      </button>
      {open && (
        <ul id={listId} className="absolute right-0 z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-a-border bg-a-surface p-1 shadow-a-lg">
          {items.map(item => (
            <li key={item.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(item); close() }}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-a-surface-2">
                <span className="block truncate text-sm font-medium text-a-text">{item.name}</span>
                <span className="block truncate text-xs text-a-text-2">{item.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
