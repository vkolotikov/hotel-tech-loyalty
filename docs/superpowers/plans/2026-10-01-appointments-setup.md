# HexaTech Appointments Part B — Setup in the workspace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A venue sets up and runs HexaTech Appointments without the full admin. The workspace gets services, team,
weekly hours, time off, booking settings and a setup checklist, all writing the records the full admin already uses.
The public widgets apply the booking notice on the venue's own clock.

**Architecture:**
- New `/v1/admin/appointments/setup/*` endpoints behind the existing `workspace:appointments` switch. They ask
  `SetupAccess` who may act, then call small shared rule classes in `App\Services\Booking\Setup\`.
- The full admin's `ServiceController` and `ServiceMasterController` share two of those rules: organisation-scoped
  links, and validated weekly hours.
- Every save that can strand appointments supports a dry run, and the workspace shows the stranded list before
  saving.

**Tech Stack:** Laravel 13 / PHP 8.4, PHPUnit on sqlite with the repo's schema traits; React 19, react-router 7,
TanStack Query 5, Tailwind 3.4 (`a-*` tokens), i18next (five bundles), Vitest static render.

**Spec:** `docs/superpowers/specs/2026-10-01-appointments-setup-design.md` (approved 2026-10-01; corrected by the
planning rulings below in the same commit as this plan).

## Global Constraints

- PHP is `/c/wamp64/bin/php/php8.4.20/php.exe`. Run one test path per `artisan test` call; never a bare
  `php artisan test`. Read the `Tests:` line yourself.
- Frontend checks: `cd frontend && npx vitest run <paths>`, `npx tsc -b`, `npx eslint src/appointments`. The 3
  `plannerMeta` failures in the whole-suite run are pre-existing.
- `frontend/src/appointments/` uses only `a-*` colour tokens and only `/v1/admin/appointments/…` API paths
  (`tokens.test.ts` enforces both).
- Every visible string is `t('appointments.…', 'English fallback')` and exists in all five
  `appointments.<lang>.json` bundles.
- Appointment times are the venue's wall clock (`YYYY-MM-DDTHH:mm`). Never pass one to `new Date()`; use
  `appointments/lib/wallClock.ts` and, on the server, `VenueClock`.
- No migration. No new table or column; the one new stored value is the HotelSetting `appointments_link_copied_at`.
- The workspace never deletes a service or a team member; it deactivates them.
- Roles (owner decision 1): a manager is `staff.role` `super_admin` or `manager` in the bound organisation. Everyone
  else may add and remove time off only for the team member whose `user_id` is their own. Refusals answer
  `403 {"error":"not_allowed"}`.
- Conflicts (owner decision 2): warn, list, still allow. Nothing is moved, cancelled or messaged automatically.
- The public widget's response shapes do not change; `PublicServiceAvailabilityZoneTest` stays green.
- Never commit `frontend/dist`, `public/spa` or `resources/spa-shell` on the feature branch. Stage files by name.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend test runs: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh <path>` from the feature
  worktree, or directly with
  `XDEBUG_MODE=off /c/wamp64/bin/php/php8.4.20/php.exe artisan test <path> --no-ansi`.

## Review Focus

1. **Sign-in links.** A team member's sign-in link may only be a staff user of this organisation, and only one team
   member per user. Another organisation's user, or a second link, answers 422. (Task 11 tests both.)
2. **24:00 ends.** A window ending at 24:00 must be bookable to the end of the day: a 45-minute service offers a
   23:15 start. (Task 3 tests it through the scheduler.)
3. **Time off over existing entries.** A range over days that already have an all-day entry must not duplicate
   them, while a day with only a partial entry still gets the new one. (Task 5 tests both.)
4. **Lower-case currency.** `gbp` is accepted and stored as `GBP`; `GB` or `EURO` answers 422. (Task 12 tests it.)
5. **Bad input on a dry run.** A dry run with invalid input answers 422 with the field errors, never an empty
   "nothing affected" preview that would let the person press Save. (Tasks 10 and 11 test it.)

## Planning rulings (deviations from the spec, found while reading the code)

- **R1 — brand.** §6.1's "a new service gets `brand_id` null" is impossible:
  - `Service`, `ServiceMaster` and `ServiceCategory` use `BelongsToBrand`, whose `creating` hook fills
    `brand_id` from the selected brand, else the organisation's default brand.
  - The workspace's calls carry the full admin's brand selection (the shared axios client adds `brand_id`).
  - So setup rows follow the same rule the full admin's rows follow. The spec is corrected.
  - Cost if wrong: none; this is the platform's rule.
- **R2 — extras notice.** §9.4 assumed the portal hands `ServiceQuoteBuilder` true instants. It does not:
  `PortalServiceBookingController::storedStart()` turns the client's time back into the stored wall-clock digits,
  exactly as the widget does.
  - The fix therefore goes into `ServiceQuoteBuilder::build()` (one place), which corrects the portal's extras
    notice too.
  - The portal's slot list and its `too_soon` check are untouched (already right).
  - Cost if wrong: a portal member booking an extra near its notice limit now gets the right answer instead of one
    off by the venue's UTC offset.
- **R3 — slot steps.** The full admin offers 10, 15, 20, 30, 45 and 60 minutes. The allowed set is
  `[5, 10, 15, 20, 30, 45, 60]`, so a stored 45 stays valid.
- **R4 — what is shared.**
  - The full admin calls `OwnRows` (organisation-scoped links) and `WeeklyHours` (valid hours): the rules both
    interfaces must agree on.
  - Its media and marketing save code stays in its controllers.
  - `ServiceSetup`, `TeamSetup`, `TimeOffSetup` and `BookingRules` serve the workspace, with the full admin's own
    field ranges copied.
  - Cost if wrong: "duration 5–1440" and "buffer 0–240" are written in two places.
- **R5 — booking link.** The booking link is the standalone page `/services/{widget token}` (BookingTab's
  "direct"), and the snippet is the script loader. The spec named the iframe address; both reach the same widget.
- **R6 — zone list.** The time-zone list comes from the server (`settings.zones`), so the picker and the
  validator use one list.
- **R7 — time zone storage.** The time zone writes `hotel_timezone`, which `PortalBootstrap::timezone()` reads
  first.
- **R8 — bootstrap.** `GET bootstrap` gains `readiness.checklist`, so the shell's banner needs no second request.
- **R9 — old notices.** The shell's two notices (`shell.timezone_missing`, `shell.not_bookable`) and their strings
  are removed; the checklist banner replaces them (spec §7).
- **R10 — switched-off hour rows.** A schedule row the full admin switched off (`is_active = false`) has no effect
  on booking. The workspace's week editor does not show it, so saving hours from the workspace drops it. Cost if
  wrong: a venue that kept switched-off rows as notes loses them on the next workspace save.
- **R11 — times as text.** Times in the week editor are text fields (`HH:MM`), because a range may end at 24:00,
  which `<input type="time">` cannot hold. A malformed time shows a fifth problem, `format`, and blocks the save;
  the server's 422 stays the authority.

## File map

Backend:
- **Create** `app/Services/Appointments/Setup/SetupAccess.php`: who may act.
- **Create** `app/Services/Appointments/Setup/SetupPresenter.php`: the setup JSON shapes.
- **Create** `app/Services/Booking/Setup/`:
  - `OwnRows.php`: organisation-scoped `exists`;
  - `WeeklyHours.php`: validate, store and read a week;
  - `AppointmentImpact.php`: stranded appointments;
  - `TimeOffSetup.php`: time-off ranges;
  - `ServiceSetup.php`: workspace service saves;
  - `TeamSetup.php`: workspace team saves;
  - `BookingRules.php`: settings read and write;
  - `SetupChecklist.php`: the six steps.
- **Create** `app/Services/Booking/VenueNotice.php`: the notice on true instants, for the widgets.
- **Create** `app/Http/Controllers/Api/V1/Admin/Appointments/`: `SetupController.php`,
  `SetupServiceController.php`, `SetupTeamController.php`, `SetupSettingsController.php`.
- **Modify** `routes/api.php` (the appointments group).
- **Modify** the full admin's `Admin/ServiceController.php` and `Admin/ServiceMasterController.php`.
- **Modify** `Admin/Appointments/BootstrapController.php`.
- **Modify** the widget code: `ServicePublicController.php`, `Widget/WidgetChatController.php`,
  `Services/Booking/ServiceQuoteBuilder.php`.
- **Modify** `tests/Concerns/SetsUpAppointmentsSchema.php`.
- **Tests** in `tests/Feature/Appointments/Setup/*`, `tests/Unit/Appointments/WeeklyHoursTest.php` and
  `tests/Feature/Booking/PublicServiceNoticeTest.php`.

Frontend (`frontend/src/appointments/`):
- **Modify** `lib/types.ts`, `lib/api.ts`, `AppointmentsApp.tsx`, `AppointmentsShell.tsx` and the five locale
  bundles, plus the families in `i18n/appointmentsLocales.test.ts`.
- **Create** `lib/hours.ts` and `lib/preview.ts`.
- **Create** `setup/`: `SetupPage.tsx`, `Checklist.tsx`, `ConflictDialog.tsx`, `ServicesTab.tsx`,
  `ServiceEditor.tsx`, `TeamTab.tsx`, `TeamEditor.tsx`, `MemberTimeOff.tsx`, `WeekEditor.tsx`,
  `TimeOffEditor.tsx`, `SettingsTab.tsx` and `FailureNotice.tsx`, with tests beside them.
- **Modify** `frontend/src/components/settings/BookingTab.tsx` (the display default).

Docs: `docs/appointments-workspace.md` and `CLAUDE.md`.

---

### Task 1: Who may act (`SetupAccess`) and the fixture's setup columns

**Files:**
- Create: `app/Services/Appointments/Setup/SetupAccess.php`
- Modify: `tests/Concerns/SetsUpAppointmentsSchema.php` (inside `setUpAppointments()`)
- Test: `tests/Feature/Appointments/Setup/SetupAccessTest.php`

**Interfaces:**
- Produces:
  - `SetupAccess::canManage(User $user): bool`
  - `SetupAccess::ownTeamMemberId(User $user): ?int`
  - `SetupAccess::requireManager(User $user): void` (throws `AppointmentRefused('not_allowed', …, 403)`)
  - `SetupAccess::requireTimeOffRight(User $user, ServiceMaster $master): void`
  - `SetupAccess::MANAGER_ROLES = ['super_admin', 'manager']`
  - Fixture: `service_masters.user_id`, `email`, `phone` columns, and a `service_categories.slug` column.

- [ ] **Step 1: Extend the fixture.** In `tests/Concerns/SetsUpAppointmentsSchema.php`, replace the
  `service_masters` block inside `setUpAppointments()` with:

```php
        $this->addColumnsIfMissing('service_masters', [
            'title'      => fn (Blueprint $t) => $t->string('title')->nullable(),
            'sort_order' => fn (Blueprint $t) => $t->integer('sort_order')->default(0),
            'user_id'    => fn (Blueprint $t) => $t->unsignedBigInteger('user_id')->nullable(),
            'email'      => fn (Blueprint $t) => $t->string('email')->nullable(),
            'phone'      => fn (Blueprint $t) => $t->string('phone', 40)->nullable(),
        ]);
        $this->addColumnsIfMissing('service_categories', [
            'slug' => fn (Blueprint $t) => $t->string('slug')->nullable(),
        ]);
```

- [ ] **Step 2: Write the failing test** `tests/Feature/Appointments/Setup/SetupAccessTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Setup\SetupAccess;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupAccessTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_owners_and_managers_manage_and_everyone_else_does_not(): void
    {
        $this->assertTrue(SetupAccess::canManage($this->staff)); // the fixture's caller is a manager
        $this->assertTrue(SetupAccess::canManage($this->staffUser($this->org, ['role' => 'super_admin'])));
        $this->assertFalse(SetupAccess::canManage($this->staffUser($this->org, ['role' => 'staff'])));
        $this->assertFalse(SetupAccess::canManage($this->staffUser($this->org, ['role' => 'receptionist'])));
    }

    public function test_a_manager_of_another_organisation_is_not_a_manager_here(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $other = $this->otherOrganization();
        DB::table('staff')->insert(['organization_id' => $other->id, 'user_id' => $user->id, 'role' => 'manager', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->assertFalse(SetupAccess::canManage($user));
    }

    public function test_the_own_team_member_is_the_one_linked_to_the_sign_in(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $this->assertNull(SetupAccess::ownTeamMemberId($user));

        $this->master->forceFill(['user_id' => $user->id])->save();
        $this->assertSame($this->master->id, SetupAccess::ownTeamMemberId($user));

        SetupAccess::requireTimeOffRight($user, $this->master); // allowed: no exception
        $this->addToAssertionCount(1);
    }

    public function test_staff_may_not_touch_someone_elses_time_off_or_manage(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $someoneElse = ServiceMaster::create(['name' => 'Ilze Ozola', 'is_active' => true]);

        try {
            SetupAccess::requireTimeOffRight($user, $someoneElse);
            $this->fail('time off on someone else was allowed');
        } catch (AppointmentRefused $e) {
            $this->assertSame('not_allowed', $e->errorCode);
            $this->assertSame(403, $e->status);
        }

        $this->expectException(AppointmentRefused::class);
        SetupAccess::requireManager($user);
    }
}
```

- [ ] **Step 3: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Setup/SetupAccessTest.php`
  - Expected: FAIL — `Class "App\Services\Appointments\Setup\SetupAccess" not found`.

- [ ] **Step 4: Implement** `app/Services/Appointments/Setup/SetupAccess.php`:

```php
<?php

namespace App\Services\Appointments\Setup;

use App\Models\ServiceMaster;
use App\Models\Staff;
use App\Models\User;
use App\Scopes\BrandScope;
use App\Services\Appointments\AppointmentRefused;

/**
 * Who may change what in the workspace's Setup (owner decision 2026-10-01):
 * owners and managers change everything; everyone else may add and remove
 * time off only for the team member linked to their own sign-in. Every
 * setup endpoint asks here first; the screens only mirror the answer.
 */
final class SetupAccess
{
    public const MANAGER_ROLES = ['super_admin', 'manager'];

    /** The caller's role in the bound organisation (Staff is tenant-scoped), never another organisation's. */
    public static function canManage(User $user): bool
    {
        return in_array(Staff::where('user_id', $user->id)->value('role'), self::MANAGER_ROLES, true);
    }

    /** The team member linked to this sign-in in the bound organisation, active or not, whatever brand is selected. */
    public static function ownTeamMemberId(User $user): ?int
    {
        $id = ServiceMaster::withoutGlobalScope(BrandScope::class)->where('user_id', $user->id)->value('id');

        return $id === null ? null : (int) $id;
    }

    public static function requireManager(User $user): void
    {
        if (!self::canManage($user)) {
            throw new AppointmentRefused('not_allowed', 'Only an owner or a manager can change this.', 403);
        }
    }

    public static function requireTimeOffRight(User $user, ServiceMaster $master): void
    {
        if (self::canManage($user) || self::ownTeamMemberId($user) === (int) $master->id) {
            return;
        }

        throw new AppointmentRefused('not_allowed', 'You can change only your own time off.', 403);
    }
}
```

- [ ] **Step 5: Run it.**
  - Run: same command as Step 3.
  - Expected: PASS (4 tests).
  - Also run `tests/Feature/Appointments` to confirm the fixture change broke nothing.
  - Expected: every test passes (145 before this plan).

- [ ] **Step 6: Commit.**

```bash
git add tests/Concerns/SetsUpAppointmentsSchema.php app/Services/Appointments/Setup/SetupAccess.php tests/Feature/Appointments/Setup/SetupAccessTest.php
git commit -F <message file: "Know who may change the workspace's setup" + trailer>
```

### Task 2: Organisation-scoped links in the full admin (`OwnRows`, spec §9.2)

**Files:**
- Create: `app/Services/Booking/Setup/OwnRows.php`
- Modify: `app/Http/Controllers/Api/V1/Admin/ServiceController.php` (`store()` and `update()` validation arrays)
- Modify: `app/Http/Controllers/Api/V1/Admin/ServiceMasterController.php` (`store()` and `update()` validation arrays)
- Test: `tests/Feature/Appointments/Setup/FullAdminLinksTest.php`

**Interfaces:**
- Produces: `OwnRows::rule(string $table): \Illuminate\Validation\Rules\Exists`, an `exists:$table,id` limited to
  `organization_id = app('current_organization_id')`.

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Setup/FullAdminLinksTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceMaster;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** The full admin may link only its own organisation's rows (before: any organisation's id passed `exists`). */
class FullAdminLinksTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_a_team_member_cannot_be_given_another_organisations_service(): void
    {
        $other = $this->otherOrganization();
        $foreign = $this->inOrganization($other->id, fn () => Service::create(['name' => 'Foreign', 'duration_minutes' => 30, 'price' => 10, 'is_active' => true]));

        $this->asStaff()->postJson('/api/v1/admin/service-masters', ['name' => 'Ilze', 'service_ids' => [$foreign->id]])
            ->assertStatus(422)->assertJsonValidationErrors('service_ids.0');
        $this->asStaff()->putJson("/api/v1/admin/service-masters/{$this->master->id}", ['service_ids' => [$foreign->id]])
            ->assertStatus(422)->assertJsonValidationErrors('service_ids.0');

        $this->asStaff()->postJson('/api/v1/admin/service-masters', ['name' => 'Ilze', 'service_ids' => [$this->service->id]])
            ->assertCreated();
    }

    public function test_a_service_cannot_be_given_another_organisations_team_member_or_category(): void
    {
        $other = $this->otherOrganization();
        $foreignMaster = $this->inOrganization($other->id, fn () => ServiceMaster::create(['name' => 'Foreign', 'is_active' => true]));
        $foreignCategory = $this->inOrganization($other->id, fn () => ServiceCategory::create(['name' => 'Foreign']));

        $this->asStaff()->putJson("/api/v1/admin/services/{$this->service->id}", ['master_ids' => [$foreignMaster->id]])
            ->assertStatus(422)->assertJsonValidationErrors('master_ids.0');
        $this->asStaff()->putJson("/api/v1/admin/services/{$this->service->id}", ['category_id' => $foreignCategory->id])
            ->assertStatus(422)->assertJsonValidationErrors('category_id');
        $this->asStaff()->postJson('/api/v1/admin/services', ['name' => 'X', 'duration_minutes' => 30, 'price' => 10, 'master_ids' => [$foreignMaster->id]])
            ->assertStatus(422)->assertJsonValidationErrors('master_ids.0');

        $this->asStaff()->putJson("/api/v1/admin/services/{$this->service->id}", ['master_ids' => [$this->master->id]])
            ->assertOk();
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Setup/FullAdminLinksTest.php`
  - Expected: FAIL — the foreign ids are accepted (201/200 instead of 422).

- [ ] **Step 3: Implement** `app/Services/Booking/Setup/OwnRows.php`:

```php
<?php

namespace App\Services\Booking\Setup;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * `exists:<table>,id` limited to the bound organisation. A bare `exists`
 * accepts another organisation's id, which the pivot then links across
 * tenants; the full admin and the workspace both validate links with this.
 */
final class OwnRows
{
    public static function rule(string $table): Exists
    {
        return Rule::exists($table, 'id')->where('organization_id', (int) app('current_organization_id'));
    }
}
```

- [ ] **Step 4: Use it in the full admin.**
  - Add `use App\Services\Booking\Setup\OwnRows;` to both controllers.
  - In `ServiceController::store()` and `update()`, replace:
    - `'category_id' => 'nullable|integer|exists:service_categories,id',` with
      `'category_id' => ['nullable', 'integer', OwnRows::rule('service_categories')],`
    - `'master_ids.*' => 'integer|exists:service_masters,id',` with
      `'master_ids.*' => ['integer', OwnRows::rule('service_masters')],`
  - In `ServiceMasterController::store()` and `update()`, replace `'service_ids.*' => 'integer|exists:services,id',`
    with `'service_ids.*' => ['integer', OwnRows::rule('services')],`.

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2. Expected: PASS (2 tests).
  - Run `tests/Feature/Landing/ServiceMenuRowFieldsApiTest.php`. Expected: unchanged (all pass).

- [ ] **Step 6: Commit** `app/Services/Booking/Setup/OwnRows.php`, both controllers and the test, with the message
  "Let the full admin link only its own organisation's services and people".

### Task 3: Valid weekly hours (`WeeklyHours`, spec §6.3 and §9.1)

**Files:**
- Create: `app/Services/Booking/Setup/WeeklyHours.php`
- Modify: `app/Http/Controllers/Api/V1/Admin/ServiceMasterController.php` (`store()`, `update()`,
  `replaceSchedules()`)
- Test: `tests/Unit/Appointments/WeeklyHoursTest.php`, `tests/Feature/Appointments/Setup/WeeklyHoursFullAdminTest.php`

**Interfaces:**
- Produces:
  - `WeeklyHours::normalise(array $rows, string $field = 'schedules'): array` returns
    `list<array{day_of_week:int, start_time:string, end_time:string, is_active:bool}>` with times as `HH:MM:SS`.
    It throws `ValidationException` keyed `"$field.$i"`.
  - `WeeklyHours::replace(ServiceMaster $master, array $normalised): void`
  - `WeeklyHours::windowsByDay(array $normalised): array<int, list<array{0:int,1:int}>>` (minutes, active rows only)
  - `WeeklyHours::minutesOf(string $time): int` (`HH:MM` or `HH:MM:SS`; `24:00` is 1440)
  - `WeeklyHours::MAX_WINDOWS_PER_DAY = 6`

- [ ] **Step 1: Write the failing unit test** `tests/Unit/Appointments/WeeklyHoursTest.php`:

```php
<?php

namespace Tests\Unit\Appointments;

use App\Services\Booking\Setup\WeeklyHours;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class WeeklyHoursTest extends TestCase
{
    private function rejects(array $rows, string $key): void
    {
        try {
            WeeklyHours::normalise($rows, 'week');
            $this->fail('accepted ' . json_encode($rows));
        } catch (ValidationException $e) {
            $this->assertArrayHasKey($key, $e->errors());
        }
    }

    public function test_good_rows_come_back_in_the_stored_form(): void
    {
        $this->assertSame([
            ['day_of_week' => 1, 'start_time' => '09:00:00', 'end_time' => '13:00:00', 'is_active' => true],
            ['day_of_week' => 1, 'start_time' => '14:00:00', 'end_time' => '24:00:00', 'is_active' => true],
        ], WeeklyHours::normalise([
            ['day_of_week' => '1', 'start_time' => '09:00', 'end_time' => '13:00'],
            ['day_of_week' => 1, 'start_time' => '14:00:00', 'end_time' => '24:00'],
        ]));
    }

    public function test_bad_times_days_order_and_overlaps_are_refused(): void
    {
        $this->rejects([['day_of_week' => 1, 'start_time' => '25:00', 'end_time' => '26:00']], 'week.0');
        $this->rejects([['day_of_week' => 1, 'start_time' => '9:00', 'end_time' => '17:00']], 'week.0');
        $this->rejects([['day_of_week' => 7, 'start_time' => '09:00', 'end_time' => '17:00']], 'week.0');
        $this->rejects([['day_of_week' => 1, 'start_time' => '24:00', 'end_time' => '24:00']], 'week.0');
        $this->rejects([['day_of_week' => 1, 'start_time' => '18:00', 'end_time' => '09:00']], 'week.0');
        $this->rejects([
            ['day_of_week' => 2, 'start_time' => '09:00', 'end_time' => '13:00'],
            ['day_of_week' => 2, 'start_time' => '12:30', 'end_time' => '17:00'],
        ], 'week.1');
        $this->rejects(array_map(fn ($h) => ['day_of_week' => 3, 'start_time' => sprintf('%02d:00', $h), 'end_time' => sprintf('%02d:30', $h)], range(8, 14)), 'week.6');
    }

    public function test_an_inactive_row_never_overlaps(): void
    {
        $rows = WeeklyHours::normalise([
            ['day_of_week' => 2, 'start_time' => '09:00', 'end_time' => '13:00'],
            ['day_of_week' => 2, 'start_time' => '12:00', 'end_time' => '17:00', 'is_active' => false],
        ]);
        $this->assertFalse($rows[1]['is_active']);
        $this->assertSame([2 => [[540, 780]]], WeeklyHours::windowsByDay($rows));
    }

    public function test_minutes_of(): void
    {
        $this->assertSame(570, WeeklyHours::minutesOf('09:30'));
        $this->assertSame(570, WeeklyHours::minutesOf('09:30:00'));
        $this->assertSame(1440, WeeklyHours::minutesOf('24:00:00'));
    }
}
```

- [ ] **Step 2: Write the failing feature test** `tests/Feature/Appointments/Setup/WeeklyHoursFullAdminTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Services\Booking\Setup\WeeklyHours;
use App\Services\ServiceSchedulingService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class WeeklyHoursFullAdminTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_the_full_admin_refuses_malformed_hours_and_keeps_the_old_week(): void
    {
        $this->asStaff()->putJson("/api/v1/admin/service-masters/{$this->master->id}", [
            'schedules' => [['day_of_week' => 1, 'start_time' => '18:00', 'end_time' => '09:00']],
        ])->assertStatus(422)->assertJsonValidationErrors('schedules.0');

        $this->assertSame(7, DB::table('service_master_schedules')->where('service_master_id', $this->master->id)->count());
    }

    public function test_the_full_admin_stores_good_hours_in_the_stored_form(): void
    {
        $this->asStaff()->putJson("/api/v1/admin/service-masters/{$this->master->id}", [
            'schedules' => [['day_of_week' => 1, 'start_time' => '10:00', 'end_time' => '16:00']],
        ])->assertOk();

        $rows = DB::table('service_master_schedules')->where('service_master_id', $this->master->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame(['10:00:00', '16:00:00'], [substr((string) $rows[0]->start_time, 0, 8), substr((string) $rows[0]->end_time, 0, 8)]);
    }

    public function test_a_window_ending_at_midnight_is_bookable_to_the_end_of_the_day(): void
    {
        WeeklyHours::replace($this->master, WeeklyHours::normalise(array_map(
            fn ($d) => ['day_of_week' => $d, 'start_time' => '22:00', 'end_time' => '24:00'], range(0, 6)
        )));

        $slots = app(ServiceSchedulingService::class)->availableSlots($this->service, '2026-10-06', $this->master->id, 15, -2 * 24 * 60); // the scheduler's own notice off

        $this->assertSame('23:15', end($slots)['time_label']);
    }
}
```

- [ ] **Step 3: Run both.**
  - Run: `t.sh tests/Unit/Appointments/WeeklyHoursTest.php`, then
    `t.sh tests/Feature/Appointments/Setup/WeeklyHoursFullAdminTest.php`
  - Expected: FAIL — `WeeklyHours` not found, and the full admin stores `18:00–09:00` (200 instead of 422).

- [ ] **Step 4: Implement** `app/Services/Booking/Setup/WeeklyHours.php`:

```php
<?php

namespace App\Services\Booking\Setup;

use App\Models\ServiceMaster;
use App\Models\ServiceMasterSchedule;
use Illuminate\Validation\ValidationException;

/**
 * A person's week: one row per working window, `day_of_week` 0 = Sunday (the
 * scheduler's own reading). Validated the same way for the full admin and
 * the workspace: `HH:MM` 00:00–24:00, the end after the start, no overlap
 * between active windows of one day, at most six windows a day. No
 * overnight windows: the scheduler works one day at a time.
 */
final class WeeklyHours
{
    public const MAX_WINDOWS_PER_DAY = 6;

    private const TIME = '/^(?:([01]\d|2[0-3]):([0-5]\d)|(24):(00))(?::00)?$/';

    /**
     * @param  array<int, array<string, mixed>> $rows
     * @return list<array{day_of_week:int, start_time:string, end_time:string, is_active:bool}>
     * @throws ValidationException naming the first bad row as "$field.$i"
     */
    public static function normalise(array $rows, string $field = 'schedules'): array
    {
        $out = [];
        $perDay = [];
        foreach (array_values($rows) as $i => $row) {
            $key = "$field.$i";
            $day = filter_var($row['day_of_week'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 6]]);
            if ($day === false) {
                throw ValidationException::withMessages([$key => ['Choose a day of the week.']]);
            }
            $start = self::parse((string) ($row['start_time'] ?? ''));
            $end = self::parse((string) ($row['end_time'] ?? ''));
            if ($start === null || $end === null || $start >= 1440) {
                throw ValidationException::withMessages([$key => ['Choose a time between 00:00 and 24:00.']]);
            }
            if ($end <= $start) {
                throw ValidationException::withMessages([$key => ['The end must be after the start.']]);
            }
            $active = !array_key_exists('is_active', $row) || filter_var($row['is_active'], FILTER_VALIDATE_BOOL);
            $out[] = ['day_of_week' => $day, 'start_time' => self::stored($start), 'end_time' => self::stored($end), 'is_active' => $active];
            if ($active) {
                $perDay[$day][] = [$start, $end, $i];
            }
        }

        foreach ($perDay as $windows) {
            usort($windows, fn ($a, $b) => $a[0] <=> $b[0]);
            foreach ($windows as $n => [$start, , $i]) {
                if ($n >= self::MAX_WINDOWS_PER_DAY) {
                    throw ValidationException::withMessages(["$field.$i" => ['At most ' . self::MAX_WINDOWS_PER_DAY . ' windows a day.']]);
                }
                if ($n > 0 && $start < $windows[$n - 1][1]) {
                    throw ValidationException::withMessages(["$field.$i" => ['These hours overlap another window on the same day.']]);
                }
            }
        }

        return $out;
    }

    /** Replace the person's whole week (the caller holds the transaction). */
    public static function replace(ServiceMaster $master, array $normalised): void
    {
        ServiceMasterSchedule::where('service_master_id', $master->id)->delete();
        foreach ($normalised as $row) {
            ServiceMasterSchedule::create($row + ['service_master_id' => $master->id]);
        }
    }

    /** @return array<int, list<array{0:int, 1:int}>> active windows per weekday, in minutes */
    public static function windowsByDay(array $normalised): array
    {
        $byDay = [];
        foreach ($normalised as $row) {
            if ($row['is_active']) {
                $byDay[$row['day_of_week']][] = [self::minutesOf($row['start_time']), self::minutesOf($row['end_time'])];
            }
        }

        return $byDay;
    }

    public static function minutesOf(string $time): int
    {
        return self::parse($time) ?? throw new \InvalidArgumentException("Not a time: $time");
    }

    private static function parse(string $time): ?int
    {
        if (!preg_match(self::TIME, $time, $m)) {
            return null;
        }

        return ($m[1] !== '' ? (int) $m[1] * 60 + (int) $m[2] : 1440);
    }

    private static function stored(int $minutes): string
    {
        return sprintf('%02d:%02d:00', intdiv($minutes, 60), $minutes % 60);
    }
}
```

