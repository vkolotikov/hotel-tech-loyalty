import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { modalScope } from '../lib/modalScope'

/**
 * A modal over a scrim (Content's Generate, Loyalty's forms). It takes the focus when it opens and gives
 * it back when it closes, keeps Tab inside, and closes on Escape — claimed,
 * so the post panel under it stays open. While `busy`, it does not close.
 * Tab stays inside even after the dialog's content is replaced (dialogFocus.ts).
 */
export function Dialog({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useRef(onClose)
  const working = useRef(busy)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => { working.current = busy }, [busy])

  useEffect(() => {
    if (box.current) return modalScope(box.current, () => { if (!working.current) close.current() })
  }, [])

  return (
    // !m-0: a dialog opened inside a `space-y-*` list would take that list's top margin and leave a strip of the page
    // above the scrim uncovered.
    <div className="fixed inset-0 z-50 m-0! grid place-items-center bg-a-scrim/50 p-4 animate-a-fade">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-a-border bg-a-surface p-5 shadow-a-lg outline-hidden animate-a-pop">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-a-display text-xl font-normal text-a-text">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t('workspace.common.close', 'Close')}
            className="rounded-sm p-1.5 text-a-text-2 hover:text-a-text disabled:opacity-50">
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
