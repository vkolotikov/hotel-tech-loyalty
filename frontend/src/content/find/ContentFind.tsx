import { useEffect, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FindFrame } from '../../workspace/find/FindFrame'
import type { FindItem, FindTarget } from '../../workspace/find/findCore'
import { formatDate } from '../../workspace/lib/wallClock'
import { useApi, useBrandId } from '../ContentProvider'
import { findGroups, iconOf, settledPosts } from './findItems'

/**
 * Content's Find (spec §4.7) on the shared frame: the brand's posts by title,
 * topic, hook or text (up to 8, searched on the server from two letters),
 * and the actions. Nothing is drawn, and nothing fetched, while it is closed.
 */
export function ContentFind({ open, onClose, onRun, actions, fallbackFocus }: {
  open: boolean
  onClose: () => void
  onRun: (target: FindTarget) => void
  actions: FindItem[]
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  if (!open) return null
  return <FindPanel onClose={onClose} onRun={onRun} actions={actions} fallbackFocus={fallbackFocus} />
}

function FindPanel({ onClose, onRun, actions, fallbackFocus }: { onClose: () => void; onRun: (target: FindTarget) => void; actions: FindItem[]; fallbackFocus?: RefObject<HTMLElement | null>[] }) {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')

  // The server is asked once typing pauses; the state is set from the timer's callback.
  useEffect(() => {
    const timer = window.setTimeout(() => setAsked(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const typed = query.trim()
  const search = useQuery({
    queryKey: ['content', brand, 'find', asked],
    queryFn: () => api.find(asked).then(r => r.posts),
    enabled: asked.length >= 2,
    staleTime: 30_000,
    retry: false,
  })
  const posts = settledPosts(typed, asked, search.data)
  const waiting = typed.length >= 2 && (asked !== typed || search.isFetching)
  const groups = findGroups({
    query, actions, posts,
    labels: {
      actions: t('content.find.actions', 'Actions'),
      posts: t('content.find.posts', 'Posts'),
      untitled: t('content.plan.untitled', 'Untitled post'),
      unscheduled: t('content.common.unscheduled', 'Unscheduled'),
      platform: p => t(`content.platform.${p}`, p),
      day: d => formatDate(d, i18n.language || 'en', { weekday: 'short', day: 'numeric', month: 'short' }),
    },
  })

  return (
    <FindFrame prompt={t('content.shell.find', 'Find a post or action')} query={query} onQuery={setQuery}
      groups={groups} iconOf={iconOf}
      onPick={(item) => { onRun(item.go); onClose() }}
      onShortcuts={() => { onRun({ run: 'shortcuts' }); onClose() }}
      onClose={onClose}
      waiting={waiting ? t('content.find.searching', 'Searching posts…') : null}
      fallbackFocus={fallbackFocus} />
  )
}