- [ ] **Step 5: Use it in the full admin.**
  - Add `use App\Services\Booking\Setup\WeeklyHours;` to `ServiceMasterController`.
  - In `store()`, after `$schedules = $data['schedules'] ?? [];`, add
    `$schedules = WeeklyHours::normalise($schedules);`.
  - In `update()`, after `$schedules = $data['schedules'] ?? null;`, add
    `if ($schedules !== null) { $schedules = WeeklyHours::normalise($schedules); }`.
  - Replace the body of `replaceSchedules()` with `WeeklyHours::replace($master, $schedules);`.
  - Both checks run before anything is written: the validation sits above `ServiceMaster::create()` / `->update()`.
    Move the normalise lines above those calls if they are not already.

- [ ] **Step 6: Run both.** Same commands as Step 3. Expected: PASS (4 + 3 tests).

- [ ] **Step 7: Commit** with the message "Refuse malformed working hours, in the full admin and the workspace alike".

### Task 4: Which appointments a change strands (`AppointmentImpact`, spec §6.6)

**Files:**
- Create: `app/Services/Booking/Setup/AppointmentImpact.php`
- Test: `tests/Feature/Appointments/Setup/AppointmentImpactTest.php`

**Interfaces:**
- Consumes: `WeeklyHours::windowsByDay()`, `WeeklyHours::minutesOf()`, `VenueClock::now()`, `VenueClock::wall()`,
  `VenueClock::parse()`.
- Produces (each returns `array{affected: list<array{id:int, start:string, end:string, client:string, service:?string, team_member:?string}>, total:int}`):
  - `forWeek(ServiceMaster $m, array $normalisedWeek)`
  - `forTimeOff(ServiceMaster $m, array $entries)`, where entries are
    `list<array{date:string, start_time:?string, end_time:?string}>`
  - `forMaster(ServiceMaster $m)`
  - `forService(Service $s)`
  - `forMasterService(ServiceMaster $m, int $serviceId)`
  - static `AppointmentImpact::none()` and `AppointmentImpact::merge(array $a, array $b)`, for disjoint sets
  - `LIST_LIMIT = 50`

