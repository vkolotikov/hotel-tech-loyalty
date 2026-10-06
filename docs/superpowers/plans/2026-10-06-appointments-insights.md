# HexaTech Appointments — Part G: insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manager opens Insights in the appointments workspace and sees how the venue is doing over a period:
visits done, no-show and late-cancellation rates out of one stated denominator, the value and money of the visits,
a row per service and per person, and where bookings come from, each next to the period before.

**Architecture:** The server counts everything on request, in PHP, in one place:
- `VisitGroup` puts an appointment in one of six groups;
- `InsightsPeriod` validates the period and works out the one before;
- `InsightsReport` reads the period's appointments and their ledger rows in a fixed number of queries;
- money comes from Part E's own rules through a new `AppointmentMoney::amountsFrom()`.

A managers-only `GET /v1/admin/appointments/insights` returns counts and money. The React screen works out every
rate, change and colour in one pure module (`insightsMath.ts`) and draws the tiles, tables and sources line.

**Tech Stack:** Laravel 13 / PHP 8.4 (PHPUnit on SQLite in memory), React 19 + TypeScript, TanStack Query 5,
react-router 6, i18next (five locales), Vitest (node environment, static render), Tailwind 3.4 with the workspace's
`a-*` tokens.

**Spec:** `docs/superpowers/specs/2026-10-06-appointments-insights-design.md` (owner-approved, commit `96369533e`).

## Global Constraints

**Workspace**
- `<workspace>` is this plan's git-ignored folder, `.superpowers/sdd/2026-10-06-appointments-insights/`. Its
  `progress.md` is the ledger and `tools/` holds commit messages and scripts.

**PHP and tests**
- PHP is always `/c/wamp64/bin/php/php8.4.20/php.exe`; never a bare `php artisan test`.
- Run PHP tests with `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh <path>` from the feature
  worktree root (`C:\wamp64\www\Hexa-Tech-appointments`).
- Never `artisan migrate` locally (the local PostgreSQL is shared). This part has **no migration**.
- Tests run on SQLite in memory: no Postgres-only SQL (no `AT TIME ZONE`, no `FILTER`, no `ilike`) in this part's
  queries.

**Frontend**
- Frontend checks: `cd frontend && npx tsc -b && npx vitest run src/appointments && npx eslint src/appointments`.
- The known failures outside the workspace (3 `plannerMeta`, 1 portal `bookingSheet`) are pre-existing.
- Never commit `frontend/dist`, `public/spa` or `resources/spa-shell` on the feature branch.

**Commits**
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stage files by name.
- Write PHP, regex-heavy files and commit messages with the Write tool: Bash heredocs halve backslashes.

**Rules from the spec**
- Managers only: `SetupAccess::requireManager($request->user())` → 403 `not_allowed`.
- Period: venue dates From–To, both included, at most **366** days. Otherwise 422 `invalid_period` with
  "Choose a period of up to a year.".
- An appointment belongs to the period when `start_at >= From 00:00:00` and `< (To + 1 day) 00:00:00`: wall-clock
  digits, no conversion.
- Count the whole organisation, every brand: `withoutGlobalScope(BrandScope::class)`, with the tenant scope kept.
- The six groups and the one denominator are exactly spec §4.2–§4.3. The cancellation window is
  `HotelSetting::getValue('services_cancel_hours', 24)`.
- `desk_ledger_since` is `2026-10-05`.
- Sources:
  - desk = `admin`, `phone`, `walk_in`;
  - online = any other non-empty source;
  - other = empty.
- Every word is in en, ru, de, fr and es.

## Review Focus

1. **A venue not on UTC, late cancellations.** "Late" must compare the cancellation instant with the start on the
   venue's clock (`AppointmentClock::toInstant`), not the stored digits read as UTC. Pinned by
   `test_late_is_measured_on_the_venue_clock` (Task 2).
2. **Midnight edges in a non-UTC venue.** An appointment at 00:30 on From and at 23:30 on To is in the period; one at
   00:00 the day after To is out. Pinned by `test_the_period_is_the_venue_days_from_midnight_to_midnight` (Task 2).
3. **Several currencies in one period.** Money is per currency; `main_currency` is the one with the most visits done;
   the average divides by the visits done in that currency. Pinned by
   `test_money_is_kept_per_currency_and_the_main_currency_has_the_most_visits_done` (Task 2), and by the view test
   "shows one money line per currency" (Task 4).
4. **A garbled address.** With `?from=abc`, or only one date, the page must open on This week, not send junk to the
   server. A From after To typed by hand must show the server's own sentence, not "Something went wrong". Pinned by
   `rangeFromSearch` tests (Task 3) and "shows the server's sentence for a refused period" (Task 4).
5. **Nothing due yet** (This week on a Monday morning: everything booked ahead). Every rate and rate change must read
   "—", never "0%" or "NaN%", and the counts must still compare. Pinned by the `share` / `pointsChange` tests (Task 3)
   and "reads — when nothing is due" (Task 4).

---

## File map

| File | Responsibility |
|---|---|
| `app/Services/Appointments/Insights/VisitGroup.php` (new) | One appointment → one of six groups (pure) |
| `app/Services/Appointments/Insights/InsightsPeriod.php` (new) | Period validation, length, the period before (pure) |
| `app/Services/Appointments/Insights/InsightsReport.php` (new) | Reads both periods and counts them |
| `app/Services/Appointments/Money/AppointmentMoney.php` (modify) | `amountsFrom()`: the money figures from loaded rows |
| `app/Http/Controllers/Api/V1/Admin/Appointments/InsightsController.php` (new) | Thin endpoint |
| `routes/api.php` (modify) | `GET admin/appointments/insights` |
| `tests/Unit/Appointments/VisitGroupTest.php`, `InsightsPeriodTest.php` (new) | Pure rules |
| `tests/Feature/Appointments/InsightsTest.php` (new) | Endpoint and report |
| `frontend/src/appointments/lib/types.ts`, `lib/api.ts` (modify) | `Insights` types, `appointmentsApi.insights()` |
| `frontend/src/appointments/insights/insightsMath.ts` (new) | Picks, rates, changes, tones, formatting (pure) |
| `frontend/src/appointments/insights/InsightsPage.tsx` (new) | Page (address, picks, query) + `InsightsView` |
| `frontend/src/appointments/insights/*.test.ts(x)` (new) | Tests |
| `AppointmentsApp.tsx`, `AppointmentsShell.tsx`, `AppointmentsShell.test.tsx` (modify) | Route and menu item |
| `frontend/src/appointments/i18n/appointments.{en,ru,de,fr,es}.json`, `appointmentsLocales.test.ts` (modify) | Words |
| `docs/appointments-workspace.md` (modify) | Runbook |

---

### Task 1: The pure rules — `VisitGroup` and `InsightsPeriod`

**Files:**
- Create: `app/Services/Appointments/Insights/VisitGroup.php`
- Create: `app/Services/Appointments/Insights/InsightsPeriod.php`
- Test: `tests/Unit/Appointments/VisitGroupTest.php`, `tests/Unit/Appointments/InsightsPeriodTest.php`

**Interfaces:**
- Consumes: `App\Services\Appointments\AppointmentRefused(string $errorCode, string $message, int $status = 422)`.
- Produces:
  - `VisitGroup::of(string $status, CarbonImmutable $start, ?CarbonImmutable $cancelledAt, CarbonImmutable $now, int $cancelHours): ?string`
    — one of `'done' | 'no_show' | 'unmarked' | 'late_cancel' | 'early_cancel' | 'ahead'`, or null.
  - Constants `VisitGroup::ALL` and `VisitGroup::DUE` (`['done','no_show','unmarked','late_cancel']`).
  - `InsightsPeriod::fromInput(mixed $from, mixed $to): InsightsPeriod` (throws `invalid_period`), with:
    - properties `->from` and `->to` (`Y-m-d`);
    - `->days(): int`, `->dayAfter(): string`, `->isCalendarMonth(): bool`;
    - `->previous(): InsightsPeriod`;
    - `->toApi(): array{from: string, to: string, days: int}`.

- [ ] **Step 1: Write the failing tests**

`tests/Unit/Appointments/VisitGroupTest.php`:

```php
<?php

namespace Tests\Unit\Appointments;

use App\Services\Appointments\Insights\VisitGroup;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Part G §4.2: every appointment falls into exactly one group, by what it is now. */
class VisitGroupTest extends TestCase
{
    private static function at(string $time, string $zone = 'UTC'): CarbonImmutable
    {
        return CarbonImmutable::parse($time, $zone);
    }

    /** @return array<string, array{0: string, 1: ?string}> */
    public static function statuses(): array
    {
        return [
            'completed'         => ['completed', 'done'],
            'no-show'           => ['no_show', 'no_show'],
            'pending, past'     => ['pending', 'unmarked'],
            'confirmed, past'   => ['confirmed', 'unmarked'],
            'in progress, past' => ['in_progress', 'unmarked'],
            'unknown'           => ['failed', null],
        ];
    }

    #[DataProvider('statuses')]
    public function test_each_status_has_one_group(string $status, ?string $group): void
    {
        $this->assertSame($group, VisitGroup::of($status, self::at('2026-10-05 09:00'), null, self::at('2026-10-05 10:00'), 24));
    }

    public function test_a_live_appointment_is_ahead_until_its_start(): void
    {
        $now = self::at('2026-10-05 10:00');
        $this->assertSame('ahead', VisitGroup::of('confirmed', self::at('2026-10-05 10:01'), null, $now, 24));
        $this->assertSame('unmarked', VisitGroup::of('confirmed', self::at('2026-10-05 10:00'), null, $now, 24));
        $this->assertSame('unmarked', VisitGroup::of('pending', self::at('2026-10-05 09:59'), null, $now, 24));
    }

    public function test_a_cancellation_is_late_only_after_the_free_cancellation_deadline(): void
    {
        $start = self::at('2026-10-06 10:00');
        $now = self::at('2026-10-07 12:00');
        $this->assertSame('early_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-05 10:00:00'), $now, 24)); // at the deadline
        $this->assertSame('late_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-05 10:00:01'), $now, 24));
        $this->assertSame('late_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-06 11:00'), $now, 24)); // after the start
        $this->assertSame('early_cancel', VisitGroup::of('cancelled', $start, null, $now, 24)); // no time recorded: nobody is blamed
    }

    public function test_a_zero_hour_window_makes_only_a_cancellation_after_the_start_late(): void
    {
        $start = self::at('2026-10-06 10:00');
        $now = self::at('2026-10-07 12:00');
        $this->assertSame('early_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-06 09:59'), $now, 0));
        $this->assertSame('late_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-06 10:01'), $now, 0));
    }

    public function test_the_window_is_counted_in_real_hours_across_a_clock_change(): void
    {
        // Riga goes from +03:00 to +02:00 at 04:00 on Sunday 25 October 2026. 24 real hours before 10:00 that day is
        // 11:00 on the 24th by the wall clock, not 10:00.
        $start = self::at('2026-10-25 10:00', 'Europe/Riga');
        $now = self::at('2026-10-26 12:00', 'Europe/Riga');
        $this->assertSame('early_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-24 10:30', 'Europe/Riga'), $now, 24));
        $this->assertSame('late_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-24 11:30', 'Europe/Riga'), $now, 24));
    }

    public function test_bookings_due_are_the_four_groups_the_venue_kept_time_for(): void
    {
        $this->assertSame(['done', 'no_show', 'unmarked', 'late_cancel'], VisitGroup::DUE);
        $this->assertSame(['done', 'no_show', 'unmarked', 'late_cancel', 'early_cancel', 'ahead'], VisitGroup::ALL);
    }
}
```

`tests/Unit/Appointments/InsightsPeriodTest.php`:

