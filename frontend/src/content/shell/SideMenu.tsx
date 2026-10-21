import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { focusWasInside, outside } from '../ui/menuFocus'
import { menuKey } from './shellMath'

/** Where the list opens from its button: up (the side panel's foot), down (the top bar, the panel), or beside a slim rail. */
type Place = 'up' | 'down' | 'down-right' | 'beside'
const PLACES: Record<Place, string> = {
  up: 'bottom-full left-0 mb-2',
  down: 'left-0 top-full mt-2',
  'down-right': 'right-0 top-full mt-2',
  beside: 'bottom-0 left-full ml-2',
}

/**
 * A button that opens a small list (spec 2026-10-21 §4.1): a menu of actions (`kind="menu"`: menu items, the arrows,
 * Home and End move, the first item takes the focus) or a panel of controls (`kind="panel"`: the theme switch, the
 * language — Tab moves through it). Escape anywhere closes it and is claimed (an open post panel stays open), as do a
 * press or the focus outside; the focus goes back to the button when it was inside. `face` draws the button's contents
 * (the person row, the brand's name) in place of the icon and label. Choosing a menu item closes the menu.
 */
export function SideMenu({ label, icon: Icon, kind, place, slim = false, buttonClassName, listClassName = 'w-64', wrapClassName = '', face, named = false, children }: {
  label: string
  icon?: LucideIcon
  kind: 'menu' | 'panel'
  place: Place
  /** The side panel is icons only: the label is for a screen reader and the hover tip. */
  slim?: boolean
  buttonClassName: string
  listClassName?: string
  /** Classes for the menu's own box (min-w-0 where a long face must shorten in a row). */
  wrapClassName?: string
  face?: ReactNode
  /** An icon-only face (⋯): the label names the button. */
  named?: boolean
  /** The list's contents; choosing one of a menu's items closes it. */
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const listId = useId()

  const close = () => {
    if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    // A menu gives its first item the focus; a panel leaves it on the button until Tab.
    if (kind === 'menu') list.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
      setOpen(false)
    }
    const onPress = (e: PointerEvent) => { if (outside(box.current, e.target)) setOpen(false) }
    const onFocus = (e: FocusEvent) => { if (outside(box.current, e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('focusin', onFocus, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('focusin', onFocus, true)
    }
  }, [open, kind])

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (kind !== 'menu') return
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const next = menuKey(e.key, items.indexOf(document.activeElement as HTMLElement), items.length)
    if (next === null) return
    e.preventDefault()
    items[next]?.focus()
  }
  // A chosen item closes the menu (after its own click has run: a dialog it opened keeps the focus).
  const onListClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[role^="menuitem"]')) close()
  }
  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (kind === 'menu' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
      e.preventDefault()
      setOpen(true)
    }
  }

  return (
    <div ref={box} className={`relative ${wrapClassName}`.trim()}>
      <button ref={toggle} type="button" aria-label={named ? label : undefined} aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-haspopup={kind === 'menu' ? 'menu' : undefined} data-tip={slim ? label : undefined}
        onClick={() => setOpen(o => !o)} onKeyDown={onButtonKey} className={buttonClassName}>
        {face ?? (
          <>
            {Icon && <Icon size={16} aria-hidden className="shrink-0" />}
            <span className={slim ? 'sr-only' : 'truncate'}>{label}</span>
          </>
        )}
      </button>
      {open && (
        <div ref={list} id={listId} role={kind === 'menu' ? 'menu' : 'group'} aria-label={label} onKeyDown={onListKey} onClick={onListClick}
          className={`absolute z-50 ${PLACES[place]} ${listClassName} animate-a-pop space-y-1 rounded-xl border border-a-border bg-a-surface p-1.5 text-a-text shadow-a-lg`}>
          {children}
        </div>
      )}
    </div>
  )
}
