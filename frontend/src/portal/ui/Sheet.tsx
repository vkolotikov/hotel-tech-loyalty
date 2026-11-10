import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import closeIcon from '../design/assets/f3a82.svg'
import { useTranslation } from 'react-i18next'

let openSheets = 0
let previousOverflow = ''

/** Native modal: inert background, focus containment, stacked panels and focus restoration. */
export function Sheet({ open, onClose, title, children, footer, icon, busy = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; icon?: ReactNode; busy?: boolean
}) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  useLayoutEffect(() => { closeRef.current = onClose; busyRef.current = busy }, [onClose, busy])

  useEffect(() => {
    if (!open) return
    const node = panel.current
    const opener = document.activeElement as HTMLElement | null
    if (openSheets++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    node?.showModal()
    return () => {
      node?.close()
      if (--openSheets === 0) document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <dialog ref={panel} className="p-sheet" aria-labelledby={titleId} aria-modal="true" aria-busy={busy || undefined}
      onCancel={e => { e.preventDefault(); if (!busyRef.current) closeRef.current() }}
      onMouseDown={e => {
        if (e.target !== e.currentTarget || busyRef.current) return
        const r = e.currentTarget.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeRef.current()
      }}>
      <header className="p-sheet-header">
        {icon}<h2 id={titleId}>{title}</h2>
        <button type="button" disabled={busy} onClick={onClose} aria-label={t('portal.common.close', 'Close')} className="p-sheet-close"><img src={closeIcon} alt="" /></button>
      </header>
      <div className="p-sheet-body">{children}</div>
      {footer && <footer className="p-sheet-footer">{footer}</footer>}
    </dialog>
  )
}

