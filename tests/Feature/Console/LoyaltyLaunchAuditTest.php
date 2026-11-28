<?php

namespace Tests\Feature\Console;

use App\Jobs\RecordLaunchQueueProbe;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class LoyaltyLaunchAuditTest extends TestCase
{
    use DatabaseTransactions;

    private string $lastOutput = '';

    protected function setUp(): void
    {
        parent::setUp();
        if (! Schema::hasTable('scheduled_command_runs')) {
            Schema::create('scheduled_command_runs', function (Blueprint $table) {
                $table->id();
                $table->string('command');
                $table->string('status');
                $table->timestamp('started_at')->nullable();
                $table->timestamp('finished_at')->nullable();
            });
        }
        foreach (['jobs', 'failed_jobs'] as $name) {
            if (! Schema::hasTable($name)) {
                Schema::create($name, function (Blueprint $table) {
                    $table->id();
                    $table->string('queue')->default('default');
                    $table->unsignedInteger('available_at')->default(0);
                    $table->unsignedInteger('reserved_at')->nullable();
                });
            }
        }
        config(['mail.default' => 'smtp', 'mail.from.address' => 'sender@example.test',
            'queue.default' => 'database', 'queue.connections.database.driver' => 'database', 'queue.connections.database.connection' => null,
            'queue.failed.driver' => 'database-uuids', 'queue.failed.database' => config('database.default'), 'cache.shared' => 'array']);
    }

    private function report(): array
    {
        $this->assertSame(0, Artisan::call('loyalty:launch-audit'));

        $this->lastOutput = Artisan::output();

        return json_decode($this->lastOutput, true, flags: JSON_THROW_ON_ERROR);
    }

    public function test_observations_never_include_credentials_or_claim_an_empty_queue_proves_a_worker(): void
    {
        $secret = Str::random(40);
        config(['mail.mailers.smtp.username' => 'private-sender', 'mail.mailers.smtp.password' => $secret, 'mail.mailers.smtp.host' => 'mail.example.test']);
        $before = DB::table('jobs')->count();
        $report = $this->report();
        $this->assertTrue($report['mail']['smtp_configuration_present']);
        $this->assertSame('example.test', $report['mail']['from_domain']);
        $this->assertSame('unverified', $report['queue']['worker_liveness']);
        $this->assertSame(0, $report['queue']['backlog']['value']['ready_jobs']);
        $this->assertNull($report['scheduler']['value']['heartbeat_at']);
        $this->assertStringNotContainsString($secret, $this->lastOutput);
        $this->assertStringNotContainsString('private-sender', $this->lastOutput);
        $this->assertStringNotContainsString('sender@example.test', $this->lastOutput);
        $this->assertSame($before, DB::table('jobs')->count());
    }

    public function test_non_database_queue_observation_stays_unverified_without_connecting_to_the_provider(): void
    {
        config(['queue.default' => 'redis', 'queue.connections.redis.driver' => 'redis']);
        $report = $this->report();
        $this->assertFalse($report['queue']['backlog']['observed']);
        $this->assertNull($report['queue']['backlog']['value']);
    }

    public function test_recent_scheduler_and_media_observations_are_reported_without_running_a_job(): void
    {
        DB::table('scheduled_command_runs')->insert(['command' => 'heartbeat', 'status' => 'success', 'started_at' => now()->subMinute(), 'finished_at' => now()->subMinute()]);
        Cache::store('array')->put('ops:media-versioning', ['status' => 'ok', 'last_seen_at' => now()->toIso8601String(), 'private_bucket_metadata' => 'must not be copied']);
        $report = $this->report();
        $this->assertNotNull($report['scheduler']['value']['heartbeat_at']);
        $this->assertGreaterThanOrEqual(60, $report['scheduler']['value']['heartbeat_age_seconds']);
        $this->assertSame('ok', $report['media_recovery']['value']['status']);
        $this->assertNotNull($report['media_recovery']['value']['last_seen_at']);
        $this->assertStringNotContainsString('private_bucket_metadata', $this->lastOutput);
        $this->assertSame(0, DB::table('jobs')->count());
    }

    public function test_probe_requires_an_explicit_flag_and_repeated_requests_do_not_queue_more_jobs(): void
    {
        Queue::fake();
        $this->report();
        Queue::assertNothingPushed();
        $this->assertSame(0, Artisan::call('loyalty:launch-audit', ['--queue-probe' => true]));
        $probe = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR)['queue']['probe']['value'];
        $this->assertSame('queued', $probe['status']);
        Artisan::call('loyalty:launch-audit', ['--queue-probe' => true]);
        Queue::assertPushed(RecordLaunchQueueProbe::class, 1);
        (new RecordLaunchQueueProbe($probe['id']))->handle();
        $this->assertSame('processed', $this->report()['queue']['probe']['value']['status']);
    }

    public function test_synchronous_transport_cannot_be_mistaken_for_an_async_worker_probe(): void
    {
        Queue::fake();
        config(['queue.default' => 'sync', 'queue.connections.sync.driver' => 'sync']);
        Artisan::call('loyalty:launch-audit', ['--queue-probe' => true]);
        $report = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame('async_queue_required', $report['queue']['probe_request']);
        Queue::assertNothingPushed();
    }
}
