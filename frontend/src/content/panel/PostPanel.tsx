import { Link } from 'react-router-dom'
import { PostMedia } from '../media/PostMedia'
import { createContext, memo, useContext, useLayoutEffect, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { modalScope } from '../../workspace/lib/modalScope'
import { handBackFocus } from '../../workspace/lib/handBack'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageBoundary } from '../../workspace/ui/PageBoundary'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { staffLocked, statusChoices } from '../lib/approval'
import { errorKey } from '../lib/errors'
import { cardOf, putInPlans, putPost, refreshLists } from '../lib/planCache'
import type { PostDetail } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusPill } from '../ui/StatusDot'
import { usualTimes } from '../plan/addMath'
import { completedSave, hasPendingEdits, needsDraftProtection } from './draftCompletion'
import { dropKept, keep, keptFor, ownerOf, updateKept, onKeptUpdate } from './kept'
import { usePanel, type PanelTarget } from './PanelProvider'
import { AiTools } from './AiTools'
import { MoreOutcome } from './MoreOutcome'
import { PanelFailed } from './PanelFailed'
import { PanelMore } from './PanelMore'
import { activityCount, dayLine, openingTab, paneId, saveLabelKey, tabId, type PanelTab } from './panelMath'
import { loadPanelTab, savePanelTab } from './panelPrefs'
import { PanelTabList } from './PanelTabs'
import { usePostActions } from './postActionsState'
import { ProgressActions } from './ProgressActions'
import { usePanelMode } from './usePanelMode'
import { PostFormFields } from './PostFormFields'
import { PromotesLine } from './PromotesLine'
import { postQuery } from './panelQuery'
import { pollsWhileRewording } from './repeatMath'
import { RepeatSection } from './RepeatSection'
import { VersionsSection } from './VersionsSection'
import { ReviewBar } from './ReviewBar'
import { Timeline } from './Timeline'
import { adoptedPost, changes, createBody, formOf, newForm, newer, posterChoices, rebase, refusalOf, withChannels, type Editing, type PostForm } from './panelState'

/**
 * The post panel (spec §4.3, spec 2026-10-21 §7): one post at a time (PanelProvider) — a column beside the page from
 * 1280 px, over the page's right edge below that, the whole screen on a phone.
 */
export function PostPanel() {
  const { target } = usePanel()
  const editor = usePostEditor()
  const failed = useContext(EditorFailedContext)
  if (target && failed) return <PanelFailed />
  if (!target || !editor) return null
  return <PanelBody key={target.seq} />
}

