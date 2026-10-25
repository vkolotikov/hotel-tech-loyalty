# HexaTech Loyalty, release 7 — ways to earn and reward (design)

Status: owner's request of 2026-10-25 ("different types of loyalty options … an easy way for users to manage, to select
what kind of benefits, what kind of loyalty options for their company they want to use … at the beginning they could
select it, choose and configure all of them"). Owner's choices the same day:

- **R7-1** Build all four: the stamp card, check-in and earning at the desk, cashback credit, and the half-built parts
  finished.
- **R7-2** Cashback credit is spent at the desk only: staff take it off after a scan. Online card payments and the
  public widget are untouched.
- **R7-3** A visit (for the stamp card) is a completed appointment, a finished stay or a desk check-in — at most one
  stamp per member per venue day.
- **R7-4** A setup wizard in the loyalty workspace at the start, and a page to change the options any time.

What exists today (inventory of 2026-10-25): points on spend (`LoyaltyService::pointsForSpend`, triggered by a
completed appointment and a finished stay in `BookingPointsService`), tiers, the rewards catalogue, offers (only
`discount` and `fixed_amount` do anything), tier benefits, boosts, welcome / birthday / referral bonuses, points
expiry. Nothing counts visits; there is no credit balance; a scan only looks a member up; a venue cannot choose its
mechanics — each is always on or a number in the full admin's Settings, which the workspace cannot edit.

## 1. The programme's options (part O)

**One reader and one writer:** `App\Services\Loyalty\Programme\ProgrammeOptions`.

- `ProgrammeOptions::for(int $orgId): array` — every option, typed, with its default, read under the organisation
  (never the bound tenant by accident).
- `ProgrammeOptions::save(int $orgId, array $changes, User $by): array` — validates, writes `hotel_settings` rows
  (`updateOrCreate` by key; a new row gets group `loyalty`), flushes the settings cache, audits `loyalty.options_changed`
  with old and new values, answers `for()`.
- Every engine reader of these keys goes through it from now on (or reads the same key with the same default).

| Option | Keys (existing keys keep their names) | Default for a venue that never set it | Off means |
|---|---|---|---|
| Points on spend | `points_on_bookings` (bool), `points_per_currency` (decimal > 0) | on, 1 | completed bookings earn no points (stamps and cashback still count the visit) |
| Points expiry | `points_expiry_months` (int ≥ 0) | 24 | 0 = never (fixed: today 0 expires at once — §5.3) |
| Welcome bonus | `welcome_bonus_points` (int ≥ 0) | 500 when unset (what sign-up and staff enrolment already award; the join page, which showed 0, reads it through `ProgrammeOptions` too) | 0 |
| Birthday bonus | `birthday_bonus_points` (int ≥ 0) | 500 | 0 |
| Referrals | `referral_enabled` (bool), `referrer_bonus_points`, `referee_bonus_points` (int ≥ 0), `referral_reward_on` (`first_visit` \| `signup`) | on, 250, 250, `first_visit` | no referral link, no bonus |
| Stamp card | `stamps_enabled` (bool), `stamps_per_card` (int 2–50), `stamp_reward_kind` (`points` \| `reward`), `stamp_reward_points` (int ≥ 1), `stamp_reward_id` (a catalogue reward of this organisation) | off, 10, `points`, 100, null | no stamps |
| Check-in | `checkin_enabled` (bool), `checkin_points` (int ≥ 0) | off, 0 | the Scan page shows no Check in |
| Earn at the desk | `desk_earn_enabled` (bool) | off | the Scan page shows no "Add a purchase" |
| Cashback credit | `cashback_enabled` (bool), `cashback_percent` (decimal 0.1–50) | off, 5 | no credit earned (a balance already earned can still be spent) |
| Setup | `programme_setup_completed_at` (ISO time, written by the wizard) | — | the workspace offers the wizard |

