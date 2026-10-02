<?php

namespace Tests\Feature\AdminAccess;

use App\Support\AdminAccess\AccessRecorder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AccessRecorderTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function record(string $method = 'PUT', bool $enforced = false, ?int $orgId = -1): void
    {
        app(AccessRecorder::class)->record($orgId === -1 ? $this->org->id : $orgId, $this->staff->id, 'staff', 'admin/settings', $method, 'not_allowed', $enforced);
    }

    public function test_one_row_per_day_person_rule_method_reason_and_mode_counted_up(): void
    {
        $this->record('put');
        $this->record('PUT');
        $this->record('POST');
        $this->record('PUT', enforced: true);
        $this->travel(1)->days();
        $this->record('PUT');

        $rows = DB::table('admin_access_refusals')->orderBy('id')->get();
        $this->assertCount(4, $rows);
        $this->assertSame(['2026-10-05', 'PUT', 2, 0], [(string) $rows[0]->day, $rows[0]->method, (int) $rows[0]->hits, (int) $rows[0]->enforced]);
        $this->assertSame(['POST', 1], [$rows[1]->method, (int) $rows[1]->hits]);
        $this->assertSame(['PUT', 1, 1], [$rows[2]->method, (int) $rows[2]->hits, (int) $rows[2]->enforced]);
        $this->assertSame(['2026-10-06', 1], [(string) $rows[3]->day, (int) $rows[3]->hits]);
        $this->assertSame(['staff', 'admin/settings', 'not_allowed', $this->org->id, $this->staff->id], [$rows[0]->role, $rows[0]->rule, $rows[0]->reason, (int) $rows[0]->organization_id, (int) $rows[0]->user_id]);
    }

    public function test_a_caller_with_no_organisation_is_counted_too(): void
    {
        $this->record(orgId: null);
        $this->record(orgId: null);

        $this->assertSame(2, (int) DB::table('admin_access_refusals')->whereNull('organization_id')->value('hits'));
    }

    public function test_the_migration_builds_the_table_the_recorder_writes(): void
    {
        Schema::drop('admin_access_refusals');
        (require base_path('database/migrations/2026_10_02_100000_create_admin_access_refusals.php'))->up();

        $this->record();

        $this->assertSame(
            ['id', 'day', 'organization_id', 'user_id', 'role', 'rule', 'method', 'reason', 'enforced', 'hits', 'first_seen_at', 'last_seen_at'],
            Schema::getColumnListing('admin_access_refusals'),
        );
        $this->assertSame(1, DB::table('admin_access_refusals')->count());
    }

    public function test_a_failure_to_record_is_a_warning_and_nothing_else(): void
    {
        Schema::drop('admin_access_refusals');
        Log::spy();

        $this->record();

        Log::shouldHaveReceived('warning')->once()->withArgs(fn (string $message) => str_contains($message, 'could not record a refusal'));
    }
}
