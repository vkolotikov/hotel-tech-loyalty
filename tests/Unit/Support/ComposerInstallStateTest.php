<?php

namespace Tests\Unit\Support;

use App\Support\SharedCache;
use Illuminate\Support\Facades\{Artisan, Schema};
use Tests\TestCase;

class ComposerInstallStateTest extends TestCase
{
    public function test_install_cleanup_preserves_shared_operational_receipts_and_active_locks(): void
    {
        if (!Schema::hasTable('cache')) {
            (require database_path('migrations/2026_05_19_120000_create_cache_table.php'))->up();
        }
        config(['cache.default' => 'database', 'cache.shared' => 'database']);
        $cache = SharedCache::store();
        $cache->forever('ops:install-test', ['backup_verified' => true, 'recovery_pending' => true]);
        $lock = $cache->lock('install-active-operation', 60);
        $this->assertTrue($lock->get());
        try {
            $composer = json_decode(file_get_contents(base_path('composer.json')), true, flags: JSON_THROW_ON_ERROR);
            foreach ($composer['scripts']['post-install-cmd'] as $command) {
                $this->assertStringStartsWith('@php artisan ', $command);
                $this->assertSame(0, Artisan::call(substr($command, strlen('@php artisan '))));
            }
            $this->assertSame(['backup_verified' => true, 'recovery_pending' => true], $cache->get('ops:install-test'));
            $this->assertFalse($cache->lock('install-active-operation', 60)->get());
        } finally {
            $lock->release();
            $cache->forget('ops:install-test');
        }
    }
}
