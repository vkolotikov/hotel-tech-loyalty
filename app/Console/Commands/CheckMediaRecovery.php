<?php

namespace App\Console\Commands;

use App\Services\MediaRecovery;
use App\Support\SharedCache;
use Illuminate\Console\Command;

class CheckMediaRecovery extends Command
{
    protected $signature = 'media:check-recovery';
    protected $description = 'Observe object versioning without changing bucket settings.';

    public function handle(MediaRecovery $recovery): int
    {
        try { $status = $recovery->versioning(); } catch (\Throwable) { $status = 'unavailable'; }
        SharedCache::store()->put('ops:media-versioning', ['status' => $status, 'last_seen_at' => now()->toIso8601String()], now()->addHours(26));
        $this->info('Media versioning: '.$status.'. Versioning alone does not verify recovery.');
        return $status === 'unavailable' ? self::FAILURE : self::SUCCESS;
    }
}
