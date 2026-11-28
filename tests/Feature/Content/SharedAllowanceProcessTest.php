<?php

namespace Tests\Feature\Content;

use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class SharedAllowanceProcessTest extends TestCase
{
    public function test_independent_workers_share_the_allowance_lease_and_read_uncached_spend(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Uses separate PostgreSQL processes and the shared database cache.');
        }
        $process = new Process([PHP_BINARY, base_path('tests/fixtures/content-allowance-process.php')], base_path(), null, null, 45);
        $process->mustRun();
        $this->assertSame(['during' => 'ai_busy', 'after' => 'ai_budget_used_up', 'provider_transactions' => 0], json_decode($process->getOutput(), true));
    }
}
