import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Activity, Eye, Globe, RefreshCw } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { get } from '../lib/api'
import { count, timeAgo } from '../lib/format'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Page } from '../ui/Page'
import { Pager } from '../ui/Pager'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SearchInput } from '../ui/inputs'
import { Tabs } from '../ui/Tabs'
import type { Visitor, VisitorList } from './types'
import { VisitorPanel } from './VisitorPanel'
import { VISITOR_PARAM, VISITOR_TABS, hasContact, pageLabel, placeOf, presence, readTab, readVisitorId, tabCounts, visitorName, visitorsPath, type VisitorTab } from './visitorsLogic'
import { PRESENCE_DEFAULTS, TAB_DEFAULTS } from './words'

/** What was typed, once the person pauses. */
function useSettled(value: string, ms = 300): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return settled
}

/**
 * Who is on the website now and who was recently (2026-11-07), from the full admin's Visitors on the same endpoints:
 * where they are, the page they read, how often they came, and whether they left a way to reach them. A visitor opens
 * at a glance (`?v=<id>`), where a chat can be started with them.
 */
export function VisitorsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [search, setSearch] = useSearchParams()
  const tab = readTab(search.get(VISITOR_PARAM.tab))
  const openId = readVisitorId(search.get(VISITOR_PARAM.visitor))
  const [term, setTerm] = useState('')
  const settled = useSettled(term)
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)

  const list = useQuery({
    queryKey: ['crm', 'visitors', 'list', tab, settled.trim(), page],
    queryFn: () => get<VisitorList>(visitorsPath(tab, settled, page)),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  })

  const change = (edit: (next: URLSearchParams) => void, replace = false) => setSearch(prev => {
    const next = new URLSearchParams(prev)
    edit(next)
    return next
  }, { replace })
  const pickTab = (next: VisitorTab) => { setPage(1); change(p => { if (next === 'online') p.delete(VISITOR_PARAM.tab); else p.set(VISITOR_PARAM.tab, next) }, true) }
  const open = (id: number | null) => change(p => { if (id) p.set(VISITOR_PARAM.visitor, String(id)); else p.delete(VISITOR_PARAM.visitor) })

  const counts = tabCounts(list.data?.stats)
  const tabs = VISITOR_TABS.map(key => ({ key, label: t(`crm.visitors.tab.${key}`, TAB_DEFAULTS[key]), count: counts[key] }))
  const rows = list.data?.data ?? []
  const meta = list.data?.meta

  return (
    <Page title={t('crm.visitors.title', 'Visitors')} line={t('crm.visitors.line', 'Who is on your website now, what they read, and who left a way to reach them.')}
      actions={<Button variant="secondary" loading={refreshing} onClick={() => { setRefreshing(true); void list.refetch().finally(() => setRefreshing(false)) }}>
        {!refreshing && <RefreshCw size={15} aria-hidden />}{t('crm.visitors.refresh', 'Refresh')}
      </Button>}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs label={t('crm.visitors.tabs', 'Show')} items={tabs} value={tab} onChange={pickTab} />
        <SearchInput label={t('crm.visitors.search', 'Search by name, email, address or page')} value={term} onChange={v => { setTerm(v); setPage(1) }} className="md:w-80" />
      </div>

      <Card padded={false}>
        <div className={rows.length ? '' : 'p-4'}>
          <QueryState loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }} rows={6}>
            {rows.length === 0
              ? <EmptyState icon={Eye}
                  title={term.trim() ? t('crm.visitors.none_found', 'Nobody matches') : tab === 'online' ? t('crm.visitors.none_online', 'Nobody is on the site right now') : t('crm.visitors.none', 'No visitors here yet')}
                  line={term.trim() ? undefined : t('crm.visitors.none_line', 'Visitors show here once the chat is on your website, whether they write or not.')} />
              : (
                <ul className="divide-y divide-a-border">
                  {rows.map(v => <li key={v.id}><VisitorRow v={v} lang={lang} open={v.id === openId} onOpen={() => open(v.id)} /></li>)}
                </ul>
              )}
          </QueryState>
        </div>
        {meta && meta.last_page > 1 && <div className="border-t border-a-border px-4 pb-3"><Pager page={meta.current_page} last={meta.last_page} total={meta.total} onPage={setPage} /></div>}
      </Card>
      {meta && rows.length > 0 && <p className="text-xs text-a-text-2">{t('crm.visitors.count_line', '{{count}} visitors in this list', { count: meta.total })}</p>}

      {openId && <VisitorPanel key={openId} id={openId} onClose={() => open(null)} />}
    </Page>
  )
}

function VisitorRow({ v, lang, open, onOpen }: { v: Visitor; lang: string; open: boolean; onOpen: () => void }) {
  const { t } = useTranslation()
  const state = presence(v.last_seen_at)
  const name = visitorName(v)
  const place = placeOf(v)
  const reading = pageLabel(v.current_page_title, v.current_page)
  return (
    <button type="button" onClick={onOpen} aria-current={open ? 'true' : undefined}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent ${open ? 'bg-a-surface-2' : ''}`}>
      <span className="relative shrink-0">
        <Avatar name={name ?? '?'} tone={v.is_lead ? 'accent' : 'neutral'} />
        <span aria-hidden className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-a-surface ${state === 'online' ? 'bg-a-st-confirmed' : state === 'recent' ? 'bg-a-st-pending' : 'bg-a-border'}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-a-text">{name ?? t('crm.visitors.anonymous', 'Anonymous visitor')}</span>
          {v.is_lead && <Pill tone="accent">{t('crm.visitors.lead', 'Lead')}</Pill>}
          <span className="ml-auto shrink-0 text-xs text-a-text-2">
            <span className="sr-only">{t(`crm.visitors.presence.${state}`, PRESENCE_DEFAULTS[state])} · </span>
            {state === 'online' ? t('crm.visitors.now', 'Now') : timeAgo(v.last_seen_at, lang)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-a-text-2">
          <Globe size={12} aria-hidden className="shrink-0" />
          <span className="truncate">{place ?? v.visitor_ip ?? '—'}</span>
          {hasContact(v) && !name?.includes('@') && v.email && <span className="hidden truncate sm:inline">· {v.email}</span>}
        </span>
        {reading && (
          <span className="mt-0.5 flex items-center gap-1.5 text-sm text-a-text">
            <Activity size={13} aria-hidden className="shrink-0 text-a-accent-text" /><span className="truncate">{reading}</span>
          </span>
        )}
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <Pill>{t('crm.visitors.views_count', '{{n}} pages', { n: count(v.page_views_count ?? 0, lang) })}</Pill>
          <Pill>{t('crm.visitors.visits_count', '{{n}} visits', { n: count(v.visit_count ?? 1, lang) })}</Pill>
          {(v.messages_count ?? 0) > 0 && <Pill tone="progress">{t('crm.visitors.messages_count', '{{n}} messages', { n: count(v.messages_count ?? 0, lang) })}</Pill>}
          {hasContact(v) && <Pill tone="success">{t('crm.visitors.reachable', 'Left a contact')}</Pill>}
        </span>
      </span>
    </button>
  )
}
