import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { handBackFocus } from '../../workspace/lib/handBack'

/**
 * A panel from the right over the page (a lead or a contact at a glance, a form): takes the focus, closes on Escape
 * and on the scrim, gives the focus back. Full width on a phone.
 */
export function SidePanel({ title, onClose, footer, children }: { title: string; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    box.current?.focus()
    // A dialog opened from the panel (a Confirm) claims Escape first, in the capture phase: then the panel stays.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close.current() } }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (before?.isConnected) handBackFocus(before)
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 m-0!">
      <button type="button" tabIndex={-1} aria-label={t('time.common.close', 'Close')} onClick={onClose} className="absolute inset-0 cursor-default bg-a-scrim/40 animate-a-fade" />
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-a-border bg-a-surface shadow-a-lg outline-hidden animate-a-slide-in">
        <div className="flex items-center gap-3 border-b border-a-border px-5 py-3.5">
          <h2 id={titleId} className="min-w-0 flex-1 truncate font-a-display text-xl text-a-text">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('time.common.close', 'Close')} className="rounded-sm p-1.5 text-a-text-2 hover:text-a-text"><X size={18} aria-hidden /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-a-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}
