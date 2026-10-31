import { useEffect } from 'react'
import { QueryClient, useQuery } from '@tanstack/react-query'
import { api } from './api'
import { useSession } from './session'
import { storage } from './storage'
import { lookFrom, useLook, type VenueLook } from './theme'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 0, refetchOnWindowFocus: false },
  },
})

export const KEYS = {
  boot: ['boot'] as const,
  card: ['card'] as const,
  history: ['history'] as const,
}

const LOOK = 'hexatech_loyalty_look'

/**
 * Everything the home screen needs (`GET /v1/member/portal`, the portal's own bootstrap): the venue with its look and
 * what it offers, the member with points, tier, progress and recent activity, and the unread count. The venue's look is
 * applied as it arrives and kept, so the next start opens in the venue's colours.
 */
export function useBoot() {
  const token = useSession(s => s.token)
  const query = useQuery({ queryKey: KEYS.boot, queryFn: api.bootstrap, enabled: !!token, staleTime: 60_000 })
  const venue = query.data?.venue
  useEffect(() => {
    if (!venue) return
    const look = lookFrom(venue)
    useLook.getState().setLook(look)
    void storage.set(LOOK, JSON.stringify(look))
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
