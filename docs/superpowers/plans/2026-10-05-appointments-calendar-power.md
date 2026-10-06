# HexaTech Appointments — Part F: calendar power — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff drag an appointment to a new time or person, stretch or shorten it, a manager reopens a visit closed by
mistake, and the grid is walked with the arrow keys — every change through the same server checks as the forms.

**Architecture:** The server gains one optional last parameter on the scheduler (`$lengthMinutes`, nobody else passes
it), an optional `length` / `normal_length` on the existing move request (a staff-set length kept in
`meta.length_minutes`), and a `reopen` action run under the person's `svcm:` lock. The workspace gains a small
pointer-events drag layer (`useCardDrag` + pure `dragMath`), a confirm dialog that saves through the existing move
call, a Length field in the Move form, a Reopen button, and a roving tab stop (`gridFocus`).

**Tech Stack:** Laravel 13 / PHP 8.4, PHPUnit (SQLite in memory); React 19, TypeScript, TanStack Query 5, i18next,
Vitest (node, static render); Tailwind 3.4 with the workspace's `a-*` tokens.

**Spec:** `docs/superpowers/specs/2026-10-05-appointments-calendar-power-design.md` (owner-approved, commit `9d47fee15`).

`<ws>` below is this plan's workspace: `.superpowers/sdd/2026-10-05-appointments-calendar-power` (printed by
`sdd-workspace`). `<t>` is `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh` (runs the named PHP
test paths scoped, prints the `Tests:` line and `exit=`).

## Global Constraints

- PHP is always `/c/wamp64/bin/php/php8.4.20/php.exe`; never a bare `php artisan test` — run tests by path with `<t>`.
- The local PostgreSQL is shared: never `artisan migrate` locally. Part F has **no migration and no new setting**.
- Frontend checks: `cd frontend && npx tsc -b && npx vitest run <paths>`; the whole run's known failures are the 3
  `plannerMeta` tests and `bookingSheet.test.tsx` (a clock time-bomb), nothing else.
- No new npm dependency (owner: "Our own small drag layer").
- `frontend/src/appointments/` uses only `a-*` colour tokens and only `/v1/admin/appointments/…` (`tokens.test.ts`).
- Every literal `t('appointments.…')` key exists in all five bundles (`src/i18n/localeCompleteness.test.ts`); keys built
  at run time are listed in `appointmentsLocales.test.ts`'s `FAMILIES`.
- The frontend never builds a `Date` from a wall time (`lib/wallClock.ts` helpers only).
- Never commit `frontend/dist`, `public/spa` or `resources/spa-shell` on the feature branch. Stage files by name.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; write them to
  `<ws>/tools/commit-N.txt` with the Write tool and `git commit -F` (Bash heredocs halve backslashes — PHP
  namespaces and regexes are written with the Write/Edit tools, never through a heredoc).
- A staff-set length is 15 to 480 minutes in 15-minute steps; drags snap to 15 minutes (spec §5).
- `reserveSlot()` and `availableSlots()` change only by an optional **last** parameter; no other caller passes it.
- Below 1024 px the calendar already shows the List view (`CalendarPage` `NARROW`): drag, resize and the arrow keys
  exist where the grid is drawn; at phone width the Move form's Length is the way (R2).

## Review Focus

1. **A click on a card, or a drag released at its own place, sends nothing** — and the click still opens the panel
   (no accidental move). Pinned by Task 7's `onRelease` test; the click guard (`consumeClick`) is checked in the
   browser (Task 10).
2. **A touch swipe across the calendar on a tablet scrolls and never starts a drag**; only a still 400 ms press does.
   Pinned by Task 7's `touchStartsDrag` test.
3. **A working window that ends at 24:00 accepts a drop that ends at midnight.** Pinned by Task 7's `whyNot` test.
4. **A staff-set length goes with the visit to another person whose normal length differs.** Pinned by Task 2's
   `test_the_staff_length_goes_with_the_visit_to_another_person`.
5. **Reopening a cancelled visit whose card hold was released leaves the full price owed at the desk.** Pinned by
   Task 3's `test_a_card_hold_released_at_cancellation_leaves_the_price_owed_at_the_desk`.

## Planning rulings (decisions the spec left open, found while writing the code)

- **R1.** The presenter does not add `normal_length_minutes` (spec §5). The Move form labels "Normal length (45 min)"
  from the slots answer's `duration_minutes`, which is the chosen person's normal length — right for any person, not
  only the booking's own. Cost if wrong: none.
- **R2.** Below 1024 px the calendar shows the List view (existing `NARROW` rule), so drag, resize and the arrow keys
  exist at 1024 px and up (tablets in landscape included); at 390 px the Move form's Length field is the way to change
  a length. The spec's "at 390 px … dragging starts with a long press" described a grid that is not drawn there.
  Cost if wrong: none.
- **R3.** The drag preview's overlap check counts pending, confirmed and in-progress appointments — the scheduler's own
  set (`lib/status` `LIVE`) — not the grid's `coversSlot` (which also counts completed). Cost if wrong: none.
- **R4.** The drop dialog fetches the appointment's detail for the client's email ("Tell the client by email (…)"),
  because calendar cards carry no contact details by design; the move is sent with the card's own revision, so a
  change made since the calendar loaded answers `stale`. Cost if wrong: a moment of "Loading…" in the dialog.
- **R5.** One rule for lengths: `StaffBookingWriter::lengthOrRefuse()` (422 `invalid_length`), used by the move and the
  slots endpoints. Cost if wrong: none.
- **R6.** The action endpoint reads the status before the run (as `update` reads `$before`), so only a reopened
  cancellation can send Part D's "Confirmed" email. Cost if wrong: none.
- **R7.** A resize sends `notify_client: false` (the server would send nothing anyway: start and person unchanged).
  Cost if wrong: none.
- **R8.** `ActionConfirm` shows "Tell the client" when the server's consequence asks (`message === 'ask'`) instead of a
  fixed list of actions, and the panel sends `notify_client` on the same rule. Confirm and cancel already answer
  `ask`, so nothing changes for them. Cost if wrong: none.

## File map

| File | Change |
|---|---|
| `app/Services/ServiceSchedulingService.php` | `reserveSlot()` / `availableSlots()` optional last `?int $lengthMinutes` |
| `app/Services/Appointments/StaffBookingWriter.php` | `lengthOrRefuse()`; `move(…, ?int $length, bool $normalLength)`; `meta.length_minutes`; audit length |
| `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php` | `update` passes `length` / `normal_length`; `action` reads the status before (reopen message) |
| `app/Http/Controllers/Api/V1/Admin/Appointments/CalendarController.php` | `slots` takes `length` |
| `app/Services/Appointments/AppointmentPresenter.php` | detail `length_set_by_staff` |
| `app/Services/Appointments/AppointmentActions.php` | `reopen` in `FROM`; its message consequence |
| `app/Services/Appointments/AppointmentActionRunner.php` | reopen: manager, `svcm:` lock, money and clash checks, patch |
| `tests/Feature/Appointments/SchedulerLengthTest.php` | new |
| `tests/Feature/Appointments/MoveLengthTest.php` | new |
| `tests/Feature/Appointments/ReopenTest.php` | new |
| `tests/Feature/Appointments/{AppointmentActionsTest,AppointmentActionEndpointTest,MoveAppointmentTest,AppointmentPresenterTest}.php` | the eighth action |
| `frontend/src/appointments/lib/{types,api,status}.ts` | `reopen`, `length_set_by_staff`, `MoveBody`, slots `length`, `LIVE` |
| `frontend/src/appointments/i18n/*` + `<ws>/tools/add-partf-strings.cjs` | the words, five languages |
| `frontend/src/appointments/panel/{lengths.ts,MoveForm.tsx,AppointmentPanel.tsx,AppointmentView.tsx,ActionConfirm.tsx,consequences.ts}` | Length; Reopen |
| `frontend/src/appointments/calendar/{dragMath.ts,useCardDrag.ts,DragPreview.tsx,DropConfirm.tsx,gridFocus.ts}` | new |
| `frontend/src/appointments/calendar/{AppointmentCard.tsx,TimeGrid.tsx,CalendarPage.tsx}` | drag, resize, keys |
| `docs/appointments-workspace.md` | runbook |

---

### Task 1: The scheduler takes a length

**Files:**
- Modify: `app/Services/ServiceSchedulingService.php` (`availableSlots`, `reserveSlot`)
- Test: `tests/Feature/Appointments/SchedulerLengthTest.php` (new)

**Interfaces:**
- Produces: `availableSlots(Service, string $date, ?int $masterId = null, ?int $stepMinutes = null, int $leadMinutes = 60,
  ?int $ignoreBookingId = null, ?int $lengthMinutes = null): array` and `reserveSlot(Service, ?int $masterId,
  string $startAt, ?int $ignoreBookingId = null, ?int $lengthMinutes = null): array` — with a length, every slot's
  `duration_minutes` and end use it; the price never does.

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/SchedulerLengthTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\ServiceSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * Part F: a length staff set for one booking replaces the person's normal one
 * in reserveSlot() and availableSlots(); without it nothing changes, for any
 * caller (widget, portal, chat, full admin).
 */
class SchedulerLengthTest extends TestCase
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

    public function test_reserve_slot_takes_a_length_and_checks_the_hours_and_overlaps_on_it(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $scheduler = app(ServiceSchedulingService::class);

        $slot = $scheduler->reserveSlot($service, $master->id, '2026-10-06T15:00:00+00:00', null, 90);
        $this->assertSame('2026-10-06 16:30:00', $slot['end']->format('Y-m-d H:i:s'));
        $this->assertSame(90, $slot['duration_minutes']);
        $this->assertSame(60.0, $slot['price']); // the price never follows the length

        try {
            // 15:00 + 150 minutes ends 17:30, past the 09:00–17:00 hours.
            $scheduler->reserveSlot($service, $master->id, '2026-10-06T15:00:00+00:00', null, 150);
            $this->fail('Reserved past the working hours.');
        } catch (\RuntimeException) {
            $this->addToAssertionCount(1);
        }

        // 10:00 + 90 minutes reaches the 11:00 appointment; the normal 45 does not.
        $this->booking($service->id, $master->id, '2026-10-06 11:00:00', '2026-10-06 11:45:00');
        $this->assertSame('2026-10-06 10:45:00', $scheduler->reserveSlot($service, $master->id, '2026-10-06T10:00:00+00:00')['end']->format('Y-m-d H:i:s'));
        $this->expectException(\RuntimeException::class);
        $scheduler->reserveSlot($service, $master->id, '2026-10-06T10:00:00+00:00', null, 90);
    }

    public function test_available_slots_offer_only_starts_where_the_length_fits(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $scheduler = app(ServiceSchedulingService::class);

        $normal = $scheduler->availableSlots($service, '2026-10-06', $master->id);
        $long = $scheduler->availableSlots($service, '2026-10-06', $master->id, null, 60, null, 90);

        $this->assertSame('16:15', end($normal)['time_label']);
        $this->assertSame(45, $normal[0]['duration_minutes']);
        $this->assertSame('15:30', end($long)['time_label']);
        $this->assertSame(90, $long[0]['duration_minutes']);
    }
}
```

- [ ] **Step 2: Run it.** `<t> tests/Feature/Appointments/SchedulerLengthTest.php`
  - Expected: FAIL — the length is ignored (end 15:45 and 45 minutes; the 90-minute reserve at 10:00 succeeds).

- [ ] **Step 3: Implement** with the Edit tool in `app/Services/ServiceSchedulingService.php`:
  - `availableSlots`: add the parameter after `?int $ignoreBookingId = null,`:
    ```php
        ?int $lengthMinutes = null,
    ```
    and replace `$effDuration = $this->effectiveDuration($service, $master);` inside its `foreach ($masters …)` with:
    ```php
            // Part F: a length staff set for one booking replaces the person's normal one.
            $effDuration = $lengthMinutes ?? $this->effectiveDuration($service, $master);
    ```
  - `reserveSlot`: the signature becomes
    ```php
    public function reserveSlot(Service $service, ?int $masterId, string $startAt, ?int $ignoreBookingId = null, ?int $lengthMinutes = null): array
    ```
    and its `$effDuration = $this->effectiveDuration($service, $master);` becomes
    ```php
            $effDuration = $lengthMinutes ?? $this->effectiveDuration($service, $master);
    ```
  - Add one line to `reserveSlot`'s docblock: ` * $lengthMinutes (Part F) is a length staff set for this one booking; the price never follows it.`

- [ ] **Step 4: Run it**, then the scheduler's callers: `<t> tests/Feature/Appointments/SchedulerLengthTest.php`, then
  `<t> tests/Feature/Appointments tests/Unit/Appointments tests/Feature/Booking tests/Feature/Widget`.
  - Expected: PASS (2 new); the rest as the baseline.

- [ ] **Step 5: Commit** "Let the scheduler take a length staff set for one booking":
  `git add app/Services/ServiceSchedulingService.php tests/Feature/Appointments/SchedulerLengthTest.php` then
  `git commit -F <ws>/tools/commit-1.txt`.

---

### Task 2: Move with a length

**Files:**
- Modify: `app/Services/Appointments/StaffBookingWriter.php` (`move`, new `lengthOrRefuse`)
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php` (`update`)
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/CalendarController.php` (`slots`)
- Modify: `app/Services/Appointments/AppointmentPresenter.php` (`detail`)
- Test: `tests/Feature/Appointments/MoveLengthTest.php` (new)

**Interfaces:**
- Consumes: Task 1's optional `$lengthMinutes`.
- Produces: `StaffBookingWriter::lengthOrRefuse(?int $length, bool $normal = false): ?int` (422 `invalid_length`);
  `StaffBookingWriter::move(int $id, string $wall, int $masterId, string $revision, User $actor, ?int $length = null,
  bool $normalLength = false): ServiceBooking`; `PATCH admin/appointments/bookings/{id}` accepts `length` (int) and
  `normal_length` (bool); `GET admin/appointments/slots` accepts `length`; the detail carries
  `length_set_by_staff: bool`; the booking keeps `meta.length_minutes`.

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/MoveLengthTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\VenueClock;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** Part F: a length staff set (a resize, or the Move form's Length) is the booking's own until changed or forgotten. */
class MoveLengthTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
    }

    private function move(ServiceBooking $booking, array $body): TestResponse
    {
        return $this->asStaff()->patchJson($this->api("bookings/{$booking->id}"), array_merge([
            'start'     => '2026-10-06T10:00',
            'master_id' => $this->master->id,
            'revision'  => AppointmentPresenter::revision($booking->fresh()),
        ], $body));
    }

    /** A second person for the same service whose normal length is 30 minutes, working 09:00–17:00 every day. */
    private function secondPerson(): ServiceMaster
    {
        $second = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Liam Brown', 'is_active' => true]);
        DB::table('service_master_service')->insert([
            'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $second->id,
            'duration_override_minutes' => 30, 'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach (range(0, 6) as $day) {
            DB::table('service_master_schedules')->insert([
                'organization_id' => $this->org->id, 'service_master_id' => $second->id, 'day_of_week' => $day,
                'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $second;
    }

    public function test_a_length_stretches_the_visit_in_place_and_the_next_move_keeps_it(): void
    {
        $booking = $this->seedBooking();

        $this->move($booking, ['length' => 90])->assertOk()
            ->assertJsonPath('booking.start', '2026-10-06T10:00')
            ->assertJsonPath('booking.end', '2026-10-06T11:30')
            ->assertJsonPath('booking.duration_minutes', 90)
            ->assertJsonPath('booking.length_set_by_staff', true)
            ->assertJsonPath('booking.price.total', 60);
        $this->assertSame(90, $booking->fresh()->meta['length_minutes']);

        $this->move($booking, ['start' => '2026-10-06T14:00'])->assertOk()
            ->assertJsonPath('booking.end', '2026-10-06T15:30')
            ->assertJsonPath('booking.length_set_by_staff', true);
    }

    public function test_the_staff_length_goes_with_the_visit_to_another_person(): void
    {
        $booking = $this->seedBooking();
        $second = $this->secondPerson();
        $this->move($booking, ['length' => 90])->assertOk();

        // Liam's normal length is 30 minutes; the visit keeps the 90 staff set.
        $this->move($booking, ['start' => '2026-10-06T14:00', 'master_id' => $second->id])->assertOk()
            ->assertJsonPath('booking.master.id', $second->id)
            ->assertJsonPath('booking.end', '2026-10-06T15:30');
    }

    public function test_normal_length_forgets_the_staff_length(): void
    {
        $booking = $this->seedBooking();
        $this->move($booking, ['length' => 90])->assertOk();

        $this->move($booking, ['start' => '2026-10-06T14:00', 'normal_length' => true])->assertOk()
            ->assertJsonPath('booking.end', '2026-10-06T14:45')
            ->assertJsonPath('booking.length_set_by_staff', false);
        $this->assertArrayNotHasKey('length_minutes', (array) $booking->fresh()->meta);
    }

    public function test_a_length_past_the_hours_or_into_the_next_visit_is_refused(): void
    {
        $booking = $this->seedBooking();
        // 10:00 + 8 hours ends 18:00, past 17:00.
        $this->move($booking, ['length' => 480])->assertStatus(409)->assertJsonPath('error', 'slot_taken');

        $this->seedBooking(['start_at' => '2026-10-06 11:00:00', 'end_at' => '2026-10-06 11:45:00']);
        $this->move($booking, ['length' => 90])->assertStatus(409)->assertJsonPath('error', 'slot_taken');

        $this->assertSame('2026-10-06T10:45', VenueClock::wall($booking->fresh()->end_at));
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function badLengths(): array
    {
        return [
            'shorter than 15 minutes'  => [['length' => 10]],
            'longer than 8 hours'      => [['length' => 485]],
            'not in 15-minute steps'   => [['length' => 50]],
            'a length and normal both' => [['length' => 90, 'normal_length' => true]],
        ];
    }

    #[DataProvider('badLengths')]
    public function test_a_length_outside_the_rules_is_refused(array $body): void
    {
        $booking = $this->seedBooking();

        $this->move($booking, $body)->assertStatus(422)->assertJsonPath('error', 'invalid_length');
        $this->assertSame(45, (int) $booking->fresh()->duration_minutes);
    }

    public function test_a_length_change_alone_tells_nobody_and_is_in_the_history(): void
    {
        $this->setClientMessages(true);
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $this->move($booking, ['length' => 60, 'notify_client' => true])->assertOk()->assertJsonPath('client_message', null);

        $audit = AuditLog::where('action', 'service_booking.moved')->where('subject_id', $booking->id)->latest('id')->firstOrFail();
        $this->assertSame(45, $audit->old_values['length']);
        $this->assertSame(60, $audit->new_values['length']);
    }

    public function test_the_free_times_follow_the_length(): void
    {
        $booking = $this->seedBooking();
        $slots = fn (array $extra) => $this->asStaff()->getJson($this->api('slots?' . http_build_query([
            'service_id' => $this->service->id, 'master_id' => $this->master->id, 'date' => '2026-10-06', 'ignore' => $booking->id,
        ] + $extra)));

        $this->assertSame('16:15', collect($slots([])->assertOk()->json('slots'))->last()['label']);
        $this->assertSame('15:30', collect($slots(['length' => 90])->assertOk()->json('slots'))->last()['label']);
        // The person's normal length, for the Move form's "Normal length (45 min)".
        $this->assertSame(45, $slots(['length' => 90])->json('duration_minutes'));
        $slots(['length' => 50])->assertStatus(422)->assertJsonPath('error', 'invalid_length');
    }
}
```

