import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../ContentProvider'
import type { SitePageKind } from '../lib/types'
import { PageHeader } from '../ui/PageHeader'
import { PageRow } from './PageRow'
import { PromoteDialog } from './PromoteDialog'
import { MAX_PAGES, isPromoting, stillThere } from './promoteMath'
import { PromotionLine } from './PromotionLine'
import { usePromotionWatch, useSite } from './useSite'
import { WebsiteScan } from './WebsiteScan'

/**
 * Promote (spec 2026-10-20 §5): the website line, the promotion as it stands, the articles and the other pages in two
 * tabs with their numbers; managers tick up to 20 (across both tabs) and press Promote…. Staff read everything.
 */
export function PromotePage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const canManage = boot.staff.can_manage
  const query = useSite()
  const run = usePromotionWatch()
  const [tab, setTab] = useState<SitePageKind>('article')
  const [picked, setPicked] = useState<number[]>([])
  const [dialog, setDialog] = useState(false)
  const payload = query.data
  const pages = payload?.pages ?? []
  // Only the chosen pages still on the list count (a new scan can remove some: final review, 6-2).
  const chosen = stillThere(picked, pages)
  const articles = pages.filter(p => p.kind === 'article')
  const others = pages.filter(p => p.kind === 'page')
  const shown = tab === 'article' ? articles : others
  const promoting = isPromoting(run.data)
  const full = chosen.length >= MAX_PAGES
  const toggle = (id: number) => setPicked(c => {
    const now = stillThere(c, pages)
    return now.includes(id) ? now.filter(x => x !== id) : now.length >= MAX_PAGES ? now : [...now, id]
  })
  // After Promote, the keyboard goes to the promotion line (the bar that had it is gone: final review, 6-2).
  const toLine = useRef(false)
  useEffect(() => {
    if (!toLine.current) return
    const line = document.getElementById('content-promotion-line')
    if (line) {
      toLine.current = false
      line.focus()
    }
  })

  return (
    <div data-promote="" className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.promote.title', 'Promote')} />
      <p className="text-sm text-a-text-2">{t('content.promote.intro', 'Turn your blog articles and pages into posts that link to them.')}</p>
      {!canManage && <Notice tone="info">{t('content.promote.staff_note', 'Only an owner or a manager can scan the website or promote pages.')}</Notice>}
      {query.isLoading && <div role="status" aria-label={t('content.common.loading', 'Loading…')} className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>}
      {query.isError && !payload && (
        <div className="space-y-3">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {payload && (
        <section aria-labelledby="content-promote-site" className="space-y-3 rounded-xl border border-a-border bg-a-surface p-4">
          <h2 id="content-promote-site" className="font-a-display text-lg font-normal text-a-text">{t('content.site.title', 'Website')}</h2>
          {payload.site === null && canManage && <p className="text-sm text-a-text">{t('content.site.empty', 'Add your website address to find your blog articles and pages.')}</p>}
          <WebsiteScan payload={payload} canManage={canManage} />
        </section>
      )}
      {run.data && run.data.status !== 'idle' && <PromotionLine run={run.data} canManage={canManage} />}
      {payload && pages.length > 0 && (
        <section aria-label={t('content.promote.tabs', 'Kinds of pages')} className="space-y-3">
          <div role="tablist" aria-label={t('content.promote.tabs', 'Kinds of pages')} className="flex flex-wrap gap-2">
            {(['article', 'page'] as const).map(kind => (
              <button key={kind} type="button" role="tab" id={`content-promote-tab-${kind}`} aria-selected={tab === kind} aria-controls="content-promote-list"
                onClick={() => setTab(kind)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${tab === kind ? 'border-a-accent-text bg-a-surface-2 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                {kind === 'article'
                  ? t('content.promote.tab_articles', 'Blog articles ({{count}})', { count: articles.length })
                  : t('content.promote.tab_pages', 'Other pages ({{count}})', { count: others.length })}
              </button>
            ))}
          </div>
          <div id="content-promote-list" role="tabpanel" aria-labelledby={`content-promote-tab-${tab}`}>
            {shown.length === 0 ? (
              <p className="text-sm text-a-text-2">
                {tab === 'article'
                  ? t('content.promote.no_articles', 'No blog articles were found. If your blog has its own address, enter it — for example https://example.com/blog — and scan again.')
                  : t('content.promote.no_pages', 'No other pages were found.')}
              </p>
            ) : (
              <ul className="space-y-2">
                {shown.map(page => (
                  <PageRow key={page.id} page={page} canManage={canManage} chosen={chosen.includes(page.id)} full={full}
                    onToggle={() => toggle(page.id)} locale={locale} busy={promoting} />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
      {canManage && chosen.length > 0 && (
        <div data-promote-bar="" className="sticky bottom-0 z-10 -mx-4 border-t border-a-border bg-a-surface px-4 py-3 shadow-a-lg lg:-mx-6 lg:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-a-text">{t('content.promote.selected', 'Selected: {{count}}', { count: chosen.length })}</span>
            {full && <span className="text-xs text-a-text-2">{t('content.promote.limit', 'You can choose up to 20 pages at a time.')}</span>}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPicked([])}>{t('content.promote.clear', 'Clear')}</Button>
              <Button size="sm" disabled={promoting} onClick={() => setDialog(true)}>{t('content.promote.start', 'Promote…')}</Button>
            </div>
          </div>
        </div>
      )}
      {dialog && (
        <PromoteDialog pages={pages.filter(p => chosen.includes(p.id))} onClose={() => setDialog(false)}
          onStarted={() => { toLine.current = true; setDialog(false); setPicked([]) }} />
      )}
    </div>
  )
}
