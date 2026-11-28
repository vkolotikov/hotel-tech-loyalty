import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownWideNarrow, CalendarRange, Check, ListFilter, MessageCircle, MessagesSquare, UserX, Users, Volume2, VolumeX, X,
  type LucideIcon,
} from 'lucide-react'
import { onShortcuts } from '../../workspace/lib/shortcuts'
import { useBoot } from '../CrmProvider'
import { AlertsToggle } from '../alerts/AlertsToggle'
import { get } from '../lib/api'
import { count } from '../lib/format'
import { Popover } from '../ui/Menu'
import { Page } from '../ui/Page'
import { SearchInput } from '../ui/inputs'
import { ConversationList } from './ConversationList'
import { ConversationView } from './ConversationView'
import { IconToggle, Segmented, type Segment } from './controls'
import {
  FEED_INTENTS, FEED_RANGES, filterCountsPath, readCounts, readIntent, readRange, type FeedIntent, type FeedPage, type FeedRange,
} from './feedLogic'
import { INTENT_ICON, INTENT_TONE, STATUS_ICON, TONE_INK } from './icons'
import {
  INBOX_PARAM, STATUS_FILTERS, activeFilters, feedConversations, filterCounts, inboxSource, readConversationId, readDetailsTab,
  readFlag, readSort, readStatus, shownRows, stepConversation, type InboxRow, type InboxSort, type InboxView, type StatusFilter,
} from './inboxLogic'
import { inboxKeys } from './inboxQueries'
import { loadDetailsOpen, loadGroup, rememberDetailsOpen, rememberGroup } from './prefs'
import { chime, rememberSound, shouldChime, soundOn } from './sound'
import type { Agent, Conversation, InboxStats, Page as Paged } from './types'
import { INTENT_DEFAULTS, RANGE_DEFAULTS, STATUS_DEFAULTS } from './words'

/** What was typed, once the person pauses (the list asks the server again only then). */
function useSettled(value: string, ms = 300): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return settled
}

interface ListAnswer { rows: InboxRow[]; page: number; last: number; total: number }

/**
 * The website chat's live inbox (2026-11-07; round 5, owner 2026-11-12: "a full-height app … minimize copy, more
 * icons"): one compact header row — the title, the search, the statuses as icons with their counts, the priority
 * order and the intents (the full admin's Engagement feed), nobody assigned, one row per visitor, the sound and the
 * desktop alerts — over three panes that fill the screen: the conversations, the open thread, and its details in tabs
 * (folded away at a press). J and K move through the list, E resolves the open chat. `?c=` opens a conversation,
 * `?status=waiting` the waiting ones (Today links to both). On a phone: the list, then the thread.
 */
