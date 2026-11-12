import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check, MoreHorizontal } from 'lucide-react'

/**
 * A button that opens a small panel under it (the Columns, Views and row menus of round 2): it closes on Escape (the
 * focus goes back to the button), on a press outside, and on a press of anything in it marked `data-close` (a menu's
 * item, a view applied). The panel keeps to the screen's edge on a phone. Moved from Sales to the shared ui in round 5.
 */
export function Popover({ label, title, button, className = '', align = 'right', width = 'w-64', children }: {
  /** The button's name for a screen reader (its visible content may be only an icon). */
  label: string
  /** The button's tooltip (round 5: an icon-only button says what it opens). */
  title?: string
  button: ReactNode
  className?: string
  align?: 'left' | 'right'
  width?: string
  children: ReactNode
}) {
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
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close() }
  }
  return (
    <div ref={box} className="relative inline-block" onKeyDown={onKey}>
      <button ref={trigger} type="button" aria-label={label} title={title} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(o => !o)} className={className}>
        {button}
      </button>
      {open && (
        <div id={id} onClick={e => { if ((e.target as HTMLElement).closest('[data-close]')) close() }}
          className={`absolute top-full z-30 mt-1.5 max-w-[calc(100vw-2rem)] rounded-xl border border-a-border bg-a-surface p-1.5 shadow-a-lg animate-a-pop ${width} ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children}
        </div>
      )}
    </div>
  )
}

export interface MenuItem {
  key: string
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  /** Shown with a tick (the current stage, the current priority). */
  checked?: boolean
  disabled?: boolean
}

/** A list of actions in a popover (a row's "…"): buttons in a menu, the arrow keys move between them. */
export function ActionMenu({ label, title, items, icon: Icon = MoreHorizontal, button, className, align = 'right' }: {
  label: string
  /** The button's tooltip. */
  title?: string
  items: (MenuItem | 'divider' | { heading: string })[]
  icon?: LucideIcon
  button?: ReactNode
  className?: string
  align?: 'left' | 'right'
}) {
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])')]
    if (!buttons.length) return
    e.preventDefault()
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
      : e.key === 'ArrowDown' ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length
    buttons[next].focus()
  }
  return (
    <Popover label={label} title={title} align={align} width="w-60"
      className={className ?? 'grid h-9 w-9 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent'}
      button={button ?? <Icon size={16} aria-hidden />}>
      {(
        <div role="menu" aria-label={label} onKeyDown={move}>
          {items.map((item, i) => {
            if (item === 'divider') return <div key={`d${i}`} role="separator" className="my-1 h-px bg-a-border" />
            if ('heading' in item) return <p key={`h${i}`} className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-a-text-2">{item.heading}</p>
            const ItemIcon = item.icon
            return (
              <button key={item.key} type="button" role="menuitem" disabled={item.disabled} data-close
                // The first item takes the focus when the menu opens, so the arrow keys work at once.
                autoFocus={i === items.findIndex(x => typeof x === 'object' && 'key' in x && !x.disabled)}
                onClick={() => item.onSelect()}
                className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-a-accent ${item.danger ? 'text-a-danger hover:bg-a-danger/12' : 'text-a-text hover:bg-a-surface-2'}`}>
                {ItemIcon ? <ItemIcon size={15} aria-hidden className="shrink-0" /> : <span aria-hidden className="w-[15px] shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.checked && <Check size={14} aria-hidden className="shrink-0 text-a-accent-text" />}
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )
}