- [ ] **Step 1: Write the failing test.** The fixture clock is Mon 2026-10-05 06:00 UTC and the venue zone is UTC.
  `seedBooking()` books Tue 2026-10-06 10:00–10:45 with Mara (09:00–17:00 daily).

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Services\Booking\Setup\AppointmentImpact;
use App\Services\Booking\Setup\WeeklyHours;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentImpactTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private AppointmentImpact $impact;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->impact = app(AppointmentImpact::class);
    }

    private function week(array $days, string $from = '09:00', string $to = '17:00'): array
    {
        return WeeklyHours::normalise(array_map(fn ($d) => ['day_of_week' => $d, 'start_time' => $from, 'end_time' => $to], $days));
    }

    public function test_a_week_without_the_appointments_day_or_hour_strands_it(): void
    {
        $booking = $this->seedBooking();

        $this->assertSame(0, $this->impact->forWeek($this->master, $this->week(range(0, 6)))['total']);
        $offTuesday = $this->impact->forWeek($this->master, $this->week([0, 1, 3, 4, 5, 6]));
        $this->assertSame(1, $offTuesday['total']);
        $this->assertSame([
            'id' => $booking->id, 'start' => '2026-10-06T10:00', 'end' => '2026-10-06T10:45',
            'client' => 'Sophie Williams', 'service' => 'Deep Tissue Massage', 'team_member' => 'Mara Ilves',
        ], $offTuesday['affected'][0]);
        $this->assertSame(1, $this->impact->forWeek($this->master, $this->week(range(0, 6), '10:30', '17:00'))['total']);
    }

    public function test_time_off_strands_what_it_overlaps(): void
    {
        $this->seedBooking();

        $this->assertSame(1, $this->impact->forTimeOff($this->master, [['date' => '2026-10-06', 'start_time' => null, 'end_time' => null]])['total']);
        $this->assertSame(1, $this->impact->forTimeOff($this->master, [['date' => '2026-10-06', 'start_time' => '10:30:00', 'end_time' => '11:00:00']])['total']);
        $this->assertSame(0, $this->impact->forTimeOff($this->master, [['date' => '2026-10-06', 'start_time' => '12:00:00', 'end_time' => '13:00:00']])['total']);
        $this->assertSame(0, $this->impact->forTimeOff($this->master, [['date' => '2026-10-07', 'start_time' => null, 'end_time' => null]])['total']);
    }

    public function test_only_upcoming_active_appointments_count(): void
    {
        $this->seedBooking();
        $this->seedBooking(['status' => 'cancelled']);
        $this->seedBooking(['start_at' => '2026-10-05 05:00:00', 'end_at' => '2026-10-05 05:45:00']); // before "now" (06:00)

        $this->assertSame(1, $this->impact->forMaster($this->master)['total']);
        $this->assertSame(1, $this->impact->forService($this->service)['total']);
        $this->assertSame(1, $this->impact->forMasterService($this->master, $this->service->id)['total']);
        $this->assertSame(0, $this->impact->forMasterService($this->master, $this->service->id + 999)['total']);
    }

    public function test_the_list_stops_at_fifty_and_the_total_does_not(): void
    {
        foreach (range(0, 54) as $n) {
            $day = sprintf('2026-10-%02d', 6 + intdiv($n, 8));
            $hour = 9 + $n % 8;
            $this->seedBooking(['start_at' => sprintf('%s %02d:00:00', $day, $hour), 'end_at' => sprintf('%s %02d:45:00', $day, $hour)]);
        }

        $all = $this->impact->forMaster($this->master);
        $this->assertSame(55, $all['total']);
        $this->assertCount(50, $all['affected']);
        $this->assertSame(['affected' => [], 'total' => 0], AppointmentImpact::none());
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/AppointmentImpactTest.php`
  - Expected: FAIL — class not found.

- [ ] **Step 3: Implement** `app/Services/Booking/Setup/AppointmentImpact.php`:

```php
<?php

namespace App\Services\Booking\Setup;

use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Scopes\BrandScope;
use App\Services\Appointments\VenueClock;
use Illuminate\Database\Eloquent\Builder;

/**
 * The upcoming appointments a setup change would leave outside the person's
 * hours (owner decision 2026-10-01: warn, list, still allow). "Upcoming" is
 * from the venue's own "now" on, pending, confirmed or in progress, in every
 * brand. Times compare as stored: the venue's wall-clock digits.
 */
final class AppointmentImpact
{
    public const LIST_LIMIT = 50;

    private const ACTIVE = ['pending', 'confirmed', 'in_progress'];

    /** @param list<array{day_of_week:int, start_time:string, end_time:string, is_active:bool}> $week */
    public function forWeek(ServiceMaster $master, array $week): array
    {
        $byDay = WeeklyHours::windowsByDay($week);

        return $this->collect($this->upcoming()->where('service_master_id', $master->id), function (ServiceBooking $b) use ($byDay) {
            [$day, $start, $end] = self::span($b);
            foreach ($byDay[$day] ?? [] as [$from, $to]) {
                if ($start >= $from && $end <= $to) {
                    return false;
                }
            }

            return true;
        });
    }

    /** @param list<array{date:string, start_time:?string, end_time:?string}> $entries */
    public function forTimeOff(ServiceMaster $master, array $entries): array
    {
        return $this->collect($this->upcoming()->where('service_master_id', $master->id), function (ServiceBooking $b) use ($entries) {
            $date = substr((string) VenueClock::wall($b->start_at), 0, 10);
            [, $start, $end] = self::span($b);
            foreach ($entries as $entry) {
                if ($entry['date'] !== $date) {
                    continue;
                }
                $from = $entry['start_time'] === null ? 0 : WeeklyHours::minutesOf($entry['start_time']);
                $to = $entry['end_time'] === null ? 1440 : WeeklyHours::minutesOf($entry['end_time']);
                if ($start < $to && $end > $from) {
                    return true;
                }
            }

            return false;
        });
    }

    public function forMaster(ServiceMaster $master): array
    {
        return $this->collect($this->upcoming()->where('service_master_id', $master->id), fn () => true);
    }

    public function forService(Service $service): array
    {
        return $this->collect($this->upcoming()->where('service_id', $service->id), fn () => true);
    }

    public function forMasterService(ServiceMaster $master, int $serviceId): array
    {
        return $this->collect($this->upcoming()->where('service_master_id', $master->id)->where('service_id', $serviceId), fn () => true);
    }

    /** @return array{affected: list<array<string, mixed>>, total: int} */
    public static function none(): array
    {
        return ['affected' => [], 'total' => 0];
    }

    /** Two disjoint sets (different people, or different services of one person) as one answer. */
    public static function merge(array $a, array $b): array
    {
        $affected = array_merge($a['affected'], $b['affected']);
        usort($affected, fn ($x, $y) => strcmp($x['start'], $y['start']));

        return ['affected' => array_slice($affected, 0, self::LIST_LIMIT), 'total' => $a['total'] + $b['total']];
    }

    private function upcoming(): Builder
    {
        $orgId = (int) app('current_organization_id');

        return ServiceBooking::query()
            ->withoutGlobalScope(BrandScope::class)
            ->with(['service:id,name', 'master:id,name'])
            ->whereIn('status', self::ACTIVE)
            ->where('start_at', '>=', VenueClock::now($orgId)->format('Y-m-d H:i:s'))
            ->orderBy('start_at');
    }

    /** @return array{affected: list<array<string, mixed>>, total: int} */
    private function collect(Builder $query, callable $stranded): array
    {
        $hits = $query->get()->filter($stranded)->values();

        return [
            'affected' => $hits->take(self::LIST_LIMIT)->map(fn (ServiceBooking $b) => [
                'id'          => (int) $b->id,
                'start'       => VenueClock::wall($b->start_at),
                'end'         => VenueClock::wall($b->end_at),
                'client'      => (string) $b->customer_name,
                'service'     => $b->service?->name,
                'team_member' => $b->master?->name,
            ])->all(),
            'total' => $hits->count(),
        ];
    }

    /** @return array{0:int, 1:int, 2:int} weekday (0 = Sunday), start and end in minutes of the start's day */
    private static function span(ServiceBooking $b): array
    {
        $start = VenueClock::parse((string) VenueClock::wall($b->start_at));
        $end = VenueClock::parse((string) VenueClock::wall($b->end_at));
        $from = $start->hour * 60 + $start->minute;

        return [(int) $start->dayOfWeek, $from, $from + intdiv($end->getTimestamp() - $start->getTimestamp(), 60)];
    }
}
```

- [ ] **Step 4: Run it.** Same command as Step 2. Expected: PASS (4 tests).

- [ ] **Step 5: Commit** with the message "Find the appointments a setup change would strand".

### Task 5: Time off as a range (`TimeOffSetup`, spec §6.4)

**Files:**
- Create: `app/Services/Booking/Setup/TimeOffSetup.php`
- Test: `tests/Feature/Appointments/Setup/TimeOffSetupTest.php`

**Interfaces:**
- Produces:
  - `TimeOffSetup::rules(): array`, the validation for `from`, `to`, `start_time`, `end_time`, `reason`
  - `TimeOffSetup::plan(ServiceMaster $m, array $validated): list<array{date:string, start_time:?string, end_time:?string}>`,
    with times `HH:MM:SS` or null; it throws `ValidationException` on `to` when the range is too long
  - `TimeOffSetup::add(ServiceMaster $m, array $rows, ?string $reason): Collection<ServiceMasterTimeOff>`
  - `TimeOffSetup::MAX_RANGE_DAYS = 366`

- [ ] **Step 1: Write the failing test:**

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\ServiceMasterTimeOff;
use App\Services\Booking\Setup\TimeOffSetup;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class TimeOffSetupTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_a_range_is_one_row_per_day_and_to_defaults_to_from(): void
    {
        $this->assertSame([
            ['date' => '2026-10-06', 'start_time' => null, 'end_time' => null],
            ['date' => '2026-10-07', 'start_time' => null, 'end_time' => null],
            ['date' => '2026-10-08', 'start_time' => null, 'end_time' => null],
        ], TimeOffSetup::plan($this->master, ['from' => '2026-10-06', 'to' => '2026-10-08']));

        $this->assertSame(
            [['date' => '2026-10-06', 'start_time' => '12:00:00', 'end_time' => '14:00:00']],
            TimeOffSetup::plan($this->master, ['from' => '2026-10-06', 'start_time' => '12:00', 'end_time' => '14:00']),
        );
    }

    public function test_a_day_already_off_all_day_is_not_doubled_and_a_partial_day_still_gets_its_entry(): void
    {
        ServiceMasterTimeOff::create(['service_master_id' => $this->master->id, 'date' => '2026-10-07']);
        ServiceMasterTimeOff::create(['service_master_id' => $this->master->id, 'date' => '2026-10-08', 'start_time' => '09:00:00', 'end_time' => '10:00:00']);

        $rows = TimeOffSetup::plan($this->master, ['from' => '2026-10-06', 'to' => '2026-10-08']);
        $this->assertSame(['2026-10-06', '2026-10-08'], array_column($rows, 'date'));

        TimeOffSetup::add($this->master, $rows, 'Holiday');
        $this->assertSame(4, ServiceMasterTimeOff::where('service_master_id', $this->master->id)->count());
        $this->assertSame('Holiday', ServiceMasterTimeOff::where('service_master_id', $this->master->id)->whereDate('date', '2026-10-06')->value('reason'));
    }

    public function test_more_than_a_year_at_once_is_refused(): void
    {
        $this->expectException(ValidationException::class);
        TimeOffSetup::plan($this->master, ['from' => '2026-10-06', 'to' => '2027-10-08']);
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/TimeOffSetupTest.php`
  - Expected: FAIL — class not found.

- [ ] **Step 3: Implement** `app/Services/Booking/Setup/TimeOffSetup.php`:

```php
<?php

namespace App\Services\Booking\Setup;

use App\Models\ServiceMaster;
use App\Models\ServiceMasterTimeOff;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Time off entered as a range and stored the way the scheduler reads it: one
 * row per day, all day (no times) or the same from–to on every day. A day
 * that already has an all-day entry for the person is skipped — they are off
 * anyway — so a range never doubles it.
 */
final class TimeOffSetup
{
    public const MAX_RANGE_DAYS = 366;

    public static function rules(): array
    {
        return [
            'from'       => 'required|date_format:Y-m-d',
            'to'         => 'nullable|date_format:Y-m-d|after_or_equal:from',
            'start_time' => 'nullable|required_with:end_time|date_format:H:i',
            'end_time'   => 'nullable|required_with:start_time|date_format:H:i|after:start_time',
            'reason'     => 'nullable|string|max:200',
        ];
    }

    /** @return list<array{date:string, start_time:?string, end_time:?string}> */
    public static function plan(ServiceMaster $master, array $data): array
    {
        $from = CarbonImmutable::createFromFormat('!Y-m-d', $data['from'], 'UTC');
        $to = CarbonImmutable::createFromFormat('!Y-m-d', $data['to'] ?? $data['from'], 'UTC');
        if ($from->diffInDays($to) > self::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['to' => ['Time off can cover at most a year at a time.']]);
        }

        $offAllDay = ServiceMasterTimeOff::where('service_master_id', $master->id)
            ->whereNull('start_time')->whereNull('end_time')
            ->whereDate('date', '>=', $from->toDateString())
            ->whereDate('date', '<=', $to->toDateString())
            ->pluck('date')
            ->map(fn ($date) => substr((string) $date, 0, 10))
            ->all();

        $start = isset($data['start_time']) ? $data['start_time'] . ':00' : null;
        $end = isset($data['end_time']) ? $data['end_time'] . ':00' : null;
        $rows = [];
        for ($day = $from; $day->lte($to); $day = $day->addDay()) {
            if (!in_array($day->toDateString(), $offAllDay, true)) {
                $rows[] = ['date' => $day->toDateString(), 'start_time' => $start, 'end_time' => $end];
            }
        }

        return $rows;
    }

    /** @param list<array{date:string, start_time:?string, end_time:?string}> $rows */
    public static function add(ServiceMaster $master, array $rows, ?string $reason): Collection
    {
        return collect($rows)->map(fn (array $row) => ServiceMasterTimeOff::create($row + [
            'service_master_id' => $master->id,
            'reason'            => $reason,
        ]));
    }
}
```

- [ ] **Step 4: Run it.** Same command as Step 2. Expected: PASS (3 tests).

- [ ] **Step 5: Commit** with the message "Plan time off as a range, one day at a time".

### Task 6: Booking settings (`BookingRules`, spec §6.5)

**Files:**
- Create: `app/Services/Booking/Setup/BookingRules.php`
- Test: `tests/Feature/Appointments/Setup/BookingRulesTest.php`

**Interfaces:**
- Produces:
  - `BookingRules::rules(): array`
  - `BookingRules::zones(): list<string>`
  - `BookingRules::SLOT_STEPS = [5, 10, 15, 20, 30, 45, 60]`
  - `BookingRules::LINK_COPIED = 'appointments_link_copied_at'`
  - `BookingRules::read(Organization $org): array`, the settings shape:

    ```
    { timezone, timezone_named, zones, currency, lead_minutes, slot_step, max_advance_days,
      allow_master_choice, points_on_bookings, programme_on, booking_link, embed_snippet,
      upcoming_appointments }
    ```

  - `BookingRules::currency(): string`, the venue currency for new services
  - `BookingRules::currencyImpact(int $orgId, string $currency): array{services:int, extras:int}`
  - `BookingRules::markLinkCopied(int $orgId): void`
  - `(new BookingRules)->write(Organization $org, array $validated): void`

- [ ] **Step 1: Write the failing test:**

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceExtra;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\BookingRules;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class BookingRulesTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_the_defaults_read_as_the_widget_reads_them(): void
    {
        $this->org->forceFill(['widget_token' => 'tok-lumiere'])->save();
        $rules = BookingRules::read($this->org->fresh());

        $this->assertSame('UTC', $rules['timezone']);
        $this->assertFalse($rules['timezone_named']);
        $this->assertSame('EUR', $rules['currency']);
        $this->assertSame([60, 15, 60, true, true], [$rules['lead_minutes'], $rules['slot_step'], $rules['max_advance_days'], $rules['allow_master_choice'], $rules['points_on_bookings']]);
        $this->assertStringEndsWith('/services/tok-lumiere', $rules['booking_link']);
        $this->assertStringContainsString('data-org="tok-lumiere"', $rules['embed_snippet']);
        $this->assertContains('Europe/Riga', $rules['zones']);
        $this->assertNotContains('UTC', $rules['zones']);
    }

    public function test_writing_stores_every_setting_where_the_widget_and_the_portal_read_it(): void
    {
        (new BookingRules())->write($this->org, [
            'timezone' => 'Europe/Riga', 'lead_minutes' => 120, 'slot_step' => 30, 'max_advance_days' => 90,
            'allow_master_choice' => false, 'points_on_bookings' => false,
        ]);
        app()->forgetScopedInstances();

        $this->assertSame('Europe/Riga', VenueClock::zone($this->org->id));
        foreach (['services_lead_minutes' => '120', 'services_slot_step' => '30', 'services_max_advance_days' => '90', 'services_allow_master_choice' => 'false', 'points_on_bookings' => 'false'] as $key => $value) {
            $this->assertSame($value, HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', $key)->value('value'), $key);
        }
        $rules = BookingRules::read($this->org->fresh());
        $this->assertSame([120, 30, 90, false, false], [$rules['lead_minutes'], $rules['slot_step'], $rules['max_advance_days'], $rules['allow_master_choice'], $rules['points_on_bookings']]);
    }

    public function test_a_currency_change_relabels_services_and_extras_and_never_converts(): void
    {
        ServiceExtra::create(['name' => 'Hot stones', 'price' => 10, 'currency' => 'EUR', 'is_active' => true]);
        $this->assertSame(['services' => 1, 'extras' => 1], BookingRules::currencyImpact($this->org->id, 'GBP'));

        (new BookingRules())->write($this->org, ['currency' => 'GBP']);

        $this->assertSame('GBP', $this->org->fresh()->currency);
        $this->assertSame('GBP', BookingRules::currency());
        $this->assertSame(['GBP', '60.00'], [Service::find($this->service->id)->currency, (string) Service::find($this->service->id)->price]);
        $this->assertSame('GBP', ServiceExtra::first()->currency);
        $this->assertSame(['services' => 0, 'extras' => 0], BookingRules::currencyImpact($this->org->id, 'GBP'));
    }

    public function test_the_link_copied_mark_is_a_setting(): void
    {
        BookingRules::markLinkCopied($this->org->id);

        $this->assertNotNull(HotelSetting::getValue(BookingRules::LINK_COPIED));
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/BookingRulesTest.php`
  - Expected: FAIL — class not found.

- [ ] **Step 3: Implement** `app/Services/Booking/Setup/BookingRules.php`:

```php
<?php

namespace App\Services\Booking\Setup;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceExtra;
use App\Scopes\BrandScope;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\BookingPointsService;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The venue's booking settings as the workspace shows and changes them,
 * stored in the very keys the public widget, the portal and the full admin
 * read (`services_*`, `points_on_bookings`, `hotel_timezone`). Changing the
 * time zone never moves a stored appointment (its digits are the venue's
 * clock); changing the currency relabels prices and never converts them.
 */
final class BookingRules
{
    public const SLOT_STEPS = [5, 10, 15, 20, 30, 45, 60];

    public const LINK_COPIED = 'appointments_link_copied_at';

    public static function rules(): array
    {
        return [
            'timezone'            => ['sometimes', 'string', Rule::in(self::zones())],
            'currency'            => ['sometimes', 'string', 'regex:/^[A-Z]{3}$/'],
            'lead_minutes'        => 'sometimes|integer|min:0|max:10080',
            'slot_step'           => ['sometimes', 'integer', Rule::in(self::SLOT_STEPS)],
            'max_advance_days'    => 'sometimes|integer|min:1|max:365',
            'allow_master_choice' => 'sometimes|boolean',
            'points_on_bookings'  => 'sometimes|boolean',
        ];
    }

    /** Named zones a venue may pick: every IANA zone but bare UTC and the Etc/ aliases (VenueClock::isNamed()). */
    public static function zones(): array
    {
        return array_values(array_filter(
            \DateTimeZone::listIdentifiers(),
            fn (string $zone) => $zone !== 'UTC' && !str_starts_with($zone, 'Etc/'),
        ));
    }

    public static function read(Organization $org): array
    {
        $orgId = (int) $org->id;
        $token = (string) ($org->widget_token ?? '');

        return [
            'timezone'              => VenueClock::zone($orgId),
            'timezone_named'        => VenueClock::isNamed($orgId),
            'zones'                 => self::zones(),
            'currency'              => self::currency(),
            'lead_minutes'          => (int) HotelSetting::getValue('services_lead_minutes', 60),
            'slot_step'             => (int) HotelSetting::getValue('services_slot_step', 15),
            'max_advance_days'      => (int) HotelSetting::getValue('services_max_advance_days', 60),
            'allow_master_choice'   => filter_var(HotelSetting::getValue('services_allow_master_choice', 'true'), FILTER_VALIDATE_BOOL),
            'points_on_bookings'    => app(BookingPointsService::class)->pointsOnBookingsEnabled($orgId),
            'programme_on'          => PortalBootstrap::loyaltyOn($orgId),
            'booking_link'          => $token !== '' ? url('/services/' . $token) : null,
            'embed_snippet'         => $token !== '' ? self::snippet($token) : null,
            'upcoming_appointments' => ServiceBooking::query()->withoutGlobalScope(BrandScope::class)
                ->whereIn('status', ['pending', 'confirmed', 'in_progress'])
                ->where('start_at', '>=', VenueClock::now($orgId)->format('Y-m-d H:i:s'))
                ->count(),
        ];
    }

    /** The currency new services take: the organisation's, else the services setting, else EUR. */
    public static function currency(): string
    {
        $org = Organization::find(app('current_organization_id'));

        return strtoupper((string) ($org?->currency ?: HotelSetting::getValue('services_currency', 'EUR')));
    }

    /** @return array{services:int, extras:int} the rows a currency change would relabel */
    public static function currencyImpact(int $orgId, string $currency): array
    {
        return [
            'services' => Service::withoutGlobalScopes()->where('organization_id', $orgId)->where('currency', '!=', $currency)->count(),
            'extras'   => ServiceExtra::withoutGlobalScopes()->where('organization_id', $orgId)->where('currency', '!=', $currency)->count(),
        ];
    }

    public static function markLinkCopied(int $orgId): void
    {
        self::put($orgId, self::LINK_COPIED, now()->toIso8601String(), 'string', 'booking', 'Booking link copied in the workspace');
        HotelSetting::flushCacheFor($orgId);
    }

    /** @param array<string, mixed> $data validated by rules() */
    public function write(Organization $org, array $data): void
    {
        $orgId = (int) $org->id;

        DB::transaction(function () use ($org, $orgId, $data) {
            if (isset($data['timezone'])) {
                self::put($orgId, 'hotel_timezone', $data['timezone'], 'string', 'general', 'Timezone');
            }
            if (isset($data['currency'])) {
                self::put($orgId, 'services_currency', $data['currency'], 'string', 'booking', 'Services Currency');
                $org->forceFill(['currency' => $data['currency']])->save();
                Service::withoutGlobalScopes()->where('organization_id', $orgId)->update(['currency' => $data['currency']]);
                ServiceExtra::withoutGlobalScopes()->where('organization_id', $orgId)->update(['currency' => $data['currency']]);
            }
            foreach (['lead_minutes' => ['services_lead_minutes', 'Lead Time'], 'slot_step' => ['services_slot_step', 'Slot Step'], 'max_advance_days' => ['services_max_advance_days', 'Max Advance Days']] as $field => [$key, $label]) {
                if (array_key_exists($field, $data)) {
                    self::put($orgId, $key, (string) (int) $data[$field], 'integer', 'booking', $label);
                }
            }
            if (array_key_exists('allow_master_choice', $data)) {
                self::put($orgId, 'services_allow_master_choice', $data['allow_master_choice'] ? 'true' : 'false', 'boolean', 'booking', 'Allow Master Choice');
            }
            if (array_key_exists('points_on_bookings', $data)) {
                self::put($orgId, 'points_on_bookings', $data['points_on_bookings'] ? 'true' : 'false', 'boolean', 'loyalty', 'Points on Bookings');
            }
        });

        HotelSetting::flushCacheFor($orgId);
        app()->forgetScopedInstances(); // the venue zone is memoised per request
    }

    /** A setting's value; a row this venue never had is created with the type, group and label given. */
    private static function put(int $orgId, string $key, string $value, string $type, string $group, string $label): void
    {
        $row = HotelSetting::withoutGlobalScopes()->firstOrNew(['organization_id' => $orgId, 'key' => $key]);
        if (!$row->exists) {
            $row->forceFill(['organization_id' => $orgId, 'type' => $type, 'group' => $group, 'label' => $label]);
        }
        $row->value = $value;
        $row->save();
    }

    private static function snippet(string $token): string
    {
        return "<div id=\"hoteltech-services\"></div>\n<script src=\"" . url('/widget/services-loader.js') . "\" data-org=\"{$token}\"></script>";
    }
}
```

- [ ] **Step 4: Run it.** Same command as Step 2. Expected: PASS (4 tests).
  - If `organizations.widget_token` is missing in the test schema, add it in the fixture with
    `addColumnsIfMissing('organizations', ['widget_token' => fn (Blueprint $t) => $t->string('widget_token', 64)->nullable()])`.
    `Organization::create` fills it when the column exists.

- [ ] **Step 5: Commit** with the message "Read and write the venue's booking settings where every booking path reads them".

### Task 7: Saving services and team members (`ServiceSetup`, `TeamSetup`, spec §6.1–6.2)

**Files:**
- Create: `app/Services/Booking/Setup/ServiceSetup.php`, `app/Services/Booking/Setup/TeamSetup.php`
- Test: `tests/Feature/Appointments/Setup/ServiceAndTeamSetupTest.php`

**Interfaces:**
- Consumes: `OwnRows::rule()` (Task 2), `BookingRules::currency()` (Task 6).
- Produces:
  - `ServiceSetup::rules(bool $creating): array`
  - `(new ServiceSetup)->create(array $validated): Service`
  - `->update(Service $s, array $validated): Service`
  - `ServiceSetup::syncPerformers(Service $s, list<array{id:int, duration_minutes?:?int, price?:?float}>)`
  - `TeamSetup::rules(bool $creating, ?ServiceMaster $m = null): array`
  - `(new TeamSetup)->create(array $validated): ServiceMaster`
  - `->update(ServiceMaster $m, array $validated): ServiceMaster`
  - `TeamSetup::syncServices(ServiceMaster $m, list<array{id:int, duration_minutes?:?int, price?:?float}>)`
  - Request keys:
    - service: `name, category_id, duration_minutes, buffer_after_minutes, price, short_description, is_active, performers[]`
    - team: `name, title, email, phone, user_id, is_active, services[]`

- [ ] **Step 1: Write the failing test:**

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\Service;
use App\Services\Booking\Setup\ServiceSetup;
use App\Services\Booking\Setup\TeamSetup;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class ServiceAndTeamSetupTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function pivot(int $masterId, int $serviceId): ?object
    {
        return DB::table('service_master_service')->where('service_master_id', $masterId)->where('service_id', $serviceId)->first();
    }

    public function test_a_new_service_takes_the_venue_currency_the_next_place_and_its_performers_with_overrides(): void
    {
        $service = (new ServiceSetup())->create([
            'name' => 'Scalp Ritual', 'duration_minutes' => 30, 'price' => 40,
            'performers' => [['id' => $this->master->id, 'duration_minutes' => 40, 'price' => 45.5]],
        ]);

        $this->assertSame(['scalp-ritual', 'EUR', true], [$service->slug, $service->currency, (bool) $service->is_active]);
        $this->assertGreaterThan((int) $this->service->sort_order, (int) $service->sort_order);
        $pivot = $this->pivot($this->master->id, $service->id);
        $this->assertSame([40, 45.5], [(int) $pivot->duration_override_minutes, (float) $pivot->price_override]);
    }

    public function test_an_update_changes_only_what_it_is_given_and_leaves_the_marketing_fields(): void
    {
        DB::table('services')->where('id', $this->service->id)->update(['image' => 'svc.jpg', 'tags' => '["Signature"]', 'description' => 'Long text']);

        (new ServiceSetup())->update(Service::find($this->service->id), ['price' => 65, 'is_active' => false]);

        $row = DB::table('services')->where('id', $this->service->id)->first();
        $this->assertSame(['svc.jpg', '["Signature"]', 'Long text', 'Deep Tissue Massage', 0], [$row->image, $row->tags, $row->description, $row->name, (int) $row->is_active]);
        $this->assertSame(65.0, (float) $row->price);
        $this->assertNotNull($this->pivot($this->master->id, $this->service->id)); // performers untouched when not sent
    }

    public function test_performers_can_be_replaced_and_their_overrides_cleared(): void
    {
        $setup = new ServiceSetup();
        ServiceSetup::syncPerformers($this->service, [['id' => $this->master->id, 'price' => 70]]);
        $this->assertSame(70.0, (float) $this->pivot($this->master->id, $this->service->id)->price_override);

        ServiceSetup::syncPerformers($this->service, [['id' => $this->master->id]]);
        $this->assertNull($this->pivot($this->master->id, $this->service->id)->price_override);

        $setup->update($this->service, ['performers' => []]);
        $this->assertNull($this->pivot($this->master->id, $this->service->id));
    }

    public function test_a_team_member_is_created_with_a_sign_in_and_services_and_updated_in_place(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $member = (new TeamSetup())->create([
            'name' => 'Ilze Ozola', 'title' => 'Senior therapist', 'email' => 'ilze@example.test', 'user_id' => $user->id,
            'services' => [['id' => $this->service->id, 'duration_minutes' => 50]],
        ]);

        $this->assertSame(['Ilze Ozola', $user->id, true], [$member->name, (int) $member->user_id, (bool) $member->is_active]);
        $this->assertSame(50, (int) $this->pivot($member->id, $this->service->id)->duration_override_minutes);

        (new TeamSetup())->update($member, ['phone' => '+371 2000 0000', 'is_active' => false]);
        $fresh = $member->fresh();
        $this->assertSame(['Senior therapist', '+371 2000 0000', false], [$fresh->title, $fresh->phone, (bool) $fresh->is_active]);
        $this->assertNotNull($this->pivot($member->id, $this->service->id));
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/ServiceAndTeamSetupTest.php`
  - Expected: FAIL — class not found.

- [ ] **Step 3: Implement** `app/Services/Booking/Setup/ServiceSetup.php`:

```php
<?php

namespace App\Services\Booking\Setup;

use App\Models\Service;
use Illuminate\Support\Str;

/**
 * Saving a service from the workspace: the booking fields only. Images,
 * gallery, tags, long description and the menu marks stay the full admin's
 * and are never touched here. Ranges are the full admin's own
 * (Admin\ServiceController). The brand follows the platform rule
 * (BelongsToBrand: the selected brand, else the default brand).
 */
final class ServiceSetup
{
    private const FIELDS = ['name', 'category_id', 'duration_minutes', 'buffer_after_minutes', 'price', 'short_description', 'is_active'];

    public static function rules(bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name'                          => "$required|string|max:200",
            'category_id'                   => ['nullable', 'integer', OwnRows::rule('service_categories')],
            'duration_minutes'              => "$required|integer|min:5|max:1440",
            'buffer_after_minutes'          => 'sometimes|integer|min:0|max:240',
            'price'                         => "$required|numeric|min:0",
            'short_description'             => 'nullable|string|max:500',
            'is_active'                     => 'sometimes|boolean',
            'performers'                    => 'sometimes|array',
            'performers.*.id'               => ['required', 'integer', 'distinct', OwnRows::rule('service_masters')],
            'performers.*.duration_minutes' => 'nullable|integer|min:5|max:1440',
            'performers.*.price'            => 'nullable|numeric|min:0',
        ];
    }

    public function create(array $data): Service
    {
        $orgId = (int) app('current_organization_id');
        $service = Service::create(array_intersect_key($data, array_flip(self::FIELDS)) + [
            'slug'       => Str::slug($data['name']),
            'currency'   => BookingRules::currency(),
            'is_active'  => true,
            'sort_order' => (int) Service::withoutGlobalScopes()->where('organization_id', $orgId)->max('sort_order') + 1,
        ]);
        if (array_key_exists('performers', $data)) {
            self::syncPerformers($service, $data['performers']);
        }

        return $service;
    }

    public function update(Service $service, array $data): Service
    {
        $fields = array_intersect_key($data, array_flip(self::FIELDS));
        if (isset($fields['name'])) {
            $fields['slug'] = Str::slug($fields['name']);
        }
        $service->update($fields);
        if (array_key_exists('performers', $data)) {
            self::syncPerformers($service, $data['performers']);
        }

        return $service->fresh();
    }

    /** @param list<array{id:int, duration_minutes?:?int, price?:?float}> $performers who performs it, each with an optional own duration or price */
    public static function syncPerformers(Service $service, array $performers): void
    {
        $orgId = (int) app('current_organization_id');
        $sync = [];
        foreach ($performers as $performer) {
            $sync[(int) $performer['id']] = [
                'organization_id'           => $orgId,
                'duration_override_minutes' => $performer['duration_minutes'] ?? null,
                'price_override'            => $performer['price'] ?? null,
            ];
        }
        $service->masters()->sync($sync);
    }
}
```

- [ ] **Step 4: Implement** `app/Services/Booking/Setup/TeamSetup.php`:

```php
<?php

namespace App\Services\Booking\Setup;

use App\Models\ServiceMaster;
use Illuminate\Validation\Rule;

/**
 * Saving a team member from the workspace: profile, sign-in link, the
 * services they perform (with optional own duration and price). A sign-in
 * may be linked to one team member at most, and only a staff user of this
 * organisation. The photo stays the full admin's.
 */
final class TeamSetup
{
    private const FIELDS = ['name', 'title', 'email', 'phone', 'user_id', 'is_active'];

    public static function rules(bool $creating, ?ServiceMaster $master = null): array
    {
        $orgId = (int) app('current_organization_id');
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name'                        => "$required|string|max:200",
            'title'                       => 'nullable|string|max:200',
            'email'                       => 'nullable|email|max:255',
            'phone'                       => 'nullable|string|max:40',
            'is_active'                   => 'sometimes|boolean',
            'user_id'                     => [
                'nullable', 'integer',
                Rule::exists('staff', 'user_id')->where('organization_id', $orgId),
                Rule::unique('service_masters', 'user_id')->where('organization_id', $orgId)->ignore($master?->id),
            ],
            'services'                    => 'sometimes|array',
            'services.*.id'               => ['required', 'integer', 'distinct', OwnRows::rule('services')],
            'services.*.duration_minutes' => 'nullable|integer|min:5|max:1440',
            'services.*.price'            => 'nullable|numeric|min:0',
        ];
    }

    public function create(array $data): ServiceMaster
    {
        $orgId = (int) app('current_organization_id');
        $master = ServiceMaster::create(array_intersect_key($data, array_flip(self::FIELDS)) + [
            'is_active'  => true,
            'sort_order' => (int) ServiceMaster::withoutGlobalScopes()->where('organization_id', $orgId)->max('sort_order') + 1,
        ]);
        if (array_key_exists('services', $data)) {
            self::syncServices($master, $data['services']);
        }

        return $master;
    }

    public function update(ServiceMaster $master, array $data): ServiceMaster
    {
        $master->update(array_intersect_key($data, array_flip(self::FIELDS)));
        if (array_key_exists('services', $data)) {
            self::syncServices($master, $data['services']);
        }

        return $master->fresh();
    }

    /** @param list<array{id:int, duration_minutes?:?int, price?:?float}> $services */
    public static function syncServices(ServiceMaster $master, array $services): void
    {
        $orgId = (int) app('current_organization_id');
        $sync = [];
        foreach ($services as $service) {
            $sync[(int) $service['id']] = [
                'organization_id'           => $orgId,
                'duration_override_minutes' => $service['duration_minutes'] ?? null,
                'price_override'            => $service['price'] ?? null,
            ];
        }
        $master->services()->sync($sync);
    }
}
```

  `ServiceMaster::$fillable` already lists `user_id`, `email`, `phone`, `title` and `sort_order`. Confirm that, and
  add any it lacks.

- [ ] **Step 5: Run it.** Same command as Step 2. Expected: PASS (4 tests).

- [ ] **Step 6: Commit** with the message "Save services and team members from the workspace, keeping the full admin's fields".

### Task 8: The setup checklist, in setup and in the bootstrap (spec §8, ruling R8)

**Files:**
- Create: `app/Services/Booking/Setup/SetupChecklist.php`
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php` (the `readiness` block)
- Test: `tests/Feature/Appointments/Setup/SetupChecklistTest.php`

**Interfaces:**
- Consumes: `BookingCapability::appointmentsBookable()`, `VenueClock::isNamed()`, `BookingRules::LINK_COPIED`.
- Produces:
  - `(new SetupChecklist(BookingCapability))->for(int $orgId, ?int $brandId): array{steps: list<array{key:string, done:bool, optional:bool}>, complete:bool}`
  - Step keys, in order: `timezone, service, performer, hours, online, first_appointment`. `online` is optional.
  - Bootstrap `readiness.checklist` has the same shape.

- [ ] **Step 1: Write the failing test:**

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Services\Booking\Setup\BookingRules;
use App\Services\Booking\Setup\SetupChecklist;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupChecklistTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function done(): array
    {
        $list = app(SetupChecklist::class)->for($this->org->id, null);

        return array_column($list['steps'], 'done', 'key') + ['complete' => $list['complete']];
    }

    public function test_the_fixture_venue_has_everything_but_a_named_zone_and_a_first_appointment(): void
    {
        $this->assertSame([
            'timezone' => false, 'service' => true, 'performer' => true, 'hours' => true, 'online' => false, 'first_appointment' => false, 'complete' => false,
        ], $this->done());
    }

    public function test_the_list_completes_without_the_optional_step(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->seedBooking();

        $done = $this->done();
        $this->assertFalse($done['online']);
        $this->assertTrue($done['complete']);
    }

    public function test_each_step_follows_its_own_record(): void
    {
        DB::table('service_master_schedules')->delete();
        $this->assertSame([true, true, false], [$this->done()['service'], $this->done()['performer'], $this->done()['hours']]);

        DB::table('service_master_service')->delete();
        $this->assertFalse($this->done()['performer']);

        Service::query()->update(['is_active' => false]);
        $this->assertFalse($this->done()['service']);

        BookingRules::markLinkCopied($this->org->id);
        $this->assertTrue($this->done()['online']);
    }

    public function test_a_widget_booking_counts_as_online_booking_in_use(): void
    {
        $this->seedBooking(['source' => 'widget']);
        HotelSetting::flushCacheFor($this->org->id);

        $this->assertTrue($this->done()['online']);
    }

    public function test_the_bootstrap_carries_the_checklist(): void
    {
        $this->asStaff()->getJson($this->api('bootstrap'))
            ->assertOk()
            ->assertJsonPath('readiness.checklist.complete', false)
            ->assertJsonPath('readiness.checklist.steps.0.key', 'timezone')
            ->assertJsonPath('readiness.checklist.steps.4.optional', true);
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/SetupChecklistTest.php`
  - Expected: FAIL — class not found.

- [ ] **Step 3: Implement** `app/Services/Booking/Setup/SetupChecklist.php`:

```php
<?php

namespace App\Services\Booking\Setup;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\BookingCapability;

/**
 * The six steps from a new venue to its first appointment, each read from
 * the record that makes it true. Steps 1–4 are what "bookable" already
 * means (BookingCapability); "online" is optional.
 */
final class SetupChecklist
{
    public const STEPS = ['timezone', 'service', 'performer', 'hours', 'online', 'first_appointment'];

    public const OPTIONAL = ['online'];

    public function __construct(private readonly BookingCapability $capability)
    {
    }

    /** @return array{steps: list<array{key:string, done:bool, optional:bool}>, complete: bool} */
    public function for(int $orgId, ?int $brandId): array
    {
        $done = [
            'timezone'          => VenueClock::isNamed($orgId),
            'service'           => Service::where('is_active', true)->exists(),
            'performer'         => Service::where('is_active', true)->whereHas('masters', fn ($q) => $q->where('service_masters.is_active', true))->exists(),
            'hours'             => $this->capability->appointmentsBookable($orgId, $brandId),
            'online'            => HotelSetting::getValue(BookingRules::LINK_COPIED) !== null || ServiceBooking::where('source', 'widget')->exists(),
            'first_appointment' => ServiceBooking::query()->exists(),
        ];

        $steps = array_map(fn (string $key) => ['key' => $key, 'done' => $done[$key], 'optional' => in_array($key, self::OPTIONAL, true)], self::STEPS);

        return [
            'steps'    => $steps,
            'complete' => collect($steps)->every(fn (array $step) => $step['done'] || $step['optional']),
        ];
    }
}
```

- [ ] **Step 4: Add it to the bootstrap.**
  - In `BootstrapController::show()`, add the parameter `SetupChecklist $checklist` and
    `use App\Services\Booking\Setup\SetupChecklist;`.
  - Extend `readiness`:

```php
            'readiness'    => [
                'services'  => Service::where('is_active', true)->count(),
                'team'      => ServiceMaster::where('is_active', true)->count(),
                'bookable'  => $capability->appointmentsBookable($orgId, $brandId ? (int) $brandId : null),
                'checklist' => $checklist->for($orgId, $brandId ? (int) $brandId : null),
            ],
```

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2. Expected: PASS (5 tests).
  - Run `t.sh tests/Feature/Appointments`. Expected: every test passes (`WorkspaceGateTest` still asserts the old
    readiness fields, which are kept).

- [ ] **Step 6: Commit** with the message "Count a venue's way to its first appointment, and send it with the bootstrap".

### Task 9: Reading setup (`GET setup`, the presenter, `link-copied`)

**Files:**
- Create: `app/Services/Appointments/Setup/SetupPresenter.php`
- Create: `app/Http/Controllers/Api/V1/Admin/Appointments/SetupController.php`
- Modify: `routes/api.php`: inside the `appointments` group, after the `bookings/{id}/actions` route, add every setup
  route of this plan at once, so Tasks 10–12 only add controllers.
- Test: `tests/Feature/Appointments/Setup/SetupEndpointTest.php`

**Interfaces:**
- Consumes: `SetupAccess` (Task 1), `BookingRules::read()` / `markLinkCopied()` (Task 6),
  `SetupChecklist::for()` (Task 8).
- Produces the `GET /setup` JSON:

  ```
  { can_manage, my_team_member_id, services[], categories[], team[], staff_accounts[], settings, checklist }
  ```

  - service: `{ id, name, category_id, duration_minutes, buffer_after_minutes, price, currency, short_description, is_active, performers: [{ id, duration_minutes, price }] }`
  - team member:
    - `{ id, name, title, email, phone, user_id, is_active }`
    - `services: [{ id, duration_minutes, price }]`
    - `week: [{ day_of_week, start_time 'HH:MM', end_time 'HH:MM', is_active }]`
    - `time_off: [{ id, date, start_time 'HH:MM'|null, end_time, reason }]`, from the venue's today on
  - staff account: `{ user_id, name, email }`, sent to managers only.
- Produces the PHP side:
  - `SetupPresenter::service()`, `category()`, `member()`, `staffAccounts()`
  - `SetupPresenter::memberRelations(string $today): array`
  - `SetupController::brandId(): ?int`

- [ ] **Step 1: Add the routes.** In `routes/api.php`, inside
  `Route::prefix('appointments')->middleware('workspace:appointments')->group(...)`, after the `bookings/{id}/actions`
  line:

```php
                // Setup: services, team, hours, time off, settings and the checklist (spec 2026-10-01).
                Route::get('setup', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupController::class, 'show']);
                Route::post('setup/checklist/link-copied', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupController::class, 'linkCopied']);
                Route::post('setup/services', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupServiceController::class, 'store']);
                Route::patch('setup/services/{id}', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupServiceController::class, 'update'])->whereNumber('id');
                Route::post('setup/categories', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupServiceController::class, 'storeCategory']);
                Route::post('setup/team', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupTeamController::class, 'store']);
                Route::patch('setup/team/{id}', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupTeamController::class, 'update'])->whereNumber('id');
                Route::put('setup/team/{id}/hours', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupTeamController::class, 'hours'])->whereNumber('id');
                Route::post('setup/team/{id}/time-off', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupTeamController::class, 'addTimeOff'])->whereNumber('id');
                Route::delete('setup/team/{id}/time-off/{entryId}', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupTeamController::class, 'removeTimeOff'])->whereNumber('id')->whereNumber('entryId');
                Route::patch('setup/settings', [\App\Http\Controllers\Api\V1\Admin\Appointments\SetupSettingsController::class, 'update']);
```

  `RouteControllersExistTest` will fail until Tasks 10–12 create the three other controllers. In this task, create
  each of them as an empty class (`class SetupServiceController extends Controller {}` and the like) so the route
  tests stay green; Tasks 10–12 fill them.

- [ ] **Step 2: Write the failing test** `tests/Feature/Appointments/Setup/SetupEndpointTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\ServiceMasterTimeOff;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_a_manager_reads_the_whole_setup(): void
    {
        ServiceMasterTimeOff::create(['service_master_id' => $this->master->id, 'date' => '2026-10-04']); // yesterday
        ServiceMasterTimeOff::create(['service_master_id' => $this->master->id, 'date' => '2026-10-09', 'start_time' => '12:00:00', 'end_time' => '14:00:00', 'reason' => 'Dentist']);

        $json = $this->asStaff()->getJson($this->api('setup'))->assertOk()->json();

        $this->assertTrue($json['can_manage']);
        $this->assertNull($json['my_team_member_id']);
        $this->assertSame([
            'id' => $this->service->id, 'name' => 'Deep Tissue Massage', 'category_id' => null, 'duration_minutes' => 45,
            'buffer_after_minutes' => 0, 'price' => 60, 'currency' => 'EUR', 'short_description' => null, 'is_active' => true,
            'performers' => [['id' => $this->master->id, 'duration_minutes' => null, 'price' => null]],
        ], $json['services'][0]);
        $member = $json['team'][0];
        $this->assertSame(['Mara Ilves', 7], [$member['name'], count($member['week'])]);
        $this->assertSame(['day_of_week' => 0, 'start_time' => '09:00', 'end_time' => '17:00', 'is_active' => true], $member['week'][0]);
        $this->assertSame([['date' => '2026-10-09', 'start_time' => '12:00', 'end_time' => '14:00', 'reason' => 'Dentist']], array_map(fn ($o) => array_diff_key($o, ['id' => 1]), $member['time_off']));
        $this->assertContains($this->staff->id, array_column($json['staff_accounts'], 'user_id'));
        $this->assertSame(15, $json['settings']['slot_step']);
        $this->assertSame('timezone', $json['checklist']['steps'][0]['key']);
    }

    public function test_staff_read_setup_without_the_accounts_and_with_their_own_team_member(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $this->master->forceFill(['user_id' => $user->id])->save();

        $json = $this->actingAs($user, 'sanctum')->getJson($this->api('setup'))->assertOk()->json();

        $this->assertFalse($json['can_manage']);
        $this->assertSame($this->master->id, $json['my_team_member_id']);
        $this->assertSame([], $json['staff_accounts']);
    }

    public function test_copying_the_booking_link_ticks_the_online_step(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);

        $this->actingAs($user, 'sanctum')->postJson($this->api('setup/checklist/link-copied'))
            ->assertOk()
            ->assertJsonPath('checklist.steps.4.key', 'online')
            ->assertJsonPath('checklist.steps.4.done', true);
    }
}
```

  JSON numbers: Laravel encodes `60.0` as `60`, so the expected price is the integer `60` (see the memory note).

- [ ] **Step 3: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/SetupEndpointTest.php`
  - Expected: FAIL — `SetupController` does not exist (500), or 404 before the routes are added.

- [ ] **Step 4: Implement** `app/Services/Appointments/Setup/SetupPresenter.php`:

```php
<?php

namespace App\Services\Appointments\Setup;

use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceMaster;
use App\Models\ServiceMasterSchedule;
use App\Models\ServiceMasterTimeOff;
use App\Models\Staff;

/** The JSON the workspace's Setup reads: services, categories, team members, sign-in accounts. */
final class SetupPresenter
{
    public function service(Service $service): array
    {
        return [
            'id'                   => (int) $service->id,
            'name'                 => (string) $service->name,
            'category_id'          => $service->category_id ? (int) $service->category_id : null,
            'duration_minutes'     => (int) $service->duration_minutes,
            'buffer_after_minutes' => (int) ($service->buffer_after_minutes ?? 0),
            'price'                => (float) $service->price,
            'currency'             => (string) ($service->currency ?: 'EUR'),
            'short_description'    => $service->short_description,
            'is_active'            => (bool) $service->is_active,
            'performers'           => $service->masters->map(fn (ServiceMaster $m) => self::link((int) $m->id, $m->pivot))->values()->all(),
        ];
    }

    public function category(ServiceCategory $category): array
    {
        return ['id' => (int) $category->id, 'name' => (string) $category->name];
    }

    /** Needs memberRelations() loaded. */
    public function member(ServiceMaster $master): array
    {
        return [
            'id'        => (int) $master->id,
            'name'      => (string) $master->name,
            'title'     => $master->title,
            'email'     => $master->email,
            'phone'     => $master->phone,
            'user_id'   => $master->user_id ? (int) $master->user_id : null,
            'is_active' => (bool) $master->is_active,
            'services'  => $master->services->map(fn (Service $s) => self::link((int) $s->id, $s->pivot))->values()->all(),
            'week'      => $master->schedules
                ->sortBy(fn (ServiceMasterSchedule $r) => sprintf('%d %s', $r->day_of_week, $r->start_time))
                ->map(fn (ServiceMasterSchedule $r) => [
                    'day_of_week' => (int) $r->day_of_week,
                    'start_time'  => substr((string) $r->start_time, 0, 5),
                    'end_time'    => substr((string) $r->end_time, 0, 5),
                    'is_active'   => (bool) $r->is_active,
                ])->values()->all(),
            'time_off'  => $master->timeOff->map(fn (ServiceMasterTimeOff $o) => [
                'id'         => (int) $o->id,
                'date'       => $o->date instanceof \DateTimeInterface ? $o->date->format('Y-m-d') : substr((string) $o->date, 0, 10),
                'start_time' => $o->start_time ? substr((string) $o->start_time, 0, 5) : null,
                'end_time'   => $o->end_time ? substr((string) $o->end_time, 0, 5) : null,
                'reason'     => $o->reason,
            ])->values()->all(),
        ];
    }

    /** Everything member() reads; time off from the venue's $today on. */
    public static function memberRelations(string $today): array
    {
        return [
            'services',
            'schedules',
            'timeOff' => fn ($q) => $q->whereDate('date', '>=', $today)->orderBy('date')->orderBy('start_time'),
        ];
    }

    /** The organisation's staff sign-ins a team member can be linked to. */
    public function staffAccounts(): array
    {
        return Staff::with('user:id,name,email')->get()
            ->filter(fn (Staff $s) => $s->user !== null)
            ->map(fn (Staff $s) => ['user_id' => (int) $s->user_id, 'name' => (string) $s->user->name, 'email' => (string) $s->user->email])
            ->sortBy('name')->values()->all();
    }

    private static function link(int $id, ?object $pivot): array
    {
        return [
            'id'               => $id,
            'duration_minutes' => $pivot?->duration_override_minutes !== null ? (int) $pivot->duration_override_minutes : null,
            'price'            => $pivot?->price_override !== null ? (float) $pivot->price_override : null,
        ];
    }
}
```

- [ ] **Step 5: Implement** `app/Http/Controllers/Api/V1/Admin/Appointments/SetupController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceMaster;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Appointments\Setup\SetupPresenter;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\BookingRules;
use App\Services\Booking\Setup\SetupChecklist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The workspace's Setup in one read, and the booking-link mark. Any staff user reads; the answer says who may edit. */
class SetupController extends Controller
{
    public function show(Request $request, SetupPresenter $present, SetupChecklist $checklist): JsonResponse
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        $canManage = SetupAccess::canManage($user);
        $today = VenueClock::today($orgId);

        return response()->json([
            'can_manage'        => $canManage,
            'my_team_member_id' => SetupAccess::ownTeamMemberId($user),
            'services'          => Service::with('masters')->orderBy('sort_order')->orderBy('name')->get()->map(fn (Service $s) => $present->service($s))->all(),
            'categories'        => ServiceCategory::orderBy('sort_order')->orderBy('name')->get()->map(fn (ServiceCategory $c) => $present->category($c))->all(),
            'team'              => ServiceMaster::with(SetupPresenter::memberRelations($today))->orderBy('sort_order')->orderBy('name')->get()->map(fn (ServiceMaster $m) => $present->member($m))->all(),
            'staff_accounts'    => $canManage ? $present->staffAccounts() : [],
            'settings'          => BookingRules::read($org),
            'checklist'         => $checklist->for($orgId, self::brandId()),
        ]);
    }

    public function linkCopied(Request $request, SetupChecklist $checklist): JsonResponse
    {
        $orgId = (int) $request->attributes->get('workspace_org')->id;
        BookingRules::markLinkCopied($orgId);

        return response()->json(['checklist' => $checklist->for($orgId, self::brandId())]);
    }

    public static function brandId(): ?int
    {
        return app()->bound('current_brand_id') && app('current_brand_id') ? (int) app('current_brand_id') : null;
    }
}
```

- [ ] **Step 6: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/SetupEndpointTest.php`. Expected: PASS (3 tests).
  - Run: `t.sh tests/Feature/Appointments/WorkspaceGateTest.php tests/Feature/RouteControllersExistTest.php tests/Feature/RouteUniquenessTest.php`.
    Expected: PASS (every new route carries `workspace:appointments`).

- [ ] **Step 7: Commit** the routes, the presenter, the four controllers (three still empty) and the test, with the
  message "Read the workspace's whole setup in one call".

### Task 10: Services and categories from the workspace (`SetupServiceController`)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/SetupServiceController.php` (empty since Task 9)
- Test: `tests/Feature/Appointments/Setup/SetupServicesEndpointTest.php`

**Interfaces:**
- Consumes: `ServiceSetup` (Task 7), `AppointmentImpact` (Task 4), `SetupPresenter` (Task 9).
- Produces:
  - `POST setup/services`, giving `201 {service}`
  - `PATCH setup/services/{id}[?dry_run=1]`, giving `{service, affected, total}` or `{dry_run: true, affected, total}`
  - `POST setup/categories`, giving `201 {category: {id, name}}`

- [ ] **Step 1: Write the failing test:**

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\Service;
use App\Models\ServiceMaster;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupServicesEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_only_a_manager_creates_or_changes_a_service(): void
    {
        $staff = $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum');
        $staff->postJson($this->api('setup/services'), ['name' => 'X', 'duration_minutes' => 30, 'price' => 10])->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $staff->patchJson($this->api("setup/services/{$this->service->id}"), ['price' => 1])->assertStatus(403);
        $staff->postJson($this->api('setup/categories'), ['name' => 'Hair'])->assertStatus(403);
    }

    public function test_a_manager_creates_a_service_with_who_performs_it(): void
    {
        $this->asStaff()->postJson($this->api('setup/services'), [
            'name' => 'Scalp Ritual', 'duration_minutes' => 30, 'price' => 40,
            'performers' => [['id' => $this->master->id, 'price' => 45]],
        ])->assertCreated()
            ->assertJsonPath('service.name', 'Scalp Ritual')
            ->assertJsonPath('service.performers.0.id', $this->master->id)
            ->assertJsonPath('service.performers.0.price', 45);
    }

    public function test_deactivating_previews_the_appointments_then_saves_and_says_them_again(): void
    {
        $booking = $this->seedBooking();

        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}") . '?dry_run=1', ['is_active' => false])
            ->assertOk()->assertJsonPath('dry_run', true)->assertJsonPath('total', 1)->assertJsonPath('affected.0.id', $booking->id);
        $this->assertTrue((bool) Service::find($this->service->id)->is_active);

        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}"), ['is_active' => false])
            ->assertOk()->assertJsonPath('service.is_active', false)->assertJsonPath('total', 1);
    }

    public function test_taking_a_person_off_a_service_previews_their_appointments_of_it(): void
    {
        $this->seedBooking();

        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}") . '?dry_run=1', ['performers' => []])
            ->assertOk()->assertJsonPath('total', 1);
        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}") . '?dry_run=1', ['performers' => [['id' => $this->master->id]]])
            ->assertOk()->assertJsonPath('total', 0);
    }

    public function test_a_dry_run_with_bad_input_is_a_422_not_an_empty_preview(): void
    {
        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}") . '?dry_run=1', ['duration_minutes' => 2, 'is_active' => false])
            ->assertStatus(422)->assertJsonValidationErrors('duration_minutes');
    }

    public function test_links_and_ids_must_be_this_organisations(): void
    {
        $foreign = $this->inOrganization($this->otherOrganization()->id, fn () => ServiceMaster::create(['name' => 'Foreign', 'is_active' => true]));

        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}"), ['performers' => [['id' => $foreign->id]]])
            ->assertStatus(422)->assertJsonValidationErrors('performers.0.id');
        $this->asStaff()->patchJson($this->api('setup/services/999999'), ['price' => 1])
            ->assertStatus(404)->assertJsonPath('error', 'service_not_found');
    }

    public function test_a_manager_adds_a_category(): void
    {
        $this->asStaff()->postJson($this->api('setup/categories'), ['name' => 'Hair'])
            ->assertCreated()->assertJsonPath('category.name', 'Hair');
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/SetupServicesEndpointTest.php`
  - Expected: FAIL — the methods do not exist (500).

- [ ] **Step 3: Implement** `SetupServiceController`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Appointments\Setup\SetupPresenter;
use App\Services\Booking\Setup\AppointmentImpact;
use App\Services\Booking\Setup\ServiceSetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Services and categories from the workspace's Setup. Managers only. A
 * change that strands upcoming appointments answers with them; `dry_run=1`
 * answers with them and saves nothing (owner decision: warn, list, allow).
 */
class SetupServiceController extends Controller
{
    public function store(Request $request, ServiceSetup $setup, SetupPresenter $present): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate(ServiceSetup::rules(true));
        $service = DB::transaction(fn () => $setup->create($data));

        return response()->json(['service' => $present->service($service->load('masters'))], 201);
    }

    public function update(Request $request, int $id, ServiceSetup $setup, SetupPresenter $present, AppointmentImpact $impact): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $service = Service::find($id) ?? throw new AppointmentRefused('service_not_found', 'This service no longer exists.', 404);
        $data = $request->validate(ServiceSetup::rules(false));

        $stranded = $this->stranded($service, $data, $impact);
        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + $stranded);
        }
        $service = DB::transaction(fn () => $setup->update($service, $data));

        return response()->json(['service' => $present->service($service->load('masters'))] + $stranded);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate(['name' => 'required|string|max:120']);
        $orgId = (int) app('current_organization_id');
        $category = ServiceCategory::create([
            'name'       => $data['name'],
            'slug'       => Str::slug($data['name']),
            'is_active'  => true,
            'sort_order' => (int) ServiceCategory::withoutGlobalScopes()->where('organization_id', $orgId)->max('sort_order') + 1,
        ]);

        return response()->json(['category' => ['id' => (int) $category->id, 'name' => (string) $category->name]], 201);
    }

    /** Deactivating strands all its upcoming appointments; otherwise, those of each person taken off it. */
    private function stranded(Service $service, array $data, AppointmentImpact $impact): array
    {
        if (array_key_exists('is_active', $data) && !filter_var($data['is_active'], FILTER_VALIDATE_BOOL) && $service->is_active) {
            return $impact->forService($service);
        }
        $stranded = AppointmentImpact::none();
        if (array_key_exists('performers', $data)) {
            $kept = array_map(fn (array $p) => (int) $p['id'], $data['performers']);
            foreach ($service->masters as $master) {
                if (!in_array((int) $master->id, $kept, true)) {
                    $stranded = AppointmentImpact::merge($stranded, $impact->forMasterService($master, (int) $service->id));
                }
            }
        }

        return $stranded;
    }
}
```

- [ ] **Step 4: Run it.** Same command as Step 2. Expected: PASS (7 tests).

- [ ] **Step 5: Commit** with the message "Add and change services from the workspace, with the appointments a change strands".

### Task 11: Team, hours and time off from the workspace (`SetupTeamController`)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/SetupTeamController.php` (empty since Task 9)
- Test: `tests/Feature/Appointments/Setup/SetupTeamEndpointTest.php`

**Interfaces:**
- Consumes: `TeamSetup` (Task 7), `WeeklyHours` (Task 3), `TimeOffSetup` (Task 5), `AppointmentImpact` (Task 4),
  `SetupAccess` (Task 1), `SetupPresenter` (Task 9).
- Produces:
  - `POST setup/team`, giving `201 {team_member}`
  - `PATCH setup/team/{id}[?dry_run=1]`
  - `PUT setup/team/{id}/hours[?dry_run=1]` with body `{week: [{day_of_week, start_time, end_time, is_active?}]}`
  - `POST setup/team/{id}/time-off[?dry_run=1]` with body `{from, to?, start_time?, end_time?, reason?}`, giving 201
  - `DELETE setup/team/{id}/time-off/{entryId}`
  - Every save answers `{team_member, affected, total}`.

- [ ] **Step 1: Write the failing test:**

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\ServiceMaster;
use App\Models\ServiceMasterTimeOff;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupTeamEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function week(array $days): array
    {
        return array_map(fn ($d) => ['day_of_week' => $d, 'start_time' => '09:00', 'end_time' => '17:00'], $days);
    }

    public function test_a_manager_adds_a_team_member_linked_to_a_sign_in(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);

        $this->asStaff()->postJson($this->api('setup/team'), [
            'name' => 'Ilze Ozola', 'user_id' => $user->id, 'services' => [['id' => $this->service->id]],
        ])->assertCreated()->assertJsonPath('team_member.user_id', $user->id)->assertJsonPath('team_member.services.0.id', $this->service->id);

        // One team member per sign-in.
        $this->asStaff()->postJson($this->api('setup/team'), ['name' => 'Again', 'user_id' => $user->id])
            ->assertStatus(422)->assertJsonValidationErrors('user_id');
    }

    public function test_a_sign_in_from_another_organisation_cannot_be_linked(): void
    {
        $outsider = $this->staffUser($this->otherOrganization(), ['role' => 'staff']);

        $this->asStaff()->postJson($this->api('setup/team'), ['name' => 'Outsider', 'user_id' => $outsider->id])
            ->assertStatus(422)->assertJsonValidationErrors('user_id');
    }

    public function test_staff_cannot_add_or_change_team_members_or_hours(): void
    {
        $staff = $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum');

        $staff->postJson($this->api('setup/team'), ['name' => 'X'])->assertStatus(403);
        $staff->patchJson($this->api("setup/team/{$this->master->id}"), ['name' => 'X'])->assertStatus(403);
        $staff->putJson($this->api("setup/team/{$this->master->id}/hours"), ['week' => []])->assertStatus(403);
    }

    public function test_deactivating_or_taking_a_service_away_previews_the_appointments(): void
    {
        $this->seedBooking();

        $this->asStaff()->patchJson($this->api("setup/team/{$this->master->id}") . '?dry_run=1', ['is_active' => false])
            ->assertOk()->assertJsonPath('dry_run', true)->assertJsonPath('total', 1);
        $this->asStaff()->patchJson($this->api("setup/team/{$this->master->id}") . '?dry_run=1', ['services' => []])
            ->assertOk()->assertJsonPath('total', 1);
        $this->assertTrue((bool) ServiceMaster::find($this->master->id)->is_active);

        $this->asStaff()->patchJson($this->api("setup/team/{$this->master->id}"), ['is_active' => false])
            ->assertOk()->assertJsonPath('team_member.is_active', false)->assertJsonPath('total', 1);
    }

    public function test_hours_are_validated_previewed_and_replaced(): void
    {
        $this->seedBooking(); // Tuesday 10:00

        $this->asStaff()->putJson($this->api("setup/team/{$this->master->id}/hours"), ['week' => [['day_of_week' => 2, 'start_time' => '17:00', 'end_time' => '09:00']]])
            ->assertStatus(422)->assertJsonValidationErrors('week.0');
        $this->asStaff()->putJson($this->api("setup/team/{$this->master->id}/hours") . '?dry_run=1', ['week' => [['day_of_week' => 2, 'start_time' => '17:00', 'end_time' => '09:00']]])
            ->assertStatus(422);

        $this->asStaff()->putJson($this->api("setup/team/{$this->master->id}/hours") . '?dry_run=1', ['week' => $this->week([1, 3, 4, 5])])
            ->assertOk()->assertJsonPath('total', 1);
        $this->assertSame(7, DB::table('service_master_schedules')->where('service_master_id', $this->master->id)->count());

        $this->asStaff()->putJson($this->api("setup/team/{$this->master->id}/hours"), ['week' => $this->week([1, 3, 4, 5])])
            ->assertOk()->assertJsonCount(4, 'team_member.week')->assertJsonPath('total', 1);
    }

    public function test_staff_manage_their_own_time_off_and_nobody_elses(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $this->master->forceFill(['user_id' => $user->id])->save();
        $someoneElse = ServiceMaster::create(['name' => 'Ilze Ozola', 'is_active' => true]);
        $this->seedBooking();
        $staff = $this->actingAs($user, 'sanctum');

        $staff->postJson($this->api("setup/team/{$this->master->id}/time-off") . '?dry_run=1', ['from' => '2026-10-06'])
            ->assertOk()->assertJsonPath('total', 1);
        $this->assertSame(0, ServiceMasterTimeOff::count());

        $staff->postJson($this->api("setup/team/{$this->master->id}/time-off"), ['from' => '2026-10-06', 'to' => '2026-10-07', 'reason' => 'Holiday'])
            ->assertCreated()->assertJsonCount(2, 'team_member.time_off');
        $staff->postJson($this->api("setup/team/{$someoneElse->id}/time-off"), ['from' => '2026-10-06'])->assertStatus(403);

        $entry = ServiceMasterTimeOff::where('service_master_id', $this->master->id)->first();
        $staff->deleteJson($this->api("setup/team/{$this->master->id}/time-off/{$entry->id}"))->assertOk()->assertJsonCount(1, 'team_member.time_off');
        $staff->deleteJson($this->api("setup/team/{$this->master->id}/time-off/{$entry->id}"))->assertStatus(404);

        // A manager may do it for anyone.
        $this->asStaff()->postJson($this->api("setup/team/{$someoneElse->id}/time-off"), ['from' => '2026-10-08', 'start_time' => '12:00', 'end_time' => '13:00'])
            ->assertCreated()->assertJsonPath('team_member.time_off.0.start_time', '12:00');
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/SetupTeamEndpointTest.php`
  - Expected: FAIL (500, methods missing).

- [ ] **Step 3: Implement** `SetupTeamController`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\ServiceMaster;
use App\Models\ServiceMasterTimeOff;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Appointments\Setup\SetupPresenter;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\AppointmentImpact;
use App\Services\Booking\Setup\TeamSetup;
use App\Services\Booking\Setup\TimeOffSetup;
use App\Services\Booking\Setup\WeeklyHours;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Team members, their weekly hours and their time off, from the workspace.
 * Managers change everything; a staff user may add and remove time off for
 * the team member linked to their own sign-in. Saves that strand upcoming
 * appointments answer with them; `dry_run=1` answers with them only.
 */
class SetupTeamController extends Controller
{
    public function store(Request $request, TeamSetup $setup, SetupPresenter $present): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate(TeamSetup::rules(true));
        $master = DB::transaction(fn () => $setup->create($data));

        return response()->json(['team_member' => $this->present($master, $present)], 201);
    }

    public function update(Request $request, int $id, TeamSetup $setup, SetupPresenter $present, AppointmentImpact $impact): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $master = $this->member($id);
        $data = $request->validate(TeamSetup::rules(false, $master));

        $stranded = AppointmentImpact::none();
        if (array_key_exists('is_active', $data) && !filter_var($data['is_active'], FILTER_VALIDATE_BOOL) && $master->is_active) {
            $stranded = $impact->forMaster($master);
        } elseif (array_key_exists('services', $data)) {
            $kept = array_map(fn (array $s) => (int) $s['id'], $data['services']);
            foreach ($master->services as $service) {
                if (!in_array((int) $service->id, $kept, true)) {
                    $stranded = AppointmentImpact::merge($stranded, $impact->forMasterService($master, (int) $service->id));
                }
            }
        }
        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + $stranded);
        }
        $master = DB::transaction(fn () => $setup->update($master, $data));

        return response()->json(['team_member' => $this->present($master, $present)] + $stranded);
    }

    public function hours(Request $request, int $id, SetupPresenter $present, AppointmentImpact $impact): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $master = $this->member($id);
        $request->validate(['week' => 'present|array']);
        $week = WeeklyHours::normalise($request->input('week', []), 'week');

        $stranded = $impact->forWeek($master, $week);
        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + $stranded);
        }
        DB::transaction(fn () => WeeklyHours::replace($master, $week));

        return response()->json(['team_member' => $this->present($master, $present)] + $stranded);
    }

    public function addTimeOff(Request $request, int $id, SetupPresenter $present, AppointmentImpact $impact): JsonResponse
    {
        $master = $this->member($id);
        SetupAccess::requireTimeOffRight($request->user(), $master);
        $data = $request->validate(TimeOffSetup::rules());
        $rows = TimeOffSetup::plan($master, $data);

        $stranded = $impact->forTimeOff($master, $rows);
        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + $stranded);
        }
        DB::transaction(fn () => TimeOffSetup::add($master, $rows, $data['reason'] ?? null));

        return response()->json(['team_member' => $this->present($master, $present)] + $stranded, 201);
    }

    public function removeTimeOff(Request $request, int $id, int $entryId, SetupPresenter $present): JsonResponse
    {
        $master = $this->member($id);
        SetupAccess::requireTimeOffRight($request->user(), $master);
        $deleted = ServiceMasterTimeOff::where('service_master_id', $master->id)->where('id', $entryId)->delete();
        if ($deleted === 0) {
            throw new AppointmentRefused('not_found', 'This time off no longer exists.', 404);
        }

        return response()->json(['team_member' => $this->present($master, $present)]);
    }

    private function member(int $id): ServiceMaster
    {
        return ServiceMaster::find($id) ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);
    }

    private function present(ServiceMaster $master, SetupPresenter $present): array
    {
        $today = VenueClock::today((int) app('current_organization_id'));

        return $present->member($master->fresh(SetupPresenter::memberRelations($today)));
    }
}
```

- [ ] **Step 4: Run it.** Same command as Step 2. Expected: PASS (7 tests).

- [ ] **Step 5: Commit** with the message "Add team members, set their hours and their time off from the workspace".

### Task 12: Settings from the workspace (`SetupSettingsController`)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/SetupSettingsController.php` (empty since Task 9)
- Test: `tests/Feature/Appointments/Setup/SetupSettingsEndpointTest.php`

**Interfaces:**
- Consumes: `BookingRules` (Task 6), `SetupChecklist` (Task 8), `SetupController::brandId()` (Task 9).
- Produces:
  - `PATCH setup/settings`, giving `{settings, checklist}`
  - `PATCH setup/settings?dry_run=1`, giving `{dry_run: true, services, extras}`
  - The currency is upper-cased before validation.

- [ ] **Step 1: Write the failing test:**

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\Service;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupSettingsEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_only_a_manager_changes_the_settings(): void
    {
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->patchJson($this->api('setup/settings'), ['slot_step' => 30])->assertStatus(403)->assertJsonPath('error', 'not_allowed');
    }

    public function test_the_time_zone_must_be_a_named_zone(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['timezone' => 'UTC'])->assertStatus(422)->assertJsonValidationErrors('timezone');
        $this->asStaff()->patchJson($this->api('setup/settings'), ['timezone' => 'Europe/Riga'])
            ->assertOk()
            ->assertJsonPath('settings.timezone', 'Europe/Riga')
            ->assertJsonPath('checklist.steps.0.done', true);
    }

    public function test_a_lower_case_currency_is_accepted_and_a_bad_one_refused(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings') . '?dry_run=1', ['currency' => 'gbp'])
            ->assertOk()->assertJsonPath('dry_run', true)->assertJsonPath('services', 1);
        $this->assertSame('EUR', Service::find($this->service->id)->currency);

        $this->asStaff()->patchJson($this->api('setup/settings'), ['currency' => 'gbp'])->assertOk()->assertJsonPath('settings.currency', 'GBP');
        $this->assertSame('GBP', Service::find($this->service->id)->currency);

        foreach (['GB', 'EURO', '£££'] as $bad) {
            $this->asStaff()->patchJson($this->api('setup/settings'), ['currency' => $bad])->assertStatus(422)->assertJsonValidationErrors('currency');
        }
    }

    public function test_booking_rules_keep_to_their_ranges(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['slot_step' => 7])->assertStatus(422)->assertJsonValidationErrors('slot_step');
        $this->asStaff()->patchJson($this->api('setup/settings'), ['lead_minutes' => 20000])->assertStatus(422)->assertJsonValidationErrors('lead_minutes');
        $this->asStaff()->patchJson($this->api('setup/settings'), ['slot_step' => 45, 'lead_minutes' => 0, 'max_advance_days' => 30, 'allow_master_choice' => false, 'points_on_bookings' => false])
            ->assertOk()
            ->assertJsonPath('settings.slot_step', 45)
            ->assertJsonPath('settings.lead_minutes', 0)
            ->assertJsonPath('settings.max_advance_days', 30)
            ->assertJsonPath('settings.allow_master_choice', false)
            ->assertJsonPath('settings.points_on_bookings', false);
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `t.sh tests/Feature/Appointments/Setup/SetupSettingsEndpointTest.php`
  - Expected: FAIL (500, method missing).

