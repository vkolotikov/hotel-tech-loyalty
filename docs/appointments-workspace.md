# Appointments workspace — runbook

A calendar-first staff workspace at `/appointments`, beside the full admin. It is a second shell over the same
records: `service_bookings`, `guests`, `loyalty_members`, the points ledger. Nothing is copied or synchronised.
Design: `docs/superpowers/specs/2026-09-30-appointments-workspace-design.md`.

## Who has it, and the two ways in

**Every organisation has the workspace**, existing and new, unless an operator switched it off (the owner's
decision of 2026-10-01; until then it was opt-in). Signing in still opens the full admin. Staff choose which
interface to use:

- **Into the workspace:** the full admin's menu has **HexaTech Appointments** in the Bookings group, under
  Services, and the Service bookings list and calendar pages have an **Open in HexaTech Appointments** button.
  Both show wherever the organisation has the workspace, with or without services yet; the address
  `/appointments` itself works for every organisation that has it. They follow the server, not the session: the
  full admin reads `/v1/auth/me` when it loads (2026-10-07), so a sign-in older than the workspace shows them too.
- **Back to the full admin:** **Full admin** in the workspace opens the same tool there — the calendar opens the
  Service bookings calendar, Clients opens the customer list, anything else the dashboard.

**On the Appointments plan** (Part C) the workspace is all an organisation has: its staff sign in to it, and it has
no way into the full admin. See "Selling Appointments on its own".

## Switching it on and off

Every artisan command below is run as `php artisan …` in the application's environment.

| To | Run |
|---|---|
| Switch it off for one organisation | `php artisan workspace:appointments <org id> --off` |
| Switch it back on (the default) | `php artisan workspace:appointments <org id> --on` |
| Also land that organisation's staff on it after sign-in | `php artisan workspace:appointments <org id> --on --landing` |
| See one organisation's setting | `php artisan workspace:appointments <org id> --status` |
| List the organisations that differ from the default (off, landing on the workspace, or marked) | `php artisan workspace:appointments --list` |
| Mark one appointments-only (says what stops, asks first) | `php artisan workspace:appointments <org id> --only` |
| Mark it a full customer whatever billing says | `php artisan workspace:appointments <org id> --not-only` |
| Let billing decide again | `php artisan workspace:appointments <org id> --plan-decides` |

`--off` is refused while an organisation is appointments-only.

The switch is `organizations.settings.workspaces.appointments`; nothing stored means on, landing on the full
admin (`Organization::WORKSPACE_DEFAULTS`). No screen and no billing sync writes that column.

**Off means:** the workspace's API answers 403, `/appointments` sends staff back to the full admin, sign-in lands
on the dashboard. A workspace window that is open at that moment says so on its next refresh or save and offers
the full admin. No data is deleted. Switching it off does **not** undo a booking, a status change or a points
award made while it was on.

## What it needs before it is useful

At least one active service, a team member who performs it, that team member's weekly working hours, and the
venue's time zone as a **name** (e.g. `Europe/London`; `UTC`, `EET` or `+03:00` leave the workspace on UTC). The
workspace's **Setup** walks a new venue through exactly these, as a checklist that also shows (optionally) sharing
the online booking link and the first appointment. Until it is done, the calendar shows one banner leading to Setup.
The full admin's own screens still edit the same records.

## Setup (Part B, 2026-10-01)

**Who may change what.** Owners and managers (`staff.role` `super_admin` or `manager` in this organisation) change
services, team, hours, time off and settings. Everyone else sees Setup read-only and may add or remove time off
only for the team member linked to their own sign-in (Team → Profile → "Signs in as"). The server decides
(`App\Services\Appointments\Setup\SetupAccess`) and answers `403 not_allowed`; the screens only mirror it.

**Endpoints** (`/v1/admin/appointments/setup/…`, behind the workspace switch): `GET setup` (everything in one read,
including the checklist), `POST setup/services`, `PATCH setup/services/{id}`, `POST setup/categories`,
`POST setup/team`, `PATCH setup/team/{id}`, `PUT setup/team/{id}/hours`, `POST` / `DELETE setup/team/{id}/time-off`,
`PATCH setup/settings`, `POST setup/checklist/link-copied`.

**Warn, list, still allow.** Every save that can leave upcoming appointments outside someone's hours (a new week,
time off, deactivating a person or a service, taking a service off a person) takes `?dry_run=1`. The workspace asks
that first and shows the appointments before saving; nothing is moved, cancelled or messaged, and the save answers
with the same list. `App\Services\Booking\Setup\AppointmentImpact` decides what counts.

