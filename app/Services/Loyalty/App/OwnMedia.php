<?php

namespace App\Services\Loyalty\App;

use App\Services\MediaService;
use Illuminate\Support\Facades\Log;

/**
 * Which picture files HexaTech Loyalty may delete when it replaces or removes one (release 2 §7): only a file
 * MediaService wrote for this organisation into the folder the endpoint owns — `/storage/org-{id}/{folder}/…` on the
 * public disk, or the same path under the cloud disk's address. A picture link someone typed in the full admin (an
 * offer's `image_url`), another organisation's file or another folder's is left alone.
 */
final class OwnMedia
{
    public static function isOurs(?string $url, int $orgId, string $folder): bool
    {
        if (!is_string($url) || $url === '' || str_contains($url, '..')) {
            return false;
        }
        $path = "org-{$orgId}/{$folder}/";
        if (str_starts_with($url, '/storage/' . $path)) {
            return true;
        }
        $cloud = rtrim((string) config('filesystems.disks.do.url'), '/');

        return $cloud !== '' && str_starts_with($url, $cloud . '/' . $path);
    }

    /**
     * Delete a file of ours, after the change that let go of it is saved. Best effort: a failed delete never turns a
     * saved change into an error, and the log line names the folder, not the file.
     */
    public static function forget(?string $url, int $orgId, string $folder): void
    {
        if (!self::isOurs($url, $orgId, $folder)) {
            return;
        }
        try {
            MediaService::delete($url);
        } catch (\Throwable $e) {
            Log::warning('loyalty.media.delete_failed', ['folder' => $folder, 'error' => $e::class]);
        }
    }
}
