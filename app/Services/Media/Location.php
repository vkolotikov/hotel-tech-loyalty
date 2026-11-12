<?php

namespace App\Services\Media;

use App\Services\MediaService;

/** Resolve only configured public storage bases; never turn a supplied URL into an HTTP fetch. */
final class Location
{
    public static function resolve(?string $url): ?array
    {
        if (!is_string($url) || $url === '') return null;
        $bases = ['public' => '/storage'];
        foreach (array_unique(['do', (string) config('media.cloud_disk'), MediaService::disk()]) as $disk) {
            if ($disk === 'public' || $disk === '') continue;
            $base = rtrim((string) config('filesystems.disks.'.$disk.'.url'), '/');
            if ($base !== '' && parse_url($base, PHP_URL_SCHEME) === 'https') $bases[$disk] = $base;
        }
        foreach ($bases as $disk => $base) {
            if (!str_starts_with($url, $base.'/')) continue;
            $key = substr($url, strlen($base) + 1);
            if (self::safeKey($key) && !preg_match('/[?#%]/', $key)) return ['disk' => $disk, 'key' => $key];
        }
        return null;
    }

    public static function safeKey(string $key): bool
    {
        return $key !== '' && strlen($key) <= 1024 && !preg_match('/[\\\\\x00-\x1f\x7f]/', $key)
            && !str_starts_with($key, '/') && !str_ends_with($key, '/')
            && !array_intersect(explode('/', $key), ['', '.', '..']);
    }
}