export function InboxPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const feedOn = boot.features.engagement
  const lang = i18n.language
  const [search, setSearch] = useSearchParams()
  const status = readStatus(search.get(INBOX_PARAM.status))
  const openId = readConversationId(search.get(INBOX_PARAM.conversation))
  const sort = feedOn ? readSort(search.get(INBOX_PARAM.sort)) : 'newest'
  const intent = feedOn ? readIntent(search.get(INBOX_PARAM.intent)) : null
  const unassigned = readFlag(search.get(INBOX_PARAM.unassigned))
  const range = readRange(search.get(INBOX_PARAM.range))
  const [term, setTerm] = useState('')
  const settled = useSettled(term)
  const [group, setGroup] = useState(loadGroup)
  const [sound, setSound] = useState(soundOn)
  const [detailsOpen, setDetailsOpen] = useState(loadDetailsOpen)
  const [page, setPage] = useState(1)
  const detailsTab = readDetailsTab(search.get(INBOX_PARAM.detailsTab))

  const view: InboxView = { status, sort, intent, unassigned, range, search: settled, group, page }
  const source = inboxSource(view, feedOn)
  const feedMode = source.kind === 'feed'

  const stats = useQuery({ queryKey: inboxKeys.stats, queryFn: () => get<InboxStats>('chat-inbox/stats'), refetchInterval: 10_000 })
  const list = useQuery({
    queryKey: [...inboxKeys.lists, source.path, source.kind === 'feed' ? `${source.status ?? 'all'}:${source.unassigned ? 1 : 0}` : ''],
    queryFn: async (): Promise<ListAnswer> => {
      if (source.kind === 'feed') {
        const answer = await get<FeedPage>(source.path)
        return { rows: feedConversations(answer?.data ?? [], source), page: answer?.meta?.current_page ?? 1, last: answer?.meta?.last_page ?? 1, total: answer?.meta?.total ?? 0 }
      }
      const answer = await get<Paged<Conversation>>(source.path)
      return { rows: answer?.data ?? [], page: answer?.current_page ?? 1, last: answer?.last_page ?? 1, total: answer?.total ?? 0 }
    },
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  })
  // The feed names who has a chat by id only: the team's names come from the list the assignment uses.
  const agents = useQuery({ queryKey: inboxKeys.agents, queryFn: () => get<Agent[]>('chat-inbox-agents'), staleTime: 60_000, enabled: feedMode })
  const agentNames = useMemo(() => new Map((agents.data ?? []).map(a => [a.id, a.name])), [agents.data])

  // A chime when a visitor writes, as the full admin's inbox (this device may switch it off).
  const unread = stats.data?.unread_messages
  const seen = useRef<number | null>(null)
  useEffect(() => {
    if (unread === undefined) return
    if (sound && shouldChime(seen.current, unread)) chime()
    seen.current = unread
  }, [unread, sound])

  const change = (edit: (next: URLSearchParams) => void, replace = false) => setSearch(prev => {
    const next = new URLSearchParams(prev)
    edit(next)
    return next
  }, { replace })
  const setParam = (key: string, value: string | null) => { setPage(1); change(p => { if (value) p.set(key, value); else p.delete(key) }, true) }
  const open = (id: number | null) => change(next => { if (id) next.set(INBOX_PARAM.conversation, String(id)); else next.delete(INBOX_PARAM.conversation) })
  const pickStatus = (next: StatusFilter) => setParam(INBOX_PARAM.status, next === 'all' ? null : next)
  const pickSort = (priority: boolean) => setParam(INBOX_PARAM.sort, priority ? 'priority' : null)
  const pickIntent = (next: FeedIntent | null) => setParam(INBOX_PARAM.intent, next)
  const pickRange = (next: FeedRange) => setParam(INBOX_PARAM.range, next === 'all' ? null : next)
  const pickUnassigned = (on: boolean) => setParam(INBOX_PARAM.unassigned, on ? '1' : null)
  const pickTab = (tab: string) => change(p => p.set(INBOX_PARAM.detailsTab, tab), true)
  const typed = (next: string) => { setTerm(next); setPage(1) }
  const grouped = (on: boolean) => { setGroup(on); setPage(1); rememberGroup(on) }
  const sounded = (on: boolean) => { setSound(on); rememberSound(on) }
  const folded = (openNow: boolean) => { setDetailsOpen(openNow); rememberDetailsOpen(openNow) }

  const rows = shownRows(source.kind, list.data?.rows ?? [], term)
  const figures = stats.data
  const counts = filterCounts(figures)
  const segments: Segment<StatusFilter>[] = STATUS_FILTERS.map(key => ({
    key,
    icon: STATUS_ICON[key],
    label: key === 'all' ? t('crm.common.all', 'All') : t(`crm.status.${key}`, STATUS_DEFAULTS[key]),
    count: counts[key],
    tone: key === 'waiting' ? 'pending' : undefined,
  }))

  // J and K walk the list as shown; the shell's letters (I, L, T, N, /, ?) and a panel's [ ] are left alone.
  const walk = useRef({ ids: rows.map(r => r.id), openId, open })
  useEffect(() => { walk.current = { ids: rows.map(r => r.id), openId, open } })
  useEffect(() => onShortcuts(window, document, { letters: { j: 'next', k: 'previous' } }, (hit, e) => {
    if (hit !== 'next' && hit !== 'previous') return
    const id = stepConversation(walk.current.ids, walk.current.openId, hit === 'next' ? 1 : -1)
    if (id === null) return
    e.preventDefault()
    walk.current.open(id)
  }), [])

  const unreadBadge = figures && figures.unread_messages > 0 && (
    <span role="img" aria-label={t('crm.inbox.unread_total', '{{count}} unread messages', { count: figures.unread_messages })} title={t('crm.inbox.unread_total', '{{count}} unread messages', { count: figures.unread_messages })}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-a-accent/12 px-2 text-xs font-semibold text-a-accent-text">
      <MessageCircle size={13} aria-hidden />{count(figures.unread_messages, lang)}
    </span>
  )
  const unassignedLabel = t('crm.inbox.unassigned', '{{count}} open with nobody assigned', { count: figures?.unassigned ?? 0 })
  const groupLabel = feedMode ? t('crm.inbox.group_feed', 'One row per visitor (always, in priority order)') : t('crm.inbox.group', 'One row per visitor')
  const soundLabel = t('crm.inbox.sound', 'Sound when a visitor writes')
  const toggles = (
    <>
      <IconToggle on={unassigned} onChange={pickUnassigned} icon={UserX} label={unassignedLabel} count={figures?.unassigned} tone="danger" />
      <IconToggle on={group || feedMode} onChange={grouped} icon={Users} label={groupLabel} disabled={feedMode} />
      <IconToggle on={sound} onChange={sounded} icon={sound ? Volume2 : VolumeX} label={soundLabel} />
      <AlertsToggle />
    </>
  )
  const filters = feedOn && (
    <InboxFilters sort={sort} intent={intent} range={range} feedMode={feedMode} active={activeFilters({ sort, intent, range }, feedOn)}
      onSort={pickSort} onIntent={pickIntent} onRange={pickRange} phoneExtras={<div className="flex flex-wrap gap-2 sm:hidden">{toggles}</div>} />
  )
  const searchBox = <SearchInput label={t('crm.inbox.search', 'Search by name or email')} value={term} onChange={typed} />
  const statusBar = <Segmented label={t('crm.inbox.filter_label', 'Show')} items={segments} value={status} onChange={pickStatus} />

  const chips = [
    sort === 'priority' && <Chip key="sort" icon={ArrowDownWideNarrow} label={t('crm.inbox.sort_priority', 'Priority first')} onRemove={() => pickSort(false)} />,
    intent && <Chip key="intent" icon={INTENT_ICON[intent]} label={t(`crm.inbox.intent.${intent}`, INTENT_DEFAULTS[intent])} onRemove={() => pickIntent(null)} />,
    feedMode && range !== 'all' && <Chip key="range" icon={CalendarRange} label={t(`crm.inbox.range.${range}`, RANGE_DEFAULTS[range])} onRemove={() => pickRange('all')} />,
    unassigned && <Chip key="nobody" icon={UserX} label={t('crm.inbox.nobody_short', 'Nobody assigned')} onRemove={() => pickUnassigned(false)} />,
  ].filter(Boolean)

  const gridCols = !openId
    ? 'md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(18rem,23rem)_minmax(0,1fr)]'
    : detailsOpen
      ? 'md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)_19rem] 2xl:grid-cols-[minmax(18rem,23rem)_minmax(0,1fr)_22rem]'
      : 'md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(18rem,23rem)_minmax(0,1fr)]'

  return (
    <div className="md:h-[calc(100dvh-3.5rem)]">
      <Page flush icon={MessagesSquare} title={t('crm.inbox.title', 'Inbox')}
        line={t('crm.inbox.line', 'Every chat from your website. Answer, take over from the assistant, and turn a visitor into a lead.')}
        actions={<>
          {unreadBadge}
          <div className="hidden w-56 sm:block 2xl:w-64">{searchBox}</div>
          <div className="hidden sm:block">{statusBar}</div>
          {feedOn && <IconToggle on={sort === 'priority'} onChange={pickSort} icon={ArrowDownWideNarrow} label={t('crm.inbox.sort_priority', 'Priority first')} />}
          {filters}
          <div className={`${feedOn ? 'hidden sm:contents' : 'contents'}`}>{toggles}</div>
        </>}
        below={<>
          <div className="flex flex-col gap-2 sm:hidden">
            {searchBox}
            {statusBar}
          </div>
          {chips.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-0">{chips}</div>}
        </>}>

        <div className={`grid min-h-0 min-w-0 flex-1 md:grid-rows-[minmax(0,1fr)] md:overflow-hidden md:rounded-2xl md:border md:border-a-border md:bg-a-surface md:shadow-a-sm ${gridCols}`}>
          <ConversationList className={openId ? 'hidden md:flex' : 'flex'}
            rows={rows} loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }}
            term={term} total={list.data?.total} openId={openId} onOpen={id => open(id)} agents={agentNames}
            page={list.data?.page ?? page} last={list.data?.last ?? 1} onPage={setPage} />
          {openId
            ? <ConversationView key={openId} id={openId} onBack={() => open(null)}
                detailsOpen={detailsOpen} onDetailsOpen={folded} detailsTab={detailsTab} onDetailsTab={pickTab} />
            : (
              <div className="hidden min-h-0 flex-col items-center justify-center gap-2 p-8 text-center md:flex">
                <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-a-accent/12 text-a-accent-text"><MessagesSquare size={22} /></span>
                <p className="font-a-display text-xl text-a-text">{t('crm.inbox.pick', 'Pick a conversation')}</p>
                <p role="img" aria-label={t('crm.inbox.keys', 'J and K move through the list')} title={t('crm.inbox.keys', 'J and K move through the list')} className="text-sm text-a-text-2">
                  <kbd className="rounded-md border border-a-border px-1.5 font-a-mono text-xs">J</kbd> <kbd className="rounded-md border border-a-border px-1.5 font-a-mono text-xs">K</kbd>
                </p>
                {figures && figures.waiting > 0 && status !== 'waiting' && (
                  <button type="button" onClick={() => pickStatus('waiting')}
                    className="mt-1 inline-flex min-h-9 items-center gap-2 rounded-full border border-a-st-pending/40 bg-a-st-pending/12 px-3.5 text-sm font-semibold text-a-st-pending hover:bg-a-st-pending/20 focus-visible:outline-2 focus-visible:outline-a-accent">
                    <STATUS_ICON.waiting size={15} aria-hidden />{t('crm.inbox.show_waiting', 'Show the {{n}} waiting', { n: count(figures.waiting, lang) })}
                  </button>
                )}
              </div>
            )}
        </div>
      </Page>
    </div>
  )
}

