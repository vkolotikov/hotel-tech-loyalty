import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrandId } from '../ContentProvider'
import type { DateKey, Platform, PostCard } from '../lib/types'
import { allocateOpening, discardOpening, openingIsLive, ownerOf, reserveOpening } from './kept'
import { sameOpening } from './draftCompletion'
import { contentDrafts } from '../drafts/registry'
import { keptTarget } from './kept'
import type { PostForm } from './panelState'
import { withWriting, type OutsideWrite } from './writing'

/**
 * What a new post starts from: the day, platform and time a day's "+", a slot or the New post button gave; `fields` are
 * words it starts with (a key date's name as its topic, a template's words: spec 2026-10-16 §3.4, §5.3).
 */
export interface NewDraft {
  date: DateKey | null
  platform: Platform | null
  time?: string | null
  fields?: Partial<Pick<PostForm, 'topic' | 'hook' | 'main_copy' | 'cta' | 'hashtags' | 'pillar_id'>>
}
/** What the post panel shows. `seq` remounts it for every opening, so no state leaks from one post to the next. */
export type PanelTarget = { kind: 'post'; id: number; seq: number } | { kind: 'new'; draft: NewDraft; seq: number }

export interface PanelApi {
  target: PanelTarget | null
  currentOpening: () => number
  /** Capture before async work; false after another opening, close, brand or session. */
  capture: () => () => boolean
  isCurrent: (owner: string, seq: number) => boolean
  identify: (id: number, owner: string, seq: number) => void
  /** Open a post; false when the person chose to keep their unsaved edits. */
  open: (id: number) => boolean
  openNew: (draft: NewDraft) => boolean
  /** Close; false when the person chose to keep their unsaved edits. */
  close: () => boolean
  /** Show another post without asking: the one just created, or the copy just made. */
  replace: (id: number) => void
  /** The panel says whether it holds unsaved edits or an unacknowledged submission. */
  reportDirty: (dirty: boolean) => void
  /** Ask before something else that would drop unsaved edits; true to go ahead. */
  guard: () => boolean
  /** Whether the panel holds edits or a submission nobody chose to drop (so they are kept when the portal goes away). */
  holdsEdits: () => boolean
  /** The last post this person moved on the Plan: the panel showing it takes the new day under any unsaved edits. */
  moved: PostCard | null
  noteMoved: (card: PostCard) => void
  /** The writes the AI is doing for posts from outside the panel ("Write with AI" from a template, spec 2026-10-16 §5.3), by post id. */
  writing: Record<number, OutsideWrite>
  /** One post's write: working ({ failed: null }), failed (its code), or done (null) — the other posts' are left alone. */
  noteWriting: (id: number, state: OutsideWrite | null) => void
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
  const brand = useBrandId()
  // Edits kept when the portal last went away (kept.ts) reopen their post.
  const [target, setTarget] = useState<PanelTarget | null>(() => initial ?? keptTarget(ownerOf(brand)))
  const [moved, setMoved] = useState<PostCard | null>(null)
  const [writing, setWriting] = useState<PanelApi['writing']>({})
  const dirty = useRef(false)
  // The panel belongs to one brand: another brand — chosen (it already asked) or the server's fallback — closes it.
  // From no brand yet (the first read) nothing closes: a post kept from the last visit comes back on its brand.
  const [brandShown, setBrandShown] = useState(brand)
  if (brand !== brandShown) {
    setBrandShown(brand)
    if (brandShown !== null) setTarget(null)
    else if (!initial && !keptTarget(ownerOf(brand))) setTarget(null)
  }
  const brandBefore = useRef(brand)
  useEffect(() => {
    if (brandBefore.current !== null && brandBefore.current !== brand) dirty.current = false
    brandBefore.current = brand
  }, [brand])
  const [initialOpening] = useState(() => target ? reserveOpening(target.seq) : allocateOpening())
  const seq = useRef(initialOpening)
  const sessionOwner = ownerOf(brand)
  const current = useRef({ owner: sessionOwner, target })
  useLayoutEffect(() => {
    const previous = current.current
    if (previous.target && previous.target.seq !== target?.seq) discardOpening(previous.owner, previous.target.seq)
    current.current = { owner: sessionOwner, target }
  }, [sessionOwner, target])
  const isCurrent = useCallback((owner: string, opening: number) => openingIsLive(opening) && sameOpening(owner, opening, current.current.owner, current.current.target?.seq) && ownerOf(brand) === owner, [brand])
  const currentOpening = useCallback(() => seq.current, [])
  const capture = useCallback(() => {
    const opening = seq.current
    const owner = current.current.owner
    return () => openingIsLive(opening) && seq.current === opening && current.current.owner === owner && ownerOf(brand) === owner
  }, [brand])
  const identify = useCallback((id: number, owner: string, opening: number) => {
    if (isCurrent(owner, opening)) setTarget({ kind: 'post', id, seq: opening })
  }, [isCurrent])

  const discardCurrent = useCallback(() => {
    const previous = current.current
    if (previous.target) discardOpening(previous.owner, previous.target.seq)
    dirty.current = false
  }, [])
  const guardPost = useCallback(() => {
    const ok = mayDrop(dirty.current, () => window.confirm(t('content.panel.discard', 'Discard your unsaved changes to this post?')))
    if (ok) discardCurrent()
    return ok
  }, [t, discardCurrent])
  const guard = useCallback(() => {
    const owner = ownerOf(brand)
    const session = owner.slice(0, owner.lastIndexOf('|'))
    if (!mayDrop(dirty.current || contentDrafts.dirtySession(session), () => window.confirm(t('content.common.discard_drafts', 'Discard your unsaved changes?')))) return false
    discardCurrent()
    seq.current = allocateOpening()
    setTarget(null)
    contentDrafts.clearSession(session)
    return true
  }, [t, brand, discardCurrent])

  const open = useCallback((id: number) => {
    if (target?.kind === 'post' && target.id === id) return true
    if (!guardPost()) return false
    seq.current = allocateOpening()
    setTarget({ kind: 'post', id, seq: seq.current })
    return true
  }, [target, guardPost])

  const openNew = useCallback((draft: NewDraft) => {
    if (!guardPost()) return false
    seq.current = allocateOpening()
    setTarget({ kind: 'new', draft, seq: seq.current })
    return true
  }, [guardPost])

  const close = useCallback(() => {
    if (!guardPost()) return false
    seq.current = allocateOpening()
    setTarget(null)
    return true
  }, [guardPost])

  const replace = useCallback((id: number) => {
    discardCurrent()
    seq.current = allocateOpening()
    setTarget({ kind: 'post', id, seq: seq.current })
  }, [discardCurrent])

  const reportDirty = useCallback((value: boolean) => { dirty.current = value }, [])
  const holdsEdits = useCallback(() => dirty.current, [])
  const noteMoved = useCallback((card: PostCard) => { setMoved(card) }, [])
  const noteWriting = useCallback((id: number, state: OutsideWrite | null) => { setWriting(w => withWriting(w, id, state)) }, [])

  // Leaving the site (a reload, a closed tab) with unsaved edits asks the browser's own question.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault() }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  const value = useMemo<PanelApi>(
    () => ({ target, currentOpening, capture, isCurrent, identify, open, openNew, close, replace, reportDirty, guard, holdsEdits, moved, noteMoved, writing, noteWriting }),
    [target, currentOpening, capture, isCurrent, identify, open, openNew, close, replace, reportDirty, guard, holdsEdits, moved, noteMoved, writing, noteWriting],
  )
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}
