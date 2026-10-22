import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'

/** A member's NFC card as their page shows it (`App\Services\Loyalty\Cards\NfcCards::row`). */
export interface NfcCardRow {
  id: number
  /** Lower-case hex without separators (as stored since release 5; older rows read the same way). */
  uid: string
  is_active: boolean
  linked_at: string | null
  last_used_at: string | null
  scans: number
}

export interface LinkAnswer {
  card: NfcCardRow
  /** False when it already was this member's active card: nothing was written. */
  linked: boolean
}

/** A member's NFC cards (release 5, spec 2026-10-23 §3): the list, link (the server normalises the ID), switch off. */
export const cardsApi = {
  list: (memberId: number): Promise<{ cards: NfcCardRow[] }> => watched(api.get(loyaltyUrl(`members/${memberId}/cards`))),
  link: (memberId: number, uid: string): Promise<LinkAnswer> => watched(api.post(loyaltyUrl(`members/${memberId}/cards`), { uid })),
  off: (memberId: number, cardId: number): Promise<{ card: NfcCardRow }> => watched(api.post(loyaltyUrl(`members/${memberId}/cards/${cardId}/off`))),
}

export const cardsKey = (memberId: number) => ['loyalty', 'cards', memberId] as const

/** What linking or switching off makes stale: the member's cards. */
export function afterCardChange(client: QueryClient, memberId: number): void {
  void client.invalidateQueries({ queryKey: cardsKey(memberId) })
}
