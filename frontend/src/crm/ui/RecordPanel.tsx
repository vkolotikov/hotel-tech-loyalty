import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Maximize2, X, type LucideIcon } from 'lucide-react'
import { handBackFocus } from '../../workspace/lib/handBack'
import { sectionAfter } from './SectionNav'
import { IconButton } from './IconButton'

/**
 * Round 5 (owner 2026-11-12, "opening tabs, slides or popups … easy to navigate"): a record — a lead, a contact, a
 * company — as one frame: who or what it is, its badges, its few main actions as buttons with icons, then its parts as
 * tabs (Overview, Activity, Tasks, Emails, Files…), each with what it holds. `RecordFrame` is the frame; `RecordPanel`
 * slides it in from the right over the page it was opened on (previous and next through the list it came from, the
 * full page, close), and a record's own page draws the same frame full width.
 */

export interface RecordTab { key: string; label: string; icon: LucideIcon; count?: number }

/** What the record host hands each record's panel (`leads/LeadRecord`, `contacts/ContactRecord`, `contacts/CompanyRecord`). */
export interface RecordHostProps {
  id: number
  /** The tab the address names (`?rtab=`), or null for the record's first. */
  tab: string | null
  onTab: (tab: string) => void
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
}

export function RecordFrame({ idPrefix, title, avatar, subtitle, badges, actions, tools, tabs, tab, onTab, children, titleId }: {
  idPrefix: string
  title: ReactNode
  avatar?: ReactNode
  subtitle?: ReactNode
  badges?: ReactNode
  actions?: ReactNode
  /** The small icon buttons at the top right (previous, next, full page, close). */
  tools?: ReactNode
  tabs: RecordTab[]
  tab: string
  onTab: (key: string) => void
  children: ReactNode
  titleId?: string
}) {
  const keys = tabs.map(t => t.key)
  const current = keys.includes(tab) ? tab : keys[0]
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = sectionAfter(keys, current, e.key)
    if (!next) return
    e.preventDefault()
    onTab(next)
    document.getElementById(`${idPrefix}-tab-${next}`)?.focus()
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-a-border px-4 pt-4 sm:px-5">
        <div className="flex items-start gap-3">
          {avatar}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id={titleId} className="min-w-0 truncate font-a-display text-2xl leading-tight text-a-text">{title}</h2>
              {badges}
            </div>
            {subtitle && <div className="mt-0.5 min-w-0 truncate text-sm text-a-text-2">{subtitle}</div>}
          </div>
          {tools && <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">{tools}</div>}
        </div>
        {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
        <div role="tablist" aria-label={typeof title === 'string' ? title : undefined} className="-mb-px mt-3 flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map(({ key, label, icon: Icon, count }) => {
            const on = key === current
            return (
              <button key={key} type="button" role="tab" id={`${idPrefix}-tab-${key}`} aria-selected={on} aria-controls={`${idPrefix}-panel`} tabIndex={on ? 0 : -1}
                onClick={() => onTab(key)} onKeyDown={onKey}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${on ? 'border-a-accent text-a-text' : 'border-transparent text-a-text-2 hover:text-a-text'}`}>
                <Icon size={15} aria-hidden />
                <span className="whitespace-nowrap">{label}</span>
                {count !== undefined && count > 0 && <span className="rounded-full bg-a-surface-2 px-1.5 text-xs leading-5 text-a-text">{count}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${current}`} tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 outline-hidden sm:px-5">
        {children}
      </div>
    </div>
  )
}

/**
 * The frame in a panel from the right: takes the focus, closes on Escape (unless a dialog in it claimed Escape first)
 * and on the scrim, gives the focus back. `[` and `]` step to the previous and next record. Full width on a phone.
 */
export function RecordPanel({ label, onClose, fullHref, onPrev, onNext, children }: {
  /** The panel's name for a screen reader (the record's name). */
  label: string
  onClose: () => void
  fullHref?: string
  onPrev?: (() => void) | null
  onNext?: (() => void) | null
  /** The record's frame: `(tools, titleId) => <RecordFrame … tools={tools} titleId={titleId} />`. */
  children: (tools: ReactNode, titleId: string) => ReactNode
}) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const handlers = useRef({ onClose, onPrev, onNext })
  useEffect(() => { handlers.current = { onClose, onPrev, onNext } }, [onClose, onPrev, onNext])
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    box.current?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape') { e.preventDefault(); handlers.current.onClose(); return }
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if (typing || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === '[' && handlers.current.onPrev) { e.preventDefault(); handlers.current.onPrev() }
      if (e.key === ']' && handlers.current.onNext) { e.preventDefault(); handlers.current.onNext() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (before?.isConnected) handBackFocus(before)
    }
  }, [])
  const tools = (
    <>
      <IconButton icon={ChevronUp} size="sm" label={t('crm.record.previous', 'Previous')} onClick={() => onPrev?.()} disabled={!onPrev} />
      <IconButton icon={ChevronDown} size="sm" label={t('crm.record.next', 'Next')} onClick={() => onNext?.()} disabled={!onNext} />
      {fullHref && <IconButton icon={Maximize2} size="sm" label={t('crm.record.full_page', 'Open as a page')} to={fullHref} />}
      <IconButton icon={X} size="sm" label={t('crm.common.close', 'Close')} onClick={onClose} />
    </>
  )
  return (
    <div className="fixed inset-0 z-50 m-0!">
      <button type="button" tabIndex={-1} aria-label={t('crm.common.close', 'Close')} onClick={onClose} className="absolute inset-0 cursor-default bg-a-scrim/40 animate-a-fade" />
      <div ref={box} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-a-border bg-a-surface shadow-a-lg outline-hidden animate-a-slide-in sm:max-w-[min(56rem,calc(100vw-3rem))]">
        {children(tools, titleId)}
      </div>
    </div>
  )
}