- [ ] **Step 2: Run it.** `<t> tests/Feature/Appointments/MoveLengthTest.php`
  - Expected: FAIL — `length` is ignored (end 10:45), `length_set_by_staff` missing, no `invalid_length`.

- [ ] **Step 3: Implement the writer** (Edit tool) in `app/Services/Appointments/StaffBookingWriter.php`.
  - After `public const SOURCE = 'staff';` add:
    ```php
    /** A length staff set for one booking (Part F): 15 minutes to 8 hours, in 15-minute steps. */
    public const LENGTH_MIN = 15;
    public const LENGTH_MAX = 480;
    public const LENGTH_STEP = 15;
    ```
  - Before `public function startOrRefuse(` add:
    ```php
    /** A staff-set length, or null for none. A length out of the rules, or one sent with `normal_length`, is refused. */
    public static function lengthOrRefuse(?int $length, bool $normal = false): ?int
    {
        if ($length === null) {
            return null;
        }
        if ($normal || $length < self::LENGTH_MIN || $length > self::LENGTH_MAX || $length % self::LENGTH_STEP !== 0) {
            throw new AppointmentRefused('invalid_length', 'Choose a length between 15 minutes and 8 hours, in 15-minute steps.', 422);
        }

        return $length;
    }
    ```
  - `move`'s signature and docblock: the signature becomes
    `public function move(int $id, string $wall, int $masterId, string $revision, User $actor, ?int $length = null, bool $normalLength = false): ServiceBooking`;
    add to its docblock: ` * $length (Part F) becomes the booking's own length (meta.length_minutes) and later moves keep it;`
    ` * $normalLength forgets it, so the new person's normal length applies again.`
  - First line of `move`'s body, after `$orgId = …;`: `$length = self::lengthOrRefuse($length, $normalLength);`
  - The closure's `use` list gains `$length, $normalLength`.
  - Replace the closure's lines from `$slot = $this->scheduler->reserveSlot(` through the `AuditLog::record(…);` call with:
    ```php
                // Part F: a length staff set stays with the booking until changed or forgotten.
                $meta = (array) ($booking->meta ?? []);
                $kept = isset($meta['length_minutes']) ? (int) $meta['length_minutes'] : null;
                $use = $normalLength ? null : ($length ?? $kept);

                $slot = $this->scheduler->reserveSlot($service, $master->id, $start->toIso8601String(), $booking->id, $use);

                $old = [
                    'start'     => VenueClock::wall($booking->start_at),
                    'end'       => VenueClock::wall($booking->end_at),
                    'master_id' => (int) $booking->service_master_id,
                    'length'    => (int) $booking->duration_minutes,
                ];

                if ($normalLength) {
                    unset($meta['length_minutes']);
                } elseif ($length !== null) {
                    $meta['length_minutes'] = $length;
                }

                $booking->update([
                    'start_at'          => $slot['start'],
                    'end_at'            => $slot['end'],
                    'duration_minutes'  => $slot['duration_minutes'],
                    'service_master_id' => $slot['master']->id,
                    'meta'              => $meta === [] ? null : $meta,
                ]);

                AuditLog::record(
                    'service_booking.moved',
                    $booking,
                    [
                        'start'     => VenueClock::wall($booking->start_at),
                        'end'       => VenueClock::wall($booking->end_at),
                        'master_id' => (int) $booking->service_master_id,
                        'length'    => (int) $booking->duration_minutes,
                    ],
                    $old,
                    $actor,
                    "Moved appointment {$booking->booking_reference} to " . VenueClock::wall($booking->start_at) . " with {$master->name} ({$booking->duration_minutes} min)",
                );
    ```

- [ ] **Step 4: Implement the endpoints and the presenter** (Edit tool).
  - `BookingController::update` validation gains (after `'notify_client' => 'nullable|boolean',`):
    ```php
            // Part F: the booking's length from now on, or back to the person's normal one.
            'length'        => 'nullable|integer',
            'normal_length' => 'nullable|boolean',
    ```
    and its `$writer->move(…)` call becomes
    `$writer->move($id, $data['start'], (int) $data['master_id'], $data['revision'], $request->user(), isset($data['length']) ? (int) $data['length'] : null, $request->boolean('normal_length'));`
    (the `$changed` rule below it is unchanged: a length change alone tells nobody).
  - `CalendarController::slots` validation gains `'length' => 'nullable|integer',`; after the two `find` lines add
    `$length = StaffBookingWriter::lengthOrRefuse(isset($data['length']) ? (int) $data['length'] : null);` and pass
    `$length` as the last argument of `$scheduler->availableSlots(…)` (after `$data['ignore'] ?? null`). Add
    `use App\Services\Appointments\StaffBookingWriter;`. `duration_minutes` in its answer stays the person's normal one.
  - `AppointmentPresenter::detail`'s array gains, after `'source' => …,`:
    ```php
            // Part F: the booking keeps a length staff set (resize or the Move form's Length).
            'length_set_by_staff' => isset(((array) ($b->meta ?? []))['length_minutes']),
    ```

- [ ] **Step 5: Run it**, then the neighbours: `<t> tests/Feature/Appointments/MoveLengthTest.php`, then
  `<t> tests/Feature/Appointments`.
  - Expected: PASS (11 new, the data set counting four); the rest as the baseline.

- [ ] **Step 6: Commit** "Let staff set an appointment's length, kept by later moves":
  `git add app/Services/Appointments/StaffBookingWriter.php app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php app/Http/Controllers/Api/V1/Admin/Appointments/CalendarController.php app/Services/Appointments/AppointmentPresenter.php tests/Feature/Appointments/MoveLengthTest.php`
  then `git commit -F <ws>/tools/commit-2.txt`.

---

### Task 3: Reopen

**Files:**
- Modify: `app/Services/Appointments/AppointmentActions.php` (`FROM`, `consequences`)
- Modify: `app/Services/Appointments/AppointmentActionRunner.php` (`run`, new `assertReopenable`)
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php` (`action`)
- Test: `tests/Feature/Appointments/ReopenTest.php` (new); update `AppointmentActionsTest.php`,
  `AppointmentActionEndpointTest.php`, `MoveAppointmentTest.php`, `AppointmentPresenterTest.php`

**Interfaces:**
- Produces: action key `reopen` (allowed from completed, no_show, cancelled; managers only — 403 `not_allowed`);
  errors 422 `money_returned`, 409 `slot_taken`; consequence `message: 'ask'` only for a cancelled visit; the actions
  list order is `confirm, start, complete, no_show, cancel, award_points, reopen, move`.

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/ReopenTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Models\User;
use App\Services\Appointments\AppointmentActions;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** Part F: a manager puts back a visit marked completed, no-show or cancelled by mistake. */
class ReopenTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
    }

    private function act(ServiceBooking $booking, string $action, array $extra = [], ?User $as = null): TestResponse
    {
        return ($as ? $this->actingAs($as, 'sanctum') : $this->asStaff())->postJson($this->api("bookings/{$booking->id}/actions"), array_merge([
            'action'   => $action,
            'revision' => AppointmentPresenter::revision($booking->fresh()),
        ], $extra));
    }

    /** @return array<string, array{0: string}> */
    public static function closed(): array
    {
        return ['completed' => ['completed'], 'no-show' => ['no_show'], 'cancelled' => ['cancelled']];
    }

    #[DataProvider('closed')]
    public function test_a_manager_reopens_a_visit_closed_by_mistake(string $status): void
    {
        $booking = $this->seedBooking(['status' => $status] + ($status === 'cancelled' ? ['cancelled_at' => now(), 'cancellation_reason' => 'Client ill'] : []));

        $this->act($booking, 'reopen')->assertOk()->assertJsonPath('booking.status', 'confirmed');

        $fresh = $booking->fresh();
        $this->assertNull($fresh->cancelled_at);
        $this->assertNull($fresh->cancellation_reason);
        $audit = AuditLog::where('action', 'service_booking.reopen')->where('subject_id', $booking->id)->firstOrFail();
        $this->assertSame($status, $audit->old_values['status']);
        $this->assertSame('confirmed', $audit->new_values['status']);
    }

    public function test_only_a_manager_may_reopen(): void
    {
        $booking = $this->seedBooking(['status' => 'completed']);

        $this->act($booking, 'reopen', [], $this->staffUser($this->org, ['role' => 'staff']))
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->assertSame('completed', $booking->fresh()->status);
    }

    public function test_a_time_taken_since_is_refused(): void
    {
        $booking = $this->seedBooking(['status' => 'cancelled', 'cancelled_at' => now()]);
        $this->seedBooking(['start_at' => '2026-10-06 10:15:00', 'end_at' => '2026-10-06 11:00:00']);

        $this->act($booking, 'reopen')->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->assertSame('cancelled', $booking->fresh()->status);
    }

    public function test_a_visit_whose_money_went_back_is_refused(): void
    {
        $booking = $this->seedBooking(['status' => 'cancelled', 'cancelled_at' => now(), 'payment_status' => 'refunded']);
        foreach (['payment', 'refund'] as $kind) {
            ServiceBookingPayment::create([
                'service_booking_id' => $booking->id, 'kind' => $kind, 'method' => 'cash', 'amount' => 60, 'currency' => 'EUR',
                'note' => $kind === 'refund' ? 'Client ill' : null, 'actor_user_id' => $this->staff->id,
            ]);
        }

        $this->act($booking, 'reopen')->assertStatus(422)->assertJsonPath('error', 'money_returned');
        $this->assertSame('cancelled', $booking->fresh()->status);
    }

    public function test_a_card_hold_released_at_cancellation_leaves_the_price_owed_at_the_desk(): void
    {
        $booking = $this->seedBooking(['status' => 'cancelled', 'cancelled_at' => now(), 'payment_status' => 'cancelled', 'stripe_payment_intent_id' => 'pi_released3']);

        $this->act($booking, 'reopen')->assertOk()
            ->assertJsonPath('booking.money.held_online', 0)
            ->assertJsonPath('booking.money.owed', 60)
            ->assertJsonPath('booking.money.can_take', true);
    }

    public function test_points_are_never_awarded_twice(): void
    {
        $booking = $this->seedBooking(['member_id' => $this->member->id]);

        $this->act($booking, 'complete')->assertOk()->assertJsonPath('points.awarded', 900);
        $this->act($booking, 'reopen')->assertOk()->assertJsonPath('booking.status', 'confirmed');
        $this->act($booking, 'complete')->assertOk()
            ->assertJsonPath('points.awarded', 0)
            ->assertJsonPath('points.reason', 'already_awarded');

        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
    }

    public function test_a_reopened_cancellation_may_tell_the_client_and_a_reopened_no_show_tells_nobody(): void
    {
        $this->setClientMessages(true);
        $cancelled = $this->seedBooking(['status' => 'cancelled', 'cancelled_at' => now(), 'customer_email' => 'sophie@example.test']);
        $this->act($cancelled, 'reopen', ['notify_client' => true])->assertOk()->assertJsonPath('client_message.kind', 'confirmed');

        $noShow = $this->seedBooking(['status' => 'no_show', 'customer_email' => 'sophie@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $this->act($noShow, 'reopen', ['notify_client' => true])->assertOk()->assertJsonPath('client_message', null);
    }

    public function test_the_actions_list_offers_reopen_and_asks_about_the_client_only_for_a_cancellation(): void
    {
        $for = fn (array $attrs) => collect(app(AppointmentActions::class)->for($this->seedBooking($attrs)))->keyBy('key');

        $cancelled = $for(['status' => 'cancelled'])['reopen'];
        $this->assertTrue($cancelled['allowed']);
        $this->assertSame('ask', $cancelled['consequences']['message']);

        $completed = $for(['status' => 'completed', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00'])['reopen'];
        $this->assertTrue($completed['allowed']);
        $this->assertSame('none', $completed['consequences']['message']);

        $this->assertFalse($for(['start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00'])['reopen']['allowed']);
    }
}
```

