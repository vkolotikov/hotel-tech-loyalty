import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { firstFocus, focusTarget } from '../find/findResults'
import { handBackFocus } from '../lib/handBack'
import { SectionTitle } from './Typography'

const kbd = 'rounded-md border border-a-border px-1.5 font-a-mono text-xs'

function Keys({ children }: { children: string[] }) {
  return <>{children.map(k => <kbd key={k} className={kbd}>{k}</kbd>)}</>
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="min-w-0 text-sm text-a-text">{name}</dt>
      <dd className="flex shrink-0 items-center gap-1.5 text-a-text-2">{children}</dd>
    </div>
  )
}

/**
 * The list of keyboard shortcuts behind "?": a modal sheet. The focus moves
 * onto its Close button when it opens and returns to where it was when it
 * closes; Escape and the scrim close it. Nothing is drawn while it is closed.
 */
export function ShortcutsSheet({ open, onClose, modKey, fallbackFocus }: {
  open: boolean
  onClose: () => void
  /** "Ctrl", or "⌘" on a Mac. */
  modKey: string
  /** Where the focus goes on close when the person was on nothing in particular (or the place is gone), tried in order. */
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  if (!open) return null
  return <ShortcutsPanel onClose={onClose} modKey={modKey} fallbackFocus={fallbackFocus} />
}

function ShortcutsPanel({ onClose, modKey, fallbackFocus }: { onClose: () => void; modKey: string; fallbackFocus?: RefObject<HTMLElement | null>[] }) {
  const { t } = useTranslation()
  const closeButton = useRef<HTMLButtonElement>(null)
  const fallbacks = useRef(fallbackFocus)
  useEffect(() => { fallbacks.current = fallbackFocus })
  const opener = useRef<HTMLElement | null | undefined>(undefined)

  // Read when the sheet has mounted, not while it renders: opened from Find, the focus is still in Find's box until Find has handed it back.
  // Read once: React's development re-run of this effect would find the Close button focused.
  useEffect(() => {
    const before = firstFocus(opener, document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const mine = closeButton.current
    mine?.focus({ preventScroll: true })
    return () => {
      // Unless something else has taken the focus since (the Close button itself still holding it is a development re-run, not a close).
      const held = document.activeElement
      if (held && held !== document.body && held !== document.documentElement && held !== mine) return
      handBackFocus(focusTarget(before, document.body, (fallbacks.current ?? []).map(r => r.current)))
    }
  }, [])

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Stopped here so the panel behind (which closes on Escape from the window) stays open.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    // One control in the sheet: Tab would only leave it for the page behind the scrim.
    else if (e.key === 'Tab') e.preventDefault()
  }

  const title = t('appointments.shortcuts.title', 'Keyboard shortcuts')
  const or = t('appointments.shortcuts.or', 'or')

  return (
    <>
      <button type="button" aria-label={t('appointments.common.close', 'Close')} tabIndex={-1} onClick={onClose}
        className="fixed inset-0 z-50 cursor-default bg-a-scrim/40 animate-a-fade" />
      {/* Centred with auto margins, not translate: the pop animation ends on transform: none and would undo a translate. */}
      <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onPanelKey}
        className="fixed inset-x-0 top-24 z-50 mx-auto max-h-[calc(100vh-8rem)] w-[min(30rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-a-border bg-a-surface p-5 text-a-text shadow-a-lg animate-a-pop focus:outline-none">
        <SectionTitle>{title}</SectionTitle>
        {/* Keys for every page, then the calendar's own: the sheet opens anywhere, the day, view and panel keys work only there. */}
        <dl className="mt-2 divide-y divide-a-border">
          <Row name={t('appointments.shortcuts.find', 'Find')}>
            <Keys>{[`${modKey} K`]}</Keys><span className="text-xs">{or}</span><Keys>{['/']}</Keys>
          </Row>
          <Row name={t('appointments.shell.new_appointment', 'New appointment')}><Keys>{['N']}</Keys></Row>
          <Row name={t('appointments.shortcuts.help', 'This list')}><Keys>{['?']}</Keys></Row>
        </dl>
        <h3 className="mt-4 font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{t('appointments.shortcuts.on_calendar', 'On the calendar')}</h3>
        <dl className="mt-1 divide-y divide-a-border">
          <Row name={t('appointments.calendar.today', 'Today')}><Keys>{['T']}</Keys></Row>
          <Row name={t('appointments.shortcuts.days', 'Previous or next day (week in the week view)')}><Keys>{['←', '→']}</Keys></Row>
          <Row name={t('appointments.shortcuts.views', 'Day, week, list')}><Keys>{['D', 'W', 'L']}</Keys></Row>
          <Row name={t('appointments.shortcuts.close', 'Close the panel')}><Keys>{['Esc']}</Keys></Row>
          <Row name={t('appointments.shortcuts.card', 'Move a selected appointment')}><Keys>{['↑', '↓', '←', '→']}</Keys></Row>
        </dl>
        <div className="mt-4 flex justify-end">
          <button ref={closeButton} type="button" onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-a-border bg-a-surface px-4 text-sm font-semibold text-a-text transition hover:bg-a-surface-2">
            {t('appointments.common.close', 'Close')}
          </button>
        </div>
      </div>
    </>
  )
}