- [ ] **Step 3: Implement** `SetupSettingsController`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Booking\Setup\BookingRules;
use App\Services\Booking\Setup\SetupChecklist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The venue's booking settings from the workspace's Setup. Managers only. */
class SetupSettingsController extends Controller
{
    public function update(Request $request, BookingRules $rules, SetupChecklist $checklist): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        if (is_string($request->input('currency'))) {
            $request->merge(['currency' => strtoupper(trim($request->input('currency')))]);
        }
        $data = $request->validate(BookingRules::rules());
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');

        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + (isset($data['currency'])
                ? BookingRules::currencyImpact((int) $org->id, $data['currency'])
                : ['services' => 0, 'extras' => 0]));
        }
        $rules->write($org, $data);
        $org = $org->fresh();

        return response()->json([
            'settings'  => BookingRules::read($org),
            'checklist' => $checklist->for((int) $org->id, SetupController::brandId()),
        ]);
    }
}
```

- [ ] **Step 4: Run it.**
  - Run: same command as Step 2. Expected: PASS (4 tests).
  - Run `t.sh tests/Feature/Appointments`. Expected: every test passes.

- [ ] **Step 5: Commit** with the message "Change the venue's booking settings from the workspace".

### Task 13: The widgets' notice on the venue's clock (spec §9.4, ruling R2)

**Files:**
- Create: `app/Services/Booking/VenueNotice.php`
- Modify:
  - `app/Http/Controllers/Api/V1/ServicePublicController.php`: `availability()`, and the extras check in `confirm()`
    (`$startTs = $reservation['start']->getTimestamp();`)
  - `app/Http/Controllers/Api/V1/Widget/WidgetChatController.php`: the `check_service_availability` case
  - `app/Services/Booking/ServiceQuoteBuilder.php`: the `build()` call to `extraLines()`
- Test: `tests/Feature/Booking/PublicServiceNoticeTest.php`

**Interfaces:**
- Produces:
  - `VenueNotice::SCHEDULER_LEAD_OFF = -2880`
  - `VenueNotice::filter(array $slots, int $orgId, int $leadMinutes): array` keeps the scheduler's slot shape
  - `VenueNotice::instant(\DateTimeInterface|string $stored, int $orgId): CarbonImmutable`

- [ ] **Step 1: Write the failing test** `tests/Feature/Booking/PublicServiceNoticeTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Http\Controllers\Api\V1\Widget\WidgetChatController;
use App\Models\Organization;
use App\Models\ServiceExtra;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * The public and chat widgets offer today's slots from "now + notice" on the
 * VENUE's clock (before: the slot's wall-clock digits were compared with the
 * true UTC now, so east of UTC past times were offered and west of UTC too
 * few). Future days and the response shape are unchanged.
 */
class PublicServiceNoticeTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private array $seeded;

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function venue(string $zone, string $token): Organization
    {
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        }
        $org = Organization::create(['name' => "Venue $token", 'slug' => "$token-" . uniqid(), 'widget_token' => $token, 'timezone' => $zone]);
        $this->seeded = $this->seedBookableService($org->id);
        DB::table('service_master_schedules')->where('service_master_id', $this->seeded['master']->id)->update(['start_time' => '09:00:00', 'end_time' => '18:00:00']);
        app()->forgetInstance('current_organization_id');
        app()->forgetScopedInstances();

        return $org;
    }

    private function firstLabel(string $token, string $date): string
    {
        $slots = $this->getJson("/api/v1/services/availability?org={$token}&service_id={$this->seeded['service']->id}&date={$date}")->assertOk()->json('slots');
        app()->forgetInstance('current_organization_id');

        return $slots[0]['time_label'];
    }

    public function test_a_riga_venue_at_noon_offers_one_oclock_first(): void
    {
        $this->venue('Europe/Riga', 'wt-riga-notice');
        $this->travelTo(CarbonImmutable::parse('2026-10-01 09:00:00', 'UTC')); // 12:00 in Riga, notice 60 min

        $this->assertSame('13:00', $this->firstLabel('wt-riga-notice', '2026-10-01'));
        $this->assertSame('09:00', $this->firstLabel('wt-riga-notice', '2026-10-02'));
    }

    public function test_a_new_york_venue_at_ten_offers_eleven_first(): void
    {
        $this->venue('America/New_York', 'wt-ny-notice');
        $this->travelTo(CarbonImmutable::parse('2026-10-01 14:00:00', 'UTC')); // 10:00 in New York

        $this->assertSame('11:00', $this->firstLabel('wt-ny-notice', '2026-10-01'));
    }

    public function test_the_chat_widget_offers_the_same_first_time(): void
    {
        $org = $this->venue('Europe/Riga', 'wt-riga-chat');
        $this->travelTo(CarbonImmutable::parse('2026-10-01 09:00:00', 'UTC'));

        $chat = app(WidgetChatController::class);
        $tool = new \ReflectionMethod($chat, 'executeAgentTool');
        $out = $tool->invoke($chat, 'check_service_availability', ['service_id' => $this->seeded['service']->id, 'date' => '2026-10-01'], $org->id);

        $this->assertSame('13:00', $out['slots'][0]['time_label']);
    }

    public function test_an_extras_notice_counts_from_the_venues_now(): void
    {
        $this->venue('Europe/Riga', 'wt-riga-extra');
        $this->travelTo(CarbonImmutable::parse('2026-10-01 09:00:00', 'UTC')); // 12:00 in Riga
        $extra = DB::table('service_extras')->insertGetId([
            'organization_id' => Organization::where('widget_token', 'wt-riga-extra')->value('id'), 'name' => 'Hot stones',
            'price' => 10, 'currency' => 'EUR', 'lead_time_hours' => 3, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        // 14:30 in Riga is 2.5 hours away: too soon for a 3-hour extra (before: read as 5.5 hours away).
        $this->postJson('/api/v1/services/quote?org=wt-riga-extra', [
            'service_id' => $this->seeded['service']->id, 'service_master_id' => $this->seeded['master']->id,
            'start_at' => '2026-10-01T14:30:00+00:00', 'extras' => [['id' => $extra]],
        ])->assertStatus(422);
    }
}
```

  `$this->seedBookableService()` comes from `SetsUpServiceBookingSchema` (the fixture used by
  `PublicServiceAvailabilityZoneTest`). The `service_extras` insert uses only that table's columns: `organization_id`,
  `name`, `price`, `currency`, `lead_time_hours`, `is_active`, timestamps. If the table also requires `price_type`,
  its default `per_booking` applies.

- [ ] **Step 2: Run it.**
  - Run: `t.sh tests/Feature/Booking/PublicServiceNoticeTest.php`
  - Expected: FAIL:
    - Riga's first label is `10:00` (expected `13:00`)
    - New York's is `15:00` (expected `11:00`)
    - the chat widget says `10:00`
    - the quote answers 200 (expected 422)

- [ ] **Step 3: Implement** `app/Services/Booking/VenueNotice.php`:

```php
<?php

namespace App\Services\Booking;

use App\Services\Portal\AppointmentClock;
use Carbon\CarbonImmutable;

/**
 * A booking's notice ("not sooner than N minutes from now") on the venue's
 * own clock. The scheduler's own lead filter compares a slot's wall-clock
 * digits with the true UTC now; callers switch it off with
 * SCHEDULER_LEAD_OFF and filter here, as the member portal already does.
 */
final class VenueNotice
{
    /** Two days back: further than any venue's UTC offset can move a slot (the portal's value). */
    public const SCHEDULER_LEAD_OFF = -2 * 24 * 60;

    /**
     * The slots whose true start is at least $leadMinutes from now and which
     * exist on the venue's clock (not the hour a daylight-saving change
     * skips). Each slot comes back exactly as the scheduler made it.
     */
    public static function filter(array $slots, int $orgId, int $leadMinutes): array
    {
        $zone = AppointmentClock::zoneFor($orgId);
        $earliest = CarbonImmutable::now()->addMinutes($leadMinutes);

        return array_values(array_filter($slots, fn (array $slot) => AppointmentClock::existsLocally($slot['start'], $zone)
            && !AppointmentClock::toInstant($slot['start'], $zone)->lessThan($earliest)));
    }

    /** A stored start (the venue's wall-clock digits) → the true instant. */
    public static function instant(\DateTimeInterface|string $stored, int $orgId): CarbonImmutable
    {
        return AppointmentClock::toInstant($stored, AppointmentClock::zoneFor($orgId));
    }
}
```

- [ ] **Step 4: Use it in the three places.** Add `use App\Services\Booking\VenueNotice;` to each.
  - `ServicePublicController::availability()`: replace the `$slots = $scheduler->availableSlots(...)` call with:

```php
        $slots = VenueNotice::filter(
            $scheduler->availableSlots($service, $data['date'], $data['master_id'] ?? null, $stepMinutes, VenueNotice::SCHEDULER_LEAD_OFF),
            (int) $orgId,
            $leadMinutes,
        );
```

  - `ServicePublicController::confirm()`: replace `$startTs = $reservation['start']->getTimestamp();` with
    `$startTs = VenueNotice::instant($reservation['start'], (int) app('current_organization_id'))->getTimestamp();`.
  - `WidgetChatController` (`check_service_availability`): replace the `$slots = $scheduler->availableSlots(...)`
    call with:

```php
                    $slots = VenueNotice::filter(
                        $scheduler->availableSlots($service, $date, isset($args['master_id']) ? (int) $args['master_id'] : null, $stepMinutes, VenueNotice::SCHEDULER_LEAD_OFF),
                        $orgId,
                        $leadMinutes,
                    );
```

  - `ServiceQuoteBuilder::build()`: replace `$lines = $this->extraLines($extras, $partySize, $start);` with:

```php
        // The extras' notice counts from the venue's now: the stored start is
        // the venue's wall clock, not UTC (the widget and the portal both pass it).
        $lines = $this->extraLines($extras, $partySize, VenueNotice::instant($slot['start'], (int) app('current_organization_id')));
```

  - Update the builder's class docblock: "the extras with their per-person maths and lead-time guard (on the venue's
    clock)".

- [ ] **Step 5: Run it and its neighbours.**
  - Run: `t.sh tests/Feature/Booking/PublicServiceNoticeTest.php`. Expected: PASS (4 tests).
  - Run: `t.sh tests/Feature/Booking`. Expected: every test passes, including `PublicServiceAvailabilityZoneTest`
    (future day, shape unchanged) and `ServiceQuoteBuilderTest` (UTC venues unchanged).
  - Run: `t.sh tests/Feature/Member`. Expected: every test passes (the portal; ruling R2 changes only an extra's
    notice east or west of UTC, and no portal test books an extra within its notice at a non-UTC venue).
  - If one of those fails because it books an extra at a non-UTC venue near the limit, read its intent:
    - if it pinned the old offset arithmetic, correct its expectation and ledger a ruling;
    - if not, stop and investigate.

- [ ] **Step 6: Commit** with the message "Offer today's slots from the venue's own now in the public and chat widgets".

### Task 14: The full admin's slot step shows what the server uses (spec §9.3)

**Files:**
- Modify: `frontend/src/components/settings/BookingTab.tsx`, the slot-step `<select value={getVal('services_slot_step') || '30'}`
- Test: `frontend/src/components/settings/BookingTab.slotStep.test.tsx`

- [ ] **Step 1: Write the failing test:**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: 'en' } }),
}))

const { BookingTab } = await import('./BookingTab')

/** Nothing stored means 15 minutes on the server (ServiceCatalogue, the widget); the form must say 15 too. */
describe('BookingTab slot step', () => {
  it('shows the server default when nothing is stored', () => {
    const html = renderToStaticMarkup(
      <BookingTab getVal={() => ''} handleChange={() => {}} widgetToken="tok" cardClass="" cardStyle={{}} inputClass="" />,
    )
    const field = html.slice(html.indexOf('Slot Step'))
    expect(field).toMatch(/<option value="15"[^>]*selected=""/)
    expect(field.slice(0, field.indexOf('</select>'))).not.toMatch(/<option value="30"[^>]*selected=""/)
  })
})
```

  If `BookingTab` needs more providers (a query client, a store), wrap it the way the nearest existing
  `components/settings/*.test.tsx` does, and ledger the wrapper.

- [ ] **Step 2: Run it.**
  - Run: `cd frontend && npx vitest run src/components/settings/BookingTab.slotStep.test.tsx`
  - Expected: FAIL — option 30 is selected.

- [ ] **Step 3: Fix:** change `getVal('services_slot_step') || '30'` to `getVal('services_slot_step') || '15'`.

- [ ] **Step 4: Run it.** Same command. Expected: PASS.

- [ ] **Step 5: Commit** with the message "Show the slot step the server uses when none is stored".

### Task 15: Setup types, API calls, hours and preview helpers

**Files:**
- Modify: `frontend/src/appointments/lib/types.ts`, `frontend/src/appointments/lib/api.ts`
- Modify (fixtures only): `frontend/src/appointments/AppointmentsShell.test.tsx`,
  `frontend/src/appointments/calendar/calendarPage.test.tsx`. Their `readiness` gains
  `checklist: { steps: [], complete: true }`.
- Create: `frontend/src/appointments/lib/hours.ts`, `frontend/src/appointments/lib/preview.ts`
- Test: `frontend/src/appointments/lib/hours.test.ts`, `frontend/src/appointments/lib/preview.test.ts`,
  `frontend/src/appointments/lib/api.setup.test.ts`

**Interfaces:**
- Produces (types): `ChecklistKey`, `ChecklistStep`, `Checklist`, `SetupLink`, `SetupService`, `SetupCategory`,
  `HoursRow`, `TimeOffEntry`, `SetupTeamMember`, `StaffAccount`, `SetupSettings`, `SetupPayload`, `Stranded`,
  `Impact`, `ServiceBody`, `TeamBody`, `TimeOffBody`, `SettingsBody`. `Bootstrap.readiness.checklist: Checklist`.
- Produces (`appointmentsApi`): `setup`, `linkCopied`, `createService`, `updateService(id, body, dryRun)`,
  `createCategory`, `createTeamMember`, `updateTeamMember(id, body, dryRun)`, `saveHours(id, week, dryRun)`,
  `addTimeOff(id, body, dryRun)`, `removeTimeOff(id, entryId)`, `saveSettings(body)`,
  `currencyPreview(currency)`. Also `ApiFailure.fields?: Record<string, string[]>`.
- Produces (helpers):
  - `lib/hours.ts`: `WEEK_ORDER`, `Window`, `Week`, `DayProblem`, `MAX_WINDOWS`, `toWeek(rows)`, `toRows(week)`,
    `copyToWeekdays(week, from)`, `dayProblem(windows)`, `dayDate(dayOfWeek)`
  - `lib/preview.ts`: `previewThenSave(save, confirm)`

- [ ] **Step 1: Write the failing tests.**

  `frontend/src/appointments/lib/hours.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { copyToWeekdays, dayDate, dayProblem, toRows, toWeek } from './hours'

describe('a week of working hours', () => {
  const rows = [
    { day_of_week: 0, start_time: '10:00', end_time: '14:00' },
    { day_of_week: 1, start_time: '14:00', end_time: '18:00' },
    { day_of_week: 1, start_time: '09:00', end_time: '13:00' },
    { day_of_week: 2, start_time: '09:00', end_time: '17:00', is_active: false },
  ]

  it('reads rows into days, earliest first, and leaves out a switched-off row', () => {
    const week = toWeek(rows)
    expect(week[1]).toEqual([{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }])
    expect(week[2]).toEqual([])
    expect(week[0]).toEqual([{ start: '10:00', end: '14:00' }])
  })

  it('writes days back as rows, Monday first and Sunday last', () => {
    expect(toRows(toWeek(rows)).map(r => `${r.day_of_week} ${r.start_time}`)).toEqual(['1 09:00', '1 14:00', '0 10:00'])
  })

  it('copies one day to Monday–Friday and leaves the weekend', () => {
    const week = copyToWeekdays(toWeek(rows), 0)
    for (const day of [1, 2, 3, 4, 5]) expect(week[day]).toEqual([{ start: '10:00', end: '14:00' }])
    expect(week[6]).toEqual([])
  })

  it('names the problem the server would refuse', () => {
    expect(dayProblem([{ start: '09:00', end: '17:00' }])).toBeNull()
    expect(dayProblem([{ start: '20:00', end: '24:00' }])).toBeNull()
    expect(dayProblem([{ start: '17:00', end: '09:00' }])).toBe('order')
    expect(dayProblem([{ start: '09:00', end: '13:00' }, { start: '12:00', end: '15:00' }])).toBe('overlap')
    expect(dayProblem(Array.from({ length: 7 }, (_, i) => ({ start: `0${i}:00`, end: `0${i}:30` })))).toBe('too_many')
    expect(dayProblem([{ start: '9:00', end: '17:00' }])).toBe('format')
    expect(dayProblem([{ start: '09:00', end: '25:00' }])).toBe('format')
  })

  it('names a weekday with a date in the week of 5 October 2026 (a Monday)', () => {
    expect(dayDate(1)).toBe('2026-10-05')
    expect(dayDate(0)).toBe('2026-10-11')
  })
})
```

  `frontend/src/appointments/lib/preview.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { previewThenSave } from './preview'

const stranded = { affected: [{ id: 7, start: '2026-10-06T10:00', end: '2026-10-06T10:45', client: 'Sophie', service: 'Massage', team_member: 'Mara' }], total: 1 }
const none = { affected: [], total: 0 }

describe('previewThenSave', () => {
  it('saves at once when nothing is stranded, without asking', async () => {
    const save = vi.fn(async (dryRun: boolean) => ({ ...none, saved: !dryRun }))
    const confirm = vi.fn()
    expect(await previewThenSave(save, confirm)).toEqual({ ...none, saved: true })
    expect(save.mock.calls).toEqual([[true], [false]])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks with the list and saves only on yes', async () => {
    const save = vi.fn(async () => stranded)
    expect(await previewThenSave(save, async () => true)).toEqual(stranded)
    expect(save.mock.calls).toEqual([[true], [false]])
  })

  it('saves nothing when the person goes back', async () => {
    const save = vi.fn(async () => stranded)
    const confirm = vi.fn(async () => false)
    expect(await previewThenSave(save, confirm)).toBeNull()
    expect(confirm).toHaveBeenCalledWith(stranded)
    expect(save.mock.calls).toEqual([[true]])
  })
})
```

  `frontend/src/appointments/lib/api.setup.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { method: string; url: string; body?: unknown; config?: unknown }[] = []
vi.mock('../../lib/api', () => {
  const record = (method: string) => (url: string, body?: unknown, config?: unknown) => {
    calls.push({ method, url, body, config })
    return Promise.resolve({ data: { affected: [], total: 0 } })
  }
  return { api: { get: record('get'), post: record('post'), patch: record('patch'), put: record('put'), delete: record('delete') } }
})

const { appointmentsApi, failureOf } = await import('./api')

beforeEach(() => { calls.length = 0 })

describe('setup calls', () => {
  it('a dry run asks with ?dry_run=1 and a save without it', async () => {
    await appointmentsApi.updateService(3, { price: 50 }, true)
    await appointmentsApi.updateService(3, { price: 50 })
    expect(calls.map(c => [c.method, c.url, c.config])).toEqual([
      ['patch', '/v1/admin/appointments/setup/services/3', { params: { dry_run: 1 } }],
      ['patch', '/v1/admin/appointments/setup/services/3', undefined],
    ])
  })

  it('hours go as the whole week', async () => {
    await appointmentsApi.saveHours(4, [{ day_of_week: 1, start_time: '09:00', end_time: '17:00' }], true)
    expect(calls[0]).toEqual({ method: 'put', url: '/v1/admin/appointments/setup/team/4/hours', body: { week: [{ day_of_week: 1, start_time: '09:00', end_time: '17:00' }] }, config: { params: { dry_run: 1 } } })
  })

  it('a refused form says which fields', () => {
    const failure = failureOf({ response: { status: 422, data: { message: 'The name field is required.', errors: { name: ['The name field is required.'] } } } })
    expect(failure.fields).toEqual({ name: ['The name field is required.'] })
    expect(failure.status).toBe(422)
  })
})
```

- [ ] **Step 2: Run them.**
  - Run: `cd frontend && npx vitest run src/appointments/lib/hours.test.ts src/appointments/lib/preview.test.ts src/appointments/lib/api.setup.test.ts`
  - Expected: FAIL — the modules and functions do not exist.

- [ ] **Step 3: Add the types** to `frontend/src/appointments/lib/types.ts`. Change `Bootstrap.readiness` to
  `readiness: { services: number; team: number; bookable: boolean; checklist: Checklist }`, and append:

```ts
export type ChecklistKey = 'timezone' | 'service' | 'performer' | 'hours' | 'online' | 'first_appointment'
export interface ChecklistStep { key: ChecklistKey; done: boolean; optional: boolean }
export interface Checklist { steps: ChecklistStep[]; complete: boolean }

/** A person on a service, or a service on a person, with the optional own duration and price. */
export interface SetupLink { id: number; duration_minutes: number | null; price: number | null }
export interface SetupService {
  id: number; name: string; category_id: number | null; duration_minutes: number; buffer_after_minutes: number
  price: number; currency: string; short_description: string | null; is_active: boolean; performers: SetupLink[]
}
export interface SetupCategory { id: number; name: string }
/** One working window: `HH:MM` times, day_of_week 0 = Sunday (the server's own reading). */
export interface HoursRow { day_of_week: number; start_time: string; end_time: string; is_active?: boolean }
export interface TimeOffEntry { id: number; date: DateKey; start_time: string | null; end_time: string | null; reason: string | null }
export interface SetupTeamMember {
  id: number; name: string; title: string | null; email: string | null; phone: string | null; user_id: number | null
  is_active: boolean; services: SetupLink[]; week: HoursRow[]; time_off: TimeOffEntry[]
}
export interface StaffAccount { user_id: number; name: string; email: string }
export interface SetupSettings {
  timezone: string; timezone_named: boolean; zones: string[]; currency: string
  lead_minutes: number; slot_step: number; max_advance_days: number; allow_master_choice: boolean
  points_on_bookings: boolean; programme_on: boolean; booking_link: string | null; embed_snippet: string | null
  upcoming_appointments: number
}
export interface SetupPayload {
  can_manage: boolean; my_team_member_id: number | null; services: SetupService[]; categories: SetupCategory[]
  team: SetupTeamMember[]; staff_accounts: StaffAccount[]; settings: SetupSettings; checklist: Checklist
}
/** An upcoming appointment a setup change would leave outside the person's hours. */
export interface Stranded { id: number; start: Wall; end: Wall; client: string; service: string | null; team_member: string | null }
export interface Impact { affected: Stranded[]; total: number }

export interface ServiceBody {
  name: string; category_id: number | null; duration_minutes: number; buffer_after_minutes: number; price: number
  short_description: string | null; is_active: boolean; performers: SetupLink[]
}
export interface TeamBody {
  name: string; title: string | null; email: string | null; phone: string | null; user_id: number | null
  is_active: boolean; services: SetupLink[]
}
export interface TimeOffBody { from: DateKey; to?: DateKey; start_time?: string; end_time?: string; reason?: string }
export type SettingsBody = Partial<Pick<SetupSettings, 'timezone' | 'currency' | 'lead_minutes' | 'slot_step' | 'max_advance_days' | 'allow_master_choice' | 'points_on_bookings'>>
```

  Then add `checklist: { steps: [], complete: true }` to the `readiness` of the two test fixtures named under
  Files. Without it `tsc -b` fails.

- [ ] **Step 4: Add the calls** to `frontend/src/appointments/lib/api.ts`.
  - Extend the type import with `Checklist, HoursRow, Impact, ServiceBody, SettingsBody, SetupCategory,
    SetupPayload, SetupService, SetupSettings, SetupTeamMember, TeamBody, TimeOffBody`.
  - Add, after `const BASE`:

```ts
/** `?dry_run=1`: the server answers with the appointments a change would strand and saves nothing. */
const dryRunParams = (dryRun: boolean) => (dryRun ? { params: { dry_run: 1 } } : undefined)
```

  - Append these members inside `appointmentsApi`:

```ts
  setup: (): Promise<SetupPayload> => watched(api.get(`${BASE}/setup`)),

  linkCopied: (): Promise<{ checklist: Checklist }> => watched(api.post(`${BASE}/setup/checklist/link-copied`)),

  createService: (body: ServiceBody): Promise<{ service: SetupService }> => watched(api.post(`${BASE}/setup/services`, body)),

  updateService: (id: number, body: Partial<ServiceBody>, dryRun = false): Promise<{ service?: SetupService } & Impact> =>
    watched(api.patch(`${BASE}/setup/services/${id}`, body, dryRunParams(dryRun))),

  createCategory: (name: string): Promise<{ category: SetupCategory }> => watched(api.post(`${BASE}/setup/categories`, { name })),

  createTeamMember: (body: TeamBody): Promise<{ team_member: SetupTeamMember }> => watched(api.post(`${BASE}/setup/team`, body)),

  updateTeamMember: (id: number, body: Partial<TeamBody>, dryRun = false): Promise<{ team_member?: SetupTeamMember } & Impact> =>
    watched(api.patch(`${BASE}/setup/team/${id}`, body, dryRunParams(dryRun))),

  saveHours: (id: number, week: HoursRow[], dryRun = false): Promise<{ team_member?: SetupTeamMember } & Impact> =>
    watched(api.put(`${BASE}/setup/team/${id}/hours`, { week }, dryRunParams(dryRun))),

  addTimeOff: (id: number, body: TimeOffBody, dryRun = false): Promise<{ team_member?: SetupTeamMember } & Impact> =>
    watched(api.post(`${BASE}/setup/team/${id}/time-off`, body, dryRunParams(dryRun))),

  removeTimeOff: (id: number, entryId: number): Promise<{ team_member: SetupTeamMember }> =>
    watched(api.delete(`${BASE}/setup/team/${id}/time-off/${entryId}`)),

  saveSettings: (body: SettingsBody): Promise<{ settings: SetupSettings; checklist: Checklist }> =>
    watched(api.patch(`${BASE}/setup/settings`, body)),

  /** How many services and extras a currency change would relabel; nothing is saved. */
  currencyPreview: (currency: string): Promise<{ services: number; extras: number }> =>
    watched(api.patch(`${BASE}/setup/settings`, { currency }, dryRunParams(true))),
```

  - In `ApiFailure` add `fields?: Record<string, string[]>`.
  - In `failureOf()`'s returned object add
    `fields: data.errors && typeof data.errors === 'object' ? (data.errors as Record<string, string[]>) : undefined,`.

- [ ] **Step 5: Create** `frontend/src/appointments/lib/hours.ts`:

```ts
import type { DateKey, HoursRow } from './types'
import { minutesOf } from './wallClock'

/** Monday first, as a week is read at the desk; the values are the server's day numbers (0 = Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
export const MAX_WINDOWS = 6

export interface Window { start: string; end: string }
export type Week = Record<number, Window[]>
export type DayProblem = 'format' | 'order' | 'overlap' | 'too_many'

/** `HH:MM` from 00:00 to 23:59, or 24:00 as an end: the server's own pattern (WeeklyHours). */
const TIME = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/

const emptyWeek = (): Week => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] })

/** Rows → days. A switched-off row is left out: it has no effect, and saving here writes the week without it. */
export function toWeek(rows: HoursRow[]): Week {
  const week = emptyWeek()
  for (const row of rows) if (row.is_active !== false) week[row.day_of_week].push({ start: row.start_time, end: row.end_time })
  for (const day of Object.keys(week)) week[Number(day)].sort((a, b) => a.start.localeCompare(b.start))
  return week
}

export function toRows(week: Week): HoursRow[] {
  return WEEK_ORDER.flatMap(day => week[day].map(w => ({ day_of_week: day, start_time: w.start, end_time: w.end })))
}

/** Monday to Friday take `from`'s windows; Saturday and Sunday keep theirs. */
export function copyToWeekdays(week: Week, from: number): Week {
  const next: Week = { ...week }
  for (const day of [1, 2, 3, 4, 5]) next[day] = week[from].map(w => ({ ...w }))
  return next
}

/** The server's own rules for one day (WeeklyHours), checked while the person types. */
export function dayProblem(windows: Window[]): DayProblem | null {
  if (windows.some(w => !TIME.test(w.start) || !TIME.test(w.end))) return 'format'
  if (windows.length > MAX_WINDOWS) return 'too_many'
  const spans = windows.map(w => [minutesOf(w.start), minutesOf(w.end)] as const)
  if (spans.some(([start, end]) => !(end > start))) return 'order'
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  for (let i = 1; i < sorted.length; i++) if (sorted[i][0] < sorted[i - 1][1]) return 'overlap'
  return null
}

/** A date in the week of Monday 5 October 2026, for printing a weekday's name with formatDate(). */
export function dayDate(dayOfWeek: number): DateKey {
  return `2026-10-${String(dayOfWeek === 0 ? 11 : 4 + dayOfWeek).padStart(2, '0')}`
}
```

- [ ] **Step 6: Create** `frontend/src/appointments/lib/preview.ts`:

```ts
import type { Impact } from './types'

/**
 * A setup save that can strand appointments (owner decision: warn, list,
 * still allow). Ask the server first with nothing saved; with nothing
 * stranded, save at once; otherwise save only if the person confirms after
 * seeing the list. Null when they went back.
 */
export async function previewThenSave<T extends Impact>(
  save: (dryRun: boolean) => Promise<T>,
  confirm: (impact: Impact) => Promise<boolean>,
): Promise<T | null> {
  const preview = await save(true)
  if (preview.total > 0 && !(await confirm({ affected: preview.affected, total: preview.total }))) return null
  return save(false)
}
```

- [ ] **Step 7: Run them.**
  - Run: the Step 2 command, then `npx tsc -b`.
  - Expected: PASS (5 + 3 + 3 tests), and tsc clean.

- [ ] **Step 8: Commit** `lib/types.ts`, `lib/api.ts`, `lib/hours.ts`, `lib/preview.ts`, the three tests and the
  two fixture edits, with the message "Give the workspace its setup types, calls and helpers".

### Task 16: Setup strings in five languages

**Files:**
- Create: `.superpowers/sdd/2026-09-30-appointments-workspace/tools/add-setup-strings.cjs`,
  `.superpowers/sdd/2026-09-30-appointments-workspace/tools/setup-strings.json` (rig files, untracked)
- Modify: `frontend/src/appointments/i18n/appointments.{en,ru,de,fr,es}.json`,
  `frontend/src/appointments/i18n/appointmentsLocales.test.ts` (`FAMILIES`)

The bundles are hand-formatted, so a parse-and-rewrite would reformat every line. The script inserts text instead,
then parses the result to prove it is still JSON. Write both rig files with the Write tool: a Bash heredoc mangles
backslashes.

- [ ] **Step 1: Add the families** to `FAMILIES` in `appointmentsLocales.test.ts`. These keys are built at run time
  as `` `appointments.setup.step.${key}` `` and `` `appointments.setup.hours.problem.${problem}` ``:

```ts
  'setup.step': ['timezone', 'service', 'performer', 'hours', 'online', 'first_appointment'],
  'setup.hours.problem': ['format', 'order', 'overlap', 'too_many'],
```

- [ ] **Step 2: Run it.**
  - Run: `cd frontend && npx vitest run src/appointments/i18n/appointmentsLocales.test.ts`
  - Expected: FAIL — `setup.step.*` and `setup.hours.problem.*` are missing in all five locales.

- [ ] **Step 3: Write** `tools/setup-strings.json` with this content (every value; the placeholders match across
  languages):

```json
{
  "en": {
    "nav_setup": "Setup",
    "setup": {
      "title": "Setup",
      "load_failed": "Setup could not be loaded. Please try again.",
      "read_only": "Only an owner or a manager can change setup. You can see it here and manage your own time off under Team.",
      "save": "Save", "add": "Add", "remove": "Remove", "active": "Active", "inactive": "Inactive",
      "show_inactive": "Show inactive", "none_yet": "Nothing here yet.", "invalid": "Please check what you entered:",
      "tabs": { "services": "Services", "team": "Team", "settings": "Settings" },
      "checklist": {
        "title": "Get ready to take bookings", "progress": "{{done}} of {{total}} done", "optional": "Optional", "done": "Done", "go": "Go",
        "banner": "Setup is not finished: {{done}} of {{total}} steps done.", "open": "Continue setup"
      },
      "step": {
        "timezone": "Set the venue's time zone", "service": "Add a service", "performer": "Choose who performs it",
        "hours": "Set their weekly hours", "online": "Share your online booking link", "first_appointment": "Book the first appointment"
      },
      "services": {
        "search": "Search services", "new": "New service", "edit": "Edit service", "no_category": "Other", "name": "Name",
        "category": "Category", "no_category_option": "No category", "new_category": "New category…", "category_name": "New category name",
        "duration": "Duration (minutes)", "buffer": "Break after (minutes)", "price": "Price", "short_description": "Short description",
        "performers": "Who performs it", "own_duration": "Own minutes", "own_price": "Own price", "minutes": "{{count}} min",
        "full_admin": "Photos, gallery and the long description are edited in the full admin.", "full_admin_link": "Open in the full admin"
      },
      "team": {
        "new": "New team member", "edit": "Edit team member", "profile": "Profile", "name": "Name", "title": "Title", "email": "Email",
        "phone": "Phone", "sign_in": "Signs in as", "no_sign_in": "Not linked",
        "sign_in_hint": "Linking a sign-in lets this person add their own time off.", "services": "Services they perform",
        "hours": "Weekly hours", "time_off": "Time off", "my_time_off": "My time off",
        "not_linked": "Your sign-in is not linked to a team member yet. A manager can link it under Team.",
        "save_profile": "Save profile", "save_hours": "Save hours", "services_count": "Services: {{count}}"
      },
      "hours": {
        "off": "Off", "add_window": "Add hours", "from": "From", "to": "To", "copy_to_weekdays": "Copy to Monday–Friday",
        "problem": { "format": "Write times as HH:MM, for example 09:30.", "order": "The end must be after the start.", "overlap": "These hours overlap.", "too_many": "At most 6 time ranges a day." }
      },
      "time_off": {
        "none": "No time off planned.", "add": "Add time off", "from": "From", "to": "To", "all_day": "All day",
        "start": "Starts", "end": "Ends", "reason": "Reason"
      },
      "settings": {
        "venue": "Venue", "timezone": "Time zone",
        "timezone_note": "Changing the time zone does not move appointments: {{count}} upcoming appointments keep their clock times.",
        "currency": "Currency", "currency_note": "Changing the currency relabels prices; it never converts them.",
        "currency_confirm": "{{services}} services and {{extras}} extras will show {{currency}}. The amounts stay the same. Change the currency?",
        "online": "Online booking", "lead": "Minimum notice (minutes)", "step": "Start times every", "step_minutes": "{{count}} min",
        "ahead": "Bookable up to (days ahead)", "choose_person": "Clients may choose the person", "loyalty": "Loyalty",
        "points": "Award points when an appointment is completed", "link": "Booking page", "snippet": "Website embed code",
        "copy": "Copy", "copied": "Copied", "no_link": "This organisation has no booking link yet.", "saved": "Saved."
      },
      "conflict": {
        "title": "Appointments affected: {{count}}",
        "intro": "These appointments fall outside this change. They stay booked: move or cancel them from the calendar if needed. Nobody is messaged.",
        "more": "…and {{count}} more.", "save_anyway": "Save anyway", "back": "Back", "open": "Open"
      }
    }
  },
  "ru": {
    "nav_setup": "Настройка",
    "setup": {
      "title": "Настройка",
      "load_failed": "Не удалось загрузить настройку. Попробуйте ещё раз.",
      "read_only": "Изменять настройку может только владелец или менеджер. Здесь её можно посмотреть, а свои отсутствия — указать в разделе «Команда».",
      "save": "Сохранить", "add": "Добавить", "remove": "Удалить", "active": "Активен", "inactive": "Неактивен",
      "show_inactive": "Показать неактивные", "none_yet": "Здесь пока ничего нет.", "invalid": "Проверьте введённые данные:",
      "tabs": { "services": "Услуги", "team": "Команда", "settings": "Параметры" },
      "checklist": {
        "title": "Подготовка к приёму записей", "progress": "Готово {{done}} из {{total}}", "optional": "Необязательно", "done": "Готово", "go": "Перейти",
        "banner": "Настройка не завершена: готово {{done}} из {{total}} шагов.", "open": "Продолжить настройку"
      },
      "step": {
        "timezone": "Укажите часовой пояс заведения", "service": "Добавьте услугу", "performer": "Выберите, кто её выполняет",
        "hours": "Задайте рабочие часы", "online": "Поделитесь ссылкой для онлайн-записи", "first_appointment": "Создайте первую запись"
      },
      "services": {
        "search": "Поиск услуг", "new": "Новая услуга", "edit": "Изменить услугу", "no_category": "Другое", "name": "Название",
        "category": "Категория", "no_category_option": "Без категории", "new_category": "Новая категория…", "category_name": "Название новой категории",
        "duration": "Длительность (мин)", "buffer": "Перерыв после (мин)", "price": "Цена", "short_description": "Краткое описание",
        "performers": "Кто выполняет", "own_duration": "Своя длительность", "own_price": "Своя цена", "minutes": "{{count}} мин",
        "full_admin": "Фото, галерея и полное описание редактируются в полной админке.", "full_admin_link": "Открыть в полной админке"
      },
      "team": {
        "new": "Новый сотрудник", "edit": "Изменить сотрудника", "profile": "Профиль", "name": "Имя", "title": "Должность", "email": "Эл. почта",
        "phone": "Телефон", "sign_in": "Входит как", "no_sign_in": "Не привязан",
        "sign_in_hint": "Если привязать вход, сотрудник сможет сам указывать свои отсутствия.", "services": "Выполняемые услуги",
        "hours": "Рабочие часы", "time_off": "Отсутствия", "my_time_off": "Мои отсутствия",
        "not_linked": "Ваш вход ещё не привязан к сотруднику. Менеджер может привязать его в разделе «Команда».",
        "save_profile": "Сохранить профиль", "save_hours": "Сохранить часы", "services_count": "Услуг: {{count}}"
      },
      "hours": {
        "off": "Выходной", "add_window": "Добавить часы", "from": "С", "to": "До", "copy_to_weekdays": "Скопировать на пн–пт",
        "problem": { "format": "Укажите время в формате ЧЧ:ММ, например 09:30.", "order": "Окончание должно быть позже начала.", "overlap": "Эти часы пересекаются.", "too_many": "Не больше 6 интервалов в день." }
      },
      "time_off": {
        "none": "Отсутствий не запланировано.", "add": "Добавить отсутствие", "from": "С", "to": "По", "all_day": "Весь день",
        "start": "Начало", "end": "Конец", "reason": "Причина"
      },
      "settings": {
        "venue": "Заведение", "timezone": "Часовой пояс",
        "timezone_note": "Смена часового пояса не сдвигает записи: {{count}} предстоящих записей сохранят своё время.",
        "currency": "Валюта", "currency_note": "Смена валюты меняет обозначение цен, но не пересчитывает их.",
        "currency_confirm": "{{services}} услуг и {{extras}} доп. опций будут показаны в {{currency}}. Суммы не изменятся. Сменить валюту?",
        "online": "Онлайн-запись", "lead": "Минимум до начала (мин)", "step": "Время начала каждые", "step_minutes": "{{count}} мин",
        "ahead": "Запись не дальше чем на (дней)", "choose_person": "Клиент может выбрать специалиста", "loyalty": "Лояльность",
        "points": "Начислять баллы за завершённую запись", "link": "Страница записи", "snippet": "Код для сайта",
        "copy": "Копировать", "copied": "Скопировано", "no_link": "У организации пока нет ссылки для записи.", "saved": "Сохранено."
      },
      "conflict": {
        "title": "Затронуто записей: {{count}}",
        "intro": "Эти записи выходят за рамки изменения. Они остаются в силе: при необходимости перенесите или отмените их в календаре. Никому не отправляются сообщения.",
        "more": "…и ещё {{count}}.", "save_anyway": "Всё равно сохранить", "back": "Назад", "open": "Открыть"
      }
    }
  },
  "de": {
    "nav_setup": "Einrichtung",
    "setup": {
      "title": "Einrichtung",
      "load_failed": "Die Einrichtung konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
      "read_only": "Nur Inhaber oder Manager können die Einrichtung ändern. Hier können Sie sie ansehen und unter Team Ihre eigene Abwesenheit eintragen.",
      "save": "Speichern", "add": "Hinzufügen", "remove": "Entfernen", "active": "Aktiv", "inactive": "Inaktiv",
      "show_inactive": "Inaktive anzeigen", "none_yet": "Noch nichts vorhanden.", "invalid": "Bitte prüfen Sie Ihre Eingaben:",
      "tabs": { "services": "Leistungen", "team": "Team", "settings": "Einstellungen" },
      "checklist": {
        "title": "Bereit für Buchungen", "progress": "{{done}} von {{total}} erledigt", "optional": "Optional", "done": "Erledigt", "go": "Los",
        "banner": "Die Einrichtung ist nicht abgeschlossen: {{done}} von {{total}} Schritten erledigt.", "open": "Einrichtung fortsetzen"
      },
      "step": {
        "timezone": "Zeitzone des Standorts festlegen", "service": "Eine Leistung anlegen", "performer": "Festlegen, wer sie ausführt",
        "hours": "Wöchentliche Arbeitszeiten festlegen", "online": "Online-Buchungslink teilen", "first_appointment": "Den ersten Termin buchen"
      },
      "services": {
        "search": "Leistungen suchen", "new": "Neue Leistung", "edit": "Leistung bearbeiten", "no_category": "Sonstige", "name": "Name",
        "category": "Kategorie", "no_category_option": "Keine Kategorie", "new_category": "Neue Kategorie…", "category_name": "Name der neuen Kategorie",
        "duration": "Dauer (Minuten)", "buffer": "Pause danach (Minuten)", "price": "Preis", "short_description": "Kurzbeschreibung",
        "performers": "Wer sie ausführt", "own_duration": "Eigene Dauer", "own_price": "Eigener Preis", "minutes": "{{count}} Min.",
        "full_admin": "Fotos, Galerie und ausführliche Beschreibung werden im vollständigen Admin bearbeitet.", "full_admin_link": "Im vollständigen Admin öffnen"
      },
      "team": {
        "new": "Neues Teammitglied", "edit": "Teammitglied bearbeiten", "profile": "Profil", "name": "Name", "title": "Funktion", "email": "E-Mail",
        "phone": "Telefon", "sign_in": "Meldet sich an als", "no_sign_in": "Nicht verknüpft",
        "sign_in_hint": "Mit einer verknüpften Anmeldung kann diese Person ihre Abwesenheit selbst eintragen.", "services": "Ausgeführte Leistungen",
        "hours": "Wöchentliche Arbeitszeiten", "time_off": "Abwesenheit", "my_time_off": "Meine Abwesenheit",
        "not_linked": "Ihre Anmeldung ist noch keinem Teammitglied zugeordnet. Ein Manager kann sie unter Team verknüpfen.",
        "save_profile": "Profil speichern", "save_hours": "Arbeitszeiten speichern", "services_count": "Leistungen: {{count}}"
      },
      "hours": {
        "off": "Frei", "add_window": "Zeiten hinzufügen", "from": "Von", "to": "Bis", "copy_to_weekdays": "Auf Montag–Freitag übertragen",
        "problem": { "format": "Geben Sie Zeiten als HH:MM ein, zum Beispiel 09:30.", "order": "Das Ende muss nach dem Beginn liegen.", "overlap": "Diese Zeiten überschneiden sich.", "too_many": "Höchstens 6 Zeitfenster pro Tag." }
      },
      "time_off": {
        "none": "Keine Abwesenheit geplant.", "add": "Abwesenheit hinzufügen", "from": "Von", "to": "Bis", "all_day": "Ganztägig",
        "start": "Beginn", "end": "Ende", "reason": "Grund"
      },
      "settings": {
        "venue": "Standort", "timezone": "Zeitzone",
        "timezone_note": "Eine andere Zeitzone verschiebt keine Termine: {{count}} anstehende Termine behalten ihre Uhrzeit.",
        "currency": "Währung", "currency_note": "Eine andere Währung ändert nur die Bezeichnung der Preise, sie rechnet nicht um.",
        "currency_confirm": "{{services}} Leistungen und {{extras}} Extras werden in {{currency}} angezeigt. Die Beträge bleiben gleich. Währung ändern?",
        "online": "Online-Buchung", "lead": "Mindestvorlauf (Minuten)", "step": "Startzeiten alle", "step_minutes": "{{count}} Min.",
        "ahead": "Buchbar bis (Tage im Voraus)", "choose_person": "Kunden dürfen die Person wählen", "loyalty": "Treueprogramm",
        "points": "Punkte für abgeschlossene Termine vergeben", "link": "Buchungsseite", "snippet": "Einbettungscode für die Website",
        "copy": "Kopieren", "copied": "Kopiert", "no_link": "Diese Organisation hat noch keinen Buchungslink.", "saved": "Gespeichert."
      },
      "conflict": {
        "title": "Betroffene Termine: {{count}}",
        "intro": "Diese Termine liegen außerhalb dieser Änderung. Sie bleiben gebucht: Verschieben oder stornieren Sie sie bei Bedarf im Kalender. Niemand wird benachrichtigt.",
        "more": "…und {{count}} weitere.", "save_anyway": "Trotzdem speichern", "back": "Zurück", "open": "Öffnen"
      }
    }
  },
  "fr": {
    "nav_setup": "Configuration",
    "setup": {
      "title": "Configuration",
      "load_failed": "La configuration n’a pas pu être chargée. Veuillez réessayer.",
      "read_only": "Seuls un propriétaire ou un manager peuvent modifier la configuration. Vous pouvez la consulter ici et gérer vos propres absences dans Équipe.",
      "save": "Enregistrer", "add": "Ajouter", "remove": "Supprimer", "active": "Actif", "inactive": "Inactif",
      "show_inactive": "Afficher les inactifs", "none_yet": "Rien pour l’instant.", "invalid": "Veuillez vérifier votre saisie :",
      "tabs": { "services": "Prestations", "team": "Équipe", "settings": "Paramètres" },
      "checklist": {
        "title": "Prêt à prendre des rendez-vous", "progress": "{{done}} sur {{total}} terminés", "optional": "Facultatif", "done": "Terminé", "go": "Y aller",
        "banner": "La configuration n’est pas terminée : {{done}} étapes sur {{total}}.", "open": "Continuer la configuration"
      },
      "step": {
        "timezone": "Définir le fuseau horaire de l’établissement", "service": "Ajouter une prestation", "performer": "Choisir qui la réalise",
        "hours": "Définir les horaires hebdomadaires", "online": "Partager le lien de réservation en ligne", "first_appointment": "Réserver le premier rendez-vous"
      },
      "services": {
        "search": "Rechercher une prestation", "new": "Nouvelle prestation", "edit": "Modifier la prestation", "no_category": "Autres", "name": "Nom",
        "category": "Catégorie", "no_category_option": "Sans catégorie", "new_category": "Nouvelle catégorie…", "category_name": "Nom de la nouvelle catégorie",
        "duration": "Durée (minutes)", "buffer": "Pause après (minutes)", "price": "Prix", "short_description": "Description courte",
        "performers": "Qui la réalise", "own_duration": "Durée propre", "own_price": "Prix propre", "minutes": "{{count}} min",
        "full_admin": "Les photos, la galerie et la description complète se modifient dans l’administration complète.", "full_admin_link": "Ouvrir dans l’administration complète"
      },
      "team": {
        "new": "Nouveau membre de l’équipe", "edit": "Modifier le membre", "profile": "Profil", "name": "Nom", "title": "Fonction", "email": "E-mail",
        "phone": "Téléphone", "sign_in": "Se connecte en tant que", "no_sign_in": "Non associé",
        "sign_in_hint": "Associer une connexion permet à cette personne d’ajouter elle-même ses absences.", "services": "Prestations réalisées",
        "hours": "Horaires hebdomadaires", "time_off": "Absences", "my_time_off": "Mes absences",
        "not_linked": "Votre connexion n’est pas encore associée à un membre de l’équipe. Un manager peut l’associer dans Équipe.",
        "save_profile": "Enregistrer le profil", "save_hours": "Enregistrer les horaires", "services_count": "Prestations : {{count}}"
      },
      "hours": {
        "off": "Repos", "add_window": "Ajouter des horaires", "from": "De", "to": "À", "copy_to_weekdays": "Copier du lundi au vendredi",
        "problem": { "format": "Saisissez les heures au format HH:MM, par exemple 09:30.", "order": "La fin doit être après le début.", "overlap": "Ces horaires se chevauchent.", "too_many": "6 plages horaires par jour au maximum." }
      },
      "time_off": {
        "none": "Aucune absence prévue.", "add": "Ajouter une absence", "from": "Du", "to": "Au", "all_day": "Toute la journée",
        "start": "Début", "end": "Fin", "reason": "Motif"
      },
      "settings": {
        "venue": "Établissement", "timezone": "Fuseau horaire",
        "timezone_note": "Changer de fuseau horaire ne déplace pas les rendez-vous : {{count}} rendez-vous à venir gardent leur heure.",
        "currency": "Devise", "currency_note": "Changer de devise renomme les prix sans les convertir.",
        "currency_confirm": "{{services}} prestations et {{extras}} suppléments seront affichés en {{currency}}. Les montants restent identiques. Changer de devise ?",
        "online": "Réservation en ligne", "lead": "Délai minimum (minutes)", "step": "Créneaux toutes les", "step_minutes": "{{count}} min",
        "ahead": "Réservable jusqu’à (jours à l’avance)", "choose_person": "Les clients peuvent choisir la personne", "loyalty": "Fidélité",
        "points": "Attribuer des points quand un rendez-vous est terminé", "link": "Page de réservation", "snippet": "Code d’intégration pour le site",
        "copy": "Copier", "copied": "Copié", "no_link": "Cette organisation n’a pas encore de lien de réservation.", "saved": "Enregistré."
      },
      "conflict": {
        "title": "Rendez-vous concernés : {{count}}",
        "intro": "Ces rendez-vous sortent du cadre de cette modification. Ils restent réservés : déplacez-les ou annulez-les depuis le calendrier si besoin. Personne n’est prévenu.",
        "more": "…et {{count}} de plus.", "save_anyway": "Enregistrer quand même", "back": "Retour", "open": "Ouvrir"
      }
    }
  },
  "es": {
    "nav_setup": "Configuración",
    "setup": {
      "title": "Configuración",
      "load_failed": "No se pudo cargar la configuración. Inténtelo de nuevo.",
      "read_only": "Solo un propietario o un gerente puede cambiar la configuración. Aquí puede verla y gestionar sus propias ausencias en Equipo.",
      "save": "Guardar", "add": "Añadir", "remove": "Quitar", "active": "Activo", "inactive": "Inactivo",
      "show_inactive": "Mostrar inactivos", "none_yet": "Aún no hay nada.", "invalid": "Revise lo que ha introducido:",
      "tabs": { "services": "Servicios", "team": "Equipo", "settings": "Ajustes" },
      "checklist": {
        "title": "Listo para recibir reservas", "progress": "{{done}} de {{total}} hechos", "optional": "Opcional", "done": "Hecho", "go": "Ir",
        "banner": "La configuración no está terminada: {{done}} de {{total}} pasos hechos.", "open": "Continuar la configuración"
      },
      "step": {
        "timezone": "Definir la zona horaria del local", "service": "Añadir un servicio", "performer": "Elegir quién lo realiza",
        "hours": "Definir su horario semanal", "online": "Compartir el enlace de reserva en línea", "first_appointment": "Reservar la primera cita"
      },
      "services": {
        "search": "Buscar servicios", "new": "Nuevo servicio", "edit": "Editar servicio", "no_category": "Otros", "name": "Nombre",
        "category": "Categoría", "no_category_option": "Sin categoría", "new_category": "Nueva categoría…", "category_name": "Nombre de la nueva categoría",
        "duration": "Duración (minutos)", "buffer": "Pausa después (minutos)", "price": "Precio", "short_description": "Descripción breve",
        "performers": "Quién lo realiza", "own_duration": "Duración propia", "own_price": "Precio propio", "minutes": "{{count}} min",
        "full_admin": "Las fotos, la galería y la descripción completa se editan en el panel completo.", "full_admin_link": "Abrir en el panel completo"
      },
      "team": {
        "new": "Nuevo miembro del equipo", "edit": "Editar miembro", "profile": "Perfil", "name": "Nombre", "title": "Cargo", "email": "Correo electrónico",
        "phone": "Teléfono", "sign_in": "Inicia sesión como", "no_sign_in": "Sin vincular",
        "sign_in_hint": "Vincular un inicio de sesión permite a esta persona añadir sus propias ausencias.", "services": "Servicios que realiza",
        "hours": "Horario semanal", "time_off": "Ausencias", "my_time_off": "Mis ausencias",
        "not_linked": "Su inicio de sesión aún no está vinculado a un miembro del equipo. Un gerente puede vincularlo en Equipo.",
        "save_profile": "Guardar perfil", "save_hours": "Guardar horario", "services_count": "Servicios: {{count}}"
      },
      "hours": {
        "off": "Libre", "add_window": "Añadir horario", "from": "Desde", "to": "Hasta", "copy_to_weekdays": "Copiar de lunes a viernes",
        "problem": { "format": "Escriba las horas como HH:MM, por ejemplo 09:30.", "order": "El final debe ser posterior al inicio.", "overlap": "Estos horarios se solapan.", "too_many": "Como máximo 6 franjas al día." }
      },
      "time_off": {
        "none": "No hay ausencias previstas.", "add": "Añadir ausencia", "from": "Desde", "to": "Hasta", "all_day": "Todo el día",
        "start": "Inicio", "end": "Fin", "reason": "Motivo"
      },
      "settings": {
        "venue": "Local", "timezone": "Zona horaria",
        "timezone_note": "Cambiar la zona horaria no mueve las citas: {{count}} citas próximas conservan su hora.",
        "currency": "Moneda", "currency_note": "Cambiar la moneda solo cambia cómo se muestran los precios; no los convierte.",
        "currency_confirm": "{{services}} servicios y {{extras}} extras se mostrarán en {{currency}}. Los importes no cambian. ¿Cambiar la moneda?",
        "online": "Reserva en línea", "lead": "Antelación mínima (minutos)", "step": "Horas de inicio cada", "step_minutes": "{{count}} min",
        "ahead": "Reservable hasta (días de antelación)", "choose_person": "Los clientes pueden elegir a la persona", "loyalty": "Fidelización",
        "points": "Dar puntos cuando se completa una cita", "link": "Página de reserva", "snippet": "Código para insertar en la web",
        "copy": "Copiar", "copied": "Copiado", "no_link": "Esta organización aún no tiene enlace de reserva.", "saved": "Guardado."
      },
      "conflict": {
        "title": "Citas afectadas: {{count}}",
        "intro": "Estas citas quedan fuera de este cambio. Siguen reservadas: muévalas o cancélelas desde el calendario si hace falta. No se avisa a nadie.",
        "more": "…y {{count}} más.", "save_anyway": "Guardar de todos modos", "back": "Volver", "open": "Abrir"
      }
    }
  }
}
```

- [ ] **Step 4: Write** `tools/add-setup-strings.cjs`:

```js
// node add-setup-strings.cjs <setup-strings.json> — run from the feature worktree root.
// Inserts nav.setup and the setup block into each hand-formatted bundle as text, then proves it parses.
const fs = require('fs')
const path = require('path')
const additions = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
for (const [lang, add] of Object.entries(additions)) {
  const file = path.join('frontend/src/appointments/i18n', `appointments.${lang}.json`)
  let raw = fs.readFileSync(file, 'utf8')
  const nav = raw.match(/"nav": \{ "calendar": ("[^"]*") \}/)
  if (!nav) throw new Error(`${lang}: the nav line is not where it was`)
  raw = raw.replace(nav[0], `"nav": { "calendar": ${nav[1]}, "setup": ${JSON.stringify(add.nav_setup)} }`)
  if (!raw.endsWith('\n  }\n}\n')) throw new Error(`${lang}: the file does not end as expected`)
  const block = JSON.stringify(add.setup, null, 2).replace(/\n/g, '\n  ')
  raw = raw.slice(0, -'\n}\n'.length) + `,\n  "setup": ${block}\n}\n`
  JSON.parse(raw)
  fs.writeFileSync(file, raw)
  console.log(`${lang}: added`)
}
```

