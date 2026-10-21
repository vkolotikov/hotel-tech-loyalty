import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { handBackFocus } from '../../workspace/lib/handBack'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { staffLocked, statusChoices } from '../lib/approval'
import { errorKey } from '../lib/errors'
import { cardOf, putInPlans, putPost, refreshLists } from '../lib/planCache'
import type { PostDetail } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusPill } from '../ui/StatusDot'
import { usualTimes } from '../plan/addMath'
import { dropKept, keep, keptFor, ownerOf } from './kept'
import { usePanel, type PanelTarget } from './PanelProvider'
import { AiTools } from './AiTools'
import { MoreOutcome } from './MoreOutcome'
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
import { changes, createBody, formOf, isDirty, newForm, newer, posterChoices, rebase, refusalOf, withChannels, type Editing, type PostForm } from './panelState'

/**
 * The post panel (spec §4.3, spec 2026-10-21 §7): one post at a time (PanelProvider) — a column beside the page from
 * 1280 px, over the page's right edge below that, the whole screen on a phone.
 */
export function PostPanel() {
  const { target } = usePanel()
  if (!target) return null
  return <PanelBody key={target.seq} target={target} />
}

function PanelBody({ target }: { target: PanelTarget }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const panel = usePanel()
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const heading = useRef<HTMLHeadingElement>(null)
  const panelNow = useRef(panel)
  useEffect(() => { panelNow.current = panel }, [panel])
  const id = target.kind === 'post' ? target.id : null

  // The heading takes the focus; an Escape no drag or dialog claimed closes (asking first about edits); the focus goes back.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    heading.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) panelNow.current.close() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      handBackFocus(opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-content] main'))
    }
  }, [])

  // A post cached without its timeline is read again on opening; one whose series the AI rewords, every 5 s (panelQuery.ts).
  const detail = useQuery(postQuery(brand, id, () => api.post(id as number).then(r => r.post)))
  const strategies = useQuery({ queryKey: ['content', brand, 'strategies'], queryFn: api.strategies, staleTime: 300_000 })
  const activeId = strategies.data?.strategies.find(s => s.status === 'active')?.id ?? null
  const strategy = useQuery({
    queryKey: ['content', brand, 'strategy', activeId], queryFn: () => api.strategy(activeId as number), enabled: activeId !== null, staleTime: 300_000,
  })
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

  // Adopted while rendering, one rule after another:
  let next = editing
  // the post as the server has it: when it first arrives, and when a newer copy reaches the cache (a save, a move, an AI
  // answer here) while nothing is edited — the panel does not poll; another device's change meets the stale-save check
  // (a newer copy under edits waits for Save, which then offers their version: spec §7, F3);
  const loaded = detail.data
  if (loaded && (next === null
    || (next.post !== null && next.post.id === loaded.id && newer(loaded.updated_at, next.post.updated_at) && !isDirty(next.base, next.draft)))) {
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

  const dirty = editing !== null && isDirty(editing.base, editing.draft)
  useEffect(() => { panelNow.current.reportDirty(dirty) }, [dirty])

  // While the AI rewords, every read of the post reads the Plan again too; once it is done, once more (its copies changed).
  const rewording = pollsWhileRewording(detail.data)
  const wasRewording = useRef(rewording)
  const readAt = detail.dataUpdatedAt
  useEffect(() => {
    if (rewording || wasRewording.current) void refreshLists(queryClient, brand)
    wasRewording.current = rewording
  }, [readAt, rewording, queryClient, brand])

  // The portal going away while edits are held (the browser's Back to the full admin) keeps them in this tab (kept.ts).
  const leaving = useRef({ editing, brand, target })
  useEffect(() => { leaving.current = { editing, brand, target } })
  useEffect(() => () => {
    const last = leaving.current
    if (panelNow.current.holdsEdits() && last.editing) keep({ owner: ownerOf(last.brand), target: last.target, editing: last.editing })
  }, [])

  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [invalid, setInvalid] = useState<(keyof PostForm)[]>([])
  const [conflict, setConflict] = useState<PostDetail | null>(null)

  /** The post as the server answered: its cached copy and the plan show it at once (so the next move sends its version). */
  const show = (fresh: PostDetail) => {
    // An answer without the timeline (a save, an AI answer) keeps the one read and has the post read again (putPost).
    putPost(queryClient, brand, fresh)
    putInPlans(queryClient, brand, cardOf(fresh))
    void refreshLists(queryClient, brand)
  }

  /** A post an AI tool, an action or a save answered with, under anything typed while it was on its way. */
  const adopt = (fresh: PostDetail) => {
    show(fresh)
    const form = formOf(fresh)
    setEditing(e => ({ base: form, draft: e && e.post?.id === fresh.id ? rebase(e.base, e.draft, form) : form, post: fresh }))
  }

  /** Their version, chosen after a refused save: the edits here are dropped. */
  const loadTheirs = (fresh: PostDetail) => {
    show(fresh)
    setEditing({ base: formOf(fresh), draft: formOf(fresh), post: fresh })
  }

  const save = async () => {
    if (!editing || saving) return
    setSaving(true)
    setNote(null)
    setInvalid([])
    try {
      if (editing.post === null) {
        const { post: created } = await api.createPost(createBody(editing.draft))
        queryClient.setQueryData(['content', brand, 'post', created.id], created)
        void refreshLists(queryClient, brand)
        panel.replace(created.id)
        return
      }
      const { post: saved } = await api.savePost(editing.post.id, { ...changes(editing.base, editing.draft), updated_at: editing.post.updated_at })
      adopt(saved)
      setNote({ tone: 'success', text: t('content.panel.saved', 'Saved') })
    } catch (error) {
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
      setSaving(false)
    }
  }

  const post = editing?.post ?? null
  const pillars = strategy.data?.strategy.pillars ?? []
  const audiences = brandInfo.data?.audiences ?? []
  const mode = usePanelMode()
  // One state for the ⋯ menu in the header and the progress beside the status (spec 2026-10-21 §7.2, §7.4).
  const actions = usePostActions({
    post, dirty, onPost: adopt,
    onDuplicated: (copy) => {
      queryClient.setQueryData(['content', brand, 'post', copy.id], copy)
      void refreshLists(queryClient, brand)
      panel.replace(copy.id)
    },
    onDeleted: (deleted) => {
      queryClient.removeQueries({ queryKey: ['content', brand, 'post', deleted] })
      void refreshLists(queryClient, brand)
      panel.close()
    },
  })
  const saved = post !== null || target.kind === 'post'
  const day = editing ? dayLine(editing.draft.scheduled_date || null, locale) : null
  // The open tab (spec 2026-10-21 §7.3): a new post on Content, a post the AI is writing on AI tools, else the one last used here.
  const [tab, setTab] = useState<PanelTab>(() => openingTab(target.kind === 'new', id !== null && panel.writing[id] !== undefined, loadPanelTab()))
  const pickTab = (next: PanelTab) => { setTab(next); savePanelTab(next) }
  const pane = (k: PanelTab) => ({ role: 'tabpanel', id: paneId(k), 'aria-labelledby': tabId(k), hidden: tab !== k })
  const createFirst = editing && !post ? <p className="text-sm text-a-text-2">{t('content.panel.create_first', 'Create the post first to use this.')}</p> : null
  const [saveKey, saveText] = saveLabelKey(post !== null, editing?.draft.status ?? 'draft')

  return (
    <aside role={mode === 'docked' ? 'complementary' : 'dialog'} aria-modal={mode === 'docked' ? undefined : 'false'} aria-labelledby="content-panel-title" data-panel=""
      className={`fixed bottom-0 right-0 top-14 z-30 flex w-full flex-col border-l border-a-border bg-a-canvas sm:w-[400px] ${mode === 'docked' ? '' : 'shadow-a-lg animate-a-slide-in'}`}>
      <div className="flex items-start justify-between gap-3 border-b border-a-border px-5 py-4">
        <div className="min-w-0">
          <h2 id="content-panel-title" ref={heading} tabIndex={-1} className="truncate text-base font-semibold text-a-text outline-none">
            {saved ? t('content.panel.details', 'Post details') : t('content.panel.new_title', 'New post')}
          </h2>
          {editing && saved && <p className="mt-0.5 text-xs text-a-text-2">{day ?? t('content.panel.no_day', 'No day yet')}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {post && <PanelMore actions={actions} />}
          <button type="button" onClick={() => { panel.close() }} aria-label={t('content.common.close', 'Close')} className="rounded-lg p-1.5 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>

      <PanelTabList tab={tab} onTab={pickTab} comments={activityCount(detail.data, post)} />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Above the tabs, so every tab shows them: loading, a failed read, kept edits, a conflict, what ⋯ answered. */}
        <div data-panel-notices="" className="space-y-3 empty:hidden [&:not(:empty)]:mb-5">
          {id !== null && !editing && detail.isError && <Notice tone="danger">{t('content.panel.load_failed', 'This post could not be loaded.')}</Notice>}
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
            <PostFormFields form={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} platforms={boot.platforms} statuses={statusChoices(boot.statuses, staffLocked(boot), editing.base.status)}
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
                      panel.close()
                    }} />
                </>
              )} />
          )}
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
          <Button onClick={() => { void save() }} loading={saving} disabled={post !== null && !dirty}>
            {t(saveKey, saveText)}
          </Button>
          {note && <span role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</span>}
        </div>
      )}
    </aside>
  )
}
