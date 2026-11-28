<?php

namespace Tests\Feature\Content;

use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class LocationsQuotaProcessTest extends TestCase
{
    public function test_content_and_full_admin_hold_the_same_organisation_lock_until_the_last_location_commits(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Uses independent PostgreSQL connections and real row locks.');
        }
        $process = new Process([PHP_BINARY, base_path('tests/fixtures/content-location-quota-process.php')], base_path(), null, null, 30);
        $process->mustRun();
        $this->assertSame([
            'content' => ['during' => 'locked', 'after' => 'plan_limit', 'count' => 1],
            'full_admin' => ['during' => 'locked', 'after' => 'plan_limit', 'count' => 1],
        ], json_decode($process->getOutput(), true));
    }
}
