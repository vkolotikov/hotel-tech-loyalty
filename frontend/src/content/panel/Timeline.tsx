import { useState, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveImage } from '../../lib/api'
import { useRetainedState } from '../drafts/useRetainedState'
import { useTranslation } from 'react-i18next'
import { formatInstant } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { PostDetail, TimelineComment, TimelineEvent, TimelineItem } from '../lib/types'
import { COMMENT_MAX, EVENT_TEXT, commentProblem, commentRights, sendsOnEnter, withComment, withEdited, withoutComment } from './timelineMath'

const BOX = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
const SMALL = 'rounded-sm px-1 text-xs font-medium text-a-text-2 hover:text-a-text'

/** One approval step: a grey line with who and when, a send-back's note beneath. */
function EventLine({ item, name, when }: { item: TimelineEvent; name: string; when: string }) {
  const { t } = useTranslation()
  return (
    <li data-event={item.kind} className="text-xs text-a-text-2">
      <span>{t(`content.timeline.event.${item.kind}`, EVENT_TEXT[item.kind], { name })}</span>
      <span aria-hidden> · </span>
      <time dateTime={item.at}>{when}</time>
      {item.note && <p className="mt-0.5 whitespace-pre-wrap wrap-break-word italic text-a-text">{item.note}</p>}
    </li>
  )
}

/** One comment: who and when, "edited", its words with their lines, and Edit / Delete for those who may. */
function CommentItem({ item, name, when, manager, onSave, onDelete }: {
  item: TimelineComment
  name: string
  when: string
  manager: boolean
  /** Saves new words; true when they were saved (the box closes). */
  onSave: (id: number, body: string) => Promise<boolean>
  onDelete: (id: number) => Promise<void>
}) {
  const { t } = useTranslation()
  const rights = commentRights(item, manager)
  // The words being edited; null while the comment is shown.
  const [text, setText] = useRetainedState<string | null>(`comment-edit:${item.id}`, null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useRetainedState(`comment-edit-busy:${item.id}`, false, false)
  const save = async () => {
    if (text === null || busy) return
    setBusy(true)
    try {
      if (await onSave(item.id, text)) setText(null)
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await onDelete(item.id)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li data-comment={item.id} className="rounded-lg border border-a-border bg-a-surface p-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-semibold text-a-text">{name}</span>
        <time dateTime={item.at} className="text-a-text-2">{when}</time>
        {item.edited && <span className="text-a-text-2">{t('content.timeline.edited', 'edited')}</span>}
        {text === null && !confirming && (rights.edit || rights.remove) && (
          <span className="ml-auto flex gap-1">
            {rights.edit && <button type="button" className={SMALL} onClick={() => setText(item.body)}>{t('content.timeline.edit', 'Edit')}</button>}
            {rights.remove && <button type="button" className={SMALL} onClick={() => setConfirming(true)}>{t('content.timeline.delete', 'Delete')}</button>}
          </span>
        )}
      </div>
      {text === null
        ? <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-a-text">{item.body}</p>
        : (
          <div className="mt-1 space-y-2">
            <textarea disabled={busy} value={text} rows={3} onChange={(e) => setText(e.target.value)} aria-label={t('content.timeline.edit', 'Edit')} className={BOX} />
            <div className="flex gap-2">
              <Button size="sm" loading={busy} onClick={() => { void save() }}>{t('content.timeline.save', 'Save')}</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setText(null)}>{t('content.common.cancel', 'Cancel')}</Button>
            </div>
          </div>
        )}
      {item.media && <a href={resolveImage(item.media.url) ?? ''} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-2 rounded-lg text-sm text-a-accent-text">
        {item.media.mime.startsWith('image/') && <img src={resolveImage(item.media.url) ?? ''} alt="" className="h-10 w-10 rounded object-cover" />}
        <span className="min-w-0 break-all">{t('content.collaboration.asset', 'Attachment')}: {item.media.name}</span>
      </a>}
      {!!item.mentions?.length && <p className="mt-2 wrap-break-word text-xs text-a-text-2">{t('content.collaboration.mentions', 'Mentioned')}: {item.mentions.map(person => person.name).join(', ')}</p>}
      {confirming && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-a-text">
          <span>{t('content.timeline.delete_confirm', 'Delete this comment?')}</span>
          <Button size="sm" variant="danger" loading={busy} onClick={() => { void remove() }}>{t('content.timeline.delete_yes', 'Delete comment')}</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>{t('content.common.cancel', 'Cancel')}</Button>
        </div>
      )}
    </li>
  )
}

/**
 * Comments and history (spec 2026-10-16 §7.1), at the panel's foot: the post's comments and its approval steps, oldest
 * first, the newest 200; a box adds a comment (Enter sends, Shift + Enter adds a line; plain text, 1–2,000
 * characters, the limit said before anything is sent). People edit or delete their own comments; managers delete
 * anyone's. A comment changes the cached post and the lists' counts; it never touches the post itself.
 */