```php
<?php

namespace Tests\Unit\Appointments;

use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Insights\InsightsPeriod;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Part G §4.1 and §4.7: the period, and the one it is compared with. */
class InsightsPeriodTest extends TestCase
{
    private static function before(string $from, string $to): array
    {
        $p = InsightsPeriod::fromInput($from, $to)->previous();

        return [$p->from, $p->to];
    }

    public function test_a_calendar_month_is_compared_with_the_whole_month_before(): void
    {
        $this->assertSame(['2026-09-01', '2026-09-30'], self::before('2026-10-01', '2026-10-31'));
        $this->assertSame(['2026-02-01', '2026-02-28'], self::before('2026-03-01', '2026-03-31'));
        $this->assertSame(['2025-12-01', '2025-12-31'], self::before('2026-01-01', '2026-01-31'));
        $this->assertTrue(InsightsPeriod::fromInput('2026-02-01', '2026-02-28')->isCalendarMonth());
        $this->assertFalse(InsightsPeriod::fromInput('2026-10-01', '2026-10-15')->isCalendarMonth());
    }

    public function test_anything_else_is_compared_with_the_same_number_of_days_just_before(): void
    {
        $this->assertSame(['2026-09-28', '2026-10-04'], self::before('2026-10-05', '2026-10-11')); // a Monday–Sunday week
        $this->assertSame(['2026-09-23', '2026-10-02'], self::before('2026-10-03', '2026-10-12')); // ten days
        $this->assertSame(['2026-09-16', '2026-09-30'], self::before('2026-10-01', '2026-10-15')); // half a month
        $this->assertSame(['2026-10-04', '2026-10-04'], self::before('2026-10-05', '2026-10-05')); // one day
    }

    public function test_it_knows_its_length_and_the_day_after(): void
    {
        $p = InsightsPeriod::fromInput('2026-10-05', '2026-10-11');
        $this->assertSame(7, $p->days());
        $this->assertSame('2026-10-12', $p->dayAfter());
        $this->assertSame(['from' => '2026-10-05', 'to' => '2026-10-11', 'days' => 7], $p->toApi());
        $this->assertSame('2027-01-01', InsightsPeriod::fromInput('2026-12-31', '2026-12-31')->dayAfter());
    }

    public function test_up_to_366_days_are_allowed(): void
    {
        $this->assertSame(366, InsightsPeriod::fromInput('2026-01-01', '2027-01-01')->days());
    }

    /** @return array<string, array{0: mixed, 1: mixed}> */
    public static function refused(): array
    {
        return [
            '367 days'          => ['2026-01-01', '2027-01-02'],
            'from after to'     => ['2026-10-12', '2026-10-11'],
            'a day that is not' => ['2026-02-30', '2026-03-05'],
            'no from'           => [null, '2026-10-11'],
            'no to'             => ['2026-10-05', null],
            'short form'        => ['2026-10-5', '2026-10-11'],
            'a word'            => ['yesterday', '2026-10-11'],
            'an array'          => [['2026-10-05'], '2026-10-11'],
        ];
    }

    #[DataProvider('refused')]
    public function test_a_bad_period_is_refused(mixed $from, mixed $to): void
    {
        try {
            InsightsPeriod::fromInput($from, $to);
            $this->fail('accepted');
        } catch (AppointmentRefused $e) {
            $this->assertSame('invalid_period', $e->errorCode);
            $this->assertSame(422, $e->status);
            $this->assertSame('Choose a period of up to a year.', $e->getMessage());
        }
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Unit/Appointments/VisitGroupTest.php tests/Unit/Appointments/InsightsPeriodTest.php`

Expected: FAIL with `Class "App\Services\Appointments\Insights\VisitGroup" not found` (and the same for
`InsightsPeriod`).

- [ ] **Step 3: Write `VisitGroup`**

`app/Services/Appointments/Insights/VisitGroup.php`:

```php
<?php

namespace App\Services\Appointments\Insights;

use Carbon\CarbonImmutable;

/**
 * The one group an appointment falls into for Insights (Part G spec §4.2), by
 * what it is now. Pure. Every time is an instant: the start on the venue's
 * clock, the moment it was cancelled, now. A clock change therefore moves
 * nothing, and the window is counted in real hours.
 */
final class VisitGroup
{
    public const DONE = 'done';
    public const NO_SHOW = 'no_show';
    public const UNMARKED = 'unmarked';
    public const LATE_CANCEL = 'late_cancel';
    public const EARLY_CANCEL = 'early_cancel';
    public const AHEAD = 'ahead';

    public const ALL = [self::DONE, self::NO_SHOW, self::UNMARKED, self::LATE_CANCEL, self::EARLY_CANCEL, self::AHEAD];

    /** The appointments the venue had to keep time for: every rate is out of these (spec §4.3). */
    public const DUE = [self::DONE, self::NO_SHOW, self::UNMARKED, self::LATE_CANCEL];

    private const LIVE = ['pending', 'confirmed', 'in_progress'];

    public static function of(string $status, CarbonImmutable $start, ?CarbonImmutable $cancelledAt, CarbonImmutable $now, int $cancelHours): ?string
    {
        if (in_array($status, self::LIVE, true)) {
            return $start->greaterThan($now) ? self::AHEAD : self::UNMARKED;
        }

        return match ($status) {
            'completed' => self::DONE,
            'no_show'   => self::NO_SHOW,
            // Late once the free-cancellation deadline had passed; a cancellation with no time recorded blames no one.
            'cancelled' => $cancelledAt !== null && $cancelledAt->greaterThan($start->utc()->subHours(max(0, $cancelHours)))
                ? self::LATE_CANCEL
                : self::EARLY_CANCEL,
            default     => null,
        };
    }
}
```

- [ ] **Step 4: Write `InsightsPeriod`**

`app/Services/Appointments/Insights/InsightsPeriod.php`:

```php
<?php

namespace App\Services\Appointments\Insights;

use App\Services\Appointments\AppointmentRefused;
use Carbon\CarbonImmutable;

/**
 * The venue days an Insights view covers, both included (Part G spec §4.1),
 * and the period it is compared with (§4.7). Dates are venue dates: no time
 * zone is involved here.
 */
final class InsightsPeriod
{
    public const MAX_DAYS = 366;

    private function __construct(public readonly string $from, public readonly string $to)
    {
    }

    public static function fromInput(mixed $from, mixed $to): self
    {
        $a = self::date($from);
        $b = self::date($to);
        if ($a === null || $b === null || $a > $b || self::span($a, $b) > self::MAX_DAYS) {
            throw new AppointmentRefused('invalid_period', 'Choose a period of up to a year.', 422);
        }

        return new self($a, $b);
    }

    public function days(): int
    {
        return self::span($this->from, $this->to);
    }

    /** Appointments in the period start at or after From 00:00 and before this day 00:00 (wall-clock digits). */
    public function dayAfter(): string
    {
        return self::day($this->to)->addDay()->format('Y-m-d');
    }

    public function isCalendarMonth(): bool
    {
        $first = self::day($this->from);

        return $first->day === 1 && $this->to === $first->endOfMonth()->format('Y-m-d');
    }

    /** A whole calendar month → the month before; anything else → the same number of days just before. */
    public function previous(): self
    {
        $first = self::day($this->from);
        if ($this->isCalendarMonth()) {
            $month = $first->subMonthNoOverflow();

            return new self($month->startOfMonth()->format('Y-m-d'), $month->endOfMonth()->format('Y-m-d'));
        }

        return new self($first->subDays($this->days())->format('Y-m-d'), $first->subDay()->format('Y-m-d'));
    }

    /** @return array{from: string, to: string, days: int} */
    public function toApi(): array
    {
        return ['from' => $this->from, 'to' => $this->to, 'days' => $this->days()];
    }

    private static function date(mixed $value): ?string
    {
        if (!is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
            return null;
        }

        // 2026-02-30 would roll over to 2 March: only a date that reads back unchanged exists.
        return self::day($value)->format('Y-m-d') === $value ? $value : null;
    }

    private static function day(string $date): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC');
    }

    private static function span(string $from, string $to): int
    {
        return intdiv(self::day($to)->getTimestamp() - self::day($from)->getTimestamp(), 86400) + 1;
    }
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Unit/Appointments/VisitGroupTest.php tests/Unit/Appointments/InsightsPeriodTest.php`

Expected: PASS. VisitGroupTest has 11 cases and InsightsPeriodTest 12, so `Tests: 23 passed`.

- [ ] **Step 6: Commit**

Write the message to `<workspace>/tools/commit-1.txt` with the Write tool:

```
Insights: put each appointment in one group, and know the period before

Part G's pure rules: VisitGroup (done, no-show, not marked yet, cancelled
late after the free-cancellation deadline in real hours, cancelled in time,
booked ahead) and InsightsPeriod (venue dates up to 366 days; a calendar
month compares with the month before, anything else with the same number
of days just before).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

```bash
git add app/Services/Appointments/Insights/VisitGroup.php app/Services/Appointments/Insights/InsightsPeriod.php tests/Unit/Appointments/VisitGroupTest.php tests/Unit/Appointments/InsightsPeriodTest.php
git commit -q -F <workspace>/tools/commit-1.txt
```

---

### Task 2: The report and the endpoint

**Files:**
- Modify: `app/Services/Appointments/Money/AppointmentMoney.php` (`summary()` at ~227, `figures()` at ~271)
- Create: `app/Services/Appointments/Insights/InsightsReport.php`
- Create: `app/Http/Controllers/Api/V1/Admin/Appointments/InsightsController.php`
- Modify: `routes/api.php` (inside the `Route::prefix('appointments')` group, after the `takings` route)
- Test: `tests/Feature/Appointments/InsightsTest.php`

**Interfaces:**
- Consumes:
  - `VisitGroup::of()`, `VisitGroup::ALL`, `VisitGroup::DUE`, `InsightsPeriod` (Task 1);
  - `App\Services\Portal\AppointmentClock::zoneFor(int): string` and
    `AppointmentClock::toInstant(DateTimeInterface|string, string): CarbonImmutable`;
  - `App\Services\Appointments\VenueClock::now(int): CarbonImmutable` (venue wall labelled UTC);
  - `HotelSetting::getValue(string, mixed)`;
  - `SetupAccess::requireManager(User)`.
- Produces:
  - `AppointmentMoney::amountsFrom(ServiceBooking $b, Collection $rows): array`: every key of `summary()` except
    `movements`.

    The spec (§5.2) called it `summaryFrom()` and had it return the movements too. Each movement reads its row's
    actor (`ServiceBookingPayment::toApi()` → `$this->actor?->name`), which over a year of appointments is one query
    per ledger row. Insights needs no movements, so the plan drops them.
  - `InsightsReport::for(int $orgId, InsightsPeriod $period, CarbonImmutable $now): array`.
  - `GET /v1/admin/appointments/insights?from&to`, whose JSON shape Task 3 types exactly:
    - `period` and `previous` (`{from, to, days}`);
    - `now` (`Y-m-d\TH:i`);
    - `cancel_hours`;
    - `desk_ledger_since`;
    - `current` and `before`, each `{groups, due, money, main_currency, by_service, by_person, sources}`.
  - `money` and every row's `value_done` are JSON objects keyed by currency (`{}` when empty, never `[]`).

- [ ] **Step 1: Write the failing feature test**

`tests/Feature/Appointments/InsightsTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Models\ServiceMaster;
use App\Services\Appointments\Insights\InsightsPeriod;
use App\Services\Appointments\Insights\InsightsReport;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * Part G: a manager's view of how the venue is doing. The clock is Monday
 * 5 October 2026, 06:00 UTC; "last week" is 28 September – 4 October.
 */
class InsightsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function insights(string $from, string $to): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api("insights?from={$from}&to={$to}"));
    }

    private function pay(ServiceBooking $b, string $kind, string $method, float $amount, bool $corrects = false, string $currency = 'EUR'): void
    {
        ServiceBookingPayment::create([
            'service_booking_id' => $b->id, 'kind' => $kind, 'method' => $method, 'amount' => $amount, 'currency' => $currency,
            'note' => $kind === 'refund' ? 'test' : null, 'corrects' => $corrects, 'actor_user_id' => $this->staff->id,
        ]);
    }

    private function at(string $start, array $attrs = []): ServiceBooking
    {
        $end = CarbonImmutable::parse($start)->addMinutes(45)->format('Y-m-d H:i:s');

        return $this->seedBooking(['start_at' => $start, 'end_at' => $end] + $attrs);
    }

    private function setCancelHours(int $hours): void
    {
        $row = new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = 'services_cancel_hours';
        $row->value = (string) $hours;
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    private function setZone(string $zone): void
    {
        $this->org->update(['timezone' => $zone]);
        app()->forgetScopedInstances();
    }

    public function test_only_a_manager_may_see_insights(): void
    {
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->getJson($this->api('insights?from=2026-09-28&to=2026-10-04'))
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
    }

    public function test_a_bad_period_is_refused_with_its_own_words(): void
    {
        foreach (['from=2026-10-12&to=2026-10-11', 'from=2026-01-01&to=2027-01-02', 'from=2026-02-30&to=2026-03-02', 'to=2026-10-11'] as $query) {
            $this->asStaff()->getJson($this->api("insights?{$query}"))
                ->assertStatus(422)->assertJsonPath('error', 'invalid_period')
                ->assertJsonPath('message', 'Choose a period of up to a year.');
        }
    }

    public function test_every_appointment_lands_in_one_group_and_the_money_is_the_panels_own(): void
    {
        $a = $this->at('2026-09-28 10:00:00', ['status' => 'completed', 'payment_status' => 'paid']);
        $this->pay($a, 'payment', 'cash', 60);                                                      // done, paid at the desk
        $this->at('2026-09-29 10:00:00', ['status' => 'completed']);                                // done, still owed 60
        $this->at('2026-09-30 10:00:00', ['status' => 'no_show', 'payment_status' => 'paid',
            'stripe_payment_intent_id' => 'pi_live1', 'source' => 'widget']);                       // no-show, card deposit kept
        $this->at('2026-10-01 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-10-01 08:00:00', 'source' => 'google']);       // 2 h before: late
        $this->at('2026-10-02 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-09-30 09:00:00', 'source' => 'member_portal']); // 49 h before: in time
        $this->at('2026-10-03 10:00:00', ['status' => 'cancelled', 'cancelled_at' => null, 'source' => '']);                              // no time: in time
        $this->at('2026-10-04 10:00:00', ['status' => 'confirmed']);                                // passed, not marked
        $h = $this->at('2026-10-04 12:00:00', ['status' => 'completed', 'total_amount' => 54, 'discount_amount' => 6]);
        $this->pay($h, 'payment', 'card_desk', 54);
        $this->pay($h, 'refund', 'card_desk', 54, corrects: true);                                  // entered by mistake: owed again
        $this->at('2026-10-05 10:00:00', ['status' => 'completed']);                                // the day after the period: not counted

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('period', ['from' => '2026-09-28', 'to' => '2026-10-04', 'days' => 7])
            ->assertJsonPath('previous', ['from' => '2026-09-21', 'to' => '2026-09-27', 'days' => 7])
            ->assertJsonPath('cancel_hours', 24)
            ->assertJsonPath('desk_ledger_since', '2026-10-05')
            ->assertJsonPath('now', '2026-10-05T06:00')
            ->assertJsonPath('current.groups', ['done' => 3, 'no_show' => 1, 'unmarked' => 1, 'late_cancel' => 1, 'early_cancel' => 2, 'ahead' => 0])
            ->assertJsonPath('current.due', 6)
            ->assertJsonPath('current.money.EUR', ['done' => 3, 'value_done' => 174, 'taken' => 120, 'owed_done' => 114])
            ->assertJsonPath('current.main_currency', 'EUR')
            ->assertJsonPath('current.sources', ['online' => 3, 'desk' => 4, 'other' => 1])
            ->assertJsonPath('before.due', 0)
            ->assertJsonPath('before.main_currency', null);
    }

    public function test_a_held_card_is_not_money_taken_and_a_label_marked_paid_before_part_e_is(): void
    {
        $this->at('2026-09-28 10:00:00', ['status' => 'completed', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_live2']);
        $this->at('2026-09-29 10:00:00', ['status' => 'completed', 'payment_status' => 'paid']); // marked paid, nothing recorded

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.money.EUR.taken', 60)
            ->assertJsonPath('current.money.EUR.value_done', 120);
    }

    public function test_the_window_is_the_venue_setting(): void
    {
        $this->setCancelHours(48);
        $this->at('2026-10-02 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-09-30 12:00:00']); // 46 h before

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('cancel_hours', 48)
            ->assertJsonPath('current.groups.late_cancel', 1);
    }

    public function test_late_is_measured_on_the_venue_clock(): void
    {
        $this->setZone('Europe/Riga');
        // 10:00 in Riga is 07:00 UTC; cancelled at 08:30 UTC the day before = 22.5 real hours ahead: late.
        // Reading the digits as UTC would make it 25.5 hours: in time.
        $this->at('2026-10-01 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-09-30 08:30:00']);

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.groups.late_cancel', 1)
            ->assertJsonPath('current.groups.early_cancel', 0);
    }

    public function test_the_period_is_the_venue_days_from_midnight_to_midnight(): void
    {
        $this->setZone('Europe/Riga');
        $this->at('2026-09-28 00:30:00', ['status' => 'completed']);
        $this->at('2026-10-04 23:30:00', ['status' => 'completed']);
        $this->at('2026-10-05 00:00:00', ['status' => 'completed']);
        $this->at('2026-09-27 23:59:00', ['status' => 'completed']);

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.groups.done', 2)
            ->assertJsonPath('before.groups.done', 1);
    }

    public function test_rows_by_service_and_by_person_with_no_one_assigned_and_a_removed_service(): void
    {
        $haircut = Service::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'name' => 'Haircut', 'duration_minutes' => 30, 'buffer_after_minutes' => 0,
            'price' => 40, 'currency' => 'EUR', 'is_active' => false,
        ]);
        $this->at('2026-09-28 10:00:00', ['status' => 'completed']);                                    // Massage, Mara, 60
        $this->at('2026-09-29 10:00:00', ['status' => 'no_show']);                                      // Massage, Mara
        $this->at('2026-09-30 10:00:00', ['status' => 'completed', 'service_id' => $haircut->id,
            'service_master_id' => null, 'total_amount' => 40]);                                         // Haircut, no one, 40
        $this->at('2026-10-01 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-10-01 09:00:00',
            'service_id' => $haircut->id, 'service_master_id' => null]);                                 // Haircut, no one, late
        $this->at('2026-10-02 10:00:00', ['status' => 'completed', 'service_id' => 999999, 'total_amount' => 30]); // removed service, Mara
        $this->at('2026-10-03 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-09-01 09:00:00',
            'service_id' => 999998]);                                                                    // in time only: no row

        $res = $this->insights('2026-09-28', '2026-10-04')->assertOk();
        $this->assertSame([
            ['id' => $this->service->id, 'name' => 'Deep Tissue Massage', 'due' => 2, 'done' => 1, 'no_show' => 1, 'late_cancel' => 0, 'value_done' => ['EUR' => 60]],
            ['id' => $haircut->id, 'name' => 'Haircut', 'due' => 2, 'done' => 1, 'no_show' => 0, 'late_cancel' => 1, 'value_done' => ['EUR' => 40]],
            ['id' => 999999, 'name' => null, 'due' => 1, 'done' => 1, 'no_show' => 0, 'late_cancel' => 0, 'value_done' => ['EUR' => 30]],
        ], $res->json('current.by_service'));
        $this->assertSame([
            ['id' => $this->master->id, 'name' => 'Mara Ilves', 'due' => 3, 'done' => 2, 'no_show' => 1, 'late_cancel' => 0, 'value_done' => ['EUR' => 90]],
            ['id' => null, 'name' => null, 'due' => 2, 'done' => 1, 'no_show' => 0, 'late_cancel' => 1, 'value_done' => ['EUR' => 40]],
        ], $res->json('current.by_person'));
    }

    public function test_money_is_kept_per_currency_and_the_main_currency_has_the_most_visits_done(): void
    {
        $this->at('2026-09-28 10:00:00', ['status' => 'completed', 'currency' => 'USD', 'total_amount' => 100]);
        $this->at('2026-09-29 10:00:00', ['status' => 'completed', 'currency' => 'EUR']);
        $this->at('2026-09-30 10:00:00', ['status' => 'completed', 'currency' => 'EUR']);

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.main_currency', 'EUR')
            ->assertJsonPath('current.money.EUR', ['done' => 2, 'value_done' => 120, 'taken' => 0, 'owed_done' => 120])
            ->assertJsonPath('current.money.USD', ['done' => 1, 'value_done' => 100, 'taken' => 0, 'owed_done' => 100])
            ->assertJsonPath('current.by_service.0.value_done', ['EUR' => 120, 'USD' => 100]);
    }

    public function test_a_calendar_month_is_compared_with_the_month_before(): void
    {
        $this->at('2026-08-14 10:00:00', ['status' => 'completed']);
        $this->at('2026-09-14 10:00:00', ['status' => 'completed']);
        $this->at('2026-09-15 10:00:00', ['status' => 'no_show']);

        $this->insights('2026-09-01', '2026-09-30')->assertOk()
            ->assertJsonPath('previous', ['from' => '2026-08-01', 'to' => '2026-08-31', 'days' => 31])
            ->assertJsonPath('current.due', 2)
            ->assertJsonPath('before.groups.done', 1);
    }

    public function test_a_reopened_visit_counts_by_what_it_is_now(): void
    {
        $this->at('2026-10-06 10:00:00', ['status' => 'confirmed', 'cancelled_at' => null]);

        $this->insights('2026-10-05', '2026-10-11')->assertOk()
            ->assertJsonPath('current.groups.ahead', 1)
            ->assertJsonPath('current.due', 0);
    }

    public function test_every_brand_counts_and_another_organisation_never_does(): void
    {
        $this->at('2026-09-28 10:00:00', ['status' => 'completed', 'brand_id' => 5]);
        $this->at('2026-09-29 10:00:00', ['status' => 'completed', 'brand_id' => 6]);
        $other = $this->otherOrganization();
        $this->inOrganization($other->id, function () use ($other) {
            $b = ServiceBooking::create([
                'organization_id' => $other->id, 'service_id' => $this->service->id, 'customer_name' => 'Elsewhere',
                'start_at' => '2026-09-28 11:00:00', 'end_at' => '2026-09-28 11:45:00', 'duration_minutes' => 45,
                'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'completed', 'payment_status' => 'paid', 'source' => 'admin',
            ]);
            ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => 60, 'currency' => 'EUR']);
        });

        app()->instance('current_brand_id', 5);
        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.groups.done', 2)
            ->assertJsonPath('current.money.EUR.taken', 0);
    }

    public function test_a_year_answers_in_a_fixed_number_of_queries(): void
    {
        $rows = [];
        foreach (range(0, 299) as $i) {
            $day = CarbonImmutable::parse('2025-10-06 10:00:00')->addDays($i);
            $rows[] = [
                'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
                'booking_reference' => 'SVC-Y' . $i, 'customer_name' => 'Client ' . $i, 'customer_email' => '', 'start_at' => $day->format('Y-m-d H:i:s'),
                'end_at' => $day->addMinutes(45)->format('Y-m-d H:i:s'), 'duration_minutes' => 45, 'service_price' => 60,
                'total_amount' => 60, 'currency' => 'EUR', 'status' => $i % 7 === 0 ? 'no_show' : 'completed',
                'payment_status' => 'unpaid', 'source' => 'admin', 'created_at' => now(), 'updated_at' => now(),
            ];
        }
        DB::table('service_bookings')->insert($rows);
        app()->forgetScopedInstances();
        HotelSetting::flushCacheFor($this->org->id);

        DB::enableQueryLog();
        $report = InsightsReport::for($this->org->id, InsightsPeriod::fromInput('2025-10-05', '2026-10-04'), CarbonImmutable::now());
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame(300, array_sum($report['current']['groups']));
        $this->assertLessThanOrEqual(10, $queries, "InsightsReport::for ran {$queries} queries");
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/InsightsTest.php`

Expected: FAIL. The HTTP tests get 404 (no route), and the query-budget test errors with
`Class "App\Services\Appointments\Insights\InsightsReport" not found`.

The raw insert in `test_a_year_answers_in_a_fixed_number_of_queries` supplies `booking_reference` (unique) and
`customer_email`, which the test schema declares NOT NULL (`SetsUpServiceBookingSchema`). The model would fill them on
`create()`; `DB::table()->insert()` does not.

- [ ] **Step 3: Split `AppointmentMoney::figures()` so the amounts can be had from loaded rows**

In `app/Services/Appointments/Money/AppointmentMoney.php`, replace `summary()` and the private `figures()` with the
following. The body of the amounts is `figures()` unchanged except that the `movements` line moves to `summary()`.

```php
    /** @return array<string, mixed> */
    public static function summary(ServiceBooking $b): array
    {
        $rows = ServiceBookingPayment::withoutGlobalScopes()->with('actor')
            ->where('service_booking_id', $b->id)->orderByDesc('id')->get();

        return self::amountsFrom($b, $rows) + ['movements' => $rows->map(fn (ServiceBookingPayment $r) => $r->toApi())->values()->all()];
    }
```

Rename `private static function figures(ServiceBooking $b, Collection $rows): array` to:

```php
    /**
     * summary()'s money figures from ledger rows already loaded, without the
     * movements list: Insights adds up a year of appointments and must not
     * load each row's actor (Part G).
     *
     * @param Collection<int, ServiceBookingPayment> $rows
     * @return array<string, mixed>
     */
    public static function amountsFrom(ServiceBooking $b, Collection $rows): array
```

Delete its last array entry,
`'movements' => $rows->map(fn (ServiceBookingPayment $r) => $r->toApi())->values()->all(),`. Leave every other line
of the body exactly as it is.

- [ ] **Step 4: Write `InsightsReport`**

`app/Services/Appointments/Insights/InsightsReport.php`:

```php
<?php

namespace App\Services\Appointments\Insights;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Models\ServiceMaster;
use App\Scopes\BrandScope;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Appointments\VenueClock;
use App\Services\Portal\AppointmentClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * How the venue is doing over a period and the one before (Part G spec §4–§5):
 * counts by group, money per currency, rows by service and by person, and
 * where bookings come from. The whole organisation, every brand, as on
 * Takings. Counted in PHP from a narrow read, the same way on SQLite and on
 * Postgres; a fixed number of queries whatever the period holds.
 */
final class InsightsReport
{
    /** Part E went live: desk payments are recorded from this venue date on. */
    public const DESK_LEDGER_SINCE = '2026-10-05';

    public const DESK_SOURCES = ['admin', 'phone', 'walk_in'];

    private const COLUMNS = [
        'id', 'organization_id', 'status', 'start_at', 'cancelled_at', 'service_id', 'service_master_id', 'source',
        'total_amount', 'currency', 'payment_status', 'stripe_payment_intent_id', 'refunded_amount', 'meta', 'created_at',
    ];

    /** @return array<string, mixed> */
    public static function for(int $orgId, InsightsPeriod $period, CarbonImmutable $now): array
    {
        $zone = AppointmentClock::zoneFor($orgId);
        $hours = max(0, (int) HotelSetting::getValue('services_cancel_hours', 24));
        $previous = $period->previous();

        $current = self::read($orgId, $period);
        $before = self::read($orgId, $previous);
        $all = $current->concat($before);
        $services = Service::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('id', $all->pluck('b.service_id')->filter()->unique()->values())->pluck('name', 'id')->all();
        $people = ServiceMaster::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('id', $all->pluck('b.service_master_id')->filter()->unique()->values())->pluck('name', 'id')->all();

        return [
            'period'            => $period->toApi(),
            'previous'          => $previous->toApi(),
            'now'               => VenueClock::now($orgId)->format('Y-m-d\TH:i'),
            'cancel_hours'      => $hours,
            'desk_ledger_since' => self::DESK_LEDGER_SINCE,
            'current'           => self::figures($current, $zone, $now, $hours, $services, $people),
            'before'            => self::figures($before, $zone, $now, $hours, $services, $people),
        ];
    }

    /**
     * The period's appointments with their ledger rows: two queries.
     *
     * @return Collection<int, array{b: ServiceBooking, rows: Collection<int, ServiceBookingPayment>}>
     */
    private static function read(int $orgId, InsightsPeriod $period): Collection
    {
        $inPeriod = fn () => ServiceBooking::query()->withoutGlobalScope(BrandScope::class)
            ->where('organization_id', $orgId)
            ->where('start_at', '>=', $period->from . ' 00:00:00')
            ->where('start_at', '<', $period->dayAfter() . ' 00:00:00');

        $bookings = $inPeriod()->orderBy('id')->get(self::COLUMNS);
        $ledger = ServiceBookingPayment::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('service_booking_id', $inPeriod()->select('id'))
            ->orderByDesc('id')->get()->groupBy('service_booking_id');

        return $bookings->map(fn (ServiceBooking $b) => ['b' => $b, 'rows' => $ledger->get($b->id, collect())]);
    }

    /**
     * @param Collection<int, array{b: ServiceBooking, rows: Collection<int, ServiceBookingPayment>}> $items
     * @param array<int, string> $services
     * @param array<int, string> $people
     * @return array<string, mixed>
     */
    private static function figures(Collection $items, string $zone, CarbonImmutable $now, int $hours, array $services, array $people): array
    {
        $groups = array_fill_keys(VisitGroup::ALL, 0);
        $money = [];
        $byService = [];
        $byPerson = [];
        $sources = ['online' => 0, 'desk' => 0, 'other' => 0];

        foreach ($items as $item) {
            $b = $item['b'];
            $group = VisitGroup::of(
                (string) $b->status,
                AppointmentClock::toInstant($b->start_at, $zone),
                $b->cancelled_at ? CarbonImmutable::instance($b->cancelled_at) : null,
                $now,
                $hours,
            );
            if ($group === null) {
                continue;
            }

            $groups[$group]++;
            $sources[self::sourceGroup($b->source)]++;

            $a = AppointmentMoney::amountsFrom($b, $item['rows']);
            $cur = (string) $a['currency'];
            $money[$cur] ??= ['done' => 0, 'value_done' => 0.0, 'taken' => 0.0, 'owed_done' => 0.0];
            $money[$cur]['taken'] = round($money[$cur]['taken'] + $a['paid_in'] - $a['paid_back'], 2);
            if ($group === VisitGroup::DONE) {
                $money[$cur]['done']++;
                $money[$cur]['value_done'] = round($money[$cur]['value_done'] + $a['total'], 2);
                $money[$cur]['owed_done'] = round($money[$cur]['owed_done'] + $a['owed'], 2);
            }

            $serviceId = $b->service_id === null ? null : (int) $b->service_id;
            $personId = $b->service_master_id === null ? null : (int) $b->service_master_id;
            self::count($byService, $serviceId, $serviceId === null ? null : ($services[$serviceId] ?? null), $group, $cur, (float) $a['total']);
            self::count($byPerson, $personId, $personId === null ? null : ($people[$personId] ?? null), $group, $cur, (float) $a['total']);
        }

        $main = self::mainCurrency($money);

        return [
            'groups'        => $groups,
            'due'           => array_sum(array_intersect_key($groups, array_flip(VisitGroup::DUE))),
            'money'         => (object) $money,
            'main_currency' => $main,
            'by_service'    => self::rows($byService, $main),
            'by_person'     => self::rows($byPerson, $main),
            'sources'       => $sources,
        ];
    }

    /** @param array<string, array<string, mixed>> $rows */
    private static function count(array &$rows, ?int $id, ?string $name, string $group, string $cur, float $total): void
    {
        $key = $id === null ? 'none' : (string) $id;
        $rows[$key] ??= ['id' => $id, 'name' => $name, 'due' => 0, 'done' => 0, 'no_show' => 0, 'late_cancel' => 0, 'value_done' => []];
        if (in_array($group, VisitGroup::DUE, true)) {
            $rows[$key]['due']++;
        }
        if (in_array($group, [VisitGroup::DONE, VisitGroup::NO_SHOW, VisitGroup::LATE_CANCEL], true)) {
            $rows[$key][$group]++;
        }
        if ($group === VisitGroup::DONE) {
            $rows[$key]['value_done'][$cur] = round(($rows[$key]['value_done'][$cur] ?? 0) + $total, 2);
        }
    }

    /**
     * Rows with bookings due, by value in the main currency, then bookings due, then name.
     *
     * @param array<string, array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private static function rows(array $rows, ?string $main): array
    {
        $kept = array_values(array_filter($rows, fn (array $r) => $r['due'] > 0));
        usort($kept, fn (array $x, array $y) => [($y['value_done'][$main] ?? 0), $y['due'], (string) $x['name']]
            <=> [($x['value_done'][$main] ?? 0), $x['due'], (string) $y['name']]);

        return array_map(function (array $r) {
            ksort($r['value_done']);
            $r['value_done'] = (object) $r['value_done'];

            return $r;
        }, $kept);
    }

    /** The currency with the most visits done (ties: alphabetical); null when nothing was done. */
    private static function mainCurrency(array $money): ?string
    {
        $done = array_filter(array_map(fn (array $m) => $m['done'], $money));
        if ($done === []) {
            return null;
        }
        ksort($done);
        arsort($done);

        return (string) array_key_first($done);
    }

    private static function sourceGroup(?string $source): string
    {
        $s = strtolower(trim((string) $source));

        return $s === '' ? 'other' : (in_array($s, self::DESK_SOURCES, true) ? 'desk' : 'online');
    }
}
```

`arsort` keeps the alphabetical order of equal values on PHP 8 (the sort is stable), so a tie goes to the currency
first in the alphabet.

- [ ] **Step 5: Write the controller and the route**

`app/Http/Controllers/Api/V1/Admin/Appointments/InsightsController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Services\Appointments\Insights\InsightsPeriod;
use App\Services\Appointments\Insights\InsightsReport;
use App\Services\Appointments\Setup\SetupAccess;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** How the venue is doing over a period (Part G): managers only. */
class InsightsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $period = InsightsPeriod::fromInput($request->query('from'), $request->query('to'));

        return response()->json(InsightsReport::for((int) app('current_organization_id'), $period, CarbonImmutable::now()));
    }
}
```

In `routes/api.php`, directly under
`Route::get('takings', [\App\Http\Controllers\Api\V1\Admin\Appointments\MoneyController::class, 'takings']);`, add:

```php
                // Insights: how the venue is doing over a period (spec 2026-10-06).
                Route::get('insights', [\App\Http\Controllers\Api\V1\Admin\Appointments\InsightsController::class, 'show']);
