<?php

namespace App\Console\Commands;

use App\Services\MediaRecovery;
use App\Support\SharedCache;
use Illuminate\Console\Command;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Support\Facades\Cache;

/** Preview by default; an operator must explicitly name the approved retention and production target to apply. */
class ConfigureMediaRecovery extends Command
{
    protected $signature = 'media:recovery-policy
        {--noncurrent-days= : Approved retention for previous versions, 1–3650 days; preview proposes 30}
        {--expected-bucket= : Exact verified production bucket, required for apply}
        {--expected-host= : Exact configured endpoint hostname, required for apply}
        {--apply : Apply the approved policy; may incur retained-storage charges}';

    protected $description = 'Preview or explicitly enable media versioning with bounded noncurrent retention';

    public function handle(MediaRecovery $recovery): int
    {
        $apply = (bool) $this->option('apply');
        $raw = $this->option('noncurrent-days');
        if (($raw !== null && (! preg_match('/^[1-9][0-9]{0,3}$/', (string) $raw) || (int) $raw > 3650))
            || ($apply && ($raw === null || ! $this->option('expected-bucket') || ! $this->option('expected-host')))) {
            $this->error('Apply requires explicit --noncurrent-days, --expected-bucket and --expected-host. Retention must be 1–3650 days.');

            return self::INVALID;
        }
        $days = $raw === null ? 30 : (int) $raw;
        $lock = null;
        try {
            if ($apply) {
                $store = Cache::store(config('cache.shared', 'database'))->getStore();
                if (! $store instanceof LockProvider) {
                    throw new \RuntimeException('media_shared_lock_unavailable');
                }
                $lock = $store->lock('ops:media-recovery-verify', 600);
                if (! $lock->get()) {
                    $this->error('A media recovery operation is already running.');

                    return self::FAILURE;
                }
                if (SharedCache::store()->has('ops:media-recovery-copy')) {
                    throw new \RuntimeException('media_recovery_cleanup_required');
                }
            }
            $policy = $apply
                ? $recovery->enableRecoveryPolicy($days, (string) $this->option('expected-bucket'), (string) $this->option('expected-host'))
                : $recovery->recoveryPolicy($days);
            if ($apply) {
                SharedCache::store()->put('ops:media-versioning', ['status' => 'ok', 'last_seen_at' => now()->toIso8601String()], now()->addHours(26));
            }
            $this->line(json_encode(['applied' => $apply, 'policy' => $policy,
                'note' => 'Only previous versions expire. This does not verify byte recovery or database backups.'], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $allowed = ['media_target_mismatch', 'media_lifecycle_review_required', 'media_recovery_cleanup_required', 'media_policy_not_confirmed', 'media_shared_lock_unavailable'];
            $this->error(in_array($e->getMessage(), $allowed, true) ? $e->getMessage()
                : 'Media policy could not be verified. A setting may be partially applied; read the preview before retrying.');

            return self::FAILURE;
        } finally {
            $lock?->release();
        }
    }
}
