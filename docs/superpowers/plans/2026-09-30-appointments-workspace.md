# HexaTech Appointments — First Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff user of an opted-in organisation opens `/appointments`, sees the day by team member, books a client into a free slot, moves, cancels and completes appointments with the client's real membership in view, and every one of those is the same record the full admin, the public widget and the member portal use.

**Architecture:** A second shell over the existing engine. Backend: one new route group `/api/v1/admin/appointments/*` behind a new `workspace:appointments` gate, with thin controllers over `ServiceSchedulingService`, `BookingPointsService`, `Guest`/`LoyaltyMember` and `AuditLog`; small services under `App\Services\Appointments`. The scheduler gains two optional parameters, a public read of working windows and a lock that closes the double-booking window. Frontend: `frontend/src/appointments/`, built like `frontend/src/portal/` (own shell, tokens scoped under `[data-appointments]`, own locale bundle, a sweep test), mounted by one route in `App.tsx`. No new table, no migration, no new dependency.

**Tech Stack:** Laravel 13 (PHP 8.4), Sanctum, PHPUnit on in-memory sqlite with the repo's minimal-schema traits; PostgreSQL 18 locally for the live pass; React 19, react-router 7, TanStack Query 5, Tailwind 3.4, i18next, lucide-react, Vitest (node environment, render-to-string).

**Spec:** `docs/superpowers/specs/2026-09-30-appointments-workspace-design.md` (approved 2026-09-30, commit `5d8b0cccd`). Read it first. Where this plan adds to it, the addition is listed under "Rulings made while planning".

## Global Constraints

- Work in worktree `C:\wamp64\www\Hexa-Tech-appointments`, branch `feature/appointments-workspace` (cut from production main `75ea05ea2`, **no upstream**). Never push this branch to `main`; never a bare `git push`. Never commit `frontend/dist`, `public/spa` or `resources/spa-shell/index.html` from it.
- Stage files by name. Never `git add -A` or `git add .` (the working-files folder `.superpowers/` lives in the tree).
- PHP is always `/c/wamp64/bin/php/php8.4.20/php.exe`. NEVER run a bare `php artisan test`. Every run is scoped to a file or directory, in the foreground, with `XDEBUG_MODE=off` and `--no-ansi`, redirected to a log, and you read the `Tests:` line yourself:
  `cd /c/wamp64/www/Hexa-Tech-appointments && XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test <path> --no-ansi > storage/logs/plan-test.log 2>&1; echo "exit=$?"; tail -n 30 storage/logs/plan-test.log`
  Below, "Run: `artisan test <path>`" means exactly that command with `<path>` filled in.
- Tests run on in-memory sqlite, where `App\Support\AdvisoryLock` does nothing. `AdvisoryLock` is the only place `pg_advisory_xact_lock` may appear.
- **No migration.** The local PostgreSQL database is shared with other checkouts: never `migrate`, never `migrate:fresh`, never a truncating seeder.
- The local `.env` sends mail through a real SMTP transport. Any command that boots the app outside PHPUnit (artisan serve, tinker, the probe scripts) is run with `MAIL_MAILER=log QUEUE_CONNECTION=sync` in its environment.
- Frontend commands run in `C:\wamp64\www\Hexa-Tech-appointments\frontend`. `node_modules` there is a junction (Task 0): never run `npm install`, never delete the folder with `rm -rf` or `Remove-Item -Recurse`. This plan adds no package. Checks: `npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing) and `npx eslint src/appointments`.
- Use the Edit and Write tools for file changes; Git Bash for POSIX commands; PowerShell for `robocopy`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Shared code may change only as the spec's §6 lists (S1–S9). Anything else in `app/`, `routes/`, `frontend/src` outside `frontend/src/appointments/` is read-only.
- The public booking widget, the member portal and the chat booking must behave exactly as before: same requests, responses, prices, team-member assignment order, emails.
- Workspace API error bodies are `{error: <snake_code>, message: <English sentence>}`.
- Every time the workspace API sends or accepts is the venue's wall clock as `YYYY-MM-DDTHH:mm` (no seconds, no offset, no `Z`). Frontend code never passes such a string to `new Date()`.
- Workspace frontend code (`frontend/src/appointments/**`) uses only `a-*` colour classes, calls only `/v1/admin/appointments/…`, and writes every string as `t('appointments.<key>', 'English fallback')` with the key present in all five `appointments.<lang>.json` files, with real translations (en, ru, de, fr, es). `tokens.test.ts` and the locale tests enforce all three.
- The interface name is the one constant `APP_NAME = 'HexaTech Appointments'` (frontend) and the `name` field of the bootstrap response (backend).
- Status colours are never the accent, and every status is shown as icon + word. Body text contrast is at least 4.5:1 (`theme/contrast.test.ts`).
- No production deploy, no push to `origin`, in any task of this plan.

## Review Focus

Inputs the spec implies but no task's tests exercised at first draft. Each now has a test in the task named.

1. **Save is double-clicked, or retried after a timeout.** One appointment; the second answer is the first with `replayed: true` — Task 8 `test_the_same_key_and_body_replays_the_first_appointment`; Task 17 `keeps the key across a failed save and changes it when the draft changes`.
2. **Two receptionists act on one appointment.** The second save (move or action) on a stale panel is refused with the current state, never applied — Task 9 `test_a_stale_revision_is_refused_with_the_current_appointment`, Task 10 `test_a_stale_action_is_refused`.
3. **The browser is in another time zone than the venue.** Cards sit at the stored hour and "now" is the venue's — Task 13 `wallClock` tests (`is the venue's clock, whatever zone this machine is in`, across the Riga clock change; no helper returns a `Date`).
4. **A client with a phone number and no email.** The booking is stored and the full admin's list, detail, calendar and export still answer — Task 11 `test_a_phone_only_client_booking_renders_in_the_full_admin`.
5. **Completing a visit that earns nothing** (not a member, programme off, points for bookings off, already awarded). No error; the answer names the reason — Task 3 preview tests, Task 10 `test_completing_a_non_members_visit_says_why_no_points`.
6. **A time the venue's clock skips** (02:30 → 03:30 on the spring change). Refused with `time_does_not_exist` — Task 8 `test_a_time_the_clock_skips_is_refused`.
7. **The flag is switched off while the workspace is open.** The next call answers 403 and the shell shows "switched off" with a way to the full admin — Task 4 `test_switching_the_flag_off_refuses_the_next_call`, Task 14 shell test `shows the switched-off notice on a 403 while the workspace was open`.
8. **Overlapping cards in one column** (a no-show and its replacement, or legacy double bookings). Both are visible side by side — Task 13 `places overlapping appointments in separate lanes`.
9. **An appointment outside the usual hours** (07:00, or ending 21:30). The grid grows to show it — Task 13 `widens the day to fit early and late appointments`, Task 15 `covers every column's hours and every appointment shown`.
10. **A booking that carries a card hold or a captured payment.** Cancel and no-show state what will happen to the money and change no payment field — Task 5 consequence tests, Task 10 `test_cancel_never_touches_the_payment_fields`.

## Rulings made while planning (the spec is silent; the owner may overturn any)

- **plan-1** The service catalogue (active services with duration, price and the ids of the team members who perform them) rides on the `calendar` response as `services`. The create panel needs it and the spec's endpoint table has no catalogue call.
- **plan-2** Calendar rows are a trimmed summary (`client: {id, name, is_member}`, `payment: {state}`, no notes, no contact details, no actions). The full resource with `actions`, `loyalty` and `history` is the detail call only. This is the spec's privacy rule applied to the payload, not just the screen.
- **plan-3** `calendar` accepts an optional `master_id`; working windows are computed for that team member only (week view), and for every active team member otherwise. Windows are computed only for ranges of 7 days or fewer.
- **plan-4** Extra error codes: `422 master_not_eligible` (the team member does not perform the service), `422 before_today`, `422 invalid_time`, `404 client_not_found | service_not_found | master_not_found | not_found`, `422 range_too_long`.
- **plan-5** One extra action, `award_points`, offered only on a completed appointment whose award did not happen and whose preview says points are due. It calls the same worker and is the "actionable reconciliation" the brief asks for when the award fails after the status was saved.
- **plan-6** `reserveSlot()` decides "this is a claim, not a quote" by `DB::transactionLevel() > 0`. Quotes run outside a transaction and take no lock.
- **plan-7** The scheduler's bulk path in the full admin writes one audit row per booking (so each booking's history is complete) and keeps its summary row.
- **plan-8** History shows audit rows whose subject is the booking. Changes made before this ships have no such row and do not appear.
- **plan-9** The replay lookup is scoped by organisation, key and source `staff`; the submission row stores the client's email (may be null) and the acting user's id in `request_payload`.
- **plan-10** The floating admin AI launcher (`AuthedFloatingAiChat` in `App.tsx`) is not rendered on `/appointments`. It sits outside the route tree and would otherwise float over the workspace.
- **plan-11** The create form keeps the time of the slot that was clicked while the client and the service are chosen, and checks it against the server's free times before it allows a save ("That time is no longer free"), rather than clearing it on every change.
- **plan-12** Industry nouns in the workspace are four standalone labels (`client`, `clients`, `team_member`, `service`), translated per industry. Sentences are whole translated strings and never have a noun inserted into them — that reads wrong in German and Russian.
- **plan-13** Amounts in the API are numbers; PHP sends a whole amount without a decimal point (`60`, not `60.0`). The frontend formats them with the admin's `money()`.

---

## How this plan was checked (2026-09-30)

Every code block in this plan was extracted and run before the plan was handed over, in a throwaway worktree cut from `origin/main` and a scratch folder, both since deleted. Nothing from that check is on this branch.

- **Backend.** All new files were copied in and every "modify" step was applied from the plan's own text. `tests/Feature/Appointments` and `tests/Unit/Appointments`: **140 passed** (the per-file counts each task states). With the plan applied, the existing suites were unchanged: Booking 432, Widget 53, Member 218, Admin 22, Loyalty 303, Stripe 20, Middleware 39, Auth 13, ApiAuthentication 6, ChatGptPortalNotes 7, the two route tests, Unit 671 (666 + this plan's 5).
- **Frontend.** `tsc` clean under the project's compiler flags, the project's ESLint config clean, **246 tests passed**, every partial edit to `CalendarPage.tsx` and `AppointmentPanel.tsx` applied as written, and all 117 literal translation keys present in the five bundles with matching English.
- **PostgreSQL.** The race probe of Task 21 was run against the local test organisation with temporary data, removed afterwards. With Task 2's fix a named booking and an "any team member" booking for one slot landed on different people; with the fix taken out the same race booked one person twice (the outputs are quoted in Task 21). The workspace's create was refused on a held slot, replayed on a repeated key, and its client, move, action, calendar and slot code ran on PostgreSQL without error.

This does not replace running the steps. If a snippet and the repository disagree, the tests decide; fix the code to make them pass and say what differed in the task report.

Not checked, because they need the running app: every browser step (Tasks 14–20), the production build (Task 21 Step 10), and the two HTTP-level claims the tests make only on sqlite (CORS for the `Idempotency-Key` header is already allowed by `app/Http/Middleware/Cors.php`).

---

## File Structure

**Backend — new**

| File | Responsibility |
|---|---|
| `app/Http/Middleware/RequireWorkspace.php` | The `workspace:<name>` gate. |
| `app/Console/Commands/AppointmentsWorkspace.php` | `workspace:appointments` — on, off, status, list. |
| `app/Services/Appointments/VenueClock.php` | Venue zone, venue "now"/"today", wall-clock format and parse. |
| `app/Services/Appointments/AppointmentRefused.php` | A refusal with an error code and HTTP status; renders itself as JSON. |
| `app/Services/Appointments/StaleAppointment.php` | A revision mismatch, carrying the current booking. |
| `app/Services/Appointments/AppointmentActions.php` | The transition table and each action's consequences. |
| `app/Services/Appointments/LoyaltyCard.php` | Member summary, benefits, points state for a client or a booking. |
| `app/Services/Appointments/AppointmentPresenter.php` | Summary and detail resources, payment state, revision, history. |
| `app/Services/Appointments/ClientDirectory.php` | Client search, duplicate check, create, profile. |
| `app/Services/Appointments/StaffBookingWriter.php` | Create and move, under the scheduler's lock, with replay. |
| `app/Services/Appointments/AppointmentActionRunner.php` | Runs one action under the row lock; calls the points worker. |
| `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php` | `GET bootstrap`. |
| `app/Http/Controllers/Api/V1/Admin/Appointments/CalendarController.php` | `GET calendar`, `GET slots`. |
| `app/Http/Controllers/Api/V1/Admin/Appointments/ClientController.php` | `GET clients`, `POST clients`, `GET clients/{id}`. |
| `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php` | `POST bookings`, `GET/PATCH bookings/{id}`, `POST bookings/{id}/actions`. |
| `tests/Concerns/SetsUpAppointmentsSchema.php` | The test schema and fixtures for every appointments test. |
| `tests/Feature/Appointments/*.php`, `tests/Unit/Appointments/*.php` | One test file per task. |

**Backend — modified (spec §6)**

| File | Change |
|---|---|
| `app/Models/Organization.php` | S1: `workspace()`, `workspaceEnabled()`, `setWorkspace()`, `workspacesPayload()`. |
| `bootstrap/app.php` | S2: alias `workspace`. |
| `routes/api.php` | S4: one route group inside the admin group. |
| `app/Services/ServiceSchedulingService.php` | S5a–d. |
| `app/Services/Loyalty/BookingPointsService.php` | S6: `previewForServiceBooking()`, `pointsOnBookingsEnabled()` made public. |
| `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` | S7: audit rows gain actor and subject. |
| `app/Http/Controllers/Api/V1/Auth/AuthController.php` | S8: `workspaces` key for enabled organisations. |

**Frontend — new, all under `frontend/src/appointments/`**

| File | Responsibility |
|---|---|
| `AppointmentsApp.tsx`, `AppointmentsProvider.tsx`, `AppointmentsShell.tsx` | Guard and routes; bootstrap query and context; sidebar, top bar, notices. |
| `theme/appointments.css`, `theme/contrast.test.ts` | `--a-*` tokens under `[data-appointments]`; contrast pins. |
| `tokens.test.ts` | Sweep: only `a-*` colours, only `/v1/admin/appointments/` calls. |
| `i18n/index.ts`, `i18n/appointments.{en,ru,de,fr,es}.json`, `i18n/appointmentsLocales.test.ts` | The bundle and its completeness test. |
| `lib/types.ts`, `lib/api.ts` | Types and the typed client. |
| `lib/wallClock.ts`, `lib/layout.ts`, `lib/status.ts`, `lib/prefs.ts`, `lib/landing.ts`, `lib/constants.ts` | Pure helpers, each with a test. |
| `lib/vocab.ts` | The industry nouns hook. |
| `ui/Button.tsx`, `ui/Field.tsx`, `ui/Notice.tsx`, `ui/StatusMark.tsx` | Primitives on `a-*` tokens. |
| `calendar/calendarState.ts`, `CalendarPage.tsx`, `Toolbar.tsx`, `TimeGrid.tsx` (day and week), `ListView.tsx`, `AppointmentCard.tsx`, `MiniMonth.tsx`, `DayOverview.tsx` | The calendar. |
| `panel/panelState.ts`, `consequences.ts`, `AppointmentPanel.tsx`, `CreateForm.tsx`, `ClientPicker.tsx`, `AppointmentView.tsx`, `MoveForm.tsx`, `ActionConfirm.tsx`, `LoyaltyCard.tsx`, `History.tsx` | The side panel. |
| `clients/ClientsPage.tsx`, `ClientProfile.tsx`, `ClientProfileView.tsx` | Clients. |

**Frontend — modified (spec §6, S9)**

| File | Change |
|---|---|
| `frontend/src/App.tsx` | One lazy route `/appointments/*`. |
| `frontend/src/pages/Login.tsx` | Landing choice at the two staff `navigate` calls. |
| `frontend/src/stores/authStore.ts` | Optional `workspaces` on `User`. |
| `frontend/tailwind.config.js` | `a` colour aliases. |
| `frontend/src/index.css` | One `@import`. |
| `frontend/src/i18n/localeCompleteness.test.ts` | Scan the new folder and prefix. |

**Docs — new:** `docs/appointments-workspace.md` (runbook: enable, disable, recover, what the workspace does not do).

---

### Task 0: Rig the worktree and record baselines

The worktree holds source only. PHPUnit needs `vendor` (a real copy — a junction makes it test the wrong tree) and `.env`; the frontend needs `node_modules` (a junction is fine).

**Files:**
- Create (untracked): `.superpowers/sdd/2026-09-30-appointments-workspace/progress.md`

- [ ] **Step 1: Keep working files out of git**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && printf '.superpowers/sdd/\n' >> "$(git rev-parse --git-common-dir)/info/exclude" && mkdir -p .superpowers/sdd/2026-09-30-appointments-workspace/tools && git status --short | head
```
Expected: no output from `git status` (the folder is ignored).

- [ ] **Step 2: Copy `vendor` and `.env`**

PowerShell:
```powershell
robocopy "C:\wamp64\www\Hexa-Tech-portal\vendor" "C:\wamp64\www\Hexa-Tech-appointments\vendor" /E /NFL /NDL /NJH /NP; if ($LASTEXITCODE -lt 8) { Copy-Item "C:\wamp64\www\Hexa-Tech\.env" "C:\wamp64\www\Hexa-Tech-appointments\.env"; "vendor + .env copied" } else { "robocopy failed: $LASTEXITCODE" }
```
Expected: `vendor + .env copied`. If the disk is full (`ENOSPC`), stop and report; do not delete anything to make room.

- [ ] **Step 3: Junction `frontend/node_modules`**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && cmd //c "mklink /J node_modules C:\\wamp64\\www\\Hexa-Tech-portal\\frontend\\node_modules" && ls node_modules/.bin/vitest
```
Expected: `Junction created …` and the vitest path printed.

- [ ] **Step 4: Backend baselines, by directory**

Run each and write its `Tests:` line into `progress.md`: `artisan test tests/Feature/Booking`, `tests/Feature/Widget`, `tests/Feature/Member`, `tests/Feature/Admin`, `tests/Feature/Loyalty`, `tests/Feature/Stripe`, `tests/Unit`.
Expected: every run ends with `exit=0` and a `Tests:` line with 0 failed (measured on this tree on 2026-09-30: Booking 432, Widget 53, Member 218, Admin 22, Loyalty 303, Stripe 20, Unit 666; a failure here is not yours — report it before continuing).

- [ ] **Step 5: Frontend baseline**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx tsc -b && npx vitest run 2>&1 | tail -n 8
```
Expected: `tsc` silent; vitest reports exactly 3 failed tests, all in `src/lib/plannerMeta.test.ts`. Record the totals in `progress.md`.

- [ ] **Step 6: No commit** (nothing tracked changed). Confirm with `git status --short` → empty.

---

### Task 1: Scheduler — ignore one booking, expose working windows (S5a–c)

Moving an appointment must not collide with itself, and the calendar must shade working hours with the scheduler's own calculation.

**Files:**
- Modify: `app/Services/ServiceSchedulingService.php:67-73` (`availableSlots` signature), `:90-94` (conflict preload), `:170` (`reserveSlot` signature), `:189-193` (conflict query), and add one public method above the `// ─── Internals` marker at `:209`
- Test: `tests/Feature/Appointments/SchedulerIgnoreBookingTest.php`

**Interfaces:**
- Produces:
  - `ServiceSchedulingService::availableSlots(Service $service, string $date, ?int $masterId = null, ?int $stepMinutes = null, int $leadMinutes = 60, ?int $ignoreBookingId = null): array`
  - `ServiceSchedulingService::reserveSlot(Service $service, ?int $masterId, string $startAt, ?int $ignoreBookingId = null): array` — same return shape as today: `['master' => ServiceMaster, 'start' => CarbonImmutable, 'end' => CarbonImmutable, 'duration_minutes' => int, 'price' => float]`; throws `\RuntimeException` when the slot is not available.
  - `ServiceSchedulingService::workingWindows(ServiceMaster $master, CarbonImmutable $date): array` — list of `['start' => CarbonImmutable, 'end' => CarbonImmutable]`, time off already subtracted.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/SchedulerIgnoreBookingTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\ServiceSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * Moving an appointment asks the scheduler "is this slot free, not counting
 * the appointment I am moving?". Without the optional booking id the
 * scheduler sees the appointment's own row as the conflict.
 */
class SchedulerIgnoreBookingTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00'));
        $this->orgId = Organization::create(['name' => 'Lumi', 'slug' => 'lumi-' . uniqid(), 'industry' => 'beauty'])->id;
        app()->instance('current_organization_id', $this->orgId);
    }

    private function booking(int $serviceId, int $masterId, string $start, string $end): ServiceBooking
    {
        return ServiceBooking::create([
            'organization_id' => $this->orgId, 'service_id' => $serviceId, 'service_master_id' => $masterId,
            'customer_name' => 'Ada', 'customer_email' => 'ada@example.test',
            'start_at' => $start, 'end_at' => $end, 'duration_minutes' => 45,
            'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'admin',
        ]);
    }

    public function test_reserve_slot_refuses_the_bookings_own_time_unless_told_to_ignore_it(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $own = $this->booking($service->id, $master->id, '2026-10-06 10:00:00', '2026-10-06 10:45:00');
        $scheduler = app(ServiceSchedulingService::class);

        try {
            $scheduler->reserveSlot($service, $master->id, '2026-10-06T10:15:00+00:00');
            $this->fail('The overlapping slot was reserved.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('no longer available', $e->getMessage());
        }

        $slot = $scheduler->reserveSlot($service, $master->id, '2026-10-06T10:15:00+00:00', $own->id);
        $this->assertSame('2026-10-06 10:15:00', $slot['start']->format('Y-m-d H:i:s'));
        $this->assertSame($master->id, $slot['master']->id);
    }

    public function test_ignoring_one_booking_still_sees_every_other(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $own = $this->booking($service->id, $master->id, '2026-10-06 10:00:00', '2026-10-06 10:45:00');
        $this->booking($service->id, $master->id, '2026-10-06 11:00:00', '2026-10-06 11:45:00');

        $this->expectException(\RuntimeException::class);
        app(ServiceSchedulingService::class)->reserveSlot($service, $master->id, '2026-10-06T10:30:00+00:00', $own->id);
    }

    public function test_available_slots_offer_the_ignored_bookings_time(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $own = $this->booking($service->id, $master->id, '2026-10-06 10:00:00', '2026-10-06 10:45:00');
        $scheduler = app(ServiceSchedulingService::class);

        $labels = fn (array $slots) => array_column($slots, 'time_label');

        $this->assertNotContains('10:00', $labels($scheduler->availableSlots($service, '2026-10-06', $master->id, null, 0)));
        $this->assertContains('10:00', $labels($scheduler->availableSlots($service, '2026-10-06', $master->id, null, 0, $own->id)));
    }

    public function test_working_windows_are_the_schedule_minus_time_off(): void
    {
        ['master' => $master] = $this->seedBookableService($this->orgId);
        DB::table('service_master_time_off')->insert([
            'organization_id' => $this->orgId, 'service_master_id' => $master->id,
            'date' => '2026-10-06', 'start_time' => '13:00:00', 'end_time' => '14:00:00', 'reason' => 'Lunch',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $windows = app(ServiceSchedulingService::class)->workingWindows($master, CarbonImmutable::parse('2026-10-06'));

        $this->assertSame(
            [['09:00', '13:00'], ['14:00', '17:00']],
            array_map(fn ($w) => [$w['start']->format('H:i'), $w['end']->format('H:i')], $windows),
        );
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `artisan test tests/Feature/Appointments/SchedulerIgnoreBookingTest.php`
Expected: FAIL — PHP ignores the extra argument, so the first test errors with the scheduler's "no longer available" exception and the third does not find `10:00`; the fourth errors with `Call to undefined method …::workingWindows()`. (The second passes already: it expects a refusal.)

- [ ] **Step 3: Add the optional parameter to `availableSlots()`**

In `app/Services/ServiceSchedulingService.php`, replace the signature at `:67-73`:

```php
    public function availableSlots(
        Service $service,
        string $date,
        ?int $masterId = null,
        ?int $stepMinutes = null,
        int $leadMinutes = 60,
        ?int $ignoreBookingId = null,
    ): array {
```

and the conflict preload at `:90-94`:

```php
            // Pre-load conflicting bookings for this master on this day.
            // $ignoreBookingId is the appointment being moved: its own row
            // must not make its own time look taken.
            $existing = ServiceBooking::where('service_master_id', $master->id)
                ->whereIn('status', ['pending', 'confirmed', 'in_progress'])
                ->whereDate('start_at', $day->toDateString())
                ->when($ignoreBookingId, fn ($q) => $q->where('id', '!=', $ignoreBookingId))
                ->orderBy('start_at')
                ->get(['start_at', 'end_at']);
```

- [ ] **Step 4: Add the optional parameter to `reserveSlot()`**

Replace the docblock and signature at `:166-170`:

```php
    /**
     * Throws if the requested slot is no longer available (used during confirm).
     * If masterId is null, picks the first master that can take it.
     * $ignoreBookingId is the appointment being moved, so it does not
     * conflict with itself.
     */
    public function reserveSlot(Service $service, ?int $masterId, string $startAt, ?int $ignoreBookingId = null): array
```

and the conflict query at `:189-193`:

```php
            $conflict = ServiceBooking::where('service_master_id', $master->id)
                ->whereIn('status', ['pending', 'confirmed', 'in_progress'])
                ->where('start_at', '<', $end)
                ->where('end_at', '>', $start)
                ->when($ignoreBookingId, fn ($q) => $q->where('id', '!=', $ignoreBookingId))
                ->exists();
```

- [ ] **Step 5: Expose the working windows**

Insert directly above the `// ─── Internals ───` line:

```php
    /**
     * A master's working windows on a date — the weekly schedule with time
     * off already taken out. The appointments calendar shades its columns
     * with this, so what staff see as "working" is what reserveSlot() will
     * accept.
     *
     * @return array<int, array{start: CarbonImmutable, end: CarbonImmutable}>
     */
    public function workingWindows(ServiceMaster $master, CarbonImmutable $date): array
    {
        return $this->workingWindowsForDate($master, $date->startOfDay());
    }

```

- [ ] **Step 6: Run the test to see it pass**

Run: `artisan test tests/Feature/Appointments/SchedulerIgnoreBookingTest.php`
Expected: `Tests: 4 passed`, `exit=0`.

- [ ] **Step 7: Prove no existing caller changed**

Run: `artisan test tests/Feature/Booking` then `artisan test tests/Feature/Widget`
Expected: the Task 0 baselines, 0 failed.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Services/ServiceSchedulingService.php tests/Feature/Appointments/SchedulerIgnoreBookingTest.php && git commit -q -F - <<'EOF'
Let the scheduler ignore the appointment being moved

reserveSlot() and availableSlots() take an optional booking id to leave out
of the conflict check, and workingWindows() exposes the existing window
calculation. Defaults keep every current caller identical.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 2: Scheduler — close the double-booking window (S5d)

A booking for "any team member" locks `svc:{service}`; a booking for a named person locks `svcm:{person}`. The two keys do not serialise, so both can pass the conflict check for the same person and time. The fix: when `reserveSlot()` runs inside a transaction (a claim), it first takes `svcm:{id}` for every candidate, in ascending id order. A named booking re-takes the lock it already holds (advisory locks are re-entrant); an "any" booking now waits for a named one, and the reverse. Candidates are still **checked** in their original order, so which person an "any" booking lands on does not change.

This reaches every organisation and every entry point. It is its own commit so it can be deployed or held on its own.

**Files:**
- Modify: `app/Services/ServiceSchedulingService.php` (imports at the top; `reserveSlot()` body; one private method at the end of the class)
- Test: `tests/Unit/Appointments/SchedulerCandidateLockTest.php`

**Interfaces:**
- Consumes: `App\Support\AdvisoryLock::within(string $key): void`.
- Produces: no signature change.

- [ ] **Step 1: Write the failing test**

sqlite never runs the lock and one PHP process cannot interleave two requests, so no behavioural test here can tell "lock, then check" from "check, then lock". The order of the calls is pinned on the source (the pattern of `tests/Unit/Portal/PortalIntentLockOrderTest.php`); the live race check is Task 21.

Create `tests/Unit/Appointments/SchedulerCandidateLockTest.php`:

```php
<?php

namespace Tests\Unit\Appointments;

use PHPUnit\Framework\TestCase;

/**
 * reserveSlot() must lock every candidate team member BEFORE it checks any
 * of them, and must lock them in ascending id order (two "any team member"
 * claims for different services that share people would otherwise be able
 * to deadlock). Structural, because the suite's sqlite connection never
 * issues the lock statement.
 */
class SchedulerCandidateLockTest extends TestCase
{
    private function source(): string
    {
        $source = file_get_contents(dirname(__DIR__, 3) . '/app/Services/ServiceSchedulingService.php');
        $this->assertIsString($source);

        return $source;
    }

    private function method(string $name): string
    {
        $source = $this->source();
        $start = strpos($source, "function {$name}(");
        $this->assertNotFalse($start, "{$name}() not found");
        $next = strpos($source, "\n    p", $start + 1); // the next public/private method
        $docblock = strpos($source, "\n    /**", $start + 1);
        $end = min(array_filter([$next, $docblock, strlen($source)], fn ($p) => $p !== false));

        return substr($source, $start, $end - $start);
    }

    public function test_reserve_slot_locks_the_candidates_before_checking_them(): void
    {
        $body = $this->method('reserveSlot');

        $lock = strpos($body, '$this->lockCandidates($masters)');
        $loop = strpos($body, 'foreach ($masters as $master)');

        $this->assertNotFalse($lock, 'reserveSlot() does not call lockCandidates()');
        $this->assertNotFalse($loop);
        $this->assertLessThan($loop, $lock, 'the candidates must be locked before the first conflict check');
    }

    public function test_the_lock_is_taken_in_ascending_id_order_and_only_inside_a_transaction(): void
    {
        $body = $this->method('lockCandidates');

        $this->assertStringContainsString('DB::transactionLevel() === 0', $body, 'a quote (no transaction) must take no lock');
        $this->assertStringContainsString('->sort()', $body, 'ids must be sorted so two claims take the locks in one order');
        $this->assertStringContainsString('AdvisoryLock::within("svcm:{$id}")', $body);
    }

    public function test_the_candidates_are_still_checked_in_their_original_order(): void
    {
        $body = $this->method('reserveSlot');

        // The collection handed to the loop is the one mastersForService()
        // returned — never a sorted copy — so an "any team member" booking
        // lands on the same person it landed on before this change.
        $this->assertStringContainsString('$masters = $this->mastersForService($service, $masterId);', $body);
        $this->assertStringNotContainsString('$masters = $masters->sort', $body);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `artisan test tests/Unit/Appointments/SchedulerCandidateLockTest.php`
Expected: FAIL — "reserveSlot() does not call lockCandidates()" and "lockCandidates() not found".

- [ ] **Step 3: Implement**

In `app/Services/ServiceSchedulingService.php`, add to the `use` block at the top (keep the existing imports; add only what is missing):

```php
use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\DB;
```

In `reserveSlot()`, directly after `$masters = $this->mastersForService($service, $masterId);` add:

```php
        $this->lockCandidates($masters);
```

Add as the last method of the class:

```php
    /**
     * Serialise this claim against every other claim on the same people.
     *
     * Callers lock `svcm:{master}` when the client named a master and
     * `svc:{service}` when it did not; those two keys do not exclude each
     * other, so an "any master" confirm and a named confirm could both pass
     * the conflict check for the same person and time and both insert. Taking
     * each candidate's own `svcm:` lock here closes that: a named confirm
     * re-takes the lock it already holds, an "any" confirm waits for it.
     *
     * Ascending id order, whatever order the candidates are checked in, so
     * two "any" confirms for different services that share people always
     * take the locks in one order and cannot deadlock.
     *
     * Only inside a transaction — that is a claim. A quote runs outside one
     * and must not queue behind writers.
     */
    private function lockCandidates(Collection $masters): void
    {
        if (DB::transactionLevel() === 0) {
            return;
        }

        foreach ($masters->pluck('id')->sort()->values() as $id) {
            AdvisoryLock::within("svcm:{$id}");
        }
    }
```

- [ ] **Step 4: Run the test to see it pass**

Run: `artisan test tests/Unit/Appointments/SchedulerCandidateLockTest.php`
Expected: `Tests: 3 passed`.

- [ ] **Step 5: Prove the widget, portal, chat and admin paths are unchanged**

Run, one after another: `artisan test tests/Feature/Booking`, `artisan test tests/Feature/Widget`, `artisan test tests/Feature/Member`, `artisan test tests/Feature/Admin`, `artisan test tests/Feature/Appointments`, `artisan test tests/Unit/Portal`
Expected: baselines, 0 failed (`tests/Unit/Portal/PortalIntentLockOrderTest.php` included — the portal's own lock order is untouched).

- [ ] **Step 6: Commit (on its own)**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Services/ServiceSchedulingService.php tests/Unit/Appointments/SchedulerCandidateLockTest.php && git commit -q -F - <<'EOF'
Lock every candidate before an "any team member" booking checks them

A booking without a named team member locked svc:{service} and a named one
locked svcm:{person}; the keys did not exclude each other, so both could
take the same person at the same time. reserveSlot() now takes each
candidate's svcm: lock, in ascending id order, whenever it runs inside a
transaction. Candidates are checked in the same order as before, and no
request, price, payload or email changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 3: Points — say what completing will award, and why not (S6)

The panel must state "Completing awards N points" or the reason none, from the same predicates the worker uses.

**Files:**
- Modify: `app/Services/Loyalty/BookingPointsService.php` (add one public method after `awardForServiceBooking()`; change `pointsOnBookingsEnabled` from `private` to `public`)
- Test: `tests/Feature/Appointments/PointsPreviewTest.php`

**Interfaces:**
- Produces:
  - `BookingPointsService::previewForServiceBooking(ServiceBooking $booking): array` → `['points' => int, 'reason' => ?string]`. `reason` is `null` when `points > 0`, otherwise one of `already_awarded`, `not_a_member`, `refunded`, `zero_amount`, `programme_off`, `points_on_bookings_off`. It answers "if this booking were completed now", so the booking's own status is not part of it.
  - `BookingPointsService::pointsOnBookingsEnabled(int $orgId): bool` (now public).
- `awardForServiceBooking()` is not edited.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/PointsPreviewTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\HotelSetting;
use App\Models\LoyaltyTier;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * previewForServiceBooking() is what the appointment panel prints before
 * staff press Complete. It must never disagree with what
 * awardForServiceBooking() then does.
 */
class PointsPreviewTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SeedsPointsFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
    }

    public function test_a_members_visit_previews_the_points_the_award_gives(): void
    {
        $f = $this->seedPointsFixture(); // 10 points per currency unit, tier earn rate 1.5
        $booking = $this->pointsBooking($f['orgId'], $f['member'], ['status' => 'confirmed', 'total_amount' => 54]);
        $service = app(BookingPointsService::class);

        $preview = $service->previewForServiceBooking($booking);

        $this->assertSame(['points' => 810, 'reason' => null], $preview); // floor(54 * 10 * 1.5)

        $booking->update(['status' => 'completed']);
        $tx = $service->awardForServiceBooking($booking->fresh());
        $this->assertSame($preview['points'], (int) $tx->points);
    }

    /** @return array<string, array{0: array<string, mixed>, 1: string}> */
    public static function reasons(): array
    {
        return [
            'no member on the booking' => [['member_id' => null], 'not_a_member'],
            'already awarded'          => [['points_awarded_at' => '2026-09-01 10:00:00'], 'already_awarded'],
            'refunded'                 => [['payment_status' => 'refunded'], 'refunded'],
            'nothing to pay'           => [['total_amount' => 0], 'zero_amount'],
        ];
    }

    #[DataProvider('reasons')]
    public function test_a_visit_that_earns_nothing_says_why(array $attrs, string $reason): void
    {
        $f = $this->seedPointsFixture();
        $booking = $this->pointsBooking($f['orgId'], $f['member'], array_merge(['status' => 'confirmed'], $attrs));
        $service = app(BookingPointsService::class);

        $this->assertSame(['points' => 0, 'reason' => $reason], $service->previewForServiceBooking($booking));

        // And the worker agrees: completing it awards nothing.
        $booking->update(['status' => 'completed']);
        $this->assertNull($service->awardForServiceBooking($booking->fresh()));
    }

    public function test_points_for_bookings_switched_off_is_its_own_reason(): void
    {
        $f = $this->seedPointsFixture();
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $f['orgId'], 'key' => 'points_on_bookings', 'value' => 'false']);
        HotelSetting::flushCacheFor($f['orgId']);
        $booking = $this->pointsBooking($f['orgId'], $f['member'], ['status' => 'confirmed']);
        $service = app(BookingPointsService::class);

        $this->assertFalse($service->pointsOnBookingsEnabled($f['orgId']));
        $this->assertSame(['points' => 0, 'reason' => 'points_on_bookings_off'], $service->previewForServiceBooking($booking));
    }

    public function test_a_venue_without_an_active_tier_has_no_programme(): void
    {
        $f = $this->seedPointsFixture();
        LoyaltyTier::withoutGlobalScopes()->where('organization_id', $f['orgId'])->update(['is_active' => false]);
        $booking = $this->pointsBooking($f['orgId'], $f['member'], ['status' => 'confirmed']);

        $this->assertSame(
            ['points' => 0, 'reason' => 'programme_off'],
            app(BookingPointsService::class)->previewForServiceBooking($booking),
        );
    }

    public function test_the_preview_writes_nothing(): void
    {
        $f = $this->seedPointsFixture();
        $booking = $this->pointsBooking($f['orgId'], $f['member'], ['status' => 'confirmed']);

        app(BookingPointsService::class)->previewForServiceBooking($booking);

        $this->assertNull($booking->fresh()->points_awarded_at);
        $this->assertSame(0, \App\Models\PointsTransaction::where('member_id', $f['member']->id)->count());
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `artisan test tests/Feature/Appointments/PointsPreviewTest.php`
Expected: FAIL — `Call to undefined method …::previewForServiceBooking()`, and `pointsOnBookingsEnabled()` is private.

- [ ] **Step 3: Implement**

In `app/Services/Loyalty/BookingPointsService.php`, insert after the closing brace of `awardForServiceBooking()`:

```php
    /**
     * What completing this appointment would award, and when nothing, why.
     * Read-only: the appointments workspace prints it before staff press
     * Complete. The predicates are awardForServiceBooking()'s own, in the
     * order a person would want the reason given — minus the booking's
     * status, since the question is "if it were completed now".
     *
     * @return array{points: int, reason: ?string}
     */
    public function previewForServiceBooking(ServiceBooking $booking): array
    {
        $orgId = (int) $booking->organization_id;
        $none = fn (string $reason): array => ['points' => 0, 'reason' => $reason];

        if ($booking->points_awarded_at !== null) {
            return $none('already_awarded');
        }
        if (!$booking->member_id) {
            return $none('not_a_member');
        }
        if ($booking->payment_status === 'refunded') {
            return $none('refunded');
        }
        if ((float) $booking->total_amount <= 0) {
            return $none('zero_amount');
        }
        if (!PortalBootstrap::loyaltyOn($orgId)) {
            return $none('programme_off');
        }
        if (!$this->pointsOnBookingsEnabled($orgId)) {
            return $none('points_on_bookings_off');
        }

        return $this->underBookingOrg($orgId, function () use ($booking, $orgId, $none) {
            $member = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereKey($booking->member_id)
                ->with('tier')
                ->first();
            if (!$member) {
                return $none('not_a_member');
            }

            $points = $this->loyalty->pointsForSpend($member, (float) $booking->total_amount);

            return $points > 0 ? ['points' => $points, 'reason' => null] : $none('zero_amount');
        });
    }
```

Change the visibility of the existing method (one word):

```php
    public function pointsOnBookingsEnabled(int $orgId): bool
```

- [ ] **Step 4: Run the test to see it pass**

Run: `artisan test tests/Feature/Appointments/PointsPreviewTest.php`
Expected: `Tests: 8 passed`.

- [ ] **Step 5: Prove the worker's own tests are unchanged**

Run: `artisan test tests/Feature/Booking/BookingPointsServiceTest.php` and `artisan test tests/Feature/Admin/ServiceBookingPointsTest.php`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Services/Loyalty/BookingPointsService.php tests/Feature/Appointments/PointsPreviewTest.php && git commit -q -F - <<'EOF'
Preview the points a completed appointment would award

previewForServiceBooking() returns the points, or the reason there are
none, from the same predicates the award uses. It writes nothing; the
award itself is unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---
### Task 4: The flag, the gate, the command and `GET bootstrap` (S1–S4)

**Files:**
- Modify: `app/Models/Organization.php` (add four methods directly after `hasActiveSubscription()`, near `:254-257`)
- Create: `app/Http/Middleware/RequireWorkspace.php`
- Modify: `bootstrap/app.php:56-66` (one alias)
- Create: `app/Console/Commands/AppointmentsWorkspace.php`
- Create: `app/Services/Appointments/VenueClock.php`
- Create: `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php`
- Modify: `routes/api.php` (one group, directly after the `Route::delete('service-bookings/{id}', …)` line near `:1283`)
- Create: `tests/Concerns/SetsUpAppointmentsSchema.php`
- Test: `tests/Feature/Appointments/WorkspaceGateTest.php`, `tests/Unit/Appointments/VenueClockTest.php`

**Interfaces:**
- Consumes: `BookingPointsService::pointsOnBookingsEnabled(int): bool` (Task 3); `App\Services\Portal\AppointmentClock::zoneFor(int): string`, `::existsLocally(\DateTimeInterface|string, string): bool`; `App\Services\Portal\PortalBootstrap::loyaltyOn(int): bool`; `App\Services\Booking\BookingCapability::appointmentsBookable(int, ?int): bool`.
- Produces:
  - `Organization::workspace(string $name): array{enabled: bool, landing: bool}`, `workspaceEnabled(string $name): bool`, `setWorkspace(string $name, bool $enabled, bool $landing = false): void`, `workspacesPayload(): ?array`.
  - Middleware alias `workspace` → `RequireWorkspace`; sets request attribute `workspace_org` (the `Organization`).
  - `VenueClock::WALL = 'Y-m-d\TH:i'`; `VenueClock::zone(int $orgId): string`; `isNamed(int $orgId): bool`; `now(int $orgId): CarbonImmutable` (the venue's wall clock, labelled UTC so it compares with stored digits); `today(int $orgId): string` (`Y-m-d`); `wall(\DateTimeInterface|string|null $stored): ?string`; `parse(string $wall): ?CarbonImmutable`; `exists(CarbonImmutable $wall, int $orgId): bool`.
  - Test trait `Tests\Concerns\SetsUpAppointmentsSchema` with `setUpAppointments(bool $enabled = true)`, properties `$org`, `$staff`, `$member`, `$tier`, `$service`, `$master`, and helpers `seedClient(array $attrs = []): Guest`, `seedMemberClient(): Guest`, `seedBooking(array $attrs = []): ServiceBooking`, `asStaff(): static`, `api(string $path): string`. Test classes use `DatabaseTransactions` and this trait only.
  - Route `GET /api/v1/admin/appointments/bootstrap`.

- [ ] **Step 1: Write the test trait**

Create `tests/Concerns/SetsUpAppointmentsSchema.php`:

```php
<?php

namespace Tests\Concerns;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;

/**
 * Everything an appointments-workspace test needs: the tables (built from
 * the repo's own schema traits, plus the columns only this workspace
 * reads), a loyalty-on beauty organisation with the workspace switched on,
 * a staff caller, one bookable service and team member, and a fixed clock.
 *
 * A test class uses `DatabaseTransactions` and this trait — NOT the traits
 * it composes — and calls setUpAppointments() from setUp().
 *
 * The clock is Monday 5 October 2026, 06:00 on the application clock (UTC).
 * The seeded team member (Mara Ilves) works 09:00–17:00 every day and
 * performs "Deep Tissue Massage" (45 minutes, 60.00 EUR).
 */
trait SetsUpAppointmentsSchema
{
    use SetsUpMinimalSchema, SetsUpServiceBookingSchema, SeedsPointsFixture, MakesAdminCaller;

    protected Organization $org;
    protected User $staff;
    protected LoyaltyMember $member;
    protected LoyaltyTier $tier;
    protected Service $service;
    protected ServiceMaster $master;

    protected function setUpAppointments(bool $enabled = true): void
    {
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();

        $this->addColumnsIfMissing('organizations', [
            'settings' => fn (Blueprint $t) => $t->text('settings')->nullable(),
            'timezone' => fn (Blueprint $t) => $t->string('timezone', 64)->nullable(),
            'currency' => fn (Blueprint $t) => $t->string('currency', 10)->nullable(),
        ]);
        $this->addColumnsIfMissing('guests', [
            'email_key' => fn (Blueprint $t) => $t->string('email_key')->nullable(),
            'phone_key' => fn (Blueprint $t) => $t->string('phone_key')->nullable(),
            'mobile'    => fn (Blueprint $t) => $t->string('mobile')->nullable(),
        ]);
        $this->addColumnsIfMissing('service_masters', [
            'title'      => fn (Blueprint $t) => $t->string('title')->nullable(),
            'sort_order' => fn (Blueprint $t) => $t->integer('sort_order')->default(0),
        ]);

        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00'));

        $fixture = $this->seedPointsFixture('Lumière Salon');
        $this->org = Organization::findOrFail($fixture['orgId']);
        $this->member = $fixture['member'];
        $this->tier = $fixture['tier'];
        if ($enabled) {
            $this->org->setWorkspace('appointments', true);
        }
        $this->staff = $this->staffUser($this->org);

        ['service' => $this->service, 'master' => $this->master] = $this->seedBookableService($this->org->id);

        // VenueClock memoises the venue's zone per request; a test is many.
        app()->forgetScopedInstances();
    }

    /** A client with a phone number and no email — never auto-enrolled, so never a member. */
    protected function seedClient(array $attrs = []): Guest
    {
        return Guest::create(array_merge([
            'organization_id' => $this->org->id,
            'full_name'       => 'Sophie Williams',
            'first_name'      => 'Sophie',
            'last_name'       => 'Williams',
            'phone'           => '+44 7700 900123',
            'phone_key'       => '447700900123',
        ], $attrs));
    }

    /** A client linked to the fixture's Gold member. */
    protected function seedMemberClient(): Guest
    {
        return $this->seedClient([
            'full_name'  => 'Ada Member',
            'first_name' => 'Ada',
            'last_name'  => 'Member',
            'email'      => 'ada@example.test',
            'email_key'  => 'ada@example.test',
            'phone'      => null,
            'phone_key'  => null,
            'member_id'  => $this->member->id,
        ]);
    }

    /** A confirmed, unpaid 10:00–10:45 appointment tomorrow with the seeded team member. */
    protected function seedBooking(array $attrs = []): ServiceBooking
    {
        return ServiceBooking::create(array_merge([
            'organization_id'   => $this->org->id,
            'service_id'        => $this->service->id,
            'service_master_id' => $this->master->id,
            'customer_name'     => 'Sophie Williams',
            'customer_email'    => '',
            'customer_phone'    => '+44 7700 900123',
            'start_at'          => '2026-10-06 10:00:00',
            'end_at'            => '2026-10-06 10:45:00',
            'duration_minutes'  => 45,
            'service_price'     => 60,
            'total_amount'      => 60,
            'currency'          => 'EUR',
            'status'            => 'confirmed',
            'payment_status'    => 'unpaid',
            'source'            => 'admin',
        ], $attrs));
    }

    protected function asStaff(): static
    {
        return $this->actingAs($this->staff, 'sanctum');
    }

    protected function api(string $path): string
    {
        return '/api/v1/admin/appointments/' . ltrim($path, '/');
    }

    protected function otherOrganization(): Organization
    {
        return Organization::create(['name' => 'Other Studio', 'slug' => 'other-' . uniqid(), 'industry' => 'beauty']);
    }

    /**
     * Run $fn with another organisation bound as the tenant. Every model
     * with BelongsToOrganization FORCES organization_id from the bound
     * tenant on create — an `organization_id` in the attributes is
     * overwritten — so a row for another organisation can only be made
     * this way.
     */
    protected function inOrganization(int $orgId, callable $fn): mixed
    {
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $orgId);
        try {
            return $fn();
        } finally {
            app()->instance('current_organization_id', $prior);
        }
    }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/Unit/Appointments/VenueClockTest.php`:

```php
<?php

namespace Tests\Unit\Appointments;

use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Tests\TestCase;

class VenueClockTest extends TestCase
{
    public function test_wall_prints_the_stored_digits_with_no_offset(): void
    {
        $this->assertSame('2026-10-06T10:00', VenueClock::wall('2026-10-06 10:00:00'));
        $this->assertSame('2026-10-06T10:00', VenueClock::wall(CarbonImmutable::parse('2026-10-06 10:00:00')));
        $this->assertSame('2026-10-06T10:00', VenueClock::wall('2026-10-06T10:00:00+00:00'));
        $this->assertNull(VenueClock::wall(null));
    }

    public function test_parse_accepts_only_the_wall_clock_form(): void
    {
        $this->assertSame('2026-10-06 10:00:00', VenueClock::parse('2026-10-06T10:00')?->format('Y-m-d H:i:s'));

        foreach (['2026-10-06 10:00', '2026-10-06T10:00:00', '2026-10-06T10:00Z', '2026-10-06T10:00+03:00', '2026-02-31T10:00', '2026-10-06T25:00', 'tomorrow', ''] as $bad) {
            $this->assertNull(VenueClock::parse($bad), "accepted: {$bad}");
        }
    }
}
```

Create `tests/Feature/Appointments/WorkspaceGateTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\User;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class WorkspaceGateTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    public function test_an_organisation_without_the_flag_is_refused(): void
    {
        $this->setUpAppointments(enabled: false);

        $this->asStaff()->getJson($this->api('bootstrap'))
            ->assertStatus(403)
            ->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_an_enabled_organisation_gets_its_bootstrap(): void
    {
        $this->setUpAppointments();

        $this->asStaff()->getJson($this->api('bootstrap'))
            ->assertOk()
            ->assertJsonPath('name', 'HexaTech Appointments')
            ->assertJsonPath('organization.name', 'Lumière Salon')
            ->assertJsonPath('organization.industry', 'beauty')
            ->assertJsonPath('venue.timezone', 'UTC')
            ->assertJsonPath('venue.timezone_named', false)
            ->assertJsonPath('venue.today', '2026-10-05')
            ->assertJsonPath('venue.currency', 'EUR')
            ->assertJsonPath('staff.role', 'manager')
            ->assertJsonPath('loyalty.programme_on', true)
            ->assertJsonPath('loyalty.points_on_bookings', true)
            ->assertJsonPath('readiness.services', 1)
            ->assertJsonPath('readiness.team', 1)
            ->assertJsonPath('readiness.bookable', true);
    }

    public function test_switching_the_flag_off_refuses_the_next_call(): void
    {
        $this->setUpAppointments();
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk();

        $this->org->setWorkspace('appointments', false);

        $this->asStaff()->getJson($this->api('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_a_member_and_an_anonymous_caller_never_reach_it(): void
    {
        $this->setUpAppointments();
        $memberUser = User::find($this->member->user_id);

        $this->getJson($this->api('bootstrap'))->assertStatus(401);
        $this->actingAs($memberUser, 'sanctum')->getJson($this->api('bootstrap'))->assertStatus(403);
    }

    public function test_another_organisations_flag_does_not_open_this_one(): void
    {
        $this->setUpAppointments();
        $otherStaff = $this->staffUser($this->otherOrganization());

        $this->actingAs($otherStaff, 'sanctum')->getJson($this->api('bootstrap'))
            ->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_every_appointments_route_carries_the_gate(): void
    {
        $routes = collect(Route::getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/appointments/'));

        $this->assertNotEmpty($routes);
        foreach ($routes as $route) {
            $this->assertContains('workspace:appointments', $route->gatherMiddleware(), "{$route->uri()} is reachable without the workspace flag");
        }
    }

    public function test_the_venues_today_follows_its_own_zone(): void
    {
        $this->setUpAppointments();
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 22:30:00')); // 01:30 on the 6th in Riga (UTC+3)

        $this->assertSame('Europe/Riga', VenueClock::zone($this->org->id));
        $this->assertTrue(VenueClock::isNamed($this->org->id));
        $this->assertSame('2026-10-06', VenueClock::today($this->org->id));
        $this->assertSame('2026-10-06 01:30:00', VenueClock::now($this->org->id)->format('Y-m-d H:i:s'));

        // 29 March 2026: Riga's clocks jump from 03:00 to 04:00.
        $this->assertFalse(VenueClock::exists(VenueClock::parse('2026-03-29T03:30'), $this->org->id));
        $this->assertTrue(VenueClock::exists(VenueClock::parse('2026-03-29T04:30'), $this->org->id));
    }

    public function test_the_organisation_helpers_default_to_off(): void
    {
        $this->setUpAppointments(enabled: false);

        $this->assertSame(['enabled' => false, 'landing' => false], $this->org->workspace('appointments'));
        $this->assertNull($this->org->workspacesPayload());

        $this->org->setWorkspace('appointments', true, landing: true);
        $this->assertSame(['appointments' => ['landing' => true]], $this->org->fresh()->workspacesPayload());

        // Landing means nothing while the workspace is off.
        $this->org->setWorkspace('appointments', false, landing: true);
        $this->assertSame(['enabled' => false, 'landing' => false], $this->org->fresh()->workspace('appointments'));
        $this->assertNull($this->org->fresh()->workspacesPayload());
    }

    public function test_the_command_switches_reports_and_lists(): void
    {
        $this->setUpAppointments(enabled: false);

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--on' => true, '--landing' => true])
            ->expectsOutputToContain('appointments workspace ON, landing on')
            ->assertSuccessful();
        $this->assertSame(['enabled' => true, 'landing' => true], $this->org->fresh()->workspace('appointments'));

        $this->artisan('workspace:appointments', ['--list' => true])
            ->expectsOutputToContain('Lumière Salon')
            ->assertSuccessful();

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--status' => true])
            ->expectsOutputToContain('appointments workspace ON')
            ->assertSuccessful();

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('appointments workspace off')
            ->assertSuccessful();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('appointments'));

        $this->artisan('workspace:appointments', ['org' => 999999, '--on' => true])->assertFailed();
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--on' => true, '--off' => true])->assertFailed();
    }
}
```

- [ ] **Step 3: Run them to see them fail**

Run: `artisan test tests/Unit/Appointments/VenueClockTest.php` and `artisan test tests/Feature/Appointments/WorkspaceGateTest.php`
Expected: FAIL — `Class "App\Services\Appointments\VenueClock" not found`; `Call to undefined method App\Models\Organization::setWorkspace()`.

- [ ] **Step 4: Organisation helpers (S1)**

In `app/Models/Organization.php`, directly after the closing brace of `hasActiveSubscription()`:

```php

    // ─── Workspaces ────────────────────────────────────────────
    // Opt-in product experiences beside the full admin; the appointments
    // workspace is the first. The switch lives under settings.workspaces —
    // a column no tenant endpoint and no billing sync writes — so only an
    // operator can turn one on (`php artisan workspace:appointments`).
    // Absent means off.

    /** @return array{enabled: bool, landing: bool} */
    public function workspace(string $name): array
    {
        $row = (array) data_get($this->settings ?? [], "workspaces.{$name}", []);
        $enabled = (bool) ($row['enabled'] ?? false);

        return [
            'enabled' => $enabled,
            // Landing means nothing while the workspace is off.
            'landing' => $enabled && (bool) ($row['landing'] ?? false),
        ];
    }

    public function workspaceEnabled(string $name): bool
    {
        return $this->workspace($name)['enabled'];
    }

    public function setWorkspace(string $name, bool $enabled, bool $landing = false): void
    {
        $settings = $this->settings ?? [];
        data_set($settings, "workspaces.{$name}", ['enabled' => $enabled, 'landing' => $enabled && $landing]);
        $this->forceFill(['settings' => $settings])->save();
    }

    /**
     * What a staff user's sign-in answer carries: the enabled workspaces
     * only, and null when there are none — so the answer of every
     * organisation that never opted in is unchanged.
     *
     * @return array<string, array{landing: bool}>|null
     */
    public function workspacesPayload(): ?array
    {
        $out = [];
        foreach (array_keys((array) data_get($this->settings ?? [], 'workspaces', [])) as $name) {
            $workspace = $this->workspace((string) $name);
            if ($workspace['enabled']) {
                $out[(string) $name] = ['landing' => $workspace['landing']];
            }
        }

        return $out ?: null;
    }
```

- [ ] **Step 5: The gate (S2)**

Create `app/Http/Middleware/RequireWorkspace.php`:

```php
<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware for an opt-in workspace: `workspace:appointments`.
 *
 * The switch is `organizations.settings.workspaces.<name>.enabled`, set by
 * an operator (`php artisan workspace:appointments`). Off — or absent —
 * answers 403 `workspace_disabled`. It runs after `tenant`, `admin` and
 * `check.subscription`: the organisation is bound, the caller is staff, and
 * the subscription rule is the admin group's own.
 */
class RequireWorkspace
{
    public function handle(Request $request, Closure $next, string $workspace): Response
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $org = $orgId ? Organization::find($orgId) : null;

        if (!$org || !$org->workspaceEnabled($workspace)) {
            return response()->json([
                'error'   => 'workspace_disabled',
                'message' => 'This workspace is not switched on for your organisation.',
            ], 403);
        }

        $request->attributes->set('workspace_org', $org);

        return $next($request);
    }
}
```

In `bootstrap/app.php`, add one line to the `$middleware->alias([...])` array, after the `'member.only'` line:

```php
            'workspace'          => \App\Http\Middleware\RequireWorkspace::class,
```

- [ ] **Step 6: The command (S3)**

Create `app/Console/Commands/AppointmentsWorkspace.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Switches the appointments workspace on or off for one organisation.
 *
 * Off deletes nothing: the API answers 403, /appointments sends staff back
 * to the full admin and sign-in lands on the dashboard. It does not undo a
 * booking, a status change or a points award made while it was on.
 */
class AppointmentsWorkspace extends Command
{
    protected $signature = 'workspace:appointments
                            {org? : Organization id}
                            {--on : Switch the workspace on}
                            {--off : Switch the workspace off}
                            {--landing : With --on: staff land on the workspace after signing in}
                            {--status : Show the current setting}
                            {--list : List every organization that has the workspace on}';

    protected $description = 'Switch the appointments workspace on or off for an organization.';

    public function handle(): int
    {
        if ($this->option('list')) {
            $rows = Organization::query()->orderBy('id')->get()
                ->filter(fn (Organization $o) => $o->workspaceEnabled('appointments'))
                ->map(fn (Organization $o) => [$o->id, $o->name, $o->workspace('appointments')['landing'] ? 'on' : 'off'])
                ->values()->all();

            if ($rows === []) {
                $this->line('No organization has the appointments workspace on.');
            } else {
                $this->table(['id', 'name', 'landing'], $rows);
            }

            return self::SUCCESS;
        }

        $org = $this->argument('org') ? Organization::find((int) $this->argument('org')) : null;
        if (!$org) {
            $this->error('Name an existing organization: workspace:appointments <id> --on|--off|--status (or --list).');

            return self::FAILURE;
        }
        if ($this->option('on') && $this->option('off')) {
            $this->error('Choose one of --on and --off.');

            return self::FAILURE;
        }

        if ($this->option('on')) {
            $org->setWorkspace('appointments', true, (bool) $this->option('landing'));
        } elseif ($this->option('off')) {
            $org->setWorkspace('appointments', false);
        }

        $state = $org->fresh()->workspace('appointments');
        $this->line(sprintf(
            'org %d (%s): appointments workspace %s%s',
            $org->id,
            $org->name,
            $state['enabled'] ? 'ON' : 'off',
            $state['enabled'] ? ', landing ' . ($state['landing'] ? 'on' : 'off') : '',
        ));

        return self::SUCCESS;
    }
}
```

- [ ] **Step 7: The venue clock**

Create `app/Services/Appointments/VenueClock.php`:

```php
<?php

namespace App\Services\Appointments;

use App\Services\Portal\AppointmentClock;
use Carbon\CarbonImmutable;

/**
 * Time for the appointments workspace.
 *
 * `service_bookings.start_at` / `end_at` hold the VENUE's wall clock in a
 * column without a zone, and the scheduler works in those digits. The
 * workspace never converts them: it prints them as `YYYY-MM-DDTHH:mm` with
 * no offset, and takes the same form back. The venue's zone is needed for
 * two things only — what "now" and "today" are at the venue, and whether a
 * wall-clock time exists there (a daylight-saving change skips an hour).
 */
final class VenueClock
{
    public const WALL = 'Y-m-d\TH:i';

    public static function zone(int $orgId): string
    {
        return AppointmentClock::zoneFor($orgId);
    }

    /** False when neither Settings nor the organisation names a zone other than UTC. */
    public static function isNamed(int $orgId): bool
    {
        return self::zone($orgId) !== 'UTC';
    }

    /** The venue's current wall clock, labelled UTC so it compares with stored digits. */
    public static function now(int $orgId): CarbonImmutable
    {
        $digits = CarbonImmutable::now(self::zone($orgId))->format('Y-m-d H:i:s');

        return CarbonImmutable::createFromFormat('!Y-m-d H:i:s', $digits, 'UTC');
    }

    /** The venue's date today, `Y-m-d`. */
    public static function today(int $orgId): string
    {
        return self::now($orgId)->format('Y-m-d');
    }

    /** Stored digits → `2026-10-06T10:00`. Any offset the value carries is ignored, never applied. */
    public static function wall(\DateTimeInterface|string|null $stored): ?string
    {
        if ($stored === null || $stored === '') {
            return null;
        }
        if ($stored instanceof \DateTimeInterface) {
            return $stored->format(self::WALL);
        }
        if (preg_match('/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/', trim($stored), $m)) {
            return $m[1] . 'T' . $m[2];
        }

        return CarbonImmutable::parse($stored)->format(self::WALL);
    }

    /** `2026-10-06T10:00` → the stored digits; null for anything else, including a date that does not exist. */
    public static function parse(string $wall): ?CarbonImmutable
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $wall)) {
            return null;
        }
        try {
            $parsed = CarbonImmutable::createFromFormat('!' . self::WALL, $wall, 'UTC');
        } catch (\Throwable) {
            return null;
        }

        // 31 February and 25:00 roll over instead of failing; the round trip catches both.
        return $parsed && $parsed->format(self::WALL) === $wall ? $parsed : null;
    }

    /** False for a time the venue's clock skips. */
    public static function exists(CarbonImmutable $wall, int $orgId): bool
    {
        return AppointmentClock::existsLocally($wall, self::zone($orgId));
    }
}
```

- [ ] **Step 8: `GET bootstrap` and the route group (S4)**

Create `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Models\Staff;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\BookingCapability;
use App\Services\Loyalty\BookingPointsService;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** What the appointments workspace needs before it can draw anything. */
class BootstrapController extends Controller
{
    public const NAME = 'HexaTech Appointments';

    public function show(Request $request, BookingCapability $capability, BookingPointsService $points): JsonResponse
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        $staff = Staff::withoutGlobalScopes()->where('user_id', $user->id)->first();
        $brandId = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $brand = $brandId ? Brand::find($brandId) : null;

        return response()->json([
            'name'         => self::NAME,
            'organization' => ['id' => $orgId, 'name' => (string) $org->name, 'industry' => (string) $org->resolved_industry],
            'brand'        => $brand ? ['id' => (int) $brand->id, 'name' => (string) $brand->name] : null,
            'venue'        => [
                'timezone'       => VenueClock::zone($orgId),
                'timezone_named' => VenueClock::isNamed($orgId),
                'today'          => VenueClock::today($orgId),
                'currency'       => $org->currency ?: 'EUR',
            ],
            'staff'        => ['name' => (string) $user->name, 'role' => $staff?->role],
            'loyalty'      => [
                'programme_on'       => PortalBootstrap::loyaltyOn($orgId),
                'points_on_bookings' => $points->pointsOnBookingsEnabled($orgId),
            ],
            'readiness'    => [
                'services' => Service::where('is_active', true)->count(),
                'team'     => ServiceMaster::where('is_active', true)->count(),
                'bookable' => $capability->appointmentsBookable($orgId, $brandId ? (int) $brandId : null),
            ],
        ]);
    }
}
```

In `routes/api.php`, directly after the `Route::delete('service-bookings/{id}', … 'destroy']);` line (the last of the "Services Reservation (Admin)" routes, near `:1283`):

```php

            // ─── Appointments workspace (opt-in per organisation) ───────────
            // A calendar-first shell over the same service bookings, clients
            // and loyalty records. `workspace:appointments` answers 403 until
            // an operator switches the organisation on
            // (`php artisan workspace:appointments <id> --on`).
            Route::prefix('appointments')->middleware('workspace:appointments')->group(function () {
                Route::get('bootstrap', [\App\Http\Controllers\Api\V1\Admin\Appointments\BootstrapController::class, 'show']);
            });
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `artisan test tests/Unit/Appointments/VenueClockTest.php` → `Tests: 2 passed`.
Run: `artisan test tests/Feature/Appointments/WorkspaceGateTest.php` → `Tests: 9 passed`.

- [ ] **Step 10: Route hygiene**

Run: `artisan test tests/Feature/RouteUniquenessTest.php`, `artisan test tests/Feature/RouteControllersExistTest.php`, `artisan test tests/Feature/Middleware`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Models/Organization.php app/Http/Middleware/RequireWorkspace.php bootstrap/app.php app/Console/Commands/AppointmentsWorkspace.php app/Services/Appointments/VenueClock.php app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php routes/api.php tests/Concerns/SetsUpAppointmentsSchema.php tests/Feature/Appointments/WorkspaceGateTest.php tests/Unit/Appointments/VenueClockTest.php && git commit -q -F - <<'EOF'
Add the appointments workspace flag, its gate and its bootstrap

An organisation opts in through settings.workspaces.appointments, switched
by `php artisan workspace:appointments`. The new route group answers 403
until then. Bootstrap names the venue's zone, its today and what the
programme does, so the client never guesses.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 5: The appointment resource — presenter, actions, loyalty card

Everything the panel prints is decided here, on the server: the payment label, which actions are allowed, and what each one will do.

**Files:**
- Create: `app/Services/Appointments/AppointmentRefused.php`, `StaleAppointment.php`, `AppointmentActions.php`, `LoyaltyCard.php`, `AppointmentPresenter.php`
- Test: `tests/Feature/Appointments/AppointmentPresenterTest.php`, `tests/Feature/Appointments/AppointmentActionsTest.php`

**Interfaces:**
- Consumes: `VenueClock::wall()` (Task 4); `BookingPointsService::previewForServiceBooking()`, `pointsOnBookingsEnabled()` (Task 3); `App\Services\DiscountService::benefitsFor(LoyaltyMember $member, ?int $propertyId)` (a collection of `TierBenefit` with a `benefit` relation); `PortalBootstrap::loyaltyOn(int)`.
- Produces:
  - `new AppointmentRefused(string $errorCode, string $message, int $status = 422, array $extra = [])` — extends `\DomainException`; Laravel renders it as `{error, message, ...$extra}` with `$status`. Throw it from anywhere; no controller catches it.
  - `new StaleAppointment(ServiceBooking $booking)` — extends `\DomainException`; public `$booking`. Controllers catch it and answer `409 stale`.
  - `AppointmentActions::FROM` (action → statuses it is allowed from), `AppointmentActions::MOVABLE`, `AppointmentActions::carriesCardPayment(ServiceBooking): bool`, `->allowed(ServiceBooking $b, string $action): bool`, `->for(ServiceBooking $b): array` (list of `['key' => string, 'allowed' => bool, 'consequences' => ['payment' => string, 'points' => ?array{points:int,reason:?string}, 'coupon' => string, 'message' => 'none']]`; keys in order `confirm, start, complete, no_show, cancel, mark_paid_at_venue, award_points, move`).
  - `LoyaltyCard::memberSummary(LoyaltyMember $m): array{id:int, number:string, tier:?string, points:int}` (static); `->forMember(int $orgId, ?LoyaltyMember $member): ?array` (`null` when the organisation runs no programme; else `['member' => ?array, 'benefits' => list]`); `->forBooking(ServiceBooking $b): ?array` (adds `points_on_bookings: bool`, `awarded: ?int`).
  - `AppointmentPresenter::revision(ServiceBooking $b): string` (static, 16 hex chars); `::paymentState(ServiceBooking $b): string` (static); `->summary(ServiceBooking $b): array`; `->detail(ServiceBooking $b): array`.
  - Payment states: `not_paid_online`, `card_held`, `paid_by_card`, `marked_paid`, `refunded`, `marked_refunded`, `partially_refunded`, `failed`, `hold_released`, `unknown`.
  - Payment consequences: `none`, `hold_will_be_charged`, `hold_will_be_released`, `captured_not_refunded`, `marked_only`. Coupon consequences: `none`, `not_returned`.

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/Appointments/AppointmentActionsTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Services\Appointments\AppointmentActions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentActionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    /** @return array<string, mixed> key => the action row */
    private function actionsFor(array $attrs): array
    {
        return collect(app(AppointmentActions::class)->for($this->seedBooking($attrs)))->keyBy('key')->all();
    }

    /** @return array<string, array{0: string, 1: list<string>}> */
    public static function allowedByStatus(): array
    {
        return [
            'pending'     => ['pending',     ['confirm', 'cancel', 'move']],
            'confirmed'   => ['confirmed',   ['start', 'complete', 'no_show', 'cancel', 'mark_paid_at_venue', 'move']],
            'in_progress' => ['in_progress', ['complete', 'cancel', 'mark_paid_at_venue', 'move']],
            'completed'   => ['completed',   ['mark_paid_at_venue']],
            'cancelled'   => ['cancelled',   []],
            'no_show'     => ['no_show',     []],
        ];
    }

    #[DataProvider('allowedByStatus')]
    public function test_each_status_allows_exactly_its_actions(string $status, array $expected): void
    {
        $allowed = array_keys(array_filter($this->actionsFor(['status' => $status]), fn ($a) => $a['allowed']));

        sort($allowed);
        sort($expected);
        $this->assertSame($expected, $allowed);
    }

    public function test_the_list_always_names_every_action_in_one_order(): void
    {
        $this->assertSame(
            ['confirm', 'start', 'complete', 'no_show', 'cancel', 'mark_paid_at_venue', 'award_points', 'move'],
            array_column(app(AppointmentActions::class)->for($this->seedBooking()), 'key'),
        );
    }

    public function test_marking_paid_at_the_venue_is_never_offered_on_a_card_payment(): void
    {
        // One intent per booking: the table allows a payment on one booking only.
        $this->assertFalse($this->actionsFor(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_123'])['mark_paid_at_venue']['allowed']);
        $this->assertFalse($this->actionsFor(['payment_status' => 'unpaid', 'stripe_payment_intent_id' => 'pi_124'])['mark_paid_at_venue']['allowed']);
        $this->assertFalse($this->actionsFor(['payment_status' => 'paid'])['mark_paid_at_venue']['allowed']);
        $this->assertTrue($this->actionsFor(['payment_status' => 'unpaid'])['mark_paid_at_venue']['allowed']);
    }

    public function test_a_held_card_is_charged_on_confirm_and_released_on_cancel_or_no_show(): void
    {
        $pending = $this->actionsFor(['status' => 'pending', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_123']);
        $this->assertSame('hold_will_be_charged', $pending['confirm']['consequences']['payment']);
        $this->assertSame('hold_will_be_released', $pending['cancel']['consequences']['payment']);

        $confirmed = $this->actionsFor(['status' => 'confirmed', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_124']);
        $this->assertSame('hold_will_be_released', $confirmed['no_show']['consequences']['payment']);
    }

    public function test_a_captured_payment_is_not_refunded_by_a_cancellation(): void
    {
        $a = $this->actionsFor(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_123']);

        $this->assertSame('captured_not_refunded', $a['cancel']['consequences']['payment']);
        $this->assertSame('captured_not_refunded', $a['no_show']['consequences']['payment']);
    }

    public function test_a_booking_without_a_card_payment_has_no_payment_consequence(): void
    {
        $a = $this->actionsFor([]);

        $this->assertSame('none', $a['cancel']['consequences']['payment']);
        $this->assertSame('none', $a['confirm']['consequences']['payment']);
        $this->assertSame('marked_only', $a['mark_paid_at_venue']['consequences']['payment']);
        // A mock intent (demo mode) is not a card payment.
        $mock = $this->actionsFor(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_abc']);
        $this->assertSame('none', $mock['cancel']['consequences']['payment']);
    }

    public function test_cancelling_says_a_coupon_is_not_returned(): void
    {
        $this->assertSame('not_returned', $this->actionsFor(['discount_source' => 'offer', 'discount_source_id' => 7])['cancel']['consequences']['coupon']);
        $this->assertSame('not_returned', $this->actionsFor(['discount_source' => 'reward', 'discount_source_id' => 7])['cancel']['consequences']['coupon']);
        $this->assertSame('none', $this->actionsFor(['discount_source' => 'tier_benefit', 'discount_source_id' => 7])['cancel']['consequences']['coupon']);
        $this->assertSame('none', $this->actionsFor([])['cancel']['consequences']['coupon']);
    }

    public function test_complete_carries_the_points_preview_and_nothing_sends_a_message(): void
    {
        $member = $this->actionsFor(['member_id' => $this->member->id, 'total_amount' => 60]);
        $this->assertSame(['points' => 900, 'reason' => null], $member['complete']['consequences']['points']); // floor(60 * 10 * 1.5)

        $walkIn = $this->actionsFor([]);
        $this->assertSame(['points' => 0, 'reason' => 'not_a_member'], $walkIn['complete']['consequences']['points']);

        foreach ($walkIn as $row) {
            $this->assertSame('none', $row['consequences']['message']);
        }
        $this->assertNull($walkIn['cancel']['consequences']['points']);
    }

    public function test_award_points_appears_only_when_a_completed_visits_award_is_still_due(): void
    {
        $due = $this->actionsFor(['status' => 'completed', 'member_id' => $this->member->id]);
        $this->assertTrue($due['award_points']['allowed']);
        $this->assertSame(900, $due['award_points']['consequences']['points']['points']);

        $this->assertFalse($this->actionsFor(['status' => 'completed', 'member_id' => $this->member->id, 'points_awarded_at' => now()])['award_points']['allowed']);
        $this->assertFalse($this->actionsFor(['status' => 'completed'])['award_points']['allowed']);
        $this->assertFalse($this->actionsFor(['status' => 'confirmed', 'member_id' => $this->member->id])['award_points']['allowed']);
    }
}
```

Create `tests/Feature/Appointments/AppointmentPresenterTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentPresenterTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function presenter(): AppointmentPresenter
    {
        return app(AppointmentPresenter::class);
    }

    public function test_the_summary_is_what_a_calendar_card_shows_and_nothing_more(): void
    {
        $booking = $this->seedBooking(['staff_notes' => 'Allergic to lavender', 'customer_email' => 'sophie@example.test']);

        $summary = $this->presenter()->summary($booking);

        $this->assertSame('2026-10-06T10:00', $summary['start']);
        $this->assertSame('2026-10-06T10:45', $summary['end']);
        $this->assertSame(45, $summary['duration_minutes']);
        $this->assertSame(['id' => $this->service->id, 'name' => 'Deep Tissue Massage'], $summary['service']);
        $this->assertSame(['id' => $this->master->id, 'name' => 'Mara Ilves'], $summary['master']);
        $this->assertSame(['id' => null, 'name' => 'Sophie Williams', 'is_member' => false], $summary['client']);
        $this->assertSame('confirmed', $summary['status']);
        $this->assertSame(['state' => 'not_paid_online'], $summary['payment']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $summary['revision']);

        // Privacy: no notes, no contact details, no loyalty on the calendar payload.
        $json = json_encode($summary);
        $this->assertStringNotContainsString('lavender', $json);
        $this->assertStringNotContainsString('sophie@example.test', $json);
        $this->assertStringNotContainsString('7700', $json);
        foreach (['notes', 'actions', 'loyalty', 'history', 'price'] as $key) {
            $this->assertArrayNotHasKey($key, $summary);
        }
    }

    /** @return array<string, array{0: array<string, mixed>, 1: string}> */
    public static function paymentStates(): array
    {
        return [
            'unpaid'                       => [['payment_status' => 'unpaid'], 'not_paid_online'],
            'card held'                    => [['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_1'], 'card_held'],
            'paid by card'                 => [['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_1'], 'paid_by_card'],
            'paid, no card behind it'      => [['payment_status' => 'paid'], 'marked_paid'],
            'paid, demo intent'            => [['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_1'], 'marked_paid'],
            'refunded with an amount'      => [['payment_status' => 'refunded', 'refunded_amount' => 60], 'refunded'],
            'refunded, only a label'       => [['payment_status' => 'refunded'], 'marked_refunded'],
            'partially refunded'           => [['payment_status' => 'partially_refunded', 'refunded_amount' => 20], 'partially_refunded'],
            'failed'                       => [['payment_status' => 'failed'], 'failed'],
            'hold released by the job'     => [['payment_status' => 'cancelled', 'stripe_payment_intent_id' => 'pi_1'], 'hold_released'],
            'a value nobody planned for'   => [['payment_status' => 'disputed'], 'unknown'],
        ];
    }

    #[DataProvider('paymentStates')]
    public function test_the_payment_state_never_claims_more_than_the_row_shows(array $attrs, string $state): void
    {
        $this->assertSame($state, AppointmentPresenter::paymentState($this->seedBooking($attrs)));
    }

    public function test_the_revision_changes_with_anything_a_second_operator_could_change(): void
    {
        $booking = $this->seedBooking();
        $before = AppointmentPresenter::revision($booking);

        $this->assertSame($before, AppointmentPresenter::revision($booking->fresh()));

        foreach ([
            ['status' => 'in_progress'],
            ['payment_status' => 'paid'],
            ['start_at' => '2026-10-06 11:00:00', 'end_at' => '2026-10-06 11:45:00'],
            ['staff_notes' => 'Running late'],
        ] as $change) {
            $changed = $this->seedBooking($change);
            $changed->forceFill(['updated_at' => $booking->updated_at])->saveQuietly();
            $this->assertNotSame($before, AppointmentPresenter::revision($changed->fresh()), json_encode($change));
        }
    }

    public function test_the_detail_carries_the_client_the_price_the_actions_and_the_member(): void
    {
        $client = $this->seedMemberClient();
        $booking = $this->seedBooking([
            'guest_id' => $client->id, 'member_id' => $this->member->id,
            'customer_name' => 'Ada Member', 'customer_email' => 'ada@example.test', 'customer_phone' => null,
            'staff_notes' => 'Prefers firm pressure',
            'list_amount' => 60, 'discount_amount' => 6, 'discount_label' => 'Gold 10%', 'total_amount' => 54,
        ]);

        $detail = $this->presenter()->detail($booking);

        $this->assertSame($client->id, $detail['client']['id']);
        $this->assertSame('ada@example.test', $detail['client']['email']);
        $this->assertNull($detail['client']['phone']);
        $this->assertSame(['id' => $this->member->id, 'number' => $this->member->member_number, 'tier' => 'Gold', 'points' => 0], $detail['client']['member']);
        $this->assertSame(['total' => 54.0, 'list' => 60.0, 'discount_label' => 'Gold 10%', 'currency' => 'EUR'], $detail['price']);
        $this->assertSame(['customer' => null, 'staff' => 'Prefers firm pressure'], $detail['notes']);
        $this->assertSame('not_paid_online', $detail['payment']['state']);
        $this->assertFalse($detail['payment']['carries_card_payment']);
        $this->assertCount(8, $detail['actions']);
        $this->assertSame($this->member->id, $detail['loyalty']['member']['id']);
        $this->assertTrue($detail['loyalty']['points_on_bookings']);
        $this->assertNull($detail['loyalty']['awarded']);
        $this->assertSame([], $detail['history']);
    }

    public function test_a_phone_only_client_has_a_null_email_not_an_empty_string(): void
    {
        $detail = $this->presenter()->detail($this->seedBooking(['customer_email' => '']));

        $this->assertNull($detail['client']['email']);
        $this->assertSame('+44 7700 900123', $detail['client']['phone']);
        $this->assertNull($detail['client']['member']);
        $this->assertNull($detail['loyalty']['member']);
    }

    public function test_the_loyalty_card_is_absent_when_the_venue_runs_no_programme(): void
    {
        LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['is_active' => false]);

        $this->assertNull($this->presenter()->detail($this->seedBooking(['member_id' => $this->member->id]))['loyalty']);
    }

    public function test_awarded_points_come_from_the_ledger(): void
    {
        $booking = $this->seedBooking(['status' => 'completed', 'member_id' => $this->member->id, 'points_awarded_at' => now()]);
        PointsTransaction::create([
            'organization_id' => $this->org->id, 'member_id' => $this->member->id, 'points' => 900, 'type' => 'earn',
            'reference_type' => 'service_booking', 'reference_id' => $booking->id, 'description' => 'Appointment',
        ]);

        $this->assertSame(900, $this->presenter()->detail($booking)['loyalty']['awarded']);
    }

    public function test_history_lists_the_bookings_audit_rows_newest_first_with_the_actor(): void
    {
        $booking = $this->seedBooking();
        AuditLog::record('service_booking.created', $booking, ['status' => 'confirmed'], [], $this->staff, 'Created');
        AuditLog::record('service_booking.moved', $booking, ['start' => '2026-10-06T11:00'], ['start' => '2026-10-06T10:00'], $this->staff, 'Moved');
        AuditLog::record('service_booking.created', $this->seedBooking(), [], [], $this->staff, 'Someone else\'s');

        $history = $this->presenter()->detail($booking)['history'];

        $this->assertSame(['service_booking.moved', 'service_booking.created'], array_column($history, 'action'));
        $this->assertSame('Staff', $history[0]['actor']);
        $this->assertSame(['old' => ['start' => '2026-10-06T10:00'], 'new' => ['start' => '2026-10-06T11:00']], $history[0]['changes']);
        $this->assertStringEndsWith('+00:00', $history[0]['at']);
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `artisan test tests/Feature/Appointments/AppointmentActionsTest.php` and `artisan test tests/Feature/Appointments/AppointmentPresenterTest.php`
Expected: FAIL — `Class "App\Services\Appointments\AppointmentActions" not found`, `… AppointmentPresenter not found`.

- [ ] **Step 3: The two refusals**

Create `app/Services/Appointments/AppointmentRefused.php`:

```php
<?php

namespace App\Services\Appointments;

use Illuminate\Http\JsonResponse;

/**
 * The workspace says no, with a code the client can act on. Thrown from
 * anywhere under a workspace controller; Laravel's handler calls render()
 * before any registered callback, so no controller needs to catch it, and a
 * transaction it is thrown inside rolls back.
 *
 * A \DomainException, not a \RuntimeException: the scheduler signals "slot
 * taken" with a bare \RuntimeException and its callers catch exactly that.
 */
final class AppointmentRefused extends \DomainException
{
    /** @param array<string, mixed> $extra Merged into the answer beside `error` and `message`. */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
        public readonly array $extra = [],
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['error' => $this->errorCode, 'message' => $this->getMessage()] + $this->extra, $this->status);
    }

    /** An expected refusal, not an incident: keep it out of the error log. */
    public function report(): void
    {
    }
}
```

Create `app/Services/Appointments/StaleAppointment.php`:

```php
<?php

namespace App\Services\Appointments;

use App\Models\ServiceBooking;

/**
 * The client saved against a version of the appointment that someone has
 * changed since. The controller answers 409 `stale` with the current
 * appointment so the panel can show what changed.
 */
final class StaleAppointment extends \DomainException
{
    public function __construct(public readonly ServiceBooking $booking)
    {
        parent::__construct('This appointment was changed by someone else. Review the current details and try again.');
    }

    /** Throws when $revision is not the booking's current one. Call it under the row lock. */
    public static function unless(ServiceBooking $booking, string $revision): void
    {
        if (!hash_equals(AppointmentPresenter::revision($booking), $revision)) {
            throw new self($booking);
        }
    }

    public function report(): void
    {
    }
}
```

- [ ] **Step 4: Actions and their consequences**

Create `app/Services/Appointments/AppointmentActions.php`:

```php
<?php

namespace App\Services\Appointments;

use App\Models\ServiceBooking;
use App\Services\Loyalty\BookingPointsService;

/**
 * What staff may do to an appointment from the workspace, and what each
 * action will really cause. The panel prints these; it derives nothing.
 *
 * The consequences describe existing behaviour this class does not own:
 *  - the capture job (bookings:capture-pending-pis) charges a held card once
 *    the booking is no longer `pending`, and releases the hold of a booking
 *    that is `cancelled` or `no_show`;
 *  - nothing refunds a captured payment on a staff cancellation;
 *  - nothing returns a coupon on a staff cancellation;
 *  - no staff action sends the client a message.
 */
final class AppointmentActions
{
    /** action => the statuses it is allowed from */
    public const FROM = [
        'confirm'            => ['pending'],
        'start'              => ['confirmed'],
        'complete'           => ['confirmed', 'in_progress'],
        'no_show'            => ['confirmed'],
        'cancel'             => ['pending', 'confirmed', 'in_progress'],
        'mark_paid_at_venue' => ['confirmed', 'in_progress', 'completed'],
        'award_points'       => ['completed'],
    ];

    /** Statuses an appointment can be moved in. `completed`, `cancelled` and `no_show` are final here. */
    public const MOVABLE = ['pending', 'confirmed', 'in_progress'];

    public function __construct(private readonly BookingPointsService $points)
    {
    }

    /** A real Stripe intent — not none, and not the demo mode's `pi_mock_…`. */
    public static function carriesCardPayment(ServiceBooking $b): bool
    {
        $intent = (string) $b->stripe_payment_intent_id;

        return str_starts_with($intent, 'pi_') && !str_starts_with($intent, 'pi_mock_');
    }

    public function allowed(ServiceBooking $b, string $action): bool
    {
        if ($action === 'move') {
            return in_array((string) $b->status, self::MOVABLE, true);
        }
        if (!in_array((string) $b->status, self::FROM[$action] ?? [], true)) {
            return false;
        }

        return match ($action) {
            // Only where no payment of any kind is recorded against the booking.
            'mark_paid_at_venue' => (string) $b->payment_status === 'unpaid' && empty($b->stripe_payment_intent_id),
            // Only when the award did not happen and one is due.
            'award_points'       => $this->points->previewForServiceBooking($b)['points'] > 0,
            default              => true,
        };
    }

    /** @return list<array{key: string, allowed: bool, consequences: array<string, mixed>}> */
    public function for(ServiceBooking $b): array
    {
        $out = [];
        foreach ([...array_keys(self::FROM), 'move'] as $action) {
            $out[] = ['key' => $action, 'allowed' => $this->allowed($b, $action), 'consequences' => $this->consequences($b, $action)];
        }

        return $out;
    }

    /** @return array{payment: string, points: ?array{points: int, reason: ?string}, coupon: string, message: string} */
    public function consequences(ServiceBooking $b, string $action): array
    {
        $card = self::carriesCardPayment($b);
        $held = $card && in_array((string) $b->payment_status, ['authorized', 'pending'], true);
        $captured = $card && in_array((string) $b->payment_status, ['paid', 'partially_refunded'], true);

        return [
            'payment' => match ($action) {
                'confirm'            => $held ? 'hold_will_be_charged' : 'none',
                'cancel', 'no_show'  => $held ? 'hold_will_be_released' : ($captured ? 'captured_not_refunded' : 'none'),
                'mark_paid_at_venue' => 'marked_only',
                default              => 'none',
            },
            'points'  => in_array($action, ['complete', 'award_points'], true) ? $this->points->previewForServiceBooking($b) : null,
            'coupon'  => $action === 'cancel' && in_array((string) $b->discount_source, ['offer', 'reward'], true) ? 'not_returned' : 'none',
            'message' => 'none',
        ];
    }
}
```

- [ ] **Step 5: The loyalty card**

Create `app/Services/Appointments/LoyaltyCard.php`:

```php
<?php

namespace App\Services\Appointments;

use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\DiscountService;
use App\Services\Loyalty\BookingPointsService;
use App\Services\Portal\PortalBootstrap;

/**
 * The client's real membership, read from the programme's own records:
 * the member row's tier and balance, the tier's benefits through the
 * discount engine, and what the ledger says this booking was awarded.
 * It keeps no balance of its own.
 */
final class LoyaltyCard
{
    public function __construct(
        private readonly DiscountService $discounts,
        private readonly BookingPointsService $points,
    ) {
    }

    /** @return array{id: int, number: string, tier: ?string, points: int} */
    public static function memberSummary(LoyaltyMember $member): array
    {
        $member->loadMissing('tier');

        return [
            'id'     => (int) $member->id,
            'number' => (string) $member->member_number,
            'tier'   => $member->tier?->name,
            'points' => (int) $member->current_points,
        ];
    }

    /**
     * Null when the organisation runs no programme — the card is not shown
     * at all. `member` is null for a client who is not a member.
     *
     * @return array{member: ?array, benefits: list<array{name: ?string, display: ?string, description: ?string}>}|null
     */
    public function forMember(int $orgId, ?LoyaltyMember $member): ?array
    {
        if (!PortalBootstrap::loyaltyOn($orgId)) {
            return null;
        }
        if (!$member) {
            return ['member' => null, 'benefits' => []];
        }

        return [
            'member'   => self::memberSummary($member),
            'benefits' => $this->discounts->benefitsFor($member, null)->map(fn ($tb) => [
                'name'        => $tb->benefit?->name,
                'display'     => $tb->value,
                'description' => $tb->custom_description ?? $tb->benefit?->description,
            ])->values()->all(),
        ];
    }

    /** forMember() for the booking's member, plus what this booking earns or earned. */
    public function forBooking(ServiceBooking $b): ?array
    {
        $orgId = (int) $b->organization_id;
        $card = $this->forMember($orgId, $b->member_id ? $b->member : null);
        if ($card === null) {
            return null;
        }

        $card['points_on_bookings'] = $this->points->pointsOnBookingsEnabled($orgId);
        $card['awarded'] = $b->points_awarded_at !== null ? $this->awarded($b) : null;

        return $card;
    }

    /** Points the ledger holds for this booking that have not been reversed. */
    private function awarded(ServiceBooking $b): int
    {
        return (int) PointsTransaction::withoutGlobalScopes()
            ->where('organization_id', $b->organization_id)
            ->where('reference_type', 'service_booking')
            ->where('reference_id', $b->id)
            ->where('points', '>', 0)
            ->where('is_reversed', false)
            ->sum('points');
    }
}
```

- [ ] **Step 6: The presenter**

Create `app/Services/Appointments/AppointmentPresenter.php`:

```php
<?php

namespace App\Services\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\User;

/**
 * A service booking as the appointments workspace sees it.
 *
 * summary() is the calendar row: time, client name, service, status — no
 * notes, no contact details, no loyalty, so broad calendar payloads carry
 * nothing sensitive. detail() is the side panel.
 */
final class AppointmentPresenter
{
    public function __construct(
        private readonly AppointmentActions $actions,
        private readonly LoyaltyCard $loyalty,
    ) {
    }

    /**
     * A fingerprint of everything a second operator could have changed.
     * Every write sends it back; a mismatch under the row lock is a stale edit.
     */
    public static function revision(ServiceBooking $b): string
    {
        return substr(hash('sha256', implode('|', [
            VenueClock::wall($b->start_at),
            VenueClock::wall($b->end_at),
            (int) $b->service_master_id,
            (string) $b->status,
            (string) $b->payment_status,
            md5((string) $b->staff_notes),
            $b->updated_at?->getTimestamp() ?? 0,
        ])), 0, 16);
    }

    /** What the row shows about money — never more than it shows. */
    public static function paymentState(ServiceBooking $b): string
    {
        $card = AppointmentActions::carriesCardPayment($b);
        $refunded = (float) ($b->refunded_amount ?? 0);

        return match ((string) $b->payment_status) {
            'unpaid'                => 'not_paid_online',
            'authorized', 'pending' => $card ? 'card_held' : 'not_paid_online',
            'paid'                  => $card ? 'paid_by_card' : 'marked_paid',
            'refunded'              => $refunded > 0 ? 'refunded' : 'marked_refunded',
            'partially_refunded'    => 'partially_refunded',
            'failed'                => 'failed',
            'cancelled'             => 'hold_released',
            default                 => 'unknown',
        };
    }

    /** @return array<string, mixed> */
    public function summary(ServiceBooking $b): array
    {
        $b->loadMissing(['service', 'master']);

        return [
            'id'               => (int) $b->id,
            'reference'        => (string) $b->booking_reference,
            'start'            => VenueClock::wall($b->start_at),
            'end'              => VenueClock::wall($b->end_at),
            'duration_minutes' => (int) $b->duration_minutes,
            'service'          => $b->service ? ['id' => (int) $b->service->id, 'name' => (string) $b->service->name] : null,
            'master'           => $b->master ? ['id' => (int) $b->master->id, 'name' => (string) $b->master->name] : null,
            'client'           => [
                'id'        => $b->guest_id ? (int) $b->guest_id : null,
                'name'      => (string) $b->customer_name,
                'is_member' => (bool) $b->member_id,
            ],
            'status'           => (string) $b->status,
            'payment'          => ['state' => self::paymentState($b)],
            'revision'         => self::revision($b),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(ServiceBooking $b): array
    {
        $b->loadMissing(['service', 'master', 'member.tier']);
        $member = $b->member_id ? $b->member : null;
        $refunded = (float) ($b->refunded_amount ?? 0);

        return array_merge($this->summary($b), [
            'client'  => [
                'id'     => $b->guest_id ? (int) $b->guest_id : null,
                'name'   => (string) $b->customer_name,
                'phone'  => $b->customer_phone ?: null,
                'email'  => $b->customer_email ?: null,
                'member' => $member ? LoyaltyCard::memberSummary($member) : null,
            ],
            'payment' => [
                'state'                => self::paymentState($b),
                'raw'                  => (string) $b->payment_status,
                'amount'               => (float) $b->total_amount,
                'refunded_amount'      => $refunded > 0 ? $refunded : null,
                'carries_card_payment' => AppointmentActions::carriesCardPayment($b),
                'currency'             => $b->currency ?: 'EUR',
            ],
            'price'   => [
                'total'          => (float) $b->total_amount,
                'list'           => $b->list_amount !== null ? (float) $b->list_amount : null,
                'discount_label' => ((float) $b->discount_amount) > 0 ? ($b->discount_label ?: 'Member discount') : null,
                'currency'       => $b->currency ?: 'EUR',
            ],
            'source'  => (string) $b->source,
            'notes'   => ['customer' => $b->customer_notes ?: null, 'staff' => $b->staff_notes ?: null],
            'actions' => $this->actions->for($b),
            'loyalty' => $this->loyalty->forBooking($b),
            'history' => $this->history($b),
        ]);
    }

    /**
     * Who changed this appointment and when: the audit rows whose subject is
     * the booking, newest first. `at` is a real instant (UTC), unlike the
     * appointment's own times.
     *
     * @return list<array{at: ?string, actor: ?string, action: string, description: ?string, changes: array{old: mixed, new: mixed}}>
     */
    private function history(ServiceBooking $b): array
    {
        $rows = AuditLog::where('subject_type', ServiceBooking::class)
            ->where('subject_id', $b->id)
            ->orderByDesc('id')
            ->limit(30)
            ->get();

        $names = User::whereIn('id', $rows->where('causer_type', User::class)->pluck('causer_id')->filter()->unique()->all())
            ->pluck('name', 'id');

        return $rows->map(fn (AuditLog $row) => [
            'at'          => $row->created_at?->toIso8601String(),
            'actor'       => $row->causer_type === User::class ? ($names[$row->causer_id] ?? null) : null,
            'action'      => (string) $row->action,
            'description' => $row->description,
            'changes'     => ['old' => $row->old_values ?: null, 'new' => $row->new_values ?: null],
        ])->all();
    }
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `artisan test tests/Feature/Appointments/AppointmentActionsTest.php` → `Tests: 14 passed`.
Run: `artisan test tests/Feature/Appointments/AppointmentPresenterTest.php` → `Tests: 18 passed`.

If `test_the_detail_carries…` fails on `benefitsFor()` (a column the fixture's `tier_benefits` table lacks), add the missing column to `addColumnsIfMissing('tier_benefits', …)` in `SetsUpAppointmentsSchema::setUpAppointments()` — the production table has it; do not change `DiscountService`.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Services/Appointments/AppointmentRefused.php app/Services/Appointments/StaleAppointment.php app/Services/Appointments/AppointmentActions.php app/Services/Appointments/LoyaltyCard.php app/Services/Appointments/AppointmentPresenter.php tests/Feature/Appointments/AppointmentActionsTest.php tests/Feature/Appointments/AppointmentPresenterTest.php tests/Concerns/SetsUpAppointmentsSchema.php && git commit -q -F - <<'EOF'
Present an appointment with its real payment, actions and membership

The presenter prints stored times as wall clock, maps payment_status to a
label that never claims more than the row shows, and fingerprints the
fields a second operator could change. Actions carry the consequences the
capture job and the points worker will actually produce.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---
### Task 6: `GET calendar` and `GET slots`

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/Appointments/CalendarController.php`
- Modify: `routes/api.php` (two routes inside the `appointments` group from Task 4)
- Test: `tests/Feature/Appointments/CalendarEndpointTest.php`

**Interfaces:**
- Consumes: `ServiceSchedulingService::workingWindows()`, `availableSlots(..., ?int $ignoreBookingId)` (Task 1), `effectiveDuration(Service, ?ServiceMaster): int`, `effectivePrice(Service, ?ServiceMaster): float`; `AppointmentPresenter::summary()` (Task 5); `VenueClock` (Task 4); `AppointmentRefused` (Task 5).
- Produces:
  - `GET calendar?from=Y-m-d&to=Y-m-d[&master_id][&include_cancelled=1]` →
    `{from, to, masters: [{id, name, title, avatar, days: {"Y-m-d": {windows: [{start: "HH:mm", end: "HH:mm"}], time_off: [{start: ?"HH:mm", end: ?"HH:mm", reason: ?string}]}}}], services: [{id, name, duration_minutes, buffer_after_minutes, price, currency, master_ids: int[]}], appointments: [summary]}`. `days` is `{}` when the range is longer than 7 days, and for every team member other than `master_id` when that is given.
  - `GET slots?service_id&master_id&date=Y-m-d[&ignore]` → `{slots: [{start: wall, end: wall, label: "HH:mm"}], duration_minutes: int, price: float, currency: string}`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/CalendarEndpointTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class CalendarEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function calendar(array $query): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api('calendar') . '?' . http_build_query($query));
    }

    public function test_a_day_lists_team_members_with_their_working_windows(): void
    {
        $this->master->forceFill(['title' => 'Massage Therapist'])->save();
        DB::table('service_master_time_off')->insert([
            'organization_id' => $this->org->id, 'service_master_id' => $this->master->id,
            'date' => '2026-10-06', 'start_time' => '13:00:00', 'end_time' => '14:00:00', 'reason' => 'Lunch',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-06'])
            ->assertOk()
            ->assertJsonPath('from', '2026-10-06')
            ->assertJsonPath('masters.0.id', $this->master->id)
            ->assertJsonPath('masters.0.name', 'Mara Ilves')
            ->assertJsonPath('masters.0.title', 'Massage Therapist')
            ->assertJsonPath('masters.0.days.2026-10-06.windows', [
                ['start' => '09:00', 'end' => '13:00'],
                ['start' => '14:00', 'end' => '17:00'],
            ])
            ->assertJsonPath('masters.0.days.2026-10-06.time_off', [
                ['start' => '13:00', 'end' => '14:00', 'reason' => 'Lunch'],
            ]);
    }

    public function test_appointments_come_as_wall_clock_summaries_in_time_order(): void
    {
        $late = $this->seedBooking(['start_at' => '2026-10-06 15:00:00', 'end_at' => '2026-10-06 15:45:00', 'staff_notes' => 'private']);
        $early = $this->seedBooking(['start_at' => '2026-10-06 09:00:00', 'end_at' => '2026-10-06 09:45:00']);
        $this->seedBooking(['start_at' => '2026-10-07 09:00:00', 'end_at' => '2026-10-07 09:45:00']);

        $response = $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-06'])->assertOk();

        $this->assertSame([$early->id, $late->id], array_column($response->json('appointments'), 'id'));
        $response->assertJsonPath('appointments.0.start', '2026-10-06T09:00')
            ->assertJsonPath('appointments.0.end', '2026-10-06T09:45')
            ->assertJsonPath('appointments.0.client.name', 'Sophie Williams')
            ->assertJsonPath('appointments.0.payment.state', 'not_paid_online');
        $this->assertStringNotContainsString('private', $response->getContent());
        $this->assertArrayNotHasKey('notes', $response->json('appointments.0'));
    }

    public function test_cancelled_appointments_are_left_out_unless_asked_for(): void
    {
        $kept = $this->seedBooking();
        $cancelled = $this->seedBooking(['status' => 'cancelled', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $noShow = $this->seedBooking(['status' => 'no_show', 'start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);

        $ids = fn (array $query) => array_column($this->calendar($query)->assertOk()->json('appointments'), 'id');

        $this->assertSame([$kept->id, $noShow->id], $ids(['from' => '2026-10-06', 'to' => '2026-10-06']));
        $this->assertSame([$kept->id, $cancelled->id, $noShow->id], $ids(['from' => '2026-10-06', 'to' => '2026-10-06', 'include_cancelled' => 1]));
    }

    public function test_another_organisations_appointments_never_appear(): void
    {
        $other = $this->otherOrganization();
        $theirs = $this->inOrganization($other->id, fn () => ServiceBooking::create([
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Not Ours', 'customer_email' => '', 'start_at' => '2026-10-06 10:00:00', 'end_at' => '2026-10-06 10:45:00',
            'duration_minutes' => 45, 'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'admin',
        ]));
        $this->assertSame($other->id, (int) $theirs->organization_id);

        $this->assertSame([], $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-06'])->assertOk()->json('appointments'));
    }

    public function test_the_catalogue_lists_active_services_with_the_active_people_who_perform_them(): void
    {
        $inactiveMaster = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Gone', 'is_active' => false]);
        DB::table('service_master_service')->insert([
            'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $inactiveMaster->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        Service::create(['organization_id' => $this->org->id, 'name' => 'Retired', 'duration_minutes' => 30, 'price' => 10, 'is_active' => false]);

        $response = $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-06'])->assertOk();

        $this->assertCount(1, $response->json('services'));
        $response->assertJsonPath('services.0.name', 'Deep Tissue Massage')
            ->assertJsonPath('services.0.duration_minutes', 45)
            ->assertJsonPath('services.0.price', 60) // a whole amount arrives as an integer: json_encode drops the ".0"
            ->assertJsonPath('services.0.currency', 'EUR')
            ->assertJsonPath('services.0.master_ids', [$this->master->id]);
        $this->assertCount(1, $response->json('masters'));
    }

    public function test_a_week_for_one_person_computes_only_that_persons_windows(): void
    {
        $second = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Second', 'is_active' => true]);

        $masters = collect($this->calendar(['from' => '2026-10-05', 'to' => '2026-10-11', 'master_id' => $this->master->id])->assertOk()->json('masters'))->keyBy('id');

        $this->assertCount(7, $masters[$this->master->id]['days']);
        $this->assertSame([], $masters[$second->id]['days']);
    }

    public function test_a_long_range_carries_no_windows_and_a_too_long_one_is_refused(): void
    {
        $this->assertSame([], $this->calendar(['from' => '2026-10-01', 'to' => '2026-10-31'])->assertOk()->json('masters.0.days'));

        $this->calendar(['from' => '2026-10-01', 'to' => '2026-11-01'])->assertStatus(422)->assertJsonPath('error', 'range_too_long');
        $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-05'])->assertStatus(422);
        $this->calendar(['from' => 'today', 'to' => '2026-10-05'])->assertStatus(422);
    }

    private function slots(array $query): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api('slots') . '?' . http_build_query($query));
    }

    public function test_slots_are_the_schedulers_free_starts_with_the_price_and_duration(): void
    {
        $this->seedBooking(); // 10:00–10:45 tomorrow

        $response = $this->slots(['service_id' => $this->service->id, 'master_id' => $this->master->id, 'date' => '2026-10-06'])->assertOk();
        $labels = array_column($response->json('slots'), 'label');

        $this->assertContains('09:00', $labels);
        $this->assertNotContains('10:00', $labels);
        $this->assertNotContains('10:30', $labels);
        $this->assertContains('10:45', $labels);
        $this->assertSame(['start' => '2026-10-06T09:00', 'end' => '2026-10-06T09:45', 'label' => '09:00'], $response->json('slots.0'));
        $response->assertJsonPath('duration_minutes', 45)->assertJsonPath('price', 60)->assertJsonPath('currency', 'EUR');
    }

    public function test_slots_for_a_move_offer_the_appointments_own_time(): void
    {
        $booking = $this->seedBooking();
        $query = ['service_id' => $this->service->id, 'master_id' => $this->master->id, 'date' => '2026-10-06'];

        $this->assertNotContains('10:00', array_column($this->slots($query)->json('slots'), 'label'));
        $this->assertContains('10:00', array_column($this->slots($query + ['ignore' => $booking->id])->json('slots'), 'label'));
    }

    public function test_staff_may_book_earlier_today_but_never_a_day_that_has_passed(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00'));
        $query = ['service_id' => $this->service->id, 'master_id' => $this->master->id];

        // A walk-in who started at 09:00 is recorded at noon.
        $this->assertContains('09:00', array_column($this->slots($query + ['date' => '2026-10-05'])->assertOk()->json('slots'), 'label'));
        $this->assertSame([], $this->slots($query + ['date' => '2026-10-04'])->assertOk()->json('slots'));
    }

    public function test_slots_for_an_unknown_service_or_person_answer_404(): void
    {
        $this->slots(['service_id' => 999999, 'master_id' => $this->master->id, 'date' => '2026-10-06'])
            ->assertStatus(404)->assertJsonPath('error', 'service_not_found');
        $this->slots(['service_id' => $this->service->id, 'master_id' => 999999, 'date' => '2026-10-06'])
            ->assertStatus(404)->assertJsonPath('error', 'master_not_found');
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `artisan test tests/Feature/Appointments/CalendarEndpointTest.php`
Expected: FAIL — every request answers 404 (the routes do not exist).

- [ ] **Step 3: Implement the controller**

Create `app/Http/Controllers/Api/V1/Admin/Appointments/CalendarController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Models\ServiceMasterTimeOff;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\VenueClock;
use App\Services\ServiceSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The calendar's read model. Working windows and free slots come from
 * ServiceSchedulingService — the workspace never computes availability.
 */
class CalendarController extends Controller
{
    private const MAX_DAYS = 31;

    /** Working windows cost two queries per person per day; past a week the list view does not need them. */
    private const WINDOW_DAYS = 7;

    public function calendar(Request $request, ServiceSchedulingService $scheduler, AppointmentPresenter $presenter): JsonResponse
    {
        $data = $request->validate([
            'from'              => 'required|date_format:Y-m-d',
            'to'                => 'required|date_format:Y-m-d|after_or_equal:from',
            'master_id'         => 'nullable|integer',
            'include_cancelled' => 'nullable|boolean',
        ]);

        $from = CarbonImmutable::createFromFormat('!Y-m-d', $data['from'], 'UTC');
        $to = CarbonImmutable::createFromFormat('!Y-m-d', $data['to'], 'UTC');
        $days = intdiv($to->getTimestamp() - $from->getTimestamp(), 86400) + 1;
        if ($days > self::MAX_DAYS) {
            throw new AppointmentRefused('range_too_long', 'Ask for at most 31 days at a time.', 422);
        }

        $masters = ServiceMaster::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get();

        $withWindows = [];
        if ($days <= self::WINDOW_DAYS) {
            $withWindows = !empty($data['master_id'])
                ? $masters->where('id', (int) $data['master_id'])->pluck('id')->all()
                : $masters->pluck('id')->all();
        }

        $timeOff = ServiceMasterTimeOff::whereIn('service_master_id', $withWindows)
            ->whereDate('date', '>=', $from->toDateString())
            ->whereDate('date', '<=', $to->toDateString())
            ->orderBy('start_time')
            ->get()
            ->groupBy(fn (ServiceMasterTimeOff $o) => $o->service_master_id . '|' . $o->date->toDateString());

        $masterRows = $masters->map(function (ServiceMaster $m) use ($from, $to, $withWindows, $timeOff, $scheduler) {
            $perDay = [];
            if (in_array($m->id, $withWindows, true)) {
                for ($day = $from; $day->lte($to); $day = $day->addDay()) {
                    $key = $day->toDateString();
                    $perDay[$key] = [
                        'windows'  => array_map(
                            fn (array $w) => ['start' => $w['start']->format('H:i'), 'end' => $w['end']->format('H:i')],
                            $scheduler->workingWindows($m, $day),
                        ),
                        'time_off' => ($timeOff[$m->id . '|' . $key] ?? collect())->map(fn (ServiceMasterTimeOff $o) => [
                            'start'  => $o->start_time ? substr((string) $o->start_time, 0, 5) : null,
                            'end'    => $o->end_time ? substr((string) $o->end_time, 0, 5) : null,
                            'reason' => $o->reason,
                        ])->values()->all(),
                    ];
                }
            }

            return [
                'id'     => (int) $m->id,
                'name'   => (string) $m->name,
                'title'  => $m->title,
                'avatar' => $m->avatar,
                // An object even when empty, so the client always reads a map.
                'days'   => (object) $perDay,
            ];
        })->values()->all();

        $activeMasterIds = $masters->pluck('id')->all();
        $services = Service::where('is_active', true)->with('masters')->orderBy('sort_order')->orderBy('name')->get()
            ->map(fn (Service $s) => [
                'id'                   => (int) $s->id,
                'name'                 => (string) $s->name,
                'duration_minutes'     => (int) $s->duration_minutes,
                'buffer_after_minutes' => (int) ($s->buffer_after_minutes ?? 0),
                'price'                => (float) $s->price,
                'currency'             => $s->currency ?: 'EUR',
                'master_ids'           => $s->masters->pluck('id')->intersect($activeMasterIds)->values()->all(),
            ])->values()->all();

        $appointments = ServiceBooking::with(['service', 'master'])
            ->where('start_at', '>=', $from->format('Y-m-d 00:00:00'))
            ->where('start_at', '<=', $to->format('Y-m-d 23:59:59'))
            ->when(!$request->boolean('include_cancelled'), fn ($q) => $q->where('status', '!=', 'cancelled'))
            ->orderBy('start_at')
            ->orderBy('id')
            ->get()
            ->map(fn (ServiceBooking $b) => $presenter->summary($b))
            ->all();

        return response()->json([
            'from'         => $data['from'],
            'to'           => $data['to'],
            'masters'      => $masterRows,
            'services'     => $services,
            'appointments' => $appointments,
        ]);
    }

    public function slots(Request $request, ServiceSchedulingService $scheduler): JsonResponse
    {
        $data = $request->validate([
            'service_id' => 'required|integer',
            'master_id'  => 'required|integer',
            'date'       => 'required|date_format:Y-m-d',
            'ignore'     => 'nullable|integer',
        ]);

        $service = Service::where('is_active', true)->find($data['service_id'])
            ?? throw new AppointmentRefused('service_not_found', 'This service no longer exists.', 404);
        $master = ServiceMaster::where('is_active', true)->find($data['master_id'])
            ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);

        $orgId = (int) app('current_organization_id');
        $today = VenueClock::today($orgId);
        $slots = [];

        if ($data['date'] >= $today) {
            // The scheduler drops starts earlier than "now + lead" on the
            // application clock. Staff may book from the start of the
            // venue's today (a walk-in already in the chair), so the lead is
            // the distance from now back to that moment — usually negative.
            $todayStart = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC');
            $lead = intdiv($todayStart->getTimestamp() - CarbonImmutable::now()->getTimestamp(), 60);

            $slots = array_map(
                fn (array $s) => ['start' => VenueClock::wall($s['start']), 'end' => VenueClock::wall($s['end']), 'label' => $s['time_label']],
                $scheduler->availableSlots($service, $data['date'], $master->id, null, $lead, $data['ignore'] ?? null),
            );
        }

        return response()->json([
            'slots'            => $slots,
            'duration_minutes' => $scheduler->effectiveDuration($service, $master),
            'price'            => $scheduler->effectivePrice($service, $master),
            'currency'         => $service->currency ?: 'EUR',
        ]);
    }
}
```

- [ ] **Step 4: Register the routes**

In `routes/api.php`, inside the `appointments` group, after the `bootstrap` route:

```php
                Route::get('calendar',  [\App\Http\Controllers\Api\V1\Admin\Appointments\CalendarController::class, 'calendar']);
                Route::get('slots',     [\App\Http\Controllers\Api\V1\Admin\Appointments\CalendarController::class, 'slots']);
```

- [ ] **Step 5: Run the test to see it pass**

Run: `artisan test tests/Feature/Appointments/CalendarEndpointTest.php`
Expected: `Tests: 11 passed`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Http/Controllers/Api/V1/Admin/Appointments/CalendarController.php routes/api.php tests/Feature/Appointments/CalendarEndpointTest.php && git commit -q -F - <<'EOF'
Serve the appointments calendar and its free slots

The calendar lists team members with the scheduler's working windows, the
active service catalogue and the appointments as wall-clock summaries.
Slots are the scheduler's own, offered from the start of the venue's today.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 7: Clients — search, quick create, profile

The same `guests` rows the full admin uses. Creating one goes through `Guest::create()`, so the model's own hook enrols a member when the programme allows, exactly as the full admin's create does. Nothing is merged.

**Files:**
- Create: `app/Services/Appointments/ClientDirectory.php`
- Create: `app/Http/Controllers/Api/V1/Admin/Appointments/ClientController.php`
- Modify: `routes/api.php` (three routes inside the `appointments` group)
- Test: `tests/Feature/Appointments/ClientEndpointsTest.php`

**Interfaces:**
- Consumes: `Guest::normalizeEmailKey(?string): ?string`, `Guest::normalizePhoneKey(?string): ?string`; `LoyaltyCard::memberSummary()`, `->forMember()`; `AppointmentPresenter::summary()`; `VenueClock::now()`; `AppointmentRefused`.
- Produces:
  - `ClientDirectory::summary(Guest $g): array{id:int, name:string, phone:?string, email:?string, member:?array}`; `search(string $term): array`; `possibleDuplicates(?string $email, ?string $phone): array`; `create(string $name, ?string $phone, ?string $email): Guest`; `profile(Guest $g): array{client, upcoming, past, matched_by_email, loyalty, last}`.
  - `GET clients?search=` → `{clients: [summary]}`; `POST clients {name, phone?, email?, confirm_new?}` → `201 {client: summary}` or `409 {error: 'possible_duplicate', message, matches: [summary]}`; `GET clients/{id}` → the profile.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/ClientEndpointsTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\Guest;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class ClientEndpointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function search(string $term): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api('clients') . '?' . http_build_query(['search' => $term]));
    }

    public function test_search_finds_a_client_by_name_phone_digits_or_email(): void
    {
        $sophie = $this->seedClient();
        $ada = $this->seedMemberClient();

        $this->assertSame([$sophie->id], array_column($this->search('soph')->assertOk()->json('clients'), 'id'));
        $this->assertSame([$sophie->id], array_column($this->search('7700 900')->json('clients'), 'id'));
        $this->assertSame([$ada->id], array_column($this->search('ADA@EXAMPLE')->json('clients'), 'id'));
        $this->assertSame([], $this->search('nobody')->json('clients'));
    }

    public function test_a_search_row_carries_the_membership(): void
    {
        $this->seedMemberClient();

        $this->search('ada')->assertOk()
            ->assertJsonPath('clients.0.name', 'Ada Member')
            ->assertJsonPath('clients.0.email', 'ada@example.test')
            ->assertJsonPath('clients.0.phone', null)
            ->assertJsonPath('clients.0.member.number', $this->member->member_number)
            ->assertJsonPath('clients.0.member.tier', 'Gold');
    }

    public function test_search_needs_two_characters_and_never_crosses_organisations(): void
    {
        $this->inOrganization($this->otherOrganization()->id, fn () => Guest::create(['full_name' => 'Sophie Elsewhere', 'phone' => '1', 'phone_key' => '1']));

        $this->search('s')->assertStatus(422);
        $this->assertSame([], $this->search('Elsewhere')->assertOk()->json('clients'));
    }

    public function test_a_client_is_created_with_a_name_and_a_phone_number(): void
    {
        $response = $this->asStaff()->postJson($this->api('clients'), ['name' => 'Mia Taylor', 'phone' => '+44 (7700) 900-456'])
            ->assertStatus(201)
            ->assertJsonPath('client.name', 'Mia Taylor')
            ->assertJsonPath('client.phone', '+44 (7700) 900-456')
            ->assertJsonPath('client.email', null);

        $guest = Guest::findOrFail($response->json('client.id'));
        $this->assertSame($this->org->id, (int) $guest->organization_id);
        $this->assertSame('447700900456', $guest->phone_key);
        $this->assertSame('Mia', $guest->first_name);
        $this->assertSame('Taylor', $guest->last_name);
        $this->assertSame('Appointments', $guest->lead_source);
    }

    public function test_a_client_needs_a_name_and_a_way_to_reach_them(): void
    {
        $this->asStaff()->postJson($this->api('clients'), ['name' => 'No Contact'])->assertStatus(422);
        $this->asStaff()->postJson($this->api('clients'), ['phone' => '123456'])->assertStatus(422);
        $this->asStaff()->postJson($this->api('clients'), ['name' => 'Bad Mail', 'email' => 'not-an-email'])->assertStatus(422);
    }

    public function test_a_possible_duplicate_is_shown_not_merged_and_not_silently_created(): void
    {
        $existing = $this->seedClient(); // +44 7700 900123
        $count = Guest::count();

        $this->asStaff()->postJson($this->api('clients'), ['name' => 'S. Williams', 'phone' => '+447700900123'])
            ->assertStatus(409)
            ->assertJsonPath('error', 'possible_duplicate')
            ->assertJsonPath('matches.0.id', $existing->id)
            ->assertJsonPath('matches.0.name', 'Sophie Williams');
        $this->assertSame($count, Guest::count());

        $this->asStaff()->postJson($this->api('clients'), ['name' => 'S. Williams', 'phone' => '+447700900123', 'confirm_new' => true])
            ->assertStatus(201);
        $this->assertSame($count + 1, Guest::count());
        $this->assertSame('Sophie Williams', $existing->fresh()->full_name);
    }

    public function test_the_same_email_in_another_case_is_a_possible_duplicate(): void
    {
        $ada = $this->seedMemberClient();

        $this->asStaff()->postJson($this->api('clients'), ['name' => 'Ada Again', 'email' => 'ADA@Example.Test'])
            ->assertStatus(409)->assertJsonPath('matches.0.id', $ada->id);
    }

    public function test_the_profile_splits_upcoming_past_and_email_matched_appointments(): void
    {
        $ada = $this->seedMemberClient();
        $upcoming = $this->seedBooking(['guest_id' => $ada->id, 'member_id' => $this->member->id]);
        $past = $this->seedBooking(['guest_id' => $ada->id, 'status' => 'completed', 'start_at' => '2026-09-20 10:00:00', 'end_at' => '2026-09-20 10:45:00']);
        $cancelled = $this->seedBooking(['guest_id' => $ada->id, 'status' => 'cancelled', 'start_at' => '2026-10-08 10:00:00', 'end_at' => '2026-10-08 10:45:00']);
        $byEmail = $this->seedBooking(['customer_email' => 'Ada@Example.test', 'start_at' => '2026-08-01 10:00:00', 'end_at' => '2026-08-01 10:45:00']);
        $this->seedBooking(['customer_email' => 'someone@else.test', 'start_at' => '2026-08-02 10:00:00', 'end_at' => '2026-08-02 10:45:00']);

        $response = $this->asStaff()->getJson($this->api("clients/{$ada->id}"))->assertOk();

        $this->assertSame([$upcoming->id], array_column($response->json('upcoming'), 'id'));
        $this->assertSame([$cancelled->id, $past->id], array_column($response->json('past'), 'id'));
        $this->assertSame([$byEmail->id], array_column($response->json('matched_by_email'), 'id'));
        $response->assertJsonPath('client.id', $ada->id)
            ->assertJsonPath('loyalty.member.tier', 'Gold')
            ->assertJsonPath('last.service_id', $this->service->id)
            ->assertJsonPath('last.master_id', $this->master->id);
    }

    public function test_a_client_who_is_not_a_member_has_a_card_without_a_member(): void
    {
        $sophie = $this->seedClient();

        $this->asStaff()->getJson($this->api("clients/{$sophie->id}"))->assertOk()
            ->assertJsonPath('loyalty.member', null)
            ->assertJsonPath('last', null)
            ->assertJsonPath('upcoming', [])
            ->assertJsonPath('matched_by_email', []);
    }

    public function test_another_organisations_client_is_not_found(): void
    {
        $theirs = $this->inOrganization($this->otherOrganization()->id, fn () => Guest::create(['full_name' => 'Theirs', 'phone' => '1', 'phone_key' => '1']));

        $this->asStaff()->getJson($this->api("clients/{$theirs->id}"))->assertStatus(404)->assertJsonPath('error', 'client_not_found');
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `artisan test tests/Feature/Appointments/ClientEndpointsTest.php`
Expected: FAIL — 404 on every call.

- [ ] **Step 3: Implement the directory**

Create `app/Services/Appointments/ClientDirectory.php`:

```php
<?php

namespace App\Services\Appointments;

use App\Models\Guest;
use App\Models\ServiceBooking;
use Illuminate\Support\Str;

/**
 * Clients for the appointments workspace: the organisation's own `guests`
 * rows, the same people the full admin lists under Customers. Nothing here
 * merges two rows — a likely duplicate is shown to the operator, who
 * decides.
 */
final class ClientDirectory
{
    private const ACTIVE = ['pending', 'confirmed', 'in_progress'];

    public function __construct(
        private readonly AppointmentPresenter $presenter,
        private readonly LoyaltyCard $loyalty,
    ) {
    }

    /** @return array{id: int, name: string, phone: ?string, email: ?string, member: ?array} */
    public function summary(Guest $guest): array
    {
        $guest->loadMissing('member.tier');

        return [
            'id'     => (int) $guest->id,
            'name'   => (string) $guest->full_name,
            'phone'  => $guest->phone ?: ($guest->mobile ?: null),
            'email'  => $guest->email ?: null,
            'member' => $guest->member ? LoyaltyCard::memberSummary($guest->member) : null,
        ];
    }

    /** @return list<array<string, mixed>> */
    public function search(string $term): array
    {
        $needle = '%' . mb_strtolower(trim($term)) . '%';
        $digits = (string) preg_replace('/\D/', '', $term);

        return Guest::with('member.tier')
            ->where(function ($q) use ($needle, $digits) {
                $q->whereRaw('LOWER(full_name) LIKE ?', [$needle])
                    ->orWhereRaw('LOWER(email) LIKE ?', [$needle]);
                if (strlen($digits) >= 3) {
                    $q->orWhere('phone_key', 'like', "%{$digits}%");
                }
            })
            ->orderBy('full_name')
            ->limit(20)
            ->get()
            ->map(fn (Guest $g) => $this->summary($g))
            ->all();
    }

    /** Clients whose normalised email or phone is the one given. @return list<array<string, mixed>> */
    public function possibleDuplicates(?string $email, ?string $phone): array
    {
        $emailKey = Guest::normalizeEmailKey($email);
        $phoneKey = Guest::normalizePhoneKey($phone);
        if (!$emailKey && !$phoneKey) {
            return [];
        }

        return Guest::with('member.tier')
            ->where(function ($q) use ($emailKey, $phoneKey) {
                if ($emailKey) {
                    $q->orWhere('email_key', $emailKey)->orWhereRaw('LOWER(email) = ?', [$emailKey]);
                }
                if ($phoneKey) {
                    $q->orWhere('phone_key', $phoneKey);
                }
            })
            ->orderBy('id')
            ->limit(5)
            ->get()
            ->map(fn (Guest $g) => $this->summary($g))
            ->all();
    }

    public function create(string $name, ?string $phone, ?string $email): Guest
    {
        $name = trim($name);
        $phone = $phone !== null ? trim($phone) : null;
        $email = $email !== null ? trim($email) : null;

        // Nulls are left out so the table's own defaults apply (several
        // guests columns are NOT NULL with a default on PostgreSQL).
        $guest = Guest::create(array_filter([
            'full_name'   => mb_substr($name, 0, 200),
            'first_name'  => mb_substr(Str::before($name, ' '), 0, 100),
            'last_name'   => str_contains($name, ' ') ? mb_substr(Str::after($name, ' '), 0, 100) : null,
            'email'       => $email ?: null,
            'phone'       => $phone ?: null,
            'email_key'   => Guest::normalizeEmailKey($email),
            'phone_key'   => Guest::normalizePhoneKey($phone),
            'lead_source' => 'Appointments',
        ], fn ($value) => $value !== null && $value !== ''));

        // Guest::created may have enrolled a member and linked it.
        return $guest->fresh();
    }

    /** @return array<string, mixed> */
    public function profile(Guest $guest): array
    {
        $orgId = (int) $guest->organization_id;
        $now = VenueClock::now($orgId)->format('Y-m-d H:i:s');
        $own = fn () => ServiceBooking::with(['service', 'master'])->where('guest_id', $guest->id);

        $upcoming = $own()->whereIn('status', self::ACTIVE)->where('start_at', '>=', $now)->orderBy('start_at')->limit(20)->get();
        $past = $own()
            ->where(fn ($q) => $q->whereNotIn('status', self::ACTIVE)->orWhere('start_at', '<', $now))
            ->orderByDesc('start_at')->limit(20)->get();

        // Bookings made before clients were linked carry an email and no
        // client id. They are listed apart, labelled as matched by email,
        // and nothing is written to link them.
        $emailKey = Guest::normalizeEmailKey($guest->email);
        $byEmail = $emailKey
            ? ServiceBooking::with(['service', 'master'])->whereNull('guest_id')
                ->whereRaw('LOWER(customer_email) = ?', [$emailKey])
                ->orderByDesc('start_at')->limit(20)->get()
            : collect();

        $last = $own()->orderByDesc('start_at')->first();
        $guest->loadMissing('member.tier');
        $summaries = fn ($bookings) => $bookings->map(fn (ServiceBooking $b) => $this->presenter->summary($b))->values()->all();

        return [
            'client'           => $this->summary($guest),
            'upcoming'         => $summaries($upcoming),
            'past'             => $summaries($past),
            'matched_by_email' => $summaries($byEmail),
            'loyalty'          => $this->loyalty->forMember($orgId, $guest->member),
            'last'             => $last ? [
                'service_id' => (int) $last->service_id,
                'master_id'  => $last->service_master_id ? (int) $last->service_master_id : null,
            ] : null,
        ];
    }
}
```

- [ ] **Step 4: Implement the controller and routes**

Create `app/Http/Controllers/Api/V1/Admin/Appointments/ClientController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\ClientDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    public function index(Request $request, ClientDirectory $clients): JsonResponse
    {
        $data = $request->validate(['search' => 'required|string|min:2|max:100']);

        return response()->json(['clients' => $clients->search($data['search'])]);
    }

    public function store(Request $request, ClientDirectory $clients): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:200',
            'phone'       => 'nullable|required_without:email|string|max:50',
            'email'       => 'nullable|required_without:phone|email|max:150',
            'confirm_new' => 'nullable|boolean',
        ]);

        $matches = $clients->possibleDuplicates($data['email'] ?? null, $data['phone'] ?? null);
        if ($matches !== [] && !($data['confirm_new'] ?? false)) {
            throw new AppointmentRefused(
                'possible_duplicate',
                'A client with this phone number or email already exists.',
                409,
                ['matches' => $matches],
            );
        }

        $guest = $clients->create($data['name'], $data['phone'] ?? null, $data['email'] ?? null);

        return response()->json(['client' => $clients->summary($guest)], 201);
    }

    public function show(int $id, ClientDirectory $clients): JsonResponse
    {
        $guest = Guest::find($id) ?? throw new AppointmentRefused('client_not_found', 'This client no longer exists.', 404);

        return response()->json($clients->profile($guest));
    }
}
```

In `routes/api.php`, inside the `appointments` group:

```php
                Route::get('clients',      [\App\Http\Controllers\Api\V1\Admin\Appointments\ClientController::class, 'index']);
                Route::post('clients',     [\App\Http\Controllers\Api\V1\Admin\Appointments\ClientController::class, 'store']);
                Route::get('clients/{id}', [\App\Http\Controllers\Api\V1\Admin\Appointments\ClientController::class, 'show'])->whereNumber('id');
```

- [ ] **Step 5: Run the test to see it pass**

Run: `artisan test tests/Feature/Appointments/ClientEndpointsTest.php`
Expected: `Tests: 10 passed`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Services/Appointments/ClientDirectory.php app/Http/Controllers/Api/V1/Admin/Appointments/ClientController.php routes/api.php tests/Feature/Appointments/ClientEndpointsTest.php && git commit -q -F - <<'EOF'
Find, create and profile clients from the appointments workspace

Search and quick create work on the organisation's own guests. A matching
phone number or email is shown to the operator as a possible duplicate and
never merged. The profile lists the client's appointments and membership.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---
### Task 8: Create an appointment

A staff booking that carries its client and, when the client is a member, the member — so the visit can earn points. Same lock key and same scheduler as the widget, the portal and the full admin.

**Files:**
- Create: `app/Services/Appointments/StaffBookingWriter.php` (this task writes `create()`; Task 9 adds `move()`)
- Create: `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php` (this task writes `store()`)
- Modify: `routes/api.php` (one route inside the `appointments` group)
- Test: `tests/Feature/Appointments/CreateAppointmentTest.php`

**Interfaces:**
- Consumes: `ServiceSchedulingService::reserveSlot(Service, ?int, string, ?int)` (Task 1); `App\Support\AdvisoryLock::transaction(string $key, callable $fn): mixed`; `VenueClock::parse()`, `exists()`, `today()`, `wall()` (Task 4); `AppointmentRefused` (Task 5); `AuditLog::record(string $action, $subject = null, array $newValues = [], array $oldValues = [], ?Model $causer = null, ?string $description = null): void`.
- Produces:
  - `StaffBookingWriter::SOURCE = 'staff'` (the `service_booking_submissions.source` of this entry point).
  - `StaffBookingWriter::create(array $data, string $key, User $actor): array{booking: ServiceBooking, replayed: bool}` — `$data` keys: `client_id`, `service_id`, `master_id`, `start` (wall), optional `source`, `customer_notes`, `staff_notes`. Throws `AppointmentRefused`.
  - `StaffBookingWriter::startOrRefuse(string $wall, int $orgId): CarbonImmutable` (public; Task 9 uses it).
  - `POST bookings` with header `Idempotency-Key` → `201 {booking: detail, replayed: false}`; a replay → `200 {booking: detail, replayed: true}`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/CreateAppointmentTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\Guest;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingSubmission;
use App\Models\ServiceMaster;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class CreateAppointmentTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function body(Guest $client, array $overrides = []): array
    {
        return array_merge([
            'client_id'  => $client->id,
            'service_id' => $this->service->id,
            'master_id'  => $this->master->id,
            'start'      => '2026-10-06T10:00',
        ], $overrides);
    }

    private function create(array $body, ?string $key = null): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->postJson($this->api('bookings'), $body, ['Idempotency-Key' => $key ?? (string) Str::uuid()]);
    }

    public function test_a_members_appointment_carries_the_client_and_the_member(): void
    {
        $ada = $this->seedMemberClient();

        $response = $this->create($this->body($ada, ['staff_notes' => 'Prefers firm pressure']))
            ->assertStatus(201)
            ->assertJsonPath('replayed', false)
            ->assertJsonPath('booking.start', '2026-10-06T10:00')
            ->assertJsonPath('booking.end', '2026-10-06T10:45')
            ->assertJsonPath('booking.status', 'confirmed')
            ->assertJsonPath('booking.client.id', $ada->id)
            ->assertJsonPath('booking.client.member.id', $this->member->id)
            ->assertJsonPath('booking.price.total', 60)
            ->assertJsonPath('booking.payment.state', 'not_paid_online');

        $booking = ServiceBooking::findOrFail($response->json('booking.id'));
        $this->assertSame($ada->id, (int) $booking->guest_id);
        $this->assertSame($this->member->id, (int) $booking->member_id);
        $this->assertSame('Ada Member', $booking->customer_name);
        $this->assertSame('ada@example.test', $booking->customer_email);
        $this->assertSame('2026-10-06 10:00:00', $booking->start_at->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-06 10:45:00', $booking->end_at->format('Y-m-d H:i:s'));
        $this->assertSame(45, $booking->duration_minutes);
        $this->assertSame('60.00', $booking->service_price);
        $this->assertSame('60.00', $booking->total_amount);
        $this->assertSame('unpaid', $booking->payment_status);
        $this->assertSame('admin', $booking->source);
        $this->assertSame('Prefers firm pressure', $booking->staff_notes);
        $this->assertStringStartsWith('SVC-', $booking->booking_reference);
    }

    public function test_the_audit_row_names_who_created_it(): void
    {
        $id = $this->create($this->body($this->seedClient()))->assertStatus(201)->json('booking.id');

        $row = AuditLog::where('subject_type', ServiceBooking::class)->where('subject_id', $id)->firstOrFail();
        $this->assertSame('service_booking.created', $row->action);
        $this->assertSame(User::class, $row->causer_type);
        $this->assertSame($this->staff->id, (int) $row->causer_id);
    }

    public function test_a_phone_only_client_is_booked_with_an_empty_email_and_no_member(): void
    {
        $sophie = $this->seedClient();

        $response = $this->create($this->body($sophie))->assertStatus(201)
            ->assertJsonPath('booking.client.email', null)
            ->assertJsonPath('booking.client.phone', '+44 7700 900123')
            ->assertJsonPath('booking.client.member', null);

        $booking = ServiceBooking::findOrFail($response->json('booking.id'));
        $this->assertSame('', $booking->customer_email);
        $this->assertNull($booking->member_id);
        $this->assertSame($sophie->id, (int) $booking->guest_id);
    }

    public function test_a_taken_time_is_refused_and_nothing_is_written(): void
    {
        $this->seedBooking(); // 10:00–10:45 with the same person

        $this->create($this->body($this->seedClient(), ['start' => '2026-10-06T10:30']))
            ->assertStatus(409)->assertJsonPath('error', 'slot_taken');

        $this->assertSame(1, ServiceBooking::count());
        $this->assertSame(0, ServiceBookingSubmission::count());
    }

    public function test_a_time_outside_working_hours_is_refused(): void
    {
        $this->create($this->body($this->seedClient(), ['start' => '2026-10-06T08:00']))->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->create($this->body($this->seedClient(['phone' => '2', 'phone_key' => '2']), ['start' => '2026-10-06T16:30']))->assertStatus(409); // would end 17:15
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_a_team_member_who_does_not_perform_the_service_is_refused(): void
    {
        $other = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Not Trained', 'is_active' => true]);

        $this->create($this->body($this->seedClient(), ['master_id' => $other->id]))
            ->assertStatus(422)->assertJsonPath('error', 'master_not_eligible');
    }

    public function test_the_same_key_and_body_replays_the_first_appointment(): void
    {
        $body = $this->body($this->seedClient());
        $key = (string) Str::uuid();

        $first = $this->create($body, $key)->assertStatus(201)->json('booking.id');
        $second = $this->create($body, $key)->assertStatus(200)->assertJsonPath('replayed', true)->json('booking.id');

        $this->assertSame($first, $second);
        $this->assertSame(1, ServiceBooking::count());
        $this->assertSame(1, ServiceBookingSubmission::where('source', 'staff')->count());
    }

    public function test_a_key_reused_for_a_different_appointment_is_refused(): void
    {
        $client = $this->seedClient();
        $key = (string) Str::uuid();
        $this->create($this->body($client), $key)->assertStatus(201);

        $this->create($this->body($client, ['start' => '2026-10-06T12:00']), $key)
            ->assertStatus(422)->assertJsonPath('error', 'idempotency_key_reused');
        $this->assertSame(1, ServiceBooking::count());
    }

    public function test_a_request_without_a_usable_key_is_refused(): void
    {
        $body = $this->body($this->seedClient());

        $this->asStaff()->postJson($this->api('bookings'), $body)->assertStatus(422)->assertJsonPath('error', 'idempotency_key_required');
        $this->create($body, 'short')->assertStatus(422)->assertJsonPath('error', 'idempotency_key_required');
        $this->create($body, str_repeat('k', 81))->assertStatus(422)->assertJsonPath('error', 'idempotency_key_required');
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_a_time_the_clock_skips_is_refused(): void
    {
        // Riga, 28 March 2027: 03:00 becomes 04:00. There is no 03:30.
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();

        $this->create($this->body($this->seedClient(), ['start' => '2027-03-28T03:30']))
            ->assertStatus(422)->assertJsonPath('error', 'time_does_not_exist');
    }

    public function test_a_day_that_has_passed_and_a_malformed_time_are_refused(): void
    {
        $client = $this->seedClient();

        $this->create($this->body($client, ['start' => '2026-10-04T10:00']))->assertStatus(422)->assertJsonPath('error', 'before_today');
        $this->create($this->body($client, ['start' => 'not-a-time']))->assertStatus(422)->assertJsonPath('error', 'invalid_time');
        $this->create($this->body($client, ['start' => '2026-10-06T10:00:00+03:00']))->assertStatus(422); // longer than the wall-clock form
    }

    public function test_staff_may_record_a_walk_in_who_started_earlier_today(): void
    {
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-05 12:00:00'));

        $this->create($this->body($this->seedClient(), ['start' => '2026-10-05T09:00', 'source' => 'walk_in']))
            ->assertStatus(201)->assertJsonPath('booking.source', 'walk_in');
    }

    public function test_unknown_clients_services_and_people_are_not_found(): void
    {
        $client = $this->seedClient();
        $theirs = $this->inOrganization($this->otherOrganization()->id, fn () => Guest::create(['full_name' => 'Theirs', 'phone' => '9', 'phone_key' => '9']));
        $retired = Service::create(['organization_id' => $this->org->id, 'name' => 'Retired', 'duration_minutes' => 30, 'price' => 10, 'is_active' => false]);

        $this->create($this->body($client, ['client_id' => $theirs->id]))->assertStatus(404)->assertJsonPath('error', 'client_not_found');
        $this->create($this->body($client, ['service_id' => $retired->id]))->assertStatus(404)->assertJsonPath('error', 'service_not_found');
        $this->create($this->body($client, ['master_id' => 999999]))->assertStatus(404)->assertJsonPath('error', 'master_not_found');
        $this->create($this->body($client, ['source' => 'widget']))->assertStatus(422);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `artisan test tests/Feature/Appointments/CreateAppointmentTest.php`
Expected: FAIL — every `POST` answers 405 or 404 (no route).

- [ ] **Step 3: Implement the writer**

Create `app/Services/Appointments/StaffBookingWriter.php`:

```php
<?php

namespace App\Services\Appointments;

use App\Models\AuditLog;
use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingSubmission;
use App\Models\ServiceMaster;
use App\Models\User;
use App\Services\ServiceSchedulingService;
use App\Support\AdvisoryLock;
use Carbon\CarbonImmutable;

/**
 * The one place the appointments workspace writes a booking's time.
 *
 * Same rules as every other entry point: the per-person advisory lock
 * (`svcm:{master}`) is taken first, the scheduler's reserveSlot() decides
 * inside it, and the row is written in the same transaction. What this adds
 * for staff: the booking carries its client and member, a retry with the
 * same Idempotency-Key answers with the first booking, and the audit row
 * names who did it.
 */
final class StaffBookingWriter
{
    /** `service_booking_submissions.source` for this entry point. */
    public const SOURCE = 'staff';

    public function __construct(private readonly ServiceSchedulingService $scheduler)
    {
    }

    /**
     * @param array{client_id: int, service_id: int, master_id: int, start: string, source?: ?string, customer_notes?: ?string, staff_notes?: ?string} $data
     * @return array{booking: ServiceBooking, replayed: bool}
     */
    public function create(array $data, string $key, User $actor): array
    {
        $orgId = (int) app('current_organization_id');
        $hash = hash('sha256', (string) json_encode([
            'client_id'      => (int) $data['client_id'],
            'service_id'     => (int) $data['service_id'],
            'master_id'      => (int) $data['master_id'],
            'start'          => (string) $data['start'],
            'source'         => (string) ($data['source'] ?? 'admin'),
            'customer_notes' => (string) ($data['customer_notes'] ?? ''),
            'staff_notes'    => (string) ($data['staff_notes'] ?? ''),
        ]));

        // A retry of a request that already succeeded must answer with that
        // booking, whatever has happened to the slot or the clock since.
        if ($replay = $this->replay($orgId, $key, $hash)) {
            return $replay;
        }

        $guest = Guest::find($data['client_id'])
            ?? throw new AppointmentRefused('client_not_found', 'This client no longer exists.', 404);
        $service = Service::where('is_active', true)->find($data['service_id'])
            ?? throw new AppointmentRefused('service_not_found', 'This service no longer exists.', 404);
        $master = ServiceMaster::where('is_active', true)->find($data['master_id'])
            ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);
        $this->assertPerforms($master, $service);
        $start = $this->startOrRefuse((string) $data['start'], $orgId);

        try {
            return AdvisoryLock::transaction("svcm:{$master->id}", function () use ($data, $key, $hash, $orgId, $guest, $service, $master, $start, $actor) {
                // Again, now that this request holds the lock: a second request
                // with the same key ran its first lookup before the first
                // committed, then waited here.
                if ($replay = $this->replay($orgId, $key, $hash)) {
                    return $replay;
                }

                $slot = $this->scheduler->reserveSlot($service, $master->id, $start->toIso8601String());

                $booking = ServiceBooking::create([
                    'organization_id'   => $orgId,
                    'service_id'        => $service->id,
                    'service_master_id' => $slot['master']->id,
                    'guest_id'          => $guest->id,
                    // Resolved through the tenant scope: a member id that is
                    // not this organisation's resolves to null.
                    'member_id'         => $guest->member_id ? LoyaltyMember::whereKey($guest->member_id)->value('id') : null,
                    'customer_name'     => (string) $guest->full_name,
                    // The column is NOT NULL; a client without an email is stored as ''.
                    'customer_email'    => (string) ($guest->email ?? ''),
                    'customer_phone'    => $guest->phone ?: ($guest->mobile ?: null),
                    'party_size'        => 1,
                    'start_at'          => $slot['start'],
                    'end_at'            => $slot['end'],
                    'duration_minutes'  => $slot['duration_minutes'],
                    'service_price'     => $slot['price'],
                    'extras_total'      => 0,
                    'total_amount'      => round((float) $slot['price'], 2),
                    'currency'          => $service->currency ?: 'EUR',
                    'status'            => 'confirmed',
                    'payment_status'    => 'unpaid',
                    'source'            => $data['source'] ?? 'admin',
                    'customer_notes'    => $data['customer_notes'] ?? null,
                    'staff_notes'       => $data['staff_notes'] ?? null,
                ]);

                ServiceBookingSubmission::create([
                    'organization_id'    => $orgId,
                    'idempotency_key'    => $key,
                    'source'             => self::SOURCE,
                    'outcome'            => 'success',
                    'service_booking_id' => $booking->id,
                    'customer_email'     => $guest->email ?: null,
                    'customer_name'      => (string) $guest->full_name,
                    'request_payload'    => ['_hash' => $hash, 'actor_id' => $actor->id],
                ]);

                AuditLog::record(
                    'service_booking.created',
                    $booking,
                    [
                        'start'      => VenueClock::wall($booking->start_at),
                        'end'        => VenueClock::wall($booking->end_at),
                        'master_id'  => (int) $booking->service_master_id,
                        'service_id' => (int) $booking->service_id,
                        'client_id'  => (int) $guest->id,
                        'status'     => 'confirmed',
                    ],
                    [],
                    $actor,
                    "Created appointment {$booking->booking_reference} for {$booking->customer_name}",
                );

                return ['booking' => $booking, 'replayed' => false];
            });
        } catch (\PDOException $e) {
            // A database failure is a \RuntimeException too; it must not be
            // reported to staff as "that time is taken".
            throw $e;
        } catch (\RuntimeException) {
            throw new AppointmentRefused('slot_taken', "That time is not free for {$master->name}. Choose another.", 409);
        }
    }

    /** `YYYY-MM-DDTHH:mm`, a time the venue's clock has, on the venue's today or later. */
    public function startOrRefuse(string $wall, int $orgId): CarbonImmutable
    {
        $start = VenueClock::parse($wall)
            ?? throw new AppointmentRefused('invalid_time', 'Send the start as YYYY-MM-DDTHH:mm.', 422);

        if (!VenueClock::exists($start, $orgId)) {
            throw new AppointmentRefused('time_does_not_exist', 'That time does not exist at the venue: the clocks change that night.', 422);
        }
        if ($start->format('Y-m-d') < VenueClock::today($orgId)) {
            throw new AppointmentRefused('before_today', 'An appointment cannot be placed on a day that has passed.', 422);
        }

        return $start;
    }

    public function assertPerforms(ServiceMaster $master, Service $service): void
    {
        if (!$service->masters()->where('service_masters.id', $master->id)->exists()) {
            throw new AppointmentRefused('master_not_eligible', "{$master->name} does not perform {$service->name}.", 422);
        }
    }

    /** @return array{booking: ServiceBooking, replayed: bool}|null */
    private function replay(int $orgId, string $key, string $hash): ?array
    {
        $prior = ServiceBookingSubmission::where('idempotency_key', $key)
            ->where('source', self::SOURCE)
            ->where('outcome', 'success')
            ->latest('id')
            ->first();
        if (!$prior) {
            return null;
        }
        if (($prior->request_payload['_hash'] ?? null) !== $hash) {
            throw new AppointmentRefused('idempotency_key_reused', 'This request key was already used for a different appointment.', 422);
        }

        // Without the brand scope: a retry after the operator switched brand
        // must still find the booking it made.
        $booking = ServiceBooking::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->find($prior->service_booking_id);

        return $booking ? ['booking' => $booking, 'replayed' => true] : null;
    }
}
```

- [ ] **Step 4: Implement the controller and route**

Create `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\StaffBookingWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Thin: validation here, rules in App\Services\Appointments and the shared scheduler. */
class BookingController extends Controller
{
    public function store(Request $request, StaffBookingWriter $writer, AppointmentPresenter $presenter): JsonResponse
    {
        $key = trim((string) $request->header('Idempotency-Key'));
        if (strlen($key) < 8 || strlen($key) > 80) {
            throw new AppointmentRefused('idempotency_key_required', 'Send an Idempotency-Key header of 8 to 80 characters.', 422);
        }

        $data = $request->validate([
            'client_id'      => 'required|integer',
            'service_id'     => 'required|integer',
            'master_id'      => 'required|integer',
            'start'          => 'required|string|max:16',
            'source'         => 'nullable|string|in:admin,phone,walk_in',
            'customer_notes' => 'nullable|string|max:2000',
            'staff_notes'    => 'nullable|string|max:2000',
        ]);

        $result = $writer->create($data, $key, $request->user());

        return response()->json(
            ['booking' => $presenter->detail($result['booking']->fresh()), 'replayed' => $result['replayed']],
            $result['replayed'] ? 200 : 201,
        );
    }
}
```

In `routes/api.php`, inside the `appointments` group:

```php
                Route::post('bookings', [\App\Http\Controllers\Api\V1\Admin\Appointments\BookingController::class, 'store']);
```

- [ ] **Step 5: Run the test to see it pass**

Run: `artisan test tests/Feature/Appointments/CreateAppointmentTest.php`
Expected: `Tests: 13 passed`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Services/Appointments/StaffBookingWriter.php app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php routes/api.php tests/Feature/Appointments/CreateAppointmentTest.php && git commit -q -F - <<'EOF'
Create an appointment from the workspace, linked to its client

Under the scheduler's per-person lock, with the conflict check inside it.
The booking stores the client and, for a member, the member. A retry with
the same Idempotency-Key answers with the first booking; the audit row
names the staff user.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 9: Read one appointment and move it

**Files:**
- Modify: `app/Services/Appointments/StaffBookingWriter.php` (add `move()`)
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php` (add `show()`, `update()`, private `stale()`)
- Modify: `routes/api.php` (two routes)
- Test: `tests/Feature/Appointments/MoveAppointmentTest.php`

**Interfaces:**
- Consumes: `StaleAppointment::unless(ServiceBooking, string)`, `AppointmentActions::MOVABLE`, `AppointmentPresenter::detail()`, `::revision()` (Task 5); `StaffBookingWriter::startOrRefuse()`, `assertPerforms()` (Task 8).
- Produces:
  - `StaffBookingWriter::move(int $id, string $wall, int $masterId, string $revision, User $actor): ServiceBooking` — throws `AppointmentRefused` or `StaleAppointment`.
  - `GET bookings/{id}` → `{booking: detail}`.
  - `PATCH bookings/{id} {start, master_id, revision}` → `200 {booking: detail}`; `409 {error: 'stale', message, current: detail}`; `409 slot_taken`; `422 not_allowed`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/MoveAppointmentTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class MoveAppointmentTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function move(ServiceBooking $booking, array $body): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->patchJson($this->api("bookings/{$booking->id}"), array_merge([
            'start'     => '2026-10-06T14:00',
            'master_id' => $this->master->id,
            'revision'  => AppointmentPresenter::revision($booking->fresh()),
        ], $body));
    }

    /** A second person who performs the seeded service, working 09:00–17:00 every day. */
    private function secondPerson(?int $durationOverride = null): ServiceMaster
    {
        $second = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Liam Brown', 'is_active' => true]);
        DB::table('service_master_service')->insert([
            'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $second->id,
            'duration_override_minutes' => $durationOverride, 'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach (range(0, 6) as $day) {
            DB::table('service_master_schedules')->insert([
                'organization_id' => $this->org->id, 'service_master_id' => $second->id, 'day_of_week' => $day,
                'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $second;
    }

    public function test_the_detail_call_answers_the_full_appointment(): void
    {
        $booking = $this->seedBooking(['staff_notes' => 'Prefers firm pressure']);

        $this->asStaff()->getJson($this->api("bookings/{$booking->id}"))->assertOk()
            ->assertJsonPath('booking.id', $booking->id)
            ->assertJsonPath('booking.notes.staff', 'Prefers firm pressure')
            ->assertJsonPath('booking.client.phone', '+44 7700 900123')
            ->assertJsonCount(8, 'booking.actions');
    }

    public function test_another_organisations_appointment_is_not_found(): void
    {
        $theirs = $this->inOrganization($this->otherOrganization()->id, fn () => $this->seedBooking());

        $this->asStaff()->getJson($this->api("bookings/{$theirs->id}"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asStaff()->patchJson($this->api("bookings/{$theirs->id}"), ['start' => '2026-10-06T14:00', 'master_id' => $this->master->id, 'revision' => 'x'])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    public function test_moving_changes_the_time_and_nothing_else(): void
    {
        $booking = $this->seedBooking([
            'guest_id' => $this->seedClient()->id, 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_777',
            'service_price' => 55, 'total_amount' => 55,
        ]);
        $before = $booking->fresh();

        $this->move($booking, [])->assertOk()
            ->assertJsonPath('booking.start', '2026-10-06T14:00')
            ->assertJsonPath('booking.end', '2026-10-06T14:45')
            ->assertJsonPath('booking.price.total', 55);

        $after = $booking->fresh();
        $this->assertSame('2026-10-06 14:00:00', $after->start_at->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-06 14:45:00', $after->end_at->format('Y-m-d H:i:s'));
        foreach (['booking_reference', 'service_id', 'service_master_id', 'guest_id', 'service_price', 'total_amount', 'status', 'payment_status', 'stripe_payment_intent_id', 'customer_name'] as $kept) {
            $this->assertSame($before->{$kept}, $after->{$kept}, $kept);
        }
        $this->assertNotSame(AppointmentPresenter::revision($before), AppointmentPresenter::revision($after));

        $audit = AuditLog::where('subject_type', ServiceBooking::class)->where('subject_id', $booking->id)->where('action', 'service_booking.moved')->firstOrFail();
        $this->assertSame($this->staff->id, (int) $audit->causer_id);
        $this->assertSame('2026-10-06T10:00', $audit->old_values['start']);
        $this->assertSame('2026-10-06T14:00', $audit->new_values['start']);
    }

    public function test_an_appointment_does_not_conflict_with_itself(): void
    {
        $booking = $this->seedBooking(); // 10:00–10:45

        $this->move($booking, ['start' => '2026-10-06T10:15'])->assertOk()->assertJsonPath('booking.start', '2026-10-06T10:15');
    }

    public function test_moving_onto_another_appointment_is_refused_and_nothing_changes(): void
    {
        $booking = $this->seedBooking();
        $this->seedBooking(['start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);

        $this->move($booking, ['start' => '2026-10-06T14:30'])->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->move($booking, ['start' => '2026-10-06T16:45'])->assertStatus(409)->assertJsonPath('error', 'slot_taken'); // past closing
        $this->assertSame('2026-10-06 10:00:00', $booking->fresh()->start_at->format('Y-m-d H:i:s'));
    }

    public function test_a_stale_revision_is_refused_with_the_current_appointment(): void
    {
        $booking = $this->seedBooking();
        $seenByOperatorB = AppointmentPresenter::revision($booking->fresh());

        // Operator A marks the client as arrived.
        $booking->update(['status' => 'in_progress']);

        $this->move($booking, ['revision' => $seenByOperatorB])
            ->assertStatus(409)
            ->assertJsonPath('error', 'stale')
            ->assertJsonPath('current.id', $booking->id)
            ->assertJsonPath('current.status', 'in_progress')
            ->assertJsonPath('current.start', '2026-10-06T10:00');

        $this->assertSame('2026-10-06 10:00:00', $booking->fresh()->start_at->format('Y-m-d H:i:s'));
        $this->assertSame(0, AuditLog::where('action', 'service_booking.moved')->count());
    }

    /** @return array<string, array{0: string}> */
    public static function finalStatuses(): array
    {
        return ['completed' => ['completed'], 'cancelled' => ['cancelled'], 'no_show' => ['no_show']];
    }

    #[DataProvider('finalStatuses')]
    public function test_a_finished_appointment_cannot_be_moved(string $status): void
    {
        $booking = $this->seedBooking(['status' => $status]);

        $this->move($booking, [])->assertStatus(422)->assertJsonPath('error', 'not_allowed');
    }

    public function test_moving_to_another_person_uses_that_persons_duration_and_keeps_the_price(): void
    {
        $booking = $this->seedBooking();
        $liam = $this->secondPerson(durationOverride: 60);

        $this->move($booking, ['master_id' => $liam->id, 'start' => '2026-10-06T11:00'])->assertOk()
            ->assertJsonPath('booking.master.id', $liam->id)
            ->assertJsonPath('booking.end', '2026-10-06T12:00')
            ->assertJsonPath('booking.duration_minutes', 60)
            ->assertJsonPath('booking.price.total', 60);
    }

    public function test_moving_to_someone_who_does_not_perform_the_service_is_refused(): void
    {
        $booking = $this->seedBooking();
        $untrained = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Not Trained', 'is_active' => true]);

        $this->move($booking, ['master_id' => $untrained->id])->assertStatus(422)->assertJsonPath('error', 'master_not_eligible');
        $this->move($booking, ['master_id' => 999999])->assertStatus(404)->assertJsonPath('error', 'master_not_found');
    }

    public function test_a_move_needs_a_time_a_person_and_a_revision(): void
    {
        $booking = $this->seedBooking();

        $this->asStaff()->patchJson($this->api("bookings/{$booking->id}"), ['start' => '2026-10-06T14:00'])->assertStatus(422);
        $this->move($booking, ['start' => '2026-10-04T10:00'])->assertStatus(422)->assertJsonPath('error', 'before_today');
        $this->move($booking, ['start' => 'soon'])->assertStatus(422)->assertJsonPath('error', 'invalid_time');
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `artisan test tests/Feature/Appointments/MoveAppointmentTest.php`
Expected: FAIL — 404/405 (no routes).

- [ ] **Step 3: Add `move()` to the writer**

In `app/Services/Appointments/StaffBookingWriter.php`, add after `create()`:

```php
    /**
     * Move an appointment to another time and/or person. It keeps its
     * reference, service, price, payment and links; the duration is the new
     * person's. The scheduler leaves the appointment's own row out of the
     * conflict check.
     *
     * Lock order: the target person's `svcm:` lock, then the booking row.
     */
    public function move(int $id, string $wall, int $masterId, string $revision, User $actor): ServiceBooking
    {
        $orgId = (int) app('current_organization_id');

        // The booking first, outside the lock, only to answer 404 before
        // anything else can refuse; everything is read again under the lock.
        if (!ServiceBooking::whereKey($id)->exists()) {
            throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);
        }
        $master = ServiceMaster::where('is_active', true)->find($masterId)
            ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);
        $start = $this->startOrRefuse($wall, $orgId);

        try {
            return AdvisoryLock::transaction("svcm:{$master->id}", function () use ($id, $master, $start, $revision, $actor) {
                $booking = ServiceBooking::lockForUpdate()->find($id)
                    ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);

                StaleAppointment::unless($booking, $revision);

                if (!in_array((string) $booking->status, AppointmentActions::MOVABLE, true)) {
                    throw new AppointmentRefused('not_allowed', "A {$booking->status} appointment cannot be moved.", 422);
                }

                $service = Service::find($booking->service_id)
                    ?? throw new AppointmentRefused('service_not_found', 'This appointment\'s service no longer exists.', 422);
                $this->assertPerforms($master, $service);

                $slot = $this->scheduler->reserveSlot($service, $master->id, $start->toIso8601String(), $booking->id);

                $old = [
                    'start'     => VenueClock::wall($booking->start_at),
                    'end'       => VenueClock::wall($booking->end_at),
                    'master_id' => (int) $booking->service_master_id,
                ];

                $booking->update([
                    'start_at'          => $slot['start'],
                    'end_at'            => $slot['end'],
                    'duration_minutes'  => $slot['duration_minutes'],
                    'service_master_id' => $slot['master']->id,
                ]);

                AuditLog::record(
                    'service_booking.moved',
                    $booking,
                    [
                        'start'     => VenueClock::wall($booking->start_at),
                        'end'       => VenueClock::wall($booking->end_at),
                        'master_id' => (int) $booking->service_master_id,
                    ],
                    $old,
                    $actor,
                    "Moved appointment {$booking->booking_reference} to " . VenueClock::wall($booking->start_at) . " with {$master->name}",
                );

                return $booking;
            });
        } catch (\PDOException $e) {
            throw $e;
        } catch (\RuntimeException) {
            throw new AppointmentRefused('slot_taken', "That time is not free for {$master->name}. Choose another.", 409);
        }
    }
```

- [ ] **Step 4: Add `show()`, `update()` and `stale()` to the controller**

In `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php`, add the imports:

```php
use App\Models\ServiceBooking;
use App\Services\Appointments\StaleAppointment;
```

and the methods, after `store()`:

```php
    public function show(int $id, AppointmentPresenter $presenter): JsonResponse
    {
        $booking = ServiceBooking::find($id)
            ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);

        return response()->json(['booking' => $presenter->detail($booking)]);
    }

    public function update(Request $request, int $id, StaffBookingWriter $writer, AppointmentPresenter $presenter): JsonResponse
    {
        $data = $request->validate([
            'start'     => 'required|string|max:16',
            'master_id' => 'required|integer',
            'revision'  => 'required|string|max:64',
        ]);

        try {
            $booking = $writer->move($id, $data['start'], (int) $data['master_id'], $data['revision'], $request->user());
        } catch (StaleAppointment $e) {
            return $this->stale($e, $presenter);
        }

        return response()->json(['booking' => $presenter->detail($booking->fresh())]);
    }

    /** Someone changed the appointment first: answer with what it is now. */
    private function stale(StaleAppointment $e, AppointmentPresenter $presenter): JsonResponse
    {
        return response()->json([
            'error'   => 'stale',
            'message' => $e->getMessage(),
            'current' => $presenter->detail($e->booking->fresh()),
        ], 409);
    }
```

In `routes/api.php`, inside the `appointments` group:

```php
                Route::get('bookings/{id}',   [\App\Http\Controllers\Api\V1\Admin\Appointments\BookingController::class, 'show'])->whereNumber('id');
                Route::patch('bookings/{id}', [\App\Http\Controllers\Api\V1\Admin\Appointments\BookingController::class, 'update'])->whereNumber('id');
```

- [ ] **Step 5: Run the test to see it pass**

Run: `artisan test tests/Feature/Appointments/MoveAppointmentTest.php`
Expected: `Tests: 12 passed`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Services/Appointments/StaffBookingWriter.php app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php routes/api.php tests/Feature/Appointments/MoveAppointmentTest.php && git commit -q -F - <<'EOF'
Move an appointment, and refuse a save over a newer change

Moving keeps the reference, service, price, payment and client; the
scheduler checks the new time without counting the appointment itself. A
revision that no longer matches under the row lock answers 409 with the
current appointment.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 10: Actions — confirm, start, complete, no-show, cancel, mark paid at venue, award points

**Files:**
- Create: `app/Services/Appointments/AppointmentActionRunner.php`
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php` (add `action()`)
- Modify: `routes/api.php` (one route)
- Test: `tests/Feature/Appointments/AppointmentActionEndpointTest.php`

**Interfaces:**
- Consumes: `AppointmentActions::FROM`, `->allowed()` (Task 5); `StaleAppointment::unless()`; `BookingPointsService::previewForServiceBooking()`, `awardForServiceBooking(ServiceBooking): ?PointsTransaction`.
- Produces:
  - `AppointmentActionRunner::run(int $id, string $action, string $revision, ?string $reason, User $actor): array{booking: ServiceBooking, points: ?array{awarded: int, reason: ?string}}`. `points` is non-null only for `complete` and `award_points`; `reason` is `null` when `awarded > 0`, else the preview's reason, or `failed` when the worker threw.
  - `POST bookings/{id}/actions {action, revision, reason?}` → `200 {booking: detail, points}`; `409 stale`; `422 not_allowed`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/AppointmentActionEndpointTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentActionEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function act(ServiceBooking $booking, string $action, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->postJson($this->api("bookings/{$booking->id}/actions"), array_merge([
            'action'   => $action,
            'revision' => AppointmentPresenter::revision($booking->fresh()),
        ], $extra));
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> from status, action, resulting status */
    public static function transitions(): array
    {
        return [
            'confirm a pending request' => ['pending', 'confirm', 'confirmed'],
            'client arrived'            => ['confirmed', 'start', 'in_progress'],
            'complete from confirmed'   => ['confirmed', 'complete', 'completed'],
            'complete from in progress' => ['in_progress', 'complete', 'completed'],
            'no-show'                   => ['confirmed', 'no_show', 'no_show'],
            'cancel'                    => ['in_progress', 'cancel', 'cancelled'],
        ];
    }

    #[DataProvider('transitions')]
    public function test_a_transition_writes_the_status_and_an_audit_row(string $from, string $action, string $to): void
    {
        $booking = $this->seedBooking(['status' => $from]);

        $this->act($booking, $action)->assertOk()->assertJsonPath('booking.status', $to);

        $this->assertSame($to, $booking->fresh()->status);
        $audit = AuditLog::where('subject_type', ServiceBooking::class)->where('subject_id', $booking->id)->firstOrFail();
        $this->assertSame("service_booking.{$action}", $audit->action);
        $this->assertSame($this->staff->id, (int) $audit->causer_id);
        $this->assertSame($from, $audit->old_values['status']);
        $this->assertSame($to, $audit->new_values['status']);
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function refused(): array
    {
        return [
            'complete a cancelled visit' => ['cancelled', 'complete'],
            'cancel a completed visit'   => ['completed', 'cancel'],
            'start a pending request'    => ['pending', 'start'],
            'no-show after it started'   => ['in_progress', 'no_show'],
            'confirm what is confirmed'  => ['confirmed', 'confirm'],
            'an action that is not one'  => ['confirmed', 'refund'],
            'move is not an action here' => ['confirmed', 'move'],
        ];
    }

    #[DataProvider('refused')]
    public function test_an_action_the_status_does_not_allow_is_refused(string $status, string $action): void
    {
        $booking = $this->seedBooking(['status' => $status]);

        $this->act($booking, $action)->assertStatus(422)->assertJsonPath('error', 'not_allowed');

        $this->assertSame($status, $booking->fresh()->status);
        $this->assertSame(0, AuditLog::where('subject_id', $booking->id)->count());
    }

    public function test_a_stale_action_is_refused(): void
    {
        $booking = $this->seedBooking();
        $seenByOperatorB = AppointmentPresenter::revision($booking->fresh());
        $booking->update(['start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']); // operator A moved it

        $this->act($booking, 'cancel', ['revision' => $seenByOperatorB])
            ->assertStatus(409)->assertJsonPath('error', 'stale')->assertJsonPath('current.start', '2026-10-06T12:00');
        $this->assertSame('confirmed', $booking->fresh()->status);
    }

    public function test_cancel_stores_the_reason_and_the_time(): void
    {
        $booking = $this->seedBooking();

        $this->act($booking, 'cancel', ['reason' => str_repeat('r', 300)])->assertOk();

        $fresh = $booking->fresh();
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertSame(255, mb_strlen($fresh->cancellation_reason)); // the column holds 255
        $this->act($booking, 'cancel', ['reason' => str_repeat('r', 501)])->assertStatus(422);
    }

    public function test_cancel_never_touches_the_payment_fields(): void
    {
        $booking = $this->seedBooking(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_held_1']);

        $this->act($booking, 'cancel')->assertOk()
            ->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.payment.state', 'card_held');

        $fresh = $booking->fresh();
        $this->assertSame('authorized', $fresh->payment_status);
        $this->assertSame('pi_held_1', $fresh->stripe_payment_intent_id);
        $this->assertNull($fresh->refunded_amount);
    }

    public function test_completing_a_members_visit_awards_points_once(): void
    {
        $booking = $this->seedBooking(['member_id' => $this->member->id]);

        $this->act($booking, 'complete')->assertOk()
            ->assertJsonPath('points', ['awarded' => 900, 'reason' => null])
            ->assertJsonPath('booking.loyalty.awarded', 900);

        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
        $this->assertSame(900, (int) $this->member->fresh()->current_points);
        $this->assertNotNull($booking->fresh()->points_awarded_at);

        // Completed is final here: a second press is refused and awards nothing.
        $this->act($booking, 'complete')->assertStatus(422);
        $this->act($booking, 'award_points')->assertStatus(422);
        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
    }

    public function test_completing_a_non_members_visit_says_why_no_points(): void
    {
        $booking = $this->seedBooking();

        $this->act($booking, 'complete')->assertOk()
            ->assertJsonPath('booking.status', 'completed')
            ->assertJsonPath('points', ['awarded' => 0, 'reason' => 'not_a_member']);
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_an_award_that_did_not_happen_can_be_run_again(): void
    {
        // Completed elsewhere (the award failed or never ran): unstamped, still due.
        $booking = $this->seedBooking(['status' => 'completed', 'member_id' => $this->member->id]);

        $this->act($booking, 'award_points')->assertOk()
            ->assertJsonPath('points', ['awarded' => 900, 'reason' => null])
            ->assertJsonPath('booking.status', 'completed');
        $this->act($booking, 'award_points')->assertStatus(422);
        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
    }

    public function test_marking_paid_at_the_venue_is_a_label_and_is_refused_on_a_card_payment(): void
    {
        $booking = $this->seedBooking();
        $this->act($booking, 'mark_paid_at_venue')->assertOk()->assertJsonPath('booking.payment.state', 'marked_paid');
        $this->assertSame('paid', $booking->fresh()->payment_status);
        $this->assertSame('confirmed', $booking->fresh()->status);

        $held = $this->seedBooking(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_held_2', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $this->act($held, 'mark_paid_at_venue')->assertStatus(422)->assertJsonPath('error', 'not_allowed');
        $this->assertSame('authorized', $held->fresh()->payment_status);
    }

    public function test_a_visit_booked_in_the_workspace_for_a_member_earns_on_completion(): void
    {
        $ada = $this->seedMemberClient();
        $id = $this->asStaff()->postJson($this->api('bookings'), [
            'client_id' => $ada->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00',
        ], ['Idempotency-Key' => (string) Str::uuid()])->assertStatus(201)->json('booking.id');

        $this->act(ServiceBooking::findOrFail($id), 'complete')->assertOk()->assertJsonPath('points.awarded', 900);
        $this->assertSame(900, (int) $this->member->fresh()->current_points);
    }

    public function test_another_organisations_appointment_cannot_be_acted_on(): void
    {
        $theirs = $this->inOrganization($this->otherOrganization()->id, fn () => $this->seedBooking());

        $this->asStaff()->postJson($this->api("bookings/{$theirs->id}/actions"), ['action' => 'cancel', 'revision' => 'x'])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `artisan test tests/Feature/Appointments/AppointmentActionEndpointTest.php`
Expected: FAIL — 404/405 (no route).

- [ ] **Step 3: Implement the runner**

Create `app/Services/Appointments/AppointmentActionRunner.php`:

```php
<?php

namespace App\Services\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Runs one staff action on an appointment: under the row lock, against the
 * revision the client saw, through the transition table. It writes the
 * appointment's own status (or, for "paid at venue", the payment label) and
 * nothing else — no payment, refund or message is triggered from here. The
 * one side effect, points for a completed visit, is the existing worker's,
 * called once after the transaction commits.
 */
final class AppointmentActionRunner
{
    public function __construct(
        private readonly AppointmentActions $actions,
        private readonly BookingPointsService $points,
    ) {
    }

    /** @return array{booking: ServiceBooking, points: ?array{awarded: int, reason: ?string}} */
    public function run(int $id, string $action, string $revision, ?string $reason, User $actor): array
    {
        if (!array_key_exists($action, AppointmentActions::FROM)) {
            throw new AppointmentRefused('not_allowed', 'That action is not available.', 422);
        }

        $preview = null;

        $booking = DB::transaction(function () use ($id, $action, $revision, $reason, $actor, &$preview) {
            $booking = ServiceBooking::lockForUpdate()->find($id)
                ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);

            StaleAppointment::unless($booking, $revision);

            if (!$this->actions->allowed($booking, $action)) {
                throw new AppointmentRefused('not_allowed', "This appointment is {$booking->status}; that action is not available.", 422);
            }
            if (in_array($action, ['complete', 'award_points'], true)) {
                $preview = $this->points->previewForServiceBooking($booking);
            }

            $old = ['status' => (string) $booking->status, 'payment_status' => (string) $booking->payment_status];
            $reason = $reason !== null && trim($reason) !== '' ? mb_substr(trim($reason), 0, 255) : null;

            $patch = match ($action) {
                'confirm'            => ['status' => 'confirmed'],
                'start'              => ['status' => 'in_progress'],
                'complete'           => ['status' => 'completed'],
                'no_show'            => ['status' => 'no_show'],
                'cancel'             => ['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => $reason],
                'mark_paid_at_venue' => ['payment_status' => 'paid'],
                'award_points'       => [],
            };
            if ($patch !== []) {
                $booking->update($patch);
            }

            $new = ['status' => (string) $booking->status, 'payment_status' => (string) $booking->payment_status];
            if ($action === 'cancel') {
                $new['cancellation_reason'] = $reason;
            }
            AuditLog::record("service_booking.{$action}", $booking, $new, $old, $actor, "Appointment {$booking->booking_reference}: {$action}");

            return $booking;
        });

        $points = null;
        if ($preview !== null) {
            $awarded = 0;
            $failed = false;
            try {
                $awarded = (int) ($this->points->awardForServiceBooking($booking->fresh())?->points ?? 0);
            } catch (\Throwable $e) {
                // The status is saved; the award is not. The panel says so and
                // offers "Award points" (the same worker, safe to run again).
                $failed = true;
                Log::warning('service_booking.points_failed', ['id' => $booking->id, 'error' => $e->getMessage()]);
            }
            $points = [
                'awarded' => $awarded,
                'reason'  => $awarded > 0 ? null : ($failed ? 'failed' : ($preview['reason'] ?? 'zero_amount')),
            ];
        }

        return ['booking' => $booking->fresh(), 'points' => $points];
    }
}
```

- [ ] **Step 4: Add `action()` and the route**

In `BookingController.php`, add the import `use App\Services\Appointments\AppointmentActionRunner;` and, after `update()`:

```php
    public function action(Request $request, int $id, AppointmentActionRunner $runner, AppointmentPresenter $presenter): JsonResponse
    {
        $data = $request->validate([
            'action'   => 'required|string|max:40',
            'revision' => 'required|string|max:64',
            'reason'   => 'nullable|string|max:500',
        ]);

        try {
            $result = $runner->run($id, $data['action'], $data['revision'], $data['reason'] ?? null, $request->user());
        } catch (StaleAppointment $e) {
            return $this->stale($e, $presenter);
        }

        return response()->json(['booking' => $presenter->detail($result['booking']), 'points' => $result['points']]);
    }
```

In `routes/api.php`, inside the `appointments` group:

```php
                Route::post('bookings/{id}/actions', [\App\Http\Controllers\Api\V1\Admin\Appointments\BookingController::class, 'action'])->whereNumber('id');
```

- [ ] **Step 5: Run the test to see it pass**

Run: `artisan test tests/Feature/Appointments/AppointmentActionEndpointTest.php`
Expected: `Tests: 22 passed`.

- [ ] **Step 6: Run the whole appointments suite and the gate's route test**

Run: `artisan test tests/Feature/Appointments` and `artisan test tests/Unit/Appointments`
Expected: 0 failed; `test_every_appointments_route_carries_the_gate` passes with all ten routes.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Services/Appointments/AppointmentActionRunner.php app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php routes/api.php tests/Feature/Appointments/AppointmentActionEndpointTest.php && git commit -q -F - <<'EOF'
Run an appointment's actions through one validated transition table

Confirm, start, complete, no-show, cancel and "paid at venue" are checked
against the status and the revision under the row lock, and audited with
the staff user. Completing calls the existing points worker once and
reports what it awarded, or why nothing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---
### Task 11: The full admin's audit rows gain their actor (S7), and cross-interface parity

The full admin's booking controller passes `user_id` to `AuditLog::create()`; that is not a column, so every row it writes has no actor and no subject. The workspace's history reads audit rows by subject, so changes made in the full admin would be invisible there. This task fixes the four write sites — nothing else in that controller changes — and pins that both interfaces read and write the same records.

This reaches every organisation (it is not behind the flag). Its own commit.

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` — `bulk()` near `:240-272`, `store()` at `:463-468`, `updateStatus()` at `:491-518`, `destroy()` at `:532-537`
- Test: `tests/Feature/Appointments/FullAdminAuditActorTest.php`, `tests/Feature/Appointments/CrossInterfaceParityTest.php`

**Interfaces:**
- Consumes: `AuditLog::record(string $action, $subject = null, array $newValues = [], array $oldValues = [], ?Model $causer = null, ?string $description = null): void`.
- Produces: audit actions `service_booking.created`, `service_booking.updated`, `service_booking.cancelled`, `service_booking.bulk.<action>` now carry `causer_type`/`causer_id` (the staff `User`) and, except the bulk summary row, `subject_type`/`subject_id` (the booking). No request or response of the full admin changes.

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/Appointments/FullAdminAuditActorTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * The full admin's own endpoints, for an organisation that never opted in
 * to the workspace: every audit row they write must say who did it and to
 * which booking.
 */
class FullAdminAuditActorTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments(enabled: false);
    }

    private function rowsFor(ServiceBooking $booking): \Illuminate\Support\Collection
    {
        return AuditLog::where('subject_type', ServiceBooking::class)->where('subject_id', $booking->id)->orderBy('id')->get();
    }

    private function assertActor(AuditLog $row): void
    {
        $this->assertSame(User::class, $row->causer_type);
        $this->assertSame($this->staff->id, (int) $row->causer_id);
    }

    public function test_create_names_the_actor_and_the_booking(): void
    {
        $id = $this->asStaff()->postJson('/api/v1/admin/service-bookings', [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Walk In', 'customer_email' => 'walkin@example.test', 'start_at' => '2026-10-06T10:00:00',
        ])->assertStatus(201)->json('id');

        $rows = $this->rowsFor(ServiceBooking::findOrFail($id));
        $this->assertCount(1, $rows);
        $this->assertSame('service_booking.created', $rows[0]->action);
        $this->assertActor($rows[0]);
    }

    public function test_a_status_change_names_the_actor_and_what_changed(): void
    {
        $booking = $this->seedBooking();

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$booking->id}/status", ['status' => 'in_progress'])->assertOk();

        $row = $this->rowsFor($booking)->sole();
        $this->assertSame('service_booking.updated', $row->action);
        $this->assertActor($row);
        $this->assertSame('confirmed', $row->old_values['status']);
        $this->assertSame('in_progress', $row->new_values['status']);
    }

    public function test_a_bulk_action_writes_one_row_per_booking_and_keeps_its_summary(): void
    {
        $first = $this->seedBooking();
        $second = $this->seedBooking(['start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$first->id, $second->id], 'action' => 'mark_no_show'])
            ->assertOk()->assertJsonPath('updated', 2);

        foreach ([$first, $second] as $booking) {
            $row = $this->rowsFor($booking)->sole();
            $this->assertSame('service_booking.bulk.mark_no_show', $row->action);
            $this->assertActor($row);
            $this->assertSame('confirmed', $row->old_values['status']);
            $this->assertSame('no_show', $row->new_values['status']);
        }

        $summary = AuditLog::where('action', 'service_booking.bulk.mark_no_show')->whereNull('subject_id')->sole();
        $this->assertActor($summary);
        $this->assertSame('Bulk mark_no_show: 2 service bookings', $summary->description);
    }

    public function test_delete_which_cancels_leaves_a_row(): void
    {
        $booking = $this->seedBooking();

        $this->asStaff()->deleteJson("/api/v1/admin/service-bookings/{$booking->id}")->assertOk();

        $row = $this->rowsFor($booking)->sole();
        $this->assertSame('service_booking.cancelled', $row->action);
        $this->assertActor($row);
        $this->assertSame('cancelled', $booking->fresh()->status);
    }
}
```

Create `tests/Feature/Appointments/CrossInterfaceParityTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\ServiceBooking;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * One core, two experiences: what the workspace writes, the full admin
 * reads, and the other way round — the same rows, no copy, no sync.
 */
class CrossInterfaceParityTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function bookInWorkspace(int $clientId, string $start = '2026-10-06T10:00'): int
    {
        return $this->asStaff()->postJson($this->api('bookings'), [
            'client_id' => $clientId, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => $start,
        ], ['Idempotency-Key' => (string) Str::uuid()])->assertStatus(201)->json('booking.id');
    }

    private function fullAdminList(): array
    {
        return $this->asStaff()->getJson('/api/v1/admin/service-bookings')->assertOk()->json('data');
    }

    public function test_a_workspace_booking_appears_in_the_full_admin(): void
    {
        $id = $this->bookInWorkspace($this->seedMemberClient()->id);

        $row = collect($this->fullAdminList())->firstWhere('id', $id);
        $this->assertNotNull($row, 'the full admin list does not show the workspace booking');
        $this->assertSame('Ada Member', $row['customer_name']);
        $this->assertSame('confirmed', $row['status']);
        $this->assertSame($this->member->member_number, $row['member']['member_number']);

        $calendar = $this->asStaff()->getJson('/api/v1/admin/service-bookings/calendar?month=2026-10')->assertOk()->json('bookings');
        $this->assertContains($id, array_column($calendar, 'id'));

        $this->asStaff()->getJson("/api/v1/admin/service-bookings/{$id}")->assertOk()
            ->assertJsonPath('customer_email', 'ada@example.test')
            ->assertJsonPath('member.id', $this->member->id);
    }

    public function test_a_phone_only_client_booking_renders_in_the_full_admin(): void
    {
        $id = $this->bookInWorkspace($this->seedClient()->id);
        $reference = ServiceBooking::findOrFail($id)->booking_reference;

        $row = collect($this->fullAdminList())->firstWhere('id', $id);
        $this->assertSame('', $row['customer_email']);
        $this->assertNull($row['member']);

        $this->asStaff()->getJson("/api/v1/admin/service-bookings/{$id}")->assertOk()->assertJsonPath('customer_email', '');
        $this->assertContains($id, array_column(
            $this->asStaff()->getJson('/api/v1/admin/service-bookings/calendar?month=2026-10')->assertOk()->json('bookings'), 'id',
        ));

        $csv = $this->asStaff()->postJson('/api/v1/admin/service-bookings/export', ['ids' => [$id]])->assertOk()->streamedContent();
        $this->assertStringContainsString($reference, $csv);
        $this->assertStringContainsString('Sophie Williams', $csv);
    }

    public function test_a_full_admin_change_shows_in_the_workspace_with_its_actor(): void
    {
        $id = $this->bookInWorkspace($this->seedClient()->id);
        $before = $this->asStaff()->getJson($this->api("bookings/{$id}"))->json('booking.revision');

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$id}/status", ['status' => 'in_progress'])->assertOk();

        $after = $this->asStaff()->getJson($this->api("bookings/{$id}"))->assertOk()
            ->assertJsonPath('booking.status', 'in_progress')
            ->assertJsonPath('booking.history.0.action', 'service_booking.updated')
            ->assertJsonPath('booking.history.0.actor', 'Staff')
            ->json('booking.revision');
        $this->assertNotSame($before, $after);

        $this->asStaff()->getJson($this->api('calendar') . '?from=2026-10-06&to=2026-10-06')->assertOk()
            ->assertJsonPath('appointments.0.status', 'in_progress');
    }

    public function test_a_full_admin_booking_shows_in_the_workspace_without_a_client_link(): void
    {
        $id = $this->asStaff()->postJson('/api/v1/admin/service-bookings', [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Old Way', 'customer_email' => 'old@example.test', 'start_at' => '2026-10-06T13:00:00',
        ])->assertStatus(201)->json('id');

        $this->asStaff()->getJson($this->api('calendar') . '?from=2026-10-06&to=2026-10-06')->assertOk()
            ->assertJsonPath('appointments.0.id', $id)
            ->assertJsonPath('appointments.0.start', '2026-10-06T13:00')
            ->assertJsonPath('appointments.0.client', ['id' => null, 'name' => 'Old Way', 'is_member' => false]);
    }

    public function test_a_workspace_move_and_cancel_show_in_the_full_admin(): void
    {
        $id = $this->bookInWorkspace($this->seedClient()->id);
        $revision = fn () => $this->asStaff()->getJson($this->api("bookings/{$id}"))->json('booking.revision');

        $this->asStaff()->patchJson($this->api("bookings/{$id}"), ['start' => '2026-10-06T15:00', 'master_id' => $this->master->id, 'revision' => $revision()])->assertOk();
        $this->assertStringStartsWith('2026-10-06T15:00:00', $this->asStaff()->getJson("/api/v1/admin/service-bookings/{$id}")->assertOk()->json('start_at'));

        $this->asStaff()->postJson($this->api("bookings/{$id}/actions"), ['action' => 'cancel', 'revision' => $revision(), 'reason' => 'Client rang'])->assertOk();
        $this->assertSame('cancelled', collect($this->fullAdminList())->firstWhere('id', $id)['status']);
        $this->assertNotContains($id, array_column(
            $this->asStaff()->getJson('/api/v1/admin/service-bookings/calendar?month=2026-10')->assertOk()->json('bookings'), 'id',
        ));
    }

    public function test_the_two_interfaces_refuse_the_same_slot(): void
    {
        $this->bookInWorkspace($this->seedClient()->id); // 10:00–10:45

        $this->asStaff()->postJson('/api/v1/admin/service-bookings', [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Late', 'customer_email' => 'late@example.test', 'start_at' => '2026-10-06T10:30:00',
        ])->assertStatus(409);
        $this->assertSame(1, ServiceBooking::count());
    }
}
```

- [ ] **Step 2: Run them to see the right ones fail**

Run: `artisan test tests/Feature/Appointments/FullAdminAuditActorTest.php`
Expected: FAIL, all four — `rowsFor()` is empty (the rows have no subject).

Run: `artisan test tests/Feature/Appointments/CrossInterfaceParityTest.php`
Expected: five pass; `test_a_full_admin_change_shows_in_the_workspace_with_its_actor` fails on `booking.history.0.action` (the full admin's row has no subject, so the history's first entry is the workspace's own `created` row).

- [ ] **Step 3: Fix `store()`**

In `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php`, replace the `AuditLog::create([...])` block inside `store()` (`:463-468`) with:

```php
            // AuditLog::record(), not ::create(): `user_id` is not a column,
            // so the actor was silently dropped and the row named no booking.
            AuditLog::record(
                'service_booking.created',
                $booking,
                [
                    'status'            => (string) $booking->status,
                    'start_at'          => $booking->start_at?->format('Y-m-d H:i:s'),
                    'service_master_id' => $booking->service_master_id,
                ],
                [],
                $request->user(),
                "Created service booking {$booking->booking_reference} for {$booking->customer_name}",
            );
```

- [ ] **Step 4: Fix `updateStatus()`**

Directly above the line `$booking->update(array_filter($data, fn ($v) => $v !== null));` add:

```php
            $before = ['status' => (string) $booking->status, 'payment_status' => (string) $booking->payment_status];
```

and replace the `AuditLog::create([...])` block below it (`:511-516`) with:

```php
            AuditLog::record(
                'service_booking.updated',
                $booking,
                ['status' => (string) $booking->status, 'payment_status' => (string) $booking->payment_status],
                $before,
                $request->user(),
                "Updated booking {$booking->booking_reference}",
            );
```

- [ ] **Step 5: Fix `bulk()`**

Replace the transaction and the audit block that follows it (from `$updated = 0;` down to the closing `} catch (\Throwable) {}` of the audit `try`) with:

```php
        $updated = 0;
        $patches = [];
        DB::transaction(function () use ($rows, $validated, &$updated, &$patches) {
            foreach ($rows as $b) {
                $patch = match ($validated['action']) {
                    'cancel'        => ['status' => 'cancelled', 'cancelled_at' => now()],
                    'mark_complete' => ['status' => 'completed'],
                    'mark_paid'     => ['payment_status' => 'paid'],
                    'mark_no_show'  => ['status' => 'no_show'],
                    'mark_status'   => ['status' => $validated['value'] ?? $b->status],
                };
                ServiceBooking::where('id', $b->id)->lockForUpdate()->update($patch);
                $patches[$b->id] = $patch;
                $updated++;
            }
        });

        // After the transaction, as before: an audit failure must never fail
        // the bulk action. One row per booking (so each booking's history is
        // complete) and the summary row, all with the actor.
        try {
            foreach ($rows as $b) {
                AuditLog::record(
                    "service_booking.bulk.{$validated['action']}",
                    $b,
                    array_intersect_key($patches[$b->id] ?? [], ['status' => true, 'payment_status' => true]),
                    ['status' => (string) $b->status, 'payment_status' => (string) $b->payment_status],
                    $request->user(),
                    "Bulk {$validated['action']}: {$b->booking_reference}",
                );
            }
            AuditLog::record(
                "service_booking.bulk.{$validated['action']}",
                null,
                ['ids' => $rows->pluck('id')->all(), 'updated' => $updated],
                [],
                $request->user(),
                "Bulk {$validated['action']}: {$updated} service bookings",
            );
        } catch (\Throwable) {}
```

(`$rows` was loaded before the transaction, so `$b->status` is still the value before the change.)

- [ ] **Step 6: Fix `destroy()`**

Replace the body of `destroy()` with:

```php
        $booking = ServiceBooking::findOrFail($id);
        $before = ['status' => (string) $booking->status];
        $booking->update(['status' => 'cancelled', 'cancelled_at' => now()]);

        try {
            AuditLog::record(
                'service_booking.cancelled',
                $booking,
                ['status' => 'cancelled'],
                $before,
                request()->user(),
                "Cancelled booking {$booking->booking_reference}",
            );
        } catch (\Throwable) {}

        return response()->json(['message' => 'Booking cancelled']);
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `artisan test tests/Feature/Appointments/FullAdminAuditActorTest.php` → `Tests: 4 passed`.
Run: `artisan test tests/Feature/Appointments/CrossInterfaceParityTest.php` → `Tests: 6 passed`.

- [ ] **Step 8: Prove the full admin's own tests are unchanged**

Run: `artisan test tests/Feature/Admin` and `artisan test tests/Feature/ChatGptPortalNotes`
Expected: baselines, 0 failed (`ServiceBookingPointsTest`, `ServiceBookingDiscountExposureTest`, `ServiceBookingNoteAppendTest` all pass).

- [ ] **Step 9: Commit (on its own)**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php tests/Feature/Appointments/FullAdminAuditActorTest.php tests/Feature/Appointments/CrossInterfaceParityTest.php && git commit -q -F - <<'EOF'
Record who changed a service booking in the full admin

The controller passed user_id, which is not an audit column, so its rows
named neither the actor nor the booking. Create, status change, bulk and
delete now write through AuditLog::record(). Requests and responses are
unchanged. Parity tests pin that the workspace and the full admin read and
write the same bookings.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 12: Tell the SPA which workspace to land on (S8)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Auth/AuthController.php` — `login()` directly after the `$userArray['has_loyalty'] = …;` statement (near `:299-300`), `me()` directly after the `$data = [ … ];` array (near `:523`)
- Test: `tests/Feature/Appointments/SignInWorkspacesTest.php`

**Interfaces:**
- Consumes: `Organization::workspacesPayload(): ?array` (Task 4).
- Produces: for a **staff** user of an organisation with a workspace on, `user.workspaces` in the login answer and `workspaces` in `GET /auth/me`, shaped `{appointments: {landing: bool}}`. For everyone else the key is absent.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/SignInWorkspacesTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SignInWorkspacesTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private function me(User $user): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me')->assertOk();
    }

    public function test_staff_of_an_enabled_organisation_are_told_where_to_land(): void
    {
        $this->setUpAppointments();

        $this->me($this->staff)->assertJsonPath('workspaces', ['appointments' => ['landing' => false]]);

        $this->org->setWorkspace('appointments', true, landing: true);
        $this->me($this->staff)->assertJsonPath('workspaces.appointments.landing', true);
    }

    public function test_an_organisation_that_never_opted_in_gets_the_answer_it_always_got(): void
    {
        $this->setUpAppointments(enabled: false);

        $this->assertArrayNotHasKey('workspaces', $this->me($this->staff)->json());
    }

    public function test_a_member_never_gets_the_key(): void
    {
        $this->setUpAppointments();
        $this->org->setWorkspace('appointments', true, landing: true);

        $this->assertArrayNotHasKey('workspaces', $this->me(User::findOrFail($this->member->user_id))->json());
    }

    public function test_the_login_answer_carries_it_inside_user(): void
    {
        $this->setUpAppointments();
        $this->org->setWorkspace('appointments', true, landing: true);
        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function ($t) {
                $t->id();
                $t->morphs('tokenable');
                $t->string('name');
                $t->string('token', 64)->unique();
                $t->text('abilities')->nullable();
                $t->timestamp('last_used_at')->nullable();
                $t->timestamp('expires_at')->nullable();
                $t->timestamps();
            });
        }

        $this->postJson('/api/v1/auth/login', ['email' => $this->staff->email, 'password' => 'secret-pass-1'])
            ->assertOk()
            ->assertJsonPath('user.workspaces.appointments.landing', true)
            ->assertJsonStructure(['token', 'user', 'staff']);

        $this->org->setWorkspace('appointments', false);
        $answer = $this->postJson('/api/v1/auth/login', ['email' => $this->staff->email, 'password' => 'secret-pass-1'])->assertOk()->json('user');
        $this->assertArrayNotHasKey('workspaces', $answer);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `artisan test tests/Feature/Appointments/SignInWorkspacesTest.php`
Expected: the first and the last test FAIL (no `workspaces` key); the two "absent" tests pass already — they pin that the change does not leak.

If the login test errors on a table or column the fixture lacks (the login path reads more than these tests built), add it to this test's own set-up. Do not change `login()` for the test beyond Step 3.

- [ ] **Step 3: Implement**

In `AuthController::login()`, directly after the statement that sets `$userArray['has_loyalty']`:

```php
        // Opt-in workspaces (the appointments workspace). Present only for a
        // staff user whose organisation has one switched on, so every other
        // sign-in answer is byte for byte what it was.
        if ($user->isStaff() && $user->organization_id
            && ($workspaces = \App\Models\Organization::find($user->organization_id)?->workspacesPayload())) {
            $userArray['workspaces'] = $workspaces;
        }
```

In `AuthController::me()`, directly after the closing `];` of the `$data = [ … ]` array:

```php
        // Same rule as login(): only staff, only when a workspace is on.
        if ($user->isStaff() && $user->organization_id
            && ($workspaces = \App\Models\Organization::find($user->organization_id)?->workspacesPayload())) {
            $data['workspaces'] = $workspaces;
        }
```

- [ ] **Step 4: Run the test to see it pass**

Run: `artisan test tests/Feature/Appointments/SignInWorkspacesTest.php`
Expected: `Tests: 4 passed`.

- [ ] **Step 5: Regression over everything the backend tasks touched**

Run, by directory: `artisan test tests/Feature/Appointments`, `tests/Unit/Appointments`, `tests/Feature/Auth`, `tests/Feature/ApiAuthentication`, `tests/Feature/Booking`, `tests/Feature/Widget`, `tests/Feature/Member`, `tests/Feature/Admin`, `tests/Feature/Loyalty`, `tests/Feature/Stripe`, `tests/Feature/Middleware`, `tests/Unit`, and the files `tests/Feature/RouteUniquenessTest.php`, `tests/Feature/RouteControllersExistTest.php`.
Expected: the Task 0 baselines plus this plan's new tests, 0 failed. Write the `Tests:` lines into `progress.md`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add app/Http/Controllers/Api/V1/Auth/AuthController.php tests/Feature/Appointments/SignInWorkspacesTest.php && git commit -q -F - <<'EOF'
Tell staff of an opted-in organisation where to land after sign-in

Login and /auth/me carry a workspaces key for a staff user whose
organisation has a workspace switched on. It is absent for everyone else.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---
### Task 13: Frontend foundations — tokens, types, API client, pure helpers, primitives, the five-language bundle

Nothing here draws a page. It lays down what every later frontend task imports, with the tests that keep the workspace apart from the full admin.

**Files (all new unless marked):**
- `frontend/src/appointments/theme/appointments.css`, `theme/contrast.test.ts`
- Modify: `frontend/tailwind.config.js` (the `a` colour group, after the `p` group), `frontend/src/index.css` (one `@import` after the portal's)
- `frontend/src/appointments/tokens.test.ts`
- `frontend/src/appointments/lib/constants.ts`, `types.ts`, `api.ts`, `api.test.ts`, `wallClock.ts`, `wallClock.test.ts`, `layout.ts`, `layout.test.ts`, `status.ts`, `status.test.ts`, `prefs.ts`, `prefs.test.ts`
- `frontend/src/appointments/ui/Button.tsx`, `Field.tsx`, `Notice.tsx`, `StatusMark.tsx`
- `frontend/src/appointments/i18n/index.ts`, `appointments.en.json`, `appointments.ru.json`, `appointments.de.json`, `appointments.fr.json`, `appointments.es.json`, `appointmentsLocales.test.ts`
- Modify: `frontend/src/i18n/localeCompleteness.test.ts` (scan the new folder)

**Interfaces — Produces** (later tasks import exactly these):

```ts
// lib/constants.ts
export const APP_NAME = 'HexaTech Appointments'

// lib/types.ts
export type Wall = string      // 'YYYY-MM-DDTHH:mm' — the venue's wall clock, never an instant
export type DateKey = string   // 'YYYY-MM-DD'
export type Status = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
export type PaymentState = 'not_paid_online' | 'card_held' | 'paid_by_card' | 'marked_paid' | 'refunded' | 'marked_refunded' | 'partially_refunded' | 'failed' | 'hold_released' | 'unknown'
export type ActionKey = 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel' | 'mark_paid_at_venue' | 'award_points' | 'move'
// plus the interfaces in Step 3: Bootstrap, MemberSummary, ClientSummary, AppointmentSummary, AppointmentDetail,
// PointsPreview, PointsResult, Consequences, ActionInfo, LoyaltyCardData, HistoryEntry, MasterDay, CalendarMaster,
// CatalogueService, CalendarPayload, SlotsPayload, ClientProfile, CreateBody

// lib/api.ts
export const appointmentsApi: { bootstrap, calendar, slots, searchClients, createClient, client, createBooking, booking, move, act }
export interface ApiFailure { status: number; code: string; message: string; current?: AppointmentDetail; matches?: ClientSummary[] }
export function failureOf(error: unknown): ApiFailure

// lib/wallClock.ts
dateOf(w: Wall): DateKey; timeOf(w: Wall): string; minutesOf(hhmm: string): number; wallMinutes(w: Wall): number
hhmm(minutes: number): string; makeWall(date: DateKey, minutes: number): Wall; isDateKey(v: string): boolean
addDays(date: DateKey, n: number): DateKey; weekdayOf(date: DateKey): number /* 0 = Monday */; weekOf(date: DateKey): DateKey[]
monthOf(date: DateKey): string /* 'YYYY-MM' */; addMonths(month: string, n: number): string; monthGrid(month: string): DateKey[] /* 42 days, Monday first */
venueNow(timeZone: string, at?: Date): { date: DateKey; minutes: number }
formatDate(date: DateKey, locale: string, options?: Intl.DateTimeFormatOptions): string
formatInstant(iso: string, locale: string, timeZone: string): string

// lib/layout.ts
PX_PER_MIN = 1.2; DEFAULT_START = 480; DEFAULT_END = 1140
dayRange(days: MasterDay[], items: { start: Wall; end: Wall }[], date: DateKey): { startMin: number; endMin: number }
interface Placed<T> { item: T; top: number; height: number; lane: number; lanes: number }
placeAppointments<T extends { start: Wall; end: Wall }>(items: T[], date: DateKey, startMin: number): Placed<T>[]
freeSlotStarts(day: MasterDay | undefined, busy: { start: Wall; end: Wall }[], date: DateKey, step?: number): number[]
offHours(day: MasterDay | undefined, startMin: number, endMin: number): [number, number][]

// lib/status.ts
STATUSES: Status[]; type Tone; STATUS_TONE: Record<Status, Tone>; TONE_CLASS: Record<Tone, { text: string; tint: string; bar: string }>
blocksSlot(s: Status): boolean; needsAttention(a, now): boolean; dayOverview(appointments, date, now): { total; upcoming; in_progress; completed; attention }

// lib/prefs.ts
type View = 'day' | 'week' | 'list'; interface Prefs { view: View; masterId: number | null; showCancelled: boolean }
DEFAULT_PREFS; parsePrefs(raw: string | null): Prefs; loadPrefs(): Prefs; savePrefs(p: Prefs): void

// ui
Button({ variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; loading?: boolean; full?: boolean } & button attributes)
Field({ label: string; hint?: string; children }); Notice({ tone?: 'info' | 'success' | 'warning' | 'danger'; children })
StatusMark({ status: Status; compact?: boolean })   // icon + the word t(`appointments.status.${status}`)

// i18n/index.ts
registerAppointmentsLocales(): void; APPOINTMENTS_LOCALE_FILES
```

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/appointments/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The workspace's three hard rules, enforced on the source:
 *
 *  1. Only `a-*` colour tokens. An admin class (`bg-dark-surface`,
 *     `text-white`, `text-primary-400`) paints this light workspace in the
 *     full admin's dark palette; a portal class (`bg-p-surface`) reads
 *     variables that only exist under [data-portal].
 *  2. Only the workspace's own API. Every `/v1/…` path in this folder is
 *     `/v1/admin/appointments/…`, which the server gates with the
 *     organisation's flag. A call to any other admin endpoint would work
 *     for an appointments-only customer today and must not be built on.
 *  3. Every rule in the stylesheet is scoped under [data-appointments], so
 *     nothing here can restyle the full admin.
 */
const DIR = path.resolve(__dirname)

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const ADMIN_CLASS = /(?:^|[\s'"`{(])(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|sm:|md:|lg:|xl:)*(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|fill|stroke)-(?:dark-[a-z0-9]+|primary-\d{2,3}|t-primary|t-secondary|t-muted|white|black|accent|error|warning|info|gray-\d{2,3}|emerald-\d{2,3})(?:\/\d+)?(?=[\s'"`)}])/
const PORTAL_CLASS = /(?:^|[\s'"`{(])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|placeholder|outline|rounded|shadow|font)-p-[a-z]/
const FOREIGN_API = /\/v1\/(?!admin\/appointments\b)/

describe('appointments workspace sweep', () => {
  const files = sourceFiles(DIR)

  it('actually scans the workspace (the folder is not empty)', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    const rel = path.relative(DIR, file)
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const hits = (re: RegExp) => lines.map((line, i) => (re.test(line) ? `${i + 1}: ${line.trim()}` : null)).filter((x): x is string => x !== null)

    it(`${rel} uses only a-* colour classes`, () => {
      expect(hits(ADMIN_CLASS), `admin colour classes in ${rel}`).toEqual([])
      expect(hits(PORTAL_CLASS), `portal classes in ${rel}`).toEqual([])
    })

    it(`${rel} calls only the workspace API`, () => {
      expect(hits(FOREIGN_API), `${rel} references an API outside /v1/admin/appointments`).toEqual([])
    })
  }

  it('every rule in the stylesheet is scoped under [data-appointments]', () => {
    const css = fs.readFileSync(path.join(DIR, 'theme/appointments.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(3)
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        expect(part.trim().startsWith('[data-appointments]'), `unscoped selector: ${part.trim()}`).toBe(true)
      }
    }
  })
})
```

Create `frontend/src/appointments/theme/contrast.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Every text-on-background pair the workspace draws, at 4.5:1 or better.
 * Status tones are drawn as text in the tone over a 12 % tint of the same
 * tone (cards, StatusMark, Notice), on the canvas, a white surface or the
 * outside-hours surface.
 */
const css = readFileSync(new URL('./appointments.css', import.meta.url), 'utf8')
const start = css.indexOf('[data-appointments] {')
const body = css.slice(start, css.indexOf('}', start))
const vars: Record<string, number[]> = {}
for (const m of body.matchAll(/--a-([a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]

const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const tint = (tone: number[], under: number[], k = 0.12) => tone.map((v, i) => v * k + under[i] * (1 - k))

describe('appointments tokens', () => {
  it('defines every token the Tailwind aliases read', () => {
    for (const name of ['canvas', 'surface', 'surface-2', 'text', 'text-2', 'border', 'side', 'side-2', 'side-text', 'side-text-2', 'accent', 'accent-ink', 'accent-deep', 'danger', 'st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow']) {
      expect(vars[name], `--a-${name} is missing`).toBeDefined()
    }
  })

  const pairs: [string, string][] = [
    ['text', 'canvas'], ['text', 'surface'], ['text', 'surface-2'],
    ['text-2', 'canvas'], ['text-2', 'surface'], ['text-2', 'surface-2'],
    ['side-text', 'side'], ['side-text', 'side-2'], ['side-text-2', 'side'], ['side-text-2', 'side-2'],
    ['accent-ink', 'accent'], ['accent-ink', 'accent-deep'], ['accent-ink', 'danger'],
    ['accent-deep', 'canvas'], ['accent-deep', 'surface'], ['accent-deep', 'surface-2'],
  ]
  for (const [fg, bg] of pairs) {
    it(`--a-${fg} on --a-${bg} is at least 4.5:1`, () => {
      expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5)
    })
  }

  for (const tone of ['st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow', 'danger']) {
    for (const under of ['canvas', 'surface', 'surface-2']) {
      it(`--a-${tone} text on its 12% tint over --a-${under} is at least 4.5:1`, () => {
        expect(ratio(vars[tone], tint(vars[tone], vars[under]))).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('the focus ring (accent) stands out from a surface, and the rail\'s ring (side text) from the rail', () => {
    expect(ratio(vars.accent, vars.surface)).toBeGreaterThanOrEqual(3)
    expect(ratio(vars['side-text'], vars.side)).toBeGreaterThanOrEqual(3)
  })
})
```

Create `frontend/src/appointments/lib/wallClock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, dateOf, formatDate, formatInstant, hhmm, isDateKey, makeWall, minutesOf, monthGrid, monthOf,
  timeOf, venueNow, wallMinutes, weekOf, weekdayOf,
} from './wallClock'

describe('wall clock strings', () => {
  it('reads the date and the time as they are written — no zone, no conversion', () => {
    expect(dateOf('2026-10-06T10:00')).toBe('2026-10-06')
    expect(timeOf('2026-10-06T10:00')).toBe('10:00')
    expect(wallMinutes('2026-10-06T10:45')).toBe(645)
    expect(minutesOf('00:00')).toBe(0)
    expect(minutesOf('23:59')).toBe(1439)
  })

  it('writes a wall clock from a date and minutes', () => {
    expect(makeWall('2026-10-06', 600)).toBe('2026-10-06T10:00')
    expect(hhmm(65)).toBe('01:05')
    expect(hhmm(1440)).toBe('24:00')
    expect(hhmm(-5)).toBe('00:00')
  })

  it('knows a date key from anything else', () => {
    expect(isDateKey('2026-10-06')).toBe(true)
    for (const bad of ['2026-10-6', '06/10/2026', '2026-10-06T10:00', '', 'today']) expect(isDateKey(bad)).toBe(false)
  })
})

describe('calendar arithmetic', () => {
  it('adds days across months, years and the nights the clocks change', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    // Europe: clocks go back on 25 October 2026 and forward on 29 March 2026.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
  })

  it('weeks start on Monday', () => {
    expect(weekdayOf('2026-10-05')).toBe(0) // Monday
    expect(weekdayOf('2026-10-11')).toBe(6) // Sunday
    expect(weekOf('2026-10-06')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
    expect(weekOf('2026-10-11')[0]).toBe('2026-10-05')
  })

  it('a month grid is six Monday-first weeks around the month', () => {
    const grid = monthGrid('2026-10') // 1 October 2026 is a Thursday
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-09-28')
    expect(grid[3]).toBe('2026-10-01')
    expect(grid[41]).toBe('2026-11-08')
    expect(monthOf('2026-10-06')).toBe('2026-10')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', -10)).toBe('2025-12')
  })
})

describe('venueNow', () => {
  it('is the venue\'s clock, whatever zone this machine is in', () => {
    // 00:30 UTC on 25 October 2026: Riga is still on summer time (UTC+3).
    expect(venueNow('Europe/Riga', new Date('2026-10-25T00:30:00Z'))).toEqual({ date: '2026-10-25', minutes: 3 * 60 + 30 })
    // One hour later the clocks have gone back (UTC+2): it is 03:30 again.
    expect(venueNow('Europe/Riga', new Date('2026-10-25T01:30:00Z'))).toEqual({ date: '2026-10-25', minutes: 3 * 60 + 30 })
    // Late evening UTC is already tomorrow in Riga.
    expect(venueNow('Europe/Riga', new Date('2026-10-05T22:30:00Z'))).toEqual({ date: '2026-10-06', minutes: 90 })
    expect(venueNow('America/New_York', new Date('2026-10-06T02:00:00Z'))).toEqual({ date: '2026-10-05', minutes: 22 * 60 })
    expect(venueNow('UTC', new Date('2026-10-06T00:00:00Z'))).toEqual({ date: '2026-10-06', minutes: 0 })
  })

  it('falls back to UTC for a zone the browser does not know', () => {
    expect(venueNow('Not/AZone', new Date('2026-10-06T09:15:00Z'))).toEqual({ date: '2026-10-06', minutes: 555 })
  })
})

describe('formatting', () => {
  it('a date key is formatted as that calendar day', () => {
    expect(formatDate('2026-10-06', 'en-US', { day: 'numeric' })).toBe('6')
    expect(formatDate('2026-10-06', 'en-US', { weekday: 'long' })).toBe('Tuesday')
    expect(formatDate('2026-01-01', 'en-US', { month: 'long', year: 'numeric' })).toBe('January 2026')
  })

  it('an audit instant is shown on the venue\'s clock', () => {
    expect(formatInstant('2026-10-05T09:15:00+00:00', 'en-GB', 'Europe/London')).toContain('10:15')
    expect(formatInstant('2026-10-05T09:15:00+00:00', 'en-GB', 'Europe/Riga')).toContain('12:15')
    expect(formatInstant('not a date', 'en-GB', 'Europe/London')).toBe('')
  })
})
```

Create `frontend/src/appointments/lib/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_END, DEFAULT_START, PX_PER_MIN, dayRange, freeSlotStarts, offHours, placeAppointments } from './layout'
import type { MasterDay } from './types'

const day = (windows: [string, string][]): MasterDay => ({ windows: windows.map(([start, end]) => ({ start, end })), time_off: [] })
const at = (start: string, end: string, id = start) => ({ id, start: `2026-10-06T${start}`, end: `2026-10-06T${end}` })

describe('dayRange', () => {
  it('is 08:00–19:00 when nothing needs more', () => {
    expect(dayRange([day([['09:00', '17:00']])], [], '2026-10-06')).toEqual({ startMin: DEFAULT_START, endMin: DEFAULT_END })
  })

  it('widens the day to fit early and late appointments', () => {
    expect(dayRange([day([['09:00', '17:00']])], [at('07:30', '08:15'), at('20:00', '21:30')], '2026-10-06'))
      .toEqual({ startMin: 7 * 60, endMin: 22 * 60 })
  })

  it('widens to the working hours, on whole hours, and never past midnight', () => {
    expect(dayRange([day([['06:30', '23:30']])], [], '2026-10-06')).toEqual({ startMin: 6 * 60, endMin: 24 * 60 })
  })

  it('ignores appointments on another day', () => {
    expect(dayRange([], [{ start: '2026-10-07T05:00', end: '2026-10-07T06:00' }], '2026-10-06')).toEqual({ startMin: DEFAULT_START, endMin: DEFAULT_END })
  })
})

describe('placeAppointments', () => {
  it('positions a card by its start and duration', () => {
    const [placed] = placeAppointments([at('10:00', '10:45')], '2026-10-06', 8 * 60)
    expect(placed).toMatchObject({ top: 120 * PX_PER_MIN, height: 45 * PX_PER_MIN, lane: 0, lanes: 1 })
  })

  it('places overlapping appointments in separate lanes', () => {
    const placed = placeAppointments([at('10:00', '11:00', 'a'), at('10:30', '11:30', 'b')], '2026-10-06', 480)
    expect(placed.map(p => [p.item.id, p.lane, p.lanes])).toEqual([['a', 0, 2], ['b', 1, 2]])
  })

  it('reuses a lane once it is free and sizes the whole cluster alike', () => {
    const placed = placeAppointments([at('10:00', '11:00', 'a'), at('10:30', '11:30', 'b'), at('11:00', '12:00', 'c')], '2026-10-06', 480)
    expect(placed.map(p => [p.item.id, p.lane, p.lanes])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 2]])
  })

  it('gives back the full width after a cluster ends', () => {
    const placed = placeAppointments([at('10:00', '11:00', 'a'), at('10:30', '11:30', 'b'), at('13:00', '14:00', 'c')], '2026-10-06', 480)
    expect(placed[2]).toMatchObject({ lane: 0, lanes: 1 })
  })

  it('leaves out other days, and clips an appointment that runs past midnight', () => {
    const placed = placeAppointments([
      { id: 'late', start: '2026-10-06T23:00', end: '2026-10-07T00:30' },
      { id: 'tomorrow', start: '2026-10-07T09:00', end: '2026-10-07T10:00' },
    ], '2026-10-06', 480)
    expect(placed).toHaveLength(1)
    expect(placed[0].height).toBe(60 * PX_PER_MIN)
  })

  it('never draws a card too short to read', () => {
    const [placed] = placeAppointments([at('10:00', '10:05')], '2026-10-06', 480)
    expect(placed.height).toBeGreaterThanOrEqual(22)
  })
})

describe('freeSlotStarts', () => {
  it('offers every half hour inside working hours that no appointment touches', () => {
    const starts = freeSlotStarts(day([['09:00', '17:00']]), [at('10:00', '10:45')], '2026-10-06')
    expect(starts.slice(0, 4)).toEqual([540, 570, 660, 690]) // 09:00, 09:30, then 11:00 (10:00 and 10:30 are touched)
    expect(starts[starts.length - 1]).toBe(16 * 60 + 30)
    expect(starts).not.toContain(600)
    expect(starts).not.toContain(630)
  })

  it('offers nothing outside the windows, in a gap between them, or without a schedule', () => {
    const starts = freeSlotStarts(day([['09:00', '13:00'], ['14:00', '17:00']]), [], '2026-10-06')
    expect(starts).toContain(750) // 12:30
    expect(starts).not.toContain(780) // 13:00
    expect(starts).toContain(840) // 14:00
    expect(freeSlotStarts(undefined, [], '2026-10-06')).toEqual([])
    expect(freeSlotStarts(day([]), [], '2026-10-06')).toEqual([])
  })

  it('starts on the half hour even when the window does not', () => {
    expect(freeSlotStarts(day([['09:15', '10:30']]), [], '2026-10-06')).toEqual([570, 600])
  })
})

describe('offHours', () => {
  it('is everything in the frame that is not a working window', () => {
    expect(offHours(day([['09:00', '13:00'], ['14:00', '17:00']]), 480, 1140)).toEqual([[480, 540], [780, 840], [1020, 1140]])
    expect(offHours(undefined, 480, 1140)).toEqual([[480, 1140]])
    expect(offHours(day([['08:00', '19:00']]), 480, 1140)).toEqual([])
  })
})
```

Create `frontend/src/appointments/lib/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STATUSES, STATUS_TONE, TONE_CLASS, blocksSlot, dayOverview, needsAttention } from './status'
import type { Status } from './types'

const now = { date: '2026-10-06', minutes: 10 * 60 + 20 }
const a = (status: Status, start: string) => ({ status, start })

describe('status', () => {
  it('every status has a tone, and every tone its three classes', () => {
    for (const status of STATUSES) {
      const tone = TONE_CLASS[STATUS_TONE[status]]
      expect(tone.text).toMatch(/^text-a-st-/)
      expect(tone.tint).toMatch(/^bg-a-st-.+\/\[0\.12\]$/)
      expect(tone.bar).toMatch(/^border-a-st-/)
    }
    expect(new Set(STATUSES.map(s => STATUS_TONE[s])).size).toBe(STATUSES.length) // no two statuses share a tone
  })

  it('only the scheduler\'s three statuses occupy a slot', () => {
    expect(STATUSES.filter(blocksSlot)).toEqual(['pending', 'confirmed', 'in_progress'])
  })
})

describe('needsAttention', () => {
  it('a request awaiting confirmation always does', () => {
    expect(needsAttention(a('pending', '2026-10-09T10:00'), now)).toBe(true)
  })

  it('a confirmed appointment does once it is more than 15 minutes late without being started', () => {
    expect(needsAttention(a('confirmed', '2026-10-06T10:00'), now)).toBe(true)  // 20 minutes
    expect(needsAttention(a('confirmed', '2026-10-06T10:05'), now)).toBe(false) // exactly 15
    expect(needsAttention(a('confirmed', '2026-10-06T15:00'), now)).toBe(false)
    expect(needsAttention(a('confirmed', '2026-10-05T15:00'), now)).toBe(true)  // yesterday, never started
    expect(needsAttention(a('confirmed', '2026-10-07T09:00'), now)).toBe(false)
  })

  it('nothing else does', () => {
    for (const status of ['in_progress', 'completed', 'cancelled', 'no_show'] as Status[]) {
      expect(needsAttention(a(status, '2026-10-06T09:00'), now)).toBe(false)
    }
  })
})

describe('dayOverview', () => {
  it('counts one day, leaves cancelled out, and counts a late appointment once', () => {
    expect(dayOverview([
      a('completed', '2026-10-06T09:00'),
      a('confirmed', '2026-10-06T09:30'),   // late → attention, not upcoming
      a('in_progress', '2026-10-06T10:00'),
      a('confirmed', '2026-10-06T15:00'),
      a('pending', '2026-10-06T16:00'),
      a('no_show', '2026-10-06T08:00'),
      a('cancelled', '2026-10-06T12:00'),
      a('confirmed', '2026-10-07T09:00'),
    ], '2026-10-06', now)).toEqual({ total: 6, upcoming: 1, in_progress: 1, completed: 1, attention: 2 })
  })
})
```

Create `frontend/src/appointments/lib/prefs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, parsePrefs } from './prefs'

describe('parsePrefs', () => {
  it('reads what it wrote', () => {
    expect(parsePrefs(JSON.stringify({ view: 'week', masterId: 4, showCancelled: true }))).toEqual({ view: 'week', masterId: 4, showCancelled: true })
  })

  it('falls back field by field on anything it does not recognise', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('[]')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ view: 'month', masterId: '4', showCancelled: 'yes' }))).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ view: 'list' }))).toEqual({ ...DEFAULT_PREFS, view: 'list' })
  })
})
```

Create `frontend/src/appointments/lib/api.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { failureOf } from './api'

describe('failureOf', () => {
  it('reads the workspace\'s error body', () => {
    expect(failureOf({ response: { status: 409, data: { error: 'slot_taken', message: 'That time is not free for Emma.' } } }))
      .toMatchObject({ status: 409, code: 'slot_taken', message: 'That time is not free for Emma.' })
  })

  it('carries the current appointment of a stale save and the matches of a possible duplicate', () => {
    expect(failureOf({ response: { status: 409, data: { error: 'stale', message: 'Changed', current: { id: 7 } } } }).current).toEqual({ id: 7 })
    expect(failureOf({ response: { status: 409, data: { error: 'possible_duplicate', message: 'Exists', matches: [{ id: 5 }] } } }).matches).toEqual([{ id: 5 }])
  })

  it('calls a validation error or any other shape unknown, keeping the server\'s sentence', () => {
    expect(failureOf({ response: { status: 422, data: { error: 'Validation failed', message: 'The start field is required.' } } }))
      .toMatchObject({ status: 422, code: 'unknown', message: 'The start field is required.' })
    expect(failureOf({ response: { status: 500, data: 'oops' } })).toMatchObject({ status: 500, code: 'unknown', message: '' })
  })

  it('calls no response at all a network failure, and no error nothing', () => {
    expect(failureOf(new Error('Network Error'))).toMatchObject({ status: 0, code: 'network', message: 'Network Error' })
    expect(failureOf(null)).toMatchObject({ status: 0, code: '', message: '' })
  })
})
```

Create `frontend/src/appointments/i18n/appointmentsLocales.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const

/** Keys the code builds at run time (`appointments.status.${s}` and the like); the literal-key scan in src/i18n/localeCompleteness.test.ts cannot see these. */
const FAMILIES: Record<string, readonly string[]> = {
  'vocab.beauty': ['client', 'clients', 'team_member', 'service'],
  'vocab.other': ['client', 'clients', 'team_member', 'service'],
  status: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'],
  payment: ['not_paid_online', 'card_held', 'paid_by_card', 'marked_paid', 'refunded', 'marked_refunded', 'partially_refunded', 'failed', 'hold_released', 'unknown'],
  'consequence.payment': ['none', 'hold_will_be_charged', 'hold_will_be_released', 'captured_not_refunded', 'marked_only'],
  points_reason: ['not_a_member', 'programme_off', 'points_on_bookings_off', 'already_awarded', 'zero_amount', 'refunded', 'failed'],
  action: ['confirm', 'start', 'complete', 'award_points', 'move', 'mark_paid_at_venue', 'no_show', 'cancel'],
  history: ['created', 'moved', 'confirm', 'start', 'complete', 'no_show', 'cancel', 'mark_paid_at_venue', 'award_points', 'updated', 'cancelled', 'bulk_cancel', 'bulk_mark_complete', 'bulk_mark_paid', 'bulk_mark_no_show', 'bulk_mark_status'],
  error: ['slot_taken', 'stale', 'not_allowed', 'master_not_eligible', 'before_today', 'time_does_not_exist', 'invalid_time', 'idempotency_key_reused', 'possible_duplicate', 'workspace_disabled', 'not_found', 'client_not_found', 'service_not_found', 'master_not_found', 'network'],
}

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `appointments.${locale}.json`), 'utf8'))
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}
function flatten(o: unknown, prefix = ''): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

describe('appointments bundle', () => {
  for (const locale of LOCALES) {
    it(`${locale}: every key built at run time is translated`, () => {
      const json = bundle(locale)
      const missing = Object.entries(FAMILIES).flatMap(([family, keys]) =>
        keys.map(k => `${family}.${k}`).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() }))
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([])
    })

    it(`${locale}: no value is empty`, () => {
      const json = bundle(locale)
      expect(flatten(json).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() })).toEqual([])
    })
  }

  it('the five bundles carry exactly the same key set', () => {
    const en = flatten(bundle('en')).sort()
    for (const locale of LOCALES) expect(flatten(bundle(locale)).sort(), `${locale} keys differ from en`).toEqual(en)
  })

  it('every placeholder in the English text survives in each translation', () => {
    const en = bundle('en')
    for (const key of flatten(en)) {
      const wanted = [...String(at(en, key)).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
      for (const locale of LOCALES) {
        const got = [...String(at(bundle(locale), key)).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
        expect(got, `${locale}:${key}`).toEqual(wanted)
      }
    }
  })

  it('has no generic "something went wrong" for an unknown error: the server\'s own sentence is shown instead', () => {
    expect(at(bundle('en'), 'error.unknown')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments 2>&1 | tail -n 15
```
Expected: FAIL — the modules and the stylesheet do not exist.

- [ ] **Step 3: Tokens and their Tailwind aliases**

Create `frontend/src/appointments/theme/appointments.css`:

```css
/*
 * Appointments workspace tokens. Every rule is scoped under
 * [data-appointments], so nothing here can restyle the full admin, and
 * every colour is an `R G B` triplet so Tailwind's `<alpha-value>` works
 * (`bg-a-accent/10` is the soft tint).
 *
 * A light working canvas, white panels, a deep navy rail. One accent
 * (teal-blue) for primary actions and selection. Status tones are their own
 * set and are never the accent; each is drawn with an icon and a word.
 * theme/contrast.test.ts pins every text pair at 4.5:1.
 */
[data-appointments] {
  --a-canvas: 245 246 248;
  --a-surface: 255 255 255;
  --a-surface-2: 238 240 244;
  --a-text: 22 27 38;
  --a-text-2: 84 93 109;
  --a-border: 223 227 234;

  --a-side: 17 24 39;
  --a-side-2: 31 41 58;
  --a-side-text: 226 232 240;
  --a-side-text-2: 160 174 192;

  --a-accent: 13 110 122;
  --a-accent-ink: 255 255 255;
  --a-accent-deep: 9 84 94;
  --a-danger: 176 36 36;

  --a-st-pending: 138 80 0;
  --a-st-confirmed: 18 100 58;
  --a-st-progress: 79 58 176;
  --a-st-completed: 44 70 108;
  --a-st-cancelled: 88 95 107;
  --a-st-noshow: 166 38 58;

  color-scheme: light;
  background-color: rgb(var(--a-canvas));
  color: rgb(var(--a-text));
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  letter-spacing: 0;
  -webkit-font-smoothing: antialiased;
}

/* The full admin gives headings the organisation's "mood" typeface and
   form controls a dark colour scheme, both globally (index.css). Neither
   belongs in this workspace. */
[data-appointments] h1,
[data-appointments] h2,
[data-appointments] h3,
[data-appointments] h4 {
  font-family: inherit;
}

[data-appointments] select,
[data-appointments] input,
[data-appointments] input[type],
[data-appointments] textarea {
  color-scheme: light;
}

[data-appointments] ::-webkit-scrollbar-track {
  background: rgb(var(--a-surface-2));
}

[data-appointments] ::-webkit-scrollbar-thumb {
  background: rgb(var(--a-border));
}

/* Focus is always visible: the accent on light surfaces, the rail's own text colour on the rail. */
[data-appointments] :focus-visible {
  outline: 2px solid rgb(var(--a-accent));
  outline-offset: 2px;
}

[data-appointments] aside :focus-visible {
  outline-color: rgb(var(--a-side-text));
}

/* Time off on the calendar: hatched, so it reads as blocked without relying on a colour. */
[data-appointments] .a-hatch {
  background-image: repeating-linear-gradient(135deg, rgb(var(--a-text-2) / 0.16) 0 6px, transparent 6px 12px);
}

@media (prefers-reduced-motion: reduce) {
  [data-appointments] * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

In `frontend/tailwind.config.js`, inside `theme.extend.colors`, directly after the closing `},` of the `p: { … }` group:

```js
        // Appointments workspace tokens — see src/appointments/theme/appointments.css.
        // Only frontend/src/appointments uses these; its sweep test forbids the reverse.
        a: {
          canvas:         'rgb(var(--a-canvas) / <alpha-value>)',
          surface:        'rgb(var(--a-surface) / <alpha-value>)',
          'surface-2':    'rgb(var(--a-surface-2) / <alpha-value>)',
          text:           'rgb(var(--a-text) / <alpha-value>)',
          'text-2':       'rgb(var(--a-text-2) / <alpha-value>)',
          border:         'rgb(var(--a-border) / <alpha-value>)',
          side:           'rgb(var(--a-side) / <alpha-value>)',
          'side-2':       'rgb(var(--a-side-2) / <alpha-value>)',
          'side-text':    'rgb(var(--a-side-text) / <alpha-value>)',
          'side-text-2':  'rgb(var(--a-side-text-2) / <alpha-value>)',
          accent:         'rgb(var(--a-accent) / <alpha-value>)',
          'accent-ink':   'rgb(var(--a-accent-ink) / <alpha-value>)',
          'accent-deep':  'rgb(var(--a-accent-deep) / <alpha-value>)',
          danger:         'rgb(var(--a-danger) / <alpha-value>)',
          'st-pending':   'rgb(var(--a-st-pending) / <alpha-value>)',
          'st-confirmed': 'rgb(var(--a-st-confirmed) / <alpha-value>)',
          'st-progress':  'rgb(var(--a-st-progress) / <alpha-value>)',
          'st-completed': 'rgb(var(--a-st-completed) / <alpha-value>)',
          'st-cancelled': 'rgb(var(--a-st-cancelled) / <alpha-value>)',
          'st-noshow':    'rgb(var(--a-st-noshow) / <alpha-value>)',
        },
```

In `frontend/src/index.css`, directly after the first line (`@import './portal/theme/portal.css';`):

```css
@import './appointments/theme/appointments.css';
```

- [ ] **Step 4: Constants and types**

Create `frontend/src/appointments/lib/constants.ts`:

```ts
/** The interface name. One constant: the owner may rename the product. */
export const APP_NAME = 'HexaTech Appointments'
```

Create `frontend/src/appointments/lib/types.ts`:

```ts
/** The venue's wall clock as the server sends and accepts it: 'YYYY-MM-DDTHH:mm'. Never an instant — do not pass it to `new Date()`. */
export type Wall = string
/** 'YYYY-MM-DD' */
export type DateKey = string

export type Status = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
export type PaymentState =
  | 'not_paid_online' | 'card_held' | 'paid_by_card' | 'marked_paid' | 'refunded'
  | 'marked_refunded' | 'partially_refunded' | 'failed' | 'hold_released' | 'unknown'
export type ActionKey = 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel' | 'mark_paid_at_venue' | 'award_points' | 'move'

export interface Bootstrap {
  name: string
  organization: { id: number; name: string; industry: string }
  brand: { id: number; name: string } | null
  venue: { timezone: string; timezone_named: boolean; today: DateKey; currency: string }
  staff: { name: string; role: string | null }
  loyalty: { programme_on: boolean; points_on_bookings: boolean }
  readiness: { services: number; team: number; bookable: boolean }
}

export interface MemberSummary { id: number; number: string; tier: string | null; points: number }
export interface ClientSummary { id: number; name: string; phone: string | null; email: string | null; member: MemberSummary | null }

/** A calendar row: what a card shows and nothing more. */
export interface AppointmentSummary {
  id: number
  reference: string
  start: Wall
  end: Wall
  duration_minutes: number
  service: { id: number; name: string } | null
  master: { id: number; name: string } | null
  client: { id: number | null; name: string; is_member: boolean }
  status: Status
  payment: { state: PaymentState }
  revision: string
}

export interface PointsPreview { points: number; reason: string | null }
export interface PointsResult { awarded: number; reason: string | null }

export interface Consequences {
  payment: 'none' | 'hold_will_be_charged' | 'hold_will_be_released' | 'captured_not_refunded' | 'marked_only'
  points: PointsPreview | null
  coupon: 'none' | 'not_returned'
  message: 'none'
}
export interface ActionInfo { key: ActionKey; allowed: boolean; consequences: Consequences }

export interface LoyaltyCardData {
  member: MemberSummary | null
  benefits: { name: string | null; display: string | null; description: string | null }[]
  points_on_bookings?: boolean
  /** Points the ledger holds for this appointment; null until the award has run. */
  awarded?: number | null
}

export interface HistoryEntry {
  /** A real instant (ISO 8601, UTC), unlike the appointment's own times. */
  at: string
  actor: string | null
  action: string
  description: string | null
  changes: { old: unknown; new: unknown }
}

export interface AppointmentDetail extends Omit<AppointmentSummary, 'client' | 'payment'> {
  client: { id: number | null; name: string; phone: string | null; email: string | null; member: MemberSummary | null }
  payment: { state: PaymentState; raw: string; amount: number; refunded_amount: number | null; carries_card_payment: boolean; currency: string }
  price: { total: number; list: number | null; discount_label: string | null; currency: string }
  source: string
  notes: { customer: string | null; staff: string | null }
  actions: ActionInfo[]
  loyalty: LoyaltyCardData | null
  history: HistoryEntry[]
}

export interface MasterDay {
  /** Working windows, 'HH:mm', time off already taken out. */
  windows: { start: string; end: string }[]
  /** Both null = the whole day. */
  time_off: { start: string | null; end: string | null; reason: string | null }[]
}
export interface CalendarMaster { id: number; name: string; title: string | null; avatar: string | null; days: Record<DateKey, MasterDay> }
export interface CatalogueService { id: number; name: string; duration_minutes: number; buffer_after_minutes: number; price: number; currency: string; master_ids: number[] }
export interface CalendarPayload { from: DateKey; to: DateKey; masters: CalendarMaster[]; services: CatalogueService[]; appointments: AppointmentSummary[] }
export interface SlotsPayload { slots: { start: Wall; end: Wall; label: string }[]; duration_minutes: number; price: number; currency: string }

export interface ClientProfile {
  client: ClientSummary
  upcoming: AppointmentSummary[]
  past: AppointmentSummary[]
  matched_by_email: AppointmentSummary[]
  loyalty: LoyaltyCardData | null
  last: { service_id: number; master_id: number | null } | null
}

export interface CreateBody {
  client_id: number
  service_id: number
  master_id: number
  start: Wall
  source?: 'admin' | 'phone' | 'walk_in'
  customer_notes?: string
  staff_notes?: string
}
```

- [ ] **Step 5: The API client**

Create `frontend/src/appointments/lib/api.ts`:

```ts
import { api } from '../../lib/api'
import type {
  ActionKey, AppointmentDetail, Bootstrap, CalendarPayload, ClientProfile, ClientSummary, CreateBody, DateKey, PointsResult, SlotsPayload, Wall,
} from './types'

/**
 * Every call the workspace makes, in one place, typed. All of them live
 * under the one prefix the server gates with the organisation's flag;
 * tokens.test.ts refuses any other API path anywhere in this folder.
 */
const BASE = '/v1/admin/appointments'

export const appointmentsApi = {
  bootstrap: (): Promise<Bootstrap> => api.get(`${BASE}/bootstrap`).then(r => r.data),

  calendar: (from: DateKey, to: DateKey, opts: { masterId?: number | null; includeCancelled?: boolean } = {}): Promise<CalendarPayload> =>
    api.get(`${BASE}/calendar`, { params: { from, to, master_id: opts.masterId ?? undefined, include_cancelled: opts.includeCancelled ? 1 : 0 } }).then(r => r.data),

  slots: (serviceId: number, masterId: number, date: DateKey, ignore?: number): Promise<SlotsPayload> =>
    api.get(`${BASE}/slots`, { params: { service_id: serviceId, master_id: masterId, date, ignore } }).then(r => r.data),

  searchClients: (search: string): Promise<{ clients: ClientSummary[] }> =>
    api.get(`${BASE}/clients`, { params: { search } }).then(r => r.data),

  createClient: (body: { name: string; phone?: string; email?: string; confirm_new?: boolean }): Promise<{ client: ClientSummary }> =>
    api.post(`${BASE}/clients`, body).then(r => r.data),

  client: (id: number): Promise<ClientProfile> => api.get(`${BASE}/clients/${id}`).then(r => r.data),

  /** `key` is the draft's Idempotency-Key: the same key and body answer with the first booking. */
  createBooking: (body: CreateBody, key: string): Promise<{ booking: AppointmentDetail; replayed: boolean }> =>
    api.post(`${BASE}/bookings`, body, { headers: { 'Idempotency-Key': key } }).then(r => r.data),

  booking: (id: number): Promise<{ booking: AppointmentDetail }> => api.get(`${BASE}/bookings/${id}`).then(r => r.data),

  move: (id: number, body: { start: Wall; master_id: number; revision: string }): Promise<{ booking: AppointmentDetail }> =>
    api.patch(`${BASE}/bookings/${id}`, body).then(r => r.data),

  act: (id: number, body: { action: ActionKey; revision: string; reason?: string }): Promise<{ booking: AppointmentDetail; points: PointsResult | null }> =>
    api.post(`${BASE}/bookings/${id}/actions`, body).then(r => r.data),
}

export interface ApiFailure {
  status: number
  /** The server's snake_case code; `unknown` for any other body; `network` when no answer came; '' for no error. */
  code: string
  message: string
  current?: AppointmentDetail
  matches?: ClientSummary[]
}

/** What went wrong, from an axios error (or anything else that was thrown). Pure: no i18n, no side effects. */
export function failureOf(error: unknown): ApiFailure {
  if (!error) return { status: 0, code: '', message: '' }

  const response = (error as { response?: { status?: number; data?: unknown } }).response
  if (!response) return { status: 0, code: 'network', message: error instanceof Error ? error.message : '' }

  const data = response.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {}
  const code = typeof data.error === 'string' && /^[a-z_]+$/.test(data.error) ? data.error : 'unknown'

  return {
    status: response.status ?? 0,
    code,
    message: typeof data.message === 'string' ? data.message : '',
    current: data.current as AppointmentDetail | undefined,
    matches: data.matches as ClientSummary[] | undefined,
  }
}
```

- [ ] **Step 6: Wall-clock helpers**

Create `frontend/src/appointments/lib/wallClock.ts`:

```ts
import type { DateKey, Wall } from './types'

/**
 * Time in the workspace.
 *
 * An appointment's time is the VENUE's wall clock — a string like
 * `2026-10-06T10:00` with no zone. It is read and written as digits and is
 * never turned into a `Date`: the browser would read it in its own zone and
 * a receptionist working from another country would see every card an hour
 * or two off. Dates are keys (`2026-10-06`) and their arithmetic runs in
 * UTC, where no clock change exists. The venue's zone is used for one
 * thing: what "now" is at the venue.
 */
const pad = (n: number): string => String(n).padStart(2, '0')

export const dateOf = (wall: Wall): DateKey => wall.slice(0, 10)
export const timeOf = (wall: Wall): string => wall.slice(11, 16)

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export const wallMinutes = (wall: Wall): number => minutesOf(timeOf(wall))

export function hhmm(minutes: number): string {
  const m = Math.max(0, Math.min(1440, Math.round(minutes)))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export const makeWall = (date: DateKey, minutes: number): Wall => `${date}T${hhmm(minutes)}`

export const isDateKey = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)

function utc(date: DateKey): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function keyOf(ms: number): DateKey {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export const addDays = (date: DateKey, n: number): DateKey => keyOf(utc(date) + n * 86_400_000)

/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (date: DateKey): number => (new Date(utc(date)).getUTCDay() + 6) % 7

export function weekOf(date: DateKey): DateKey[] {
  const monday = addDays(date, -weekdayOf(date))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** 'YYYY-MM' */
export const monthOf = (date: DateKey): string => date.slice(0, 7)

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** Six Monday-first weeks that contain the month. */
export function monthGrid(month: string): DateKey[] {
  const first = `${month}-01`
  const start = addDays(first, -weekdayOf(first))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** The venue's date and minutes past midnight at `at` (now, by default). A zone the browser does not know is read as UTC. */
export function venueNow(timeZone: string, at: Date = new Date()): { date: DateKey; minutes: number } {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { ...options, timeZone }).formatToParts(at)
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' }).formatToParts(at)
  }
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

/** A date key as text. Formatted in UTC from a UTC midnight, so the browser's zone cannot shift the day. */
export function formatDate(
  date: DateKey,
  locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(utc(date)))
}

/** An audit timestamp — a real instant, unlike an appointment's time — on the venue's clock. */
export function formatInstant(iso: string, locale: string, timeZone: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(new Date(ms))
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(ms))
  }
}
```

- [ ] **Step 7: Layout, status, preferences**

Create `frontend/src/appointments/lib/layout.ts`:

```ts
import type { DateKey, MasterDay, Wall } from './types'
import { dateOf, minutesOf, wallMinutes } from './wallClock'

/** 72 px per hour: a 30-minute appointment is tall enough for a time and a name. */
export const PX_PER_MIN = 1.2
export const DEFAULT_START = 8 * 60
export const DEFAULT_END = 19 * 60

interface Timed { start: Wall; end: Wall }

/** The minutes an item occupies on `date`, clipped to that day; null when it starts on another day. */
function span(item: Timed, date: DateKey): [number, number] | null {
  if (dateOf(item.start) !== date) return null
  const from = wallMinutes(item.start)
  const to = dateOf(item.end) === date ? wallMinutes(item.end) : 1440
  return [from, Math.max(to, from + 5)]
}

/** The hours a day must show: 08:00–19:00, widened on whole hours to every working window and every appointment. */
export function dayRange(days: MasterDay[], items: Timed[], date: DateKey): { startMin: number; endMin: number } {
  let start = DEFAULT_START
  let end = DEFAULT_END
  for (const day of days) {
    for (const w of day.windows) {
      start = Math.min(start, minutesOf(w.start))
      end = Math.max(end, minutesOf(w.end))
    }
  }
  for (const item of items) {
    const s = span(item, date)
    if (s) {
      start = Math.min(start, s[0])
      end = Math.max(end, s[1])
    }
  }
  return { startMin: Math.floor(start / 60) * 60, endMin: Math.min(1440, Math.ceil(end / 60) * 60) }
}

export interface Placed<T> { item: T; top: number; height: number; lane: number; lanes: number }

/**
 * Where each card goes in a column. Overlapping appointments (a no-show and
 * its replacement, or data that was double-booked before the scheduler was
 * fixed) sit side by side in lanes — none is hidden behind another.
 */
export function placeAppointments<T extends Timed>(items: T[], date: DateKey, startMin: number): Placed<T>[] {
  const spans = items
    .map(item => ({ item, s: span(item, date) }))
    .filter((x): x is { item: T; s: [number, number] } => x.s !== null)
    .sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1])

  const out: Placed<T>[] = []
  let cluster: { placed: Placed<T>; end: number }[] = []
  let clusterEnd = -1

  const close = () => {
    const lanes = cluster.reduce((max, c) => Math.max(max, c.placed.lane + 1), 1)
    for (const c of cluster) c.placed.lanes = lanes
    cluster = []
    clusterEnd = -1
  }

  for (const { item, s } of spans) {
    if (cluster.length > 0 && s[0] >= clusterEnd) close()
    const taken = new Set(cluster.filter(c => c.end > s[0]).map(c => c.placed.lane))
    let lane = 0
    while (taken.has(lane)) lane++
    const placed: Placed<T> = { item, top: (s[0] - startMin) * PX_PER_MIN, height: Math.max(22, (s[1] - s[0]) * PX_PER_MIN), lane, lanes: 1 }
    cluster.push({ placed, end: s[1] })
    clusterEnd = Math.max(clusterEnd, s[1])
    out.push(placed)
  }
  close()

  return out
}

/**
 * Half-hour starts inside the working windows that no blocking appointment
 * touches — the buttons the grid offers. A convenience only: the server
 * checks the real duration and every rule at save.
 */
export function freeSlotStarts(day: MasterDay | undefined, busy: Timed[], date: DateKey, step = 30): number[] {
  if (!day) return []
  const taken = busy.map(b => span(b, date)).filter((s): s is [number, number] => s !== null)
  const out: number[] = []
  for (const w of day.windows) {
    const to = minutesOf(w.end)
    for (let m = Math.ceil(minutesOf(w.start) / step) * step; m + step <= to; m += step) {
      if (!taken.some(([from, until]) => m < until && m + step > from)) out.push(m)
    }
  }
  return out
}

/** The parts of [startMin, endMin] outside every working window — drawn tinted. */
export function offHours(day: MasterDay | undefined, startMin: number, endMin: number): [number, number][] {
  const windows = (day?.windows ?? [])
    .map(w => [minutesOf(w.start), minutesOf(w.end)] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  let cursor = startMin
  for (const [from, to] of windows) {
    if (from > cursor) out.push([cursor, Math.min(from, endMin)])
    cursor = Math.max(cursor, to)
  }
  if (cursor < endMin) out.push([cursor, endMin])
  return out.filter(([from, to]) => to > from)
}
```

Create `frontend/src/appointments/lib/status.ts`:

```ts
import type { DateKey, Status, Wall } from './types'
import { dateOf, wallMinutes } from './wallClock'

export type Tone = 'pending' | 'confirmed' | 'progress' | 'completed' | 'cancelled' | 'noshow'

/** In the order the legend lists them. */
export const STATUSES: Status[] = ['pending', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled']

export const STATUS_TONE: Record<Status, Tone> = {
  pending: 'pending',
  confirmed: 'confirmed',
  in_progress: 'progress',
  completed: 'completed',
  cancelled: 'cancelled',
  no_show: 'noshow',
}

/** Written out in full: Tailwind only generates classes it can see as literals. */
export const TONE_CLASS: Record<Tone, { text: string; tint: string; bar: string }> = {
  pending:   { text: 'text-a-st-pending',   tint: 'bg-a-st-pending/[0.12]',   bar: 'border-a-st-pending' },
  confirmed: { text: 'text-a-st-confirmed', tint: 'bg-a-st-confirmed/[0.12]', bar: 'border-a-st-confirmed' },
  progress:  { text: 'text-a-st-progress',  tint: 'bg-a-st-progress/[0.12]',  bar: 'border-a-st-progress' },
  completed: { text: 'text-a-st-completed', tint: 'bg-a-st-completed/[0.12]', bar: 'border-a-st-completed' },
  cancelled: { text: 'text-a-st-cancelled', tint: 'bg-a-st-cancelled/[0.12]', bar: 'border-a-st-cancelled' },
  noshow:    { text: 'text-a-st-noshow',    tint: 'bg-a-st-noshow/[0.12]',    bar: 'border-a-st-noshow' },
}

/** The statuses that occupy a slot — the scheduler's own list (ServiceSchedulingService). */
export const blocksSlot = (status: Status): boolean => status === 'pending' || status === 'confirmed' || status === 'in_progress'

const LATE_AFTER_MIN = 15

interface Marked { status: Status; start: Wall }

/**
 * Not a status — a reading of two: a request still awaiting confirmation,
 * or a confirmed appointment more than 15 minutes past its start that
 * nobody has started.
 */
export function needsAttention(a: Marked, now: { date: DateKey; minutes: number }): boolean {
  if (a.status === 'pending') return true
  if (a.status !== 'confirmed') return false
  const day = dateOf(a.start)
  if (day !== now.date) return day < now.date
  return now.minutes - wallMinutes(a.start) > LATE_AFTER_MIN
}

export interface Overview { total: number; upcoming: number; in_progress: number; completed: number; attention: number }

/** Counts for one day, from the appointments given. Cancelled ones are not part of the day. */
export function dayOverview(appointments: Marked[], date: DateKey, now: { date: DateKey; minutes: number }): Overview {
  const day = appointments.filter(a => dateOf(a.start) === date && a.status !== 'cancelled')
  return {
    total: day.length,
    upcoming: day.filter(a => a.status === 'confirmed' && !needsAttention(a, now)).length,
    in_progress: day.filter(a => a.status === 'in_progress').length,
    completed: day.filter(a => a.status === 'completed').length,
    attention: day.filter(a => needsAttention(a, now)).length,
  }
}
```

Create `frontend/src/appointments/lib/prefs.ts`:

```ts
export type View = 'day' | 'week' | 'list'

/** Display preferences, per browser. They change what is shown — never what is available and never who may see it. */
export interface Prefs { view: View; masterId: number | null; showCancelled: boolean }

export const DEFAULT_PREFS: Prefs = { view: 'day', masterId: null, showCancelled: false }

const KEY = 'appointments:prefs'
const VIEWS: readonly string[] = ['day', 'week', 'list']

export function parsePrefs(raw: string | null): Prefs {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  } catch {
    value = null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_PREFS
  const v = value as Record<string, unknown>

  return {
    view: typeof v.view === 'string' && VIEWS.includes(v.view) ? (v.view as View) : DEFAULT_PREFS.view,
    masterId: typeof v.masterId === 'number' && Number.isInteger(v.masterId) ? v.masterId : null,
    showCancelled: v.showCancelled === true,
  }
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(window.localStorage.getItem(KEY))
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* a private window or a full store: the preference simply is not kept */
  }
}
```

- [ ] **Step 8: Primitives**

Create `frontend/src/appointments/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary:   'bg-a-accent text-a-accent-ink hover:bg-a-accent-deep',
  secondary: 'bg-a-surface text-a-text border border-a-border hover:bg-a-surface-2',
  ghost:     'bg-transparent text-a-accent-deep hover:bg-a-accent/10',
  danger:    'bg-a-danger text-a-accent-ink hover:bg-a-danger/90',
}

export function Button({
  variant = 'primary', size = 'md', loading = false, full = false, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm'; loading?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm disabled:opacity-50 disabled:pointer-events-none ${size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2.5'} ${full ? 'w-full' : ''} ${VARIANT[variant]} ${className}`}
    >
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
```

Create `frontend/src/appointments/ui/Field.tsx`:

```tsx
import type { ReactNode } from 'react'

/** A labelled control. The label wraps the control, so it needs no id. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-a-text-2 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-a-text-2 mt-1">{hint}</span>}
    </label>
  )
}
```

Create `frontend/src/appointments/ui/Notice.tsx`:

```tsx
import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  info:    'bg-a-surface-2 text-a-text',
  success: 'bg-a-st-confirmed/[0.12] text-a-st-confirmed',
  warning: 'bg-a-st-pending/[0.12] text-a-st-pending',
  danger:  'bg-a-danger/[0.12] text-a-danger',
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${TONE[tone]}`}>
      {children}
    </div>
  )
}
```

Create `frontend/src/appointments/ui/StatusMark.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Check, CheckCheck, Clock, Play, UserX, X, type LucideIcon } from 'lucide-react'
import { STATUSES, STATUS_TONE, TONE_CLASS } from '../lib/status'
import type { Status } from '../lib/types'

const ICON: Record<Status, LucideIcon> = {
  pending: Clock,
  confirmed: Check,
  in_progress: Play,
  completed: CheckCheck,
  cancelled: X,
  no_show: UserX,
}

/**
 * A status as an icon and a word — never colour alone. The full admin's
 * bulk action can write a status this workspace does not know; that one is
 * shown as it is stored, in the awaiting-confirmation tone.
 */
export function StatusMark({ status, compact = false }: { status: Status; compact?: boolean }) {
  const { t } = useTranslation()
  const known = STATUSES.includes(status)
  const Icon = known ? ICON[status] : Clock
  const tone = TONE_CLASS[known ? STATUS_TONE[status] : 'pending']

  return (
    <span className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap ${tone.text} ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <Icon size={compact ? 12 : 14} aria-hidden />
      <span>{known ? t(`appointments.status.${status}`) : String(status)}</span>
    </span>
  )
}
```

- [ ] **Step 9: The bundle**

Create `frontend/src/appointments/i18n/index.ts`:

```ts
import i18n from '../../i18n'
import en from './appointments.en.json'
import ru from './appointments.ru.json'
import de from './appointments.de.json'
import fr from './appointments.fr.json'
import es from './appointments.es.json'

/**
 * The workspace's strings, kept out of the admin's common.json so a session
 * that never opens the workspace never downloads them. Registered under the
 * `appointments` key of the `common` namespace, so call sites read
 * `t('appointments.nav.calendar')`.
 */
export const APPOINTMENTS_LOCALE_FILES = { en, ru, de, fr, es } as const

let registered = false

export function registerAppointmentsLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(APPOINTMENTS_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { appointments: bundle }, true, true)
  }
  registered = true
}
```

Create `frontend/src/appointments/i18n/appointments.en.json`:

```json
{
  "nav": { "calendar": "Calendar" },
  "common": {
    "loading": "Loading…",
    "error": "Something went wrong. Please try again.",
    "retry": "Try again",
    "cancel": "Cancel",
    "close": "Close",
    "back": "Back"
  },
  "shell": {
    "menu": "Menu",
    "full_admin": "Full admin",
    "language": "Language",
    "sign_out": "Sign out",
    "search": "Search clients",
    "new_appointment": "New appointment",
    "switched_off": "The appointments workspace has been switched off for your organisation. Your bookings are unchanged and remain in the full admin.",
    "open_full_admin": "Open the full admin",
    "timezone_missing": "The venue's time zone is not set, so \"now\" and \"today\" follow UTC. Set it in the full admin under Settings → General → Timezone (for example Europe/London).",
    "not_bookable": "Nothing can be booked yet: add a service, a team member who performs it, and their working hours in the full admin."
  },
  "vocab": {
    "beauty": { "client": "Client", "clients": "Clients", "team_member": "Stylist", "service": "Treatment" },
    "other": { "client": "Client", "clients": "Clients", "team_member": "Team member", "service": "Service" }
  },
  "status": {
    "pending": "Awaiting confirmation",
    "confirmed": "Confirmed",
    "in_progress": "In progress",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "no_show": "No-show"
  },
  "payment": {
    "not_paid_online": "Not paid online",
    "card_held": "Card held, not charged",
    "paid_by_card": "Paid by card",
    "marked_paid": "Marked paid by staff",
    "refunded": "Refunded",
    "marked_refunded": "Marked refunded by staff",
    "partially_refunded": "Partially refunded",
    "failed": "Payment failed",
    "hold_released": "Card hold released",
    "unknown": "Payment state not known"
  },
  "calendar": {
    "no_team": "No team members to show. Add team members and their working hours in the full admin.",
    "blocked": "Blocked",
    "book_at": "Book {{name}} at {{time}}",
    "view": "View",
    "view_day": "Day",
    "view_week": "Week",
    "view_list": "List",
    "previous": "Previous",
    "next": "Next",
    "go_to_date": "Go to date",
    "today": "Today",
    "all_team": "Whole team",
    "show_cancelled": "Show cancelled",
    "updated": "Updated {{time}}",
    "refresh": "Refresh",
    "month": "Month",
    "previous_month": "Previous month",
    "next_month": "Next month",
    "load_failed": "The calendar could not be refreshed. What you see may be out of date."
  },
  "overview": {
    "title": "Day overview",
    "total": "Appointments",
    "upcoming": "Upcoming",
    "in_progress": "In progress",
    "completed": "Completed",
    "attention": "Needs attention",
    "attention_hint": "Needs attention: awaiting confirmation, or confirmed and more than 15 minutes late without being started.",
    "legend": "Statuses"
  },
  "list": {
    "empty": "No appointments in this period.",
    "caption": "Appointments",
    "time": "Time",
    "status": "Status",
    "payment": "Payment"
  },
  "client": {
    "member_line": "Member · {{tier}} · {{points}} points",
    "member": "Member",
    "not_member": "Not a member",
    "change": "Choose someone else",
    "search_placeholder": "Name, phone or email",
    "search_hint": "Type at least two characters to search.",
    "none_found": "No one found.",
    "new": "Add new",
    "name": "Name",
    "phone": "Phone",
    "email": "Email",
    "contact_hint": "A name, and a phone number or an email.",
    "duplicate_title": "This may already be a client:",
    "add": "Add",
    "add_anyway": "Add as a new client anyway",
    "open_profile": "Open profile",
    "no_contact": "No contact details",
    "unlinked": "This booking is not linked to a client record.",
    "book_again": "Book again",
    "book_first": "Book an appointment",
    "upcoming": "Upcoming",
    "no_upcoming": "No upcoming appointments.",
    "past": "Past",
    "no_past": "No past appointments.",
    "matched_by_email": "Matched by email",
    "matched_hint": "Older bookings made with this email address. They are not linked to this client record.",
    "not_found": "This client no longer exists."
  },
  "panel": {
    "title": "Appointment",
    "new_title": "New appointment",
    "date": "Date",
    "choose": "Choose…",
    "time": "Time",
    "choose_time": "Choose a time…",
    "time_lost": "That time is no longer free. Choose another.",
    "no_slots": "No free time on this day for this service and team member.",
    "when": "When",
    "duration": "Duration",
    "minutes": "{{minutes}} min",
    "price": "Price",
    "source": "Booked",
    "source_desk": "At the desk",
    "source_phone": "By phone",
    "source_walk_in": "Walk-in",
    "staff_note": "Note for the team",
    "client_note": "Note from the client",
    "save": "Save appointment",
    "reference": "Reference",
    "reason": "Reason",
    "move_to": "New time: {{start}} – {{end}}",
    "save_move": "Move appointment",
    "load_failed": "This appointment could not be loaded."
  },
  "action": {
    "confirm": "Confirm",
    "start": "Arrived",
    "complete": "Complete",
    "award_points": "Award points",
    "move": "Move",
    "mark_paid_at_venue": "Mark paid at venue",
    "no_show": "No-show",
    "cancel": "Cancel appointment"
  },
  "consequence": {
    "no_message": "No message is sent to the client.",
    "points_will_award": "Completing awards {{points}} points.",
    "coupon_not_returned": "The coupon used on this booking is not returned.",
    "payment": {
      "none": "No online payment is attached to this appointment.",
      "hold_will_be_charged": "The held card payment will be charged within about 10 minutes.",
      "hold_will_be_released": "The card hold is released automatically within about 10 minutes. Nothing is charged.",
      "captured_not_refunded": "The card payment is NOT refunded automatically. It is flagged for a manual refund in Stripe.",
      "marked_only": "This records \"paid at the venue\" on the appointment. No money is moved."
    }
  },
  "points_reason": {
    "not_a_member": "No points: this client is not a member.",
    "programme_off": "No points: the venue has no active programme.",
    "points_on_bookings_off": "No points: points for appointments are switched off in the programme.",
    "already_awarded": "Points for this visit were already awarded.",
    "zero_amount": "No points: nothing was charged for this visit.",
    "refunded": "No points: the payment was refunded.",
    "failed": "The visit is completed, but the points could not be awarded just now. Use \"Award points\" to try again."
  },
  "loyalty": {
    "title": "Membership",
    "tier": "Tier",
    "points": "Points",
    "number": "Number",
    "awarded": "{{points}} points awarded for this visit.",
    "awarded_none": "No points were awarded for this visit."
  },
  "history": {
    "title": "History",
    "system": "System",
    "created": "Booked",
    "moved": "Moved",
    "confirm": "Confirmed",
    "start": "Marked as arrived",
    "complete": "Completed",
    "no_show": "Marked as a no-show",
    "cancel": "Cancelled",
    "mark_paid_at_venue": "Marked paid at the venue",
    "award_points": "Points awarded",
    "updated": "Changed in the full admin",
    "cancelled": "Cancelled in the full admin",
    "bulk_cancel": "Cancelled in the full admin (bulk)",
    "bulk_mark_complete": "Completed in the full admin (bulk)",
    "bulk_mark_paid": "Marked paid in the full admin (bulk)",
    "bulk_mark_no_show": "Marked as a no-show in the full admin (bulk)",
    "bulk_mark_status": "Status changed in the full admin (bulk)"
  },
  "error": {
    "slot_taken": "That time is not free. Choose another.",
    "stale": "This appointment was changed by someone else. The current details are shown — check them and try again.",
    "not_allowed": "That is not possible for this appointment in its current state.",
    "master_not_eligible": "This team member does not perform that service.",
    "before_today": "An appointment cannot be placed on a day that has passed.",
    "time_does_not_exist": "That time does not exist at the venue: the clocks change that night.",
    "invalid_time": "That time could not be read. Choose it again.",
    "idempotency_key_reused": "This request was already used for another appointment. Close the panel and start again.",
    "possible_duplicate": "A client with this phone number or email already exists.",
    "workspace_disabled": "The appointments workspace is switched off for your organisation.",
    "not_found": "This appointment no longer exists.",
    "client_not_found": "This client no longer exists.",
    "service_not_found": "This service no longer exists.",
    "master_not_found": "This team member no longer exists.",
    "network": "No answer from the server. Check the connection and try again — nothing is booked twice."
  }
}
```

Create `frontend/src/appointments/i18n/appointments.ru.json`:

```json
{
  "nav": { "calendar": "Календарь" },
  "common": {
    "loading": "Загрузка…",
    "error": "Что-то пошло не так. Попробуйте ещё раз.",
    "retry": "Повторить",
    "cancel": "Отмена",
    "close": "Закрыть",
    "back": "Назад"
  },
  "shell": {
    "menu": "Меню",
    "full_admin": "Полная админка",
    "language": "Язык",
    "sign_out": "Выйти",
    "search": "Поиск клиентов",
    "new_appointment": "Новая запись",
    "switched_off": "Рабочее место записей отключено для вашей организации. Записи не изменились и остаются в полной админке.",
    "open_full_admin": "Открыть полную админку",
    "timezone_missing": "Часовой пояс заведения не задан, поэтому «сейчас» и «сегодня» считаются по UTC. Укажите его в полной админке: Настройки → Общие → Часовой пояс (например, Europe/London).",
    "not_bookable": "Пока нечего бронировать: добавьте услугу, сотрудника, который её выполняет, и его рабочие часы в полной админке."
  },
  "vocab": {
    "beauty": { "client": "Клиент", "clients": "Клиенты", "team_member": "Мастер", "service": "Процедура" },
    "other": { "client": "Клиент", "clients": "Клиенты", "team_member": "Сотрудник", "service": "Услуга" }
  },
  "status": {
    "pending": "Ждёт подтверждения",
    "confirmed": "Подтверждена",
    "in_progress": "Идёт",
    "completed": "Завершена",
    "cancelled": "Отменена",
    "no_show": "Неявка"
  },
  "payment": {
    "not_paid_online": "Не оплачено онлайн",
    "card_held": "Сумма заблокирована на карте, не списана",
    "paid_by_card": "Оплачено картой",
    "marked_paid": "Отмечено оплаченным сотрудником",
    "refunded": "Возвращено",
    "marked_refunded": "Отмечено возвращённым сотрудником",
    "partially_refunded": "Возвращено частично",
    "failed": "Оплата не прошла",
    "hold_released": "Блокировка на карте снята",
    "unknown": "Состояние оплаты неизвестно"
  },
  "calendar": {
    "no_team": "Нет сотрудников для показа. Добавьте сотрудников и их рабочие часы в полной админке.",
    "blocked": "Занято",
    "book_at": "Записать: {{name}}, {{time}}",
    "view": "Вид",
    "view_day": "День",
    "view_week": "Неделя",
    "view_list": "Список",
    "previous": "Назад",
    "next": "Вперёд",
    "go_to_date": "Перейти к дате",
    "today": "Сегодня",
    "all_team": "Вся команда",
    "show_cancelled": "Показывать отменённые",
    "updated": "Обновлено в {{time}}",
    "refresh": "Обновить",
    "month": "Месяц",
    "previous_month": "Предыдущий месяц",
    "next_month": "Следующий месяц",
    "load_failed": "Не удалось обновить календарь. Данные на экране могут быть устаревшими."
  },
  "overview": {
    "title": "Обзор дня",
    "total": "Записи",
    "upcoming": "Предстоят",
    "in_progress": "Идут",
    "completed": "Завершены",
    "attention": "Требуют внимания",
    "attention_hint": "Требуют внимания: ждут подтверждения или подтверждены, но не начаты спустя более 15 минут после начала.",
    "legend": "Статусы"
  },
  "list": {
    "empty": "За этот период записей нет.",
    "caption": "Записи",
    "time": "Время",
    "status": "Статус",
    "payment": "Оплата"
  },
  "client": {
    "member_line": "Участник · {{tier}} · баллов: {{points}}",
    "member": "Участник",
    "not_member": "Не участник программы",
    "change": "Выбрать другого",
    "search_placeholder": "Имя, телефон или email",
    "search_hint": "Введите не менее двух символов.",
    "none_found": "Никого не найдено.",
    "new": "Добавить нового",
    "name": "Имя",
    "phone": "Телефон",
    "email": "Email",
    "contact_hint": "Имя и телефон или email.",
    "duplicate_title": "Возможно, этот клиент уже есть:",
    "add": "Добавить",
    "add_anyway": "Всё равно добавить как нового",
    "open_profile": "Открыть профиль",
    "no_contact": "Контактов нет",
    "unlinked": "Эта запись не привязана к карточке клиента.",
    "book_again": "Записать снова",
    "book_first": "Записать",
    "upcoming": "Предстоящие",
    "no_upcoming": "Предстоящих записей нет.",
    "past": "Прошедшие",
    "no_past": "Прошедших записей нет.",
    "matched_by_email": "Найдено по email",
    "matched_hint": "Более ранние записи с этим адресом. Они не привязаны к карточке клиента.",
    "not_found": "Этого клиента больше нет."
  },
  "panel": {
    "title": "Запись",
    "new_title": "Новая запись",
    "date": "Дата",
    "choose": "Выберите…",
    "time": "Время",
    "choose_time": "Выберите время…",
    "time_lost": "Это время уже занято. Выберите другое.",
    "no_slots": "В этот день нет свободного времени для этой услуги и сотрудника.",
    "when": "Когда",
    "duration": "Длительность",
    "minutes": "{{minutes}} мин",
    "price": "Цена",
    "source": "Как записан",
    "source_desk": "На ресепшене",
    "source_phone": "По телефону",
    "source_walk_in": "Без записи",
    "staff_note": "Заметка для команды",
    "client_note": "Заметка клиента",
    "save": "Сохранить запись",
    "reference": "Номер",
    "reason": "Причина",
    "move_to": "Новое время: {{start}} – {{end}}",
    "save_move": "Перенести запись",
    "load_failed": "Не удалось загрузить запись."
  },
  "action": {
    "confirm": "Подтвердить",
    "start": "Пришёл",
    "complete": "Завершить",
    "award_points": "Начислить баллы",
    "move": "Перенести",
    "mark_paid_at_venue": "Оплачено на месте",
    "no_show": "Неявка",
    "cancel": "Отменить запись"
  },
  "consequence": {
    "no_message": "Клиенту сообщение не отправляется.",
    "points_will_award": "При завершении будет начислено баллов: {{points}}.",
    "coupon_not_returned": "Купон, использованный в этой записи, не возвращается.",
    "payment": {
      "none": "К этой записи онлайн-оплата не привязана.",
      "hold_will_be_charged": "Заблокированная на карте сумма будет списана примерно через 10 минут.",
      "hold_will_be_released": "Блокировка на карте снимется автоматически примерно через 10 минут. Ничего не списывается.",
      "captured_not_refunded": "Оплата картой автоматически НЕ возвращается. Запись помечается для ручного возврата в Stripe.",
      "marked_only": "В записи отмечается «оплачено на месте». Деньги не перемещаются."
    }
  },
  "points_reason": {
    "not_a_member": "Баллы не начисляются: клиент не участник программы.",
    "programme_off": "Баллы не начисляются: у заведения нет активной программы.",
    "points_on_bookings_off": "Баллы не начисляются: начисление за записи отключено в программе.",
    "already_awarded": "Баллы за этот визит уже начислены.",
    "zero_amount": "Баллы не начисляются: за этот визит ничего не взято.",
    "refunded": "Баллы не начисляются: оплата возвращена.",
    "failed": "Визит завершён, но начислить баллы сейчас не удалось. Нажмите «Начислить баллы», чтобы повторить."
  },
  "loyalty": {
    "title": "Участие в программе",
    "tier": "Уровень",
    "points": "Баллы",
    "number": "Номер",
    "awarded": "За этот визит начислено баллов: {{points}}.",
    "awarded_none": "За этот визит баллы не начислены."
  },
  "history": {
    "title": "История",
    "system": "Система",
    "created": "Создана",
    "moved": "Перенесена",
    "confirm": "Подтверждена",
    "start": "Отмечен приход",
    "complete": "Завершена",
    "no_show": "Отмечена неявка",
    "cancel": "Отменена",
    "mark_paid_at_venue": "Отмечена оплата на месте",
    "award_points": "Начислены баллы",
    "updated": "Изменена в полной админке",
    "cancelled": "Отменена в полной админке",
    "bulk_cancel": "Отменена в полной админке (массово)",
    "bulk_mark_complete": "Завершена в полной админке (массово)",
    "bulk_mark_paid": "Отмечена оплаченной в полной админке (массово)",
    "bulk_mark_no_show": "Отмечена неявка в полной админке (массово)",
    "bulk_mark_status": "Статус изменён в полной админке (массово)"
  },
  "error": {
    "slot_taken": "Это время занято. Выберите другое.",
    "stale": "Запись изменил кто-то другой. Показаны текущие данные — проверьте их и повторите.",
    "not_allowed": "Для этой записи в её текущем состоянии это невозможно.",
    "master_not_eligible": "Этот сотрудник не выполняет такую услугу.",
    "before_today": "Нельзя поставить запись на прошедший день.",
    "time_does_not_exist": "Такого времени в заведении не существует: в эту ночь переводят часы.",
    "invalid_time": "Не удалось прочитать время. Выберите его ещё раз.",
    "idempotency_key_reused": "Этот запрос уже использован для другой записи. Закройте панель и начните заново.",
    "possible_duplicate": "Клиент с таким телефоном или email уже есть.",
    "workspace_disabled": "Рабочее место записей отключено для вашей организации.",
    "not_found": "Этой записи больше нет.",
    "client_not_found": "Этого клиента больше нет.",
    "service_not_found": "Этой услуги больше нет.",
    "master_not_found": "Этого сотрудника больше нет.",
    "network": "Сервер не ответил. Проверьте соединение и повторите — запись не создастся дважды."
  }
}
```

Create `frontend/src/appointments/i18n/appointments.de.json`:

```json
{
  "nav": { "calendar": "Kalender" },
  "common": {
    "loading": "Wird geladen…",
    "error": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    "retry": "Erneut versuchen",
    "cancel": "Abbrechen",
    "close": "Schließen",
    "back": "Zurück"
  },
  "shell": {
    "menu": "Menü",
    "full_admin": "Vollständige Verwaltung",
    "language": "Sprache",
    "sign_out": "Abmelden",
    "search": "Kunden suchen",
    "new_appointment": "Neuer Termin",
    "switched_off": "Der Termin-Arbeitsbereich wurde für Ihre Organisation abgeschaltet. Ihre Buchungen sind unverändert und bleiben in der vollständigen Verwaltung.",
    "open_full_admin": "Vollständige Verwaltung öffnen",
    "timezone_missing": "Die Zeitzone des Betriebs ist nicht festgelegt, daher richten sich „jetzt“ und „heute“ nach UTC. Legen Sie sie in der vollständigen Verwaltung unter Einstellungen → Allgemein → Zeitzone fest (zum Beispiel Europe/London).",
    "not_bookable": "Es kann noch nichts gebucht werden: Legen Sie in der vollständigen Verwaltung eine Leistung, ein Teammitglied, das sie ausführt, und dessen Arbeitszeiten an."
  },
  "vocab": {
    "beauty": { "client": "Kunde", "clients": "Kunden", "team_member": "Stylist(in)", "service": "Behandlung" },
    "other": { "client": "Kunde", "clients": "Kunden", "team_member": "Mitarbeiter(in)", "service": "Leistung" }
  },
  "status": {
    "pending": "Wartet auf Bestätigung",
    "confirmed": "Bestätigt",
    "in_progress": "Läuft",
    "completed": "Abgeschlossen",
    "cancelled": "Storniert",
    "no_show": "Nicht erschienen"
  },
  "payment": {
    "not_paid_online": "Nicht online bezahlt",
    "card_held": "Karte reserviert, nicht belastet",
    "paid_by_card": "Mit Karte bezahlt",
    "marked_paid": "Vom Personal als bezahlt markiert",
    "refunded": "Erstattet",
    "marked_refunded": "Vom Personal als erstattet markiert",
    "partially_refunded": "Teilweise erstattet",
    "failed": "Zahlung fehlgeschlagen",
    "hold_released": "Kartenreservierung aufgehoben",
    "unknown": "Zahlungsstatus unbekannt"
  },
  "calendar": {
    "no_team": "Keine Teammitglieder vorhanden. Legen Sie Teammitglieder und deren Arbeitszeiten in der vollständigen Verwaltung an.",
    "blocked": "Blockiert",
    "book_at": "{{name}} um {{time}} buchen",
    "view": "Ansicht",
    "view_day": "Tag",
    "view_week": "Woche",
    "view_list": "Liste",
    "previous": "Zurück",
    "next": "Weiter",
    "go_to_date": "Zu Datum springen",
    "today": "Heute",
    "all_team": "Ganzes Team",
    "show_cancelled": "Stornierte anzeigen",
    "updated": "Aktualisiert um {{time}}",
    "refresh": "Aktualisieren",
    "month": "Monat",
    "previous_month": "Vorheriger Monat",
    "next_month": "Nächster Monat",
    "load_failed": "Der Kalender konnte nicht aktualisiert werden. Die Anzeige ist möglicherweise veraltet."
  },
  "overview": {
    "title": "Tagesübersicht",
    "total": "Termine",
    "upcoming": "Bevorstehend",
    "in_progress": "Laufend",
    "completed": "Abgeschlossen",
    "attention": "Handlungsbedarf",
    "attention_hint": "Handlungsbedarf: wartet auf Bestätigung, oder bestätigt und mehr als 15 Minuten nach Beginn noch nicht gestartet.",
    "legend": "Status"
  },
  "list": {
    "empty": "In diesem Zeitraum gibt es keine Termine.",
    "caption": "Termine",
    "time": "Zeit",
    "status": "Status",
    "payment": "Zahlung"
  },
  "client": {
    "member_line": "Mitglied · {{tier}} · {{points}} Punkte",
    "member": "Mitglied",
    "not_member": "Kein Mitglied",
    "change": "Andere Person wählen",
    "search_placeholder": "Name, Telefon oder E-Mail",
    "search_hint": "Geben Sie mindestens zwei Zeichen ein.",
    "none_found": "Niemand gefunden.",
    "new": "Neu anlegen",
    "name": "Name",
    "phone": "Telefon",
    "email": "E-Mail",
    "contact_hint": "Ein Name und eine Telefonnummer oder E-Mail-Adresse.",
    "duplicate_title": "Diese Person gibt es möglicherweise schon:",
    "add": "Anlegen",
    "add_anyway": "Trotzdem neu anlegen",
    "open_profile": "Profil öffnen",
    "no_contact": "Keine Kontaktdaten",
    "unlinked": "Diese Buchung ist mit keinem Kundendatensatz verknüpft.",
    "book_again": "Erneut buchen",
    "book_first": "Termin buchen",
    "upcoming": "Bevorstehend",
    "no_upcoming": "Keine bevorstehenden Termine.",
    "past": "Vergangen",
    "no_past": "Keine vergangenen Termine.",
    "matched_by_email": "Über die E-Mail-Adresse gefunden",
    "matched_hint": "Ältere Buchungen mit dieser E-Mail-Adresse. Sie sind nicht mit diesem Kundendatensatz verknüpft.",
    "not_found": "Diesen Kunden gibt es nicht mehr."
  },
  "panel": {
    "title": "Termin",
    "new_title": "Neuer Termin",
    "date": "Datum",
    "choose": "Auswählen…",
    "time": "Uhrzeit",
    "choose_time": "Uhrzeit auswählen…",
    "time_lost": "Diese Zeit ist nicht mehr frei. Bitte wählen Sie eine andere.",
    "no_slots": "An diesem Tag gibt es für diese Leistung und dieses Teammitglied keine freie Zeit.",
    "when": "Wann",
    "duration": "Dauer",
    "minutes": "{{minutes}} Min.",
    "price": "Preis",
    "source": "Gebucht",
    "source_desk": "Am Empfang",
    "source_phone": "Telefonisch",
    "source_walk_in": "Ohne Termin",
    "staff_note": "Notiz für das Team",
    "client_note": "Notiz des Kunden",
    "save": "Termin speichern",
    "reference": "Nummer",
    "reason": "Grund",
    "move_to": "Neue Zeit: {{start}} – {{end}}",
    "save_move": "Termin verschieben",
    "load_failed": "Dieser Termin konnte nicht geladen werden."
  },
  "action": {
    "confirm": "Bestätigen",
    "start": "Eingetroffen",
    "complete": "Abschließen",
    "award_points": "Punkte gutschreiben",
    "move": "Verschieben",
    "mark_paid_at_venue": "Vor Ort bezahlt",
    "no_show": "Nicht erschienen",
    "cancel": "Termin stornieren"
  },
  "consequence": {
    "no_message": "Der Kunde erhält keine Nachricht.",
    "points_will_award": "Beim Abschließen werden {{points}} Punkte gutgeschrieben.",
    "coupon_not_returned": "Der bei dieser Buchung eingelöste Gutschein wird nicht zurückgegeben.",
    "payment": {
      "none": "Mit diesem Termin ist keine Online-Zahlung verbunden.",
      "hold_will_be_charged": "Der reservierte Kartenbetrag wird in etwa 10 Minuten belastet.",
      "hold_will_be_released": "Die Kartenreservierung wird in etwa 10 Minuten automatisch aufgehoben. Es wird nichts belastet.",
      "captured_not_refunded": "Die Kartenzahlung wird NICHT automatisch erstattet. Sie wird für eine manuelle Erstattung in Stripe vorgemerkt.",
      "marked_only": "Am Termin wird „vor Ort bezahlt“ vermerkt. Es wird kein Geld bewegt."
    }
  },
  "points_reason": {
    "not_a_member": "Keine Punkte: Dieser Kunde ist kein Mitglied.",
    "programme_off": "Keine Punkte: Der Betrieb hat kein aktives Programm.",
    "points_on_bookings_off": "Keine Punkte: Punkte für Termine sind im Programm abgeschaltet.",
    "already_awarded": "Die Punkte für diesen Besuch wurden bereits gutgeschrieben.",
    "zero_amount": "Keine Punkte: Für diesen Besuch wurde nichts berechnet.",
    "refunded": "Keine Punkte: Die Zahlung wurde erstattet.",
    "failed": "Der Besuch ist abgeschlossen, aber die Punkte konnten gerade nicht gutgeschrieben werden. Mit „Punkte gutschreiben“ versuchen Sie es erneut."
  },
  "loyalty": {
    "title": "Mitgliedschaft",
    "tier": "Stufe",
    "points": "Punkte",
    "number": "Nummer",
    "awarded": "Für diesen Besuch wurden {{points}} Punkte gutgeschrieben.",
    "awarded_none": "Für diesen Besuch wurden keine Punkte gutgeschrieben."
  },
  "history": {
    "title": "Verlauf",
    "system": "System",
    "created": "Gebucht",
    "moved": "Verschoben",
    "confirm": "Bestätigt",
    "start": "Als eingetroffen markiert",
    "complete": "Abgeschlossen",
    "no_show": "Als nicht erschienen markiert",
    "cancel": "Storniert",
    "mark_paid_at_venue": "Als vor Ort bezahlt markiert",
    "award_points": "Punkte gutgeschrieben",
    "updated": "In der vollständigen Verwaltung geändert",
    "cancelled": "In der vollständigen Verwaltung storniert",
    "bulk_cancel": "In der vollständigen Verwaltung storniert (Sammelaktion)",
    "bulk_mark_complete": "In der vollständigen Verwaltung abgeschlossen (Sammelaktion)",
    "bulk_mark_paid": "In der vollständigen Verwaltung als bezahlt markiert (Sammelaktion)",
    "bulk_mark_no_show": "In der vollständigen Verwaltung als nicht erschienen markiert (Sammelaktion)",
    "bulk_mark_status": "Status in der vollständigen Verwaltung geändert (Sammelaktion)"
  },
  "error": {
    "slot_taken": "Diese Zeit ist nicht frei. Bitte wählen Sie eine andere.",
    "stale": "Dieser Termin wurde von jemand anderem geändert. Die aktuellen Angaben werden angezeigt — prüfen Sie sie und versuchen Sie es erneut.",
    "not_allowed": "Das ist für diesen Termin in seinem aktuellen Zustand nicht möglich.",
    "master_not_eligible": "Dieses Teammitglied führt diese Leistung nicht aus.",
    "before_today": "Ein Termin kann nicht auf einen vergangenen Tag gelegt werden.",
    "time_does_not_exist": "Diese Uhrzeit gibt es im Betrieb nicht: In dieser Nacht wird die Uhr umgestellt.",
    "invalid_time": "Die Uhrzeit konnte nicht gelesen werden. Bitte wählen Sie sie erneut.",
    "idempotency_key_reused": "Diese Anfrage wurde bereits für einen anderen Termin verwendet. Schließen Sie das Fenster und beginnen Sie neu.",
    "possible_duplicate": "Einen Kunden mit dieser Telefonnummer oder E-Mail-Adresse gibt es bereits.",
    "workspace_disabled": "Der Termin-Arbeitsbereich ist für Ihre Organisation abgeschaltet.",
    "not_found": "Diesen Termin gibt es nicht mehr.",
    "client_not_found": "Diesen Kunden gibt es nicht mehr.",
    "service_not_found": "Diese Leistung gibt es nicht mehr.",
    "master_not_found": "Dieses Teammitglied gibt es nicht mehr.",
    "network": "Keine Antwort vom Server. Prüfen Sie die Verbindung und versuchen Sie es erneut — es wird nichts doppelt gebucht."
  }
}
```

Create `frontend/src/appointments/i18n/appointments.fr.json`:

```json
{
  "nav": { "calendar": "Agenda" },
  "common": {
    "loading": "Chargement…",
    "error": "Une erreur s'est produite. Veuillez réessayer.",
    "retry": "Réessayer",
    "cancel": "Annuler",
    "close": "Fermer",
    "back": "Retour"
  },
  "shell": {
    "menu": "Menu",
    "full_admin": "Administration complète",
    "language": "Langue",
    "sign_out": "Se déconnecter",
    "search": "Rechercher un client",
    "new_appointment": "Nouveau rendez-vous",
    "switched_off": "L'espace de rendez-vous a été désactivé pour votre organisation. Vos réservations sont inchangées et restent dans l'administration complète.",
    "open_full_admin": "Ouvrir l'administration complète",
    "timezone_missing": "Le fuseau horaire de l'établissement n'est pas défini : « maintenant » et « aujourd'hui » suivent donc l'UTC. Définissez-le dans l'administration complète, sous Paramètres → Général → Fuseau horaire (par exemple Europe/London).",
    "not_bookable": "Rien ne peut encore être réservé : ajoutez dans l'administration complète un service, un membre de l'équipe qui le réalise et ses horaires de travail."
  },
  "vocab": {
    "beauty": { "client": "Client", "clients": "Clients", "team_member": "Styliste", "service": "Soin" },
    "other": { "client": "Client", "clients": "Clients", "team_member": "Membre de l'équipe", "service": "Service" }
  },
  "status": {
    "pending": "En attente de confirmation",
    "confirmed": "Confirmé",
    "in_progress": "En cours",
    "completed": "Terminé",
    "cancelled": "Annulé",
    "no_show": "Absent"
  },
  "payment": {
    "not_paid_online": "Non payé en ligne",
    "card_held": "Carte autorisée, non débitée",
    "paid_by_card": "Payé par carte",
    "marked_paid": "Marqué payé par l'équipe",
    "refunded": "Remboursé",
    "marked_refunded": "Marqué remboursé par l'équipe",
    "partially_refunded": "Partiellement remboursé",
    "failed": "Paiement échoué",
    "hold_released": "Autorisation de carte levée",
    "unknown": "État du paiement inconnu"
  },
  "calendar": {
    "no_team": "Aucun membre de l'équipe à afficher. Ajoutez les membres de l'équipe et leurs horaires dans l'administration complète.",
    "blocked": "Bloqué",
    "book_at": "Réserver {{name}} à {{time}}",
    "view": "Vue",
    "view_day": "Jour",
    "view_week": "Semaine",
    "view_list": "Liste",
    "previous": "Précédent",
    "next": "Suivant",
    "go_to_date": "Aller à la date",
    "today": "Aujourd'hui",
    "all_team": "Toute l'équipe",
    "show_cancelled": "Afficher les annulés",
    "updated": "Mis à jour à {{time}}",
    "refresh": "Actualiser",
    "month": "Mois",
    "previous_month": "Mois précédent",
    "next_month": "Mois suivant",
    "load_failed": "L'agenda n'a pas pu être actualisé. Ce que vous voyez n'est peut-être plus à jour."
  },
  "overview": {
    "title": "Aperçu de la journée",
    "total": "Rendez-vous",
    "upcoming": "À venir",
    "in_progress": "En cours",
    "completed": "Terminés",
    "attention": "À traiter",
    "attention_hint": "À traiter : en attente de confirmation, ou confirmé et non commencé plus de 15 minutes après l'heure prévue.",
    "legend": "Statuts"
  },
  "list": {
    "empty": "Aucun rendez-vous sur cette période.",
    "caption": "Rendez-vous",
    "time": "Heure",
    "status": "Statut",
    "payment": "Paiement"
  },
  "client": {
    "member_line": "Membre · {{tier}} · {{points}} points",
    "member": "Membre",
    "not_member": "Non membre",
    "change": "Choisir quelqu'un d'autre",
    "search_placeholder": "Nom, téléphone ou e-mail",
    "search_hint": "Saisissez au moins deux caractères.",
    "none_found": "Personne n'a été trouvé.",
    "new": "Ajouter",
    "name": "Nom",
    "phone": "Téléphone",
    "email": "E-mail",
    "contact_hint": "Un nom, et un numéro de téléphone ou un e-mail.",
    "duplicate_title": "Ce client existe peut-être déjà :",
    "add": "Ajouter",
    "add_anyway": "Ajouter quand même comme nouveau client",
    "open_profile": "Ouvrir la fiche",
    "no_contact": "Aucune coordonnée",
    "unlinked": "Cette réservation n'est liée à aucune fiche client.",
    "book_again": "Réserver à nouveau",
    "book_first": "Prendre un rendez-vous",
    "upcoming": "À venir",
    "no_upcoming": "Aucun rendez-vous à venir.",
    "past": "Passés",
    "no_past": "Aucun rendez-vous passé.",
    "matched_by_email": "Trouvés par e-mail",
    "matched_hint": "Réservations plus anciennes faites avec cette adresse e-mail. Elles ne sont pas liées à cette fiche client.",
    "not_found": "Ce client n'existe plus."
  },
  "panel": {
    "title": "Rendez-vous",
    "new_title": "Nouveau rendez-vous",
    "date": "Date",
    "choose": "Choisir…",
    "time": "Heure",
    "choose_time": "Choisir une heure…",
    "time_lost": "Cette heure n'est plus libre. Choisissez-en une autre.",
    "no_slots": "Aucune heure libre ce jour-là pour ce service et ce membre de l'équipe.",
    "when": "Quand",
    "duration": "Durée",
    "minutes": "{{minutes}} min",
    "price": "Prix",
    "source": "Réservé",
    "source_desk": "À l'accueil",
    "source_phone": "Par téléphone",
    "source_walk_in": "Sans rendez-vous",
    "staff_note": "Note pour l'équipe",
    "client_note": "Note du client",
    "save": "Enregistrer le rendez-vous",
    "reference": "Référence",
    "reason": "Motif",
    "move_to": "Nouvelle heure : {{start}} – {{end}}",
    "save_move": "Déplacer le rendez-vous",
    "load_failed": "Ce rendez-vous n'a pas pu être chargé."
  },
  "action": {
    "confirm": "Confirmer",
    "start": "Arrivé",
    "complete": "Terminer",
    "award_points": "Attribuer les points",
    "move": "Déplacer",
    "mark_paid_at_venue": "Payé sur place",
    "no_show": "Absent",
    "cancel": "Annuler le rendez-vous"
  },
  "consequence": {
    "no_message": "Aucun message n'est envoyé au client.",
    "points_will_award": "{{points}} points seront crédités à la fin du rendez-vous.",
    "coupon_not_returned": "Le coupon utilisé pour cette réservation n'est pas restitué.",
    "payment": {
      "none": "Aucun paiement en ligne n'est lié à ce rendez-vous.",
      "hold_will_be_charged": "Le montant autorisé sur la carte sera débité d'ici 10 minutes environ.",
      "hold_will_be_released": "L'autorisation de carte est levée automatiquement d'ici 10 minutes environ. Rien n'est débité.",
      "captured_not_refunded": "Le paiement par carte n'est PAS remboursé automatiquement. Il est signalé pour un remboursement manuel dans Stripe.",
      "marked_only": "Le rendez-vous est noté « payé sur place ». Aucun argent n'est déplacé."
    }
  },
  "points_reason": {
    "not_a_member": "Pas de points : ce client n'est pas membre.",
    "programme_off": "Pas de points : l'établissement n'a pas de programme actif.",
    "points_on_bookings_off": "Pas de points : les points pour les rendez-vous sont désactivés dans le programme.",
    "already_awarded": "Les points de cette visite ont déjà été crédités.",
    "zero_amount": "Pas de points : rien n'a été facturé pour cette visite.",
    "refunded": "Pas de points : le paiement a été remboursé.",
    "failed": "La visite est terminée, mais les points n'ont pas pu être crédités pour l'instant. Utilisez « Attribuer les points » pour réessayer."
  },
  "loyalty": {
    "title": "Adhésion",
    "tier": "Niveau",
    "points": "Points",
    "number": "Numéro",
    "awarded": "{{points}} points crédités pour cette visite.",
    "awarded_none": "Aucun point n'a été crédité pour cette visite."
  },
  "history": {
    "title": "Historique",
    "system": "Système",
    "created": "Réservé",
    "moved": "Déplacé",
    "confirm": "Confirmé",
    "start": "Marqué comme arrivé",
    "complete": "Terminé",
    "no_show": "Marqué comme absent",
    "cancel": "Annulé",
    "mark_paid_at_venue": "Marqué payé sur place",
    "award_points": "Points crédités",
    "updated": "Modifié dans l'administration complète",
    "cancelled": "Annulé dans l'administration complète",
    "bulk_cancel": "Annulé dans l'administration complète (action groupée)",
    "bulk_mark_complete": "Terminé dans l'administration complète (action groupée)",
    "bulk_mark_paid": "Marqué payé dans l'administration complète (action groupée)",
    "bulk_mark_no_show": "Marqué comme absent dans l'administration complète (action groupée)",
    "bulk_mark_status": "Statut modifié dans l'administration complète (action groupée)"
  },
  "error": {
    "slot_taken": "Cette heure n'est pas libre. Choisissez-en une autre.",
    "stale": "Ce rendez-vous a été modifié par quelqu'un d'autre. Les informations actuelles sont affichées — vérifiez-les et réessayez.",
    "not_allowed": "Ce n'est pas possible pour ce rendez-vous dans son état actuel.",
    "master_not_eligible": "Ce membre de l'équipe ne réalise pas ce service.",
    "before_today": "Un rendez-vous ne peut pas être placé sur un jour passé.",
    "time_does_not_exist": "Cette heure n'existe pas dans l'établissement : l'heure change cette nuit-là.",
    "invalid_time": "L'heure n'a pas pu être lue. Choisissez-la à nouveau.",
    "idempotency_key_reused": "Cette demande a déjà servi pour un autre rendez-vous. Fermez le panneau et recommencez.",
    "possible_duplicate": "Un client avec ce numéro de téléphone ou cet e-mail existe déjà.",
    "workspace_disabled": "L'espace de rendez-vous est désactivé pour votre organisation.",
    "not_found": "Ce rendez-vous n'existe plus.",
    "client_not_found": "Ce client n'existe plus.",
    "service_not_found": "Ce service n'existe plus.",
    "master_not_found": "Ce membre de l'équipe n'existe plus.",
    "network": "Aucune réponse du serveur. Vérifiez la connexion et réessayez — rien n'est réservé deux fois."
  }
}
```

Create `frontend/src/appointments/i18n/appointments.es.json`:

```json
{
  "nav": { "calendar": "Agenda" },
  "common": {
    "loading": "Cargando…",
    "error": "Algo ha salido mal. Inténtelo de nuevo.",
    "retry": "Reintentar",
    "cancel": "Cancelar",
    "close": "Cerrar",
    "back": "Atrás"
  },
  "shell": {
    "menu": "Menú",
    "full_admin": "Administración completa",
    "language": "Idioma",
    "sign_out": "Cerrar sesión",
    "search": "Buscar clientes",
    "new_appointment": "Nueva cita",
    "switched_off": "El espacio de citas se ha desactivado para su organización. Sus reservas no han cambiado y siguen en la administración completa.",
    "open_full_admin": "Abrir la administración completa",
    "timezone_missing": "La zona horaria del local no está definida, por lo que «ahora» y «hoy» siguen el UTC. Defínala en la administración completa, en Ajustes → General → Zona horaria (por ejemplo, Europe/London).",
    "not_bookable": "Todavía no se puede reservar nada: añada en la administración completa un servicio, un miembro del equipo que lo realice y su horario de trabajo."
  },
  "vocab": {
    "beauty": { "client": "Cliente", "clients": "Clientes", "team_member": "Estilista", "service": "Tratamiento" },
    "other": { "client": "Cliente", "clients": "Clientes", "team_member": "Miembro del equipo", "service": "Servicio" }
  },
  "status": {
    "pending": "Pendiente de confirmación",
    "confirmed": "Confirmada",
    "in_progress": "En curso",
    "completed": "Completada",
    "cancelled": "Cancelada",
    "no_show": "No se presentó"
  },
  "payment": {
    "not_paid_online": "No pagada en línea",
    "card_held": "Tarjeta retenida, sin cargo",
    "paid_by_card": "Pagada con tarjeta",
    "marked_paid": "Marcada como pagada por el personal",
    "refunded": "Reembolsada",
    "marked_refunded": "Marcada como reembolsada por el personal",
    "partially_refunded": "Reembolsada en parte",
    "failed": "Pago fallido",
    "hold_released": "Retención de tarjeta liberada",
    "unknown": "Estado del pago desconocido"
  },
  "calendar": {
    "no_team": "No hay miembros del equipo que mostrar. Añada los miembros del equipo y su horario en la administración completa.",
    "blocked": "Bloqueado",
    "book_at": "Reservar a {{name}} a las {{time}}",
    "view": "Vista",
    "view_day": "Día",
    "view_week": "Semana",
    "view_list": "Lista",
    "previous": "Anterior",
    "next": "Siguiente",
    "go_to_date": "Ir a la fecha",
    "today": "Hoy",
    "all_team": "Todo el equipo",
    "show_cancelled": "Mostrar canceladas",
    "updated": "Actualizado a las {{time}}",
    "refresh": "Actualizar",
    "month": "Mes",
    "previous_month": "Mes anterior",
    "next_month": "Mes siguiente",
    "load_failed": "No se ha podido actualizar la agenda. Lo que ve puede no estar al día."
  },
  "overview": {
    "title": "Resumen del día",
    "total": "Citas",
    "upcoming": "Próximas",
    "in_progress": "En curso",
    "completed": "Completadas",
    "attention": "Requieren atención",
    "attention_hint": "Requieren atención: pendientes de confirmación, o confirmadas y sin empezar más de 15 minutos después de su hora.",
    "legend": "Estados"
  },
  "list": {
    "empty": "No hay citas en este periodo.",
    "caption": "Citas",
    "time": "Hora",
    "status": "Estado",
    "payment": "Pago"
  },
  "client": {
    "member_line": "Miembro · {{tier}} · {{points}} puntos",
    "member": "Miembro",
    "not_member": "No es miembro",
    "change": "Elegir a otra persona",
    "search_placeholder": "Nombre, teléfono o correo",
    "search_hint": "Escriba al menos dos caracteres.",
    "none_found": "No se ha encontrado a nadie.",
    "new": "Añadir",
    "name": "Nombre",
    "phone": "Teléfono",
    "email": "Correo",
    "contact_hint": "Un nombre y un teléfono o un correo.",
    "duplicate_title": "Puede que este cliente ya exista:",
    "add": "Añadir",
    "add_anyway": "Añadir igualmente como cliente nuevo",
    "open_profile": "Abrir ficha",
    "no_contact": "Sin datos de contacto",
    "unlinked": "Esta reserva no está vinculada a ninguna ficha de cliente.",
    "book_again": "Reservar de nuevo",
    "book_first": "Reservar una cita",
    "upcoming": "Próximas",
    "no_upcoming": "No hay citas próximas.",
    "past": "Pasadas",
    "no_past": "No hay citas pasadas.",
    "matched_by_email": "Encontradas por correo",
    "matched_hint": "Reservas anteriores hechas con este correo. No están vinculadas a esta ficha de cliente.",
    "not_found": "Este cliente ya no existe."
  },
  "panel": {
    "title": "Cita",
    "new_title": "Nueva cita",
    "date": "Fecha",
    "choose": "Elegir…",
    "time": "Hora",
    "choose_time": "Elegir una hora…",
    "time_lost": "Esa hora ya no está libre. Elija otra.",
    "no_slots": "No hay hora libre ese día para este servicio y este miembro del equipo.",
    "when": "Cuándo",
    "duration": "Duración",
    "minutes": "{{minutes}} min",
    "price": "Precio",
    "source": "Reservada",
    "source_desk": "En recepción",
    "source_phone": "Por teléfono",
    "source_walk_in": "Sin cita previa",
    "staff_note": "Nota para el equipo",
    "client_note": "Nota del cliente",
    "save": "Guardar cita",
    "reference": "Referencia",
    "reason": "Motivo",
    "move_to": "Nueva hora: {{start}} – {{end}}",
    "save_move": "Mover cita",
    "load_failed": "No se ha podido cargar esta cita."
  },
  "action": {
    "confirm": "Confirmar",
    "start": "Ha llegado",
    "complete": "Completar",
    "award_points": "Conceder puntos",
    "move": "Mover",
    "mark_paid_at_venue": "Pagada en el local",
    "no_show": "No se presentó",
    "cancel": "Cancelar cita"
  },
  "consequence": {
    "no_message": "No se envía ningún mensaje al cliente.",
    "points_will_award": "Al completarla se conceden {{points}} puntos.",
    "coupon_not_returned": "El cupón usado en esta reserva no se devuelve.",
    "payment": {
      "none": "Esta cita no tiene ningún pago en línea.",
      "hold_will_be_charged": "El importe retenido en la tarjeta se cobrará en unos 10 minutos.",
      "hold_will_be_released": "La retención de la tarjeta se libera automáticamente en unos 10 minutos. No se cobra nada.",
      "captured_not_refunded": "El pago con tarjeta NO se reembolsa automáticamente. Queda señalado para un reembolso manual en Stripe.",
      "marked_only": "Se anota «pagada en el local» en la cita. No se mueve dinero."
    }
  },
  "points_reason": {
    "not_a_member": "Sin puntos: este cliente no es miembro.",
    "programme_off": "Sin puntos: el local no tiene un programa activo.",
    "points_on_bookings_off": "Sin puntos: los puntos por citas están desactivados en el programa.",
    "already_awarded": "Los puntos de esta visita ya se concedieron.",
    "zero_amount": "Sin puntos: no se cobró nada por esta visita.",
    "refunded": "Sin puntos: el pago se reembolsó.",
    "failed": "La visita está completada, pero ahora no se han podido conceder los puntos. Use «Conceder puntos» para intentarlo de nuevo."
  },
  "loyalty": {
    "title": "Membresía",
    "tier": "Nivel",
    "points": "Puntos",
    "number": "Número",
    "awarded": "{{points}} puntos concedidos por esta visita.",
    "awarded_none": "No se concedieron puntos por esta visita."
  },
  "history": {
    "title": "Historial",
    "system": "Sistema",
    "created": "Reservada",
    "moved": "Movida",
    "confirm": "Confirmada",
    "start": "Marcada como llegada",
    "complete": "Completada",
    "no_show": "Marcada como no presentada",
    "cancel": "Cancelada",
    "mark_paid_at_venue": "Marcada como pagada en el local",
    "award_points": "Puntos concedidos",
    "updated": "Modificada en la administración completa",
    "cancelled": "Cancelada en la administración completa",
    "bulk_cancel": "Cancelada en la administración completa (acción masiva)",
    "bulk_mark_complete": "Completada en la administración completa (acción masiva)",
    "bulk_mark_paid": "Marcada como pagada en la administración completa (acción masiva)",
    "bulk_mark_no_show": "Marcada como no presentada en la administración completa (acción masiva)",
    "bulk_mark_status": "Estado cambiado en la administración completa (acción masiva)"
  },
  "error": {
    "slot_taken": "Esa hora no está libre. Elija otra.",
    "stale": "Otra persona ha modificado esta cita. Se muestran los datos actuales: revíselos e inténtelo de nuevo.",
    "not_allowed": "Eso no es posible para esta cita en su estado actual.",
    "master_not_eligible": "Este miembro del equipo no realiza ese servicio.",
    "before_today": "No se puede poner una cita en un día que ya ha pasado.",
    "time_does_not_exist": "Esa hora no existe en el local: esa noche cambia la hora.",
    "invalid_time": "No se ha podido leer la hora. Elíjala de nuevo.",
    "idempotency_key_reused": "Esta solicitud ya se usó para otra cita. Cierre el panel y empiece de nuevo.",
    "possible_duplicate": "Ya existe un cliente con ese teléfono o correo.",
    "workspace_disabled": "El espacio de citas está desactivado para su organización.",
    "not_found": "Esta cita ya no existe.",
    "client_not_found": "Este cliente ya no existe.",
    "service_not_found": "Este servicio ya no existe.",
    "master_not_found": "Este miembro del equipo ya no existe.",
    "network": "El servidor no responde. Compruebe la conexión e inténtelo de nuevo: nada se reserva dos veces."
  }
}
```

- [ ] **Step 10: Let the app-wide locale sweep see the workspace**

In `frontend/src/i18n/localeCompleteness.test.ts`:

1. Add to `SCAN_TARGETS`, after `path.join(SRC_DIR, 'portal'),`:

```ts
  path.join(SRC_DIR, 'appointments'),
```

2. Replace the `KEY_PREFIXES` line with:

```ts
const KEY_PREFIXES = ['landing_pages.', 'reviews.', 'nav.groups.landing_pages', 'nav.items.landing_', 'portal.', 'appointments.']
```

3. In `readLocale()`, replace `return { ...common, portal }` with:

```ts
  // The appointments workspace registers its bundle under `appointments`
  // the same way (src/appointments/i18n/index.ts).
  const appointmentsFile = path.join(SRC_DIR, 'appointments/i18n', `appointments.${locale}.json`)
  const appointments = fs.existsSync(appointmentsFile) ? JSON.parse(fs.readFileSync(appointmentsFile, 'utf8')) : {}
  return { ...common, portal, appointments }
```

From now on, every literal `t('appointments.…')` key any later task writes must exist in all five bundles, or this test names it.

- [ ] **Step 11: Run the tests, the type check and the lint**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments src/i18n/localeCompleteness.test.ts 2>&1 | tail -n 15 && npx tsc -b && npx eslint src/appointments
```
Expected: all pass — `wallClock` 10, `layout` 14, `status` 6, `prefs` 2, `api` 4, `contrast` 39, `appointmentsLocales` 13, the sweep (three tests plus two per source file), the app-wide locale sweep unchanged. `tsc` and eslint silent.

If a contrast pair fails, change the token's value in `appointments.css` until it passes — never the threshold.

- [ ] **Step 12: Prove the full admin's stylesheet did not change shape**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run 2>&1 | tail -n 6
```
Expected: the Task 0 baseline plus the new tests; still exactly 3 failures, all in `plannerMeta`.

- [ ] **Step 13: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add frontend/src/appointments frontend/tailwind.config.js frontend/src/index.css frontend/src/i18n/localeCompleteness.test.ts && git commit -q -F - <<'EOF'
Lay the appointments workspace's frontend foundations

Tokens scoped under [data-appointments] with their contrast pinned, a typed
client for the one API prefix, wall-clock helpers that never build a Date
from an appointment's time, the calendar's layout maths, the status and
preference helpers, four primitives and the five-language bundle. A sweep
test keeps admin and portal classes and every other API path out.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---
### Task 14: The shell, the provider, the route and the landing (S9)

After this task `/appointments` opens in a browser for an enabled organisation: sidebar, top bar, notices, and two pages that so far show only their headings (Tasks 15–19 fill them).

**Files:**
- Create: `frontend/src/appointments/AppointmentsProvider.tsx`, `AppointmentsShell.tsx`, `AppointmentsApp.tsx`, `lib/vocab.ts`
- Create (headings only; replaced in Tasks 15 and 19): `frontend/src/appointments/calendar/CalendarPage.tsx`, `clients/ClientsPage.tsx`, `clients/ClientProfile.tsx`
- Modify: `frontend/src/App.tsx` (one lazy import near `:28-30`, one route near `:253`, the floating AI launcher near `:118-125`)
- Modify: `frontend/src/pages/Login.tsx:423` and `:464`
- Modify: `frontend/src/stores/authStore.ts` (the `User` interface)
- Test: `frontend/src/appointments/AppointmentsShell.test.tsx`, `frontend/src/appointments/lib/landing.test.ts`
- Create: `frontend/src/appointments/lib/landing.ts`

**Interfaces:**
- Consumes (Task 13): `appointmentsApi.bootstrap()`, `failureOf()`, type `Bootstrap`, `APP_NAME`, `registerAppointmentsLocales()`, `ui/Button`, `ui/Notice`.
- Produces:
  - `AppointmentsContext`, `useAppointments(): { data: Bootstrap | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => void }`, `useBoot(): Bootstrap` (throws when called outside a loaded shell — pages are only rendered once bootstrap is in).
  - `useVocab(): (noun: Noun) => string`, `type Noun = 'client' | 'clients' | 'team_member' | 'service'`, `vocabIndustry(industry: string | undefined): 'beauty' | 'other'`.
  - `landingPath(user: { user_type?: string; workspaces?: { appointments?: { landing?: boolean } } } | null | undefined, fallback: string): string`.
  - Route `/appointments/*`.

**Ruling plan-10:** the floating admin AI launcher (`AuthedFloatingAiChat` in `App.tsx`) is not rendered on `/appointments`. It is the full admin's copilot and sits outside the route tree, so without this it would float over the workspace.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/appointments/lib/landing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { landingPath } from './landing'

describe('landingPath', () => {
  it('sends a member to the portal whatever else is set', () => {
    expect(landingPath({ user_type: 'member', workspaces: { appointments: { landing: true } } }, '/')).toBe('/portal')
  })

  it('sends staff of a landing organisation to the workspace', () => {
    expect(landingPath({ user_type: 'staff', workspaces: { appointments: { landing: true } } }, '/')).toBe('/appointments')
  })

  it('leaves every other staff user exactly where they landed before', () => {
    expect(landingPath({ user_type: 'staff' }, '/')).toBe('/')
    expect(landingPath({ user_type: 'staff', workspaces: { appointments: { landing: false } } }, '/')).toBe('/')
    expect(landingPath({ user_type: 'staff', workspaces: {} }, '/')).toBe('/')
    expect(landingPath(null, '/')).toBe('/')
  })

  it('never overrides a redirect the sign-in link asked for', () => {
    expect(landingPath({ user_type: 'staff', workspaces: { appointments: { landing: true } } }, '/bookings')).toBe('/bookings')
  })
})
```

Create `frontend/src/appointments/AppointmentsShell.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppointmentsContext, type AppointmentsContextValue } from './AppointmentsProvider'
import { AppointmentsShell } from './AppointmentsShell'
import type { Bootstrap } from './lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))
vi.mock('../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))
vi.mock('../i18n', () => ({ SUPPORTED_LANGUAGES: [{ code: 'en', label: 'English' }, { code: 'ru', label: 'Русский' }] }))

const boot: Bootstrap = {
  name: 'HexaTech Appointments',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-06', currency: 'GBP' },
  staff: { name: 'Vitalij K', role: 'manager' },
  loyalty: { programme_on: true, points_on_bookings: true },
  readiness: { services: 5, team: 4, bookable: true },
}

function render(value: Partial<AppointmentsContextValue>, path = '/appointments') {
  const full: AppointmentsContextValue = { data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, ...value }
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>full admin dashboard</p>} />
        <Route path="/appointments/*" element={
          <AppointmentsContext.Provider value={full}>
            <AppointmentsShell><p>page body</p></AppointmentsShell>
          </AppointmentsContext.Provider>
        } />
      </Routes>
    </MemoryRouter>,
  )
}

const refused = (code: string) => ({ response: { status: 403, data: { error: code } } })

describe('AppointmentsShell', () => {
  it('is the token scope, names the product and the organisation, and draws the page', () => {
    const html = render({})
    expect(html).toContain('data-appointments=""')
    expect(html).toContain('HexaTech Appointments')
    expect(html).toContain('Lumière Salon')
    expect(html).toContain('page body')
  })

  it('offers Calendar and Clients and nothing from the full admin', () => {
    const html = render({})
    expect(html).toContain('href="/appointments"')
    expect(html).toContain('href="/appointments/clients"')
    expect(html).toContain('href="/appointments?new=1"')
    for (const foreign of ['/leads', '/members', '/engagement', '/chatbot-setup', '/planner', '/marketing', '/analytics']) {
      expect(html).not.toContain(`href="${foreign}"`)
    }
  })

  it('keeps a way back to the full admin in the secondary area', () => {
    expect(render({})).toContain('Full admin')
  })

  it('says when the venue has no named time zone', () => {
    expect(render({})).not.toContain('time zone is not set')
    expect(render({ data: { ...boot, venue: { ...boot.venue, timezone: 'UTC', timezone_named: false } } })).toContain('time zone is not set')
  })

  it('says when nothing can be booked yet', () => {
    expect(render({})).not.toContain('Nothing can be booked yet')
    expect(render({ data: { ...boot, readiness: { services: 0, team: 0, bookable: false } } })).toContain('Nothing can be booked yet')
  })

  it('shows the switched-off notice on a 403 while the workspace was open', () => {
    const html = render({ isError: true, error: refused('workspace_disabled') })
    expect(html).toContain('has been switched off')
    expect(html).toContain('href="/"')
    expect(html).not.toContain('page body')
  })

  it('draws nothing but a redirect for an organisation that never had the workspace', () => {
    // <Navigate to="/"> acts in an effect, which a static render never runs:
    // the proof here is that no part of the shell is drawn.
    const html = render({ data: undefined, isError: true, error: refused('workspace_disabled') })
    expect(html).toBe('')
  })

  it('shows a retry, not the page, when bootstrap fails for another reason', () => {
    const html = render({ data: undefined, isError: true, error: { response: { status: 500, data: {} } } })
    expect(html).toContain('Try again')
    expect(html).not.toContain('page body')
  })

  it('keeps the page up when a background refresh fails', () => {
    const html = render({ isError: true, error: { response: { status: 500, data: {} } } })
    expect(html).toContain('page body')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments/lib/landing.test.ts src/appointments/AppointmentsShell.test.tsx 2>&1 | tail -n 15
```
Expected: FAIL — cannot resolve `./landing`, `./AppointmentsProvider`, `./AppointmentsShell`.

- [ ] **Step 3: The landing rule**

Create `frontend/src/appointments/lib/landing.ts`:

```ts
interface LandingUser {
  user_type?: string
  workspaces?: { appointments?: { landing?: boolean } }
}

/**
 * Where a user goes right after signing in. `fallback` is what the sign-in
 * screen would have used anyway ('/' or an explicit ?redirect=): the
 * workspace is chosen only when nothing else was asked for, so an
 * organisation that never opted in lands exactly where it always did.
 */
export function landingPath(user: LandingUser | null | undefined, fallback: string): string {
  if (user?.user_type === 'member') return '/portal'
  if (fallback === '/' && user?.workspaces?.appointments?.landing === true) return '/appointments'
  return fallback
}
```

- [ ] **Step 4: Provider and vocabulary**

Create `frontend/src/appointments/AppointmentsProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { appointmentsApi } from './lib/api'
import { APP_NAME } from './lib/constants'
import type { Bootstrap } from './lib/types'

export interface AppointmentsContextValue {
  data: Bootstrap | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

// The context, its hooks and the provider stay in one small module, like the
// portal's provider.
// eslint-disable-next-line react-refresh/only-export-components
export const AppointmentsContext = createContext<AppointmentsContextValue>({
  data: undefined, isLoading: true, isError: false, error: null, refetch: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function useAppointments(): AppointmentsContextValue {
  return useContext(AppointmentsContext)
}

/** The loaded bootstrap. The shell renders a page only once it has one. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBoot(): Bootstrap {
  const { data } = useContext(AppointmentsContext)
  if (!data) throw new Error('useBoot() was called before the workspace bootstrap loaded')
  return data
}

export function AppointmentsProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['appointments', 'bootstrap'],
    queryFn: appointmentsApi.bootstrap,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: (count, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      return status !== 403 && status !== 401 && count < 2
    },
  })

  useEffect(() => {
    const previous = document.title
    document.title = APP_NAME
    return () => { document.title = previous }
  }, [])

  return (
    <AppointmentsContext.Provider value={{
      data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error,
      refetch: () => { void query.refetch() },
    }}>
      {children}
    </AppointmentsContext.Provider>
  )
}
```

Create `frontend/src/appointments/lib/vocab.ts`:

```ts
import { useTranslation } from 'react-i18next'
import { useAppointments } from '../AppointmentsProvider'

/**
 * Industry nouns, translated. Beauty and the generic set ship in this
 * milestone; every other industry reads the generic words until its own set
 * is added to the five bundles (`appointments.vocab.<industry>.<noun>`).
 */
export type VocabIndustry = 'beauty' | 'other'
export type Noun = 'client' | 'clients' | 'team_member' | 'service'

export function vocabIndustry(industry: string | undefined): VocabIndustry {
  return industry === 'beauty' ? 'beauty' : 'other'
}

export function useVocab(): (noun: Noun) => string {
  const { t } = useTranslation()
  const { data } = useAppointments()
  const industry = vocabIndustry(data?.organization.industry)
  return (noun) => t(`appointments.vocab.${industry}.${noun}`)
}
```

- [ ] **Step 5: The shell**

Create `frontend/src/appointments/AppointmentsShell.tsx`:

```tsx
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, LayoutGrid, LogOut, Plus, Search, Users } from 'lucide-react'
import { logoutAndRedirect } from '../lib/logout'
import { SUPPORTED_LANGUAGES } from '../i18n'
import { useAppointments } from './AppointmentsProvider'
import { failureOf } from './lib/api'
import { useVocab } from './lib/vocab'
import { Button } from './ui/Button'
import { Notice } from './ui/Notice'

/**
 * The workspace's frame: a calm dark rail with the two daily areas, a top
 * bar with the organisation, client search and New appointment, and the
 * notices that explain why something is not available. Nothing here links
 * into the full admin except the one "Full admin" entry in the secondary
 * area.
 */
export function AppointmentsShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const vocab = useVocab()
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useAppointments()
  const [search, setSearch] = useState('')

  const switchedOff = isError && failureOf(error).code === 'workspace_disabled'
  // An organisation that never had the workspace: the route is not for them.
  if (switchedOff && !data) return <Navigate to="/" replace />

  const nav = [
    { to: '/appointments', end: true, icon: CalendarDays, label: t('appointments.nav.calendar', 'Calendar') },
    { to: '/appointments/clients', end: false, icon: Users, label: vocab('clients') },
  ]

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    const term = search.trim()
    if (term.length >= 2) navigate(`/appointments/clients?search=${encodeURIComponent(term)}`)
  }

  return (
    <div data-appointments="" className="min-h-screen flex bg-a-canvas text-a-text">
      <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-a-side text-a-side-text" aria-label={t('appointments.shell.menu', 'Menu')}>
        <div className="px-5 py-5">
          <div className="text-base font-semibold leading-tight">{data?.name ?? 'HexaTech Appointments'}</div>
          <div className="text-xs text-a-side-text-2 mt-0.5 truncate">{data?.organization.name}</div>
        </div>
        <nav className="px-3 space-y-1">
          {nav.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-a-side-2 text-a-side-text' : 'text-a-side-text-2 hover:text-a-side-text'}`}>
              <Icon size={18} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-3 pb-4 pt-4 border-t border-a-side-2 space-y-1">
          <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-a-side-text-2 hover:text-a-side-text">
            <LayoutGrid size={16} aria-hidden /> {t('appointments.shell.full_admin', 'Full admin')}
          </Link>
          <label className="flex items-center gap-3 px-3 py-2 text-sm text-a-side-text-2">
            <span className="sr-only">{t('appointments.shell.language', 'Language')}</span>
            <select value={i18n.language?.slice(0, 2)} onChange={(e) => { void i18n.changeLanguage(e.target.value) }}
              className="w-full rounded-md bg-a-side-2 text-a-side-text text-sm px-2 py-1.5 border border-a-side-2">
              {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <div className="flex items-center justify-between gap-2 px-3 pt-2">
            <span className="text-sm truncate">{data?.staff.name}</span>
            <button onClick={() => { void logoutAndRedirect('/login') }}
              className="flex items-center gap-1.5 text-xs text-a-side-text-2 hover:text-a-side-text rounded-md px-1.5 py-1">
              <LogOut size={14} aria-hidden /> {t('appointments.shell.sign_out', 'Sign out')}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 bg-a-surface border-b border-a-border">
          <nav className="flex lg:hidden items-center gap-1" aria-label={t('appointments.shell.menu', 'Menu')}>
            {nav.map(({ to, end, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={end} aria-label={label}
                className={({ isActive }) => `rounded-lg p-2 ${isActive ? 'bg-a-surface-2 text-a-text' : 'text-a-text-2'}`}>
                <Icon size={18} aria-hidden />
              </NavLink>
            ))}
          </nav>
          <div className="hidden md:block min-w-0">
            <div className="text-sm font-semibold truncate">{data?.organization.name}</div>
            {data?.brand && <div className="text-xs text-a-text-2 truncate">{data.brand.name}</div>}
          </div>
          <form role="search" onSubmit={onSearch} className="flex-1 max-w-md ml-auto lg:ml-4">
            <label className="relative block">
              <span className="sr-only">{t('appointments.shell.search', 'Search clients')}</span>
              <Search size={15} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-a-text-2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('appointments.shell.search', 'Search clients')}
                className="w-full rounded-lg bg-a-surface-2 border border-a-border pl-9 pr-3 py-2 text-sm text-a-text placeholder:text-a-text-2" />
            </label>
          </form>
          <Link to="/appointments?new=1"
            className="inline-flex items-center gap-2 rounded-lg bg-a-accent text-a-accent-ink hover:bg-a-accent-deep px-3.5 py-2 text-sm font-semibold whitespace-nowrap">
            <Plus size={16} aria-hidden /> {t('appointments.shell.new_appointment', 'New appointment')}
          </Link>
        </header>

        {switchedOff && (
          <div className="p-6 max-w-xl space-y-3">
            <Notice tone="warning">{t('appointments.shell.switched_off', 'The appointments workspace has been switched off for your organisation. Your bookings are unchanged and remain in the full admin.')}</Notice>
            <Link to="/" className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
              {t('appointments.shell.open_full_admin', 'Open the full admin')}
            </Link>
          </div>
        )}

        {!switchedOff && isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}

        {!switchedOff && isError && !data && (
          <div className="p-6 max-w-xl space-y-3">
            <Notice tone="danger">{t('appointments.common.error', 'Something went wrong. Please try again.')}</Notice>
            <Button variant="secondary" onClick={refetch}>{t('appointments.common.retry', 'Try again')}</Button>
          </div>
        )}

        {!switchedOff && data && (
          <>
            {!data.venue.timezone_named && (
              <div className="px-4 pt-3">
                <Notice tone="warning">{t('appointments.shell.timezone_missing', 'The venue\'s time zone is not set, so "now" and "today" follow UTC. Set it in the full admin under Settings → General → Timezone (for example Europe/London).')}</Notice>
              </div>
            )}
            {!data.readiness.bookable && (
              <div className="px-4 pt-3">
                <Notice tone="info">{t('appointments.shell.not_bookable', 'Nothing can be booked yet: add a service, a team member who performs it, and their working hours in the full admin.')}</Notice>
              </div>
            )}
            <main className="flex-1 min-h-0">{children}</main>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: The app, and the three headings**

Create `frontend/src/appointments/calendar/CalendarPage.tsx` (replaced in Task 15):

```tsx
import { useTranslation } from 'react-i18next'

export function CalendarPage() {
  const { t } = useTranslation()
  return <h1 className="p-6 text-lg font-semibold">{t('appointments.nav.calendar', 'Calendar')}</h1>
}
```

Create `frontend/src/appointments/clients/ClientsPage.tsx` (replaced in Task 19):

```tsx
import { useVocab } from '../lib/vocab'

export function ClientsPage() {
  const vocab = useVocab()
  return <h1 className="p-6 text-lg font-semibold">{vocab('clients')}</h1>
}
```

Create `frontend/src/appointments/clients/ClientProfile.tsx` (replaced in Task 19):

```tsx
import { useVocab } from '../lib/vocab'

export function ClientProfile() {
  const vocab = useVocab()
  return <h1 className="p-6 text-lg font-semibold">{vocab('client')}</h1>
}
```

Create `frontend/src/appointments/AppointmentsApp.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerAppointmentsLocales } from './i18n'
import { AppointmentsProvider } from './AppointmentsProvider'
import { AppointmentsShell } from './AppointmentsShell'
import { CalendarPage } from './calendar/CalendarPage'
import { ClientsPage } from './clients/ClientsPage'
import { ClientProfile } from './clients/ClientProfile'

registerAppointmentsLocales()

/**
 * Everything under /appointments/* for a signed-in staff user. Whether the
 * organisation may use it is the server's answer (the bootstrap call is
 * behind `workspace:appointments`); the shell turns a refusal into a way
 * back to the full admin.
 */
export function AppointmentsApp() {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.user_type === 'member') return <Navigate to="/portal" replace />

  return (
    <AppointmentsProvider>
      <AppointmentsShell>
        <Routes>
          <Route index element={<CalendarPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientProfile />} />
          <Route path="*" element={<Navigate to="/appointments" replace />} />
        </Routes>
      </AppointmentsShell>
    </AppointmentsProvider>
  )
}
```

- [ ] **Step 7: Mount it (S9)**

In `frontend/src/App.tsx`:

1. Add `useLocation` to the `react-router-dom` import on line 2:

```tsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
```

2. Directly after the `PortalClaim` lazy import (`:30`):

```tsx
// Appointments workspace. One lazy chunk, its own shell; an organisation
// that has not opted in never downloads it (the server refuses its API).
const AppointmentsRoutes = lazy(() => import('./appointments/AppointmentsApp').then(m => ({ default: m.AppointmentsApp })))
```

3. In `AuthedFloatingAiChat`, directly after the `useSubscription()` line:

```tsx
  const { pathname } = useLocation()
  // The workspace is a focused product: the full admin's copilot stays out.
  if (pathname.startsWith('/appointments')) return null
```

4. Directly after the `<Route path="/portal/*" … />` line:

```tsx
          {/* Appointments workspace — same login, a second staff shell. */}
          <Route path="/appointments/*" element={<ChunkErrorBoundary><Suspense fallback={<PageLoader />}><AppointmentsRoutes /></Suspense></ChunkErrorBoundary>} />
```

In `frontend/src/stores/authStore.ts`, add to the `User` interface, after `industry_explicit?: boolean`:

```ts
  /**
   * Opt-in workspaces switched on for the user's organisation. Absent for
   * every organisation that has none. `landing` sends a staff user to the
   * workspace right after signing in (see appointments/lib/landing.ts).
   */
  workspaces?: { appointments?: { landing?: boolean } }
```

In `frontend/src/pages/Login.tsx`, add the import beside the other local imports:

```tsx
import { landingPath } from '../appointments/lib/landing'
```

replace line 423:

```tsx
        navigate(landingPath(body, redirectTo), { replace: true })
```

and line 464:

```tsx
      navigate(landingPath(data.user, '/'), { replace: true })
```

(`landingPath` returns `/portal` for a member and the old target for everyone without a landing workspace, so both lines behave as before for them.)

- [ ] **Step 8: Run the tests, the type check and the lint**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments 2>&1 | tail -n 12 && npx tsc -b && npx eslint src/appointments src/App.tsx src/pages/Login.tsx src/stores/authStore.ts
```
Expected: every appointments test passes (`landing` 4, shell 9, plus Task 13's); `tsc` and eslint silent.

- [ ] **Step 9: Prepare the test organisation, then see the shell in a browser**

The local test organisation is **16, "Lumière Salon"** (beauty). On 2026-09-30 it had five services and three team members (4 Marie, 5 Anouk, 6 Ilze), but no service assigned to anyone, no working hours, no client, no membership programme, and its time zone was `UTC`. Nothing can be booked there until that is put right — in the full admin, the way a customer would.

1. A staff login and a programme (local database only; never run these against anything else):

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && export MAIL_MAILER=log QUEUE_CONNECTION=sync && PHP=/c/wamp64/bin/php/php8.4.20/php.exe && $PHP artisan tinker --execute="\$u = App\Models\User::firstOrCreate(['email' => 'appointments-tester@example.test'], ['name' => 'Appointments Tester', 'password' => bcrypt('appointments-local-1'), 'user_type' => 'staff', 'organization_id' => 16]); App\Models\Staff::withoutGlobalScopes()->firstOrCreate(['user_id' => \$u->id], ['organization_id' => 16, 'role' => 'manager', 'is_active' => true]); echo 'user ' . \$u->id;" && $PHP artisan loyalty:provision-programme --org=16 --apply && $PHP artisan workspace:appointments 16 --on --landing
```
Expected: `user <id>`; a line saying the organisation got the beauty programme (or nothing, if it already has tiers); `org 16 (Lumière Salon): appointments workspace ON, landing on`.

2. The two servers. Terminal 1 (backend — the log mailer, and the dev origin allowed for this process only; never edit `.env`):

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && MAIL_MAILER=log QUEUE_CONNECTION=sync CORS_ALLOWED_ORIGINS=http://localhost:5180 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --host=127.0.0.1 --port=8010
```
Terminal 2 (frontend dev server pointed at it):

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && VITE_API_URL=http://127.0.0.1:8010/api npx vite --port 5180
```
Open `http://localhost:5180/login` — as `localhost`, not `127.0.0.1` (the SPA only uses `VITE_API_URL` on that hostname) — and sign in as `appointments-tester@example.test` / `appointments-local-1`.

3. The browser lands on `/appointments`. Expected now: the rail with Calendar and Clients; the top bar with the organisation, the search and New appointment; a notice that the time zone is not set; a notice that nothing can be booked yet; no floating AI button. Screenshot at 1440 wide into `.superpowers/sdd/2026-09-30-appointments-workspace/shots/task-14-shell-empty.png`.

4. Put the organisation right, in the full admin (the rail's "Full admin" link; the dashboard there is unchanged and the AI button is back):
   - **Masters** (`/service-masters`): for Marie and for Anouk, tick "Signature Cut & Finish" and two other services, and give each working hours 09:00–18:00 on every day. For Ilze, tick one service and give hours on weekdays only.
   - **Settings → General → Timezone**: `Europe/London`.

5. Back on `/appointments` (reload): both notices are gone. Screenshot `shots/task-14-shell.png`, and the full admin's dashboard as `shots/task-14-admin.png`.

6. The bounce: `… artisan workspace:appointments 16 --off`, reload `/appointments` → the browser is on `/`. Switch it back on (`--on --landing`) for the tasks that follow.

Leave both servers running for Tasks 15–21.

- [ ] **Step 10: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add frontend/src/appointments/AppointmentsProvider.tsx frontend/src/appointments/AppointmentsShell.tsx frontend/src/appointments/AppointmentsShell.test.tsx frontend/src/appointments/AppointmentsApp.tsx frontend/src/appointments/lib/vocab.ts frontend/src/appointments/lib/landing.ts frontend/src/appointments/lib/landing.test.ts frontend/src/appointments/calendar/CalendarPage.tsx frontend/src/appointments/clients/ClientsPage.tsx frontend/src/appointments/clients/ClientProfile.tsx frontend/src/App.tsx frontend/src/pages/Login.tsx frontend/src/stores/authStore.ts && git commit -q -F - <<'EOF'
Mount the appointments workspace at /appointments with its own shell

A lazy route beside the portal's, a provider that loads the bootstrap, and
a shell with Calendar and Clients, client search and New appointment. A
refusal from the server sends the user back to the full admin. Staff of a
landing organisation arrive here after signing in; everyone else lands
where they always did.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 15: The calendar — day and week grids, toolbar, mini month, day overview

**Files:**
- Create: `frontend/src/appointments/calendar/calendarState.ts`, `calendarState.test.ts`, `TimeGrid.tsx`, `AppointmentCard.tsx`, `Toolbar.tsx`, `MiniMonth.tsx`, `DayOverview.tsx`, `calendar.test.tsx`
- Replace: `frontend/src/appointments/calendar/CalendarPage.tsx`

**Interfaces:**
- Consumes (Task 13): `wallClock` (`addDays`, `weekOf`, `venueNow`, `formatDate`, `hhmm`, `timeOf`, `dateOf`, `monthGrid`, `monthOf`, `addMonths`, `minutesOf`), `layout` (`PX_PER_MIN`, `dayRange`, `placeAppointments`, `freeSlotStarts`, `offHours`, `type Placed`), `status` (`STATUSES`, `TONE_CLASS`, `STATUS_TONE`, `blocksSlot`, `dayOverview`), `prefs` (`type Prefs`, `type View`, `loadPrefs`, `savePrefs`), `appointmentsApi.calendar()`, `ui/StatusMark`, types. (Task 14): `useBoot()`, `useVocab()`.
- Produces:
  - `calendarState.ts`: `rangeFor(view: View, date: DateKey): { from: DateKey; to: DateKey }`; `shift(view: View, date: DateKey, dir: 1 | -1): DateKey`; `interface GridColumn { key: string; title: string; subtitle: string | null; initials: string | null; date: DateKey; master: CalendarMaster; isToday: boolean }`; `columnsFor(view: 'day' | 'week', date: DateKey, masters: CalendarMaster[], masterId: number | null, today: DateKey, locale: string): GridColumn[]`; `gridRange(columns: GridColumn[], appointments: AppointmentSummary[]): { startMin: number; endMin: number }`.
  - `TimeGrid` props: `{ columns: GridColumn[]; appointments: AppointmentSummary[]; now: { date: DateKey; minutes: number }; today: DateKey; selectedId: number | null; onSlot: (masterId: number, date: DateKey, minutes: number) => void; onOpen: (id: number) => void }`.
  - `CalendarPage` owns the panel state. In this task it keeps `selectedId` and a `pendingSlot` in plain state and renders no panel; Task 17 replaces that with the reducer and the panel. The two callbacks it passes down (`onSlot`, `onOpen`) keep their signatures.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/appointments/calendar/calendarState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { columnsFor, gridRange, rangeFor, shift } from './calendarState'
import type { AppointmentSummary, CalendarMaster } from '../lib/types'

const day = (windows: [string, string][]) => ({ windows: windows.map(([start, end]) => ({ start, end })), time_off: [] })
const emma: CalendarMaster = { id: 1, name: 'Emma', title: 'Hair Stylist', avatar: null, days: { '2026-10-06': day([['09:00', '17:00']]), '2026-10-07': day([['10:00', '18:00']]) } }
const james: CalendarMaster = { id: 2, name: 'James', title: null, avatar: null, days: { '2026-10-06': day([['08:00', '12:00']]) } }

const appt = (start: string, end: string, masterId = 1): AppointmentSummary => ({
  id: 1, reference: 'SVC-1', start, end, duration_minutes: 45, service: { id: 1, name: 'Cut' }, master: { id: masterId, name: 'x' },
  client: { id: null, name: 'Ada', is_member: false }, status: 'confirmed', payment: { state: 'not_paid_online' }, revision: 'r',
})

describe('rangeFor / shift', () => {
  it('a day is one date; week and list are Monday to Sunday', () => {
    expect(rangeFor('day', '2026-10-06')).toEqual({ from: '2026-10-06', to: '2026-10-06' })
    expect(rangeFor('week', '2026-10-06')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeFor('list', '2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
  })

  it('moves by a day or by a week', () => {
    expect(shift('day', '2026-10-31', 1)).toBe('2026-11-01')
    expect(shift('week', '2026-10-06', -1)).toBe('2026-09-29')
    expect(shift('list', '2026-12-28', 1)).toBe('2027-01-04')
  })
})

describe('columnsFor', () => {
  it('day view: one column per team member, or just the chosen one', () => {
    const all = columnsFor('day', '2026-10-06', [emma, james], null, '2026-10-06', 'en-GB')
    expect(all.map(c => [c.title, c.subtitle, c.date, c.isToday])).toEqual([
      ['Emma', 'Hair Stylist', '2026-10-06', true],
      ['James', null, '2026-10-06', true],
    ])
    expect(columnsFor('day', '2026-10-06', [emma, james], 2, '2026-10-06', 'en-GB').map(c => c.title)).toEqual(['James'])
    // A person's column is headed by their initials; a day column in the week view is not.
    expect(all.map(c => c.initials)).toEqual(['E', 'J'])
    expect(columnsFor('day', '2026-10-06', [{ ...emma, name: 'mara  ilves-kask' }], null, '2026-10-06', 'en-GB')[0].initials).toBe('MI')
  })

  it('week view: seven day columns for the chosen person, the first when none is chosen', () => {
    const week = columnsFor('week', '2026-10-07', [emma, james], null, '2026-10-06', 'en-GB')
    expect(week).toHaveLength(7)
    expect(week.every(c => c.master.id === 1)).toBe(true)
    expect(week.map(c => c.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
    expect(week.map(c => c.isToday)).toEqual([false, true, false, false, false, false, false])
    expect(new Set(week.map(c => c.key)).size).toBe(7)
    expect(week.every(c => c.initials === null)).toBe(true)
    expect(columnsFor('week', '2026-10-07', [emma, james], 2, '2026-10-06', 'en-GB')[0].master.id).toBe(2)
  })

  it('no team, no columns', () => {
    expect(columnsFor('day', '2026-10-06', [], null, '2026-10-06', 'en-GB')).toEqual([])
    expect(columnsFor('week', '2026-10-06', [], null, '2026-10-06', 'en-GB')).toEqual([])
  })
})

describe('gridRange', () => {
  it('covers every column\'s hours and every appointment shown', () => {
    const columns = columnsFor('day', '2026-10-06', [emma, james], null, '2026-10-06', 'en-GB')
    expect(gridRange(columns, [])).toEqual({ startMin: 8 * 60, endMin: 19 * 60 })
    expect(gridRange(columns, [appt('2026-10-06T06:30', '2026-10-06T07:15'), appt('2026-10-06T20:00', '2026-10-06T21:30', 2)]))
      .toEqual({ startMin: 6 * 60, endMin: 22 * 60 })
  })
})
```

Create `frontend/src/appointments/calendar/calendar.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimeGrid } from './TimeGrid'
import { DayOverview } from './DayOverview'
import { MiniMonth } from './MiniMonth'
import { columnsFor } from './calendarState'
import type { AppointmentSummary, CalendarMaster, Status } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? (typeof fallback === 'object' ? fallback : {}) ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const emma: CalendarMaster = {
  id: 1, name: 'Emma', title: 'Hair Stylist', avatar: null,
  days: { '2026-10-06': { windows: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '17:00' }], time_off: [{ start: '13:00', end: '14:00', reason: 'Lunch' }] } },
}

const appt = (id: number, start: string, end: string, status: Status = 'confirmed', name = 'Sophie Williams'): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end, duration_minutes: 45, service: { id: 1, name: 'Haircut & Styling' }, master: { id: 1, name: 'Emma' },
  client: { id: 5, name, is_member: true }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})

function grid(appointments: AppointmentSummary[], today = '2026-10-06') {
  const columns = columnsFor('day', '2026-10-06', [emma], null, today, 'en-GB')
  return renderToStaticMarkup(
    <TimeGrid columns={columns} appointments={appointments} now={{ date: today, minutes: 10 * 60 + 20 }} today={today}
      selectedId={null} onSlot={() => {}} onOpen={() => {}} />,
  )
}

describe('TimeGrid', () => {
  it('heads each column with the person and draws the appointment as time, client, service and a worded status', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html).toContain('Emma')
    expect(html).toContain('Hair Stylist')
    expect(html).toContain('09:00 – 10:00')
    expect(html).toContain('Sophie Williams')
    expect(html).toContain('Haircut &amp; Styling')
    expect(html).toContain('appointments.status.confirmed')
  })

  it('offers every free half hour as a real, named button and none where someone is booked', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html).toContain('aria-label="Book Emma at 10:00"')
    expect(html).toContain('aria-label="Book Emma at 16:30"')
    expect(html).not.toContain('aria-label="Book Emma at 09:00"')
    expect(html).not.toContain('aria-label="Book Emma at 09:30"')
    expect(html).not.toContain('aria-label="Book Emma at 13:00"') // time off
    expect(html).not.toContain('aria-label="Book Emma at 17:00"') // closed
  })

  it('labels time off as blocked, with its reason', () => {
    expect(grid([])).toContain('Blocked · Lunch')
  })

  it('a cancelled or no-show appointment does not block its slot', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00', 'no_show')])
    expect(html).toContain('aria-label="Book Emma at 09:00"')
    expect(html).toContain('appointments.status.no_show')
  })

  it('offers no slot on a day that has passed', () => {
    const html = grid([], '2026-10-07')
    expect(html).not.toContain('aria-label="Book Emma at')
  })

  it('draws the current-time line only on the venue\'s today', () => {
    expect(grid([])).toContain('data-now-line')
    expect(grid([], '2026-10-05')).not.toContain('data-now-line')
  })

  it('says so when there is no team to show', () => {
    const html = renderToStaticMarkup(
      <TimeGrid columns={[]} appointments={[]} now={{ date: '2026-10-06', minutes: 600 }} today="2026-10-06" selectedId={null} onSlot={() => {}} onOpen={() => {}} />,
    )
    expect(html).toContain('No team members to show')
  })
})

describe('DayOverview', () => {
  it('counts the day from the appointments it is given, with no comparison to other days', () => {
    const html = renderToStaticMarkup(
      <DayOverview date="2026-10-06" now={{ date: '2026-10-06', minutes: 10 * 60 + 20 }} appointments={[
        appt(1, '2026-10-06T09:00', '2026-10-06T09:45', 'completed'),
        appt(2, '2026-10-06T09:30', '2026-10-06T10:15', 'confirmed'), // 50 minutes late, not started
        appt(3, '2026-10-06T10:00', '2026-10-06T10:45', 'in_progress'),
        appt(4, '2026-10-06T15:00', '2026-10-06T15:45', 'confirmed'),
        appt(5, '2026-10-06T16:00', '2026-10-06T16:45', 'pending'),
        appt(6, '2026-10-07T09:00', '2026-10-07T09:45', 'confirmed'), // another day
      ]} />,
    )
    expect(html).toContain('data-count="total">5<')
    expect(html).toContain('data-count="upcoming">1<')
    expect(html).toContain('data-count="in_progress">1<')
    expect(html).toContain('data-count="completed">1<')
    expect(html).toContain('data-count="attention">2<')
    expect(html).not.toMatch(/%|vs\.|last week/)
  })
})

describe('MiniMonth', () => {
  it('marks the selected day and today, and every day is a button', () => {
    const html = renderToStaticMarkup(<MiniMonth date="2026-10-06" today="2026-10-08" locale="en-GB" onPick={() => {}} />)
    expect((html.match(/<button/g) ?? []).length).toBe(42 + 2) // 42 days, previous and next month
    expect(html).toMatch(/aria-pressed="true"[^>]*>6</)
    expect(html).toMatch(/aria-current="date"[^>]*>8</)
    expect(html).toContain('October 2026')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments/calendar 2>&1 | tail -n 12
```
Expected: FAIL — cannot resolve `./calendarState`, `./TimeGrid`, `./DayOverview`, `./MiniMonth`.

- [ ] **Step 3: Calendar state (pure)**

Create `frontend/src/appointments/calendar/calendarState.ts`:

```ts
import type { AppointmentSummary, CalendarMaster, DateKey, MasterDay } from '../lib/types'
import type { View } from '../lib/prefs'
import { addDays, formatDate, weekOf } from '../lib/wallClock'
import { dayRange } from '../lib/layout'

export function rangeFor(view: View, date: DateKey): { from: DateKey; to: DateKey } {
  if (view === 'day') return { from: date, to: date }
  const week = weekOf(date)
  return { from: week[0], to: week[6] }
}

export function shift(view: View, date: DateKey, dir: 1 | -1): DateKey {
  return addDays(date, dir * (view === 'day' ? 1 : 7))
}

/** Up to two initials of a name: "Mara Ilves-Kask" → "MI". */
function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('')
}

/** One column of the time grid: a person on a date. */
export interface GridColumn {
  key: string
  title: string
  subtitle: string | null
  /** The person's initials, for a column that stands for a person; null for a day column. */
  initials: string | null
  date: DateKey
  master: CalendarMaster
  isToday: boolean
}

/**
 * Day view: a column per team member (or the one chosen). Week view: the
 * chosen person — the first when none is chosen — across Monday to Sunday.
 */
export function columnsFor(view: 'day' | 'week', date: DateKey, masters: CalendarMaster[], masterId: number | null, today: DateKey, locale: string): GridColumn[] {
  if (view === 'day') {
    return masters
      .filter(m => masterId === null || m.id === masterId)
      .map(m => ({ key: `m${m.id}`, title: m.name, subtitle: m.title, initials: initialsOf(m.name), date, master: m, isToday: date === today }))
  }

  const master = masters.find(m => m.id === masterId) ?? masters[0]
  if (!master) return []
  return weekOf(date).map(d => ({
    key: `${master.id}-${d}`,
    title: formatDate(d, locale, { weekday: 'short', day: 'numeric' }),
    subtitle: formatDate(d, locale, { month: 'short' }),
    initials: null,
    date: d,
    master,
    isToday: d === today,
  }))
}

/** The hours the grid must show: every column's working hours and every appointment, on a whole-hour frame. */
export function gridRange(columns: GridColumn[], appointments: AppointmentSummary[]): { startMin: number; endMin: number } {
  let startMin = Infinity
  let endMin = -Infinity
  const dates = [...new Set(columns.map(c => c.date))]
  for (const date of dates) {
    const days = columns.filter(c => c.date === date).map(c => c.master.days[date]).filter((d): d is MasterDay => Boolean(d))
    const ids = new Set(columns.filter(c => c.date === date).map(c => c.master.id))
    const range = dayRange(days, appointments.filter(a => a.master !== null && ids.has(a.master.id)), date)
    startMin = Math.min(startMin, range.startMin)
    endMin = Math.max(endMin, range.endMin)
  }
  return Number.isFinite(startMin) ? { startMin, endMin } : dayRange([], [], '1970-01-01')
}
```

- [ ] **Step 4: The card**

Create `frontend/src/appointments/calendar/AppointmentCard.tsx`:

```tsx
import type { AppointmentSummary } from '../lib/types'
import type { Placed } from '../lib/layout'
import { STATUS_TONE, TONE_CLASS } from '../lib/status'
import { timeOf } from '../lib/wallClock'
import { StatusMark } from '../ui/StatusMark'

/**
 * One appointment on the grid: time, client, service, and the status as an
 * icon plus a word (never colour alone). No notes, no contact details.
 */
export function AppointmentCard({ placed, selected, onOpen }: { placed: Placed<AppointmentSummary>; selected: boolean; onOpen: (id: number) => void }) {
  const { item, top, height, lane, lanes } = placed
  const tone = TONE_CLASS[STATUS_TONE[item.status]]
  const muted = item.status === 'cancelled' || item.status === 'no_show'
  const compact = height < 44

  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      aria-pressed={selected}
      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
      className={`absolute z-10 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left ${tone.bar} ${tone.tint} ${selected ? 'ring-2 ring-a-accent' : ''} ${muted ? 'opacity-70' : ''}`}
    >
      <div className={`flex items-center justify-between gap-2 text-xs font-semibold ${tone.text}`}>
        <span>{timeOf(item.start)} – {timeOf(item.end)}</span>
        <StatusMark status={item.status} compact />
      </div>
      <div className={`text-sm font-semibold text-a-text truncate ${item.status === 'cancelled' ? 'line-through' : ''}`}>{item.client.name}</div>
      {!compact && item.service && <div className="text-xs text-a-text-2 truncate">{item.service.name}</div>}
    </button>
  )
}
```

- [ ] **Step 5: The time grid**

Create `frontend/src/appointments/calendar/TimeGrid.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { AppointmentSummary, DateKey } from '../lib/types'
import { PX_PER_MIN, freeSlotStarts, offHours, placeAppointments } from '../lib/layout'
import { blocksSlot } from '../lib/status'
import { dateOf, hhmm, minutesOf } from '../lib/wallClock'
import { AppointmentCard } from './AppointmentCard'
import { gridRange, type GridColumn } from './calendarState'

interface Props {
  columns: GridColumn[]
  appointments: AppointmentSummary[]
  now: { date: DateKey; minutes: number }
  today: DateKey
  selectedId: number | null
  onSlot: (masterId: number, date: DateKey, minutes: number) => void
  onOpen: (id: number) => void
}

const SLOT_STEP = 30

/**
 * Time down the left, a column per person (day) or per day (week). White is
 * working time, tinted is outside hours, hatched is time off. Free half
 * hours are real buttons with a name ("Book Emma at 10:30"), so booking
 * from a slot needs neither hover nor drag. Availability shown here is a
 * convenience: the server decides at save.
 */
export function TimeGrid({ columns, appointments, now, today, selectedId, onSlot, onOpen }: Props) {
  const { t } = useTranslation()

  if (columns.length === 0) {
    return <p className="p-8 text-sm text-a-text-2">{t('appointments.calendar.no_team', 'No team members to show. Add team members and their working hours in the full admin.')}</p>
  }

  const { startMin, endMin } = gridRange(columns, appointments)
  const height = (endMin - startMin) * PX_PER_MIN
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60)

  return (
    <div className="min-w-max">
      <div className="sticky top-0 z-20 flex bg-a-surface border-b border-a-border">
        <div className="w-14 shrink-0" />
        {columns.map(col => (
          <div key={col.key} className={`flex flex-1 min-w-[168px] items-center gap-2 border-l border-a-border px-3 py-2 ${col.isToday ? 'bg-a-accent/10' : ''}`}>
            {col.initials && (
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-a-surface-2 text-xs font-semibold text-a-text-2">{col.initials}</span>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-a-text truncate">{col.title}</div>
              {col.subtitle && <div className="text-xs text-a-text-2 truncate">{col.subtitle}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex">
        <div className="relative w-14 shrink-0" style={{ height }} aria-hidden>
          {hours.map(h => (
            <div key={h} className="absolute right-2 -translate-y-1/2 text-xs text-a-text-2" style={{ top: (h - startMin) * PX_PER_MIN }}>{h === startMin ? '' : hhmm(h)}</div>
          ))}
        </div>

        {columns.map(col => {
          const day = col.master.days[col.date]
          const own = appointments.filter(a => a.master?.id === col.master.id && dateOf(a.start) === col.date)
          const free = col.date >= today ? freeSlotStarts(day, own.filter(a => blocksSlot(a.status)), col.date, SLOT_STEP) : []
          const showNow = col.date === now.date && now.minutes >= startMin && now.minutes <= endMin

          return (
            <div key={col.key} className="relative flex-1 min-w-[168px] border-l border-a-border bg-a-surface" style={{ height }}>
              {offHours(day, startMin, endMin).map(([from, to]) => (
                <div key={`off-${from}`} className="absolute inset-x-0 bg-a-surface-2" style={{ top: (from - startMin) * PX_PER_MIN, height: (to - from) * PX_PER_MIN }} />
              ))}

              {(day?.time_off ?? []).map((off, i) => {
                const from = off.start ? minutesOf(off.start) : startMin
                const to = off.end ? minutesOf(off.end) : endMin
                return (
                  <div key={`timeoff-${i}`} className="a-hatch absolute inset-x-0 px-2 py-1 text-xs font-medium text-a-text-2"
                    style={{ top: (Math.max(from, startMin) - startMin) * PX_PER_MIN, height: (Math.min(to, endMin) - Math.max(from, startMin)) * PX_PER_MIN }}>
                    {t('appointments.calendar.blocked', 'Blocked')}{off.reason ? ` · ${off.reason}` : ''}
                  </div>
                )
              })}

              {hours.map(h => (
                <div key={h} className="absolute inset-x-0 border-t border-a-border" style={{ top: (h - startMin) * PX_PER_MIN }} aria-hidden />
              ))}

              {free.map(m => (
                <button key={m} type="button" onClick={() => onSlot(col.master.id, col.date, m)}
                  aria-label={t('appointments.calendar.book_at', 'Book {{name}} at {{time}}', { name: col.master.name, time: hhmm(m) })}
                  className="group absolute inset-x-0 rounded text-left text-xs text-a-accent-deep hover:bg-a-accent/10 focus-visible:bg-a-accent/10"
                  style={{ top: (m - startMin) * PX_PER_MIN, height: SLOT_STEP * PX_PER_MIN }}>
                  <span className="px-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">+ {hhmm(m)}</span>
                </button>
              ))}

              {placeAppointments(own, col.date, startMin).map(placed => (
                <AppointmentCard key={placed.item.id} placed={placed} selected={placed.item.id === selectedId} onOpen={onOpen} />
              ))}

              {showNow && (
                <div data-now-line="" className="absolute inset-x-0 z-10 border-t-2 border-a-danger pointer-events-none" style={{ top: (now.minutes - startMin) * PX_PER_MIN }} aria-hidden />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Toolbar, mini month, day overview**

Create `frontend/src/appointments/calendar/Toolbar.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import type { CalendarMaster, DateKey } from '../lib/types'
import type { View } from '../lib/prefs'
import { formatDate, hhmm } from '../lib/wallClock'
import { useVocab } from '../lib/vocab'
import { rangeFor } from './calendarState'

interface Props {
  view: View
  viewLocked: boolean // narrow screens show the list only
  date: DateKey
  locale: string
  masters: CalendarMaster[]
  masterId: number | null
  showCancelled: boolean
  updatedAt: number | null // minutes of the venue's day at the last successful load
  refreshing: boolean
  onView: (view: View) => void
  onDate: (date: DateKey) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onMaster: (id: number | null) => void
  onShowCancelled: (on: boolean) => void
  onRefresh: () => void
}

const field = 'rounded-lg border border-a-border bg-a-surface px-3 py-1.5 text-sm text-a-text'

export function Toolbar(p: Props) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const range = rangeFor(p.view, p.date)
  const label = p.view === 'day'
    ? formatDate(p.date, p.locale)
    : `${formatDate(range.from, p.locale, { day: 'numeric', month: 'short' })} – ${formatDate(range.to, p.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const views: [View, string][] = [
    ['day', t('appointments.calendar.view_day', 'Day')],
    ['week', t('appointments.calendar.view_week', 'Week')],
    ['list', t('appointments.calendar.view_list', 'List')],
  ]

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-a-border bg-a-surface">
      <button type="button" onClick={p.onPrev} className={`${field} px-2`} aria-label={t('appointments.calendar.previous', 'Previous')}><ChevronLeft size={16} aria-hidden /></button>
      <button type="button" onClick={p.onNext} className={`${field} px-2`} aria-label={t('appointments.calendar.next', 'Next')}><ChevronRight size={16} aria-hidden /></button>
      <label className="flex items-center gap-2">
        <span className="text-sm font-semibold text-a-text min-w-[11rem]">{label}</span>
        <span className="sr-only">{t('appointments.calendar.go_to_date', 'Go to date')}</span>
        <input type="date" value={p.date} onChange={(e) => { if (e.target.value) p.onDate(e.target.value) }} className={field} />
      </label>
      <button type="button" onClick={p.onToday} className={field}>{t('appointments.calendar.today', 'Today')}</button>

      {!p.viewLocked && (
        <div className="inline-flex rounded-lg border border-a-border overflow-hidden" role="group" aria-label={t('appointments.calendar.view', 'View')}>
          {views.map(([v, text]) => (
            <button key={v} type="button" onClick={() => p.onView(v)} aria-pressed={p.view === v}
              className={`px-3 py-1.5 text-sm font-medium ${p.view === v ? 'bg-a-accent text-a-accent-ink' : 'bg-a-surface text-a-text-2 hover:text-a-text'}`}>{text}</button>
          ))}
        </div>
      )}

      <label>
        <span className="sr-only">{vocab('team_member')}</span>
        <select value={p.masterId ?? ''} onChange={(e) => p.onMaster(e.target.value ? Number(e.target.value) : null)} className={field}>
          <option value="">{t('appointments.calendar.all_team', 'Whole team')}</option>
          {p.masters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-a-text-2">
        <input type="checkbox" checked={p.showCancelled} onChange={(e) => p.onShowCancelled(e.target.checked)} />
        {t('appointments.calendar.show_cancelled', 'Show cancelled')}
      </label>

      <div className="ml-auto flex items-center gap-2 text-xs text-a-text-2">
        {p.updatedAt !== null && <span>{t('appointments.calendar.updated', 'Updated {{time}}', { time: hhmm(p.updatedAt) })}</span>}
        <button type="button" onClick={p.onRefresh} className={`${field} px-2`} aria-label={t('appointments.calendar.refresh', 'Refresh')} aria-busy={p.refreshing || undefined}>
          <RefreshCw size={14} aria-hidden className={p.refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}
```

Create `frontend/src/appointments/calendar/MiniMonth.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DateKey } from '../lib/types'
import { addMonths, formatDate, monthGrid, monthOf } from '../lib/wallClock'

/** A month to jump around in. Every day is a button; the chosen day and the venue's today are marked in the markup, not by colour alone. */
export function MiniMonth({ date, today, locale, onPick }: { date: DateKey; today: DateKey; locale: string; onPick: (date: DateKey) => void }) {
  const { t } = useTranslation()
  const [month, setMonth] = useState(monthOf(date))
  const days = monthGrid(month)

  return (
    <section className="p-4" aria-label={t('appointments.calendar.month', 'Month')}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-a-text">{formatDate(`${month}-01`, locale, { month: 'long', year: 'numeric' })}</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => setMonth(addMonths(month, -1))} className="rounded p-1 text-a-text-2 hover:text-a-text" aria-label={t('appointments.calendar.previous_month', 'Previous month')}><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" onClick={() => setMonth(addMonths(month, 1))} className="rounded p-1 text-a-text-2 hover:text-a-text" aria-label={t('appointments.calendar.next_month', 'Next month')}><ChevronRight size={16} aria-hidden /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-a-text-2" aria-hidden>
        {days.slice(0, 7).map(d => <div key={d}>{formatDate(d, locale, { weekday: 'narrow' })}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 mt-1">
        {days.map(d => {
          const selected = d === date
          const isToday = d === today
          return (
            <button key={d} type="button" onClick={() => onPick(d)}
              aria-pressed={selected} aria-current={isToday ? 'date' : undefined}
              aria-label={formatDate(d, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              className={`mx-auto h-8 w-8 rounded-full text-sm ${selected ? 'bg-a-accent text-a-accent-ink font-semibold' : isToday ? 'border border-a-accent text-a-accent-deep font-semibold' : monthOf(d) === month ? 'text-a-text hover:bg-a-surface-2' : 'text-a-text-2 hover:bg-a-surface-2'}`}>{Number(d.slice(8))}</button>
          )
        })}
      </div>
    </section>
  )
}
```

Create `frontend/src/appointments/calendar/DayOverview.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { AppointmentSummary, DateKey } from '../lib/types'
import { STATUSES, dayOverview } from '../lib/status'
import { StatusMark } from '../ui/StatusMark'

/**
 * Counts for the chosen day, from the appointments already on screen — no
 * second source of numbers, and no comparison with another period.
 * "Needs attention" is not a status: it is an appointment still awaiting
 * confirmation, or confirmed and more than 15 minutes past its start
 * without having been started.
 */
export function DayOverview({ date, now, appointments }: { date: DateKey; now: { date: DateKey; minutes: number }; appointments: AppointmentSummary[] }) {
  const { t } = useTranslation()
  const o = dayOverview(appointments, date, now)
  const rows: [keyof typeof o, string][] = [
    ['total', t('appointments.overview.total', 'Appointments')],
    ['upcoming', t('appointments.overview.upcoming', 'Upcoming')],
    ['in_progress', t('appointments.overview.in_progress', 'In progress')],
    ['completed', t('appointments.overview.completed', 'Completed')],
    ['attention', t('appointments.overview.attention', 'Needs attention')],
  ]

  return (
    <section className="p-4 border-t border-a-border">
      <h2 className="text-sm font-semibold text-a-text mb-2">{t('appointments.overview.title', 'Day overview')}</h2>
      <dl className="space-y-1.5">
        {rows.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <dt className="text-a-text-2">{label}</dt>
            <dd className="font-semibold text-a-text" data-count={key}>{o[key]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-a-text-2">{t('appointments.overview.attention_hint', 'Needs attention: awaiting confirmation, or confirmed and more than 15 minutes late without being started.')}</p>

      <h2 className="text-sm font-semibold text-a-text mt-5 mb-2">{t('appointments.overview.legend', 'Statuses')}</h2>
      <ul className="space-y-1.5">
        {STATUSES.map(s => <li key={s}><StatusMark status={s} /></li>)}
      </ul>
    </section>
  )
}
```

- [ ] **Step 7: The page**

Replace `frontend/src/appointments/calendar/CalendarPage.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import { loadPrefs, savePrefs, type Prefs, type View } from '../lib/prefs'
import type { DateKey } from '../lib/types'
import { venueNow } from '../lib/wallClock'
import { Notice } from '../ui/Notice'
import { DayOverview } from './DayOverview'
import { MiniMonth } from './MiniMonth'
import { TimeGrid } from './TimeGrid'
import { Toolbar } from './Toolbar'
import { columnsFor, rangeFor, shift } from './calendarState'

const NARROW = '(max-width: 1023px)'

/** True below 1024 px, where a multi-column grid would be crushed and the list is shown instead. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches)
  useEffect(() => {
    const media = window.matchMedia(NARROW)
    const onChange = () => setNarrow(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export function CalendarPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const zone = boot.venue.timezone
  const locale = i18n.language || 'en'

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [now, setNow] = useState(() => venueNow(zone))
  const [date, setDate] = useState<DateKey>(() => venueNow(zone).date)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [, setPendingSlot] = useState<{ masterId: number; date: DateKey; minutes: number } | null>(null)

  useEffect(() => { savePrefs(prefs) }, [prefs])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(venueNow(zone)), 30_000)
    return () => window.clearInterval(timer)
  }, [zone])

  const narrow = useNarrow()
  const view: View = narrow ? 'list' : prefs.view
  const range = rangeFor(view, date)
  const weekMasterId = view === 'week' ? prefs.masterId : null

  const query = useQuery({
    queryKey: ['appointments', 'calendar', range.from, range.to, prefs.showCancelled, weekMasterId],
    queryFn: () => appointmentsApi.calendar(range.from, range.to, { includeCancelled: prefs.showCancelled, masterId: weekMasterId }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  })

  const masters = query.data?.masters ?? []
  const appointments = useMemo(() => query.data?.appointments ?? [], [query.data])
  // A filter hides cards; it never makes a slot look free (slots come from the person's own column).
  const shown = prefs.masterId === null ? appointments : appointments.filter(a => a.master?.id === prefs.masterId)
  const updatedAt = query.dataUpdatedAt ? venueNow(zone, new Date(query.dataUpdatedAt)).minutes : null

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <section className="flex-1 min-w-0 flex flex-col">
        <Toolbar
          view={view} viewLocked={narrow} date={date} locale={locale}
          masters={masters} masterId={prefs.masterId} showCancelled={prefs.showCancelled}
          updatedAt={updatedAt} refreshing={query.isFetching}
          onView={(v) => setPrefs({ ...prefs, view: v })}
          onDate={setDate}
          onPrev={() => setDate(shift(view, date, -1))}
          onNext={() => setDate(shift(view, date, 1))}
          onToday={() => setDate(now.date)}
          onMaster={(id) => setPrefs({ ...prefs, masterId: id })}
          onShowCancelled={(on) => setPrefs({ ...prefs, showCancelled: on })}
          onRefresh={() => { void query.refetch() }}
        />

        {query.isError && (
          <div className="px-4 pt-3">
            <Notice tone="danger">{t('appointments.calendar.load_failed', 'The calendar could not be refreshed. What you see may be out of date.')}</Notice>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          {query.isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
          {!query.isLoading && view !== 'list' && (
            <TimeGrid
              columns={columnsFor(view, date, masters, prefs.masterId, now.date, locale)}
              appointments={shown} now={now} today={now.date} selectedId={selectedId}
              onSlot={(masterId, slotDate, minutes) => setPendingSlot({ masterId, date: slotDate, minutes })}
              onOpen={setSelectedId}
            />
          )}
        </div>
      </section>

      <aside className="hidden xl:block w-72 shrink-0 border-l border-a-border bg-a-surface overflow-y-auto">
        <MiniMonth key={date.slice(0, 7)} date={date} today={now.date} locale={locale} onPick={setDate} />
        <DayOverview date={date} now={now} appointments={appointments} />
      </aside>
    </div>
  )
}
```

- [ ] **Step 8: Run the tests, the type check and the lint**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments 2>&1 | tail -n 12 && npx tsc -b && npx eslint src/appointments
```
Expected: `calendarState` 6 and `calendar` 9 pass with the rest; `tsc` and eslint silent.

- [ ] **Step 9: Look at it (servers from Task 14 Step 9)**

Give organisation 16 something to show: in the full admin at `http://localhost:5180/service-bookings`, use its New booking form to create two or three bookings for today and tomorrow (that form requires an email address — `someone@example.test` will do). Then open `/appointments`. Check by eye at 1440: a column per team member; white working hours, tinted outside them; cards at the right hours with a worded status; the red line at the venue's current time; the mini month and the day overview on the right; Day/Week toggles; the team filter; "Show cancelled". Tab through the grid: free half hours take focus and show "+ HH:MM". Screenshot to `shots/task-15-day.png` and `shots/task-15-week.png`.

- [ ] **Step 10: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add frontend/src/appointments/calendar && git commit -q -F - <<'EOF'
Draw the appointments calendar: team columns, week view, month and overview

Cards sit at the venue's stored hours whatever zone the browser is in.
Working hours, time off and free half hours come from the scheduler's own
windows; every free half hour is a named button. The day overview counts
only what is on screen.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 16: The list view

The keyboard and screen-reader alternative to the grid, and the only view below 1024 px.

**Files:**
- Create: `frontend/src/appointments/calendar/ListView.tsx`, `listView.test.tsx`
- Modify: `frontend/src/appointments/calendar/CalendarPage.tsx` (render it)

**Interfaces:**
- Consumes: `formatDate`, `timeOf`, `dateOf` (Task 13); `StatusMark`; `useVocab()`.
- Produces: `ListView` props `{ from: DateKey; to: DateKey; appointments: AppointmentSummary[]; locale: string; selectedId: number | null; onOpen: (id: number) => void }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/appointments/calendar/listView.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListView } from './ListView'
import { AppointmentsContext } from '../AppointmentsProvider'
import type { AppointmentSummary, Status } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key), i18n: { language: 'en' } }),
}))

const appt = (id: number, start: string, status: Status, name: string): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end: start.replace(':00', ':45'), duration_minutes: 45,
  service: { id: 1, name: 'Manicure' }, master: { id: 3, name: 'Olivia' },
  client: { id: null, name, is_member: false }, status, payment: { state: 'card_held' }, revision: 'r',
})

function render(appointments: AppointmentSummary[]) {
  return renderToStaticMarkup(
    <AppointmentsContext.Provider value={{ data: undefined, isLoading: false, isError: false, error: null, refetch: () => {} }}>
      <ListView from="2026-10-05" to="2026-10-11" appointments={appointments} locale="en-GB" selectedId={2} onOpen={() => {}} />
    </AppointmentsContext.Provider>,
  )
}

describe('ListView', () => {
  it('is a table with a heading per day and a row per appointment, in time order', () => {
    const html = render([
      appt(2, '2026-10-07T11:00', 'confirmed', 'Emily Johnson'),
      appt(1, '2026-10-06T09:00', 'completed', 'Ava Martinez'),
      appt(3, '2026-10-07T09:00', 'cancelled', 'Chloe Anderson'),
    ])
    expect(html).toContain('<table')
    expect(html.indexOf('Ava Martinez')).toBeLessThan(html.indexOf('Chloe Anderson'))
    expect(html.indexOf('Chloe Anderson')).toBeLessThan(html.indexOf('Emily Johnson'))
    expect((html.match(/scope="colgroup"/g) ?? []).length).toBe(2) // two days have appointments
    expect(html).toContain('09:00 – 09:45')
    expect(html).toContain('Manicure')
    expect(html).toContain('Olivia')
  })

  it('names the status and the payment in words on every row', () => {
    const html = render([appt(1, '2026-10-06T09:00', 'no_show', 'Ava Martinez')])
    expect(html).toContain('appointments.status.no_show')
    expect(html).toContain('appointments.payment.card_held')
  })

  it('opens a row with a button and marks the open one', () => {
    const html = render([appt(1, '2026-10-06T09:00', 'confirmed', 'Ava Martinez'), appt(2, '2026-10-06T10:00', 'confirmed', 'Emily Johnson')])
    expect((html.match(/<button/g) ?? []).length).toBe(2)
    expect(html).toMatch(/aria-current="true"[^>]*>[\s\S]*?Emily Johnson/)
  })

  it('says so when the range is empty', () => {
    expect(render([])).toContain('No appointments in this period.')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments/calendar/listView.test.tsx 2>&1 | tail -n 8
```
Expected: FAIL — cannot resolve `./ListView`.

- [ ] **Step 3: Implement**

Create `frontend/src/appointments/calendar/ListView.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { AppointmentSummary, DateKey } from '../lib/types'
import { dateOf, formatDate, timeOf } from '../lib/wallClock'
import { useVocab } from '../lib/vocab'
import { StatusMark } from '../ui/StatusMark'

interface Props {
  from: DateKey
  to: DateKey
  appointments: AppointmentSummary[]
  locale: string
  selectedId: number | null
  onOpen: (id: number) => void
}

/**
 * The period as a plain table — every appointment reachable by Tab, every
 * status and payment state in words. This is the alternative to the grid
 * for keyboard and screen-reader use, and the only view on a narrow screen.
 */
export function ListView({ from, to, appointments, locale, selectedId, onOpen }: Props) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const rows = appointments
    .filter(a => dateOf(a.start) >= from && dateOf(a.start) <= to)
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)
  const days = [...new Set(rows.map(a => dateOf(a.start)))]

  if (rows.length === 0) {
    return <p className="p-8 text-sm text-a-text-2">{t('appointments.list.empty', 'No appointments in this period.')}</p>
  }

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{t('appointments.list.caption', 'Appointments')}</caption>
      <thead className="sticky top-0 bg-a-surface text-left text-xs text-a-text-2">
        <tr className="border-b border-a-border">
          <th scope="col" className="px-4 py-2 font-medium">{t('appointments.list.time', 'Time')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{vocab('client')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{vocab('service')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{vocab('team_member')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{t('appointments.list.status', 'Status')}</th>
          <th scope="col" className="px-4 py-2 font-medium">{t('appointments.list.payment', 'Payment')}</th>
        </tr>
      </thead>
      {days.map(day => (
        <tbody key={day}>
          <tr className="bg-a-surface-2">
            <th scope="colgroup" colSpan={6} className="px-4 py-1.5 text-left text-xs font-semibold text-a-text">{formatDate(day, locale)}</th>
          </tr>
          {rows.filter(a => dateOf(a.start) === day).map(a => (
            <tr key={a.id} className={`border-b border-a-border bg-a-surface ${a.id === selectedId ? 'outline outline-2 -outline-offset-2 outline-a-accent' : ''}`}>
              <td className="px-4 py-2 whitespace-nowrap">
                <button type="button" onClick={() => onOpen(a.id)} aria-current={a.id === selectedId ? 'true' : undefined}
                  className="font-semibold text-a-accent-deep underline-offset-2 hover:underline">
                  {timeOf(a.start)} – {timeOf(a.end)}
                  <span className="sr-only"> {a.client.name}</span>
                </button>
              </td>
              <td className={`px-4 py-2 font-medium text-a-text ${a.status === 'cancelled' ? 'line-through' : ''}`}>{a.client.name}</td>
              <td className="px-4 py-2 text-a-text-2">{a.service?.name ?? '—'}</td>
              <td className="px-4 py-2 text-a-text-2">{a.master?.name ?? '—'}</td>
              <td className="px-4 py-2"><StatusMark status={a.status} /></td>
              <td className="px-4 py-2 text-a-text-2">{t(`appointments.payment.${a.payment.state}`)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  )
}
```

- [ ] **Step 4: Render it from the page**

In `frontend/src/appointments/calendar/CalendarPage.tsx`, add the import `import { ListView } from './ListView'` and, directly after the `view !== 'list'` block inside the scrolling `<div>`:

```tsx
          {!query.isLoading && view === 'list' && (
            <ListView from={range.from} to={range.to} appointments={shown} locale={locale} selectedId={selectedId} onOpen={setSelectedId} />
          )}
```

- [ ] **Step 5: Run the tests, type check, lint**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments 2>&1 | tail -n 10 && npx tsc -b && npx eslint src/appointments
```
Expected: `listView` 4 pass with the rest; silent `tsc` and eslint.

- [ ] **Step 6: Look at it**

At 1440: switch to List — a table, one heading row per day. Resize the window to 900 px wide: the Day/Week/List toggle disappears and the list is shown. Tab from the toolbar into the table: each row's time is reachable. Screenshot `shots/task-16-list.png` and `shots/task-16-narrow.png`.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add frontend/src/appointments/calendar/ListView.tsx frontend/src/appointments/calendar/listView.test.tsx frontend/src/appointments/calendar/CalendarPage.tsx && git commit -q -F - <<'EOF'
Add the list view of the appointments calendar

A table of the week with a heading per day: the keyboard and screen-reader
alternative to the grid, and the view a narrow screen gets.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---
### Task 17: The panel — state, and booking from a slot

**Files:**
- Create: `frontend/src/appointments/panel/panelState.ts`, `panelState.test.ts`, `ClientPicker.tsx`, `CreateForm.tsx`, `AppointmentPanel.tsx`, `createForm.test.tsx`
- Modify: `frontend/src/appointments/calendar/CalendarPage.tsx`

**Interfaces:**
- Consumes (Task 13): types `ClientSummary`, `CalendarMaster`, `CatalogueService`, `SlotsPayload`, `CreateBody`, `PointsResult`, `ActionKey`, `DateKey`; `appointmentsApi.slots()`, `searchClients()`, `createClient()`, `createBooking()`, `client()`; `failureOf()`; `makeWall`, `minutesOf`, `timeOf`, `hhmm`, `isDateKey`; `ui/Button`, `ui/Field`, `ui/Notice`. (Task 14): `useBoot()`, `useVocab()`. `money(amount, currency)` from `frontend/src/lib/money.ts`.
- Produces:
  - `panelState.ts`: `type Source = 'admin' | 'phone' | 'walk_in'`; `interface CreateDraft { date: DateKey; time: string | null; masterId: number | null; serviceId: number | null; client: ClientSummary | null; source: Source; staffNotes: string }`; `interface PanelError { code: string; message: string }`; `type PanelState` (`closed` | `create` | `view`, below); `type PanelEvent`; `CLOSED`; `emptyDraft(date)`; `canSave(draft): boolean`; `draftBody(draft): CreateBody | null`; `panelReducer(state, event): PanelState`; `newKey(): string`.
  - `AppointmentPanel` props `{ state: PanelState; dispatch: Dispatch<PanelEvent>; masters: CalendarMaster[]; services: CatalogueService[]; today: DateKey }`. In this task it renders the create mode; Task 18 adds the view mode in the marked place.
  - Query keys other tasks invalidate: `['appointments', 'calendar', …]`, `['appointments', 'slots', …]`, `['appointments', 'booking', id]`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/appointments/panel/panelState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CLOSED, canSave, draftBody, emptyDraft, panelReducer, type PanelState } from './panelState'
import type { ClientSummary } from '../lib/types'

const sophie: ClientSummary = { id: 5, name: 'Sophie Williams', phone: '+44 7700 900123', email: null, member: null }

function open(): Extract<PanelState, { mode: 'create' }> {
  const state = panelReducer(CLOSED, { type: 'openCreate', key: 'key-1', draft: { date: '2026-10-06', time: '10:00', masterId: 1 } })
  if (state.mode !== 'create') throw new Error('not in create mode')
  return state
}

describe('panelReducer — create', () => {
  it('opens with the slot prefilled and everything else empty', () => {
    const state = open()
    expect(state.draft).toEqual({ date: '2026-10-06', time: '10:00', masterId: 1, serviceId: null, client: null, source: 'admin', staffNotes: '' })
    expect(state).toMatchObject({ key: 'key-1', saving: false, error: null })
  })

  it('keeps the key across a failed save and changes it when the draft changes', () => {
    let state: PanelState = open()
    state = panelReducer(state, { type: 'saving' })
    state = panelReducer(state, { type: 'failed', error: { code: 'network', message: 'Timed out' } })
    // A retry of the same draft must reuse the key: if the first attempt did
    // reach the server, the second answers with that appointment.
    expect(state).toMatchObject({ mode: 'create', key: 'key-1', saving: false, error: { code: 'network' } })

    state = panelReducer(state, { type: 'edit', patch: { staffNotes: 'Running late' }, key: 'key-2' })
    // A changed draft is a different request: the old key would be refused.
    expect(state).toMatchObject({ mode: 'create', key: 'key-2', error: null })
  })

  it('keeps what was typed when a save fails', () => {
    let state: PanelState = panelReducer(open(), { type: 'edit', patch: { client: sophie, serviceId: 3, staffNotes: 'Allergic to lavender' }, key: 'k2' })
    state = panelReducer(panelReducer(state, { type: 'saving' }), { type: 'failed', error: { code: 'slot_taken', message: 'Taken' } })
    expect(state.mode === 'create' && state.draft).toMatchObject({ client: sophie, serviceId: 3, staffNotes: 'Allergic to lavender', time: '10:00' })
  })

  it('keeps the slot\'s time while the rest is chosen — the form checks it against the server\'s free times', () => {
    // Clicking 10:00 in Emma's column and then choosing the service must not
    // throw the 10:00 away. Whether 10:00 is still free for that service is
    // the server's answer (CreateForm: "That time is no longer free").
    let state: PanelState = panelReducer(open(), { type: 'edit', patch: { serviceId: 3 }, key: 'k' })
    expect(state.mode === 'create' && state.draft.time).toBe('10:00')
    state = panelReducer(state, { type: 'edit', patch: { date: '2026-10-07' }, key: 'k2' })
    expect(state.mode === 'create' && state.draft).toMatchObject({ date: '2026-10-07', time: '10:00', masterId: 1, serviceId: 3 })
    state = panelReducer(state, { type: 'edit', patch: { time: null }, key: 'k3' })
    expect(state.mode === 'create' && state.draft.time).toBeNull()
  })

  it('a saved appointment opens in the panel', () => {
    const state = panelReducer(panelReducer(open(), { type: 'saving' }), { type: 'created', id: 42 })
    expect(state).toEqual({ mode: 'view', id: 42, sub: 'summary', action: null, reason: '', saving: false, error: null, outcome: null })
  })

  it('ignores edits and saves when it is not creating', () => {
    expect(panelReducer(CLOSED, { type: 'edit', patch: { staffNotes: 'x' }, key: 'k' })).toBe(CLOSED)
    expect(panelReducer(CLOSED, { type: 'saving' })).toBe(CLOSED)
  })
})

describe('panelReducer — view', () => {
  const view = () => panelReducer(CLOSED, { type: 'openView', id: 7 })

  it('asks before an action and goes back without doing it', () => {
    let state = panelReducer(view(), { type: 'askConfirm', action: 'cancel' })
    state = panelReducer(state, { type: 'setReason', reason: 'Client rang' })
    expect(state).toMatchObject({ mode: 'view', sub: 'confirm', action: 'cancel', reason: 'Client rang' })
    expect(panelReducer(state, { type: 'back' })).toMatchObject({ sub: 'summary', action: null, reason: '', error: null })
  })

  it('returns to the summary with the outcome when an action is done', () => {
    let state = panelReducer(view(), { type: 'askConfirm', action: 'complete' })
    state = panelReducer(panelReducer(state, { type: 'saving' }), { type: 'done', outcome: { awarded: 900, reason: null } })
    expect(state).toMatchObject({ sub: 'summary', action: null, saving: false, error: null, outcome: { awarded: 900, reason: null } })
  })

  it('a stale save goes back to the summary, where the current appointment is shown', () => {
    let state = panelReducer(view(), { type: 'startMove' })
    expect(state).toMatchObject({ sub: 'move' })
    state = panelReducer(panelReducer(state, { type: 'saving' }), { type: 'failed', error: { code: 'stale', message: 'Changed' } })
    expect(state).toMatchObject({ sub: 'summary', saving: false, error: { code: 'stale' } })
  })

  it('any other failure stays where the user was', () => {
    let state = panelReducer(view(), { type: 'startMove' })
    state = panelReducer(panelReducer(state, { type: 'saving' }), { type: 'failed', error: { code: 'slot_taken', message: 'Taken' } })
    expect(state).toMatchObject({ sub: 'move', saving: false, error: { code: 'slot_taken' } })
  })

  it('close closes from anywhere', () => {
    expect(panelReducer(view(), { type: 'close' })).toBe(CLOSED)
    expect(panelReducer(open(), { type: 'close' })).toBe(CLOSED)
  })
})

describe('canSave / draftBody', () => {
  it('needs a client, a service, a person and a time', () => {
    const full = { ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie }
    expect(canSave(full)).toBe(true)
    for (const missing of [{ time: null }, { masterId: null }, { serviceId: null }, { client: null }]) {
      expect(canSave({ ...full, ...missing })).toBe(false)
      expect(draftBody({ ...full, ...missing })).toBeNull()
    }
  })

  it('sends the start as the venue\'s wall clock, never an instant', () => {
    const body = draftBody({ ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie, source: 'walk_in', staffNotes: '  Firm pressure ' })
    expect(body).toEqual({ client_id: 5, service_id: 3, master_id: 1, start: '2026-10-06T10:00', source: 'walk_in', staff_notes: 'Firm pressure' })
    expect(draftBody({ ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie })).not.toHaveProperty('staff_notes')
  })
})
```

Create `frontend/src/appointments/panel/createForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateForm } from './CreateForm'
import { emptyDraft, type CreateDraft } from './panelState'
import type { CalendarMaster, CatalogueService, ClientSummary, SlotsPayload } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const masters: CalendarMaster[] = [
  { id: 1, name: 'Emma', title: null, avatar: null, days: {} },
  { id: 2, name: 'James', title: null, avatar: null, days: {} },
]
const services: CatalogueService[] = [
  { id: 3, name: 'Haircut & Styling', duration_minutes: 60, buffer_after_minutes: 0, price: 45, currency: 'GBP', master_ids: [1] },
  { id: 4, name: 'Beard Trim', duration_minutes: 30, buffer_after_minutes: 0, price: 20, currency: 'GBP', master_ids: [2] },
]
const slots: SlotsPayload = {
  slots: [
    { start: '2026-10-06T10:00', end: '2026-10-06T11:00', label: '10:00' },
    { start: '2026-10-06T11:00', end: '2026-10-06T12:00', label: '11:00' },
  ],
  duration_minutes: 60, price: 45, currency: 'GBP',
}
const sophie: ClientSummary = { id: 5, name: 'Sophie Williams', phone: '+44 7700 900123', email: null, member: { id: 9, number: 'HL-9', tier: 'Gold', points: 120 } }

function render(draft: Partial<CreateDraft>, extra: { slots?: SlotsPayload; error?: { code: string; message: string } } = {}) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <CreateForm
        draft={{ ...emptyDraft('2026-10-06'), ...draft }} masters={masters} services={services}
        slots={extra.slots} slotsLoading={false} today="2026-10-06" saving={false} error={extra.error ?? null}
        onEdit={() => {}} onSave={() => {}}
      />
    </QueryClientProvider>,
  )
}

// The attribute, not the word: the button's class list contains `disabled:opacity-50` either way.
const SAVE_DISABLED = /<button[^>]*type="submit"[^>]* disabled=""/

describe('CreateForm', () => {
  it('offers only the services the chosen person performs', () => {
    const html = render({ masterId: 1 })
    expect(html).toContain('Haircut &amp; Styling')
    expect(html).not.toContain('Beard Trim')
  })

  it('shows the chosen client with their membership', () => {
    const html = render({ client: sophie })
    expect(html).toContain('Sophie Williams')
    expect(html).toContain('Gold')
  })

  it('reviews the end time, duration and price from the server before saving', () => {
    const html = render({ masterId: 1, serviceId: 3, client: sophie, time: '10:00' }, { slots })
    expect(html).toContain('10:00 – 11:00')
    expect(html).toContain('60 min')
    expect(html).toMatch(/£45[.,]00/) // the admin's money() uses the machine's number format
    expect(html).not.toMatch(SAVE_DISABLED)
  })

  it('will not save a time the server no longer offers, and says so', () => {
    const html = render({ masterId: 1, serviceId: 3, client: sophie, time: '09:30' }, { slots })
    expect(html).toContain('That time is no longer free')
    expect(html).toMatch(SAVE_DISABLED)
  })

  it('cannot be saved until it is complete', () => {
    expect(render({ masterId: 1, serviceId: 3, time: '10:00' }, { slots })).toMatch(SAVE_DISABLED)
  })

  it('says when the day has no free time, and that no message is sent', () => {
    const html = render({ masterId: 1, serviceId: 3, client: sophie }, { slots: { ...slots, slots: [] } })
    expect(html).toContain('No free time on this day')
    expect(html).toContain('No message is sent to the client')
  })

  it('shows a refusal in words', () => {
    const html = render({ masterId: 1, serviceId: 3, client: sophie, time: '10:00' }, { slots, error: { code: 'slot_taken', message: 'That time is not free for Emma. Choose another.' } })
    expect(html).toContain('That time is not free for Emma')
  })

  it('cannot pick a day that has passed', () => {
    expect(render({})).toContain('min="2026-10-06"')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments/panel 2>&1 | tail -n 8
```
Expected: FAIL — cannot resolve `./panelState`, `./CreateForm`.

- [ ] **Step 3: The panel's state (pure)**

Create `frontend/src/appointments/panel/panelState.ts`:

```ts
import type { ActionKey, ClientSummary, CreateBody, DateKey, PointsResult } from '../lib/types'
import { makeWall, minutesOf } from '../lib/wallClock'

export type Source = 'admin' | 'phone' | 'walk_in'

export interface CreateDraft {
  date: DateKey
  /** 'HH:mm' on the venue's clock, or null until one is chosen. */
  time: string | null
  masterId: number | null
  serviceId: number | null
  client: ClientSummary | null
  source: Source
  staffNotes: string
}

export interface PanelError { code: string; message: string }

export type PanelState =
  | { mode: 'closed' }
  | { mode: 'create'; draft: CreateDraft; key: string; saving: boolean; error: PanelError | null }
  | {
      mode: 'view'
      id: number
      sub: 'summary' | 'move' | 'confirm'
      action: ActionKey | null
      reason: string
      saving: boolean
      error: PanelError | null
      outcome: PointsResult | null
    }

export type PanelEvent =
  | { type: 'openCreate'; draft: Partial<CreateDraft> & { date: DateKey }; key: string }
  | { type: 'edit'; patch: Partial<CreateDraft>; key: string }
  | { type: 'openView'; id: number }
  | { type: 'startMove' }
  | { type: 'askConfirm'; action: ActionKey }
  | { type: 'setReason'; reason: string }
  | { type: 'back' }
  | { type: 'saving' }
  | { type: 'failed'; error: PanelError }
  | { type: 'created'; id: number }
  | { type: 'done'; outcome: PointsResult | null }
  | { type: 'close' }

export const CLOSED: PanelState = { mode: 'closed' }

export function emptyDraft(date: DateKey): CreateDraft {
  return { date, time: null, masterId: null, serviceId: null, client: null, source: 'admin', staffNotes: '' }
}

const viewOf = (id: number): PanelState => ({ mode: 'view', id, sub: 'summary', action: null, reason: '', saving: false, error: null, outcome: null })

/** A fresh Idempotency-Key. One per draft: see the `edit` event. */
export function newKey(): string {
  return crypto.randomUUID()
}

export function canSave(draft: CreateDraft): boolean {
  return draft.client !== null && draft.serviceId !== null && draft.masterId !== null && draft.time !== null
}

export function draftBody(draft: CreateDraft): CreateBody | null {
  if (draft.client === null || draft.serviceId === null || draft.masterId === null || draft.time === null) return null
  const notes = draft.staffNotes.trim()
  return {
    client_id: draft.client.id,
    service_id: draft.serviceId,
    master_id: draft.masterId,
    start: makeWall(draft.date, minutesOf(draft.time)),
    source: draft.source,
    ...(notes ? { staff_notes: notes } : {}),
  }
}

export function panelReducer(state: PanelState, event: PanelEvent): PanelState {
  switch (event.type) {
    case 'close':
      return CLOSED
    case 'openCreate':
      return { mode: 'create', draft: { ...emptyDraft(event.draft.date), ...event.draft }, key: event.key, saving: false, error: null }
    case 'openView':
      return viewOf(event.id)
    default:
      break
  }

  if (state.mode === 'create') {
    switch (event.type) {
      case 'edit':
        // A changed draft is a different request, so it gets a new key; the
        // server refuses a key reused for a different body. The time is kept
        // as chosen: whether it is free for the new day, person or service is
        // the server's answer, which the form checks before it allows a save.
        return { ...state, draft: { ...state.draft, ...event.patch }, key: event.key, error: null }
      case 'saving':
        return { ...state, saving: true, error: null }
      case 'failed':
        // Same draft, same key: a retry replays the first attempt if it landed.
        return { ...state, saving: false, error: event.error }
      case 'created':
        return viewOf(event.id)
      default:
        return state
    }
  }

  if (state.mode === 'view') {
    switch (event.type) {
      case 'startMove':
        return { ...state, sub: 'move', action: null, error: null, outcome: null }
      case 'askConfirm':
        return { ...state, sub: 'confirm', action: event.action, reason: '', error: null, outcome: null }
      case 'setReason':
        return { ...state, reason: event.reason }
      case 'back':
        return { ...state, sub: 'summary', action: null, reason: '', error: null }
      case 'saving':
        return { ...state, saving: true, error: null }
      case 'failed':
        // Someone else changed it: show the current appointment, not a form
        // built on the old one.
        return event.error.code === 'stale'
          ? { ...state, sub: 'summary', action: null, reason: '', saving: false, error: event.error }
          : { ...state, saving: false, error: event.error }
      case 'done':
        return { ...state, sub: 'summary', action: null, reason: '', saving: false, error: null, outcome: event.outcome }
      default:
        return state
    }
  }

  return state
}
```

- [ ] **Step 4: The client picker**

Create `frontend/src/appointments/panel/ClientPicker.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { UserPlus, X } from 'lucide-react'
import { appointmentsApi, failureOf } from '../lib/api'
import type { ClientSummary } from '../lib/types'
import { useVocab } from '../lib/vocab'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'

const input = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text placeholder:text-a-text-2'

function contact(c: ClientSummary): string {
  return [c.phone, c.email].filter(Boolean).join(' · ')
}

/**
 * Choose the client without leaving the booking: search the organisation's
 * own clients, or add one with a name and a phone number or email. A likely
 * duplicate is shown for the operator to pick or to override — never merged.
 */
export function ClientPicker({ client, onPick }: { client: ClientSummary | null; onPick: (client: ClientSummary | null) => void }) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [matches, setMatches] = useState<ClientSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  const search = useQuery({
    queryKey: ['appointments', 'clients', debounced],
    queryFn: () => appointmentsApi.searchClients(debounced),
    enabled: debounced.length >= 2,
  })

  const canAdd = form.name.trim() !== '' && (form.phone.trim() !== '' || form.email.trim() !== '')

  const add = async (confirmNew: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const { client: made } = await appointmentsApi.createClient({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        confirm_new: confirmNew || undefined,
      })
      setAdding(false)
      setMatches(null)
      onPick(made)
    } catch (e) {
      const failure = failureOf(e)
      if (failure.code === 'possible_duplicate' && failure.matches) setMatches(failure.matches)
      else setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  if (client) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-a-border bg-a-surface-2 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-a-text truncate">{client.name}</div>
          <div className="text-xs text-a-text-2 truncate">{contact(client)}</div>
          <div className="text-xs text-a-text-2 mt-0.5">
            {client.member
              ? t('appointments.client.member_line', 'Member · {{tier}} · {{points}} points', { tier: client.member.tier ?? '—', points: client.member.points })
              : t('appointments.client.not_member', 'Not a member')}
          </div>
        </div>
        <button type="button" onClick={() => onPick(null)} className="shrink-0 rounded p-1 text-a-text-2 hover:text-a-text" aria-label={t('appointments.client.change', 'Choose someone else')}>
          <X size={16} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-xs font-medium text-a-text-2 mb-1">{vocab('client')}</span>
        <input value={term} onChange={(e) => setTerm(e.target.value)} className={input}
          placeholder={t('appointments.client.search_placeholder', 'Name, phone or email')} />
      </label>

      {search.isFetching && <p className="text-xs text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {search.data && search.data.clients.length === 0 && (
        <p className="text-xs text-a-text-2">{t('appointments.client.none_found', 'No one found.')}</p>
      )}
      {search.data && search.data.clients.length > 0 && (
        <ul className="rounded-lg border border-a-border divide-y divide-a-border max-h-56 overflow-y-auto">
          {search.data.clients.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)} className="w-full text-left px-3 py-2 hover:bg-a-surface-2">
                <div className="text-sm font-medium text-a-text">{c.name}</div>
                <div className="text-xs text-a-text-2">{contact(c)}{c.member ? ` · ${c.member.tier ?? t('appointments.client.member', 'Member')}` : ''}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!adding && (
        <button type="button" onClick={() => { setAdding(true); setForm(f => ({ ...f, name: f.name || term.trim() })) }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-a-accent-deep">
          <UserPlus size={15} aria-hidden /> {t('appointments.client.new', 'Add new')}
        </button>
      )}

      {adding && (
        <div className="rounded-lg border border-a-border p-3 space-y-2">
          <label className="block">
            <span className="block text-xs font-medium text-a-text-2 mb-1">{t('appointments.client.name', 'Name')}</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} maxLength={200} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-a-text-2 mb-1">{t('appointments.client.phone', 'Phone')}</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} maxLength={50} inputMode="tel" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-a-text-2 mb-1">{t('appointments.client.email', 'Email')}</span>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} maxLength={150} inputMode="email" />
          </label>
          <p className="text-xs text-a-text-2">{t('appointments.client.contact_hint', 'A name, and a phone number or an email.')}</p>

          {matches && (
            <Notice tone="warning">
              <p className="font-semibold">{t('appointments.client.duplicate_title', 'This may already be a client:')}</p>
              <ul className="mt-1 space-y-1">
                {matches.map(m => (
                  <li key={m.id}>
                    <button type="button" onClick={() => onPick(m)} className="underline underline-offset-2 text-left">{m.name} — {contact(m)}</button>
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}

          <div className="flex flex-wrap gap-2">
            {!matches && <Button type="button" size="sm" disabled={!canAdd} loading={busy} onClick={() => { void add(false) }}>{t('appointments.client.add', 'Add')}</Button>}
            {matches && <Button type="button" size="sm" variant="secondary" disabled={!canAdd} loading={busy} onClick={() => { void add(true) }}>{t('appointments.client.add_anyway', 'Add as a new client anyway')}</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setMatches(null); setError(null) }}>{t('appointments.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: The create form**

Create `frontend/src/appointments/panel/CreateForm.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { money } from '../../lib/money'
import type { CalendarMaster, CatalogueService, DateKey, SlotsPayload } from '../lib/types'
import { timeOf } from '../lib/wallClock'
import { useVocab } from '../lib/vocab'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { ClientPicker } from './ClientPicker'
import { canSave, type CreateDraft, type PanelError, type Source } from './panelState'

interface Props {
  draft: CreateDraft
  masters: CalendarMaster[]
  services: CatalogueService[]
  /** The server's free times for the chosen service, person and day; undefined until all three are chosen and loaded. */
  slots: SlotsPayload | undefined
  slotsLoading: boolean
  today: DateKey
  saving: boolean
  error: PanelError | null
  onEdit: (patch: Partial<CreateDraft>) => void
  onSave: () => void
}

const control = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Slot → client → service → review → save. Every choice that decides the
 * price, the duration or whether the time is free comes from the server
 * (`slots`); the form computes none of it.
 */
export function CreateForm(p: Props) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const { draft } = p

  const service = p.services.find(s => s.id === draft.serviceId) ?? null
  const servicesOffered = p.services.filter(s => draft.masterId === null || s.master_ids.includes(draft.masterId))
  const mastersOffered = p.masters.filter(m => service === null || service.master_ids.includes(m.id))

  const slot = p.slots?.slots.find(s => timeOf(s.start) === draft.time) ?? null
  const timeLost = draft.time !== null && p.slots !== undefined && slot === null
  const ready = canSave(draft) && slot !== null

  const sources: [Source, string][] = [
    ['admin', t('appointments.panel.source_desk', 'At the desk')],
    ['phone', t('appointments.panel.source_phone', 'By phone')],
    ['walk_in', t('appointments.panel.source_walk_in', 'Walk-in')],
  ]

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready && !p.saving) p.onSave() }}>
      <ClientPicker client={draft.client} onPick={(client) => p.onEdit({ client })} />

      <Field label={t('appointments.panel.date', 'Date')}>
        <input type="date" className={control} min={p.today} value={draft.date} onChange={(e) => { if (e.target.value) p.onEdit({ date: e.target.value }) }} />
      </Field>

      <Field label={vocab('team_member')}>
        <select className={control} value={draft.masterId ?? ''} onChange={(e) => {
          const masterId = e.target.value ? Number(e.target.value) : null
          const keeps = service !== null && masterId !== null && service.master_ids.includes(masterId)
          p.onEdit({ masterId, ...(keeps ? {} : { serviceId: null }) })
        }}>
          <option value="">{t('appointments.panel.choose', 'Choose…')}</option>
          {mastersOffered.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>

      <Field label={vocab('service')}>
        <select className={control} value={draft.serviceId ?? ''} onChange={(e) => p.onEdit({ serviceId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t('appointments.panel.choose', 'Choose…')}</option>
          {servicesOffered.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>

      <Field label={t('appointments.panel.time', 'Time')}>
        <select className={control} value={slot ? draft.time ?? '' : ''} disabled={!p.slots} onChange={(e) => p.onEdit({ time: e.target.value || null })}>
          <option value="">{p.slotsLoading ? t('appointments.common.loading', 'Loading…') : t('appointments.panel.choose_time', 'Choose a time…')}</option>
          {p.slots?.slots.map(s => <option key={s.start} value={timeOf(s.start)}>{s.label}</option>)}
        </select>
      </Field>

      {timeLost && <Notice tone="warning">{t('appointments.panel.time_lost', 'That time is no longer free. Choose another.')}</Notice>}
      {p.slots && p.slots.slots.length === 0 && <Notice tone="info">{t('appointments.panel.no_slots', 'No free time on this day for this service and team member.')}</Notice>}

      {slot && p.slots && (
        <dl className="rounded-lg bg-a-surface-2 px-3 py-2 text-sm">
          <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.panel.when', 'When')}</dt><dd className="font-semibold text-a-text">{timeOf(slot.start)} – {timeOf(slot.end)}</dd></div>
          <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.panel.duration', 'Duration')}</dt><dd className="text-a-text">{t('appointments.panel.minutes', '{{minutes}} min', { minutes: p.slots.duration_minutes })}</dd></div>
          <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.panel.price', 'Price')}</dt><dd className="font-semibold text-a-text">{money(p.slots.price, p.slots.currency)}</dd></div>
        </dl>
      )}

      <Field label={t('appointments.panel.source', 'Booked')}>
        <select className={control} value={draft.source} onChange={(e) => p.onEdit({ source: e.target.value as Source })}>
          {sources.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </Field>

      <Field label={t('appointments.panel.staff_note', 'Note for the team')}>
        <textarea className={control} rows={2} maxLength={2000} value={draft.staffNotes} onChange={(e) => p.onEdit({ staffNotes: e.target.value })} />
      </Field>

      {p.error && <Notice tone="danger">{t(`appointments.error.${p.error.code}`, p.error.message)}</Notice>}

      <Button type="submit" full disabled={!ready} loading={p.saving}>{t('appointments.panel.save', 'Save appointment')}</Button>
      <p className="text-xs text-a-text-2">{t('appointments.consequence.no_message', 'No message is sent to the client.')}</p>
    </form>
  )
}
```

- [ ] **Step 6: The panel frame (create mode)**

Create `frontend/src/appointments/panel/AppointmentPanel.tsx`:

```tsx
import { useEffect, useRef, type Dispatch } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { appointmentsApi, failureOf } from '../lib/api'
import type { CalendarMaster, CatalogueService, DateKey } from '../lib/types'
import { CreateForm } from './CreateForm'
import { draftBody, newKey, type PanelEvent, type PanelState } from './panelState'

interface Props {
  state: PanelState
  dispatch: Dispatch<PanelEvent>
  masters: CalendarMaster[]
  services: CatalogueService[]
  today: DateKey
}

/**
 * The right-side appointment workspace. It lies over the right edge of the
 * calendar and leaves the rest of it visible, with its date, filter and
 * scroll untouched. Esc closes it and focus goes back to the card or slot
 * that opened it.
 */
export function AppointmentPanel({ state, dispatch, masters, services, today }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    heading.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dispatch({ type: 'close' }) }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [dispatch])

  const draft = state.mode === 'create' ? state.draft : null
  const slots = useQuery({
    queryKey: ['appointments', 'slots', draft?.serviceId ?? null, draft?.masterId ?? null, draft?.date ?? null, null],
    queryFn: () => appointmentsApi.slots(draft!.serviceId!, draft!.masterId!, draft!.date),
    enabled: draft !== null && draft.serviceId !== null && draft.masterId !== null,
  })

  const save = async () => {
    if (state.mode !== 'create') return
    const body = draftBody(state.draft)
    if (!body) return
    dispatch({ type: 'saving' })
    try {
      const { booking } = await appointmentsApi.createBooking(body, state.key)
      queryClient.setQueryData(['appointments', 'booking', booking.id], { booking })
      void queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] })
      dispatch({ type: 'created', id: booking.id })
    } catch (e) {
      const failure = failureOf(e)
      // The slot was lost: fetch the times that are free now.
      if (failure.code === 'slot_taken') void queryClient.invalidateQueries({ queryKey: ['appointments', 'slots'] })
      dispatch({ type: 'failed', error: { code: failure.code, message: failure.message } })
    }
  }

  const title = state.mode === 'create'
    ? t('appointments.panel.new_title', 'New appointment')
    : t('appointments.panel.title', 'Appointment')

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="appointment-panel-title"
      className="fixed right-0 top-14 bottom-0 z-30 w-full sm:w-[440px] overflow-y-auto bg-a-surface border-l border-a-border shadow-xl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-a-border bg-a-surface px-4 py-3">
        <h2 id="appointment-panel-title" ref={heading} tabIndex={-1} className="text-base font-semibold text-a-text outline-none">{title}</h2>
        <button type="button" onClick={() => dispatch({ type: 'close' })} className="rounded p-1.5 text-a-text-2 hover:text-a-text" aria-label={t('appointments.common.close', 'Close')}>
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="p-4">
        {state.mode === 'create' && (
          <CreateForm
            draft={state.draft} masters={masters} services={services}
            slots={slots.data} slotsLoading={slots.isFetching} today={today}
            saving={state.saving} error={state.error}
            onEdit={(patch) => dispatch({ type: 'edit', patch, key: newKey() })}
            onSave={() => { void save() }}
          />
        )}
        {/* Task 18: the view mode renders here. */}
      </div>
    </aside>
  )
}
```

- [ ] **Step 7: Wire the page to the panel**

In `frontend/src/appointments/calendar/CalendarPage.tsx`:

1. Replace the React import and add the router and panel imports:

```tsx
import { useEffect, useMemo, useReducer, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
```
```tsx
import { hhmm, isDateKey, venueNow } from '../lib/wallClock'
import { AppointmentPanel } from '../panel/AppointmentPanel'
import { CLOSED, newKey, panelReducer } from '../panel/panelState'
```
(the `venueNow` import line it replaces is `import { venueNow } from '../lib/wallClock'`).

2. Replace the two lines

```tsx
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [, setPendingSlot] = useState<{ masterId: number; date: DateKey; minutes: number } | null>(null)
```

with

```tsx
  const [panel, dispatch] = useReducer(panelReducer, CLOSED)
  const selectedId = panel.mode === 'view' ? panel.id : null
  const [params, setParams] = useSearchParams()

  // Links into the calendar: ?new=1[&client&service&master][&date], ?open=<id>[&date].
  // The day a link names is adopted while rendering (React's documented way
  // to adjust state to a changed input; the lint rule forbids doing it in an
  // effect). The effect below opens the panel and then removes the link from
  // the address, so a reload does not repeat it.
  const linkDate = params.get('date')
  const [adoptedDate, setAdoptedDate] = useState<string | null>(null)
  if (linkDate !== adoptedDate) {
    setAdoptedDate(linkDate)
    if (linkDate !== null && isDateKey(linkDate)) setDate(linkDate)
  }

  useEffect(() => {
    const open = params.get('open')
    const isNew = params.get('new')
    const linked = params.get('date')
    if (!open && !isNew && !linked) return

    const target = linked && isDateKey(linked) ? linked : date
    const id = (name: string) => { const v = params.get(name); return v && /^\d+$/.test(v) ? Number(v) : null }

    if (open && /^\d+$/.test(open)) {
      dispatch({ type: 'openView', id: Number(open) })
    } else if (isNew) {
      dispatch({ type: 'openCreate', key: newKey(), draft: { date: target, masterId: id('master'), serviceId: id('service') } })
      const clientId = id('client')
      if (clientId !== null) {
        void appointmentsApi.client(clientId)
          .then(profile => dispatch({ type: 'edit', patch: { client: profile.client }, key: newKey() }))
          .catch(() => { /* the panel simply opens without a client */ })
      }
    }
    setParams({}, { replace: true })
  }, [params, setParams, date])
```

3. Replace the two grid callbacks

```tsx
              onSlot={(masterId, slotDate, minutes) => setPendingSlot({ masterId, date: slotDate, minutes })}
              onOpen={setSelectedId}
```

with

```tsx
              onSlot={(masterId, slotDate, minutes) => dispatch({ type: 'openCreate', key: newKey(), draft: { date: slotDate, time: hhmm(minutes), masterId } })}
              onOpen={(id) => dispatch({ type: 'openView', id })}
```

and the list's `onOpen={setSelectedId}` with `onOpen={(id) => dispatch({ type: 'openView', id })}`.

4. Directly before the closing `</div>` of the page's root element (after the `<aside>`):

```tsx
      {panel.mode !== 'closed' && (
        <AppointmentPanel
          key={panel.mode === 'view' ? `view-${panel.id}` : 'create'}
          state={panel} dispatch={dispatch} masters={masters} services={query.data?.services ?? []} today={now.date}
        />
      )}
```

- [ ] **Step 8: Run the tests, type check, lint**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments 2>&1 | tail -n 10 && npx tsc -b && npx eslint src/appointments
```
Expected: `panelState` 13 and `createForm` 8 pass with the rest; silent `tsc` and eslint.

- [ ] **Step 9: Book one in the browser**

Click a free half hour in a column: the panel opens over the right edge with the date, time and team member filled in; the calendar behind keeps its place. Search a client, or add one with a name and a phone number; choose a service; read the end time, duration and price; Save. The card appears in the calendar. Open the full admin's `/service-bookings`: the booking is there. Press Esc in the panel: it closes and focus returns to the slot. Try to save a second booking onto the same time in another tab: the refusal is shown in words and the time list is refreshed. Screenshot `shots/task-17-create.png`.

- [ ] **Step 10: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add frontend/src/appointments/panel frontend/src/appointments/calendar/CalendarPage.tsx && git commit -q -F - <<'EOF'
Book an appointment from a free slot in a side panel

The slot prefills the date, time and team member; the client is searched
or added in place; the service list follows the person; the end time,
duration and price are the server's. A retry of the same draft reuses its
request key, a changed draft gets a new one, and typed input survives a
refusal.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 18: The panel — view, move, actions, loyalty, history

**Files:**
- Create: `frontend/src/appointments/panel/consequences.ts`, `consequences.test.ts`, `LoyaltyCard.tsx`, `History.tsx`, `AppointmentView.tsx`, `ActionConfirm.tsx`, `MoveForm.tsx`, `appointmentView.test.tsx`
- Modify: `frontend/src/appointments/panel/AppointmentPanel.tsx`

**Interfaces:**
- Consumes: types `AppointmentDetail`, `ActionInfo`, `ActionKey`, `LoyaltyCardData`, `PointsPreview`, `PointsResult`, `HistoryEntry`, `Wall`; `appointmentsApi.booking()`, `move()`, `act()`, `slots()`; `formatDate`, `formatInstant`, `timeOf`, `dateOf`, `makeWall`, `minutesOf`; `StatusMark`; `money()`.
- Produces:
  - `consequences.ts`: `NEEDS_CONFIRM: ReadonlySet<ActionKey>` (`confirm`, `complete`, `no_show`, `cancel`, `mark_paid_at_venue`); `interface Line { key: string; fallback: string; vars?: Record<string, unknown>; tone: 'plain' | 'warning' }`; `consequenceLines(action: ActionInfo): Line[]`; `pointsLine(points: PointsPreview | null): Line | null`.
  - `AppointmentView` props `{ booking: AppointmentDetail; zone: string; locale: string; saving: boolean; error: PanelError | null; outcome: PointsResult | null; onAction: (action: ActionKey) => void }`.
  - `ActionConfirm` props `{ booking: AppointmentDetail; action: ActionInfo; reason: string; saving: boolean; error: PanelError | null; onReason: (reason: string) => void; onConfirm: () => void; onBack: () => void }`.
  - `MoveForm` props `{ booking: AppointmentDetail; masters: CalendarMaster[]; services: CatalogueService[]; today: DateKey; saving: boolean; error: PanelError | null; onMove: (start: Wall, masterId: number) => void; onBack: () => void }`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/appointments/panel/consequences.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NEEDS_CONFIRM, consequenceLines, pointsLine } from './consequences'
import type { ActionInfo, ActionKey } from '../lib/types'

const action = (key: ActionKey, c: Partial<ActionInfo['consequences']> = {}): ActionInfo => ({
  key, allowed: true, consequences: { payment: 'none', points: null, coupon: 'none', message: 'none', ...c },
})
const keys = (a: ActionInfo) => consequenceLines(a).map(l => l.key)

describe('consequenceLines', () => {
  it('a cancellation with a held card says the hold is released and that nobody is told', () => {
    expect(keys(action('cancel', { payment: 'hold_will_be_released' }))).toEqual([
      'appointments.consequence.payment.hold_will_be_released',
      'appointments.consequence.no_message',
    ])
  })

  it('a cancellation of a paid booking warns that nothing is refunded', () => {
    const lines = consequenceLines(action('cancel', { payment: 'captured_not_refunded', coupon: 'not_returned' }))
    expect(lines.map(l => [l.key, l.tone])).toEqual([
      ['appointments.consequence.payment.captured_not_refunded', 'warning'],
      ['appointments.consequence.coupon_not_returned', 'warning'],
      ['appointments.consequence.no_message', 'plain'],
    ])
  })

  it('a cancellation with no online payment says so plainly', () => {
    expect(keys(action('cancel'))).toEqual(['appointments.consequence.payment.none', 'appointments.consequence.no_message'])
  })

  it('confirming a request with a held card warns that the card will be charged', () => {
    const lines = consequenceLines(action('confirm', { payment: 'hold_will_be_charged' }))
    expect(lines[0]).toMatchObject({ key: 'appointments.consequence.payment.hold_will_be_charged', tone: 'warning' })
  })

  it('completing states the points, or the reason there are none', () => {
    expect(consequenceLines(action('complete', { points: { points: 900, reason: null } }))[0])
      .toMatchObject({ key: 'appointments.consequence.points_will_award', vars: { points: 900 } })
    expect(keys(action('complete', { points: { points: 0, reason: 'not_a_member' } }))).toEqual(['appointments.points_reason.not_a_member'])
  })

  it('marking paid at the venue says no money is moved', () => {
    expect(keys(action('mark_paid_at_venue', { payment: 'marked_only' }))).toEqual(['appointments.consequence.payment.marked_only'])
  })

  it('asks for confirmation exactly where money, points or a final status are involved', () => {
    expect([...NEEDS_CONFIRM].sort()).toEqual(['cancel', 'complete', 'confirm', 'mark_paid_at_venue', 'no_show'])
  })
})

describe('pointsLine', () => {
  it('is null without a preview', () => {
    expect(pointsLine(null)).toBeNull()
  })
})
```

Create `frontend/src/appointments/panel/appointmentView.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppointmentView } from './AppointmentView'
import { ActionConfirm } from './ActionConfirm'
import type { ActionInfo, ActionKey, AppointmentDetail } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      const values = vars ?? (typeof fallback === 'object' ? fallback : {}) ?? {}
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('react-router-dom', () => ({ Link: ({ to, children }: { to: string; children: unknown }) => <a href={to}>{children as never}</a> }))

const NONE = { payment: 'none', points: null, coupon: 'none', message: 'none' } as const
const act = (key: ActionKey, allowed: boolean, c: Partial<ActionInfo['consequences']> = {}): ActionInfo => ({ key, allowed, consequences: { ...NONE, ...c } })

const booking: AppointmentDetail = {
  id: 7, reference: 'SVC-ABCD1234', start: '2026-10-06T10:00', end: '2026-10-06T11:00', duration_minutes: 60,
  service: { id: 3, name: 'Haircut & Styling' }, master: { id: 1, name: 'Emma' },
  client: { id: 5, name: 'Sophie Williams', phone: '+44 7700 900123', email: null, member: { id: 9, number: 'HL-9', tier: 'Gold', points: 120 } },
  status: 'confirmed', revision: 'abc',
  payment: { state: 'not_paid_online', raw: 'unpaid', amount: 45, refunded_amount: null, carries_card_payment: false, currency: 'GBP' },
  price: { total: 45, list: 50, discount_label: 'Gold 10%', currency: 'GBP' },
  source: 'phone', notes: { customer: null, staff: 'Prefers quiet' },
  actions: [
    act('confirm', false), act('start', true), act('complete', true, { points: { points: 450, reason: null } }),
    act('no_show', true), act('cancel', true), act('mark_paid_at_venue', true, { payment: 'marked_only' }),
    act('award_points', false), act('move', true),
  ],
  loyalty: { member: { id: 9, number: 'HL-9', tier: 'Gold', points: 120 }, benefits: [{ name: 'Priority booking', display: 'Book 30 days ahead', description: null }], points_on_bookings: true, awarded: null },
  history: [{ at: '2026-10-05T09:15:00+00:00', actor: 'Vitalij K', action: 'service_booking.created', description: 'Created', changes: { old: null, new: null } }],
}

function view(overrides: Partial<AppointmentDetail> = {}, extra: Partial<Parameters<typeof AppointmentView>[0]> = {}) {
  return renderToStaticMarkup(
    <AppointmentView booking={{ ...booking, ...overrides }} zone="Europe/London" locale="en-GB" saving={false} error={null} outcome={null} onAction={() => {}} {...extra} />,
  )
}

describe('AppointmentView', () => {
  it('keeps appointment, payment and loyalty as three separate statements', () => {
    const html = view()
    expect(html).toContain('appointments.status.confirmed')
    expect(html).toContain('appointments.payment.not_paid_online')
    expect(html).toContain('Completing awards 450 points')
    expect(html).toContain('10:00 – 11:00')
    expect(html).toMatch(/£45[.,]00/) // the admin's money() uses the machine's number format
    expect(html).toContain('Gold 10%')
  })

  it('shows the client\'s real membership and its benefits', () => {
    const html = view()
    expect(html).toContain('HL-9')
    expect(html).toContain('Gold')
    expect(html).toContain('120')
    expect(html).toContain('Priority booking')
    expect(html).toContain('href="/appointments/clients/5"')
  })

  it('offers only the actions the server allows', () => {
    const html = view()
    for (const label of ['Arrived', 'Complete', 'No-show', 'Cancel appointment', 'Move', 'Mark paid at venue']) expect(html).toContain(label)
    expect(html).not.toContain('>Confirm<')
    expect(html).not.toContain('Award points')
  })

  it('offers nothing on a finished appointment', () => {
    const html = view({ status: 'cancelled', actions: booking.actions.map(a => ({ ...a, allowed: false })) })
    expect(html).not.toMatch(/<button/)
  })

  it('says a client is not a member, and shows no card when there is no programme', () => {
    expect(view({ loyalty: { member: null, benefits: [] } })).toContain('Not a member')
    const none = view({ loyalty: null })
    expect(none).not.toContain('Not a member')
    expect(none).not.toContain('Membership')
  })

  it('reports what the ledger awarded once the visit is completed', () => {
    const html = view({ status: 'completed', loyalty: { ...booking.loyalty!, awarded: 450 } })
    expect(html).toContain('450 points awarded for this visit')
    expect(html).not.toContain('Completing awards')
  })

  it('says points could not be awarded, and offers to run the award again', () => {
    const html = view(
      { status: 'completed', actions: booking.actions.map(a => (a.key === 'award_points' ? { ...a, allowed: true } : { ...a, allowed: false })) },
      { outcome: { awarded: 0, reason: 'failed' } },
    )
    expect(html).toContain('the points could not be awarded just now')
    expect(html).toContain('Award points')
  })

  it('tells the operator when someone else changed the appointment', () => {
    expect(view({}, { error: { code: 'stale', message: 'This appointment was changed by someone else.' } })).toContain('changed by someone else')
  })

  it('lists who changed it and when, in the venue\'s time', () => {
    const html = view()
    expect(html).toContain('Vitalij K')
    expect(html).toContain('10:15') // 09:15 UTC is 10:15 in London on 5 October
  })
})

describe('ActionConfirm', () => {
  const confirm = (action: ActionInfo, reason = '') => renderToStaticMarkup(
    <ActionConfirm booking={booking} action={action} reason={reason} saving={false} error={null} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />,
  )

  it('states every consequence before the button', () => {
    const html = confirm(act('cancel', true, { payment: 'captured_not_refunded', coupon: 'not_returned' }))
    expect(html).toContain('The card payment is NOT refunded automatically')
    expect(html).toContain('The coupon used on this booking is not returned')
    expect(html).toContain('No message is sent to the client')
    expect(html).toContain('Reason')
    expect(html.indexOf('NOT refunded')).toBeLessThan(html.indexOf('Cancel appointment</button>'))
  })

  it('completing shows the points, not a reason field', () => {
    const html = confirm(act('complete', true, { points: { points: 450, reason: null } }))
    expect(html).toContain('Completing awards 450 points')
    expect(html).not.toContain('<textarea')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments/panel 2>&1 | tail -n 8
```
Expected: FAIL — cannot resolve `./consequences`, `./AppointmentView`, `./ActionConfirm`.

- [ ] **Step 3: Consequences in words (pure)**

Create `frontend/src/appointments/panel/consequences.ts`:

```ts
import type { ActionInfo, ActionKey, PointsPreview } from '../lib/types'

/** Actions that touch money, points or a final status are confirmed first; "arrived" and "award points" are not. */
export const NEEDS_CONFIRM: ReadonlySet<ActionKey> = new Set<ActionKey>(['confirm', 'complete', 'no_show', 'cancel', 'mark_paid_at_venue'])

export interface Line {
  key: string
  fallback: string
  vars?: Record<string, unknown>
  tone: 'plain' | 'warning'
}

const PAYMENT: Record<string, Omit<Line, 'key'>> = {
  none:                  { fallback: 'No online payment is attached to this appointment.', tone: 'plain' },
  hold_will_be_charged:  { fallback: 'The held card payment will be charged within about 10 minutes.', tone: 'warning' },
  hold_will_be_released: { fallback: 'The card hold is released automatically within about 10 minutes. Nothing is charged.', tone: 'plain' },
  captured_not_refunded: { fallback: 'The card payment is NOT refunded automatically. It is flagged for a manual refund in Stripe.', tone: 'warning' },
  marked_only:           { fallback: 'This records "paid at the venue" on the appointment. No money is moved.', tone: 'plain' },
}

const REASON: Record<string, string> = {
  not_a_member:           'No points: this client is not a member.',
  programme_off:          'No points: the venue has no active programme.',
  points_on_bookings_off: 'No points: points for appointments are switched off in the programme.',
  already_awarded:        'Points for this visit were already awarded.',
  zero_amount:            'No points: nothing was charged for this visit.',
  refunded:               'No points: the payment was refunded.',
  failed:                 'The visit is completed, but the points could not be awarded just now. Use "Award points" to try again.',
}

/** What the programme will do on completion: the points, or the reason there are none. */
export function pointsLine(points: PointsPreview | null): Line | null {
  if (!points) return null
  if (points.points > 0) {
    return { key: 'appointments.consequence.points_will_award', fallback: 'Completing awards {{points}} points.', vars: { points: points.points }, tone: 'plain' }
  }
  const reason = points.reason ?? 'zero_amount'
  return { key: `appointments.points_reason.${reason}`, fallback: REASON[reason] ?? REASON.zero_amount, tone: 'plain' }
}

/**
 * The server's consequences for one action, as sentences in the order a
 * person needs them: money first, then points, then the coupon, then who is
 * told. The codes are the server's; nothing here decides an outcome.
 */
export function consequenceLines(action: ActionInfo): Line[] {
  const { payment, points, coupon } = action.consequences
  const lines: Line[] = []
  const statusChange = action.key === 'confirm' || action.key === 'cancel' || action.key === 'no_show'

  if (payment !== 'none' || action.key === 'cancel' || action.key === 'no_show') {
    const entry = PAYMENT[payment] ?? PAYMENT.none
    lines.push({ key: `appointments.consequence.payment.${payment in PAYMENT ? payment : 'none'}`, ...entry })
  }
  const pts = pointsLine(points)
  if (pts) lines.push(pts)
  if (coupon === 'not_returned') {
    lines.push({ key: 'appointments.consequence.coupon_not_returned', fallback: 'The coupon used on this booking is not returned.', tone: 'warning' })
  }
  if (statusChange) {
    lines.push({ key: 'appointments.consequence.no_message', fallback: 'No message is sent to the client.', tone: 'plain' })
  }

  return lines
}
```

- [ ] **Step 4: Loyalty card and history**

Create `frontend/src/appointments/panel/LoyaltyCard.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Award } from 'lucide-react'
import type { LoyaltyCardData, PointsPreview } from '../lib/types'
import { pointsLine } from './consequences'

/**
 * The client's real membership: number, tier, balance and the tier's
 * benefits, all read from the programme. `preview` is what completing this
 * appointment would award (absent on the client profile). Nothing is shown
 * at all when the venue runs no programme (`card` is null).
 */
export function LoyaltyCard({ card, preview }: { card: LoyaltyCardData | null; preview: PointsPreview | null }) {
  const { t } = useTranslation()
  if (card === null) return null

  const about = card.awarded != null
    ? (card.awarded > 0
        ? t('appointments.loyalty.awarded', '{{points}} points awarded for this visit.', { points: card.awarded })
        : t('appointments.loyalty.awarded_none', 'No points were awarded for this visit.'))
    : (() => { const line = pointsLine(preview); return line ? t(line.key, line.fallback, line.vars) : null })()

  return (
    <section className="rounded-lg border border-a-border p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-a-text">
        <Award size={15} aria-hidden /> {t('appointments.loyalty.title', 'Membership')}
      </h3>

      {card.member === null && <p className="mt-1 text-sm text-a-text-2">{t('appointments.client.not_member', 'Not a member')}</p>}

      {card.member !== null && (
        <>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-xs text-a-text-2">{t('appointments.loyalty.tier', 'Tier')}</dt><dd className="font-semibold text-a-text">{card.member.tier ?? '—'}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('appointments.loyalty.points', 'Points')}</dt><dd className="font-semibold text-a-text">{card.member.points}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('appointments.loyalty.number', 'Number')}</dt><dd className="text-a-text">{card.member.number}</dd></div>
          </dl>
          {card.benefits.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {card.benefits.map((b, i) => (
                <li key={i} className="text-a-text">
                  <span className="font-medium">{b.name}</span>
                  {b.display && <span className="text-a-text-2"> — {b.display}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {about && <p className="mt-2 text-sm text-a-text-2">{about}</p>}
    </section>
  )
}
```

Create `frontend/src/appointments/panel/History.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { HistoryEntry } from '../lib/types'
import { formatInstant } from '../lib/wallClock'

/** `service_booking.bulk.mark_no_show` → `bulk_mark_no_show`: the key under appointments.history. */
function suffix(action: string): string {
  return action.replace(/^service_booking\./, '').replace(/\./g, '_')
}

/** Who changed the appointment and when. Audit times are real instants, shown in the venue's zone. */
export function History({ entries, zone, locale }: { entries: HistoryEntry[]; zone: string; locale: string }) {
  const { t } = useTranslation()
  if (entries.length === 0) return null

  return (
    <section>
      <h3 className="text-sm font-semibold text-a-text mb-1">{t('appointments.history.title', 'History')}</h3>
      <ol className="space-y-1 text-sm">
        {entries.map((e, i) => (
          <li key={i} className="flex flex-wrap gap-x-2 text-a-text-2">
            <time dateTime={e.at}>{formatInstant(e.at, locale, zone)}</time>
            <span className="text-a-text">{t(`appointments.history.${suffix(e.action)}`, e.description ?? e.action)}</span>
            <span>{e.actor ?? t('appointments.history.system', 'System')}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
```

- [ ] **Step 5: The view**

Create `frontend/src/appointments/panel/AppointmentView.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { money } from '../../lib/money'
import type { ActionKey, AppointmentDetail, PointsResult } from '../lib/types'
import { dateOf, formatDate, timeOf } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { StatusMark } from '../ui/StatusMark'
import { History } from './History'
import { LoyaltyCard } from './LoyaltyCard'
import { pointsLine } from './consequences'
import type { PanelError } from './panelState'

interface Props {
  booking: AppointmentDetail
  zone: string
  locale: string
  saving: boolean
  error: PanelError | null
  /** What the last completion did with points, shown until the next action. */
  outcome: PointsResult | null
  onAction: (action: ActionKey) => void
}

/**
 * One appointment: what it is, what was paid, what the membership gives —
 * three separate statements — and the actions the server allows. The
 * buttons are exactly `booking.actions` with `allowed: true`.
 */
export function AppointmentView({ booking: b, zone, locale, saving, error, outcome, onAction }: Props) {
  const { t } = useTranslation()
  const allowed = (key: ActionKey) => b.actions.find(a => a.key === key)?.allowed === true
  const complete = b.actions.find(a => a.key === 'complete')
  const labels: [ActionKey, string, 'primary' | 'secondary' | 'danger'][] = [
    ['confirm', t('appointments.action.confirm', 'Confirm'), 'primary'],
    ['start', t('appointments.action.start', 'Arrived'), 'primary'],
    ['complete', t('appointments.action.complete', 'Complete'), 'primary'],
    ['award_points', t('appointments.action.award_points', 'Award points'), 'primary'],
    ['move', t('appointments.action.move', 'Move'), 'secondary'],
    ['mark_paid_at_venue', t('appointments.action.mark_paid_at_venue', 'Mark paid at venue'), 'secondary'],
    ['no_show', t('appointments.action.no_show', 'No-show'), 'secondary'],
    ['cancel', t('appointments.action.cancel', 'Cancel appointment'), 'danger'],
  ]
  const outcomeLine = outcome
    ? (outcome.awarded > 0
        ? { text: t('appointments.loyalty.awarded', '{{points}} points awarded for this visit.', { points: outcome.awarded }), tone: 'success' as const }
        : (() => { const line = pointsLine({ points: 0, reason: outcome.reason }); return { text: line ? t(line.key, line.fallback) : '', tone: outcome.reason === 'failed' ? 'warning' as const : 'info' as const } })())
    : null

  return (
    <div className="space-y-4">
      {error && <Notice tone={error.code === 'stale' ? 'warning' : 'danger'}>{t(`appointments.error.${error.code}`, error.message)}</Notice>}
      {outcomeLine && outcomeLine.text && <Notice tone={outcomeLine.tone}>{outcomeLine.text}</Notice>}

      <section>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-a-text truncate">{b.client.name}</div>
            <div className="text-sm text-a-text-2">{b.service?.name ?? '—'} · {b.master?.name ?? '—'}</div>
          </div>
          <StatusMark status={b.status} />
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-a-text-2">{t('appointments.panel.when', 'When')}</dt><dd className="font-semibold text-a-text text-right">{formatDate(dateOf(b.start), locale)} · {timeOf(b.start)} – {timeOf(b.end)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-a-text-2">{t('appointments.panel.price', 'Price')}</dt><dd className="text-a-text text-right">
            <span className="font-semibold">{money(b.price.total, b.price.currency)}</span>
            {b.price.discount_label && <span className="text-a-text-2"> · {b.price.discount_label}</span>}
          </dd></div>
          <div className="flex justify-between gap-3"><dt className="text-a-text-2">{t('appointments.list.payment', 'Payment')}</dt><dd className="text-a-text text-right">
            {t(`appointments.payment.${b.payment.state}`)}
            {b.payment.refunded_amount !== null && <span className="text-a-text-2"> · {money(b.payment.refunded_amount, b.payment.currency)}</span>}
          </dd></div>
          <div className="flex justify-between gap-3"><dt className="text-a-text-2">{t('appointments.panel.reference', 'Reference')}</dt><dd className="text-a-text-2">{b.reference}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-a-border p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-a-text">{b.client.name}</span>
          {b.client.id !== null && <Link to={`/appointments/clients/${b.client.id}`} className="text-a-accent-deep font-semibold underline-offset-2 hover:underline">{t('appointments.client.open_profile', 'Open profile')}</Link>}
        </div>
        <div className="text-a-text-2">{[b.client.phone, b.client.email].filter(Boolean).join(' · ') || t('appointments.client.no_contact', 'No contact details')}</div>
        {b.client.id === null && <p className="mt-1 text-xs text-a-text-2">{t('appointments.client.unlinked', 'This booking is not linked to a client record.')}</p>}
      </section>

      <LoyaltyCard card={b.loyalty} preview={complete?.allowed ? complete.consequences.points : null} />

      {(b.notes.staff || b.notes.customer) && (
        <section className="text-sm">
          {b.notes.staff && <p><span className="font-semibold text-a-text">{t('appointments.panel.staff_note', 'Note for the team')}:</span> <span className="text-a-text-2">{b.notes.staff}</span></p>}
          {b.notes.customer && <p><span className="font-semibold text-a-text">{t('appointments.panel.client_note', 'Note from the client')}:</span> <span className="text-a-text-2">{b.notes.customer}</span></p>}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {labels.filter(([key]) => allowed(key)).map(([key, label, variant]) => (
          <Button key={key} type="button" size="sm" variant={variant} disabled={saving} onClick={() => onAction(key)}>{label}</Button>
        ))}
      </div>

      <History entries={b.history} zone={zone} locale={locale} />
    </div>
  )
}
```

- [ ] **Step 6: The confirm step and the move form**

Create `frontend/src/appointments/panel/ActionConfirm.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { ActionInfo, ActionKey, AppointmentDetail } from '../lib/types'
import { timeOf } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { consequenceLines } from './consequences'
import type { PanelError } from './panelState'

interface Props {
  booking: AppointmentDetail
  action: ActionInfo
  reason: string
  saving: boolean
  error: PanelError | null
  onReason: (reason: string) => void
  onConfirm: () => void
  onBack: () => void
}

const TITLE: Partial<Record<ActionKey, [string, string]>> = {
  confirm:            ['appointments.action.confirm', 'Confirm'],
  complete:           ['appointments.action.complete', 'Complete'],
  no_show:            ['appointments.action.no_show', 'No-show'],
  cancel:             ['appointments.action.cancel', 'Cancel appointment'],
  mark_paid_at_venue: ['appointments.action.mark_paid_at_venue', 'Mark paid at venue'],
}

/** What this action will really do, stated before the button that does it. */
export function ActionConfirm({ booking, action, reason, saving, error, onReason, onConfirm, onBack }: Props) {
  const { t } = useTranslation()
  const [key, fallback] = TITLE[action.key] ?? ['appointments.action.confirm', 'Confirm']
  const label = t(key, fallback)
  const destructive = action.key === 'cancel' || action.key === 'no_show'

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-semibold text-a-text">{label}</div>
        <div className="text-sm text-a-text-2">{booking.client.name} · {timeOf(booking.start)} – {timeOf(booking.end)}</div>
      </div>

      <ul className="space-y-2">
        {consequenceLines(action).map(line => (
          <li key={line.key}>
            {line.tone === 'warning'
              ? <Notice tone="warning">{t(line.key, line.fallback, line.vars)}</Notice>
              : <p className="text-sm text-a-text">{t(line.key, line.fallback, line.vars)}</p>}
          </li>
        ))}
      </ul>

      {action.key === 'cancel' && (
        <Field label={t('appointments.panel.reason', 'Reason')}>
          <textarea className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" rows={2} maxLength={255} value={reason} onChange={(e) => onReason(e.target.value)} />
        </Field>
      )}

      {error && <Notice tone="danger">{t(`appointments.error.${error.code}`, error.message)}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={destructive ? 'danger' : 'primary'} loading={saving} onClick={onConfirm}>{label}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onBack}>{t('appointments.common.back', 'Back')}</Button>
      </div>
    </div>
  )
}
```

Create `frontend/src/appointments/panel/MoveForm.tsx`:

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { appointmentsApi } from '../lib/api'
import type { AppointmentDetail, CalendarMaster, CatalogueService, DateKey, Wall } from '../lib/types'
import { dateOf, timeOf } from '../lib/wallClock'
import { useVocab } from '../lib/vocab'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import type { PanelError } from './panelState'

interface Props {
  booking: AppointmentDetail
  masters: CalendarMaster[]
  services: CatalogueService[]
  today: DateKey
  saving: boolean
  error: PanelError | null
  onMove: (start: Wall, masterId: number) => void
  onBack: () => void
}

const control = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Move by choosing a day, a person and one of the server's free times —
 * the ordinary-edit way to reschedule (there is no drag in this
 * milestone). The free times already leave this appointment out, so its own
 * slot is offered.
 */
export function MoveForm({ booking, masters, services, today, saving, error, onMove, onBack }: Props) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const [date, setDate] = useState<DateKey>(dateOf(booking.start) < today ? today : dateOf(booking.start))
  const [masterId, setMasterId] = useState<number | null>(booking.master?.id ?? null)
  const [start, setStart] = useState<Wall | ''>('')

  const service = services.find(s => s.id === booking.service?.id) ?? null
  const eligible = masters.filter(m => service === null || service.master_ids.includes(m.id))

  const slots = useQuery({
    queryKey: ['appointments', 'slots', booking.service?.id ?? null, masterId, date, booking.id],
    queryFn: () => appointmentsApi.slots(booking.service!.id, masterId!, date, booking.id),
    enabled: booking.service !== null && masterId !== null,
  })
  const chosen = slots.data?.slots.find(s => s.start === start) ?? null

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (chosen && masterId !== null && !saving) onMove(chosen.start, masterId) }}>
      <div>
        <div className="text-base font-semibold text-a-text">{t('appointments.action.move', 'Move')}</div>
        <div className="text-sm text-a-text-2">{booking.client.name} · {timeOf(booking.start)} – {timeOf(booking.end)}</div>
      </div>

      <Field label={t('appointments.panel.date', 'Date')}>
        <input type="date" className={control} min={today} value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setStart('') } }} />
      </Field>
      <Field label={vocab('team_member')}>
        <select className={control} value={masterId ?? ''} onChange={(e) => { setMasterId(e.target.value ? Number(e.target.value) : null); setStart('') }}>
          {eligible.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label={t('appointments.panel.time', 'Time')}>
        <select className={control} value={chosen ? start : ''} disabled={!slots.data} onChange={(e) => setStart(e.target.value)}>
          <option value="">{slots.isFetching ? t('appointments.common.loading', 'Loading…') : t('appointments.panel.choose_time', 'Choose a time…')}</option>
          {slots.data?.slots.map(s => <option key={s.start} value={s.start}>{s.label}</option>)}
        </select>
      </Field>
      {slots.data && slots.data.slots.length === 0 && <Notice tone="info">{t('appointments.panel.no_slots', 'No free time on this day for this service and team member.')}</Notice>}
      {chosen && <p className="text-sm text-a-text">{t('appointments.panel.move_to', 'New time: {{start}} – {{end}}', { start: timeOf(chosen.start), end: timeOf(chosen.end) })}</p>}

      <p className="text-sm text-a-text-2">{t('appointments.consequence.no_message', 'No message is sent to the client.')}</p>
      {error && <Notice tone="danger">{t(`appointments.error.${error.code}`, error.message)}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!chosen} loading={saving}>{t('appointments.panel.save_move', 'Move appointment')}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onBack}>{t('appointments.common.back', 'Back')}</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 7: Put the view mode into the panel**

In `frontend/src/appointments/panel/AppointmentPanel.tsx`:

1. Extend the imports:

```tsx
import { useTranslation } from 'react-i18next'
```
stays; add

```tsx
import { useBoot } from '../AppointmentsProvider'
import type { ActionKey, AppointmentDetail, CalendarMaster, CatalogueService, DateKey, PointsResult, Wall } from '../lib/types'
import { Notice } from '../ui/Notice'
import { ActionConfirm } from './ActionConfirm'
import { AppointmentView } from './AppointmentView'
import { MoveForm } from './MoveForm'
import { NEEDS_CONFIRM } from './consequences'
```
(the `import type { CalendarMaster, CatalogueService, DateKey } from '../lib/types'` line is replaced by the wider one above).

2. Change `const { t } = useTranslation()` to `const { t, i18n } = useTranslation()` and add `const boot = useBoot()` below it.

3. Directly after the `save` function, add:

```tsx
  const id = state.mode === 'view' ? state.id : null
  const detail = useQuery({
    queryKey: ['appointments', 'booking', id],
    queryFn: () => appointmentsApi.booking(id!),
    enabled: id !== null,
    refetchInterval: 30_000,
  })
  const booking = detail.data?.booking

  const settle = (next: AppointmentDetail, outcome: PointsResult | null) => {
    queryClient.setQueryData(['appointments', 'booking', next.id], { booking: next })
    void queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] })
    dispatch({ type: 'done', outcome })
  }

  const refuse = (e: unknown) => {
    const failure = failureOf(e)
    // Someone changed it first: show what it is now.
    if (failure.code === 'stale' && failure.current) {
      queryClient.setQueryData(['appointments', 'booking', failure.current.id], { booking: failure.current })
      void queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] })
    }
    if (failure.code === 'slot_taken') void queryClient.invalidateQueries({ queryKey: ['appointments', 'slots'] })
    dispatch({ type: 'failed', error: { code: failure.code, message: failure.message } })
  }

  const act = async (action: ActionKey, reason?: string) => {
    if (!booking) return
    dispatch({ type: 'saving' })
    try {
      const result = await appointmentsApi.act(booking.id, { action, revision: booking.revision, ...(reason?.trim() ? { reason: reason.trim() } : {}) })
      settle(result.booking, result.points)
    } catch (e) {
      refuse(e)
    }
  }

  const move = async (start: Wall, masterId: number) => {
    if (!booking) return
    dispatch({ type: 'saving' })
    try {
      const result = await appointmentsApi.move(booking.id, { start, master_id: masterId, revision: booking.revision })
      settle(result.booking, null)
    } catch (e) {
      refuse(e)
    }
  }

  const onAction = (action: ActionKey) => {
    if (action === 'move') dispatch({ type: 'startMove' })
    else if (NEEDS_CONFIRM.has(action)) dispatch({ type: 'askConfirm', action })
    else void act(action)
  }
```

4. Replace the comment `{/* Task 18: the view mode renders here. */}` with:

```tsx
        {state.mode === 'view' && detail.isLoading && <p className="text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
        {state.mode === 'view' && detail.isError && !booking && <Notice tone="danger">{t('appointments.panel.load_failed', 'This appointment could not be loaded.')}</Notice>}

        {state.mode === 'view' && booking && state.sub === 'summary' && (
          <AppointmentView booking={booking} zone={boot.venue.timezone} locale={i18n.language || 'en'}
            saving={state.saving} error={state.error} outcome={state.outcome} onAction={onAction} />
        )}

        {state.mode === 'view' && booking && state.sub === 'move' && (
          <MoveForm booking={booking} masters={masters} services={services} today={today}
            saving={state.saving} error={state.error}
            onMove={(start, masterId) => { void move(start, masterId) }} onBack={() => dispatch({ type: 'back' })} />
        )}

        {state.mode === 'view' && booking && state.sub === 'confirm' && state.action !== null && (() => {
          const info = booking.actions.find(a => a.key === state.action)
          return info ? (
            <ActionConfirm booking={booking} action={info} reason={state.reason} saving={state.saving} error={state.error}
              onReason={(reason) => dispatch({ type: 'setReason', reason })}
              onConfirm={() => { void act(info.key, state.reason) }} onBack={() => dispatch({ type: 'back' })} />
          ) : null
        })()}
```

- [ ] **Step 8: Run the tests, type check, lint**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments 2>&1 | tail -n 10 && npx tsc -b && npx eslint src/appointments
```
Expected: `consequences` 8 and `appointmentView` 11 pass with the rest; silent `tsc` and eslint.

- [ ] **Step 9: Work an appointment in the browser**

You need a client who is a member. Add a client with an email address in the create panel: the organisation has a programme (Task 14 Step 9), so the client is enrolled when the record is created. If their card still says "Not a member", add them as a member with the same email in the full admin (Members → Add member). Book an appointment for that client, then open it — status, payment and membership are three separate lines; "Completing awards N points" is shown. Press Move, choose another time, save: the card moves and the full admin shows the new time. Press Arrived: the status changes with no confirm step. Press Complete: the confirm step states the points; confirm; the panel says "N points awarded" and the member's balance in the full admin (`/members/<id>`) rose by N, once. Open a second browser window on the same appointment, change it in one, then act in the other: "changed by someone else" and the panel shows the current state. Cancel another booking: the reason field and the consequences are shown before the button. Screenshot `shots/task-18-view.png`, `task-18-confirm.png`, `task-18-stale.png`.

- [ ] **Step 10: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add frontend/src/appointments/panel && git commit -q -F - <<'EOF'
View, move and act on an appointment with its membership in view

The panel shows status, payment and loyalty as three statements, offers
only the actions the server allows, and states each action's real
consequences before its button. Moving picks one of the server's free
times. A save over someone else's change shows the current appointment.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---

### Task 19: Clients — search, profile, book again

**Files:**
- Replace: `frontend/src/appointments/clients/ClientsPage.tsx`, `ClientProfile.tsx`
- Create: `frontend/src/appointments/clients/ClientProfileView.tsx`, `clientProfile.test.tsx`

**Interfaces:**
- Consumes: `appointmentsApi.searchClients()`, `client()`; types `ClientProfile as ClientProfileData`, `AppointmentSummary`; `LoyaltyCard` (Task 18); `StatusMark`; `formatDate`, `timeOf`, `dateOf`; `useVocab()`.
- Produces: `bookAgainPath(profile: ClientProfileData): string`; `openPath(a: AppointmentSummary): string`; `ClientProfileView` props `{ profile: ClientProfileData; locale: string }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/appointments/clients/clientProfile.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClientProfileView, bookAgainPath, openPath } from './ClientProfileView'
import type { AppointmentSummary, ClientProfile } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('react-router-dom', () => ({ Link: ({ to, children, className }: { to: string; children: unknown; className?: string }) => <a href={to} className={className}>{children as never}</a> }))

const appt = (id: number, start: string, status: AppointmentSummary['status']): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end: start.replace(':00', ':45'), duration_minutes: 45,
  service: { id: 3, name: 'Manicure' }, master: { id: 2, name: 'Olivia' },
  client: { id: 5, name: 'Emily Johnson', is_member: true }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})

const profile: ClientProfile = {
  client: { id: 5, name: 'Emily Johnson', phone: '+44 7700 900777', email: 'emily@example.test', member: { id: 9, number: 'HL-9', tier: 'Silver', points: 340 } },
  upcoming: [appt(11, '2026-10-09T11:00', 'confirmed')],
  past: [appt(10, '2026-09-12T15:00', 'completed')],
  matched_by_email: [appt(3, '2026-06-01T09:00', 'completed')],
  loyalty: { member: { id: 9, number: 'HL-9', tier: 'Silver', points: 340 }, benefits: [] },
  last: { service_id: 3, master_id: 2 },
}

const render = (p: ClientProfile) => renderToStaticMarkup(<ClientProfileView profile={p} locale="en-GB" />)

describe('bookAgainPath / openPath', () => {
  it('book again preselects the client, the last service and person — never a time or a price', () => {
    expect(bookAgainPath(profile)).toBe('/appointments?new=1&client=5&service=3&master=2')
    expect(bookAgainPath({ ...profile, last: { service_id: 3, master_id: null } })).toBe('/appointments?new=1&client=5&service=3')
    expect(bookAgainPath({ ...profile, last: null })).toBe('/appointments?new=1&client=5')
  })

  it('an appointment opens on its own day in the calendar', () => {
    expect(openPath(profile.upcoming[0])).toBe('/appointments?open=11&date=2026-10-09')
  })
})

describe('ClientProfileView', () => {
  it('shows contact details, the membership and a prominent Book again', () => {
    const html = render(profile)
    expect(html).toContain('Emily Johnson')
    expect(html).toContain('+44 7700 900777')
    expect(html).toContain('emily@example.test')
    expect(html).toContain('Silver')
    expect(html).toContain('340')
    expect(html).toContain('href="/appointments?new=1&amp;client=5&amp;service=3&amp;master=2"')
    expect(html).toContain('Book again')
  })

  it('lists upcoming and past appointments, each a link to the calendar', () => {
    const html = render(profile)
    expect(html).toContain('href="/appointments?open=11&amp;date=2026-10-09"')
    expect(html).toContain('href="/appointments?open=10&amp;date=2026-09-12"')
    expect(html.indexOf('Upcoming')).toBeLessThan(html.indexOf('Past'))
    expect(html).toContain('Manicure')
    expect(html).toContain('appointments.status.completed')
  })

  it('labels bookings that only share the email, and hides the section when there are none', () => {
    expect(render(profile)).toContain('Matched by email')
    expect(render({ ...profile, matched_by_email: [] })).not.toContain('Matched by email')
  })

  it('says when there is nothing yet', () => {
    const html = render({ ...profile, upcoming: [], past: [], matched_by_email: [], last: null })
    expect(html).toContain('No upcoming appointments.')
    expect(html).toContain('No past appointments.')
    expect(html).toContain('Book an appointment')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments/clients 2>&1 | tail -n 8
```
Expected: FAIL — cannot resolve `./ClientProfileView`.

- [ ] **Step 3: The profile view**

Create `frontend/src/appointments/clients/ClientProfileView.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import type { AppointmentSummary, ClientProfile } from '../lib/types'
import { dateOf, formatDate, timeOf } from '../lib/wallClock'
import { LoyaltyCard } from '../panel/LoyaltyCard'
import { StatusMark } from '../ui/StatusMark'

/**
 * "Book again" carries who, what and with whom — never a time or a price.
 * The calendar's create panel asks the server for today's free times and
 * today's price, so nothing about the old booking is copied blindly.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function bookAgainPath(profile: ClientProfile): string {
  const params = new URLSearchParams({ new: '1', client: String(profile.client.id) })
  if (profile.last) {
    params.set('service', String(profile.last.service_id))
    if (profile.last.master_id !== null) params.set('master', String(profile.last.master_id))
  }
  return `/appointments?${params.toString()}`
}

// eslint-disable-next-line react-refresh/only-export-components
export function openPath(a: AppointmentSummary): string {
  return `/appointments?open=${a.id}&date=${dateOf(a.start)}`
}

function Rows({ rows, locale, empty }: { rows: AppointmentSummary[]; locale: string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-a-text-2">{empty}</p>
  return (
    <ul className="divide-y divide-a-border rounded-lg border border-a-border bg-a-surface">
      {rows.map(a => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
          <Link to={openPath(a)} className="font-semibold text-a-accent-deep underline-offset-2 hover:underline">
            {formatDate(dateOf(a.start), locale)} · {timeOf(a.start)} – {timeOf(a.end)}
          </Link>
          <span className="text-a-text-2">{a.service?.name ?? '—'} · {a.master?.name ?? '—'}</span>
          <StatusMark status={a.status} />
        </li>
      ))}
    </ul>
  )
}

export function ClientProfileView({ profile, locale }: { profile: ClientProfile; locale: string }) {
  const { t } = useTranslation()
  const { client } = profile

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-a-text">{client.name}</h1>
          <p className="text-sm text-a-text-2">{[client.phone, client.email].filter(Boolean).join(' · ') || t('appointments.client.no_contact', 'No contact details')}</p>
        </div>
        <Link to={bookAgainPath(profile)} className="inline-flex items-center gap-2 rounded-lg bg-a-accent text-a-accent-ink hover:bg-a-accent-deep px-4 py-2.5 text-sm font-semibold">
          <CalendarPlus size={16} aria-hidden />
          {profile.last ? t('appointments.client.book_again', 'Book again') : t('appointments.client.book_first', 'Book an appointment')}
        </Link>
      </header>

      <LoyaltyCard card={profile.loyalty} preview={null} />

      <section>
        <h2 className="text-sm font-semibold text-a-text mb-2">{t('appointments.client.upcoming', 'Upcoming')}</h2>
        <Rows rows={profile.upcoming} locale={locale} empty={t('appointments.client.no_upcoming', 'No upcoming appointments.')} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-a-text mb-2">{t('appointments.client.past', 'Past')}</h2>
        <Rows rows={profile.past} locale={locale} empty={t('appointments.client.no_past', 'No past appointments.')} />
      </section>

      {profile.matched_by_email.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-a-text">{t('appointments.client.matched_by_email', 'Matched by email')}</h2>
          <p className="text-xs text-a-text-2 mb-2">{t('appointments.client.matched_hint', 'Older bookings made with this email address. They are not linked to this client record.')}</p>
          <Rows rows={profile.matched_by_email} locale={locale} empty="" />
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 4: The two pages**

Replace `frontend/src/appointments/clients/ClientProfile.tsx` with:

```tsx
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { appointmentsApi, failureOf } from '../lib/api'
import { useVocab } from '../lib/vocab'
import { Notice } from '../ui/Notice'
import { ClientProfileView } from './ClientProfileView'

export function ClientProfile() {
  const { t, i18n } = useTranslation()
  const vocab = useVocab()
  const { id } = useParams()
  const clientId = id && /^\d+$/.test(id) ? Number(id) : null

  const query = useQuery({
    queryKey: ['appointments', 'client', clientId],
    queryFn: () => appointmentsApi.client(clientId!),
    enabled: clientId !== null,
  })

  return (
    <div>
      <div className="px-6 pt-4">
        <Link to="/appointments/clients" className="text-sm font-semibold text-a-accent-deep underline-offset-2 hover:underline">← {vocab('clients')}</Link>
      </div>
      {query.isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {(clientId === null || query.isError) && (
        <div className="p-6 max-w-xl">
          <Notice tone="danger">
            {clientId !== null && failureOf(query.error).code !== 'client_not_found'
              ? t('appointments.common.error', 'Something went wrong. Please try again.')
              : t('appointments.client.not_found', 'This client no longer exists.')}
          </Notice>
        </div>
      )}
      {query.data && <ClientProfileView profile={query.data} locale={i18n.language || 'en'} />}
    </div>
  )
}
```

Replace `frontend/src/appointments/clients/ClientsPage.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { appointmentsApi } from '../lib/api'
import { useVocab } from '../lib/vocab'
import { Notice } from '../ui/Notice'

/** Find a client. The list is the organisation's own clients — the people the full admin lists under Customers. */
export function ClientsPage() {
  const { t } = useTranslation()
  const vocab = useVocab()
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('search') ?? '')
  const [debounced, setDebounced] = useState(term.trim())

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  // The top bar's search lands here with ?search=; keep the field and the address in step.
  useEffect(() => {
    const linked = params.get('search') ?? ''
    if (linked !== '' && linked !== term) setTerm(linked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])
  useEffect(() => {
    setParams(debounced.length >= 2 ? { search: debounced } : {}, { replace: true })
  }, [debounced, setParams])

  const query = useQuery({
    queryKey: ['appointments', 'clients', debounced],
    queryFn: () => appointmentsApi.searchClients(debounced),
    enabled: debounced.length >= 2,
  })

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-a-text">{vocab('clients')}</h1>
      <label className="block">
        <span className="sr-only">{t('appointments.shell.search', 'Search clients')}</span>
        <input value={term} onChange={(e) => setTerm(e.target.value)} autoFocus
          placeholder={t('appointments.client.search_placeholder', 'Name, phone or email')}
          className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2.5 text-sm text-a-text placeholder:text-a-text-2" />
      </label>

      {debounced.length < 2 && <p className="text-sm text-a-text-2">{t('appointments.client.search_hint', 'Type at least two characters to search.')}</p>}
      {query.isFetching && <p className="text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {query.isError && <Notice tone="danger">{t('appointments.common.error', 'Something went wrong. Please try again.')}</Notice>}
      {query.data && query.data.clients.length === 0 && <p className="text-sm text-a-text-2">{t('appointments.client.none_found', 'No one found.')}</p>}

      {query.data && query.data.clients.length > 0 && (
        <ul className="divide-y divide-a-border rounded-lg border border-a-border bg-a-surface">
          {query.data.clients.map(c => (
            <li key={c.id}>
              <Link to={`/appointments/clients/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-a-surface-2">
                <span>
                  <span className="block text-sm font-semibold text-a-text">{c.name}</span>
                  <span className="block text-xs text-a-text-2">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-xs text-a-text-2">
                  {c.member
                    ? t('appointments.client.member_line', 'Member · {{tier}} · {{points}} points', { tier: c.member.tier ?? '—', points: c.member.points })
                    : t('appointments.client.not_member', 'Not a member')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the tests, type check, lint**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments 2>&1 | tail -n 10 && npx tsc -b && npx eslint src/appointments
```
Expected: `clientProfile` 6 pass with the rest; silent `tsc` and eslint.

- [ ] **Step 6: Look at it**

Type a name in the top bar's search and press Enter: the Clients page opens with results. Open a client: contact details, membership, upcoming and past appointments. Press Book again: the calendar opens with the create panel, the client, the last service and team member chosen, and no time — choose one from today's free times. Click an appointment in the profile: the calendar opens on its day with the panel on it. Screenshot `shots/task-19-clients.png`, `task-19-profile.png`.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add frontend/src/appointments/clients && git commit -q -F - <<'EOF'
Find a client, see their visits and membership, and book again

The profile lists upcoming and past appointments and the real membership.
Book again carries the client, the last service and the team member into
the create panel, where the time and the price are asked afresh.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

---
### Task 20: Keyboard, zoom and visual pass

The workspace is now complete enough to judge with eyes and hands. This task finds what tests cannot: a focus that gets lost, a label that reads wrong aloud, a layout that breaks at 200 %, a style that leaked. The target is WCAG 2.2 AA; **no conformance is claimed** — the task records what was checked.

If your harness offers skills, load `hexatech-house-style` and `frontend-design` for the visual judgement in Step 4 only. The tokens, the structure and every string are fixed by this plan; the pass may change spacing, sizes and emphasis, never add a decorative element, a gradient, a promotion or a number nothing real backs.

**Files:**
- Modify (only what the pass finds): files under `frontend/src/appointments/`
- Create (untracked): `.superpowers/sdd/2026-09-30-appointments-workspace/a11y-pass.md`, screenshots under `shots/`

**Interfaces:** none change. A fix that needs a new string adds the key to all five bundles.

- [ ] **Step 1: Keyboard only — no mouse**

Servers as in Task 14 Step 9. Put the mouse away and do each of these; write PASS or what went wrong into `a11y-pass.md`:

1. From the address bar, Tab reaches: rail links, search, New appointment, toolbar controls, then the grid's free slots column by column, then the cards.
2. Focus is visible on every stop, including on the dark rail.
3. Enter on a free slot opens the panel; focus lands on its heading; Tab stays in a sensible order (client, date, team member, service, time, booked, note, Save).
4. Book an appointment end to end (search a client, choose a service and a time, Save).
5. Esc closes the panel; focus returns to the slot or card that opened it.
6. Open the appointment; Move it (date, team member, time, Move appointment).
7. Cancel it: the consequences are read before the button; the reason field is reachable; Back returns without cancelling.
8. Switch to List with the keyboard; every row's time is a stop and opens the panel.
9. The mini month: every day is a stop; Enter jumps the calendar.
10. Clients: search, open a profile, Book again.

- [ ] **Step 2: Names and roles**

With the chrome-devtools tools (or the browser's accessibility inspector), take an accessibility snapshot of `/appointments` with the panel open and check, recording each in `a11y-pass.md`:

- every button and link has a name (icon-only buttons included: previous, next, refresh, close, change client);
- every form control has a label;
- a status is announced as a word, never only as a colour or an icon;
- the panel is a `dialog` with its title as its name; the list is a `table` with column headers and a header row per day;
- the calendar's free slots announce "Book <name> at <time>".

Run Lighthouse's accessibility audit on `/appointments` (day view, panel closed) and on `/appointments/clients`. Fix every finding it reports in the workspace's own markup; record the score and any finding you judge a false positive, with the reason.

- [ ] **Step 3: Size and zoom**

At 1440, 1280 and 1024 px wide, and at 1440 with the browser zoomed to 200 %:

- nothing overlaps or is cut off; the grid scrolls sideways rather than crushing columns;
- the panel is fully usable (at 200 % it may cover the grid — it must scroll inside itself);
- below 1024 px the list is shown and the Day/Week/List toggle is gone.

Screenshot each into `shots/task-20-<width>[-zoom].png`.

- [ ] **Step 4: Visual judgement against the owner's mockup**

Put `shots/task-15-day.png` beside the owner's mockup (the image attached to the brief: dark rail, team columns, right rail with a mini month and a day overview, status legend). The workspace should read as the same product idea in HexaTech's own, calmer language: a light canvas, one teal-blue accent, statuses as icon and word. Check and fix:

- appointment text is never smaller than 12 px, and body text is 14 px;
- a 30-minute card shows its time and client without clipping;
- the status legend matches the cards exactly;
- nothing on screen is a promotion, a trend arrow or a percentage.

- [ ] **Step 5: The full admin is untouched**

Start a second pair of servers from `C:\wamp64\www\Hexa-Tech-portal` (its source is production main) on other ports (`MAIL_MAILER=log QUEUE_CONNECTION=sync CORS_ALLOWED_ORIGINS=http://localhost:5181 … artisan serve --host=127.0.0.1 --port=8011`, and `VITE_API_URL=http://127.0.0.1:8011/api npx vite --port 5181`). Sign in to both as the same staff user and screenshot at 1440, from each: `/` (dashboard), `/service-bookings`, `/service-bookings/calendar`, `/settings`. Compare pair by pair. They must be indistinguishable: same fonts, colours, spacing, scrollbars, date pickers. Save as `shots/task-20-admin-<page>-main.png` and `…-branch.png`.

In the branch's full admin, run in the console: `document.querySelectorAll('[data-appointments]').length` → `0`.

- [ ] **Step 6: Re-run the checks and commit what the pass changed**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx tsc -b && npx vitest run src/appointments src/i18n/localeCompleteness.test.ts 2>&1 | tail -n 8 && npx eslint src/appointments
```
Expected: all pass, silent `tsc` and eslint.

If the pass changed files:

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add frontend/src/appointments && git commit -q -F - <<'EOF'
Fix what the keyboard, zoom and visual pass found in the workspace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```
Replace the subject's body with one line per fix. If the pass changed nothing, do not commit; say so in `a11y-pass.md`.

---

### Task 21: Live pass on PostgreSQL, the runbook, and the report

The PHP suite runs on sqlite, where the advisory lock does nothing and two requests cannot interleave. Everything this milestone promises about simultaneous use is proven here, on the local PostgreSQL, against the test organisation — never on a customer's data.

**Files:**
- Create (untracked): `.superpowers/sdd/2026-09-30-appointments-workspace/tools/race-probe.php`
- Create: `docs/appointments-workspace.md`
- Modify: `CLAUDE.md` (one section, directly above `## Secrets`)
- Modify (untracked): `.superpowers/sdd/2026-09-30-appointments-workspace/progress.md`

**Interfaces:**
- Consumes: `StaffBookingWriter::create()`, `ServiceSchedulingService::reserveSlot()`, `AdvisoryLock::within()`, `VenueClock::parse()`.

- [ ] **Step 1: Write the race probe**

Create `.superpowers/sdd/2026-09-30-appointments-workspace/tools/race-probe.php`:

```php
<?php
/**
 * Race probe for the appointments workspace. Local PostgreSQL only: sqlite
 * cannot show a lock. Run from the worktree root with MAIL_MAILER=log
 * QUEUE_CONNECTION=sync in the environment.
 *
 *   hold  <org> <service> <master> <wall>
 *       A named booking, as every entry point makes one: takes the team
 *       member's lock, checks the slot, then WAITS 4 s before it books — so
 *       a second process has time to race it.
 *   any   <org> <service> <wall>
 *       An "any team member" booking, as the public widget makes one.
 *   staff <org> <service> <master> <wall> <client> <key>
 *       The workspace's own create, with that Idempotency-Key.
 *
 * <wall> is the venue's wall clock: 2026-10-20T10:00.
 */

use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\StaffBookingWriter;
use App\Services\Appointments\VenueClock;
use App\Services\ServiceSchedulingService;
use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\DB;

$root = dirname(__DIR__, 4);
require $root . '/vendor/autoload.php';
$app = require $root . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$mode = $argv[1] ?? '';
$orgId = (int) ($argv[2] ?? 0);
$serviceId = (int) ($argv[3] ?? 0);

if (DB::getDriverName() !== 'pgsql') {
    fwrite(STDERR, "This probe needs PostgreSQL; the connection is " . DB::getDriverName() . ".\n");
    exit(2);
}

app()->instance('current_organization_id', $orgId);
$service = Service::findOrFail($serviceId);
$scheduler = app(ServiceSchedulingService::class);
$say = fn (string $line) => print('[' . date('H:i:s') . "] {$mode}: {$line}\n");

$start = function (string $wall): string {
    $parsed = VenueClock::parse($wall);
    if (!$parsed) {
        fwrite(STDERR, "Give the time as YYYY-MM-DDTHH:mm.\n");
        exit(2);
    }

    return $parsed->toIso8601String();
};

$book = fn (int $masterId, array $slot) => ServiceBooking::create([
    'organization_id'   => $orgId,
    'service_id'        => $service->id,
    'service_master_id' => $masterId,
    'customer_name'     => "Race probe ({$mode})",
    'customer_email'    => 'race-probe@example.test',
    'start_at'          => $slot['start'],
    'end_at'            => $slot['end'],
    'duration_minutes'  => $slot['duration_minutes'],
    'service_price'     => $slot['price'],
    'total_amount'      => $slot['price'],
    'currency'          => $service->currency ?: 'EUR',
    'status'            => 'confirmed',
    'payment_status'    => 'unpaid',
    'source'            => 'admin',
]);

if ($mode === 'hold') {
    $masterId = (int) $argv[4];
    $at = $start($argv[5]);
    DB::transaction(function () use ($scheduler, $service, $masterId, $at, $book, $say) {
        AdvisoryLock::within("svcm:{$masterId}");
        $slot = $scheduler->reserveSlot($service, $masterId, $at);
        $say("the slot is free; holding team member {$masterId}'s lock for 4 s");
        sleep(4);
        $booking = $book($masterId, $slot);
        $say("booked #{$booking->id} with team member {$masterId}");
    });
    exit(0);
}

if ($mode === 'any') {
    $at = $start($argv[4]);
    DB::transaction(function () use ($scheduler, $service, $at, $book, $say) {
        AdvisoryLock::within("svc:{$service->id}");
        try {
            $slot = $scheduler->reserveSlot($service, null, $at);
        } catch (\PDOException $e) {
            throw $e;
        } catch (\RuntimeException) {
            $say('refused — nobody is free at that time');

            return;
        }
        $booking = $book($slot['master']->id, $slot);
        $say("booked #{$booking->id} with team member {$slot['master']->id}");
    });
    exit(0);
}

if ($mode === 'staff') {
    $actor = User::where('organization_id', $orgId)->where('user_type', 'staff')->orderBy('id')->firstOrFail();
    try {
        $result = app(StaffBookingWriter::class)->create(
            ['client_id' => (int) $argv[6], 'service_id' => $serviceId, 'master_id' => (int) $argv[4], 'start' => $argv[5]],
            (string) $argv[7],
            $actor,
        );
        $say(($result['replayed'] ? 'replayed' : 'booked') . " #{$result['booking']->id}");
    } catch (AppointmentRefused $e) {
        $say("refused — {$e->errorCode}");
    }
    exit(0);
}

fwrite(STDERR, "Modes: hold | any | staff. See the header of this file.\n");
exit(2);
```

- [ ] **Step 2: Choose the probe's data**

The probe needs a service two team members perform, both working on the chosen day, and one client. After Task 14 Step 9 the test organisation has exactly that: service `6` (Signature Cut & Finish), team members `4` (Marie) and `5` (Anouk). Confirm it, and find a client id:

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && MAIL_MAILER=log QUEUE_CONNECTION=sync /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="app()->instance('current_organization_id', 16); echo json_encode(['performs_service_6' => App\Models\Service::find(6)?->masters()->pluck('service_masters.name', 'service_masters.id'), 'clients' => App\Models\Guest::orderBy('id')->limit(3)->pluck('full_name', 'id')], JSON_PRETTY_PRINT);"
```
Expected: `performs_service_6` lists at least `4` and `5`; `clients` lists at least one client. Choose a day `D` at least a week ahead on which both work and neither has anything booked (look at it in the workspace). Write the client id `C` and the day `D` into `progress.md`.

Every probe command below starts with this line — shell variables do not survive between commands, so paste it each time with your `C` and `D`:

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && export MAIL_MAILER=log QUEUE_CONNECTION=sync && PHP=/c/wamp64/bin/php/php8.4.20/php.exe PROBE=.superpowers/sdd/2026-09-30-appointments-workspace/tools/race-probe.php C=<client id> D=<YYYY-MM-DD>
```

- [ ] **Step 3: A named booking against an "any team member" booking (the window Task 2 closed)**

```bash
<the line from Step 2>; ($PHP $PROBE hold 16 6 4 ${D}T10:00 & sleep 1; $PHP $PROBE any 16 6 ${D}T10:00; wait)
```

Expected, in this order (this is the output the plan's own check produced on 2026-09-30):

```
[11:55:13] hold: the slot is free; holding team member 4's lock for 4 s
[11:55:17] hold: booked #15 with team member 4
[11:55:17] any: booked #16 with team member 5
```

The `any` line comes about three seconds after it was started, and **after** `hold: booked` — that wait is the lock. It names team member 5 (or says `refused — nobody is free at that time` when 5 is busy). It must never name team member 4.

- [ ] **Step 4: The control — the same race without the fix shows the bug**

A probe that cannot fail proves nothing. Take the one line of the fix out of the working tree, race again at another time, and put it back:

```bash
<the line from Step 2>; F=app/Services/ServiceSchedulingService.php; cp $F storage/logs/sched-with-fix.php && grep -v 'this->lockCandidates(\$masters);' storage/logs/sched-with-fix.php > $F && ($PHP $PROBE hold 16 6 4 ${D}T12:00 & sleep 1; $PHP $PROBE any 16 6 ${D}T12:00; wait); git checkout $F && rm storage/logs/sched-with-fix.php && git status --short
```

Expected (the plan's own check, same day):

```
[11:55:25] hold: the slot is free; holding team member 4's lock for 4 s
[11:55:26] any: booked #17 with team member 4
[11:55:29] hold: booked #18 with team member 4
```

Two bookings for team member 4 at 12:00: the defect that is on production main today. `git status --short` prints nothing (the fix is back). Record both outputs in `progress.md`.

- [ ] **Step 5: Two staff bookings for one slot; one request sent twice**

```bash
<the line from Step 2>; ($PHP $PROBE hold 16 6 4 ${D}T14:00 & sleep 1; $PHP $PROBE staff 16 6 4 ${D}T14:00 $C probe-key-aaaaaaaa; wait)
```
Expected: `staff: refused — slot_taken`, printed after `hold: booked …`.

```bash
<the line from Step 2>; ($PHP $PROBE hold 16 6 4 ${D}T15:00 & sleep 1; $PHP $PROBE staff 16 6 4 ${D}T16:00 $C probe-key-bbbbbbbb & $PHP $PROBE staff 16 6 4 ${D}T16:00 $C probe-key-bbbbbbbb; wait)
```
(The hold on 15:00 is there only to make both 16:00 requests queue on the same lock.) Expected: one `staff: booked #N` and one `staff: replayed #N`, the same `N`.

```bash
<the line from Step 2>; ($PHP $PROBE hold 16 6 5 ${D}T15:00 & sleep 1; $PHP $PROBE staff 16 6 5 ${D}T16:00 $C probe-key-cccccccc & $PHP $PROBE staff 16 6 5 ${D}T16:00 $C probe-key-dddddddd; wait)
```
Two different requests for one slot. Expected: one `staff: booked #N` and one `staff: refused — slot_taken`.

- [ ] **Step 6: Tidy the probe's bookings**

Open the workspace on day `D`. Cancel every "Race probe" appointment and the client's two 16:00 appointments (they are ordinary bookings of the test organisation; the two double-booked 12:00 cards from the control sit side by side — that is the lane layout doing its job). Confirm the day's free slots are back.

- [ ] **Step 7: The walkthrough of the brief's §11, in two browser windows**

Window A: the workspace (`/appointments`). Window B: the full admin (`/service-bookings`), same organisation. Record each line in `progress.md` as PASS with a screenshot name, or what happened instead:

1. A: book a member client into a free slot. B: reload — the booking is there, with the member.
2. B: set its status to "In progress". A: within 30 seconds (or on Refresh) the card and the panel show it.
3. A: move it to another time. B: reload — the new time.
4. A: complete it — the confirm step states the points. B: `/members/<id>` — the balance rose by that amount, and the points history shows one entry for the appointment.
5. A: try Complete again — not offered. B: set the status to completed again — the balance does not change.
6. A: book a phone-only client (no email). B: the list, the detail drawer and the CSV export all show the booking.
7. Public widget (`http://127.0.0.1:8010/services/<widget token>`; the token is `organizations.widget_token` of organisation 16, also shown in the full admin under Settings → Booking): book a slot. A: it appears in the calendar. A: book a slot for a team member — the widget no longer offers that time.
8. A and A′ (a second workspace window): open one appointment in both; cancel it in A; press Arrived in A′ — "changed by someone else", and the panel shows it cancelled.
9. `storage/logs/laravel.log`: no mail was sent for any staff action (`grep -c "race-probe\|To:" storage/logs/laravel.log` shows only what the public widget booking in line 7 wrote).
10. Switch the flag off (`artisan workspace:appointments 16 --off`): A answers with the way back to the full admin; B still shows every booking made above. Switch it back on.

- [ ] **Step 8: Write the runbook**

Create `docs/appointments-workspace.md`:

```markdown
# Appointments workspace — runbook

A calendar-first staff workspace at `/appointments`, beside the full admin. It is a second shell over the same
records: `service_bookings`, `guests`, `loyalty_members`, the points ledger. Nothing is copied or synchronised.
Design: `docs/superpowers/specs/2026-09-30-appointments-workspace-design.md`.

## Switching it on and off

Every artisan command below is run as `php artisan …` in the application's environment.

| To | Run |
|---|---|
| Switch it on | `php artisan workspace:appointments <org id> --on` |
| Switch it on and land staff on it after sign-in | `php artisan workspace:appointments <org id> --on --landing` |
| Switch it off | `php artisan workspace:appointments <org id> --off` |
| See one organisation's setting | `php artisan workspace:appointments <org id> --status` |
| List every organisation that has it on | `php artisan workspace:appointments --list` |

The switch is `organizations.settings.workspaces.appointments`. No screen and no billing sync writes that column.

**Off means:** the workspace's API answers 403, `/appointments` sends staff back to the full admin, sign-in lands
on the dashboard. No data is deleted. Switching it off does **not** undo a booking, a status change or a points
award made while it was on.

## What it needs before it is useful

Set up in the full admin (the workspace has no screens for these yet): at least one active service, a team member
who performs it, that team member's weekly working hours, and the venue's time zone as a **name**
(Settings → General → Timezone, e.g. `Europe/London`; `UTC`, `EET` or `+03:00` leave the workspace on UTC and it
says so).

## What each action really does

| Action | Writes | Does not do |
|---|---|---|
| Book | A confirmed, unpaid service booking linked to the client and, for a member, the member. | Send the client anything. Apply a member price or a coupon. |
| Move | The time and the team member. Reference, service, price and payment are kept. | Send the client anything. |
| Confirm (a pending request) | Status `confirmed`. | — But the capture job will now charge a held card within about 10 minutes. |
| Arrived | Status `in_progress`. | — |
| Complete | Status `completed`, then the programme's points for a member, once. | Take a payment. |
| No-show | Status `no_show`. The capture job releases a held card. | Charge a no-show fee. Refund a captured payment. |
| Cancel | Status `cancelled`, the time and the reason. The capture job releases a held card. | Refund a captured payment (it is flagged `service_booking.capture.needs_refund` in the audit log for a manual refund in Stripe). Return a coupon. Tell the client. |
| Mark paid at venue | The label `payment_status = paid`, only on a booking with no card payment. | Move money. Record an amount or a method. |
| Award points | Runs the points award again for a completed visit whose award did not happen. | Award twice (the ledger key and the stamp on the booking prevent it). |

`completed`, `cancelled` and `no_show` are final in the workspace.

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
(`docs/landing-page-builder.md` §6). There is no migration. Three changes reach **every** organisation, flag or no
flag:

- `ServiceSchedulingService::reserveSlot()` takes each candidate's lock (no request, price, payload, assignment
  order or email changes);
- the full admin's service-booking audit rows gain their actor and their booking;
- sign-in and `/auth/me` carry a `workspaces` key — only for organisations that have one switched on.
```

- [ ] **Step 9: Add the code rules to CLAUDE.md**

In `CLAUDE.md`, directly above the line `## Secrets`:

```markdown
## Appointments-workspace code rules

- `frontend/src/appointments/` uses only `a-*` tokens and only `/v1/admin/appointments/…`; every string is
  `t('appointments.…')` in all five locales. Read `docs/appointments-workspace.md` before touching it.
- Appointment times are the venue's wall clock (`YYYY-MM-DDTHH:mm`, no offset). Never pass one to `new Date()`;
  use `frontend/src/appointments/lib/wallClock.ts` and, on the server, `App\Services\Appointments\VenueClock`.
- The workspace computes no availability, price, points or consequence of its own: slots come from
  `ServiceSchedulingService`, points from `BookingPointsService`, and what an action will do from
  `AppointmentActions`. A new rule goes into the shared service, not into a workspace controller or component.
- Every write takes the revision the client saw and answers `409 stale` on a mismatch; create takes an
  `Idempotency-Key`. Panel decisions live in pure functions (`panel/panelState.ts`, `panel/consequences.ts`)
  because the frontend tests render to a string.
- The workspace is opt-in: `php artisan workspace:appointments <org> --on`. Anything added to it stays behind
  `workspace:appointments`; a change that reaches organisations without the flag needs the owner's say-so.

```

- [ ] **Step 10: Final batteries**

Backend, by directory (write each `Tests:` line into `progress.md`): `artisan test tests/Feature/Appointments`, `tests/Unit/Appointments`, `tests/Feature/Booking`, `tests/Feature/Widget`, `tests/Feature/Member`, `tests/Feature/Admin`, `tests/Feature/Loyalty`, `tests/Feature/Stripe`, `tests/Feature/Auth`, `tests/Feature/ApiAuthentication`, `tests/Feature/Middleware`, `tests/Feature/ChatGptPortalNotes`, `tests/Unit`, and the files `tests/Feature/RouteUniquenessTest.php`, `tests/Feature/RouteControllersExistTest.php`.
Expected: the Task 0 baselines plus 140 new backend tests (135 under `tests/Feature/Appointments`, 5 under `tests/Unit/Appointments`), 0 failed.

Frontend:
```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx tsc -b && npx vitest run 2>&1 | tail -n 8 && npx eslint src/appointments src/App.tsx src/pages/Login.tsx src/stores/authStore.ts
```
Expected: the Task 0 baseline plus the workspace's tests; exactly 3 failures, all in `plannerMeta`.

The production build compiles and the workspace is its own chunk (built to a temp folder — the branch never commits a build):
```bash
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && OUT="$(cygpath -m "$TEMP")/appointments-build-check" && npx vite build --mode production --outDir "$OUT" --emptyOutDir 2>&1 | tail -n 5 && ls "$OUT/assets" | grep -c "AppointmentsApp" && grep -l "data-appointments" "$OUT"/assets/index-*.js | wc -l; cd /c/wamp64/www/Hexa-Tech-appointments && git status --short
```
Expected: the build succeeds; at least one `AppointmentsApp-*.js` chunk; `0` index bundles contain the workspace's markup (a staff session that never opens it never downloads it); `git status --short` shows nothing built.

- [ ] **Step 11: Commit the docs**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git add docs/appointments-workspace.md CLAUDE.md && git commit -q -F - <<'EOF'
Document the appointments workspace: runbook and code rules

How to switch it on and off, what each action really does and does not do,
how to put a mistake right, what the milestone leaves out, and what
reaches every organisation on deploy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -25
```

- [ ] **Step 12: Report to the owner**

In the final message (not a file), in this order: the journey that now works end to end; what was reused and what changed in shared code (the three changes that are not behind the flag, named as such); how to switch the workspace on and off for a test organisation; the tests actually run with their counts, and the live PostgreSQL results including the control run; what was only checked by hand; the remaining gaps and the production blockers from the runbook; and the statement that nothing was pushed or deployed. Say plainly anything that did not pass.

---
