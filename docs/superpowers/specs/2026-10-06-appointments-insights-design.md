# HexaTech Appointments — Part G: insights

Status: design approved by the owner in conversation on 2026-10-06 (sections 1–4: "Looks right"). This spec is for
the owner's review before the implementation plan.

Roadmap context:
- A one clock — live;
- B Setup — live;
- C sell on its own — live;
- D client messages — live;
- E money at the desk — live (2026-10-05);
- F calendar power — live as main `f58756c99` (2026-10-06);
- **G insights — this part.**

Rooms and resources stay a later part of their own.

## 1. Goal

A manager or owner opens **Insights** in the workspace and sees how the venue is doing over a week, a month or chosen
dates, each figure next to the period before:
- visits done;
- no-shows and late cancellations, as rates with one stated denominator;
- the value of the visits done and the average per visit;
- the money taken for the period's visits and what is still owed;
- a row per service and per team member;
- where bookings come from.

Venues on the Appointments plan have no analytics at all today: every full-admin dashboard answers them
`not_in_plan`. In the workspace there is only the one-day Takings screen and the calendar's day overview. This part
gives them, and every other venue, one honest view of the business.

## 2. Owner decisions (2026-10-06)

| Question | Decision |
|---|---|
| Who it serves | The manager or owner: how the venue is doing. Team utilisation, clients coming back and money over a range are not this part. |
| Who sees it | Managers only, like Takings (refused on the server for everyone else). |
| Figures | Headline figures; by service and by person; where bookings come from. No chart. |
| Periods | This week, Last week, This month, Last month, or any From–To up to a year, each compared with the period before. |
| Approach | The server works the figures out on request from the period's appointments and payments: always current, rules tested on the code that runs in production. No pre-computed table, no Postgres-only SQL. |
| Sections 1–4 | "Looks right" — the definitions (§4), the server (§5), the screen (§6), edge cases and testing (§7–§9). |

## 3. What exists (verified on feature tip `ef97c8477`, the source live as main `f58756c99`)

**Full-admin figures.** `ServiceBookingController::dashboard()` (`/v1/admin/service-bookings/dashboard`) counts by status
and sums `total_amount` by **booking date** (`created_at`) on the server's clock. `BeautyKpiService` and
`AnalyticsService` add a few service-booking counts to the general dashboard. None of these is reachable on the
Appointments plan. `AccessMap.php:37` gives that plan only `appointments` and `account`. Nothing anywhere reports:
- no-show or late-cancellation rates;
- money received;
- figures per team member;
- service-booking sources.

**Workspace.**
- `TakingsReport::for($orgId, $date)` is one venue day of money moved (managers; `GET /v1/admin/appointments/takings`).
- `dayOverview()` (frontend, `lib/status.ts`) counts the visible day's appointments by status.
- The navigation (`AppointmentsShell.tsx:49-54`) shows Takings only when `staff.can_manage`
  (`SetupAccess::canManage`: an active Staff row with role `super_admin` or `manager`).

