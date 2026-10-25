# HexaTech Loyalty, release 8 — membership for every industry: places, valid-until, events, tier progress (design)

Status: owner's request of 2026-10-25 ("focus only on the web … in general loyalty, not only the hotel industry … on
location when they scan the card with QR or NFC, the member and what kind of benefits these members have and do they
have access … different levels of members with different tiers … check out for this event, and this could give you in
the future some benefits … very important so it will be easy to configure … focus also on interface … easy, nice,
well designed when I scan this member on the place"). Owner's choices the same day:

- **R8-1 Places admit chosen tiers.** A venue adds its places (Main entrance, VIP lounge, Spa…) and ticks which tiers
  may enter each. A switched-off, deleted or expired member is refused everywhere. The scan answers with a big green
  "Welcome" or red "No access" and the reason, with the member's benefits.
- **R8-2 Optional end date.** Staff set or extend a membership's "valid until" when a member buys or renews at the desk.
  After it the scan says "Membership expired" and refuses entry; points and history stay. No date: never expires.
- **R8-3 Events.** A venue creates an event and scans members in on the day. Attending gives points, counts as a visit
  (a stamp, and tier progress by visits), an event can be for chosen tiers only, and members sign up in the portal.
- **R8-4 The venue chooses how members move between tiers:** by points (as now), visits or spend; staff can still set a
  tier by hand.

Web only (the workspace and the portal); the mobile apps are compiled bundles whose source is not here. Words are
industry-neutral ("visit", "place", "member"): a gym, a club, a salon, a venue running events and a hotel must all read
naturally.

