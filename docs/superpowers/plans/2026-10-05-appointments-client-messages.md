# HexaTech Appointments Part D — Client messages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When staff book, move, confirm or cancel an appointment, the client gets an email in their own language
(unless staff untick "Tell the client"). Every upcoming appointment gets one reminder at the venue's chosen time.
Every message is logged and shown on the appointment. Nothing is sent until a manager switches it on.

**Architecture:**
- A `client_messages` log table and one sender, `ClientMessenger`, decide and record every message.
- A queued job, `DeliverClientMessage`, re-reads the appointment and sends one translated mailable,
  `AppointmentMessageMail`.
- A scheduled command, `appointments:send-reminders`, sends the reminders.
- Three venue settings live in `BookingRules`.
- The workspace's and the full admin's staff actions call the sender with an optional `notify_client`.

**Tech Stack:** Laravel 13 / PHP 8.4, PHPUnit on sqlite with the repo's schema traits, Carbon translated formats,
Laravel translation files (`lang/`); React 19, TanStack Query 5, i18next (five bundles), Vitest static render.

**Spec:** `docs/superpowers/specs/2026-10-05-appointments-client-messages-design.md` (approved 2026-10-05). It is
corrected by planning rulings R1, R2 and R7 below, in the same commit as this plan.

## Global Constraints

- **PHP and test runs.** PHP is `/c/wamp64/bin/php/php8.4.20/php.exe`. Run one test path (or a few named files) per
  `artisan test` call; never a bare `php artisan test`. Read the `Tests:` line yourself. Helper:
  `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh <path> [<path> …]` from the feature worktree
  `C:\wamp64\www\Hexa-Tech-appointments` (branch `feature/appointments-workspace`).
- **Frontend checks.** `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh [vitest paths]`.
  Files changed outside `src/appointments` also get `cd frontend && npx eslint <files>`. The 3 `plannerMeta`
  failures and the `bookingSheet.test.tsx` clock time-bomb are pre-existing.
- **One migration,** additive: `client_messages`. Local PostgreSQL is shared: never run `artisan migrate` locally.
  Tests build the table in sqlite (`SetsUpAppointmentsSchema`).
- **Off by default.** `client_messages_staff_default` is false, `client_messages_reminder_hours` is 0 and
  `client_messages_language` is `en`, for every organisation, until a manager changes them in Setup.
- **Existing emails are not touched.** Do not edit `ServicePublicController::sendServiceBookingEmails`,
  `PortalBookingNotifier`, `PortalCancellationNotifier`, `BookingRefundService` or their mailables and views.
- **No new route.** The access map (`AccessMap`) already covers every path used.
- **Times** are the venue's wall clock (`VenueClock`, `AppointmentClock`); never the browser's or the server's zone.
- **What is stored.** Nothing beyond the recipient address. No subject or body is stored.
- **Mail.** `AppointmentMessageMail` must not implement `ShouldQueue`: the queued job sends it synchronously and
  then marks the row.
- **Workspace rules.** `frontend/src/appointments/` uses only `a-*` colour tokens and only `/v1/admin/appointments/…`
  API paths. Every visible string is `t('…', 'English fallback')` and exists in all five bundles.
- **Commits.** Never commit `frontend/dist`, `public/spa` or `resources/spa-shell` on the feature branch. Stage files
  by name. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, no
  deploy.

## Review Focus

1. **A move that changes only the team member.** It sends "moved" (the time stays, "With" changes), and an already
   sent reminder for that time is not sent again. (Tasks 5 and 7 test it.)
2. **A messy booking email.** `"  ADA@Example.Test "` is used, trimmed. `"n/a"` falls through to the client record's
   email. (Task 2 tests it.)
3. **Language written by hand on the client record.** `ru-RU`, `Русский` and `russian ` all mean Russian; `Latvian`
   falls back to the venue's language. (Task 2 tests it.)
4. **Bulk cancel over rows that are already cancelled.** They send nothing; the answer counts only the rest. (Task 6
   tests it.)
5. **A create request retried with the same Idempotency-Key.** It must not email "booked" twice. (Task 5 tests it.)

## Planning rulings (deviations from the spec, found while writing the code)

- **R1.** Messages lead with what happened ("Booked: Deep Tissue Massage at Lumière Salon, Tuesday 6 October 2026,
  10:00"). They do not put the industry noun ("appointment", "reservation") into sentences. In Russian, German,
  French and Spanish an inserted noun cannot agree in gender and case with the words around it. The spec's §4 noun
  rule is corrected in this commit. Cost if wrong: the email never says "appointment" or "reservation".
- **R2.** The API answers carry the message under `client_message` (bulk: `client_messages`), not `message`. The full
  admin's `destroy` and `bulk` answers already use `message` as a text field. The spec's §5.6 is corrected in this
  commit. Cost if wrong: none.
- **R3.** The new `client_email`, `messages` (appointment detail) and `messages` (bootstrap) fields are optional in
  the TypeScript types, so the existing test fixtures need no churn. The server always sends them. Cost if wrong:
  none at run time.
- **R4.** In the full admin:
  - the row's "Confirm" button and the bulk "Cancel" open a small dialog (`TellClientConfirm`) instead of
    `window.confirm`;
  - the booking drawer shows the checkbox inline when the chosen status would send.

  Cost if wrong: one more click for the row Confirm.
- **R5.** The checklist step `messages` sits after `online`, so the earlier steps keep their positions. Cost if wrong:
  none.
- **R6.** The full admin's create calls the sender inside its own transaction, because that code builds its answer
  inside the transaction. The job's dispatch is `afterCommit()`, so nothing is sent for a rolled-back booking. Cost if
  wrong: none.
- **R7.** The delivery job tries once. It catches a mail failure itself and marks the row `failed (mail_error)`,
  instead of rethrowing for the queue to retry. Production's queue driver is not visible from the repo. On the sync
  driver a rethrown failure would reach the staff action after its commit and answer 500. Cost if wrong: a passing
  mail outage is not retried; the appointment shows "could not be sent".

## File map

| File | Change |
|---|---|
| `app/Services/Appointments/Messages/MessageSettings.php` | new: the three settings |
| `app/Services/Booking/Setup/BookingRules.php`, `SetupChecklist.php` | settings fields; optional `messages` step |
| `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php` | `messages` |
| `database/migrations/2026_10_05_100000_create_client_messages.php` | new |
| `app/Models/ClientMessage.php` | new |
| `app/Services/Appointments/Messages/MessageRecipient.php`, `MessageLocale.php` | new |
| `lang/{en,ru,de,fr,es}/client_messages.php` | new: every word of the emails |
| `app/Mail/AppointmentMessageMail.php`, `resources/views/emails/appointment-message.blade.php` | new |
| `app/Services/Appointments/Messages/ClientMessenger.php`, `app/Jobs/DeliverClientMessage.php` | new |
| `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php`, `app/Services/Appointments/AppointmentPresenter.php` | workspace wiring |
| `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` | full admin wiring |
| `app/Console/Commands/SendAppointmentReminders.php`, `routes/console.php` | reminders |
| `tests/Concerns/SetsUpAppointmentsSchema.php` | table, columns, `setClientMessages()` |
| `tests/Feature/Appointments/Messages/*.php` | new tests |
| `tests/Feature/Appointments/Setup/SetupChecklistTest.php` | the new step in the pinned map |
| `frontend/src/appointments/lib/types.ts`, `lib/api.ts` | types and `notify_client` |
| `frontend/src/appointments/panel/TellClient.tsx`, `Messages.tsx`, `messages.ts` | new |
| `frontend/src/appointments/panel/AppointmentPanel.tsx`, `CreateForm.tsx`, `MoveForm.tsx`, `ActionConfirm.tsx`, `AppointmentView.tsx`, `panelState.ts` | the checkbox, the told notice, the list |
| `frontend/src/appointments/setup/SettingsTab.tsx`, `Checklist.tsx` | Setup block; step target |
| five `appointments.<lang>.json`, `appointmentsLocales.test.ts` | strings, families |
| `frontend/src/lib/clientMessages.ts`, `frontend/src/components/TellClient.tsx`, `TellClientConfirm.tsx` | new (full admin) |
| `frontend/src/pages/ServiceBookings.tsx` | full admin wiring |
| five `common.json` | full admin strings |
| `docs/appointments-workspace.md` | runbook |

## Before you start

- [ ] Run `../subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-05-appointments-client-messages.md`
  and use the directory it prints as `<ws>`. It should be `.superpowers/sdd/2026-10-05-appointments-client-messages/`.
  Create `<ws>/tools/`.
- [ ] Baseline: copy `.superpowers/sdd/archive/2026-10-02-appointments-standalone-tools/suite-by-dir.sh` to
  `<ws>/tools/`. Change its `ws=` line to `<ws>`. Run `bash <ws>/tools/suite-by-dir.sh baseline` in the background
  before editing any PHP file. While it runs, only frontend files may change. Ledger any group that does not end
  `exit=0`.

---

### Task 1: The venue's three settings

**Files:**
- Create: `app/Services/Appointments/Messages/MessageSettings.php`
- Modify:
  - `app/Services/Booking/Setup/BookingRules.php` (`rules()`, `read()`, `write()`)
  - `app/Services/Booking/Setup/SetupChecklist.php`
  - `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php`
  - `tests/Concerns/SetsUpAppointmentsSchema.php` (helper `setClientMessages()`)
  - `tests/Feature/Appointments/Setup/SetupChecklistTest.php` (the pinned map gains `'messages' => false`)
- Test: `tests/Feature/Appointments/Messages/MessageSettingsTest.php`

**Interfaces:**
- Produces:
  - `MessageSettings::STAFF_DEFAULT = 'client_messages_staff_default'`
  - `MessageSettings::REMINDER_HOURS = 'client_messages_reminder_hours'`
  - `MessageSettings::LANGUAGE = 'client_messages_language'`
  - `MessageSettings::REMINDER_CHOICES = [0, 2, 24, 48]`
  - `MessageSettings::LANGUAGES = ['en', 'ru', 'de', 'fr', 'es']`
  - `MessageSettings::read(int $orgId): array{staff_default: bool, reminder_hours: int, language: string}`
  - Setup settings fields `client_messages_staff_default` (bool), `client_messages_reminder_hours` (int) and
    `client_messages_language` (string), in `rules()`, `read()` and `write()`
  - bootstrap `messages: {staff_default, reminder_hours, language}`
  - checklist step `messages`, optional
  - fixture `setClientMessages(bool $staffDefault, int $reminderHours = 0, string $language = 'en'): void`

- [ ] **Step 1: The fixture helper.** In `tests/Concerns/SetsUpAppointmentsSchema.php`:
  - add `use App\Services\Booking\Setup\BookingRules;`;
  - add this method after `seedBooking()`:

```php
    /** Part D's three venue settings, written the way Setup writes them. */
    protected function setClientMessages(bool $staffDefault, int $reminderHours = 0, string $language = 'en'): void
    {
        app(BookingRules::class)->write($this->org, [
            'client_messages_staff_default'  => $staffDefault,
            'client_messages_reminder_hours' => $reminderHours,
            'client_messages_language'       => $language,
        ]);
    }
```

- [ ] **Step 2: Write the failing test** `tests/Feature/Appointments/Messages/MessageSettingsTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Messages;

use App\Services\Appointments\Messages\MessageSettings;
use App\Services\Booking\Setup\SetupChecklist;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class MessageSettingsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_everything_is_off_until_a_manager_switches_it_on(): void
    {
        $this->assertSame(['staff_default' => false, 'reminder_hours' => 0, 'language' => 'en'], MessageSettings::read($this->org->id));
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()
            ->assertJsonPath('messages', ['staff_default' => false, 'reminder_hours' => 0, 'language' => 'en']);
    }

    public function test_a_manager_saves_them_in_setup_and_other_staff_may_not(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), [
            'client_messages_staff_default'  => true,
            'client_messages_reminder_hours' => 24,
            'client_messages_language'       => 'ru',
        ])->assertOk()
            ->assertJsonPath('settings.client_messages_staff_default', true)
            ->assertJsonPath('settings.client_messages_reminder_hours', 24)
            ->assertJsonPath('settings.client_messages_language', 'ru');
        $this->assertSame(['staff_default' => true, 'reminder_hours' => 24, 'language' => 'ru'], MessageSettings::read($this->org->id));

        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->patchJson($this->api('setup/settings'), ['client_messages_staff_default' => false])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
    }

    public function test_only_the_offered_choices_are_accepted(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['client_messages_reminder_hours' => 12])->assertStatus(422);
        $this->asStaff()->patchJson($this->api('setup/settings'), ['client_messages_language' => 'lv'])->assertStatus(422);
        $this->asStaff()->patchJson($this->api('setup/settings'), ['client_messages_staff_default' => 'maybe'])->assertStatus(422);
    }

    public function test_a_stored_value_outside_the_choices_reads_as_the_default(): void
    {
        DB::table('hotel_settings')->insert([
            ['organization_id' => $this->org->id, 'key' => MessageSettings::REMINDER_HOURS, 'value' => '7', 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => $this->org->id, 'key' => MessageSettings::LANGUAGE, 'value' => 'xx', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->assertSame(['staff_default' => false, 'reminder_hours' => 0, 'language' => 'en'], MessageSettings::read($this->org->id));
    }

    public function test_the_checklist_offers_an_optional_step_until_something_is_on(): void
    {
        $step = fn () => collect(app(SetupChecklist::class)->for($this->org->id, null)['steps'])->firstWhere('key', 'messages');

        $this->assertSame(['key' => 'messages', 'done' => false, 'optional' => true], $step());
        $this->setClientMessages(false, 24);
        $this->assertTrue($step()['done']);
        $this->setClientMessages(true, 0);
        $this->assertTrue($step()['done']);
    }
}
```

- [ ] **Step 3: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Messages/MessageSettingsTest.php`
  - Expected: FAIL — `Class "App\Services\Appointments\Messages\MessageSettings" not found`.

- [ ] **Step 4: Implement** `app/Services/Appointments/Messages/MessageSettings.php`:

```php
<?php

namespace App\Services\Appointments\Messages;

use App\Models\HotelSetting;

/**
 * The venue's client-message settings (Part D spec §5.5), all off until a
 * manager switches them on in Setup: whether staff changes email the client
 * by default, how many hours before a visit the reminder goes (0 = none),
 * and the language for a client whose own is not known. Read without the
 * tenant scope or the settings cache, so the reminder command and the
 * delivery job read them the same way a request does.
 */
final class MessageSettings
{
    public const STAFF_DEFAULT = 'client_messages_staff_default';

    public const REMINDER_HOURS = 'client_messages_reminder_hours';

    public const LANGUAGE = 'client_messages_language';

    public const REMINDER_CHOICES = [0, 2, 24, 48];

    public const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es'];

    /** @return array{staff_default: bool, reminder_hours: int, language: string} */
    public static function read(int $orgId): array
    {
        $values = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereIn('key', [self::STAFF_DEFAULT, self::REMINDER_HOURS, self::LANGUAGE])
            ->pluck('value', 'key');

        $hours = (int) ($values[self::REMINDER_HOURS] ?? 0);
        $language = strtolower(trim((string) ($values[self::LANGUAGE] ?? 'en')));

        return [
            'staff_default'  => filter_var($values[self::STAFF_DEFAULT] ?? 'false', FILTER_VALIDATE_BOOL),
            'reminder_hours' => in_array($hours, self::REMINDER_CHOICES, true) ? $hours : 0,
            'language'       => in_array($language, self::LANGUAGES, true) ? $language : 'en',
        ];
    }
}
```

- [ ] **Step 5: `BookingRules`.** Add `use App\Services\Appointments\Messages\MessageSettings;`.
  - In `rules()`, add:

```php
            'client_messages_staff_default'  => 'sometimes|boolean',
            'client_messages_reminder_hours' => ['sometimes', 'integer', Rule::in(MessageSettings::REMINDER_CHOICES)],
            'client_messages_language'       => ['sometimes', 'string', Rule::in(MessageSettings::LANGUAGES)],
```

  - In `read()`, before the `return`, add `$messages = MessageSettings::read($orgId);`. Add three entries to the
    returned array, after `'upcoming_appointments' => …`:

```php
            'client_messages_staff_default'  => $messages['staff_default'],
            'client_messages_reminder_hours' => $messages['reminder_hours'],
            'client_messages_language'       => $messages['language'],
```

  - In `write()`, inside the `DB::transaction` closure, after the `points_on_bookings` block:

```php
            if (array_key_exists('client_messages_staff_default', $data)) {
                self::put($orgId, MessageSettings::STAFF_DEFAULT, $data['client_messages_staff_default'] ? 'true' : 'false', 'boolean', 'booking', 'Email clients about staff changes');
            }
            if (array_key_exists('client_messages_reminder_hours', $data)) {
                self::put($orgId, MessageSettings::REMINDER_HOURS, (string) (int) $data['client_messages_reminder_hours'], 'integer', 'booking', 'Client reminder (hours before)');
            }
            if (array_key_exists('client_messages_language', $data)) {
                self::put($orgId, MessageSettings::LANGUAGE, (string) $data['client_messages_language'], 'string', 'booking', 'Client message language');
            }
```

- [ ] **Step 6: The checklist.** In `SetupChecklist`, add `use App\Services\Appointments\Messages\MessageSettings;`:
  - `STEPS` becomes `['timezone', 'service', 'performer', 'hours', 'online', 'messages', 'first_appointment']`
    (R5);
  - `OPTIONAL` becomes `['online', 'messages']`;
  - in `for()`, before the `$done` array, add `$messages = MessageSettings::read($orgId);`;
  - add the entry `'messages' => $messages['staff_default'] || $messages['reminder_hours'] > 0,`.

  In `tests/Feature/Appointments/Setup/SetupChecklistTest.php`, the first test's expected map gains
  `'messages' => false,` after `'online' => false,`.

- [ ] **Step 7: The bootstrap.** In `BootstrapController::show()`, add `use App\Services\Appointments\Messages\MessageSettings;`
  and this entry after `'loyalty' => [...]`:

```php
            'messages'     => MessageSettings::read($orgId),
```

- [ ] **Step 8: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Messages/MessageSettingsTest.php tests/Feature/Appointments/Setup`
  - Expected: PASS (5 new tests; every Setup test passes).

- [ ] **Step 9: Commit** with the subject "Give each venue its client-message settings, all off":

```bash
git add app/Services/Appointments/Messages/MessageSettings.php app/Services/Booking/Setup/BookingRules.php app/Services/Booking/Setup/SetupChecklist.php app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php tests/Concerns/SetsUpAppointmentsSchema.php tests/Feature/Appointments/Setup/SetupChecklistTest.php tests/Feature/Appointments/Messages/MessageSettingsTest.php
git commit -F <ws>/tools/commit-1.txt
```

---

### Task 2: The message log, who receives it, and in which language

**Files:**
- Create:
  - `database/migrations/2026_10_05_100000_create_client_messages.php`
  - `app/Models/ClientMessage.php`
  - `app/Services/Appointments/Messages/MessageRecipient.php`
  - `app/Services/Appointments/Messages/MessageLocale.php`
- Modify: `tests/Concerns/SetsUpAppointmentsSchema.php`:
  - the `client_messages` table;
  - `organizations.email`, `phone` and `address`.
  - `guests.preferred_language` and `users.language` already exist in `SetsUpMinimalSchema`.
- Test: `tests/Feature/Appointments/Messages/RecipientAndLocaleTest.php`

**Interfaces:**
- Consumes: `MessageSettings::LANGUAGES` (Task 1)
- Produces:
  - `ClientMessage` (BelongsToOrganization; `KINDS`; casts `for_start_at`, `previous_start_at` and `sent_at` as
    datetime; `toApi(): array{kind, status, reason, recipient, at}`)
  - `MessageRecipient::for(ServiceBooking $b): ?string`
  - `MessageLocale::normalise(?string $raw): ?string`
  - `MessageLocale::for(ServiceBooking $b, string $venueLanguage): string`
  - the partial unique index `client_messages_one_reminder` on `(service_booking_id, for_start_at)` where
    `kind = 'reminder'`

- [ ] **Step 1: Extend the fixture.** In `setUpAppointments()` of `tests/Concerns/SetsUpAppointmentsSchema.php`:
  - add to the `organizations` columns:

```php
            'email'             => fn (Blueprint $t) => $t->string('email')->nullable(),
            'phone'             => fn (Blueprint $t) => $t->string('phone', 40)->nullable(),
            'address'           => fn (Blueprint $t) => $t->string('address')->nullable(),
```

  - after the `service_categories` block, add the following, and add `use Illuminate\Support\Facades\DB;` and
    `use Illuminate\Support\Facades\Schema;` to the trait's imports if missing:

```php
        // Part D's message log, as the 2026_10_05 migration builds it.
        if (!Schema::hasTable('client_messages')) {
            Schema::create('client_messages', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('service_booking_id');
                $t->string('kind', 16);
                $t->string('channel', 16)->default('email');
                $t->string('recipient', 191)->nullable();
                $t->string('locale', 5)->default('en');
                $t->string('status', 16);
                $t->string('reason', 32)->nullable();
                $t->timestamp('for_start_at')->nullable();
                $t->timestamp('previous_start_at')->nullable();
                $t->unsignedBigInteger('actor_user_id')->nullable();
                $t->timestamp('sent_at')->nullable();
                $t->timestamps();
            });
            DB::statement("CREATE UNIQUE INDEX client_messages_one_reminder ON client_messages (service_booking_id, for_start_at) WHERE kind = 'reminder'");
        }
```

- [ ] **Step 2: Write the failing test** `tests/Feature/Appointments/Messages/RecipientAndLocaleTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Messages;

use App\Models\ClientMessage;
use App\Models\User;
use App\Services\Appointments\Messages\MessageLocale;
use App\Services\Appointments\Messages\MessageRecipient;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class RecipientAndLocaleTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_the_booking_email_comes_first_trimmed_then_the_clients(): void
    {
        $client = $this->seedClient(['email' => 'sophie@example.test', 'email_key' => 'sophie@example.test']);

        $this->assertSame('ADA@Example.Test', MessageRecipient::for($this->seedBooking(['customer_email' => '  ADA@Example.Test ', 'guest_id' => $client->id])));
        $this->assertSame('sophie@example.test', MessageRecipient::for($this->seedBooking(['customer_email' => 'n/a', 'guest_id' => $client->id, 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00'])));
        $this->assertSame('sophie@example.test', MessageRecipient::for($this->seedBooking(['customer_email' => '', 'guest_id' => $client->id, 'start_at' => '2026-10-06 13:00:00', 'end_at' => '2026-10-06 13:45:00'])));
        $this->assertNull(MessageRecipient::for($this->seedBooking(['customer_email' => '', 'start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00'])));
    }

    public function test_a_language_is_read_from_codes_and_names_in_either_tongue(): void
    {
        foreach (['ru' => 'ru', 'ru-RU' => 'ru', 'RU_ru' => 'ru', 'Russian' => 'ru', 'russian ' => 'ru', 'Русский' => 'ru',
                  'Deutsch' => 'de', 'german' => 'de', 'Français' => 'fr', 'francais' => 'fr', 'Español' => 'es', 'English' => 'en', 'en-GB' => 'en'] as $raw => $code) {
            $this->assertSame($code, MessageLocale::normalise($raw), $raw);
        }
        foreach (['Latvian', 'lv', '', null, 'xx-YY'] as $raw) {
            $this->assertNull(MessageLocale::normalise($raw), (string) $raw);
        }
    }

    public function test_the_member_comes_first_then_the_client_record_then_the_venue(): void
    {
        $client = $this->seedClient(['preferred_language' => 'Deutsch']);
        $booking = $this->seedBooking(['guest_id' => $client->id, 'member_id' => $this->member->id]);
        User::whereKey($this->member->user_id)->update(['language' => 'fr']);

        $this->assertSame('fr', MessageLocale::for($booking, 'es'));

        User::whereKey($this->member->user_id)->update(['language' => null]);
        $this->assertSame('de', MessageLocale::for($booking->fresh(), 'es'));

        $client->update(['preferred_language' => 'Latvian']);
        $this->assertSame('es', MessageLocale::for($booking->fresh(), 'es'));
    }

    public function test_one_reminder_per_appointment_time_and_the_api_shape(): void
    {
        $booking = $this->seedBooking();
        $row = fn (string $kind, string $start) => ClientMessage::create([
            'service_booking_id' => $booking->id, 'kind' => $kind, 'channel' => 'email', 'recipient' => 'a@example.test',
            'locale' => 'en', 'status' => 'queued', 'for_start_at' => $start,
        ]);

        $first = $row('reminder', '2026-10-06 10:00:00');
        $row('moved', '2026-10-06 10:00:00');
        $row('moved', '2026-10-06 10:00:00'); // moved twice to the same time: allowed
        $row('reminder', '2026-10-06 14:00:00'); // another time: allowed

        $this->assertSame(['kind' => 'reminder', 'status' => 'queued', 'reason' => null, 'recipient' => 'a@example.test', 'at' => $first->created_at->toIso8601String()], $first->toApi());

        $this->expectException(UniqueConstraintViolationException::class);
        $row('reminder', '2026-10-06 10:00:00');
    }

    public function test_the_migration_builds_the_table_and_its_index(): void
    {
        \Illuminate\Support\Facades\Schema::drop('client_messages');
        (require base_path('database/migrations/2026_10_05_100000_create_client_messages.php'))->up();

        $this->assertSame(
            ['id', 'organization_id', 'service_booking_id', 'kind', 'channel', 'recipient', 'locale', 'status', 'reason', 'for_start_at', 'previous_start_at', 'actor_user_id', 'sent_at', 'created_at', 'updated_at'],
            \Illuminate\Support\Facades\Schema::getColumnListing('client_messages'),
        );
        $this->test_one_reminder_per_appointment_time_and_the_api_shape();
    }
}
```

- [ ] **Step 3: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Messages/RecipientAndLocaleTest.php`
  - Expected: FAIL — `Class "App\Services\Appointments\Messages\MessageRecipient" not found` (and `ClientMessage`).

- [ ] **Step 4: Write** `database/migrations/2026_10_05_100000_create_client_messages.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every message the appointments sender decided on (Part D): what kind, to
 * whom, in which language, and whether it was sent, skipped (and why) or
 * failed. No subject or body is kept. One reminder per appointment and
 * appointment time, as a database rule (a partial unique index). Additive
 * and reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('client_messages')) {
            return;
        }

        Schema::create('client_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('service_booking_id');
            $table->string('kind', 16);
            $table->string('channel', 16)->default('email');
            $table->string('recipient', 191)->nullable();
            $table->string('locale', 5)->default('en');
            $table->string('status', 16);
            $table->string('reason', 32)->nullable();
            $table->timestamp('for_start_at')->nullable();
            $table->timestamp('previous_start_at')->nullable();
            $table->unsignedBigInteger('actor_user_id')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->index('service_booking_id');
            $table->index(['organization_id', 'created_at']);
        });

        DB::statement("CREATE UNIQUE INDEX client_messages_one_reminder ON client_messages (service_booking_id, for_start_at) WHERE kind = 'reminder'");
    }

    public function down(): void
    {
        Schema::dropIfExists('client_messages');
    }
};
```

- [ ] **Step 5: Write** `app/Models/ClientMessage.php`:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/** One client message the appointments sender decided on (Part D). */
class ClientMessage extends Model
{
    use BelongsToOrganization;

    public const KINDS = ['booked', 'moved', 'confirmed', 'cancelled', 'reminder'];

    protected $fillable = [
        'organization_id', 'service_booking_id', 'kind', 'channel', 'recipient', 'locale', 'status', 'reason',
        'for_start_at', 'previous_start_at', 'actor_user_id', 'sent_at',
    ];

    protected $casts = [
        'for_start_at'      => 'datetime',
        'previous_start_at' => 'datetime',
        'sent_at'           => 'datetime',
    ];

    /** What the screens show: what happened, never what was written. `at` is a real instant (UTC). */
    public function toApi(): array
    {
        return [
            'kind'      => (string) $this->kind,
            'status'    => (string) $this->status,
            'reason'    => $this->reason,
            'recipient' => $this->recipient,
            'at'        => $this->created_at?->toIso8601String(),
        ];
    }
}
```

