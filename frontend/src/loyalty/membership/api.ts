import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { MemberFilters } from '../lib/types'
import { exportParams } from './membershipMath'
import type {
  CardData, DetailsBody, DuplicatePair, EnrolAnswer, EnrolBody, ImportBatch, ImportPreview, ImportsList, MemberAnswer, MergeBody, TierBody,
} from './types'

/** The members area's calls (spec 2026-10-21 release 2 §4.2): a member's account, duplicates and merge, import, export. */
export const membershipApi = {
  enrol: (body: EnrolBody): Promise<EnrolAnswer> => watched(api.post(loyaltyUrl('members'), body)),
  update: (id: number, body: DetailsBody): Promise<MemberAnswer> => watched(api.put(loyaltyUrl(`members/${id}`), body)),
  tier: (id: number, body: TierBody): Promise<MemberAnswer> => watched(api.put(loyaltyUrl(`members/${id}/tier`), body)),
  deactivate: (id: number): Promise<MemberAnswer> => watched(api.post(loyaltyUrl(`members/${id}/deactivate`))),
  reactivate: (id: number): Promise<MemberAnswer> => watched(api.post(loyaltyUrl(`members/${id}/reactivate`))),
  erase: (id: number, confirmName: string): Promise<MemberAnswer> => watched(api.post(loyaltyUrl(`members/${id}/erase`), { confirm_name: confirmName })),
  card: (id: number): Promise<CardData> => watched(api.get(loyaltyUrl(`members/${id}/card`))),
  welcome: (id: number): Promise<{ sent_to: string }> => watched(api.post(loyaltyUrl(`members/${id}/welcome`))),

  duplicates: (): Promise<{ pairs: DuplicatePair[] }> => watched(api.get(loyaltyUrl('members/duplicates'))),
  merge: (body: MergeBody): Promise<MemberAnswer> => watched(api.post(loyaltyUrl('members/merge'), body)),

  imports: (): Promise<ImportsList> => watched(api.get(loyaltyUrl('members/imports'))),
  upload: (file: File): Promise<{ batch: ImportBatch; preview: ImportPreview }> => {
    const form = new FormData()
    form.append('file', file)
    return watched(api.post(loyaltyUrl('members/imports'), form))
  },
  importBatch: (id: number): Promise<{ batch: ImportBatch }> => watched(api.get(loyaltyUrl(`members/imports/${id}`))),
  /** One chunk; `from` is the rows processed this page last saw, so a second driver hears `busy` instead of importing. */
  runImport: (id: number, from: number): Promise<{ batch: ImportBatch }> => watched(api.post(loyaltyUrl(`members/imports/${id}/run`), { from })),
  cancelImport: (id: number): Promise<{ batch: ImportBatch }> => watched(api.post(loyaltyUrl(`members/imports/${id}/cancel`))),

  /**
   * The list's members as a CSV file, through the same client (and so the same sign-in) as every call. A refusal comes
   * back as a file too; it is read as the JSON it is, so the page names its code like any other.
   */
  exportMembers: (filters: MemberFilters): Promise<Blob> => watched<Blob>(
    api.get(loyaltyUrl('members/export'), { params: exportParams(filters), responseType: 'blob' }).catch(async (error: unknown) => {
      const response = (error as { response?: { data?: unknown } }).response
      if (response && typeof Blob !== 'undefined' && response.data instanceof Blob) {
        try { response.data = JSON.parse(await response.data.text()) } catch { /* not JSON: read as unknown */ }
      }
      throw error
    }),
  ),
}

export const duplicatesKey = ['loyalty', 'membership', 'duplicates'] as const
export const importsKey = ['loyalty', 'membership', 'imports'] as const
export const importKey = (id: number) => ['loyalty', 'membership', 'import', id] as const
export const cardKey = (id: number) => ['loyalty', 'membership', 'card', id] as const

/**
 * What a change to a member makes stale: their page and history, the list and its figures, Find, and the bootstrap's
 * count of members (the shell's numbers).
 */
export function afterMemberChange(client: QueryClient, memberId: number | null): void {
  if (memberId !== null) {
    void client.invalidateQueries({ queryKey: ['loyalty', 'member', memberId] })
    void client.invalidateQueries({ queryKey: ['loyalty', 'history', memberId] })
  }
  void client.invalidateQueries({ queryKey: ['loyalty', 'members'] })
  void client.invalidateQueries({ queryKey: duplicatesKey })
  void client.invalidateQueries({ queryKey: ['loyalty', 'bootstrap'] })
}
