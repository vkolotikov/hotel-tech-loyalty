import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Inbox } from 'lucide-react'
import type { PostCard } from '../lib/types'
import { focusWasInside, outside } from '../../workspace/lib/menuFocus'
import { trayListClass } from './planMath'
import { TrayList } from './Tray'
import type { PlanHandlers } from './WeekGrid'

/**
 * "Unscheduled (n)" in the filter row (spec 2026-10-21 §6.2): the drop target for "no day" — a card dropped on the chip
 * loses its date — and the button that opens the list of posts without a day under it. The list stays open while a card
 * is dragged from it; Escape (claimed, so an open post panel stays) or a press outside closes it.
 */
export function UnscheduledChip({ posts, total, active, dragging = false, selectedId, onOpen, onCardPointerDown, onCardKeyDown }: Pick<PlanHandlers, 'onOpen' | 'onCardPointerDown' | 'onCardKeyDown'> & {
  posts: PostCard[]
  total?: number
  /** A dragged card is over the chip. */
  active: boolean
  /** A card is being dragged: the open list lets the pointer through to the days under it. */
  dragging?: boolean
  selectedId: number | null
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const count = Math.max(total ?? 0, posts.length)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
      setOpen(false)
    }
    const onPress = (e: PointerEvent) => { if (outside(box.current, e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button ref={toggle} type="button" data-drop="tray" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${active ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border bg-a-surface text-a-text hover:bg-a-surface-2'}`}>
        <Inbox size={13} aria-hidden className="text-a-text-2" />{t('content.plan.unscheduled_chip', 'Unscheduled ({{count}})', { count })}
      </button>
      {open && (
        <div id={listId} role="region" aria-label={t('content.plan.tray.title', 'Unscheduled')}
          className={trayListClass(dragging)}>
          <TrayList posts={posts} total={total} selectedId={selectedId} onOpen={onOpen} onCardPointerDown={onCardPointerDown} onCardKeyDown={onCardKeyDown} />
        </div>
      )}
    </div>
  )
}
