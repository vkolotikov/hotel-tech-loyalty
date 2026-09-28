import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Bottom sheet on phones, centred dialog from `sm`. Traps focus while open,
 * closes on Escape and on the backdrop, and hands focus back to whatever
 * opened it — the three things the old portal's modal did not do.
 */
export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode
}) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  // Always the latest onClose, read from the Escape handler below, so a
  // parent re-render while the sheet is open (a controlled input inside it,
  // say) that hands us a new inline `onClose` never re-runs the trap effect
  // itself — that re-run would refocus the opener on the old cleanup and
  // then the first focusable element on the new run, kicking focus out of
  // whatever the member is typing in.
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    const node = panel.current
    const focusable = () => Array.from(node?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])
    focusable()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      ;(opener.current as HTMLElement | null)?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    // !m-0: pages mount their sheets inside space-y-*, whose margin-top would
    // otherwise shift this fixed overlay down and leave a strip undimmed.
    <div className="fixed inset-0 !m-0 z-50 flex items-end sm:items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-p-scrim/50" aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-sheet-title"
        className="relative w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-p-surface text-p-text rounded-t-p-card sm:rounded-p-card shadow-p p-5 p-rise"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 id="p-sheet-title" className="font-p-display text-xl leading-tight">{title}</h2>
          <button onClick={onClose} aria-label={t('portal.common.close', 'Close')} className="shrink-0 -m-2 p-2 rounded-p-control text-p-text-2 hover:text-p-text min-h-11 min-w-11 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="text-sm">{children}</div>
        {footer && <div className="mt-5 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  )
}
