<?php

namespace App\Jobs;

use App\Support\SharedCache;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/** One explicitly requested infrastructure probe. It never reads members or contacts a provider. */
class RecordLaunchQueueProbe implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public const KEY = 'ops:launch-queue-probe';

    public int $tries = 1;

    public function __construct(public string $probeId) {}

    public function handle(): void
    {
        $cache = SharedCache::store();
        $probe = $cache->get(self::KEY);
        if (! is_array($probe) || ($probe['id'] ?? null) !== $this->probeId || ($probe['status'] ?? null) !== 'queued') {
            return;
        }
        $cache->put(self::KEY, [...$probe, 'status' => 'processed', 'handled_at' => now()->toIso8601String()], 900);
    }
}
