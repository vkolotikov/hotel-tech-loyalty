<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
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
     */
    public static function disk(): string
    {
        return config('filesystems.media_disk', 'public');
    }

    /**
     * Store an uploaded file and return the public URL path.
     * For local disk: returns /storage/folder/filename.jpg
     * For DO Spaces: returns full CDN URL https://cdn.example.com/folder/filename.jpg
     */
    public static function upload(UploadedFile $file, string $folder): string
    {
        $disk = static::disk();
        $path = $file->storePublicly($folder, $disk);

        if ($disk === 'public') {
            return '/storage/' . $path;
        }

        // Cloud disk — return full URL
        return Storage::disk($disk)->url($path);
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
