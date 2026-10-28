export type RequestKind = 'benefit' | 'redemption' | 'referral'
export type InboxView = 'open' | 'closed' | 'all' | 'waiting' | 'approved'
export interface InboxMember { id: number; name: string; number: string | null; tier: string | null }
interface BaseRecord { key: string; kind: RequestKind; id: number; state: string; member: InboxMember | null; at: string | null }
export interface BenefitRecord extends BaseRecord { kind: 'benefit'; title: string | null; fulfilled_at: string | null; decline_reason: string | null }
export interface RedemptionRecord extends BaseRecord { kind: 'redemption'; title: string | null; code: string; points: number; fulfilled_at: string | null; cancelled_at: string | null }
export interface ReferralRecord extends BaseRecord { kind: 'referral'; referee: InboxMember | null; points: { referrer: number; referee: number }; qualified_at: string | null; rewarded_at: string | null }
export type InboxRecord = BenefitRecord | RedemptionRecord | ReferralRecord
export interface InboxFilters { type: 'all' | RequestKind; view: InboxView; q: string; sort: 'newest' | 'oldest'; page: number; selected_kind?: RequestKind; selected_id?: number }
export interface InboxPage { records: InboxRecord[]; selected: InboxRecord | null; total: number; page: number; pages: number; per_page: number }