Tiers, the rewards catalogue, offers and boosts keep their own pages; the options page links to them and says how many
there are.

**API** (workspace, `/v1/admin/loyalty/…`, every call names `brand_id=all`):

- `GET options` → `{ options, catalogue: { tiers, rewards: [{id,name,points_cost}], offers, boosts }, presets }`
  (presets: `LoyaltyPresetService`'s list, the industry's own first).
- `PUT options` → partial changes; 422 with field errors; manager only.
- `POST options/setup` → the wizard's apply: `{ preset?, options }`. When the organisation has no tier at all and a
  preset is named, the preset is applied first (`LoyaltyPresetService::apply`, which never touches an organisation
  with members); then the options are saved and `programme_setup_completed_at` stamped. Manager only. Idempotent by
  key (see below).
- `POST options/setup/skip` stamps `programme_setup_completed_at` without changing anything.
- AccessMap: `admin/loyalty/options` → `['staff', 'manager', 'loyalty']`.

**Workspace** (`frontend/src/loyalty/options/`, route `/loyalty/options`, nav "Ways to earn", after Program; words in
`i18n/options.<lang>.json` under `loyalty.options`):

- **The page**: one card per option — a switch, a one-line "what members get", its settings inline, Save per card;
  cards for Tiers, Rewards, Offers and Boosts link to their pages with their counts. Staff who are not managers see it
  read-only.
- **The wizard** (`/loyalty/options/setup`), offered by a banner on Members and the options page while
  `programme_setup_completed_at` is unset and the caller is a manager: 1. your business (the presets, the industry's
  first; a venue that already has tiers sees "Keep my tiers and rewards" chosen and the presets greyed); 2. choose
  (the option cards as tick boxes, pre-ticked from the preset's recommendation); 3. configure (each ticked option's
  fields, with the preset's values); 4. review (what members will get, in sentences) → Apply. Skip at any step.
- Pure functions in `options/optionsMath.ts` (form ↔ options, problems, the review sentences, the preset's
  recommendation), tested by string.

## 2. Visits and the stamp card (part S)

**One hook:** `App\Services\Loyalty\Visits\VisitRecorder` — called when a visit happens; it is the only caller of the
stamp card, cashback earning and referral qualification for a visit.

- `VisitRecorder::record(LoyaltyMember $m, Visit $visit): VisitOutcome` where `Visit` is
  `{source: 'appointment'|'stay'|'check_in'|'purchase', referenceType, referenceId, amount (?float, the spend),
  venueDay (Y-m-d on the venue's clock), by (?User)}`; `VisitOutcome` carries `stamp` (the card after it, or null and
  why), `credit` (earned, or null), `points` (earned at the desk, or null).
- `VisitRecorder::reversed(string $referenceType, int $referenceId, ?User $by)` — a refunded or cancelled booking:
  its stamp is taken off when its card is not yet complete (a complete card stands; audited), its cashback is reversed
  (§3).
- **Callers:** `BookingPointsService::awardForServiceBooking()` and `awardForStay()` — after their own
  completed/paid/member checks and **before** the points-on-bookings gate (a venue with points off still stamps);
  `reverseForServiceBooking()` and `BookingRefundService`'s stay points reversal; the desk check-in (below).
  Idempotent: a reference is recorded once (unique index), so the existing repeated calls are safe.

**Tables** (new, nullable-free where production needs it):

- `stamp_cards`: id, organization_id, member_id, number (1, 2, …), stamps_needed, stamps_count, completed_at,
  reward_kind, reward_points_transaction_id, reward_redemption_id, timestamps. Unique (member_id, number).
- `stamps`: id, organization_id, member_id, stamp_card_id, source, reference_type, reference_id, venue_day (date),
  created_by, timestamps. Unique (organization_id, member_id, venue_day) — one per day; unique (organization_id,
  reference_type, reference_id) where a reference is set.

**`App\Services\Loyalty\Stamps\StampCards`** — the only writer. `stamp()` under the member row lock: the option on; one
per venue day; the open card (created on first stamp with the current `stamps_per_card` — a later change applies to new
cards only); a full card is completed in the same transaction: `points` → `LoyaltyService::awardPoints` (type `bonus`,
key `stamp_card_{id}`, not qualifying), `reward` → a `RewardRedemption` at 0 points through `RedemptionActions`' own
issue path (pending, a code the member shows), then the next card opens; the member gets a push ("Your card is full!").
`remove()` for reversals. `forMember()` for screens.

**Desk check-in and purchase** (`App\Services\Loyalty\Visits\DeskVisit`, workspace endpoint
`POST members/{id}/check-in`; body `{ amount?: number, note?: string, idempotency_key?: string }`):

- A desk request writes one `scan_events` row; its visit is referenced as `scan_event` + that row's id (the stamp's
  and the cashback's reference).

- `checkin_enabled` or `desk_earn_enabled` must be on (409 `option_off`); an amount needs `desk_earn_enabled`.
- Once per member per venue day as a check-in: a second the same day answers 200 with `already_today: true` and still
  takes a purchase amount (points and cashback for it, no second stamp or check-in points).
- Points: `checkin_points` once a day (type `bonus`, not qualifying); for an amount, `pointsForSpend()` (tier rate,
  boosts, multipliers) as an `earn` line with `amount_spent` — qualifying, like a booking.
- Writes a `scan_events` row `action_taken = check_in` (and `transaction_id` when points were written), calls
  `VisitRecorder::record()` (stamp, cashback, referral).
- Access: `can_award_points` (LoyaltyAccess::AWARD), as Award. AccessMap `admin/loyalty/members/{id}/check-in` →
  `['staff', 'can_award_points', 'loyalty']`.
- **Workspace**: the Scan result and a member's page get "Check in" and "Add a purchase" (amount in the venue's
  currency) when the options are on; the answer is shown ("+1 stamp — 7 of 10", "+45 points", "+€2.25 credit",
  "Already checked in today"). A member's page shows the stamp card (filled and empty circles) and its history.
