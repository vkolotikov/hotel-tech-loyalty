/**
 * The app's own API shapes. Everything a member also sees in the portal is typed by the portal itself
 * (src/shared/portal.ts re-exports frontend/src/portal/lib/types.ts), so the two never drift.
 */
export type {
  Activity, Benefit, BookingKind, CancelReply, Catalogue, CatalogueService, CatalogueMaster, CatalogueExtra, CatalogueRules, Slot, CouponRef,
  Quote, QuoteBody, ConfirmBody, PaymentIntentReply, ResolvedCoupon, CardPayload,
  StayCatalogue, StayAvailability, StayQuoteBody, StayQuote, StayConfirmBody, AvailableRoom, AvailableCombination, StayRules, Priced, Claim, InboxNotification, LaravelPage, Offer, Paginated, PortalBooking, PortalBootstrap,
  PortalCapabilities, PortalMember, PortalVenue, Redemption, Reward, Tier, MessageKind, NotificationPreferences,
  PortalEvent, PortalEvents, AttendedEvent, MemberStamps, MemberCredit,
} from '../shared/portal'

/** `POST /v1/auth/login` (and `register`, which adds the member): the token and the account. */
export interface SignInAnswer {
  token: string
  user: { id: number; name: string; email: string; user_type?: string; language?: string | null }
}

/** `GET /v1/public/join/{token}`: the programme a sign-up link joins (PublicJoinController). */
export interface JoinContext {
  organization: { id: number; name: string }
  accepting_joins: boolean
  error?: string
  welcome_bonus?: number | null
  referrals?: boolean
  theme?: { logo_url?: string | null } | null
}

/** `GET /v1/member/card` beside the portal's own `CardPayload`. */
export interface MemberCardAnswer {
  member_number: string
  qr_image: string | null
  qr_svg: string | null
}