- [ ] **Step 2: Update the existing action tests** (Edit tool):
  - `AppointmentActionsTest::allowedByStatus`: `'completed' => ['completed', ['reopen']]`,
    `'cancelled' => ['cancelled', ['reopen']]`, `'no_show' => ['no_show', ['reopen']]`.
  - `AppointmentActionsTest::test_the_list_always_names_every_action_in_one_order`:
    `['confirm', 'start', 'complete', 'no_show', 'cancel', 'award_points', 'reopen', 'move']`.
  - `AppointmentActionEndpointTest::refused()` gains `'reopen a confirmed visit' => ['confirmed', 'reopen'],`.
  - `MoveAppointmentTest.php:60` → `->assertJsonCount(8, 'booking.actions'); // Part F: reopen`;
    `AppointmentPresenterTest.php:118` → `$this->assertCount(8, $detail['actions']); // Part F: reopen`.

- [ ] **Step 3: Run them.** `<t> tests/Feature/Appointments/ReopenTest.php tests/Feature/Appointments/AppointmentActionsTest.php tests/Feature/Appointments/AppointmentActionEndpointTest.php`
  - Expected: FAIL — `reopen` is not an action (422 `not_allowed` everywhere, the lists have seven entries).

- [ ] **Step 4: Implement the action** (Edit tool) in `app/Services/Appointments/AppointmentActions.php`:
  - In `FROM`, after `'award_points' => ['completed'],`:
    ```php
        // Part F: a visit closed by mistake goes back to confirmed (managers; the runner checks its time and its money).
        'reopen'             => ['completed', 'no_show', 'cancelled'],
    ```
  - In `consequences()`, the `'message'` line becomes:
    ```php
            // "ask": the screen offers "Tell the client by email" (Part D); a reopened cancellation is confirmed again.
            'message' => in_array($action, ['confirm', 'cancel'], true) || ($action === 'reopen' && (string) $b->status === 'cancelled') ? 'ask' : 'none',
    ```

- [ ] **Step 5: Implement the runner** (Edit tool) in `app/Services/Appointments/AppointmentActionRunner.php`:
  - Add `use App\Support\AdvisoryLock;`.
  - Replace
    ```php
        if ($refunds !== []) {
            SetupAccess::requireManager($actor);
        }
    ```
    with
    ```php
        // Refunds (Part E) and reopening (Part F) are managers' only.
        if ($refunds !== [] || $action === 'reopen') {
            SetupAccess::requireManager($actor);
        }
    ```
  - Change `$booking = DB::transaction(function () use (…) {` to `$work = function () use (…) {` and the closing
    `});` of that closure to `};`, then directly after it add:
    ```php
        // Reopen checks the person's own time: their `svcm:` lock first, then the row — StaffBookingWriter's order.
        $booking = $action === 'reopen'
            ? AdvisoryLock::transaction('svcm:' . (int) ServiceBooking::whereKey($id)->value('service_master_id'), $work)
            : DB::transaction($work);
    ```
  - Inside the closure, right after the `allowed()` check (`throw new AppointmentRefused('not_allowed', …)` block):
    ```php
            if ($action === 'reopen') {
                $this->assertReopenable($booking);
            }
    ```
  - After `$old = ['status' => …, 'payment_status' => …];` add:
    ```php
            if ($action === 'reopen') {
                $old['cancellation_reason'] = $booking->cancellation_reason;
            }
    ```
  - In the `$patch = match ($action) {` list, after the `'cancel' => …` arm:
    ```php
                'reopen'             => ['status' => 'confirmed', 'cancelled_at' => null, 'cancellation_reason' => null],
    ```
  - Add the method at the end of the class:
    ```php
    /**
     * Part F: a visit closed by mistake goes back only when no money went
     * back for it (the money summary would no longer tell the truth) and its
     * own time is still free of live appointments. Working hours and "a day
     * that has passed" are not checked: reopening restores a record.
     */
    private function assertReopenable(ServiceBooking $b): void
    {
        if (AppointmentMoney::summary($b)['paid_back'] > 0) {
            throw new AppointmentRefused('money_returned', 'Money was given back for this visit — book it again instead.', 422);
        }

        // MOVABLE is the scheduler's own set of statuses that take a person's time.
        $clash = ServiceBooking::where('service_master_id', $b->service_master_id)
            ->whereIn('status', AppointmentActions::MOVABLE)
            ->where('id', '!=', $b->id)
            ->where('start_at', '<', $b->end_at)
            ->where('end_at', '>', $b->start_at)
            ->exists();
        if ($clash) {
            throw new AppointmentRefused('slot_taken', 'That time is taken now — book the client again at another time.', 409);
        }
    }
    ```

- [ ] **Step 6: Implement the message** (Edit tool) in `BookingController::action`. Before the `try {`:
    ```php
        // Part F: reopening a cancelled visit may tell the client it is confirmed again (R6).
        $before = $data['action'] === 'reopen' ? ServiceBooking::whereKey($id)->value('status') : null;
    ```
    and replace `$kind = ['confirm' => 'confirmed', 'cancel' => 'cancelled'][$data['action']] ?? null;` with
    ```php
        $kind = match (true) {
            $data['action'] === 'confirm' => 'confirmed',
            $data['action'] === 'cancel' => 'cancelled',
            $data['action'] === 'reopen' && $before === 'cancelled' => 'confirmed',
            default => null,
        };
    ```

- [ ] **Step 7: Run it**, then the neighbours: the Step 3 command, then `<t> tests/Feature/Appointments tests/Feature/AdminAccess`.
  - Expected: PASS (11 new, the data set counting three); the rest as the baseline.

- [ ] **Step 8: Commit** "Let a manager reopen a visit closed by mistake":
  `git add app/Services/Appointments/AppointmentActions.php app/Services/Appointments/AppointmentActionRunner.php app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php tests/Feature/Appointments/ReopenTest.php tests/Feature/Appointments/AppointmentActionsTest.php tests/Feature/Appointments/AppointmentActionEndpointTest.php tests/Feature/Appointments/MoveAppointmentTest.php tests/Feature/Appointments/AppointmentPresenterTest.php`
  then `git commit -F <ws>/tools/commit-3.txt`.

---

### Task 4: Types, calls and words

**Files:**
- Modify: `frontend/src/appointments/lib/types.ts`, `frontend/src/appointments/lib/api.ts`,
  `frontend/src/appointments/lib/status.ts`
- Create: `<ws>/tools/add-partf-strings.cjs`
- Modify: `frontend/src/appointments/i18n/appointments.{en,ru,de,fr,es}.json` (by the script),
  `frontend/src/appointments/i18n/appointmentsLocales.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3's request and answer fields.
- Produces: `ActionKey` includes `'reopen'`; `AppointmentDetail.length_set_by_staff?: boolean`;
  `MoveBody { start; master_id; revision; notify_client?; length?; normal_length? }`; `appointmentsApi.move(id, MoveBody)`;
  `appointmentsApi.slots(serviceId, masterId, date, ignore?, length?)`; `LIVE: Status[]` and `isLive(status)` in
  `lib/status.ts`; every string key used by Tasks 5–9.

- [ ] **Step 1: Write the failing test.** In `appointmentsLocales.test.ts` `FAMILIES`:
  - `action` gains `'reopen'`; `history` gains `'reopen'`; `error` gains `'invalid_length', 'money_returned'`;
  - a new family: `'calendar.drag.reason': ['outside_hours', 'overlap', 'not_eligible', 'past_day'],`.

- [ ] **Step 2: Run it.** `cd frontend && npx vitest run src/appointments/i18n`
  - Expected: FAIL — the new keys are missing in all five bundles.

- [ ] **Step 3: The types and calls** (Edit tool).
  - `lib/types.ts`: `export type ActionKey = 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel' | 'award_points' | 'reopen' | 'move'`;
    `AppointmentDetail` gains `/** Part F: the booking keeps a length staff set. */ length_set_by_staff?: boolean`; add
    ```ts
    /** The move request (Part F: `length` sets the booking's own length, `normal_length` forgets it; neither keeps it). */
    export interface MoveBody { start: Wall; master_id: number; revision: string; notify_client?: boolean; length?: number; normal_length?: boolean }
    ```
  - `lib/api.ts`: `slots: (serviceId: number, masterId: number, date: DateKey, ignore?: number, length?: number): Promise<SlotsPayload> =>
    watched(api.get(\`${BASE}/slots\`, { params: { service_id: serviceId, master_id: masterId, date, ignore, length } })),`;
    `move: (id: number, body: MoveBody): Promise<{ booking: AppointmentDetail; client_message: ClientMessageInfo | null }> =>`
    (import `MoveBody`; the body of the call is unchanged).
  - `lib/status.ts`, after `coversSlot`:
    ```ts
    /** The statuses the scheduler counts as taking a person's time — and the ones staff may move (Part F). */
    export const LIVE: Status[] = ['pending', 'confirmed', 'in_progress']
    export const isLive = (status: Status): boolean => LIVE.includes(status)
    ```

- [ ] **Step 4: The words.** Write `<ws>/tools/add-partf-strings.cjs` with the Write tool:

