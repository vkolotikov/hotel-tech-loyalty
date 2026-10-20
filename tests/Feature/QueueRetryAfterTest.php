<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * A queue connection hands a job to a second worker once `retry_after` passes. It must be longer than any job may run,
 * or a long run (GenerateContentStrategy, up to 600 s) is taken twice — and, with `tries = 1`, failed while it still runs.
 */
class QueueRetryAfterTest extends TestCase
{
    public function test_every_queue_connection_waits_longer_than_the_longest_job_may_run(): void
    {
        $longest = 0;
        foreach (glob(app_path('Jobs/*.php')) ?: [] as $file) {
            $class = 'App\\Jobs\\' . basename($file, '.php');
            if (class_exists($class)) {
                $longest = max($longest, (int) ((new \ReflectionClass($class))->getDefaultProperties()['timeout'] ?? 0));
            }
        }
        $this->assertGreaterThanOrEqual(600, $longest);
        foreach (['database', 'redis', 'beanstalkd'] as $connection) {
            $this->assertGreaterThan($longest, (int) config("queue.connections.{$connection}.retry_after"), "{$connection} retry_after");
        }
    }

    /**
     * Queue review: the long AI jobs run on their own queue (and worker), so a sign-up or password code never waits
     * minutes behind a calendar or a strategy being written.
     */
    public function test_the_long_ai_jobs_run_on_their_own_queue(): void
    {
        $jobs = [
            new \App\Jobs\GenerateContentCalendar(1, 1, 1, '2026-10-05', '2026-10-11', null, true, null, 'owner', 1),
            new \App\Jobs\GenerateContentStrategy(1, 1, 1, []),
            new \App\Jobs\AdaptPostVersions(1, 1, 1, 'instagram', [2]),
            new \App\Jobs\RewriteRepeatCopies(1, 1, 1, [2]),
            new \App\Jobs\ScanContentWebsite(1, 'token', true, 1),
            new \App\Jobs\WritePromotionPosts(1),
        ];
        foreach ($jobs as $job) {
            $this->assertSame('ai', $job->queue, $job::class);
        }
    }

    /** Queue review: a job's tenant must not stay bound for the next job the long-running worker takes. */
    public function test_the_worker_forgets_a_jobs_tenant_before_the_next_job(): void
    {
        app()->instance('current_organization_id', 41);
        app()->instance('current_brand_id', 7);
        event(new \Illuminate\Queue\Events\Looping('database', 'default'));
        $this->assertFalse(app()->bound('current_organization_id'));
        $this->assertFalse(app()->bound('current_brand_id'));
    }

    /**
     * Production sets no QUEUE_CONNECTION (checked 2026-10-20): the fallback is what it runs. `sync` ran every queued job
     * inside the web request — under a 20 s request limit — while the database queue and its worker (the Worker
     * cluster's `queue:work database`) were set up for exactly this (QUEUE_WORKER_SETUP.md).
     */
    public function test_without_a_queue_setting_jobs_go_to_the_database_queue_the_worker_runs(): void
    {
        $saved = ['env' => $_ENV['QUEUE_CONNECTION'] ?? null, 'server' => $_SERVER['QUEUE_CONNECTION'] ?? null, 'getenv' => getenv('QUEUE_CONNECTION')];
        unset($_ENV['QUEUE_CONNECTION'], $_SERVER['QUEUE_CONNECTION']);
        putenv('QUEUE_CONNECTION');
        try {
            $config = require config_path('queue.php');
        } finally {
            if ($saved['env'] !== null) {
                $_ENV['QUEUE_CONNECTION'] = $saved['env'];
            }
            if ($saved['server'] !== null) {
                $_SERVER['QUEUE_CONNECTION'] = $saved['server'];
            }
            if ($saved['getenv'] !== false) {
                putenv('QUEUE_CONNECTION=' . $saved['getenv']);
            }
        }
        $this->assertSame('database', $config['default']);
    }
}