```

- [ ] **Step 6: Run the feature test to see it pass**

Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/InsightsTest.php`

Expected: PASS, `Tests: 13 passed`.

Read every failure against spec §4 before changing anything. Where the spec and an expectation above disagree, the
spec wins: fix the expectation and ledger a ruling. Two known traps:
- The fixture venue's zone resolves to UTC, so `now` is `2026-10-05T06:00`.
- `AppointmentMoney` counts a "paid" label with no ledger rows (`legacy_marked_paid`) as paid in full.

- [ ] **Step 7: Run Part E's money tests and the whole Appointments suite**

Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments`

Expected: PASS. 310 before this part, plus this task's 13, gives `Tests: 323 passed`. Every Part E money test passes
unchanged, which proves `summary()` answers exactly as before.

- [ ] **Step 8: Commit**

`<workspace>/tools/commit-2.txt`:

```
Insights: count a period and the one before for managers

GET /v1/admin/appointments/insights?from&to (managers only; 422
invalid_period beyond a year). InsightsReport reads the period's
appointments and their ledger rows in two queries per period, puts each in
its group, and adds up money with Part E's own rules: value of visits done,
money taken for the period's visits, still owed. Rows by service and by
person, sources (desk, online, other), the period before. Every brand, one
organisation. AppointmentMoney::amountsFrom() gives the money figures from
rows already loaded; summary() answers as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

```bash
git add app/Services/Appointments/Money/AppointmentMoney.php app/Services/Appointments/Insights/InsightsReport.php app/Http/Controllers/Api/V1/Admin/Appointments/InsightsController.php routes/api.php tests/Feature/Appointments/InsightsTest.php
git commit -q -F <workspace>/tools/commit-2.txt
```

---

### Task 3: Frontend types, API call and the pure math

**Files:**
- Modify: `frontend/src/appointments/lib/types.ts` (after the `Takings` interface)
- Modify: `frontend/src/appointments/lib/api.ts` (after `takings:`)
- Create: `frontend/src/appointments/insights/insightsMath.ts`
- Test: `frontend/src/appointments/insights/insightsMath.test.ts`