```js
// node <ws>/tools/add-partf-strings.cjs — Part F's words in each workspace bundle. Run from the feature worktree root.
// Inserts into existing top-level blocks without reformatting the file; skips keys already there; verifies after.
const fs = require('fs')
const W = {
  en: {
    action: { reopen: 'Reopen' },
    history: { reopen: 'Reopened' },
    consequence: { reopen: 'The visit goes back to Confirmed at its own time. Points already earned stay.' },
    error: { invalid_length: 'Choose a length between 15 minutes and 8 hours, in 15-minute steps.', money_returned: 'Money was given back for this visit — book it again instead.' },
    panel: { length: 'Length', length_normal: 'Normal length', length_normal_minutes: 'Normal length ({{minutes}} min)', length_set: 'Length set by staff', length_min: '{{m}} min', length_h: '{{h}} h', length_h_min: '{{h}} h {{m}} min', reopen_staff: 'A manager can reopen it.' },
    calendar: {
      keys_hint: 'Use the arrow keys to move between times and people; Enter opens or books.',
      drag: { move_title: 'Move {{client}} to {{when}} with {{name}}?', resize_title: 'Make it {{from}}–{{to}}?', save: 'Save', cancel: 'Cancel', loading: 'Loading…',
        reason: { outside_hours: "Outside {{name}}'s hours", overlap: "Overlaps {{client}}'s appointment", not_eligible: "{{name}} doesn't do {{service}}", past_day: 'That day has passed' } },
    },
  },
  ru: {
    action: { reopen: 'Восстановить' },
    history: { reopen: 'Восстановлена' },
    consequence: { reopen: 'Визит снова станет подтверждённым на своё время. Уже начисленные баллы остаются.' },
    error: { invalid_length: 'Выберите длительность от 15 минут до 8 часов, с шагом 15 минут.', money_returned: 'За этот визит деньги уже вернули — запишите клиента заново.' },
    panel: { length: 'Длительность', length_normal: 'Обычная длительность', length_normal_minutes: 'Обычная длительность ({{minutes}} мин)', length_set: 'Длительность задана сотрудником', length_min: '{{m}} мин', length_h: '{{h}} ч', length_h_min: '{{h}} ч {{m}} мин', reopen_staff: 'Восстановить запись может менеджер.' },
    calendar: {
      keys_hint: 'Стрелки переходят между временем и сотрудниками; Enter открывает запись или создаёт новую.',
      drag: { move_title: 'Перенести {{client}} на {{when}} к {{name}}?', resize_title: 'Сделать {{from}}–{{to}}?', save: 'Сохранить', cancel: 'Отмена', loading: 'Загрузка…',
        reason: { outside_hours: 'Вне рабочего времени: {{name}}', overlap: 'Пересекается с записью: {{client}}', not_eligible: '{{name}} не выполняет услугу «{{service}}»', past_day: 'Этот день уже прошёл' } },
    },
  },
  de: {
    action: { reopen: 'Wieder öffnen' },
    history: { reopen: 'Wieder geöffnet' },
    consequence: { reopen: 'Der Termin wird zu seiner Zeit wieder bestätigt. Bereits vergebene Punkte bleiben.' },
    error: { invalid_length: 'Wählen Sie eine Dauer zwischen 15 Minuten und 8 Stunden, in 15-Minuten-Schritten.', money_returned: 'Für diesen Termin wurde Geld zurückgegeben — buchen Sie ihn neu.' },
    panel: { length: 'Dauer', length_normal: 'Normale Dauer', length_normal_minutes: 'Normale Dauer ({{minutes}} Min.)', length_set: 'Dauer vom Team festgelegt', length_min: '{{m}} Min.', length_h: '{{h}} Std.', length_h_min: '{{h}} Std. {{m}} Min.', reopen_staff: 'Eine Leitung kann ihn wieder öffnen.' },
    calendar: {
      keys_hint: 'Mit den Pfeiltasten zwischen Zeiten und Personen wechseln; Enter öffnet oder bucht.',
      drag: { move_title: '{{client}} auf {{when}} bei {{name}} verschieben?', resize_title: 'Auf {{from}}–{{to}} ändern?', save: 'Speichern', cancel: 'Abbrechen', loading: 'Wird geladen…',
        reason: { outside_hours: 'Außerhalb der Zeiten von {{name}}', overlap: 'Überschneidet sich mit dem Termin von {{client}}', not_eligible: '{{name}} bietet {{service}} nicht an', past_day: 'Dieser Tag ist vorbei' } },
    },
  },
  fr: {
    action: { reopen: 'Rouvrir' },
    history: { reopen: 'Rouvert' },
    consequence: { reopen: 'Le rendez-vous redevient confirmé à son horaire. Les points déjà gagnés restent.' },
    error: { invalid_length: 'Choisissez une durée entre 15 minutes et 8 heures, par pas de 15 minutes.', money_returned: "De l'argent a été rendu pour ce rendez-vous — réservez-le à nouveau." },
    panel: { length: 'Durée', length_normal: 'Durée normale', length_normal_minutes: 'Durée normale ({{minutes}} min)', length_set: "Durée fixée par l'équipe", length_min: '{{m}} min', length_h: '{{h}} h', length_h_min: '{{h}} h {{m}} min', reopen_staff: 'Un responsable peut le rouvrir.' },
    calendar: {
      keys_hint: "Les flèches passent d'un horaire et d'une personne à l'autre ; Entrée ouvre ou réserve.",
      drag: { move_title: 'Déplacer {{client}} au {{when}} avec {{name}} ?', resize_title: 'Passer à {{from}}–{{to}} ?', save: 'Enregistrer', cancel: 'Annuler', loading: 'Chargement…',
        reason: { outside_hours: 'Hors des horaires de {{name}}', overlap: 'Chevauche le rendez-vous de {{client}}', not_eligible: '{{name}} ne fait pas {{service}}', past_day: 'Ce jour est passé' } },
    },
  },
  es: {
    action: { reopen: 'Reabrir' },
    history: { reopen: 'Reabierta' },
    consequence: { reopen: 'La cita vuelve a quedar confirmada a su hora. Los puntos ya ganados se mantienen.' },
    error: { invalid_length: 'Elija una duración de 15 minutos a 8 horas, en pasos de 15 minutos.', money_returned: 'Se devolvió dinero por esta cita — resérvela de nuevo.' },
    panel: { length: 'Duración', length_normal: 'Duración normal', length_normal_minutes: 'Duración normal ({{minutes}} min)', length_set: 'Duración fijada por el equipo', length_min: '{{m}} min', length_h: '{{h}} h', length_h_min: '{{h}} h {{m}} min', reopen_staff: 'Un responsable puede reabrirla.' },
    calendar: {
      keys_hint: 'Las flechas pasan entre horas y personas; Intro abre o reserva.',
      drag: { move_title: '¿Mover a {{client}} al {{when}} con {{name}}?', resize_title: '¿Dejarla en {{from}}–{{to}}?', save: 'Guardar', cancel: 'Cancelar', loading: 'Cargando…',
        reason: { outside_hours: 'Fuera del horario de {{name}}', overlap: 'Se solapa con la cita de {{client}}', not_eligible: '{{name}} no hace {{service}}', past_day: 'Ese día ya pasó' } },
    },
  },
}

/** Indent every line after the first by `n` spaces (a value stringified with 2-space indents, placed at depth 2). */
const indent = (text, n) => text.split('\n').map((line, i) => (i === 0 ? line : ' '.repeat(n) + line)).join('\n')

for (const [lang, blocks] of Object.entries(W)) {
  const file = `frontend/src/appointments/i18n/appointments.${lang}.json`
  let raw = fs.readFileSync(file, 'utf8')
  for (const [block, entries] of Object.entries(blocks)) {
    const head = raw.match(new RegExp(`\\n  "${block}": \\{\\n`))
    if (!head) throw new Error(`${file}: the "${block}" block is not where it was`)
    const existing = JSON.parse(raw)[block] ?? {}
    const lines = Object.entries(entries)
      .filter(([key]) => existing[key] === undefined)
      .map(([key, value]) => `    ${JSON.stringify(key)}: ${indent(JSON.stringify(value, null, 2), 4)},\n`)
    raw = raw.replace(head[0], head[0] + lines.join(''))
  }
  const after = JSON.parse(raw)
  for (const [block, entries] of Object.entries(blocks)) {
    for (const key of Object.keys(entries)) {
      if (JSON.stringify(after[block][key]) !== JSON.stringify(entries[key])) throw new Error(`${file}: ${block}.${key} not inserted`)
    }
  }
  fs.writeFileSync(file, raw)
  console.log(`${file}: Part F words added`)
}
```

  Run `node <ws>/tools/add-partf-strings.cjs`, then `git diff --stat -- frontend/src/appointments/i18n` (five files,
  insertions only).

- [ ] **Step 5: Run it.** `cd frontend && npx tsc -b && npx vitest run src/appointments/i18n src/i18n`
  - Expected: PASS; tsc 0 (no caller passes the new fields yet).

- [ ] **Step 6: Commit** "Add Part F's types, calls and words in five languages":
  `git add frontend/src/appointments/lib/types.ts frontend/src/appointments/lib/api.ts frontend/src/appointments/lib/status.ts frontend/src/appointments/i18n/appointments.en.json frontend/src/appointments/i18n/appointments.ru.json frontend/src/appointments/i18n/appointments.de.json frontend/src/appointments/i18n/appointments.fr.json frontend/src/appointments/i18n/appointments.es.json frontend/src/appointments/i18n/appointmentsLocales.test.ts`
  then `git commit -F <ws>/tools/commit-4.txt`.

---

### Task 5: Length in the Move form

**Files:**
- Create: `frontend/src/appointments/panel/lengths.ts`
- Modify: `frontend/src/appointments/panel/MoveForm.tsx`, `frontend/src/appointments/panel/AppointmentPanel.tsx`
  (`move`), `frontend/src/appointments/panel/AppointmentView.tsx` (the When row)
- Test: `frontend/src/appointments/panel/moveLength.test.tsx` (new)

**Interfaces:**
- Consumes: Task 4's `MoveBody`, `slots(…, length)`, `length_set_by_staff`.
- Produces: `lengthChoices(): number[]`; `lengthLabel(minutes): { key; fallback; vars }`;
  `type LengthChoice = number | 'normal'`; `lengthBody(choice, setByStaff): { length?: number; normal_length?: boolean }`;
  `MoveForm`'s `onMove(start: Wall, masterId: number, length: { length?: number; normal_length?: boolean })`.

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/panel/moveLength.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AppointmentDetail } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/vocab', () => ({ useVocab: () => (k: string) => k }))
vi.mock('react-router-dom', () => ({ Link: ({ to, children }: { to: string; children: unknown }) => <a href={to}>{children as never}</a> }))

const { MoveForm } = await import('./MoveForm')
const { AppointmentView } = await import('./AppointmentView')
const { lengthBody, lengthChoices, lengthLabel } = await import('./lengths')

const booking = {
  id: 3, reference: 'SVC-3', start: '2026-10-06T10:00', end: '2026-10-06T11:30', duration_minutes: 90, length_set_by_staff: true,
  service: { id: 1, name: 'Massage' }, master: { id: 1, name: 'Mara' },
  client: { id: 5, name: 'Sophie', phone: null, email: null, member: null }, client_email: null, status: 'confirmed', revision: 'r',
  payment: { state: 'not_paid_online', raw: 'unpaid', amount: 60, refunded_amount: null, carries_card_payment: false, currency: 'EUR' },
  price: { total: 60, list: null, discount_label: null, currency: 'EUR' }, source: 'admin', notes: { customer: null, staff: null },
  actions: [], loyalty: null, history: [],
} as unknown as AppointmentDetail

describe('lengths', () => {
  it('offers 15 minutes to 8 hours in 15-minute steps', () => {
    const choices = lengthChoices()
    expect(choices[0]).toBe(15)
    expect(choices[choices.length - 1]).toBe(480)
    expect(choices).toHaveLength(32)
  })

  it('words a length in minutes, hours, or both', () => {
    expect(lengthLabel(45)).toMatchObject({ key: 'appointments.panel.length_min', vars: { m: 45 } })
    expect(lengthLabel(60)).toMatchObject({ key: 'appointments.panel.length_h', vars: { h: 1 } })
    expect(lengthLabel(90)).toMatchObject({ key: 'appointments.panel.length_h_min', vars: { h: 1, m: 30 } })
  })

  it('sends a length, forgets the staff one, or keeps it', () => {
    expect(lengthBody(90, false)).toEqual({ length: 90 })
    expect(lengthBody('normal', true)).toEqual({ normal_length: true })
    expect(lengthBody('normal', false)).toEqual({})
  })
})

