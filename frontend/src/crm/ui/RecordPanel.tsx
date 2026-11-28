import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Maximize2, X, type LucideIcon } from 'lucide-react'
import { modalScope } from '../../workspace/lib/modalScope'
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

interface TabStripProps {
  tabs: RecordTab[]
  tab: string
  onTab: (key: string) => void
}

function TabStrip({ idPrefix, tabs, tab, onTab, label, variant }: TabStripProps & {
  idPrefix: string
  label?: string
  variant: 'record' | 'grouped' | 'secondary'
}) {
  const keys = tabs.map(t => t.key)
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = sectionAfter(keys, tab, e.key)
    if (!next) return
    e.preventDefault()
    onTab(next)
    document.getElementById(`${idPrefix}-tab-${next}`)?.focus()
  }
  const secondary = variant === 'secondary'
  const grouped = variant === 'grouped'
  return (
    <div role="tablist" aria-label={label} className={secondary
      ? 'mb-4 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-a-surface-2 p-1'
      : `-mb-px mt-3 flex overflow-x-auto [scrollbar-width:none] ${grouped ? 'justify-between sm:justify-start sm:gap-2' : 'gap-1'}`}>
      {tabs.map(({ key, label: name, icon: Icon, count }) => {
        const on = key === tab
        const color = secondary
          ? (on ? 'bg-a-surface text-a-text shadow-sm' : 'text-a-text-2 hover:text-a-text')
          : (on ? 'border-a-accent text-a-text' : 'border-transparent text-a-text-2 hover:text-a-text')
        const layout = secondary ? 'min-h-9 shrink-0 gap-1.5 rounded-lg px-3 text-xs sm:text-sm'
          : grouped ? 'min-h-12 min-w-0 flex-1 flex-col justify-center gap-1 border-b-2 px-0.5 text-xs sm:min-h-10 sm:flex-none sm:flex-row sm:gap-2 sm:px-3 sm:text-sm'
            : 'shrink-0 gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1.5 text-sm'
        return (
          <button key={key} type="button" role="tab" id={`${idPrefix}-tab-${key}`} aria-selected={on} aria-controls={`${idPrefix}-panel`}
            tabIndex={on ? 0 : -1} onClick={() => onTab(key)} onKeyDown={onKey}
            className={`flex items-center font-medium transition-colors focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-a-accent ${layout} ${color}`}>
            <Icon size={15} aria-hidden className="shrink-0" />
            <span className="whitespace-nowrap">{name}</span>
            {count !== undefined && count > 0 && <span className={`rounded-full bg-a-surface-2 px-1.5 text-xs leading-5 text-a-text ${grouped ? 'max-sm:sr-only' : ''}`}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function RecordFrame({ idPrefix, title, avatar, subtitle, badges, actions, tools, tabs, tab, onTab, children, titleId, grouped, secondary }: {
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
  grouped?: boolean
  secondary?: TabStripProps & { label: string }
}) {
  const current = tabs.some(item => item.key === tab) ? tab : tabs[0]?.key
  const secondaryId = `${idPrefix}-section`
  const nested = secondary && secondary.tabs.length > 1
  const compactIdentity = grouped && !!tools
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-a-border px-4 pt-4 sm:px-5">
        <div className={compactIdentity ? 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 sm:flex sm:gap-3' : 'flex items-start gap-3'}>
          {compactIdentity ? <div className="hidden sm:block">{avatar}</div> : avatar}
          <div className={compactIdentity ? 'contents sm:block sm:min-w-0 sm:flex-1' : 'min-w-0 flex-1'}>
            <div className={`${compactIdentity ? 'contents sm:flex' : 'flex'} min-w-0 flex-wrap items-center gap-x-2 gap-y-1`}>
              <h2 id={titleId} className={`min-w-0 font-a-display text-2xl leading-tight text-a-text ${compactIdentity ? 'col-start-1 row-start-1 self-center break-words sm:truncate' : 'truncate'}`}>{title}</h2>
              {badges && <div className="col-span-2 row-start-2">{badges}</div>}
            </div>
            {subtitle && <div className="col-span-2 row-start-3 mt-0.5 min-w-0 truncate text-sm text-a-text-2">{subtitle}</div>}
          </div>
          {tools && <div className="col-start-2 row-start-1 -mr-1.5 -mt-1 flex shrink-0 items-center">{tools}</div>}
        </div>
        {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
        <TabStrip idPrefix={idPrefix} tabs={tabs} tab={current} onTab={onTab}
          label={typeof title === 'string' ? title : undefined} variant={grouped ? 'grouped' : 'record'} />
      </div>
      <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${current}`} tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 outline-hidden sm:px-5">
        {nested ? <>
          <TabStrip {...secondary} idPrefix={secondaryId} variant="secondary" />
          <div id={`${secondaryId}-panel`} role="tabpanel" aria-labelledby={`${secondaryId}-tab-${secondary.tab}`}>{children}</div>
        </> : children}
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
    const panel = box.current
    if (!panel) return
    const release = modalScope(panel, () => handlers.current.onClose(), { afterChildren: true })
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || !(e.target instanceof HTMLElement) || e.target.closest('[aria-modal="true"]') !== panel) return
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if (typing || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === '[' && handlers.current.onPrev) { e.preventDefault(); handlers.current.onPrev() }
      if (e.key === ']' && handlers.current.onNext) { e.preventDefault(); handlers.current.onNext() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      release()
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
    <div className="fixed inset-0 z-50 m-0! bg-a-scrim/40" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-a-border bg-a-surface shadow-a-lg outline-hidden animate-a-slide-in sm:max-w-[min(56rem,calc(100vw-3rem))]">
        {children(tools, titleId)}
      </div>
    </div>
  )
}
