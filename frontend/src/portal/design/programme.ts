import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { MemberProgramme } from '../lib/types'
export type { MemberProgramme } from '../lib/types'

export function useProgramme(enabled = true) {
  return useQuery({ queryKey: ['portal-programme'], queryFn: (): Promise<MemberProgramme> => api.get('/v1/member/portal/programme').then(r => r.data), enabled, staleTime: 10_000, refetchOnWindowFocus: true })
}