function useEditorController(target: PanelTarget) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const panel = usePanel()
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const panelNow = useRef(panel)
  useLayoutEffect(() => { panelNow.current = panel }, [panel])
  const owner = ownerOf(brand)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const current = () => live.current && panel.isCurrent(owner, target.seq)
  const id = target.kind === 'post' ? target.id : null

  // A post cached without its timeline is read again on opening; one whose series the AI rewords, every 5 s (panelQuery.ts).
  const detail = useQuery(postQuery(brand, id, () => api.post(id as number).then(r => r.post)))
  const strategies = useQuery({ queryKey: ['content', brand, 'strategies'], queryFn: api.strategies, staleTime: 300_000 })
  const activeId = strategies.data?.strategies.find(s => s.status === 'active')?.id ?? null
  const strategy = useQuery({
    queryKey: ['content', brand, 'strategy', activeId], queryFn: () => api.strategy(activeId as number), enabled: activeId !== null, staleTime: 300_000,
  })
  const campaigns = useQuery({ queryKey: ['content', brand, 'campaigns'], queryFn: api.campaigns })
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const activeChannels = useMemo(() => (brandInfo.data?.channels ?? []).filter(c => c.active), [brandInfo.data])
  // "Who posts it" (spec 2026-10-19 §4.1): the brand's team, read once in a while.
  const team = useQuery({ queryKey: ['content', brand, 'team'], queryFn: api.team, staleTime: 300_000 })
  const channels = useMemo(() => activeChannels.map(c => c.platform), [activeChannels])

  // Edits kept when the portal last went away (kept.ts) come back with their post; they are this panel's now.
  const [restored] = useState(() => keptFor<Editing>(ownerOf(brand), target.seq))
  useEffect(() => { dropKept() }, [])
  const [editing, setEditing] = useState<Editing | null>(() => {
    if (restored) return restored
    if (target.kind !== 'new') return null
    const form = newForm(target.draft, boot.platforms, channels, usualTimes(activeChannels, boot.organization.industry))
    return { base: form, draft: form, post: null }
  })

  const [submitted, setSubmitted] = useState<PostForm | null>(restored?.pending ?? null)
  // Adopted while rendering, one rule after another:
  let next = editing
  // the post as the server has it: when it first arrives, and when a newer copy reaches the cache (a save, a move, an AI
  // answer here) while nothing is edited — the panel does not poll; another device's change meets the stale-save check
  // (a newer copy under edits waits for Save, which then offers their version: spec §7, F3);
  const loaded = detail.data
  if (loaded && (next === null
    || (next.post !== null && next.post.id === loaded.id && newer(loaded.updated_at, next.post.updated_at) && !hasPendingEdits(next, submitted)))) {
    next = { base: formOf(loaded), draft: formOf(loaded), post: loaded }
  }
  // this person's own move of this post on the Plan, under whatever they are editing;
  const moved = panel.moved
  if (next?.post && moved && moved.id === next.post.id && newer(moved.updated_at, next.post.updated_at)) {
    const fresh = { ...next.post, ...moved }
    next = { base: formOf(fresh), draft: rebase(next.base, next.draft, formOf(fresh)), post: fresh }
  }
  // a new post, once the brand's channels are known: no platform given → the brand's first channel; no time given →
  // its platform's usual time (a time it was given, or one already typed, stays).
  if (next && target.kind === 'new') next = withChannels(next, target.draft, channels, usualTimes(activeChannels, boot.organization.industry))
  if (next !== editing) setEditing(next)

  const dirty = editing !== null && hasPendingEdits(editing, submitted)
  const protectedDraft = editing !== null && needsDraftProtection(editing, submitted)
  useEffect(() => { panelNow.current.reportDirty(protectedDraft) }, [protectedDraft])

  // While the AI rewords, every read of the post reads the Plan again too; once it is done, once more (its copies changed).
  const rewording = pollsWhileRewording(detail.data)
  const wasRewording = useRef(rewording)
  const readAt = detail.dataUpdatedAt
  useEffect(() => {
    if (rewording || wasRewording.current) void refreshLists(queryClient, brand)
    wasRewording.current = rewording
  }, [readAt, rewording, queryClient, brand])

  // The portal going away while edits are held (the browser's Back to the full admin) keeps them in this tab (kept.ts).
  const leaving = useRef({ editing, brand, target, submitted })
  useEffect(() => { leaving.current = { editing, brand, target, submitted } })
  useEffect(() => () => {
    const last = leaving.current
    if (last.editing && (last.submitted !== null || panelNow.current.holdsEdits())) keep({ owner: ownerOf(last.brand), target: last.target, editing: { ...last.editing, pending: last.submitted } })
  }, [])

  const [saving, setSaving] = useState(Boolean(restored?.pending))
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [invalid, setInvalid] = useState<(keyof PostForm)[]>([])
  const [conflict, setConflict] = useState<PostDetail | null>(null)

  const { isCurrent, identify } = panel
  useEffect(() => onKeptUpdate<Editing>(owner, target.seq, update => {
    if (!isCurrent(owner, target.seq)) return
    const held = leaving.current.editing
    if (!held) return
    const answer = update(held)
    setEditing(latest => latest ? update(latest).editing : latest)
    if (answer.target.kind === 'post') identify(answer.target.id, owner, target.seq)
    setSaving(false)
    setSubmitted(null)
  }), [owner, target.seq, isCurrent, identify])

  /** The post as the server answered: its cached copy and the plan show it at once (so the next move sends its version). */
  const show = (fresh: PostDetail) => {
    // An answer without the timeline (a save, an AI answer) keeps the one read and has the post read again (putPost).
    putPost(queryClient, brand, fresh)
    putInPlans(queryClient, brand, cardOf(fresh))
    void refreshLists(queryClient, brand)
  }

  /** A post an AI tool, an action or a save answered with, under anything typed while it was on its way. */
  const adopt = (fresh: PostDetail) => {
    const cached = queryClient.getQueryData<PostDetail>(['content', brand, 'post', fresh.id])
    // Read live state/cache, not the render that launched a potentially slow metadata request.
    if ([leaving.current.editing?.post, cached].some(known => known?.id === fresh.id && newer(known.updated_at, fresh.updated_at))) return
    show(fresh)
    if (!current()) return
    setEditing(e => adoptedPost(e, fresh))
  }

  /** Their version, chosen after a refused save: the edits here are dropped. */
  const loadTheirs = (fresh: PostDetail) => {
    show(fresh)
    setEditing({ base: formOf(fresh), draft: formOf(fresh), post: fresh })
  }

  const save = async () => {
    if (!editing || saving) return
    const snapshot = editing.draft
    setSubmitted(snapshot)
    setSaving(true)
    setNote(null)
    setInvalid([])
    try {
      if (editing.post === null) {
        const { post: created } = await api.createPost(createBody(editing.draft))
        queryClient.setQueryData(['content', brand, 'post', created.id], created)
        void refreshLists(queryClient, brand)
        updateKept<Editing>(owner, target.seq, held => ({ target: { kind: 'post', id: created.id, seq: target.seq }, editing: { base: formOf(created), draft: completedSave(held, snapshot, formOf(created)), post: created } }))
        if (!current()) return
        setEditing(e => e ? { base: formOf(created), draft: completedSave(e, snapshot, formOf(created)), post: created } : e)
        panel.identify(created.id, owner, target.seq)
        return
      }
      const { post: saved } = await api.savePost(editing.post.id, { ...changes(editing.base, editing.draft), updated_at: editing.post.updated_at })
      show(saved)
      updateKept<Editing>(owner, target.seq, held => ({ target: { kind: 'post', id: saved.id, seq: target.seq }, editing: { base: formOf(saved), draft: completedSave(held, snapshot, formOf(saved)), post: saved } }))
      if (!current()) return
      setEditing(e => e ? { base: formOf(saved), draft: completedSave(e, snapshot, formOf(saved)), post: saved } : e)
      setNote({ tone: 'success', text: t('content.panel.saved', 'Saved') })
    } catch (error) {
      updateKept<Editing>(owner, target.seq, held => ({ target, editing: { ...held, pending: null } }))
      if (!current()) return
      const failure = failureOf(error)
      // Saved from a copy someone else changed since (spec §7, F3): offer their version, never overwrite it silently.
      if (failure.code === 'changed_elsewhere' && failure.post) {
        setConflict(failure.post)
      } else {
        // A refused Link (spec 2026-10-19 §5.1) is the Link's own: its field marked, its own words.
        const refused = refusalOf(failure.code, failure.fields)
        setInvalid(refused.invalid)
        const [key, text] = errorKey(refused.family, failure.code)
        setNote({ tone: 'danger', text: t(key, text) })
      }
    } finally {
      if (current()) { setSaving(false); setSubmitted(null) }
    }
  }

  const post = editing?.post ?? null
  const pillars = strategy.data?.strategy.pillars ?? []
  const audiences = brandInfo.data?.audiences ?? []
  // One state for the ⋯ menu in the header and the progress beside the status (spec 2026-10-21 §7.2, §7.4).
  const actions = usePostActions({
    post, dirty, onPost: adopt,
    onDuplicated: (copy) => {
      queryClient.setQueryData(['content', brand, 'post', copy.id], copy)
      void refreshLists(queryClient, brand)
      // Read the live dirty flag: typing may have started after Duplicate was sent.
      if (current() && !panel.holdsEdits()) panel.replace(copy.id)
    },
    onDeleted: (deleted) => {
      queryClient.removeQueries({ queryKey: ['content', brand, 'post', deleted] })
      void refreshLists(queryClient, brand)
      if (current()) panel.close()
    },
  })
  return { target, owner, panel, boot, api, brand, queryClient, locale, t, id, detail, restored, editing, setEditing, dirty,
    saving, note, invalid, conflict, setConflict, loadTheirs, save, post, pillars, audiences, team, campaigns, brandInfo, adopt, actions, current }
}

