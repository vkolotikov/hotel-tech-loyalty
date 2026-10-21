import { useTranslation } from 'react-i18next'
import { CheckCircle2, ExternalLink, Send } from 'lucide-react'
import { formatInstant } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../ContentProvider'
import type { PostDetail } from '../lib/types'
import type { PostActionsState } from './postActionsState'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * The post's progress beside its status (spec 2026-10-21 §7.4): "Published …" with its link on a published post, who
 * marks it while approvals are on, Mark ready and Mark published (with the published post's link). What the ⋯ menu
 * opens, and an action's refusal, show above the tabs (MoreOutcome).
 */
export function ProgressActions({ post, actions: a }: { post: PostDetail; actions: PostActionsState }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  return (
    <div data-progress="" className="space-y-2">
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
      {a.dirty && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      {a.locked && (
        <p className="text-xs text-a-text-2">
          {a.publishable
            ? t('content.review.poster_hint', 'You post this one: mark it published once it is out.')
            : t('content.review.staff_hint', 'While approvals are on, a manager approves, marks ready and publishes.')}
        </p>
      )}
      {(!a.locked && post.status !== 'ready_to_publish' && post.status !== 'published') || a.publishable ? (
        <div className="flex flex-wrap gap-2">
          {!a.locked && post.status !== 'ready_to_publish' && post.status !== 'published' && (
            <Button size="sm" variant="secondary" disabled={a.waits} loading={a.busy === 'ready'} onClick={a.markReady}>
              <CheckCircle2 size={14} aria-hidden />{t('content.panel.actions.ready', 'Mark ready')}
            </Button>
          )}
          {a.publishable && (
            <Button size="sm" variant="secondary" disabled={a.waits} aria-expanded={a.publishing} onClick={() => a.setPublishing(p => !p)}>
              <Send size={14} aria-hidden />{t('content.panel.actions.published', 'Mark published')}
            </Button>
          )}
        </div>
      ) : null}
      {a.publishable && a.publishing && (
        <div className="space-y-2 rounded-lg border border-a-border bg-a-surface-2 p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.actions.published_url', 'Link to the published post (optional)')}</span>
            <input type="url" value={a.url} onChange={(e) => a.setUrl(e.target.value)} maxLength={255} aria-invalid={!a.urlOk || undefined} className={INPUT} />
          </label>
          {!a.urlOk && <p className="text-xs text-a-danger">{t('content.panel.actions.invalid_url', 'Enter a full link that starts with https://')}</p>}
          <Button size="sm" disabled={!a.urlOk || a.waits} loading={a.busy === 'published'} onClick={a.markPublished}>
            {t('content.panel.actions.confirm_published', 'Mark published')}
          </Button>
        </div>
      )}
    </div>
  )
}
