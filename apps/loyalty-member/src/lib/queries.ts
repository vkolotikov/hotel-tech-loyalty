import { useCallback, useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { focusManager, useQuery, type QueryKey } from '@tanstack/react-query'
import { api } from './api'
import { useSession } from './session'
import { storage } from './storage'
import { lookFrom, useLook, type VenueLook } from './theme'

import { queryClient } from './queryClient'

export { queryClient }

/**
 * How long a fact the venue can change (points, level, rewards, stamps, credit, bookings) counts as fresh. Staff change
 * them at the desk while the member holds the phone, so it is short: coming back to the app or to a tab after this asks
 * the server again.
 */
export const LIVE_MS = 10_000

// React Query cannot see a phone app return to the foreground; AppState tells it. (The browser preview keeps React
// Query's own visibility listener.)
if (Platform.OS !== 'web') {
  focusManager.setEventListener(handleFocus => {
    const subscription = AppState.addEventListener('change', state => handleFocus(state === 'active'))
    return () => subscription.remove()
  })
}

export const KEYS = {
  boot: ['boot'] as const,
  card: ['card'] as const,
  history: ['history'] as const,
}

/** Everything about the member the venue can change from its side: read again after a push or a pull to refresh. */
export const MEMBER_FACTS: readonly QueryKey[] = [KEYS.boot, KEYS.history, ['rewards'], ['stamps'], ['credit'], ['events'], ['bookings'], ['booking'], ['inbox']]

/** Reads every member fact again (the ones on screen now; the others when next shown). */
export function refreshMemberFacts(): Promise<void> {
  return Promise.all(MEMBER_FACTS.map(queryKey => queryClient.invalidateQueries({ queryKey }))).then(() => undefined)
}

/**
 * A tab keeps its screen mounted, so React Query never sees it shown again: on every return to the tab after the first
 * showing, its stale queries are asked again.
 */
export function useRefreshOnFocus(keys: readonly QueryKey[]): void {
  const first = useRef(true)
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return }
    for (const queryKey of keys) void queryClient.refetchQueries({ queryKey, stale: true, type: 'active' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []))
}

/**
 * While this screen is shown and the app is in the foreground, the member's facts are asked again every `everyMs`, so a
 * change made at the desk appears without a pull, also where push does not reach (an Android phone before FCM is set up,
 * notifications switched off).
 */
export function useLiveWhileShown(everyMs: number): void {
  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void queryClient.invalidateQueries({ queryKey: KEYS.boot })
    }, everyMs)
    return () => clearInterval(timer)
  }, [everyMs]))
}

const LOOK = 'hexatech_loyalty_look'

/**
 * Everything the home screen needs (`GET /v1/member/portal`, the portal's own bootstrap): the venue with its look and
 * what it offers, the member with points, tier, progress and recent activity, and the unread count. The venue's look is
 * applied as it arrives and kept, so the next start opens in the venue's colours.
 */
export function useBoot() {
  const token = useSession(s => s.token)
  const query = useQuery({ queryKey: KEYS.boot, queryFn: api.bootstrap, enabled: !!token, staleTime: LIVE_MS })
  const venue = query.data?.venue
  useEffect(() => {
    if (!venue) return
    const look = lookFrom(venue)
    const before = useLook.getState().version
    useLook.getState().setLook(look)
    // Read again often now (LIVE_MS): the look is kept only when it changed.
    if (useLook.getState().version !== before) void storage.set(LOOK, JSON.stringify(look))
  }, [venue])
  return query
}

/** The look kept from the last venue, read once at start (before the bootstrap answers). */
export async function restoreLook(): Promise<void> {
  try {
    const raw = await storage.get(LOOK)
    if (raw) useLook.getState().setLook(lookFrom({ accent: toAccent(JSON.parse(raw) as VenueLook), display_face: (JSON.parse(raw) as VenueLook).face }))
  } catch {
    // A look that cannot be read leaves the default.
  }
}

function toAccent(look: VenueLook) {
  return { dark_hex: look.accent, dark_ink: look.ink, dark_deep: look.deep }
}

/** After signing out, the next member starts from the default look. */
export async function forgetLook(): Promise<void> {
  useLook.getState().setLook(lookFrom(null))
  await storage.remove(LOOK)
}
