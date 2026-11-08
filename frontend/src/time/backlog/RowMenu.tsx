import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'

export interface RowMenuItem {
  key: string
  label: string
  icon: LucideIcon
  onSelect: () => void
  disabled?: boolean
}

/**
 * A row's "…": its less frequent actions in a small list under the button, so a task keeps its title on a 360 px phone.
 * Closes on Escape (the focus goes back to the button), on a press outside and after a pick; the arrow keys move.
 */
export function RowMenu({ label, items, disabled = false }: { label: string; items: RowMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return undefined
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const close = () => { setOpen(false); trigger.current?.focus() }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); return }
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const buttons = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])]
    if (buttons.length === 0) return
    e.preventDefault()
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
      : e.key === 'ArrowDown' ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length
    buttons[next].focus()
  }

  return (
    <div ref={box} className="relative" onKeyDown={onKey}>
      <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        disabled={disabled} onClick={() => setOpen(o => !o)}
        className="grid h-8 w-8 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-50">
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label}
          className="absolute right-0 top-full z-30 mt-1.5 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-a-border bg-a-surface p-1.5 shadow-a-lg animate-a-pop">
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <button key={item.key} type="button" role="menuitem" disabled={item.disabled} autoFocus={i === 0}
                onClick={() => { close(); item.onSelect() }}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-a-text hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-50">
                <Icon size={15} aria-hidden className="shrink-0 text-a-text-2" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
