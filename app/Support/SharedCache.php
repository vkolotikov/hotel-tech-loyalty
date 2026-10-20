<?php

namespace App\Support;

use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;

/**
 * The cache the web app and the queue worker share (`cache.shared`, the database in production). The default cache is
 * each container's own files, and queued jobs run on the Worker cluster, in another container: a status a job sets for
 * the web app to read must live here.
 */
final class SharedCache
{
    public static function store(): Repository
    {
        return Cache::store(config('cache.shared', 'database'));
    }
}
