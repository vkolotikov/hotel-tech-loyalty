import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Activity, CalendarRange, Clock, Contact, Eye, Flame, MailQuestion, MapPin, MessageCircle, Moon, Radio, RefreshCw, Repeat, Target,
  Users, type LucideIcon,
} from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { get } from '../lib/api'
import { count, timeAgo } from '../lib/format'
import { stepIn } from '../lib/records'
import { Avatar } from '../ui/Avatar'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { ActionMenu } from '../ui/Menu'
import { Page } from '../ui/Page'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { SearchInput } from '../ui/inputs'
import { HotMark, IntentMark } from '../inbox/ConversationList'
import { Segmented, type Segment } from '../inbox/controls'
import { FEED_RANGES, filterCountsPath, readCounts, readRange, type FeedPage, type FeedRange } from '../inbox/feedLogic'
import { RANGE_DEFAULTS } from '../inbox/words'
import type { VisitorList } from './types'
import { VisitorPanel } from './VisitorPanel'
import {
  ALL_VISITOR_TABS, VISITOR_PARAM, VISITOR_TABS, feedList, hasContact, isFeedTab, pageLabel, placeOf, presence, readPanelTab, readTab,
  readVisitorId, tabCounts, visitorName, visitorsSource, type VisitorRow, type VisitorTab,
} from './visitorsLogic'
import { PRESENCE_DEFAULTS, TAB_DEFAULTS } from './words'

const TAB_ICON: Record<VisitorTab, LucideIcon> = {
  online: Radio, all: Users, offline: Moon, leads: Target, hot_lead: Flame, has_contact: Contact, missed: MailQuestion,
}

/** What was typed, once the person pauses. */
function useSettled(value: string, ms = 300): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return settled
}

interface ListAnswer { rows: VisitorRow[]; page: number; last: number; total: number; online: number | null; stats?: VisitorList['stats'] }

/**
 * Who is on the website now and who was recently (2026-11-07; round 5, owner 2026-11-12: "minimize copy … icons
 * everywhere"): one header with the live count, the search and the tabs as icons with their counts — on the site now,
 * everyone, away, leads, and the full admin's Engagement filters hot leads, has contact and missed (its feed, in the
 * server's priority order, in a window) —, then a dense list with a live dot per visitor. A visitor opens in a panel
 * (`?v=<id>`, its tab `?vtab=`), where a chat can be started with them; `[` and `]` step through the list.
 */
