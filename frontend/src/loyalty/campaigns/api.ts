import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { Audience, CampaignAnswer, CampaignBody, CampaignsPage, Segment, SegmentBody, SegmentOptions, SegmentPreview } from './types'

/** Campaigns' calls (spec 2026-10-21 release 2 §6): segments, and the email campaigns sent to them. */
export const campaignsApi = {
  segments: (): Promise<{ segments: Segment[] }> => watched(api.get(loyaltyUrl('segments'))),
  segmentOptions: (): Promise<SegmentOptions> => watched(api.get(loyaltyUrl('segments/options'))),
  previewSegment: (body: Omit<SegmentBody, 'name' | 'description'>): Promise<SegmentPreview> => watched(api.post(loyaltyUrl('segments/preview'), body)),
  createSegment: (body: SegmentBody): Promise<{ segment: Segment }> => watched(api.post(loyaltyUrl('segments'), body)),
  updateSegment: (id: number, body: SegmentBody): Promise<{ segment: Segment }> => watched(api.put(loyaltyUrl(`segments/${id}`), body)),
  deleteSegment: (id: number): Promise<{ ok: boolean }> => watched(api.delete(loyaltyUrl(`segments/${id}`))),

  campaigns: (page: number): Promise<CampaignsPage> => watched(api.get(loyaltyUrl('campaigns'), { params: page > 1 ? { page } : {} })),
  campaign: (id: number): Promise<CampaignAnswer> => watched(api.get(loyaltyUrl(`campaigns/${id}`))),
  createCampaign: (name: string): Promise<CampaignAnswer> => watched(api.post(loyaltyUrl('campaigns'), { name })),
  updateCampaign: (id: number, body: CampaignBody): Promise<CampaignAnswer> => watched(api.put(loyaltyUrl(`campaigns/${id}`), body)),
  deleteCampaign: (id: number): Promise<{ ok: boolean }> => watched(api.delete(loyaltyUrl(`campaigns/${id}`))),
  audience: (id: number): Promise<{ audience: Audience }> => watched(api.get(loyaltyUrl(`campaigns/${id}/audience`))),
  test: (id: number): Promise<{ sent_to: string }> => watched(api.post(loyaltyUrl(`campaigns/${id}/test`))),
  send: (id: number, body: { recipients: number; revision: string }): Promise<CampaignAnswer> => watched(api.post(loyaltyUrl(`campaigns/${id}/send`), body)),
  cancel: (id: number): Promise<CampaignAnswer> => watched(api.post(loyaltyUrl(`campaigns/${id}/cancel`))),
  duplicate: (id: number, name: string): Promise<CampaignAnswer> => watched(api.post(loyaltyUrl(`campaigns/${id}/duplicate`), { name })),
  // Release 4: send later, at a time on the venue's clock (`YYYY-MM-DDTHH:mm`); `about` is how many it would reach now.
  schedule: (id: number, body: { send_at: string; revision: string }): Promise<CampaignAnswer & { about: number }> =>
    watched(api.post(loyaltyUrl(`campaigns/${id}/schedule`), body)),
  unschedule: (id: number): Promise<CampaignAnswer> => watched(api.post(loyaltyUrl(`campaigns/${id}/unschedule`))),
}

export const SEGMENTS_KEY = ['loyalty', 'campaigns', 'segments'] as const
export const OPTIONS_KEY = ['loyalty', 'campaigns', 'segment-options'] as const
export const previewKey = (body: string) => ['loyalty', 'campaigns', 'segment-preview', body] as const
export const campaignsKey = (page: number) => ['loyalty', 'campaigns', 'list', page] as const
export const campaignKey = (id: number) => ['loyalty', 'campaigns', 'campaign', id] as const
export const audienceKey = (id: number) => ['loyalty', 'campaigns', 'audience', id] as const

/** What a change to a campaign makes stale: the list, the campaign itself and who it would reach. */
export function afterCampaignChange(client: QueryClient, id: number | null): void {
  void client.invalidateQueries({ queryKey: ['loyalty', 'campaigns', 'list'] })
  if (id !== null) {
    void client.invalidateQueries({ queryKey: campaignKey(id) })
    void client.invalidateQueries({ queryKey: audienceKey(id) })
  }
}

/** What a saved or deleted segment makes stale: the segments, and every campaign's audience (a draft may use it). */
export function afterSegmentChange(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: SEGMENTS_KEY })
  void client.invalidateQueries({ queryKey: ['loyalty', 'campaigns', 'audience'] })
  void client.invalidateQueries({ queryKey: ['loyalty', 'campaigns', 'segment-preview'] })
}
