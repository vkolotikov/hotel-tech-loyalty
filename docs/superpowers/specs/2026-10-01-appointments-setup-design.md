# HexaTech Appointments — Part B: the workspace stands on its own

Status: design approved by the owner in conversation on 2026-10-01 (three sections, each "Looks right"); this
document awaits the owner's review. Part B of the owner's roadmap (A one clock — live as main `0a5665585`;
B this; C sell on its own; D client messages; E money at the desk; F calendar power; G insights).

## 1. Goal

A venue can set up and run HexaTech Appointments without opening the full admin: its services, its team (who does
what, weekly hours, time off), the booking settings that matter at the desk, and a checklist that walks a new venue
to its first bookable slot. Every screen writes the records the full admin, the public widget and the member portal
already use. There is no second set of services, hours or settings.

Success looks like this. A fresh organisation's manager signs in, follows the checklist inside the workspace, and
ends with a slot a client can book online. A team member who is not a manager can record their own day off. Nobody
loses an appointment to a setup change without being told.

## 2. Owner decisions (2026-10-01)

1. **Who edits.** Owners and managers (`staff.role` `super_admin` or `manager` in this organisation) change
   services, team, hours, settings and anyone's time off. Every other staff member sees Setup read-only and may
   add or remove time off only for the team member linked to their own sign-in. The server enforces this.
2. **Conflicts.** A change that strands upcoming appointments is warned about, the appointments are listed, and the
   change is still allowed. Nothing is moved, cancelled or messaged automatically.
3. **Settings.** Venue time zone and currency; points for completed visits; the public booking link; online
   booking rules.
4. **Approach.** The workspace has its own endpoints under `/v1/admin/appointments/setup/…`, and the rules for
   saving setup live in shared services that the full admin's existing endpoints also call.
5. **Widget notice.** The public widget and the chat widget apply the booking notice on the venue's own clock,
   as the workspace and the portal already do. This lifts the 2026-09-29 "the public widget must not change"
   ruling for this one rule.

## 3. What exists (verified on main `0a5665585`)

- Setup lives in the full admin only: `/services`, `/service-masters`, `/service-extras` (React `LazyRoute
  gate="admin"`, which is a frontend gate) and Settings → Booking (`components/settings/BookingTab.tsx`).
- `/v1/admin/*` runs under `AdminMiddleware` with no role, so any staff user may call
  `Admin\ServiceController` and `Admin\ServiceMasterController`. AdminMiddleware's role lookup (when a role is
  named) is `Staff::withoutGlobalScopes()->where('user_id')->first()`, which is not tenant-scoped.
- `ServiceMasterController::destroy` hard-deletes a person together with their hours and time off.
  `addTimeOff` ignores existing bookings. Schedule times are unvalidated strings; the scheduler silently skips a
  window whose end is not after its start.
- `service_ids.*` and `master_ids.*` are checked with `exists:services,id` / `exists:service_masters,id`, which
  is not organisation-scoped, so a request can link another organisation's row.
- Data the workspace will reuse:
  - `service_master_service` pivot with `price_override` and `duration_override_minutes`, read by
    `ServiceSchedulingService` and not editable in any UI today;
  - `service_master_schedules` (`day_of_week` 0 = Sunday, several windows a day allowed);
  - `service_master_time_off` (one `date`, optional `start_time`/`end_time`, `reason`);
  - `service_masters.user_id` (link to a sign-in).
- Settings (HotelSetting keys) already read by the widget, portal and catalogue:
  - `services_lead_minutes` (default 60), `services_slot_step` (15), `services_max_advance_days` (60),
    `services_allow_master_choice` (true), `points_on_bookings` (true);
  - time zone: `hotel_timezone`, falling back to `organizations.timezone` (`PortalBootstrap::timezone`).
  - BookingTab shows a 30-minute slot step when nothing is stored, while the server uses 15.
- Currency: every service and service extra has its own `currency` column, and bookings copy it.
  `services_currency` (catalogue rules, PortalBootstrap) and `organizations.currency` (workspace bootstrap,
  PortalBootstrap) are read, but no admin screen writes either. `hotel_currency` (rooms) and `stripe_currency`
  are separate.
- "Bookable" is `BookingCapability::appointmentsBookable()`: an active service with an active performer who has an
  active schedule row whose end is after its start.
