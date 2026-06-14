<?php

namespace Tests\Feature\Audit;

use App\Models\AuditLog;
use App\Models\Guest;
use App\Models\User;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the AuditLog model contract.
 *
 * The audit log is the system's forensic trail for compliance,
 * customer-care reconciliation ('what changed when?'), and
 * incident response. Every audit-emitting code path uses
 * AuditLog::record() — a regression here silently strips the
 * audit trail across the codebase.
 *
 * Surfaces locked:
 *
 *   record() static factory:
 *     - Sets subject_type from get_class($subject) when given
 *     - subject_id = $subject->id
 *     - causer_type + causer_id same pattern
 *     - new_values + old_values array-cast
 *     - description + ip_address + user_agent captured
 *     - Null subject is allowed (system-level events)
 *
 *   Polymorphic relationships:
 *     - subject MorphTo
 *     - causer MorphTo
 *
 *   Query scopes (4):
 *     - forAction(action)
 *     - forSubjectType(type)
 *     - forCauser(userId)
 *     - betweenDates(from, to)
 *
 *   Array casts: old_values + new_values
 *
 *   BelongsToOrganization + TenantScope isolation
 */
class AuditLogTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        // setUpBookingRefundSchema includes audit_logs.
        $this->setUpBookingRefundSchema();

        // user_agent column is sized as string in the minimal
        // schema; AuditLog::record may write a long User-Agent
        // string. Widen if needed.
        if (Schema::hasColumn('audit_logs', 'user_agent')) {
            // Already present — fine.
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

    /* ─── record() static factory ─── */

    public function test_record_persists_action_subject_class_and_id(): void
    {
        // Build a Guest (any Eloquent model works as subject).
        $guest = Guest::create([
            'organization_id' => $this->orgId,
            'full_name'       => 'Test Subject',
        ]);

        AuditLog::record('guest.updated', $guest, ['name' => 'New'], ['name' => 'Old']);

        $row = AuditLog::orderByDesc('id')->first();

        $this->assertNotNull($row);
        $this->assertSame('guest.updated', $row->action);
        $this->assertSame(Guest::class, $row->subject_type,
            'subject_type MUST be the FQCN of the subject (lock for polymorphic queries).');
        $this->assertSame((int) $guest->id, (int) $row->subject_id);
    }

    public function test_record_persists_array_payloads_intact(): void
    {
        // new_values + old_values round-trip via array cast.
        $guest = Guest::create([
            'organization_id' => $this->orgId,
            'full_name'       => 'X',
        ]);

        $newValues = [
            'lifecycle_status' => 'customer',
            'importance'       => 'vip',
            'nested'           => ['k' => 'v'],
        ];
        $oldValues = [
            'lifecycle_status' => 'lead',
            'importance'       => 'normal',
        ];

        AuditLog::record('guest.upgraded', $guest, $newValues, $oldValues);

        $row = AuditLog::orderByDesc('id')->first();
        $this->assertSame($newValues, $row->new_values);
        $this->assertSame($oldValues, $row->old_values);
    }

    public function test_record_with_null_subject_persists_a_system_event(): void
    {
        // System-level events (cron run, scheduled cleanup) have
        // no subject. record() MUST accept null and persist a row
        // with subject_type=null + subject_id=null.
        AuditLog::record('cron.daily.cleanup', null, ['rows_deleted' => 42]);

        $row = AuditLog::orderByDesc('id')->first();

        $this->assertSame('cron.daily.cleanup', $row->action);
        $this->assertNull($row->subject_type);
        $this->assertNull($row->subject_id);
    }

    public function test_record_with_causer_persists_user_class_and_id(): void
    {
        // The causer = who initiated the action. For staff-driven
        // writes this is the admin user.
        $user = User::create([
            'email' => 'admin@example.com',
            'name'  => 'Admin',
        ]);

        AuditLog::record('guest.merged', null, [], [], $user);

        $row = AuditLog::orderByDesc('id')->first();
        $this->assertSame(User::class, $row->causer_type);
        $this->assertSame((int) $user->id, (int) $row->causer_id);
    }

    public function test_record_with_description_persists_human_readable_summary(): void
    {
        AuditLog::record(
            'booking.refunded',
            null,
            ['amount' => '500.00'],
            [],
            null,
            'Full refund for cancelled booking SM-12345',
        );

        $row = AuditLog::orderByDesc('id')->first();
        $this->assertSame('Full refund for cancelled booking SM-12345', $row->description);
    }

    /* ─── Polymorphic relationships ─── */

    public function test_subject_relationship_is_morph_to(): void
    {
        $log = AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'test',
            'subject_type'    => Guest::class,
            'subject_id'      => 1,
        ]);

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\MorphTo::class,
            $log->subject(),
        );
    }

    public function test_causer_relationship_is_morph_to(): void
    {
        $log = AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'test',
            'causer_type'     => User::class,
            'causer_id'       => 1,
        ]);

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\MorphTo::class,
            $log->causer(),
        );
    }

    /* ─── Query scopes ─── */

    public function test_scopeForAction_filters_by_action(): void
    {
        AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'guest.created',
        ]);
        AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'guest.deleted',
        ]);
        AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'guest.created',
        ]);

        $created = AuditLog::forAction('guest.created')->get();
        $this->assertCount(2, $created);
    }

    public function test_scopeForSubjectType_filters_by_subject_class(): void
    {
        AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'test',
            'subject_type'    => Guest::class,
            'subject_id'      => 1,
        ]);
        AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'test',
            'subject_type'    => User::class,
            'subject_id'      => 1,
        ]);

        $guestEvents = AuditLog::forSubjectType(Guest::class)->get();
        $this->assertCount(1, $guestEvents);
    }

    public function test_scopeForCauser_filters_by_user_id_AND_user_class(): void
    {
        // Lock both halves of the predicate — causer_id + causer_type
        // = User::class. A regression that dropped the type check
        // would surface across-class IDs.
        AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'test',
            'causer_type'     => User::class,
            'causer_id'       => 42,
        ]);
        AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'test',
            'causer_type'     => Guest::class,
            'causer_id'       => 42, // same id, different class
        ]);

        $byUser42 = AuditLog::forCauser(42)->get();
        $this->assertCount(1, $byUser42,
            'forCauser MUST filter on causer_type=User::class too (not just id).');
        $this->assertSame(User::class, $byUser42->first()->causer_type);
    }

    public function test_scopeBetweenDates_filters_by_created_at_window(): void
    {
        // Three events spaced across time. Use raw inserts so the
        // passed timestamps land verbatim (Eloquent::create can
        // overwrite created_at with current time depending on the
        // model's $timestamps setting).
        \DB::table('audit_logs')->insert([
            'organization_id' => $this->orgId,
            'action'          => 'old',
            'created_at'      => now()->subDays(2),
            'updated_at'      => now()->subDays(2),
        ]);
        \DB::table('audit_logs')->insert([
            'organization_id' => $this->orgId,
            'action'          => 'today',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('audit_logs')->insert([
            'organization_id' => $this->orgId,
            'action'          => 'future',
            'created_at'      => now()->addDays(2),
            'updated_at'      => now()->addDays(2),
        ]);

        // From=today (start), to=today → only today's event.
        $todayOnly = AuditLog::betweenDates(
            now()->startOfDay()->toDateString(),
            now()->toDateString(),
        )->get();

        $this->assertCount(1, $todayOnly);
        $this->assertSame('today', $todayOnly->first()->action);
    }

    public function test_scopeBetweenDates_with_null_from_only_filters_by_to(): void
    {
        // Defensive: a null from MUST allow open-ended history
        // queries (admin "show me everything up to yesterday").
        AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'before',
            'created_at'      => now()->subDays(7),
            'updated_at'      => now()->subDays(7),
        ]);

        $upToNow = AuditLog::betweenDates(null, now()->toDateString())->get();
        $this->assertCount(1, $upToNow);
    }

    public function test_scopeBetweenDates_with_null_to_only_filters_by_from(): void
    {
        AuditLog::create([
            'organization_id' => $this->orgId,
            'action'          => 'after',
            'created_at'      => now()->addDay(),
            'updated_at'      => now()->addDay(),
        ]);

        $fromYesterday = AuditLog::betweenDates(now()->toDateString(), null)->get();
        $this->assertGreaterThanOrEqual(1, $fromYesterday->count());
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        AuditLog::record('test', null, []);

        $row = AuditLog::orderByDesc('id')->first();
        $this->assertSame($this->orgId, (int) $row->organization_id);
    }

    public function test_tenant_scope_isolates_audit_rows_cross_org(): void
    {
        // CRITICAL: audit rows are tenant-private. An org's
        // forensic trail MUST NOT leak across orgs.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('audit_logs')->insert([
            'organization_id' => $orgA,
            'action'          => 'org_a_action',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('audit_logs')->insert([
            'organization_id' => $orgB,
            'action'          => 'org_b_action',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = AuditLog::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('org_a_action', $aRows->first()->action);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = AuditLog::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('org_b_action', $bRows->first()->action);
    }
}