- **Member side**: `GET /v1/member/stamps` (for the app's next build) and the portal: the card on Home and on the
  membership card page (`p-*`, five locales).

## 3. Cashback credit (part C)

- `loyalty_members.credit_balance` decimal(12,2) NOT NULL DEFAULT 0; `credit_transactions`: id, organization_id,
  member_id, type (`earn` \| `spend` \| `reverse` \| `adjust`), amount (decimal(12,2), signed), balance_after, currency
  (the venue's, upper case), reference_type, reference_id, idempotency_key (unique per organisation), note, created_by,
  timestamps.
- **`App\Services\Loyalty\Credit\CreditLedger`** — the only writer, every write under the member row lock in one
  transaction with its line: `earnCashback(member, spend, reference, key)` (`cashback_percent` of the spend, rounded
  down to the cent — zero-decimal currencies to the unit; nothing below 0.01), `spend(member, amount, by, note, key)`
  (refused above the balance: 422 `credit_short`), `reverseFor(reference)` (the earn lines of a refunded booking; never
  below zero — what was already spent stays spent, the shortfall is audited `credit.reverse_short`), `adjust()` for a
  manager's correction.
- Earned on every visit with a spend (`VisitRecorder`): a completed appointment's `total_amount`, a finished stay's
  `price_total`, a desk purchase's amount — only while `cashback_enabled`. Never earned on credit itself.
- **Spending is at the desk only (R7-2):** workspace `POST members/{id}/credit/spend` `{ amount, note?,
  idempotency_key? }`; `can_redeem_points` (LoyaltyAccess::REDEEM), as Redeem. AccessMap
  `admin/loyalty/members/{id}/credit` → `['staff', 'can_redeem_points', 'loyalty']`; `GET members/{id}/credit` (the
  lines). A manager's `adjust` with a reason.
- **Screens**: a member's page and the Scan result show the balance and "Use credit"; the history lists credit lines.
  Portal Home shows "Credit: €12.40" and its lines (`p-*`, five locales); `GET /v1/member/credit`.
- **Merge and erasure**: `MemberMergeService` moves credit lines, stamps and stamp cards to the winner and adds the
  balances (MEMBER_COLUMNS); erasure keeps the ledger rows (money records) and the balance is forfeited (audited).
- No expiry of credit in this release (a known limit).

## 4. Offers, tiers, expiry and referrals finished (part F)

1. **`bonus_points` offers** give their points when claimed (`Member/OfferController::claim`, and staff-side claim
   paths): an awardPoints line, type `bonus`, key `offer_bonus_{member_offer_id}`, not qualifying; the claim is `used`
   at once. The portal shows "+500 points", never "500x points".
2. **`points_multiplier` offers**: a claimed, live multiplier offer is a personal boost — `pointsForSpend` takes the
   best of the active boosts and the member's claimed live multiplier offers (never their product), then the tier
   benefit multiplier as today.
3. **Tier qualification counters**: a finished stay adds its nights, one stay and its spend; a completed appointment
   and a desk purchase add their spend (`qualifying_nights`, `qualifying_stays`, `qualifying_spend`); a reversal takes
   them back; `assessTier()` runs after. Only through `LoyaltyService`.
4. **Expiry 0 = never**: `point_expiry_buckets.expires_at` becomes nullable (migration); awards with
   `points_expiry_months = 0` write no expiry; the expire job and the monthly report skip null.
5. **Referrals at the friend's first visit** (`referral_reward_on = first_visit`, the default): sign-up writes the
   `referrals` row `pending` and pays nothing; the referee's first visit (`VisitRecorder`) qualifies it — both bonuses
   paid (keys `referral_{id}_referrer` / `_referee`), `qualified_at` / `rewarded_at` stamped. `signup` keeps today's
   behaviour. `referral_enabled = false`: no referral link (`Member/ReferralController` answers `enabled: false`) and
   sign-up ignores a referral code.
6. `free_night`, `upgrade` and `cashback` offers stay perks honoured by staff (the portal and the workspace say so);
   cashback is the credit option (§3), not an offer.

## 5. Rules for every part

- Points only through `LoyaltyService`; credit only through `CreditLedger`; stamps only through `StampCards`; options
  only through `ProgrammeOptions`. A visit's effects only through `VisitRecorder`.
- Money: credit is money — the ledger's `balance_after` equals the member's `credit_balance` after every line (a test
  pins it), a spend never takes the balance below zero, every write has an idempotency key.
- Lock order: the member row (`loyalty_members`, `lockForUpdate`) inside the transaction that writes the line; never
  inside a `pi:` lock; a booking's own lock is released before `VisitRecorder` runs (it runs after the booking is
  written).
- The public widget, online payments and the full admin's screens are unchanged (R7-2; owner 2026-10-21).
- The mobile apps are compiled bundles in `public/app` and `public/staff` (their source is not in this repository):
  stamps and credit are visible in the portal and the workspace; the member API endpoints are there for the app's next
  build.
- Every workspace write is idempotent the workspace's way (as Award and Redeem, `PointsController::key()`): a body
  field `idempotency_key`, kept per organisation and member (the `Idempotency-Key` header is accepted when the body has
  none); a replay writes nothing new and answers the first result.
- Every new table with a member column goes into `MemberMergeService::MEMBER_COLUMNS`; every string in five
  locales; new SQL runs on PostgreSQL and SQLite; migrations add tables and nullable or defaulted columns only.

## 6. Rollout

One deploy by the source-patch recipe after the owner's word. After it, existing venues see the wizard banner (their
tiers and rewards kept); stamps, check-in, desk earn and cashback start off; referrals switch to "first visit" for new
sign-ups (pending referrals from before are already rewarded).
