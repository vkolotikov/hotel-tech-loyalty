<?php

namespace Tests\Feature\Content;

use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class PropertyImageQuotaTest extends TestCase
{
    public function test_property_images_upload_and_retire_outside_the_quota_lock_without_masking_failures(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Uses an autocommit PostgreSQL fixture and fake storage, without a test transaction.');
        }
        $process = new Process([PHP_BINARY, base_path('tests/fixtures/property-image-quota-process.php')], base_path(), null, null, 30);
        $process->mustRun();
        $this->assertSame([
            'success' => ['status' => 201, 'upload_depths' => [0], 'cleanup_depths' => [], 'files' => 1],
            'at_cap' => ['status' => 402, 'upload_depths' => [], 'cleanup_depths' => [], 'files' => 0],
            'race' => ['status' => 402, 'upload_depths' => [0], 'cleanup_depths' => [0], 'files' => 0],
            'insert_failure' => ['status' => 'original_insert_failure', 'upload_depths' => [0], 'cleanup_depths' => [0], 'files' => 0],
            'cleanup_failure' => ['status' => 'original_insert_failure', 'upload_depths' => [0], 'cleanup_depths' => [0], 'files' => 1],
        ], json_decode($process->getOutput(), true));
    }
}
