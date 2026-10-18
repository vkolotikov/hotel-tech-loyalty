import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'
import { formatInstant } from '../../workspace/lib/wallClock'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { usePanel } from '../panel/PanelProvider'
import { PopMenu } from '../ui/PopMenu'
import { BELL_LIST_CLASS, badgeText, bellItems } from './bellMath'

/**
 * The "For you" bell (spec 2026-10-16 §8), for the brand the portal works on: its count read every 60 seconds while the
 * tab is shown and again when the tab comes back into view; its list read when it opens, newest first, the news marked;
 * the read is then marked seen up to when it was made (what waits for approval stays). A line opens its post.
 */
export function ForYouBell() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const panel = usePanel()
  const [open, setOpen] = useState(false)
  const seenFor = useRef<string | null>(null)
  const countKey = ['content', brand, 'inbox', 'count']
  const listKey = ['content', brand, 'inbox', 'list']
  const count = useQuery({ queryKey: countKey, queryFn: api.inboxCount, refetchInterval: 60_000, refetchOnWindowFocus: true, staleTime: 30_000 })
  const list = useQuery({ queryKey: listKey, queryFn: api.inbox, enabled: open, staleTime: 0 })
  const read = list.data

  // Opening the list marks what it shows as seen — up to when it was read, so news that came in since stays new.
  useEffect(() => {
    if (!open || !read || seenFor.current === read.read_at) return
    seenFor.current = read.read_at
    void api.inboxSeen(read.read_at).then(answer => queryClient.setQueryData(['content', brand, 'inbox', 'count'], { count: answer.count }), () => {})
  }, [open, read, api, queryClient, brand])

  const total = count.data?.count ?? 0
  const badge = badgeText(total)
  const label = total > 0 ? t('content.bell.label_count', 'For you ({{count}})', { count: total }) : t('content.bell.label', 'For you')
  const [failedKey, failedWords] = errorKey('inbox', failureOf(list.error).code)
  const emptyText = list.isError ? t(failedKey, failedWords) : read ? t('content.bell.empty', 'Nothing new for you.') : t('content.common.loading', 'Loading…')
  const items = read ? bellItems(read.items, (key, fallback, vars) => t(key, fallback, vars), at => formatInstant(at, locale, boot.venue.timezone)) : []

  return (
    <PopMenu label={label} title={label} items={items} emptyText={emptyText} markLabel={t('content.bell.new', 'New')}
      align="right" listClassName={BELL_LIST_CLASS} data={{ 'data-bell': '' }}
      onOpenChange={(next) => {
        setOpen(next)
        // A closed list is dropped: the next opening reads it afresh (and marks that read seen).
        if (!next) queryClient.removeQueries({ queryKey: ['content', brand, 'inbox', 'list'] })
      }}
      onPick={(id) => { const post = read?.items.find(item => item.id === id)?.post; if (post) panel.open(post.id) }}
      className="relative inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-a-border bg-a-surface text-a-text-2 shadow-a-sm hover:text-a-text">
      <Bell size={16} aria-hidden />
      {badge && (
        <span aria-hidden className="absolute -right-1 -top-1 min-w-[1.125rem] rounded-full bg-a-accent px-1 text-center font-a-mono text-xs leading-[1.125rem] text-a-accent-ink">{badge}</span>
      )}
    </PopMenu>
  )
}