- The public booking page is `{app}/services/{widget token}` (BookingTab's "direct" link). The embed is the
  services script loader, and BookingTab builds both. (Plan ruling R5; an earlier draft named the iframe address.)
- The booking notice:
  - `ServicePublicController::availability` and `WidgetChatController` (≈ line 2538) pass
    `services_lead_minutes` to `availableSlots()`, whose filter compares the slot's wall-clock digits with the
    true UTC "now". A Riga venue (UTC+3) is offered slots up to three hours in the past.
  - The portal (`PortalServiceBookingController::SCHEDULER_LEAD_OFF`) and the workspace (`CalendarController`)
    already switch that filter off and apply the notice on true instants.
  - `PublicServiceAvailabilityZoneTest` pins the widget's response shape for a future day; it must stay green.

## 4. Architecture

```
workspace Setup screens ──> /v1/admin/appointments/setup/* (workspace:appointments + SetupAccess)
                                        │
full admin ServiceController ───┐       ▼
full admin ServiceMasterController ──> shared rules: ServiceSetup, TeamSetup, WeeklyHours, TimeOffSetup,
                                        BookingRules, AppointmentImpact  (App\Services\Booking\Setup\)
                                        │
                                        ▼
                       services, service_masters, service_master_service, service_master_schedules,
                       service_master_time_off, hotel_settings, organizations (the existing tables)
```

- **`SetupAccess`** (`App\Services\Appointments\Setup\SetupAccess`):
  - `canManage(User)` checks the staff row of the bound organisation (tenant-scoped) for role `super_admin` or
    `manager`;
  - `ownTeamMemberId(User)` returns the active-or-not `service_masters.id` whose `user_id` is the user, else null.
  - Every setup endpoint asks it first; refusals answer `403 {"error":"not_allowed"}`.
- **Shared rules** (`App\Services\Booking\Setup\`):
  - `ServiceSetup` (create, update, deactivate; keeps fields it is not given);
  - `TeamSetup` (profile, services with overrides, link to sign-in, deactivate);
  - `WeeklyHours` (validate and replace a person's week);
  - `TimeOffSetup` (add a range, remove one entry);
  - `BookingRules` (read and write the settings in §6.5);
  - `AppointmentImpact` (which upcoming appointments a proposed change strands).
- **The full admin** calls the same rules from `ServiceController` and `ServiceMasterController`, with its current
  request shapes and responses. Two changes reach it (§9): malformed hours are refused, and ids from another
  organisation are refused.
- **No migration is expected.** Every column and key above exists. The one new stored value is the HotelSetting
  `appointments_link_copied_at` (§8); HotelSetting rows need no schema change.

## 5. API (`/api/v1/admin/appointments/setup/…`, behind `workspace:appointments`)

| Method | Path | Who | What |
|---|---|---|---|
| GET | `setup` | any staff | One read: `can_manage`, `my_team_member_id`, services (with category and performers + overrides), categories, team (services + overrides, week, time off from today on), `staff_accounts` (managers only: the organisation's staff users to link), settings (§6.5), checklist (§8) |
| POST | `setup/services` | manager | Create a service |
| PATCH | `setup/services/{id}` | manager | Update; deactivating supports `dry_run` |
| POST | `setup/categories` | manager | Create a category (name only) |
| POST | `setup/team` | manager | Create a team member |
| PATCH | `setup/team/{id}` | manager | Profile, services + overrides, sign-in link, active; deactivating or removing a service supports `dry_run` |
| PUT | `setup/team/{id}/hours` | manager | Replace the week; supports `dry_run` |
| POST | `setup/team/{id}/time-off` | manager, or staff for their own `{id}` | Add a range; supports `dry_run` |
| DELETE | `setup/team/{id}/time-off/{entryId}` | manager, or staff for their own `{id}` | Remove one entry |
| PATCH | `setup/settings` | manager | Time zone, currency, booking rules, points switch; a currency change supports `dry_run` |
| POST | `setup/checklist/link-copied` | any staff | Records that the booking link was copied |

- **`dry_run=1`** runs the same validation and the same impact query and saves nothing. It answers
  `200 {"dry_run": true, "affected": [...], "total": n}`, where `affected` lists at most 50 appointments (id,
  start and end as venue wall clock, client name, service, team member). Saving answers the saved object plus the
  same `affected`/`total`.
- A currency dry run answers `{"dry_run": true, "services": n, "extras": n}`: the rows that would be relabelled.
- Validation errors answer `422` with field messages. A missing or other-organisation id answers `404`.

## 6. Rules

### 6.1 Services
- Fields edited in the workspace: name, category, duration (5–1440), buffer after (0–240), price (≥ 0), short
  description, active, and performers with an optional per-person duration or price.
- Every other column (image, gallery, tags, long description, `price_is_from`, `service_window`, `meta`,
  `brand_id`) is left as it is.
- A new service, team member or category takes its brand by the platform rule (`BelongsToBrand`: the selected
  brand, else the organisation's default brand), exactly as the full admin's rows do. A new service also takes the
  venue currency and the next `sort_order`. (Plan ruling R1; an earlier draft said `brand_id` null, which the
  models' own `creating` hook overrides.)
- Deactivate only; the workspace never deletes a service.

### 6.2 Team
- Profile: name, title, email, phone. Sign-in link: one of the organisation's staff users, or none; a user can be
  linked to at most one team member.
- Services performed, with overrides (duration 5–1440, price ≥ 0, each optional).
- Deactivate only. A deactivated person keeps their history and leaves the scheduler (as today).

### 6.3 Weekly hours
- Seven days; each day is either off or a list of windows `HH:MM–HH:MM`, 00:00–24:00 (24:00 allowed as an end).
- The end must come after the start, windows in a day may not overlap, and there are at most 6 windows a day.
- No overnight windows: the scheduler works per day. A night shift is entered as two windows on two days.
- Saved as a whole-week replace (as today), with `day_of_week` 0 = Sunday.

### 6.4 Time off
- Add: `from` date, `to` date (defaults to `from`; at most 366 days after it), all day or `start`–`end` (end after
  start) on every day of the range, and a reason (≤ 200 characters). This saves one row per day, the shape the
  scheduler reads. A day that already has an all-day entry for that person is skipped, not duplicated.
- Remove: one row.
- Staff who are not managers may do both only for `my_team_member_id`.

### 6.5 Settings (`BookingRules`)

| Setting | Stored in | Allowed |
|---|---|---|
| Venue time zone | `hotel_timezone` | a named IANA zone from the searchable list, which leaves out bare `UTC` and `Etc/*` (a venue on UTC picks a zone such as `Atlantic/Reykjavik`), because `VenueClock::isNamed()` treats `UTC` as not set |
| Currency | `services_currency` and `organizations.currency`, and relabels every service's and service extra's `currency` | ISO 4217 code from the list |
| Notice | `services_lead_minutes` | 0–10080 |
| Slot step | `services_slot_step` | 5, 10, 15, 20, 30, 60 |
| How far ahead | `services_max_advance_days` | 1–365 |
| Clients choose the person | `services_allow_master_choice` | true/false |
| Points for completed visits | `points_on_bookings` | true/false; shown only when the programme is on |
| Booking link and snippet | read-only | built as BookingTab builds them |

- Changing the time zone never moves stored appointments: they keep their wall-clock digits. The screen says so,
  and gives the number of upcoming appointments.
- Changing the currency relabels and never converts. Bookings already made keep their own currency. Rooms
  (`hotel_currency`, `booking_rooms`) and Stripe (`stripe_currency`) are untouched.

### 6.6 What counts as stranded (`AppointmentImpact`)

Upcoming means from the venue's "now" on (`VenueClock`), with status pending, confirmed or in progress.

| Change | Stranded |
|---|---|
| New week for a person | their upcoming appointments not wholly inside a window of their new week on that weekday |
| New time off | their upcoming appointments overlapping it |
| Deactivate a person | all their upcoming appointments |
| Deactivate a service | all its upcoming appointments |
| Remove a service from a person | their upcoming appointments of that service |

## 7. Screens (workspace, `a-*` tokens only, five locales)

- **Rail**: Calendar, Clients, **Setup**. Setup has tabs Services, Team, Settings; the checklist (§8) sits on top
  until it is complete.
- **Services**:
  - a list grouped by category, with search and an "Inactive" filter;
  - the editor in the right-hand panel (the appointment panel's frame) with the §6.1 fields;
  - "More in the full admin" opens `/services` for the marketing fields.
- **Team**:
  - a list with active/inactive status;
  - the editor has sections for profile and sign-in link, services with overrides, weekly hours (per weekday off
    or windows, plus "Copy to weekdays") and time off (upcoming entries, and "Add time off" with a range, all day
    or from–to, and a reason).
- **Settings**: the §6.5 fields. The booking link and snippet each have a copy button; copying calls
  `link-copied`.
- **Conflict dialog** (any save that supports `dry_run`): "N appointments fall outside this change" lists date,
  time, client, service and person, each opening `/appointments?open={id}&date={day}`. The buttons are
  **Save anyway** and **Back**. With nothing stranded the save goes straight through.
- **Not a manager**: the same screens read-only (no edit controls). Team shows "My time off" with add and remove
  when `my_team_member_id` is set, and a line saying how a manager links their sign-in when it is not.
- **Calendar**: today's two "not ready" notices are replaced by one checklist banner that links to Setup, shown
  while the checklist is incomplete.

## 8. Setup checklist (computed by the server, in `GET setup` and the bootstrap's `readiness`)

1. **Time zone**: `VenueClock::isNamed()`.
2. **A service**: an active service exists.
3. **Someone performs it**: an active service has an active performer.
4. **Hours**: `BookingCapability::appointmentsBookable()` (steps 1–4 are what "bookable" already means).
5. **Online booking (optional)**: `appointments_link_copied_at` is set, or a booking with source `widget`
   exists.
6. **First appointment**: any service booking exists.

The checklist is complete when steps 1–4 and 6 are done. Each step links to the screen that completes it.

## 9. Changes that reach every organisation

1. The full admin's hours are validated by `WeeklyHours`: a malformed time, an end not after its start, or
   overlapping windows answers 422 instead of being stored.
2. The full admin's `service_ids` / `master_ids` must belong to the current organisation (422 otherwise).
3. BookingTab shows a 15-minute slot step when nothing is stored (display only; no stored value changes).
4. **Widget notice on the venue clock**:
   - `ServicePublicController::availability` and the chat widget's slot list switch the scheduler's lead filter
     off and keep a slot only if its true instant (`AppointmentClock`, the venue's zone) is at least the notice
     after now, the portal's method.
   - The extras' `lead_time_hours` checks compare true instants too: in `ServiceQuoteBuilder::build()` and in
     the inline check of `ServicePublicController::confirm`.
   - The widget and the member portal both hand the builder the stored wall-clock start
     (`PortalServiceBookingController::storedStart()`), so this one fix also corrects the portal's extras
     notice. The portal's slot list and its `too_soon` check were already right and stay as they are. (Plan
     ruling R2; an earlier draft assumed the portal passed true instants.)
   - Response shapes do not change.
   - Effect: east of UTC, past slots stop being offered today; west of UTC, slots stop going missing. Days after
     today are unaffected (`PublicServiceAvailabilityZoneTest` stays green).
5. Managers of every organisation see Setup in the workspace; everyone else sees it read-only.

## 10. Testing and verification

- **Backend feature tests** (`tests/Feature/Appointments/Setup/`):
  - the role matrix per endpoint: manager, staff on own time off, staff on another person, another
    organisation's ids;
  - every §6 rule at its limits;
  - dry run versus save, and each §6.6 case;
  - currency relabel and dry-run counts; time zone change keeps stored digits;
  - the checklist steps; `link-copied`;
  - the bootstrap readiness.
- **Shared rules**: unit tests for `WeeklyHours`, `TimeOffSetup` ranges and `AppointmentImpact`. The full admin's
  existing controller tests stay green, plus new tests for §9.1 and §9.2.
- **Widget**:
  - a Riga venue at 12:00 local is not offered 10:00 or 11:00 today;
  - a New York venue is offered what its notice allows;
  - the future-day shape test unchanged;
  - the chat widget's slot list the same.
- **Frontend**: static-render tests per screen (manager and staff views, the conflict dialog, the checklist),
  `localeCompleteness` for every new string, and api tests for the dry-run flow.
- **Browser** (local, Riga browser zone, 1440 and 390 wide):
  - a fresh organisation reaches "bookable" through the checklist alone;
  - a public widget booking succeeds;
  - time off over an appointment shows the dialog;
  - a non-manager can add their own time off and nobody else's.
- **Deploy**: by the §6 recipe with artifact tests on every path and a content probe.

## 11. Risks

- **Widget notice change**: east-of-UTC venues lose the past-time slots they used to offer. That is the intent,
  but it is visible to every such venue the day it ships.
- **Stricter hours validation in the full admin**: a page that sent malformed times now gets 422. The full admin's
  own form sends `HH:MM`. It shows one window per weekday, so it now edits only that first window and keeps a
  second one made in the workspace; before that fix, editing a split day gave both windows the same times and the
  overlap was refused. A refusal now says why. (Corrected after the final review, 2026-10-01.)
- **Currency relabel** touches every service and extra row of a venue in one save. It runs in a transaction, the
  dry run shows the counts first, and nothing is converted.
- **Linking sign-ins**: an organisation whose team members are not linked to users gets no "own time off" until
  a manager links them. The screen says how.

## 12. Not in Part B (known limits)

- The full admin's setup endpoints stay open to any staff user: role enforcement across the admin API is Part C.
- Images for services and team members stay in the full admin (owner kept Section 2 without them).
- Service extras, categories beyond name, and ordering stay in the full admin.
- The public widget enforces "how far ahead" only in the browser (`services-widget.blade.php`); the server does
  not. This is unchanged here and noted for Part C or F.
- No stale-version check on setup saves: the last save wins.
