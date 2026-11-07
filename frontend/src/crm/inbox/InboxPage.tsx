import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MessagesSquare } from 'lucide-react'
import { get } from '../lib/api'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { ConversationList } from './ConversationList'
import { ConversationView } from './ConversationView'
import { INBOX_PARAM, listPath, readConversationId, readStatus, shownConversations, type StatusFilter } from './inboxLogic'
import { inboxKeys } from './inboxQueries'
import { chime, rememberSound, shouldChime, soundOn } from './sound'
import type { Conversation, InboxStats, Page as Paged } from './types'

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

/**
 * The website chat's live inbox (2026-11-07), rebuilt from the full admin's Chat inbox on the same endpoints: the
 * conversations with their filters, the open thread and its reply box, and the details of the person. `?c=<id>` opens
 * a conversation and `?status=waiting` the waiting ones (Today links to both).
 */
export function InboxPage() {
  const { t } = useTranslation()
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

  return (
    <Page wide title={t('crm.inbox.title', 'Inbox')} line={t('crm.inbox.line', 'Every chat from your website. Answer, take over from the assistant, and turn a visitor into a lead.')}
      below={figures && (figures.unassigned > 0 || figures.unread_messages > 0) ? (
        <div className="flex flex-wrap gap-1.5">
          {figures.unread_messages > 0 && <Pill tone="accent">{t('crm.inbox.unread_total', '{{count}} unread messages', { count: figures.unread_messages })}</Pill>}
          {figures.unassigned > 0 && <Pill tone="danger">{t('crm.inbox.unassigned', '{{count}} open with nobody assigned', { count: figures.unassigned })}</Pill>}
        </div>
      ) : undefined}>
      <div className="grid min-w-0 md:h-[calc(100dvh-15rem)] md:min-h-[32rem] md:grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] md:rounded-2xl md:border md:border-a-border md:bg-a-surface md:overflow-hidden md:shadow-a-sm xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)_17rem] 2xl:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)_20rem]">
        <ConversationList className={openId ? 'hidden md:flex' : 'flex'}
          rows={rows} loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }}
          stats={stats.data} status={status} onStatus={pickStatus} term={term} onTerm={typed}
          group={group} onGroup={grouped} sound={sound} onSound={sounded}
          openId={openId} onOpen={id => open(id)}
          page={list.data?.current_page ?? page} last={list.data?.last_page ?? 1} total={list.data?.total} onPage={setPage} />
        {openId
          ? <ConversationView key={openId} id={openId} onBack={() => open(null)} />
          : (
            <div className="hidden min-h-0 flex-col items-center justify-center gap-3 p-8 text-center md:flex xl:col-span-2">
              <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-a-accent/12 text-a-accent-text"><MessagesSquare size={22} /></span>
              <p className="font-a-display text-xl text-a-text">{t('crm.inbox.pick', 'Pick a conversation')}</p>
              <p className="max-w-sm text-sm text-a-text-2">{t('crm.inbox.pick_line', 'Chats that wait for a reply come first.')}</p>
            </div>
          )}
      </div>
    </Page>
  )
}
