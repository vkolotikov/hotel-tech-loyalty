# HexaTech Loyalty, release 4 — the member portal completed, safer payments, messaging, the last gaps (design)

Status: owner's answers of 2026-10-22 ("proceed all remaining improvements and addons"). Builds on release 3 (live as
`main` f344b74, built from branch 763e1b0). Runbooks: `docs/member-portal.md`, `docs/loyalty-workspace.md`.

## 1. Owner decisions

| # | Question | Answer |
|---|---|---|
| R4-1 | Scope | Everything listed as remaining: the portal's missing features, the booking/payment limits, the workspace's gaps, messaging. |
| R4-2 | The public widget | The two widget changes below are approved (the ruling of 2026-09-29 says a widget change is asked first; it was). Nothing else in the widget changes. |
| R4-3 | Extras pricing | **Charge correctly**: per night × nights, per person × guests, per person per night × both — in the portal and the widget. The full admin's extras list says how each extra is charged. |
| R4-4 | SMS | **Build, with its own opt-in**: a member switch "Offers by SMS", off until the member turns it on; only they receive SMS. Sent through the venue's own Twilio account (Settings → Integrations). |
| R4-5 | Currency | **Set in Card & app**: one field that writes the same setting booking setup writes, warning when online payments are set up in another currency. |
| R4-6 | Boost times | **Fix new saves, flag old**: the full admin's boost form saves the venue's wall clock; boosts saved before by the full admin are marked "check the time" in the workspace until saved again. |

## 2. The member portal (parts A, C, D)

- **A. Notifications and preferences.** An inbox page in the portal (the member's kept notifications, newest first,
  mark read, mark all read; an unread badge in the navigation), using the member endpoints that already exist. In
  Profile: the kinds of message (offers, points, tier, stays — `notification_preferences`), email notifications, push,
  marketing email, and the new SMS opt-in (R4-4; its column comes from part F). Plural forms for nights and guests in
  all five languages. "Upcoming" and "past" switch on the venue's clock, not at midnight UTC. A stay booked through the
  public widget and later matched to a member earns points like a portal stay, when the match is certain (the stay's
  guest is linked to exactly one member of the same organisation with the same email).
- **C. Portal payments.** Redirect-based payment methods (allowed by Stripe for the account) work: the portal
  returns from the bank, restores the booking from the server (never from the client) and confirms. A venue setting
  "Take bookings to pay at the venue when online payment is unavailable" (off by default) lets a member book without
  paying when Stripe cannot be reached; the booking is marked to pay at the venue. A second `payment-intent` call for
  the same hold or slot reuses or releases the first intent (no two holds on one card); a hold's expiry is extended a
  limited number of times.
- **D. Combination stays.** A party larger than one room can book several rooms in one go, through
  `BookingEngineService` with every room locked (in a fixed order) and every price and availability re-checked under
  the locks, paid with the payment rules of `docs/member-portal.md` intact. If the payment rules cannot hold for a
  combination without changing them, the builder stops and reports a design instead of building.

## 3. The public widget (part B, R4-2/R4-3)

- The public services confirm accepts a payment only when it is this booking's: the amount the server prices, the
  account's own payment marked as a service booking (`kind`), not carried by any booking (stays included).
- Extras are charged as set (R4-3), in the engine's `extrasLines()` that the widget and the portal share; the
  widget tests that pin the old pricing are changed to the new, and only those.

## 4. The workspace (part E)

- Insights: cohort retention (by the month members joined, active in later months) and the money members bring
  (paid bookings and services by members, in the venue's currency); an index for the ledger's reads.
- Brand choice when an organisation has more than one brand: new rewards, offers and boosts name a brand.
- Currency in Card & app (R4-5).
- Boost times (R4-6): the full admin's form fixed; earlier full-admin boosts flagged.
- Finding duplicates groups in the database instead of loading every member.

## 5. Messaging (part F)

- **SMS** to a segment (a Campaigns tab), with the member's own SMS opt-in (R4-4), a phone number, through the venue's
  Twilio account; the same confirmation, once-only start and per-member delivery rows as email and push; a test SMS to
  the sender's own phone.
- **Send later** for email campaigns, push and SMS: a time on the venue's clock; the scheduler starts it then, sending
  to whoever is eligible at that moment (the confirmation says so).
- **Expo receipts**: push tickets are checked later; a device that is gone is cleared from the member.
- The full admin's bulk message and segment send keep inbox rows for every member they reach, app or no app.

## 6. Rollout

One deploy by the source-patch recipe after the owner's "yes, deploy"; migrations add tables and nullable columns
only and are tried on PostgreSQL first. After it: put the Twilio account in Settings → Integrations to use SMS.
