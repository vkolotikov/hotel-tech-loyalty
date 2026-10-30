<?php

namespace App\Console\Commands;

use App\Services\MediaRecovery;
use App\Support\SharedCache;
use Illuminate\Console\Command;

class VerifyMediaVersion extends Command
{
    protected $signature = 'media:verify-version {--org=} {--key=} {--version=} {--apply : Copy privately, verify, and remove the exact temporary version}';
    protected $description = 'Preview or verify recovery of one exact tenant-owned media version in isolation.';

    public function handle(MediaRecovery $recovery): int
    {
        $lock = SharedCache::store()->lock('ops:media-recovery-verify', 600);
        if (!$lock->get()) { $this->error('A media verification is already running.'); return self::FAILURE; }
        try {
            if ($this->option('apply') && SharedCache::store()->has('ops:media-recovery-copy')) throw new \RuntimeException('media_recovery_cleanup_required');
            $args = [(int) $this->option('org'), (string) $this->option('key'), (string) $this->option('version')];
            $result = $this->option('apply') ? $recovery->verify(...$args) : $recovery->preview(...$args);
            $this->info(json_encode(['applied' => (bool) $this->option('apply')] + $result, JSON_THROW_ON_ERROR));
            return self::SUCCESS;
        } catch (\Throwable $e) {
            $allowed = ['media_version_invalid', 'media_versioning_not_enabled', 'media_version_not_verifiable', 'media_recovery_mismatch', 'media_recovery_cleanup_required'];
            $this->error(in_array($e->getMessage(), $allowed, true) ? $e->getMessage() : 'Media recovery could not be verified. No live object was changed.');
            return self::FAILURE;
        } finally {
            $lock->release();
        }
    }
}
