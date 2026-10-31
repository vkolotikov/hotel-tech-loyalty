import { api } from '../../../lib/api'
import type { MemberStamps } from '../../lib/types'

// The shapes live in lib/types.ts (plain types the members' app shares); named here for the stamp card's imports.
export type { MemberStamp, MemberStamps } from '../../lib/types'

/** The member's stamp card: their own endpoint under the portal's door (member.only), read only. */
export const stampsApi = {
  mine: (): Promise<MemberStamps> => api.get('/v1/member/portal/stamps').then(r => r.data),
}

export const STAMPS_KEY = ['portal-stamps'] as const
