import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, type LucideIcon } from 'lucide-react'
import { handBackFocus } from '../lib/handBack'
import { focusTarget, nextActive, opensShortcuts, type FindItem } from './findCore'

const LIST_ID = 'find-list'
const optionId = (id: string): string => `find-opt-${id}`

export interface FindGroup<I extends FindItem> { title: string; items: I[] }

/** The grouped, selectable results: a listbox the input points at with aria-activedescendant. */
export function FindList<I extends FindItem>({ groups, activeId, onPick, onHover, iconOf }: {
  groups: FindGroup<I>[]
  activeId: string | null
  onPick: (item: I) => void
  onHover: (id: string) => void
  /** The workspace's icon for each kind of result. */
  iconOf: (item: I) => LucideIcon
}) {
  return (
    <ul id={LIST_ID} role="listbox" className="max-h-[min(24rem,50vh)] overflow-y-auto p-2">
      {groups.map(group => (
        <li key={group.title} role="presentation" className="pb-1">
          <div aria-hidden className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-a-text-2">{group.title}</div>
          <ul role="group" aria-label={group.title}>
            {group.items.map(item => {
              const Icon = iconOf(item)
              const active = item.id === activeId
              return (
                <li key={item.id} id={optionId(item.id)} role="option" aria-selected={active}
                  onClick={() => onPick(item)} onMouseMove={() => { if (!active) onHover(item.id) }}
                  className={`flex scroll-mt-9 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${active ? 'bg-a-surface-2 ring-1 ring-inset ring-a-accent-text' : ''}`}>
                  <Icon size={16} aria-hidden className="shrink-0 text-a-text-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-a-text">{item.label}</span>
                    {item.sub && <span className="block truncate text-xs text-a-text-2">{item.sub}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}

const kbd = 'rounded-md border border-a-border px-1.5 font-a-mono text-xs text-a-text-2'

/**
 * Find's box, the same in every workspace: a modal over a scrim with one
 * input (a combobox over the result list), arrow keys and Enter, "?" in an
 * empty box for the list of shortcuts, Escape and Tab kept inside, and the
 * focus handed back to where it was when it closes (or to the fallbacks).
 * What it finds is the workspace's: the workspace holds the query, passes
 * the groups in, and hears which item was chosen; the frame never closes
 * itself on a choice.
 */
export function FindFrame<I extends FindItem>({ prompt, query, onQuery, groups, iconOf, onPick, onShortcuts, onClose, waiting, fallbackFocus }: {
  /** The input's name and placeholder ("Find a client, appointment or action"). */
  prompt: string
  query: string
  onQuery: (query: string) => void
  groups: FindGroup<I>[]
  iconOf: (item: I) => LucideIcon
  /** A result was chosen (Enter or a click). */
  onPick: (item: I) => void
  /** "?" in an empty box. */
  onShortcuts: () => void
  onClose: () => void
  /** A line under the list while the workspace is still looking ("Searching clients…"), or nothing. */
  waiting?: string | null
  /** Where the focus goes on close when the person was on nothing in particular (or the place is gone), tried in order. */
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)
  // Where the person was before Find opened, read once when it opens.
  const [before] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)))
  const items = groups.flatMap(g => g.items)
  const current = items.find(i => i.id === activeId) ?? items[0]
  const currentId = current?.id ?? null

  // Arrowing past the visible part of a long list brings the option into view.
  useEffect(() => {
    if (currentId) document.getElementById(optionId(currentId))?.scrollIntoView?.({ block: 'nearest' })
  }, [currentId])

  // Back to where the person was (or, if that was the page body or is gone, to the fallbacks), unless something else — a panel the choice opened — has taken the focus since.
  const fallbacks = useRef(fallbackFocus)
  useEffect(() => { fallbacks.current = fallbackFocus })
  useEffect(() => () => {
    const held = document.activeElement
    if (held && held !== document.body && held !== document.documentElement) return
    handBackFocus(focusTarget(before, document.body, (fallbacks.current ?? []).map(r => r.current)))
  }, [before])

  const focusInput = useCallback((el: HTMLInputElement | null) => { el?.focus({ preventScroll: true }) }, [])

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveId(nextActive(items.map(i => i.id), currentId, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter' && current) {
      e.preventDefault()
      onPick(current)
    } else if (opensShortcuts(e.key, query)) {
      // The footer's "? This list": the one place a question mark is not a character of the search.
      e.preventDefault()
      onShortcuts()
    }
  }
  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    // The input is the one control in the box: Tab would only leave it for the page behind the scrim.
    else if (e.key === 'Tab') e.preventDefault()
  }

  const typed = query.trim()
  // While the workspace is still looking, nothing is missing yet: no "Nothing matches" until the answer is in.
  const none = typed !== '' && items.length === 0 && !waiting
  const status = none
    ? t('workspace.find.none', 'Nothing matches “{{q}}”.', { q: typed })
    : waiting && items.length === 0
      ? waiting
      : t('workspace.find.count', 'Results: {{count}}', { count: items.length })

  return (
    <>
      <button type="button" aria-label={t('workspace.common.close', 'Close')} tabIndex={-1} onClick={onClose}
        className="fixed inset-0 z-50 cursor-default bg-a-scrim/40 animate-a-fade" />
      {/* Centred with auto margins, not translate: the pop animation ends on transform: none and would undo a translate. */}
      <div role="dialog" aria-modal="true" aria-label={t('workspace.find.title', 'Find')} onKeyDown={onPanelKey}
        onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault() }}
        className="fixed inset-x-0 top-24 z-50 mx-auto w-[min(40rem,calc(100%-2rem))] overflow-hidden rounded-2xl border border-a-border bg-a-surface text-a-text shadow-a-lg animate-a-pop">
        {/* The focus never leaves the input: the row shows it, as an underline (workspace.css, [data-find-row]). */}
        <div data-find-row="" className="flex items-center gap-3 border-b border-a-border px-4 py-3">
          <Search size={18} aria-hidden className="shrink-0 text-a-text-2" />
          <input ref={focusInput} value={query} onChange={(e) => { onQuery(e.target.value); setActiveId(null) }} onKeyDown={onInputKey}
            role="combobox" aria-expanded="true" aria-controls={LIST_ID} aria-autocomplete="list" aria-activedescendant={current ? optionId(current.id) : undefined}
            aria-label={prompt} placeholder={prompt} autoComplete="off" spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base text-a-text placeholder:text-a-text-2 sm:text-sm" />
        </div>

        <FindList groups={groups} activeId={currentId} onPick={onPick} onHover={setActiveId} iconOf={iconOf} />

        {none && <p aria-hidden className="px-4 pb-4 text-sm text-a-text-2">{status}</p>}
        {waiting && <p className="px-4 pb-3 text-xs text-a-text-2">{waiting}</p>}
        <p role="status" aria-live="polite" className="sr-only">{status}</p>

        <div className="hidden items-center gap-4 border-t border-a-border px-4 py-2 text-xs text-a-text-2 sm:flex">
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>↑</kbd><kbd className={kbd}>↓</kbd>{t('workspace.find.hint_move', 'move')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>Enter</kbd>{t('workspace.find.hint_open', 'open')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>Esc</kbd>{t('workspace.find.hint_close', 'close')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>?</kbd>{t('workspace.shortcuts.help', 'This list')}</span>
        </div>
      </div>
    </>
  )
}
