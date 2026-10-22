import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { PushAnswer, PushAudience, PushBody, PushesPage, SegmentChoice } from './types'

/** Push messages' calls (spec 2026-10-22 release 3 §5), and the segments they are sent to. */
export const pushApi = {
  messages: (page: number): Promise<PushesPage> => watched(api.get(loyaltyUrl('push'), { params: page > 1 ? { page } : {} })),
  message: (id: number): Promise<PushAnswer> => watched(api.get(loyaltyUrl(`push/${id}`))),
  create: (name: string): Promise<PushAnswer> => watched(api.post(loyaltyUrl('push'), { name })),
  update: (id: number, body: PushBody): Promise<PushAnswer> => watched(api.put(loyaltyUrl(`push/${id}`), body)),
  remove: (id: number): Promise<{ ok: boolean }> => watched(api.delete(loyaltyUrl(`push/${id}`))),
  audience: (id: number): Promise<{ audience: PushAudience }> => watched(api.get(loyaltyUrl(`push/${id}/audience`))),
  send: (id: number, body: { recipients: number; revision: string }): Promise<PushAnswer> => watched(api.post(loyaltyUrl(`push/${id}/send`), body)),
  cancel: (id: number): Promise<PushAnswer> => watched(api.post(loyaltyUrl(`push/${id}/cancel`))),
  duplicate: (id: number, name: string): Promise<PushAnswer> => watched(api.post(loyaltyUrl(`push/${id}/duplicate`), { name })),
  // Release 4: send later, at a time on the venue's clock (`YYYY-MM-DDTHH:mm`); `about` is how many it would reach now.
  schedule: (id: number, body: { send_at: string; revision: string }): Promise<PushAnswer & { about: number }> => watched(api.post(loyaltyUrl(`push/${id}/schedule`), body)),
  unschedule: (id: number): Promise<PushAnswer> => watched(api.post(loyaltyUrl(`push/${id}/unschedule`))),
  segments: (): Promise<{ segments: SegmentChoice[] }> => watched(api.get(loyaltyUrl('segments'))),
}

/** The segments list is the one Campaigns reads (the same call, the same key), so a saved segment shows here too. */
export const SEGMENTS_KEY = ['loyalty', 'campaigns', 'segments'] as const
export const pushListKey = (page: number) => ['loyalty', 'push', 'list', page] as const
export const pushKey = (id: number) => ['loyalty', 'push', 'message', id] as const
export const pushAudienceKey = (id: number) => ['loyalty', 'push', 'audience', id] as const

/** What a change to a message makes stale: the list, the message itself and who it would reach. */
export function afterPushChange(client: QueryClient, id: number | null): void {
  void client.invalidateQueries({ queryKey: ['loyalty', 'push', 'list'] })
  if (id !== null) {
    void client.invalidateQueries({ queryKey: pushKey(id) })
    void client.invalidateQueries({ queryKey: pushAudienceKey(id) })
  }
}
