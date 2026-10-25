import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { MemberRow } from '../lib/types'

/** A stamp card as the server answers it (StampCards::cardRow). */
export interface StampCardRow {
  id: number
  number: number
  stamps_count: number
  stamps_needed: number
  /** ISO 8601; null while the card is open. */
  completed_at: string | null
}

/** What a full card gave, as a stamp answers it (StampCards::complete). */
export type CardReward =
  | { kind: 'points'; points: number }
  | { kind: 'reward'; redemption_id: number; reward_name: string; code?: string }

/**
 * StampCards::stamp()'s answer: a stamp added (with the card after it, and what the card gave when this stamp filled
 * it), or why not — the member has today's stamp, or the visit was stamped before.
 */
export type StampAnswer =
  | { added: true; card: StampCardRow; completed: { card_id: number; number: number; reward: CardReward } | null }
  | { added: false; reason: 'already_today' | 'already_recorded' | string; card: StampCardRow | null }

/** The cashback a desk purchase earned (part C's CreditLedger::earnCashback answer). */
export interface CreditEarned {
  line_id: number
  /** The venue's currency's amount; a decimal the server may send as a string. */
  amount: number | string
  balance: number | string
  currency: string
}

/** `POST members/{id}/check-in`'s answer (DeskVisit::record). */
export interface DeskAnswer {
  already_today: boolean
  points: { checkin: number; purchase: number; balance: number }
  /** Null while the venue's stamp card is off. */
  stamp: StampAnswer | null
  /** Null when nothing was earned (cashback off, or no amount). */
  credit: CreditEarned | null
  member: MemberRow
}

export interface DeskBody {
  amount?: number
  note?: string
  idempotency_key: string
}

/** One stamp on a screen; staff also see who gave it, when, and for which visit. */
export interface StampEntry {
  venue_day: string
  source: string
  card_number?: number | null
  id?: number
  reference_type?: string | null
  reference_id?: number | null
  by?: string | null
  at?: string | null
}

/** What a completed card gave, on the history. */
export type GivenReward =
  | { kind: 'points'; points: number }
  | { kind: 'reward'; redemption_id: number; reward_name: string; code: string; status: string }

/** `GET members/{id}/stamps` (StampCards::forMember, with staff details). */
export interface StampsView {
  enabled: boolean
  stamps_per_card: number
  /** What a full card gives now. */
  reward: { kind: 'points'; points: number } | { kind: 'reward'; reward_id: number; reward_name: string }
  card: (StampCardRow & { stamps: StampEntry[] }) | null
  completed_cards: number
  history: { stamps: StampEntry[]; cards: (StampCardRow & { reward: GivenReward | null })[] }
}

/** The desk and the stamp card (release 7, spec 2026-10-25 §2): a check-in or a purchase, and a member's card. */
export const visitsApi = {
  stamps: (memberId: number): Promise<StampsView> => watched(api.get(loyaltyUrl(`members/${memberId}/stamps`))),
  checkIn: (memberId: number, body: DeskBody): Promise<DeskAnswer> => watched(api.post(loyaltyUrl(`members/${memberId}/check-in`), body)),
}

export const stampsKey = (memberId: number) => ['loyalty', 'stamps', memberId] as const

/** What a desk visit makes stale: the member, their history, their stamp card, their credit, the members list. */
export function afterDeskVisit(client: QueryClient, memberId: number): void {
  for (const queryKey of [['loyalty', 'member', memberId], ['loyalty', 'history', memberId], stampsKey(memberId), ['loyalty', 'credit', memberId], ['loyalty', 'members']]) {
    void client.invalidateQueries({ queryKey: [...queryKey] })
  }
}
