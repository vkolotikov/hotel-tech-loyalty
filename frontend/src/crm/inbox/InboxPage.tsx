import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bell, BellOff, MessagesSquare, Users, type LucideIcon } from 'lucide-react'
import { get } from '../lib/api'
import { count } from '../lib/format'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { SearchInput } from '../ui/inputs'
import { Tabs } from '../ui/Tabs'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import { ConversationList } from './ConversationList'
import { ConversationView } from './ConversationView'
import { INBOX_PARAM, STATUS_FILTERS, filterCounts, listPath, readConversationId, readStatus, shownConversations, type StatusFilter } from './inboxLogic'
import { inboxKeys } from './inboxQueries'
import { chime, rememberSound, shouldChime, soundOn } from './sound'
import type { Conversation, InboxStats, Page as Paged } from './types'
import { STATUS_DEFAULTS } from './words'

const GROUP_KEY = 'crm:inbox-group'

function loadGroup(): boolean {
  try { return localStorage.getItem(GROUP_KEY) !== '0' } catch { return true }
}

/** What was typed, once the person pauses (the list asks the server again only then). */
function useSettled(value: string, ms = 300): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return settled
}

/** A switch in the toolbar: its icon, its name (beside it on a wide screen), pressed while on. */
function ToolbarSwitch({ on, onChange, icon: Icon, label, hint }: { on: boolean; onChange: (on: boolean) => void; icon: LucideIcon; label: string; hint?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)} title={hint ?? label}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${on ? 'border-a-accent/40 bg-a-accent/12 text-a-accent-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
      <Icon size={15} aria-hidden />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  )
}

/**
 * The website chat's live inbox (2026-11-07; round 2, polished): the list's controls in one toolbar (search, the status
 * filters with the server's counts, one row per visitor, the sound), then three panes — the conversations, the open
 * thread with its reply box, and the details of the person. `?c=<id>` opens a conversation and `?status=waiting` the
 * waiting ones (Today links to both). Rebuilt from the full admin's Chat inbox on the same endpoints.
 */
