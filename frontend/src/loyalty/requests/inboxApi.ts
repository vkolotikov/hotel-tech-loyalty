import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { InboxFilters, InboxPage, InboxRecord } from './types'

export const inbox = (filters: InboxFilters, signal?: AbortSignal): Promise<InboxPage> => watched(api.get(loyaltyUrl('requests/inbox'), { params: filters, signal }))
export function refreshInbox(client: QueryClient, row: InboxRecord): void {
  for (const area of ['requests', 'bootstrap', 'overview', 'rewards', 'members']) void client.invalidateQueries({ queryKey: ['loyalty', area] })
  if (row.member) {
    void client.invalidateQueries({ queryKey: ['loyalty', 'member', row.member.id] })
    void client.invalidateQueries({ queryKey: ['loyalty', 'history', row.member.id] })
  }
}
