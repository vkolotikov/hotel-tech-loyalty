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
export { offerValueLabel, offerPerkNote, paysPointsOnClaim, claimedMessage } from '../../../../frontend/src/portal/pages/rewards/offerLabel'
export { isUnread, openNotification, afterReadOne, afterReadAll, canMarkAllRead } from '../../../../frontend/src/portal/pages/inbox/inboxState'
export { TOPICS, questionsFor, topicsFor, showsSteps, STEPS, stepWords, questionWords, topicWord, fold, narrow, type TopicId, type QuestionId } from '../../../../frontend/src/portal/pages/help/helpMath'
export { messageKinds, preferencesOf, messageBody, applyMessageChange, marketingNeedsEmail, smsSwitch, type MessageChange, type ChannelField } from '../../../../frontend/src/portal/pages/profile/messages'
export type {
  Activity, Benefit, BookingKind, CancelReply, Catalogue, CatalogueService, CatalogueMaster, CatalogueExtra, CatalogueRules, Slot, CouponRef, Quote, QuoteBody, ConfirmBody, PaymentIntentReply, ResolvedCoupon,
  StayRoom, StayExtra, StayPolicies, StayRules, StayCatalogue, AvailableRoom, AvailableCombination, StayAvailability, StayQuoteBody, StayQuoteRoom,
  StayQuote, StayConfirmBody, Priced, CardPayload, Claim, InboxNotification, LaravelPage, Offer, Paginated, PortalBooking,
  PortalBootstrap, PortalCapabilities, PortalMember, PortalVenue, Redemption, Reward, Tier, MessageKind, NotificationPreferences,
  PortalEvent, PortalEvents, AttendedEvent, MemberStamps, MemberCredit,
} from '../../../../frontend/src/portal/lib/types'
export { actionOf, noteOf, whenPhrase, dateBlock, nextEvent, pastEvents, errorPhrase, whyPhrase, counted as eventCounted, type Phrase as EventPhrase } from '../../../../frontend/src/portal/pages/events/eventMath'
export { vocabKey, vocabIndustry, type VocabNoun } from '../../../../frontend/src/portal/lib/industry'
export { stampFace, toGoPhrase as stampToGo, rewardPhrase as stampReward, type StampFace } from '../../../../frontend/src/portal/pages/stamps/stampMath'
export { cancelOffer, moneyPromise, afterCancelError } from '../../../../frontend/src/portal/pages/cancelBooking'
export { statusTone, statusLabel, bookingPaymentLabel, type ChipTone } from '../../../../frontend/src/portal/pages/bookingLabels'
export { bookErrorKey, bookErrorFallback, cancelErrorKey, cancelErrorFallback } from '../../../../frontend/src/portal/lib/bookErrors'
export { nightsAndGuests } from '../../../../frontend/src/portal/lib/plural'
export { bookDestination } from '../../../../frontend/src/portal/pages/bookDestination'
export { nextHeading } from '../../../../frontend/src/portal/pages/homeMath'
export {
  STEPS as BOOK_STEPS, bookReducer, initialState as bookInitialState, mastersFor, visibleDay, afterQuoteError, newPayVisit, payAtVenueGrantOf,
  retryOnlineVisit, canTryOnlineAgain, canLeavePay, afterConfirmError, refreshAfterCouponResolved, quoteBody, isWindowCode, couponChoices,
  sameCoupon, addDays, chargesNothing, type Step as BookStep, type BookState, type BookAction, type ReviewPatch, type PayVisit,
} from '../../../../frontend/src/portal/pages/book/steps'
export {
  STAY_STEPS, stayReducer, initialStayState, datesProblem, nightsBetween, stayQuoteBody, hasRoomChoice, chosenRoomsLabel, stayRoomChoices,
  afterStayQuoteError, afterStayConfirmError, retryConfirmArgs, stayBounceArgs, stayPayNoticeKind, stayIntentErrorKind, payView,
  showCardUnavailable, stayChargeLine, perNightShown, stayCatalogueGuard, stayChargeable, stayIntentAnswer, stayHold, combinationPerNight,
  type StayStep, type StayState, type StayAction, type StayReviewPatch, type StayRoomChoices, type StayConfirmDecision, type StayPayNoticeKind,
  type StayIntentErrorKind, type StayPayView, type StayIntentAnswer, type StayChargeLine,
} from '../../../../frontend/src/portal/pages/stay/staySteps'
