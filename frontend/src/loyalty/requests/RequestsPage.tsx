import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { REQUEST_TAB_WORDS } from '../lib/words'
import { Pager } from '../ui/Pager'
import { RequestRow } from './RequestRow'
import { TABS, tabAfter, tabFrom } from './requestMath'

/**
 * Requests (spec 2026-10-21 §4.4): the benefits members asked for in the app, by state — Waiting, Approved, Done —
 * newest first, 25 a page. The tab lives in the address. Read again every 60 s while open, so a new request shows.
 */
export function RequestsPage() {
  const { t } = useTranslation()
  const api = useApi()
  const location = useLocation()
  const navigate = useNavigate()
  const tab = tabFrom(location.search)
  const selected = Number(new URLSearchParams(location.search).get('request')) || undefined
  const [page, setPage] = useState(1)
  const [shown, setShown] = useState(tab)
  if (shown !== tab) {
    setShown(tab)
    setPage(1)
  }
  const go = (name: typeof tab) => navigate({ pathname: '/loyalty/requests', search: name === 'waiting' ? '' : `?tab=${name}` }, { replace: true })
  const query = useQuery({ queryKey: ['loyalty', 'requests', tab, page, ...(selected ? [selected] : [])], queryFn: () => api.requests(tab, page, selected), placeholderData: selected ? undefined : keepPreviousData, refetchInterval: 60_000 })
  const data = query.data

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.requests.title', 'Requests')} line={t('loyalty.requests.line', 'Benefits members asked for in the app.')} />

      <div role="tablist" aria-label={t('loyalty.requests.tabs', 'Request states')} className="flex flex-wrap gap-2">
        {selected && <Button variant="secondary" onClick={() => go(tab)}>{t('loyalty.overview.allRequests', 'View all requests')}</Button>}
        {TABS.map(name => (
          // One tab stop; the arrow keys, Home and End move between the tabs (as Rewards' tabs).
          <button key={name} type="button" role="tab" id={`requests-tab-${name}`} aria-selected={tab === name} aria-controls="requests-panel"
            tabIndex={tab === name ? 0 : -1} onClick={() => go(name)} onKeyDown={(e) => {
              const next = tabAfter(tab, e.key)
              if (next === null) return
              e.preventDefault()
              go(next)
              document.getElementById(`requests-tab-${next}`)?.focus()
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium ${tab === name ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
            {t(`loyalty.requests.tab.${name}`, REQUEST_TAB_WORDS[name])}
            {data && <span className="tabular-nums">{data.counts[name]}</span>}
          </button>
        ))}
      </div>

      <div id="requests-panel" role="tabpanel" aria-labelledby={`requests-tab-${tab}`} className="space-y-4">
      {query.isError && (
        <div className="max-w-xl space-y-3">
          <Notice tone="danger">{t(...errorKey('load', failureOf(query.error)))}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
        </div>
      )}
      {!data && query.isLoading && <Skeleton className="h-48" />}
      {data && data.requests.length === 0 && (
        <p className="rounded-xl border border-dashed border-a-border px-4 py-8 text-center text-sm text-a-text-2">
          {tab === 'waiting' ? t('loyalty.requests.none_waiting', 'Nothing waits. New requests from the app show here.') : t('loyalty.requests.none', 'Nothing here yet.')}
        </p>
      )}
      {data && data.requests.length > 0 && (
        <>
          <ul className={`divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface ${query.isFetching ? 'opacity-80' : ''}`}>
            {data.requests.map(r => <RequestRow key={r.id} request={r} />)}
          </ul>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
      </div>
    </div>
  )
}