describe('the Move form and the panel', () => {
  it('starts the Length field at the length staff set', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MoveForm booking={booking} masters={[{ id: 1, name: 'Mara', title: null, avatar: null, days: {} }]}
          services={[{ id: 1, name: 'Massage', duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', master_ids: [1] }]}
          today="2026-10-05" saving={false} error={null} tell={false} onTell={() => {}} onMove={() => {}} onBack={() => {}} />
      </QueryClientProvider>,
    )
    expect(html).toContain('Length')
    expect(html).toContain('Normal length')
    expect(html).toMatch(/<option value="90" selected="">1 h 30 min<\/option>/)
  })

  it('says when the length was set by staff', () => {
    const view = (b: AppointmentDetail) => renderToStaticMarkup(
      <AppointmentView booking={b} zone="Europe/London" locale="en-GB" saving={false} error={null} outcome={null} onAction={() => {}} />,
    )
    expect(view(booking)).toContain('Length set by staff')
    expect(view({ ...booking, length_set_by_staff: false })).not.toContain('Length set by staff')
  })
})
```

- [ ] **Step 2: Run it.** `cd frontend && npx vitest run src/appointments/panel/moveLength.test.tsx`
  - Expected: FAIL — `./lengths` does not exist.

- [ ] **Step 3: Implement** `frontend/src/appointments/panel/lengths.ts` (Write tool):

```ts
/** The lengths staff may set for one appointment (Part F): 15 minutes to 8 hours, in 15-minute steps — the server's own rule. */
export const LENGTH_STEP = 15
export const LENGTH_MAX = 480

export function lengthChoices(): number[] {
  return Array.from({ length: LENGTH_MAX / LENGTH_STEP }, (_, i) => (i + 1) * LENGTH_STEP)
}

/** "45 min", "1 h", "1 h 30 min" — the key, its English fallback and its values. */
export function lengthLabel(minutes: number): { key: string; fallback: string; vars: Record<string, number> } {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return { key: 'appointments.panel.length_min', fallback: '{{m}} min', vars: { m } }
  if (m === 0) return { key: 'appointments.panel.length_h', fallback: '{{h}} h', vars: { h } }
  return { key: 'appointments.panel.length_h_min', fallback: '{{h}} h {{m}} min', vars: { h, m } }
}

/** A chosen length, or the person's normal one. */
export type LengthChoice = number | 'normal'

/** What the move request carries: a length; `normal_length` to forget the staff-set one; nothing to keep it. */
export function lengthBody(choice: LengthChoice, setByStaff: boolean): { length?: number; normal_length?: boolean } {
  if (choice === 'normal') return setByStaff ? { normal_length: true } : {}
  return { length: choice }
}
```

- [ ] **Step 4: The Move form** (Edit tool) in `MoveForm.tsx`:
  - Imports: add `import { lengthBody, lengthChoices, lengthLabel, type LengthChoice } from './lengths'`.
  - Props: `onMove: (start: Wall, masterId: number, length: { length?: number; normal_length?: boolean }) => void`.
  - The docblock's "the ordinary-edit way to reschedule (there is no drag in this milestone)" becomes "the
    click-only way to reschedule and to change the length (Part F's drag does the same through the same request)".
  - After the `start` state:
    ```tsx
      // Part F: the length the moved appointment will have; it starts at the staff-set length, if any.
      const [length, setLength] = useState<LengthChoice>(booking.length_set_by_staff ? booking.duration_minutes : 'normal')
      const lengthParam = length === 'normal' ? undefined : length
    ```
  - The slots query key gains `lengthParam` (after `booking.id`) and its `queryFn` passes it:
    `appointmentsApi.slots(booking.service!.id, masterId!, date, booking.id, lengthParam)`.
  - After the team-member `Field`, before the Time `Field`:
    ```tsx
      <Field label={t('appointments.panel.length', 'Length')}>
        <select className={control} value={String(length)} onChange={(e) => { setLength(e.target.value === 'normal' ? 'normal' : Number(e.target.value)); setStart('') }}>
          <option value="normal">{slots.data
            ? t('appointments.panel.length_normal_minutes', 'Normal length ({{minutes}} min)', { minutes: slots.data.duration_minutes })
            : t('appointments.panel.length_normal', 'Normal length')}</option>
          {lengthChoices().map(n => { const l = lengthLabel(n); return <option key={n} value={n}>{t(l.key, l.fallback, l.vars)}</option> })}
        </select>
      </Field>
    ```
  - The form's `onSubmit` calls `onMove(chosen.start, masterId, lengthBody(length, booking.length_set_by_staff ?? false))`.

- [ ] **Step 5: The panel and the view** (Edit tool).
  - `AppointmentPanel.tsx`: `const move = async (start: Wall, masterId: number, length: { length?: number; normal_length?: boolean }) => {`
    and the call `appointmentsApi.move(booking.id, { start, master_id: masterId, revision: booking.revision, notify_client: tell, ...length })`;
    the MoveForm prop `onMove={(start, masterId, length) => { void move(start, masterId, length) }}`.
  - `AppointmentView.tsx`, the When row's `<dd>` gets, after its text:
    `{b.length_set_by_staff && <span className="block text-xs font-normal text-a-text-2">{t('appointments.panel.length_set', 'Length set by staff')}</span>}`.

- [ ] **Step 6: Run it.** `cd frontend && npx tsc -b && npx vitest run src/appointments`
  - Expected: PASS (5 new); tsc 0.

- [ ] **Step 7: Commit** "Add a Length field to the Move form":
  `git add frontend/src/appointments/panel/lengths.ts frontend/src/appointments/panel/MoveForm.tsx frontend/src/appointments/panel/AppointmentPanel.tsx frontend/src/appointments/panel/AppointmentView.tsx frontend/src/appointments/panel/moveLength.test.tsx`
  then `git commit -F <ws>/tools/commit-5.txt`.

---

### Task 6: Reopen in the panel

**Files:**
- Modify: `frontend/src/appointments/panel/consequences.ts`, `ActionConfirm.tsx`, `AppointmentView.tsx`,
  `AppointmentPanel.tsx` (`act`)
- Test: `frontend/src/appointments/panel/reopen.test.tsx` (new); update `consequences.test.ts:65`

**Interfaces:**
- Consumes: Task 3's `reopen` action and its `message` consequence; Task 4's words.
- Produces: `NEEDS_CONFIRM` includes `'reopen'`; the Reopen button for managers, the staff line otherwise.

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/panel/reopen.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ActionInfo, ActionKey, AppointmentDetail } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('react-router-dom', () => ({ Link: ({ to, children }: { to: string; children: unknown }) => <a href={to}>{children as never}</a> }))

const { AppointmentView } = await import('./AppointmentView')
const { ActionConfirm } = await import('./ActionConfirm')
const { NEEDS_CONFIRM, consequenceLines } = await import('./consequences')

const NONE = { payment: 'none', points: null, coupon: 'none', message: 'none' } as const
const act = (key: ActionKey, allowed: boolean, c: Partial<ActionInfo['consequences']> = {}): ActionInfo => ({ key, allowed, consequences: { ...NONE, ...c } })

const booking = {
  id: 7, reference: 'SVC-7', start: '2026-10-06T10:00', end: '2026-10-06T10:45', duration_minutes: 45,
  service: { id: 1, name: 'Massage' }, master: { id: 1, name: 'Mara' },
  client: { id: 5, name: 'Sophie', phone: null, email: null, member: null }, status: 'cancelled', revision: 'r',
  payment: { state: 'not_paid_online', raw: 'unpaid', amount: 60, refunded_amount: null, carries_card_payment: false, currency: 'EUR' },
  price: { total: 60, list: null, discount_label: null, currency: 'EUR' }, source: 'admin', notes: { customer: null, staff: null },
  actions: [act('reopen', true, { message: 'ask' }), act('move', false)], loyalty: null, history: [],
} as unknown as AppointmentDetail

const view = (canManage: boolean) => renderToStaticMarkup(
  <AppointmentView booking={booking} zone="Europe/London" locale="en-GB" saving={false} error={null} outcome={null} onAction={() => {}} canManage={canManage} />,
)
const confirm = (action: ActionInfo) => renderToStaticMarkup(
  <ActionConfirm booking={booking} action={action} reason="" saving={false} error={null} tell onTell={() => {}} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />,
)

describe('Reopen', () => {
  it('is a button for a manager and a line for everyone else', () => {
    expect(view(true)).toContain('>Reopen<')
    expect(view(false)).not.toContain('>Reopen<')
    expect(view(false)).toContain('A manager can reopen it.')
  })

  it('is confirmed first, says what it does, and asks about the client only for a cancellation', () => {
    expect(NEEDS_CONFIRM.has('reopen')).toBe(true)
    const asks = confirm(act('reopen', true, { message: 'ask' }))
    expect(asks).toContain('The visit goes back to Confirmed at its own time.')
    expect(asks).toContain('No email address') // the box, for a client with no address
    const quiet = confirm(act('reopen', true))
    expect(quiet).toContain('No message is sent to the client.')
    expect(quiet).not.toContain('No email address')
    expect(consequenceLines(act('reopen', true)).map(l => l.key)).toContain('appointments.consequence.reopen')
  })
})
```

  And in `consequences.test.ts:65`: `['cancel', 'complete', 'confirm', 'no_show', 'reopen']`.

- [ ] **Step 2: Run it.** `cd frontend && npx vitest run src/appointments/panel/reopen.test.tsx src/appointments/panel/consequences.test.ts`
  - Expected: FAIL — no Reopen button, `reopen` not in `NEEDS_CONFIRM`, no reopen line.

- [ ] **Step 3: Implement** (Edit tool).
  - `consequences.ts`: `NEEDS_CONFIRM` gains `'reopen'`. In `consequenceLines`, before the `no_show` message block:
    ```ts
      if (action.key === 'reopen') {
        lines.push({ key: 'appointments.consequence.reopen', fallback: 'The visit goes back to Confirmed at its own time. Points already earned stay.', tone: 'plain' })
      }
    ```
    and the message block's condition becomes
    `if (action.key === 'no_show' || (action.key === 'reopen' && action.consequences.message === 'none')) {`
    (its comment: "A no-show and a reopened completed or no-show visit tell nobody; the others ask (Part D, R8).").
  - `ActionConfirm.tsx`: `TITLE` gains `reopen: ['appointments.action.reopen', 'Reopen'],`; the TellClient line's
    condition becomes `action.consequences.message === 'ask'` (R8).
  - `AppointmentView.tsx`: `labels` gains `['reopen', t('appointments.action.reopen', 'Reopen'), 'secondary'],` after
    `award_points`; `offered` becomes
    `labels.filter(([key]) => allowed(key) && (key !== 'reopen' || canManage))`; after the buttons' `div` add
    `{allowed('reopen') && !canManage && <p className="text-sm text-a-text-2">{t('appointments.panel.reopen_staff', 'A manager can reopen it.')}</p>}`.
  - `AppointmentPanel.tsx` `act`: `const asks = action === 'confirm' || action === 'cancel'` becomes
    `const asks = booking.actions.find(a => a.key === action)?.consequences.message === 'ask'` (R8).

- [ ] **Step 4: Run it.** `cd frontend && npx tsc -b && npx vitest run src/appointments`
  - Expected: PASS (2 new); tsc 0.

- [ ] **Step 5: Commit** "Offer Reopen to managers in the appointment panel":
  `git add frontend/src/appointments/panel/consequences.ts frontend/src/appointments/panel/consequences.test.ts frontend/src/appointments/panel/ActionConfirm.tsx frontend/src/appointments/panel/AppointmentView.tsx frontend/src/appointments/panel/AppointmentPanel.tsx frontend/src/appointments/panel/reopen.test.tsx`
  then `git commit -F <ws>/tools/commit-6.txt`.

---

### Task 7: The drag maths

**Files:**
- Create: `frontend/src/appointments/calendar/dragMath.ts`
- Test: `frontend/src/appointments/calendar/dragMath.test.ts` (new)

**Interfaces:**
- Consumes: `PX_PER_MIN` (`lib/layout`), `isLive` (Task 4), `minutesOf`, `wallMinutes`, `dateOf` (`lib/wallClock`).
- Produces: `DRAG_STEP`, `MIN_LENGTH`, `MAX_LENGTH`, `LONG_PRESS_MS`, `TOUCH_SLOP_PX`; `rawMinuteAt(offsetPx, startMin)`;
  `columnAt(x, boxes)`; `movedStart(pointerMinute, grabMinutes, length)`; `resizedLength(start, pointerMinute)`;
  `type DropReason`; `interface Why { reason; other? }`; `REASON_FALLBACK`; `whyNot(check): Why | null`;
  `touchStartsDrag(heldMs, movedPx)`; `pointerStartsDrag(movedPx)`; `onRelease(place, from): 'none' | 'confirm'`;
  `edgeScroll(pointer, box): [dx, dy]`.

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/calendar/dragMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AppointmentSummary, MasterDay, Status } from '../lib/types'
import {
  columnAt, edgeScroll, movedStart, onRelease, pointerStartsDrag, rawMinuteAt, resizedLength, touchStartsDrag, whyNot,
} from './dragMath'

const day: MasterDay = { windows: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '17:00' }], time_off: [] }
const appt = (id: number, start: string, end: string, status: Status = 'confirmed'): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end, duration_minutes: 45, service: { id: 1, name: 'Balayage' }, master: { id: 1, name: 'Emma' },
  client: { id: 5, name: 'Tom', is_member: false }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})
const base = { date: '2026-10-06', start: 600, end: 645, masterId: 1, day, serviceMasterIds: [1], others: [] as AppointmentSummary[], today: '2026-10-06' }

describe('drag maths', () => {
  it('turns a pointer into a snapped start, kept inside the day', () => {
    expect(rawMinuteAt(72, 480)).toBe(540) // 72 px at 1.2 px a minute
    expect(movedStart(605, 0, 45)).toBe(600)
    expect(movedStart(10, 30, 45)).toBe(0)
    expect(movedStart(1430, 0, 45)).toBe(1395)
  })

  it('stretches in 15-minute steps, from 15 minutes to 8 hours, never past midnight', () => {
    expect(resizedLength(600, 691)).toBe(90)
    expect(resizedLength(600, 605)).toBe(15)
    expect(resizedLength(600, 1200)).toBe(480)
    expect(resizedLength(1380, 1500)).toBe(60)
  })

  it('finds the column under the pointer', () => {
    const boxes = [{ left: 56, right: 224 }, { left: 224, right: 392 }]
    expect(columnAt(250, boxes)).toBe(1)
    expect(columnAt(10, boxes)).toBe(-1)
  })

  it('says why a place will not do: a past day, the wrong person, outside the hours, an overlap', () => {
    expect(whyNot({ ...base, date: '2026-10-05' })?.reason).toBe('past_day')
    expect(whyNot({ ...base, serviceMasterIds: [2] })?.reason).toBe('not_eligible')
    expect(whyNot({ ...base, start: 750, end: 795 })?.reason).toBe('outside_hours') // 12:30–13:15 crosses lunch
    const tom = appt(9, '2026-10-06T10:30', '2026-10-06T11:15')
    expect(whyNot({ ...base, others: [tom] })).toEqual({ reason: 'overlap', other: tom })
    expect(whyNot(base)).toBeNull()
  })

  it('counts only what the scheduler counts: a completed or cancelled visit does not block (R3)', () => {
    expect(whyNot({ ...base, others: [appt(9, '2026-10-06T10:30', '2026-10-06T11:15', 'completed')] })).toBeNull()
    expect(whyNot({ ...base, others: [appt(9, '2026-10-06T10:30', '2026-10-06T11:15', 'cancelled')] })).toBeNull()
  })

  it('accepts a drop that ends at midnight in a window that ends at 24:00 (Review Focus 3)', () => {
    const late: MasterDay = { windows: [{ start: '18:00', end: '24:00' }], time_off: [] }
    expect(whyNot({ ...base, day: late, start: 1380, end: 1440 })).toBeNull()
  })

  it('starts a touch drag only after a still press, and a mouse drag after a few pixels (Review Focus 2)', () => {
    expect(touchStartsDrag(450, 3)).toBe(true)
    expect(touchStartsDrag(450, 12)).toBe(false) // a swipe: the page scrolls
    expect(touchStartsDrag(200, 0)).toBe(false)
    expect(pointerStartsDrag(3)).toBe(false) // a click
    expect(pointerStartsDrag(4)).toBe(true)
  })

  it('sends nothing for a release at the card\'s own place or over a place that will not do (Review Focus 1)', () => {
    const from = { colIndex: 0, start: 600, length: 45 }
    expect(onRelease({ ...from, why: null }, from)).toBe('none')
    expect(onRelease({ ...from, start: 660, why: { reason: 'overlap' } }, from)).toBe('none')
    expect(onRelease({ ...from, colIndex: -1, start: 660, why: null }, from)).toBe('none')
    expect(onRelease({ ...from, start: 660, why: null }, from)).toBe('confirm')
    expect(onRelease({ ...from, length: 90, why: null }, from)).toBe('confirm')
  })

  it('scrolls the calendar when the pointer nears its edges', () => {
    const box = { top: 100, bottom: 700, left: 0, right: 1000 }
    expect(edgeScroll({ x: 500, y: 690 }, box)).toEqual([0, 12])
    expect(edgeScroll({ x: 10, y: 400 }, box)).toEqual([-12, 0])
    expect(edgeScroll({ x: 500, y: 400 }, box)).toEqual([0, 0])
  })
})
```

- [ ] **Step 2: Run it.** `cd frontend && npx vitest run src/appointments/calendar/dragMath.test.ts`
  - Expected: FAIL — `./dragMath` does not exist.

- [ ] **Step 3: Implement** `frontend/src/appointments/calendar/dragMath.ts` (Write tool):

```ts
import { PX_PER_MIN } from '../lib/layout'
import { isLive } from '../lib/status'
import type { AppointmentSummary, DateKey, MasterDay } from '../lib/types'
import { dateOf, minutesOf, wallMinutes } from '../lib/wallClock'

/** Drags snap to 15 minutes; a length is 15 minutes to 8 hours — the server's own rule (StaffBookingWriter). */
export const DRAG_STEP = 15
export const MIN_LENGTH = 15
export const MAX_LENGTH = 480
/** A mouse or pen press becomes a drag after this many pixels; a touch press after being held this long, this still. */
export const DRAG_THRESHOLD_PX = 4
export const LONG_PRESS_MS = 400
export const TOUCH_SLOP_PX = 8
/** Near the calendar's edges, a drag scrolls it by this much a frame. */
export const EDGE_PX = 40
export const EDGE_SPEED = 12

/** The (unsnapped) minute of the day at `offsetPx` below the top of a column whose first hour is `startMin`. */
export const rawMinuteAt = (offsetPx: number, startMin: number): number => startMin + offsetPx / PX_PER_MIN

/** The column whose [left, right) holds `x`; -1 outside every column. */
export function columnAt(x: number, boxes: { left: number; right: number }[]): number {
  return boxes.findIndex(b => x >= b.left && x < b.right)
}

/** Where a moved card starts: the pointer's minute less where the card was grabbed, snapped, kept inside the day. */
export function movedStart(pointerMinute: number, grabMinutes: number, length: number): number {
  const start = Math.round((pointerMinute - grabMinutes) / DRAG_STEP) * DRAG_STEP
  return Math.min(Math.max(start, 0), 1440 - length)
}

/** The length a bottom-edge drag gives: the start stays, the end snaps; 15 minutes to 8 hours, never past midnight. */
export function resizedLength(start: number, pointerMinute: number): number {
  const raw = Math.round((pointerMinute - start) / DRAG_STEP) * DRAG_STEP
  return Math.min(MAX_LENGTH, 1440 - start, Math.max(MIN_LENGTH, raw))
}