**Where each setting lives.** Time zone `hotel_timezone`; currency `services_currency` and
`organizations.currency`, and every service's and extra's own `currency` (relabelled, never converted; bookings keep
theirs); notice `services_lead_minutes`; slot step `services_slot_step`; how far ahead `services_max_advance_days`;
"clients may choose the person" `services_allow_master_choice`; points `points_on_bookings`; the checklist's "link
shared" mark `appointments_link_copied_at`. The widget, the portal and the full admin read the same keys.

**Never deleted.** The workspace deactivates services and team members; history stays. Photos, gallery, tags and
the long description stay in the full admin and are never touched by a workspace save.

**Hours.** One rule for both interfaces (`App\Services\Booking\Setup\WeeklyHours`): `HH:MM` from 00:00 to 24:00,
the end after the start, no overlapping windows in a day, at most six a day, no overnight windows. The full admin's
team save refuses anything else with a 422. A workspace save writes the whole week and drops rows the full admin
had switched off (they had no effect). When a venue says "the hours are wrong", read `service_master_schedules`
(`day_of_week` 0 = Sunday) and `service_master_time_off` (one row per day; no times = all day).

**The widgets' notice.** The public and chat widgets offer today's slots from the venue's own now
(`App\Services\Booking\VenueNotice`, the portal's method); before, east of UTC they offered times already past. The
extras' notice counts from the venue's now in `ServiceQuoteBuilder`, which corrects the portal's extras check too.

## What each action really does

| Action | Writes | Does not do |
|---|---|---|
| Add a client | A client record (the full admin's Customers). With an email address and an active programme, the client is enrolled as a member by the same hook every other entry point uses. | Send a welcome or any other message. Merge with an existing client (a likely duplicate is shown to choose from). |
| Book | A confirmed, unpaid service booking linked to the client and, for a member, the member, at the member price with the coupon chosen (Part E). Emails the client "Booked" when "Tell the client" is ticked (Part D). | Give a staff discount. Save at a price staff did not see (a changed price answers "check it and save again"). |
| Move | The time and the team member; the duration follows the new team member's own, unless staff set a length (kept). Reference, service, price and payment are kept. Emails "New time" when ticked and the time or the person changed. Also by dragging the card (a confirm first) and with a Length (Part F). | — |
| Length (drag the bottom edge, or the Move form's Length) | The booking's own length, 15 minutes to 8 hours in 15-minute steps, kept by later moves until changed or set back to normal. The price never changes; the client is not emailed. | Stretch past the person's working hours or into the next appointment. |
| Reopen (managers) | Status `confirmed` again, from completed, no-show or cancelled, when no money and no coupon went back and its time is free; points earned stay (never twice); a reopened cancellation still ahead can email "Confirmed". | Reopen after a refund or a portal cancellation that gave the coupon back (book again instead). Check working hours or "a day that has passed". |
| Confirm (a pending request) | Status `confirmed`. Emails "Confirmed" when ticked. | — But the capture job will now charge a held card within about 10 minutes (see "Card holds" below for a hold older than six days). |
| Arrived | Status `in_progress`. | — |
| Complete | Status `completed`, then the programme's points for a member, once. | Take a payment. |
| No-show | Status `no_show`. The capture job releases a held card. | Charge a no-show fee. Refund a captured payment. |
| Cancel | Status `cancelled`, the time and the reason. The capture job releases a held card. Emails "Cancelled" when ticked (never the staff's reason). A manager refunds in the same step (Stripe first; a failed refund leaves the appointment standing). | Refund when a non-manager cancels (the panel says a manager can refund it). Return a coupon. |
| Take payment | A ledger row (amount, method, who, when); the label follows what is owed. | Take more than is owed, or take while a card is held online. |
| Refund (managers) | Card through Stripe (exact amount, idempotent) or money back at the desk, with a reason; a full refund takes the visit's points back. Or a correction of a wrong desk entry ("Entered by mistake"): the money is owed again and the points stay. | Refund more than came in that way. Make money owed again with a goodwill refund. |
| Award points | Runs the points award again for a completed visit whose award did not happen. | Award twice (the ledger key and the stamp on the booking prevent it). |

`completed`, `cancelled` and `no_show` are final in the workspace.

**Card holds.** The capture job (`bookings:capture-pending-pis`) visits a booking's card hold for six days after
the booking was made (`AppointmentActions::HOLD_SWEEP_DAYS`, pinned to the job by a test). Inside that time it
charges the hold once the booking is no longer `pending`, and releases it when the booking is `cancelled` or
`no_show`. An older hold is visited by nothing: it is neither charged nor released and lapses at Stripe on its
own — the panel says "too old to charge" instead of promising either. The job writes
`service_booking.capture.needs_refund` to the audit log only in one case: a cancelled or no-show booking still
marked as held whose payment Stripe had in fact already taken. A booking already marked `paid` is never visited.

## Putting a mistake right

- **Cancelled, marked no-show or completed by mistake:** a manager uses Reopen in the workspace (Part F); it checks
  the time is still free and refuses a visit whose money or coupon went back. The full admin's status change still
  works, without those checks.
- **Completed by mistake, and the points should go:** the points are reversed in the full admin (the member's page →
  points history → reverse). The booking stays stamped as awarded, so completing it again does not award twice.
- **Booked for the wrong client:** cancel it and book again. A booking's client is not editable.
- Every workspace action leaves an audit row with the staff user and the booking (Audit log, actions
  `service_booking.*`).

## Rules the code keeps (and the tests that keep them)

- One scheduler. Create and move call `ServiceSchedulingService::reserveSlot()` inside the per-person advisory lock
  `svcm:{master}` — the same lock the widget, the portal, the chat and the full admin take. `reserveSlot()` locks
  every candidate before checking any, so an "any team member" booking cannot take a person a named booking is
  taking (`tests/Unit/Appointments/SchedulerCandidateLockTest.php`; live: the race probe in the plan's Task 21).
- One points worker. Only `BookingPointsService::awardForServiceBooking()` awards; the panel's "Completing awards
  N points" is `previewForServiceBooking()`, the same predicates (`tests/Feature/Appointments/PointsPreviewTest.php`).
- Times are the venue's wall clock, sent and received as `YYYY-MM-DDTHH:mm`. The frontend never builds a `Date`
  from one (`frontend/src/appointments/lib/wallClock.ts`). The full admin's service-booking list, its calendar,
  the unified `/calendar` and the dashboard read the same times through `frontend/src/lib/venueTime.ts`
  (page tests `*.venueTime.test.tsx` run with the clock set to Riga).
- A retry with the same `Idempotency-Key` and body answers with the first booking; a save against an older
  `revision` answers `409 stale` with the current appointment.
- `frontend/src/appointments/` uses only `a-*` tokens and only `/v1/admin/appointments/…`
  (`frontend/src/appointments/tokens.test.ts`); every string is in five locales.
- The grid offers a free half hour only where it can be seen and clicked: not under a live or completed
  appointment; a cancelled or no-show card stands aside for it. What the grid offers is a convenience — the server
  decides at save (`frontend/src/appointments/calendar/calendar.test.tsx`).
- A status is an icon and a word; a card too narrow for both keeps the icon and carries the word in its name.
  Nothing is smaller than 12 px, and no card is faded (`theme/contrast.test.ts` pins every text pair at 4.5:1).

## How it was checked for keyboard and screen-reader use

A pass by hand and with Lighthouse on 2026-09-30 (target WCAG 2.2 AA, **no conformance claimed**): keyboard-only
booking, moving and cancelling; visible focus on the rail, the grid, the panel and the month; names and roles;
1440, 1280, 1024 and 200 % zoom. Lighthouse accessibility was 100 on the calendar, the calendar with the panel
open, and the client search. Known limits: the month has one tab stop per day — the List view is the short way
round; since Part F the grid is one tab stop with arrow keys (`calendar/gridFocus.ts`); focus handling has no
automated test beyond the focus rules themselves, because the frontend tests render to a string.

## Where it differs from the full admin's screens

- Both interfaces show every appointment time on the **venue's** clock (the full admin's service-booking screens
  since Part A, `frontend/src/lib/venueTime.ts`). Nothing is converted on save.
- A booking typed into the full admin with only a name has no client record: the workspace shows it, says it is
  not linked, and client search does not find that person.

## What this milestone does not do

Photos for services and team members (full admin); service extras and category colours and order
(full admin); SMS or any channel but email for client messages (Part D); rooms and resources (the engine has none for
services; a later part); no-show and late-cancel fees, tips, receipts; drag to create an appointment, Undo after a
saved drag, a length that changes the price, stretching past working hours (Part F).

## Insights (Part G, 2026-10-06)

Managers (and owners) see **Insights** beside Takings: how the venue did over This week, Last week, This month, Last
month or chosen dates (up to a year), next to the period before. That is the month before for a calendar month, and
the same number of days before for anything else. The period is in the address, so it can be bookmarked or sent.
Staff do not see the item, and the server answers them 403 `not_allowed`.

Every appointment whose start falls on one of the period's venue days is in exactly one group, by what it is now:

| Group | Rule |
|---|---|
| Done | Completed |
| No-show | No-show |
| Not marked yet | still awaiting, confirmed or in progress after its start |
| Cancelled late | cancelled after the free-cancellation deadline: start − Settings "Free cancellation window for appointments", default 24 h, counted in real hours; the member portal's deadline |
| Cancelled in time | cancelled before that deadline, or with no time recorded |
| Booked ahead | still to come |

- **Bookings due** = done + no-show + not marked yet + cancelled late. Every rate is out of bookings due, so the four
  add up to 100%; "—" when nothing was due.
- **Money** is per currency, by Part E's own rules for each appointment (the panel's money):
  - value of visits done (after discounts) and the average per visit;
  - money taken for the period's visits whenever paid (Takings shows money by the day it moved);
  - still owed for visits done.
- **Before 5 Oct 2026** desk payments were not recorded: the screen says so for periods starting earlier.
- **Rows by service and by person:** "No one assigned" holds appointments with no team member; a deleted record shows
  "(removed)".
- **Where bookings come from:**
  - at the desk = staff, phone, walk-in;
  - online = every other source (booking page and its tags, member portal, chat);
  - other = none recorded.
- **Scope:** the whole organisation, every brand, as on Takings.
- **Nothing is cached:** a period of a year is a fixed handful of queries.

Endpoint: `GET /v1/admin/appointments/insights?from=YYYY-MM-DD&to=YYYY-MM-DD` (422 `invalid_period` beyond 366 days
or From after To). Code: `App\Services\Appointments\Insights\{VisitGroup, InsightsPeriod, InsightsReport}`,
`AppointmentMoney::amountsFrom()`, `frontend/src/appointments/insights/`. Tests: `tests/Unit/Appointments/{VisitGroupTest,
InsightsPeriodTest}.php`, `tests/Feature/Appointments/InsightsTest.php`, `insightsMath.test.ts`, `insights.test.tsx`.
No migration.

## Selling Appointments on its own (Part C, 2026-10-02)

An organisation on the **Appointments plan** has the workspace and the public booking page, and nothing else:

- its staff sign in straight to the workspace, and every full-admin address sends them back to it;
- every other admin endpoint answers 403 `not_in_plan`: billing self-service, the industry switch, lead intake
  with an API token and the ChatGPT / Claude connector included;
- loyalty is off whatever tiers exist: no member portal, no points, no member pricing, no loyalty card in the
  workspace; a new client (from the widget or the desk) is not made a member, and member sign-up is refused;
- the public booking page and the widgets are unchanged.

**Who is on it** (`Organization::appointmentsOnly()`), in this order:

1. an operator's mark (`--only`, `--not-only`);
2. billing's products: `appointments` and nothing outside `appointments` and `booking`;
3. when billing sent no products, the plan slug `appointments`.

| To | Run |
|---|---|
| Mark an organisation appointments-only (it says what stops and asks first) | `php artisan workspace:appointments <org id> --only` (add `--force` to skip the question) |
| Mark it a full customer whatever billing says | `php artisan workspace:appointments <org id> --not-only` |
| Let billing decide again | `php artisan workspace:appointments <org id> --plan-decides` |
| See who is on it and why | `--status` for one organisation, `--list` for all that differ from the default |

**Billing handover (the owner, in the billing application):**

- a product with slug `appointments`;
- a plan "Appointments" (slug `appointments`) with products `appointments` and `booking`, and its price, trial and
  limits;
- the sign-up page lists the plan as soon as billing does;
- moving an existing customer onto it closes their full admin and stops their loyalty within 5 minutes, or at once
  through the entitlement webhook;
- when billing cannot be reached, the plan's fallback products are `appointments` and `booking`.

**Not on the plan yet:** editing service photos, the gallery and the long description (full admin only); billing
self-service (plan and payment changes go through HexaTech).

## Admin access map (every organisation)

`App\Support\AdminAccess\AccessMap` says who may call each staff route. Each key is a URI template without
`api/v1/`, matched on whole segments, and the longest key wins. A key gives:

- a **read** rule (GET, HEAD) and a **change** rule (other methods): `staff`, `manager` (`super_admin` or
  `manager`), or a capability (`can_view_analytics`, `can_manage_offers`: managers and flagged staff);
- a **product**: the Appointments plan reaches `appointments` and `account` only.

The middleware `admin.access` runs on every `/v1/admin` route (after `admin`, before `check.subscription`) and on
billing, the industry switch, lead intake and the connector. A platform admin always passes. The route's own checks
(`staff.can`, `feature`, `workspace`, `admin:super_admin`, Setup's manager rule) still apply after it.

| `ADMIN_ACCESS_MODE` (Laravel Cloud) | Roles and deactivated accounts | The Appointments plan's lock |
|---|---|---|
| unset, or anything but `enforce` (report) | recorded, let through | refused (`not_in_plan`) |
| `enforce` | refused (`not_allowed`, `staff_inactive`) | refused |

**Before switching to enforce:**

- run `php artisan admin-access:report --days=7` (add `--org=<id>` for one organisation);
- every "would refuse" line that a real page needs becomes a map fix with its test, shipped first;
- then set `ADMIN_ACCESS_MODE=enforce` in Laravel Cloud;
- removing it, or setting `report`, undoes it.

The record (`admin_access_refusals`) keeps who, which organisation, which rule, which method and why, per day, and
never a request's contents.

**A new admin route** needs a key in `AccessMap::MAP`, mirroring the menu's gate for its page.
`tests/Feature/AdminAccess/AccessMapTest.php` and `AdminAccessWiringTest.php` fail the build without one.

## Client messages (Part D, 2026-10-05)

Off for every organisation until a manager switches it on in Setup → Settings → Client messages:

| Setting | Values | Default |
|---|---|---|
| Email clients about changes staff make | on / off (staff can untick the box each time) | off |
| Reminder before each visit | off, 2, 24 or 48 hours before | off |
| Language when the client's is not known | English, Русский, Deutsch, Français, Español | English |

**What is sent:**

| Message | When | Sent by |
|---|---|---|
| Booked | staff create an appointment | workspace New appointment; full admin create |
| Moved | staff change its time or person | workspace Move |
| Confirmed | staff confirm a pending appointment | workspace Confirm; full admin status change, bulk "mark status" |
| Cancelled | staff cancel it | workspace Cancel; full admin status change, delete, bulk cancel |
| Reminder | before every upcoming confirmed or pending appointment | `appointments:send-reminders`, every 5 minutes |

**Who receives it, and in which language:**

- The booking's email, else the client record's email.
- The member's app language, else the client record's "Language" (a code or a name), else the venue's setting.
- Dates and times are on the venue's clock. Replies go to the venue.

**What staff see.** Every appointment shows its "Messages": sent, or why not. The reasons:

- staff chose not to tell the client;
- no email address;
- the address does not accept our emails (suppression list);
- the appointment changed before the email left;
- the email could not be sent (tried once; never retried behind staff's back).

**The reminder:**

- It goes once per appointment time, in the 30 minutes after its moment (start minus the venue's hours).
- None goes to an appointment booked or moved after that moment, or to a cancelled one.
- A longer outage skips reminders rather than sending them late.

**Not covered:** the widget's and the portal's own emails stay as they were (English) and are not listed on the
appointment. A no-show tells nobody.

Code: `App\Services\Appointments\Messages\{MessageSettings, MessageRecipient, MessageLocale, ClientMessenger}`,
`App\Jobs\DeliverClientMessage`, `App\Mail\AppointmentMessageMail` (words in `lang/*/client_messages.php`),
`appointments:send-reminders`; tests in `tests/Feature/Appointments/Messages/`.

## Money at the desk (Part E, 2026-10-06)

Every appointment shows its **Money**: the price (list, member discount, coupon), what was paid online and at the
desk, what was given back, what is still owed, and each movement with who and when.

**Methods** at the desk: cash, card at the desk, bank transfer, other (with a note). A card refund made here goes
through Stripe ("online card").

**Who may do what:**

| | Staff | Managers |
|---|---|---|
| Take payment | yes | yes |
| Refund, alone or while cancelling | no (Cancel says a manager can refund it) | yes, with a reason |
| Takings | no (no menu item) | yes |

**What is owed** = the total − a card held online − paid online − paid at the desk, never below zero. A refund (money
given back as goodwill) never makes money owed again. A desk payment entered wrongly — the wrong method or amount — is
undone with Refund and "Entered by mistake — the client still owes this": that correction re-opens what it covered,
keeps the visit's points, shows as "Correction" (money out of that method in Takings), and the right payment is then
taken. Only money entered here can be corrected, never a card refund or a booking marked paid before Part E. A
cancelled or no-show appointment owes nothing; it shows what can still be given back instead.

**Card bookings paid at the desk.** A booking whose online card hold was released, failed or is older than the capture
job's six days (`AppointmentActions::HOLD_SWEEP_DAYS`, so nothing will charge it) can be paid at the desk. Its money is
desk money only: never counted, shown or refunded as a card payment (`AppointmentMoney::cardPaid()`; the booking's
`meta.paid_at_desk` tells the screens that read the label without the ledger).

**The label** (`payment_status`) follows the money and nobody types it:

- while a card is held online, the label is left to the card (`authorized`/`pending`), and nothing can be taken;
- nothing paid: `unpaid`; part paid and something still owed: `unpaid`; all paid: `paid`;
- some of it given back: `partially_refunded`; all of it given back: `refunded`.

A booking "marked paid" before Part E (no card, no ledger row, label `paid`) counts as paid in full at the desk, so it
can still be refunded at the desk.

**Cancel with refund.** For a manager, Cancel fills in what can be given back, editable. Every line is checked against
what came in that way before any is made; the desk lines are recorded first and the card refund goes to Stripe last,
inside the same step. If Stripe refuses, nothing changes and the appointment stays as it was. Each refund's reason is
the cancellation reason, else "Appointment cancelled".

**Card refunds and Stripe.** The idempotency key is `appt-refund-{booking}-{cents refunded before}-{cents now}`: a
retry after an answer that never came back (Stripe refunded, the step rolled back) gets the same refund, not a second
one. A retry of a refund Stripe really declined meets that saved answer for 24 hours; a different amount, or the
desk, goes through.

**Points.** When everything paid has been given back and the visit had earned points, the points are reversed through
the programme's own reversal (a `reverse` row pointing at the award).

**Member price and coupons.** A staff booking for a client who is a member of a venue with an active programme gets
the portal's own member price (`MemberPricing`, the same code), and staff can pick one of the member's coupons or type
a code. The panel shows the breakdown before saving; the server prices again inside the slot lock and, if the total
moved, answers `price_changed` with the new figures. The coupon is used in the same transaction as the booking. There
is no staff discount.

**Takings** (managers, menu "Takings"): one venue day. Money in and out per method and currency, every movement with
the appointment, the client and who did it; and, for reference, what that day's appointments were paid online by
card.

**The full admin.** Service bookings' drawer shows Money read-only with a link to the appointment in the workspace.
Its Payment dropdown and bulk "Mark Paid" are gone; its status endpoint refuses `payment_status` (422) and its bulk
endpoint no longer knows `mark_paid`.

Code: `App\Services\Appointments\Money\{AppointmentMoney, StaffPricing, TakingsReport}`,
`App\Models\ServiceBookingPayment`, `Admin\Appointments\{MoneyController, PriceController}`,
`BookingPointsService::reverseForServiceBooking()`; frontend `frontend/src/appointments/panel/{MoneyBlock,
TakePaymentForm, RefundForm}.tsx`, `frontend/src/appointments/takings/`, `frontend/src/components/DeskMoney.tsx`;
tests in `tests/Feature/Appointments/Money/`.

## Calendar power (Part F, 2026-10-05)

**Drag to move.** A pending, confirmed or arrived card is dragged to another time, or to another person (day view) or
day (week view). A mouse or pen drag starts after a few pixels (a click still opens the panel); on a tablet a still
press of 400 ms starts it, so a swipe still scrolls. The card snaps to 15 minutes, the calendar scrolls near its
edges, and Escape puts it back. While dragging, the preview says the new place ("Thu 14:30–15:15 · Anna") or, in the
danger colour, why it will not do: outside the person's hours or on time off, over another live appointment, a person
who does not do the service, a day that has passed. A release there, or at the card's own place, sends nothing.
Otherwise a small box asks "Move Sophie to Thu 14:30 with Anna?" with "Tell the client" (the venue's default) and
Save / Cancel; Save sends the ordinary move request with the card's revision, so a change made meanwhile answers
"Someone else changed this appointment". The box belongs to the day and person it was dropped on: going to another
date or view while it is open closes it, so Save never means a place nobody chose. The grid is drawn from 1024 px up;
below that the calendar is the List view and the Move form is the way to move. Touch drag was checked with Chrome's
touch emulation only — check it on a real iPad (Safari) before relying on it.

**Length.** A card's bottom edge (pointer devices) stretches or shortens the visit in 15-minute steps, 15 minutes to 8
hours; the box asks "Make it 10:00–11:30?" and tells nobody (the start does not change). The Move form's Length field
does the same by click or keyboard, and at phone width. The length is the booking's own from then on
(`meta.length_minutes`): later moves keep it, even to another person, until it is changed or set back to "Normal
length". The move request takes `length` or `normal_length`, and the free-times call takes `length` (so the Move form
offers only starts where it fits); anything outside the rule is 422 `invalid_length`. The price never changes. The
scheduler's `reserveSlot()` and `availableSlots()` take an optional last `$lengthMinutes` that only the workspace
passes.

**Reopen (managers).** A completed, no-show or cancelled visit goes back to confirmed under the person's `svcm:` lock,
unless money went back for it (422 `money_returned` — book it again), the coupon it used went back to the member
(422 `coupon_returned` — a portal cancellation gives it back; a staff one does not), or a live appointment now
overlaps its time (409 `slot_taken`). Working hours and "a day that has passed" are not checked. The cancellation
time and reason are cleared (the audit row `service_booking.reopen` keeps them); points earned stay and are never
awarded twice; a live card hold is charged by the capture job, as on Confirm, and the confirm says so. A reopened
cancellation that is still ahead can email "Confirmed"; one already past tells nobody. Staff see "A manager can
reopen it."

**Arrow keys.** The grid is one tab stop. Up/Down move between the free half hours and appointments of a column,
Left/Right to the same time in the next column that has any, Home/End to the column's first and last; Enter opens
or books. The keys never move an appointment.

Code: `frontend/src/appointments/calendar/{dragMath, useCardDrag, DragPreview, DropConfirm, focusDialog, gridFocus}`,
`frontend/src/appointments/panel/lengths.ts`, `StaffBookingWriter::lengthOrRefuse()`, `AppointmentActionRunner`
(reopen); tests `tests/Feature/Appointments/{SchedulerLengthTest, MoveLengthTest, ReopenTest}.php` and the calendar
and panel tests.

## Deposits for online bookings (Part H, 2026-10-06)

A venue can ask clients who book on its **online booking page** for a card deposit. Member-portal and staff bookings
are unchanged.

**Switching it on.** Workspace → Setup → "Deposits for online bookings": a switch and a percent (1–100; 20% is
proposed). It writes the full admin's own settings (`services_require_deposit`, `services_deposit_percent`), so
Settings → Booking shows the same values. It switches on only when Stripe is connected
(`booking_payment_enabled` and a secret key), test mode is off, and Stripe's currency is the venue's; otherwise
Setup says which is missing. The window is the full admin's `services_cancel_hours` (default 24). The full admin's
old "require deposit" tick did nothing before Part H, so on its own it still does nothing: deposits start only once a
manager switches them on in Setup (which also stamps `services_deposits_since`). After that the full admin's tick
switches them off and on again as usual.

**What the client does.** After their details, the page asks for "a deposit of €12.00 now (20% of €60.00)" with
Stripe's card fields, then "Pay €12.00 and book". The card is held, the booking saved under the scheduler's lock, and
the deposit charged at once. A refused card books nothing; a time taken meanwhile releases the hold ("Your card was
not charged"). Free services and deposits below Stripe's minimum charge in the venue's currency skip the step
(`Deposits::MINIMUMS`: 0.50 in euros or dollars, 0.30 in pounds, 3 in Swedish or Norwegian kronor, 15 in Czech
koruna…). The confirmation screen and email say until when a cancellation gives the deposit back (the venue's clock).
A page opened before deposits were switched on asks the client to reload it.

**What staff see.** The deposit is a ledger payment ("Card, through Stripe", note "Deposit"): Paid online €12.00 ·
Still owed €48.00; Take payment asks for the rest; Takings and Insights count it once. The row says "Deposit paid";
the label stays unpaid until the rest is paid, also after a late cancellation or a no-show.

**Cancelling.** At or before the deadline (the visit's current start minus the hours agreed at booking), the deposit
goes back to the card automatically, whoever cancels: workspace, full admin status change, delete or bulk cancel.
If Stripe refuses, nothing is cancelled (`deposit_refund_failed`); a bulk cancel goes ahead for the others and names
the booking it left. After the deadline, or on a no-show, the venue keeps it; a manager can still refund it as
goodwill (Refund, or the cancel sheet's card line, which starts at 0). In time, a card amount a manager types on the
cancel sheet can add to the deposit but never take from it (one Stripe refund of at least the deposit); late, it is
goodwill as typed. With online payments switched off at the venue, an in-time cancel still goes ahead and the
deposit shows as "to refund" for a manager to give back another way. The client's cancellation email (Part D) says
what happened to the money, the amount written the way the client's language writes it (where the server has PHP's
intl extension; "EUR 12.00" otherwise), and "after it was due to start" when no hours were agreed. A member who
cancels such a booking from the member portal gets the window the booking was made with; the portal shows "Deposit
paid, the rest at the venue" and promises the deposit back. A deposit refunded in the member portal or in the Stripe
dashboard gets its ledger row too, so Takings shows it going out (once, however often Stripe repeats the webhook).
Neither the workspace nor the full admin (status change or bulk) reopens a visit whose money went back: book it
again. Both public booking pages refuse a made-up test-mode payment (`pi_mock_…`) unless the venue is in test mode,
refuse a deposit that no longer applies, and check the client's details before the card is held.

**Behind the scenes.** The capture job finishes a deposit charge that confirm() missed (as a deposit, never "paid"),
releases the hold of a booking cancelled in time, and charges and keeps one cancelled late or a no-show. The orphan
release cancels deposit holds that never became a booking after 45 minutes. At a deposit venue, the chat's booking
card opens the booking page instead of booking.

**Switching it off** stops new deposits; bookings already made keep their terms. No migration. The booking page of a
venue without deposits is byte for byte as before (`tests/Feature/Widget/ServicesWidgetDepositPageTest.php`).

**Owner's first live check:** switch deposits on at your venue, make a small real booking on the booking page, cancel
it in time from the workspace, and see the refund arrive on the card.

## Deploying it

Merging to `main` is a production deploy; it needs the owner's explicit yes and the main-cut source-patch recipe
(`docs/landing-page-builder.md` §6). Part C adds one additive migration (`admin_access_refusals`). What reaches
every organisation:

- the workspace itself, unless the organisation is switched off;
- `ServiceSchedulingService::reserveSlot()` takes each candidate's lock (no request, price, payload, assignment
  order or email changes);
- the full admin's service-booking audit rows gain their actor and their booking;
- sign-in and `/auth/me` carry a `workspaces` key (`landing`, `has_services`) for staff of every organisation that
  has the workspace;
- the full admin's menu item and button into the workspace, where something can be booked;
- (Part B) Setup in the workspace for every organisation's staff, editable by managers;
- (Part B) the full admin's team save refuses malformed hours (422), and its service and team saves accept only
  this organisation's service, team member and category ids;
- (Part B) the full admin's booking settings show a 15-minute slot step when none is stored (display only);
- (Part B) the public and chat widgets offer today's slots from the venue's own now, and an extra's notice counts
  from it in the widget and the portal;
- (Part C) every `/v1/admin` route, billing, the industry switch, lead intake and the connector run the access
  map; in report mode (no `ADMIN_ACCESS_MODE`) it refuses only `not_in_plan`;
- (Part C) sign-in and `/auth/me` carry `workspaces.appointments.only`;
- (Part C) a deactivated account is signed out on its next refused call once enforced.
- (Part D) one additive migration (`client_messages`) and one scheduled job (`appointments:send-reminders`, every
  five minutes); client messages are off everywhere until a manager switches them on, so the job sends nothing
  until then;
- (Part D) the full admin's Service bookings: the row Confirm and bulk Cancel open a small dialog with "Tell the
  client" instead of the browser's confirm; its create, status, delete and bulk answers gain `client_message(s)`.
- (Part E) one additive migration (`service_booking_payments`); every appointment's revision changes once on
  deploy, so a panel open at that moment answers "changed by someone else" on its next save;
- (Part E) the workspace's "Mark paid at venue" becomes Take payment / Refund (managers) and Takings (managers);
- (Part E) staff bookings for members get the member price, and a member's coupon when staff choose one;
- (Part E) the full admin loses its Payment dropdown and bulk "Mark Paid", and its status endpoint refuses
  `payment_status`.
- (Part F) no migration and no new setting; the scheduler's optional length nobody else passes; every
  organisation's workspace gains drag, length and reopen on deploy; a booking's `meta` may carry `length_minutes`.
