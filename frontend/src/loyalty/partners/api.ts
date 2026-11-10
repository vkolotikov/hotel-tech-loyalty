import { api } from '../../lib/api'
import { loyaltyUrl } from '../lib/api'
import type { BenefitBadge, Verdict } from '../scan/scanApi'
export interface Partner { id: number; name: string; email: string; is_active: boolean; place_ids: number[]; accepted: boolean }
export interface Place { id: number; name: string }
export interface PartnerContext { organization: { name: string }; staff: { name: string }; places: Place[]; today: string; currency: string }
export interface PartnerAnswer { member: { id: number; name: string; member_number: string }; verdict: Verdict; benefits: BenefitBadge[] }
export interface PartnerScanBody { code: string; place_id: number; idempotency_key: string }
export const PARTNERS_KEY = ['loyalty', 'partners'] as const
export const partnerApi = {
  list: () => api.get<{ partners: Partner[]; places: Place[] }>(loyaltyUrl('partners')).then(r => r.data),
  invite: (body: { name: string; email: string; loyalty_place_ids: number[] }) => api.post<{ email_sent: boolean }>(loyaltyUrl('partners/invite'), body).then(r => r.data),
  update: (id: number, ids: number[]) => api.put(loyaltyUrl(`partners/${id}`), { loyalty_place_ids: ids }).then(r => r.data),
  state: (id: number, active: boolean) => api.put(loyaltyUrl(`partners/${id}/state`), { is_active: active }).then(r => r.data),
  resend: (id: number) => api.post<{ email_sent: boolean }>(loyaltyUrl(`partners/${id}/resend`)).then(r => r.data),
  context: () => api.get<PartnerContext>(loyaltyUrl('partner/context')).then(r => r.data),
  scan: (body: PartnerScanBody) => api.post<PartnerAnswer>(loyaltyUrl('partner/scan'), body).then(r => r.data),
}
