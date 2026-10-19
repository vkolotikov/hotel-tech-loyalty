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
import { PostActions } from './PostActions'
import { PostFormFields } from './PostFormFields'
import { postQuery } from './panelQuery'
import { pollsWhileRewording } from './repeatMath'
import { RepeatSection } from './RepeatSection'
import { VersionsSection } from './VersionsSection'
import { ReviewBar } from './ReviewBar'
import { Timeline } from './Timeline'
import { changes, createBody, formOf, invalidFields, isDirty, newForm, newer, posterChoices, rebase, withChannels, type Editing, type PostForm } from './panelState'

/** The post panel (spec §4.3): over the right edge of every page, one post at a time (PanelProvider). */
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
        setInvalid(invalidFields(failure.fields))
        const [key, text] = errorKey('save', failure.code)
        setNote({ tone: 'danger', text: t(key, text) })
      }
    } finally {
      setSaving(false)
    }
  }

  const post = editing?.post ?? null
  const pillars = strategy.data?.strategy.pillars ?? []
  const audiences = brandInfo.data?.audiences ?? []

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="content-panel-title" data-panel=""
      className="fixed bottom-0 right-0 top-14 z-30 flex w-full flex-col border-l border-a-border bg-a-surface shadow-a-lg animate-a-slide-in sm:w-[480px]">
      <div className="flex items-center justify-between gap-3 border-b border-a-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {editing && <PlatformMark platform={editing.draft.platform} />}
          <h2 id="content-panel-title" ref={heading} tabIndex={-1} className="truncate font-a-display text-xl font-normal text-a-text outline-none">
            {post || target.kind === 'post' ? t('content.panel.title', 'Post') : t('content.panel.new_title', 'New post')}
          </h2>
          {post && <StatusPill status={post.status} />}
        </div>
        <button type="button" onClick={() => { panel.close() }} aria-label={t('content.common.close', 'Close')} className="rounded p-1.5 text-a-text-2 hover:text-a-text">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {id !== null && !editing && detail.isError && <Notice tone="danger">{t('content.panel.load_failed', 'This post could not be loaded.')}</Notice>}
        {id !== null && !editing && !detail.isError && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
        {restored && dirty && <Notice tone="info">{t('content.panel.kept', 'Your unsaved changes were kept.')}</Notice>}
        {conflict && (
          <div className="space-y-2">
            <Notice tone="warning">{t('content.panel.conflict', 'Someone else changed this post while you were editing it.')}</Notice>
            <Button variant="secondary" size="sm" onClick={() => { loadTheirs(conflict); setConflict(null) }}>{t('content.panel.conflict_reload', 'Load their version')}</Button>
          </div>
        )}
        {post && <ReviewBar post={post} dirty={dirty} onPost={adopt} />}
        {editing && (
          <PostFormFields form={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} platforms={boot.platforms} statuses={statusChoices(boot.statuses, staffLocked(boot), editing.base.status)}
            pillars={pillars} audiences={audiences} published={post?.status === 'published'} invalid={invalid} locale={locale} industry={boot.organization.industry} snippets={brandInfo.data?.snippets ?? []}
            templates={brandInfo.data?.templates ?? []} team={posterChoices(team.data?.team ?? [], post?.poster)} />
        )}
        {editing && !post && <p className="text-xs text-a-text-2">{t('content.panel.ai.create_first', 'Create the post first to use AI.')}</p>}
        {post && (
          <>
            <AiTools post={post} dirty={dirty} onPost={adopt}
              outside={panel.writing[post.id] ?? null} onOutsideSeen={() => panel.noteWriting(post.id, null)}
              onUseCopy={(copy) => setEditing(e => (e ? { ...e, draft: { ...e.draft, main_copy: copy } } : e))} />
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
            <PostActions post={post} dirty={dirty} onPost={adopt}
              pillarName={post.pillar_id === null ? null : (pillars.find(p => p.id === post.pillar_id)?.name ?? null)}
              onDuplicated={(copy) => {
                queryClient.setQueryData(['content', brand, 'post', copy.id], copy)
                void refreshLists(queryClient, brand)
                panel.replace(copy.id)
              }}
              onDeleted={(deleted) => {
                queryClient.removeQueries({ queryKey: ['content', brand, 'post', deleted] })
                void refreshLists(queryClient, brand)
                panel.close()
              }} />
            {/* The timeline as last read (spec 2026-10-16 §7.1): an answer that carried none keeps it until the post is read again. */}
            <Timeline post={post} items={detail.data && detail.data.id === post.id ? (detail.data.timeline ?? null) : null} />
          </>
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-3 border-t border-a-border px-4 py-3">
          <Button onClick={() => { void save() }} loading={saving} disabled={post !== null && !dirty}>
            {post ? t('content.panel.save', 'Save') : t('content.panel.create', 'Create post')}
          </Button>
          {note && <span role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</span>}
        </div>
      )}
    </aside>
  )
}
