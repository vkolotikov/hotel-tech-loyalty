import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { handBackFocus } from '../../workspace/lib/handBack'
import { trapTarget } from './dialogFocus'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]'

/**
 * A modal over a scrim (Generate). It takes the focus when it opens and gives
 * it back when it closes, keeps Tab inside, and closes on Escape — claimed,
 * so the post panel under it stays open. While `busy`, it does not close.
 * Tab stays inside even after the dialog's content is replaced (dialogFocus.ts).
 */
export function Dialog({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  const working = useRef(busy)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => { working.current = busy }, [busy])

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const el = box.current
      if (!el) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!working.current) close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const active = document.activeElement
      const target = trapTarget(items, active === el ? null : (active as HTMLElement | null), e.shiftKey, el.contains(active))
      if (target) {
        e.preventDefault()
        target.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (before?.isConnected) handBackFocus(before)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-a-scrim/50 p-4 animate-a-fade">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="content-dialog-title" tabIndex={-1}
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-a-border bg-a-surface p-5 shadow-a-lg outline-none animate-a-pop">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="content-dialog-title" className="font-a-display text-xl font-normal text-a-text">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t('content.common.close', 'Close')}
            className="rounded p-1.5 text-a-text-2 hover:text-a-text disabled:opacity-50">
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