What exists (2026-10-25): tiers with benefits (`TierBenefit` → `BenefitDefinition`, a category `access` among others),
manual tier changes with a "keep until" date, Scan (QR, NFC, USB reader, camera, typed number; the result card shows
the member, tier, benefits, requests, Award/Redeem, release 7's Check in / Add a purchase and credit), stamps and
visits (`VisitRecorder`), tier counters for nights/stays/spend that only members judged on those move with (and
nothing sets a member's judging model). No places, no membership end date, no events.

## 1. Places and access (part A)

**Tables** (new): `access_places` — id, organization_id, name (≤ 80), description (≤ 300, nullable), `admits`
(`all` | `tiers`), sort_order, is_active, timestamps; `access_place_tiers` — access_place_id, tier_id, unique pair.
`scan_events` gains nullable `access_place_id` and `loyalty_event_id` (an entry or a check-in is a scan event).

**The one decider:** `App\Services\Loyalty\Access\AccessDecision::decide(LoyaltyMember $m, ?AccessPlace $place,
?LoyaltyEvent $event = null): AccessVerdict` — pure reads, no writes. In order, the first that applies:

| Reason | Granted | When |
|---|---|---|
| `member_erased` | no | deleted (staff's erasure or the member's own) |
| `member_off` | no | switched off (`is_active` false) |
| `expired` | no | `membership_valid_until` is before the venue's today |
| `place_off` | no | the place is switched off |
| `tier_not_allowed` | no | the place (or event) admits chosen tiers and the member's tier is not one |
| `event_not_open` | no | an event that is not published, cancelled, or not open now (from 2 hours before its start to its end, on the venue's clock) |
| `event_full` | no | a capacity reached by those checked in, and this member is not signed up |
| `not_signed_up` | no | an event with sign-up whose walk-ins are off, and this member did not sign up |
| `welcome` | yes | everything else |

`AccessVerdict` = `{ granted, reason, valid_until (Y-m-d|null), expires_in_days (int|null, when ≤ 14), tier
{id,name,color}|null, allowed_tiers [names] (when tier_not_allowed) }`. Desk mode (no place, no event) never decides.

**Scan** (`POST /v1/admin/loyalty/scan`, existing): body `{ code, place_id?, event_id?, idempotency_key? }`.

- Without a place or event: as today (`{ member }`).
- With a place: the code is read as today; a member found is decided (`AccessDecision`) — a switched-off member is no
  longer a `inactive` refusal here but a red verdict with the member shown. A `scan_events` row is written
  (`scan_type access`, `access_place_id`, `result granted|denied`, `action_taken` = the reason). Answer
  `{ member, verdict: AccessVerdict + { place: {id,name}, entry_id }, benefits: [{name, value, category}] }`. A code
  that names nobody keeps its refusal (`not_found`, `expired`, `revoked`, `used_up`) and is logged as `denied`.
- With an event: delegated to part E's `EventCheckIn::checkIn()` (§4); the answer adds `event {id,title}`,
  `checked_in` (bool), `already_in` (time) and `signed_up` (bool), `points` (given now).
- A replay with the same `idempotency_key` answers the first result without a second entry.

**Entries:** `GET places/{id}/entries?day=Y-m-d` — that venue day's scans at the place (time on the venue's clock,
member, granted/denied, reason, staff), newest first, 50 a page; and `today` counts in the places list.

**Setup (easy):** a **Places** tab on Program (beside Tiers and Benefits): each place a card — name, "Who may enter":
*Every member* or tick tiers (the tiers as coloured chips), switched on/off, today's entries count, Edit; Add a place
(a dialog with the same three fields). A tier card on the Tiers tab shows "Can enter: Main entrance, Spa" (read from
the places — one source). Read: every active staff member; changes: managers. AccessMap:
`admin/loyalty/places` → `['staff', 'manager', 'loyalty']`.

## 2. The scan screen (part D)

One page, `/loyalty/scan`, rebuilt around a **"Scanning for"** choice at the top, remembered on the device
(`localStorage` `loyalty:scan-context`): **Desk** (look up a member and act — today's behaviour), each active
**place**, and each **event** open now or later today. Changing it is one tap.

- **The verdict** (place or event): a full-width band — green ✓ "Welcome, Ada" / red ✕ "No access" with the reason
  in words ("Membership expired on 3 Oct", "Gold and Platinum only — Ada is Silver", "Switched off", "Not signed up")
  / amber when granted with a warning ("Membership ends in 5 days"). Then the member: name, tier chip in the tier's
  colour, member number, valid until; the tier's benefits as chips; for an event "Signed up" or "Walk-in", "Already
  checked in at 19:02", "+50 points". Announced to screen readers (`aria-live`), never by colour alone (icon + words).
- **Desk** keeps the release 5–7 card (Award, Redeem, Check in, Add a purchase, credit), with the member's validity and
  tier shown the same way.
- **Door mode** (`/loyalty/scan/door`): for a tablet at an entrance — full screen, no menus, the chosen place or event
  in the corner, the camera scanning continuously (or the NFC / USB reader / keyboard reader), a huge verdict that
  clears itself after 4 seconds ("Ready — scan the next member"), an optional two-tone sound (on/off, remembered), and
  Exit (with a confirm). Works in portrait and landscape at tablet and phone sizes.
- **Today at this place / event**: the last entries under the scanner (from the entries endpoint or the event's
  people), so staff see who came in.
- Pure decisions (which band, which sentence, which buttons, when to clear) in `scan/verdict.ts`, tested by value.

## 3. Membership validity and tier progress (part M)

**Valid until** — `loyalty_members.membership_valid_until` (date, nullable).

- Set by a manager on a member's page (a **Membership** card: "Valid until 3 Oct 2027" or "No end date"; **Extend** by
  1 month / 3 months / 6 months / 1 year from the later of today and the current end, **Set a date**, **Remove the end
  date**), at enrolment (Add member: optional), and by import (column `valid_until`). Writes go through
  `App\Services\Loyalty\Members\MembershipValidity` (audited `member.validity_changed` with old and new); AccessMap
  `admin/loyalty/members/{id}/validity` → `['manager', 'manager', 'loyalty']`.
- The member row answers `valid_until` and `membership_state`: `active` | `expiring` (≤ 30 days) | `expired` | `off`.
  The members list gets the states **Expiring soon** and **Expired** (filters and the numbers line).
- Portal: the membership card shows "Member until 3 Oct 2027", or "Your membership ended on 3 Oct — ask the team to
  renew" (still able to sign in, see points and history).
- Reminder: `php artisan loyalty:membership-reminders` (daily) keeps an inbox message and a push ("Your membership ends
  on {date}") 14 days before the end, once per end date (`membership_reminded_for` date on the member).
- An expired member keeps earning and spending as a member at the desk (staff decide); only access (§1) refuses.

**Tier progress** — a new option `tier_progress_by` (`points` | `visits` | `spend`, default `points`) through
`ProgrammeOptions`, a card on Ways to earn ("How members move up": the three choices with a sentence each).

- `loyalty_tiers.min_visits` (int, nullable) and `loyalty_members.qualifying_visits` (int, default 0); release 7's
  `tier_qualification_counts` gains `visits` and `venue_day`. A visit counts once per member per venue day (any source:
  appointment, stay, check-in, purchase, event) through `TierCounters` → `LoyaltyService`; a reversal takes it back.
- `assessTier()` judges every member by the programme's option (the member column `tier_qualification_model` is no
  longer read); `visits` compares `qualifying_visits` with `min_visits`, `spend` `qualifying_spend` with `min_spend`;
  the existing window, grace, lock and soft-landing rules apply as they do to points. A manual tier ("keep until")
  still wins until its date.
- Program's tier form shows the floor of the chosen measure ("Visits to reach this tier", "Spend to reach this tier"),
  the others hidden; progress everywhere (workspace member page and Scan, portal Home) reads "3 more visits to Gold" /
  "€120 more to Gold" from the server.
- Two presets for general memberships: **Members' club** (tiers by visits, places Main entrance and Lounge) and
  **Events & community** (tiers by visits, events, stamps), offered in the setup wizard.

## 4. Events (part E)

**Tables:** `loyalty_events` — id, organization_id, title (≤ 120), description (text), `starts_at`, `ends_at` (the
venue's wall clock, stored as written — never converted), `access_place_id` (nullable, where) or `location` (≤ 200),
`points` (int ≥ 0), `counts_as_visit` (bool, default true), `admits` (`all` | `tiers`) + `loyalty_event_tiers`,
`sign_up` (bool: members sign up in the portal), `walk_ins` (bool, default true), `capacity` (int, nullable),
`status` (`draft` | `published` | `cancelled`), created_by, timestamps.
`loyalty_event_registrations` — id, organization_id, event_id, member_id, status (`signed_up` | `cancelled`),
source (`portal` | `staff`), signed_up_at, cancelled_at; unique (event_id, member_id).
`loyalty_event_attendances` — id, organization_id, event_id, member_id, checked_in_at, checked_in_by, walk_in,
scan_event_id, points_transaction_id; unique (event_id, member_id).

**Check-in** (`App\Services\Loyalty\Events\EventCheckIn::checkIn(LoyaltyEvent, LoyaltyMember, User, ?string $key)`):
`AccessDecision` first; granted → one attendance per member per event (a second scan answers `already_in` with the
time, granted, nothing new), the event's points (`awardPoints` type `bonus`, key `event_{event}_{member}`, not
qualifying), then — after the commit — `VisitRecorder::record()` with `Visit::EVENT` (reference
`loyalty_event_attendance` + id, the event's venue day) when the event counts as a visit. Capacity counts attendances;
a signed-up member always gets in. Every active staff member may check in (the points are the manager's choice on the
event). AccessMap `admin/loyalty/events/{id}/check-in` → `['staff', 'staff', 'loyalty']`.

**Sign-up** (`App\Services\Loyalty\Events\EventSignUp`): a published, not-yet-ended event with sign-up, the member's
tier admitted, room left (sign-ups + walk-ins below capacity), one per member (a cancelled sign-up can sign up again);
cancel until the start. Staff may sign a member up or cancel from the event's page.

**Workspace:** an **Events** area (menu, after Rewards): Upcoming / Past / Drafts; **New event** (one dialog: title,
when — date, start and end time —, where — a place or a written location —, who — every member or tiers —, points,
counts as a visit, sign-up in the portal and capacity, walk-ins; Save as draft / Publish); an event's page: the numbers
(signed up, checked in, room left), the people (signed up, checked in, walk-ins, with times), **Start check-in** (opens
Scan with this event chosen), add a member, cancel the event (signed-up members get an inbox message and a push).
Managers and `can_manage_offers` create and change events (AccessMap `admin/loyalty/events` →
`['staff', 'can_manage_offers', 'loyalty']`).

**Portal:** an **Events** page (`/portal/events`, in the menu when the venue has a published upcoming event the member
may attend): upcoming events open to the member's tier — when, where, points, "Sign up" / "You're signed up · Cancel",
"Full"; past events the member attended. Home shows the next event the member signed up for. Member endpoints
`GET member/portal/events`, `POST member/portal/events/{id}/sign-up`, `DELETE member/portal/events/{id}/sign-up`.

## 5. Rules for every part

- One writer each: places only through `Access\AccessPlaces`, access decided only by `AccessDecision`, validity only by
  `Members\MembershipValidity`, events through `Events\*` (`EventCheckIn`, `EventSignUp`, `EventEditor`), points only by
  `LoyaltyService`, a visit's effects only by `VisitRecorder`, options only by `ProgrammeOptions`.
- Every id a request names is this organisation's (a place's tiers, an event's place and tiers, a member).
- Event times are the venue's wall clock (`YYYY-MM-DDTHH:mm`), never passed to `new Date()` and never converted on the
  server (as appointment times).
- Workspace writes take an `idempotency_key` as release 7's do; a check-in replay writes nothing new.
- New tables with a member column go into `MemberMergeService::MEMBER_COLUMNS` (event registrations and attendances —
  a merge keeps one per event); new SQL runs on PostgreSQL and SQLite; migrations add tables and nullable or
  defaulted columns only; every string in five locales; the full admin's screens, the public widget and online
  payments are unchanged.

## 6. Rollout

One deploy by the source-patch recipe after the owner's word. Nothing changes for members until a venue adds a place,
an end date or an event, or switches tier progress to visits or spend (default points, as today).
