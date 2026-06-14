<?php

namespace Tests\Feature\Settings;

use App\Models\AuditLog;
use App\Models\User;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the AuditLog model contract — append-only forensic
 * record used by every booking / refund / loyalty / settings
 * mutation in the system.
 *
 * Why this matters:
 *
 *   The 2026-06-01 catch-chain preservation pattern (see
 *   CLAUDE.md "Catch-chain preservation") stores the verbatim
 *   PHP / Smoobu / Stripe error in `new_values.original_message`
 *   + structured `original_cause_chain` array. THE root cause
 *   that surfaced the `$roomTotal` outage. A regression in the
 *   array cast means future Smoobu rejections appear as
 *   debug-impossible "could not be confirmed: this room is no
 *   longer available" wrapper strings.
 *
 *   `record()` is the canonical write path called from every
 *   audit-emitting controller + service. The IP + user_agent
 *   pulled from request() rely on the HTTP context — in console
 *   commands `request()` returns null and the helper falls back
 *   silently. Lock so a refactor that requires request() doesn't
 *   break every cron's audit row.
 *
 *   4 query scopes power the AuditLog page filters
 *   (`/audit-log` SPA). Each scope branches on a specific column;
 *   a regression breaks the filter chips.
 *
 * Contract:
 *
 *   - old_values + new_values array casts (jsonb in prod) — the
 *     load-bearing cast for the catch-chain preservation +
 *     every diff-recording mutation.
 *   - subject + causer MorphTo relationships (polymorphic across
 *     the system — booking_mirror, loyalty_member, user,
 *     organization).
 *   - record() helper writes: action / subject_type+id / new+old
 *     values / causer_type+id / ip / user_agent / description.
 *   - 4 scopes: forAction(action) / forSubjectType(class) /
 *     forCauser(userId) / betweenDates(from, to).
 *   - betweenDates appends '23:59:59' to the `to` parameter so
 *     end-of-day queries are inclusive (locks the documented
 *     edge case).
 *   - forCauser scope filters causer_type to User::class
 *     (locked so a refactor doesn't return rows where the same
 *     ID belongs to a different morph subject).
 *   - BelongsToOrganization + TenantScope cross-org isolation.
 */
class AuditLogModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('subject_type')->nullable();
                $t->unsignedBigInteger('subject_id')->nullable();
                $t->string('action');
                $t->text('old_values')->nullable();
                $t->text('new_values')->nullable();
                $t->string('causer_type')->nullable();
                $t->unsignedBigInteger('causer_id')->nullable();
                $t->string('ip_address', 64)->nullable();
                $t->text('user_agent')->nullable();
                $t->text('description')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'action']);
                $t->index(['organization_id', 'subject_type', 'subject_id']);
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function audit(array $attrs = []): AuditLog
    {
        return AuditLog::create(array_merge([
            'organization_id' => $this->orgId,
            'action'          => 'test.action',
        ], $attrs));
    }

    /* ─── old_values + new_values array casts ─── */

    public function test_new_values_round_trips_through_array_cast(): void
    {
        // CRITICAL: the 2026-06-01 catch-chain preservation
        // pattern stores verbatim Smoobu / Stripe / PHP error
        // messages here. THE column that surfaced the $roomTotal
        // outage. A regression turns every audit row into a JSON
        // string — diag commands can no longer parse the cause
        // chain.
        $payload = [
            'original_message'    => 'Undefined variable $roomTotal',
            'original_cause_chain' => [
                ['class' => 'Error', 'message' => 'Undefined variable $roomTotal',
                 'file' => 'BookingEngineService.php', 'line' => 850],
                ['class' => 'RuntimeException', 'message' => 'Booking could not be confirmed',
                 'file' => 'BookingEngineService.php', 'line' => 1200],
            ],
            'wrapper_message' => 'Booking could not be confirmed',
            'unit_id'         => 99,
            'price'           => '299.50',
        ];

        $log = $this->audit(['action' => 'booking.confirm.failed', 'new_values' => $payload]);

        $this->assertSame($payload, $log->fresh()->new_values);
    }

    public function test_old_values_round_trips_through_array_cast(): void
    {
        // old_values stores the before-state on UPDATE actions.
        // The /audit-log page renders a diff view from
        // old → new.
        $before = [
            'payment_status' => 'paid',
            'status'         => 'confirmed',
            'guest_email'    => 'alice@example.com',
        ];

        $log = $this->audit([
            'action'     => 'booking.update',
            'old_values' => $before,
        ]);

        $this->assertSame($before, $log->fresh()->old_values);
    }

    public function test_empty_array_values_persist_as_empty_array(): void
    {
        // Lock: an empty diff persists as [] not null. The SPA's
        // diff renderer branches on empty vs null.
        $log = $this->audit([
            'new_values' => [],
            'old_values' => [],
        ]);

        $fresh = $log->fresh();
        $this->assertSame([], $fresh->new_values);
        $this->assertSame([], $fresh->old_values);
    }

    /* ─── record() helper ─── */

    public function test_record_writes_action_only(): void
    {
        // Smallest valid case — just an action.
        AuditLog::record('test.bare_action');

        $rows = AuditLog::where('action', 'test.bare_action')->get();
        $this->assertCount(1, $rows);
        $this->assertSame('test.bare_action', $rows->first()->action);
    }

    public function test_record_stores_subject_type_and_id_when_subject_given(): void
    {
        // CRITICAL: subject_type stores the FQCN, subject_id
        // the row id. Drives the morphTo relationship + the
        // audit-log page's "View source" link.
        $subject = new \stdClass();
        $subject->id = 123;
        // record() uses get_class() — we need a real Eloquent
        // model. Use User.
        $user = $this->makeUser();

        AuditLog::record('test.with_subject', $user);

        $row = AuditLog::where('action', 'test.with_subject')->first();
        $this->assertSame(User::class, $row->subject_type);
        $this->assertSame($user->id, (int) $row->subject_id);
    }

    public function test_record_stores_causer_type_and_id_when_causer_given(): void
    {
        $causer = $this->makeUser();

        AuditLog::record('test.with_causer', null, [], [], $causer);

        $row = AuditLog::where('action', 'test.with_causer')->first();
        $this->assertSame(User::class, $row->causer_type);
        $this->assertSame($causer->id, (int) $row->causer_id);
    }

    public function test_record_stores_new_and_old_values_arrays(): void
    {
        // record(action, subject, newValues, oldValues, …)
        // signature. Lock the documented order.
        $new = ['status' => 'confirmed', 'paid_at' => '2026-06-15'];
        $old = ['status' => 'pending', 'paid_at' => null];

        AuditLog::record('test.with_values', null, $new, $old);

        $row = AuditLog::where('action', 'test.with_values')->first();
        $this->assertSame($new, $row->new_values);
        $this->assertSame($old, $row->old_values);
    }

    public function test_record_stores_description_when_given(): void
    {
        AuditLog::record('test.with_desc', null, [], [], null, 'Manual refund issued by admin.');

        $row = AuditLog::where('action', 'test.with_desc')->first();
        $this->assertSame('Manual refund issued by admin.', $row->description);
    }

    /* ─── Query scopes ─── */

    public function test_for_action_scope_filters_by_exact_action(): void
    {
        $this->audit(['action' => 'booking.confirm.failed']);
        $this->audit(['action' => 'booking.confirm.failed']);
        $this->audit(['action' => 'booking.refund']);
        $this->audit(['action' => 'loyalty.award']);

        $failures = AuditLog::forAction('booking.confirm.failed')->get();
        $this->assertCount(2, $failures);
    }

    public function test_for_subject_type_scope_filters_by_class(): void
    {
        $this->audit(['subject_type' => 'App\\Models\\BookingMirror', 'subject_id' => 1]);
        $this->audit(['subject_type' => 'App\\Models\\BookingMirror', 'subject_id' => 2]);
        $this->audit(['subject_type' => 'App\\Models\\LoyaltyMember', 'subject_id' => 3]);

        $bookings = AuditLog::forSubjectType('App\\Models\\BookingMirror')->get();
        $this->assertCount(2, $bookings);
    }

    public function test_for_causer_scope_filters_by_user_id_and_class(): void
    {
        // CRITICAL: scope ALSO filters causer_type = User::class
        // so a row where causer_id=42 belongs to a different
        // morph subject (System / Console) DOES NOT surface.
        $this->audit(['causer_type' => User::class, 'causer_id' => 42]);
        $this->audit(['causer_type' => User::class, 'causer_id' => 42]);
        $this->audit(['causer_type' => 'App\\Console\\Commands\\SyncSmoobuBookings',
                      'causer_id' => 42]); // same id, different type — must NOT match
        $this->audit(['causer_type' => User::class, 'causer_id' => 99]);

        $rows = AuditLog::forCauser(42)->get();
        $this->assertCount(2, $rows,
            'forCauser MUST filter to causer_type = User::class — a console-causer with the same id MUST NOT leak.');
    }

    public function test_between_dates_scope_appends_end_of_day_to_to_param(): void
    {
        // CRITICAL: betweenDates(from, '2026-06-15') stamps
        // '2026-06-15 23:59:59' as the upper bound so end-of-day
        // events are included. A regression that uses
        // '2026-06-15 00:00:00' silently drops every
        // same-day event past midnight UTC.
        \DB::table('audit_logs')->insert([
            ['organization_id' => $this->orgId, 'action' => 'morning',
             'created_at' => '2026-06-15 08:00:00', 'updated_at' => '2026-06-15 08:00:00'],
            ['organization_id' => $this->orgId, 'action' => 'midday',
             'created_at' => '2026-06-15 12:00:00', 'updated_at' => '2026-06-15 12:00:00'],
            ['organization_id' => $this->orgId, 'action' => 'evening',
             'created_at' => '2026-06-15 22:30:00', 'updated_at' => '2026-06-15 22:30:00'],
            ['organization_id' => $this->orgId, 'action' => 'next-day',
             'created_at' => '2026-06-16 02:00:00', 'updated_at' => '2026-06-16 02:00:00'],
        ]);

        $rows = AuditLog::betweenDates('2026-06-15', '2026-06-15')
            ->whereIn('action', ['morning', 'midday', 'evening', 'next-day'])
            ->get();

        $actions = $rows->pluck('action')->sort()->values()->toArray();
        $this->assertSame(['evening', 'midday', 'morning'], $actions,
            'betweenDates MUST include events up to 23:59:59 of the to date.');
    }

    public function test_between_dates_scope_handles_null_from_or_to(): void
    {
        // Null from + null to = no date filter applied.
        \DB::table('audit_logs')->insert([
            ['organization_id' => $this->orgId, 'action' => 'old-row',
             'created_at' => '2020-01-01 00:00:00', 'updated_at' => '2020-01-01 00:00:00'],
        ]);

        $rows = AuditLog::betweenDates(null, null)
            ->where('action', 'old-row')
            ->get();

        $this->assertCount(1, $rows,
            'Null from + null to MUST be a no-op (return all rows).');
    }

    /* ─── morphTo relationships ─── */

    public function test_subject_relationship_is_morph_to(): void
    {
        $log = $this->audit(['subject_type' => 'App\\Models\\BookingMirror', 'subject_id' => 1]);
        $rel = $log->subject();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\MorphTo::class,
            $rel,
        );
    }

    public function test_causer_relationship_is_morph_to(): void
    {
        // Causer is polymorphic so console commands can be the
        // causer (causer_type = 'App\\Console\\…') alongside
        // human users.
        $log = $this->audit(['causer_type' => User::class, 'causer_id' => 5]);
        $rel = $log->causer();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\MorphTo::class,
            $rel,
        );
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $log = AuditLog::record('test.org_fill');

        $row = AuditLog::where('action', 'test.org_fill')->first();
        $this->assertSame($this->orgId, (int) $row->organization_id,
            'record() MUST auto-fill organization_id from bound context.');
    }

    public function test_tenant_scope_isolates_audit_logs_cross_org(): void
    {
        // CRITICAL: audit content can carry PII + the catch-
        // chain preservation can include guest names + email
        // addresses. Cross-leak would expose competitor's
        // operational incidents.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->audit(['action' => 'org-a-action']);
        \DB::table('audit_logs')->insert([
            'organization_id' => $orgB,
            'action'          => 'org-b-action',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = AuditLog::all();
        foreach ($aRows as $r) {
            $this->assertSame($this->orgId, (int) $r->organization_id);
        }
    }

    /* ─── Helpers ─── */

    private function makeUser(): User
    {
        if (!Schema::hasColumn('users', 'organization_id')) {
            Schema::table('users', function ($t) {
                $t->unsignedBigInteger('organization_id')->nullable();
            });
        }
        return User::create([
            'organization_id' => $this->orgId,
            'name'            => 'Test User',
            'email'           => 'audit-' . uniqid() . '@example.com',
            'password'        => 'hashed',
        ]);
    }
}
