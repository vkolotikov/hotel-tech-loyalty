import { useId, useState, type ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { foldOpens } from './panelMath'
import { loadFold, saveFold } from './panelPrefs'

/**
 * A folding section of the panel's Content tab (spec 2026-10-21 §7.4): a header button that opens and closes it,
 * closed at first and then as it was left on this device. Its fields stay in the page while closed (hidden). It opens by
 * itself for something to see to (`alert`: a field a refused save named, a warning) and when a tool fills it (`reveal`,
 * a count the toolbar's hashtag group bumps).
 */
export function FoldSection({ id, title, icon: Icon, alert = false, reveal = 0, children }: {
  id: string
  title: string
  icon: LucideIcon
  alert?: boolean
  reveal?: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => alert || loadFold(id))
  const [signal, setSignal] = useState({ alert, reveal })
  if (signal.alert !== alert || signal.reveal !== reveal) {
    if (foldOpens(signal, { alert, reveal })) setOpen(true)
    setSignal({ alert, reveal })
  }
  const body = useId()
  const toggle = () => {
    const next = !open
    setOpen(next)
    saveFold(id, next)
  }
  return (
    <section data-fold={id} className="border-t border-a-border">
      <h3>
        <button type="button" aria-expanded={open} aria-controls={body} onClick={toggle}
          className="flex w-full items-center gap-2.5 py-3 text-left text-sm font-medium text-a-text hover:text-a-accent-text">
          <Icon size={15} aria-hidden className="shrink-0 text-a-text-2" />
          <span className="flex-1">{title}</span>
          <ChevronRight size={15} aria-hidden className={`shrink-0 text-a-text-2 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </h3>
      <div id={body} hidden={!open} className="space-y-3 pb-4">{children}</div>
    </section>
  )
}