- [ ] **Step 6: Write** `app/Services/Appointments/Messages/MessageRecipient.php`:

```php
<?php

namespace App\Services\Appointments\Messages;

use App\Models\Guest;
use App\Models\ServiceBooking;

/** Who a client message goes to: the booking's own address, else the client record's, else nobody. */
final class MessageRecipient
{
    public static function for(ServiceBooking $booking): ?string
    {
        $candidates = [$booking->customer_email];
        if ($booking->guest_id) {
            $candidates[] = Guest::withoutGlobalScopes()->whereKey($booking->guest_id)->value('email');
        }

        foreach ($candidates as $candidate) {
            $email = trim((string) $candidate);
            if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $email;
            }
        }

        return null;
    }
}
```

- [ ] **Step 7: Write** `app/Services/Appointments/Messages/MessageLocale.php`:

```php
<?php

namespace App\Services\Appointments\Messages;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\ServiceBooking;
use App\Models\User;

/**
 * The language of a client message (Part D spec §4): the member's own app
 * language, else the client record's (typed by staff: a code, a code with a
 * region, an English name or the language's own name), else the venue's.
 */
final class MessageLocale
{
    private const NAMES = [
        'english' => 'en', 'russian' => 'ru', 'german' => 'de', 'french' => 'fr', 'spanish' => 'es',
        'русский' => 'ru', 'deutsch' => 'de', 'français' => 'fr', 'francais' => 'fr', 'español' => 'es', 'espanol' => 'es',
    ];

    public static function normalise(?string $raw): ?string
    {
        $value = mb_strtolower(trim((string) $raw));
        if ($value === '') {
            return null;
        }
        if (isset(self::NAMES[$value])) {
            return self::NAMES[$value];
        }
        if (preg_match('/^([a-z]{2})(?:[-_][a-z]{2,4})?$/', $value, $m) && in_array($m[1], MessageSettings::LANGUAGES, true)) {
            return $m[1];
        }

        return null;
    }

    public static function for(ServiceBooking $booking, string $venueLanguage): string
    {
        if ($booking->member_id) {
            $userId = LoyaltyMember::withoutGlobalScopes()->whereKey($booking->member_id)->value('user_id');
            $code = $userId ? self::normalise(User::withoutGlobalScopes()->whereKey($userId)->value('language')) : null;
            if ($code !== null) {
                return $code;
            }
        }
        if ($booking->guest_id) {
            $code = self::normalise(Guest::withoutGlobalScopes()->whereKey($booking->guest_id)->value('preferred_language'));
            if ($code !== null) {
                return $code;
            }
        }

        return self::normalise($venueLanguage) ?? 'en';
    }
}
```

- [ ] **Step 8: Run it.**
  - Run: same command as Step 3.
  - Expected: PASS (5 tests).

- [ ] **Step 9: Commit** with the subject "Log client messages and choose who gets them, in which language":

```bash
git add database/migrations/2026_10_05_100000_create_client_messages.php app/Models/ClientMessage.php app/Services/Appointments/Messages/MessageRecipient.php app/Services/Appointments/Messages/MessageLocale.php tests/Concerns/SetsUpAppointmentsSchema.php tests/Feature/Appointments/Messages/RecipientAndLocaleTest.php
git commit -F <ws>/tools/commit-2.txt
```

---

### Task 3: The email, in five languages

**Files:**
- Create: `lang/en/client_messages.php`, `lang/ru/client_messages.php`, `lang/de/client_messages.php`,
  `lang/fr/client_messages.php`, `lang/es/client_messages.php`
- Create: `app/Mail/AppointmentMessageMail.php`, `resources/views/emails/appointment-message.blade.php`
- Test: `tests/Feature/Appointments/Messages/AppointmentMessageMailTest.php`

**Interfaces:**
- Consumes: `ClientMessage` (Task 2)
- Produces:
  - `new AppointmentMessageMail(ClientMessage $message, ServiceBooking $booking)`
  - `->lines(): array{subject, headline, greeting, intro, rows: list<array{label, value}>, closing, venue: array{name, address, phone, email}, hotelName}`
  - `AppointmentMessageMail::when(\DateTimeInterface|string $stored, string $locale): string`

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Messages/AppointmentMessageMailTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Messages;

