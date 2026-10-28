import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { points, when } from '../lib/format'
import { overviewScope } from '../overview/overviewMath'
import { OverviewButton, OverviewRecovery, OverviewSkeleton } from '../overview/OverviewUI'
import { inbox } from './inboxApi'
import { inboxFilters, recordLabel, recordTitle } from './inboxMath'
import { RecordDetail, RecordStatus, ReferralDialog } from './RequestDetail'
import { useRequestWords } from './words'
import type { InboxRecord } from './types'
import './requests.css'

export function RequestsPage() {
  const boot = useBoot()
  const { t, i18n } = useTranslation()
  const say = useRequestWords()
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const latest = useRef(params)
  const cleared = useRef('')
  const detailRef = useRef<HTMLElement>(null)
  const focusRecord = useRef('')
  const restoreRow = useRef(false)
  useEffect(() => { latest.current = params }, [params])
  const filters = inboxFilters(params.toString())
  const scope = overviewScope(boot)
  const query = useQuery({ queryKey: ['loyalty', 'requests', 'inbox', scope, filters], queryFn: ({ signal }) => inbox(filters, signal), refetchInterval: 60_000, retry: (n, e) => ![401, 403, 404, 422].includes(failureOf(e).status) && n < 1 })
  const forbidden = [401, 402, 403].includes(failureOf(query.error).status)
  useEffect(() => {
    if (forbidden && cleared.current !== scope) { cleared.current = scope; client.removeQueries({ queryKey: ['loyalty', 'requests', 'inbox', scope] }) }
    else if (query.isSuccess) cleared.current = ''
  }, [forbidden, query.isSuccess, client, scope])
  const data = forbidden ? undefined : query.data
  const selected = data?.selected ?? data?.records[0]
  useEffect(() => {
    if (!restoreRow.current || params.get('detail') === '1' || !data) return
    // Wait until the native dialog has unmounted and the list is no longer inert.
    const frame = requestAnimationFrame(() => {
      const row = document.querySelector<HTMLButtonElement>('.l-rq-row[aria-pressed="true"]')
      if (row) { row.focus(); restoreRow.current = false }
    })
    return () => cancelAnimationFrame(frame)
  }, [params, data])
  useEffect(() => {
    if (selected && focusRecord.current === selected.key && detailRef.current) {
      focusRecord.current = ''
      detailRef.current.focus({ preventScroll: true })
      detailRef.current.scrollIntoView({ block: 'start', behavior: 'instant' })
    }
  }, [selected])
  const change = (changes: Record<string, string | null>, reset = false, replace = false) => {
    const next = new URLSearchParams(latest.current)
    if (reset) { for (const k of ['tab', 'request', 'record', 'detail', 'page']) next.delete(k); next.set('type', filters.type); next.set('view', filters.view) }
    for (const [k, v] of Object.entries(changes)) { if (v === null || v === '') next.delete(k); else next.set(k, v) }
    latest.current = next
    setParams(next, { replace })
  }
  const choose = (row: InboxRecord) => {
    if (row.kind !== 'referral' && window.matchMedia('(max-width: 900px)').matches) focusRecord.current = row.key
    change({ record: row.key, request: null, detail: row.kind === 'referral' ? '1' : null })
  }
  const title = say(({ open: 'openTitle', closed: 'closedTitle', all: 'allTitle', waiting: 'waitingTitle', approved: 'approvedTitle' } as const)[filters.view])
  return <div className="l-ov-page l-rq-page">
    <header className="l-ov-page-heading"><div><h1>{t('loyalty.requests.title', 'Requests')}</h1><p>{say('line')}</p></div><OverviewButton disabled={query.isFetching} aria-busy={query.isFetching} onClick={() => { void query.refetch() }}>{say('refresh')}</OverviewButton></header>
    <div className="l-ov-panel l-rq-filters">
      <label><span>{say('search')}</span><input type="search" maxLength={120} placeholder={say('searchHint')} value={filters.q} onChange={e => change({ q: e.target.value }, true, true)} /></label>
      <label><span>{say('type')}</span><select aria-label={say('type')} value={filters.type} onChange={e => change({ type: e.target.value, ...(['waiting', 'approved'].includes(filters.view) && e.target.value !== 'benefit' ? { view: 'open' } : {}) }, true)}>{(['all', 'benefit', 'redemption', 'referral'] as const).map(v => <option key={v} value={v}>{say(v === 'all' ? 'allTypes' : v)}</option>)}</select></label>
      <label><span>{say('view')}</span><select aria-label={say('view')} value={filters.view} onChange={e => change({ view: e.target.value }, true)}>{(['open', 'closed', 'all', ...(filters.type === 'benefit' ? ['waiting', 'approved'] as const : [])] as const).map(v => <option key={v} value={v}>{say(v)}</option>)}</select></label>
      <label><span>{say('sort')}</span><select aria-label={say('sort')} value={filters.sort} onChange={e => change({ sort: e.target.value }, true)}><option value="newest">{say('newest')}</option><option value="oldest">{say('oldest')}</option></select></label>
    </div>
    {query.isError && <div><OverviewRecovery title={data ? say('stale') : undefined} forbidden={forbidden} onRetry={() => { void query.refetch() }} busy={query.isFetching} />{filters.selected_id && <OverviewButton onClick={() => change({ record: null, request: null, detail: null })}>{t('loyalty.overview.allRequests', 'View all requests')}</OverviewButton>}</div>}
    {!data && query.isPending && <OverviewSkeleton rows={6} />}
    {data && <div className="l-rq-columns">
      <section className="l-ov-panel l-rq-list" aria-label={title} aria-busy={query.isFetching}>
        <div className="l-rq-list-heading"><h2>{title}</h2><span>{say('records', { n: points(data.total, i18n.language) })}</span></div>
        {data.records.length ? <ul className="l-rq-rows">{data.records.map(row => <li key={row.key}><button type="button" className={`l-rq-row ${selected?.key === row.key ? 'l-rq-selected' : ''}`} aria-pressed={selected?.key === row.key} onClick={() => choose(row)}>
          <span className="l-rq-row-heading"><strong>{recordTitle(row, say)}</strong><RecordStatus row={row} /></span><span>{say(row.kind)} · {row.member?.name || row.member?.number || say('unavailableMember')}</span><small>{recordLabel(row)} · {when(row.at, i18n.language, boot.venue.timezone) || '—'}</small>
        </button></li>)}</ul> : <div className="l-rq-empty"><h3>{say('empty')}</h3><p>{say('emptyLine')}</p><OverviewButton onClick={() => { latest.current = new URLSearchParams(); setParams({}) }}>{say('clear')}</OverviewButton></div>}
        <div className="l-rq-pagination"><span>{say('showing', { from: data.total ? (data.page - 1) * data.per_page + 1 : 0, to: Math.min(data.page * data.per_page, data.total), total: data.total })}</span><OverviewButton disabled={query.isFetching || data.page <= 1} onClick={() => change({ page: String(data.page - 1), record: null, detail: null, request: null })}>{t('loyalty.common.previous', 'Previous')}</OverviewButton><OverviewButton disabled={query.isFetching || data.page >= data.pages} onClick={() => change({ page: String(data.page + 1), record: null, detail: null, request: null })}>{t('loyalty.common.next', 'Next')}</OverviewButton></div>
        <p className="l-rq-note">{say('referralNote')}</p>
      </section>
      {selected ? <RecordDetail detailRef={detailRef} key={selected.key} row={selected} blocked={query.isFetching || query.isError} hold={() => change({ record: selected.key, request: null }, false, true)} onDetails={() => change({ record: selected.key, detail: '1' })} /> : <aside className="l-ov-panel l-rq-empty"><p>{say('choose')}</p></aside>}
    </div>}
    {selected?.kind === 'referral' && params.get('detail') === '1' && <ReferralDialog row={selected} onClose={() => {
      restoreRow.current = true
      change({ detail: null }, false, true)
    }} />}
  </div>
}
