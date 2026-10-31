/**
 * The member portal's framework-free logic and types (frontend/src/portal), shared rather than copied, so the app and
 * the portal show the same numbers, dates and phrases. Only modules with no React, no web API client and no browser
 * are imported here; their own imports resolve from the app's node_modules (metro.config.js), so `i18next` is the
 * app's instance.
 */
export { formatMoney } from '../../../../frontend/src/portal/lib/money'
export { formatDay, formatDateTime, formatTime, resolveLocale, venueToday } from '../../../../frontend/src/portal/lib/dates'
export { counted, formatCount, COUNTED, type CountedKey } from '../../../../frontend/src/portal/lib/plural'
export { toGoPhrase, membershipPhrase, tierTone, type CardPhrase, type CardProgress } from '../../../../frontend/src/portal/pages/memberCardMath'
export type {
  Activity, Benefit, BookingKind, CardPayload, Claim, InboxNotification, LaravelPage, Offer, Paginated, PortalBooking,
  PortalBootstrap, PortalCapabilities, PortalMember, PortalVenue, Redemption, Reward, Tier,
} from '../../../../frontend/src/portal/lib/types'
