import type { BookingKind, CancelReply, PortalBooking } from '../lib/types'

/** How far apart the server's deadline and the member's own clock are allowed to
 *  disagree before "just passed" is trusted over a server that still says `can_cancel: true`. */
const CLOCK_SKEW_MS = 5 * 60 * 1000

/**
 * What the booking sheet says about cancelling. The server decides whether a booking can be cancelled
 * (`can_cancel`): the button appears exactly when the endpoint would accept it. `cancel_deadline` mostly says
 * WHEN — until when it is free, or when that ended — but it is also the tie-breaker against a stale DTO: a
 * booking fetched a while ago can still carry `can_cancel: true` after its own deadline has quietly passed
 * (the sheet only refetches on demand), so a deadline already in the past reads as "ended" even then. The
 * server is still the one authority for whether cancelling is offered at all — this only ever turns an
 * `offer` into an `ended`, never the reverse, and a booking the server already refuses (`can_cancel: false`)
 * is never offered no matter what the clock says.
 *
 * Ordinary clock skew (a few minutes, either direction) must not read a `can_cancel: true` deadline as
 * already "ended" while the server still means to honour it. When the server says `can_cancel: true` AND its deadline lies within
 * `CLOCK_SKEW_MS` of the member's own clock, EITHER WAY (just passed, or not quite yet), the deadline is not
 * treated as passed — the server is trusted over a clock that close. Outside that margin the existing rule
 * stands: a passed deadline reads "ended" regardless of what `can_cancel` still says.
 */
export function cancelOffer(b: PortalBooking, now: Date): 'offer' | 'ended' | 'contact' | 'none' {
  if (b.status === 'cancelled' || b.status === 'completed') return 'none'
  const deadlineAt = b.cancel_deadline !== null ? new Date(b.cancel_deadline).getTime() : null
  const withinSkew = deadlineAt !== null && Math.abs(deadlineAt - now.getTime()) <= CLOCK_SKEW_MS
  const deadlinePassed = deadlineAt !== null && deadlineAt <= now.getTime() && !(b.can_cancel && withinSkew)
  if (b.can_cancel && !deadlinePassed) return 'offer'
  if (deadlinePassed) return 'ended'
  return 'contact'
}

/**
 * What the member is told will happen to their money BEFORE they confirm. A promise, so it errs towards
 * saying less: only a payment the booking records as taken is promised back, only a card it records as held
 * is promised released. What actually happened comes back from the server afterwards.
 *
 * `payment_status` alone is not enough to promise a card refund: staff can mark a booking "paid" for cash or
 * a bank transfer with no PaymentIntent behind it at all (`payment_status: 'paid'`, `paid_online: false`) —
 * telling that member "refunded to the card you paid with" would be a false promise, since there is no card
 * on file. `paid_online` (`MemberBookingQuery::hasRealIntent()`, the same "real Stripe
 * intent" rule `MemberCancellation` and `ServiceBookingRefund` use to decide whether there is anything online
 * to act on) is the gate for both card outcomes; money recorded as paid but not online falls to `'venue'`
 * instead, which says only that the venue will sort it out — never an amount, never a card.
 */
export function moneyPromise(b: PortalBooking): 'refund' | 'release' | 'venue' | 'nothing' | 'deposit' {
  if (b.total <= 0) return 'nothing'
  // Part H: a deposit charged on the booking page goes back to the card — only the deposit, also once the rest was
  // paid at the desk (`paid`): cancelling refunds the deposit's own payment, and the desk money is the venue's to return.
  if (b.deposit && b.paid_online && (b.payment_status === 'unpaid' || b.payment_status === 'paid')) return 'deposit'
  if (b.payment_status === 'paid') return b.paid_online ? 'refund' : 'venue'
  if (b.payment_status === 'authorized') return b.paid_online ? 'release' : 'nothing'
  return 'nothing'
}

/**
 * What a failed cancellation means for the sheet. When the booking itself has changed under the member
 * (someone cancelled it, the window closed) the question is withdrawn and the booking reloaded, so the sheet
 * shows what is true now. Anything else leaves the question open: nothing was changed, and trying again is safe.
 */
