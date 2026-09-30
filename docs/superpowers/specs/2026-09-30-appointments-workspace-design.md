# HexaTech Appointments — calendar-first workspace, first milestone

**Status:** design, awaiting the owner's review. **Date:** 2026-09-30.
**Branch:** `feature/appointments-workspace` (worktree `../Hexa-Tech-appointments`, cut from production main
`75ea05ea2`, no upstream — never a bare `git push`).
**Source brief:** `HexaTech_Appointments_Workspace_Brief.md` v1.0 and the starter prompt (30 September 2026), plus the
owner's day-calendar mockup.
**Owner decisions (2026-09-30):** the loyalty action is points for a completed visit under the programme's existing
rule; the double-booking window in the shared scheduler is closed in this milestone; the pilot is a beauty or wellness
business; the interface name is "HexaTech Appointments".

---

## 1. Goal

A receptionist, owner or practitioner opens one screen, sees today's schedule by team member, books a client into a
free slot, moves or cancels an appointment, sees who the client is and what their membership gives them, and marks the
visit completed so the programme awards its points. Everything is the same booking, client and loyalty record the full
admin, the public widget and the member portal already use.

**Success criteria**

- An organisation without the flag sees no change: same landing page, same navigation, same API answers, same styles.
- An organisation with the flag gets `/appointments`: a day calendar with team columns, a week view for one team
  member and a list view.
- An appointment created in the workspace appears in the full admin's `/service-bookings` list and calendar, and a
  status change made there appears in the workspace, with no copy or synchronisation step.
- Two people cannot be given the same team member at the same time from any entry point (workspace, full admin,
  public widget, member portal, chat).
- A retried or double-clicked create makes one appointment. A save over someone else's newer change is refused with
  an explanation, never silently applied.
- Completing a member's appointment awards points once, under the existing rule, and the panel says how many or why
  none.
- Every consequence the panel states (payment, points, message to the client) is what the server will actually do.

**Non-goals (this milestone)**

- Services, Team and availability, Loyalty, Online booking and Insights as workspace areas; onboarding; drag to move.
  They are the next milestone (§12). Until then these are managed in the full admin.
- Any new payment capability, refund, payment link, client message or reminder.
- Member price or coupons at a staff booking (the owner chose points on completion for this milestone).
- Rooms and resources for services. They do not exist in the engine (§2).
- A production deploy. Merging to `main` is a deploy and needs the owner's explicit yes.

---

## 2. What exists (verified on main `75ea05ea2`)

Read from code paths, not from menu labels. "Tested" means a PHP test covers it on sqlite.

