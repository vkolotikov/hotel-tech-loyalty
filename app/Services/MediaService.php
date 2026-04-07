<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Centralized media upload service.
 * Uses DO Spaces (or any S3-compatible) in production, local disk in development.
 * Switch by setting MEDIA_DISK=do in .env.
 */
class MediaService
{
    /**
     * Get the configured media disk name.
     * Auto-detects DO Spaces when credentials are present, even if MEDIA_DISK is not set.
     */
    public static function disk(): string
    {
        $configured = config('filesystems.media_disk');
        if ($configured && $configured !== 'public') {
            return $configured;
        }

        // Auto-detect DO Spaces: if credentials are configured, prefer it over local disk
        // (uses config() instead of env() so it works after config:cache)
        if (config('filesystems.disks.do.key')
            && config('filesystems.disks.do.secret')
            && config('filesystems.disks.do.bucket')) {
            return 'do';
        }

        return $configured ?: 'public';
    }

    /**
     * Store an uploaded file and return the public URL path.
     * For local disk: returns /storage/folder/filename.jpg
     * For DO Spaces: returns full CDN URL https://cdn.example.com/folder/filename.jpg
     */
    public static function upload(UploadedFile $file, string $folder): string
    {
        $disk = static::disk();
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $prefix = $orgId ? "org-{$orgId}/{$folder}" : $folder;

        try {
            $path = $file->storePublicly($prefix, $disk);
        } catch (\Throwable $e) {
            Log::error('MediaService upload failed', [
                'disk'   => $disk,
                'folder' => $folder,
                'error'  => $e->getMessage(),
            ]);
            throw new \RuntimeException("File upload failed ({$disk}): " . $e->getMessage());
        }

        if (!$path) {
            Log::error('MediaService upload returned empty path', ['disk' => $disk, 'folder' => $folder]);
            throw new \RuntimeException("File upload returned empty path on disk '{$disk}'");
        }

        if ($disk === 'public') {
            return '/storage/' . $path;
        }

        // Cloud disk — return full URL
        $url = Storage::disk($disk)->url($path);
        Log::info('MediaService uploaded to cloud', ['disk' => $disk, 'path' => $path, 'url' => $url]);
        return $url;
    }

    /**
     * Delete a file by its stored URL/path.
     */
    public static function delete(?string $url): void
    {
        if (!$url) return;

        $disk = static::disk();

        if ($disk === 'public') {
            $path = str_replace('/storage/', '', $url);
            Storage::disk('public')->delete($path);
        } else {
            // Extract path from full URL
            $diskUrl = rtrim(Storage::disk($disk)->url(''), '/');
            $path = str_replace($diskUrl . '/', '', $url);
            Storage::disk($disk)->delete($path);
        }
    }

    /**
     * Resolve a stored URL for display.
     * Local paths get APP_URL prepended; cloud URLs pass through.
     */
    public static function url(?string $path): ?string
    {
        if (!$path) return null;
        if (str_starts_with($path, 'http')) return $path;
        return $path; // Local /storage/ paths resolved by frontend
    }
}
