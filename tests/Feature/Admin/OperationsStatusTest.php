<?php

namespace Tests\Feature\Admin;

use App\Models\EmailCampaign;
use App\Models\ScheduledCommandRun;
use App\Services\OperationsStatus;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class OperationsStatusTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        foreach ([
            'loyalty_visit_effects' => '2026_10_29_170000_create_loyalty_visit_effects.php',
            'scheduled_command_runs' => '2026_05_19_130000_create_scheduled_command_runs_table.php',
            'failed_jobs' => '2019_08_19_000000_create_failed_jobs_table.php',
            'jobs' => '2026_08_11_100000_create_jobs_tables.php',
        ] as $table => $migration) {
            if (!Schema::hasTable($table)) (require database_path('migrations/' . $migration))->up();
        }
        config(['admin_access.mode' => 'enforce', 'queue.default' => 'database', 'queue.connections.database.connection' => config('database.default'), 'queue.failed.driver' => 'database-uuids', 'queue.failed.database' => config('database.default')]);
        Mail::fake();
    }

    private function url(): string { return rtrim(config('app.url'), '/') . '/api/v1/admin/operations-status'; }

    private function check(string $key): array
    {
        return collect(app(OperationsStatus::class)->forUser($this->manager)['checks'])->keyBy('key')->get($key);
    }

    private function operator(): void
    {
        config(['services.saas.platform_admin_emails' => $this->manager->email]);
        $this->manager->forceFill(['email_verified_at' => now()])->save();
    }

    private function campaign(int $org, array $attributes = []): void
    {
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $org);
        try {
            EmailCampaign::create($attributes + ['organization_id' => $org, 'name' => 'Private campaign', 'subject' => 'Private subject', 'body_html' => '<p>Private content</p>', 'status' => 'failed']);
        } finally {
            app()->instance('current_organization_id', $prior);
        }
    }

    public function test_managers_see_only_their_organization_and_no_private_payloads_or_global_checks(): void
    {
        $other = $this->otherOrganization();
        $this->campaign($other['org']->id);
        $this->campaign($other['org']->id);
        $this->campaign($this->org->id, ['error_message' => 'secret-provider-response']);
        $answer = $this->asManager()->getJson($this->url() . '?organization_id=' . $other['org']->id)->assertOk();
        $checks = collect($answer->json('checks'))->keyBy('key');
        $this->assertSame(1, $checks['email_failures']['count']);
        $this->assertSame(['email_failures', 'email_delays', 'loyalty_delays'], $checks->keys()->all());
        $this->assertStringNotContainsString('secret-provider-response', $answer->getContent());
        $this->assertStringNotContainsString('Private', $answer->getContent());
        $this->assertStringContainsString('no-store', $answer->headers->get('Cache-Control'));
        Mail::assertNothingOutgoing();
    }

    public function test_staff_and_members_cannot_read_status_even_in_legacy_report_mode(): void
    {
        config(['admin_access.mode' => 'report']);
        $this->asStaffMember()->getJson($this->url())->assertForbidden();
        $this->actingAs($this->ada->user, 'sanctum')->getJson($this->url())->assertForbidden();
    }

    public function test_delays_ignore_completed_work_recent_progress_and_other_tenants(): void
    {
        $this->campaign($this->org->id, ['status' => 'sending', 'last_progress_at' => now()->subMinutes(16)]);
        $this->campaign($this->org->id, ['status' => 'sending', 'last_progress_at' => now()->subMinute()]);
        $this->campaign($this->org->id, ['status' => 'sent', 'last_progress_at' => now()->subHour()]);
        $this->assertSame(1, $this->check('email_delays')['count']);
        DB::table('loyalty_visit_effects')->insert(['organization_id' => $this->org->id, 'reference_type' => 'visit', 'reference_id' => 1, 'payload' => '{}', 'pending' => true, 'created_at' => now()->subMinutes(16), 'updated_at' => now()]);
        $this->assertSame('attention', $this->check('loyalty_delays')['status']);
        DB::table('loyalty_visit_effects')->where('organization_id', $this->org->id)->update(['pending' => false]);
        $this->assertSame('ok', $this->check('loyalty_delays')['status']);
    }

    public function test_platform_data_requires_verified_operator_identity_and_a_real_heartbeat(): void
    {
        config(['services.saas.platform_admin_emails' => $this->manager->email]);
        $this->manager->forceFill(['email_verified_at' => null])->save();
        $this->assertCount(3, app(OperationsStatus::class)->forUser($this->manager)['checks']);
        $this->operator();
        $this->assertSame('unobserved', $this->check('scheduler')['status']);
        ScheduledCommandRun::create(['command' => 'heartbeat', 'status' => 'success', 'started_at' => now()->subMinutes(6), 'finished_at' => now()->subMinutes(6)]);
        $this->assertSame('attention', $this->check('scheduler')['status']);
        ScheduledCommandRun::create(['command' => 'heartbeat', 'status' => 'success', 'started_at' => now(), 'finished_at' => now()]);
        $this->assertSame('ok', $this->check('scheduler')['status']);
    }

    public function test_skipped_tasks_do_not_hide_failures_but_successful_recovery_does(): void
    {
        $this->operator();
        foreach (['failed', 'skipped'] as $status) ScheduledCommandRun::create(['command' => 'test:task', 'status' => $status, 'started_at' => now(), 'finished_at' => now(), 'output_excerpt' => 'private-exception']);
        $this->assertSame(1, $this->check('scheduled_failures')['count']);
        ScheduledCommandRun::create(['command' => 'test:task', 'status' => 'success', 'started_at' => now(), 'finished_at' => now()]);
        $this->assertSame(0, $this->check('scheduled_failures')['count']);
    }

    public function test_queue_checks_do_not_claim_liveness_and_exclude_future_and_running_jobs(): void
    {
        $this->operator();
        $this->assertSame('unobserved', $this->check('queue_delays')['status']);
        foreach ([[now()->subMinutes(6)->timestamp, null], [now()->addHour()->timestamp, null], [now()->subHour()->timestamp, now()->timestamp]] as [$available, $reserved]) {
            DB::table('jobs')->insert(['queue' => 'default', 'payload' => 'secret-job-body', 'attempts' => 0, 'available_at' => $available, 'reserved_at' => $reserved, 'created_at' => now()->subHour()->timestamp]);
        }
        $this->assertSame(1, $this->check('queue_delays')['count']);
        config(['queue.connections.database.table' => 'missing_jobs_table']);
        $this->assertSame(['key' => 'queue_delays', 'status' => 'unavailable'], $this->check('queue_delays'));
        config(['queue.default' => 'sync']);
        $this->assertSame('unobserved', $this->check('queue_delays')['status']);
    }
}