export function InboxPage() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useSearchParams()
  const status = readStatus(search.get(INBOX_PARAM.status))
  const openId = readConversationId(search.get(INBOX_PARAM.conversation))
  const [term, setTerm] = useState('')
  const settled = useSettled(term)
  const [group, setGroup] = useState(loadGroup)
  const [sound, setSound] = useState(soundOn)
  const [page, setPage] = useState(1)

  const stats = useQuery({ queryKey: inboxKeys.stats, queryFn: () => get<InboxStats>('chat-inbox/stats'), refetchInterval: 10_000 })
  const list = useQuery({
    queryKey: [...inboxKeys.lists, status, settled.trim(), group, page],
    queryFn: () => get<Paged<Conversation>>(listPath(status, settled, group, page)),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  })

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
  const open = (id: number | null) => change(next => { if (id) next.set(INBOX_PARAM.conversation, String(id)); else next.delete(INBOX_PARAM.conversation) })
  const pickStatus = (next: StatusFilter) => { setPage(1); change(p => { if (next === 'all') p.delete(INBOX_PARAM.status); else p.set(INBOX_PARAM.status, next) }, true) }
  const typed = (next: string) => { setTerm(next); setPage(1) }
  const grouped = (on: boolean) => { setGroup(on); setPage(1); try { localStorage.setItem(GROUP_KEY, on ? '1' : '0') } catch { /* not remembered */ } }
  const sounded = (on: boolean) => { setSound(on); rememberSound(on) }

  const rows = shownConversations(list.data?.data ?? [], term)
  const figures = stats.data
  const counts = filterCounts(figures)
  const filters = STATUS_FILTERS.map(key => ({
    key,
    label: key === 'all' ? t('crm.common.all', 'All') : t(`crm.status.${key}`, STATUS_DEFAULTS[key]),
    count: counts[key],
  }))
  const statusName = status === 'all' ? '' : t(`crm.status.${status}`, STATUS_DEFAULTS[status])
  const chips = [
    status !== 'all' && <FilterChip key="status" label={t('crm.inbox.chip_status', 'Status: {{status}}', { status: statusName })} removeLabel={t('crm.inbox.remove_filter', 'Remove the filter')} onRemove={() => pickStatus('all')} />,
    term.trim() && <FilterChip key="term" label={t('crm.inbox.chip_search', 'Search: {{term}}', { term: term.trim() })} removeLabel={t('crm.inbox.remove_filter', 'Remove the filter')} onRemove={() => typed('')} />,
  ].filter(Boolean)

  return (
    <Page wide title={t('crm.inbox.title', 'Inbox')} line={t('crm.inbox.line', 'Every chat from your website. Answer, take over from the assistant, and turn a visitor into a lead.')}
      below={figures && (figures.unassigned > 0 || figures.unread_messages > 0) ? (
        <div className="flex flex-wrap gap-1.5">
          {figures.unread_messages > 0 && <Pill tone="accent">{t('crm.inbox.unread_total', '{{count}} unread messages', { count: figures.unread_messages })}</Pill>}
          {figures.unassigned > 0 && <Pill tone="danger">{t('crm.inbox.unassigned', '{{count}} open with nobody assigned', { count: figures.unassigned })}</Pill>}
        </div>
      ) : undefined}>
      <Toolbar chips={chips.length ? chips : undefined}
        actions={<>
          <ToolbarSwitch on={group} onChange={grouped} icon={Users} label={t('crm.inbox.group', 'One row per visitor')} hint={t('crm.inbox.group_hint', 'Older chats of the same person fold into the latest.')} />
          <ToolbarSwitch on={sound} onChange={sounded} icon={sound ? Bell : BellOff} label={t('crm.inbox.sound_short', 'Sound')} hint={t('crm.inbox.sound', 'Sound when a visitor writes')} />
        </>}>
        <SearchInput label={t('crm.inbox.search', 'Search by name or email')} value={term} onChange={typed} className="sm:w-64" />
        <div className="-mx-0.5 overflow-x-auto px-0.5 pb-0.5 sm:overflow-visible">
          <Tabs label={t('crm.inbox.filter_label', 'Show')} items={filters} value={status} onChange={pickStatus} />
        </div>
      </Toolbar>

      <div className="grid min-w-0 md:h-[calc(100dvh-19rem)] md:min-h-[30rem] md:grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] md:overflow-hidden md:rounded-2xl md:border md:border-a-border md:bg-a-surface md:shadow-a-sm xl:grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)_21rem]">
        <ConversationList className={openId ? 'hidden md:flex' : 'flex'}
          rows={rows} loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }}
          term={term} total={list.data?.total} openId={openId} onOpen={id => open(id)}
          page={list.data?.current_page ?? page} last={list.data?.last_page ?? 1} onPage={setPage} />
        {openId
          ? <ConversationView key={openId} id={openId} onBack={() => open(null)} />
          : (
            <div className="hidden min-h-0 flex-col items-center justify-center gap-3 p-8 text-center md:flex xl:col-span-2">
              <span aria-hidden className="grid h-14 w-14 place-items-center rounded-2xl bg-a-accent/12 text-a-accent-text"><MessagesSquare size={24} /></span>
              <p className="font-a-display text-xl text-a-text">{t('crm.inbox.pick', 'Pick a conversation')}</p>
              <p className="max-w-sm text-sm text-a-text-2">{t('crm.inbox.pick_line', 'Chats that wait for a reply come first.')}</p>
              {figures && figures.waiting > 0 && status !== 'waiting' && (
                <button type="button" onClick={() => pickStatus('waiting')}
                  className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-full border border-a-st-pending/40 bg-a-st-pending/12 px-4 text-sm font-semibold text-a-st-pending hover:bg-a-st-pending/20 focus-visible:outline-2 focus-visible:outline-a-accent">
                  {t('crm.inbox.show_waiting', 'Show the {{n}} waiting', { n: count(figures.waiting, i18n.language) })}
                </button>
              )}
            </div>
          )}
      </div>
    </Page>
  )
}
