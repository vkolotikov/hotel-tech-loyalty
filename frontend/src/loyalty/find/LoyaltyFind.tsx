import { useEffect, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FindFrame } from '../../workspace/find/FindFrame'
import type { FindItem, FindTarget } from '../../workspace/find/findCore'
import { useApi } from '../LoyaltyProvider'
import { points } from '../lib/format'
import { findGroups, iconOf, settledMembers } from './findItems'

/**
 * Loyalty's Find (spec 2026-10-21 §4.8) on the shared frame: members by name,
 * email, phone or number (up to 8, searched on the server from two letters),
 * and the actions. Nothing is drawn, and nothing fetched, while it is closed.
 */
export function LoyaltyFind({ open, onClose, onRun, actions, fallbackFocus }: {
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
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')

  // The server is asked once typing pauses; the state is set from the timer's callback.
  useEffect(() => {
    const timer = window.setTimeout(() => setAsked(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const typed = query.trim()
  const search = useQuery({
    queryKey: ['loyalty', 'find', asked],
    queryFn: () => api.find(asked).then(r => r.members),
    enabled: asked.length >= 2,
    staleTime: 30_000,
    retry: false,
  })
  const members = settledMembers(typed, asked, search.data)
  const waiting = typed.length >= 2 && (asked !== typed || search.isFetching)
  const groups = findGroups({
    query, actions, members,
    labels: {
      actions: t('loyalty.find.actions', 'Actions'),
      members: t('loyalty.find.members', 'Members'),
      points: n => t('loyalty.common.points_count', '{{points}} pts', { points: points(n, i18n.language) }),
    },
  })

  return (
    <FindFrame prompt={t('loyalty.shell.find', 'Find a member or action')} query={query} onQuery={setQuery}
      groups={groups} iconOf={iconOf}
      onPick={(item) => { onRun(item.go); onClose() }}
      onShortcuts={() => { onRun({ run: 'shortcuts' }); onClose() }}
      onClose={onClose}
      waiting={waiting ? t('loyalty.find.searching', 'Searching members…') : null}
      fallbackFocus={fallbackFocus} />
  )
}