export function afterCancelError(code: string | null): { closes: boolean; refetch: boolean } {
  const changed = code === 'already_cancelled' || code === 'outside_policy' || code === 'not_cancellable'
  return { closes: changed, refetch: changed }
}

/**
 * Browser Back while a cancellation is in flight. `BookingSheet` is mounted only while
 * the URL carries `:kind/:id` (`Bookings.tsx`); Back changes the URL, which unmounts it, and this app runs
 * a plain `<BrowserRouter>` with no data router — there is no `useBlocker` here to hold the navigation until
 * the request settles. What DOES survive the unmount is the mutation itself: react-query ties a mutation's
 * own `onSuccess`/`onError` (where the cache gets its `portal-booking`/`portal-bookings` writes) to the
 * mutation, not to the component that called `mutate()`, so those already land correctly either way. What is
 * lost is only the local `stage`/`result` state that would have shown the "Your booking is cancelled…"
 * notice — nobody is left mounted to show it. `Bookings.tsx` gives the sheet's cancel mutation a
 * `mutationKey` (`['portal-cancel', kind, id]`) precisely so it can ask `useMutationState` for it after the
 * sheet is gone, and this decides, from that mutation-cache snapshot, which one (if any) is worth telling
 * the member about now that they are back on the list.
 */
export interface CancelMutationSnapshot {
  kind: BookingKind
  id: number
  status: 'pending' | 'success' | 'error'
  submittedAt: number
  refund: CancelReply['refund'] | null
  errorCode: string | null
}

/**
 * Which stale cancel mutation (if any), settled while the member was away from its booking's sheet, is
 * worth surfacing as a notice on the list now.
 *
 * `watchingSince` scopes this to attempts that settle while THIS mount of the list is open — a
 * mutation from a previous visit to `/portal/bookings`, still sitting in the mutation cache from earlier in
 * the session, is not "while away" for a list that just mounted.
 *
 * `openBooking` — the booking whose sheet is open right now (`{kind,id}`, or `null`) — is never announced
 * here: either its sheet is showing (or about to show) its OWN result, or (Back mid-flight, the sheet not
 * yet settled) it hasn't settled yet and will be picked up on a later render once it does. This is keyed on
 * the BOOKING, not "is any sheet open at all" — a first booking's cancellation that outlived ITS sheet must
 * still be announced while a SECOND, unrelated booking's sheet happens to be open.
 *
 * `shown` is the caller's own React state, not a mount-scoped ref — a re-render, such as the refetch
 * this very mutation's own `onSuccess` triggers, must not make an announced notice disappear on its own. It is
 * marked in two ways by the caller: this function returning a snapshot (the announced-on-the-list path), or
 * `BookingSheet.tsx` reporting that IT showed the result while still mounted (the ordinary, no-Back path —
 * `onCancelSettled`, called from the mutation's own `onSuccess`/`onError` guarded by a mounted ref, so a
 * settle that arrives after Back — when the sheet is no longer mounted to show anything — does NOT mark it
 * shown, and reaches this function's own `openBooking`/`shown` checks instead). Keyed on `${kind}:${id}`
 * alone (not `submittedAt`): once a booking's cancellation has been shown once, by either path, it is done
 * with regardless of how many further re-renders the same settled mutation causes.
 *
 * Only the most recent eligible attempt is returned: several cancels fired before Back only leave the member
 * caring where things ended up, not the order the answers arrived in.
 */
export function cancelledWhileAway(
  snapshots: CancelMutationSnapshot[],
  watchingSince: number,
  openBooking: { kind: BookingKind; id: number } | null,
  shown: ReadonlySet<string>,
): CancelMutationSnapshot | null {
  const eligible = snapshots.filter(s =>
    s.status !== 'pending' &&
    s.submittedAt >= watchingSince &&
    !shown.has(`${s.kind}:${s.id}`) &&
    !(openBooking !== null && openBooking.kind === s.kind && openBooking.id === s.id),
  )
  if (eligible.length === 0) return null
  return eligible.reduce((latest, s) => (s.submittedAt > latest.submittedAt ? s : latest))
}
