import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useCrm } from '../CrmProvider'
import { get } from '../lib/api'
import { brandParam } from '../lib/brand'
import { APP_NAME } from '../lib/links'
import { useToast } from '../ui/Toast'
import { inboxKeys } from '../inbox/inboxQueries'
import { chime, soundOn } from '../inbox/sound'
import type { InboxStats } from '../inbox/types'
import {
  ALERT_POLL_MS, START, alertTarget, badgeCount, sawHot, shouldNotify, shouldSound, step, stripBadge, titleWith,
  type Alert,
} from './alertsLogic'
import { permission, showNotification, wantsDesktop } from './desktop'
import { setFaviconDot } from './favicon'
import { keepOwnNotes, ownNotes } from './own'

export const alertKeys = { kpis: ['crm', 'alerts', 'kpis'] as const }

interface Kpis { data?: { hot_leads?: { value?: number } } }

/**
 * Round 5 (owner 2026-11-12): the full admin's alerts across HexaTech CRM, mounted once in the shell. While the tab is
 * visible it asks every 15 s how many chats wait for a person (`chat-inbox/stats`, the inbox's own figures) and, on a
 * plan with the Engagement hub, how many hot leads there are (`engagement/kpis`, three counts). When one of them rises
 * — never on the first look, never for the person's own doing (`noteOwnAction`), never because the brand changed —
 * it says so: a toast, a desktop notification if the person switched them on (AlertsToggle) and looks elsewhere, the
 * inbox's chime if its sound is on, and "(n) " before the tab's title with a dot on its icon until nothing waits.
 */
export function useCrmAlerts(): void {
  const { t } = useTranslation()
  const { data: boot, isError } = useCrm()
  const ready = Boolean(boot) && !isError
  const hotOn = ready && Boolean(boot?.features.engagement)
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onInbox = pathname.startsWith('/crm/inbox')
  const onVisitors = pathname.startsWith('/crm/visitors')

  const stats = useQuery({
    queryKey: inboxKeys.stats,
    queryFn: () => get<InboxStats>('chat-inbox/stats'),
    enabled: ready,
    refetchInterval: ALERT_POLL_MS,
    refetchIntervalInBackground: false,
  })
  const kpis = useQuery({
    queryKey: alertKeys.kpis,
    queryFn: () => get<Kpis>('engagement/kpis'),
    enabled: hotOn,
    refetchInterval: ALERT_POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  })

  const waiting = typeof stats.data?.waiting === 'number' ? stats.data.waiting : null
  const hot = hotOn && typeof kpis.data?.data?.hot_leads?.value === 'number' ? kpis.data.data.hot_leads.value : null
  const key = brandParam()
  const state = useRef(START)
  const [badge, setBadge] = useState(0)

  // The words and the ways out of an alert, current at the moment it fires.
  const say = useRef({ t, toast, navigate, onInbox })
  useEffect(() => { say.current = { t, toast, navigate, onInbox } })

  useEffect(() => {
    if (!ready) return
    const result = step(state.current, { waiting, hot }, key, ownNotes(), Date.now())
    keepOwnNotes(result.own)
    state.current = onVisitors ? sawHot(result.state) : result.state
    setBadge(badgeCount(state.current))
    if (result.alerts.length) fire(result.alerts, say.current)
  }, [ready, waiting, hot, key, onVisitors])

  useEffect(() => {
    if (!ready) return
    document.title = titleWith(document.title, badge)
    setFaviconDot(badge > 0)
  }, [ready, badge])

  useEffect(() => () => {
    document.title = stripBadge(document.title)
    setFaviconDot(false)
  }, [])
}

type Say = { t: ReturnType<typeof useTranslation>['t']; toast: ReturnType<typeof useToast>; navigate: ReturnType<typeof useNavigate>; onInbox: boolean }

function words(alert: Alert, t: Say['t']): string {
  return alert.signal === 'waiting'
    ? t('crm.alerts.waiting', '{{count}} more chats are waiting for a reply', { count: alert.rise })
    : t('crm.alerts.hot', '{{count}} new hot leads', { count: alert.rise })
}

function fire(alerts: Alert[], { t, toast, navigate, onInbox }: Say): void {
  const lines = alerts.map(alert => words(alert, t))
  lines.forEach(line => toast(line))
  if (shouldSound(alerts, { soundOn: soundOn(), onInbox })) chime()
  let focused = true
  try { focused = document.hasFocus() } catch { /* assume looking */ }
  if (shouldNotify(alerts, { permission: permission(), wanted: wantsDesktop(), focused })) {
    showNotification(APP_NAME, lines.join(' · '), () => navigate(alertTarget(alerts)))
  }
}