type PostEditor = ReturnType<typeof useEditorController>
const EditorContext = createContext<PostEditor | null>(null)
const EditorFailedContext = createContext(false)
/** Mount once above the Content routes. Panel and full composer must consume this same instance. */
export function PostEditorProvider({ children }: { children: ReactNode }) {
  const { target } = usePanel()
  const brand = useBrandId()
  const [editor, setEditor] = useState<PostEditor | null>(null)
  const [failedOpening, setFailedOpening] = useState<string | null>(null)
  const opening = `${ownerOf(brand)}:${target?.seq ?? ''}`
  const owned = editor && target && editor.target.seq === target.seq && editor.brand === brand && editor.owner === ownerOf(brand) ? editor : null
  if (typeof window === 'undefined' && target) return <ServerEditorOpening target={target}>{children}</ServerEditorOpening>
  return <EditorContext.Provider value={failedOpening === opening ? null : owned}><EditorFailedContext.Provider value={failedOpening === opening}>
    {target && <PageBoundary key={opening} message="" reload="" fallback={<EditorFailure opening={opening} report={setFailedOpening} />}>
      <EditorOpening target={target} publish={setEditor} />
    </PageBoundary>}
    {children}
  </EditorFailedContext.Provider></EditorContext.Provider>
}
function EditorFailure({ opening, report }: { opening: string; report: (opening: string) => void }) {
  useLayoutEffect(() => { report(opening) }, [opening, report])
  return null
}
function ServerEditorOpening({ target, children }: { target: PanelTarget; children: ReactNode }) {
  const editor = useEditorController(target)
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
}
const EditorOpening = memo(function EditorOpening({ target, publish }: { target: PanelTarget; publish: (editor: PostEditor) => void }) {
  const editor = useEditorController(target)
  useLayoutEffect(() => { publish(editor) })
  return null
})
// eslint-disable-next-line react-refresh/only-export-components
export function usePostEditor() { return useContext(EditorContext) }

