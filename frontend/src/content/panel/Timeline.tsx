import { useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
const SMALL = 'rounded px-1 text-xs font-medium text-a-text-2 hover:text-a-text'

/** One approval step: a grey line with who and when, a send-back's note beneath. */
function EventLine({ item, name, when }: { item: TimelineEvent; name: string; when: string }) {
  const { t } = useTranslation()
  return (
    <li data-event={item.kind} className="text-xs text-a-text-2">
      <span>{t(`content.timeline.event.${item.kind}`, EVENT_TEXT[item.kind], { name })}</span>
      <span aria-hidden> · </span>
      <time dateTime={item.at}>{when}</time>
      {item.note && <p className="mt-0.5 whitespace-pre-wrap break-words italic text-a-text">{item.note}</p>}
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
  const [text, setText] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
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
        ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-a-text">{item.body}</p>
        : (
          <div className="mt-1 space-y-2">
            <textarea value={text} rows={3} onChange={(e) => setText(e.target.value)} aria-label={t('content.timeline.edit', 'Edit')} className={BOX} />
            <div className="flex gap-2">
              <Button size="sm" loading={busy} onClick={() => { void save() }}>{t('content.timeline.save', 'Save')}</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setText(null)}>{t('content.common.cancel', 'Cancel')}</Button>
            </div>
          </div>
        )}
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
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    if (commentProblem(text) !== null || busy) return
    setBusy(true)
    setError(null)
    try {
      const { comment, comments_count } = await api.addComment(post.id, text.trim())
      update(p => withComment(p, comment, comments_count))
      setText('')
      void refreshLists(queryClient, brand)
    } catch (e) {
      say(failureOf(e).code)
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
        <textarea value={text} rows={2} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
          aria-invalid={tooLong || undefined} aria-describedby="content-timeline-hint" className={BOX} />
      </label>
      {tooLong && <p className="text-xs text-a-danger">{t(tooLongKey, tooLongWords)}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="content-timeline-hint" className="text-xs text-a-text-2">{t('content.timeline.hint', 'Enter sends · Shift + Enter adds a line')}</p>
        <Button size="sm" variant="secondary" loading={busy} disabled={text.trim() === '' || tooLong} onClick={() => { void send() }}>
          {t('content.timeline.send', 'Comment')}
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