export function VisitorsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const feedOn = boot.features.engagement
  const lang = i18n.language
  const [search, setSearch] = useSearchParams()
  const tab = readTab(search.get(VISITOR_PARAM.tab), feedOn)
  const openId = readVisitorId(search.get(VISITOR_PARAM.visitor))
  const panelTab = readPanelTab(search.get(VISITOR_PARAM.panelTab))
  const range = readRange(search.get(VISITOR_PARAM.range))
  const [term, setTerm] = useState('')
  const settled = useSettled(term)
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const source = visitorsSource(tab, settled, page, range)

  const list = useQuery({
    queryKey: ['crm', 'visitors', 'list', source.path],
    queryFn: async (): Promise<ListAnswer> => {
      if (source.kind === 'feed') {
        const { rows, meta } = feedList(await get<FeedPage>(source.path))
        return { rows, page: meta?.current_page ?? 1, last: meta?.last_page ?? 1, total: meta?.total ?? 0, online: null }
      }
      const answer = await get<VisitorList>(source.path)
      const meta = answer?.meta
      return { rows: answer?.data ?? [], page: meta?.current_page ?? 1, last: meta?.last_page ?? 1, total: meta?.total ?? 0, online: answer?.stats?.online ?? null, stats: answer?.stats }
    },
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  })
  // The Visitors endpoint's own figures (the four tabs and who is online) stay on screen on a feed tab too.
  const base = useQuery({
    queryKey: ['crm', 'visitors', 'stats'],
    queryFn: () => get<VisitorList>('visitors?status=online').then(r => r?.stats),
    enabled: source.kind === 'feed',
    refetchInterval: 30_000,
  })
  const feedCounts = useQuery({
    queryKey: ['crm', 'visitors', 'feed-counts', range],
    queryFn: () => get<{ data?: unknown }>(filterCountsPath(range)).then(readCounts),
    enabled: feedOn,
    refetchInterval: 30_000,
  })

  const change = (edit: (next: URLSearchParams) => void, replace = false) => setSearch(prev => {
    const next = new URLSearchParams(prev)
    edit(next)
    return next
  }, { replace })
  const pickTab = (next: VisitorTab) => { setPage(1); change(p => { if (next === 'online') p.delete(VISITOR_PARAM.tab); else p.set(VISITOR_PARAM.tab, next) }, true) }
  const pickRange = (next: FeedRange) => { setPage(1); change(p => { if (next === 'all') p.delete(VISITOR_PARAM.range); else p.set(VISITOR_PARAM.range, next) }, true) }
  const open = (id: number | null) => change(p => {
    if (id) p.set(VISITOR_PARAM.visitor, String(id)); else { p.delete(VISITOR_PARAM.visitor); p.delete(VISITOR_PARAM.panelTab) }
  })
  const pickPanelTab = (next: string) => change(p => p.set(VISITOR_PARAM.panelTab, next), true)

  const stats = list.data?.stats ?? base.data
  const counts = tabCounts(stats, feedCounts.data)
  const tabs = (feedOn ? ALL_VISITOR_TABS : VISITOR_TABS).map((key): Segment<VisitorTab> => ({
    key, icon: TAB_ICON[key], label: t(`crm.visitors.tab.${key}`, TAB_DEFAULTS[key]), count: counts[key],
    tone: key === 'online' || key === 'hot_lead' ? 'pending' : undefined,
  }))
  const rows = list.data?.rows ?? []
  const ids = rows.map(v => v.id)
  const step = (dir: -1 | 1) => {
    if (!openId) return null
    const id = stepIn(ids, openId, dir)
    return id === null ? null : () => open(id)
  }
  const online = stats?.online ?? 0

  const live = online > 0 && (
    <span role="img" aria-label={t('crm.visitors.online_now', '{{n}} on the site right now', { n: count(online, lang) })} title={t('crm.visitors.online_now', '{{n}} on the site right now', { n: count(online, lang) })}
      className="inline-flex h-7 items-center gap-1.5 rounded-full bg-a-st-confirmed/12 px-2.5 text-xs font-semibold text-a-st-confirmed">
      <span aria-hidden className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-a-st-confirmed opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-a-st-confirmed" /></span>
      {count(online, lang)}
    </span>
  )
  const rangeLabel = t(`crm.inbox.range.${range}`, RANGE_DEFAULTS[range])

  return (
    <Page wide icon={Eye} title={t('crm.visitors.title', 'Visitors')} line={t('crm.visitors.line', 'Who is on your website now, what they read, and who left a way to reach them.')}
      actions={<>
        {live}
        {isFeedTab(tab) && (
          <ActionMenu label={`${t('crm.inbox.range_label', 'When')}: ${rangeLabel}`} icon={CalendarRange}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-a-accent ${range === 'all' ? 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text' : 'border-a-accent/40 bg-a-accent/12 text-a-accent-text'}`}
            button={<><CalendarRange size={15} aria-hidden /><span className="hidden sm:inline">{rangeLabel}</span></>}
            items={FEED_RANGES.map(key => ({ key, label: t(`crm.inbox.range.${key}`, RANGE_DEFAULTS[key]), checked: key === range, onSelect: () => pickRange(key) }))} />
        )}
        <IconButton icon={RefreshCw} label={t('crm.visitors.refresh', 'Refresh')} disabled={refreshing} className={refreshing ? 'animate-spin' : ''}
          onClick={() => { setRefreshing(true); void list.refetch().finally(() => setRefreshing(false)) }} />
      </>}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput label={t('crm.visitors.search', 'Search by name, email, address or page')} value={term} onChange={v => { setTerm(v); setPage(1) }} className="sm:w-64" />
        <Segmented label={t('crm.visitors.tabs', 'Show')} items={tabs} value={tab} onChange={pickTab} labels="wide" />
      </div>

      <div className="min-w-0 overflow-hidden rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
        {rows.length > 0 && (
          <div className="hidden items-center gap-3 border-b border-a-border px-3 py-2 text-xs font-medium text-a-text-2 md:flex">
            <span className="min-w-0 flex-1 pl-11">{t('crm.visitors.col_visitor', 'Visitor')}</span>
            <span className="hidden w-60 lg:block xl:w-72">{t('crm.visitors.col_page', 'Page')}</span>
            <ColHead icon={Eye} label={t('crm.visitors.views', 'Pages viewed')} />
            <ColHead icon={Repeat} label={t('crm.visitors.visits', 'Visits')} />
            <ColHead icon={MessageCircle} label={t('crm.visitors.messages', 'Messages')} />
            <span role="img" aria-label={t('crm.visitors.col_seen', 'Last seen')} title={t('crm.visitors.col_seen', 'Last seen')} className="flex w-20 justify-end"><Clock size={14} aria-hidden /></span>
          </div>
        )}
        <QueryState loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }} rows={6}>
          {rows.length === 0
            ? <EmptyState icon={TAB_ICON[tab]}
                title={term.trim() ? t('crm.visitors.none_found', 'Nobody matches') : tab === 'online' ? t('crm.visitors.none_online', 'Nobody is on the site right now') : t('crm.visitors.none', 'No visitors here yet')}
                action={!term.trim() && tab !== 'all' ? (
                  <button type="button" onClick={() => pickTab('all')}
                    className="inline-flex min-h-9 items-center gap-2 rounded-full border border-a-border px-3.5 text-sm font-medium text-a-text hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
                    <Users size={15} aria-hidden />{t('crm.visitors.show_all', 'Show everyone')}
                  </button>
                ) : undefined} />
            : (
              <ul className="divide-y divide-a-border">
                {rows.map(v => <li key={v.id}><VisitorLine v={v} lang={lang} open={v.id === openId} onOpen={() => open(v.id)} /></li>)}
              </ul>
            )}
        </QueryState>
        {list.data && list.data.last > 1 && <div className="border-t border-a-border px-4 pb-3"><Pager page={list.data.page} last={list.data.last} total={list.data.total} onPage={setPage} /></div>}
      </div>

      {openId && <VisitorPanel key={openId} id={openId} tab={panelTab} onTab={pickPanelTab} onClose={() => open(null)} onPrev={step(-1)} onNext={step(1)} />}
    </Page>
  )
}