export type DropReason = 'past_day' | 'not_eligible' | 'outside_hours' | 'overlap'
export interface Why { reason: DropReason; other?: AppointmentSummary }

export const REASON_FALLBACK: Record<DropReason, string> = {
  outside_hours: "Outside {{name}}'s hours",
  overlap: "Overlaps {{client}}'s appointment",
  not_eligible: "{{name}} doesn't do {{service}}",
  past_day: 'That day has passed',
}

export interface DropCheck {
  date: DateKey
  start: number
  end: number
  masterId: number
  day: MasterDay | undefined
  /** Who performs the appointment's service; null when the calendar does not know the service (no check). */
  serviceMasterIds: number[] | null
  /** The other appointments in the target column. */
  others: AppointmentSummary[]
  today: DateKey
}

const endOf = (a: AppointmentSummary): number => (dateOf(a.end) === dateOf(a.start) ? wallMinutes(a.end) : 1440)

/**
 * Why the calendar can already tell a place will not do — null when it may.
 * A convenience only: the server decides at Save. Order: the day, the person,
 * the hours (working windows already have time off taken out), an overlap
 * with a live appointment (R3: the scheduler's own set).
 */
export function whyNot(c: DropCheck): Why | null {
  if (c.date < c.today) return { reason: 'past_day' }
  if (c.serviceMasterIds !== null && !c.serviceMasterIds.includes(c.masterId)) return { reason: 'not_eligible' }
  const inside = (c.day?.windows ?? []).some(w => c.start >= minutesOf(w.start) && c.end <= minutesOf(w.end))
  if (!inside) return { reason: 'outside_hours' }
  const other = c.others.find(a => isLive(a.status) && dateOf(a.start) === c.date && c.start < endOf(a) && c.end > wallMinutes(a.start))
  return other ? { reason: 'overlap', other } : null
}

/** A touch press becomes a drag only when held still long enough; a swipe scrolls the page. */
export const touchStartsDrag = (heldMs: number, movedPx: number): boolean => heldMs >= LONG_PRESS_MS && movedPx <= TOUCH_SLOP_PX

/** A mouse or pen press becomes a drag once it moves a few pixels; less is a click. */
export const pointerStartsDrag = (movedPx: number): boolean => movedPx >= DRAG_THRESHOLD_PX

/** What a release does: nothing at the card's own place, outside every column, or over a place that will not do. */
export function onRelease(
  place: { colIndex: number; start: number; length: number; why: Why | null },
  from: { colIndex: number; start: number; length: number },
): 'none' | 'confirm' {
  if (place.colIndex < 0 || place.why !== null) return 'none'
  return place.colIndex === from.colIndex && place.start === from.start && place.length === from.length ? 'none' : 'confirm'
}

/** How far to scroll the calendar this frame when the pointer is near one of its edges. */
export function edgeScroll(p: { x: number; y: number }, box: { top: number; bottom: number; left: number; right: number }): [number, number] {
  const dx = p.x < box.left + EDGE_PX ? -EDGE_SPEED : p.x > box.right - EDGE_PX ? EDGE_SPEED : 0
  const dy = p.y < box.top + EDGE_PX ? -EDGE_SPEED : p.y > box.bottom - EDGE_PX ? EDGE_SPEED : 0
  return [dx, dy]
}
```

- [ ] **Step 4: Run it.** `cd frontend && npx tsc -b && npx vitest run src/appointments/calendar/dragMath.test.ts`
  - Expected: PASS (9); tsc 0.

- [ ] **Step 5: Commit** "Work out where a dragged appointment lands, and why not":
  `git add frontend/src/appointments/calendar/dragMath.ts frontend/src/appointments/calendar/dragMath.test.ts`
  then `git commit -F <ws>/tools/commit-7.txt`.

---

### Task 8: Drag and resize on the grid

**Files:**
- Create: `frontend/src/appointments/calendar/useCardDrag.ts`, `DragPreview.tsx`, `DropConfirm.tsx`
- Modify: `frontend/src/appointments/calendar/AppointmentCard.tsx`, `TimeGrid.tsx` (whole file below),
  `CalendarPage.tsx`
- Test: `frontend/src/appointments/calendar/dragDrop.test.tsx` (new)

**Interfaces:**
- Consumes: Task 7's maths; Task 4's `MoveBody`, `isLive`, words; `TellClient` (Part D); `failureOf`.
- Produces: `useCardDrag({ gridRef, startMin, check }) → { drag, begin, consumeClick, cancel }`;
  `DragState { kind: 'move' | 'resize'; origin: { appt; colIndex; start; length }; place: { colIndex; start; length; why }; phase: 'dragging' | 'confirming' }`;
  `DropTarget { start: Wall; masterId: number; length: number | null; notify: boolean }`; `TimeGrid` props
  `services?`, `locale?`, `tellDefault?`, `onDrop?(appointment, to): Promise<void>`; each grid column carries
  `data-col`, the scroll box `data-calendar-scroll`.

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/calendar/dragDrop.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppointmentSummary, CalendarMaster, Status } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { TimeGrid } = await import('./TimeGrid')
const { DragPreview } = await import('./DragPreview')
const { DropConfirm } = await import('./DropConfirm')
const { columnsFor } = await import('./calendarState')

const emma: CalendarMaster = { id: 1, name: 'Emma', title: null, avatar: null, days: { '2026-10-06': { windows: [{ start: '09:00', end: '17:00' }], time_off: [] } } }
const appt = (id: number, start: string, end: string, status: Status): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end, duration_minutes: 45, service: { id: 1, name: 'Haircut' }, master: { id: 1, name: 'Emma' },
  client: { id: 5, name: 'Sophie', is_member: false }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})
const grid = (appointments: AppointmentSummary[], onDrop?: () => Promise<void>) => renderToStaticMarkup(
  <TimeGrid columns={columnsFor('day', '2026-10-06', [emma], null, '2026-10-06', 'en-GB')} appointments={appointments}
    now={{ date: '2026-10-06', minutes: 600 }} today="2026-10-06" selectedId={null} onSlot={() => {}} onOpen={() => {}} onDrop={onDrop} />,
)

describe('drag and resize on the grid', () => {
  it('lets live cards be dragged and stretched, only when the grid can save a drop', () => {
    const cards = [appt(1, '2026-10-06T10:00', '2026-10-06T10:45', 'confirmed'), appt(2, '2026-10-06T12:00', '2026-10-06T12:45', 'completed')]
    const html = grid(cards, async () => {})
    expect(html.match(/data-drag="move"/g)).toHaveLength(1)
    expect(html.match(/data-resize=""/g)).toHaveLength(1)
    expect(html).toContain('data-col="0"')
    expect(grid(cards)).not.toContain('data-drag')
  })

  it('previews the new place and says why it will not do', () => {
    const html = renderToStaticMarkup(<DragPreview top={10} height={54} label="Tue 14:30–15:15 · Emma" why="Outside Emma's hours" />)
    expect(html).toContain('Tue 14:30–15:15 · Emma')
    expect(html).toContain('Outside Emma')
  })

  it('asks before saving, with the client box only for a move, and shows a refusal', () => {
    const base = { onTell: () => {}, saving: false, onSave: () => {}, onCancel: () => {} }
    const move = renderToStaticMarkup(<DropConfirm {...base} title="Move Sophie to Tue 6 Oct 14:30 with Emma?" tell={{ email: 'sophie@example.test', checked: true, loading: false }} error={null} />)
    expect(move).toContain('Move Sophie to Tue 6 Oct 14:30 with Emma?')
    expect(move).toContain('Tell the client by email (sophie@example.test)')
    expect(move).toContain('Save')
    expect(move).toContain('Cancel')
    const resize = renderToStaticMarkup(<DropConfirm {...base} title="Make it 10:00–11:30?" tell={null} error={null} />)
    expect(resize).not.toContain('Tell the client')
    const refused = renderToStaticMarkup(<DropConfirm {...base} title="Make it 10:00–11:30?" tell={null} error={{ code: 'slot_taken', message: 'That time is not free for Emma. Choose another.' }} />)
    expect(refused).toContain('That time is not free for Emma')
  })
})
```

- [ ] **Step 2: Run it.** `cd frontend && npx vitest run src/appointments/calendar/dragDrop.test.tsx`
  - Expected: FAIL — `./DragPreview` and `./DropConfirm` do not exist.

- [ ] **Step 3: The drag layer** — `frontend/src/appointments/calendar/useCardDrag.ts` (Write tool):

```ts
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { AppointmentSummary } from '../lib/types'
import {
  LONG_PRESS_MS, TOUCH_SLOP_PX, columnAt, edgeScroll, movedStart, onRelease, pointerStartsDrag, rawMinuteAt, resizedLength,
  touchStartsDrag, type Why,
} from './dragMath'

export type DragKind = 'move' | 'resize'
export interface DragOrigin { appt: AppointmentSummary; colIndex: number; start: number; length: number }
export interface DragPlace { colIndex: number; start: number; length: number; why: Why | null }
export interface DragState { kind: DragKind; origin: DragOrigin; place: DragPlace; phase: 'dragging' | 'confirming' }

interface Options {
  /** The row of columns; each column carries `data-col`, and the scroll box above it `data-calendar-scroll`. */
  gridRef: RefObject<HTMLDivElement | null>
  startMin: number
  /** Why a place will not do, as far as the calendar can tell (dragMath.whyNot). */
  check: (colIndex: number, start: number, length: number, appointmentId: number) => Why | null
}

/**
 * The calendar's own drag layer (Part F). A card follows a mouse, pen or
 * finger, snaps to 15 minutes and to the column under it, and on release
 * waits for a confirm. A touch drag starts with a still press, so a swipe
 * still scrolls; Escape cancels. Nothing here talks to the server.
 */
export function useCardDrag({ gridRef, startMin, check }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragged = useRef(false)

  const cancel = useCallback(() => setDrag(null), [])

  const begin = useCallback((e: ReactPointerEvent<HTMLElement>, kind: DragKind, origin: DragOrigin) => {
    if (e.button !== 0 || (kind === 'resize' && e.pointerType === 'touch')) return
    const grid = gridRef.current
    if (!grid) return
    const touch = e.pointerType === 'touch'
    const pointerId = e.pointerId
    const x0 = e.clientX
    const y0 = e.clientY
    const t0 = performance.now()
    const boxes = () => [...grid.querySelectorAll<HTMLElement>('[data-col]')].map(el => el.getBoundingClientRect())
    const grab = rawMinuteAt(y0 - (boxes()[origin.colIndex]?.top ?? 0), startMin) - origin.start
    const scroller = grid.closest<HTMLElement>('[data-calendar-scroll]')
    let active = false
    let x = x0
    let y = y0
    let raf = 0
    let place: DragPlace = { colIndex: origin.colIndex, start: origin.start, length: origin.length, why: null }

    const placeAt = (): DragPlace => {
      const rects = boxes()
      const colIndex = kind === 'resize' ? origin.colIndex : columnAt(x, rects)
      const top = rects[colIndex < 0 ? origin.colIndex : colIndex]?.top ?? 0
      const minute = rawMinuteAt(y - top, startMin)
      const start = kind === 'move' ? movedStart(minute, grab, origin.length) : origin.start
      const length = kind === 'resize' ? resizedLength(origin.start, minute) : origin.length
      return { colIndex, start, length, why: colIndex < 0 ? null : check(colIndex, start, length, origin.appt.id) }
    }
    const show = () => {
      place = placeAt()
      setDrag({ kind, origin, place, phase: 'dragging' })
    }
    const tick = () => {
      raf = 0
      if (!active || !scroller) return
      const [dx, dy] = edgeScroll({ x, y }, scroller.getBoundingClientRect())
      if (dx === 0 && dy === 0) return
      scroller.scrollBy(dx, dy)
      show()
      raf = requestAnimationFrame(tick)
    }

    function finish(release: boolean) {
      window.clearTimeout(timer)
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchmove', onTouchMove)
      if (!active) return
      dragged.current = true
      setDrag(release && onRelease(place, origin) === 'confirm' ? { kind, origin, place, phase: 'confirming' } : null)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      x = ev.clientX
      y = ev.clientY
      const moved = Math.hypot(x - x0, y - y0)
      if (!active) {
        if (touch) {
          if (moved > TOUCH_SLOP_PX) finish(false) // a swipe: let the page scroll
          return
        }
        if (!pointerStartsDrag(moved)) return
        active = true
      }
      show()
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(true) }
    const onCancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(false) }
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && active) { ev.preventDefault(); finish(false) } }
    // Once a touch drag has begun, the page must not scroll under the finger.
    const onTouchMove = (ev: TouchEvent) => { if (active) ev.preventDefault() }
    const timer = touch
      ? window.setTimeout(() => { if (touchStartsDrag(performance.now() - t0, Math.hypot(x - x0, y - y0))) { active = true; show() } }, LONG_PRESS_MS)
      : 0

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
  }, [gridRef, startMin, check])

  /** True once for the click that ends a drag: that click must not open the panel. */
  const consumeClick = useCallback(() => {
    const was = dragged.current
    dragged.current = false
    return was
  }, [])

  return { drag, begin, consumeClick, cancel }
}
```

- [ ] **Step 4: The preview and the confirm** (Write tool).

  `frontend/src/appointments/calendar/DragPreview.tsx`:

