import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { SegmentChoice } from '../push/types'
import type { SmsAnswer, SmsAudience, SmsBody, SmsPage } from './types'

/** SMS campaigns' calls (spec 2026-10-22 release 4 §5), and the segments they are sent to. */
export const smsApi = {
  messages: (page: number): Promise<SmsPage> => watched(api.get(loyaltyUrl('sms'), { params: page > 1 ? { page } : {} })),
  message: (id: number): Promise<SmsAnswer> => watched(api.get(loyaltyUrl(`sms/${id}`))),
  create: (name: string): Promise<SmsAnswer> => watched(api.post(loyaltyUrl('sms'), { name })),
  update: (id: number, body: SmsBody): Promise<SmsAnswer> => watched(api.put(loyaltyUrl(`sms/${id}`), body)),
  remove: (id: number): Promise<{ ok: boolean }> => watched(api.delete(loyaltyUrl(`sms/${id}`))),
  audience: (id: number): Promise<{ audience: SmsAudience }> => watched(api.get(loyaltyUrl(`sms/${id}/audience`))),
  test: (id: number): Promise<{ sent_to: string; segments: number | null }> => watched(api.post(loyaltyUrl(`sms/${id}/test`))),
  send: (id: number, body: { recipients: number; revision: string }): Promise<SmsAnswer> => watched(api.post(loyaltyUrl(`sms/${id}/send`), body)),
  schedule: (id: number, body: { send_at: string; revision: string }): Promise<SmsAnswer & { about: number; about_segments: number }> =>
    watched(api.post(loyaltyUrl(`sms/${id}/schedule`), body)),
  unschedule: (id: number): Promise<SmsAnswer> => watched(api.post(loyaltyUrl(`sms/${id}/unschedule`))),
  cancel: (id: number): Promise<SmsAnswer> => watched(api.post(loyaltyUrl(`sms/${id}/cancel`))),
  duplicate: (id: number, name: string): Promise<SmsAnswer> => watched(api.post(loyaltyUrl(`sms/${id}/duplicate`), { name })),
  segments: (): Promise<{ segments: SegmentChoice[] }> => watched(api.get(loyaltyUrl('segments'))),
}

/** The segments list is the one Campaigns reads (the same call, the same key), so a saved segment shows here too. */
export const SEGMENTS_KEY = ['loyalty', 'campaigns', 'segments'] as const
export const smsListKey = (page: number) => ['loyalty', 'sms', 'list', page] as const
export const smsKey = (id: number) => ['loyalty', 'sms', 'message', id] as const
export const smsAudienceKey = (id: number) => ['loyalty', 'sms', 'audience', id] as const

/** What a change to a campaign makes stale: the list, the campaign itself and who it would reach. */
export function afterSmsChange(client: QueryClient, id: number | null): void {
  void client.invalidateQueries({ queryKey: ['loyalty', 'sms', 'list'] })
  if (id !== null) {
    void client.invalidateQueries({ queryKey: smsKey(id) })
    void client.invalidateQueries({ queryKey: smsAudienceKey(id) })
  }
}
