import { api } from '../../../lib/api'

/** One stamp as the member sees it: the venue day and the visit that gave it. */
export interface MemberStamp {
  venue_day: string
  source: string
  card_number?: number | null
}

/**
 * `GET /v1/member/portal/stamps` (StampCards::forMember without staff details, release 7): just `{ enabled: false }`
 * while the venue does not use the stamp card and the member has none.
 */
export interface MemberStamps {
  enabled: boolean
  stamps_per_card?: number
  /** What a full card gives now. */
  reward?: { kind: 'points'; points: number } | { kind: 'reward'; reward_id: number; reward_name: string }
  card?: { id: number; number: number; stamps_count: number; stamps_needed: number; completed_at: string | null; stamps: MemberStamp[] } | null
  completed_cards?: number
  history?: { stamps: MemberStamp[]; cards: unknown[] }
}

/** The member's stamp card: their own endpoint under the portal's door (member.only), read only. */
export const stampsApi = {
  mine: (): Promise<MemberStamps> => api.get('/v1/member/portal/stamps').then(r => r.data),
}

export const STAMPS_KEY = ['portal-stamps'] as const
