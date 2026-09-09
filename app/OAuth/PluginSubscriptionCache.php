<?php

namespace App\OAuth;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class PluginSubscriptionCache
{
    public static function version(int $organizationId): string
    {
        // A missing/evicted version must create a new namespace, never reuse
        // an old default whose snapshots may still be present in the cache.
        return (string) Cache::rememberForever('chatgpt.subscription-version:'.$organizationId,
            static fn () => (string) Str::uuid());
    }

    public static function invalidate(int $organizationId): void
    {
        // Changing the key namespace also invalidates any refresh in flight.
        // A late upstream response cannot repopulate the current version.
        Cache::forever('chatgpt.subscription-version:'.$organizationId, (string) Str::uuid());
    }

    public static function snapshotKey(int $organizationId, int $userId, int $billingUserId, string $version): string
    {
        return 'chatgpt.subscription:'.$organizationId.':'.$userId.':'.$billingUserId.':'.$version;
    }
}
