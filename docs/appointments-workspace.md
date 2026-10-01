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
  Both show only where the organisation has the workspace and at least one active service; the address
  `/appointments` itself works for every organisation that has it.
- **Back to the full admin:** **Full admin** in the workspace opens the same tool there — the calendar opens the
  Service bookings calendar, Clients opens the customer list, anything else the dashboard.

## Switching it on and off

Every artisan command below is run as `php artisan …` in the application's environment.

| To | Run |
|---|---|
| Switch it off for one organisation | `php artisan workspace:appointments <org id> --off` |
| Switch it back on (the default) | `php artisan workspace:appointments <org id> --on` |
| Also land that organisation's staff on it after sign-in | `php artisan workspace:appointments <org id> --on --landing` |
| See one organisation's setting | `php artisan workspace:appointments <org id> --status` |
| List the organisations that differ from the default (off, or landing on the workspace) | `php artisan workspace:appointments --list` |

The switch is `organizations.settings.workspaces.appointments`; nothing stored means on, landing on the full
admin (`Organization::WORKSPACE_DEFAULTS`). No screen and no billing sync writes that column.

**Off means:** the workspace's API answers 403, `/appointments` sends staff back to the full admin, sign-in lands
on the dashboard. A workspace window that is open at that moment says so on its next refresh or save and offers
the full admin. No data is deleted. Switching it off does **not** undo a booking, a status change or a points
award made while it was on.

## What it needs before it is useful

Set up in the full admin (the workspace has no screens for these yet): at least one active service, a team member
who performs it, that team member's weekly working hours, and the venue's time zone as a **name**
(Settings → General → Timezone, e.g. `Europe/London`; `UTC`, `EET` or `+03:00` leave the workspace on UTC and it
says so).

## What each action really does

| Action | Writes | Does not do |
|---|---|---|
| Add a client | A client record (the full admin's Customers). With an email address and an active programme, the client is enrolled as a member by the same hook every other entry point uses. | Send a welcome or any other message. Merge with an existing client (a likely duplicate is shown to choose from). |
| Book | A confirmed, unpaid service booking linked to the client and, for a member, the member. | Send the client anything. Apply a member price or a coupon. |
| Move | The time and the team member; the duration follows the new team member's own. Reference, service, price and payment are kept. | Send the client anything. |
| Confirm (a pending request) | Status `confirmed`. | — But the capture job will now charge a held card within about 10 minutes (see "Card holds" below for a hold older than six days). |
| Arrived | Status `in_progress`. | — |
| Complete | Status `completed`, then the programme's points for a member, once. | Take a payment. |
| No-show | Status `no_show`. The capture job releases a held card. | Charge a no-show fee. Refund a captured payment. |
| Cancel | Status `cancelled`, the time and the reason. The capture job releases a held card. | Refund a captured payment — nothing does, and nothing flags it: the refund is made by hand in Stripe. Return a coupon. Tell the client. |
| Mark paid at venue | The label `payment_status = paid`, only on a booking with no card payment. | Move money. Record an amount or a method. |
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

- **Cancelled or marked no-show by mistake:** in the full admin, open the booking under Service bookings and set its
  status back. Check the time is still free first — the full admin's status change does not re-check the slot.
- **Completed by mistake:** the points are reversed in the full admin (the member's page → points history → reverse).
  The booking stays stamped as awarded, so completing it again does not award twice.
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
  from one (`frontend/src/appointments/lib/wallClock.ts`).
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
open, and the client search. Known limits: the grid and the month have one tab stop per slot and per day (no
arrow-key movement) — the List view is the short way round; focus handling has no automated test, because the
frontend tests render to a string.

## Where it differs from the full admin's screens

- The workspace shows every time in the **venue's** zone. The full admin's service calendar draws the same stored
  time in the browser's zone, so on a computer set to another zone the two show different hours for one booking.
  The stored value is the same; nothing is converted on save.
- A booking typed into the full admin with only a name has no client record: the workspace shows it, says it is
  not linked, and client search does not find that person.

## What this milestone does not do

Services, team, hours, loyalty settings, online-booking controls and insights inside the workspace; onboarding;
drag to move; reopening a completed visit; staff refunds and a real desk-payment record; any client message or
reminder for a staff action; member price or coupons at a staff booking; extras; rooms and resources (the engine
has none for services).

## Before it is sold on its own

1. **Server-side lock-down.** An appointments-only organisation can still call the rest of the admin API. It needs
   an allowlist for such organisations and an entitlement in the billing catalogue (a separate repository).
2. **Roles.** Any staff role reaches settings, team and billing routes; the subscription check is skipped for an
   organisation's owner.
3. The list under "What this milestone does not do", as far as the customer needs it.

## Deploying it

Merging to `main` is a production deploy; it needs the owner's explicit yes and the main-cut source-patch recipe
(`docs/landing-page-builder.md` §6). There is no migration. What reaches every organisation:

- the workspace itself, unless the organisation is switched off;
- `ServiceSchedulingService::reserveSlot()` takes each candidate's lock (no request, price, payload, assignment
  order or email changes);
- the full admin's service-booking audit rows gain their actor and their booking;
- sign-in and `/auth/me` carry a `workspaces` key (`landing`, `has_services`) for staff of every organisation that
  has the workspace;
- the full admin's menu item and button into the workspace, where something can be booked.
