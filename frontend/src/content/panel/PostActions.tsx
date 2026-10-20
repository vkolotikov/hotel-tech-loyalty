import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Copy, CopyPlus, ExternalLink, LayoutTemplate, Link2, Send, Trash2 } from 'lucide-react'
import { formatInstant } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { canMarkPublished, staffLocked } from '../lib/approval'
import { errorKey } from '../lib/errors'
import { TemplateEditor } from '../brand/sections/Templates'
import { templateFromPost } from '../brand/templateActions'
import { postLink } from '../lib/links'
import { Dialog } from '../ui/Dialog'
import { copyText } from '../lib/postText'
import type { PostDetail } from '../lib/types'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
const LINK = /^https?:\/\/\S+$/i

/**
 * What can be done with a saved post (spec §4.3): mark it ready, mark it
 * published (with its link) — only managers while the brand's approvals are on
 * (spec 2026-10-16 §6.2) — duplicate it, copy its text, delete it (after a
 * confirm). They wait while the post has unsaved edits.
 */
export function PostActions({ post, dirty, onPost, onDuplicated, onDeleted, pillarName = null }: {
  post: PostDetail
  dirty: boolean
  onPost: (post: PostDetail) => void
  onDuplicated: (copy: PostDetail) => void
  onDeleted: (id: number) => void
  /** The post's pillar by name (the panel knows the active strategy's pillars): "Save as template" keeps it. */
  pillarName?: string | null
}) {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const locked = staffLocked(boot)
  // Spec 2026-10-19 §4.4: the post's own poster may mark an approved or ready post published while approvals are on;
  // with approvals off, anyone may mark it published.
  const publishable = canMarkPublished(post, locked, boot.staff.id ?? null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [url, setUrl] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  // "Save as template" (managers, spec 2026-10-16 §5.2): the editor filled from the post, its pillar by name.
  const [templating, setTemplating] = useState(false)
  const waits = dirty || busy !== null
  const urlOk = url.trim() === '' || LINK.test(url.trim())

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!linkCopied) return
    const timer = window.setTimeout(() => setLinkCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [linkCopied])

  const act = async (name: string, call: () => Promise<void>) => {
    setBusy(name)
    setError(null)
    try {
      await call()
    } catch (e) {
      const [key, text] = errorKey('action', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="content-actions-title" className="space-y-3">
      <h3 id="content-actions-title" className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{t('content.panel.actions.title', 'Actions')}</h3>
      {post.status === 'published' && post.published_at && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-a-text">
          {t('content.panel.actions.published_on', 'Published {{when}}', { when: formatInstant(post.published_at, i18n.language || 'en', boot.venue.timezone) })}
          {post.published_url && (
            <a href={post.published_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-a-accent-text hover:underline">
              <ExternalLink size={14} aria-hidden />{t('content.panel.actions.open_published', 'Open the published post')}
            </a>
          )}
        </p>
      )}
      {dirty && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      {locked && (
        <p className="text-xs text-a-text-2">
          {publishable
            ? t('content.review.poster_hint', 'You post this one: mark it published once it is out.')
            : t('content.review.staff_hint', 'While approvals are on, a manager approves, marks ready and publishes.')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!locked && post.status !== 'ready_to_publish' && post.status !== 'published' && (
          <Button size="sm" variant="secondary" disabled={waits} loading={busy === 'ready'}
            onClick={() => { void act('ready', async () => { onPost((await api.markReady(post.id)).post) }) }}>
            <CheckCircle2 size={14} aria-hidden />{t('content.panel.actions.ready', 'Mark ready')}
          </Button>
        )}
        {publishable && (
          <Button size="sm" variant="secondary" disabled={waits} aria-expanded={publishing} onClick={() => setPublishing(p => !p)}>
            <Send size={14} aria-hidden />{t('content.panel.actions.published', 'Mark published')}
          </Button>
        )}
        <Button size="sm" variant="secondary" disabled={waits} loading={busy === 'duplicate'}
          onClick={() => { void act('duplicate', async () => { onDuplicated((await api.duplicatePost(post.id)).post) }) }}>
          <CopyPlus size={14} aria-hidden />{t('content.panel.actions.duplicate', 'Duplicate')}
        </Button>
        <Button size="sm" variant="secondary" disabled={waits}
          onClick={() => { void act('copy', async () => { await navigator.clipboard.writeText(copyText(post)); setCopied(true) }) }}>
          <Copy size={14} aria-hidden />{copied ? t('content.panel.actions.copied', 'Copied') : t('content.panel.actions.copy', 'Copy text')}
        </Button>
        {/* The post's own link with its brand, so a colleague on another brand opens this post. */}
        <Button size="sm" variant="secondary" disabled={waits}
          onClick={() => { void act('link', async () => { await navigator.clipboard.writeText(`${window.location.origin}${postLink(post.id, boot.brand?.id ?? null)}`); setLinkCopied(true) }) }}>
          <Link2 size={14} aria-hidden />{linkCopied ? t('content.panel.actions.link_copied', 'Link copied') : t('content.panel.actions.copy_link', 'Copy link for the team')}
        </Button>
        {boot.staff.can_manage && (
          <Button size="sm" variant="secondary" disabled={waits} onClick={() => setTemplating(true)}>
            <LayoutTemplate size={14} aria-hidden />{t('content.panel.actions.save_template', 'Save as template')}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={waits} onClick={() => setConfirmDelete(true)}>
          <Trash2 size={14} aria-hidden />{t('content.panel.actions.delete', 'Delete')}
        </Button>
      </div>
      {publishable && publishing && (
        <div className="space-y-2 rounded-lg border border-a-border bg-a-surface-2 p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.actions.published_url', 'Link to the published post (optional)')}</span>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={255} aria-invalid={!urlOk || undefined} className={INPUT} />
          </label>
          {!urlOk && <p className="text-xs text-a-danger">{t('content.panel.actions.invalid_url', 'Enter a full link that starts with https://')}</p>}
          <Button size="sm" disabled={!urlOk || waits} loading={busy === 'published'}
            onClick={() => { void act('published', async () => { onPost((await api.markPublished(post.id, url.trim() === '' ? null : url.trim())).post); setPublishing(false) }) }}>
            {t('content.panel.actions.confirm_published', 'Mark published')}
          </Button>
        </div>
      )}
      {confirmDelete && (
        <div role="alert" className="space-y-2 rounded-lg border border-a-danger/30 bg-a-danger/10 p-3">
          <p className="text-sm text-a-text">{t('content.panel.actions.delete_confirm', 'Delete this post? This cannot be undone.')}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={busy === 'delete'}
              onClick={() => { void act('delete', async () => { await api.deletePost(post.id); onDeleted(post.id) }) }}>
              {t('content.panel.actions.delete_yes', 'Delete post')}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy === 'delete'} onClick={() => setConfirmDelete(false)}>{t('content.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {templating && (
        <Dialog title={t('content.panel.actions.save_template', 'Save as template')} onClose={() => setTemplating(false)}>
          <TemplateEditor template={null} initial={templateFromPost(post, pillarName)} onDone={() => setTemplating(false)} />
        </Dialog>
      )}
    </section>
  )
}