- [ ] **Step 5: Run it.**
  - Run from the worktree root:
    `node .superpowers/sdd/2026-09-30-appointments-workspace/tools/add-setup-strings.cjs .superpowers/sdd/2026-09-30-appointments-workspace/tools/setup-strings.json`
  - Expected: five `added` lines.

- [ ] **Step 6: Run the bundle test.**
  - Run: `cd frontend && npx vitest run src/appointments/i18n/appointmentsLocales.test.ts src/i18n/localeCompleteness.test.ts`
  - Expected: PASS (key sets equal, no empty value, placeholders survive).

- [ ] **Step 7: Commit** the five bundles and `appointmentsLocales.test.ts`, with the message "Add the setup's words in five languages".

### Task 17: The conflict dialog and the form-failure notice

**Files:**
- Create: `frontend/src/appointments/setup/ConflictDialog.tsx`, `frontend/src/appointments/setup/FailureNotice.tsx`
- Test: `frontend/src/appointments/setup/conflictDialog.test.tsx`

**Interfaces:**
- Consumes: `Impact` (Task 15), `formatDate` (`lib/wallClock`), `Button`, `Notice`, `ApiFailure`.
- Produces:
  - `ConflictDialog({ impact, locale, onConfirm, onCancel })`
  - `useConflictConfirm(locale): { dialog: ReactNode; confirm: (impact: Impact) => Promise<boolean> }`
  - `FailureNotice({ failure }: { failure: ApiFailure | null })`

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/setup/conflictDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Impact } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { ConflictDialog } = await import('./ConflictDialog')
const { FailureNotice } = await import('./FailureNotice')

const impact: Impact = {
  affected: [{ id: 41, start: '2026-10-06T10:00', end: '2026-10-06T10:45', client: 'Sophie Williams', service: 'Deep Tissue Massage', team_member: 'Mara Ilves' }],
  total: 3,
}

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

describe('ConflictDialog', () => {
  it('says how many, lists each with a way to open it, and counts the rest', () => {
    const html = render(<ConflictDialog impact={impact} locale="en-GB" onConfirm={() => {}} onCancel={() => {}} />)
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Appointments affected: 3')
    expect(html).toContain('10:00')
    expect(html).toContain('Sophie Williams · Deep Tissue Massage · Mara Ilves')
    expect(html).toContain('href="/appointments?open=41&amp;date=2026-10-06"')
    expect(html).toContain('…and 2 more.')
    expect(html).toContain('Save anyway')
    expect(html).toContain('Back')
  })
})

describe('FailureNotice', () => {
  it('lists the server\'s field messages', () => {
    const html = render(<FailureNotice failure={{ status: 422, code: 'unknown', message: '', fields: { name: ['The name field is required.'] } }} />)
    expect(html).toContain('Please check what you entered:')
    expect(html).toContain('The name field is required.')
  })

  it('says when the person is not allowed, and nothing when there is no failure', () => {
    expect(render(<FailureNotice failure={{ status: 403, code: 'not_allowed', message: 'Only an owner or a manager can change this.' }} />)).toContain('Only an owner or a manager can change this.')
    expect(render(<FailureNotice failure={null} />)).toBe('')
  })
})
```

- [ ] **Step 2: Run it.**
  - Run: `cd frontend && npx vitest run src/appointments/setup/conflictDialog.test.tsx`
  - Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Create** `frontend/src/appointments/setup/ConflictDialog.tsx`:

```tsx
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Impact } from '../lib/types'
import { formatDate } from '../lib/wallClock'
import { Button } from '../ui/Button'

/**
 * "These appointments fall outside this change" (owner decision: warn, list,
 * still allow). Each one opens on its own day in the calendar; nothing is
 * moved, cancelled or messaged by saving.
 */
export function ConflictDialog({ impact, locale, onConfirm, onCancel }: { impact: Impact; locale: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const rest = impact.total - impact.affected.length

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-a-text/40 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="setup-conflict-title" aria-describedby="setup-conflict-intro"
        className="w-full max-w-lg space-y-4 rounded-xl border border-a-border bg-a-surface p-5 shadow-xl">
        <h2 id="setup-conflict-title" className="text-base font-semibold text-a-text">
          {t('appointments.setup.conflict.title', 'Appointments affected: {{count}}', { count: impact.total })}
        </h2>
        <p id="setup-conflict-intro" className="text-sm text-a-text-2">
          {t('appointments.setup.conflict.intro', 'These appointments fall outside this change. They stay booked: move or cancel them from the calendar if needed. Nobody is messaged.')}
        </p>
        <ul className="max-h-72 divide-y divide-a-border overflow-y-auto rounded-lg border border-a-border">
          {impact.affected.map(a => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium text-a-text">{formatDate(a.start.slice(0, 10), locale)} · {a.start.slice(11, 16)}</span>
                <span className="block truncate text-xs text-a-text-2">{[a.client, a.service, a.team_member].filter(Boolean).join(' · ')}</span>
              </span>
              <Link to={`/appointments?open=${a.id}&date=${a.start.slice(0, 10)}`} className="shrink-0 text-sm font-semibold text-a-accent-deep">
                {t('appointments.setup.conflict.open', 'Open')}
              </Link>
            </li>
          ))}
        </ul>
        {rest > 0 && <p className="text-xs text-a-text-2">{t('appointments.setup.conflict.more', '…and {{count}} more.', { count: rest })}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} autoFocus>{t('appointments.setup.conflict.back', 'Back')}</Button>
          <Button variant="danger" onClick={onConfirm}>{t('appointments.setup.conflict.save_anyway', 'Save anyway')}</Button>
        </div>
      </div>
    </div>
  )
}

/** A confirm(impact) that shows the dialog and resolves with the person's answer; render `dialog` where it should appear. */
export function useConflictConfirm(locale: string): { dialog: ReactNode; confirm: (impact: Impact) => Promise<boolean> } {
  const [impact, setImpact] = useState<Impact | null>(null)
  const resolver = useRef<((yes: boolean) => void) | null>(null)
  const confirm = useCallback((next: Impact) => new Promise<boolean>(resolve => {
    resolver.current = resolve
    setImpact(next)
  }), [])
  const answer = (yes: boolean) => {
    resolver.current?.(yes)
    resolver.current = null
    setImpact(null)
  }

  return {
    dialog: impact ? <ConflictDialog impact={impact} locale={locale} onConfirm={() => answer(true)} onCancel={() => answer(false)} /> : null,
    confirm,
  }
}
```

  `ConflictDialog.tsx` exports a hook beside the component. If the `react-refresh/only-export-components` lint rule
  objects, add the same
  `// eslint-disable-next-line react-refresh/only-export-components` line `AppointmentsProvider.tsx` uses above
  `useConflictConfirm`.

- [ ] **Step 4: Create** `frontend/src/appointments/setup/FailureNotice.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { ApiFailure } from '../lib/api'
import { Notice } from '../ui/Notice'

/** Why a setup save was refused: the server's field messages, a missing right, or a plain failure. */
export function FailureNotice({ failure }: { failure: ApiFailure | null }) {
  const { t } = useTranslation()
  if (!failure) return null
  const messages = Object.values(failure.fields ?? {}).flat()

  if (failure.code === 'not_allowed') return <Notice tone="danger">{failure.message || t('appointments.error.not_allowed')}</Notice>
  if (messages.length > 0) {
    return (
      <Notice tone="danger">
        <span>{t('appointments.setup.invalid', 'Please check what you entered:')}</span>
        <ul className="mt-1 list-disc pl-5">{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </Notice>
    )
  }
  return <Notice tone="danger">{failure.message || t('appointments.common.error', 'Something went wrong. Please try again.')}</Notice>
}
```

  `ApiFailure` must be exported from `lib/api.ts`. If it is only declared, export it.

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2, then `npx tsc -b` and `npx eslint src/appointments`.
  - Expected: PASS (3 tests); tsc and lint clean.

- [ ] **Step 6: Commit** with the message "Show the appointments a setup change would strand before saving it".

### Task 18: The Services tab

**Files:**
- Create: `frontend/src/appointments/setup/ServicesTab.tsx`, `frontend/src/appointments/setup/ServiceEditor.tsx`
- Test: `frontend/src/appointments/setup/servicesTab.test.tsx`

**Interfaces:**
- Consumes: `appointmentsApi.createService/updateService/createCategory`, `previewThenSave`,
  `useConflictConfirm`, `FailureNotice`, `failureOf`, `money` (`../../lib/money`), `Field`, `Button`.
- Produces:
  - `ServicesTab({ data, refresh }: { data: SetupPayload; refresh: () => void })`
  - `groupServices(services, categories, search, showInactive, otherLabel): ServiceGroup[]`
  - `ServiceEditor({ service, data, onClose, onSaved })`
  - `draftOf(service, team): ServiceDraft`
  - `bodyOf(draft): ServiceBody`

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/setup/servicesTab.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { SetupPayload, SetupService } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
// useVocab() reaches the provider module, which imports onWorkspaceOff from the same file.
vi.mock('../lib/api', () => ({ appointmentsApi: {}, failureOf: () => ({ status: 0, code: '', message: '' }), onWorkspaceOff: () => () => {} }))

const { ServicesTab, groupServices } = await import('./ServicesTab')
const { ServiceEditor, bodyOf, draftOf } = await import('./ServiceEditor')

const service = (id: number, name: string, category_id: number | null, is_active = true): SetupService => ({
  id, name, category_id, duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', short_description: null, is_active,
  performers: [{ id: 2, duration_minutes: null, price: 70 }],
})

const data: SetupPayload = {
  can_manage: true, my_team_member_id: null,
  services: [service(1, 'Deep Tissue Massage', 10), service(2, 'Scalp Ritual', null), service(3, 'Old Facial', 10, false)],
  categories: [{ id: 10, name: 'Massage' }],
  team: [{ id: 2, name: 'Mara Ilves', title: null, email: null, phone: null, user_id: null, is_active: true, services: [], week: [], time_off: [] }],
  staff_accounts: [], checklist: { steps: [], complete: true },
  settings: {} as SetupPayload['settings'],
}

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

describe('groupServices', () => {
  it('groups by category in order, puts the rest under Other, hides inactive unless asked, and searches by name', () => {
    expect(groupServices(data.services, data.categories, '', false, 'Other').map(g => [g.name, g.services.map(s => s.id)])).toEqual([['Massage', [1]], ['Other', [2]]])
    expect(groupServices(data.services, data.categories, '', true, 'Other')[0].services.map(s => s.id)).toEqual([1, 3])
    expect(groupServices(data.services, data.categories, 'scalp', false, 'Other').map(g => g.name)).toEqual(['Other'])
  })
})

describe('the service form', () => {
  it('reads a service into a draft and writes back what the server takes', () => {
    const draft = draftOf(data.services[0], data.team)
    expect(draft.performers[2]).toEqual({ on: true, duration: '', price: '70' })
    expect(bodyOf({ ...draft, price: '65', buffer: '' })).toEqual({
      name: 'Deep Tissue Massage', category_id: 10, duration_minutes: 45, buffer_after_minutes: 0, price: 65,
      short_description: null, is_active: true, performers: [{ id: 2, duration_minutes: null, price: 70 }],
    })
  })

  it('starts a new service with no one performing it and an hour long', () => {
    const draft = draftOf(null, data.team)
    expect([draft.name, draft.duration, draft.performers[2].on]).toEqual(['', '60', false])
  })
})

describe('ServicesTab', () => {
  it('lists services by category with their length and price, and offers New service to a manager', () => {
    const html = render(<ServicesTab data={data} refresh={() => {}} />)
    expect(html).toContain('Massage')
    expect(html).toContain('Deep Tissue Massage')
    expect(html).toContain('45 min')
    expect(html).toContain('New service')
    expect(html).not.toContain('Old Facial')
  })

  it('offers nothing to change to someone who is not a manager', () => {
    expect(render(<ServicesTab data={{ ...data, can_manage: false }} refresh={() => {}} />)).not.toContain('New service')
  })
})

describe('ServiceEditor', () => {
  it('shows who performs it and points to the full admin for photos', () => {
    const html = render(<ServiceEditor service={data.services[0]} data={data} onClose={() => {}} onSaved={() => {}} />)
    expect(html).toContain('Mara Ilves')
    expect(html).toContain('href="/services"')
    expect(html).toContain('Save')
  })

  it('is read-only for someone who is not a manager', () => {
    const html = render(<ServiceEditor service={data.services[0]} data={{ ...data, can_manage: false }} onClose={() => {}} onSaved={() => {}} />)
    expect(html).toContain('<fieldset disabled=""')
    expect(html).not.toContain('>Save<')
  })
})
```

- [ ] **Step 2: Run it.**
  - Run: `cd frontend && npx vitest run src/appointments/setup/servicesTab.test.tsx`
  - Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Create** `frontend/src/appointments/setup/ServicesTab.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { money } from '../../lib/money'
import type { SetupCategory, SetupPayload, SetupService } from '../lib/types'
import { Button } from '../ui/Button'
import { ServiceEditor } from './ServiceEditor'

export interface ServiceGroup { key: string; name: string; services: SetupService[] }

/** Services by category, in the categories' own order, then the uncategorised; inactive ones only when asked for. */
export function groupServices(services: SetupService[], categories: SetupCategory[], search: string, showInactive: boolean, otherLabel: string): ServiceGroup[] {
  const term = search.trim().toLowerCase()
  const shown = services.filter(s => (showInactive || s.is_active) && (term === '' || s.name.toLowerCase().includes(term)))
  const known = new Set(categories.map(c => c.id))
  const groups: ServiceGroup[] = categories.map(c => ({ key: `c${c.id}`, name: c.name, services: shown.filter(s => s.category_id === c.id) }))
  groups.push({ key: 'other', name: otherLabel, services: shown.filter(s => s.category_id === null || !known.has(s.category_id)) })
  return groups.filter(g => g.services.length > 0)
}

