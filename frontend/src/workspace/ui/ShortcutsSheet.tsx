import { Fragment, useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { firstFocus, focusTarget } from '../find/findCore'
import { handBackFocus } from '../lib/handBack'
import { SectionTitle } from './Typography'

/** One shortcut: its name and its keys. Each inner list is one way to press it; the ways are joined by "or". */
export interface ShortcutRow { name: string; keys: string[][] }
/** A group of rows. The first has no heading (the keys for every page); a later one names where its keys work. */
export interface ShortcutSection { title?: string; rows: ShortcutRow[] }

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
 * The list of keyboard shortcuts behind "?": a modal sheet of the
 * workspace's own sections. The focus moves onto its Close button when it
 * opens and returns to where it was when it closes; Escape and the scrim
 * close it. Nothing is drawn while it is closed.
 */
export function ShortcutsSheet({ open, onClose, sections, fallbackFocus }: {
  open: boolean
  onClose: () => void
  sections: ShortcutSection[]
  /** Where the focus goes on close when the person was on nothing in particular (or the place is gone), tried in order. */
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  if (!open) return null
  return <ShortcutsPanel onClose={onClose} sections={sections} fallbackFocus={fallbackFocus} />
}

function ShortcutsPanel({ onClose, sections, fallbackFocus }: { onClose: () => void; sections: ShortcutSection[]; fallbackFocus?: RefObject<HTMLElement | null>[] }) {
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

  const title = t('workspace.shortcuts.title', 'Keyboard shortcuts')
  const or = t('workspace.shortcuts.or', 'or')

  return (
    <>
      <button type="button" aria-label={t('workspace.common.close', 'Close')} tabIndex={-1} onClick={onClose}
        className="fixed inset-0 z-50 cursor-default bg-a-scrim/40 animate-a-fade" />
      {/* Centred with auto margins, not translate: the pop animation ends on transform: none and would undo a translate. */}
      <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onPanelKey}
        className="fixed inset-x-0 top-24 z-50 mx-auto max-h-[calc(100vh-8rem)] w-[min(30rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-a-border bg-a-surface p-5 text-a-text shadow-a-lg animate-a-pop focus:outline-none">
        <SectionTitle>{title}</SectionTitle>
        {sections.map((section, i) => (
          <Fragment key={section.title ?? i}>
            {section.title && <h3 className="mt-4 font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{section.title}</h3>}
            <dl className={`${section.title ? 'mt-1' : 'mt-2'} divide-y divide-a-border`}>
              {section.rows.map(row => (
                <Row key={row.name} name={row.name}>
                  {row.keys.map((way, j) => (
                    <Fragment key={way.join(' ')}>
                      {j > 0 && <span className="text-xs">{or}</span>}
                      <Keys>{way}</Keys>
                    </Fragment>
                  ))}
                </Row>
              ))}
            </dl>
          </Fragment>
        ))}
        <div className="mt-4 flex justify-end">
          <button ref={closeButton} type="button" onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-a-border bg-a-surface px-4 text-sm font-semibold text-a-text transition hover:bg-a-surface-2">
            {t('workspace.common.close', 'Close')}
          </button>
        </div>
      </div>
    </>
  )
}