**Interfaces:**
- Consumes: the JSON of Task 2; `addDays`, `weekdayOf`, `monthOf`, `addMonths`, `isDateKey` from `lib/wallClock`.
- Produces:
  - types `Insights`, `InsightsFigures`, `InsightsMoney`, `InsightsRow`, `InsightsGroup`, `InsightsSpan`;
  - `appointmentsApi.insights(from: DateKey, to: DateKey): Promise<Insights>`;
  - from `insightsMath.ts`:
    - `PICKS`, `type Pick`, `type Range`;
    - `rangeFor(pick, today)`, `pickOf(range, today)`, `rangeFromSearch(params, today)`;
    - `share(count, due)`, `formatShare(value, locale)`;
    - `countChange(now, before)`, `pointsChange(now, before)`, `moneyChange(now, before)`;
    - `type Metric`, `toneOf(metric, direction)`, `TONE_CLASS`, `ARROW`;
    - `average(m)`, `onlineShare(s)`, `formatPeriod(range, locale)`, `needsDeskNote(from, since)`.

- [ ] **Step 1: Add the types and the API call**

In `frontend/src/appointments/lib/types.ts`, after the `Takings` interface:

```ts
/** Part G: the six groups an appointment falls into, by what it is now (spec §4.2). */
export type InsightsGroup = 'done' | 'no_show' | 'unmarked' | 'late_cancel' | 'early_cancel' | 'ahead'
export interface InsightsMoney { done: number; value_done: number; taken: number; owed_done: number }
/** A row by service or by person. `id: null` is "No one assigned"; `name: null` with an id is a removed record. */
export interface InsightsRow {
  id: number | null
  name: string | null
  due: number
  done: number
  no_show: number
  late_cancel: number
  value_done: Record<string, number>
}
export interface InsightsFigures {
  groups: Record<InsightsGroup, number>
  /** Done + no-show + not marked yet + cancelled late: every rate is out of this. */
  due: number
  money: Record<string, InsightsMoney>
  main_currency: string | null
  by_service: InsightsRow[]
  by_person: InsightsRow[]
  sources: { online: number; desk: number; other: number }
}
export interface InsightsSpan { from: DateKey; to: DateKey; days: number }
export interface Insights {
  period: InsightsSpan
  previous: InsightsSpan
  now: Wall
  cancel_hours: number
  desk_ledger_since: DateKey
  current: InsightsFigures
  before: InsightsFigures
}
```

In `frontend/src/appointments/lib/api.ts`, add `Insights` to the type import from `./types`, and after the
`takings:` line:

```ts
  insights: (from: DateKey, to: DateKey): Promise<Insights> => watched(api.get(`${BASE}/insights`, { params: { from, to } })),
```

- [ ] **Step 2: Write the failing math test**

`frontend/src/appointments/insights/insightsMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  average, countChange, formatPeriod, formatShare, moneyChange, needsDeskNote, onlineShare, pickOf, pointsChange,
  rangeFor, rangeFromSearch, share, toneOf,
} from './insightsMath'

describe('period picks on the venue calendar', () => {
  it('works out each pick from a Monday, a Sunday, the 31st and New Year’s Day', () => {
    expect(rangeFor('this_week', '2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeFor('this_week', '2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeFor('last_week', '2026-10-11')).toEqual({ from: '2026-09-28', to: '2026-10-04' })
    expect(rangeFor('this_month', '2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(rangeFor('last_month', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(rangeFor('last_month', '2026-01-01')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('names the pick a range is, or custom', () => {
    expect(pickOf({ from: '2026-10-05', to: '2026-10-11' }, '2026-10-07')).toBe('this_week')
    expect(pickOf({ from: '2026-09-01', to: '2026-09-30' }, '2026-10-07')).toBe('last_month')
    expect(pickOf({ from: '2026-09-03', to: '2026-09-30' }, '2026-10-07')).toBe('custom')
  })

  it('reads the address, and opens on This week when it is missing or garbled', () => {
    const today = '2026-10-07'
    expect(rangeFromSearch(new URLSearchParams('from=2026-09-01&to=2026-09-30'), today)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    for (const q of ['', 'from=abc&to=2026-09-30', 'from=2026-09-01', 'to=2026-09-30', 'from=2026-9-1&to=2026-09-30']) {
      expect(rangeFromSearch(new URLSearchParams(q), today)).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    }
    // From after To is passed on: the server answers with its own sentence.
    expect(rangeFromSearch(new URLSearchParams('from=2026-09-30&to=2026-09-01'), today)).toEqual({ from: '2026-09-30', to: '2026-09-01' })
  })
})

describe('rates out of bookings due', () => {
  it('has no rate when nothing is due', () => {
    expect(share(0, 0)).toBeNull()
    expect(formatShare(null, 'en')).toBe('—')
  })

  it('shows one decimal under 10% and none from 10%', () => {
    expect(formatShare(share(6, 108), 'en')).toBe('5.6%')
    expect(formatShare(share(84, 108), 'en')).toBe('78%')
    expect(formatShare(share(0, 12), 'en')).toBe('0%')
    expect(formatShare(share(12, 12), 'en')).toBe('100%')
  })
})

describe('changes from the period before', () => {
  it('compares counts, even from zero', () => {
    expect(countChange(84, 72)).toEqual({ direction: 'up', delta: 12 })
    expect(countChange(3, 5)).toEqual({ direction: 'down', delta: 2 })
    expect(countChange(4, 4)).toEqual({ direction: 'same', delta: 0 })
    expect(countChange(3, 0)).toEqual({ direction: 'up', delta: 3 })
  })

  it('compares rates in points, and not at all when either has nothing due', () => {
    expect(pointsChange(6 / 108, 0.068)).toEqual({ direction: 'down', delta: 1.2 })
    expect(pointsChange(null, 0.05)).toBeNull()
    expect(pointsChange(0.05, null)).toBeNull()
  })

  it('compares money only when both periods had that currency', () => {
    expect(moneyChange(4210, 3680)).toEqual({ direction: 'up', delta: 530 })
    expect(moneyChange(10.1, 10.1)).toEqual({ direction: 'same', delta: 0 })
    expect(moneyChange(4210, undefined)).toBeNull()
    expect(moneyChange(undefined, 10)).toBeNull()
  })

  it('colours a change by what it means for the venue', () => {
    expect(toneOf('done', 'up')).toBe('good')
    expect(toneOf('value_done', 'down')).toBe('bad')
    expect(toneOf('no_show', 'up')).toBe('bad')
    expect(toneOf('late_cancel', 'down')).toBe('good')
    expect(toneOf('taken', 'same')).toBe('plain')
  })
})

describe('money and sources', () => {
  it('averages over visits done in that currency, and has no average without any', () => {
    expect(average({ done: 84, value_done: 4210, taken: 3950, owed_done: 260 })).toBeCloseTo(50.119, 3)
    expect(average({ done: 0, value_done: 0, taken: 40, owed_done: 0 })).toBeNull()
  })

  it('gives the online share of every booking in the period', () => {
    expect(onlineShare({ online: 61, desk: 44, other: 3 })).toBeCloseTo(61 / 108, 6)
    expect(onlineShare({ online: 0, desk: 0, other: 0 })).toBeNull()
  })

  it('writes the period as dates', () => {
    const text = formatPeriod({ from: '2026-10-05', to: '2026-10-11' }, 'en-GB')
    expect(text).toContain('5')
    expect(text).toContain('11')
    expect(text).toContain('Oct')
    expect(text).toContain('2026')
  })

  it('warns about money before the desk ledger only for periods that start before it', () => {
    expect(needsDeskNote('2026-10-04', '2026-10-05')).toBe(true)
    expect(needsDeskNote('2026-10-05', '2026-10-05')).toBe(false)
  })
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd frontend && npx vitest run src/appointments/insights/insightsMath.test.ts`

Expected: FAIL with `Failed to resolve import "./insightsMath"`.

- [ ] **Step 4: Write `insightsMath.ts`**

`frontend/src/appointments/insights/insightsMath.ts`:

```ts
import type { DateKey, InsightsMoney } from '../lib/types'
import { addDays, addMonths, isDateKey, monthOf, weekdayOf } from '../lib/wallClock'

/** Part G's arithmetic, in one place: the server sends counts and money, the screen works out the rest (spec §5.1). */

export type Pick = 'this_week' | 'last_week' | 'this_month' | 'last_month'
export const PICKS: Pick[] = ['this_week', 'last_week', 'this_month', 'last_month']
export interface Range { from: DateKey; to: DateKey }

const lastDayOf = (month: string): DateKey => addDays(`${addMonths(month, 1)}-01`, -1)

/** A quick pick on the venue's calendar; weeks run Monday to Sunday, as in the calendar. */
export function rangeFor(pick: Pick, today: DateKey): Range {
  const monday = addDays(today, -weekdayOf(today))
  const month = monthOf(today)
  switch (pick) {
    case 'this_week': return { from: monday, to: addDays(monday, 6) }
    case 'last_week': return { from: addDays(monday, -7), to: addDays(monday, -1) }
    case 'this_month': return { from: `${month}-01`, to: lastDayOf(month) }
    case 'last_month': {
      const before = addMonths(month, -1)
      return { from: `${before}-01`, to: lastDayOf(before) }
    }
  }
}

export function pickOf(range: Range, today: DateKey): Pick | 'custom' {
  return PICKS.find(p => {
    const r = rangeFor(p, today)
    return r.from === range.from && r.to === range.to
  }) ?? 'custom'
}

/** The period in the address, or This week when it is missing or garbled. The server judges the rest (From after To, a year). */
export function rangeFromSearch(params: URLSearchParams, today: DateKey): Range {
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  return isDateKey(from) && isDateKey(to) ? { from, to } : rangeFor('this_week', today)
}

/** A share of bookings due; null when nothing was due (spec §4.3). */
export function share(count: number, due: number): number | null {
  return due > 0 ? count / due : null
}

/** "5.6%" under 10%, "78%" from 10%, "—" without a rate. */
export function formatShare(value: number | null, locale: string): string {
  if (value === null) return '—'
  const digits = value > 0 && value < 0.1 ? 1 : 0
  return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

export type Direction = 'up' | 'down' | 'same'
export interface Change { direction: Direction; delta: number }

const changeOf = (diff: number): Change => ({ direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same', delta: Math.abs(diff) })

export const countChange = (now: number, before: number): Change => changeOf(now - before)

/** In percentage points, to one decimal; none when either period had nothing due. */
export function pointsChange(now: number | null, before: number | null): Change | null {
  if (now === null || before === null) return null
  return changeOf(Math.round((now - before) * 1000) / 10)
}

/** Only when both periods had money in that currency. */
export function moneyChange(now: number | undefined, before: number | undefined): Change | null {
  if (now === undefined || before === undefined) return null
  return changeOf(Math.round((now - before) * 100) / 100)
}

export type Metric = 'done' | 'no_show' | 'late_cancel' | 'value_done' | 'average' | 'taken'
const HIGHER_IS_BETTER: Record<Metric, boolean> = { done: true, no_show: false, late_cancel: false, value_done: true, average: true, taken: true }

export function toneOf(metric: Metric, direction: Direction): 'good' | 'bad' | 'plain' {
  if (direction === 'same') return 'plain'
  return (direction === 'up') === HIGHER_IS_BETTER[metric] ? 'good' : 'bad'
}

export const TONE_CLASS: Record<'good' | 'bad' | 'plain', string> = { good: 'text-a-st-confirmed', bad: 'text-a-danger', plain: 'text-a-text-2' }
export const ARROW: Record<Direction, string> = { up: '▲', down: '▼', same: '' }

export const average = (m: InsightsMoney): number | null => (m.done > 0 ? m.value_done / m.done : null)

export function onlineShare(s: { online: number; desk: number; other: number }): number | null {
  return share(s.online, s.online + s.desk + s.other)
}

/** "6–12 Oct 2026" in the reader's language; venue dates, so read in UTC. */
export function formatPeriod(range: Range, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return fmt.formatRange(new Date(`${range.from}T00:00:00Z`), new Date(`${range.to}T00:00:00Z`))
}

export const needsDeskNote = (from: DateKey, since: DateKey): boolean => from < since
```

- [ ] **Step 5: Run it to see it pass, and type-check**

Run: `cd frontend && npx vitest run src/appointments/insights/insightsMath.test.ts && npx tsc -b`

Expected: PASS (13 tests), and tsc exits 0.

If `tsc` rejects `formatRange` because of the `lib` setting, add `// formatRange is ES2021` beside it and
cast through
`(fmt as Intl.DateTimeFormat & { formatRange(a: Date, b: Date): string })`. Ledger the ruling.