export function ServicesTab({ data, refresh }: { data: SetupPayload; refresh: () => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<SetupService | 'new' | null>(null)
  const otherLabel = t('appointments.setup.services.no_category', 'Other')
  const groups = useMemo(() => groupServices(data.services, data.categories, search, showInactive, otherLabel), [data, search, showInactive, otherLabel])

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">{t('appointments.setup.services.search', 'Search services')}</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('appointments.setup.services.search', 'Search services')}
            className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text placeholder:text-a-text-2" />
        </label>
        <label className="flex items-center gap-2 text-sm text-a-text-2">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          {t('appointments.setup.show_inactive', 'Show inactive')}
        </label>
        {data.can_manage && (
          <Button onClick={() => setEditing('new')}><Plus size={16} aria-hidden /> {t('appointments.setup.services.new', 'New service')}</Button>
        )}
      </div>

      {groups.length === 0 && <p className="text-sm text-a-text-2">{t('appointments.setup.none_yet', 'Nothing here yet.')}</p>}
      {groups.map(group => (
        <section key={group.key} aria-labelledby={`services-${group.key}`} className="space-y-2">
          <h2 id={`services-${group.key}`} className="text-sm font-semibold text-a-text-2">{group.name}</h2>
          <ul className="divide-y divide-a-border rounded-lg border border-a-border bg-a-surface">
            {group.services.map(s => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditing(s)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-a-surface-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-a-text">{s.name}</span>
                    <span className="block text-xs text-a-text-2">
                      {t('appointments.setup.services.minutes', '{{count}} min', { count: s.duration_minutes })} · {money(s.price, s.currency)}
                      {!s.is_active && ` · ${t('appointments.setup.inactive', 'Inactive')}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing !== null && (
        <ServiceEditor service={editing === 'new' ? null : editing} data={data}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
      )}
    </div>
  )
}
```

  If `money()`'s signature differs from `money(amount, currency)`, read `frontend/src/lib/money.ts` and call it as
  `panel/AppointmentView.tsx` does.

- [ ] **Step 4: Create** `frontend/src/appointments/setup/ServiceEditor.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { appointmentsApi, failureOf, type ApiFailure } from '../lib/api'
import { previewThenSave } from '../lib/preview'
import type { ServiceBody, SetupPayload, SetupService, SetupTeamMember } from '../lib/types'
import { useVocab } from '../lib/vocab'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { useConflictConfirm } from './ConflictDialog'
import { FailureNotice } from './FailureNotice'

export interface ServiceDraft {
  name: string; category_id: number | null; duration: string; buffer: string; price: string
  short_description: string; is_active: boolean
  performers: Record<number, { on: boolean; duration: string; price: string }>
}

export function draftOf(service: SetupService | null, team: SetupTeamMember[]): ServiceDraft {
  const performers: ServiceDraft['performers'] = {}
  for (const member of team) {
    const link = service?.performers.find(p => p.id === member.id)
    performers[member.id] = {
      on: link !== undefined,
      duration: link?.duration_minutes != null ? String(link.duration_minutes) : '',
      price: link?.price != null ? String(link.price) : '',
    }
  }
  return {
    name: service?.name ?? '', category_id: service?.category_id ?? null,
    duration: String(service?.duration_minutes ?? 60), buffer: String(service?.buffer_after_minutes ?? 0),
    price: service ? String(service.price) : '', short_description: service?.short_description ?? '',
    is_active: service?.is_active ?? true, performers,
  }
}

const numberOrNull = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw))

export function bodyOf(draft: ServiceDraft): ServiceBody {
  return {
    name: draft.name.trim(),
    category_id: draft.category_id,
    duration_minutes: Number(draft.duration),
    buffer_after_minutes: Number(draft.buffer || 0),
    price: Number(draft.price || 0),
    short_description: draft.short_description.trim() || null,
    is_active: draft.is_active,
    performers: Object.entries(draft.performers)
      .filter(([, p]) => p.on)
      .map(([id, p]) => ({ id: Number(id), duration_minutes: numberOrNull(p.duration), price: numberOrNull(p.price) })),
  }
}

const input = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text disabled:bg-a-surface-2'

/** A service in the right-hand panel: the booking fields, who performs it, and a link to the full admin for the rest. */
export function ServiceEditor({ service, data, onClose, onSaved }: { service: SetupService | null; data: SetupPayload; onClose: () => void; onSaved: () => void }) {
  const { t, i18n } = useTranslation()
  const vocab = useVocab()
  const heading = useRef<HTMLHeadingElement>(null)
  const [draft, setDraft] = useState(() => draftOf(service, data.team))
  const [newCategory, setNewCategory] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const { dialog, confirm } = useConflictConfirm(i18n.language || 'en')
  const readOnly = !data.can_manage
  const set = (patch: Partial<ServiceDraft>) => setDraft(d => ({ ...d, ...patch }))
  const setPerformer = (id: number, patch: Partial<ServiceDraft['performers'][number]>) =>
    setDraft(d => ({ ...d, performers: { ...d.performers, [id]: { ...d.performers[id], ...patch } } }))

  useEffect(() => { heading.current?.focus() }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFailure(null)
    try {
      let categoryId = draft.category_id
      if (newCategory !== null && newCategory.trim() !== '') categoryId = (await appointmentsApi.createCategory(newCategory.trim())).category.id
      const body = { ...bodyOf(draft), category_id: categoryId }
      if (service === null) await appointmentsApi.createService(body)
      else if ((await previewThenSave(dryRun => appointmentsApi.updateService(service.id, body, dryRun), confirm)) === null) return
      onSaved()
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="service-editor-title"
      className="fixed right-0 top-14 bottom-0 z-30 w-full sm:w-[440px] overflow-y-auto bg-a-surface border-l border-a-border shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-a-border px-5 py-4">
        <h2 id="service-editor-title" ref={heading} tabIndex={-1} className="text-base font-semibold text-a-text">
          {service ? t('appointments.setup.services.edit', 'Edit service') : t('appointments.setup.services.new', 'New service')}
        </h2>
        <button type="button" onClick={onClose} aria-label={t('appointments.common.close', 'Close')} className="rounded-lg p-1.5 text-a-text-2 hover:text-a-text">
          <X size={18} aria-hidden />
        </button>
      </div>
      <form onSubmit={save} className="space-y-4 px-5 py-4">
        <fieldset disabled={readOnly} className="space-y-4">
          <Field label={t('appointments.setup.services.name', 'Name')}>
            <input required value={draft.name} onChange={(e) => set({ name: e.target.value })} className={input} />
          </Field>
          <Field label={t('appointments.setup.services.category', 'Category')}>
            <select value={newCategory !== null ? 'new' : draft.category_id ?? ''} className={input}
              onChange={(e) => {
                if (e.target.value === 'new') { setNewCategory('') } else { setNewCategory(null); set({ category_id: e.target.value ? Number(e.target.value) : null }) }
              }}>
              <option value="">{t('appointments.setup.services.no_category_option', 'No category')}</option>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="new">{t('appointments.setup.services.new_category', 'New category…')}</option>
            </select>
          </Field>
          {newCategory !== null && (
            <Field label={t('appointments.setup.services.category_name', 'New category name')}>
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={input} />
            </Field>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('appointments.setup.services.duration', 'Duration (minutes)')}>
              <input type="number" min={5} max={1440} required value={draft.duration} onChange={(e) => set({ duration: e.target.value })} className={input} />
            </Field>
            <Field label={t('appointments.setup.services.buffer', 'Break after (minutes)')}>
              <input type="number" min={0} max={240} value={draft.buffer} onChange={(e) => set({ buffer: e.target.value })} className={input} />
            </Field>
            <Field label={t('appointments.setup.services.price', 'Price')}>
              <input type="number" min={0} step="0.01" required value={draft.price} onChange={(e) => set({ price: e.target.value })} className={input} />
            </Field>
          </div>
          <Field label={t('appointments.setup.services.short_description', 'Short description')}>
            <input value={draft.short_description} maxLength={500} onChange={(e) => set({ short_description: e.target.value })} className={input} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-a-text">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
            {t('appointments.setup.active', 'Active')}
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-a-text-2">{t('appointments.setup.services.performers', 'Who performs it')}</legend>
            {data.team.map(member => {
              const p = draft.performers[member.id]
              return (
                <div key={member.id} className="rounded-lg border border-a-border px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-a-text">
                    <input type="checkbox" checked={p.on} onChange={(e) => setPerformer(member.id, { on: e.target.checked })} />
                    {member.name}{!member.is_active && ` · ${t('appointments.setup.inactive', 'Inactive')}`}
                  </label>
                  {p.on && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Field label={t('appointments.setup.services.own_duration', 'Own minutes')}>
                        <input type="number" min={5} max={1440} value={p.duration} onChange={(e) => setPerformer(member.id, { duration: e.target.value })} className={input} />
                      </Field>
                      <Field label={t('appointments.setup.services.own_price', 'Own price')}>
                        <input type="number" min={0} step="0.01" value={p.price} onChange={(e) => setPerformer(member.id, { price: e.target.value })} className={input} />
                      </Field>
                    </div>
                  )}
                </div>
              )
            })}
            {data.team.length === 0 && <p className="text-sm text-a-text-2">{vocab('team_member')}: {t('appointments.setup.none_yet', 'Nothing here yet.')}</p>}
          </fieldset>
        </fieldset>

        <p className="text-xs text-a-text-2">
          {t('appointments.setup.services.full_admin', 'Photos, gallery and the long description are edited in the full admin.')}{' '}
          <Link to="/services" className="font-semibold text-a-accent-deep underline">{t('appointments.setup.services.full_admin_link', 'Open in the full admin')}</Link>
        </p>
        <FailureNotice failure={failure} />
        {!readOnly && (
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>{t('appointments.setup.save', 'Save')}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>{t('appointments.common.cancel', 'Cancel')}</Button>
          </div>
        )}
      </form>
      {dialog}
    </aside>
  )
}
```

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2, then `npx tsc -b` and `npx eslint src/appointments`.
  - Expected: PASS (7 tests); tsc and lint clean. `tokens.test.ts` stays green: the only path used is the route
    `/services`, not an API path.

- [ ] **Step 6: Commit** with the message "Add the Services tab to the workspace's Setup".

### Task 19: The week and time-off editors

**Files:**
- Create: `frontend/src/appointments/setup/WeekEditor.tsx`, `frontend/src/appointments/setup/TimeOffEditor.tsx`
- Test: `frontend/src/appointments/setup/editors.test.tsx`

**Interfaces:**
- Consumes: `lib/hours.ts` (Task 15), `formatDate`, `Field`, `Button`.
- Produces:
  - `WeekEditor({ rows, readOnly, locale, saving, onSave }: { rows: HoursRow[]; readOnly: boolean; locale: string; saving: boolean; onSave: (rows: HoursRow[]) => void })`
  - `TimeOffEditor({ entries, canEdit, locale, today, saving, onAdd, onRemove }: { entries: TimeOffEntry[]; canEdit: boolean; locale: string; today: DateKey; saving: boolean; onAdd: (body: TimeOffBody) => void; onRemove: (entryId: number) => void })`
  - Both are views only; their callers own the API calls.

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/setup/editors.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { WeekEditor } = await import('./WeekEditor')
const { TimeOffEditor } = await import('./TimeOffEditor')

const rows = [
  { day_of_week: 1, start_time: '09:00', end_time: '13:00' },
  { day_of_week: 1, start_time: '14:00', end_time: '18:00' },
  { day_of_week: 0, start_time: '10:00', end_time: '24:00' },
]

describe('WeekEditor', () => {
  it('lists Monday first, shows each range, says Off for a day without hours, and offers to save', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={rows} readOnly={false} locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html.indexOf('Monday')).toBeLessThan(html.indexOf('Sunday'))
    expect(html).toContain('value="14:00"')
    expect(html).toContain('value="24:00"')
    expect(html).toContain('Off')
    expect(html).toContain('Copy to Monday–Friday')
    expect(html).toContain('Save hours')
  })

  it('says what is wrong with a day and will not save it', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={[{ day_of_week: 2, start_time: '17:00', end_time: '09:00' }]} readOnly={false} locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html).toContain('The end must be after the start.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Save hours/)
  })

  it('only shows the week when read-only', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={rows} readOnly locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html).not.toContain('Save hours')
    expect(html).not.toContain('Add hours')
  })
})

describe('TimeOffEditor', () => {
  const entries = [
    { id: 1, date: '2026-10-09', start_time: null, end_time: null, reason: 'Holiday' },
    { id: 2, date: '2026-10-12', start_time: '12:00', end_time: '14:00', reason: null },
  ]

  it('lists time off with all-day or the hours, and a way to remove each', () => {
    const html = renderToStaticMarkup(<TimeOffEditor entries={entries} canEdit locale="en-GB" today="2026-10-05" saving={false} onAdd={() => {}} onRemove={() => {}} />)
    expect(html).toContain('All day')
    expect(html).toContain('Holiday')
    expect(html).toContain('12:00–14:00')
    expect(html).toContain('Remove')
    expect(html).toContain('Add time off')
    expect(html).toContain('min="2026-10-05"')
  })

  it('says when nothing is planned, and offers nothing to someone who may not change it', () => {
    const html = renderToStaticMarkup(<TimeOffEditor entries={[]} canEdit={false} locale="en-GB" today="2026-10-05" saving={false} onAdd={() => {}} onRemove={() => {}} />)
    expect(html).toContain('No time off planned.')
    expect(html).not.toContain('Add time off')
  })
})
```

- [ ] **Step 2: Run it.**
  - Run: `cd frontend && npx vitest run src/appointments/setup/editors.test.tsx`
  - Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Create** `frontend/src/appointments/setup/WeekEditor.tsx`.
  - Times are text fields (`HH:MM`), not `type="time"`, because a range may end at `24:00`, which a time input
    cannot hold.
  - `dayProblem()` (Task 15, see its `format` case below) checks them as the person types.

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { copyToWeekdays, dayDate, dayProblem, toRows, toWeek, WEEK_ORDER, type Week, type Window } from '../lib/hours'
import type { HoursRow } from '../lib/types'
import { formatDate } from '../lib/wallClock'
import { Button } from '../ui/Button'

const timeField = 'w-[5.5rem] rounded-lg border border-a-border bg-a-surface px-2 py-1.5 text-sm text-a-text disabled:bg-a-surface-2'

/** A person's week, Monday first: each day off or one or more time ranges. Saving hands the whole week back. */
export function WeekEditor({ rows, readOnly, locale, saving, onSave }: { rows: HoursRow[]; readOnly: boolean; locale: string; saving: boolean; onSave: (rows: HoursRow[]) => void }) {
  const { t } = useTranslation()
  const [week, setWeek] = useState<Week>(() => toWeek(rows))
  const problems = Object.fromEntries(WEEK_ORDER.map(day => [day, dayProblem(week[day])]))
  const blocked = Object.values(problems).some(Boolean)
  const setDay = (day: number, windows: Window[]) => setWeek(w => ({ ...w, [day]: windows }))
  const change = (day: number, i: number, patch: Partial<Window>) => setDay(day, week[day].map((w, j) => (j === i ? { ...w, ...patch } : w)))

  return (
    <div className="space-y-2">
      {WEEK_ORDER.map(day => {
        const name = formatDate(dayDate(day), locale, { weekday: 'long' })
        const windows = week[day]
        const problem = problems[day]
        return (
          <div key={day} className="flex flex-wrap items-start gap-3 rounded-lg border border-a-border px-3 py-2">
            <span className="w-28 shrink-0 pt-1.5 text-sm font-medium text-a-text">{name}</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              {windows.length === 0 && <span className="block pt-1.5 text-sm text-a-text-2">{t('appointments.setup.hours.off', 'Off')}</span>}
              {windows.map((w, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <label>
                    <span className="sr-only">{name}: {t('appointments.setup.hours.from', 'From')}</span>
                    <input value={w.start} disabled={readOnly} inputMode="numeric" maxLength={5} placeholder="09:00" className={timeField}
                      onChange={(e) => change(day, i, { start: e.target.value })} />
                  </label>
                  <span aria-hidden className="text-a-text-2">–</span>
                  <label>
                    <span className="sr-only">{name}: {t('appointments.setup.hours.to', 'To')}</span>
                    <input value={w.end} disabled={readOnly} inputMode="numeric" maxLength={5} placeholder="17:00" className={timeField}
                      onChange={(e) => change(day, i, { end: e.target.value })} />
                  </label>
                  {!readOnly && (
                    <button type="button" onClick={() => setDay(day, windows.filter((_, j) => j !== i))}
                      aria-label={`${t('appointments.setup.remove', 'Remove')}: ${name} ${w.start}–${w.end}`}
                      className="rounded p-1 text-a-text-2 hover:text-a-danger">
                      <Trash2 size={15} aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {problem && <p className="text-xs text-a-danger">{t(`appointments.setup.hours.problem.${problem}`)}</p>}
            </div>
            {!readOnly && (
              <div className="flex flex-col items-end gap-1">
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-a-accent-deep"
                  onClick={() => setDay(day, [...windows, windows.length > 0 ? { start: windows[windows.length - 1].end, end: windows[windows.length - 1].end } : { start: '09:00', end: '17:00' }])}>
                  <Plus size={13} aria-hidden /> {t('appointments.setup.hours.add_window', 'Add hours')}
                </button>
                {day === 1 && (
                  <button type="button" onClick={() => setWeek(w => copyToWeekdays(w, 1))} className="text-xs font-semibold text-a-accent-deep">
                    {t('appointments.setup.hours.copy_to_weekdays', 'Copy to Monday–Friday')}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {!readOnly && (
        <Button onClick={() => onSave(toRows(week))} disabled={blocked} loading={saving}>{t('appointments.setup.team.save_hours', 'Save hours')}</Button>
      )}
    </div>
  )
}
```

  A new range after an existing one starts and ends where the last one ends, so it reads as "fill in the end". The
  `order` problem shows until the person types an end; the save stays blocked until then. That is intended.

- [ ] **Step 4: Create** `frontend/src/appointments/setup/TimeOffEditor.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { DateKey, TimeOffBody, TimeOffEntry } from '../lib/types'
import { formatDate } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'

const field = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/** A person's time off from today on, and, for whoever may change it, a range to add. */
export function TimeOffEditor({ entries, canEdit, locale, today, saving, onAdd, onRemove }: {
  entries: TimeOffEntry[]; canEdit: boolean; locale: string; today: DateKey; saving: boolean
  onAdd: (body: TimeOffBody) => void; onRemove: (entryId: number) => void
}) {
  const { t } = useTranslation()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [allDay, setAllDay] = useState(true)
  const [start, setStart] = useState('12:00')
  const [end, setEnd] = useState('13:00')
  const [reason, setReason] = useState('')

  const add = (e: FormEvent) => {
    e.preventDefault()
    onAdd({
      from,
      to: to < from ? from : to,
      ...(allDay ? {} : { start_time: start, end_time: end }),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    })
  }

  return (
    <div className="space-y-3">
      {entries.length === 0
        ? <p className="text-sm text-a-text-2">{t('appointments.setup.time_off.none', 'No time off planned.')}</p>
        : (
          <ul className="divide-y divide-a-border rounded-lg border border-a-border">
            {entries.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-a-text">
                  {formatDate(o.date, locale)} · {o.start_time ? `${o.start_time}–${o.end_time}` : t('appointments.setup.time_off.all_day', 'All day')}
                  {o.reason && <span className="text-a-text-2"> · {o.reason}</span>}
                </span>
                {canEdit && (
                  <button type="button" onClick={() => onRemove(o.id)} disabled={saving} className="text-sm font-semibold text-a-danger">
                    {t('appointments.setup.remove', 'Remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

      {canEdit && (
        <form onSubmit={add} className="grid grid-cols-2 gap-3 rounded-lg border border-a-border p-3">
          <Field label={t('appointments.setup.time_off.from', 'From')}>
            <input type="date" required min={today} value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </Field>
          <Field label={t('appointments.setup.time_off.to', 'To')}>
            <input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm text-a-text">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            {t('appointments.setup.time_off.all_day', 'All day')}
          </label>
          {!allDay && (
            <>
              <Field label={t('appointments.setup.time_off.start', 'Starts')}>
                <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={field} />
              </Field>
              <Field label={t('appointments.setup.time_off.end', 'Ends')}>
                <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
              </Field>
            </>
          )}
          <div className="col-span-2">
            <Field label={t('appointments.setup.time_off.reason', 'Reason')}>
              <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={field} />
            </Field>
          </div>
          <div className="col-span-2">
            <Button type="submit" loading={saving}>{t('appointments.setup.time_off.add', 'Add time off')}</Button>
          </div>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2, then `npx tsc -b` and `npx eslint src/appointments`.
  - Expected: PASS (5 tests); clean.

- [ ] **Step 6: Commit** with the message "Edit a person's week and time off in the workspace".

### Task 20: The Team tab

**Files:**
- Create: `frontend/src/appointments/setup/TeamTab.tsx`, `frontend/src/appointments/setup/TeamEditor.tsx`,
  `frontend/src/appointments/setup/MemberTimeOff.tsx`
- Test: `frontend/src/appointments/setup/teamTab.test.tsx`

**Interfaces:**
- Consumes: `appointmentsApi.createTeamMember/updateTeamMember/saveHours/addTimeOff/removeTimeOff`,
  `previewThenSave`, `useConflictConfirm`, `FailureNotice`, `WeekEditor`, `TimeOffEditor`, `useAppointments`
  (for the venue's today).
- Produces:
  - `TeamTab({ data, refresh })`
  - `TeamEditor({ member, data, onClose, onChanged })`
  - `MemberTimeOff({ member, canEdit, onChanged })`
  - `teamDraftOf(member, services): TeamDraft`
  - `teamBodyOf(draft): TeamBody`

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/setup/teamTab.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Bootstrap, SetupPayload, SetupTeamMember } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/api', () => ({ appointmentsApi: {}, failureOf: () => ({ status: 0, code: '', message: '' }), onWorkspaceOff: () => () => {} }))

const { AppointmentsContext } = await import('../AppointmentsProvider')
const { TeamTab } = await import('./TeamTab')
const { TeamEditor, teamBodyOf, teamDraftOf } = await import('./TeamEditor')

const mara: SetupTeamMember = {
  id: 2, name: 'Mara Ilves', title: 'Therapist', email: 'mara@example.test', phone: null, user_id: 13, is_active: true,
  services: [{ id: 1, duration_minutes: 50, price: null }],
  week: [{ day_of_week: 1, start_time: '09:00', end_time: '17:00', is_active: true }],
  time_off: [{ id: 5, date: '2026-10-09', start_time: null, end_time: null, reason: 'Holiday' }],
}
const data: SetupPayload = {
  can_manage: true, my_team_member_id: null,
  services: [{ id: 1, name: 'Deep Tissue Massage', category_id: null, duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', short_description: null, is_active: true, performers: [] }],
  categories: [], team: [mara], staff_accounts: [{ user_id: 13, name: 'Mara Ilves', email: 'mara@example.test' }],
  checklist: { steps: [], complete: true }, settings: {} as SetupPayload['settings'],
}
const boot = { venue: { today: '2026-10-05', timezone: 'Europe/Riga', timezone_named: true, currency: 'EUR' }, organization: { id: 1, name: 'Lumière', industry: 'beauty' } } as Bootstrap

const render = (node: React.ReactNode) => renderToStaticMarkup(
  <MemoryRouter>
    <AppointmentsContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</AppointmentsContext.Provider>
  </MemoryRouter>,
)

describe('the team form', () => {
  it('reads a person into a draft and writes back what the server takes', () => {
    const draft = teamDraftOf(mara, data.services)
    expect(draft.services[1]).toEqual({ on: true, duration: '50', price: '' })
    expect(teamBodyOf({ ...draft, phone: ' +371 2000 0000 ' })).toEqual({
      name: 'Mara Ilves', title: 'Therapist', email: 'mara@example.test', phone: '+371 2000 0000', user_id: 13, is_active: true,
      services: [{ id: 1, duration_minutes: 50, price: null }],
    })
  })
})

describe('TeamTab', () => {
  it('lists the team and offers New team member to a manager', () => {
    const html = render(<TeamTab data={data} refresh={() => {}} />)
    expect(html).toContain('Mara Ilves')
    expect(html).toContain('Services: 1')
    expect(html).toContain('New team member')
    expect(html).not.toContain('My time off')
  })

  it('gives a team member who is not a manager their own time off', () => {
    const html = render(<TeamTab data={{ ...data, can_manage: false, my_team_member_id: 2, staff_accounts: [] }} refresh={() => {}} />)
    expect(html).toContain('My time off')
    expect(html).toContain('Holiday')
    expect(html).toContain('Add time off')
    expect(html).not.toContain('New team member')
  })

  it('tells someone whose sign-in is not linked how to get it linked', () => {
    expect(render(<TeamTab data={{ ...data, can_manage: false, staff_accounts: [] }} refresh={() => {}} />)).toContain('A manager can link it under Team.')
  })
})

describe('TeamEditor', () => {
  it('shows the profile, the sign-in, the services, the week and the time off', () => {
    const html = render(<TeamEditor member={mara} data={data} onClose={() => {}} onChanged={() => {}} />)
    expect(html).toContain('value="Therapist"')
    expect(html).toMatch(/<option value="13" selected="">Mara Ilves/)
    expect(html).toContain('Deep Tissue Massage')
    expect(html).toContain('Save hours')
    expect(html).toContain('Holiday')
  })

  it('asks only for the profile of a new person', () => {
    const html = render(<TeamEditor member={null} data={data} onClose={() => {}} onChanged={() => {}} />)
    expect(html).toContain('Save profile')
    expect(html).not.toContain('Save hours')
  })
})
```

- [ ] **Step 2: Run it.**
  - Run: `cd frontend && npx vitest run src/appointments/setup/teamTab.test.tsx`
  - Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Create** `frontend/src/appointments/setup/MemberTimeOff.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppointments } from '../AppointmentsProvider'
import { appointmentsApi, failureOf, type ApiFailure } from '../lib/api'
import { previewThenSave } from '../lib/preview'
import type { SetupTeamMember } from '../lib/types'
import { useConflictConfirm } from './ConflictDialog'
import { FailureNotice } from './FailureNotice'
import { TimeOffEditor } from './TimeOffEditor'

/** A person's time off with its saves: adding previews the appointments it would strand first. */
export function MemberTimeOff({ member, canEdit, onChanged }: { member: SetupTeamMember; canEdit: boolean; onChanged: (member: SetupTeamMember) => void }) {
  const { i18n } = useTranslation()
  const { data: boot } = useAppointments()
  const locale = i18n.language || 'en'
  const { dialog, confirm } = useConflictConfirm(locale)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)

  const run = async (work: () => Promise<{ team_member?: SetupTeamMember } | null>) => {
    setSaving(true)
    setFailure(null)
    try {
      const result = await work()
      if (result?.team_member) onChanged(result.team_member)
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <TimeOffEditor entries={member.time_off} canEdit={canEdit} locale={locale} today={boot?.venue.today ?? ''} saving={saving}
        onAdd={(body) => { void run(() => previewThenSave(dryRun => appointmentsApi.addTimeOff(member.id, body, dryRun), confirm)) }}
        onRemove={(entryId) => { void run(() => appointmentsApi.removeTimeOff(member.id, entryId)) }} />
      <FailureNotice failure={failure} />
      {dialog}
    </>
  )
}
```

- [ ] **Step 4: Create** `frontend/src/appointments/setup/TeamEditor.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { appointmentsApi, failureOf, type ApiFailure } from '../lib/api'
import { previewThenSave } from '../lib/preview'
import type { HoursRow, SetupPayload, SetupService, SetupTeamMember, TeamBody } from '../lib/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { useConflictConfirm } from './ConflictDialog'
import { FailureNotice } from './FailureNotice'
import { MemberTimeOff } from './MemberTimeOff'
import { WeekEditor } from './WeekEditor'

export interface TeamDraft {
  name: string; title: string; email: string; phone: string; user_id: number | null; is_active: boolean
  services: Record<number, { on: boolean; duration: string; price: string }>
}

export function teamDraftOf(member: SetupTeamMember | null, services: SetupService[]): TeamDraft {
  const links: TeamDraft['services'] = {}
  for (const service of services) {
    const link = member?.services.find(s => s.id === service.id)
    links[service.id] = {
      on: link !== undefined,
      duration: link?.duration_minutes != null ? String(link.duration_minutes) : '',
      price: link?.price != null ? String(link.price) : '',
    }
  }
  return {
    name: member?.name ?? '', title: member?.title ?? '', email: member?.email ?? '', phone: member?.phone ?? '',
    user_id: member?.user_id ?? null, is_active: member?.is_active ?? true, services: links,
  }
}

const textOrNull = (raw: string): string | null => (raw.trim() === '' ? null : raw.trim())
const numberOrNull = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw))

export function teamBodyOf(draft: TeamDraft): TeamBody {
  return {
    name: draft.name.trim(), title: textOrNull(draft.title), email: textOrNull(draft.email), phone: textOrNull(draft.phone),
    user_id: draft.user_id, is_active: draft.is_active,
    services: Object.entries(draft.services)
      .filter(([, s]) => s.on)
      .map(([id, s]) => ({ id: Number(id), duration_minutes: numberOrNull(s.duration), price: numberOrNull(s.price) })),
  }
}

const input = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text disabled:bg-a-surface-2'

/** A team member in the right-hand panel: profile and services, then (once saved) their week and their time off. */
export function TeamEditor({ member: initial, data, onClose, onChanged }: { member: SetupTeamMember | null; data: SetupPayload; onClose: () => void; onChanged: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const heading = useRef<HTMLHeadingElement>(null)
  const [member, setMember] = useState<SetupTeamMember | null>(initial)
  const [draft, setDraft] = useState(() => teamDraftOf(initial, data.services))
  const [saving, setSaving] = useState<'profile' | 'hours' | null>(null)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const { dialog, confirm } = useConflictConfirm(locale)
  const readOnly = !data.can_manage
  const set = (patch: Partial<TeamDraft>) => setDraft(d => ({ ...d, ...patch }))
  const setService = (id: number, patch: Partial<TeamDraft['services'][number]>) =>
    setDraft(d => ({ ...d, services: { ...d.services, [id]: { ...d.services[id], ...patch } } }))

  useEffect(() => { heading.current?.focus() }, [])

  const saved = (next: SetupTeamMember | undefined) => {
    if (!next) return
    setMember(next)
    onChanged()
  }

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setSaving('profile')
    setFailure(null)
    try {
      const body = teamBodyOf(draft)
      if (member === null) saved((await appointmentsApi.createTeamMember(body)).team_member)
      else saved((await previewThenSave(dryRun => appointmentsApi.updateTeamMember(member.id, body, dryRun), confirm))?.team_member)
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(null)
    }
  }

  const saveHours = async (rows: HoursRow[]) => {
    if (member === null) return
    setSaving('hours')
    setFailure(null)
    try {
      saved((await previewThenSave(dryRun => appointmentsApi.saveHours(member.id, rows, dryRun), confirm))?.team_member)
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(null)
    }
  }

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="team-editor-title"
      className="fixed right-0 top-14 bottom-0 z-30 w-full sm:w-[480px] overflow-y-auto bg-a-surface border-l border-a-border shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-a-border px-5 py-4">
        <h2 id="team-editor-title" ref={heading} tabIndex={-1} className="text-base font-semibold text-a-text">
          {member ? member.name : t('appointments.setup.team.new', 'New team member')}
        </h2>
        <button type="button" onClick={onClose} aria-label={t('appointments.common.close', 'Close')} className="rounded-lg p-1.5 text-a-text-2 hover:text-a-text">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="space-y-6 px-5 py-4">
        <form onSubmit={saveProfile} className="space-y-4" aria-labelledby="team-profile">
          <h3 id="team-profile" className="text-sm font-semibold text-a-text">{t('appointments.setup.team.profile', 'Profile')}</h3>
          <fieldset disabled={readOnly} className="space-y-3">
            <Field label={t('appointments.setup.team.name', 'Name')}>
              <input required value={draft.name} onChange={(e) => set({ name: e.target.value })} className={input} />
            </Field>
            <Field label={t('appointments.setup.team.title', 'Title')}>
              <input value={draft.title} onChange={(e) => set({ title: e.target.value })} className={input} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('appointments.setup.team.email', 'Email')}>
                <input type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} className={input} />
              </Field>
              <Field label={t('appointments.setup.team.phone', 'Phone')}>
                <input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} className={input} />
              </Field>
            </div>
            {data.can_manage && (
              <Field label={t('appointments.setup.team.sign_in', 'Signs in as')} hint={t('appointments.setup.team.sign_in_hint', 'Linking a sign-in lets this person add their own time off.')}>
                <select value={draft.user_id ?? ''} onChange={(e) => set({ user_id: e.target.value ? Number(e.target.value) : null })} className={input}>
                  <option value="">{t('appointments.setup.team.no_sign_in', 'Not linked')}</option>
                  {data.staff_accounts.map(a => <option key={a.user_id} value={a.user_id}>{a.name} · {a.email}</option>)}
                </select>
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
              {t('appointments.setup.active', 'Active')}
            </label>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-a-text-2">{t('appointments.setup.team.services', 'Services they perform')}</legend>
              {data.services.map(service => {
                const s = draft.services[service.id]
                return (
                  <div key={service.id} className="rounded-lg border border-a-border px-3 py-2">
                    <label className="flex items-center gap-2 text-sm text-a-text">
                      <input type="checkbox" checked={s.on} onChange={(e) => setService(service.id, { on: e.target.checked })} />
                      {service.name}
                    </label>
                    {s.on && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Field label={t('appointments.setup.services.own_duration', 'Own minutes')}>
                          <input type="number" min={5} max={1440} value={s.duration} onChange={(e) => setService(service.id, { duration: e.target.value })} className={input} />
                        </Field>
                        <Field label={t('appointments.setup.services.own_price', 'Own price')}>
                          <input type="number" min={0} step="0.01" value={s.price} onChange={(e) => setService(service.id, { price: e.target.value })} className={input} />
                        </Field>
                      </div>
                    )}
                  </div>
                )
              })}
            </fieldset>
          </fieldset>
          {!readOnly && <Button type="submit" loading={saving === 'profile'}>{t('appointments.setup.team.save_profile', 'Save profile')}</Button>}
        </form>

        {member && (
          <section aria-labelledby="team-hours" className="space-y-3">
            <h3 id="team-hours" className="text-sm font-semibold text-a-text">{t('appointments.setup.team.hours', 'Weekly hours')}</h3>
            <WeekEditor key={`${member.id}:${JSON.stringify(member.week)}`} rows={member.week} readOnly={readOnly} locale={locale}
              saving={saving === 'hours'} onSave={(rows) => { void saveHours(rows) }} />
          </section>
        )}

        {member && (
          <section aria-labelledby="team-time-off" className="space-y-3">
            <h3 id="team-time-off" className="text-sm font-semibold text-a-text">{t('appointments.setup.team.time_off', 'Time off')}</h3>
            <MemberTimeOff member={member} canEdit={data.can_manage || data.my_team_member_id === member.id} onChanged={(next) => saved(next)} />
          </section>
        )}

        <FailureNotice failure={failure} />
      </div>
      {dialog}
    </aside>
  )
}
```

- [ ] **Step 5: Create** `frontend/src/appointments/setup/TeamTab.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import type { SetupPayload, SetupTeamMember } from '../lib/types'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { MemberTimeOff } from './MemberTimeOff'
import { TeamEditor } from './TeamEditor'

export function TeamTab({ data, refresh }: { data: SetupPayload; refresh: () => void }) {
  const { t } = useTranslation()
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<SetupTeamMember | 'new' | null>(null)
  const mine = data.team.find(m => m.id === data.my_team_member_id) ?? null
  const shown = data.team.filter(m => showInactive || m.is_active)

  return (
    <div className="space-y-5 pt-4">
      {!data.can_manage && (
        <section aria-labelledby="my-time-off" className="space-y-3 rounded-lg border border-a-border bg-a-surface p-4">
          <h2 id="my-time-off" className="text-sm font-semibold text-a-text">{t('appointments.setup.team.my_time_off', 'My time off')}</h2>
          {mine
            ? <MemberTimeOff member={mine} canEdit onChanged={refresh} />
            : <Notice tone="info">{t('appointments.setup.team.not_linked', 'Your sign-in is not linked to a team member yet. A manager can link it under Team.')}</Notice>}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-a-text-2">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          {t('appointments.setup.show_inactive', 'Show inactive')}
        </label>
        {data.can_manage && (
          <Button className="ml-auto" onClick={() => setEditing('new')}><Plus size={16} aria-hidden /> {t('appointments.setup.team.new', 'New team member')}</Button>
        )}
      </div>

      {shown.length === 0 && <p className="text-sm text-a-text-2">{t('appointments.setup.none_yet', 'Nothing here yet.')}</p>}
      {shown.length > 0 && (
        <ul className="divide-y divide-a-border rounded-lg border border-a-border bg-a-surface">
          {shown.map(m => (
            <li key={m.id}>
              <button type="button" onClick={() => setEditing(m)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-a-surface-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-a-text">{m.name}</span>
                  <span className="block text-xs text-a-text-2">
                    {[m.title, t('appointments.setup.team.services_count', 'Services: {{count}}', { count: m.services.length })].filter(Boolean).join(' · ')}
                    {!m.is_active && ` · ${t('appointments.setup.inactive', 'Inactive')}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <TeamEditor member={editing === 'new' ? null : editing} data={data} onClose={() => setEditing(null)} onChanged={refresh} />
      )}
    </div>
  )
}
```

  `MemberTimeOff`'s `onChanged` receives the saved member. In the list's "My time off" the page simply refreshes:
  `onChanged={refresh}` is accepted because `refresh` ignores its argument. If TypeScript objects, write
  `onChanged={() => refresh()}`.

- [ ] **Step 6: Run it.**
  - Run: same command as Step 2, then `npx tsc -b` and `npx eslint src/appointments`.
  - Expected: PASS (6 tests); clean.

- [ ] **Step 7: Commit** with the message "Add the Team tab: people, their services, week and time off".

### Task 21: The Settings tab

**Files:**
- Create: `frontend/src/appointments/setup/SettingsTab.tsx`
- Test: `frontend/src/appointments/setup/settingsTab.test.tsx`

**Interfaces:**
- Consumes: `appointmentsApi.saveSettings/currencyPreview/linkCopied`, `FailureNotice`, `Notice`, `Field`, `Button`.
- Produces:
  - `SettingsTab({ data, refresh })`
  - `settingsDraftOf(settings): SettingsDraft`
  - `changedSettings(draft, settings): SettingsBody` (only what changed)
  - `SLOT_STEPS = [5, 10, 15, 20, 30, 45, 60]`

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/setup/settingsTab.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SetupPayload, SetupSettings } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/api', () => ({ appointmentsApi: {}, failureOf: () => ({ status: 0, code: '', message: '' }), onWorkspaceOff: () => () => {} }))

const { SettingsTab, changedSettings, settingsDraftOf } = await import('./SettingsTab')

const settings: SetupSettings = {
  timezone: 'Europe/Riga', timezone_named: true, zones: ['Europe/London', 'Europe/Riga'], currency: 'EUR',
  lead_minutes: 60, slot_step: 15, max_advance_days: 60, allow_master_choice: true, points_on_bookings: true, programme_on: true,
  booking_link: 'https://app.example.test/services/tok', embed_snippet: '<div id="hoteltech-services"></div>', upcoming_appointments: 12,
}
const data = { can_manage: true, settings } as SetupPayload

describe('changedSettings', () => {
  it('sends only what changed, so an untouched currency never relabels anything', () => {
    const draft = settingsDraftOf(settings)
    expect(changedSettings(draft, settings)).toEqual({})
    expect(changedSettings({ ...draft, slot_step: 30, lead_minutes: '120' }, settings)).toEqual({ slot_step: 30, lead_minutes: 120 })
    expect(changedSettings({ ...draft, currency: 'GBP' }, settings)).toEqual({ currency: 'GBP' })
  })
})

describe('SettingsTab', () => {
  it('shows the venue, the online booking rules, loyalty and the booking link', () => {
    const html = renderToStaticMarkup(<SettingsTab data={data} refresh={() => {}} />)
    expect(html).toMatch(/<option value="Europe\/Riga" selected="">/)
    expect(html).toContain('12 upcoming appointments keep their clock times')
    expect(html).toMatch(/<option value="45">/)
    expect(html).toContain('Award points when an appointment is completed')
    expect(html).toContain('https://app.example.test/services/tok')
    expect(html).toContain('&lt;div id=&quot;hoteltech-services&quot;&gt;&lt;/div&gt;')
    expect(html).toContain('>Save<')
  })

  it('leaves loyalty out without a programme and says when there is no link', () => {
    const html = renderToStaticMarkup(<SettingsTab data={{ ...data, settings: { ...settings, programme_on: false, booking_link: null, embed_snippet: null } }} refresh={() => {}} />)
    expect(html).not.toContain('Award points')
    expect(html).toContain('This organisation has no booking link yet.')
  })

  it('is read-only for someone who is not a manager', () => {
    const html = renderToStaticMarkup(<SettingsTab data={{ ...data, can_manage: false }} refresh={() => {}} />)
    expect(html).toContain('<fieldset disabled=""')
    expect(html).not.toContain('>Save<')
  })
})
```