use App\Mail\AppointmentMessageMail;
use App\Models\ClientMessage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentMessageMailTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->org->forceFill(['address' => '12 Rue Lumière, Riga', 'phone' => '+371 2000 0000', 'email' => 'desk@lumiere.test'])->save();
    }

    private function mail(string $kind, string $locale, array $row = []): AppointmentMessageMail
    {
        $booking = $this->seedBooking(['booking_reference' => 'SVC-TEST' . strtoupper(substr(md5($kind . $locale), 0, 4)), 'cancellation_reason' => 'Therapist ill — private']);
        $message = ClientMessage::create(array_merge([
            'service_booking_id' => $booking->id, 'kind' => $kind, 'channel' => 'email', 'recipient' => 'sophie@example.test',
            'locale' => $locale, 'status' => 'queued', 'for_start_at' => '2026-10-06 10:00:00',
        ], $row));

        return new AppointmentMessageMail($message, $booking->fresh(['service', 'master']));
    }

    public function test_every_kind_in_every_language_names_the_service_the_venue_and_the_venues_time(): void
    {
        $dates = [
            'en' => 'Tuesday 6 October 2026, 10:00',
            'de' => 'Dienstag, 6. Oktober 2026, 10:00',
            'fr' => 'mardi 6 octobre 2026, 10:00',
            'es' => 'martes 6 de octubre de 2026, 10:00',
            'ru' => '10:00',
        ];
        foreach (ClientMessage::KINDS as $kind) {
            foreach ($dates as $locale => $date) {
                $mail = $this->mail($kind, $locale);
                $lines = $mail->lines();
                $this->assertStringContainsString('Deep Tissue Massage', $lines['subject'], "{$kind}/{$locale}");
                $this->assertStringContainsString('Lumière Salon', $lines['subject'], "{$kind}/{$locale}");
                $this->assertStringContainsString($date, $lines['subject'], "{$kind}/{$locale}");
                if ($locale !== 'en') {
                    $this->assertNotSame(__("client_messages.subject.{$kind}", [], 'en'), __("client_messages.subject.{$kind}", [], $locale), "{$kind}/{$locale} is translated");
                }

                $html = $mail->render();
                $this->assertStringContainsString('Sophie Williams', $html);
                $this->assertStringContainsString('Mara Ilves', $html);
                $this->assertStringContainsString($lines['rows'][count($lines['rows']) - 1]['value'], $html); // the reference
                $this->assertStringContainsString('12 Rue Lumière, Riga', $html);
                $this->assertStringContainsString('desk@lumiere.test', $html);
                $this->assertStringNotContainsString('Hospitality, refined', $html); // our own footer, not the English default
            }
        }
        $this->assertStringContainsString('2026', $this->mail('booked', 'ru')->lines()['subject']);
        $this->assertStringContainsString('октябр', $this->mail('booked', 'ru')->lines()['subject']);
    }

    public function test_a_move_names_the_former_time_and_a_cancellation_never_the_staff_reason(): void
    {
        $moved = $this->mail('moved', 'en', ['previous_start_at' => '2026-10-06 08:30:00'])->render();
        $this->assertStringContainsString('Tuesday 6 October 2026, 08:30', $moved);
        $this->assertStringContainsString('Previously', $moved);

        $cancelled = $this->mail('cancelled', 'en')->render();
        $this->assertStringNotContainsString('Therapist ill', $cancelled);
        $this->assertStringContainsString('To book again', $cancelled);
    }

    public function test_the_venue_sends_it_and_receives_the_replies(): void
    {
        $envelope = $this->mail('reminder', 'en')->envelope();

        $this->assertSame('Lumière Salon', $envelope->from?->name);
        $this->assertSame('desk@lumiere.test', $envelope->replyTo[0]->address ?? null);
        $this->assertStringStartsWith('Reminder:', $envelope->subject);
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Messages/AppointmentMessageMailTest.php`
  - Expected: FAIL — `Class "App\Mail\AppointmentMessageMail" not found`.

- [ ] **Step 3: The words.** Write the five language files with the Write tool (they contain non-ASCII text).

`lang/en/client_messages.php`:

```php
<?php

// Every word of a client message (Part D). Placeholders: :service, :venue, :when, :name, :date, :time.
return [
    'subject' => [
        'booked'    => 'Booked: :service at :venue, :when',
        'moved'     => 'New time: :service at :venue, :when',
        'confirmed' => 'Confirmed: :service at :venue, :when',
        'cancelled' => 'Cancelled: :service at :venue, :when',
        'reminder'  => 'Reminder: :service at :venue, :when',
    ],
    'headline' => [
        'booked'    => "You're booked in",
        'moved'     => 'New time',
        'confirmed' => 'Confirmed',
        'cancelled' => 'Cancelled',
        'reminder'  => 'See you soon',
    ],
    'intro' => [
        'booked'    => 'You are booked in at :venue. Here are the details.',
        'moved'     => 'Your visit to :venue has a new time. Here are the new details.',
        'confirmed' => 'Your visit to :venue is confirmed. Here are the details.',
        'cancelled' => 'Your visit to :venue has been cancelled.',
        'reminder'  => 'A reminder of your visit to :venue.',
    ],
    'greeting'   => 'Dear :name,',
    'label'      => ['service' => 'Service', 'when' => 'When', 'previously' => 'Previously', 'with' => 'With', 'reference' => 'Reference'],
    'questions'  => 'Questions? Just reply to this email.',
    'book_again' => 'To book again, just reply to this email.',
    'when'        => ':date, :time',
    'date_format' => 'l j F Y',
];
```

`lang/ru/client_messages.php`:

```php
<?php

return [
    'subject' => [
        'booked'    => 'Вы записаны: :service в :venue, :when',
        'moved'     => 'Новое время: :service в :venue, :when',
        'confirmed' => 'Подтверждено: :service в :venue, :when',
        'cancelled' => 'Отменено: :service в :venue, :when',
        'reminder'  => 'Напоминание: :service в :venue, :when',
    ],
    'headline' => [
        'booked'    => 'Вы записаны',
        'moved'     => 'Новое время',
        'confirmed' => 'Подтверждено',
        'cancelled' => 'Отменено',
        'reminder'  => 'До скорой встречи',
    ],
    'intro' => [
        'booked'    => 'Вы записаны в :venue. Подробности ниже.',
        'moved'     => 'Время вашего визита в :venue изменилось. Новые подробности ниже.',
        'confirmed' => 'Ваш визит в :venue подтверждён. Подробности ниже.',
        'cancelled' => 'Ваш визит в :venue отменён.',
        'reminder'  => 'Напоминаем о вашем визите в :venue.',
    ],
    'greeting'   => 'Здравствуйте, :name!',
    'label'      => ['service' => 'Услуга', 'when' => 'Когда', 'previously' => 'Было', 'with' => 'Специалист', 'reference' => 'Номер записи'],
    'questions'  => 'Есть вопросы? Просто ответьте на это письмо.',
    'book_again' => 'Чтобы записаться снова, ответьте на это письмо.',
    'when'        => ':date, :time',
    'date_format' => 'l, j F Y',
];
```

`lang/de/client_messages.php`:

```php
<?php

return [
    'subject' => [
        'booked'    => 'Gebucht: :service bei :venue, :when',
        'moved'     => 'Neue Zeit: :service bei :venue, :when',
        'confirmed' => 'Bestätigt: :service bei :venue, :when',
        'cancelled' => 'Abgesagt: :service bei :venue, :when',
        'reminder'  => 'Erinnerung: :service bei :venue, :when',
    ],
    'headline' => [
        'booked'    => 'Gebucht',
        'moved'     => 'Neue Zeit',
        'confirmed' => 'Bestätigt',
        'cancelled' => 'Abgesagt',
        'reminder'  => 'Bis bald',
    ],
    'intro' => [
        'booked'    => 'Sie sind bei :venue gebucht. Hier sind die Details.',
        'moved'     => 'Ihr Termin bei :venue hat eine neue Zeit. Hier sind die neuen Details.',
        'confirmed' => 'Ihr Termin bei :venue ist bestätigt. Hier sind die Details.',
        'cancelled' => 'Ihr Termin bei :venue wurde abgesagt.',
        'reminder'  => 'Eine Erinnerung an Ihren Termin bei :venue.',
    ],
    'greeting'   => 'Guten Tag, :name,',
    'label'      => ['service' => 'Leistung', 'when' => 'Wann', 'previously' => 'Vorher', 'with' => 'Bei', 'reference' => 'Referenz'],
    'questions'  => 'Fragen? Antworten Sie einfach auf diese E-Mail.',
    'book_again' => 'Um neu zu buchen, antworten Sie einfach auf diese E-Mail.',
    'when'        => ':date, :time',
    'date_format' => 'l, j. F Y',
];
```

`lang/fr/client_messages.php`:

```php
<?php

return [
    'subject' => [
        'booked'    => 'Réservé : :service chez :venue, :when',
        'moved'     => 'Nouvel horaire : :service chez :venue, :when',
        'confirmed' => 'Confirmé : :service chez :venue, :when',
        'cancelled' => 'Annulé : :service chez :venue, :when',
        'reminder'  => 'Rappel : :service chez :venue, :when',
    ],
    'headline' => [
        'booked'    => 'Réservé',
        'moved'     => 'Nouvel horaire',
        'confirmed' => 'Confirmé',
        'cancelled' => 'Annulé',
        'reminder'  => 'À bientôt',
    ],
    'intro' => [
        'booked'    => 'Votre visite chez :venue est réservée. Voici les détails.',
        'moved'     => 'Votre visite chez :venue a un nouvel horaire. Voici les nouveaux détails.',
        'confirmed' => 'Votre visite chez :venue est confirmée. Voici les détails.',
        'cancelled' => 'Votre visite chez :venue a été annulée.',
        'reminder'  => 'Un rappel de votre visite chez :venue.',
    ],
    'greeting'   => 'Bonjour :name,',
    'label'      => ['service' => 'Prestation', 'when' => 'Quand', 'previously' => 'Auparavant', 'with' => 'Avec', 'reference' => 'Référence'],
    'questions'  => 'Des questions ? Répondez simplement à cet e-mail.',
    'book_again' => 'Pour réserver à nouveau, répondez simplement à cet e-mail.',
    'when'        => ':date, :time',
    'date_format' => 'l j F Y',
];
```

`lang/es/client_messages.php`:

```php
<?php

return [
    'subject' => [
        'booked'    => 'Reservado: :service en :venue, :when',
        'moved'     => 'Nueva hora: :service en :venue, :when',
        'confirmed' => 'Confirmado: :service en :venue, :when',
        'cancelled' => 'Cancelado: :service en :venue, :when',
        'reminder'  => 'Recordatorio: :service en :venue, :when',
    ],
    'headline' => [
        'booked'    => 'Reservado',
        'moved'     => 'Nueva hora',
        'confirmed' => 'Confirmado',
        'cancelled' => 'Cancelado',
        'reminder'  => 'Hasta pronto',
    ],
    'intro' => [
        'booked'    => 'Tiene una reserva en :venue. Estos son los detalles.',
        'moved'     => 'Su visita a :venue tiene una nueva hora. Estos son los nuevos detalles.',
        'confirmed' => 'Su visita a :venue está confirmada. Estos son los detalles.',
        'cancelled' => 'Su visita a :venue ha sido cancelada.',
        'reminder'  => 'Le recordamos su visita a :venue.',
    ],
    'greeting'   => 'Hola, :name:',
    'label'      => ['service' => 'Servicio', 'when' => 'Cuándo', 'previously' => 'Antes', 'with' => 'Con', 'reference' => 'Referencia'],
    'questions'  => '¿Preguntas? Responda a este correo.',
    'book_again' => 'Para reservar de nuevo, responda a este correo.',
    'when'        => ':date, :time',
    'date_format' => 'l j \d\e F \d\e Y',
];
```

- [ ] **Step 4: Write** `app/Mail/AppointmentMessageMail.php`:

```php
<?php

namespace App\Mail;

use App\Models\ClientMessage;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * One client message about an appointment (Part D): booked, moved,
 * confirmed, cancelled or the reminder, in the row's language, sent as the
 * venue. Every word comes from lang/{locale}/client_messages.php, asked for
 * in that locale explicitly, so nothing depends on the worker's own locale.
 * Not queued itself: DeliverClientMessage sends it and then marks the row.
 */
class AppointmentMessageMail extends Mailable
{
    use Concerns\SendsAsVenue;
    use Queueable, SerializesModels;

    public function __construct(public ClientMessage $message, public ServiceBooking $booking)
    {
        $this->captureVenue((int) $booking->organization_id);
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->lines()['subject'],
            from:    $this->venueFrom(),
            replyTo: $this->venueReplyTo(),
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.appointment-message', with: $this->lines());
    }

    /** Every word of this message, in its language. */
    public function lines(): array
    {
        $locale = (string) $this->message->locale;
        $kind = (string) $this->message->kind;
        $b = $this->booking;
        $org = Organization::withoutGlobalScopes()->find($b->organization_id);
        $venue = (string) ($org?->name ?? '');
        $service = (string) ($b->service?->name ?? '');
        $when = self::when($this->message->for_start_at ?? $b->start_at, $locale);
        $t = fn (string $key, array $replace = []) => __("client_messages.{$key}", $replace, $locale);

        $rows = [
            ['label' => $t('label.service'), 'value' => $service],
            ['label' => $t('label.when'), 'value' => $when],
        ];
        if ($kind === 'moved' && $this->message->previous_start_at) {
            $rows[] = ['label' => $t('label.previously'), 'value' => self::when($this->message->previous_start_at, $locale)];
        }
        if ($b->master?->name) {
            $rows[] = ['label' => $t('label.with'), 'value' => (string) $b->master->name];
        }
        $rows[] = ['label' => $t('label.reference'), 'value' => (string) $b->booking_reference];

        return [
            'subject'   => $t("subject.{$kind}", ['service' => $service, 'venue' => $venue, 'when' => $when]),
            'headline'  => $t("headline.{$kind}"),
            'greeting'  => $t('greeting', ['name' => (string) $b->customer_name]),
            'intro'     => $t("intro.{$kind}", ['venue' => $venue]),
            'rows'      => $rows,
            'closing'   => $t($kind === 'cancelled' ? 'book_again' : 'questions'),
            'venue'     => ['name' => $venue, 'address' => $org?->address ?: null, 'phone' => $org?->phone ?: null, 'email' => $org?->email ?: null],
            'hotelName' => $venue,
        ];
    }

    /** "Tuesday 6 October 2026, 10:00": the venue's own clock, in the words of the language. */
    public static function when(\DateTimeInterface|string $stored, string $locale): string
    {
        $wall = CarbonImmutable::createFromFormat('!' . VenueClock::WALL, (string) VenueClock::wall($stored), 'UTC')->locale($locale);

        return __('client_messages.when', [
            'date' => $wall->translatedFormat(__('client_messages.date_format', [], $locale)),
            'time' => $wall->format('H:i'),
        ], $locale);
    }
}
```

- [ ] **Step 5: Write** `resources/views/emails/appointment-message.blade.php`:

```blade
@extends('emails.layouts.luxury')

@section('title', $subject)

@section('hero')
    <p class="hero-eyebrow">{{ $venue['name'] }}</p>
    <h1 class="hero-headline">{{ $headline }}</h1>
@endsection

@section('main')
    <p>{{ $greeting }}</p>
    <p>{{ $intro }}</p>
    @foreach ($rows as $row)
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">{{ $row['label'] }}</td><td class="val">{{ $row['value'] }}</td></tr>
        </table>
    @endforeach
    <p>{{ $closing }}</p>
@endsection

@section('footer')
    <p>{{ $venue['name'] }}</p>
    @if ($venue['address'])<p>{{ $venue['address'] }}</p>@endif
    @if ($venue['phone'])<p>{{ $venue['phone'] }}</p>@endif
    @if ($venue['email'])<p><a href="mailto:{{ $venue['email'] }}">{{ $venue['email'] }}</a></p>@endif
@endsection
```

- [ ] **Step 6: Run it.**
  - Run: same command as Step 2.
  - Expected: PASS (3 tests).
  - If a translated date differs from the test's expectation only in Carbon's own wording (for example the case of a
    month name), keep Carbon's wording, correct the test's expectation and ledger a ruling. If a whole word is
    untranslated, that is a bug.

- [ ] **Step 7: Commit** with the subject "Write the client messages in five languages":

```bash
git add lang/en/client_messages.php lang/ru/client_messages.php lang/de/client_messages.php lang/fr/client_messages.php lang/es/client_messages.php app/Mail/AppointmentMessageMail.php resources/views/emails/appointment-message.blade.php tests/Feature/Appointments/Messages/AppointmentMessageMailTest.php
git commit -F <ws>/tools/commit-3.txt
```

---

### Task 4: One sender and its delivery job

**Files:**
- Create: `app/Services/Appointments/Messages/ClientMessenger.php`, `app/Jobs/DeliverClientMessage.php`
- Test: `tests/Feature/Appointments/Messages/ClientMessengerTest.php`

**Interfaces:**
- Consumes:
  - `MessageSettings::read()` (Task 1)
  - `ClientMessage`, `MessageRecipient::for()`, `MessageLocale::for()` (Task 2)
  - `AppointmentMessageMail` (Task 3)
- Produces:
  - `ClientMessenger::afterStaffAction(ServiceBooking $booking, string $kind, ?bool $notify, User $actor, ?\DateTimeInterface $previousStart = null): ClientMessage`
    (never throws; on an internal failure returns an unsaved row with status `failed` and reason `mail_error`)
  - `ClientMessenger::remind(ServiceBooking $booking): ?ClientMessage` (null when a reminder for that time exists)
  - `DeliverClientMessage` (`ShouldQueue`, `$tries = 1`, R7):
    - `handle()`: marks `sent`, `skipped (stale)` or `failed (mail_error)`, and never rethrows;
    - `failed()`: the same mark, as a backstop.

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Messages/ClientMessengerTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Messages;

use App\Jobs\DeliverClientMessage;
use App\Mail\AppointmentMessageMail;
use App\Models\ClientMessage;
use App\Models\EmailSuppression;
use App\Services\Appointments\Messages\ClientMessenger;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class ClientMessengerTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function messenger(): ClientMessenger
    {
        return app(ClientMessenger::class);
    }

    public function test_the_venue_setting_decides_when_staff_said_nothing(): void
    {
        Queue::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $off = $this->messenger()->afterStaffAction($booking, 'booked', null, $this->staff);
        $this->assertSame(['skipped', 'not_requested'], [$off->status, $off->reason]);

        $this->setClientMessages(true);
        $on = $this->messenger()->afterStaffAction($booking, 'booked', null, $this->staff);
        $this->assertSame(['queued', null, 'sophie@example.test', 'en', $this->staff->id], [$on->status, $on->reason, $on->recipient, $on->locale, (int) $on->actor_user_id]);
        Queue::assertPushed(DeliverClientMessage::class, fn ($job) => $job->clientMessageId === $on->id);

        $no = $this->messenger()->afterStaffAction($booking, 'booked', false, $this->staff);
        $this->assertSame(['skipped', 'not_requested'], [$no->status, $no->reason]);
    }

    public function test_nobody_to_tell_or_a_suppressed_address_is_skipped_and_said_so(): void
    {
        Queue::fake();
        $nobody = $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => '']), 'booked', true, $this->staff);
        $this->assertSame(['skipped', 'no_recipient', null], [$nobody->status, $nobody->reason, $nobody->recipient]);

        EmailSuppression::suppress('bounced@example.test', EmailSuppression::HARD_BOUNCE);
        $suppressed = $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => 'bounced@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']), 'booked', true, $this->staff);
        $this->assertSame(['skipped', 'suppressed'], [$suppressed->status, $suppressed->reason]);

        Queue::assertNothingPushed();
    }

    public function test_delivery_sends_the_mail_and_marks_the_row(): void
    {
        Mail::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $row = $this->messenger()->afterStaffAction($booking, 'booked', true, $this->staff);

        Mail::assertSent(AppointmentMessageMail::class, fn ($mail) => $mail->hasTo('sophie@example.test') && $mail->message->id === $row->id);
        $this->assertSame('sent', $row->fresh()->status);
        $this->assertNotNull($row->fresh()->sent_at);
    }

    public function test_a_message_whose_time_no_longer_holds_is_not_sent(): void
    {
        Queue::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);
        $booked = $this->messenger()->afterStaffAction($booking, 'booked', true, $this->staff);
        $confirmed = $this->messenger()->afterStaffAction($booking, 'confirmed', true, $this->staff);

        // Moved before "booked" left: that email names a time that no longer holds.
        $booking->update(['start_at' => '2026-10-06 15:00:00', 'end_at' => '2026-10-06 15:45:00']);
        Mail::fake();
        (new DeliverClientMessage($booked->id))->handle();
        $this->assertSame(['skipped', 'stale'], [$booked->fresh()->status, $booked->fresh()->reason]);

        // Back at its time but cancelled before "confirmed" left.
        $booking->update(['start_at' => '2026-10-06 10:00:00', 'end_at' => '2026-10-06 10:45:00', 'status' => 'cancelled']);
        (new DeliverClientMessage($confirmed->id))->handle();
        $this->assertSame(['skipped', 'stale'], [$confirmed->fresh()->status, $confirmed->fresh()->reason]);
        Mail::assertNothingSent();
    }

    public function test_a_cancellation_is_sent_for_a_cancelled_appointment(): void
    {
        Mail::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test', 'status' => 'cancelled']);

        $row = $this->messenger()->afterStaffAction($booking, 'cancelled', true, $this->staff);

        $this->assertSame('sent', $row->fresh()->status);
    }

    public function test_a_mail_failure_marks_the_row_failed_and_never_reaches_the_staff_action(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('SMTP down'));
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $row = $this->messenger()->afterStaffAction($booking, 'booked', true, $this->staff);

        $this->assertSame(['failed', 'mail_error'], [$row->fresh()->status, $row->fresh()->reason]);
    }

    public function test_the_log_itself_failing_never_reaches_the_staff_action(): void
    {
        Schema::drop('client_messages');

        $row = $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => 'sophie@example.test']), 'booked', true, $this->staff);

        $this->assertFalse($row->exists);
        $this->assertSame(['failed', 'mail_error'], [$row->status, $row->reason]);
    }

    public function test_one_reminder_per_appointment_time(): void
    {
        Queue::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $first = $this->messenger()->remind($booking);
        $this->assertSame(['reminder', 'queued', null], [$first->kind, $first->status, $first->actor_user_id]);
        $this->assertNull($this->messenger()->remind($booking));

        $booking->update(['start_at' => '2026-10-06 15:00:00', 'end_at' => '2026-10-06 15:45:00']);
        $this->assertNotNull($this->messenger()->remind($booking->fresh()));
        Queue::assertPushed(DeliverClientMessage::class, 2);
    }

    public function test_the_language_follows_the_client_then_the_venue(): void
    {
        Queue::fake();
        $this->setClientMessages(true, 0, 'de');
        $client = $this->seedClient(['email' => 'sophie@example.test', 'email_key' => 'sophie@example.test', 'preferred_language' => 'Русский']);

        $this->assertSame('ru', $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => '', 'guest_id' => $client->id]), 'booked', null, $this->staff)->locale);
        $this->assertSame('de', $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => 'x@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']), 'booked', null, $this->staff)->locale);
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Messages/ClientMessengerTest.php`
  - Expected: FAIL — `Class "App\Services\Appointments\Messages\ClientMessenger" not found`.

- [ ] **Step 3: Write** `app/Services/Appointments/Messages/ClientMessenger.php`:

```php
<?php

namespace App\Services\Appointments\Messages;

use App\Jobs\DeliverClientMessage;
use App\Models\ClientMessage;
use App\Models\EmailSuppression;
use App\Models\ServiceBooking;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Log;

/**
 * The one sender of client messages about appointments (Part D spec §5.2).
 * Every staff action that may tell the client calls afterStaffAction() once
 * its own change is saved; the reminder command calls remind(). Each call
 * decides, writes one client_messages row (queued, or skipped with the
 * reason) and queues the delivery after the surrounding transaction commits.
 * A staff action is never refused or undone because of a message.
 */
final class ClientMessenger
{
    public function afterStaffAction(ServiceBooking $booking, string $kind, ?bool $notify, User $actor, ?\DateTimeInterface $previousStart = null): ClientMessage
    {
        try {
            $tell = $notify ?? MessageSettings::read((int) $booking->organization_id)['staff_default'];

            return $this->record($booking, $kind, $tell ? null : 'not_requested', (int) $actor->id, $previousStart);
        } catch (\Throwable $e) {
            Log::warning('client message could not be recorded', ['booking_id' => $booking->id, 'kind' => $kind, 'error' => $e->getMessage()]);

            return new ClientMessage(['kind' => $kind, 'status' => 'failed', 'reason' => 'mail_error', 'channel' => 'email']);
        }
    }

    /** Null when this appointment already has a reminder for its current time. */
    public function remind(ServiceBooking $booking): ?ClientMessage
    {
        try {
            return $this->record($booking, 'reminder', null, null, null);
        } catch (UniqueConstraintViolationException) {
            return null;
        }
    }

    private function record(ServiceBooking $booking, string $kind, ?string $declined, ?int $actorId, ?\DateTimeInterface $previousStart): ClientMessage
    {
        $orgId = (int) $booking->organization_id;
        $recipient = MessageRecipient::for($booking);
        $reason = $declined
            ?? ($recipient === null ? 'no_recipient' : null)
            ?? (EmailSuppression::isSuppressed($recipient, $orgId) ? 'suppressed' : null);

        $row = ClientMessage::create([
            'service_booking_id' => $booking->id,
            'kind'               => $kind,
            'channel'            => 'email',
            'recipient'          => $recipient,
            'locale'             => MessageLocale::for($booking, MessageSettings::read($orgId)['language']),
            'status'             => $reason === null ? 'queued' : 'skipped',
            'reason'             => $reason,
            'for_start_at'       => $booking->start_at,
            'previous_start_at'  => $previousStart,
            'actor_user_id'      => $actorId,
        ]);

        if ($reason === null) {
            try {
                DeliverClientMessage::dispatch($row->id)->afterCommit();
            } catch (\Throwable $e) {
                // The sync queue runs the job at once; its failure is already on the row.
                Log::warning('client message delivery failed', ['client_message_id' => $row->id, 'error' => $e->getMessage()]);
            }
        }

        return $row;
    }
}
```

- [ ] **Step 4: Write** `app/Jobs/DeliverClientMessage.php`:

```php
<?php

namespace App\Jobs;

use App\Mail\AppointmentMessageMail;
use App\Models\ClientMessage;
use App\Models\ServiceBooking;
use App\Services\Appointments\VenueClock;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Sends one queued client message (Part D spec §5.3). It reads the
 * appointment again first: a message about a time that no longer holds (the
 * appointment was moved, or cancelled and this is not the cancellation) is
 * skipped as stale instead of sent.
 */
class DeliverClientMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** One attempt: a mail failure is marked on the row in handle(), never retried behind staff's back. */
    public int $tries = 1;

    public function __construct(public int $clientMessageId)
    {
    }

    public function handle(): void
    {
        $row = ClientMessage::withoutGlobalScopes()->find($this->clientMessageId);
        if (!$row || $row->status !== 'queued') {
            return;
        }

        // No request here: bind the tenant the rows belong to.
        app()->instance('current_organization_id', (int) $row->organization_id);

        $booking = ServiceBooking::withoutGlobalScopes()->with(['service', 'master'])->find($row->service_booking_id);
        if (!$booking || $this->stale($row, $booking)) {
            $row->forceFill(['status' => 'skipped', 'reason' => 'stale'])->save();

            return;
        }

        try {
            Mail::to($row->recipient)->send(new AppointmentMessageMail($row, $booking));
        } catch (\Throwable $e) {
            // Marked here and not rethrown: on the sync queue a rethrow would surface in the staff action that
            // queued this (after its transaction committed) as a 500. The row says it failed; staff see it.
            $row->forceFill(['status' => 'failed', 'reason' => 'mail_error'])->save();
            Log::warning('client message could not be sent', ['client_message_id' => $row->id, 'error' => $e->getMessage()]);

            return;
        }
        $row->forceFill(['status' => 'sent', 'sent_at' => now()])->save();
    }

    public function failed(?\Throwable $e): void
    {
        ClientMessage::withoutGlobalScopes()->whereKey($this->clientMessageId)->update(['status' => 'failed', 'reason' => 'mail_error']);
        Log::warning('client message could not be sent', ['client_message_id' => $this->clientMessageId, 'error' => $e?->getMessage()]);
    }

    private function stale(ClientMessage $row, ServiceBooking $booking): bool
    {
        if ($row->kind !== 'cancelled' && (string) $booking->status === 'cancelled') {
            return true;
        }

        return VenueClock::wall($booking->start_at) !== VenueClock::wall($row->for_start_at);
    }
}
```

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2.
  - Expected: PASS (9 tests).
  - The mail-failure test proves `handle()` marks the row itself. `failed()` stays only as a backstop for a job
    that dies outside `handle()`.

- [ ] **Step 6: Commit** with the subject "Send client messages through one sender and a delivery job":

```bash
git add app/Services/Appointments/Messages/ClientMessenger.php app/Jobs/DeliverClientMessage.php tests/Feature/Appointments/Messages/ClientMessengerTest.php
git commit -F <ws>/tools/commit-4.txt
```

---

### Task 5: The workspace tells the client

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php`, `app/Services/Appointments/AppointmentPresenter.php`
- Test: `tests/Feature/Appointments/Messages/WorkspaceMessagesTest.php`

**Interfaces:**
- Consumes: `ClientMessenger::afterStaffAction()`, `ClientMessage::toApi()`, `MessageRecipient::for()` (Tasks 2, 4)
- Produces:
  - Workspace answers:
    - `POST bookings` → `{booking, replayed, client_message: ?array}`;
    - `PATCH bookings/{id}` → `{booking, client_message: ?array}`;
    - `POST bookings/{id}/actions` → `{booking, points, client_message: ?array}`.
  - Each request accepts `notify_client` (nullable boolean).
  - The detail gains `client_email: ?string` and `messages: list<toApi()>` (newest first, at most 20).

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Messages/WorkspaceMessagesTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Messages;

use App\Models\ClientMessage;
use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class WorkspaceMessagesTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
    }

    private function create(array $extra = [], ?string $key = null): \Illuminate\Testing\TestResponse
    {
        $client = $this->seedClient(['email' => 'sophie@example.test', 'email_key' => 'sophie@example.test']);

        return $this->asStaff()->postJson($this->api('bookings'), array_merge([
            'client_id' => $client->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00',
        ], $extra), ['Idempotency-Key' => $key ?? (string) Str::uuid()]);
    }

    public function test_a_booking_made_by_staff_tells_the_client_as_the_box_says(): void
    {
        $this->create(['notify_client' => true])->assertStatus(201)
            ->assertJsonPath('client_message.kind', 'booked')
            ->assertJsonPath('client_message.status', 'queued')
            ->assertJsonPath('client_message.recipient', 'sophie@example.test')
            ->assertJsonPath('booking.client_email', 'sophie@example.test')
            ->assertJsonPath('booking.messages.0.kind', 'booked');
    }

    public function test_unticked_or_venue_off_records_the_choice_and_sends_nothing(): void
    {
        $this->create(['notify_client' => false])->assertJsonPath('client_message.reason', 'not_requested');
        $this->create(['start' => '2026-10-06T12:00'])->assertJsonPath('client_message.reason', 'not_requested'); // venue default off
        Queue::assertNothingPushed();
    }

    public function test_a_retried_create_does_not_email_twice(): void
    {
        $this->setClientMessages(true);
        $key = (string) Str::uuid();
        $client = $this->seedClient(['email' => 'sophie@example.test', 'email_key' => 'sophie@example.test']);
        $body = ['client_id' => $client->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00'];

        $this->asStaff()->postJson($this->api('bookings'), $body, ['Idempotency-Key' => $key])->assertStatus(201);
        $this->asStaff()->postJson($this->api('bookings'), $body, ['Idempotency-Key' => $key])->assertOk()
            ->assertJsonPath('replayed', true)
            ->assertJsonPath('client_message', null);

        $this->assertSame(1, ClientMessage::where('kind', 'booked')->count());
    }

    public function test_a_move_says_the_former_time_and_a_person_only_move_still_counts(): void
    {
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);
        $move = fn (array $body) => $this->asStaff()->patchJson($this->api("bookings/{$booking->id}"), array_merge([
            'start' => '2026-10-06T14:00', 'master_id' => $this->master->id, 'revision' => AppointmentPresenter::revision($booking->fresh()), 'notify_client' => true,
        ], $body));

        $move([])->assertOk()->assertJsonPath('client_message.kind', 'moved');
        $row = ClientMessage::where('kind', 'moved')->latest('id')->first();
        $this->assertSame(['2026-10-06 14:00:00', '2026-10-06 10:00:00'], [$row->for_start_at->format('Y-m-d H:i:s'), $row->previous_start_at->format('Y-m-d H:i:s')]);

        $second = ServiceMaster::create(['name' => 'Ilze Ozola', 'is_active' => true]);
        $second->services()->attach($this->service->id);
        foreach (range(0, 6) as $day) {
            $second->schedules()->create(['day_of_week' => $day, 'start_time' => '09:00', 'end_time' => '17:00', 'is_active' => true]);
        }
        $move(['master_id' => $second->id])->assertOk()->assertJsonPath('client_message.kind', 'moved');

        $move(['master_id' => $second->id])->assertOk()->assertJsonPath('client_message', null); // nothing changed
    }

    public function test_confirm_and_cancel_tell_the_client_and_other_actions_do_not(): void
    {
        $pending = $this->seedBooking(['customer_email' => 'sophie@example.test', 'status' => 'pending']);
        $act = fn ($b, string $action, array $extra = []) => $this->asStaff()->postJson($this->api("bookings/{$b->id}/actions"), array_merge([
            'action' => $action, 'revision' => AppointmentPresenter::revision($b->fresh()), 'notify_client' => true,
        ], $extra));

        $act($pending, 'confirm')->assertOk()->assertJsonPath('client_message.kind', 'confirmed');
        $act($pending, 'start')->assertOk()->assertJsonPath('client_message', null);

        $other = $this->seedBooking(['customer_email' => 'sophie@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $act($other, 'cancel', ['reason' => 'Therapist ill'])->assertOk()
            ->assertJsonPath('client_message.kind', 'cancelled')
            ->assertJsonPath('booking.messages.0.kind', 'cancelled');
    }

    public function test_the_detail_lists_the_messages_newest_first_and_knows_the_address(): void
    {
        $client = $this->seedClient(['email' => 'client@example.test', 'email_key' => 'client@example.test']);
        $booking = $this->seedBooking(['customer_email' => '', 'guest_id' => $client->id]);
        ClientMessage::create(['service_booking_id' => $booking->id, 'kind' => 'booked', 'status' => 'sent', 'channel' => 'email', 'locale' => 'en', 'recipient' => 'client@example.test', 'for_start_at' => $booking->start_at]);
        $this->travel(1)->minutes();
        ClientMessage::create(['service_booking_id' => $booking->id, 'kind' => 'reminder', 'status' => 'skipped', 'reason' => 'suppressed', 'channel' => 'email', 'locale' => 'en', 'recipient' => 'client@example.test', 'for_start_at' => $booking->start_at]);

        $this->asStaff()->getJson($this->api("bookings/{$booking->id}"))->assertOk()
            ->assertJsonPath('booking.client_email', 'client@example.test')
            ->assertJsonPath('booking.messages.0.kind', 'reminder')
            ->assertJsonPath('booking.messages.0.reason', 'suppressed')
            ->assertJsonPath('booking.messages.1.kind', 'booked');
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Messages/WorkspaceMessagesTest.php`
  - Expected: FAIL. `client_message` and `booking.client_email` are missing.
  - If the fixture's `ServiceMaster` has no `services()` or `schedules()` relation by those names, use the names
    `seedBookableService()` uses in `tests/Concerns/SetsUpServiceBookingSchema.php`, and ledger it.

- [ ] **Step 3: The presenter.** In `AppointmentPresenter::detail()`:
  - add the imports `use App\Models\ClientMessage;` and `use App\Services\Appointments\Messages\MessageRecipient;`;
  - add two entries to the merged array, after `'history' => $this->history($b),`:

```php
            'client_email' => MessageRecipient::for($b),
            'messages'     => ClientMessage::where('service_booking_id', $b->id)->orderByDesc('id')->limit(20)->get()
                ->map(fn (ClientMessage $m) => $m->toApi())->values()->all(),
```

- [ ] **Step 4: The controller.** In `Appointments\BookingController`, add `use App\Models\ClientMessage;` and
  `use App\Services\Appointments\Messages\ClientMessenger;`.
  - Inject `ClientMessenger $messenger` into `store`, `update` and `action`.
  - Add `'notify_client' => 'nullable|boolean',` to each `validate([...])`.
  - Add the helper:

```php
    /** The request's "tell the client" box: null when the screen did not say (the venue's setting decides). */
    private static function notify(Request $request): ?bool
    {
        return $request->has('notify_client') && $request->input('notify_client') !== null ? $request->boolean('notify_client') : null;
    }
```

  - `store`: after `$result = $writer->create(...)`:

```php
        $message = $result['replayed'] ? null : $messenger->afterStaffAction($result['booking'], 'booked', self::notify($request), $request->user());
```

    The JSON gains `'client_message' => $message?->toApi()`.
  - `update`: before the `try`, read what it was:

```php
        $before = ServiceBooking::find($id);
```

    After the move succeeds:

```php
        $changed = $before && ((string) \App\Services\Appointments\VenueClock::wall($before->start_at) !== (string) \App\Services\Appointments\VenueClock::wall($booking->start_at)
            || (int) $before->service_master_id !== (int) $booking->service_master_id);
        $message = $changed ? $messenger->afterStaffAction($booking->fresh(), 'moved', self::notify($request), $request->user(), $before->start_at) : null;
```

    The JSON gains `'client_message' => $message?->toApi()`.
  - `action`: after `$result = $runner->run(...)`:

```php
        $kind = ['confirm' => 'confirmed', 'cancel' => 'cancelled'][$data['action']] ?? null;
        $message = $kind ? $messenger->afterStaffAction($result['booking'], $kind, self::notify($request), $request->user()) : null;
```

    The JSON gains `'client_message' => $message?->toApi()`.
  - The answer's `booking` is built after the message, so its `messages` include it. In `store` and `action` the
    `$presenter->detail(...)` call already comes after these lines once you place them before the `return`.

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2, then `tests/Feature/Appointments`.
  - Expected: PASS (6 new tests); every existing Appointments test passes.

- [ ] **Step 6: Commit** with the subject "Tell the client when the workspace books, moves, confirms or cancels":

```bash
git add app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php app/Services/Appointments/AppointmentPresenter.php tests/Feature/Appointments/Messages/WorkspaceMessagesTest.php
git commit -F <ws>/tools/commit-5.txt
```

---

### Task 6: The full admin tells the client too

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` (`store`, `updateStatus`, `destroy`, `bulk`)
- Test: `tests/Feature/Appointments/Messages/FullAdminMessagesTest.php`

**Interfaces:**
- Consumes: `ClientMessenger::afterStaffAction()`, `ClientMessage::toApi()`
- Produces:
  - `store`, `updateStatus` and `destroy` answers gain `client_message: ?array`;
  - `bulk` gains `client_messages: {queued: int, skipped: int}`;
  - all four accept `notify_client`.

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Messages/FullAdminMessagesTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Messages;

use App\Models\ClientMessage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class FullAdminMessagesTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
    }

    public function test_a_booking_made_in_the_full_admin_tells_the_client(): void
    {
        $this->asStaff()->postJson('/api/v1/admin/service-bookings', [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Walk In', 'customer_email' => 'walkin@example.test', 'start_at' => '2026-10-06T10:00:00', 'notify_client' => true,
        ])->assertStatus(201)
            ->assertJsonPath('client_message.kind', 'booked')
            ->assertJsonPath('client_message.status', 'queued');
    }

    public function test_status_changes_tell_only_for_confirm_from_pending_and_cancel(): void
    {
        $pending = $this->seedBooking(['customer_email' => 'sophie@example.test', 'status' => 'pending']);
        $patch = fn ($b, array $body) => $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$b->id}/status", $body + ['notify_client' => true]);

        $patch($pending, ['status' => 'confirmed'])->assertOk()->assertJsonPath('client_message.kind', 'confirmed');
        $patch($pending, ['status' => 'confirmed'])->assertOk()->assertJsonPath('client_message', null); // already confirmed
        $patch($pending, ['status' => 'in_progress'])->assertOk()->assertJsonPath('client_message', null);
        $patch($pending, ['payment_status' => 'paid'])->assertOk()->assertJsonPath('client_message', null);
        $patch($pending, ['status' => 'cancelled'])->assertOk()->assertJsonPath('client_message.kind', 'cancelled');
        $patch($pending, ['status' => 'cancelled'])->assertOk()->assertJsonPath('client_message', null); // already cancelled
    }

    public function test_delete_cancels_and_tells_unless_unticked(): void
    {
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $this->asStaff()->deleteJson("/api/v1/admin/service-bookings/{$booking->id}", ['notify_client' => false])->assertOk()
            ->assertJsonPath('message', 'Booking cancelled')
            ->assertJsonPath('client_message.reason', 'not_requested');
    }

    public function test_bulk_cancel_tells_each_client_once_and_skips_rows_already_cancelled(): void
    {
        $a = $this->seedBooking(['customer_email' => 'a@example.test']);
        $b = $this->seedBooking(['customer_email' => '', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $c = $this->seedBooking(['customer_email' => 'c@example.test', 'status' => 'cancelled', 'start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$a->id, $b->id, $c->id], 'action' => 'cancel', 'notify_client' => true])
            ->assertOk()
            ->assertJsonPath('client_messages', ['queued' => 1, 'skipped' => 1]);

        $this->assertSame(0, ClientMessage::where('service_booking_id', $c->id)->count());
        $this->assertSame('no_recipient', ClientMessage::where('service_booking_id', $b->id)->value('reason'));
    }

    public function test_bulk_mark_status_to_confirmed_tells_pending_rows_only_and_other_bulk_actions_none(): void
    {
        $pending = $this->seedBooking(['customer_email' => 'a@example.test', 'status' => 'pending']);
        $confirmed = $this->seedBooking(['customer_email' => 'b@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$pending->id, $confirmed->id], 'action' => 'mark_status', 'value' => 'confirmed', 'notify_client' => true])
            ->assertJsonPath('client_messages', ['queued' => 1, 'skipped' => 0]);
        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$pending->id], 'action' => 'mark_no_show', 'notify_client' => true])
            ->assertJsonPath('client_messages', ['queued' => 0, 'skipped' => 0]);
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Messages/FullAdminMessagesTest.php`
  - Expected: FAIL. `client_message` and `client_messages` are missing.

- [ ] **Step 3: Implement** in `ServiceBookingController`. Add `use App\Services\Appointments\Messages\ClientMessenger;`
  and this helper:

```php
    /** The request's "tell the client" box; null when the screen did not say (the venue's setting decides). */
    private static function notify(Request $request): ?bool
    {
        return $request->has('notify_client') && $request->input('notify_client') !== null ? $request->boolean('notify_client') : null;
    }

    /** Which message a status change sends: confirmed from pending, cancelled from anything else; null for the rest. */
    private static function kindFor(string $from, ?string $to): ?string
    {
        return match (true) {
            $to === 'confirmed' && $from === 'pending'   => 'confirmed',
            $to === 'cancelled' && $from !== 'cancelled' => 'cancelled',
            default                                      => null,
        };
    }
```

  - **`store`:**
    - add `'notify_client' => 'nullable|boolean',` to its validation;
    - inside the closure, after `AuditLog::record(...)` and before its `return`:
      `$message = app(ClientMessenger::class)->afterStaffAction($booking, 'booked', self::notify($request), $request->user());`
      (R6);
    - the return becomes
      `return response()->json(array_merge($booking->fresh(['service', 'master', 'extras'])->toArray(), ['client_message' => $message->toApi()]), 201);`
  - **`updateStatus`:**
    - add `'notify_client' => 'nullable|boolean',` to its validation;
    - remove `notify_client` from `$data` before `$booking->update(...)` (`unset($data['notify_client'])` right after
      validation; keep `$notify = self::notify($request);` first);
    - the transaction closure returns `[$booking, $before['status']]` (destructure
      `[$booking, $fromStatus] = DB::transaction(...)`);
    - after the points block:

```php
        $kind = self::kindFor((string) $fromStatus, $data['status'] ?? null);
        $message = $kind ? app(ClientMessenger::class)->afterStaffAction($booking->fresh(), $kind, $notify, $request->user()) : null;

        return response()->json(array_merge($booking->fresh(['service', 'master', 'extras'])->toArray(), ['client_message' => $message?->toApi()]));
```

  - **`destroy`:**
    - change its signature to `destroy(Request $request, int $id)` (`Request` is already imported in this
      controller);
    - before the update, keep `$from = (string) $booking->status;`;
    - after the audit block:

```php
        $message = self::kindFor($from, 'cancelled')
            ? app(ClientMessenger::class)->afterStaffAction($booking->fresh(), 'cancelled', self::notify($request), $request->user())
            : null;

        return response()->json(['message' => 'Booking cancelled', 'client_message' => $message?->toApi()]);
```

  - **`bulk`:**
    - add `'notify_client' => 'nullable|boolean',` to its validation;
    - after the points block:

```php
        $counts = ['queued' => 0, 'skipped' => 0];
        $to = match ($validated['action']) {
            'cancel'      => 'cancelled',
            'mark_status' => $validated['value'] ?? null,
            default       => null,
        };
        foreach ($rows as $b) {
            $kind = $to ? self::kindFor((string) $b->status, $to) : null; // $b is the row as it was before
            if ($kind === null) {
                continue;
            }
            $message = app(ClientMessenger::class)->afterStaffAction($b->fresh(), $kind, self::notify($request), $request->user());
            $counts[$message->status === 'queued' || $message->status === 'sent' ? 'queued' : 'skipped']++;
        }
```

    - and its answer gains `'client_messages' => $counts`.

- [ ] **Step 4: Run it.**
  - Run: same command as Step 2, then `tests/Feature/Admin`, `tests/Feature/Appointments` and `tests/Feature/AdminAccess`.
  - Expected: PASS (5 new tests); the other suites as in the baseline.

- [ ] **Step 5: Commit** with the subject "Tell the client when the full admin books, confirms or cancels":

```bash
git add app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php tests/Feature/Appointments/Messages/FullAdminMessagesTest.php
git commit -F <ws>/tools/commit-6.txt
```

---

### Task 7: The reminder

**Files:**
- Create: `app/Console/Commands/SendAppointmentReminders.php`
- Modify: `routes/console.php`
- Test: `tests/Feature/Appointments/Messages/RemindersTest.php`

**Interfaces:**
- Consumes: `MessageSettings`, `ClientMessenger::remind()`, `ClientMessage`, `VenueClock`, `AppointmentClock::toInstant()`
- Produces: `php artisan appointments:send-reminders`, scheduled every five minutes `withoutOverlapping(10)`

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Messages/RemindersTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Messages;

use App\Models\ClientMessage;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** The fixture's clock: Monday 5 October 2026, 06:00 UTC. A 24-hour reminder is due for an appointment at 06:00 on the 6th. */
class RemindersTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
        $this->setClientMessages(false, 24);
    }

    private function at(string $start, array $attrs = []): \App\Models\ServiceBooking
    {
        $booking = $this->seedBooking(array_merge(['customer_email' => 'sophie@example.test', 'start_at' => $start, 'end_at' => CarbonImmutable::parse($start)->addMinutes(45)->format('Y-m-d H:i:s')], $attrs));
        $booking->forceFill(['created_at' => '2026-10-01 09:00:00'])->saveQuietly();

        return $booking;
    }

    private function run(): void
    {
        $this->artisan('appointments:send-reminders')->assertSuccessful();
    }

    private function reminded(int $id): bool
    {
        return ClientMessage::where('service_booking_id', $id)->where('kind', 'reminder')->exists();
    }

    public function test_the_window_is_the_last_thirty_minutes_before_now_plus_the_venues_hours(): void
    {
        $due = $this->at('2026-10-06 06:00:00');
        $edge = $this->at('2026-10-06 05:35:00');
        $tooSoon = $this->at('2026-10-06 05:30:00');
        $notYet = $this->at('2026-10-06 06:05:00');

        $this->run();

        $this->assertTrue($this->reminded($due->id));
        $this->assertTrue($this->reminded($edge->id));
        $this->assertFalse($this->reminded($tooSoon->id));
        $this->assertFalse($this->reminded($notYet->id));
    }

    public function test_running_twice_sends_once_and_a_missed_run_is_caught_up(): void
    {
        $due = $this->at('2026-10-06 06:20:00');

        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:25:00')); // the 06:20 moment passed 5 minutes ago
        $this->run();
        $this->run();

        $this->assertSame(1, ClientMessage::where('service_booking_id', $due->id)->where('kind', 'reminder')->count());

        $late = $this->at('2026-10-06 05:40:00'); // its moment was 45 minutes ago: too late, not sent
        $this->run();
        $this->assertFalse($this->reminded($late->id));
    }

    public function test_booked_or_moved_inside_the_window_and_cancelled_get_none(): void
    {
        $bookedLate = $this->at('2026-10-06 06:00:00');
        $bookedLate->forceFill(['created_at' => '2026-10-05 05:59:00'])->saveQuietly(); // before the moment: still gets one
        $bookedInside = $this->at('2026-10-06 05:50:00');
        $bookedInside->forceFill(['created_at' => '2026-10-05 05:55:00'])->saveQuietly(); // after its 05:50 moment

        $moved = $this->at('2026-10-06 05:45:00');
        ClientMessage::create(['service_booking_id' => $moved->id, 'kind' => 'moved', 'status' => 'sent', 'channel' => 'email', 'locale' => 'en', 'for_start_at' => $moved->start_at]);

        $cancelled = $this->at('2026-10-06 05:55:00', ['status' => 'cancelled']);

        $this->run();

        $this->assertTrue($this->reminded($bookedLate->id));
        $this->assertFalse($this->reminded($bookedInside->id));
        $this->assertFalse($this->reminded($moved->id));
        $this->assertFalse($this->reminded($cancelled->id));
    }

    public function test_a_venue_east_of_utc_counts_on_its_own_clock_and_a_venue_switched_off_sends_nothing(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save(); // 09:00 there
        app()->forgetScopedInstances();
        $riga = $this->at('2026-10-06 09:00:00');
        $utcTime = $this->at('2026-10-06 06:00:00');

        $this->run();
        $this->assertTrue($this->reminded($riga->id));
        $this->assertFalse($this->reminded($utcTime->id));

        $this->setClientMessages(false, 0);
        $later = $this->at('2026-10-06 08:55:00');
        $this->run();
        $this->assertFalse($this->reminded($later->id));
    }

    public function test_a_person_only_move_does_not_send_the_reminder_again(): void
    {
        $due = $this->at('2026-10-06 06:00:00');
        $this->run();

        $due->update(['service_master_id' => $this->master->id]); // same time, same row
        $this->run();

        $this->assertSame(1, ClientMessage::where('service_booking_id', $due->id)->where('kind', 'reminder')->count());
    }

    public function test_a_setting_left_by_a_deleted_organisation_does_not_stop_the_others(): void
    {
        $due = $this->at('2026-10-06 06:00:00');
        \Illuminate\Support\Facades\DB::table('hotel_settings')->insert([
            'organization_id' => 999999, 'key' => 'client_messages_reminder_hours', 'value' => '24', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->run();

        $this->assertTrue($this->reminded($due->id));
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Messages/RemindersTest.php`
  - Expected: FAIL — `The command "appointments:send-reminders" does not exist.`

- [ ] **Step 3: Implement** `app/Console/Commands/SendAppointmentReminders.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\ClientMessage;
use App\Models\HotelSetting;
use App\Models\ServiceBooking;
use App\Services\Appointments\Messages\ClientMessenger;
use App\Services\Appointments\Messages\MessageSettings;
use App\Services\Appointments\VenueClock;
use App\Services\Portal\AppointmentClock;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * The reminder before each visit (Part D spec §5.4). Every five minutes,
 * for each venue with a reminder of H hours: every pending or confirmed
 * appointment whose reminder moment (start − H, on the venue's clock) fell
 * in the last 30 minutes, unless it was booked or moved after that moment
 * (the booking or move email already told the client) or already has a
 * reminder for its current time. A missed run is caught up within 30
 * minutes; a longer outage skips rather than sends late.
 */
class SendAppointmentReminders extends Command
{
    protected $signature = 'appointments:send-reminders';

    protected $description = 'Email the reminder for every appointment whose reminder moment has come (Part D).';

    public function handle(ClientMessenger $messenger): int
    {
        $orgIds = HotelSetting::withoutGlobalScopes()
            ->where('key', MessageSettings::REMINDER_HOURS)
            ->whereIn('value', ['2', '24', '48'])
            ->pluck('organization_id')->unique()->values();

        $queued = 0;
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        foreach ($orgIds as $orgId) {
            try {
                $queued += $this->forOrganization((int) $orgId, $messenger);
            } catch (\Throwable $e) {
                Log::warning('appointments:send-reminders failed for an organization', ['organization_id' => $orgId, 'error' => $e->getMessage()]);
            } finally {
                // Each organisation binds its own tenant; give back whatever was bound before.
                if ($prior === null) {
                    app()->forgetInstance('current_organization_id');
                } else {
                    app()->instance('current_organization_id', $prior);
                }
                app()->forgetScopedInstances();
            }
        }

        $this->line("reminders queued: {$queued}");

        return self::SUCCESS;
    }

    private function forOrganization(int $orgId, ClientMessenger $messenger): int
    {
        $hours = MessageSettings::read($orgId)['reminder_hours'];
        if ($hours === 0) {
            return 0;
        }

        app()->instance('current_organization_id', $orgId);
        app()->forgetScopedInstances(); // the venue's zone is memoised per request
        $zone = VenueClock::zone($orgId);
        $now = VenueClock::now($orgId);

        $bookings = ServiceBooking::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereIn('status', ['pending', 'confirmed'])
            ->where('start_at', '>', $now->addHours($hours)->subMinutes(30)->format('Y-m-d H:i:s'))
            ->where('start_at', '<=', $now->addHours($hours)->format('Y-m-d H:i:s'))
            ->get();

        $queued = 0;
        foreach ($bookings as $booking) {
            $moment = AppointmentClock::toInstant($booking->start_at, $zone)->subHours($hours);
            if ($booking->created_at && $booking->created_at->greaterThan($moment)) {
                continue; // booked inside the window
            }
            $movedLate = ClientMessage::withoutGlobalScopes()
                ->where('service_booking_id', $booking->id)->where('kind', 'moved')
                ->where('created_at', '>', $moment->utc()->format('Y-m-d H:i:s'))
                ->exists();
            if ($movedLate) {
                continue; // the move email already told the client
            }
            $row = $messenger->remind($booking);
            if ($row !== null && $row->status === 'queued') {
                $queued++;
            }
        }

        return $queued;
    }
}
```

- [ ] **Step 4: Schedule it.** In `routes/console.php`, after the `bookings:release-orphan-portal-holds` entry, add:

```php
// Part D: the client's reminder before each visit, at each venue's chosen
// time (off until a manager switches it on in Setup).
Schedule::command('appointments:send-reminders')
    ->everyFiveMinutes()
    ->withoutOverlapping(10);
```

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2.
  - Expected: PASS (6 tests).
  - The moved test seeds its `moved` row at the fixture's clock (05 Oct 06:00 UTC), which is after that
    appointment's moment (05:45 on the 5th). If your `created_at` lands before it, travel the clock back while
    seeding and ledger it.
  - The tests read `ClientMessage` through the tenant scope after the command ran. They pass only because the
    command gives back the binding it found (the `finally` block). A failure there means the binding leaked.

- [ ] **Step 6: Commit** with the subject "Remind clients before each visit, at the venue's chosen time":

```bash
git add app/Console/Commands/SendAppointmentReminders.php routes/console.php tests/Feature/Appointments/Messages/RemindersTest.php
git commit -F <ws>/tools/commit-7.txt
```

---

### Task 8: The workspace's checkbox, its answer and the Messages list

**Files:**
- Create: `frontend/src/appointments/panel/TellClient.tsx`, `panel/Messages.tsx`, `panel/messages.ts`
- Create: `<ws>/tools/add-partd-strings.cjs` (used here and in Task 10)
- Modify: `frontend/src/appointments/lib/types.ts`, `lib/api.ts`
- Modify: `frontend/src/appointments/panel/panelState.ts`, `AppointmentPanel.tsx`, `CreateForm.tsx`, `MoveForm.tsx`,
  `ActionConfirm.tsx`, `AppointmentView.tsx`
- Modify: the five `appointments.<lang>.json`, `appointments/i18n/appointmentsLocales.test.ts`
- Test: `frontend/src/appointments/panel/tellClient.test.tsx`

**Interfaces:**
- Consumes: the server's `client_message`, `client_email`, `messages` and bootstrap `messages` (Tasks 1, 5)
- Produces:
  - types `MessageKind`, `ClientMessageInfo`, `MessageSettingsInfo`;
  - `TellClient({ email, checked, onChange })`;
  - `Messages({ messages, zone, locale })`;
  - `messageLine(m): {key, fallback, vars, tone}`;
  - `PanelState` view `told`, and the events `created` and `done` carrying `told`.

- [ ] **Step 1: The strings.** Write `<ws>/tools/add-partd-strings.cjs` with the Write tool:

```js
// node <ws>/tools/add-partd-strings.cjs workspace|admin — run from the feature worktree root.
// workspace: a top-level "messages" block in each appointments bundle, and setup.step.messages.
// admin: a top-level "tell_client" block in each app common.json.
// Inserted as text (the bundles are hand-formatted), keeping each file's line endings, then parsed to prove them.
const fs = require('fs')
const which = process.argv[2]
const W = {
  en: { step: 'Tell clients by email (optional)', messages: {
    tell: 'Tell the client by email ({{email}})', no_email: 'No email address — the client will not be told.', sent: 'Emailed to {{email}}.', title: 'Messages',
    kind: { booked: 'Booked', moved: 'Moved', confirmed: 'Confirmed', cancelled: 'Cancelled', reminder: 'Reminder' },
    reason: { not_requested: 'Not sent: staff chose not to tell the client.', no_recipient: 'Not sent: no email address.', suppressed: 'Not sent: {{email}} does not accept our emails.', stale: 'Not sent: the appointment changed before the email left.', mail_error: 'The email to {{email}} could not be sent.' },
    setup: { title: 'Client messages', staff: 'Email clients about changes staff make (staff can untick it each time)', reminder: 'Reminder before each visit', off: 'Off', hours: '{{count}} hours before', language: "Language when the client's is not known" } } },
  ru: { step: 'Сообщения клиентам по почте (необязательно)', messages: {
    tell: 'Сообщить клиенту по почте ({{email}})', no_email: 'Нет адреса почты — клиенту ничего не придёт.', sent: 'Отправлено на {{email}}.', title: 'Сообщения',
    kind: { booked: 'Запись', moved: 'Перенос', confirmed: 'Подтверждение', cancelled: 'Отмена', reminder: 'Напоминание' },
    reason: { not_requested: 'Не отправлено: сотрудник решил не сообщать клиенту.', no_recipient: 'Не отправлено: нет адреса почты.', suppressed: 'Не отправлено: {{email}} не принимает наши письма.', stale: 'Не отправлено: запись изменилась до отправки письма.', mail_error: 'Письмо на {{email}} не удалось отправить.' },
    setup: { title: 'Сообщения клиентам', staff: 'Сообщать клиентам по почте об изменениях, сделанных сотрудниками (каждый раз можно снять отметку)', reminder: 'Напоминание перед визитом', off: 'Выкл.', hours: 'За {{count}} ч', language: 'Язык, если язык клиента неизвестен' } } },
  de: { step: 'Kunden per E-Mail informieren (optional)', messages: {
    tell: 'Den Kunden per E-Mail informieren ({{email}})', no_email: 'Keine E-Mail-Adresse — der Kunde wird nicht informiert.', sent: 'E-Mail an {{email}} gesendet.', title: 'Nachrichten',
    kind: { booked: 'Gebucht', moved: 'Verschoben', confirmed: 'Bestätigt', cancelled: 'Abgesagt', reminder: 'Erinnerung' },
    reason: { not_requested: 'Nicht gesendet: Das Team hat sich dagegen entschieden.', no_recipient: 'Nicht gesendet: keine E-Mail-Adresse.', suppressed: 'Nicht gesendet: {{email}} nimmt unsere E-Mails nicht an.', stale: 'Nicht gesendet: Der Termin hat sich vor dem Versand geändert.', mail_error: 'Die E-Mail an {{email}} konnte nicht gesendet werden.' },
    setup: { title: 'Kundennachrichten', staff: 'Kunden per E-Mail über Änderungen des Teams informieren (lässt sich jedes Mal abwählen)', reminder: 'Erinnerung vor jedem Termin', off: 'Aus', hours: '{{count}} Stunden vorher', language: 'Sprache, wenn die des Kunden unbekannt ist' } } },
  fr: { step: 'Prévenir les clients par e-mail (facultatif)', messages: {
    tell: 'Prévenir le client par e-mail ({{email}})', no_email: 'Pas d’adresse e-mail — le client ne sera pas prévenu.', sent: 'E-mail envoyé à {{email}}.', title: 'Messages',
    kind: { booked: 'Réservé', moved: 'Déplacé', confirmed: 'Confirmé', cancelled: 'Annulé', reminder: 'Rappel' },
    reason: { not_requested: 'Non envoyé : l’équipe a choisi de ne pas prévenir le client.', no_recipient: 'Non envoyé : pas d’adresse e-mail.', suppressed: 'Non envoyé : {{email}} n’accepte pas nos e-mails.', stale: 'Non envoyé : le rendez-vous a changé avant l’envoi.', mail_error: 'L’e-mail à {{email}} n’a pas pu être envoyé.' },
    setup: { title: 'Messages aux clients', staff: 'Prévenir les clients par e-mail des changements faits par l’équipe (décochable à chaque fois)', reminder: 'Rappel avant chaque visite', off: 'Désactivé', hours: '{{count}} heures avant', language: 'Langue si celle du client est inconnue' } } },
  es: { step: 'Avisar a los clientes por correo (opcional)', messages: {
    tell: 'Avisar al cliente por correo ({{email}})', no_email: 'Sin dirección de correo: el cliente no recibirá aviso.', sent: 'Correo enviado a {{email}}.', title: 'Mensajes',
    kind: { booked: 'Reservado', moved: 'Cambiado', confirmed: 'Confirmado', cancelled: 'Cancelado', reminder: 'Recordatorio' },
    reason: { not_requested: 'No enviado: el equipo decidió no avisar al cliente.', no_recipient: 'No enviado: sin dirección de correo.', suppressed: 'No enviado: {{email}} no acepta nuestros correos.', stale: 'No enviado: la cita cambió antes de enviar el correo.', mail_error: 'No se pudo enviar el correo a {{email}}.' },
    setup: { title: 'Mensajes a clientes', staff: 'Avisar por correo a los clientes de los cambios del equipo (se puede desmarcar cada vez)', reminder: 'Recordatorio antes de cada visita', off: 'Desactivado', hours: '{{count}} horas antes', language: 'Idioma si no se conoce el del cliente' } } },
}
const A = {
  en: { tell: 'Tell the client by email', tell_many: 'Tell the clients by email', no_email: 'No email address — the client will not be told.', confirm_title: 'Confirm this booking?', cancel_title: 'Cancel this booking?', bulk_cancel_title: 'Cancel {{count}} bookings?', go: 'Yes', back: 'Back' },
  ru: { tell: 'Сообщить клиенту по почте', tell_many: 'Сообщить клиентам по почте', no_email: 'Нет адреса почты — клиенту ничего не придёт.', confirm_title: 'Подтвердить запись?', cancel_title: 'Отменить запись?', bulk_cancel_title: 'Отменить записи: {{count}}?', go: 'Да', back: 'Назад' },
  de: { tell: 'Den Kunden per E-Mail informieren', tell_many: 'Die Kunden per E-Mail informieren', no_email: 'Keine E-Mail-Adresse — der Kunde wird nicht informiert.', confirm_title: 'Diese Buchung bestätigen?', cancel_title: 'Diese Buchung stornieren?', bulk_cancel_title: '{{count}} Buchungen stornieren?', go: 'Ja', back: 'Zurück' },
  fr: { tell: 'Prévenir le client par e-mail', tell_many: 'Prévenir les clients par e-mail', no_email: 'Pas d’adresse e-mail — le client ne sera pas prévenu.', confirm_title: 'Confirmer cette réservation ?', cancel_title: 'Annuler cette réservation ?', bulk_cancel_title: 'Annuler {{count}} réservations ?', go: 'Oui', back: 'Retour' },
  es: { tell: 'Avisar al cliente por correo', tell_many: 'Avisar a los clientes por correo', no_email: 'Sin dirección de correo: el cliente no recibirá aviso.', confirm_title: '¿Confirmar esta reserva?', cancel_title: '¿Cancelar esta reserva?', bulk_cancel_title: '¿Cancelar {{count}} reservas?', go: 'Sí', back: 'Volver' },
}
function block(key, value, eol) {
  return `  "${key}": ` + JSON.stringify(value, null, 2).split('\n').join(eol + '  ')
}
function appendTopLevel(file, key, value) {
  let raw = fs.readFileSync(file, 'utf8')
  if (raw.includes(`\n  "${key}": {`)) { console.log(`${file}: ${key} already there`); return raw }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const end = raw.lastIndexOf('}')
  const body = raw.slice(0, end).replace(/\s*$/, '')
  raw = body + ',' + eol + block(key, value, eol) + eol + '}' + eol
  JSON.parse(raw)
  fs.writeFileSync(file, raw)
  console.log(`${file}: ${key} added`)
  return raw
}
for (const lang of Object.keys(W)) {
  if (which === 'workspace') {
    const file = `frontend/src/appointments/i18n/appointments.${lang}.json`
    let raw = appendTopLevel(file, 'messages', W[lang].messages)
    if (!raw.includes('"messages": "')) {
      const eol = raw.includes('\r\n') ? '\r\n' : '\n'
      const m = raw.match(/\r?\n    "step": \{\r?\n/)
      if (!m) throw new Error(`${file}: the step block is not where it was`)
      raw = raw.replace(m[0], m[0] + `      "messages": ${JSON.stringify(W[lang].step)},${eol}`)
      JSON.parse(raw)
      fs.writeFileSync(file, raw)
      console.log(`${file}: setup.step.messages added`)
    }
  } else if (which === 'admin') {
    appendTopLevel(`frontend/src/i18n/locales/${lang}/common.json`, 'tell_client', A[lang])
  } else {
    throw new Error('say workspace or admin')
  }
}
```

  Run `node <ws>/tools/add-partd-strings.cjs workspace`.
  Expected: five "messages added" lines and five "setup.step.messages added" lines.

- [ ] **Step 2: Write the failing test** `frontend/src/appointments/panel/tellClient.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppointmentDetail, ClientMessageInfo } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { TellClient } = await import('./TellClient')
const { Messages } = await import('./Messages')
const { messageLine } = await import('./messages')
const { ActionConfirm } = await import('./ActionConfirm')
const { panelReducer, CLOSED } = await import('./panelState')

const msg = (over: Partial<ClientMessageInfo>): ClientMessageInfo => ({ kind: 'booked', status: 'sent', reason: null, recipient: 'sophie@example.test', at: '2026-10-05T06:00:00+00:00', ...over })

describe('TellClient', () => {
  it('offers the box with the address, ticked as the venue says', () => {
    const on = renderToStaticMarkup(<TellClient email="sophie@example.test" checked onChange={() => {}} />)
    expect(on).toContain('Tell the client by email (sophie@example.test)')
    expect(on).toContain('checked=""')
    expect(renderToStaticMarkup(<TellClient email="sophie@example.test" checked={false} onChange={() => {}} />)).not.toContain('checked=""')
  })

  it('says the client will not be told when there is no address, and offers no box', () => {
    const html = renderToStaticMarkup(<TellClient email={null} checked onChange={() => {}} />)
    expect(html).toContain('No email address — the client will not be told.')
    expect(html).not.toContain('type="checkbox"')
  })
})

describe('messageLine', () => {
  it('says what happened to each message, by status and reason', () => {
    expect(messageLine(msg({}))).toMatchObject({ key: 'appointments.messages.sent', vars: { email: 'sophie@example.test' }, tone: 'success' })
    expect(messageLine(msg({ status: 'queued' }))).toMatchObject({ key: 'appointments.messages.sent' })
    expect(messageLine(msg({ status: 'skipped', reason: 'suppressed' }))).toMatchObject({ key: 'appointments.messages.reason.suppressed', tone: 'warning' })
    expect(messageLine(msg({ status: 'skipped', reason: 'not_requested' }))).toMatchObject({ key: 'appointments.messages.reason.not_requested', tone: 'info' })
    expect(messageLine(msg({ status: 'failed', reason: 'mail_error' }))).toMatchObject({ key: 'appointments.messages.reason.mail_error', tone: 'danger' })
  })
})

describe('Messages', () => {
  it('lists every message with its kind and what happened, and nothing when there are none', () => {
    const html = renderToStaticMarkup(<Messages messages={[msg({ kind: 'reminder', status: 'skipped', reason: 'no_recipient' }), msg({})]} zone="Europe/London" locale="en" />)
    expect(html).toContain('Reminder')
    expect(html).toContain('Not sent: no email address.')
    expect(html).toContain('Emailed to sophie@example.test.')
    expect(renderToStaticMarkup(<Messages messages={[]} zone="UTC" locale="en" />)).toBe('')
  })
})

describe('ActionConfirm', () => {
  const booking = { client: { name: 'Sophie', email: 'sophie@example.test' }, client_email: 'sophie@example.test', start: '2026-10-06T10:00', end: '2026-10-06T10:45' } as unknown as AppointmentDetail
  const action = (key: 'confirm' | 'cancel' | 'complete') => ({ key, allowed: true, consequences: {} }) as never

  it('asks about the client on confirm and cancel only', () => {
    for (const key of ['confirm', 'cancel'] as const) {
      const html = renderToStaticMarkup(<ActionConfirm booking={booking} action={action(key)} reason="" saving={false} error={null} tell onTell={() => {}} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />)
      expect(html, key).toContain('Tell the client by email (sophie@example.test)')
    }
    const complete = renderToStaticMarkup(<ActionConfirm booking={booking} action={action('complete')} reason="" saving={false} error={null} tell onTell={() => {}} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />)
    expect(complete).not.toContain('Tell the client')
  })
})

describe('panel state', () => {
  it('carries what the client was told into the view, and forgets it on the next step', () => {
    const told = msg({ status: 'queued' })
    const created = panelReducer({ mode: 'create', draft: { date: '2026-10-06', time: '10:00', masterId: 1, serviceId: 1, client: null, source: 'admin', staffNotes: '' }, key: 'k', saving: true, error: null }, { type: 'created', id: 9, told })
    expect(created).toMatchObject({ mode: 'view', id: 9, told })
    const next = panelReducer(created, { type: 'startMove' })
    expect(next).toMatchObject({ told: null })
    expect(panelReducer(CLOSED, { type: 'openView', id: 3 })).toMatchObject({ told: null })
  })
})
```

- [ ] **Step 3: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh src/appointments/panel/tellClient.test.tsx`
  - Expected: FAIL — `Failed to load url ./TellClient` (and tsc errors).
  - The test imports `panelReducer`. If `panelState.ts` names its reducer differently (`reduce`, `panelReduce`), use
    that name in the test and the plan, and ledger it.

- [ ] **Step 4: Types and API.** In `lib/types.ts`, add:

```ts
export type MessageKind = 'booked' | 'moved' | 'confirmed' | 'cancelled' | 'reminder'
/** One client message about an appointment, as the server logged it. `at` is a real instant. */
export interface ClientMessageInfo {
  kind: MessageKind
  status: 'queued' | 'sent' | 'skipped' | 'failed'
  reason: 'not_requested' | 'no_recipient' | 'suppressed' | 'stale' | 'mail_error' | null
  recipient: string | null
  at: string | null
}
export interface MessageSettingsInfo { staff_default: boolean; reminder_hours: number; language: string }
```

  - `Bootstrap` gains `messages?: MessageSettingsInfo` (R3).
  - `AppointmentDetail` gains `client_email?: string | null` and `messages?: ClientMessageInfo[]` (R3).
  - `CreateBody` gains `notify_client?: boolean`.
  - In `lib/api.ts`:
    - `createBooking`'s result type becomes `{ booking: AppointmentDetail; replayed: boolean; client_message: ClientMessageInfo | null }`;
    - `move`'s body type gains `notify_client?: boolean` and its result gains `client_message: ClientMessageInfo | null`;
    - `act`'s body gains `notify_client?: boolean` and its result gains `client_message: ClientMessageInfo | null`;
    - import `ClientMessageInfo`.

- [ ] **Step 5: The pieces.**
  `panel/TellClient.tsx`:

```tsx
import { useTranslation } from 'react-i18next'

/** "Tell the client by email": ticked or not by the venue's setting, and staff may untick it. With no address, it says so instead. */
export function TellClient({ email, checked, onChange }: { email: string | null; checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation()
  if (!email) {
    return <p className="text-sm text-a-text-2">{t('appointments.messages.no_email', 'No email address — the client will not be told.')}</p>
  }
  return (
    <label className="flex items-center gap-2 text-sm text-a-text">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {t('appointments.messages.tell', 'Tell the client by email ({{email}})', { email })}
    </label>
  )
}
```

  `panel/messages.ts`:

```ts
import type { ClientMessageInfo } from '../lib/types'

export interface MessageLine { key: string; fallback: string; vars: Record<string, string>; tone: 'success' | 'info' | 'warning' | 'danger' }

const REASON: Record<string, [string, MessageLine['tone']]> = {
  not_requested: ['Not sent: staff chose not to tell the client.', 'info'],
  no_recipient:  ['Not sent: no email address.', 'warning'],
  suppressed:    ['Not sent: {{email}} does not accept our emails.', 'warning'],
  stale:         ['Not sent: the appointment changed before the email left.', 'info'],
  mail_error:    ['The email to {{email}} could not be sent.', 'danger'],
}

/** What happened to one client message, in words. Queued counts as sent: it leaves within seconds. */
export function messageLine(m: ClientMessageInfo): MessageLine {
  const vars = { email: m.recipient ?? '' }
  if (m.status === 'sent' || m.status === 'queued') {
    return { key: 'appointments.messages.sent', fallback: 'Emailed to {{email}}.', vars, tone: 'success' }
  }
  const reason = m.reason ?? 'mail_error'
  const [fallback, tone] = REASON[reason] ?? REASON.mail_error
  return { key: `appointments.messages.reason.${reason}`, fallback, vars, tone }
}
```

  `panel/Messages.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { ClientMessageInfo } from '../lib/types'
import { formatInstant } from '../lib/wallClock'
import { messageLine } from './messages'

const KIND: Record<string, string> = { booked: 'Booked', moved: 'Moved', confirmed: 'Confirmed', cancelled: 'Cancelled', reminder: 'Reminder' }

/** Every client message about this appointment, newest first: what it was, when, and sent or why not. */
export function Messages({ messages, zone, locale }: { messages: ClientMessageInfo[]; zone: string; locale: string }) {
  const { t } = useTranslation()
  if (messages.length === 0) return null

  return (
    <section>
      <h3 className="text-sm font-semibold text-a-text mb-1">{t('appointments.messages.title', 'Messages')}</h3>
      <ol className="space-y-1 text-sm">
        {messages.map((m, i) => {
          const line = messageLine(m)
          return (
            <li key={i} className="flex flex-wrap gap-x-2 text-a-text-2">
              <span className="font-medium text-a-text">{t(`appointments.messages.kind.${m.kind}`, KIND[m.kind] ?? m.kind)}</span>
              {m.at && <time dateTime={m.at}>{formatInstant(m.at, locale, zone)}</time>}
              <span>{t(line.key, line.fallback, line.vars)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
```

- [ ] **Step 6: The panel's state.** In `panel/panelState.ts`:
  - import `ClientMessageInfo`;
  - the view state gains `told: ClientMessageInfo | null`;
  - the events become `{ type: 'created'; id: number; told?: ClientMessageInfo | null }` and
    `{ type: 'done'; outcome: PointsResult | null; told?: ClientMessageInfo | null }`;
  - `viewOf` takes `(id: number, told: ClientMessageInfo | null = null)` and sets `told`;
  - `created` uses `viewOf(event.id, event.told ?? null)`;
  - `done` sets `told: event.told ?? null`;
  - every other transition that returns a view state sets `told: null`: `startMove`, `askConfirm`, `back`, `failed`,
    and the `openView` path through `viewOf`.

- [ ] **Step 7: The forms and the panel.**
  - `CreateForm.tsx`:
    - Props gain `tell: boolean` and `onTell: (tell: boolean) => void`.
    - Import `TellClient`.
    - Just above the Save button, render
      `{p.draft.client && <TellClient email={p.draft.client.email ?? null} checked={p.tell} onChange={p.onTell} />}`.
  - `MoveForm.tsx`:
    - Props gain `tell: boolean` and `onTell: (tell: boolean) => void`.
    - Import `TellClient`.
    - Above its buttons, render `<TellClient email={booking.client_email ?? null} checked={tell} onChange={onTell} />`.
  - `ActionConfirm.tsx`:
    - Props gain `tell: boolean` and `onTell: (tell: boolean) => void`.
    - Import `TellClient`.
    - After the reason field, render
      `{(action.key === 'confirm' || action.key === 'cancel') && <TellClient email={booking.client_email ?? null} checked={tell} onChange={onTell} />}`.
  - `AppointmentView.tsx`:
    - Props gain `told: ClientMessageInfo | null`.
    - Import `Messages`, `messageLine` and `ClientMessageInfo`.
    - Below the outcome notice, render
      `{told && (() => { const line = messageLine(told); return <Notice tone={line.tone}>{t(line.key, line.fallback, line.vars)}</Notice> })()}`.
    - Above `<History …/>`, render
      `<Messages messages={b.messages ?? []} zone={zone} locale={locale} />`.
    - If `Notice` has no `success` or `info` tone, map them to the tones it has, and ledger it.
  - `AppointmentPanel.tsx`:
    - Add `useState` to the React import and import `ClientMessageInfo`.
    - After `const step = …`, add:

```tsx
  // "Tell the client" starts from the venue's setting on every new step; staff may change it for this one.
  const staffDefault = boot.messages?.staff_default ?? false
  const tellKey = state.mode === 'create' ? 'create' : state.mode === 'view' ? `${state.id}:${state.sub}:${state.action ?? ''}` : 'closed'
  const [tellChoice, setTellChoice] = useState<{ key: string; value: boolean } | null>(null)
  const tell = tellChoice !== null && tellChoice.key === tellKey ? tellChoice.value : staffDefault
  const onTell = (value: boolean) => setTellChoice({ key: tellKey, value })
```

    - `save`: `const { booking, client_message } = await appointmentsApi.createBooking({ ...body, notify_client: tell }, state.key)`
      and dispatch `{ type: 'created', id: booking.id, told: client_message }`.
    - `settle(next, outcome, told: ClientMessageInfo | null = null)` dispatches `{ type: 'done', outcome, told }`.
    - `act`: send `notify_client: tell` when `action === 'confirm' || action === 'cancel'`, and call
      `settle(result.booking, result.points, result.client_message)`.
    - `move`: send `notify_client: tell`, and call `settle(result.booking, null, result.client_message)`.
    - Pass `tell={tell} onTell={onTell}` to `CreateForm`, `MoveForm` and `ActionConfirm`.
    - Pass `told={state.told}` to `AppointmentView`.

- [ ] **Step 8: Locale families.** In `appointments/i18n/appointmentsLocales.test.ts`, `FAMILIES`:
  - `'setup.step'` gains `'messages'`;
  - add `'messages.kind': ['booked', 'moved', 'confirmed', 'cancelled', 'reminder']`;
  - add `'messages.reason': ['not_requested', 'no_recipient', 'suppressed', 'stale', 'mail_error']`.

- [ ] **Step 9: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh` (the whole workspace folder and the
    locale sweep).
  - Expected: vitest PASS, including the 7 new tests and the locale families; tsc 0; eslint 0.
  - A test that renders the changed forms with props it does not pass (`tell`, `onTell`, `told`) fails tsc. Give it
    `tell={false} onTell={() => {}}` or `told={null}`, and ledger it.

- [ ] **Step 10: Commit** with the subject "Ask before telling the client, and list what was sent, in the workspace":

```bash
git add frontend/src/appointments/lib/types.ts frontend/src/appointments/lib/api.ts frontend/src/appointments/panel/TellClient.tsx frontend/src/appointments/panel/Messages.tsx frontend/src/appointments/panel/messages.ts frontend/src/appointments/panel/panelState.ts frontend/src/appointments/panel/AppointmentPanel.tsx frontend/src/appointments/panel/CreateForm.tsx frontend/src/appointments/panel/MoveForm.tsx frontend/src/appointments/panel/ActionConfirm.tsx frontend/src/appointments/panel/AppointmentView.tsx frontend/src/appointments/panel/tellClient.test.tsx frontend/src/appointments/i18n/appointmentsLocales.test.ts frontend/src/appointments/i18n/appointments.en.json frontend/src/appointments/i18n/appointments.ru.json frontend/src/appointments/i18n/appointments.de.json frontend/src/appointments/i18n/appointments.fr.json frontend/src/appointments/i18n/appointments.es.json
git commit -F <ws>/tools/commit-8.txt
```

  Also `git add` any existing test file Step 9 had to update.

---

### Task 9: The Setup block and the checklist step

**Files:**
- Modify: `frontend/src/appointments/setup/SettingsTab.tsx`, `setup/Checklist.tsx`, `lib/types.ts`
- Test: `frontend/src/appointments/setup/settingsTab.test.tsx` (add tests)

**Interfaces:**
- Consumes: the Setup settings fields (Task 1), the strings (Task 8)
- Produces: the "Client messages" block; `STEP_TARGET.messages = 'settings'`; `ChecklistKey` includes `'messages'`

- [ ] **Step 1: Write the failing tests.** Append to `frontend/src/appointments/setup/settingsTab.test.tsx`, adapting
  to its existing `render`/fixture names. If the fixture builds `SetupSettings` without the three fields, add them
  (`client_messages_staff_default: false, client_messages_reminder_hours: 0, client_messages_language: 'en'`).

```tsx
describe('client messages in Setup', () => {
  it('offers the three settings to a manager, as stored', () => {
    const html = renderSettings({ client_messages_staff_default: true, client_messages_reminder_hours: 24, client_messages_language: 'ru' })
    expect(html).toContain('Client messages')
    expect(html).toContain('Email clients about changes staff make')
    expect(html).toMatch(/<option value="24" selected="">24 hours before<\/option>/)
    expect(html).toMatch(/<option value="ru" selected="">Русский<\/option>/)
    expect(html).toContain('<option value="0">Off</option>')
  })

  it('sends only what changed', () => {
    const s = settingsFixture({})
    const draft = { ...settingsDraftOf(s), client_messages_reminder_hours: 2 }
    expect(changedSettings(draft, s)).toEqual({ client_messages_reminder_hours: 2 })
  })
})
```

  `renderSettings(overrides)` and `settingsFixture(overrides)` are the file's existing helpers under whatever names it
  uses. If it has none, add them: one builds a `SetupSettings` with the overrides; the other renders
  `<SettingsTab data={{ ...setupPayload, can_manage: true, settings }} refresh={() => {}} />` inside a `MemoryRouter`.

- [ ] **Step 2: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh src/appointments/setup/settingsTab.test.tsx`
  - Expected: FAIL. The block is missing, and tsc reports the unknown fields.

- [ ] **Step 3: Implement.**
  - In `lib/types.ts`:
    - `SetupSettings` gains `client_messages_staff_default: boolean; client_messages_reminder_hours: number; client_messages_language: string`;
    - `SettingsBody`'s `Pick` list gains the same three keys;
    - `ChecklistKey` gains `'messages'`.
  - In `setup/Checklist.tsx`, `STEP_TARGET` gains `messages: 'settings',`.
  - In `setup/SettingsTab.tsx`:
    - `SettingsDraft` gains `client_messages_staff_default: boolean; client_messages_reminder_hours: number; client_messages_language: string`;
    - `settingsDraftOf` copies the three from `s`;
    - `changedSettings` adds:

```ts
  if (draft.client_messages_staff_default !== s.client_messages_staff_default) body.client_messages_staff_default = draft.client_messages_staff_default
  if (draft.client_messages_reminder_hours !== s.client_messages_reminder_hours) body.client_messages_reminder_hours = draft.client_messages_reminder_hours
  if (draft.client_messages_language !== s.client_messages_language) body.client_messages_language = draft.client_messages_language
```

    - add the constants below `CURRENCIES`:

```ts
const REMINDER_HOURS = [0, 2, 24, 48]
// Each language in its own name: whoever reads the list reads their own.
const MESSAGE_LANGUAGES: [string, string][] = [['en', 'English'], ['ru', 'Русский'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español']]
```

    - inside the `<fieldset>`, after the loyalty section, add:

```tsx
          <section aria-labelledby="settings-messages" className="space-y-3">
            <h2 id="settings-messages" className="text-sm font-semibold text-a-text">{t('appointments.messages.setup.title', 'Client messages')}</h2>
            <label className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={draft.client_messages_staff_default} onChange={(e) => set({ client_messages_staff_default: e.target.checked })} />
              {t('appointments.messages.setup.staff', 'Email clients about changes staff make (staff can untick it each time)')}
            </label>
            <Field label={t('appointments.messages.setup.reminder', 'Reminder before each visit')}>
              <select className={input} value={draft.client_messages_reminder_hours} onChange={(e) => set({ client_messages_reminder_hours: Number(e.target.value) })}>
                {REMINDER_HOURS.map(h => (
                  <option key={h} value={h}>{h === 0 ? t('appointments.messages.setup.off', 'Off') : t('appointments.messages.setup.hours', '{{count}} hours before', { count: h })}</option>
                ))}
              </select>
            </Field>
            <Field label={t('appointments.messages.setup.language', "Language when the client's is not known")}>
              <select className={input} value={draft.client_messages_language} onChange={(e) => set({ client_messages_language: e.target.value })}>
                {MESSAGE_LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </Field>
          </section>
```

- [ ] **Step 4: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh`
  - Expected: vitest PASS (the 2 new tests among them); tsc 0; eslint 0.
  - `setupPage.test.tsx` builds a checklist without `messages`. That is fine: it is a fixture of steps, and the
    Checklist renders what it is given.

- [ ] **Step 5: Commit** with the subject "Let managers switch client messages on in Setup":

```bash
git add frontend/src/appointments/setup/SettingsTab.tsx frontend/src/appointments/setup/Checklist.tsx frontend/src/appointments/lib/types.ts frontend/src/appointments/setup/settingsTab.test.tsx
git commit -F <ws>/tools/commit-9.txt
```

---

### Task 10: The full admin asks too

**Files:**
- Create: `frontend/src/lib/clientMessages.ts`, `frontend/src/components/TellClient.tsx`, `frontend/src/components/TellClientConfirm.tsx`
- Modify: `frontend/src/pages/ServiceBookings.tsx`
- Modify: the five `frontend/src/i18n/locales/<lang>/common.json` (`tell_client`)
- Test: `frontend/src/components/tellClient.test.tsx`

**Interfaces:**
- Consumes: `notify_client` on the full admin's endpoints (Task 6); `<ws>/tools/add-partd-strings.cjs admin`
- Produces:
  - `staffDefaultFrom(settingsResponse: unknown): boolean`;
  - `useTellClientDefault(): boolean`;
  - `<TellClientCheckbox email many? checked onChange />`;
  - `<TellClientConfirm title email? many? onConfirm(tell) onClose busy? />`.

- [ ] **Step 1: The strings.** Run `node <ws>/tools/add-partd-strings.cjs admin`.
  Expected: five "tell_client added" lines.

- [ ] **Step 2: Write the failing test** `frontend/src/components/tellClient.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? '')) }),
}))