- [ ] **Step 6: Commit**

`<workspace>/tools/commit-3.txt`:

```
Insights: types, the API call and the screen's arithmetic

The period picks on the venue calendar (weeks Monday to Sunday), the
address read back with This week as the fallback, rates out of bookings
due with "—" when nothing was due, changes in counts, points and money,
the colour each change means, the average per visit and the online share.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

```bash
git add frontend/src/appointments/lib/types.ts frontend/src/appointments/lib/api.ts frontend/src/appointments/insights/insightsMath.ts frontend/src/appointments/insights/insightsMath.test.ts
git commit -q -F <workspace>/tools/commit-3.txt
```

---

### Task 4: The Insights screen, its menu item and its words

**Files:**
- Create: `frontend/src/appointments/insights/InsightsPage.tsx`
- Test: `frontend/src/appointments/insights/insights.test.tsx`
- Modify: `frontend/src/appointments/AppointmentsApp.tsx` (route), `frontend/src/appointments/AppointmentsShell.tsx`
  (menu item, around line 52), `frontend/src/appointments/AppointmentsShell.test.tsx`
- Modify: `frontend/src/appointments/i18n/appointments.{en,ru,de,fr,es}.json`,
  `frontend/src/appointments/i18n/appointmentsLocales.test.ts`
- Tool: `<workspace>/tools/add-partg-strings.cjs`

**Interfaces:**
- Consumes:
  - `Insights` and `appointmentsApi.insights` (Task 3), and everything exported by `insightsMath.ts`;
  - `useBoot()` (`boot.venue.today`);
  - `money` from `../../lib/money`, `failureOf` from `../lib/api`, `Notice` from `../ui/Notice`.
- Produces:
  - `InsightsPage` (route `/appointments/insights`);
  - `InsightsView({ data, locale }: { data: Insights; locale: string })` for tests;
  - `InsightsError({ error }: { error: unknown })` for tests;
  - the menu item `href="/appointments/insights"`, shown only when `staff.can_manage`.

- [ ] **Step 1: Write the failing screen and menu tests**

`frontend/src/appointments/insights/insights.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Insights, InsightsFigures } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { InsightsView, InsightsError } = await import('./InsightsPage')

const empty: InsightsFigures = {
  groups: { done: 0, no_show: 0, unmarked: 0, late_cancel: 0, early_cancel: 0, ahead: 0 },
  due: 0, money: {}, main_currency: null, by_service: [], by_person: [], sources: { online: 0, desk: 0, other: 0 },
}
const week: Insights = {
  period: { from: '2026-10-05', to: '2026-10-11', days: 7 },
  previous: { from: '2026-09-28', to: '2026-10-04', days: 7 },
  now: '2026-10-08T14:05',
  cancel_hours: 24,
  desk_ledger_since: '2026-10-05',
  current: {
    groups: { done: 84, no_show: 6, unmarked: 9, late_cancel: 9, early_cancel: 14, ahead: 31 },
    due: 108,
    money: { EUR: { done: 84, value_done: 4210, taken: 3950, owed_done: 260 } },
    main_currency: 'EUR',
    by_service: [{ id: 3, name: 'Haircut', due: 52, done: 44, no_show: 3, late_cancel: 4, value_done: { EUR: 1980 } },
      { id: 9, name: null, due: 1, done: 1, no_show: 0, late_cancel: 0, value_done: { EUR: 30 } }],
    by_person: [{ id: null, name: null, due: 2, done: 2, no_show: 0, late_cancel: 0, value_done: { EUR: 90 } }],
    sources: { online: 61, desk: 44, other: 3 },
  },
  before: {
    ...empty,
    groups: { done: 72, no_show: 7, unmarked: 0, late_cancel: 7, early_cancel: 10, ahead: 0 },
    due: 86,
    money: { EUR: { done: 72, value_done: 3680, taken: 3540, owed_done: 140 } },
    main_currency: 'EUR',
  },
}

describe('Insights', () => {
  it('names the period, what it is compared with and what late means', () => {
    const html = renderToStaticMarkup(<InsightsView data={week} locale="en-GB" />)
    expect(html).toContain('compared with')
    expect(html).toContain('late = cancelled inside 24 h')
    expect(html).not.toContain('were not recorded here') // the period starts on the ledger's first day
  })

  it('shows the seven tiles with shares and changes from the period before', () => {
    const html = renderToStaticMarkup(<InsightsView data={week} locale="en" />)
    for (const title of ['Visits done', 'No-shows', 'Late cancellations', 'Value of visits done', 'Average per visit', 'Money taken', 'Still owed']) {
      expect(html).toContain(title)
    }
    expect(html).toContain('78%')        // 84 of 108
    expect(html).toContain('5.6%')       // 6 of 108
    expect(html).toContain('▲ 12 vs 72') // visits done
    expect(html).toContain('€4,210.00')
    expect(html).toContain('▲ €530.00')
    expect(html).toContain('text-a-st-confirmed') // a good change is green
    expect(html).toContain('text-a-danger')       // late cancellations went up: red
  })

  it('says what the rates are out of and what is not counted in them', () => {
    expect(renderToStaticMarkup(<InsightsView data={week} locale="en" />))
      .toContain('Out of 108 bookings due · 9 not marked yet (mark them Completed or No-show) · 14 cancelled in time · 31 booked ahead')
  })

  it('lists rows by service and by person, with removed and unassigned rows named', () => {
    const html = renderToStaticMarkup(<InsightsView data={week} locale="en" />)
    expect(html).toContain('By service')
    expect(html).toContain('Haircut')
    expect(html).toContain('(removed)')
    expect(html).toContain('By person')
    expect(html).toContain('No one assigned')
  })

  it('says where bookings come from', () => {
    expect(renderToStaticMarkup(<InsightsView data={week} locale="en" />))
      .toContain('Online 61 · At the desk 44 · Other 3 — booked online: 56%')
  })

  it('reads — when nothing is due', () => {
    const ahead: Insights = { ...week, current: { ...empty, groups: { ...empty.groups, ahead: 5 }, sources: { online: 5, desk: 0, other: 0 } } }
    const html = renderToStaticMarkup(<InsightsView data={ahead} locale="en" />)
    expect(html).toContain('—')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('(0%)') // a rate with nothing due is "—", never 0% (the sources line's 100% is right)
  })

  it('shows one money line per currency', () => {
    const two: Insights = { ...week, current: { ...week.current, money: { EUR: week.current.money.EUR, USD: { done: 2, value_done: 100, taken: 100, owed_done: 0 } } } }
    const html = renderToStaticMarkup(<InsightsView data={two} locale="en" />)
    expect(html).toContain('€4,210.00')
    expect(html).toContain('$100.00')
  })

  it('warns that money before the desk ledger was not recorded', () => {
    const october: Insights = { ...week, period: { from: '2026-10-01', to: '2026-10-31', days: 31 } }
    expect(renderToStaticMarkup(<InsightsView data={october} locale="en" />)).toContain('were not recorded here')
  })

  it('says so when the period has no appointments', () => {
    expect(renderToStaticMarkup(<InsightsView data={{ ...week, current: empty }} locale="en" />)).toContain('No appointments in this period.')
  })

  it('shows the server’s sentence for a refused period', () => {
    const refused = { response: { status: 422, data: { error: 'invalid_period', message: 'Choose a period of up to a year.' } } }
    expect(renderToStaticMarkup(<InsightsError error={refused} />)).toContain('Choose a period of up to a year.')
  })
})
```

In `frontend/src/appointments/AppointmentsShell.test.tsx`, add inside `describe('AppointmentsShell', …)`:

```tsx
  it('offers Insights to managers only', () => {
    expect(render({ data: { ...boot, staff: { ...boot.staff, can_manage: true } } })).toContain('href="/appointments/insights"')
    expect(render({})).not.toContain('href="/appointments/insights"')
  })
```

In `frontend/src/appointments/i18n/appointmentsLocales.test.ts`, add to `FAMILIES`:

```ts
  'insights.pick': ['this_week', 'last_week', 'this_month', 'last_month', 'custom'],
  'insights.tile': ['done', 'no_show', 'late_cancel', 'value_done', 'average', 'taken', 'owed_done'],
```

and add `'invalid_period'` to the `error` list, after `'coupon_returned'`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run src/appointments/insights src/appointments/AppointmentsShell.test.tsx src/appointments/i18n/appointmentsLocales.test.ts`

Expected: FAIL. The resolve error is `Failed to resolve import "./InsightsPage"`, the shell test fails on
`href="/appointments/insights"`, and the locale test reports `missing: insights.pick.this_week …` in all five
languages.

- [ ] **Step 3: Add the words in all five languages**

Save `<workspace>/tools/add-partg-strings.cjs` (Write tool) and run it from the feature worktree root:
`node <workspace>/tools/add-partg-strings.cjs`.