**Data.**
- `service_bookings`:
  - `status`: one of `pending`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`;
  - `start_at` holds the venue's wall-clock digits (`VenueClock`), and `cancelled_at` is a real instant, stored UTC
    (`config/app.php` timezone UTC);
  - `total_amount` is after discounts; also `currency`, `service_id`, `service_master_id` (nullable) and `source`;
  - index `(organization_id, start_at)`.
- `service_booking_payments` is Part E's ledger, indexed by `service_booking_id`.
- `AppointmentMoney::figures()` (private) turns a booking and its ledger rows into:
  - `paid_in`, `paid_back` and `owed`;
  - the card money Stripe took (`cardPaid`) and refunds;
  - corrections;
  - the "marked paid before Part E" label (`legacy_marked_paid`).
- The free-cancellation window is the setting `services_cancel_hours` (default 24, Settings → Booking: "Free cancellation
  window for appointments (hours)"). The member portal's deadline is
  `AppointmentClock::toInstant(start_at, zone) − services_cancel_hours` (`App\Services\Portal\AppointmentClock`;
  `CancellationPolicy.php:48-53`).

**Sources written today:**
- staff (full admin and workspace): `admin`, `phone`, `walk_in`;
- member portal: `member_portal`;
- chat widget: `chat_widget`;
- public booking endpoint: a free lower-case tag, default `widget`, e.g. `landing`, `mobile_app` or a campaign tag
  (`ServicePublicController::bookingSource`).

Only public channels can write a value outside the staff list.

**Tests** run on SQLite in memory; production runs on Postgres.

## 4. What the figures mean

### 4.1 The period

- From–To are venue dates, both included; at most 366 days.
- An appointment belongs to the period when the venue date of its start is one of those days. Since `start_at` holds
  wall-clock digits, that is `start_at >= From 00:00` and `< (To + 1 day) 00:00`.
- Weeks run Monday to Sunday, as in the calendar.
- The whole organisation is counted, every brand, as on Takings.
- "Now" is the venue's clock (`VenueClock::now`).

### 4.2 Six groups

Every appointment in the period falls into exactly one group, by what it is now:

| Group | Rule |
|---|---|
| **Done** | status `completed` |
| **No-show** | status `no_show` |
| **Not marked yet** | status `pending`, `confirmed` or `in_progress`, and its start is not after now |
| **Booked ahead** | status `pending`, `confirmed` or `in_progress`, and its start is after now |
| **Cancelled late** | status `cancelled`, and `cancelled_at` is after the deadline `toInstant(start_at) − services_cancel_hours` (so a cancellation after the start is late too) |
| **Cancelled in time** | status `cancelled`, and `cancelled_at` is at or before that deadline, or not recorded |

- A booking with no cancellation time (older records) is never blamed.
- Any other status (none is written today) belongs to no group and is not counted anywhere.
- The deadline is the member portal's own (`CancellationPolicy`), so "late" means the same on every screen.

### 4.3 The one denominator

**Bookings due** = Done + No-show + Not marked yet + Cancelled late: the appointments the venue had to keep time for.
Every rate is out of bookings due:
- done share;
- no-show rate;
- late-cancellation rate;
- not-marked share.

The four add up to 100%. With no bookings due, every rate shows "—".

### 4.4 Money

All money is per currency and comes from `AppointmentMoney`'s own figures for each appointment, so it means exactly
what the appointment panel shows.

- **Value of visits done:** the sum of `total_amount` (after discounts) over Done.
- **Average per visit:** value of visits done ÷ the number of Done in that currency; "—" when there are none.
- **Money taken:** the sum of `paid_in − paid_back` over every appointment in the period, in any group. A no-show's
  kept deposit and an online payment for a visit booked ahead count. It counts the money whenever it was paid.
  Takings, by contrast, shows money by the day it moved; the screen says this in one line.
- **Still owed for visits done:** the sum of `owed` over Done.

Desk payments were first recorded on 2026-10-05 (Part E). Before that, a desk payment exists only as a "paid" label,
which `AppointmentMoney` already counts in full (`legacy_marked_paid`). A visit never marked paid shows as owed. When
the period starts before 2026-10-05 the screen says: "Desk payments before 5 Oct 2026 were not recorded here: money
taken may be lower, and still owed higher, than it really was."

### 4.5 By service and by person

- One row per service, and one per team member.
- A "No one assigned" row holds appointments with no team member.
- Columns: bookings due, done, no-shows (count and % of the row's bookings due), late cancellations (count and %),
  value of visits done.
- Rows with no bookings due are left out.
- Order: value of visits done in the period's main currency (the currency with the most Done), then bookings due, then
  name.
- Names come from the service and team-member records, brand-blind and including inactive ones (`is_active` false).
  A record deleted for good shows "(removed)".

### 4.6 Where bookings come from

This counts every appointment in the period, in all six groups:

| Group | Sources |
|---|---|
| **At the desk** | `admin`, `phone`, `walk_in` |
| **Online** | any other non-empty source: the booking page and its tags (`widget`, `landing`, `mobile_app`, a campaign tag), `member_portal`, `chat_widget` |
| **Other** | no source recorded |

The section shows the three counts and "booked online" = Online ÷ all three.

Section 1 of the conversation listed Other as "anything else". The code shows that only public channels write
non-staff values, so a custom tag is an online booking and Other holds only old rows with no source.

### 4.7 The period before

- A From–To that is exactly one calendar month is compared with the whole month before.
- Anything else is compared with the same number of days ending the day before From. This covers This week, Last week
  and any custom range.
- The server works this out; the screen sends only From and To.
- The period before is counted by the same rules with the same "now". It is normally all in the past, so it has
  nothing booked ahead.

## 5. The server

### 5.1 Endpoint

`GET /v1/admin/appointments/insights?from=YYYY-MM-DD&to=YYYY-MM-DD`, inside the existing `admin/appointments` group.
The Appointments plan's access map already covers it.

- **Managers only:** `SetupAccess::requireManager` → 403 `not_allowed`.
- **Period:** a missing or malformed date, a date that does not exist, From after To, or more than 366 days →
  422 `invalid_period` ("Choose a period of up to a year.").

Response:

```json
{
  "period":   { "from": "2026-10-06", "to": "2026-10-12", "days": 7 },
  "previous": { "from": "2026-09-29", "to": "2026-10-05", "days": 7 },
  "now": "2026-10-08T14:05",
  "cancel_hours": 24,
  "desk_ledger_since": "2026-10-05",
  "current": "<Figures>",
  "before":  "<Figures>"
}
```

`Figures`:

```json
{
  "groups":  { "done": 84, "no_show": 6, "unmarked": 9, "late_cancel": 9, "early_cancel": 14, "ahead": 31 },
  "due": 108,
  "money": { "EUR": { "done": 84, "value_done": 4210.0, "taken": 3950.0, "owed_done": 260.0 } },
  "main_currency": "EUR",
  "by_service": [ { "id": 3, "name": "Haircut", "due": 52, "done": 44, "no_show": 3, "late_cancel": 4,
                    "value_done": { "EUR": 1980.0 } } ],
  "by_person":  [ { "id": null, "name": null, "due": 2, "done": 2, "no_show": 0, "late_cancel": 0,
                    "value_done": { "EUR": 90.0 } } ],
  "sources": { "online": 61, "desk": 44, "other": 3 }
}
```

- The server sends counts and money only. The screen works out every rate and change from them, by the rules in §4,
  in one tested module.
- `name: null` with `id: null` is "No one assigned".
- `name: null` with an id is "(removed)".

### 5.2 Code

New, under `app/Services/Appointments/Insights/`:

- **`InsightsPeriod`** — a value object: `from`, `to`, `days`, `previous()`. Built by
  `InsightsPeriod::fromInput(?string $from, ?string $to)`, which throws `AppointmentRefused('invalid_period', …, 422)`.
  Pure; unit-tested.
- **`VisitGroup`** — `VisitGroup::of(string $status, CarbonImmutable $start, ?CarbonImmutable $cancelledAt,
  CarbonImmutable $now, int $cancelHours): ?string` returns one of the six group names or null. `$start`, `$now` and
  `$cancelledAt` are instants. Pure; unit-tested.
- **`InsightsReport`** — `InsightsReport::for(int $orgId, InsightsPeriod $period, CarbonImmutable $now): array`. For
  each of the two periods:
  1. One query for the period's appointments with only the needed columns, `withoutGlobalScope(BrandScope)` with the
     tenant scope kept: id, status, start_at, cancelled_at, service_id, service_master_id, source, total_amount,
     currency, payment_status, stripe_payment_intent_id, refunded_amount, meta, created_at.
  2. One query for their ledger rows: `service_booking_id IN (subquery of the same period)`.
  3. Groups and money in PHP.

  Then one query each for service and team-member names over both periods, and the setting and zone, read once.
  Query budget: `InsightsReport::for` runs at most 10 queries for any period up to a year, however many appointments
  it holds. The sign-in and manager check before it are not counted.

Changed:
- **`AppointmentMoney`** gains `public static function summaryFrom(ServiceBooking $b, Collection $rows): array`. It
  returns `figures($b, $rows)` from rows already loaded; `summary()` calls it. Nothing else in Part E changes.
- **`InsightsController`** (`app/Http/Controllers/Api/V1/Admin/Appointments/`) is thin: requireManager, period, report.
- **`routes/api.php`**: the one GET route.

Not built:
- no cache;
- no migration or table;
- no change to the full admin's dashboards, the Takings screen or any existing endpoint's answer.

## 6. The screen

- **Menu item "Insights"** next to Takings, shown only when `staff.can_manage`.
- **Route** `/appointments/insights?from=…&to=…`. Without a period in the address it opens on This week, so a period
  can be bookmarked or sent to a colleague.
- **Period picks:** This week, Last week, This month, Last month, Choose dates (From and To date inputs). They are
  worked out from the venue's today in the workspace bootstrap.
- **A line under the picks:** "6–12 Oct 2026 · compared with 29 Sep–5 Oct · late = cancelled inside 24 h". It
  carries the money note of §4.4 when the period starts before 2026-10-05.

**Seven tiles**, each with its value, its share or average, and the change from the period before:

| Tile | Value |
|---|---|
| Visits done | count (share of bookings due) |
| No-shows | count (rate) |
| Late cancellations | count (rate) |
| Value of visits done | money |
| Average per visit | money |
| Money taken | money |
| Still owed | money; no change shown |

Changes:
- Counts: "▲ 12 vs 72".
- Rates: "▼ 1.2 pts".
- Money: "▲ €530.00".
- "—" when the period before had nothing to compare.
- Green when the change is good (more visits, value, average or money taken; a lower no-show or late-cancellation
  rate). Red when it is bad. Plain when there is no change. The words say it too, so colour is never the only signal.
- Rates under 10% show one decimal place ("5.6%"); from 10% they show none ("78%").
- Several currencies: one line per currency in each money tile.

**Under the tiles:** "Out of {due} bookings due · {n} not marked yet (mark them Done or No-show) · {n} cancelled in
time · {n} booked ahead".

**Tables:**
- "By service" and "By person", with the columns and order of §4.5, money per currency.
- They scroll sideways at phone width.

**Where bookings come from:** "Online {n} · At the desk {n} · Other {n} — booked online: {x}%".

**States:**
- loading;
- an error notice in the workspace's own style, with the server's message;
- "No appointments in this period." when all six groups are empty.

**Other:**
- No chart library.
- The figures load through the workspace's API client.
- Every word is in all five languages (en, ru, de, fr, es); keys built at run time are listed in
  `appointmentsLocales.test.ts`.
- Money uses the money helper that Takings uses; dates use the workspace's wall-clock formatting.

**Code:**
- `frontend/src/appointments/insights/`:
  - `InsightsPage.tsx`;
  - `insightsMath.ts` (period picks, rates, changes, tones, formatting — pure);
  - its tests.
- `lib/api.ts`, `lib/types.ts`.
- `AppointmentsApp.tsx` (route) and `AppointmentsShell.tsx` (menu item).
- The five word lists.

## 7. Edge cases

- **Reopened visits** (Part F) count by what they are now: a reopened cancellation is a live visit again.
- **A moved visit** counts in the period where it now starts.
- **Clock changes** never move a visit to another day: days are the venue's dates and the digits are wall-clock. The
  late rule compares instants.
- **Changing the cancellation window** in Settings changes which past cancellations count as late. The screen always
  names the window it used.
- **A From–To wholly in the future** has everything booked ahead: rates are "—" and money taken counts only online
  payments made already.
- **A visit marked paid before Part E** counts as taken (§4.4).
- **A correction** (Part E) leaves the money out, as on the panel.
- **A card hold not yet charged** is not money taken.
- **Another organisation's appointments and ledger rows** never count: the tenant scope stays on every query, and the
  ledger query names the organisation.

## 8. Refusals

| Case | Answer |
|---|---|
| Not a manager | 403 `not_allowed` — "Only an owner or a manager can change this." (the existing sentence; the menu item is hidden for others) |
| Bad period | 422 `invalid_period` — "Choose a period of up to a year." |

The words for `invalid_period` are in all five languages.

## 9. Testing

**PHP, test-first:**
- `tests/Unit/Appointments/VisitGroupTest.php`:
  - every status;
  - cancelled exactly at the deadline (in time), one second after (late), and after the start (late);
  - no cancellation time (in time);
  - a start one minute before and after now;
  - a 24-hour window across the night the clocks change;
  - a window of 0 hours;
  - an unknown status (null).
- `tests/Unit/Appointments/InsightsPeriodTest.php`:
  - a calendar month → the previous month (incl. 31 → 30 days, and January → December of the year before);
  - a Monday–Sunday week → the week before;
  - a custom range → the same number of days just before;
  - 366 days allowed, 367 refused;
  - From after To refused;
  - 2026-02-30 refused;
  - a missing date refused.
- `tests/Feature/Appointments/InsightsTest.php`:
  - managers only (staff → 403);
  - each group counted once, with the four shares summing to bookings due;
  - money with:
    - a desk payment;
    - a card payment Stripe took;
    - a card refund;
    - a desk correction;
    - a no-show's kept deposit;
    - a legacy "paid" label;
    - a held card (not counted);
  - by service and by person, incl. "No one assigned" and a removed service;
  - sources incl. a campaign tag and no source;
  - the period before, by the month rule;
  - every brand counted;
  - another organisation's appointments and ledger rows never counted;
  - a year with 300 appointments answers within the query budget;
  - `invalid_period` answers.

**Frontend, test-first:**
- `insightsMath.test.ts`:
  - the period picks from a given today (a Monday, a Sunday, the 31st, 1 January);
  - rates with zero due ("—");
  - rate formatting (5.6% / 78%);
  - changes in counts, points and money;
  - tone per figure;
  - the "before 5 Oct" note.
- `insights.test.tsx` (static render):
  - tiles, the dates line and the "out of" line;
  - the tables with "No one assigned" and "(removed)";
  - the sources line;
  - the empty state;
  - the menu item for managers only.
- `appointmentsLocales.test.ts`: the new run-time keys in all five languages.

**Whole suites:** PHP by directory (64 groups and the new ones), `tsc -b`, `vitest`, `eslint`.

**Browser check before hand-over:**
- 1440 px and phone width, as a manager on the local copy (creating and dropping a missing local table as before).
- One period with a known mix of appointments: compare each figure by hand with the calendar and the panels.
- An axe accessibility pass.

## 10. What this part does not do

- No chart.
- No team utilisation (booked against working hours).
- No clients coming back.
- No members against non-members.
- No money by the day it moved over a range (Takings stays one day).
- No export or CSV.
- No email digest.
- No cache.
- No split by brand.
- No change to the full admin's dashboards.

## 11. Rollout

- No migration.
- The deploy follows the main-cut source-patch recipe, on the owner's explicit yes, as for E and F.
- After the deploy:
  - The prober checks for the new strings in the workspace bundle, and that `GET …/insights` answers 401 when not
    signed in (404 before).
  - The owner opens Insights as a manager on This month, and checks one day's money taken against Takings for
    visits paid the same day.
