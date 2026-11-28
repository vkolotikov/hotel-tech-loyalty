# Membership packages, partner scanning and reusable cards

## Intent and authorisation

The owner requested implementation of a visible menu-collapse icon; membership levels assigned from purchased
packages with all configured benefits; partner staff at different places with scanning/check-in access but no
programme editing; guidance for push vouchers/codes; a membership start date in the member portal; and reusable
NFC/QR physical cards. Existing features should be explained and reused. This is authorised implementation work,
including normal tested deployment by CLAUDE.md's source-patch recipe.

Owner clarification: “I just need an option manualy assign membership, no need conect with payment system etc.”
This is manual membership assignment only. A package is an existing programme level with its configured benefits.
No payment record, payment reference, amount, payment confirmation, checkout or recurring billing is needed.
In the implementation use `membership_mode: assigned|earned` rather than claiming a paid/verified transaction.

## Existing foundations

MemberDetails is the tier writer; MemberEnrolment creates memberships; MembershipValidity owns end dates;
LoyaltyService assesses earned tiers. PlaceScan/AccessDecision own place entry and actual benefits. TeamController
already creates tenant-specific staff logins, enforces plan limits and sends expiring activation invitations.
NfcCards already supports switching a card off and relinking its existing row to another member, resetting its
current-owner counters. Push campaigns, segments, offer/voucher codes and member inbox delivery already exist.

## Programme and membership experience

- Add an accessible collapse/expand icon beside the desktop Loyalty logo, using the persisted rail setting.
  Keep a visible expansion control when collapsed. Preserve the phone menu and existing keyboard behaviour.
- Managers can assign a membership package (an existing active level) and a venue-day start and end in one reviewed
  action. Configure the package's benefits under Rewards & benefits.
  Offer this in Add member and on an existing member. The summary states the level, dates and configured benefits.
- A purchased assignment holds its level against automatic points/visit/spend assessment, using the existing tier
  lock mechanism. Store explicit assignment metadata so staff can distinguish a purchase from earned progression;
  expose an explicit switch back to earned progression. No invented points or copied benefit catalogue.
- Save the tier, paid/earned mode and dates atomically through shared membership services. New member creation
  includes the intended assignment before the welcome bonus can assess a different level. Preserve welcome-email
  failure reporting, tenant validation, erased/inactive handling and duplicate-email protection.
- Add optional `membership_valid_from` (plain Y-m-d); null means no scheduled start, preserving current records.
  `valid_from <= valid_until` when both exist. Both boundaries are inclusive venue days, independent of browser UTC.
  A future start is a distinct scheduled state. Surface it in admin/member views and scans. Existing sessions may
  still sign in and read their membership while scheduled or expired.
- AccessDecision and event sign-up judge both boundaries on the relevant venue/event day. Benefits that depend on
  an active membership must not be usable before its start; paid-package benefits stop when the paid term ends.
  Preserve the documented existing points/credit ledger behaviour and public booking contract. Any benefit reader
  used by booking prices must use the same membership eligibility rule, without changing non-member quotes.
- Date edits, renewals, imports and merge behaviour must preserve a coherent interval. Never combine disjoint
  memberships into an unintended continuous access period. Use the existing manager-only canonical writer.

## Partner scanning

- A partner is a staff login explicitly marked scan-only, with a nonempty allowlist of this organisation's active
  places. An owner/manager invites them through a Loyalty partner screen backed by the existing team writer and
  activation flow, with a clear browser-app link. Existing Team management shows and preserves the restriction.
- Provide a phone-friendly partner scanner with place choice restricted to its allowlist, QR camera, supported NFC
  and manual physical/member-code input. Scanning records the existing place entry/check-in. Show member name,
  level, membership dates, access verdict and actual configured benefits. Hide contact details, balances, history,
  member directory and administrative controls.
- Enforce restrictions server-side with an explicit allowlist, independently of AdminAccess report/enforce mode.
  Direct requests to all other admin endpoints, full-admin scanner aliases, member edits, card linking/reassignment,
  exports, campaign sends and settings must be refused. Restrict place IDs before consuming a code or replay.
  A replay must be scoped to the operator/place and cannot leak another operator's stored scan response.
- Existing normal staff/managers keep their behaviour. Never grant scan-only users capability flags through an
  invite/update. Empty, foreign, deleted or revoked place assignments fail closed. Partner deactivation immediately
  stops access. Avoid changing installed native API contracts; the ready-to-share first delivery is the web app.

## Push vouchers and cards

- Reuse existing offers/codes and push campaigns. Provide a step-by-step guide: define the benefit/offer and its
  eligibility, create a segment, compose an Offers push with the code or claim instructions, review audience and send.
  Explain member consent, installed app/device token and APNs/FCM/Expo delivery requirements. An inbox row is distinct
  from physical push delivery. No live customer invitations or campaigns are sent during implementation tests.
- NFC reuse already works through switch-off then relink. Provide a guided manager action or clear linked-card flow
  and tests proving the old member loses the card, the new member gains it, history stays with its original member,
  and cross-organisation cards cannot be taken.
- Offer a reusable physical-card QR encoding its stable card UID, resolved by the existing NFC lookup. This QR moves
  with the physical card rather than with the person's account. Do not silently transfer a personal member number,
  QR token, wallet or login credential to another person. Explain that existing personal printed QR codes need a
  one-time conversion to a reusable card QR; inspect their format before promising unchanged printing.

## Contracts and verification

Extend existing membership DTOs additively with `valid_from` and assignment metadata; preserve old callers omitting
them. New staff partner endpoints stay in `/v1/admin/loyalty/*?brand_id=all`, with explicit AccessMap rules and tenant
validation. Keep endpoint documentation and runnable local API checks with source. Reuse current services and UI
primitives; all visible words in the five locales, existing palettes and reduced motion.

Write regression tests before the meaningful changes: interval boundaries/venue zones/event day, purchase atomicity
and tier lock, rights on creation and assignment, partner default-deny in both AdminAccess modes, foreign/revoked
places, scan replay isolation, data minimisation and card reuse. Verify changed flows against isolated real PostgreSQL
with external providers blocked and local mail capture. Inspect desktop/mobile, five languages and both themes.
Run appropriate full frontend, shared-consumer and scoped PHP checks, then the required isolated deployment recipe
and verify actual served content. Document native-phone/store/provider acceptance still outstanding separately.

The implementation builder decides component/file factoring and exact compact layout. No new dependencies are
needed for menu controls, membership forms, shared scanners, QR generation or the written customer guide.

## Builder-check rulings

The fresh builder check raised three material choices. These are implementation defaults, not owner statements:

1. One current membership assignment, without a queued future-package ledger. Assigning a future start to an
   already active membership requires an explicit replacement confirmation showing that current access will be
   replaced immediately; without that confirmation the API refuses. A same-package renewal normally extends the
   current interval instead. Existing-account date editing remains an explicit manager action.
2. Paid benefit eligibility is judged on the venue day of use/claim/quote. Keep the current quote/confirmation
   pricing flow and its existing date basis; do not introduce service-date or multi-night prorating rules here.
3. Purchased packages hold the exact assigned level. The existing tier_locked guard only prevents downgrades, so
   purchased assignment metadata also prevents automatic upgrades. An explicit return to earned progression removes
   the purchased guard and reassesses normally. Existing unrelated manual-lock behaviour stays compatible.
