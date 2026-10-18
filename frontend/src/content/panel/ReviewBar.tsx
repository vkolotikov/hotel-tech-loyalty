import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Hourglass, Send, Undo2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { approvalsOn } from '../lib/approval'
import { errorKey } from '../lib/errors'
import type { PostDetail } from '../lib/types'
import { afterRefusal, NOTE_MAX, noteProblem, reviewButtons } from './reviewMath'

const BOX = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * The post's place in the brand's approvals (spec 2026-10-16 §6.3, §7.1): who wrote it, "Waiting for approval" or
 * "Sent back", and the step this person may take — Send for approval (staff), Approve or Send back with a note
 * (managers, on a post in review). Steps wait while the post has unsaved edits; a refused step that carries the post as
 * it now is shows it (Approve sends the version the panel holds, so changed words are read before they are approved).
 */
export function ReviewBar({ post, dirty, onPost }: { post: PostDetail; dirty: boolean; onPost: (post: PostDetail) => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const api = useApi()
  const on = approvalsOn(boot)
  const buttons = reviewButtons(post.status, on, boot.staff.can_manage)
  const [busy, setBusy] = useState<string | null>(null)
  // The send-back note; null while its box is closed.
  const [note, setNote] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const waiting = on && post.status === 'needs_review'
  const waits = dirty || busy !== null

  const step = async (name: string, call: () => Promise<{ post: PostDetail }>, done: string) => {
    setBusy(name)
    setMessage(null)
    try {
      onPost((await call()).post)
      setNote(null)
      setMessage({ tone: 'success', text: done })
    } catch (e) {
      const { post: now, code } = afterRefusal(failureOf(e))
      if (now) onPost(now)
      const [key, text] = errorKey('approval', code)
      setMessage({ tone: 'danger', text: t(key, text) })
    } finally {
      setBusy(null)
    }
  }

  if (!post.author && !waiting && !post.sent_back && !buttons.send && !buttons.approve) return null
  const noteBad = note !== null && noteProblem(note) !== null
  const [tooLongKey, tooLongText] = errorKey('approval', 'invalid')
  return (
    <section aria-label={t('content.review.title', 'Approval')} data-review="" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {post.author && <span className="text-a-text-2">{t('content.review.written_by', 'Written by {{name}}', { name: post.author })}</span>}
        {waiting && (
          <span className="inline-flex items-center gap-1 rounded-full border border-a-accent-text px-2 py-0.5 font-medium text-a-accent-text">
            <Hourglass size={12} aria-hidden />{t('content.flags.waiting', 'Waiting for approval')}
          </span>
        )}
        {post.sent_back && (
          <span className="inline-flex items-center gap-1 rounded-full bg-a-danger/10 px-2 py-0.5 font-medium text-a-danger">
            <Undo2 size={12} aria-hidden />{t('content.flags.sent_back', 'Sent back')}
          </span>
        )}
      </div>
      {(buttons.send || buttons.approve) && (
        <div className="flex flex-wrap gap-2">
          {buttons.send && (
            <Button size="sm" disabled={waits} loading={busy === 'send'}
              onClick={() => { void step('send', () => api.sendForApproval(post.id), t('content.review.done_sent', 'Sent for approval.')) }}>
              <Send size={14} aria-hidden />{t('content.review.send', 'Send for approval')}
            </Button>
          )}
          {buttons.approve && (
            <Button size="sm" disabled={waits} loading={busy === 'approve'}
              onClick={() => { void step('approve', () => api.approve(post.id, post.updated_at), t('content.review.done_approved', 'Approved.')) }}>
              <CheckCircle2 size={14} aria-hidden />{t('content.review.approve', 'Approve')}
            </Button>
          )}
          {buttons.sendBack && (
            <Button size="sm" variant="secondary" disabled={waits} aria-expanded={note !== null} onClick={() => setNote(n => (n === null ? '' : null))}>
              <Undo2 size={14} aria-hidden />{t('content.review.send_back', 'Send back')}
            </Button>
          )}
        </div>
      )}
      {dirty && (buttons.send || buttons.approve) && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      {note !== null && buttons.sendBack && (
        <div className="space-y-2 rounded-lg border border-a-border bg-a-surface-2 p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.review.note', 'What should change? The writer sees this.')}</span>
            <textarea value={note} rows={3} onChange={(e) => setNote(e.target.value)} aria-invalid={[...note].length > NOTE_MAX || undefined} className={BOX} />
          </label>
          {[...note].length > NOTE_MAX && <p className="text-xs text-a-danger">{t(tooLongKey, tooLongText)}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={noteBad || waits} loading={busy === 'back'}
              onClick={() => { void step('back', () => api.sendBack(post.id, note.trim()), t('content.review.done_back', 'Sent back to the writer.')) }}>
              {t('content.review.send_back', 'Send back')}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy === 'back'} onClick={() => setNote(null)}>{t('content.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
      {message && (message.tone === 'danger'
        ? <Notice tone="danger">{message.text}</Notice>
        : <p role="status" className="text-xs text-a-text-2">{message.text}</p>)}
    </section>
  )
}