/** One filter that is on, removable at a press. */
function Chip({ icon: Icon, label, onRemove }: { icon: LucideIcon; label: string; onRemove: () => void }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-a-accent/30 bg-a-accent/10 py-0.5 pl-2 pr-0.5 text-xs font-medium text-a-accent-text">
      <Icon size={13} aria-hidden />{label}
      <button type="button" onClick={onRemove} aria-label={`${t('crm.inbox.remove_filter', 'Remove the filter')}: ${label}`}
        className="grid h-6 w-6 place-items-center rounded-full hover:bg-a-accent/15 focus-visible:outline-2 focus-visible:outline-a-accent"><X size={12} aria-hidden /></button>
    </span>
  )
}

/**
 * The Filters button (round 5): the order (newest or the feed's priority), what the chat is about (the feed's intents,
 * with how many visitors each holds in the window), and the window itself while the feed is the list. On a phone it
 * also holds the header's switches.
 */
function InboxFilters({ sort, intent, range, feedMode, active, onSort, onIntent, onRange, phoneExtras }: {
  sort: InboxSort
  intent: FeedIntent | null
  range: FeedRange
  feedMode: boolean
  active: number
  onSort: (priority: boolean) => void
  onIntent: (intent: FeedIntent | null) => void
  onRange: (range: FeedRange) => void
  phoneExtras: ReactNode
}) {
  const { t } = useTranslation()
  const label = t('crm.inbox.filters', 'Filters')
  return (
    <Popover label={label} align="right" width="w-72"
      className={`relative inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-xl border px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${active ? 'border-a-accent/40 bg-a-accent/12 text-a-accent-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}
      button={<><ListFilter size={16} aria-hidden />{active > 0 && <span className="text-xs font-semibold tabular-nums">{active}</span>}</>}>
      <FilterBody sort={sort} intent={intent} range={range} feedMode={feedMode} onSort={onSort} onIntent={onIntent} onRange={onRange} />
      {phoneExtras}
    </Popover>
  )
}

/** The panel's body; mounted only while it is open, so the intents' counts are asked for only then. */
function FilterBody({ sort, intent, range, feedMode, onSort, onIntent, onRange }: {
  sort: InboxSort
  intent: FeedIntent | null
  range: FeedRange
  feedMode: boolean
  onSort: (priority: boolean) => void
  onIntent: (intent: FeedIntent | null) => void
  onRange: (range: FeedRange) => void
}) {
  const { t, i18n } = useTranslation()
  const counts = useQuery({
    queryKey: ['crm', 'inbox', 'feed-counts', range],
    queryFn: () => get<{ data?: unknown }>(filterCountsPath(range)).then(readCounts),
    staleTime: 30_000,
  })
  const item = (on: boolean) => `flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-a-accent ${on ? 'bg-a-accent/12 text-a-text' : 'text-a-text hover:bg-a-surface-2'}`
  const heading = 'px-2.5 pb-1 pt-1.5 text-xs font-semibold text-a-text-2'
  return (
    <div className="space-y-1">
      <p className={heading}>{t('crm.inbox.order', 'Order')}</p>
      <div role="group" aria-label={t('crm.inbox.order', 'Order')}>
        <button type="button" aria-pressed={sort === 'newest'} data-close onClick={() => onSort(false)} className={item(sort === 'newest')}>
          <MessageCircle size={15} aria-hidden className="shrink-0 text-a-text-2" /><span className="flex-1">{t('crm.inbox.sort_newest', 'Newest first')}</span>
          {sort === 'newest' && <Check size={14} aria-hidden className="text-a-accent-text" />}
        </button>
        <button type="button" aria-pressed={sort === 'priority'} data-close onClick={() => onSort(true)} className={item(sort === 'priority')}>
          <ArrowDownWideNarrow size={15} aria-hidden className="shrink-0 text-a-text-2" /><span className="flex-1">{t('crm.inbox.sort_priority', 'Priority first')}</span>
          {sort === 'priority' && <Check size={14} aria-hidden className="text-a-accent-text" />}
        </button>
      </div>
      <div role="separator" className="my-1 h-px bg-a-border" />
      <p className={heading}>{t('crm.inbox.about_filter', 'About')}</p>
      <div role="group" aria-label={t('crm.inbox.about_filter', 'About')}>
        <button type="button" aria-pressed={intent === null} data-close onClick={() => onIntent(null)} className={item(intent === null)}>
          <span aria-hidden className="w-[15px] shrink-0" /><span className="flex-1">{t('crm.inbox.any_intent', 'Anything')}</span>
          {intent === null && <Check size={14} aria-hidden className="text-a-accent-text" />}
        </button>
        {FEED_INTENTS.map(key => {
          const Icon = INTENT_ICON[key]
          const n = counts.data?.[key]
          return (
            <button key={key} type="button" aria-pressed={intent === key} data-close onClick={() => onIntent(key)} className={item(intent === key)}>
              <Icon size={15} aria-hidden className={`shrink-0 ${TONE_INK[INTENT_TONE[key]]}`} />
              <span className="min-w-0 flex-1 truncate">{t(`crm.inbox.intent.${key}`, INTENT_DEFAULTS[key])}</span>
              {n !== undefined && <span className="text-xs tabular-nums text-a-text-2">{count(n, i18n.language)}</span>}
              {intent === key && <Check size={14} aria-hidden className="text-a-accent-text" />}
            </button>
          )
        })}
      </div>
      {feedMode && (
        <>
          <div role="separator" className="my-1 h-px bg-a-border" />
          <p className={heading}>{t('crm.inbox.range_label', 'When')}</p>
          <div role="group" aria-label={t('crm.inbox.range_label', 'When')} className="flex flex-wrap gap-1 px-1.5 pb-1">
            {FEED_RANGES.map(key => (
              <button key={key} type="button" aria-pressed={range === key} onClick={() => onRange(key)}
                className={`min-h-8 rounded-lg border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-a-accent ${range === key ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                {t(`crm.inbox.range.${key}`, RANGE_DEFAULTS[key])}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
