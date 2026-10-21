import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ExternalLink, FileText } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { SitePage } from '../lib/types'
import { usePanel } from '../panel/PanelProvider'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusPill } from '../ui/StatusDot'
import { focusBack, pageNumbers } from './promoteMath'

/**
 * One article or page (spec 2026-10-20 §5): its picture, its title opening the page in a new tab, its date and numbers,
 * "Not found on the last scan" when so, a tick box for managers, and Show posts (each opens in the panel) with Remove
 * draft posts for managers.
 */
export function PageRow({ page, canManage, chosen, full, onToggle, locale, busy }: {
  page: SitePage; canManage: boolean; chosen: boolean; full: boolean; onToggle: () => void; locale: string; busy: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const date = page.published_at ? formatDate(page.published_at.slice(0, 10), locale, { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <li data-page={page.id} className="rounded-xl border border-a-border bg-a-surface p-3">
      <div className="flex items-start gap-3">
        {canManage && (
          <input type="checkbox" checked={chosen} disabled={!chosen && full} onChange={onToggle}
            aria-label={t('content.promote.choose', 'Choose {{title}}', { title: page.title })} className="mt-1 h-4 w-4 shrink-0" />
        )}
        {page.image_url
          ? <img src={page.image_url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          : <div aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-a-surface-2 text-a-text-2"><FileText size={18} /></div>}
        <div className="min-w-0 flex-1 space-y-1">
          <a href={page.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 font-semibold text-a-text hover:underline">
            <span className="min-w-0 break-words">{page.title}</span><ExternalLink size={13} aria-hidden className="mt-1 shrink-0 text-a-text-2" />
          </a>
          <p className="text-xs text-a-text-2">{[date, pageNumbers(page, t)].filter(Boolean).join(' · ')}</p>
          {!page.seen && <p className="text-xs font-medium text-a-text-2">{t('content.promote.not_seen', 'Not found on the last scan')}</p>}
          {/* While open it stays, so the list can close after its last drafts were removed (final review, 6-2). */}
          {(page.posts > 0 || open) && (
            <button type="button" data-posts-toggle="" aria-expanded={open} aria-controls={`content-page-posts-${page.id}`} onClick={() => setOpen(o => !o)}
              className="text-xs font-semibold text-a-accent-text hover:underline">
              {open ? t('content.promote.hide_posts', 'Hide posts') : t('content.promote.show_posts', 'Show posts')}
            </button>
          )}
        </div>
      </div>
      {open && <PagePosts id={page.id} canManage={canManage} busy={busy} locale={locale} />}
    </li>
  )
}

function PagePosts({ id, canManage, busy, locale }: { id: number; canManage: boolean; busy: boolean; locale: string }) {
  const { t } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const panel = usePanel()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['content', brand, 'page-posts', id], queryFn: () => api.pagePosts(id) })
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [note, setNote] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const backToTrigger = useRef(false)
  const confirmId = `content-page-remove-${id}`

  // Once the trigger is enabled again (it is disabled while removing); the row holds it and Hide posts.
  useEffect(() => {
    if (!backToTrigger.current || removing) return
    backToTrigger.current = false
    focusBack(box.current?.parentElement)
  })

  const close = () => {
    backToTrigger.current = true
    setConfirming(false)
  }
  const remove = async () => {
    setRemoving(true)
    setNote(null)
    try {
      const answer = await api.removePageDrafts(id)
      setNote({ tone: 'info', text: t('content.promote.removed', 'Draft posts removed: {{count}}', { count: answer.removed }) })
      // The plan, the pages' numbers and this list; and an open panel reads its post again (a removed one is gone).
      await Promise.all([refreshLists(queryClient, brand), queryClient.invalidateQueries({ queryKey: ['content', brand, 'post'] })])
    } catch (e) {
      const [key, text] = errorKey('drafts', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    } finally {
      setRemoving(false)
      close()
    }
  }

  const posts = query.data?.posts ?? []
  return (
    <div ref={box} id={`content-page-posts-${id}`} className="mt-3 space-y-2 border-t border-a-border pt-3">
      {query.isLoading && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
      {query.isError && <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>}
      {query.data && posts.length === 0 && <p className="text-sm text-a-text-2">{t('content.promote.no_posts', 'No posts left for this page.')}</p>}
      {posts.length > 0 && (
        <ul className="space-y-1">
          {posts.map(post => (
            <li key={post.id}>
              <button type="button" onClick={() => panel.open(post.id)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-a-surface-2">
                <span className="w-20 shrink-0 text-xs text-a-text-2">
                  {post.scheduled_date ? formatDate(post.scheduled_date, locale, { day: 'numeric', month: 'short' }) : t('content.common.unscheduled', 'Unscheduled')}
                </span>
                <PlatformMark platform={post.platform} size="sm" />
                <span className="min-w-0 flex-1 truncate text-a-text">{post.hook ?? post.title ?? post.topic ?? ''}</span>
                <StatusPill status={post.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* As Stop repeating (RepeatSection): the trigger stays and says it opened a question, which is read out (final review, 6-2). */}
      {canManage && (posts.length > 0 || confirming) && (
        <Button data-remove-trigger="" size="sm" variant="secondary" disabled={busy || removing} aria-expanded={confirming} aria-controls={confirmId}
          onClick={() => setConfirming(c => !c)}>{t('content.promote.remove', 'Remove draft posts')}</Button>
      )}
      {canManage && confirming && (
        <div id={confirmId} role="alert" className="space-y-2 rounded-lg bg-a-surface-2 p-2">
          <p className="text-sm text-a-text">{t('content.promote.remove_confirm', "Remove this page's posts that are still drafts? Approved and published posts stay.")}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={removing} onClick={() => { void remove() }}>{t('content.promote.remove_yes', 'Remove')}</Button>
            <Button size="sm" variant="secondary" disabled={removing} onClick={close}>{t('content.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
      {note && <Notice tone={note.tone}>{note.text}</Notice>}
    </div>
  )
}
