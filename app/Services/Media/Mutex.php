<?php

namespace App\Services\Media;

use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Support\Facades\Cache;

final class Mutex
{
    public static function run(string $key, callable $work, int $seconds = 900): mixed
    {
        $store = Cache::store(config('cache.shared', 'database'))->getStore();
        if (!$store instanceof LockProvider) throw new \RuntimeException('media_shared_lock_unavailable');
        $lock = $store->lock('media:'.hash('sha256', $key), $seconds);
        if (!$lock->get()) throw new \RuntimeException('media_busy');
        try { return $work(); } finally { $lock->release(); }
    }
}
