import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { DateKey, Platform, PostFilters, PostStatus } from '../lib/types'
import { useActiveStrategy } from '../lib/useActiveStrategy'
import { usePanel } from '../panel/PanelProvider'
import { PageHeader } from '../ui/PageHeader'
import { PostRow } from './PostRow'
import { NO_FILTERS, isFiltered, readFilters, withFilter, writeFilters } from './postsFilters'

const INPUT = 'rounded-lg border border-a-border bg-a-surface px-2.5 py-1.5 text-sm text-a-text disabled:opacity-60'

/**
 * Posts (spec §4.4): every post of the brand, newest scheduled first and the
 * ones with no day last, 50 a page. The search and the filters live in the
 * address, so a filtered list can be shared and survives a reload. A row
 * opens the post panel. Archived posts show only when their status is chosen.
 */
export function PostsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const panel = usePanel()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readFilters(params, boot.statuses, boot.platforms), [params, boot.statuses, boot.platforms])
  const apply = (next: PostFilters) => setParams(writeFilters(next), { replace: true })
  const change = (part: Partial<PostFilters>) => apply(withFilter(filters, part))

  // The search box shows each letter at once; the list is asked once typing pauses. Back or a link brings the address's words.
  const [typed, setTyped] = useState(filters.q)
  const [seen, setSeen] = useState(filters.q)
  if (filters.q !== seen) {
    setSeen(filters.q)
    setTyped(filters.q)
  }
  useEffect(() => {
    if (typed === filters.q) return
    const timer = window.setTimeout(() => setParams(writeFilters(withFilter(filters, { q: typed })), { replace: true }), 300)
    return () => window.clearTimeout(timer)
  }, [typed, filters, setParams])

  const query = useQuery({ queryKey: ['content', brand, 'posts', filters], queryFn: () => api.posts(filters), placeholderData: keepPreviousData })
  const { strategy, known } = useActiveStrategy()
  const pillars = strategy?.pillars ?? []
  // Until the pillars are known a post's pillar is left unnamed (not called "another pillar").
  const pillarName = (id: number | null): string | null =>
    id === null || !known ? null : (pillars.find(p => p.id === id)?.name ?? t('content.posts.other_pillar', 'Another pillar'))
  const selectedId = panel.target?.kind === 'post' ? panel.target.id : null
  const page = query.data
  const filtered = isFiltered(filters)
  const clear = () => { setTyped(''); apply(NO_FILTERS) }
  const [failureKey, failureText] = errorKey('posts', failureOf(query.error).code)

  return (
    <div className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.posts.title', 'Posts')} newPost>
        {page && <span className="text-sm text-a-text-2">{t('content.posts.found', 'Posts: {{count}}', { count: page.meta.total })}</span>}
      </PageHeader>

      <div role="search" className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">{t('content.posts.search', 'Search posts')}</span>
          <Search size={15} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-a-text-2" />
          <input type="search" value={typed} maxLength={100} onChange={(e) => setTyped(e.target.value)}
            placeholder={t('content.posts.search', 'Search posts')} className={`${INPUT} w-full pl-8`} />
        </label>
        <select aria-label={t('content.posts.status', 'Status')} value={filters.status} className={INPUT}
          onChange={(e) => change({ status: e.target.value as PostStatus | '' })}>
          <option value="">{t('content.posts.all_statuses', 'All statuses')}</option>
          {boot.statuses.map(s => <option key={s} value={s}>{t(`content.status.${s}`, s)}</option>)}
        </select>
        <select aria-label={t('content.posts.platform', 'Platform')} value={filters.platform} className={INPUT}
          onChange={(e) => change({ platform: e.target.value as Platform | '' })}>
          <option value="">{t('content.posts.all_platforms', 'All platforms')}</option>
          {boot.platforms.map(p => <option key={p} value={p}>{t(`content.platform.${p}`, p)}</option>)}
        </select>
        {(pillars.length > 0 || filters.pillar_id !== null) && (
          <select aria-label={t('content.posts.pillar', 'Pillar')} value={filters.pillar_id ?? ''} className={INPUT}
            onChange={(e) => change({ pillar_id: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">{t('content.posts.all_pillars', 'All pillars')}</option>
            {pillars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            {filters.pillar_id !== null && !pillars.some(p => p.id === filters.pillar_id) && (
              <option value={filters.pillar_id}>{t('content.posts.other_pillar', 'Another pillar')}</option>
            )}
          </select>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-a-text-2">
          {t('content.posts.from', 'From')}
          <input type="date" value={filters.from} max={filters.to || undefined} disabled={filters.unscheduled} className={INPUT}
            onChange={(e) => {
              const from = e.target.value as DateKey | ''
              change({ from, ...(filters.to !== '' && from !== '' && from > filters.to ? { to: '' as const } : {}) })
            }} />
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-a-text-2">
          {t('content.posts.to', 'To')}
          <input type="date" value={filters.to} min={filters.from || undefined} disabled={filters.unscheduled} className={INPUT}
            onChange={(e) => change({ to: e.target.value as DateKey | '' })} />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-a-text">
          <input type="checkbox" checked={filters.unscheduled} onChange={(e) => change({ unscheduled: e.target.checked, from: '', to: '' })} />
          {t('content.posts.unscheduled_only', 'Only posts with no day')}
        </label>
        {filtered && <Button variant="ghost" size="sm" onClick={clear}>{t('content.posts.clear', 'Clear filters')}</Button>}
      </div>

      {query.isError && !page && (
        <div className="space-y-3">
          <Notice tone="danger">{t(failureKey, failureText)}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {query.isLoading && (
        <div role="status" aria-label={t('content.common.loading', 'Loading…')} className="space-y-2">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}
        </div>
      )}
      {page && page.data.length === 0 && (
        <div className="space-y-3 rounded-xl border border-a-border bg-a-surface p-6 text-sm text-a-text-2">
          {filters.page > 1
            ? <p>{t('content.posts.no_page', 'There is nothing on this page.')}</p>
            : <p>{filtered ? t('content.posts.no_match', 'No posts match these filters.') : t('content.posts.empty', 'No posts yet. Write one on the Plan, or with New post.')}</p>}
          {filters.page > 1 && <Button variant="secondary" size="sm" onClick={() => change({ page: 1 })}>{t('content.posts.first', 'First page')}</Button>}
          {filters.page === 1 && filtered && <Button variant="secondary" size="sm" onClick={clear}>{t('content.posts.clear', 'Clear filters')}</Button>}
        </div>
      )}
      {page && page.data.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-a-border bg-a-surface">
          {page.data.map(post => (
            <PostRow key={post.id} post={post} locale={locale} pillar={pillarName(post.pillar_id)} selected={selectedId === post.id}
              onOpen={(id) => { panel.open(id) }} />
          ))}
        </div>
      )}
      {page && page.meta.pages > 1 && page.data.length > 0 && (
        <nav aria-label={t('content.posts.pages', 'Pages')} className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={filters.page <= 1} aria-label={t('content.posts.previous', 'Previous page')}
            onClick={() => change({ page: filters.page - 1 })}><ChevronLeft size={16} aria-hidden /></Button>
          <span className="text-sm text-a-text-2">{t('content.posts.page', 'Page {{page}} of {{pages}}', { page: page.meta.page, pages: page.meta.pages })}</span>
          <Button variant="secondary" size="sm" disabled={filters.page >= page.meta.pages} aria-label={t('content.posts.next', 'Next page')}
            onClick={() => change({ page: filters.page + 1 })}><ChevronRight size={16} aria-hidden /></Button>
        </nav>
      )}
    </div>
  )
}
