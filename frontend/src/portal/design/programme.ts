import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

export interface MemberProgramme {
  earning: null | { bookings: boolean; desk: boolean; base_rate: number; checkin: boolean; checkin_points: number; expiry_months: number; birthday_points: number; referrals: boolean }
  places: { id: number; name: string; description: string | null; granted: boolean; reason: string; allowed_tiers: string[] }[]
}

export function useProgramme(enabled = true) {
  return useQuery({ queryKey: ['portal-programme'], queryFn: (): Promise<MemberProgramme> => api.get('/v1/member/portal/programme').then(r => r.data), enabled, staleTime: 10_000, refetchOnWindowFocus: true })
}