function PanelBody() {
  const editor = usePostEditor()!
  const { target, panel, boot, brand, queryClient, locale, t, id, detail, restored, editing, setEditing, dirty,
    saving, note, invalid, conflict, setConflict, loadTheirs, save, post, pillars, audiences, team, campaigns, brandInfo, adopt, actions, current } = editor
  const mode = usePanelMode()
  const heading = useRef<HTMLHeadingElement>(null)
  const box = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const panelNow = useRef(panel)
  useLayoutEffect(() => { panelNow.current = panel }, [panel])
  useEffect(() => {
    if (opener.current === null && document.activeElement instanceof HTMLElement) opener.current = document.activeElement
    const element = box.current
    heading.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) panelNow.current.close() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // Modal cleanup must remove inert first. StrictMode's rehearsal leaves the same element connected.
      queueMicrotask(() => { if (!element?.isConnected) handBackFocus(opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('[data-content] main')) })
    }
  }, [])
  useEffect(() => {
    if (mode !== 'docked' && box.current) return modalScope(box.current, () => { panelNow.current.close() })
  }, [mode])
  const saved = post !== null || target.kind === 'post'
  const day = editing ? dayLine(editing.draft.scheduled_date || null, locale) : null
  // The open tab (spec 2026-10-21 §7.3): a new post on Content, a post the AI is writing on AI tools, else the one last used here.
  const [tab, setTab] = useState<PanelTab>(() => openingTab(target.kind === 'new', id !== null && panel.writing[id] !== undefined, loadPanelTab()))
  const pickTab = (next: PanelTab) => { setTab(next); savePanelTab(next) }
  const pane = (k: PanelTab) => ({ role: 'tabpanel', id: paneId(k), 'aria-labelledby': tabId(k), hidden: tab !== k })
  const createFirst = editing && !post ? <p className="text-sm text-a-text-2">{t('content.panel.create_first', 'Create the post first to use this.')}</p> : null
  const [saveKey, saveText] = saveLabelKey(post !== null, editing?.draft.status ?? 'draft', post?.status)

  return (
    <aside ref={box} tabIndex={-1} role={mode === 'docked' ? 'complementary' : 'dialog'} aria-modal={mode === 'docked' ? undefined : 'true'} aria-labelledby="content-panel-title" data-panel=""
      className={`fixed bottom-0 right-0 top-14 z-30 flex w-full flex-col border-l border-a-border bg-a-canvas sm:w-[400px] ${mode === 'docked' ? '' : 'shadow-a-lg animate-a-slide-in'}`}>
      <div className="flex items-start justify-between gap-3 border-b border-a-border px-5 py-4">
        <div className="min-w-0">
          <h2 id="content-panel-title" ref={heading} tabIndex={-1} className="truncate text-base font-semibold text-a-text outline-hidden">
            {saved ? t('content.panel.details', 'Post details') : t('content.panel.new_title', 'New post')}
          </h2>
          {editing && saved && <p className="mt-0.5 text-xs text-a-text-2">{day ?? t('content.panel.no_day', 'No day yet')}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link to={`/content/write/${target.kind === 'post' ? target.id : 'new'}`} className="c-launch-link">{t('content.launch.full_editor', 'Full editor')}</Link>
          {post && <PanelMore actions={actions} />}
          <button type="button" onClick={() => { panel.close() }} aria-label={t('content.common.close', 'Close')} className="rounded-lg p-1.5 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>

      <PanelTabList tab={tab} onTab={pickTab} comments={activityCount(detail.data, post)} />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Above the tabs, so every tab shows them: loading, a failed read, kept edits, a conflict, what ⋯ answered. */}
        <div data-panel-notices="" className="space-y-3 empty:hidden not-empty:mb-5">
          {id !== null && !editing && detail.isError && <Notice tone="danger">{t('content.panel.load_failed', 'This post could not be loaded.')} <Button variant="secondary" size="sm" onClick={() => { void detail.refetch() }}>{t('content.common.retry', 'Try again')}</Button></Notice>}
          {id !== null && !editing && !detail.isError && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
          {restored && dirty && <Notice tone="info">{t('content.panel.kept', 'Your unsaved changes were kept.')}</Notice>}
          {conflict && (
            <div className="space-y-2">
              <Notice tone="warning">{t('content.panel.conflict', 'Someone else changed this post while you were editing it.')}</Notice>
              <Button variant="secondary" size="sm" onClick={() => { loadTheirs(conflict); setConflict(null) }}>{t('content.panel.conflict_reload', 'Load their version')}</Button>
            </div>
          )}
          {post && <MoreOutcome post={post} actions={actions}
            pillarName={post.pillar_id === null ? null : (pillars.find(p => p.id === post.pillar_id)?.name ?? null)} />}
        </div>
        <div {...pane('content')} className="space-y-5">
          {/* The post's platform and brand, and its status (spec 2026-10-21 §7.4). */}
          {editing && (
            <div className="flex items-center gap-2 text-sm">
              <PlatformMark platform={editing.draft.platform} />
              <span className="font-medium text-a-text">{t(`content.platform.${editing.draft.platform}`, editing.draft.platform)}</span>
              <span className="min-w-0 truncate text-a-text-2">· {boot.brand?.name}</span>
              {post && <span className="ml-auto shrink-0"><StatusPill status={post.status} /></span>}
            </div>
          )}
          {post && <ReviewBar post={post} dirty={dirty} onPost={adopt} />}
          {/* Spec 2026-10-20 §4.7: the website page a promotion post promotes. */}
          {post?.promotes && <PromotesLine page={post.promotes} />}
          {editing && (
            <PostFormFields campaigns={campaigns.data?.campaigns ?? []} form={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} platforms={boot.platforms} statuses={statusChoices(boot.statuses, staffLocked(boot), editing.base.status)}
              pillars={pillars} audiences={audiences} published={post?.status === 'published'} invalid={invalid} locale={locale} industry={boot.organization.industry} snippets={brandInfo.data?.snippets ?? []}
              templates={brandInfo.data?.templates ?? []} team={posterChoices(team.data?.team ?? [], post?.poster)} link={post?.link ?? null}
              afterStatus={post && <ProgressActions post={post} actions={actions} />}
              versions={post && (
                <>
                  {/* The group as last read: the AI's adapting ends without this post changing (spec 2026-10-19 §3.3). */}
                  <VersionsSection post={post} dirty={dirty} onPost={adopt}
                    group={(detail.data && detail.data.id === post.id ? detail.data.group : post.group) ?? null} />
                  {/* The series as last read: its rewording ends without the post itself changing, so the panel's copy would keep "rewording". */}
                  <RepeatSection post={post} dirty={dirty} onPost={adopt}
                    series={(detail.data && detail.data.id === post.id ? detail.data.series : post.series) ?? null}
                    onGone={() => {
                      queryClient.removeQueries({ queryKey: ['content', brand, 'post', post.id] })
                      void refreshLists(queryClient, brand)
                      if (current()) panel.close()
                    }} />
                </>
              )} />
          )}
          {editing && <PostMedia value={editing.draft.media_ids} onChange={media_ids => setEditing(e => e ? { ...e, draft: { ...e.draft, media_ids } } : e)} saved={post?.media ?? []} />}
        </div>
        <div {...pane('ai')} className="space-y-5">
          {post
            ? <AiTools post={post} dirty={dirty} onPost={adopt}
                outside={panel.writing[post.id] ?? null} onOutsideSeen={() => panel.noteWriting(post.id, null)}
                onUseCopy={(copy) => setEditing(e => (e ? { ...e, draft: { ...e.draft, main_copy: copy } } : e))} />
            : createFirst}
        </div>
        <div {...pane('activity')} className="space-y-5">
          {/* The timeline as last read (spec 2026-10-16 §7.1): an answer that carried none keeps it until the post is read again. */}
          {post
            ? <Timeline post={post} items={detail.data && detail.data.id === post.id ? (detail.data.timeline ?? null) : null} />
            : createFirst}
        </div>
      </div>

      {editing && (
        <div className="flex items-center gap-3 border-t border-a-border px-4 py-3">
          {editing.draft.status === 'published' && post?.status !== 'published' && <p className="text-xs text-a-text-2">{t('content.launch.manual_record', 'This records that you published manually. HexaTech does not send this post to a social network.')}</p>}
          <Button onClick={() => { void save() }} loading={saving} disabled={post !== null && !dirty}>
            {t(saveKey, saveText)}
          </Button>
          {note && <span role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</span>}
        </div>
      )}
    </aside>
  )
}