| Capability | What exists | Evidence | Classification |
|---|---|---|---|
| Availability and conflict check | One scheduler for widget, portal, chat and admin: weekly hours per team member, time off, duration plus buffer-after, service eligibility. Re-checked at save inside a transaction under a Postgres advisory lock. | `app/Services/ServiceSchedulingService.php:67-207`, `app/Support/AdvisoryLock.php` | Existing, reuse |
| Staff create | `POST admin/service-bookings`. Stores no `guest_id` or `member_id`, requires an email, no retry protection. No test. | `Admin/ServiceBookingController.php:366-476` | Essential shared change |
| Reschedule | None. No endpoint changes `start_at` or the team member; the scheduler cannot ignore the booking being moved. | `routes/api.php:1273-1283`, `ServiceBookingController.php:479-530` | Essential shared change |
| Status lifecycle | `pending, confirmed, in_progress, completed, cancelled, no_show`; any to any; only the first three block a slot. | `ServiceBookingController.php:482`, `ServiceSchedulingService.php:190` | New endpoint validates |
| Stale edits | Row lock, then last write wins. | `ServiceBookingController.php:492` | Essential |
| Staff calendar | Read-only month, week and hour list; links out to the list page; reads times in the browser's zone. | `frontend/src/pages/ServiceBookingCalendar.tsx` | New UI |
| Time zone | `start_at`/`end_at` hold the venue's wall clock, labelled `+00:00` by shared APIs. The venue zone comes from `hotel_timezone`, then `organizations.timezone`. Only the portal converts. | `app/Services/Portal/AppointmentClock.php`, `PortalBootstrap.php:78-93` | Reuse the resolver |
| Clients | `guests` with search and create; create auto-enrols a member when the programme allows. No appointment history on the client. | `Admin/GuestController.php:78-157`, `GuestMemberLinkService` | UI plus a read endpoint |
| Loyalty read | Tier, balance, progress, tier benefits. | `MemberAdminController.php:394-470`, `DiscountController.php:121-150` | Existing, reuse |
| Points for a completed visit | Awarded once: `points_awarded_at` stamp plus ledger key re-checked under the member row lock. Needs `member_id`, which only the portal writes. Tested. | `app/Services/Loyalty/BookingPointsService.php:35-101`, `tests/Feature/Admin/ServiceBookingPointsTest.php` | Works once staff bookings link the member |
| Member price, coupons | Member portal checkout only. | `PortalServiceBookingController.php`, `DiscountService.php:157-190` | Later |
| Payments | Card holds from widget and portal, captured by a cron. Admin `paid`/`refunded` are labels that call nothing. No staff refund, no payment link, no record of money received. | `Console/Commands/CapturePendingPaymentIntents.php`, `ServiceBookingController.php:483` | Read-only, truthful |
| Client messages | Confirmation emails from widget and portal only. Staff create, move, cancel send nothing. No reminders. | `ServicePublicController.php:502`, `Booking/PortalBookingNotifier.php` | UI says so |
| Rooms and resources | None for services. | models and migrations | Not offered |
| Services, team, hours | Full editing exists. Deleting or changing hours ignores future bookings. | `ServiceMasterController.php`, `ServiceController.php` | Next milestone |
| Insights | Counts by status by booking date. No no-show rate, utilisation or money-received totals. | `ServiceBookingController.php:70-144` | Later |
| Per-organisation flag | No tenant-safe store. `organizations.settings` (JSON, cast, fillable) is read and written by nothing. | `app/Models/Organization.php:57-62,180-181` | Small addition |
| Access control | Organisation isolation by a global scope that fails closed. Product entitlement never enforced server-side; any staff role may call every booking route; no per-location staff restriction. | `app/Scopes/TenantScope.php`, `routes/api.php:437` | New API gated by flag |
| Audit | Actor and subject columns exist. The service-booking controller passes `user_id`, which is not a column, so the actor is dropped. | `app/Models/AuditLog.php:13-17,56-70`, `ServiceBookingController.php:463-468` | Small shared fix |

**Existing problems found (not caused by this work)**

1. **Double-booking window.** A booking for "any team member" locks `svc:{service}`; a booking for a named person
   locks `svcm:{person}`. Different keys do not serialise, so both can pass the conflict check for the same person and
   time (`ServiceBookingController.php:389-391`, `ServicePublicController.php:348-350`,
   `PortalServiceBookingController.php:419`, `WidgetChatController.php:2611-2613`). Fixed here (§6, S5d).
2. **Hand-marked "paid".** Marking an `authorized` booking `paid` in the full admin removes it from the capture job;
   the hold lapses uncharged. Not changed here; the workspace never offers that action on a booking that carries a
   card payment.
3. **Local mail is live.** The local `.env` uses a real SMTP transport. Every local run in this work forces
   `MAIL_MAILER=log`.

---

## 3. Architecture

One core, two experiences. The workspace is a second shell over the same tables and services.

```
Browser  /appointments/*  (lazy chunk, own shell, tokens under [data-appointments])
   │  only calls /api/v1/admin/appointments/*  (+ the shared auth endpoints)
   ▼
routes/api.php  admin group (saas.auth, auth:sanctum, tenant, brand, admin, check.subscription)
   └─ workspace:appointments   ← new gate: the organisation's flag is on
        └─ App\Http\Controllers\Api\V1\Admin\Appointments\*   (thin)
             ├─ ServiceSchedulingService   (the one scheduler; same lock keys)
             ├─ BookingPointsService       (the one points worker)
             ├─ Guest / LoyaltyMember / GuestMemberLinkService
             └─ AuditLog::record()
```

