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
}
