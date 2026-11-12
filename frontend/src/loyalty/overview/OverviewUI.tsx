import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Button } from '../../workspace/ui/Button'
import { trapTarget } from '../../workspace/lib/dialogFocus'
import { overviewAssets } from './assets'
import { useOverviewWords } from './words'

// Native dialogs can close together (discarding a nested draft). Restore the page once the last one closes,
// independently of React's cleanup order.
let openModalCount = 0
let pageOverflow = ''
let pageFocus: HTMLElement | null = null

/** Compose the app's button; the scoped class supplies the approved raised/gradient paints. */
export function OverviewButton({ primary = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; children: ReactNode }) {
  return <Button {...props} variant="secondary" className={`l-ov-button ${primary ? 'l-ov-primary' : ''} ${className}`} />
}
export function OverviewBadge({ tone = 'neutral', children }: { tone?: 'green' | 'amber' | 'neutral'; children: ReactNode }) {
  return <span className={`l-ov-badge l-ov-badge-${tone}`}><img src={overviewAssets[tone]} alt="" />{children}</span>
}
/** Native modal supplies background inertness, focus containment and Escape on desktop and phones alike. */
export function OverviewDialog({ title, kind = 'drawer', onClose, children, busy = false, className = '', backLabel, heading, focusContent = false }: { title: string; kind?: 'drawer' | 'preview' | 'menu' | 'form'; onClose: () => void; children: ReactNode; busy?: boolean; className?: string; backLabel?: string; heading?: ReactNode; focusContent?: boolean }) {
  const say = useOverviewWords()
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = () => { if (!busy) onClose() } }, [onClose, busy])
  useEffect(() => {
    const dialog = ref.current
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (openModalCount === 0) { pageOverflow = document.body.style.overflow; pageFocus = before }
    openModalCount += 1
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    if (focusContent) dialog?.querySelector<HTMLElement>('.l-ov-dialog-body input:not(:disabled):not([readonly]), .l-ov-dialog-body select:not(:disabled), .l-ov-dialog-body textarea:not(:disabled)')?.focus({ preventScroll: true })
    return () => {
      dialog?.close()
      openModalCount -= 1
      const target = openModalCount === 0 ? pageFocus : before
      if (openModalCount === 0) { document.body.style.overflow = pageOverflow; pageFocus = null }
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [focusContent])
  return <dialog ref={ref} className={`l-ov-dialog l-ov-dialog-${kind} ${className}`} aria-labelledby={id}
    onKeyDown={e => {
      if (e.key !== 'Tab') return
      const dialog = e.currentTarget
      const items = [...dialog.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length > 0)
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const target = trapTarget(items, active && items.includes(active) ? active : null, e.shiftKey, dialog.contains(active))
      if (target) { e.preventDefault(); target.focus() }
    }}
    onCancel={e => { e.preventDefault(); closeRef.current() }}
    onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeRef.current() } }}>
    <div className="l-ov-dialog-heading">{heading}{backLabel && <button className="l-mw-back" disabled={busy} onClick={onClose}>← {backLabel}</button>}{kind !== 'form' && <span className="l-ov-eyebrow">{say('nav')}</span>}<div className="l-ov-heading-row"><h2 id={id} aria-label={title}>{kind === 'menu' ? <span className="l-ov-menu-brand"><span className="l-ov-mark"><img src={overviewAssets.star} alt="" /></span>hexa</span> : title}</h2>{!backLabel && <OverviewButton type="button" className="l-ov-close" aria-label={say('close')} disabled={busy} onClick={onClose}>×</OverviewButton>}</div></div>
    <div className="l-ov-dialog-body">{children}</div>
  </dialog>
}
export function OverviewRecovery({ title, busy, onRetry, forbidden = false }: { title?: string; busy?: boolean; onRetry: () => void; forbidden?: boolean }) {
  const say = useOverviewWords()
  return <div className="l-ov-recovery" role="status"><strong>{forbidden ? say('restricted') : title ?? say('unavailable')}</strong><p>{forbidden ? say('managedByOwner') : say('unavailableLine')}</p>{!forbidden && <OverviewButton disabled={busy} aria-busy={busy} onClick={onRetry}>{say(busy ? 'retrying' : 'retry')}</OverviewButton>}</div>
}
export function OverviewSkeleton({ rows = 3 }: { rows?: number }) {
  const say = useOverviewWords()
  return <div className="l-ov-skeleton" role="status" aria-label={say('loading')} aria-busy="true">{Array.from({ length: rows }, (_, i) => <span key={i} />)}</div>
}
