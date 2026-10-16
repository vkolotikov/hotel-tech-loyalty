import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrandId } from '../ContentProvider'
import type { DateKey, Platform, PostCard } from '../lib/types'
import { keptTarget } from './kept'

/** What a new post starts from: the day, platform and time a day's "+", a slot or the New post button gave. */
export interface NewDraft { date: DateKey | null; platform: Platform | null; time?: string | null }
/** What the post panel shows. `seq` remounts it for every opening, so no state leaks from one post to the next. */
export type PanelTarget = { kind: 'post'; id: number; seq: number } | { kind: 'new'; draft: NewDraft; seq: number }

export interface PanelApi {
  target: PanelTarget | null
  /** Open a post; false when the person chose to keep their unsaved edits. */
  open: (id: number) => boolean
  openNew: (draft: NewDraft) => boolean
  /** Close; false when the person chose to keep their unsaved edits. */
  close: () => boolean
  /** Show another post without asking: the one just created, or the copy just made. */
  replace: (id: number) => void
  /** The panel says whether it holds unsaved edits. */
  reportDirty: (dirty: boolean) => void
  /** Ask before something else that would drop unsaved edits; true to go ahead. */
  guard: () => boolean
  /** Whether the panel holds unsaved edits nobody chose to drop (so they are kept when the portal goes away). */
  holdsEdits: () => boolean
  /** The last post this person moved on the Plan: the panel showing it takes the new day under any unsaved edits. */
  moved: PostCard | null
  noteMoved: (card: PostCard) => void
}

/** Whether something that drops unsaved edits may go ahead: always without edits; with edits only when the person says so. */
// eslint-disable-next-line react-refresh/only-export-components
export function mayDrop(dirty: boolean, ask: () => boolean): boolean {
  return !dirty || ask()
}

const PanelContext = createContext<PanelApi | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function usePanel(): PanelApi {
  const value = useContext(PanelContext)
  if (!value) throw new Error('usePanel() was called outside PanelProvider')
  return value
}

/**
 * The post panel's state for the whole portal (spec §4.3). It stays open
 * across the pages, so moving between them never drops an edit; everything
 * that would drop one — closing it, opening another post, switching brand,
 * "Full admin", Sign out, leaving the site — asks first. The browser's Back
 * out of the portal cannot ask: the edits are kept in the tab and come back
 * with the portal (kept.ts).
 */
export function PanelProvider({ initial = null, children }: {
  /** What the panel shows on its first render (the tests open a post this way). */
  initial?: PanelTarget | null
  children: ReactNode
}) {
  const { t } = useTranslation()
  // Edits kept when the portal last went away (kept.ts) reopen their post.
  const [target, setTarget] = useState<PanelTarget | null>(() => initial ?? keptTarget())
  const [moved, setMoved] = useState<PostCard | null>(null)
  const dirty = useRef(false)
  // The panel belongs to one brand: another brand — chosen (it already asked) or the server's fallback — closes it.
  // From no brand yet (the first read) nothing closes: a post kept from the last visit comes back on its brand.
  const brand = useBrandId()
  const [brandShown, setBrandShown] = useState(brand)
  if (brand !== brandShown) {
    setBrandShown(brand)
    if (brandShown !== null) setTarget(null)
  }
  const brandBefore = useRef(brand)
  useEffect(() => {
    if (brandBefore.current !== null && brandBefore.current !== brand) dirty.current = false
    brandBefore.current = brand
  }, [brand])
  const seq = useRef(target?.seq ?? 0)

  const guard = useCallback(() => {
    const ok = mayDrop(dirty.current, () => window.confirm(t('content.panel.discard', 'Discard your unsaved changes to this post?')))
    if (ok) dirty.current = false
    return ok
  }, [t])

  const open = useCallback((id: number) => {
    if (target?.kind === 'post' && target.id === id) return true
    if (!guard()) return false
    seq.current += 1
    setTarget({ kind: 'post', id, seq: seq.current })
    return true
  }, [target, guard])

  const openNew = useCallback((draft: NewDraft) => {
    if (!guard()) return false
    seq.current += 1
    setTarget({ kind: 'new', draft, seq: seq.current })
    return true
  }, [guard])

  const close = useCallback(() => {
    if (!guard()) return false
    setTarget(null)
    return true
  }, [guard])

  const replace = useCallback((id: number) => {
    dirty.current = false
    seq.current += 1
    setTarget({ kind: 'post', id, seq: seq.current })
  }, [])

  const reportDirty = useCallback((value: boolean) => { dirty.current = value }, [])
  const holdsEdits = useCallback(() => dirty.current, [])
  const noteMoved = useCallback((card: PostCard) => { setMoved(card) }, [])

  // Leaving the site (a reload, a closed tab) with unsaved edits asks the browser's own question.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault() }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  const value = useMemo<PanelApi>(
    () => ({ target, open, openNew, close, replace, reportDirty, guard, holdsEdits, moved, noteMoved }),
    [target, open, openNew, close, replace, reportDirty, guard, holdsEdits, moved, noteMoved],
  )
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}
