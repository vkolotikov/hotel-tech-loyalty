import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'

export interface CardBatch {
  id: number
  first_number: string
  last_number: string
  card_count: number
}

export interface PhysicalCard {
  id: number
  batch_id: number
  number: string
  uid: string | null
  status: 'unassigned' | 'assigned' | 'disabled'
  member: { id: number; name: string | null; number: string } | null
}

export type RegisteredTag = Pick<PhysicalCard, 'id' | 'member'> & { number: string | null; uid: string }

export interface BatchRange {
  prefix: string
  first: string
  last: string
}

export const physicalCardsKey = ['loyalty', 'physical-cards'] as const
export const cardBatchesKey = ['loyalty', 'card-batches'] as const

export const physicalCardsApi = {
  batches: (): Promise<{ batches: CardBatch[]; limit: number }> => watched(api.get(loyaltyUrl('card-batches'))),
  create: (range: BatchRange): Promise<{ batch: CardBatch }> => watched(api.post(loyaltyUrl('card-batches'), range)),
  archive: (batchId: number): Promise<Blob> => watched(api.get(loyaltyUrl('card-batches/' + batchId + '/qr'), { responseType: 'blob' })),
  list: (params: { batch_id?: number; q?: string; page: number }): Promise<{ cards: PhysicalCard[]; page: number; pages: number; total: number }> =>
    watched(api.get(loyaltyUrl('physical-cards'), { params })),
  qr: (cardId: number): Promise<{ code: string; qr_svg: string }> => watched(api.get(loyaltyUrl('physical-cards/' + cardId + '/qr'))),
  pair: (card: PhysicalCard, uid: string, replaceActive: boolean): Promise<{ card: PhysicalCard; next: PhysicalCard | null }> =>
    watched(api.put(loyaltyUrl('physical-cards/' + card.id + '/nfc'), { uid, expected_uid: card.uid, replace_active: replaceActive })),
  assign: (card: PhysicalCard, memberId: number, uid: string): Promise<{ card: PhysicalCard }> =>
    watched(api.put(loyaltyUrl('physical-cards/' + card.id + '/assignment'), {
      member_id: memberId, ...(uid ? { uid, expected_uid: card.uid } : {}),
    })),
  tagLookup: (uid: string): Promise<{ cards: RegisteredTag[] }> =>
    watched(api.post(loyaltyUrl('physical-cards/tag-lookup'), { uid })),
  releaseTag: (card: RegisteredTag): Promise<void> =>
    watched(api.delete(loyaltyUrl('physical-cards/' + card.id + '/nfc'), { data: { expected_uid: card.uid } })),
}