function ColHead({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return <span role="img" aria-label={label} title={label} className="flex w-12 justify-end"><Icon size={14} aria-hidden /></span>
}

const PRESENCE_DOT = { online: 'bg-a-st-confirmed', recent: 'bg-a-st-pending', away: 'bg-a-border' } as const

/** One visitor in one dense line: the live dot, who and where (with a hot lead's, the intent's and a lead's icons), the page, the counts, when. */
function VisitorLine({ v, lang, open, onOpen }: { v: VisitorRow; lang: string; open: boolean; onOpen: () => void }) {
  const { t } = useTranslation()
  const state = presence(v.last_seen_at)
  const name = visitorName(v)
  const place = placeOf(v)
  const reading = pageLabel(v.current_page_title, v.current_page)
  const when = state === 'online' ? <span className="font-medium text-a-st-confirmed">{t('crm.visitors.now', 'Now')}</span> : timeAgo(v.last_seen_at, lang)
  const num = (n: number | null | undefined, fallback = 0) => count(n ?? fallback, lang)
  return (
    <button type="button" onClick={onOpen} aria-current={open ? 'true' : undefined}
      className={`flex w-full items-center gap-3 border-l-[3px] px-3 py-2 text-left transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent ${open ? 'border-l-a-accent bg-a-accent/10' : 'border-l-transparent'}`}>
      <span className="relative shrink-0">
        <Avatar name={name ?? '?'} size="sm" tone={v.is_lead ? 'accent' : 'neutral'} />
        <span role="img" aria-label={t(`crm.visitors.presence.${state}`, PRESENCE_DEFAULTS[state])} className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-a-surface ${PRESENCE_DOT[state]}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-a-text">{name ?? t('crm.visitors.anonymous', 'Anonymous visitor')}</span>
          {v.hot && <HotMark />}
          <IntentMark tag={v.intent} />
          {v.is_lead && <span role="img" aria-label={t('crm.visitors.lead', 'Lead')} title={t('crm.visitors.lead', 'Lead')} className="inline-flex shrink-0 text-a-accent-text"><Target size={13} aria-hidden /></span>}
          {hasContact(v) && <span role="img" aria-label={t('crm.visitors.reachable', 'Left a contact')} title={t('crm.visitors.reachable', 'Left a contact')} className="inline-flex shrink-0 text-a-st-confirmed"><Contact size={13} aria-hidden /></span>}
          <span className="ml-auto shrink-0 pl-1 text-xs text-a-text-2 md:hidden">{when}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-a-text-2">
          <MapPin size={12} aria-hidden className="shrink-0" /><span className="truncate">{place ?? v.visitor_ip ?? '—'}</span>
          {reading && <span className={`min-w-0 items-center gap-1 lg:hidden ${state === 'online' ? 'inline-flex' : 'hidden sm:inline-flex'}`}>· <Activity size={12} aria-hidden className="shrink-0 text-a-accent-text" /><span className="truncate">{reading}</span></span>}
          <span className="ml-auto inline-flex shrink-0 items-center gap-2 pl-2 tabular-nums md:hidden">
            <span className="inline-flex items-center gap-0.5"><Eye size={12} aria-hidden />{num(v.page_views_count)}</span>
            {(v.messages_count ?? 0) > 0 && <span className="inline-flex items-center gap-0.5"><MessageCircle size={12} aria-hidden />{num(v.messages_count)}</span>}
          </span>
        </span>
      </span>
      <span className="hidden w-60 min-w-0 lg:block xl:w-72">
        {reading
          ? <span className="flex items-center gap-1.5 text-sm text-a-text"><Activity size={13} aria-hidden className="shrink-0 text-a-accent-text" /><span className="truncate">{reading}</span></span>
          : <span className="text-sm text-a-text-2">—</span>}
      </span>
      <span role="img" aria-label={t('crm.visitors.views_count', '{{n}} pages', { n: num(v.page_views_count) })} className="hidden w-12 text-right text-sm tabular-nums text-a-text md:block">{num(v.page_views_count)}</span>
      <span role="img" aria-label={t('crm.visitors.visits_count', '{{n}} visits', { n: num(v.visit_count, 1) })} className="hidden w-12 text-right text-sm tabular-nums text-a-text md:block">{num(v.visit_count, 1)}</span>
      <span role="img" aria-label={t('crm.visitors.messages_count', '{{n}} messages', { n: num(v.messages_count) })} className={`hidden w-12 text-right text-sm tabular-nums md:block ${(v.messages_count ?? 0) > 0 ? 'text-a-text' : 'text-a-text-2'}`}>{num(v.messages_count)}</span>
      <span className="hidden w-20 text-right text-xs text-a-text-2 md:block">{when}</span>
    </button>
  )
}