const { staffDefaultFrom } = await import('../lib/clientMessages')
const { TellClientCheckbox } = await import('./TellClient')
const { TellClientConfirm } = await import('./TellClientConfirm')

describe('staffDefaultFrom', () => {
  it('reads the venue setting from the grouped settings answer', () => {
    const answer = (value: unknown) => ({ settings: { general: [{ key: 'hotel_timezone', value: 'Europe/Riga' }], booking: [{ key: 'client_messages_staff_default', value }] } })
    expect(staffDefaultFrom(answer(true))).toBe(true)
    expect(staffDefaultFrom(answer('true'))).toBe(true)
    expect(staffDefaultFrom(answer(false))).toBe(false)
    expect(staffDefaultFrom({ settings: {} })).toBe(false)
    expect(staffDefaultFrom(undefined)).toBe(false)
  })
})

describe('TellClientCheckbox', () => {
  it('offers the box, or says there is no address', () => {
    expect(renderToStaticMarkup(<TellClientCheckbox email="a@example.test" checked onChange={() => {}} />)).toContain('Tell the client by email')
    expect(renderToStaticMarkup(<TellClientCheckbox email="" checked onChange={() => {}} />)).toContain('No email address — the client will not be told.')
    expect(renderToStaticMarkup(<TellClientCheckbox many checked onChange={() => {}} />)).toContain('Tell the clients by email')
  })
})