- [ ] **Step 2: Run it.**
  - Run: `cd frontend && npx vitest run src/appointments/setup/settingsTab.test.tsx`
  - Expected: FAIL — the module does not exist.

- [ ] **Step 3: Create** `frontend/src/appointments/setup/SettingsTab.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { appointmentsApi, failureOf, type ApiFailure } from '../lib/api'
import type { SettingsBody, SetupPayload, SetupSettings } from '../lib/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { FailureNotice } from './FailureNotice'

export const SLOT_STEPS = [5, 10, 15, 20, 30, 45, 60]
const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'UAH', 'TRY', 'AED', 'ILS', 'CAD', 'AUD', 'NZD', 'JPY', 'SGD', 'HKD', 'ZAR', 'INR']

export interface SettingsDraft {
  timezone: string; currency: string; lead_minutes: string; slot_step: number; max_advance_days: string
  allow_master_choice: boolean; points_on_bookings: boolean
}

export function settingsDraftOf(s: SetupSettings): SettingsDraft {
  return {
    timezone: s.timezone, currency: s.currency, lead_minutes: String(s.lead_minutes), slot_step: s.slot_step,
    max_advance_days: String(s.max_advance_days), allow_master_choice: s.allow_master_choice, points_on_bookings: s.points_on_bookings,
  }
}

/** Only what changed: an untouched currency is never sent, so saving never relabels prices by accident. */
export function changedSettings(draft: SettingsDraft, s: SetupSettings): SettingsBody {
  const body: SettingsBody = {}
  if (draft.timezone !== s.timezone) body.timezone = draft.timezone
  if (draft.currency !== s.currency) body.currency = draft.currency
  if (Number(draft.lead_minutes) !== s.lead_minutes) body.lead_minutes = Number(draft.lead_minutes)
  if (draft.slot_step !== s.slot_step) body.slot_step = draft.slot_step
  if (Number(draft.max_advance_days) !== s.max_advance_days) body.max_advance_days = Number(draft.max_advance_days)
  if (draft.allow_master_choice !== s.allow_master_choice) body.allow_master_choice = draft.allow_master_choice
  if (draft.points_on_bookings !== s.points_on_bookings) body.points_on_bookings = draft.points_on_bookings
  return body
}

const input = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text disabled:bg-a-surface-2'
const withCurrent = <T,>(list: T[], current: T): T[] => (list.includes(current) ? list : [current, ...list])

export function SettingsTab({ data, refresh }: { data: SetupPayload; refresh: () => void }) {
  const { t } = useTranslation()
  const s = data.settings
  const [draft, setDraft] = useState(() => settingsDraftOf(s))
  const [pending, setPending] = useState<{ services: number; extras: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const [copied, setCopied] = useState<'link' | 'snippet' | null>(null)
  const readOnly = !data.can_manage
  const body = changedSettings(draft, s)
  const set = (patch: Partial<SettingsDraft>) => { setSaved(false); setDraft(d => ({ ...d, ...patch })) }

  const write = async () => {
    setSaving(true)
    setFailure(null)
    try {
      await appointmentsApi.saveSettings(body)
      setPending(null)
      setSaved(true)
      refresh()
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(false)
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (body.currency) {
      try {
        const impact = await appointmentsApi.currencyPreview(body.currency)
        if (impact.services + impact.extras > 0) { setPending(impact); return }
      } catch (error) {
        setFailure(failureOf(error))
        return
      }
    }
    await write()
  }

  const copy = async (kind: 'link' | 'snippet', text: string) => {
    try { await navigator.clipboard.writeText(text) } catch { /* the field stays selectable */ }
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 2000)
    try { await appointmentsApi.linkCopied(); refresh() } catch { /* the checklist mark is a convenience */ }
  }

  return (
    <div className="space-y-6 pt-4">
      <form onSubmit={save} className="space-y-6">
        <fieldset disabled={readOnly} className="space-y-6">
          <section aria-labelledby="settings-venue" className="space-y-3">
            <h2 id="settings-venue" className="text-sm font-semibold text-a-text">{t('appointments.setup.settings.venue', 'Venue')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('appointments.setup.settings.timezone', 'Time zone')}
                hint={t('appointments.setup.settings.timezone_note', 'Changing the time zone does not move appointments: {{count}} upcoming appointments keep their clock times.', { count: s.upcoming_appointments })}>
                <select value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })} className={input}>
                  {withCurrent(s.zones, s.timezone).map(zone => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </Field>
              <Field label={t('appointments.setup.settings.currency', 'Currency')} hint={t('appointments.setup.settings.currency_note', 'Changing the currency relabels prices; it never converts them.')}>
                <select value={draft.currency} onChange={(e) => set({ currency: e.target.value })} className={input}>
                  {withCurrent(CURRENCIES, s.currency).map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </Field>
            </div>
          </section>

          <section aria-labelledby="settings-online" className="space-y-3">
            <h2 id="settings-online" className="text-sm font-semibold text-a-text">{t('appointments.setup.settings.online', 'Online booking')}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('appointments.setup.settings.lead', 'Minimum notice (minutes)')}>
                <input type="number" min={0} max={10080} value={draft.lead_minutes} onChange={(e) => set({ lead_minutes: e.target.value })} className={input} />
              </Field>
              <Field label={t('appointments.setup.settings.step', 'Start times every')}>
                <select value={draft.slot_step} onChange={(e) => set({ slot_step: Number(e.target.value) })} className={input}>
                  {withCurrent(SLOT_STEPS, s.slot_step).map(step => <option key={step} value={step}>{t('appointments.setup.settings.step_minutes', '{{count}} min', { count: step })}</option>)}
                </select>
              </Field>
              <Field label={t('appointments.setup.settings.ahead', 'Bookable up to (days ahead)')}>
                <input type="number" min={1} max={365} value={draft.max_advance_days} onChange={(e) => set({ max_advance_days: e.target.value })} className={input} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={draft.allow_master_choice} onChange={(e) => set({ allow_master_choice: e.target.checked })} />
              {t('appointments.setup.settings.choose_person', 'Clients may choose the person')}
            </label>
          </section>

          {s.programme_on && (
            <section aria-labelledby="settings-loyalty" className="space-y-3">
              <h2 id="settings-loyalty" className="text-sm font-semibold text-a-text">{t('appointments.setup.settings.loyalty', 'Loyalty')}</h2>
              <label className="flex items-center gap-2 text-sm text-a-text">
                <input type="checkbox" checked={draft.points_on_bookings} onChange={(e) => set({ points_on_bookings: e.target.checked })} />
                {t('appointments.setup.settings.points', 'Award points when an appointment is completed')}
              </label>
            </section>
          )}
        </fieldset>

        {pending && (
          <div className="space-y-2">
            <Notice tone="warning">
              {t('appointments.setup.settings.currency_confirm', '{{services}} services and {{extras}} extras will show {{currency}}. The amounts stay the same. Change the currency?', { services: pending.services, extras: pending.extras, currency: draft.currency })}
            </Notice>
            <div className="flex gap-2">
              <Button type="button" variant="danger" loading={saving} onClick={() => { void write() }}>{t('appointments.setup.conflict.save_anyway', 'Save anyway')}</Button>
              <Button type="button" variant="secondary" onClick={() => setPending(null)}>{t('appointments.setup.conflict.back', 'Back')}</Button>
            </div>
          </div>
        )}
        <FailureNotice failure={failure} />
        {saved && <Notice tone="success">{t('appointments.setup.settings.saved', 'Saved.')}</Notice>}
        {!readOnly && !pending && (
          <Button type="submit" loading={saving} disabled={Object.keys(body).length === 0}>{t('appointments.setup.save', 'Save')}</Button>
        )}
      </form>

      <section aria-labelledby="settings-link" className="space-y-3">
        <h2 id="settings-link" className="text-sm font-semibold text-a-text">{t('appointments.setup.settings.link', 'Booking page')}</h2>
        {s.booking_link && s.embed_snippet ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <a href={s.booking_link} target="_blank" rel="noreferrer" className="min-w-0 break-all text-sm text-a-accent-deep underline">{s.booking_link}</a>
              <Button type="button" size="sm" variant="secondary" onClick={() => { void copy('link', s.booking_link ?? '') }}>
                <Copy size={14} aria-hidden /> {copied === 'link' ? t('appointments.setup.settings.copied', 'Copied') : t('appointments.setup.settings.copy', 'Copy')}
              </Button>
            </div>
            <Field label={t('appointments.setup.settings.snippet', 'Website embed code')}>
              <textarea readOnly rows={3} value={s.embed_snippet} className={`${input} font-mono text-xs`} />
            </Field>
            <Button type="button" size="sm" variant="secondary" onClick={() => { void copy('snippet', s.embed_snippet ?? '') }}>
              <Copy size={14} aria-hidden /> {copied === 'snippet' ? t('appointments.setup.settings.copied', 'Copied') : t('appointments.setup.settings.copy', 'Copy')}
            </Button>
          </>
        ) : (
          <p className="text-sm text-a-text-2">{t('appointments.setup.settings.no_link', 'This organisation has no booking link yet.')}</p>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run it.**
  - Run: same command as Step 2, then `npx tsc -b` and `npx eslint src/appointments`.
  - Expected: PASS (4 tests); clean.

- [ ] **Step 5: Commit** with the message "Add the Settings tab: time zone, currency, online booking, points and the booking link".

### Task 22: Setup in the workspace: the page, the checklist, the rail and the banner

**Files:**
- Create: `frontend/src/appointments/setup/SetupPage.tsx`, `frontend/src/appointments/setup/Checklist.tsx`
- Modify: `frontend/src/appointments/AppointmentsApp.tsx` (a `setup` route),
  `frontend/src/appointments/AppointmentsShell.tsx` (rail item; the banner replaces the two notices),
  `frontend/src/appointments/AppointmentsShell.test.tsx`, and the five bundles (remove `shell.timezone_missing` and
  `shell.not_bookable`)
- Create (rig): `.superpowers/sdd/2026-09-30-appointments-workspace/tools/remove-shell-notices.cjs`
- Test: `frontend/src/appointments/setup/setupPage.test.tsx`

**Interfaces:**
- Consumes: every tab (Tasks 18–21), `appointmentsApi.setup` (Task 15), `Bootstrap.readiness.checklist` (Task 8).
- Produces:
  - `SetupPage()`
  - `SetupView({ tab, onTab, data, loading, failed, refresh })`
  - `tabOf(raw: string | null): SetupTab`
  - `Checklist({ checklist, onTab })`
  - `ChecklistBanner({ checklist })`
  - `STEP_TARGET`
  - `type SetupTab = 'services' | 'team' | 'settings'`

- [ ] **Step 1: Write the failing tests.**

  `frontend/src/appointments/setup/setupPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Checklist as ChecklistData, SetupPayload } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/api', () => ({ appointmentsApi: {}, failureOf: () => ({ status: 0, code: '', message: '' }), onWorkspaceOff: () => () => {} }))

const { SetupView, tabOf } = await import('./SetupPage')
const { Checklist, ChecklistBanner } = await import('./Checklist')

const checklist: ChecklistData = {
  steps: [
    { key: 'timezone', done: true, optional: false }, { key: 'service', done: true, optional: false },
    { key: 'performer', done: false, optional: false }, { key: 'hours', done: false, optional: false },
    { key: 'online', done: false, optional: true }, { key: 'first_appointment', done: false, optional: false },
  ],
  complete: false,
}
const data = {
  can_manage: true, my_team_member_id: null, categories: [], team: [], staff_accounts: [], checklist,
  services: [{ id: 1, name: 'Deep Tissue Massage', category_id: null, duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', short_description: null, is_active: true, performers: [] }],
  settings: {} as SetupPayload['settings'],
} as SetupPayload

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

describe('tabOf', () => {
  it('opens Services unless the address names another tab', () => {
    expect(tabOf(null)).toBe('services')
    expect(tabOf('team')).toBe('team')
    expect(tabOf('billing')).toBe('services')
  })
})

describe('Checklist', () => {
  it('counts the steps, marks the optional one and leads to where each is done', () => {
    const html = render(<Checklist checklist={checklist} onTab={() => {}} />)
    expect(html).toContain('2 of 6 done')
    expect(html).toContain('Choose who performs it')
    expect(html).toContain('Optional')
    expect(html).toContain('href="/appointments?new=1"')
  })

  it('banner: says how far setup is and links to it', () => {
    const html = render(<ChecklistBanner checklist={checklist} />)
    expect(html).toContain('Setup is not finished: 2 of 6 steps done.')
    expect(html).toContain('href="/appointments/setup"')
  })
})

describe('SetupView', () => {
  it('shows the checklist until it is complete, the tabs, and the chosen tab', () => {
    const html = render(<SetupView tab="services" onTab={() => {}} data={data} loading={false} failed={false} refresh={() => {}} />)
    expect(html).toContain('Get ready to take bookings')
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Services</)
    expect(html).toContain('Deep Tissue Massage')
    expect(render(<SetupView tab="services" onTab={() => {}} data={{ ...data, checklist: { ...checklist, complete: true } }} loading={false} failed={false} refresh={() => {}} />))
      .not.toContain('Get ready to take bookings')
  })

  it('tells someone who is not a manager that setup is read-only for them', () => {
    expect(render(<SetupView tab="services" onTab={() => {}} data={{ ...data, can_manage: false }} loading={false} failed={false} refresh={() => {}} />))
      .toContain('Only an owner or a manager can change setup.')
  })
})
```

  In `AppointmentsShell.test.tsx`, replace the two tests `says when the venue has no named time zone` and
  `says when nothing can be booked yet` with:

```tsx
  it('shows the setup banner while the checklist is unfinished, and not on Setup itself', () => {
    const unfinished = { ...boot, readiness: { ...boot.readiness, checklist: { steps: [{ key: 'timezone' as const, done: false, optional: false }], complete: false } } }
    expect(render({})).not.toContain('Setup is not finished')
    expect(render({ data: unfinished })).toContain('Setup is not finished: 0 of 1 steps done.')
    expect(render({ data: unfinished }, '/appointments/setup')).not.toContain('Setup is not finished')
  })
```

  In `offers Calendar and Clients and nothing from the full admin`, add
  `expect(html).toContain('href="/appointments/setup"')`.

- [ ] **Step 2: Run them.**
  - Run: `cd frontend && npx vitest run src/appointments/setup/setupPage.test.tsx src/appointments/AppointmentsShell.test.tsx`
  - Expected: FAIL — the modules do not exist, and the shell has no banner or Setup link.

- [ ] **Step 3: Create** `frontend/src/appointments/setup/Checklist.tsx`:

```tsx
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Checklist as ChecklistData, ChecklistKey } from '../lib/types'
import { Notice } from '../ui/Notice'

export type SetupTab = 'services' | 'team' | 'settings'

/** Where each step is done: a Setup tab, or the calendar for the first appointment. */
export const STEP_TARGET: Record<ChecklistKey, SetupTab | 'calendar'> = {
  timezone: 'settings', service: 'services', performer: 'services', hours: 'team', online: 'settings', first_appointment: 'calendar',
}

const doneCount = (checklist: ChecklistData): number => checklist.steps.filter(s => s.done).length

/** A new venue's way to its first appointment, as the server counts it. */
export function Checklist({ checklist, onTab }: { checklist: ChecklistData; onTab: (tab: SetupTab) => void }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="setup-checklist-title" className="space-y-3 rounded-lg border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-checklist-title" className="text-base font-semibold text-a-text">{t('appointments.setup.checklist.title', 'Get ready to take bookings')}</h2>
        <span className="text-xs text-a-text-2">{t('appointments.setup.checklist.progress', '{{done}} of {{total}} done', { done: doneCount(checklist), total: checklist.steps.length })}</span>
      </div>
      <ol className="space-y-2">
        {checklist.steps.map((step, i) => {
          const target = STEP_TARGET[step.key]
          const label = t(`appointments.setup.step.${step.key}`)
          return (
            <li key={step.key} className="flex items-center gap-3 text-sm">
              <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${step.done ? 'bg-a-st-confirmed/[0.12] text-a-st-confirmed' : 'bg-a-surface-2 text-a-text-2'}`}>
                {step.done ? <Check size={14} /> : i + 1}
              </span>
              <span className={step.done ? 'text-a-text-2' : 'text-a-text'}>
                {label}
                {step.done && <span className="sr-only"> ({t('appointments.setup.checklist.done', 'Done')})</span>}
              </span>
              {step.optional && <span className="text-xs text-a-text-2">{t('appointments.setup.checklist.optional', 'Optional')}</span>}
              {!step.done && (target === 'calendar'
                ? <Link to="/appointments?new=1" aria-label={label} className="ml-auto text-sm font-semibold text-a-accent-deep">{t('appointments.setup.checklist.go', 'Go')}</Link>
                : <button type="button" onClick={() => onTab(target)} aria-label={label} className="ml-auto text-sm font-semibold text-a-accent-deep">{t('appointments.setup.checklist.go', 'Go')}</button>)}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** On the calendar and the client pages while setup is unfinished: one line and the way to Setup. */
export function ChecklistBanner({ checklist }: { checklist: ChecklistData }) {
  const { t } = useTranslation()
  return (
    <Notice tone="info">
      {t('appointments.setup.checklist.banner', 'Setup is not finished: {{done}} of {{total}} steps done.', { done: doneCount(checklist), total: checklist.steps.length })}{' '}
      <Link to="/appointments/setup" className="font-semibold text-a-accent-deep underline">{t('appointments.setup.checklist.open', 'Continue setup')}</Link>
    </Notice>
  )
}
```

- [ ] **Step 4: Create** `frontend/src/appointments/setup/SetupPage.tsx`:

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { appointmentsApi } from '../lib/api'
import type { SetupPayload } from '../lib/types'
import { Notice } from '../ui/Notice'
import { Checklist, type SetupTab } from './Checklist'
import { ServicesTab } from './ServicesTab'
import { SettingsTab } from './SettingsTab'
import { TeamTab } from './TeamTab'

const TABS: SetupTab[] = ['services', 'team', 'settings']

export function tabOf(raw: string | null): SetupTab {
  return (TABS as string[]).includes(raw ?? '') ? (raw as SetupTab) : 'services'
}

/** Setup in the workspace. A save changes what the calendar and the shell show too, so every workspace query is refreshed. */
export function SetupPage() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['appointments', 'setup'], queryFn: appointmentsApi.setup })
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['appointments'] }) }

  return (
    <SetupView tab={tabOf(params.get('tab'))} onTab={(tab) => setParams({ tab }, { replace: true })}
      data={query.data} loading={query.isLoading} failed={query.isError} refresh={refresh} />
  )
}

export function SetupView({ tab, onTab, data, loading, failed, refresh }: {
  tab: SetupTab; onTab: (tab: SetupTab) => void; data: SetupPayload | undefined; loading: boolean; failed: boolean; refresh: () => void
}) {
  const { t } = useTranslation()
  const labels: Record<SetupTab, string> = {
    services: t('appointments.setup.tabs.services', 'Services'),
    team: t('appointments.setup.tabs.team', 'Team'),
    settings: t('appointments.setup.tabs.settings', 'Settings'),
  }

  return (
    <div className="max-w-5xl space-y-5 p-6">
      <h1 className="text-xl font-semibold text-a-text">{t('appointments.setup.title', 'Setup')}</h1>
      {loading && <p className="text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {failed && <Notice tone="danger">{t('appointments.setup.load_failed', 'Setup could not be loaded. Please try again.')}</Notice>}
      {data && (
        <>
          {!data.checklist.complete && <Checklist checklist={data.checklist} onTab={onTab} />}
          {!data.can_manage && (
            <Notice tone="info">{t('appointments.setup.read_only', 'Only an owner or a manager can change setup. You can see it here and manage your own time off under Team.')}</Notice>
          )}
          <div role="tablist" aria-label={t('appointments.setup.title', 'Setup')} className="flex gap-1 border-b border-a-border">
            {TABS.map(key => (
              <button key={key} type="button" role="tab" id={`setup-tab-${key}`} aria-selected={tab === key} aria-controls="setup-panel"
                onClick={() => onTab(key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? 'border-a-accent text-a-text' : 'border-transparent text-a-text-2 hover:text-a-text'}`}>
                {labels[key]}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="setup-panel" aria-labelledby={`setup-tab-${tab}`}>
            {tab === 'services' && <ServicesTab data={data} refresh={refresh} />}
            {tab === 'team' && <TeamTab data={data} refresh={refresh} />}
            {tab === 'settings' && <SettingsTab key={JSON.stringify(data.settings)} data={data} refresh={refresh} />}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Wire the route and the shell.**
  - In `AppointmentsApp.tsx`, `import { SetupPage } from './setup/SetupPage'` and add
    `<Route path="setup" element={<SetupPage />} />` before the `*` route.
  - In `AppointmentsShell.tsx`:
    - add `Settings2` to the lucide import and `import { ChecklistBanner } from './setup/Checklist'`;
    - append `{ to: '/appointments/setup', end: false, icon: Settings2, label: t('appointments.nav.setup', 'Setup') }`
      to `nav`;
    - replace the two blocks `{!data.venue.timezone_named && (...)}` and `{!data.readiness.bookable && (...)}` with:

```tsx
            {!data.readiness.checklist.complete && !pathname.startsWith('/appointments/setup') && (
              <div className="px-4 pt-3">
                <ChecklistBanner checklist={data.readiness.checklist} />
              </div>
            )}
```

- [ ] **Step 6: Remove the two retired strings** from the five bundles. Write
  `.superpowers/sdd/2026-09-30-appointments-workspace/tools/remove-shell-notices.cjs` with the Write tool:

```js
// node remove-shell-notices.cjs — from the feature worktree root. The checklist banner replaced these two notices.
const fs = require('fs')
for (const lang of ['en', 'ru', 'de', 'fr', 'es']) {
  const file = `frontend/src/appointments/i18n/appointments.${lang}.json`
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const kept = lines.filter(line => !/^\s*"(timezone_missing|not_bookable)": /.test(line))
  if (lines.length - kept.length !== 2) throw new Error(`${lang}: expected to remove 2 lines, found ${lines.length - kept.length}`)
  const raw = kept.join('\n')
  JSON.parse(raw)
  fs.writeFileSync(file, raw)
  console.log(`${lang}: removed`)
}
```

  Run it with `node .superpowers/sdd/2026-09-30-appointments-workspace/tools/remove-shell-notices.cjs`.

- [ ] **Step 7: Run everything for the workspace.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh`
    (vitest on `src/appointments` plus the locale sweep, tsc, eslint).
  - Expected: `vitest=0 tsc=0 eslint=0`.
  - Then run `cd frontend && npx vitest run`. Expected: everything passes except the 3 known `plannerMeta`
    failures.

- [ ] **Step 8: Commit** with the message "Put Setup in the workspace's rail, with the checklist where the old notices were".

### Task 23: Docs, the whole-branch checks and the browser

**Files:**
- Modify: `docs/appointments-workspace.md` (a `## Setup` section and the runbook's "Before it is sold on its own"
  list), `CLAUDE.md` (the appointments rules)

- [ ] **Step 1: Docs.** Add `## Setup (Part B, 2026-10-01)` to `docs/appointments-workspace.md`. It states, each as
  one short paragraph:
  - who may change what (managers; staff only their own time off; server-checked; `403 not_allowed`);
  - the endpoints (§5 of the spec);
  - that every strandable save has `?dry_run=1`, and the workspace previews with it;
  - where each setting is stored (§6.5);
  - that the workspace never deletes, only deactivates;
  - the checklist's six steps;
  - that the widgets' notice is on the venue clock (`VenueNotice`), with ruling R2's portal extras note;
  - where to look when a venue says "the hours are wrong" (`service_master_schedules`, `WeeklyHours`).

  Under the runbook's standalone-sale list, keep "server-side lock-down of the rest of the admin API + roles" and
  add "the full admin's setup endpoints still accept any staff user (Part C)".

  In `CLAUDE.md`'s "Appointments-workspace code rules" add one line:

  > Setup saves go through `App\Services\Booking\Setup\*`, and the full admin shares `OwnRows` and `WeeklyHours`;
  > a change that can strand appointments supports `?dry_run=1` and is previewed in the workspace (owner decision:
  > warn, list, still allow).

- [ ] **Step 2: The whole backend for the touched areas.** Run each separately and read every `Tests:` line:
  `t.sh tests/Feature/Appointments`, `t.sh tests/Unit/Appointments`, `t.sh tests/Feature/Booking`,
  `t.sh tests/Feature/Member`, `t.sh tests/Feature/Landing/ServiceMenuRowFieldsApiTest.php`,
  `t.sh tests/Feature/RouteControllersExistTest.php`, `t.sh tests/Feature/RouteUniquenessTest.php`.
  Expected: all exit 0.

- [ ] **Step 3: The whole frontend.**
  - Run `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh`, then `cd frontend && npx vitest run`.
  - Expected: `vitest=0 tsc=0 eslint=0`; the whole run passes except the 3 known `plannerMeta` failures.
  - Run `npx eslint` on the touched shared files (`src/components/settings/BookingTab.tsx`). Expected: no more
    problems than with the change stashed.

- [ ] **Step 4: The browser.** Run the local stack exactly as in Part A:
  - `artisan serve` on 8010 with `MAIL_MAILER=log QUEUE_CONNECTION=sync LOG_LEVEL=debug CORS_ALLOWED_ORIGINS=http://localhost:5180`;
  - `VITE_API_URL=http://localhost:8010/api npx vite --port 5180`;
  - the tester account, a Riga browser, at 1440 and at 390 wide.

  Check by eye and with screenshots in `.superpowers/shots/appointments/partB-*.png`:
  1. A fresh organisation:
     - make one with the tester as manager;
     - follow the checklist alone (time zone, a service, a person who performs it, their week);
     - the calendar banner disappears once steps 1–4 and the first appointment are done;
     - a public widget booking on `/services/{token}` succeeds.
  2. Time off over an existing appointment shows the dialog with that appointment. "Back" saves nothing; "Save
     anyway" saves, and the appointment is still on the calendar.
  3. A `staff`-role user linked to a team member:
     - adds and removes their own time off;
     - sees Services and Settings read-only;
     - gets 403 from a hand-made request on someone else.
  4. The full admin shows the workspace-made service and person, with the same hours.
  5. The widget at a Riga venue no longer offers today's past times.

  Stop the servers afterwards (kill by port after checking the command line). The local PostgreSQL is shared: use
  only the tester's organisation and never migrate.

- [ ] **Step 5: Commit** the docs with the message "Document Setup in the workspace". Then write the ledger lines
  (every ruling, the browser results), and run the final whole-branch review as `superpowers:executing-plans`
  directs.