export function Timeline({ post, items }: { post: PostDetail; items: TimelineItem[] | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const [draft, setDraft, retained] = useRetainedState(`comment-new:${post.id}`, { text: '', media_id: null as number | null, mentioned_user_ids: [] as number[] })
  const { text } = draft
  const [busy, setBusy] = useRetainedState(`comment-new-busy:${post.id}`, false, false)
  const [error, setError] = useRetainedState<string | null>(`comment-error:${post.id}`, null, false)
  const team = useQuery({ queryKey: ['content', brand, 'team'], queryFn: api.team })
  const media = post.media ?? []
  const missingMedia = draft.media_id !== null && !media.some(asset => asset.id === draft.media_id)
  const update = (change: (p: PostDetail) => PostDetail) =>
    queryClient.setQueryData<PostDetail>(['content', brand, 'post', post.id], old => (old ? change(old) : old))
  const say = (code: string) => {
    const [key, words] = errorKey('comment', code)
    setError(t(key, words))
  }
  const name = (item: TimelineItem) => item.user?.name ?? t('content.people.former', 'Former team member')
  const when = (at: string) => formatInstant(at, locale, boot.venue.timezone)
  const tooLong = [...text.trim()].length > COMMENT_MAX
  const [tooLongKey, tooLongWords] = errorKey('comment', 'too_long')

  const send = async () => {
    // Nothing written, or too long (the line under the box says so): nothing goes.
    if (commentProblem(text) !== null || busy || missingMedia) return
    setBusy(true)
    setError(null)
    try {
      const { comment, comments_count } = await api.addComment(post.id, text.trim(), { media_id: draft.media_id, mentioned_user_ids: draft.mentioned_user_ids })
      update(p => withComment(p, comment, comments_count))
      retained.clear()
      void refreshLists(queryClient, brand)
    } catch (e) {
      const fields = (e as { response?: { data?: { errors?: Record<string, unknown> } } })?.response?.data?.errors
      if (fields?.media_id || fields?.mentioned_user_ids) {
        setError(t('content.collaboration.selection_failed', 'The attachment or team selection changed. Choose again below; your comment is kept.'))
        void team.refetch()
        void queryClient.invalidateQueries({ queryKey: ['content', brand, 'post', post.id] })
      } else say(failureOf(e).code)
    } finally {
      setBusy(false)
    }
  }
  const saveEdit = async (id: number, body: string): Promise<boolean> => {
    const problem = commentProblem(body)
    if (problem) {
      say(problem)
      return false
    }
    setError(null)
    try {
      const { comment } = await api.editComment(id, body.trim())
      update(p => withEdited(p, comment))
      return true
    } catch (e) {
      say(failureOf(e).code)
      return false
    }
  }
  const remove = async (id: number) => {
    setError(null)
    try {
      const { comments_count } = await api.deleteComment(id)
      update(p => withoutComment(p, id, comments_count))
      void refreshLists(queryClient, brand)
    } catch (e) {
      say(failureOf(e).code)
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!sendsOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) return
    e.preventDefault()
    void send()
  }

  return (
    <section aria-labelledby="content-timeline-title" className="space-y-3">
      <h3 id="content-timeline-title" className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{t('content.timeline.title', 'Comments and history')}</h3>
      {items === null
        ? <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>
        : items.length === 0
          ? <p className="text-sm text-a-text-2">{t('content.timeline.empty', 'No comments yet.')}</p>
          : (
            <ol className="space-y-2">
              {items.map(item => (item.type === 'event'
                ? <EventLine key={`event-${item.id}`} item={item} name={name(item)} when={when(item.at)} />
                : <CommentItem key={`comment-${item.id}`} item={item} name={name(item)} when={when(item.at)} manager={boot.staff.can_manage} onSave={saveEdit} onDelete={remove} />))}
            </ol>
          )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.timeline.box', 'Write a comment')}</span>
        <textarea aria-label={t('content.timeline.box', 'Write a comment')} disabled={busy} value={text} rows={2} onChange={(e) => setDraft({ ...draft, text: e.target.value })} onKeyDown={onKeyDown}
          aria-invalid={tooLong || undefined} aria-describedby="content-timeline-hint" className={BOX} />
      </label>
      <label className="block text-xs text-a-text-2">{t('content.collaboration.media_select', 'Discuss an attachment')}
        <select aria-label={t('content.collaboration.media_select', 'Discuss an attachment')} className={`${BOX} mt-1`} disabled={busy} value={draft.media_id ?? ''} onChange={e => setDraft({ ...draft, media_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t('content.collaboration.whole_post', 'Whole post')}</option>
          {missingMedia && <option value={draft.media_id!}>{t('content.collaboration.detached', 'Attachment no longer attached — choose again')}</option>}
          {media.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      </label>
      <fieldset disabled={busy} className="space-y-2"><legend className="text-xs text-a-text-2">{t('content.collaboration.mention_select', 'Mention teammates')}</legend>
        <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-2 overflow-y-auto">
          {team.data?.team.filter(person => person.id !== boot.staff.id).map(person => <label key={person.id} className="flex items-center gap-2 text-xs text-a-text"><input type="checkbox" checked={draft.mentioned_user_ids.includes(person.id)} onChange={e => setDraft({ ...draft, mentioned_user_ids: e.target.checked ? [...draft.mentioned_user_ids, person.id] : draft.mentioned_user_ids.filter(id => id !== person.id) })} />{person.name}</label>)}
        </div>
        {team.isLoading && <p role="status" className="text-xs text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
        {team.isError && <Button size="sm" variant="secondary" onClick={() => { void team.refetch() }}>{t('content.common.retry', 'Try again')}</Button>}
        {draft.mentioned_user_ids.length > 0 && <button type="button" disabled={busy} className={SMALL} onClick={() => setDraft({ ...draft, mentioned_user_ids: [] })}>{t('content.collaboration.clear_mentions', 'Clear selected mentions')}</button>}
      </fieldset>
      {tooLong && <p className="text-xs text-a-danger">{t(tooLongKey, tooLongWords)}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="content-timeline-hint" className="text-xs text-a-text-2">{t('content.timeline.hint', 'Enter sends · Shift + Enter adds a line')}</p>
        <Button size="sm" variant="secondary" loading={busy} disabled={text.trim() === '' || tooLong || missingMedia} onClick={() => { void send() }}>
          {t('content.timeline.send', 'Comment')}
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