describe('TellClientConfirm', () => {
  it('asks the question with the box and both buttons', () => {
    const html = renderToStaticMarkup(<TellClientConfirm title="Cancel 3 bookings?" many defaultTell onConfirm={() => {}} onClose={() => {}} />)
    expect(html).toContain('Cancel 3 bookings?')
    expect(html).toContain('Tell the clients by email')
    expect(html).toContain('Yes')
    expect(html).toContain('Back')
  })
})

describe('the Service bookings page sends the box', () => {
  it('on create, the drawer save, the row confirm and the bulk cancel', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/ServiceBookings.tsx'), 'utf8')
    expect(src.match(/notify_client/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(src).toContain('<TellClientConfirm')
    expect(src).not.toContain('window.confirm(confirmMsg)')
  })

  it('is said in all five languages', () => {
    for (const lang of ['en', 'ru', 'de', 'fr', 'es']) {
      const bundle = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../i18n/locales/${lang}/common.json`), 'utf8'))
      expect(Object.keys(bundle.tell_client).sort(), lang).toEqual(['back', 'bulk_cancel_title', 'cancel_title', 'confirm_title', 'go', 'no_email', 'tell', 'tell_many'])
    }
  })
})
```

- [ ] **Step 3: Run it.**
  - Run: `cd frontend && npx vitest run src/components/tellClient.test.tsx`
  - Expected: FAIL — `Failed to load url ../lib/clientMessages`.

- [ ] **Step 4: Implement.**
  `frontend/src/lib/clientMessages.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

/** The venue's "email clients about staff changes" setting, from GET /v1/admin/settings (rows grouped by group). */
export function staffDefaultFrom(answer: unknown): boolean {
  const groups = (answer as { settings?: Record<string, { key: string; value: unknown }[]> } | undefined)?.settings
  if (!groups || typeof groups !== 'object') return false
  for (const rows of Object.values(groups)) {
    const row = Array.isArray(rows) ? rows.find(r => r?.key === 'client_messages_staff_default') : undefined
    if (row) return row.value === true || row.value === 'true' || row.value === 1 || row.value === '1'
  }
  return false
}

/** Whether "Tell the client" starts ticked in the full admin; false until the settings answer. */
export function useTellClientDefault(): boolean {
  const { data } = useQuery({
    queryKey: ['client-messages-default'],
    queryFn: () => api.get('/v1/admin/settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  return staffDefaultFrom(data)
}
```

  `frontend/src/components/TellClient.tsx`:

```tsx
import { useTranslation } from 'react-i18next'

/** The full admin's "Tell the client by email" box (Part D). With no address, it says so instead. */
export function TellClientCheckbox({ email, many, checked, onChange }: { email?: string | null; many?: boolean; checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation()
  if (!many && !email?.trim()) {
    return <p className="text-xs text-gray-400">{t('tell_client.no_email', 'No email address — the client will not be told.')}</p>
  }
  return (
    <label className="flex items-center gap-2 text-sm text-gray-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {many ? t('tell_client.tell_many', 'Tell the clients by email') : t('tell_client.tell', 'Tell the client by email')}
    </label>
  )
}
```

  `frontend/src/components/TellClientConfirm.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TellClientCheckbox } from './TellClient'

/** A small question before a confirm or a cancel in the full admin, with the "Tell the client" box (Part D, ruling R4). */
export function TellClientConfirm({ title, email, many, defaultTell, busy, onConfirm, onClose }: {
  title: string; email?: string | null; many?: boolean; defaultTell: boolean; busy?: boolean
  onConfirm: (tell: boolean) => void; onClose: () => void
}) {
  const { t } = useTranslation()
  const [tell, setTell] = useState(defaultTell)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-white/[0.08] bg-[#0a1210] p-5">
        <p className="text-base font-semibold text-white">{title}</p>
        <TellClientCheckbox email={email} many={many} checked={tell} onChange={setTell} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-white">{t('tell_client.back', 'Back')}</button>
          <button type="button" disabled={busy} onClick={() => onConfirm(tell)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('tell_client.go', 'Yes')}</button>
        </div>
      </div>
    </div>
  )
}
```

  `frontend/src/pages/ServiceBookings.tsx`:
  - Imports: `useTellClientDefault` from `../lib/clientMessages`, `TellClientCheckbox` from `../components/TellClient`,
    `TellClientConfirm` from `../components/TellClientConfirm`, and `useTranslation` if not already imported.
  - In the list component:

```tsx
  const tellDefault = useTellClientDefault()
  const [confirming, setConfirming] = useState<ServiceBooking | null>(null)
  const [bulkCancelling, setBulkCancelling] = useState(false)
```

  - `runBulk` becomes `async (action: string, value?: string, notifyClient?: boolean)`:
    - drop the `confirmMsg` parameter and its `window.confirm` line;
    - send `{ ids, action, value, notify_client: notifyClient }`.
  - The bulk Cancel button calls `setBulkCancelling(true)`. Render:

```tsx
      {bulkCancelling && (
        <TellClientConfirm title={t('tell_client.bulk_cancel_title', 'Cancel {{count}} bookings?', { count: selected.size })} many defaultTell={tellDefault} busy={bulkBusy}
          onClose={() => setBulkCancelling(false)}
          onConfirm={(tell) => { setBulkCancelling(false); void runBulk('cancel', undefined, tell) }} />
      )}
```

  - `updateStatusMut`'s `mutationFn` becomes
    `({ id, status, notify }: { id: number; status: string; notify?: boolean }) => api.patch(..., { status, notify_client: notify })`.
  - The row "Confirm" button calls `setConfirming(b)` instead of `updateStatusMut.mutate(...)`. Render:

```tsx
      {confirming && (
        <TellClientConfirm title={t('tell_client.confirm_title', 'Confirm this booking?')} email={confirming.customer_email} defaultTell={tellDefault}
          busy={updateStatusMut.isPending} onClose={() => setConfirming(null)}
          onConfirm={(tell) => { updateStatusMut.mutate({ id: confirming.id, status: 'confirmed', notify: tell }); setConfirming(null) }} />
      )}
```

  - `BookingDetailDrawer`:
    - add `const tellDefault = useTellClientDefault()`, `const [tellChoice, setTellChoice] = useState<boolean | null>(null)`
      and `const tell = tellChoice ?? tellDefault`;
    - add `const tells = status !== booking.status && (status === 'cancelled' || (status === 'confirmed' && booking.status === 'pending'))`;
    - `save` sends `notify_client: tells ? tell : undefined`;
    - above the Save button, render
      `{tells && <TellClientCheckbox email={booking.customer_email} checked={tell} onChange={setTellChoice} />}`.
  - `ManualBookingForm`:
    - add `const tellDefault = useTellClientDefault()`, `const [tellChoice, setTellChoice] = useState<boolean | null>(null)`
      and `const tell = tellChoice ?? tellDefault`;
    - the create call sends `notify_client: tell`;
    - below the email field, render `<TellClientCheckbox email={email} checked={tell} onChange={setTellChoice} />`.

- [ ] **Step 5: Run them.**
  - Run: `cd frontend && npx vitest run src/components/tellClient.test.tsx && npx tsc -b && npx eslint src/lib/clientMessages.ts src/components/TellClient.tsx src/components/TellClientConfirm.tsx src/components/tellClient.test.tsx src/pages/ServiceBookings.tsx`
  - Expected: vitest PASS (6 tests); tsc 0. eslint has no new findings. Compare with
    `git show HEAD:frontend/src/pages/ServiceBookings.tsx | npx eslint --stdin --stdin-filename src/pages/ServiceBookings.tsx`
    and ledger findings already there.

- [ ] **Step 6: Commit** with the subject "Ask before telling the client in the full admin's Service bookings":

```bash
git add frontend/src/lib/clientMessages.ts frontend/src/components/TellClient.tsx frontend/src/components/TellClientConfirm.tsx frontend/src/components/tellClient.test.tsx frontend/src/pages/ServiceBookings.tsx frontend/src/i18n/locales/en/common.json frontend/src/i18n/locales/ru/common.json frontend/src/i18n/locales/de/common.json frontend/src/i18n/locales/fr/common.json frontend/src/i18n/locales/es/common.json
git commit -F <ws>/tools/commit-10.txt
```

---

### Task 11: The runbook, the whole branch and the browser

**Files:**
- Modify: `docs/appointments-workspace.md`

- [ ] **Step 1: The runbook.** In `docs/appointments-workspace.md`:
  - Add a section "Client messages (Part D, 2026-10-05)" before "Deploying it", with this text:

```markdown
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
- the email could not be sent.

**The reminder:**

- It goes once per appointment time, in the 30 minutes after its moment (start minus the venue's hours).
- None goes to an appointment booked or moved after that moment, or to a cancelled one.
- A longer outage skips reminders rather than sending them late.

**Not covered:** the widget's and the portal's own emails stay as they were (English) and are not listed on the
appointment.
```

  - In "Deploying it", add:
    - (Part D) one additive migration (`client_messages`) and one scheduled job (`appointments:send-reminders`);
    - client messages are off everywhere until switched on.

- [ ] **Step 2: Commit** with the subject "Document client messages":

```bash
git add docs/appointments-workspace.md
git commit -F <ws>/tools/commit-11.txt
```

- [ ] **Step 3: The whole branch, backend.** Run `bash <ws>/tools/suite-by-dir.sh after` (in the background; about
  25 minutes).
  - Expected: every group ends `exit=0`, as in the baseline, plus the new `tests/Feature/Appointments` tests.
  - A new failure is fixed RED→GREEN, or ledgered as a ruling with its reason.

- [ ] **Step 4: The whole branch, frontend.** Run `cd frontend && npx vitest run` and `npx tsc -b`.
  - Expected: only the known failures (3 `plannerMeta`, the `bookingSheet` clock test); tsc 0.

- [ ] **Step 5: The browser** (local; never migrate). Start the two servers, with mail written to the log:

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && MAIL_MAILER=log LOG_LEVEL=debug QUEUE_CONNECTION=sync CORS_ALLOWED_ORIGINS=http://localhost:5180 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --host=127.0.0.1 --port=8010
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && VITE_API_URL=http://127.0.0.1:8010/api npx vite --port 5180
```

  **The local table.** Local PostgreSQL is shared and never migrated, so it has no `client_messages` table. The
  appointment detail reads that table, so without it every appointment the workspace opens answers 500 locally.
  Production is unaffected: Cloud runs the migration before the new code serves. The owner rules on this at plan
  review; the ledger's first ruling records the answer.
  - **Table allowed for the check:**
    - First run `php artisan tinker --execute="echo Illuminate\Support\Facades\Schema::hasTable('client_messages') ? 'there' : 'absent';"`.
    - If it prints `there`, someone else made it: use it, never drop it, and ledger it.
    - If it prints `absent`, create it without touching the `migrations` table:
      `php artisan tinker --execute="(require 'database/migrations/2026_10_05_100000_create_client_messages.php')->up();"`.
      Drop it after the check with
      `php artisan tinker --execute="Illuminate\Support\Facades\Schema::dropIfExists('client_messages');"`.
  - **Table not allowed:** check only Setup and the full admin in the browser. The workspace's panel (the box, the
    told notice, the Messages list) is then proven by the Vitest renders of Tasks 8–9 alone, and the ledger says so.

  In the browser, as the tester (organisation 16, sign-in in
  `.superpowers/sdd/2026-09-30-appointments-workspace/task-14-brief.md`, password not echoed):
  - Setup → Settings shows "Client messages". Switch staff emails on and the reminder to 24 hours, then save. The
    checklist's optional step shows done.
  - (Table allowed.) In New appointment, a client with an email shows the box ticked; a client without one shows the
    no-email line. Save. The panel says "Emailed to …", and `storage/logs/laravel.log` holds the mail with the subject
    "Booked: …".
  - (Table allowed.) Move with the box unticked. Messages shows "Not sent: staff chose not to tell the client." above
    "Booked". Cancel with the box ticked: the log holds "Cancelled: …".
  - The full admin's Service bookings: the row Confirm opens the small dialog with the box; bulk cancel asks with
    "Tell the clients by email"; the drawer shows the box when the status changes to cancelled. (Without the table,
    the action still saves: the sender logs "client message could not be recorded" and the staff action is not
    refused. Check that too.)
  - At 390 px, the panel's box and the Messages list wrap without sideways scroll.

  Afterwards:
  - Switch the settings back off.
  - Drop the table if this check created it.
  - Stop both servers.
  - Ledger what was seen. Screenshots go to `.superpowers/shots/appointments/partD-*.png` in the main checkout.

- [ ] **Step 6: Done.** All eleven tasks are complete in the ledger. Hand over to the final whole-branch review.