```tsx
/** Where a dragged card would land, and — in the danger colour — why it will not do. Pointer-only, so hidden from screen readers. */
export function DragPreview({ top, height, label, why }: { top: number; height: number; label: string; why: string | null }) {
  return (
    <div aria-hidden data-drag-preview=""
      className={`pointer-events-none absolute inset-x-1 z-30 overflow-hidden rounded-md border-2 border-dashed bg-a-surface px-2 py-1 text-xs font-semibold ${why ? 'border-a-danger text-a-danger' : 'border-a-accent text-a-accent-deep'}`}
      style={{ top, height }}>
      <div className="truncate">{label}</div>
      {why && <div className="font-normal">{why}</div>}
    </div>
  )
}
```

  `frontend/src/appointments/calendar/DropConfirm.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { appointmentsApi, failureOf } from '../lib/api'
import type { AppointmentSummary, Wall } from '../lib/types'
import { formatDate, hhmm, makeWall } from '../lib/wallClock'
import { TellClient } from '../panel/TellClient'
import type { PanelError } from '../panel/panelState'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import type { GridColumn } from './calendarState'
import type { DragState } from './useCardDrag'

/** What the calendar asks the server to do with a drop. `length` is set only by a resize; `notify` only by a move. */
export interface DropTarget { start: Wall; masterId: number; length: number | null; notify: boolean }

interface Props {
  title: string
  /** The "Tell the client" box (Part D) for a move; null for a resize, whose start does not change. */
  tell: { email: string | null; checked: boolean; loading: boolean } | null
  onTell: (checked: boolean) => void
  saving: boolean
  error: PanelError | null
  onSave: () => void
  onCancel: () => void
}

/** The small dialog a drop opens: what will change, the client box, Save and Cancel. Escape cancels. */
export function DropConfirm({ title, tell, onTell, saving, error, onSave, onCancel }: Props) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { box.current?.querySelector<HTMLElement>('button')?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div ref={box} role="dialog" aria-modal="false" aria-label={title} className="w-72 space-y-3 rounded-lg border border-a-border bg-a-surface p-3 text-left shadow-xl">
      <p className="text-sm font-semibold text-a-text">{title}</p>
      {tell && (tell.loading
        ? <p className="text-sm text-a-text-2" role="status">{t('appointments.calendar.drag.loading', 'Loading…')}</p>
        : <TellClient email={tell.email} checked={tell.checked} onChange={onTell} />)}
      {error && <Notice tone={error.code === 'stale' ? 'warning' : 'danger'}>{t(`appointments.error.${error.code}`, error.message)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" loading={saving} disabled={tell?.loading} onClick={onSave}>{t('appointments.calendar.drag.save', 'Save')}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>{t('appointments.calendar.drag.cancel', 'Cancel')}</Button>
      </div>
    </div>
  )
}

/**
 * A drop waiting for its Save: works out the question, reads the client's
 * address from the appointment's detail (cards carry no contact details, R4),
 * and saves through the calendar's `onDrop` with the card's own revision.
 */
export function PendingDrop({ top, drag, column, locale, tellDefault, onDrop, onDone }: {
  top: number
  drag: DragState
  column: GridColumn
  locale: string
  tellDefault: boolean
  onDrop: (appointment: AppointmentSummary, to: DropTarget) => Promise<void>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { kind, origin, place } = drag
  const moving = kind === 'move'
  const detail = useQuery({ queryKey: ['appointments', 'booking', origin.appt.id], queryFn: () => appointmentsApi.booking(origin.appt.id), enabled: moving })
  const [tell, setTell] = useState(tellDefault)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<PanelError | null>(null)

  const title = moving
    ? t('appointments.calendar.drag.move_title', 'Move {{client}} to {{when}} with {{name}}?', {
        client: origin.appt.client.name,
        when: `${formatDate(column.date, locale, { weekday: 'short', day: 'numeric', month: 'short' })} ${hhmm(place.start)}`,
        name: column.master.name,
      })
    : t('appointments.calendar.drag.resize_title', 'Make it {{from}}–{{to}}?', { from: hhmm(place.start), to: hhmm(place.start + place.length) })

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // R7: a resize never asks to tell the client.
      await onDrop(origin.appt, { start: makeWall(column.date, place.start), masterId: column.master.id, length: moving ? null : place.length, notify: moving && tell })
      onDone()
    } catch (e) {
      const failure = failureOf(e)
      setError({ code: failure.code, message: failure.message })
      setSaving(false)
    }
  }

  return (
    <div className="absolute left-1 z-40" style={{ top }}>
      <DropConfirm title={title}
        tell={moving ? { email: detail.data?.booking.client_email ?? null, checked: tell, loading: detail.isLoading } : null}
        onTell={setTell} saving={saving} error={error} onSave={() => { void save() }} onCancel={onDone} />
    </div>
  )
}
```

- [ ] **Step 5: The card** (Edit tool) in `AppointmentCard.tsx`:
  - Add `import type { PointerEvent as ReactPointerEvent } from 'react'`.
  - `Props` gains:
    ```ts
      /** Part F: the card can be dragged to move it and stretched by its bottom edge. */
      draggable?: boolean
      /** It is the card being dragged: outlined where it was. */
      lifted?: boolean
      onDragStart?: (e: ReactPointerEvent<HTMLElement>, kind: 'move' | 'resize') => void
    ```
    and the function destructures `draggable = false, lifted = false, onDragStart`.
  - The `<button>` gains `onPointerDown={draggable && onDragStart ? (e) => onDragStart(e, 'move') : undefined}`,
    `data-drag={draggable ? 'move' : undefined}`, `WebkitTouchCallout: draggable ? 'none' : undefined` in its `style`,
    and at the end of its `className`:
    `${draggable ? 'select-none touch-manipulation cursor-grab' : ''} ${lifted ? 'outline-dashed outline-2 outline-a-accent' : ''}`.
  - Inside the button, after the content, the resize handle:
    ```tsx
      {draggable && onDragStart && (
        <span aria-hidden data-resize="" className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
          onPointerDown={(e) => { e.stopPropagation(); onDragStart(e, 'resize') }} />
      )}
    ```

- [ ] **Step 6: The grid** — replace `frontend/src/appointments/calendar/TimeGrid.tsx` with (Write tool):

```tsx
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppointmentSummary, CatalogueService, DateKey } from '../lib/types'
import { PX_PER_MIN, freeSlotStarts, offHours, placeAppointments } from '../lib/layout'
import { coversSlot, isLive } from '../lib/status'
import { dateOf, formatDate, hhmm, minutesOf, wallMinutes } from '../lib/wallClock'
import { AppointmentCard } from './AppointmentCard'
import { DragPreview } from './DragPreview'
import { PendingDrop, type DropTarget } from './DropConfirm'
import { gridRange, type GridColumn } from './calendarState'
import { REASON_FALLBACK, whyNot, type Why } from './dragMath'
import { useCardDrag } from './useCardDrag'

interface Props {
  columns: GridColumn[]
  appointments: AppointmentSummary[]
  now: { date: DateKey; minutes: number }
  today: DateKey
  selectedId: number | null
  onSlot: (masterId: number, date: DateKey, minutes: number) => void
  onOpen: (id: number) => void
  /** Part F: who performs what (the drag's "doesn't do" check). */
  services?: CatalogueService[]
  locale?: string
  /** The venue's "Tell the client" default (Part D), for a drop's confirm. */
  tellDefault?: boolean
  /** Part F: saves a drop. Without it the grid is read-only. */
  onDrop?: (appointment: AppointmentSummary, to: DropTarget) => Promise<void>
}

const SLOT_STEP = 30

/**
 * Time down the left, a column per person (day) or per day (week). White is
 * working time, tinted is outside hours, hatched is time off. Free half
 * hours are real buttons with a name ("Book Emma at 10:30"), so booking
 * from a slot needs neither hover nor drag. Live cards can be dragged to
 * another time or person and stretched by their bottom edge (Part F); a
 * drop is confirmed before it is saved. Availability shown here is a
 * convenience: the server decides at save.
 */
export function TimeGrid({ columns, appointments, now, today, selectedId, onSlot, onOpen, services = [], locale = 'en', tellDefault = false, onDrop }: Props) {
  const { t } = useTranslation()
  const gridRef = useRef<HTMLDivElement>(null)
  const { startMin, endMin } = gridRange(columns, appointments)

  const check = useCallback((colIndex: number, start: number, length: number, id: number): Why | null => {
    const col = columns[colIndex]
    if (!col) return null
    const moved = appointments.find(a => a.id === id)
    const service = services.find(s => s.id === moved?.service?.id)
    return whyNot({
      date: col.date, start, end: start + length, masterId: col.master.id, day: col.master.days[col.date],
      serviceMasterIds: service ? service.master_ids : null, today,
      others: appointments.filter(a => a.id !== id && a.master?.id === col.master.id),
    })
  }, [columns, appointments, services, today])
  const { drag, begin, consumeClick, cancel } = useCardDrag({ gridRef, startMin, check })

  if (columns.length === 0) {
    return <p className="p-8 text-sm text-a-text-2">{t('appointments.calendar.no_team', 'No team members to show. Add team members and their working hours in the full admin.')}</p>
  }

  const height = (endMin - startMin) * PX_PER_MIN
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60)
  const cols = columns.map((col, i) => {
    const day = col.master.days[col.date]
    const own = appointments.filter(a => a.master?.id === col.master.id && dateOf(a.start) === col.date)
    const bookable = col.date >= today
    return {
      col, i, day, bookable,
      free: bookable ? freeSlotStarts(day, own.filter(a => coversSlot(a.status)), col.date, SLOT_STEP) : [],
      placed: placeAppointments(own, col.date, startMin),
    }
  })
  const placeLabel = (col: GridColumn, start: number, length: number) =>
    `${formatDate(col.date, locale, { weekday: 'short' })} ${hhmm(start)}–${hhmm(start + length)} · ${col.master.name}`
  const whyText = (why: Why, col: GridColumn, moved: AppointmentSummary) =>
    t(`appointments.calendar.drag.reason.${why.reason}`, REASON_FALLBACK[why.reason], { name: col.master.name, client: why.other?.client.name ?? '', service: moved.service?.name ?? '' })

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

      <div className="flex" ref={gridRef}>
        <div className="relative w-14 shrink-0" style={{ height }} aria-hidden>
          {hours.map(h => (
            <div key={h} className="absolute right-2 -translate-y-1/2 text-xs text-a-text-2" style={{ top: (h - startMin) * PX_PER_MIN }}>{h === startMin ? '' : hhmm(h)}</div>
          ))}
        </div>

        {cols.map(({ col, i, day, bookable, free, placed }) => {
          const showNow = col.date === now.date && now.minutes >= startMin && now.minutes <= endMin

          return (
            <div key={col.key} data-col={i} className="relative flex-1 min-w-[168px] border-l border-a-border bg-a-surface" style={{ height }}>
              {offHours(day, startMin, endMin).map(([from, to]) => (
                <div key={`off-${from}`} className="absolute inset-x-0 bg-a-surface-2" style={{ top: (from - startMin) * PX_PER_MIN, height: (to - from) * PX_PER_MIN }} />
              ))}

              {(day?.time_off ?? []).map((off, k) => {
                const from = off.start ? minutesOf(off.start) : startMin
                const to = off.end ? minutesOf(off.end) : endMin
                return (
                  <div key={`timeoff-${k}`} className="a-hatch absolute inset-x-0 px-2 py-1 text-xs font-medium text-a-text-2"
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

              {placed.map(p => {
                const movable = onDrop !== undefined && isLive(p.item.status)
                return (
                  <AppointmentCard key={p.item.id} placed={p} selected={p.item.id === selectedId}
                    gutter={bookable && !coversSlot(p.item.status)}
                    onOpen={(id) => { if (!consumeClick()) onOpen(id) }}
                    draggable={movable} lifted={drag?.origin.appt.id === p.item.id}
                    onDragStart={movable ? (e, kind) => begin(e, kind, { appt: p.item, colIndex: i, start: wallMinutes(p.item.start), length: p.item.duration_minutes }) : undefined} />
                )
              })}

              {drag && drag.place.colIndex === i && (
                <DragPreview top={(drag.place.start - startMin) * PX_PER_MIN} height={drag.place.length * PX_PER_MIN}
                  label={placeLabel(col, drag.place.start, drag.place.length)}
                  why={drag.place.why ? whyText(drag.place.why, col, drag.origin.appt) : null} />
              )}
              {drag && drag.phase === 'confirming' && drag.place.colIndex === i && onDrop && (
                <PendingDrop top={(drag.place.start + drag.place.length - startMin) * PX_PER_MIN + 4} drag={drag} column={col}
                  locale={locale} tellDefault={tellDefault} onDrop={onDrop} onDone={cancel} />
              )}

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

- [ ] **Step 7: The page** (Edit tool) in `CalendarPage.tsx`:
  - Imports: `useQueryClient` from `@tanstack/react-query`; `AppointmentSummary` (type) from `../lib/types`;
    `type DropTarget` from `./DropConfirm`.
  - After `const query = useQuery(…)`:
    ```tsx
      const queryClient = useQueryClient()
      // Part F: a drop saves through the same move call as the Move form, with the card's revision (R4).
      const dropAppointment = async (appointment: AppointmentSummary, to: DropTarget) => {
        try {
          await appointmentsApi.move(appointment.id, {
            start: to.start, master_id: to.masterId, revision: appointment.revision, notify_client: to.notify,
            ...(to.length !== null ? { length: to.length } : {}),
          })
        } finally {
          void queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] })
          void queryClient.invalidateQueries({ queryKey: ['appointments', 'booking', appointment.id] })
        }
      }
    ```
  - The scroll box `<div className="flex-1 min-h-0 overflow-auto">` gains `data-calendar-scroll=""`.
  - `<TimeGrid …>` gains `services={query.data?.services ?? []} locale={locale} tellDefault={boot.messages?.staff_default ?? false} onDrop={dropAppointment}`.

- [ ] **Step 8: Run it.** `cd frontend && npx tsc -b && npx vitest run src/appointments && npx eslint src/appointments/calendar`
  - Expected: PASS (3 new); the existing `calendar.test.tsx` and `calendarPage.test.tsx` unchanged; tsc 0; eslint 0.

- [ ] **Step 9: Commit** "Drag appointments to move them and stretch them in the calendar":
  `git add frontend/src/appointments/calendar/useCardDrag.ts frontend/src/appointments/calendar/DragPreview.tsx frontend/src/appointments/calendar/DropConfirm.tsx frontend/src/appointments/calendar/AppointmentCard.tsx frontend/src/appointments/calendar/TimeGrid.tsx frontend/src/appointments/calendar/CalendarPage.tsx frontend/src/appointments/calendar/dragDrop.test.tsx`
  then `git commit -F <ws>/tools/commit-8.txt`.

---

### Task 9: Arrow keys in the grid

**Files:**
- Create: `frontend/src/appointments/calendar/gridFocus.ts`
- Modify: `frontend/src/appointments/calendar/TimeGrid.tsx`, `AppointmentCard.tsx`
- Test: `frontend/src/appointments/calendar/gridFocus.test.ts` (new); add one test to `calendar.test.tsx`

**Interfaces:**
- Consumes: Task 8's `TimeGrid` (`cols`, `gridRef`).
- Produces: `interface Stop { key; col; start; end }`; `GRID_KEYS`; `orderStops(stops)`; `nextStop(stops, from, key)`;
  `initialStop(stops, activeKey, selectedId)`; every slot button and card carries `data-stop` and a roving `tabIndex`.

- [ ] **Step 1: Write the failing tests.** `frontend/src/appointments/calendar/gridFocus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { initialStop, nextStop, orderStops, type Stop } from './gridFocus'

