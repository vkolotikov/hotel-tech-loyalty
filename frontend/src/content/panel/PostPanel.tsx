import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { handBackFocus } from '../../workspace/lib/handBack'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { cardOf, putInPlans, refreshLists } from '../lib/planCache'
import type { PostDetail } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusPill } from '../ui/StatusDot'
import { dropKept, keep, keptFor, ownerOf } from './kept'
import { usePanel, type PanelTarget } from './PanelProvider'
import { AiTools } from './AiTools'
import { PostActions } from './PostActions'
import { PostFormFields } from './PostFormFields'
import { changes, createBody, formOf, invalidFields, isDirty, newForm, newer, rebase, type Editing, type PostForm } from './panelState'

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

  const detail = useQuery({ queryKey: ['content', brand, 'post', id], queryFn: () => api.post(id as number).then(r => r.post), enabled: id !== null })
  const strategies = useQuery({ queryKey: ['content', brand, 'strategies'], queryFn: api.strategies, staleTime: 300_000 })
  const activeId = strategies.data?.strategies.find(s => s.status === 'active')?.id ?? null
  const strategy = useQuery({
    queryKey: ['content', brand, 'strategy', activeId], queryFn: () => api.strategy(activeId as number), enabled: activeId !== null, staleTime: 300_000,
  })
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const channels = useMemo(() => (brandInfo.data?.channels ?? []).filter(c => c.active).map(c => c.platform), [brandInfo.data])

  // Edits kept when the portal last went away (kept.ts) come back with their post; they are this panel's now.
  const [restored] = useState(() => keptFor<Editing>(ownerOf(brand), target.seq))
  useEffect(() => { dropKept() }, [])
  const [editing, setEditing] = useState<Editing | null>(() => {
    if (restored) return restored
    if (target.kind !== 'new') return null
    const form = newForm(target.draft, boot.platforms, channels)
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
  // a new post with no slot behind it starts on the brand's own first channel, once the brand's channels are known.
  const first = channels[0]
  if (next && next.post === null && target.kind === 'new' && target.draft.platform === null && first
    && next.base.platform !== first && next.draft.platform === next.base.platform) {
    next = { ...next, base: { ...next.base, platform: first }, draft: { ...next.draft, platform: first } }
  }
  if (next !== editing) setEditing(next)

  const dirty = editing !== null && isDirty(editing.base, editing.draft)
  useEffect(() => { panelNow.current.reportDirty(dirty) }, [dirty])

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
    queryClient.setQueryData(['content', brand, 'post', fresh.id], fresh)
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
        {editing && (
          <PostFormFields form={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} platforms={boot.platforms} statuses={boot.statuses}
            pillars={pillars} audiences={audiences} published={post?.status === 'published'} invalid={invalid} locale={locale} />
        )}
        {editing && !post && <p className="text-xs text-a-text-2">{t('content.panel.ai.create_first', 'Create the post first to use AI.')}</p>}
        {post && (
          <>
            <AiTools post={post} dirty={dirty} onPost={adopt}
              onUseCopy={(copy) => setEditing(e => (e ? { ...e, draft: { ...e.draft, main_copy: copy } } : e))} />
            <PostActions post={post} dirty={dirty} onPost={adopt}
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