```js
// node <ws>/tools/add-partg-strings.cjs — Part G's words in each workspace bundle. Run from the feature worktree root.
// Adds "insights" to the one-line "nav" block, "invalid_period" to the "error" block, and a new "insights" block
// before "takings"; never reformats the rest of the file; verifies after.
const fs = require('fs')
const W = {
  en: {
    nav: 'Insights',
    invalid_period: 'Choose a period of up to a year.',
    insights: {
      title: 'Insights',
      pick: { this_week: 'This week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month', custom: 'Choose dates' },
      from: 'From', to: 'To', show: 'Show',
      period_line: '{{period}} · compared with {{previous}} · late = cancelled inside {{hours}} h',
      money_note: 'Money taken counts the money for these visits whenever it was paid; Takings shows money by the day it moved.',
      desk_note: 'Desk payments before {{date}} were not recorded here: money taken may be lower, and still owed higher, than it really was.',
      tile: { done: 'Visits done', no_show: 'No-shows', late_cancel: 'Late cancellations', value_done: 'Value of visits done', average: 'Average per visit', taken: 'Money taken', owed_done: 'Still owed' },
      change_count: '{{arrow}} {{delta}} vs {{before}}', change_points: '{{arrow}} {{delta}} pts', change_money: '{{arrow}} {{delta}}', no_change: 'No change',
      out_of: 'Out of {{due}} bookings due · {{unmarked}} not marked yet (mark them Completed or No-show) · {{early}} cancelled in time · {{ahead}} booked ahead',
      by_service: 'By service', by_person: 'By person',
      col: { name: 'Name', due: 'Due', done: 'Done', no_show: 'No-shows', late_cancel: 'Late cancellations', value_done: 'Value' },
      no_one: 'No one assigned', removed: '(removed)',
      sources_title: 'Where bookings come from',
      sources: 'Online {{online}} · At the desk {{desk}} · Other {{other}} — booked online: {{share}}',
      empty: 'No appointments in this period.',
    },
  },
  ru: {
    nav: 'Аналитика',
    invalid_period: 'Выберите период не длиннее года.',
    insights: {
      title: 'Аналитика',
      pick: { this_week: 'Эта неделя', last_week: 'Прошлая неделя', this_month: 'Этот месяц', last_month: 'Прошлый месяц', custom: 'Выбрать даты' },
      from: 'С', to: 'По', show: 'Показать',
      period_line: '{{period}} · в сравнении с {{previous}} · поздняя отмена = менее чем за {{hours}} ч',
      money_note: '«Получено» — деньги за эти визиты, когда бы их ни оплатили; «Касса» показывает деньги по дню, когда они поступили.',
      desk_note: 'Оплаты на месте до {{date}} здесь не записывались: получено может быть меньше, а долг — больше, чем было на самом деле.',
      tile: { done: 'Проведено визитов', no_show: 'Неявки', late_cancel: 'Поздние отмены', value_done: 'Стоимость проведённых визитов', average: 'Средний чек', taken: 'Получено', owed_done: 'Ещё не оплачено' },
      change_count: '{{arrow}} {{delta}} против {{before}}', change_points: '{{arrow}} {{delta}} п.п.', change_money: '{{arrow}} {{delta}}', no_change: 'Без изменений',
      out_of: 'Из {{due}} записей к визиту · {{unmarked}} не отмечены (отметьте «Завершена» или «Неявка») · {{early}} отменены вовремя · {{ahead}} впереди',
      by_service: 'По услугам', by_person: 'По сотрудникам',
      col: { name: 'Название', due: 'Записей', done: 'Проведено', no_show: 'Неявки', late_cancel: 'Поздние отмены', value_done: 'Стоимость' },
      no_one: 'Без сотрудника', removed: '(удалено)',
      sources_title: 'Откуда записи',
      sources: 'Онлайн {{online}} · На месте {{desk}} · Другое {{other}} — онлайн: {{share}}',
      empty: 'За этот период записей нет.',
    },
  },
  de: {
    nav: 'Auswertungen',
    invalid_period: 'Wählen Sie einen Zeitraum von höchstens einem Jahr.',
    insights: {
      title: 'Auswertungen',
      pick: { this_week: 'Diese Woche', last_week: 'Letzte Woche', this_month: 'Dieser Monat', last_month: 'Letzter Monat', custom: 'Zeitraum wählen' },
      from: 'Von', to: 'Bis', show: 'Anzeigen',
      period_line: '{{period}} · verglichen mit {{previous}} · spät = weniger als {{hours}} Std. vorher storniert',
      money_note: '„Eingenommen“ zählt das Geld für diese Termine, egal wann es gezahlt wurde; die Kasse zeigt Geld nach dem Tag, an dem es floss.',
      desk_note: 'Zahlungen vor Ort vor dem {{date}} wurden hier nicht erfasst: Eingenommenes kann niedriger und Offenes höher sein als in Wirklichkeit.',
      tile: { done: 'Erledigte Termine', no_show: 'Nicht erschienen', late_cancel: 'Späte Stornierungen', value_done: 'Wert der erledigten Termine', average: 'Durchschnitt pro Termin', taken: 'Eingenommen', owed_done: 'Noch offen' },
      change_count: '{{arrow}} {{delta}} gegenüber {{before}}', change_points: '{{arrow}} {{delta}} Pkt.', change_money: '{{arrow}} {{delta}}', no_change: 'Unverändert',
      out_of: 'Von {{due}} fälligen Buchungen · {{unmarked}} noch nicht markiert (als „Abgeschlossen“ oder „Nicht erschienen“ markieren) · {{early}} rechtzeitig storniert · {{ahead}} im Voraus gebucht',
      by_service: 'Nach Leistung', by_person: 'Nach Person',
      col: { name: 'Name', due: 'Fällig', done: 'Erledigt', no_show: 'Nicht erschienen', late_cancel: 'Spät storniert', value_done: 'Wert' },
      no_one: 'Niemand zugeordnet', removed: '(entfernt)',
      sources_title: 'Woher die Buchungen kommen',
      sources: 'Online {{online}} · Vor Ort {{desk}} · Sonstige {{other}} — online gebucht: {{share}}',
      empty: 'Keine Termine in diesem Zeitraum.',
    },
  },
  fr: {
    nav: 'Statistiques',
    invalid_period: "Choisissez une période d'un an maximum.",
    insights: {
      title: 'Statistiques',
      pick: { this_week: 'Cette semaine', last_week: 'Semaine dernière', this_month: 'Ce mois-ci', last_month: 'Mois dernier', custom: 'Choisir les dates' },
      from: 'Du', to: 'Au', show: 'Afficher',
      period_line: '{{period}} · comparé à {{previous}} · tardive = annulée moins de {{hours}} h avant',
      money_note: "« Encaissé » compte l'argent de ces rendez-vous, quelle que soit la date du paiement ; la caisse montre l'argent par jour de mouvement.",
      desk_note: "Les paiements sur place avant le {{date}} n'étaient pas enregistrés ici : l'encaissé peut être plus bas, et le reste dû plus élevé, qu'en réalité.",
      tile: { done: 'Rendez-vous effectués', no_show: 'Absences', late_cancel: 'Annulations tardives', value_done: 'Valeur des rendez-vous effectués', average: 'Moyenne par rendez-vous', taken: 'Encaissé', owed_done: 'Reste dû' },
      change_count: '{{arrow}} {{delta}} contre {{before}}', change_points: '{{arrow}} {{delta}} pts', change_money: '{{arrow}} {{delta}}', no_change: 'Inchangé',
      out_of: 'Sur {{due}} réservations dues · {{unmarked}} pas encore marquées (marquez-les « Terminé » ou « Absent ») · {{early}} annulées à temps · {{ahead}} à venir',
      by_service: 'Par prestation', by_person: 'Par personne',
      col: { name: 'Nom', due: 'Dues', done: 'Effectués', no_show: 'Absences', late_cancel: 'Annulations tardives', value_done: 'Valeur' },
      no_one: "Personne n'est assigné", removed: '(supprimé)',
      sources_title: 'Provenance des réservations',
      sources: 'En ligne {{online}} · Sur place {{desk}} · Autre {{other}} — réservé en ligne : {{share}}',
      empty: 'Aucun rendez-vous sur cette période.',
    },
  },
  es: {
    nav: 'Estadísticas',
    invalid_period: 'Elija un periodo de hasta un año.',
    insights: {
      title: 'Estadísticas',
      pick: { this_week: 'Esta semana', last_week: 'Semana pasada', this_month: 'Este mes', last_month: 'Mes pasado', custom: 'Elegir fechas' },
      from: 'Desde', to: 'Hasta', show: 'Mostrar',
      period_line: '{{period}} · comparado con {{previous}} · tardía = cancelada con menos de {{hours}} h',
      money_note: '«Cobrado» cuenta el dinero de estas citas, se pagara cuando se pagara; la caja muestra el dinero por el día en que se movió.',
      desk_note: 'Los pagos en el local antes del {{date}} no se registraban aquí: lo cobrado puede ser menor, y lo pendiente mayor, de lo que fue en realidad.',
      tile: { done: 'Citas realizadas', no_show: 'No se presentaron', late_cancel: 'Cancelaciones tardías', value_done: 'Valor de las citas realizadas', average: 'Media por cita', taken: 'Cobrado', owed_done: 'Pendiente de cobro' },
      change_count: '{{arrow}} {{delta}} frente a {{before}}', change_points: '{{arrow}} {{delta}} pts', change_money: '{{arrow}} {{delta}}', no_change: 'Sin cambios',
      out_of: 'De {{due}} reservas debidas · {{unmarked}} sin marcar (márquelas como «Completada» o «No se presentó») · {{early}} canceladas a tiempo · {{ahead}} por venir',
      by_service: 'Por servicio', by_person: 'Por persona',
      col: { name: 'Nombre', due: 'Debidas', done: 'Realizadas', no_show: 'No se presentaron', late_cancel: 'Cancelaciones tardías', value_done: 'Valor' },
      no_one: 'Sin asignar', removed: '(eliminado)',
      sources_title: 'De dónde vienen las reservas',
      sources: 'En línea {{online}} · En el local {{desk}} · Otro {{other}} — reservado en línea: {{share}}',
      empty: 'No hay citas en este periodo.',
    },
  },
}

const indent = (text, n) => text.split('\n').map((line, i) => (i === 0 ? line : ' '.repeat(n) + line)).join('\n')
const once = (raw, re, file, what) => {
  const m = raw.match(re)
  if (!m || raw.split(m[0]).length !== 2) throw new Error(`${file}: ${what} is not where it was`)
  return m[0]
}

for (const [lang, w] of Object.entries(W)) {
  const file = `frontend/src/appointments/i18n/appointments.${lang}.json`
  let raw = fs.readFileSync(file, 'utf8')
  const json = JSON.parse(raw)
  if (json.nav.insights === undefined) {
    const nav = once(raw, /\n  "nav": \{ /, file, 'the one-line "nav" block')
    raw = raw.replace(nav, `${nav}"insights": ${JSON.stringify(w.nav)}, `)
  }
  if (json.error.invalid_period === undefined) {
    const error = once(raw, /\n  "error": \{\n/, file, 'the "error" block')
    raw = raw.replace(error, `${error}    "invalid_period": ${JSON.stringify(w.invalid_period)},\n`)
  }
  if (json.insights === undefined) {
    const takings = once(raw, /\n  "takings": \{\n/, file, 'the "takings" block')
    raw = raw.replace(takings, `\n  "insights": ${indent(JSON.stringify(w.insights, null, 2), 2)},${takings}`)
  }
  const after = JSON.parse(raw)
  if (after.nav.insights !== w.nav || after.error.invalid_period !== w.invalid_period
    || JSON.stringify(after.insights) !== JSON.stringify(w.insights)) {
    throw new Error(`${file}: Part G words not inserted`)
  }
  fs.writeFileSync(file, raw)
  console.log(`${file}: Part G words added`)
}
```

Expected output: five lines, `…appointments.<lang>.json: Part G words added`.

- [ ] **Step 4: Write the page**

`frontend/src/appointments/insights/InsightsPage.tsx`:

```tsx
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { money as fmt } from '../../lib/money'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi, failureOf } from '../lib/api'
import type { DateKey, Insights, InsightsFigures, InsightsRow } from '../lib/types'
import { formatDate } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import {
  ARROW, PICKS, TONE_CLASS, average, countChange, formatPeriod, formatShare, moneyChange, needsDeskNote, onlineShare,
  pickOf, pointsChange, rangeFor, rangeFromSearch, share, toneOf, type Change, type Metric, type Range,
} from './insightsMath'

const PICK_FALLBACK = { this_week: 'This week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month', custom: 'Choose dates' }
const TILE_FALLBACK = {
  done: 'Visits done', no_show: 'No-shows', late_cancel: 'Late cancellations', value_done: 'Value of visits done',
  average: 'Average per visit', taken: 'Money taken', owed_done: 'Still owed',
}

/** How the venue is doing over a period (Part G, managers only; the server refuses everyone else). */
export function InsightsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const [search, setSearch] = useSearchParams()
  const range = rangeFromSearch(search, boot.venue.today)
  const pick = pickOf(range, boot.venue.today)
  const [choosing, setChoosing] = useState(pick === 'custom')
  const [draft, setDraft] = useState<Range>(range)
  const q = useQuery({ queryKey: ['appointments', 'insights', range.from, range.to], queryFn: () => appointmentsApi.insights(range.from, range.to) })
  const go = (r: Range) => { setDraft(r); setSearch({ from: r.from, to: r.to }) }
  const input = 'rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <h1 className="text-xl font-semibold text-a-text">{t('appointments.insights.title', 'Insights')}</h1>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('appointments.insights.title', 'Insights')}>
        {PICKS.map(p => (
          <Button key={p} type="button" size="sm" variant={pick === p && !choosing ? 'primary' : 'ghost'} aria-pressed={pick === p && !choosing}
            onClick={() => { setChoosing(false); go(rangeFor(p, boot.venue.today)) }}>
            {t(`appointments.insights.pick.${p}`, PICK_FALLBACK[p])}
          </Button>
        ))}
        <Button type="button" size="sm" variant={choosing || pick === 'custom' ? 'primary' : 'ghost'} aria-pressed={choosing || pick === 'custom'} onClick={() => setChoosing(true)}>
          {t('appointments.insights.pick.custom', PICK_FALLBACK.custom)}
        </Button>
      </div>
      {choosing && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); go(draft) }}>
          <Field label={t('appointments.insights.from', 'From')}>
            <input type="date" className={input} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value as DateKey })} />
          </Field>
          <Field label={t('appointments.insights.to', 'To')}>
            <input type="date" className={input} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value as DateKey })} />
          </Field>
          <Button type="submit" size="sm">{t('appointments.insights.show', 'Show')}</Button>
        </form>
      )}
      {q.isLoading && <p className="text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {q.isError && <InsightsError error={q.error} />}
      {q.data && <InsightsView data={q.data} locale={i18n.language || 'en'} />}
    </div>
  )
}

/** A refusal in the server's own words (a period over a year, From after To); anything else, the workspace's sentence. */
export function InsightsError({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const f = failureOf(error)
  return (
    <Notice tone="danger">
      {f.code ? t(`appointments.error.${f.code}`, f.message) : t('appointments.common.error', 'Something went wrong. Please try again.')}
    </Notice>
  )
}

export function InsightsView({ data, locale }: { data: Insights; locale: string }) {
  const { t } = useTranslation()
  const now = data.current
  const before = data.before
  const total = Object.values(now.groups).reduce((a, b) => a + b, 0)
  const currencies = Object.keys(now.money).sort()

  const changeText = (c: Change | null, kind: 'count' | 'points' | 'money', before?: number, cur?: string) => {
    if (c === null) return '—'
    if (c.direction === 'same') return t('appointments.insights.no_change', 'No change')
    const delta = kind === 'money' ? fmt(c.delta, cur) : kind === 'points' ? c.delta.toLocaleString(locale) : String(c.delta)
    const key = kind === 'count' ? 'change_count' : kind === 'points' ? 'change_points' : 'change_money'
    const fallback = kind === 'count' ? '{{arrow}} {{delta}} vs {{before}}' : kind === 'points' ? '{{arrow}} {{delta}} pts' : '{{arrow}} {{delta}}'
    return t(`appointments.insights.${key}`, fallback, { arrow: ARROW[c.direction], delta, before })
  }
  const changeLine = (metric: Metric, c: Change | null, kind: 'count' | 'points' | 'money', prev?: number, cur?: string) => (
    <p className={`text-xs ${c ? TONE_CLASS[toneOf(metric, c.direction)] : TONE_CLASS.plain}`}>{changeText(c, kind, prev, cur)}</p>
  )

  const rate = (f: InsightsFigures, key: 'done' | 'no_show' | 'late_cancel') => share(f.groups[key], f.due)
  const countTile = (key: 'done' | 'no_show' | 'late_cancel') => (
    <Tile key={key} title={t(`appointments.insights.tile.${key}`, TILE_FALLBACK[key])}>
      <p className="text-2xl font-semibold text-a-text">{now.groups[key]} <span className="text-sm font-normal text-a-text-2">({formatShare(rate(now, key), locale)})</span></p>
      {key === 'done'
        ? changeLine('done', countChange(now.groups.done, before.groups.done), 'count', before.groups.done)
        : changeLine(key, pointsChange(rate(now, key), rate(before, key)), 'points')}
    </Tile>
  )
  const moneyTile = (key: 'value_done' | 'average' | 'taken' | 'owed_done') => (
    <Tile key={key} title={t(`appointments.insights.tile.${key}`, TILE_FALLBACK[key])}>
      {currencies.length === 0 && <p className="text-2xl font-semibold text-a-text">—</p>}
      {currencies.map(cur => {
        const m = now.money[cur]
        const p = before.money[cur]
        const value = key === 'average' ? average(m) : m[key]
        const prev = p === undefined ? undefined : key === 'average' ? average(p) ?? undefined : p[key]
        return (
          <div key={cur}>
            <p className="text-2xl font-semibold text-a-text">{value === null ? '—' : fmt(value, cur)}</p>
            {key !== 'owed_done' && changeLine(key, value === null ? null : moneyChange(value, prev), 'money', undefined, cur)}
          </div>
        )
      })}
    </Tile>
  )

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm text-a-text-2">
        <p>{t('appointments.insights.period_line', '{{period}} · compared with {{previous}} · late = cancelled inside {{hours}} h', {
          period: formatPeriod(data.period, locale), previous: formatPeriod(data.previous, locale), hours: data.cancel_hours,
        })}</p>
        <p>{t('appointments.insights.money_note', 'Money taken counts the money for these visits whenever it was paid; Takings shows money by the day it moved.')}</p>
        {needsDeskNote(data.period.from, data.desk_ledger_since) && (
          <Notice tone="warning">{t('appointments.insights.desk_note', 'Desk payments before {{date}} were not recorded here: money taken may be lower, and still owed higher, than it really was.', {
            date: formatDate(data.desk_ledger_since, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
          })}</Notice>
        )}
      </div>

      {total === 0
        ? <p className="text-sm text-a-text-2">{t('appointments.insights.empty', 'No appointments in this period.')}</p>
        : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {countTile('done')}
              {countTile('no_show')}
              {countTile('late_cancel')}
              {moneyTile('value_done')}
              {moneyTile('average')}
              {moneyTile('taken')}
              {moneyTile('owed_done')}
            </div>
            <p className="text-sm text-a-text-2">{t('appointments.insights.out_of', 'Out of {{due}} bookings due · {{unmarked}} not marked yet (mark them Completed or No-show) · {{early}} cancelled in time · {{ahead}} booked ahead', {
              due: now.due, unmarked: now.groups.unmarked, early: now.groups.early_cancel, ahead: now.groups.ahead,
            })}</p>
            <Breakdown title={t('appointments.insights.by_service', 'By service')} rows={now.by_service} locale={locale} />
            <Breakdown title={t('appointments.insights.by_person', 'By person')} rows={now.by_person} locale={locale} />
            <section className="space-y-1">
              <h2 className="text-base font-semibold text-a-text">{t('appointments.insights.sources_title', 'Where bookings come from')}</h2>
              <p className="text-sm text-a-text">{t('appointments.insights.sources', 'Online {{online}} · At the desk {{desk}} · Other {{other}} — booked online: {{share}}', {
                ...now.sources, share: formatShare(onlineShare(now.sources), locale),
              })}</p>
            </section>
          </>
        )}
    </div>
  )
}

function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-a-border bg-a-surface p-3 space-y-1">
      <h2 className="text-xs font-medium text-a-text-2">{title}</h2>
      {children}
    </section>
  )
}

function Breakdown({ title, rows, locale }: { title: string; rows: InsightsRow[]; locale: string }) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  const name = (r: InsightsRow) => r.id === null
    ? t('appointments.insights.no_one', 'No one assigned')
    : r.name ?? t('appointments.insights.removed', '(removed)')
  const cell = (count: number, due: number) => `${count} (${formatShare(share(count, due), locale)})`

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-a-text">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-a-text-2">
              <th className="py-1 font-medium">{t('appointments.insights.col.name', 'Name')}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.due', 'Due')}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.done', 'Done')}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.no_show', 'No-shows')}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.late_cancel', 'Late cancellations')}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.value_done', 'Value')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id ?? 'none'} className="border-t border-a-border">
                <td className="py-1 text-a-text">{name(r)}</td>
                <td className="text-right">{r.due}</td>
                <td className="text-right">{r.done}</td>
                <td className="text-right">{cell(r.no_show, r.due)}</td>
                <td className="text-right">{cell(r.late_cancel, r.due)}</td>
                <td className="text-right">{Object.entries(r.value_done).map(([cur, v]) => fmt(v, cur)).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Add the route and the menu item**

In `frontend/src/appointments/AppointmentsApp.tsx`:
- add `import { InsightsPage } from './insights/InsightsPage'`;
- under `<Route path="takings" element={<TakingsPage />} />`, add:

```tsx
          <Route path="insights" element={<InsightsPage />} />
```

In `frontend/src/appointments/AppointmentsShell.tsx`, add `TrendingUp` to the `lucide-react` import, and replace the
Takings line of `nav` with:

```tsx
    ...(data?.staff.can_manage ? [
      { to: '/appointments/takings', end: false, icon: Wallet, label: t('appointments.nav.takings', 'Takings') },
      { to: '/appointments/insights', end: false, icon: TrendingUp, label: t('appointments.nav.insights', 'Insights') },
    ] : []),
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd frontend && npx vitest run src/appointments/insights src/appointments/AppointmentsShell.test.tsx src/appointments/i18n/appointmentsLocales.test.ts`

Expected: PASS. insights.test.tsx has 10 tests, the shell test gains 1, and the locale test is green in all five
languages.

If an assertion on exact text fails because `money()` formats with the machine locale (`toLocaleString(undefined)`),
compare with what `money(4210, 'EUR')` returns in the same test run. Do not hard-code a different separator. Ledger the
ruling.

- [ ] **Step 7: Run the whole workspace frontend gate**

Run: `cd frontend && npx tsc -b && npx vitest run src/appointments && npx eslint src/appointments`

Expected: tsc exits 0. Vitest passes every file under `src/appointments`: 482 before this part, plus 13 (Task 3), 10
and 1 (this task). ESLint exits 0.

- [ ] **Step 8: Commit**

`<workspace>/tools/commit-4.txt`:

```
Insights: the screen for managers, in five languages

An Insights item beside Takings for managers. Period picks (this and last
week, this and last month, chosen dates) kept in the address; seven tiles
with the share of bookings due and the change from the period before,
coloured by what it means; what the rates are out of; rows by service and
by person; where bookings come from; the note on money before the desk
ledger; the server's own words for a refused period.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

```bash
git add frontend/src/appointments/insights/InsightsPage.tsx frontend/src/appointments/insights/insights.test.tsx frontend/src/appointments/AppointmentsApp.tsx frontend/src/appointments/AppointmentsShell.tsx frontend/src/appointments/AppointmentsShell.test.tsx frontend/src/appointments/i18n/appointments.en.json frontend/src/appointments/i18n/appointments.ru.json frontend/src/appointments/i18n/appointments.de.json frontend/src/appointments/i18n/appointments.fr.json frontend/src/appointments/i18n/appointments.es.json frontend/src/appointments/i18n/appointmentsLocales.test.ts
git commit -q -F <workspace>/tools/commit-4.txt
```

---

### Task 5: Runbook, whole suites and the browser check

**Files:**
- Modify: `docs/appointments-workspace.md` (remove "Insights;" from "What this milestone does not do"; add a section)

**Interfaces:**
- Consumes: everything above.
- Produces: the runbook section; the whole-branch evidence in the ledger.

- [ ] **Step 1: Update the runbook**

In `docs/appointments-workspace.md`, in "## What this milestone does not do", delete `Insights; ` at the start of the
paragraph. Before "## Selling Appointments on its own (Part C, 2026-10-02)", add:

```markdown
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
```

- [ ] **Step 2: Run the whole PHP suite by directory**

Make Part F's script this plan's (it writes `<ws>/<label>.txt`), then run it in the background. It takes about an
hour.

```bash
sed 's#^ws=.*#ws=.superpowers/sdd/2026-10-06-appointments-insights#' .superpowers/sdd/archive/2026-10-05-appointments-calendar-power/tools/suite-by-dir.sh > .superpowers/sdd/2026-10-06-appointments-insights/tools/suite-by-dir.sh
bash .superpowers/sdd/2026-10-06-appointments-insights/tools/suite-by-dir.sh after
```

Do not edit code in the worktree while it runs.

Expected: every line `exit=0`. The group count is 64, or 64 plus any new directory. Appointments is 323 and Unit
Appointments is 9 + 23 = 32. Every other group is identical to Part F's `final.txt` in the archive.

- [ ] **Step 3: Run the whole frontend**

Run: `cd frontend && npx tsc -b && npx vitest run && npx eslint src/appointments`

Expected: tsc 0, ESLint 0. Vitest fails only on the 4 known failures (3 `plannerMeta`, 1 portal `bookingSheet`).

- [ ] **Step 4: The browser check (eyes before tests)**

1. Follow Part F's recipe (its ledger in `.superpowers/sdd/archive/2026-10-05-appointments-calendar-power/`):
   - create the missing local tables with `scratchpad/partf-tables.php`, ledgering what was created;
   - start the API with
     `MAIL_MAILER=log QUEUE_CONNECTION=sync CORS_ALLOWED_ORIGINS=http://localhost:5180 php artisan serve --host=127.0.0.1 --port=8012`
     (background);
   - start the frontend with `cd frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5180 --strictPort`
     (background);
   - sign in as the local manager (`appointments-tester@example.test`).
2. At 1440 px open `/appointments/insights`, then This month, Last month, and a custom range across 5 Oct.
3. For one period, compare each figure by hand with the calendar (List view with "Show cancelled") and two
   appointment panels' money. Write the comparison into the ledger.
4. At phone width (390 px), check that the tiles wrap two to a row, the tables scroll sideways, and the page has no
   sideways scroll.
5. Run axe-core 4.10.2 from cdnjs in the page (WCAG 2.0/2.1/2.2 A and AA tags): 0 violations expected.
6. Sign in as a non-manager staff member (or switch the role locally and switch it back), and check that the menu item
   is gone and `/appointments/insights` shows the refusal.
7. Clean up:
   - stop both servers;
   - drop the tables only while they are empty (`scratchpad/partf-drop.php`);
   - remove any screenshot left in the main repo root;
   - change no booking data. This check only reads.

- [ ] **Step 5: Commit the runbook**

```bash
git add docs/appointments-workspace.md
git commit -q -m "Runbook: Insights (Part G)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then the final whole-branch review: superpowers:executing-plans "Final Review", with this plan's Review Focus pasted
verbatim to the reviewer.