**Frontend.** A new folder `frontend/src/appointments/`, built the way `frontend/src/portal/` is: its own
`AppointmentsApp` (guard plus routes), provider, shell, theme file, locale files and typed API client. One route is
added to `App.tsx` (`/appointments/*`, lazy, outside the admin `Layout`). No new dependency: React Router, React
Query, date-fns, lucide-react and Tailwind are already there. A sweep test (the portal's `tokens.test.ts` pattern)
fails the build if a file in the folder uses an admin colour class or calls any `/v1/admin/` path other than
`/v1/admin/appointments/`.

**Styles.** `appointments/theme/appointments.css` defines `--a-*` tokens and every rule under `[data-appointments]`;
`tailwind.config.js` gains `a-*` colour aliases; `index.css` gains one `@import`. Nothing outside the scope selector
is touched, so the full admin cannot be restyled. Native form controls are reset to `color-scheme: light` inside the
scope (the admin forces dark globally).

**Backend.** New controllers under `Admin\Appointments\` and one route group. Controllers hold no booking rules: slot
checks go to the scheduler, points to the points service, client creation to the same model and link service the full
admin uses. No new table and no migration.

**Flag.** `organizations.settings.workspaces.appointments = { enabled: bool, landing: bool }`. Absent means off. No
tenant endpoint and no billing sync writes this column. Set by an artisan command (§11).

**Gate.** Middleware `workspace:appointments` answers `403 workspace_disabled` when the flag is off. It runs after
`admin` and `check.subscription`, so members and anonymous callers never reach it and the subscription rule is the one
every admin route already has (including its owner bypass, listed in §11). Tenant and brand scoping are inherited
unchanged.

**Landing.** The login and `/auth/me` responses gain `workspaces: { appointments: { landing } }` only for an enabled
organisation; for everyone else the responses are byte-identical. `Login.tsx` sends a staff user to `/appointments`
when `landing` is true and no other redirect was requested. `/` stays the admin dashboard. The workspace shows a
"Full admin" link in its secondary area.

---

## 4. API (`/api/v1/admin/appointments/…`)

**Times.** Every time in and out is the venue's wall clock as `YYYY-MM-DDTHH:mm`, with no offset and no `Z`. The
client never builds an instant from it. `bootstrap` names the venue's zone so the client can compute "now" and
"today" for the venue with `Intl`.

| Method and path | Purpose |
|---|---|
| `GET bootstrap` | Organisation name, brand, venue zone (and whether it is a real named zone), currency, industry, staff name and role, loyalty state (`programme_on`, `points_on_bookings`), readiness (active services, team members, schedules), interface name. |
| `GET calendar?from&to[&include_cancelled]` | Up to 31 days. Team members (active, in order) with their working windows and time off per date, and the appointments in range. |
| `GET slots?service_id&master_id&date[&ignore]` | Free start times from the scheduler; `ignore` is the appointment being moved. |
| `GET clients?search` | At least two characters, 20 rows: name, phone, email, member summary. |
| `POST clients` | Name plus phone or email. Answers `409 possible_duplicate` with the matches when the normalised email or phone already exists, unless `confirm_new: true`. Never merges. |
| `GET clients/{id}` | Contact details, upcoming and past appointments, loyalty summary. |
| `POST bookings` | Create. Header `Idempotency-Key` (8 to 80 characters) required. |
| `GET bookings/{id}` | One appointment with client, loyalty, actions and history. |
| `PATCH bookings/{id}` | Move: `start`, `master_id`, `revision`. |
| `POST bookings/{id}/actions` | `action`, `revision`, optional `reason`. |

**Create body:** `client_id`, `service_id`, `master_id`, `start`, optional `source` (`admin`, `phone`, `walk_in`),
`customer_notes`, `staff_notes`. The server resolves the client inside the organisation, snapshots name, email and
phone onto the booking, and stores `guest_id` and, when the client has a member in this organisation, `member_id`.
A client without an email is stored with an empty `customer_email` (the column is not nullable). Price, duration and
end come from the scheduler. `status` is `confirmed`, `payment_status` is `unpaid`. Extras and party size are not
offered.

**Appointment resource:** `id`, `reference`, `start`, `end`, `duration_minutes`, `service`, `master`, `client`
(`id`, `name`, `phone`, `email`, `member`), `status`, `payment` (`state`, `amount`, `refunded_amount`,
`carries_card_payment`), `price` (`total`, `list`, `discount_label`, `currency`), `source`, `notes`, `revision`,
`actions`, and on the detail call `loyalty` and `history`.

**`revision`** is a hash of the fields a second operator could change (`start_at`, `end_at`, `service_master_id`,
`status`, `payment_status`, `staff_notes`, `updated_at`). Every write sends it back; the server recomputes it under
the row lock and answers `409 stale` with the current resource when it differs.

**`actions`** is computed by the server for each appointment: every action with `allowed` and its `consequences`
(`payment`, `points`, `message`). The UI prints these; it does not derive business outcomes itself.

| Action | From | Writes | Consequences the server reports |
|---|---|---|---|
| `confirm` | pending | `confirmed` | A held card payment will be charged by the capture job (about 10 minutes). |
| `start` | confirmed | `in_progress` | None. |
| `complete` | confirmed, in_progress | `completed`, then the points worker | Points to be awarded, or the reason none will be. |
| `no_show` | confirmed | `no_show` | A held card payment is released. No charge is made. |
| `cancel` | pending, confirmed, in_progress | `cancelled`, `cancelled_at`, reason (255) | Hold released, or "a captured card payment is not refunded automatically"; a coupon used is not returned. |
| `mark_paid_at_venue` | confirmed, in_progress, completed; only when unpaid with no card payment | `payment_status = paid` | Recorded as "marked paid by staff"; no money is moved. |

`completed`, `cancelled` and `no_show` are final in the workspace. The full admin's free-form status endpoint is
unchanged. Every action reports `message: none` — no client message exists for staff actions today.

**Points reasons:** `will_award: N`, or one of `not_a_member`, `programme_off`, `points_on_bookings_off`,
`already_awarded`, `zero_amount`, `refunded`. They come from one read-only method on the points service (§6, S6).

**Errors:** `403 workspace_disabled`, the inherited subscription refusal, `404` outside the organisation or brand, `409 slot_taken`,
`409 stale` (with `current`), `409 possible_duplicate`, `422 idempotency_key_required`, `422 idempotency_key_reused`
(same key, different body), `422 not_allowed` (action not valid from this status), `422 time_does_not_exist` (a
wall-clock time the venue's zone skips).

---

## 5. Integrity rules

- **Conflict check at save.** Create and move run in one transaction: advisory lock `svcm:{master}` first, then (for
  a move) the booking row lock, then `reserveSlot()`. Same key and same scheduler as every other entry point.
- **Move.** Keeps the reference, service, price, payment and links. Duration is recomputed for the new team member.
  The scheduler ignores the booking itself when checking. Final statuses cannot be moved.
- **Retry.** The `Idempotency-Key` and a hash of the body are stored on a `service_booking_submissions` row (the
  table the widget and portal use), looked up before the lock and again inside it. A replay answers with the first
  booking and `replayed: true`.
- **Stale edit.** `revision` mismatch under the row lock is refused; the panel shows what changed and reloads.
- **One owner per side effect.** Points are awarded only by `BookingPointsService`, called once by the server after
  the completing transaction commits. The frontend triggers nothing after rendering. Nothing is emailed.
- **States stay separate.** Appointment status, payment state and points state are three fields with three labels.
  The payment label is derived from `payment_status`, `stripe_payment_intent_id` and `refunded_amount`:
  "not paid online", "card held, not charged", "paid by card", "marked paid by staff", "refunded {amount}",
  "marked refunded by staff", "partially refunded {amount}", "payment failed". No label claims money moved when the
  data cannot show it.
- **Time.** Stored digits are shown as stored. "Now" and "today" use the venue's zone. When the venue's zone is unset
  or `UTC`, the shell shows a notice that the time zone should be set in Settings, and uses UTC. Staff may book from
  the start of the venue's today onward (a walk-in that has already started), never an earlier day.
- **Privacy.** Calendar cards carry time, client name, service and status. Notes, contact details and loyalty appear
  only in the panel. No client data in URLs beyond ids.

---

## 6. Shared changes

Everything else is new files. These touch code other surfaces use.

| # | Change | Reach |
|---|---|---|
| S1 | `Organization::workspace()` / `workspaceEnabled()` helpers reading `settings.workspaces`. | New methods only. |
| S2 | Middleware `RequireWorkspace`, alias `workspace`, in `bootstrap/app.php`. | New alias only. |
| S3 | Artisan command `workspace:appointments`. | New command. |
| S4 | One route group appended inside the admin group in `routes/api.php`. | Additive routes. |
| S5a–c | `ServiceSchedulingService`: `reserveSlot()` and `availableSlots()` gain an optional booking id to ignore; a public `workingWindows()` exposes the existing private calculation. | Defaults keep every current caller identical. |
| **S5d** | `reserveSlot()`, when called inside a transaction on Postgres, takes `svcm:{id}` for each candidate team member in ascending id order before checking any of them. Closes the double-booking window. | **Every organisation, every entry point, not behind the flag.** No request, price, payload, assignment order or email changes; an "any team member" confirm briefly holds the locks of that service's team members. |
| S6 | `BookingPointsService::previewForServiceBooking()`: read-only, returns the points or the reason. `awardForServiceBooking()` is not changed. A test pins that the two agree. | New method only. |
| **S7** | `Admin\ServiceBookingController`: the three `AuditLog::create()` calls become `AuditLog::record()` with the staff user and the booking; `destroy()` records one. | **Full admin, all organisations:** audit rows gain actor and subject. Nothing else changes. |
| **S8** | Login and `/auth/me` responses gain a `workspaces` key for enabled organisations only. | Absent for everyone else. |
| S9 | `App.tsx` one route; `Login.tsx` landing choice; `tailwind.config.js` `a-*` aliases; `index.css` one import; `authStore` one optional field. | Additive. |

A staff-created appointment that carries a member now earns points on completion. That is the agreed loyalty action.
It applies only to appointments created through the workspace; the full admin's create is unchanged.

---

## 7. Screens

**Shell.** Deep navy sidebar with two items, Calendar and Clients; below a divider: Full admin, language, signed-in
user and sign out. A top bar with the organisation and brand name, a client search field and **New appointment**.
No greeting banner, no upgrade card, no promotional panel.

**Calendar, day view.** Time down the left, one column per active team member (photo or initials, name, title).
Working hours are the white area; outside hours is tinted; time off is hatched and labelled "Blocked" with its reason.
Appointments are cards positioned by start and duration: time range, client name, service, and a status mark made of
an icon and a word. A line marks the venue's current time. Free time inside working hours is a set of real buttons,
one per half hour ("Book Emma at 10:30"), so booking from a slot needs neither hover nor drag. A right rail holds a
mini month for jumping to a date and a day overview: counts of upcoming, in progress, completed and needs attention
(awaiting confirmation, or confirmed and more than 15 minutes past start without being started). The counts come from
the loaded day; there are no comparisons with other periods. A legend names every status.

**Week view.** One chosen team member, seven day columns, same cards.

**List view.** The chosen day or week as a table: time, client, service, team member, status, payment. Includes
cancelled when the toggle is on. This is the keyboard and screen-reader alternative, and the default below 1024 px.

**Toolbar.** Previous, next, date, Today; Day, Week, List; team filter; "Show cancelled". A filter hides cards only:
availability always comes from the server. View, team filter and the toggle are remembered per browser. "Updated
HH:mm" with a refresh button; the calendar refetches every 30 seconds, on focus and after every change.

**Appointment panel.** Slides in from the right; the calendar stays visible and keeps its date, filter and scroll.
Esc closes and returns focus to the card or slot.

- *Create:* slot prefilled (date, time, team member) → client (search, or "New client": name plus phone or email,
  with the possible-duplicate step) → service (only those the team member performs) → review (end time, duration,
  price) → Save. Typed input survives a failed save. A lost slot offers the next free times.
- *View:* summary, status, payment label, notes; the client block (contact, next and last visits, link to profile);
  the loyalty card; the actions the server allows, each with its consequences stated before the confirm; history
  (who, when, what changed).
- *Move:* date, team member and a time chosen from the server's free slots; states "No message is sent to the
  client".
- *Cancel:* reason plus the stated consequences; a destructive-styled confirm.

**Loyalty card.** For a member: number, tier, points balance, the tier's benefits in plain words, and for this
appointment "Completing awards N points" or the reason none. After completion: "N points awarded" from the ledger.
For a client who is not a member: "Not a member" and nothing else. When the programme is off: the card is not shown.

**Clients.** Search; profile with contact details, upcoming and past appointments (matched by the client link; older
bookings that match only by email are listed under "Matched by email"), the loyalty card, and **Book again**, which
opens the create panel with the client, last service and team member preselected and checks availability afresh.

**Visual direction.** Light canvas, white panels, subtle borders, moderate radii, Inter at 14–15 px. One accent in
the teal-blue range for primary actions and selection. Status colours are a separate set and never the accent; every
status also has an icon and a word. The layout follows the owner's mockup (sidebar, team columns, mini month, day
overview, legend) and leaves out its "+20%" deltas, upgrade card and online-booking banner, which nothing real backs.

**Wording.** Five locales (en, de, es, fr, ru) under `appointments.*`, with a completeness test. Industry nouns
(`client`, `team member`, `service`, `appointment`) come from `appointments.vocab.<industry>.*`, keyed by the
industry the server reports. Beauty and the generic set ship now.

**Accessibility.** Target WCAG 2.2 AA; no conformance is claimed. Checked: keyboard-only create, move and cancel;
visible focus; token contrast (the portal's contrast test pattern); 1280 and 1440 px and 200% zoom.

---

## 8. Testing and verification

- **PHP, `tests/Feature/Appointments/`:** gate (flag off, other organisation, member user); create (client and member
  linked, conflict, outside hours, ineligible team member, replay, reused key); move (self ignored, conflict, stale,
  price kept, final status refused); actions (each transition, refused transitions, completion awards once, second
  completion awards nothing, preview equals award); parity (workspace-created booking in the full admin's list and
  calendar payloads; a full-admin status change in the workspace payload; phone-only client renders in the full
  admin list, detail and export); audit actor; login and `/auth/me` unchanged for a non-enabled organisation.
- **Scheduler:** a structural test for the lock order (the `PortalIntentLockOrderTest` pattern, since sqlite cannot
  exercise the lock) and the existing suites `Booking`, `Widget`, `Member`, `Admin`, `Loyalty`, `Stripe`, `Unit`
  re-run by directory.
- **Live pass on local PostgreSQL** (test organisation Lumière Salon, `MAIL_MAILER=log`): two parallel creates for
  one slot give one booking; a named create racing an "any team member" reservation gives one booking; the same
  idempotency key twice in parallel gives one booking.
- **Frontend:** pure modules (wall-clock maths, card layout, panel reducer, payment and status labels) under vitest;
  the sweep test; locale completeness; `tsc -b`; eslint on the folder.
- **Browser:** the walkthrough of brief §11 on the test organisation: create in the workspace, see it in the full
  admin, change it there, see the workspace update, move it, complete it, check the member's ledger shows one award.
  Screenshots at 1440 of both interfaces; full-admin pages compared before and after for style drift.

---

## 9. Enable, disable, recover

- **Enable:** `php artisan workspace:appointments {org} --on [--landing]`. **Disable:** `--off`. **Inspect:**
  `--status`, or `--list` for every enabled organisation.
- **Disable means:** the API answers 403, `/appointments` returns the user to the full admin, login lands on the
  dashboard. No data is deleted. It does not undo a booking, a status change or a points award.
- **Recovering a mistake:** a wrong cancellation or no-show is corrected in the full admin (its status endpoint is
  free-form). A wrong completion's points are reversed with the existing points reversal; the booking stays stamped,
  so completing again does not award twice. Every step leaves an audit row with its actor.

---

## 10. Risks

| Risk | Control |
|---|---|
| S5d changes the scheduler for every organisation. | Smallest patch; no payload or price change; structural test, the existing widget and portal suites, a live race check; its own commit so it can be deployed or held separately. |
| sqlite tests hide PostgreSQL behaviour. | The live pass is part of the milestone, not optional. |
| A phone-only client's empty email reaches code that expects one. | Parity tests on the full admin's list, detail and export; staff actions send no mail. |
| The panel states a consequence the server does not deliver. | Consequences are computed by the server from the same predicates the workers use. |
| New styles leak into the admin. | One scope selector, the sweep test, before/after screenshots. |

---

## 11. Production blockers for a standalone customer

Not solved by this milestone, and each must be closed or accepted before selling the workspace on its own:

1. **Server-side lock-down.** An appointments-only organisation can still call the rest of the admin API. Needs an
   allowlist for such organisations and an entitlement in the billing catalogue (a separate repository).
2. **Roles.** Any staff role reaches settings, team and billing routes today; the subscription check is bypassed for
   organisation owners.
3. **Services, team and hours inside the workspace,** including a preview of bookings affected by a change.
4. **Client messages and reminders** for staff actions.
5. **Payments at the desk:** a real record of amount and method, and a staff refund.
6. **Reopening a completed visit** with its points reversal.
7. **Rooms and resources,** if the customer's services need one.
8. **The venue's time zone** set to a named zone.
9. **The deploy itself,** by the main-cut source-patch recipe, on the owner's explicit yes.

## 12. Next milestone (backlog, in order)

Services; Team and availability (with affected bookings); Loyalty area and "enrol as member"; Online booking controls
and link; Insights with defined denominators; short onboarding; item 1 above; extras in a staff booking; drag to move
with the same server check; member price at a staff booking; a link to the workspace from the full admin.
