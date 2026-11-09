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
     *
     * Precedence: an explicit, non-empty MEDIA_DISK always wins — including
     * an explicit 'public' — and only when it is unset/empty do we
     * auto-detect DO Spaces from its credentials, falling back to 'public'
     * when neither is present. Ruling 3b-5: 'public' used to be treated as
     * indistinguishable from "unset" (config/filesystems.php's own default),
     * which meant an explicit MEDIA_DISK=public could never win over the
     * auto-detect and local dev silently wrote to (and deleted from) the
     * production bucket whenever DO credentials happened to be present.
     */
    public static function disk(): string
    {
        $configured = config('filesystems.media_disk');
        if (is_string($configured) && $configured !== '') {
            return $configured;
        }

        // Auto-detect DO Spaces: if credentials are configured, prefer it over local disk
        // (uses config() instead of env() so it works after config:cache)
        if (config('filesystems.disks.do.key')
            && config('filesystems.disks.do.secret')
            && config('filesystems.disks.do.bucket')) {
            return 'do';
        }

        return 'public';
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
            if ($disk === config('media.cloud_disk')) {
                $path = trim($prefix, '/').'/'.$file->hashName();
                $stream = fopen($file->getPathname(), 'rb');
                if (!$stream) throw new \RuntimeException('media_read_failed');
                try {
                    self::writeCloud($disk, $path, $stream, (int) $file->getSize(),
                        (string) hash_file('sha256', $file->getPathname()), $file->getMimeType() ?: 'application/octet-stream');
                } finally { fclose($stream); }
            } else {
                $path = $file->storePublicly($prefix, $disk);
            }
        } catch (\Throwable $e) {
            Log::error('MediaService upload failed', [
                'disk'   => $disk,
                'folder' => $folder,
                'error'  => $e::class,
            ]);
            throw new \RuntimeException('File upload failed', previous: $e);
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
     * Store raw bytes (e.g. an AI-generated image) and return the public URL.
     * Mirrors upload() but for content we already hold in memory rather than
     * an UploadedFile. $extension without the dot (e.g. 'png').
     */
    public static function putRaw(string $contents, string $folder, string $extension = 'png', string $visibility = 'public'): string
    {
        $disk = static::disk();
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $prefix = $orgId ? "org-{$orgId}/{$folder}" : $folder;
        $name = bin2hex(random_bytes(16)) . '.' . ltrim($extension, '.');
        $path = trim($prefix, '/') . '/' . $name;

        try {
            if ($disk === config('media.cloud_disk')) {
                if ($visibility !== 'public') throw new \RuntimeException('private_media_requires_private_disk');
                $stream = tmpfile();
                if (!$stream) throw new \RuntimeException('media_spool_failed');
                try {
                    if (fwrite($stream, $contents) !== strlen($contents)) throw new \RuntimeException('media_spool_failed');
                    rewind($stream);
                    self::writeCloud($disk, $path, $stream, strlen($contents), hash('sha256', $contents),
                        (new \finfo(FILEINFO_MIME_TYPE))->buffer($contents) ?: 'application/octet-stream');
                } finally { fclose($stream); }
            } elseif (!Storage::disk($disk)->put($path, $contents, $visibility)) {
                throw new \RuntimeException('media_write_failed');
            }
        } catch (\Throwable $e) {
            Log::error('MediaService putRaw failed', [
                'disk'   => $disk,
                'folder' => $folder,
                'error'  => $e::class,
            ]);
            throw new \RuntimeException('Media store failed', previous: $e);
        }

        if ($disk === 'public') {
            return '/storage/' . $path;
        }

        return Storage::disk($disk)->url($path);
    }

    /**
     * Delete a file by its stored URL/path.
     */
    public static function delete(?string $url): void
    {
        if (!is_string($url) || trim($url) === '') {
            return;
        }

        // The value's shape is the only record of which disk wrote it: upload()
        // returns '/storage/...' on the public disk and an absolute CDN URL on a
        // cloud disk. Resolving against the CURRENTLY configured disk (what this
        // method did before) silently no-ops for every file written before a
        // disk change - which is how every replace-image flow leaked its old file.
        $where = \App\Services\Media\Location::resolve($url);
        if ($where) {
            // Keep legacy provider-owned URLs working throughout the Cloud transition.
            if (static::disk() === config('media.cloud_disk') && $where['disk'] === 'do') return;
            if ($where['disk'] === config('media.cloud_disk')) {
                app(\App\Services\Media\CloudUploads::class)->delete($where['disk'], $where['key']);
            } else {
                Storage::disk($where['disk'])->delete($where['key']);
            }
            return;
        }

        // Not ours to delete - but say so. A silent no-op here is the old bug
        // wearing a different hat.
        Log::warning('media.delete.unresolvable');
    }

    /** @param resource $stream */
    private static function writeCloud(string $disk, string $key, $stream, int $bytes, string $sha, string $mime): void
    {
        $base = (string) config('filesystems.disks.'.$disk.'.url');
        if (parse_url($base, PHP_URL_SCHEME) !== 'https') throw new \RuntimeException('media_public_url_missing');
        app(\App\Services\Media\CloudUploads::class)->write($disk, $key,
            ['stream' => $stream, 'bytes' => $bytes, 'sha256' => $sha, 'mime' => $mime]);
    }
}