const stops = orderStops([
  { key: 'slot:0:660', col: 0, start: 660, end: 690 },
  { key: 'slot:0:540', col: 0, start: 540, end: 570 },
  { key: 'appt:7', col: 0, start: 600, end: 645 },
  { key: 'slot:1:600', col: 1, start: 600, end: 630 },
  { key: 'appt:9', col: 3, start: 615, end: 660 },
])
const at = (key: string): Stop => stops.find(s => s.key === key)!

describe('arrow keys in the grid', () => {
  it('goes up and down a column, and to its first and last stop', () => {
    expect(nextStop(stops, at('slot:0:540'), 'ArrowDown')?.key).toBe('appt:7')
    expect(nextStop(stops, at('appt:7'), 'ArrowUp')?.key).toBe('slot:0:540')
    expect(nextStop(stops, at('slot:0:540'), 'ArrowUp')).toBeNull()
    expect(nextStop(stops, at('slot:0:660'), 'Home')?.key).toBe('slot:0:540')
    expect(nextStop(stops, at('slot:0:540'), 'End')?.key).toBe('slot:0:660')
  })

  it('goes across to the same time, the nearest stop, skipping an empty column', () => {
    expect(nextStop(stops, at('appt:7'), 'ArrowRight')?.key).toBe('slot:1:600')
    expect(nextStop(stops, at('slot:1:600'), 'ArrowRight')?.key).toBe('appt:9') // column 2 has no stop
    expect(nextStop(stops, at('slot:1:600'), 'ArrowLeft')?.key).toBe('appt:7') // the appointment covering 10:00
    expect(nextStop(stops, at('slot:0:540'), 'ArrowLeft')).toBeNull()
    expect(nextStop(stops, at('slot:0:540'), 'a')).toBeNull()
  })

  it('enters on the stop last used, else the open appointment, else the first', () => {
    expect(initialStop(stops, 'slot:1:600', null)?.key).toBe('slot:1:600')
    expect(initialStop(stops, null, 9)?.key).toBe('appt:9')
    expect(initialStop(stops, null, null)?.key).toBe('slot:0:540')
    expect(initialStop([], null, null)).toBeNull()
  })
})
```

  In `calendar.test.tsx`, add inside `describe('TimeGrid', …)`:

```tsx
  it('is one tab stop: exactly one slot or card is reachable by Tab, and the keys are explained (Part F)', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html.match(/data-stop="[^"]+"[^>]*tabindex="0"|tabindex="0"[^>]*data-stop="[^"]+"/g)).toHaveLength(1)
    expect(html).toContain('id="calendar-keys-hint"')
  })
```

- [ ] **Step 2: Run them.** `cd frontend && npx vitest run src/appointments/calendar/gridFocus.test.ts src/appointments/calendar/calendar.test.tsx`
  - Expected: FAIL — `./gridFocus` does not exist; no `data-stop`.

- [ ] **Step 3: Implement** `frontend/src/appointments/calendar/gridFocus.ts` (Write tool):

```ts
/** One place the keyboard can stop in the grid: a free slot or an appointment card. */
export interface Stop { key: string; col: number; start: number; end: number }

export const GRID_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'] as const

/** Column by column, top to bottom (ties by key, so the order never depends on rendering). */
export function orderStops(stops: Stop[]): Stop[] {
  return [...stops].sort((a, b) => a.col - b.col || a.start - b.start || a.key.localeCompare(b.key))
}

/** In another column: the stop covering `minute`, else the one starting nearest to it (the earlier on a tie). */
function nearest(column: Stop[], minute: number): Stop {
  return column.find(s => s.start <= minute && minute < s.end)
    ?? column.reduce((best, s) => (Math.abs(s.start - minute) < Math.abs(best.start - minute) ? s : best))
}

/** Where a key moves focus from `from` (Part F); null to stay. Columns with no stop are skipped. */
export function nextStop(stops: Stop[], from: Stop, key: string): Stop | null {
  const column = (c: number) => stops.filter(s => s.col === c)
  const here = column(from.col)
  const index = here.findIndex(s => s.key === from.key)
  switch (key) {
    case 'ArrowDown': return here[index + 1] ?? null
    case 'ArrowUp': return index > 0 ? here[index - 1] : null
    case 'Home': return here[0] ?? null
    case 'End': return here[here.length - 1] ?? null
    case 'ArrowLeft':
    case 'ArrowRight': {
      const step = key === 'ArrowRight' ? 1 : -1
      const last = Math.max(...stops.map(s => s.col))
      for (let c = from.col + step; c >= 0 && c <= last; c += step) {
        const there = column(c)
        if (there.length > 0) return nearest(there, from.start)
      }
      return null
    }
    default: return null
  }
}

/** The grid's one tab stop: the stop last focused, else the open appointment, else the first. */
export function initialStop(stops: Stop[], activeKey: string | null, selectedId: number | null): Stop | null {
  return stops.find(s => s.key === activeKey)
    ?? (selectedId !== null ? stops.find(s => s.key === `appt:${selectedId}`) : undefined)
    ?? stops[0]
    ?? null
}
```

- [ ] **Step 4: The card** (Edit tool) in `AppointmentCard.tsx`: `Props` gains
  `/** Part F: its key among the grid's stops, and whether it is the grid's one tab stop. */ stopKey?: string; tabIndex?: number; onFocusStop?: (key: string) => void`;
  the `<button>` gains `data-stop={stopKey}`, `tabIndex={tabIndex}` and
  `onFocus={stopKey && onFocusStop ? () => onFocusStop(stopKey) : undefined}`.

- [ ] **Step 5: The grid** (Edit tool) in `TimeGrid.tsx`:
  - Imports: `useState` from `react`; `GRID_KEYS, initialStop, nextStop, orderStops, type Stop` from `./gridFocus`;
    `type KeyboardEvent as ReactKeyboardEvent` from `react`.
  - After `const gridRef = useRef…`: `const [activeKey, setActiveKey] = useState<string | null>(null)`.
  - After `const cols = …`:
    ```tsx
      // Part F: the grid is one tab stop; the arrow keys move between free slots and cards.
      const stops: Stop[] = orderStops(cols.flatMap(({ i, free, placed }) => [
        ...free.map(m => ({ key: `slot:${i}:${m}`, col: i, start: m, end: m + SLOT_STEP })),
        ...placed.map(p => ({ key: `appt:${p.item.id}`, col: i, start: wallMinutes(p.item.start), end: wallMinutes(p.item.start) + p.item.duration_minutes })),
      ]))
      const current = initialStop(stops, activeKey, selectedId)
      const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!(GRID_KEYS as readonly string[]).includes(e.key)) return
        const focused = (e.target as HTMLElement).closest<HTMLElement>('[data-stop]')?.dataset.stop
        const from = stops.find(s => s.key === focused)
        if (!from) return // a key pressed in the drop dialog, not on a stop
        e.preventDefault()
        const next = nextStop(stops, from, e.key)
        if (!next) return
        setActiveKey(next.key)
        gridRef.current?.querySelector<HTMLElement>(`[data-stop="${next.key}"]`)?.focus()
      }
    ```
  - The columns row `<div className="flex" ref={gridRef}>` becomes
    `<div className="flex" ref={gridRef} onKeyDown={onKeyDown} aria-describedby="calendar-keys-hint">` and its first
    child is `<p id="calendar-keys-hint" className="sr-only">{t('appointments.calendar.keys_hint', 'Use the arrow keys to move between times and people; Enter opens or books.')}</p>`.
  - Each free-slot `<button>` gains `data-stop={\`slot:${i}:${m}\`}`,
    `tabIndex={current?.key === \`slot:${i}:${m}\` ? 0 : -1}` and `onFocus={() => setActiveKey(\`slot:${i}:${m}\`)}`.
  - Each `<AppointmentCard>` gains `stopKey={\`appt:${p.item.id}\`}`, `tabIndex={current?.key === \`appt:${p.item.id}\` ? 0 : -1}`
    and `onFocusStop={setActiveKey}`.

- [ ] **Step 6: Run it.** `cd frontend && npx tsc -b && npx vitest run src/appointments && npx eslint src/appointments/calendar`
  - Expected: PASS (4 new); tsc 0; eslint 0.

- [ ] **Step 7: Commit** "Walk the calendar grid with the arrow keys":
  `git add frontend/src/appointments/calendar/gridFocus.ts frontend/src/appointments/calendar/gridFocus.test.ts frontend/src/appointments/calendar/TimeGrid.tsx frontend/src/appointments/calendar/AppointmentCard.tsx frontend/src/appointments/calendar/calendar.test.tsx`
  then `git commit -F <ws>/tools/commit-9.txt`.

---

### Task 10: The runbook, the whole branch and the browser

**Files:**
- Modify: `docs/appointments-workspace.md`

- [ ] **Step 1: The runbook.** In `docs/appointments-workspace.md`:
  - **The actions table:** the Move row's "Writes" gains "Also by dragging the card (a confirm first) and with a
    Length (the booking keeps a length staff set)."; add rows:
    - "Length (drag the bottom edge, or the Move form's Length)" — "The booking's own length, 15 minutes to 8 hours in
      15-minute steps, kept by later moves until changed or set back to normal; the price never changes; the client
      is not emailed." — "Stretch past the person's working hours or into the next appointment.";
    - "Reopen (managers)" — "Status `confirmed` again, from completed, no-show or cancelled, when no money went back
      and its time is free; points earned stay (never twice); a reopened cancellation can email 'Confirmed'." —
      "Reopen after a refund (book again instead); check working hours."
  - **"Putting a mistake right":** the first bullet becomes "Cancelled, marked no-show or completed by mistake: a
    manager uses Reopen in the workspace (it checks the time is still free). The full admin's status change still
    works, without that check."
  - **A new section "Calendar power (Part F, 2026-10-05)"** before "Deploying it": drag to move (mouse, pen, a 400 ms
    press on a tablet; snaps to 15 minutes; the confirm with "Tell the client"; Escape cancels; at 1024 px and up —
    below that the List view and the Move form); the "can't go here" reasons; length (bottom edge, the Move form's
    Length, `meta.length_minutes`, `length` / `normal_length` on the move request and `length` on `slots`, 422
    `invalid_length`); reopen (managers; `money_returned`, `slot_taken`; no hours or past-day check; the `svcm:` lock);
    the arrow keys (one tab stop, Up/Down/Left/Right/Home/End, Enter); the scheduler's optional `$lengthMinutes`;
    code (`calendar/{dragMath,useCardDrag,DragPreview,DropConfirm,gridFocus}`, `panel/lengths.ts`) and tests
    (`SchedulerLengthTest`, `MoveLengthTest`, `ReopenTest`, the calendar tests).
  - **"How it was checked for keyboard and screen-reader use":** the known limit "one tab stop per slot and per day
    (no arrow-key movement)" becomes "the month has one tab stop per day; the grid is one tab stop with arrow keys
    (Part F)".
  - **"What this milestone does not do":** drop "drag to move" and "reopening a completed visit"; add "drag to create
    an appointment, Undo after a saved drag, a length that changes the price, stretching past working hours".
  - **"Deploying it" gains:** "(Part F) no migration and no new setting; the scheduler's optional length nobody else
    passes; every organisation's workspace gains drag, length and reopen on deploy; a booking's `meta` may carry
    `length_minutes`."
  - Commit "Document calendar power": `git add docs/appointments-workspace.md` then `git commit -F <ws>/tools/commit-10.txt`.

- [ ] **Step 2: The whole branch, backend.** Run `bash <ws>/tools/suite-by-dir.sh after` in the background (copy
  `suite-by-dir.sh` from `.superpowers/sdd/archive/2026-10-06-appointments-money-at-the-desk/tools/` into `<ws>/tools/`
  first and change its `ws=` line to this plan's workspace).
  - Expected: every group `exit=0`, as in the baseline, plus the new tests.

- [ ] **Step 3: The whole branch, frontend.** `cd frontend && npx tsc -b && npx vitest run`
  - Expected: only the known failures (3 `plannerMeta`, `bookingSheet`); tsc 0.

- [ ] **Step 4: The browser** (local; Part E's ruling for local checks: create a table the screens need for the check
  and drop it afterwards; never `artisan migrate`).
  - **Setup:**
    - `php artisan tinker --execute="echo implode(',', array_filter(['service_booking_payments', 'client_messages'], fn (\$t) => !Illuminate\Support\Facades\Schema::hasTable(\$t)));"`
      — for each table it prints, run its migration's `up()` through tinker (as in Part E) and ledger it.
    - Start `artisan serve` on **8012** (8010 is held by another project) with `MAIL_MAILER=log LOG_LEVEL=debug
      QUEUE_CONNECTION=sync CORS_ALLOWED_ORIGINS=http://localhost:5180`, and vite on 5180 with
      `VITE_API_URL=http://127.0.0.1:8012/api` and `--strictPort`.
    - Sign in as the manager tester `appointments-tester@example.test` (org 16).
  - **Check (1440 × 900 unless said):**
    - drag a confirmed card to another time and to another person; the preview label; the confirm with "Tell the
      client"; Save → the card is at its new place and History says Moved;
    - drag over lunch/time off, over another appointment, onto someone who does not do the service, onto a past day:
      the preview says why, and the release sends nothing;
    - a click on a card still opens the panel; a drag released at its own place sends nothing (Review Focus 1);
    - Escape during a drag puts it back;
    - resize a card's bottom edge to 90 minutes → "Make it 10:00–11:30?" → Save → the panel says "Length set by staff";
      drag it to another time: it keeps 90 minutes;
    - the Move form's Length: "Normal length (45 min)" and the times offered for 90 minutes;
    - a stale save: change the appointment in a second tab first; the confirm says someone else changed it;
    - Reopen: a completed, a no-show and a cancelled visit (the cancelled one with the client box); a refunded visit is
      refused; as `setup-staff@example.test` (staff) the line "A manager can reopen it." and no button;
    - the arrow keys through a day: one Tab into the grid, Up/Down/Left/Right/Home/End, Enter opens or books, one Tab
      out;
    - touch: Chrome's device emulation (touch on, 1280 px wide): a swipe scrolls; a still press then a move drags
      (Review Focus 2);
    - Lighthouse accessibility on the calendar: 100.
  - **Afterwards:** drop only the tables this check created; restore any test booking the check changed; stop the
    servers (and any orphaned vite process of this check); ledger what was seen with screenshots
    `.superpowers/shots/appointments/partF-*.png` in the main checkout.

- [ ] **Step 5: Done.** All ten tasks are complete in the ledger. Hand over to the final whole-branch review.
